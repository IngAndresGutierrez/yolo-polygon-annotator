# syntax=docker/dockerfile:1

# ---- builder: resolve the locked dependencies with Poetry into /app/.venv ----
FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    POETRY_VERSION=2.5.1 \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

RUN pip install "poetry==${POETRY_VERSION}"

WORKDIR /app
# Dependency layer first: only invalidated when the lockfile changes.
COPY backend/pyproject.toml backend/poetry.lock backend/README.md ./
RUN poetry install --only main --no-root --no-cache

COPY backend/src ./src
RUN poetry install --only main --no-cache

# ---- runtime: slim image, no Poetry, non-root user ----
FROM python:3.11-slim AS runtime

ARG APP_UID=1000
ARG APP_GID=1000

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:${PATH}" \
    WORKSPACE_DIR=/workspace

RUN groupadd --gid "${APP_GID}" app \
    && useradd --uid "${APP_UID}" --gid app --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /workspace \
    && chown app:app /workspace

WORKDIR /app
COPY --from=builder --chown=app:app /app /app

USER app
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"]

CMD ["uvicorn", "annotator.main:app", "--host", "0.0.0.0", "--port", "8000"]
