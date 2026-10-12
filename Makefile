.DEFAULT_GOAL := help
BACKEND := backend
FRONTEND := frontend

.PHONY: help up down logs restart install dev-backend dev-frontend test test-backend test-frontend lint format build samples clean-exports

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Build and start the full stack (http://localhost:5173)
	docker compose up --build -d --wait
	@echo "Frontend: http://localhost:5173  API: http://localhost:8000  Docs: http://localhost:8000/docs"

down: ## Stop the stack (workspace data is kept)
	docker compose down

logs: ## Follow container logs
	docker compose logs -f

restart: down up ## Restart the stack

install: ## Install backend (Poetry) and frontend (npm ci) dependencies locally
	cd $(BACKEND) && poetry install
	cd $(FRONTEND) && npm ci

dev-backend: ## Run the API with auto-reload on http://localhost:8000
	cd $(BACKEND) && poetry run uvicorn annotator.main:app --reload --host 127.0.0.1 --port 8000

dev-frontend: ## Run the Vite dev server on http://localhost:5173 (proxies /api)
	cd $(FRONTEND) && npm run dev

test: test-backend test-frontend ## Run all automated tests

test-backend: ## pytest
	cd $(BACKEND) && poetry run pytest

test-frontend: ## vitest
	cd $(FRONTEND) && npm test

lint: ## Ruff + oxlint + TypeScript type-check
	cd $(BACKEND) && poetry run ruff check src tests && poetry run ruff format --check src tests
	cd $(FRONTEND) && npm run lint && npm run typecheck

format: ## Auto-format backend code
	cd $(BACKEND) && poetry run ruff format src tests && poetry run ruff check --fix src tests

build: ## Build the Docker images
	docker compose build

samples: ## Generate 50 synthetic images + PASCAL VOC XML in samples/generated
	$(BACKEND)/.venv/bin/python scripts/generate_samples.py --count 50 --out samples/generated

clean-exports: ## Delete generated dataset ZIPs (annotations are kept)
	rm -rf workspace/exports/*
