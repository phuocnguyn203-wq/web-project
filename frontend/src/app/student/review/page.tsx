"use client";

import { ArrowLeft, FileText, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TornPile } from "@/components/art";
import { buttonCls, cx, DateLine, ErrorNote, LunarLine, Skeleton, useToday } from "@/components/ui";
import { api, type DueCard, fmtAt } from "@/lib/api";
import { useApi } from "@/lib/hooks";

// SM-2 quality per answer button.
const GRADES = [
  { q: 1, label: "Quên", hint: "1 ngày", key: "1", cls: "border-red/30 text-red hover:bg-red-soft" },
  { q: 3, label: "Khó", hint: "nhắc sớm", key: "2", cls: "border-rule text-ink hover:border-ink-3" },
  { q: 4, label: "Nhớ", hint: "giãn ra", key: "3", cls: "border-rule text-ink hover:border-ink-3" },
  { q: 5, label: "Dễ", hint: "giãn xa", key: "4", cls: "border-green/30 text-green hover:bg-green-soft" },
];

export default function Review() {
  const today = useToday();
  const { data, error } = useApi<DueCard[]>("/review/due");
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tearing, setTearing] = useState(false);

  const card = data?.[i];
  const next = data?.[i + 1];
  const left = data ? data.length - i : 0;
  // Block thickness under the next sheet: one edge per few remaining sheets, capped.
  const edges = Math.min(Math.ceil(Math.max(left - 2, 0) / 3), 4);

  const grade = useCallback(
    (q: number) => {
      if (!card || !flipped || tearing) return;
      api("/review", { method: "POST", json: { flashcard_id: card.id, quality: q } });
      setTearing(true);
      setTimeout(() => {
        setTearing(false);
        setFlipped(false);
        setI((x) => x + 1);
      }, 380);
    },
    [card, flipped, tearing],
  );

  // Keyboard: space flips, 1–4 grade. No animation-gating beyond the tear itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped(true);
      }
      const g = GRADES.find((x) => x.key === e.key);
      if (g) grade(g.q);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade]);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between">
        <Link href="/student" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Trang chủ
        </Link>
        {data && left > 0 && (
          <p className="text-sm text-ink-2">
            Còn <b className="font-num text-xl text-red tabular-nums">{left}</b> tờ
          </p>
        )}
      </div>

      <div className="relative mt-5 [perspective:1400px]">
        {/* the block: blank edges whose count tracks the sheets left, then the real next sheet */}
        {Array.from({ length: edges }, (_, k) => (
          <div
            key={k}
            aria-hidden
            className="absolute h-full rounded-b-lg bg-white shadow-[0_1px_2px_rgba(18,26,44,0.1)]"
            style={{ left: 4 + k * 2, right: 4 + k * 2, bottom: -(k + 1) * 4 }}
          />
        ))}
        {card && next && (
          <div aria-hidden className="absolute inset-x-0 top-0 grid h-[min(62dvh,440px)]">
            <Sheet card={next} today={today} side="front">
              <p className="text-[22px] leading-snug font-bold text-balance text-ink sm:text-2xl">{next.front}</p>
            </Sheet>
          </div>
        )}

        {!data ? (
          <Skeleton className="h-[420px]" />
        ) : !card ? (
          <Done today={today} reviewed={data.length} />
        ) : (
          <div key={card.id} className={cx("relative", tearing ? "tearing" : i === 0 && "rise")}>
            <button
              onClick={() => setFlipped((f) => !f)}
              className="flip relative grid h-[min(62dvh,440px)] w-full text-left"
              data-flipped={flipped}
              aria-label={flipped ? "Xem lại câu hỏi" : "Lật thẻ để xem đáp án"}
            >
              <Sheet card={card} today={today} side="front">
                <p className="text-[22px] leading-snug font-bold text-balance text-ink sm:text-2xl">{card.front}</p>
                <p className="mt-auto text-[13px] text-ink-3">Chạm hoặc nhấn Space để lật</p>
              </Sheet>
              <Sheet card={card} today={today} side="back">
                <p className="text-[13px] font-semibold text-ink-3">{card.front}</p>
                <p className="mt-3 text-lg leading-relaxed text-ink">{card.back}</p>
              </Sheet>
            </button>
          </div>
        )}
      </div>

      {card && (
        <div className="mt-6">
          <SourceLink card={card} />
          <div className={cx("mt-4 grid grid-cols-4 gap-2 transition-opacity duration-200", !flipped && "pointer-events-none opacity-30")} aria-hidden={!flipped}>
            {GRADES.map((g) => (
              <button
                key={g.q}
                onClick={() => grade(g.q)}
                disabled={!flipped}
                className={cx("press flex flex-col items-center rounded-md border bg-white py-2.5", g.cls)}
              >
                <span className="text-[15px] font-bold">{g.label}</span>
                <span className="text-[11px] font-medium opacity-75">
                  {g.hint} <kbd className="ml-0.5 hidden font-sans sm:inline">· {g.key}</kbd>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Sheet({ card, today, side, children }: { card: DueCard; today: Date | null; side: "front" | "back"; children: React.ReactNode }) {
  return (
    <div
      className={cx(
        "face perforated col-start-1 row-start-1 flex flex-col rounded-b-lg border-t-[10px] bg-white px-6 pt-4 pb-6 shadow-[0_14px_36px_-16px_rgba(18,26,44,0.3)] sm:px-8",
        side === "back" ? "face-back border-red" : "border-ink",
      )}
    >
      <div className="sheet-rule mb-6 flex items-baseline justify-between gap-4 pb-2.5 text-[12px] font-bold tracking-[0.12em] uppercase">
        <span className="truncate">{card.lecture_title}</span>
        <span className="hidden shrink-0 text-ink-3 sm:inline">
          <DateLine date={today} />
        </span>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function SourceLink({ card }: { card: DueCard }) {
  const href = `/student/lectures/${card.lecture_id}?t=${Math.floor(card.source_start)}`;
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink">
      {card.source_type === "document" ? <FileText className="size-4 text-red" /> : <PlayCircle className="size-4 text-red" />}
      {card.source_type === "document" ? "Xem lại tài liệu tại " : "Xem lại đoạn giảng tại "}
      <span className="text-red tabular-nums">{fmtAt(card.source_type, card.source_start)}</span>
    </Link>
  );
}

function Done({ today, reviewed }: { today: Date | null; reviewed: number }) {
  return (
    <div className="perforated relative rounded-b-lg border-t-[10px] border-green bg-white px-8 pt-6 pb-8 text-center shadow-[0_14px_36px_-16px_rgba(18,26,44,0.3)]">
      <p className="sheet-rule pb-2.5 text-[13px] font-bold tracking-[0.16em] uppercase"><DateLine date={today} /></p>
      <LunarLine date={today} className="mt-2 block text-[13px] font-medium" />
      {reviewed > 0 && (
        <div className="mt-4">
          <TornPile count={reviewed} />
        </div>
      )}
      <p className="mt-2 font-num text-[8rem] leading-none font-bold text-green tabular-nums">{reviewed}</p>
      <p className="text-lg font-bold">{reviewed ? "tờ đã xé hôm nay" : "Không có thẻ đến hạn"}</p>
      <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-ink-2">
        Thẻ bạn thấy khó sẽ quay lại sớm, thẻ dễ sẽ giãn ra xa hơn. Hẹn bạn ở tờ lịch ngày mai.
      </p>
      <Link href="/student" className={buttonCls("ink", "md", "mt-6")}>
        Về trang chủ
      </Link>
    </div>
  );
}
