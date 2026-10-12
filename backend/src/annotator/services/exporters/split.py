"""Reproducible train/val/test partitioning.

* Target counts use the largest-remainder method, so 50 images at 70/20/10
  give exactly 35/10/5.
* Exact duplicates (same SHA-256) form one indivisible group, so copies of an
  image never land in different partitions.
* Groups are ordered deterministically before a seeded shuffle, so the same
  images + ratios + seed always produce the same split, independent of
  upload order.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from dataclasses import dataclass

from annotator.utils.images import hamming_distance

SPLIT_ORDER: tuple[str, ...] = ("train", "val", "test")


@dataclass(frozen=True)
class SplitCandidate:
    image_id: str
    filename: str
    sha256: str
    dhash: str


@dataclass(frozen=True)
class SplitOutcome:
    assignments: dict[str, str]
    counts: dict[str, int]
    warnings: list[str]


def target_counts(total: int, ratios: dict[str, float]) -> dict[str, int]:
    # Rounding removes float noise (45 * 0.7 = 31.499999...) so true ties are
    # resolved by the documented order train > val > test.
    raw = {name: round(total * ratios[name], 9) for name in SPLIT_ORDER}
    counts = {name: math.floor(raw[name]) for name in SPLIT_ORDER}
    remaining = total - sum(counts.values())
    by_remainder = sorted(
        SPLIT_ORDER, key=lambda name: (-(raw[name] - counts[name]), SPLIT_ORDER.index(name))
    )
    for name in by_remainder[:remaining]:
        counts[name] += 1
    return counts


def find_near_duplicates(
    candidates: list[SplitCandidate], threshold: int
) -> list[tuple[SplitCandidate, SplitCandidate, int]]:
    """Pairs of distinct images whose perceptual hashes are within `threshold` bits.

    O(n²), which is fine for the dataset sizes this local tool targets.
    """
    pairs = []
    for i, first in enumerate(candidates):
        for second in candidates[i + 1 :]:
            if first.sha256 == second.sha256:
                continue
            distance = hamming_distance(first.dhash, second.dhash)
            if distance <= threshold:
                pairs.append((first, second, distance))
    return pairs


def split_dataset(
    candidates: list[SplitCandidate], ratios: dict[str, float], seed: int
) -> SplitOutcome:
    groups: dict[str, list[SplitCandidate]] = defaultdict(list)
    for candidate in candidates:
        groups[candidate.sha256].append(candidate)

    ordered_groups = [
        sorted(members, key=lambda c: c.image_id) for _, members in sorted(groups.items())
    ]
    random.Random(seed).shuffle(ordered_groups)  # noqa: S311 - reproducibility, not crypto

    targets = target_counts(len(candidates), ratios)
    counts = dict.fromkeys(SPLIT_ORDER, 0)
    assignments: dict[str, str] = {}
    warnings: list[str] = []

    # Largest groups first keeps the final counts as close as possible to the targets.
    ordered_groups.sort(key=len, reverse=True)
    for members in ordered_groups:
        split = max(
            SPLIT_ORDER, key=lambda name: (targets[name] - counts[name], -SPLIT_ORDER.index(name))
        )
        for member in members:
            assignments[member.image_id] = split
        counts[split] += len(members)
        if len(members) > 1:
            names = ", ".join(m.filename for m in members)
            warnings.append(f"Exact duplicates kept together in '{split}': {names}")

    if counts != targets:
        warnings.append(
            "Split counts differ from the targets because duplicate groups cannot be divided: "
            f"targets={targets}, actual={counts}"
        )
    return SplitOutcome(assignments=assignments, counts=counts, warnings=warnings)
