"use client";

import { createContext, useContext, useState } from "react";
import { Button, ErrorNote, Input } from "@/components/ui";
import { api, ApiError, type Klass } from "@/lib/api";

export const Ctx = createContext<{
  classes?: Klass[];
  reload: () => void;
  /** Lecture pages report their class so the rail keeps it highlighted. */
  setActiveClass: (id?: number) => void;
}>({ reload: () => {}, setActiveClass: () => {} });
export const useClasses = () => useContext(Ctx);

export function NewClassForm({ onDone, dark }: { onDone: (c: Klass) => void; dark?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        try {
          const c = await api<Klass>("/classes", { method: "POST", json: { name: new FormData(form).get("name") } });
          form.reset();
          onDone(c);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Không tạo được lớp");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        name="name"
        required
        aria-label="Tên lớp"
        placeholder="VD: Cấu trúc dữ liệu – N03"
        className={dark ? "border-white/15 bg-white/5 text-white placeholder:text-white/45 hover:border-white/30 focus:border-white" : ""}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" size="sm" variant="primary" loading={busy} className="w-full">
        Tạo lớp
      </Button>
    </form>
  );
}

