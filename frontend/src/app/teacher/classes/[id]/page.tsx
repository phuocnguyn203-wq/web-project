"use client";

import { ArrowRight, Check, Copy, FileAudio, Link2, Upload, Users, X } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { Button, cx, Empty, MockBadge, ErrorNote, Field, Input, Pipeline, Skeleton, Tabs } from "@/components/ui";
import { api, ApiError, type Klass, type Lecture, type Stats } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { EmptyArt } from "@/components/art";
import { DEFAULT_QUIZ_OPTIONS, type QuizOptions, QuizOptionsFields } from "@/components/quiz-generator";
import { useClasses } from "@/components/classes";

export default function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: klass } = useApi<Klass>(`/classes/${id}`);
  const lectures = useApi<Lecture[]>(`/classes/${id}/lectures`);
  const [tab, setTab] = useState<"lectures" | "stats">("lectures");
  const [uploading, setUploading] = useState(false);
  const { reload: reloadClasses } = useClasses();

  // Poll while any lecture is still in the pipeline.
  const pending = lectures.data?.some((l) => l.status !== "ready" && l.status !== "failed");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(lectures.reload, 2000);
    return () => clearInterval(t);
  }, [pending, lectures.reload]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="sheet-rule flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="min-w-0">
          {klass ? (
            <h1 className="text-[28px] leading-tight font-bold tracking-tight text-balance">{klass.name}</h1>
          ) : (
            <Skeleton className="h-8 w-72" />
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
            {klass && <CodeChip code={klass.code} />}
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4 text-ink-3" aria-hidden />
              <b className="tabular-nums">{klass?.student_count ?? "–"}</b> sinh viên
            </span>
          </div>
        </div>
        <Button variant={uploading ? "ghost" : "primary"} onClick={() => setUploading((u) => !u)} aria-expanded={uploading}>
          {uploading ? <X className="size-4" /> : <Upload className="size-4" />}
          {uploading ? "Đóng" : "Tải bài giảng"}
        </Button>
      </header>

      {uploading && (
        <UploadPanel
          classId={id}
          onDone={() => {
            setUploading(false);
            lectures.reload();
            reloadClasses();
          }}
        />
      )}

      <div className="mt-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "lectures", label: "Bài giảng", count: lectures.data?.length },
            { value: "stats", label: "Thống kê" },
          ]}
        />
      </div>

      <div className="mt-6">
        {tab === "lectures" ? (
          <LectureTable lectures={lectures.data} error={lectures.error} onUpload={() => setUploading(true)} />
        ) : (
          <StatsView classId={id} />
        )}
      </div>
    </div>
  );
}

function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="press inline-flex items-center gap-2 rounded-md border border-rule bg-white py-1 pr-2 pl-2.5 hover:border-ink-3"
      aria-label={`Sao chép mã lớp ${code}`}
    >
      <span className="text-xs font-semibold text-ink-3">Mã lớp</span>
      <span className="font-num text-lg leading-none font-bold tracking-[0.12em] text-red">{code}</span>
      {copied ? <Check className="size-3.5 text-green" /> : <Copy className="size-3.5 text-ink-3" />}
    </button>
  );
}

function UploadPanel({ classId, onDone }: { classId: string; onDone: () => void }) {
  const [source, setSource] = useState<"file" | "youtube">("file");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizOpts, setQuizOpts] = useState<QuizOptions>(DEFAULT_QUIZ_OPTIONS);
  const input = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("quiz_count", String(quizOpts.count));
    fd.set("quiz_difficulty", quizOpts.difficulty);
    fd.set("quiz_kinds", quizOpts.kinds.join(","));
    if (source === "file") {
      if (!file) return setError("Chọn một file bài giảng");
      fd.set("file", file);
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/classes/${classId}/lectures`, { method: "POST", body: fd });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tải lên thất bại");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rise mt-6 grid gap-5 rounded-lg border border-rule bg-white p-5 sm:p-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-4">
        <Field label="Tiêu đề bài giảng">
          <Input name="title" required placeholder="Buổi 5 – Cây nhị phân tìm kiếm" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-panel p-1">
          {(
            [
              ["file", "File bài giảng", FileAudio],
              ["youtube", "Link YouTube", Link2],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              type="button"
              key={v}
              aria-pressed={source === v}
              onClick={() => setSource(v)}
              className={cx(
                "press inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] text-[13px] font-semibold",
                source === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(18,26,44,0.12)]" : "text-ink-3 hover:text-ink",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {source === "file" ? (
        <div
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setFile(e.dataTransfer.files[0] ?? null);
          }}
          className="grid min-h-44 cursor-pointer place-items-center lg:col-start-2 lg:row-start-1 rounded-md border border-dashed border-ink-3/40 bg-panel/60 px-6 text-center transition-colors hover:border-ink hover:bg-panel"
        >
          <input
            ref={input}
            type="file"
            hidden
            accept="video/*,audio/*,.pdf,.pptx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div>
              <p className="font-semibold break-all text-ink">{file.name}</p>
              <p className="mt-1 text-[13px] text-ink-3 tabular-nums">{(file.size / 1048576).toFixed(1)} MB · bấm để đổi file</p>
            </div>
          ) : (
            <div>
              <Upload className="mx-auto size-6 text-ink-3" aria-hidden />
              <p className="mt-3 font-semibold text-ink">Kéo thả file vào đây, hoặc bấm để chọn</p>
              <p className="mt-1 text-[13px] text-ink-3">MP4, MP3, WAV, M4A · PDF/PPTX · tối đa 1 GB</p>
            </div>
          )}
        </div>
      ) : (
        <div className="self-center lg:col-start-2 lg:row-start-1">
          <Field
            label="Đường dẫn YouTube"
            hint="Video công khai hoặc không công khai. Hệ thống dùng phụ đề của video (tiếng Việt, nếu không có thì tiếng Anh)."
          >
            <Input name="youtube_url" type="url" required placeholder="https://www.youtube.com/watch?v=…" />
          </Field>
        </div>
      )}
      <section aria-labelledby="quiz-opts" className="space-y-5 border-t border-rule pt-5 lg:col-span-2">
        <h3 id="quiz-opts" className="text-[15px] font-bold text-ink">
          Câu hỏi trắc nghiệm
          <span className="ml-2 text-[13px] font-normal text-ink-3">AI soạn theo lựa chọn này; tạo thêm được sau.</span>
        </h3>
        <QuizOptionsFields value={quizOpts} onChange={setQuizOpts} />
      </section>
      <div className="flex flex-col gap-3 lg:col-span-2 lg:flex-row lg:items-center lg:justify-end">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="ink" loading={busy} className="w-full lg:w-auto lg:px-8">
          Bắt đầu xử lý
        </Button>
      </div>
    </form>
  );
}

function LectureTable({ lectures, error, onUpload }: { lectures?: Lecture[]; error: string | null; onUpload: () => void }) {
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!lectures)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  if (!lectures.length)
    return (
      <Empty title="Chưa có bài giảng nào" art={<EmptyArt kind="lectures" />} action={<Button variant="primary" onClick={onUpload}><Upload className="size-4" /> Tải bài giảng đầu tiên</Button>}>
        Tải video, file ghi âm hoặc dán link YouTube. Hệ thống tự chuyển giọng nói thành văn bản, tóm tắt và sinh thẻ ôn tập. Bạn duyệt trước khi giao cho lớp.
      </Empty>
    );
  const delivery = (l: Lecture) =>
    l.published ? (
      <span className="text-[13px] font-semibold text-green">Đã giao cho lớp</span>
    ) : l.status === "ready" ? (
      <Link href={`/teacher/lectures/${l.id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-red hover:underline">
        Chờ bạn duyệt <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    ) : (
      <span className="text-[13px] text-ink-3">Chưa thể giao</span>
    );
  const source = (l: Lecture) => ({ youtube: "YouTube", file: "Video / audio", document: "PDF / slide" })[l.source_type];
  const date = (l: Lecture) => new Date(l.created_at).toLocaleDateString("vi-VN");

  return (
    <>
      {/* Phone: one ruled row per lecture */}
      <ul className="divide-y divide-rule border-y border-rule sm:hidden">
        {lectures.map((l) => (
          <li key={l.id} className="space-y-2.5 py-4">
            <Link href={`/teacher/lectures/${l.id}`} className="block font-semibold text-ink">
              {l.title}
            </Link>
            <p className="text-[13px] text-ink-3 tabular-nums">
              {source(l)} · {date(l)}
              {l.mock && (
                <span className="ml-2">
                  <MockBadge />
                </span>
              )}
            </p>
            <Pipeline status={l.status} progress={l.progress} />
            <div>{delivery(l)}</div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-rule bg-white sm:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-rule bg-panel/50 text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase">
            <tr>
              <th className="px-5 py-3 font-bold">Bài giảng</th>
              <th className="px-5 py-3 font-bold">Xử lý</th>
              <th className="px-5 py-3 font-bold">Trạng thái giao</th>
              <th className="px-5 py-3 text-right font-bold">Ngày tải</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {lectures.map((l) => (
              <tr key={l.id} className="group transition-colors hover:bg-panel/40">
                <td className="px-5 py-4">
                  <Link href={`/teacher/lectures/${l.id}`} className="font-semibold text-ink group-hover:underline">
                    {l.title}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3">
                    {source(l)}
                    {l.mock && <MockBadge />}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <Pipeline status={l.status} progress={l.progress} />
                </td>
                <td className="px-5 py-4">{delivery(l)}</td>
                <td className="px-5 py-4 text-right text-[13px] text-ink-2 tabular-nums">{date(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatsView({ classId }: { classId: string }) {
  const { data, error } = useApi<Stats>(`/classes/${classId}/stats`);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-10 xl:grid-cols-[1.2fr_1fr]">
      <section>
        <h2 className="text-[15px] font-bold">Câu hỏi lớp hay sai</h2>
        <p className="mt-1 text-sm text-ink-2">Sắp xếp theo tỉ lệ trả lời sai. Đây là chỗ nên giảng lại.</p>
        {data.questions.length ? (
          <ol className="mt-4 divide-y divide-rule border-y border-rule">
            {data.questions.slice(0, 12).map((q) => (
              <li key={q.question_id} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-3.5">
                <p className="text-sm leading-snug text-ink">{q.question}</p>
                <p className={cx("text-right font-num text-2xl leading-none font-bold tabular-nums", q.wrong_rate >= 0.5 ? "text-red" : "text-ink")}>
                  {Math.round(q.wrong_rate * 100)}%
                </p>
                <div className="h-1 overflow-hidden rounded-full bg-panel">
                  <div className={cx("h-full rounded-full", q.wrong_rate >= 0.5 ? "bg-red" : "bg-ink-3")} style={{ width: `${q.wrong_rate * 100}%` }} />
                </div>
                <p className="text-right text-xs text-ink-3 tabular-nums">{q.attempts} lượt</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-4"><Empty title="Chưa có lượt làm bài" art={<EmptyArt kind="quiz" />}>Khi sinh viên làm trắc nghiệm, câu sai nhiều nhất sẽ hiện ở đây.</Empty></div>
        )}
      </section>
      <section>
        <h2 className="text-[15px] font-bold">Tiến độ sinh viên</h2>
        <p className="mt-1 text-sm text-ink-2">Số lượt ôn, độ chính xác trắc nghiệm và thẻ đang đến hạn.</p>
        {data.students.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-ink text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                <tr>
                  <th className="py-2 text-left">Sinh viên</th>
                  <th className="py-2 text-right whitespace-nowrap">Lượt ôn</th>
                  <th className="py-2 text-right whitespace-nowrap"><span className="sm:hidden" title="Trắc nghiệm đúng">TN đúng</span><span className="hidden sm:inline">Trắc nghiệm đúng</span></th>
                  <th className="py-2 text-right whitespace-nowrap">Đến hạn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {data.students.map((s) => (
                  <tr key={s.user_id}>
                    <td className="py-3 pr-3 font-semibold whitespace-nowrap">{s.name}</td>
                    <td className="py-3 text-right tabular-nums">{s.reviews}</td>
                    <td className="py-3 text-right tabular-nums">{s.quiz_attempts ? `${Math.round(s.quiz_accuracy * s.quiz_attempts)}/${s.quiz_attempts}` : "—"}</td>
                    <td className={cx("py-3 text-right font-semibold tabular-nums", s.due_now > 10 && "text-red")}>{s.due_now}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4"><Empty title="Lớp chưa có sinh viên" art={<EmptyArt kind="students" />}>Gửi mã lớp cho sinh viên để họ tham gia.</Empty></div>
        )}
      </section>
    </div>
  );
}
