"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Role, session, type User } from "./api";

/** Redirects to /login (or the other role's home) unless the session matches `role`. */
export function useRequireRole(role: Role) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const s = session();
    if (!s) router.replace("/login");
    else if (s.user.role !== role) router.replace(`/${s.user.role}`);
    else setUser(s.user);
  }, [role, router]);
  return user;
}

/** Fetch + reload. `path` null skips. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Đã có lỗi xảy ra");
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load, setData };
}
