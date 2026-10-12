"""Generate synthetic car images with licence plates + PASCAL VOC XML.

Plates are drawn as slightly skewed quadrilaterals (simulated perspective);
the XML stores only their axis-aligned bounding box, like real VOC datasets.
After importing, the editor shows rectangles you can refine to the true corners.

Usage (from the repository root):
    backend/.venv/bin/python scripts/generate_samples.py --count 50 --out samples/generated
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw

PLATE_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"


def draw_plate(draw: ImageDraw.ImageDraw, rng: random.Random, corners: list[tuple[float, float]]) -> None:
    draw.polygon(corners, fill=(238, 238, 230), outline=(20, 20, 20))
    (x0, y0), (x1, _), (_, y2), _ = corners
    width = x1 - x0
    height = y2 - y0
    for i in range(7):  # fake characters
        cx = x0 + width * (0.1 + i * 0.12)
        draw.rectangle(
            [cx, y0 + height * 0.25, cx + width * 0.07, y0 + height * 0.75],
            fill=(15, 15, 25) if rng.choice(PLATE_CHARS).isalpha() else (40, 40, 60),
        )


def make_sample(rng: random.Random, index: int, out: Path) -> None:
    width, height = rng.choice([(400, 300), (500, 375), (640, 480), (400, 400)])
    background = tuple(rng.randint(60, 200) for _ in range(3))
    image = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(image)

    # Road and car body
    draw.rectangle([0, height * 0.7, width, height], fill=(70, 70, 75))
    car_w = width * rng.uniform(0.55, 0.75)
    car_h = height * rng.uniform(0.35, 0.5)
    car_x = rng.uniform(0.05, 0.95 - car_w / width) * width
    car_y = height * 0.75 - car_h
    car_color = tuple(rng.randint(0, 255) for _ in range(3))
    draw.rounded_rectangle([car_x, car_y, car_x + car_w, car_y + car_h], radius=18, fill=car_color)
    draw.rectangle([car_x + car_w * 0.15, car_y - car_h * 0.35, car_x + car_w * 0.85, car_y + 4],
                   fill=tuple(max(c - 40, 0) for c in car_color))

    objects: list[tuple[int, int, int, int]] = []
    if index % 10 != 9:  # every 10th image has no plate (background example)
        plate_w = car_w * rng.uniform(0.25, 0.32)
        plate_h = plate_w * rng.uniform(0.22, 0.3)
        px = car_x + (car_w - plate_w) / 2 + rng.uniform(-10, 10)
        py = car_y + car_h * 0.55
        skew = rng.uniform(-0.12, 0.12) * plate_h * 2
        taper = rng.uniform(0, 0.08) * plate_w
        corners = [
            (px + taper, py + skew),
            (px + plate_w - taper, py - skew),
            (px + plate_w, py + plate_h - skew),
            (px, py + plate_h + skew),
        ]
        draw_plate(draw, rng, corners)
        xs = [c[0] for c in corners]
        ys = [c[1] for c in corners]
        objects.append((round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))))

    extension = "jpg" if index % 3 == 0 else "png"
    filename = f"Cars{index}.{extension}"
    if extension == "jpg":
        image.save(out / filename, quality=90)
    else:
        image.save(out / filename)

    object_xml = "".join(
        f"""
    <object>
        <name>licence</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <occluded>0</occluded>
        <difficult>0</difficult>
        <bndbox>
            <xmin>{xmin}</xmin>
            <ymin>{ymin}</ymin>
            <xmax>{xmax}</xmax>
            <ymax>{ymax}</ymax>
        </bndbox>
    </object>"""
        for xmin, ymin, xmax, ymax in objects
    )
    xml = f"""<annotation>
    <folder>images</folder>
    <filename>{filename}</filename>
    <size>
        <width>{width}</width>
        <height>{height}</height>
        <depth>3</depth>
    </size>
    <segmented>0</segmented>{object_xml}
</annotation>
"""
    (out / f"Cars{index}.xml").write_text(xml, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--count", type=int, default=50)
    parser.add_argument("--out", type=Path, default=Path("samples/generated"))
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    for index in range(args.count):
        make_sample(rng, index, args.out)
    print(f"Wrote {args.count} images + XML files to {args.out}")


if __name__ == "__main__":
    main()
