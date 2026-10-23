"use client";

import { useEffect, useState } from "react";
import type { Status } from "@/lib/api";
import { cx, DateLine, LunarLine } from "./ui";

/* All art is drawn in the sheet's own vocabulary: ink hairlines, paper fills, one red accent. */

const SAMPLES = [
  { subject: "Cấu trúc dữ liệu", at: "Phút 2:30", q: "Cây AVL đảm bảo điều kiện gì?", a: "Chênh lệch chiều cao hai cây con của mọi nút không quá 1." },
  { subject: "Vật lý đại cương", at: "Phút 12:40", q: "Định luật Ohm phát biểu điều gì?", a: "Cường độ dòng điện tỉ lệ thuận với hiệu điện thế, tỉ lệ nghịch với điện trở." },
  { subject: "Kinh tế vi mô", at: "Trang 14", q: "Thị trường cân bằng khi nào?", a: "Khi lượng cung bằng lượng cầu tại một mức giá." },
];
const HOLD_MS = 4200;
const TEAR_MS = 420; // matches .tearing in globals.css

/**
 * Login's calendar block demonstrating the product: today's sheet tears away to reveal
 * a sample flashcard, then the next, looping. Pauses while the tab is hidden.
 */
export function LoginDemo({ today }: { today: Date | null }) {
  const [i, setI] = useState(0);
  const [tearing, setTearing] = useState(false);
  const pages = SAMPLES.length + 1; // 0 = today's date sheet

  useEffect(() => {
    let tearTimer: ReturnType<typeof setTimeout>;
    const tick = setInterval(() => {
      if (document.hidden) return;
      setTearing(true);
      tearTimer = setTimeout(() => {
        setTearing(false);
        setI((x) => (x + 1) % pages);
      }, TEAR_MS);
    }, HOLD_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(tearTimer);
    };
  }, [pages]);

  const sheet = (n: number) =>
    n === 0 ? (
      <div className="flex h-full flex-col items-center text-center">
        <p className="sheet-rule w-full pb-3 text-[13px] font-bold tracking-[0.18em] text-ink uppercase">
          {today ? `Tháng ${today.getMonth() + 1} · ${today.getFullYear()}` : " "}
        </p>
        <p className="font-num text-[13rem] leading-[0.9] font-bold tracking-[-0.03em] text-red tabular-nums">
          {today?.getDate() ?? " "}
        </p>
        <p className="text-lg font-bold text-ink">
          <DateLine date={today} />
        </p>
        <LunarLine date={today} className="mt-1 block text-sm font-medium" />
        <p className="mt-auto max-w-[30ch] border-t border-rule pt-5 text-[15px] leading-relaxed text-ink-2">
          Mỗi ngày một tờ. Mỗi tờ là những thẻ bạn cần ôn hôm nay, lấy từ chính bài giảng trên lớp.
        </p>
      </div>
    ) : (
      <div className="flex h-full flex-col text-left">
        <p className="sheet-rule flex justify-between gap-4 pb-3 text-[12px] font-bold tracking-[0.14em] uppercase">
          <span>{SAMPLES[n - 1].subject}</span>
          <span className="text-ink-3">Thẻ ví dụ</span>
        </p>
        <p className="mt-8 text-[26px] leading-snug font-bold text-balance text-ink">{SAMPLES[n - 1].q}</p>
        <p className="mt-4 border-t border-rule pt-4 text-[17px] leading-relaxed text-ink-2">{SAMPLES[n - 1].a}</p>
        <p className="mt-auto text-[13px] font-semibold text-red tabular-nums">{SAMPLES[n - 1].at}</p>
      </div>
    );

  const sheetCls =
    "perforated absolute inset-0 rounded-b-md bg-white px-10 pt-8 pb-10 shadow-[0_12px_32px_-12px_rgba(18,26,44,0.25)]";

  return (
    <div className="relative w-[min(440px,100%)]" aria-label="Minh hoạ: tờ lịch xé ra thành flashcard" role="img">
      <div aria-hidden className="relative z-10 -mx-3 h-7 rounded-t-md bg-ink shadow-[0_2px_4px_rgba(18,26,44,0.25)]" />
      <div aria-hidden className="relative h-[480px]">
        <div className="absolute inset-x-3 -bottom-2 h-full rounded-b-md bg-white shadow-[0_1px_2px_rgba(18,26,44,0.08)]" />
        <div className="absolute inset-x-1.5 -bottom-1 h-full rounded-b-md bg-white shadow-[0_1px_2px_rgba(18,26,44,0.08)]" />
        <div className={sheetCls}>{sheet((i + 1) % pages)}</div>
        <div key={i} className={cx(sheetCls, tearing && "tearing")}>
          {sheet(i)}
        </div>
      </div>
    </div>
  );
}

const STAGES: { key: Status; label: string }[] = [
  { key: "transcribing", label: "Nghe & chép lời" },
  { key: "summarizing", label: "Tóm tắt" },
  { key: "generating", label: "Sinh thẻ" },
];

/** Pipeline as three drawn stations; only the current one moves. */
export function ProcessingArt({ status }: { status: Status }) {
  const at = STAGES.findIndex((s) => s.key === status);
  const state = (n: number) => (at === -1 ? "pending" : n < at ? "done" : n === at ? "active" : "pending");
  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-6" aria-hidden>
      {STAGES.map((s, n) => {
        const st = state(n);
        return (
          <figure key={s.key} data-state={st} className="proc group text-center">
            <svg viewBox="0 0 120 72" className="mx-auto h-16 w-full max-w-[150px] sm:h-[72px]">
              {n === 0 &&
                [8, 22, 14, 30, 18, 34, 12, 26, 16, 24, 10].map((h, k) => (
                  <rect
                    key={k}
                    className="proc-bar"
                    style={{ animationDelay: `${k * 70}ms` }}
                    x={10 + k * 9.5}
                    y={36 - h}
                    width="4"
                    height={h * 2}
                    rx="2"
                  />
                ))}
              {n === 1 && (
                <g>
                  <rect x="22" y="6" width="76" height="62" rx="3" className="proc-paper" />
                  {[0, 1, 2, 3].map((k) => (
                    <rect
                      key={k}
                      className="proc-line"
                      style={{ animationDelay: `${k * 260}ms` }}
                      x="32"
                      y={18 + k * 12}
                      width={k === 3 ? 34 : 56}
                      height="4"
                      rx="2"
                    />
                  ))}
                </g>
              )}
              {n === 2 &&
                [0, 1, 2].map((k) => (
                  <g key={k} className="proc-card" style={{ animationDelay: `${k * 380}ms` }}>
                    <rect x={30 + k * 6} y={28 - k * 9} width="56" height="38" rx="3" className="proc-paper" />
                    <rect x={30 + k * 6} y={28 - k * 9} width="56" height="5" rx="1" className="proc-band" />
                  </g>
                ))}
            </svg>
            <figcaption
              className={cx(
                "mt-2 text-[12px] font-semibold",
                st === "active" ? "text-red" : st === "done" ? "text-ink" : "text-ink-3",
              )}
            >
              {s.label}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** Static line illustrations for empty states. No motion: there is nothing to explain or indicate. */
export function EmptyArt({ kind }: { kind: "classes" | "lectures" | "students" | "quiz" }) {
  return (
    <svg viewBox="0 0 160 96" className="mx-auto mb-4 h-20 w-auto" aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* the block: two blank sheets under a top sheet */}
      <rect x="44" y="20" width="72" height="66" rx="4" fill="#fff" stroke="var(--color-rule)" strokeWidth="1.5" />
      <rect x="40" y="16" width="80" height="66" rx="4" fill="#fff" stroke="var(--color-rule)" strokeWidth="1.5" />
      <rect x="36" y="10" width="88" height="68" rx="4" fill="#fff" stroke="var(--color-ink-3)" strokeWidth="1.5" />
      <rect x="36" y="10" width="88" height="9" rx="2" fill="var(--color-ink)" />
      <path d="M46 29h68M46 31.5h68" stroke="var(--color-ink)" strokeWidth="1" />
      {kind === "classes" && (
        <g stroke="var(--color-red)" strokeWidth="2.5">
          <path d="M80 42v24M68 54h24" />
        </g>
      )}
      {kind === "lectures" && (
        <g>
          <path d="M72 42l18 11-18 11z" fill="var(--color-red)" />
          {[0, 1, 2, 3, 4].map((k) => (
            <path key={k} d={`M${98 + k * 4} ${53 - [3, 6, 4, 7, 2][k]}v${[3, 6, 4, 7, 2][k] * 2}`} stroke="var(--color-ink-3)" strokeWidth="1.5" />
          ))}
        </g>
      )}
      {kind === "students" && (
        <g>
          <rect x="54" y="44" width="52" height="18" rx="3" stroke="var(--color-ink-3)" strokeWidth="1.5" />
          <path d="M62 53h36" stroke="var(--color-red)" strokeWidth="2.5" strokeDasharray="4 4" />
        </g>
      )}
      {kind === "quiz" && (
        <g>
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <circle cx="54" cy={44 + k * 11} r="3" stroke={k === 1 ? "var(--color-red)" : "var(--color-ink-3)"} strokeWidth="1.5" fill={k === 1 ? "var(--color-red)" : "none"} />
              <path d={`M62 ${44 + k * 11}h${k === 1 ? 40 : 30}`} stroke="var(--color-ink-3)" strokeWidth="1.5" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

/** "Done for today": the torn sheets drop into a loose pile. Plays once on mount. */
export function TornPile({ count }: { count: number }) {
  const n = Math.min(Math.max(count, 1), 7);
  // [x, lift, rotate]: each later sheet lands a little higher, on top of the pile.
  const spots = [
    [-22, 0, -9],
    [16, 2, 8],
    [-4, 5, -3],
    [26, 8, 13],
    [-30, 10, -15],
    [6, 13, 4],
    [-14, 16, 10],
  ];
  return (
    <div aria-hidden className="relative mx-auto h-24 w-56">
      {spots.slice(0, n).map(([x, y, r], k) => (
        <div
          key={k}
          className="pile-sheet absolute bottom-2 left-1/2 h-12 w-16 rounded-[3px] border border-rule border-t-[4px] border-t-green bg-white shadow-[0_2px_4px_rgba(18,26,44,0.12)]"
          style={
            {
              "--x": `${x - 32}px`,
              "--y": `${-y}px`,
              "--r": `${r}deg`,
              animationDelay: `${k * 70}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
