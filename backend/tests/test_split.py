from __future__ import annotations

from collections import Counter

import pytest

from annotator.services.exporters.split import (
    SplitCandidate,
    find_near_duplicates,
    split_dataset,
    target_counts,
)

DEFAULT_RATIOS = {"train": 0.7, "val": 0.2, "test": 0.1}


def candidates(count: int) -> list[SplitCandidate]:
    return [
        SplitCandidate(f"img-{i:03d}", f"img-{i:03d}.png", f"{i:064x}", f"{i * 7919:016x}")
        for i in range(count)
    ]


def test_fifty_images_split_35_10_5():
    assert target_counts(50, DEFAULT_RATIOS) == {"train": 35, "val": 10, "test": 5}
    outcome = split_dataset(candidates(50), DEFAULT_RATIOS, seed=42)
    assert outcome.counts == {"train": 35, "val": 10, "test": 5}
    assert Counter(outcome.assignments.values()) == {"train": 35, "val": 10, "test": 5}


def test_remainder_ties_prefer_train_then_val():
    # 45 * 0.7 = 31.5 and 45 * 0.1 = 4.5: the tie goes to train despite float noise
    assert target_counts(45, DEFAULT_RATIOS) == {"train": 32, "val": 9, "test": 4}


@pytest.mark.parametrize("total", [1, 2, 3, 7, 10, 33, 99, 101])
def test_target_counts_always_sum_to_total(total):
    assert sum(target_counts(total, DEFAULT_RATIOS).values()) == total


def test_split_is_reproducible_with_same_seed():
    first = split_dataset(candidates(40), DEFAULT_RATIOS, seed=7)
    second = split_dataset(candidates(40), DEFAULT_RATIOS, seed=7)
    assert first.assignments == second.assignments


def test_split_is_independent_of_input_order():
    items = candidates(40)
    forward = split_dataset(items, DEFAULT_RATIOS, seed=7)
    backward = split_dataset(list(reversed(items)), DEFAULT_RATIOS, seed=7)
    assert forward.assignments == backward.assignments


def test_different_seeds_give_different_splits():
    first = split_dataset(candidates(40), DEFAULT_RATIOS, seed=1)
    second = split_dataset(candidates(40), DEFAULT_RATIOS, seed=2)
    assert first.assignments != second.assignments


def test_exact_duplicates_never_cross_partitions():
    items = candidates(30)
    duplicate_hash = items[0].sha256
    items += [
        SplitCandidate("copy-a", "copy-a.png", duplicate_hash, items[0].dhash),
        SplitCandidate("copy-b", "copy-b.png", duplicate_hash, items[0].dhash),
    ]
    for seed in range(20):
        outcome = split_dataset(items, DEFAULT_RATIOS, seed=seed)
        group = {outcome.assignments[i] for i in ("img-000", "copy-a", "copy-b")}
        assert len(group) == 1
        assert sum(outcome.counts.values()) == 32


def test_find_near_duplicates_by_hamming_distance():
    a = SplitCandidate("a", "a.png", "1" * 64, "ffffffffffffffff")
    b = SplitCandidate("b", "b.png", "2" * 64, "fffffffffffffffe")  # 1 bit apart
    c = SplitCandidate("c", "c.png", "3" * 64, "0000000000000000")
    pairs = find_near_duplicates([a, b, c], threshold=4)
    assert [(x.image_id, y.image_id, d) for x, y, d in pairs] == [("a", "b", 1)]
