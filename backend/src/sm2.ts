/** SuperMemo-2. quality: 0 (blackout) .. 5 (perfect). Returns the state after one review. */
export function sm2(quality: number, ease = 2.5, interval = 0, repetitions = 0) {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) throw new RangeError("quality must be 0..5");
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(interval * ease);
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return { ease, interval, repetitions };
}
