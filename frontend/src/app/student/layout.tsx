"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { logout } from "@/lib/api";
import { useRequireRole } from "@/lib/hooks";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = useRequireRole("student");
  if (!user) return null;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/student">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-ink-2 sm:inline">{user.name}</span>
            <button onClick={logout} className="press grid size-9 place-items-center rounded-md text-ink-3 hover:bg-panel hover:text-ink" aria-label="Đăng xuất">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-10">{children}</main>
    </div>
  );
}
