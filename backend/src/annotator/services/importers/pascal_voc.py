"""PASCAL VOC XML import.

VOC only stores axis-aligned boxes. Each box becomes an editable
quadrilateral whose vertices are the rectangle corners in canonical order
(top-left, top-right, bottom-right, bottom-left). No perspective is inferred:
the user refines the vertices manually in the editor.

Parsing uses `defusedxml` with DTDs forbidden, which also rules out entity
expansion and external references (XXE).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import PurePosixPath, PureWindowsPath
from xml.etree.ElementTree import Element, ParseError

from defusedxml import DefusedXmlException
from defusedxml.ElementTree import fromstring

from annotator.core.errors import InvalidInputError

Coord = tuple[float, float]


@dataclass(frozen=True)
class VocBox:
    xmin: float
    ymin: float
    xmax: float
    ymax: float


@dataclass(frozen=True)
class VocObject:
    name: str
    box: VocBox


@dataclass
class VocDocument:
    filename: str | None
    width: int | None
    height: int | None
    objects: list[VocObject] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _text(parent: Element, tag: str) -> str | None:
    node = parent.find(tag)
    if node is None or node.text is None:
        return None
    value = node.text.strip()
    return value or None


def _number(parent: Element, tag: str) -> float | None:
    raw = _text(parent, tag)
    if raw is None:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _basename(raw: str | None) -> str | None:
    if raw is None:
        return None
    return PureWindowsPath(PurePosixPath(raw).name).name or None


def parse_voc(xml_bytes: bytes) -> VocDocument:
    try:
        root = fromstring(xml_bytes, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except DefusedXmlException as exc:
        raise InvalidInputError(
            "XML contains forbidden DTD, entities or external references"
        ) from exc
    except ParseError as exc:
        raise InvalidInputError(f"Malformed XML: {exc}") from exc

    if root.tag != "annotation":
        raise InvalidInputError(f"Not a PASCAL VOC file: root element is <{root.tag}>")

    size = root.find("size")
    width = _number(size, "width") if size is not None else None
    height = _number(size, "height") if size is not None else None
    doc = VocDocument(
        filename=_basename(_text(root, "filename")),
        width=int(width) if width else None,
        height=int(height) if height else None,
    )

    for index, obj in enumerate(root.findall("object"), start=1):
        name = _text(obj, "name")
        bndbox = obj.find("bndbox")
        if name is None or bndbox is None:
            doc.warnings.append(f"Object #{index} has no <name> or <bndbox>; skipped")
            continue
        values = [_number(bndbox, tag) for tag in ("xmin", "ymin", "xmax", "ymax")]
        if any(v is None for v in values):
            doc.warnings.append(f"Object #{index} ({name}) has an incomplete <bndbox>; skipped")
            continue
        xmin, ymin, xmax, ymax = (float(v) for v in values if v is not None)
        if xmax <= xmin or ymax <= ymin:
            doc.warnings.append(f"Object #{index} ({name}) has an empty or inverted box; skipped")
            continue
        doc.objects.append(VocObject(name=name, box=VocBox(xmin, ymin, xmax, ymax)))
    return doc


def clamp_box(box: VocBox, width: int, height: int) -> VocBox:
    return VocBox(
        xmin=min(max(box.xmin, 0.0), width),
        ymin=min(max(box.ymin, 0.0), height),
        xmax=min(max(box.xmax, 0.0), width),
        ymax=min(max(box.ymax, 0.0), height),
    )


def box_to_quad(box: VocBox) -> list[Coord]:
    """Rectangle corners in canonical order: TL, TR, BR, BL."""
    return [
        (box.xmin, box.ymin),
        (box.xmax, box.ymin),
        (box.xmax, box.ymax),
        (box.xmin, box.ymax),
    ]
