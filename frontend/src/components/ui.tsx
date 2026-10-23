"use client";

import { AlertCircle, Check, FlaskConical, Loader2, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import type { Status } from "@/lib/api";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ink" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function buttonCls(variant: BtnProps["variant"] = "ink", size: BtnProps["size"] = "md", extra?: string) {
  return cx(
    "press inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none",
    "disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-[15px]",
    variant === "primary" && "bg-red text-white hover:bg-red-deep",
    variant === "ink" && "bg-ink text-white hover:bg-navy-2",
    variant === "ghost" && "border border-rule bg-white text-ink hover:border-ink-3",
    variant === "danger" && "text-red hover:bg-red-soft",
    extra,
  );
}

export function Button({ variant, size, loading, className, children, disabled, ...p }: BtnProps) {
  return (
    <button {...p} disabled={disabled || loading} className={buttonCls(variant, size, className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] text-red">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-[13px] text-ink-3">{hint}</span>
      )}
    </label>
  );
}

export const inputCls =
  "w-full rounded-md border border-rule bg-white px-3 h-10 text-[15px] text-ink placeholder:text-ink-3 " +
  "transition-[border-color,box-shadow] duration-150 hover:border-ink-3 focus:border-ink focus:outline-none " +
  "focus:shadow-[0_0_0_3px_rgba(18,26,44,0.08)]";

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, p.className)} />;
}
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, "h-auto py-2 leading-relaxed", p.className)} />;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="flex gap-6 overflow-x-auto border-b border-rule">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            "-mb-px flex items-center gap-1.5 border-b-2 pt-1 pb-3 text-sm font-semibold whitespace-nowrap transition-colors",
            value === it.value ? "border-red text-ink" : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className="rounded bg-panel px-1.5 text-xs font-semibold text-ink-2 tabular-nums">{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

const STEPS: { key: Status; label: string }[] = [
  { key: "transcribing", label: "Nhận dạng giọng nói" },
  { key: "summarizing", label: "Tóm tắt" },
  { key: "generating", label: "Sinh thẻ & câu hỏi" },
  { key: "ready", label: "Sẵn sàng" },
];

/** Pipeline progress as four calendar-like ticks. */
export function Pipeline({ status, progress }: { status: Status; progress: number }) {
  if (status === "failed")
    return <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red"><AlertCircle className="size-3.5" aria-hidden /> Lỗi xử lý</span>;
  const at = status === "queued" ? -1 : STEPS.findIndex((s) => s.key === status);
  const current = STEPS[at]?.label ?? "Đang chờ";
  return (
    <div className="min-w-[180px]">
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((s, i) => (
          <span
            key={s.key}
            className={cx(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              i < at || status === "ready" ? "bg-ink" : i === at ? "animate-pulse bg-red" : "bg-rule",
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[13px] text-ink-2">
        {status === "ready" ? (
          <span className="inline-flex items-center gap-1 font-semibold text-green">
            <Check className="size-3.5" /> Sẵn sàng
          </span>
        ) : (
          <>
            {current} <span className="text-ink-3 tabular-nums">· {progress}%</span>
          </>
        )}
      </p>
    </div>
  );
}

export function Empty({
  title,
  children,
  action,
  art,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  art?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-rule px-6 py-10 text-center">
      {art}
      <p className="text-base font-semibold text-ink">{title}</p>
      <div className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">{children}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-panel", className)} />;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-[13px] font-medium text-red-deep">
      {children}
    </p>
  );
}

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export function useToday() {
  const [d, setD] = useState<Date | null>(null);
  useEffect(() => setD(new Date()), []);
  return d;
}

const LUNAR = new Intl.DateTimeFormat("vi-VN-u-ca-chinese", { day: "numeric", month: "numeric" });

/** The small lunar date a lịch blốc prints under the solar one, e.g. "Âm lịch 12/9". */
export function LunarLine({ date, className }: { date: Date | null; className?: string }) {
  if (!date) return <span className={cx("invisible", className)}>.</span>;
  const p = Object.fromEntries(LUNAR.formatToParts(date).map((x) => [x.type, x.value]));
  return <span className={cx("text-ink-3", className)}>Âm lịch {p.day}/{p.month}</span>;
}

/** Honest label for lectures processed by the mock engines: the content is placeholder, not this lecture. */
export function MockBadge({ long }: { long?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded bg-panel px-2 py-0.5 text-[12px] font-semibold text-ink-2"
      title="Bài này được xử lý ở chế độ mock: lời giảng, tóm tắt và thẻ là dữ liệu mẫu, không lấy từ bài giảng."
    >
      <FlaskConical className="size-3.5 text-ink-3" aria-hidden />
      {long ? "Dữ liệu mẫu, không lấy từ bài giảng này" : "Dữ liệu mẫu"}
    </span>
  );
}

export const KIND_LABEL = { theory: "Lý thuyết", calculation: "Tính toán", true_false: "Đúng / Sai" } as const;
export const LEVEL_LABEL = { easy: "Dễ", medium: "Trung bình", hard: "Khó" } as const;
const LEVEL_N = { easy: 1, medium: 2, hard: 3 } as const;

/** Kind chip + difficulty as 1–3 ink bars (red stays reserved for due/wrong). */
export function QuizTags({ kind, difficulty }: { kind?: string; difficulty?: string }) {
  const n = LEVEL_N[difficulty as keyof typeof LEVEL_N];
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12px] font-semibold text-ink-2">
      {kind && kind in KIND_LABEL && (
        <span className="rounded bg-panel px-1.5 py-0.5">{KIND_LABEL[kind as keyof typeof KIND_LABEL]}</span>
      )}
      {n && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-end gap-0.5" aria-hidden>
            {[1, 2, 3].map((k) => (
              <span key={k} className={cx("w-1 rounded-full", k <= n ? "bg-ink" : "bg-rule")} style={{ height: 4 + k * 3 }} />
            ))}
          </span>
          {LEVEL_LABEL[difficulty as keyof typeof LEVEL_LABEL]}
        </span>
      )}
    </span>
  );
}

/** Red-pen mark on content the teacher corrected. */
export function EditedMark() {
  return (
    <span className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 align-middle text-[12px] font-semibold text-red">
      <PenLine className="size-3" aria-hidden /> đã sửa
    </span>
  );
}

/** The lịch blốc sheet head: month/year, weekday. */
export function DateLine({ date }: { date: Date | null }) {
  if (!date) return <span className="invisible">.</span>;
  return (
    <span>
      {WEEKDAYS[date.getDay()]}, ngày {date.getDate()} tháng {date.getMonth() + 1}
    </span>
  );
}

/** **bold** and `code` inside a line; anything else stays plain text (no HTML injection). */
function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <b key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </b>
    ) : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={i} className="rounded bg-panel px-1 py-px text-[0.92em] text-ink">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

/** Minimal markdown: ## headings, - bullets, **bold**, `code`. The summarizer is prompted for exactly this. */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length} className="my-3 space-y-2">
          {list.map((li, i) => (
            <li key={i} className="relative pl-5 before:absolute before:top-[0.7em] before:left-0 before:h-px before:w-2.5 before:bg-red">
              {inline(li)}
            </li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^(-{3,}|\*{3,}|\|)/.test(t)) continue; // rules and stray table rows: drop rather than show raw syntax
    if (t.startsWith("- ") || t.startsWith("* ")) list.push(t.slice(2));
    else if (/^\d+\.\s/.test(t)) list.push(t); // keep the number; it carries the step order
    else {
      flush();
      if (t.startsWith("#"))
        blocks.push(
          <h3 key={blocks.length} className="mt-6 mb-1 text-[15px] font-bold tracking-wide text-ink uppercase first:mt-0">
            {t.replace(/^#+\s*/, "").replaceAll("**", "")}
          </h3>,
        );
      else if (t) blocks.push(<p key={blocks.length} className="my-3">{inline(t)}</p>);
    }
  }
  flush();
  return <div className="max-w-[68ch] text-[15px] leading-7 text-ink-2">{blocks}</div>;
}

export function Logo({ inverted }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className="perforated grid size-8 place-items-center rounded-[5px] bg-red pt-0.5 font-num text-lg leading-none font-bold text-white"
      >
        L
      </span>
      <span className={cx("text-[15px] font-bold tracking-tight", inverted ? "text-white" : "text-ink")}>
        LectureCards
      </span>
    </span>
  );
}
