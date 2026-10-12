import type { SplitCounts, SplitName, SplitRatios } from '../types/export'

const ORDER: SplitName[] = ['train', 'val', 'test']
const round9 = (value: number) => Math.round(value * 1e9) / 1e9

/** Largest-remainder split counts; mirrors the backend so previews match exports. */
export function targetCounts(total: number, ratios: SplitRatios): SplitCounts {
  // Rounding removes float noise so true ties resolve as train > val > test (same as the backend).
  const raw = { train: round9(total * ratios.train), val: round9(total * ratios.val), test: round9(total * ratios.test) }
  const counts: SplitCounts = { train: Math.floor(raw.train), val: Math.floor(raw.val), test: Math.floor(raw.test) }
  const remaining = total - counts.train - counts.val - counts.test
  const byRemainder = [...ORDER].sort(
    (a, b) => raw[b] - counts[b] - (raw[a] - counts[a]) || ORDER.indexOf(a) - ORDER.indexOf(b),
  )
  byRemainder.slice(0, remaining).forEach((name) => {
    counts[name] += 1
  })
  return counts
}

export const ratiosSum = (ratios: SplitRatios): number => ratios.train + ratios.val + ratios.test
