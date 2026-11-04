.PHONY: setup dev check test types bench demo

setup:
	cd backend && uv sync --python 3.12
	cd web && npm ci

dev:
	python3 tools/dev.py

check:
	cd backend && uv run ruff check src tests
	cd backend && uv run ruff format --check src tests
	cd backend && uv run mypy src
	cd backend && uv run pytest
	cd web && npm run lint
	cd web && npm run typecheck
	cd web && npm test

test:
	cd backend && uv run pytest
	cd web && npm test

types:
	cd backend && uv run python ../tools/gen_types.py

bench:
	cd backend && uv run python ../tools/bench_solver.py

demo:
	cd web && npm run build
	python3 tools/package_demo.py
	cd backend && uv run uvicorn nat_demo.api.app:create_app --factory --host 127.0.0.1 --port 8765

