# YOLO Polygon Annotator

Local web app to label licence plates (or any object) with **4-vertex polygons** and export
**Ultralytics YOLO Detection** and **YOLO Segmentation** datasets.

- Import JPG/PNG images and existing **PASCAL VOC XML** boxes (converted to editable quadrilaterals).
- Draw, select, drag vertices, move polygons, undo/redo, zoom at pointer, pan, fit.
- Annotations are stored in **original image pixels** and autosaved to disk (survives restarts).
- Geometry validation (convex, simple, in bounds, minimum area, canonical vertex order).
- Reproducible, duplicate-aware train/val/test split, frozen and reusable across formats.
- ZIP export with `images/`, `labels/`, `data.yaml` and `split_manifest.csv`.

Everything runs locally: no database, no cloud, no authentication.

---

## 1. Prerequisites

| To run with Docker (recommended) | To develop locally |
| --- | --- |
| Docker Engine / Docker Desktop with Compose v2.24+ | Python 3.11 + [Poetry](https://python-poetry.org/) 2.x |
| | Node.js 22+ (developed with Node 24) and npm |

## 2. Quick start (Docker)

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Web app | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs (OpenAPI / Swagger) | http://localhost:8000/docs |

Ports are published on `127.0.0.1` only. A **Default project** is created on first start.
All data lives in `./workspace` (bind mount), so it persists across `docker compose down/up`
and image rebuilds.

Optional configuration: `cp .env.example .env` and edit (ports, upload limits, minimum polygon
area, CORS origins). **On Linux**, set `APP_UID`/`APP_GID` to the output of `id -u`/`id -g` so
the container user can write to `./workspace`.

`make up`, `make down`, `make logs`, `make test` are shortcuts (`make help` lists them all).

## 3. Local development (without Docker)

```bash
make install          # poetry install + npm ci
make dev-backend      # API on http://localhost:8000 (auto-reload), data in ./workspace
make dev-frontend     # Vite on http://localhost:5173, proxies /api to :8000
```

Set `VITE_API_PROXY_TARGET` if the API runs elsewhere. The backend reads its settings from
environment variables (see `.env.example`); `WORKSPACE_DIR` defaults to `./workspace`.

## 4. Using the app

### 4.1 Images screen

1. Drop JPG/PNG files onto the drop zone (or **Add images**). Files are validated by real
   content (not only by extension) and size. Duplicate filenames are rejected; exact and
   near-duplicate images are reported as warnings.
2. Drop the matching PASCAL VOC `.xml` files (or **Import VOC XML**). You can drop images and
   XML together: images are uploaded first.
3. Cards show the status — **Pending**, **Annotated**, **No objects** — and the object count.
   Search by filename, filter by status, delete with confirmation, click to open the editor.

The last opened project is restored automatically when you reopen the app.

Tick the checkbox on a card (hover to reveal it) to select images; the selection bar offers
**Exclude from dataset**, **Include** and **Delete** for all selected images at once. The
**Excluded** filter lists images that are currently out of the dataset.

### 4.2 PASCAL VOC import

- Each XML is matched to an image by its `<filename>` (case-insensitive); if that fails, by the
  XML file stem (`Cars2.xml` → `Cars2.png`).
- Every `<object>` whose `<name>` is a configured class (`licence`) becomes a 4-point polygon
  from the box corners: `(xmin,ymin) (xmax,ymin) (xmax,ymax) (xmin,ymax)`.
- **No perspective is inferred** — VOC only has rectangles. Refine the corners in the editor.
- Images that already have annotations are skipped unless **Overwrite existing annotations** is on.
- Boxes are clamped to the image; mismatched `<size>`, unknown classes and invalid boxes are reported.
- XML is parsed with `defusedxml` with DTDs/entities/external references forbidden (no XXE).

### 4.3 Polygon editor

Layout: image list (left) · tools (top) · canvas (center) · objects and vertex coordinates
(right) · save status, image position, validation and cursor position (bottom).

| Action | How |
| --- | --- |
| Draw a polygon | `N`, then click the 4 corners in any order (closes automatically) |
| Cancel drawing / remove last point | `Esc` / `Backspace` |
| Select | `V` tool, click a polygon (or `[` / `]` to cycle) |
| Move a vertex | Drag a handle of the selected polygon (the white handle is vertex #1) |
| Move a polygon | Drag the selected polygon, or arrow keys (1 px, `Shift` = 10 px) |
| Delete | `Delete` / `Backspace`, or the trash icon |
| Undo / redo | `Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z` (or `Ctrl+Y`) |
| Zoom | Mouse wheel / trackpad (anchored at the pointer), `+` / `-` |
| Pan | Drag an empty area, hold `Space` and drag, or middle mouse button |
| Fit / 100% | `F` / `1` |
| Previous / next image | `A` / `D` (or `←` / `→` when nothing is selected) |
| Save now | `Ctrl/⌘+S` (autosave runs ~0.7 s after each change) |
| Image without plates | Tick *This image has no objects* (exported as a background) |

Vertices are re-ordered after every edit into the **canonical order**: clockwise on screen,
starting at the vertex with the smallest `x + y` (ties: smaller `y`, then `x`) — i.e. top-left,
top-right, bottom-right, bottom-left for an upright plate. This also untangles "bow-tie"
click orders.

**Validation** (live in the editor, and again on the server before export):
exactly 4 vertices · inside the image · no coincident consecutive vertices · no crossing
edges · strictly convex (no dents, no 3 collinear vertices) · area ≥ `MIN_POLYGON_AREA`
(default 16 px²) · canonical order. Invalid polygons are drawn dashed red with a message.
Invalid work is still autosaved (you never lose edits) but **export is blocked** until fixed.

**Saving**: changes are debounced and saved one request at a time, with an atomic file write
on the server. Switching images or leaving the editor saves first; if a save fails you are
asked before anything is discarded, and the tab warns before closing with unsaved changes.
Each document has a `revision`; saving a stale revision (e.g. from a second tab) returns
`409 Conflict` and the status bar offers **Reload from server**.

**Coordinates**: annotations are always stored in pixels of the original image. Zoom, pan and
window size only change the viewport transform (`canvas = image × scale + offset`), see
`frontend/src/utils/coordinates.ts`. JPEGs with an EXIF orientation are rotated upright on
import so the browser, the stored pixels and the training pipeline share one frame.

### 4.4 Dataset quality (cleanup)

The **Quality** screen (amber dot in the menu when exact duplicates are present) lists what
would make the dataset dirty, considering only images that are still in the dataset:

| Section | What it finds | Typical action |
| --- | --- | --- |
| Exact duplicates | Byte-identical files (same SHA-256) | *Exclude all extra copies* |
| Near duplicates | Perceptual hash (dHash) within `NEAR_DUPLICATE_THRESHOLD` bits: resized, re-encoded, consecutive frames | Review; exclude the copies or *Not duplicates — hide* |
| Invalid annotations | Images whose polygons fail validation (they block the export) | *Fix in editor* or *Exclude* |
| Excluded images | Everything currently excluded, with the reason | *Include again* or *Delete* |

In every group you choose which image to **keep**; the suggestion prefers annotated images,
then "no objects", then more objects, higher resolution and the oldest import.

- **Exclude** (reversible): the image and its annotations stay in the project, but it is
  skipped by validation, splits and exports. Use it by default.
- **Delete** (permanent, asks for confirmation): removes the file and its annotations.

Excluding is also available per image in the editor (*Dataset → Exclude this image*) and in
bulk from the Images screen. If an image is excluded after a split was frozen, exports using
that split skip it and report a warning; the other partitions stay unchanged.

### 4.5 Export

1. **Validation** — errors (with a *Fix* link per image) and warnings.
2. **Dataset** — format (Detection / Segmentation), dataset name, and split:
   - *New split*: train/val/test percentages (default 70/20/10) and a seed (default 42).
     50 images → 35 / 10 / 5. A live preview shows the counts.
   - *Reuse a frozen split*: every new split is saved as a manifest; after the first export
     the form switches to it so the other format uses **identical partitions**.
3. **Download** the ZIP. Previous exports stay listed.

Pending (never reviewed) images are excluded by default; images marked *no objects* are
exported with an empty label file.

#### Formats

| Format | Label line (normalized to [0, 1]) |
| --- | --- |
| Detection | `class x_center y_center width height` — box from the polygon's extreme coordinates |
| Segmentation | `class x1 y1 x2 y2 x3 y3 x4 y4` — the 4 vertices in canonical order |

#### ZIP structure

```text
<dataset-name>/
├── images/{train,val,test}/<image_id>.<jpg|png>
├── labels/{train,val,test}/<image_id>.txt
├── data.yaml
└── split_manifest.csv      # image_id, original_filename, split, files, objects, size, sha256
```

`data.yaml` has relative paths and no `path:` key, so Ultralytics uses the folder that
contains it as the dataset root and the dataset can be moved anywhere:

```bash
# The archive is named <dataset>-<format>-<export_id>.zip; its root folder is <dataset>/
unzip dataset-detection-export-*.zip
yolo detect train data=dataset/data.yaml model=yolo11n.pt      # Detection export
yolo segment train data=dataset/data.yaml model=yolo11n-seg.pt # Segmentation export
```

Compatibility was checked with Ultralytics 8.4.176: `check_det_dataset()` resolves the
relative paths and `YOLODataset` loads every image and label of both exports without
"corrupt" warnings (segmentation labels are parsed as 4-point polygons).

File stems are internal image ids (unique per project), so names never collide. Archives use
fixed timestamps: re-exporting the same data and split produces identical files.

**Split guarantees**: target counts use the largest-remainder method (ties → train, val,
test); exact duplicates (same SHA-256) form one group and never cross partitions; groups are
sorted before the seeded shuffle, so the result does not depend on upload order. Near
duplicates (perceptual dHash within `NEAR_DUPLICATE_THRESHOLD` bits) are reported when they end
up in different partitions.

#### About YOLO OBB (not implemented)

OBB labels are *rotated rectangles* (`class x1 y1 … x4 y4` of a rectangle). A plate seen in
perspective is a general quadrilateral, so exporting its 4 points as OBB would silently feed
invalid rectangles to training. A future OBB exporter should fit a rotated rectangle
explicitly (e.g. minimum-area rectangle of the 4 points, as `cv2.minAreaRect` does), report the
fitting error (IoU between polygon and rectangle), and block or warn above a threshold.

## 5. Project structure

```text
├── backend/                     FastAPI + Poetry (Python 3.11)
│   ├── src/annotator/
│   │   ├── api/                 routes, dependency container, upload limits
│   │   ├── core/                settings (env vars), error types + handlers
│   │   ├── models/              Pydantic models (camelCase JSON, versioned schemas)
│   │   ├── services/
│   │   │   ├── importers/       PASCAL VOC parsing → quadrilaterals
│   │   │   ├── validators/      pure geometry + annotation rules
│   │   │   ├── exporters/       YOLO label formatting, split algorithm
│   │   │   └── *.py             projects, images, annotations, splits, exports, validation
│   │   ├── storage/             file repository, atomic writes, path safety
│   │   └── utils/               image inspection, hashing, thumbnails
│   └── tests/                   pytest (unit + API integration)
├── frontend/                    React 19 + TypeScript (strict) + Vite
│   ├── src/
│   │   ├── app/                 App root, hash router
│   │   ├── components/          layout, ui, image-gallery, polygon-editor, export
│   │   ├── features/            screens: gallery, editor, export
│   │   ├── hooks/               autosave, shortcuts, image loading, element size
│   │   ├── services/            typed API client
│   │   ├── stores/              Zustand: editor (undo/redo), viewport, project, config, toasts
│   │   ├── types/               API types
│   │   └── utils/               geometry, coordinates, split preview (pure, tested)
│   └── tests/                   vitest
├── docker/                      backend/frontend Dockerfiles, nginx.conf
├── scripts/generate_samples.py  synthetic images + VOC XML
├── samples/basic/               3 small example images with XML
├── workspace/                   local data (git-ignored)
├── compose.yaml · Makefile · .env.example · CLAUDE.md
```

### Workspace layout

```text
workspace/
├── projects/<project_id>/
│   ├── project.json             project metadata + image index (status, counts, hashes)
│   ├── images/<image_id>.<ext>  original files (EXIF-rotated if needed)
│   ├── thumbnails/<image_id>.jpg
│   ├── annotations/<image_id>.json   internal format (editing source of truth)
│   └── splits/<split_id>.json        frozen split manifests
└── exports/<project_id>/<export_id>.zip (+ .json metadata)
```

This differs slightly from the initially proposed flat `workspace/images|annotations` layout:
grouping by project keeps multiple projects isolated and lets a project be copied or deleted
as a single folder.

Internal annotation format (`schemaVersion: 1`):

```json
{
  "schemaVersion": 1,
  "imageId": "cars2",
  "filename": "Cars2.png",
  "width": 400,
  "height": 400,
  "negative": false,
  "revision": 3,
  "updatedAt": "2026-10-12T20:52:58Z",
  "annotations": [
    {
      "id": "a-148429bc4ca6",
      "classId": 0,
      "className": "licence",
      "type": "quadrilateral",
      "points": [{"x": 229, "y": 176}, {"x": 270, "y": 176}, {"x": 270, "y": 193}, {"x": 229, "y": 193}]
    }
  ]
}
```

## 6. API overview

All endpoints are under `/api` and documented at `/docs`. Errors share one shape:
`{"error": {"code", "message", "details"}}`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Status, classes, editor limits |
| GET/POST | `/api/projects` | List / create projects |
| GET/DELETE | `/api/projects/{pid}` | Get / delete a project |
| GET/POST | `/api/projects/{pid}/images` | List (`?search=`) / upload images (multipart `files`) |
| POST | `/api/projects/{pid}/images/bulk` | `{imageIds, action: exclude\|include\|delete, reason?}` |
| GET/DELETE | `/api/projects/{pid}/images/{iid}` | Image metadata / delete image + annotations |
| GET | `/api/projects/{pid}/images/{iid}/file`, `/thumbnail` | Image bytes |
| GET/PUT/DELETE | `/api/projects/{pid}/images/{iid}/annotations` | Read / save (`baseRevision`) / clear |
| POST | `/api/projects/{pid}/annotations/import-voc?overwrite=` | Import PASCAL VOC XML files |
| GET | `/api/projects/{pid}/validation` | Project validation report |
| GET | `/api/projects/{pid}/quality` | Duplicate groups (exact/near) and invalid images |
| GET/POST | `/api/projects/{pid}/splits`, `GET …/splits/{sid}` | Frozen split manifests |
| GET/POST | `/api/projects/{pid}/exports` | List / create a YOLO export |
| GET | `/api/projects/{pid}/exports/{eid}/download` | Download the ZIP |

## 7. Tests

```bash
make test            # backend pytest + frontend vitest
make lint            # ruff + oxlint + tsc
```

- **Backend (pytest)**: PASCAL VOC parsing and XXE/entity-bomb rejection, box → quadrilateral,
  geometry validation and self-intersection, normalization, Detection/Segmentation lines,
  `data.yaml`, reproducible and duplicate-safe splits (50 → 35/10/5), images without objects,
  duplicate grouping and keep suggestion, exclusion/inclusion/bulk delete and their effect on
  validation, splits and exports,
  path traversal and unsafe ids, upload limits, revision conflicts, and an end-to-end API flow
  (import image → import XML → edit 4 vertices → save → reload from a new app instance →
  export both formats → check labels and byte-identical re-export).
- **Frontend (vitest)**: geometry, coordinate transforms with zoom/pan, selection, polygon
  creation/modification, undo/redo, save tracking, API client error handling, split preview.

Try it with data: `make samples` writes 50 synthetic car images with perspective plates and
their VOC XML to `samples/generated/` (every 10th image has no plate). `samples/basic/` has 3.

## 8. Known limitations

- Single class (`licence`, id 0). The data model stores `classId`/`className` per annotation and
  the class list lives in settings, but there is no class manager UI yet.
- Exactly 4 vertices per polygon (by design); no free-form polygons.
- No YOLO OBB export (see above), no training, inference or auto-labelling.
- Single user: concurrent edits of the same image are detected (409) but not merged.
- Touch: tablets can draw, select and drag vertices with pointer events and use the zoom
  buttons; pinch-zoom and other advanced touch gestures are not implemented.
- Near-duplicate detection is O(n²) — fine for thousands of images. *Not duplicates — hide*
  only hides a near-duplicate group until the page is reloaded (it is not persisted).
- Export runs synchronously in the request; very large projects make the request take longer.
- The bind-mounted workspace must be writable by the container user (`APP_UID`/`APP_GID` on Linux).
