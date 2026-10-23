"use client";

import { ArrowLeft, Pencil, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ProcessingArt, EmptyArt } from "@/components/art";
import { useClasses } from "@/components/classes";
import { QuizGenerator } from "@/components/quiz-generator";
import {
  Button,
  cx,
  EditedMark,
  inputCls,
  KIND_LABEL,
  LEVEL_LABEL,
  MockBadge,
  QuizTags,
  Empty,
  ErrorNote,
  Field,
  Input,
  Markdown,
  Pipeline,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ui";
import {
  api,
  ApiError,
  type Card,
  fmtAt,
  type Lecture,
  type Quiz,
  type Segment,
} from "@/lib/api";
import { useApi } from "@/lib/hooks";

type Tab = "summary" | "cards" | "quiz" | "transcript";

export default function TeacherLecture({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const lec = useApi<Lecture>(`/lectures/${id}`);
  const ready = lec.data?.status === "ready";
  const summary = useApi<{ content: string }>(
    ready ? `/lectures/${id}/summary` : null,
  );
  const cards = useApi<Card[]>(ready ? `/lectures/${id}/flashcards` : null);
  const quiz = useApi<Quiz[]>(ready ? `/lectures/${id}/quiz` : null);
  const transcript = useApi<Segment[]>(
    ready ? `/lectures/${id}/transcript` : null,
  );
  const [tab, setTab] = useState<Tab>("cards");
  const [busy, setBusy] = useState(false);

  const pending = lec.data && !ready && lec.data.status !== "failed";
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(lec.reload, 2000);
    return () => clearInterval(t);
  }, [pending, lec.reload]);

  const l = lec.data;
  const { setActiveClass } = useClasses();
  useEffect(() => {
    setActiveClass(l?.class_id);
    return () => setActiveClass(undefined);
  }, [l?.class_id, setActiveClass]);
  if (lec.error) return <ErrorNote>{lec.error}</ErrorNote>;

  return (
    <div className="mx-auto max-w-5xl">
      {l && (
        <Link
          href={`/teacher/classes/${l.class_id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Về lớp
        </Link>
      )}
      <header className="sheet-rule mt-3 flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="min-w-0">
          {l ? (
            <h1 className="text-[28px] leading-tight font-bold tracking-tight text-balance">
              {l.title}
            </h1>
          ) : (
            <Skeleton className="h-8 w-80" />
          )}
          {l && (
            <p className="mt-1.5 text-sm text-ink-2">
              {l.published ? (
                <span className="font-semibold text-green">
                  Đã giao cho lớp
                </span>
              ) : (
                "Bản nháp — sinh viên chưa thấy bài này"
              )}
              {l.mock && (
                <span className="ml-3 align-middle">
                  <MockBadge long />
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {l && (
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Xoá bài giảng này cùng toàn bộ thẻ và câu hỏi?"))
                  return;
                await api(`/lectures/${id}`, { method: "DELETE" });
                router.push(`/teacher/classes/${l.class_id}`);
              }}
            >
              <Trash2 className="size-4" /> Xoá
            </Button>
          )}
          {ready && !l?.published && (
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                lec.setData(
                  await api<Lecture>(`/lectures/${id}/publish`, {
                    method: "POST",
                  }),
                );
                setBusy(false);
              }}
            >
              <Send className="size-4" /> Giao cho lớp
            </Button>
          )}
        </div>
      </header>

      {l && !ready && (
        <div className="mt-8 rounded-lg border border-rule bg-white p-6">
          {l.status === "failed" ? (
            <ErrorNote>Xử lý thất bại: {l.error}</ErrorNote>
          ) : (
            <>
              <div className="mb-6">
                <ProcessingArt status={l.status} />
              </div>
              <Pipeline status={l.status} progress={l.progress} />
              <p className="mt-4 text-sm text-ink-2">
                Bài giảng dài có thể mất vài phút. Bạn có thể rời trang, tiến độ
                vẫn được lưu.
              </p>
            </>
          )}
        </div>
      )}

      {ready && (
        <>
          <div className="mt-6">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                {
                  value: "cards",
                  label: "Flashcard",
                  count: cards.data?.length,
                },
                {
                  value: "quiz",
                  label: "Trắc nghiệm",
                  count: quiz.data?.length,
                },
                { value: "summary", label: "Tóm tắt" },
                { value: "transcript", label: "Bản ghi lời giảng" },
              ]}
            />
          </div>
          <div className="mt-6">
            {tab === "summary" &&
              (summary.data ? (
                <Markdown text={summary.data.content} />
              ) : (
                <Skeleton className="h-40" />
              ))}
            {tab === "cards" && (
              <CardsEditor
                lectureId={id}
                sourceType={l?.source_type}
                published={!!l?.published}
                cards={cards.data}
                setCards={cards.setData}
              />
            )}
            {tab === "quiz" && (
              <QuizEditor
                lectureId={id}
                quiz={quiz.data}
                setQuiz={quiz.setData}
              />
            )}
            {tab === "transcript" && (
              <ol className="max-w-[72ch] space-y-3">
                {transcript.data?.map((s) => (
                  <li
                    key={s.idx}
                    className="grid grid-cols-[4rem_1fr] gap-3 text-[15px] leading-relaxed"
                  >
                    <span className="pt-0.5 text-[13px] font-semibold text-red tabular-nums">
                      {fmtAt(l?.source_type, s.start)}
                    </span>
                    <span className="text-ink-2">{s.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CardsEditor({
  lectureId,
  sourceType,
  published,
  cards,
  setCards,
}: {
  lectureId: string;
  sourceType?: string;
  published: boolean;
  cards?: Card[];
  setCards: (c: Card[]) => void;
}) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  if (!cards) return <Skeleton className="h-60" />;

  async function save(
    body: Omit<Card, "id" | "lecture_id">,
    id: number | "new",
  ) {
    const saved = await api<Card>(
      id === "new" ? `/lectures/${lectureId}/flashcards` : `/flashcards/${id}`,
      {
        method: id === "new" ? "POST" : "PUT",
        json: body,
      },
    );
    setCards(
      id === "new"
        ? [...cards!, saved]
        : cards!.map((c) => (c.id === id ? saved : c)),
    );
    setEditing(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-2">
          {published ? (
            <>
              <b className="text-green">Đã giao cho lớp.</b> Thẻ bạn sửa sẽ cập
              nhật ngay cho sinh viên.
            </>
          ) : (
            <>
              Đọc lại từng thẻ. Sửa chỗ AI hiểu sai, xoá thẻ thừa, rồi bấm{" "}
              <b>Giao cho lớp</b>.
            </>
          )}
        </p>
        <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Thêm thẻ
        </Button>
      </div>
      {editing === "new" && (
        <CardForm
          onCancel={() => setEditing(null)}
          onSave={(b) => save(b, "new")}
        />
      )}
      {!cards.length && editing !== "new" && (
        <Empty title="Không còn thẻ nào" art={<EmptyArt kind="lectures" />}>
          Thêm thẻ thủ công hoặc tải lại bài giảng.
        </Empty>
      )}
      <ul className="divide-y divide-rule border-y border-rule">
        {cards.map((c) =>
          editing === c.id ? (
            <li key={c.id} className="py-3">
              <CardForm
                card={c}
                onCancel={() => setEditing(null)}
                onSave={(b) => save(b, c.id)}
              />
            </li>
          ) : (
            <li
              key={c.id}
              className="group grid grid-cols-[4rem_1fr_auto] gap-4 py-4"
            >
              <span className="pt-0.5 text-[13px] font-semibold text-red tabular-nums">
                {fmtAt(sourceType, c.source_start)}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {c.front}
                  {c.edited && <EditedMark />}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">
                  {c.back}
                </p>
              </div>
              <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <button
                  onClick={() => setEditing(c.id)}
                  className="press grid size-8 place-items-center rounded-md text-ink-3 hover:bg-panel hover:text-ink"
                  aria-label="Sửa thẻ"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={async () => {
                    await api(`/flashcards/${c.id}`, { method: "DELETE" });
                    setCards(cards.filter((x) => x.id !== c.id));
                  }}
                  className="press grid size-8 place-items-center rounded-md text-ink-3 hover:bg-red-soft hover:text-red"
                  aria-label="Xoá thẻ"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function CardForm({
  card,
  onSave,
  onCancel,
}: {
  card?: Card;
  onSave: (b: Omit<Card, "id" | "lecture_id">) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="rise mb-3 grid gap-3 rounded-lg border border-ink bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        try {
          await onSave({
            front: String(f.get("front")),
            back: String(f.get("back")),
            source_start: card?.source_start ?? 0,
          });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Không lưu được");
          setBusy(false);
        }
      }}
    >
      <Field label="Mặt trước (câu hỏi)">
        <Input name="front" defaultValue={card?.front} required autoFocus />
      </Field>
      <Field label="Mặt sau (đáp án)">
        <Textarea name="back" defaultValue={card?.back} required rows={3} />
      </Field>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit" size="sm" loading={busy}>
          Lưu thẻ
        </Button>
      </div>
    </form>
  );
}

function QuizEditor({
  lectureId,
  quiz,
  setQuiz,
}: {
  lectureId: string;
  quiz?: Quiz[];
  setQuiz: (q: Quiz[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  if (!quiz) return <Skeleton className="h-60" />;
  const generator = generating && (
    <QuizGenerator
      lectureId={lectureId}
      existing={quiz.length}
      onCancel={() => setGenerating(false)}
      onDone={(q) => {
        setQuiz(q);
        setGenerating(false);
      }}
    />
  );
  if (!quiz.length)
    return (
      generator || (
        <Empty
          title="Chưa có câu hỏi"
          art={<EmptyArt kind="quiz" />}
          action={
            <Button variant="ink" onClick={() => setGenerating(true)}>
              <Sparkles className="size-4" /> Tạo câu hỏi
            </Button>
          }
        >
          Chọn số câu, độ khó và kiểu câu hỏi (lý thuyết, tính toán, đúng/sai);
          AI sẽ soạn từ chính bài giảng.
        </Empty>
      )
    );
  return (
    <div>
      {generator || (
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-sm text-ink-2">
            {quiz.length} câu ·{" "}
            {Object.entries(
              quiz.reduce<Record<string, number>>(
                (acc, q) => ({ ...acc, [q.kind]: (acc[q.kind] ?? 0) + 1 }),
                {},
              ),
            )
              .map(
                ([k, n]) =>
                  `${n} ${KIND_LABEL[k as keyof typeof KIND_LABEL].toLowerCase()}`,
              )
              .join(", ")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setGenerating(true)}>
            <Sparkles className="size-4" /> Tạo câu hỏi
          </Button>
        </div>
      )}
      <ol className="space-y-4">
        {quiz.map((q, n) =>
          editing === q.id ? (
            <QuizForm
              key={q.id}
              q={q}
              onCancel={() => setEditing(null)}
              onSaved={(s) => {
                setQuiz(quiz.map((x) => (x.id === s.id ? s : x)));
                setEditing(null);
              }}
            />
          ) : (
            <li
              key={q.id}
              className="group rounded-lg border border-rule bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="font-semibold text-ink">
                  <span className="mr-2 text-ink-3 tabular-nums">{n + 1}.</span>
                  {q.question}
                  {q.edited && <EditedMark />}
                  <span className="mt-2 block">
                    <QuizTags kind={q.kind} difficulty={q.difficulty} />
                  </span>
                </p>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(q.id)}
                    className="press grid size-8 place-items-center rounded-md text-ink-3 hover:bg-panel hover:text-ink"
                    aria-label="Sửa câu hỏi"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={async () => {
                      await api(`/quiz/${q.id}`, { method: "DELETE" });
                      setQuiz(quiz.filter((x) => x.id !== q.id));
                    }}
                    className="press grid size-8 place-items-center rounded-md text-ink-3 hover:bg-red-soft hover:text-red"
                    aria-label="Xoá câu hỏi"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <li
                    key={i}
                    className={cx(
                      "rounded-md px-3 py-2 text-sm",
                      i === q.answer_index
                        ? "bg-green-soft font-semibold text-green"
                        : "bg-panel/70 text-ink-2",
                    )}
                  >
                    {String.fromCharCode(65 + i)}. {o}
                  </li>
                ))}
              </ul>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

function QuizForm({
  q,
  onSaved,
  onCancel,
}: {
  q: Quiz;
  onSaved: (q: Quiz) => void;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState(q.options);
  const [answer, setAnswer] = useState(q.answer_index ?? 0);
  const [kind, setKind] = useState(q.kind);
  const [difficulty, setDifficulty] = useState(q.difficulty);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="rise grid gap-3 rounded-lg border border-ink bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          onSaved(
            await api<Quiz>(`/quiz/${q.id}`, {
              method: "PUT",
              json: {
                question: f.get("question"),
                options,
                answer_index: answer,
                explanation: f.get("explanation"),
                source_start: q.source_start,
                kind,
                difficulty,
              },
            }),
          );
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Không lưu được");
        }
      }}
    >
      <Field label="Câu hỏi">
        <Textarea name="question" defaultValue={q.question} rows={2} required />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">
          Phương án — chọn đáp án đúng
        </legend>
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="answer"
              checked={answer === i}
              onChange={() => setAnswer(i)}
              className="size-4 accent-green"
              aria-label={`Đáp án ${String.fromCharCode(65 + i)}`}
            />
            <Input
              value={o}
              required
              onChange={(e) =>
                setOptions(
                  options.map((x, j) => (j === i ? e.target.value : x)),
                )
              }
            />
          </div>
        ))}
      </fieldset>
      <Field label="Giải thích">
        <Textarea name="explanation" defaultValue={q.explanation} rows={2} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kiểu câu hỏi">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Quiz["kind"])}
            className={inputCls}
          >
            {Object.entries(KIND_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Độ khó">
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as Quiz["difficulty"])
            }
            className={inputCls}
          >
            {Object.entries(LEVEL_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit" size="sm">
          Lưu câu hỏi
        </Button>
      </div>
    </form>
  );
}
