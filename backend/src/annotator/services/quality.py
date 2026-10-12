"""Dataset quality report: duplicate groups and images with invalid annotations.

Only images still included in the dataset are analysed, so resolving a group
(excluding or deleting the extra copies) makes it disappear from the report.
"""

from __future__ import annotations

from collections import defaultdict

from annotator.core.config import Settings
from annotator.models.project import ImageRecord
from annotator.models.quality import DuplicateGroup, QualityReport
from annotator.models.validation import ImageValidation
from annotator.services.annotations import AnnotationService
from annotator.services.validators.annotations import validate_image_annotations
from annotator.storage.repository import ProjectRepository
from annotator.utils.images import hamming_distance

_STATUS_RANK = {"annotated": 2, "negative": 1, "pending": 0}


def keep_rank(image: ImageRecord) -> tuple[int, int, int, float, str]:
    """Lower is better: reviewed work first, then more objects, higher resolution,
    oldest import and finally the smaller id (usually the original, not the copy)."""
    return (
        -_STATUS_RANK[image.status],
        -image.annotation_count,
        -(image.width * image.height),
        image.created_at.timestamp(),
        image.id,
    )


def suggest_keep(images: list[ImageRecord]) -> ImageRecord:
    return min(images, key=keep_rank)


def exact_duplicate_groups(images: list[ImageRecord]) -> list[DuplicateGroup]:
    by_hash: dict[str, list[ImageRecord]] = defaultdict(list)
    for image in images:
        by_hash[image.sha256].append(image)
    return [
        DuplicateGroup(
            kind="exact",
            image_ids=[img.id for img in members],
            keep_id=suggest_keep(members).id,
            max_distance=0,
        )
        for members in by_hash.values()
        if len(members) > 1
    ]


def near_duplicate_groups(images: list[ImageRecord], threshold: int) -> list[DuplicateGroup]:
    """Connected components of images whose dHash differ by at most `threshold` bits.

    Exact copies are represented by a single image so near groups only contain
    visually similar but byte-different files.
    """
    representatives: dict[str, ImageRecord] = {}
    for image in images:
        current = representatives.get(image.sha256)
        if current is None or keep_rank(image) < keep_rank(current):
            representatives[image.sha256] = image
    reps = sorted(representatives.values(), key=lambda img: img.id)

    parent = list(range(len(reps)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(reps)):
        for j in range(i + 1, len(reps)):
            if hamming_distance(reps[i].dhash, reps[j].dhash) <= threshold:
                parent[find(i)] = find(j)

    components: dict[int, list[ImageRecord]] = defaultdict(list)
    for index, image in enumerate(reps):
        components[find(index)].append(image)

    groups = []
    for members in components.values():
        if len(members) < 2:
            continue
        distance = max(
            hamming_distance(a.dhash, b.dhash) for a in members for b in members if a.id < b.id
        )
        groups.append(
            DuplicateGroup(
                kind="near",
                image_ids=[img.id for img in members],
                keep_id=suggest_keep(members).id,
                max_distance=distance,
            )
        )
    return sorted(groups, key=lambda g: g.image_ids[0])


class QualityService:
    def __init__(
        self, repo: ProjectRepository, annotations: AnnotationService, settings: Settings
    ) -> None:
        self._repo = repo
        self._annotations = annotations
        self._settings = settings

    def report(self, project_id: str) -> QualityReport:
        project = self._repo.get_project(project_id)
        included = [img for img in project.images if not img.excluded]

        invalid: list[ImageValidation] = []
        for record in included:
            doc = self._annotations.load(project_id, record)
            errors = [
                issue
                for issue in validate_image_annotations(
                    doc, self._settings.classes, self._settings.min_polygon_area
                )
                if issue.severity == "error"
            ]
            if errors:
                invalid.append(
                    ImageValidation(image_id=record.id, filename=record.filename, issues=errors)
                )

        exact = exact_duplicate_groups(included)
        near = near_duplicate_groups(included, self._settings.near_duplicate_threshold)
        return QualityReport(
            project_id=project_id,
            exact_groups=exact,
            near_groups=near,
            invalid_images=invalid,
            excluded_count=len(project.images) - len(included),
            issue_count=len(exact) + len(near) + len(invalid),
        )
