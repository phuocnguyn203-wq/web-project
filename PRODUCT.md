# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Next.js (App Router) + TypeScript + Tailwind frontend; FastAPI + PostgreSQL + RQ/Redis backend. Chosen by the team brief.

## Users
- **Giảng viên** (Vietnamese university lecturers): upload a lecture (audio/video, YouTube link, PDF), review/edit generated flashcards and quiz before assigning, read class statistics. Mostly on a laptop.
- **Sinh viên**: join a class by code, read the summary, review flashcards on a spaced-repetition schedule, take quizzes. Mostly on a phone, in short sessions.

## Product Purpose
Turn Vietnamese lectures into summaries, flashcards and quizzes, then make students actually retain them via SM-2 scheduling. Success: students review daily; teachers see which concepts the class is failing.

## Positioning
Unlike NotebookLM: tuned for Vietnamese speech (PhoWhisper), built around a teacher-managed class, real spaced repetition, every card linked to the exact second of the lecture video, self-hostable so data stays in-house.

## Capabilities and Constraints
- UI copy in Vietnamese; code in English.
- Lecture processing is a long background job; UI must show progress states (queued, transcribing, summarizing, generating, ready, failed).
- Lectures can be recordings, YouTube links, or PDF/PPTX (cards then cite a page, not a timestamp).
- Anki export as .apkg or CSV.
- Built by a 4-person student team in 8–10 weeks.

## Evidence on Hand
None. No real users, testimonials, or metrics; do not fabricate any.

## Product Principles
1. The teacher stays in control: nothing reaches students unreviewed.
2. Every card traces back to its source moment in the lecture.
3. Daily review must take seconds to start on a phone.
4. Honest about AI: show what is generated and let people fix it.

## Accessibility & Inclusion
WCAG AA basics: contrast, full keyboard use, visible focus, `prefers-reduced-motion`. Vietnamese diacritics must render cleanly in every font used.
