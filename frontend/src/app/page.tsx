"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { session } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const s = session();
    router.replace(s ? `/${s.user.role}` : "/login");
  }, [router]);
  return null;
}
