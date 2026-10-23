# Build context: repo root (needs ai/ + backend/). Used for both the API and the RQ worker.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY ai ai
COPY backend backend
ENV PYTHONPATH=/app:/app/backend PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "alembic -c backend/alembic.ini upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
