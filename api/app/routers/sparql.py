"""SPARQL endpoint for running SPARQL queries on RDF data."""

import logging
from enum import StrEnum
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from owlrl import DeductiveClosure, OWLRL_Semantics
from pydantic import BaseModel, model_validator
from rdflib import Graph
from rdflib.exceptions import Error
from rdflib.plugins.sparql import prepareQuery

from app.store import DatasetStore, dataset_store

router = APIRouter(tags=["sparql"])
logger = logging.getLogger("uvicorn.error")


class SPARQLRequest(BaseModel):
    """Request model for running a SPARQL query on RDF data.

    Exactly one of ``data`` or ``dataset_id`` must be supplied.
    """

    data: str | None = None
    dataset_id: str | None = None
    query: str
    inference: bool = False

    @model_validator(mode="after")
    def check_data_xor_dataset_id(self) -> SPARQLRequest:
        """Validate that exactly one of data or dataset_id is provided."""
        has_data = self.data is not None
        has_id = self.dataset_id is not None
        if not has_data and not has_id:
            msg = """
            Exactly one of 'data' or 'dataset_id' must be provided; neither was given.
            """
            raise ValueError(msg)
        if has_data and has_id:
            msg = """
            Exactly one of 'data' or 'dataset_id' must be provided; b
            oth were given.
            """
            raise ValueError(msg)
        return self


class SPARQLQueryType(StrEnum):
    """Enum for SPARQL query types."""

    SELECT = "SelectQuery"
    ASK = "AskQuery"
    DESCRIBE = "DescribeQuery"
    CONSTRUCT = "ConstructQuery"


class SPARQLResponse(BaseModel):
    """Response model for the result of running a SPARQL query on RDF data."""

    length: int
    result_content_type: str | None = None
    result: str


def get_store() -> DatasetStore:
    """Dependency that returns the shared dataset store (overridable in tests)."""
    return dataset_store


async def check_content_type(request: Request) -> None:
    """Check that the content type of the request is application/json."""
    content_type = request.headers.get("content-type", None)
    if not content_type or "application/json" not in content_type:
        raise HTTPException(
            status_code=HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type {content_type}",
        )


@router.post(
    "/sparql",
    dependencies=[Depends(check_content_type)],
    responses={
        200: {
            "description": "Result of running the SPARQL query",
        },
    },
)
async def run_sparql(  # noqa: C901, PLR0915, PLR0912
    request: Request,
    sparql_request: SPARQLRequest,
    store: Annotated[DatasetStore, Depends(get_store)],
) -> SPARQLResponse:
    """Run the given SPARQL query on the provided RDF data or stored dataset."""
    graph = Graph()
    raw_data: str

    if sparql_request.dataset_id is not None:
        stored = store.get(sparql_request.dataset_id)
        if stored is None:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND,
                detail=f"Dataset {sparql_request.dataset_id!r} not found",
            )
        raw_data, stored_graph = stored
        # Copy all triples into a fresh graph so inference never mutates
        #  the stored object.
        graph += stored_graph
    else:
        if sparql_request.data is None:
            raise HTTPException(status_code=422, detail="...")
        raw_data = sparql_request.data

        try:
            graph.parse(data=raw_data)
        except Error as e:
            msg = f"Error: {type(e)} : " + str(e)
            raise HTTPException(status_code=400, detail=msg) from e
        except Exception as e:  # pragma: no cover
            msg = "Invalid RDF data: " + str(e)
            raise HTTPException(status_code=400, detail=msg) from e

    try:
        parsed_query = prepareQuery(sparql_request.query)
    except Exception as e:
        msg = "Invalid SPARQL query: " + str(e)
        raise HTTPException(status_code=400, detail=msg) from e

    try:
        query_type = SPARQLQueryType(parsed_query.algebra.name)
    except ValueError:  # pragma: no cover
        msg = "Unsupported SPARQL query type: " + parsed_query.algebra.name
        raise HTTPException(status_code=501, detail=msg) from None

    if sparql_request.inference:
        try:
            DeductiveClosure(OWLRL_Semantics).expand(graph)
        except Exception as e:  # pragma: no cover
            msg = "Error running inference: " + str(e)
            raise HTTPException(status_code=400, detail=msg) from e

    try:
        qres = graph.query(parsed_query)
    except Exception as e:  # pragma: no cover
        msg = "Error running SPARQL query: " + str(e)
        raise HTTPException(status_code=400, detail=msg) from e

    serialization_format, media_type = await get_format_and_media_type(
        query_type, request
    )
    try:
        length = len(qres)
        if parsed_query.algebra.name == "AskQuery":
            result = "true" if qres.askAnswer else "false"
        elif serialization_format == "json-ld":
            context = await get_context_from_prefixes_in_data(raw_data)
            result = qres.serialize(format=serialization_format, context=context)
        else:
            result = qres.serialize(format=serialization_format)
        return SPARQLResponse(
            length=length, result=result, result_content_type=media_type
        )
    except Exception as e:  # pragma: no cover
        msg = "Error serializing query results: " + str(e)
        raise HTTPException(status_code=400, detail=msg) from e


async def get_format_and_media_type(
    query_type: str,
    request: Request,
) -> tuple[str, str]:
    """Determine the serialization format and media type."""
    if query_type in [SPARQLQueryType.SELECT, SPARQLQueryType.ASK]:
        return await get_format_and_media_type_for_select_ask(request)
    return await get_format_and_media_type_for_describe_construct(request)


async def get_format_and_media_type_for_select_ask(
    request: Request,
) -> tuple[str, str]:
    """Determine the serialization format and media type for SELECT and ASK queries."""
    accept = request.headers.get("accept", "")
    if not accept or "*/*" in accept:
        return "json", "application/sparql-results+json"
    if "text/csv" in accept:
        return "csv", "text/csv"
    if "application/xml" in accept or "application/sparql-results+xml" in accept:
        return "xml", "application/sparql-results+xml"
    if "application/json" in accept or "application/sparql-results+json" in accept:
        return "json", "application/sparql-results+json"
    raise HTTPException(
        status_code=HTTPStatus.NOT_ACCEPTABLE,
        detail=f"Unsupported Accept header: {accept}",
    )


async def get_format_and_media_type_for_describe_construct(
    request: Request,
) -> tuple[str, str]:
    """Determine the serialization format and media type for DESCRIBE and CONSTRUCT queries."""  # noqa: E501
    accept = request.headers.get("accept", "")
    if not accept or "*/*" in accept:
        return "turtle", "text/turtle"
    if "text/turtle" in accept:
        return "turtle", "text/turtle"
    if "application/json" in accept or "application/ld+json" in accept:
        return "json-ld", "application/ld+json"
    if "application/xml" in accept or "application/rdf+xml" in accept:
        return "xml", "application/rdf+xml"
    raise HTTPException(
        status_code=HTTPStatus.NOT_ACCEPTABLE,
        detail=f"Unsupported Accept header: {accept}",
    )


async def get_context_from_prefixes_in_data(data: str) -> dict[str, str]:
    """Get a JSON-LD context from the prefixes used in the data."""
    context = {}
    for line in data.splitlines():
        if line.strip().startswith("@prefix"):
            parts = line.split()
            if len(parts) >= 3:  # noqa: PLR2004 # pragma: no cover
                prefix = parts[1].rstrip(":")
                uri = parts[2].rstrip(".").strip("<>")
                context[prefix] = uri
    return context
