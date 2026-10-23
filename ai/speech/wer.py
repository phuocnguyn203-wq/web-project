"""Word Error Rate for comparing PhoWhisper vs Whisper on the hand-labelled test set."""

import unicodedata


def _words(s: str) -> list[str]:
    return unicodedata.normalize("NFC", s).lower().split()


def wer(reference: str, hypothesis: str) -> float:
    ref, hyp = _words(reference), _words(hypothesis)
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1] / max(len(ref), 1)
