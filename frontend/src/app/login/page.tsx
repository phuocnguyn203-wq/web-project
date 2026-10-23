"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoginDemo } from "@/components/art";
import { Button, cx, DateLine, ErrorNote, Field, Input, Logo, LunarLine, useToday } from "@/components/ui";
import { api, ApiError, type Role, saveSession, type User } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const today = useToday();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ access_token: string; user: User }>(`/auth/${mode}`, {
        method: "POST",
        json: mode === "login" ? { email: f.email, password: f.password } : { ...f, role },
      });
      saveSession(res);
      router.replace(`/${res.user.role}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Đã có lỗi xảy ra");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* The calendar sheet */}
      <section className="hidden items-center justify-center bg-panel px-10 lg:flex">
        <LoginDemo today={today} />
      </section>

      <section className="flex flex-col px-5 py-8 sm:px-12">
        <Logo />
        {/* Phone: a compact sheet head so the first screen is still today's page */}
        <div className="perforated mt-6 flex items-center gap-4 rounded-b-md border-t-[8px] border-ink bg-white px-5 pt-3 pb-4 shadow-[0_10px_24px_-14px_rgba(18,26,44,0.3)] lg:hidden">
          <p className="font-num text-[4.5rem] leading-none font-bold text-red tabular-nums">{today?.getDate() ?? " "}</p>
          <div className="min-w-0 flex-1">
            <p className="sheet-rule pb-1.5 text-[12px] font-bold tracking-[0.14em] uppercase">
              <DateLine date={today} />
            </p>
            <LunarLine date={today} className="mt-1.5 block text-[13px] font-medium" />
          </div>
        </div>
        <div className="mx-auto my-auto w-full max-w-sm py-10 lg:py-12">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight text-balance">
            {mode === "login" ? "Chào mừng trở lại" : "Tạo tài khoản"}
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {mode === "login"
              ? "Đăng nhập để tiếp tục ôn tập hoặc quản lý lớp học."
              : "Giảng viên tạo lớp và tải bài giảng; sinh viên tham gia bằng mã lớp."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "register" && (
              <>
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">Bạn là</legend>
                  <div className="grid grid-cols-2 gap-1 rounded-md bg-panel p-1">
                    {(["student", "teacher"] as const).map((r) => (
                      <button
                        type="button"
                        key={r}
                        aria-pressed={role === r}
                        onClick={() => setRole(r)}
                        className={cx(
                          "press h-9 rounded-[5px] text-sm font-semibold",
                          role === r ? "bg-white text-ink shadow-[0_1px_2px_rgba(18,26,44,0.12)]" : "text-ink-3 hover:text-ink",
                        )}
                      >
                        {r === "student" ? "Sinh viên" : "Giảng viên"}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <Field label="Họ và tên">
                  <Input name="name" required autoComplete="name" placeholder="Nguyễn Thị Lan" />
                </Field>
              </>
            )}
            <Field label="Email">
              <Input name="email" type="email" required autoComplete="email" placeholder="ban@truong.edu.vn" />
            </Field>
            <Field label="Mật khẩu" hint={mode === "register" ? "Tối thiểu 6 ký tự." : undefined}>
              <Input
                name="password"
                type="password"
                required
                minLength={mode === "register" ? 6 : undefined}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
              {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-2">
            {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
            <button
              className="font-semibold text-ink underline decoration-red decoration-2 underline-offset-4"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
            >
              {mode === "login" ? "Đăng ký" : "Đăng nhập"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
