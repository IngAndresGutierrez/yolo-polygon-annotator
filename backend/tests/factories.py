"""Small in-memory images and PASCAL VOC documents for tests."""

from __future__ import annotations

import io

from PIL import Image


def make_image_bytes(
    width: int = 400,
    height: int = 400,
    fmt: str = "PNG",
    color: tuple[int, int, int] = (90, 120, 150),
) -> bytes:
    image = Image.new("RGB", (width, height), color)
    # A small pattern makes perceptual hashes differ between colors.
    for x in range(0, width, 7):
        for y in range(0, height, 11):
            image.putpixel((x, y), ((x * 3) % 255, (y * 5) % 255, (color[0] + x) % 255))
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def make_voc_xml(
    filename: str,
    boxes: list[tuple[int, int, int, int]],
    width: int = 400,
    height: int = 400,
    name: str = "licence",
) -> bytes:
    objects = "".join(
        f"""
    <object>
        <name>{name}</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>{xmin}</xmin>
            <ymin>{ymin}</ymin>
            <xmax>{xmax}</xmax>
            <ymax>{ymax}</ymax>
        </bndbox>
    </object>"""
        for xmin, ymin, xmax, ymax in boxes
    )
    return f"""<annotation>
    <folder>images</folder>
    <filename>{filename}</filename>
    <size><width>{width}</width><height>{height}</height><depth>3</depth></size>
    <segmented>0</segmented>{objects}
</annotation>""".encode()
