from __future__ import annotations

import uuid

from annotator.core.config import Settings
from annotator.core.errors import InvalidInputError
from annotator.models.export import SplitAssignment, SplitCreate, SplitManifest, SplitSummary
from annotator.services.exporters.split import (
    SplitCandidate,
    find_near_duplicates,
    split_dataset,
)
from annotator.services.projects import utcnow
from annotator.storage.repository import ProjectRepository

MIN_IMAGES_FOR_SPLIT = 2


def new_id(prefix: str) -> str:
    return f"{prefix}-{utcnow():%Y%m%d%H%M%S}-{uuid.uuid4().hex[:6]}"


def summarize_split(manifest: SplitManifest) -> SplitSummary:
    return SplitSummary(
        id=manifest.id,
        created_at=manifest.created_at,
        seed=manifest.seed,
        ratios=manifest.ratios,
        counts=manifest.counts,
        image_count=len(manifest.assignments),
    )


class SplitService:
    def __init__(self, repo: ProjectRepository, settings: Settings) -> None:
        self._repo = repo
        self._settings = settings

    def list(self, project_id: str) -> list[SplitSummary]:
        return [summarize_split(m) for m in self._repo.list_splits(project_id)]

    def get(self, project_id: str, split_id: str) -> SplitManifest:
        return self._repo.get_split(project_id, split_id)

    def create(self, project_id: str, request: SplitCreate) -> SplitManifest:
        """Compute and freeze a split manifest so several exports can share it."""
        with self._repo.lock(project_id):
            project = self._repo.get_project(project_id)
            records = [
                img for img in project.images if request.include_pending or img.status != "pending"
            ]
            if len(records) < MIN_IMAGES_FOR_SPLIT:
                raise InvalidInputError(
                    f"At least {MIN_IMAGES_FOR_SPLIT} exportable images are needed to build a "
                    f"split (found {len(records)}). Annotate images or mark them as 'no objects'."
                )
            candidates = [
                SplitCandidate(img.id, img.filename, img.sha256, img.dhash) for img in records
            ]
            ratios = request.ratios.model_dump()
            outcome = split_dataset(candidates, ratios, request.seed)
            warnings = list(outcome.warnings)
            for first, second, distance in find_near_duplicates(
                candidates, self._settings.near_duplicate_threshold
            ):
                split_a = outcome.assignments[first.image_id]
                split_b = outcome.assignments[second.image_id]
                if split_a != split_b:
                    warnings.append(
                        f"Possible near-duplicates across splits ({distance} bit difference): "
                        f"{first.filename} [{split_a}] and {second.filename} [{split_b}]"
                    )
            if outcome.counts["val"] == 0:
                warnings.append("The validation split is empty; Ultralytics requires val images")

            by_id = {img.id: img for img in records}
            manifest = SplitManifest(
                id=new_id("split"),
                project_id=project_id,
                created_at=utcnow(),
                seed=request.seed,
                ratios=request.ratios,
                include_pending=request.include_pending,
                counts=outcome.counts,  # type: ignore[arg-type]
                assignments=[
                    SplitAssignment(
                        image_id=image_id,
                        filename=by_id[image_id].filename,
                        sha256=by_id[image_id].sha256,
                        split=split,  # type: ignore[arg-type]
                    )
                    for image_id, split in sorted(outcome.assignments.items())
                ],
                warnings=warnings,
            )
            self._repo.save_split(manifest)
        return manifest
