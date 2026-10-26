# Build context: repo root. One image for the internal AI service (uvicorn) and the RQ worker (`rq worker`).
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
# yt-dlp needs a JS runtime to solve YouTube's player challenges (captions + audio download)
COPY --from=denoland/deno:bin-2.5.6 /deno /usr/local/bin/deno
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY ai ai
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1
EXPOSE 8001
CMD ["uvicorn", "ai.service.app:app", "--host", "0.0.0.0", "--port", "8001"]
