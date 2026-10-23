"""Transcript cleanup + chunking. Owner: Person 2 (LLM)."""

import re

FILLERS = ["ờ", "à", "ừm", "ừ", "ơ", "thì là", "kiểu như"]
_FILLER_RE = re.compile(r"(?<!\w)(" + "|".join(map(re.escape, FILLERS)) + r")(?!\w)", re.I)


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", _FILLER_RE.sub("", text)).strip()


def chunk_segments(segments, max_chars: int = 2000) -> list[list]:
    """Group consecutive segments into chunks under max_chars.
    ponytail: size-based split; swap for embedding-based topic segmentation if summaries drift."""
    chunks, cur, size = [], [], 0
    for s in segments:
        if cur and size + len(s.text) > max_chars:
            chunks.append(cur)
            cur, size = [], 0
        cur.append(s)
        size += len(s.text)
    if cur:
        chunks.append(cur)
    return chunks
