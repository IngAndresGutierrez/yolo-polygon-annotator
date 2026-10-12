from __future__ import annotations

import uuid
from pathlib import PurePath

from annotator.core.config import Settings
from annotator.core.errors import AppError, ConflictError, InvalidInputError
from annotator.models.annotation import (
    Annotation,
    AnnotationsUpdate,
    ImageAnnotations,
    Point,
)
from annotator.models.base import ApiModel
from annotator.models.classes import find_class_by_id, find_class_by_name
from annotator.models.project import ImageImportIssue, ImageRecord, Project, VocImportResult
from annotator.models.validation import ValidationIssue
from annotator.services.images import UploadedFile, find_image
from annotator.services.importers.pascal_voc import (
    VocDocument,
    box_to_quad,
    clamp_box,
    parse_voc,
)
from annotator.services.projects import utcnow
from annotator.services.validators.annotations import (
    canonicalize_annotation,
    validate_image_annotations,
)
from annotator.storage.paths import sanitize_filename
from annotator.storage.repository import ProjectRepository


class AnnotationDocument(ApiModel):
    document: ImageAnnotations
    issues: list[ValidationIssue]


def new_annotation_id() -> str:
    return f"a-{uuid.uuid4().hex[:12]}"


def empty_document(record: ImageRecord) -> ImageAnnotations:
    return ImageAnnotations(
        image_id=record.id, filename=record.filename, width=record.width, height=record.height
    )


class AnnotationService:
    def __init__(self, repo: ProjectRepository, settings: Settings) -> None:
        self._repo = repo
        self._settings = settings

    def _issues(self, doc: ImageAnnotations) -> list[ValidationIssue]:
        return validate_image_annotations(
            doc, self._settings.classes, self._settings.min_polygon_area
        )

    def load(self, project_id: str, record: ImageRecord) -> ImageAnnotations:
        return self._repo.read_annotations(project_id, record) or empty_document(record)

    def get(self, project_id: str, image_id: str) -> AnnotationDocument:
        record = find_image(self._repo.get_project(project_id), image_id)
        doc = self.load(project_id, record)
        return AnnotationDocument(document=doc, issues=self._issues(doc))

    def save(self, project_id: str, image_id: str, update: AnnotationsUpdate) -> AnnotationDocument:
        with self._repo.lock(project_id):
            project = self._repo.get_project(project_id)
            record = find_image(project, image_id)
            current = self.load(project_id, record)
            if update.base_revision is not None and update.base_revision != current.revision:
                raise ConflictError(
                    "Annotations were modified elsewhere; reload the image before saving",
                    details={"currentRevision": current.revision},
                )
            annotations = [self._normalize(a) for a in update.annotations]
            doc = self._persist(project, record, annotations, negative=update.negative)
        return AnnotationDocument(document=doc, issues=self._issues(doc))

    def clear(self, project_id: str, image_id: str) -> AnnotationDocument:
        return self.save(project_id, image_id, AnnotationsUpdate(annotations=[]))

    def _normalize(self, annotation: Annotation) -> Annotation:
        label_class = find_class_by_id(self._settings.classes, annotation.class_id)
        if label_class is None:
            raise InvalidInputError(f"Unknown class id {annotation.class_id}")
        normalized = canonicalize_annotation(annotation)
        return normalized.model_copy(update={"class_name": label_class.name})

    def _persist(
        self,
        project: Project,
        record: ImageRecord,
        annotations: list[Annotation],
        negative: bool,
    ) -> ImageAnnotations:
        """Write a document and refresh the image index. Caller holds the project lock."""
        current = self.load(project.id, record)
        has_objects = bool(annotations)
        doc = current.model_copy(
            update={
                "annotations": annotations,
                "negative": negative and not has_objects,
                "revision": current.revision + 1,
                "updated_at": utcnow(),
                "width": record.width,
                "height": record.height,
            }
        )
        self._repo.write_annotations(project.id, doc)
        record.annotation_count = len(annotations)
        record.status = "annotated" if has_objects else ("negative" if doc.negative else "pending")
        record.revision = doc.revision
        project.updated_at = utcnow()
        self._repo.save_project(project)
        return doc

    # -- PASCAL VOC ----------------------------------------------------------
    def import_voc(
        self, project_id: str, files: list[UploadedFile], overwrite: bool
    ) -> VocImportResult:
        result = VocImportResult(
            matched=[],
            annotations_imported=0,
            skipped_existing=[],
            unmatched=[],
            rejected=[],
            warnings=[],
        )
        with self._repo.lock(project_id):
            project = self._repo.get_project(project_id)
            by_filename = {img.filename.lower(): img for img in project.images}
            by_stem: dict[str, list[ImageRecord]] = {}
            for img in project.images:
                by_stem.setdefault(PurePath(img.filename).stem.lower(), []).append(img)

            for upload in files:
                try:
                    xml_name = sanitize_filename(upload.filename)
                    if PurePath(xml_name).suffix.lower() != ".xml":
                        raise InvalidInputError("Only .xml PASCAL VOC files are accepted")
                    if len(upload.data) > self._settings.max_xml_bytes:
                        raise InvalidInputError("XML file exceeds the configured size limit")
                    voc = parse_voc(upload.data)
                except AppError as exc:
                    result.rejected.append(
                        ImageImportIssue(
                            filename=upload.filename or "", code=exc.code, message=exc.message
                        )
                    )
                    continue

                record = by_filename.get((voc.filename or "").lower())
                if record is None:
                    stem_matches = by_stem.get(PurePath(xml_name).stem.lower(), [])
                    record = stem_matches[0] if len(stem_matches) == 1 else None
                if record is None:
                    result.unmatched.append(
                        ImageImportIssue(
                            filename=xml_name,
                            code="no_matching_image",
                            message=f"No imported image named {voc.filename or xml_name!r}",
                        )
                    )
                    continue

                existing = self.load(project_id, record)
                if (existing.annotations or existing.negative) and not overwrite:
                    result.skipped_existing.append(record.filename)
                    continue

                annotations = self._voc_annotations(voc, record, xml_name, result.warnings)
                self._persist(project, record, annotations, negative=False)
                result.matched.append(record.filename)
                result.annotations_imported += len(annotations)
        return result

    def _voc_annotations(
        self,
        voc: VocDocument,
        record: ImageRecord,
        xml_name: str,
        warnings: list[ImageImportIssue],
    ) -> list[Annotation]:
        for message in voc.warnings:
            warnings.append(ImageImportIssue(filename=xml_name, code="voc_object", message=message))
        if voc.width and voc.height and (voc.width, voc.height) != (record.width, record.height):
            warnings.append(
                ImageImportIssue(
                    filename=xml_name,
                    code="size_mismatch",
                    message=f"XML declares {voc.width}x{voc.height} but the image is "
                    f"{record.width}x{record.height}; boxes were clamped to the image",
                )
            )
        annotations: list[Annotation] = []
        for obj in voc.objects:
            label_class = find_class_by_name(self._settings.classes, obj.name)
            if label_class is None:
                warnings.append(
                    ImageImportIssue(
                        filename=xml_name,
                        code="unknown_class",
                        message=f"Object class {obj.name!r} is not configured; skipped",
                    )
                )
                continue
            box = clamp_box(obj.box, record.width, record.height)
            if box.xmax <= box.xmin or box.ymax <= box.ymin:
                warnings.append(
                    ImageImportIssue(
                        filename=xml_name,
                        code="outside_image",
                        message=f"A {obj.name!r} box lies outside the image; skipped",
                    )
                )
                continue
            annotations.append(
                Annotation(
                    id=new_annotation_id(),
                    class_id=label_class.id,
                    class_name=label_class.name,
                    points=[Point(x=x, y=y) for x, y in box_to_quad(box)],
                )
            )
        return annotations
