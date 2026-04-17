"""In-memory store for persisted RDF datasets."""

from typing import TYPE_CHECKING
from uuid import uuid4

if TYPE_CHECKING:
    from rdflib import Graph


class DatasetStore:
    """In-memory store mapping dataset IDs to RDF graphs and raw data."""

    def __init__(self) -> None:
        """Initialize an empty store."""
        self._store: dict[str, tuple[str, Graph]] = {}

    def save(self, data: str, graph: Graph) -> str:
        """Persist an RDF dataset; return its new UUID dataset_id."""
        dataset_id = str(uuid4())
        self._store[dataset_id] = (data, graph)
        return dataset_id

    def get(self, dataset_id: str) -> tuple[str, Graph] | None:
        """Return (raw_data, graph) for the given dataset_id, or None if not found."""
        return self._store.get(dataset_id)

    def delete(self, dataset_id: str) -> bool:
        """Delete a dataset. Returns True if it existed, False otherwise."""
        if dataset_id in self._store:
            del self._store[dataset_id]
            return True
        return False

    def clear(self) -> None:
        """Remove all stored datasets (useful for testing)."""
        self._store.clear()


# Module-level singleton shared across the application lifetime.
dataset_store = DatasetStore()
