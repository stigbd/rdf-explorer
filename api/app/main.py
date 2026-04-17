"""API for running SPARQL queries on RDF data."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import datasets, prefixes, shacl, sparql

app = FastAPI()

origins = [
    "http://localhost",
    "http://localhost:8080",
    "http://localhost:3000",
]
# Configure CORS
app.add_middleware(
    CORSMiddleware,  # type: ignore[invalid-argument-type]
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", include_in_schema=False)
async def health_check() -> dict[str, str]:
    """Return status ok."""
    return {"status": "OK"}


# Set up routes:
app.include_router(sparql.router)
app.include_router(shacl.router)
app.include_router(prefixes.router)
app.include_router(datasets.router)
