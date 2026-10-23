"use client";

import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Ctx, NewClassForm } from "@/components/classes";
import { cx, Logo } from "@/components/ui";
import { type Klass, logout } from "@/lib/api";
import { useApi, useRequireRole } from "@/lib/hooks";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = useRequireRole("teacher");
  const router = useRouter();
  const path = usePathname();
  const { data: classes, reload } = useApi<Klass[]>(user ? "/classes" : null);
  const [adding, setAdding] = useState(false);
  const [activeClass, setActiveClass] = useState<number>();
  if (!user) return null;

  return (
    <Ctx.Provider value={{ classes, reload, setActiveClass }}>
      <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
        <aside className="bg-navy text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
          <div className="flex items-center justify-between px-5 py-4 lg:py-6">
            <Link href="/teacher">
              <Logo inverted />
            </Link>
            <button onClick={logout} className="text-white/70 hover:text-white lg:hidden" aria-label="Đăng xuất">
              <LogOut className="size-4" />
            </button>
          </div>
          <nav aria-label="Lớp học" className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="hidden items-center justify-between px-2 pb-2 lg:flex">
              <p className="text-[12px] font-bold tracking-[0.14em] text-white/60 uppercase">Lớp học</p>
              <button
                onClick={() => setAdding((a) => !a)}
                className="press grid size-6 place-items-center rounded text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Thêm lớp"
                aria-expanded={adding}
              >
                <Plus className="size-4" />
              </button>
            </div>
            {adding && (
              <div className="rise mb-3 px-2">
                <NewClassForm
                  dark
                  onDone={(c) => {
                    setAdding(false);
                    reload();
                    router.push(`/teacher/classes/${c.id}`);
                  }}
                />
              </div>
            )}
            <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
              {classes?.map((c) => {
                const active =
                  path.startsWith(`/teacher/classes/${c.id}`) ||
                  (path.startsWith("/teacher/lectures/") && activeClass === c.id);
                return (
                  <li key={c.id} className="shrink-0">
                    <Link
                      href={`/teacher/classes/${c.id}`}
                      className={cx(
                        "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active ? "bg-white text-ink" : "text-white/80 hover:bg-white/8 hover:text-white",
                      )}
                    >
                      <span className="truncate font-semibold">{c.name}</span>
                      <span className={cx("text-xs tabular-nums", active ? "text-ink-3" : "text-white/50")}>
                        {c.lecture_count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="hidden border-t border-white/10 px-5 py-4 lg:block">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-white/60">{user.email}</p>
              <button onClick={logout} className="shrink-0 text-white/60 hover:text-white" aria-label="Đăng xuất">
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 px-5 py-6 sm:px-10 lg:py-10">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
