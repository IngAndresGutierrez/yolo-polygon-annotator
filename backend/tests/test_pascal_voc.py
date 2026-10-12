from __future__ import annotations

import pytest

from annotator.core.errors import InvalidInputError
from annotator.services.importers.pascal_voc import VocBox, box_to_quad, clamp_box, parse_voc
from annotator.services.validators.geometry import is_canonical_order
from tests.factories import make_voc_xml


def test_parses_filename_size_and_objects():
    doc = parse_voc(make_voc_xml("Cars2.png", [(229, 176, 270, 193), (10, 20, 60, 40)]))
    assert doc.filename == "Cars2.png"
    assert (doc.width, doc.height) == (400, 400)
    assert [o.name for o in doc.objects] == ["licence", "licence"]
    assert doc.objects[0].box == VocBox(229, 176, 270, 193)


def test_box_to_quad_matches_rectangle_corners_in_canonical_order():
    quad = box_to_quad(VocBox(229, 176, 270, 193))
    assert quad == [(229, 176), (270, 176), (270, 193), (229, 193)]
    assert is_canonical_order(quad)


def test_filename_path_components_are_stripped():
    xml = make_voc_xml("C:\\data\\images\\Cars2.png", [(1, 1, 20, 20)])
    assert parse_voc(xml).filename == "Cars2.png"
    xml = make_voc_xml("../../etc/Cars3.png", [(1, 1, 20, 20)])
    assert parse_voc(xml).filename == "Cars3.png"


def test_invalid_boxes_are_skipped_with_warning():
    xml = make_voc_xml("a.png", [(50, 50, 40, 60), (1, 1, 20, 20)])
    doc = parse_voc(xml)
    assert len(doc.objects) == 1
    assert "inverted" in doc.warnings[0]


def test_incomplete_box_is_skipped():
    xml = b"""<annotation><filename>a.png</filename>
      <object><name>licence</name><bndbox><xmin>1</xmin><ymin>2</ymin></bndbox></object>
    </annotation>"""
    doc = parse_voc(xml)
    assert doc.objects == []
    assert doc.warnings


def test_clamp_box_to_image():
    assert clamp_box(VocBox(-5, -5, 450, 120), 400, 100) == VocBox(0, 0, 400, 100)


def test_rejects_non_voc_root():
    with pytest.raises(InvalidInputError, match="root element"):
        parse_voc(b"<svg></svg>")


def test_rejects_malformed_xml():
    with pytest.raises(InvalidInputError, match="Malformed"):
        parse_voc(b"<annotation><filename>")


def test_rejects_external_entities():
    xxe = b"""<?xml version="1.0"?>
<!DOCTYPE annotation [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<annotation><filename>&xxe;</filename></annotation>"""
    with pytest.raises(InvalidInputError, match="forbidden"):
        parse_voc(xxe)


def test_rejects_entity_expansion_bomb():
    bomb = b"""<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>
<annotation><filename>&lol2;</filename></annotation>"""
    with pytest.raises(InvalidInputError, match="forbidden"):
        parse_voc(bomb)
