"use client";

import { ArrowLeft, ChevronDown, Download, FileText, PlayCircle } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { EmptyArt } from "@/components/art";
import { buttonCls, cx, MockBadge, QuizTags, Empty, ErrorNote, Markdown, Skeleton, Tabs } from "@/components/ui";
import { api, authedUrl, type Card, fmtAt, type Lecture, type Quiz, youtubeId } from "@/lib/api";
import { useApi } from "@/lib/hooks";

type Tab = "summary" | "cards" | "quiz";

export default function StudentLecture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const lec = useApi<Lecture>(`/lectures/${id}`);
  const summary = useApi<{ content: string }>(`/lectures/${id}/summary`);
  const cards = useApi<Card[]>(`/lectures/${id}/flashcards`);
  const quiz = useApi<Quiz[]>(`/lectures/${id}/quiz`);
  const [tab, setTab] = useState<Tab>("summary");
  const [seek, setSeek] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (t) setSeek(Number(t));
  }, []);
  useEffect(() => {
    if (seek !== null && video.current) {
      video.current.currentTime = seek;
      video.current.play().catch(() => {});
    }
  }, [seek]);

  const l = lec.data;
  const isDoc = l?.source_type === "document";
  const jump = (s: number) => {
    if (isDoc) {
      window.open(`${authedUrl(`/lectures/${id}/media`)}#page=${Math.round(s)}`, "_blank", "noopener");
      return;
    }
    setSeek(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (lec.error) return <ErrorNote>{lec.error}</ErrorNote>;
  const yt = youtubeId(l?.source_url ?? null);

  return (
    <div>
      <Link href="/student" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Trang chủ
      </Link>
      <header className="sheet-rule mt-3 flex flex-wrap items-end justify-between gap-3 pb-4">
        {l ? (
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance sm:text-[28px]">{l.title}</h1>
            {l.mock && (
              <div className="mt-2">
                <MockBadge long />
              </div>
            )}
          </div>
        ) : (
          <Skeleton className="h-8 w-72" />
        )}
        <div className="flex gap-2">
          <a href={authedUrl(`/lectures/${id}/export.apkg`)} className={buttonCls("ghost", "sm")} download>
            <Download className="size-4" /> Anki (.apkg)
          </a>
          <a href={authedUrl(`/lectures/${id}/export.csv`)} className={buttonCls("ghost", "sm")} download>
            CSV
          </a>
        </div>
      </header>

      {isDoc ? (
        <a
          href={authedUrl(`/lectures/${id}/media`)}
          target="_blank"
          rel="noopener"
          className="group mt-6 flex items-center gap-4 rounded-lg border border-rule bg-white p-5 transition-colors hover:border-ink-3"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-md bg-red-soft text-red">
            <FileText className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink group-hover:underline">Mở tài liệu gốc</span>
            <span className="block text-[13px] text-ink-3">Mỗi thẻ ghi số trang; bấm vào số trang để mở đúng chỗ đó.</span>
          </span>
        </a>
      ) : (
      <div className="mt-6 overflow-hidden rounded-lg bg-ink">
        {l?.source_type === "youtube" && yt ? (
          <iframe
            key={seek ?? "start"}
            className="aspect-video w-full"
            src={`https://www.youtube-nocookie.com/embed/${yt}?start=${Math.floor(seek ?? 0)}${seek !== null ? "&autoplay=1" : ""}`}
            title={l.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : l?.source_type === "file" ? (
          <video ref={video} className="aspect-video w-full" controls preload="metadata" src={authedUrl(`/lectures/${id}/media`)} />
        ) : (
          <div className="aspect-video" />
        )}
      </div>
      )}

      <div className="mt-8">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "summary", label: "Tóm tắt" },
            { value: "cards", label: "Flashcard", count: cards.data?.length },
            { value: "quiz", label: "Trắc nghiệm", count: quiz.data?.length },
          ]}
        />
      </div>
      <div className="mt-6">
        {tab === "summary" && (summary.data ? <Markdown text={summary.data.content} /> : <Skeleton className="h-40" />)}
        {tab === "cards" &&
          (cards.data ? (
            <ul className="max-w-3xl divide-y divide-rule border-y border-rule">
              {cards.data.map((c) => <CardRow key={c.id} card={c} sourceType={l?.source_type} onJump={jump} />)}
            </ul>
          ) : (
            <Skeleton className="h-40" />
          ))}
        {tab === "quiz" && (quiz.data ? <QuizRun quiz={quiz.data} sourceType={l?.source_type} onJump={jump} /> : <Skeleton className="h-40" />)}
      </div>
    </div>
  );
}

/** A ruled row like the teacher's list: source on the left, question, answer revealed in place. */
function CardRow({ card, sourceType, onJump }: { card: Card; sourceType?: string; onJump: (s: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="grid grid-cols-[4.5rem_1fr] gap-x-4 py-4">
      <button
        onClick={() => onJump(card.source_start)}
        className="inline-flex items-start gap-1.5 self-start pt-0.5 text-[13px] font-semibold text-red tabular-nums hover:underline"
        aria-label={`Mở nguồn tại ${fmtAt(sourceType, card.source_start)}`}
      >
        {sourceType === "document" ? <FileText className="mt-px size-3.5 shrink-0" /> : <PlayCircle className="mt-px size-3.5 shrink-0" />}
        {fmtAt(sourceType, card.source_start)}
      </button>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="group text-left">
        <span className="flex items-start justify-between gap-3">
          <span className="font-semibold text-ink">{card.front}</span>
          <ChevronDown
            className={cx("mt-1 size-4 shrink-0 text-ink-3 transition-transform duration-200 group-hover:text-ink", open && "rotate-180")}
            aria-hidden
          />
        </span>
        {open ? (
          <span className="rise mt-2 block border-t border-rule pt-2 leading-relaxed text-ink-2">{card.back}</span>
        ) : (
          <span className="mt-1 block text-[13px] text-ink-3">Chạm để xem đáp án</span>
        )}
      </button>
    </li>
  );
}

type Result = { correct: boolean; answer_index: number; explanation: string };

function QuizRun({ quiz, sourceType, onJump }: { quiz: Quiz[]; sourceType?: string; onJump: (s: number) => void }) {
  const [results, setResults] = useState<Record<number, Result & { choice: number }>>({});
  if (!quiz.length) return <Empty title="Chưa có câu hỏi" art={<EmptyArt kind="quiz" />}>Bài giảng này chưa có câu trắc nghiệm.</Empty>;
  const done = Object.values(results);
  const score = done.filter((r) => r.correct).length;

  return (
    <div className="max-w-2xl">
      {done.length > 0 && (
        <p className="mb-4 text-sm text-ink-2">
          Đúng <b className="font-num text-xl text-ink tabular-nums">{score}</b>/{quiz.length} câu
        </p>
      )}
      <ol className="space-y-6">
        {quiz.map((q, n) => {
          const r = results[q.id];
          return (
            <li key={q.id} className="border-b border-rule pb-6">
              <p className="font-semibold text-ink">
                <span className="mr-2 text-ink-3 tabular-nums">{n + 1}.</span>
                {q.question}
                <span className="mt-2 block">
                  <QuizTags kind={q.kind} difficulty={q.difficulty} />
                </span>
              </p>
              <div className="mt-3 grid gap-2">
                {q.options.map((o, i) => (
                  <button
                    key={i}
                    disabled={!!r}
                    onClick={async () => {
                      const res = await api<Result>(`/quiz/${q.id}/answer`, { method: "POST", json: { choice: i } });
                      setResults((x) => ({ ...x, [q.id]: { ...res, choice: i } }));
                    }}
                    className={cx(
                      "press rounded-md border px-4 py-3 text-left text-[15px] transition-colors",
                      !r && "border-rule bg-white hover:border-ink",
                      r && i === r.answer_index && "border-green bg-green-soft font-semibold text-green",
                      r && i === r.choice && !r.correct && "border-red bg-red-soft text-red-deep line-through decoration-red/60",
                      r && i !== r.answer_index && i !== r.choice && "border-rule bg-white text-ink-3",
                    )}
                  >
                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + i)}.</span>
                    {o}
                  </button>
                ))}
              </div>
              {r && (
                <div className="rise mt-3 text-sm leading-relaxed text-ink-2">
                  <b className={r.correct ? "text-green" : "text-red"}>{r.correct ? "Chính xác. " : "Chưa đúng. "}</b>
                  {r.explanation}{" "}
                  <button onClick={() => onJump(q.source_start)} className="font-semibold whitespace-nowrap text-ink underline decoration-red underline-offset-4">
                    Xem {sourceType === "document" ? "" : "đoạn "}{fmtAt(sourceType, q.source_start)}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
