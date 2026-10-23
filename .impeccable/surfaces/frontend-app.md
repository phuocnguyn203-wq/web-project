---
version: 1
slug: "frontend-app"
primary_target: "frontend/app"
related_targets: []
---

Scope: whole LectureCards web app (teacher + student). Mode: Operate. Students mostly on phone, teachers on laptop.

## Direction contract
THESIS: Daily review is a ritual, like tearing one page off a Vietnamese lịch blốc each morning. Refuses the grey SaaS dashboard of stat cards and progress rings.
OWN-WORLD: Crisp white paper ground (not cream), blue-black ink, lịch red for "due / today / wrong", a small secondary line in muted ink like the lunar date. Be Vietnam Pro for all UI; Barlow Condensed bold only for big calendar numerals. Double hairline rule under headers like a calendar sheet head. Perforated top edge on the review sheet only. Rank by weight/case, tight 1.2 scale (raise from timetable challenger: rank carried by weight and case, not size).
STORY: Student opens the app, sees one number, today's due cards, taps, flips, rates, tears. Teacher sees lectures moving through the pipeline, reviews generated cards with red-pen edits, and sees which questions the class fails.
FIRST VIEWPORT: Student home: left, a tear sheet with huge red numeral = cards due, weekday + date line, "Bắt đầu ôn" primary button; right, list of classes with lectures. Teacher home: left rail of classes, main table of lectures with status pipeline steps and progress, upload action top-right.
FORM: Lịch blốc, candidate 7 of 7 grounded, seed afd1060f. Signature interaction: rating a card tears the sheet off (translate+rotate with perforated edge), revealing the next.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
