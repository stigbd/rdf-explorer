FROM python:3.14-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*
# Install uv.
COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /uvx /bin/

# Copy the application into the container.
ADD . /app

# Install the application dependencies.
WORKDIR /app
RUN uv sync --frozen

# Expose the application port.
EXPOSE 8000

# Run the application.
CMD ["/app/.venv/bin/uvicorn", "app:app",  "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--log-config=logging.yaml"]
