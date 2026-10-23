"""YouTube captions as a transcript source: real words + timestamps in seconds, no GPU.

Preference: human Vietnamese subs, Vietnamese auto captions in the original language,
human English subs, English auto captions, and only then YouTube's machine-translated
tracks, which are heavily rate-limited (HTTP 429) and get skipped when blocked.
"""

import json

from .transcribe import Segment

# (language key, which pool) in preference order
ORDER = [
    ("vi", "subtitles"),
    ("vi-orig", "automatic_captions"),
    ("en", "subtitles"),
    ("en-orig", "automatic_captions"),
    ("vi", "automatic_captions"),  # translated
    ("en", "automatic_captions"),  # translated
]


def _merge(events: list[dict], window: float = 20.0) -> list[Segment]:
    """json3 caption events are 2–5s fragments; merge into ~20s segments so cards cite a useful moment."""
    out: list[Segment] = []
    for e in events:
        text = "".join(s.get("utf8", "") for s in e.get("segs", [])).replace("\n", " ").strip()
        if not text:
            continue
        start = e["tStartMs"] / 1000
        end = start + e.get("dDurationMs", 0) / 1000
        if out and start - out[-1].start < window:
            out[-1] = Segment(out[-1].start, end, f"{out[-1].text} {text}")
        else:
            out.append(Segment(start, end, text))
    return out


def fetch_youtube_captions(url: str) -> tuple[list[Segment], str] | None:
    """Return (segments, "lang-kind") or None when the video has no usable captions."""
    import yt_dlp  # noqa: PLC0415
    from yt_dlp.networking.exceptions import HTTPError  # noqa: PLC0415

    with yt_dlp.YoutubeDL({"skip_download": True, "quiet": True, "no_warnings": True}) as ydl:
        info = ydl.extract_info(url, download=False)
        for lang, pool in ORDER:
            fmt = next((f for f in (info.get(pool) or {}).get(lang, []) if f.get("ext") == "json3"), None)
            if not fmt:
                continue
            try:
                raw = ydl.urlopen(fmt["url"]).read()
            except HTTPError:  # 429 is common on translated tracks; fall through to the next one
                continue
            segs = _merge(json.loads(raw.decode("utf-8")).get("events", []))
            if segs:
                return segs, f"{lang[:2]}-{'manual' if pool == 'subtitles' else 'auto'}"
    return None
