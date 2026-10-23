"""SuperMemo-2. quality: 0 (blackout) .. 5 (perfect)."""


def sm2(quality: int, ease: float = 2.5, interval: int = 0, repetitions: int = 0) -> tuple[float, int, int]:
    """Return (ease, interval_days, repetitions) after a review."""
    if not 0 <= quality <= 5:
        raise ValueError("quality must be 0..5")
    if quality < 3:
        repetitions, interval = 0, 1
    else:
        repetitions += 1
        interval = 1 if repetitions == 1 else 6 if repetitions == 2 else round(interval * ease)
    ease = max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    return ease, interval, repetitions
