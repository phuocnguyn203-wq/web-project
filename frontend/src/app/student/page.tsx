"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyArt } from "@/components/art";
import { Button, buttonCls, DateLine, Empty, ErrorNote, Input, LunarLine, Skeleton, useToday } from "@/components/ui";
import { api, ApiError, type DueCard, type Klass, type Lecture } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export default function StudentHome() {
  const today = useToday();
  const due = useApi<DueCard[]>("/review/due");
  const classes = useApi<Klass[]>("/classes");
  const n = due.data?.length;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-14">
      {/* Today's sheet */}
      <section aria-labelledby="today" className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative">
          <div className="absolute inset-x-2 -bottom-1.5 h-full rounded-b-lg bg-white shadow-[0_1px_2px_rgba(18,26,44,0.1)]" />
          <div className="perforated relative rounded-b-lg border-t-[10px] border-ink bg-white px-6 pt-5 pb-6 shadow-[0_14px_36px_-16px_rgba(18,26,44,0.3)]">
            <p id="today" className="sheet-rule pb-2.5 text-center text-[13px] font-bold tracking-[0.16em] uppercase">
              <DateLine date={today} />
            </p>
            <LunarLine date={today} className="mt-2 block text-center text-[13px] font-medium" />
            <div className="pb-3 text-center">
              {n === undefined ? (
                <Skeleton className="mx-auto my-4 h-32 w-32" />
              ) : (
                <p className="font-num text-[9.5rem] leading-[0.95] font-bold tracking-[-0.03em] text-red tabular-nums">{n}</p>
              )}
              <p className="text-[15px] font-semibold text-ink">
                {n !== 0 ? "thẻ cần ôn hôm nay" : classes.data?.length === 0 ? "Chưa có thẻ nào" : "Hôm nay bạn đã ôn xong"}
              </p>
            </div>
            {n ? (
              <Link href="/student/review" className={buttonCls("primary", "lg", "w-full")}>
                Bắt đầu ôn
              </Link>
            ) : (
              <p className="border-t border-rule pt-4 text-center text-sm leading-relaxed text-ink-2">
                {n !== 0
                  ? " "
                  : classes.data?.length === 0
                    ? "Nhập mã lớp giảng viên gửi để nhận thẻ đầu tiên."
                    : "Tờ lịch ngày mai sẽ có thẻ mới theo lịch ôn cách quãng."}
              </p>
            )}
          </div>
        </div>
        {due.error && <div className="mt-3"><ErrorNote>{due.error}</ErrorNote></div>}
      </section>

      <section aria-labelledby="classes">
        <div className="sheet-rule flex items-end justify-between gap-4 pb-3">
          <h1 id="classes" className="text-2xl font-bold tracking-tight">Lớp của bạn</h1>
        </div>
        <JoinForm onJoined={() => { classes.reload(); due.reload(); }} />
        <div className="mt-6 space-y-8">
          {!classes.data && <Skeleton className="h-40" />}
          {classes.data?.length === 0 && (
            <Empty title="Bạn chưa tham gia lớp nào" art={<EmptyArt kind="classes" />}>Nhập mã 6 ký tự giảng viên gửi để tham gia lớp và nhận bài giảng.</Empty>
          )}
          {classes.data?.map((c) => <ClassLectures key={c.id} klass={c} />)}
        </div>
      </section>
    </div>
  );
}

function JoinForm({ onJoined }: { onJoined: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        setError(null);
        try {
          await api("/classes/join", { method: "POST", json: { code: new FormData(form).get("code") } });
          form.reset();
          onJoined();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Không tham gia được");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex gap-2">
        <Input
          name="code"
          required
          maxLength={8}
          aria-label="Mã lớp"
          placeholder="Nhập mã lớp, VD: 4F2A9C"
          autoCapitalize="characters"
          className="font-semibold tracking-[0.08em] uppercase placeholder:font-normal placeholder:tracking-normal placeholder:normal-case"
        />
        <Button type="submit" variant="ink" loading={busy}>Tham gia</Button>
      </div>
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
    </form>
  );
}

function ClassLectures({ klass }: { klass: Klass }) {
  const { data } = useApi<Lecture[]>(`/classes/${klass.id}/lectures`);
  return (
    <div>
      <h2 className="text-[15px] font-semibold text-ink">{klass.name}</h2>
      {!data ? (
        <Skeleton className="mt-3 h-14" />
      ) : data.length ? (
        <ul className="mt-2 divide-y divide-rule border-y border-rule">
          {data.map((l) => (
            <li key={l.id}>
              <Link href={`/student/lectures/${l.id}`} className="group flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink group-hover:underline">{l.title}</p>
                  <p className="text-[13px] text-ink-3 tabular-nums">{new Date(l.created_at).toLocaleDateString("vi-VN")}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-3">Giảng viên chưa giao bài giảng nào.</p>
      )}
    </div>
  );
}
