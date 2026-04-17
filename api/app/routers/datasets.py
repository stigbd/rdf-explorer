"""API endpoints for uploading and managing persistent RDF datasets."""

import logging
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from rdflib import Graph
from rdflib.exceptions import Error

from app.store import DatasetStore, dataset_store

router = APIRouter(tags=["datasets"])
logger = logging.getLogger("uvicorn.error")


class DatasetRequest(BaseModel):
    """Request model for uploading an RDF dataset."""

    data: str


class DatasetResponse(BaseModel):
    """Response model returned after successfully storing an RDF dataset."""

    dataset_id: str


def get_store() -> DatasetStore:
    """Dependency that returns the shared dataset store (overridable in tests)."""
    return dataset_store


async def check_content_type(request: Request) -> None:
    """Check that the Content-Type of the request is application/json."""
    content_type = request.headers.get("content-type", None)
    if not content_type or "application/json" not in content_type:
        raise HTTPException(
            status_code=HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type {content_type}",
        )


@router.post(
    "/datasets",
    dependencies=[Depends(check_content_type)],
    status_code=HTTPStatus.CREATED,
    responses={
        201: {"description": "Dataset stored; returns its dataset_id"},
        400: {"description": "Invalid RDF data"},
        415: {"description": "Unsupported media type"},
    },
)
async def create_dataset(
    dataset_request: DatasetRequest,
    store: Annotated[DatasetStore, Depends(get_store)],
) -> DatasetResponse:
    """Parse the supplied RDF data, store it in memory, and return a dataset_id."""
    graph = Graph()
    try:
        graph.parse(data=dataset_request.data)
    except Error as e:
        msg = f"Error: {type(e)} : " + str(e)
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail=msg) from e
    except Exception as e:  # pragma: no cover
        msg = "Invalid RDF data: " + str(e)
        raise HTTPException(status_code=HTTPStatus.BAD_REQUEST, detail=msg) from e

    dataset_id = store.save(dataset_request.data, graph)
    logger.info("Stored dataset %s (%d triples)", dataset_id, len(graph))
    return DatasetResponse(dataset_id=dataset_id)


@router.delete(
    "/datasets/{dataset_id}",
    status_code=HTTPStatus.NO_CONTENT,
    responses={
        204: {"description": "Dataset deleted"},
        404: {"description": "Dataset not found"},
    },
)
async def delete_dataset(
    dataset_id: str,
    store: Annotated[DatasetStore, Depends(get_store)],
) -> None:
    """Delete a previously stored dataset by its dataset_id."""
    if not store.delete(dataset_id):
        raise HTTPException(
            status_code=HTTPStatus.NOT_FOUND,
            detail=f"Dataset {dataset_id!r} not found",
        )
