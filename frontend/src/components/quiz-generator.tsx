"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { api, ApiError, type Quiz } from "@/lib/api";
import { Button, cx, ErrorNote, KIND_LABEL, LEVEL_LABEL } from "./ui";

type Kind = keyof typeof KIND_LABEL;
const LEVELS = [...Object.entries(LEVEL_LABEL), ["mixed", "Trộn"]] as [string, string][];
const QUICK_COUNTS = [5, 10, 15, 20];

const segBtn = (on: boolean) =>
  cx(
    "press h-9 rounded-[5px] px-3 text-[13px] font-semibold",
    on ? "bg-white text-ink shadow-[0_1px_2px_rgba(18,26,44,0.12)]" : "text-ink-3 hover:text-ink",
  );

export type QuizOptions = { count: number; difficulty: string; kinds: Kind[] };
export const DEFAULT_QUIZ_OPTIONS: QuizOptions = { count: 10, difficulty: "medium", kinds: ["theory"] };

/** Size, difficulty and kinds of questions. Shared by the upload panel and the quiz tab's generator. */
export function QuizOptionsFields({ value: v, onChange }: { value: QuizOptions; onChange: (o: QuizOptions) => void }) {
  const set = (patch: Partial<QuizOptions>) => onChange({ ...v, ...patch });
  const toggleKind = (k: Kind) =>
    set({ kinds: v.kinds.includes(k) ? (v.kinds.length > 1 ? v.kinds.filter((x) => x !== k) : v.kinds) : [...v.kinds, k] });
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">Số câu hỏi</legend>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-md bg-panel p-1">
            {QUICK_COUNTS.map((n) => (
              <button type="button" key={n} aria-pressed={v.count === n} onClick={() => set({ count: n })} className={segBtn(v.count === n)}>
                {n}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] text-ink-3">
            hoặc
            <input
              type="number"
              min={1}
              max={30}
              value={v.count}
              onChange={(e) => set({ count: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })}
              className="h-9 w-16 rounded-md border border-rule bg-white px-2 text-center text-sm font-semibold text-ink tabular-nums focus:border-ink focus:outline-none"
              aria-label="Số câu hỏi tuỳ chọn"
            />
            câu (tối đa 30)
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">Độ khó</legend>
        <div className="inline-flex flex-wrap gap-1 rounded-md bg-panel p-1" role="radiogroup">
          {LEVELS.map(([lv, label]) => (
            <button
              type="button"
              key={lv}
              role="radio"
              aria-checked={v.difficulty === lv}
              onClick={() => set({ difficulty: lv })}
              className={segBtn(v.difficulty === lv)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[13px] text-ink-3">
          {
            {
              easy: "Nhớ lại định nghĩa, sự kiện nêu trực tiếp trong bài.",
              medium: "Hiểu và so sánh khái niệm, áp dụng vào ví dụ quen thuộc.",
              hard: "Suy luận nhiều bước, tình huống mới, các trường hợp dễ nhầm.",
              mixed: "Trộn đều ba mức; mỗi câu ghi rõ độ khó.",
            }[v.difficulty]
          }
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">Kiểu câu hỏi (chọn một hoặc nhiều)</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => {
            const on = v.kinds.includes(k);
            return (
              <button
                type="button"
                key={k}
                role="checkbox"
                aria-checked={on}
                onClick={() => toggleKind(k)}
                className={cx(
                  "press h-9 rounded-md border px-3 text-[13px] font-semibold",
                  on ? "border-ink bg-ink text-white" : "border-rule bg-white text-ink-2 hover:border-ink-3",
                )}
              >
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
        {v.kinds.includes("calculation") && (
          <p className="mt-1.5 text-[13px] text-ink-3">Nếu bài giảng không có nội dung để tính, AI sẽ thay bằng câu lý thuyết.</p>
        )}
      </fieldset>
    </>
  );
}

/** Teacher picks size, difficulty and kinds; the backend asks the LLM for exactly that. */
export function QuizGenerator({
  lectureId,
  existing,
  onDone,
  onCancel,
}: {
  lectureId: string;
  existing: number;
  onDone: (quiz: Quiz[]) => void;
  onCancel?: () => void;
}) {
  const [opts, setOpts] = useState<QuizOptions>(DEFAULT_QUIZ_OPTIONS);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(
        await api<Quiz[]>(`/lectures/${lectureId}/quiz/generate`, {
          method: "POST",
          json: { ...opts, replace },
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tạo được câu hỏi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rise mb-6 space-y-5 rounded-lg border border-rule bg-white p-5 sm:p-6">
      <QuizOptionsFields value={opts} onChange={setOpts} />

      {existing > 0 && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">Với {existing} câu hiện có</legend>
          <div className="inline-flex gap-1 rounded-md bg-panel p-1" role="radiogroup">
            <button type="button" role="radio" aria-checked={!replace} onClick={() => setReplace(false)} className={segBtn(!replace)}>
              Thêm vào
            </button>
            <button type="button" role="radio" aria-checked={replace} onClick={() => setReplace(true)} className={segBtn(replace)}>
              Thay thế toàn bộ
            </button>
          </div>
        </fieldset>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-rule pt-4">
        {busy && <p className="mr-auto text-[13px] text-ink-3">AI đang soạn và tự kiểm tra đáp án, thường mất 30–90 giây…</p>}
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Huỷ
          </Button>
        )}
        <Button type="submit" variant="ink" loading={busy}>
          {!busy && <Sparkles className="size-4" />} Tạo {opts.count} câu hỏi
        </Button>
      </div>
    </form>
  );
}
