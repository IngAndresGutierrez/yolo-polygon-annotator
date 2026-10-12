# CLAUDE.md — YOLO Polygon Annotator

Local web app: annotate licence plates with 4-vertex polygons, export Ultralytics YOLO
Detection/Segmentation datasets. Backend FastAPI (Poetry, Python 3.11) · Frontend React 19 +
TypeScript strict + Vite + Konva + Zustand + Tailwind v4 · Docker Compose. See README.md.

## Commands

```bash
docker compose up --build        # full stack: http://localhost:5173, API :8000, docs :8000/docs
make test                        # pytest + vitest
make lint                        # ruff check/format --check + oxlint + tsc
make dev-backend / dev-frontend  # local dev (Vite proxies /api to :8000)
make samples                     # 50 synthetic images + VOC XML in samples/generated
cd backend && poetry run pytest tests/test_api_flow.py -q   # single backend file
cd frontend && npx vitest run tests/editorStore.test.ts      # single frontend file
```

Always run `make lint` and `make test` before committing. Never claim a check passed without running it.

## Non-negotiable rules

1. **Coordinates are original-image pixels** everywhere they are stored or sent to the API.
   Canvas/screen/zoom only exist in `frontend/src/utils/coordinates.ts` and the viewport store.
   Konva layers carry the viewport transform, so shapes are positioned in image pixels.
2. **The internal JSON (`schemaVersion: 1`) is the source of truth.** YOLO `.txt` files are export
   artifacts only; never read them back. Changing the schema means bumping `schemaVersion` and
   writing a migration in the repository layer.
3. **Geometry is duplicated on purpose** in `backend/.../validators/geometry.py` and
   `frontend/src/utils/geometry.ts` (same rules, same canonical order, same messages).
   Change both together and extend both test suites. Same for split target counts
   (`exporters/split.py` ↔ `utils/split.ts`).
4. **Canonical vertex order**: angle sort around the centroid (clockwise on screen, y down),
   starting at min `x + y` (ties: smaller y, then x). The backend canonicalizes on save; the
   editor canonicalizes after drawing and after each vertex drag.
5. **Autosave must never lose work**: invalid geometry is still saved; validation blocks
   *export*, not saving. Saves are sequential and carry `baseRevision` (409 on conflict).
6. **Security**: every user-derived path goes through `storage/paths.py`
   (`sanitize_filename`, `validate_identifier`, `safe_join`). XML only via `defusedxml` with
   DTD/entities/external forbidden. Images are decoded with Pillow to verify the real format
   and pixel limits. Ports bind to 127.0.0.1. CORS only lists local origins.
7. **Writes are atomic** (`storage/atomic.py`, temp file + fsync + rename) and serialized per
   project with `ProjectRepository.lock()`.
8. **Exports are reproducible**: deterministic split (sorted groups, seeded shuffle, exact
   duplicates grouped), fixed ZIP timestamps, explicit Unix permissions on ZIP entries
   (directories need 0755 or `unzip` makes them untraversable).
9. **Excluded images** (`ImageRecord.excluded`) stay in the project but must be skipped by
   everything that builds the dataset: validation, quality report, splits and exports.
   New dataset-level features must honour the flag too.
10. No database, auth, cloud, queues, OBB export, training or inference in the MVP.

## Backend layout (`backend/src/annotator`)

- `api/routes/*` thin HTTP layer → `services/*` (business logic) → `storage/repository.py` (files).
- `models/*` Pydantic models; `ApiModel` gives snake_case in Python and camelCase JSON.
- Errors: raise `core/errors.py` `AppError` subclasses; one handler renders
  `{"error": {"code", "message", "details"}}`. Don't return ad-hoc error dicts.
- Settings: `core/config.py` reads env vars (documented in `.env.example`); add new ones there too.
- Services are wired once in `api/dependencies.py::Container` and injected with `ContainerDep`.
- Sync endpoints run in FastAPI's thread pool; upload endpoints read with size limits
  (`api/uploads.py`) then call services via `run_in_threadpool`.
- Ruff config in `pyproject.toml` (line length 100, bandit `S` rules on). Tests live in
  `backend/tests`, helpers in `tests/factories.py`; use the `client`/`project_id` fixtures.

## Frontend layout (`frontend/src`)

- `features/*` screens (gallery, editor, export) compose `components/*` (presentational,
  grouped by area; shared primitives in `components/ui`).
- State: `stores/editorStore.ts` (annotations, selection, draft, undo/redo snapshots, change
  counters), `viewportStore.ts` (zoom/pan/fit, pointer), `projectStore.ts`, `configStore.ts`
  (server limits), `toastStore.ts`. Read the store in event handlers with `getState()`;
  subscribe in components with selectors + `useShallow`.
- History: discrete actions record a snapshot; drags call `beginTransform()` →
  `setVertex()`* → `endTransform()` so one drag = one undo step.
- Never put image data in state; components load images by URL (`useHtmlImage`), URLs carry
  `?v=<sha256>` so the API can serve them as immutable.
- API calls only through `services/*Api.ts` (`ApiError` for every failure).
- Styling: Tailwind utility classes and the tokens in `index.css`; no scattered inline styles
  (Konva colors live in `components/polygon-editor/theme.ts`).
- Lint is oxlint (React rules incl. hooks); TypeScript has `strict` + `noUncheckedIndexedAccess`.
- The editor route is lazy-loaded to keep Konva out of the initial bundle.

## Conventions

- Keep modules small and single-purpose; prefer pure functions for anything testable
  (geometry, transforms, formatting, split) and test them directly.
- Comments explain *why* (invariants, trade-offs), not what the code does.
- Commits: conventional style (`feat(backend): …`, `fix(frontend): …`), on a feature branch
  (a local hook blocks commits on `main`).
