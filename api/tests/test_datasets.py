"""Tests for the /datasets endpoints."""

from http import HTTPStatus

import pytest
from httpx import ASGITransport, AsyncClient

from app import app
from app.store import dataset_store

VALID_TURTLE = """
@prefix ex: <http://example.org#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

ex:Alice
    a ex:Person ;
    ex:name "Alice" .
"""

INVALID_TURTLE = """
@prefix ex: <http://example.org#> .

ex:Alice
    a ex:Person
"""  # missing final dot -> parse error


@pytest.fixture(autouse=True)
def clear_store() -> None:
    """Clear the in-memory store before every test for isolation."""
    dataset_store.clear()


@pytest.fixture
def anyio_backend() -> str:
    """Use asyncio backend."""
    return "asyncio"


@pytest.mark.anyio
async def test_create_dataset_returns_201_and_dataset_id() -> None:
    """POST /datasets with valid Turtle should return 201 and a dataset_id."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post("/datasets", json={"data": VALID_TURTLE})

    assert response.status_code == HTTPStatus.CREATED, response.json()
    body = response.json()
    assert "dataset_id" in body
    assert isinstance(body["dataset_id"], str)
    assert len(body["dataset_id"]) > 0


@pytest.mark.anyio
async def test_create_dataset_invalid_rdf_returns_400() -> None:
    """POST /datasets with invalid Turtle should return 400."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post("/datasets", json={"data": INVALID_TURTLE})

    assert response.status_code == HTTPStatus.BAD_REQUEST, response.json()


@pytest.mark.anyio
async def test_create_dataset_wrong_content_type_returns_415() -> None:
    """POST /datasets without JSON Content-Type should return 415."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post(
            "/datasets",
            content=VALID_TURTLE,
            headers={"content-type": "text/turtle"},
        )

    assert response.status_code == HTTPStatus.UNSUPPORTED_MEDIA_TYPE


@pytest.mark.anyio
async def test_delete_dataset_returns_204() -> None:
    """DELETE /datasets/{dataset_id} should return 204 for a known dataset."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        create_resp = await ac.post("/datasets", json={"data": VALID_TURTLE})
        assert create_resp.status_code == HTTPStatus.CREATED
        dataset_id = create_resp.json()["dataset_id"]

        delete_resp = await ac.delete(f"/datasets/{dataset_id}")

    assert delete_resp.status_code == HTTPStatus.NO_CONTENT


@pytest.mark.anyio
async def test_delete_nonexistent_dataset_returns_404() -> None:
    """DELETE /datasets/{dataset_id} should return 404 for an unknown ID."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.delete("/datasets/nonexistent-id")

    assert response.status_code == HTTPStatus.NOT_FOUND
