"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui";
import { NewClassForm, useClasses } from "@/components/classes";

export default function TeacherHome() {
  const { classes, reload } = useClasses();
  const router = useRouter();
  useEffect(() => {
    if (classes?.length) router.replace(`/teacher/classes/${classes[0].id}`);
  }, [classes, router]);

  if (!classes || classes.length) return <Skeleton className="h-10 w-64" />;
  return (
    <div className="mx-auto max-w-md pt-16">
      <h1 className="sheet-rule pb-3 text-2xl font-bold tracking-tight">Tạo lớp đầu tiên</h1>
      <ol className="mt-5 space-y-3 text-[15px] leading-relaxed text-ink-2">
        <li><b className="text-ink">1.</b> Đặt tên lớp. Hệ thống sinh mã 6 ký tự để sinh viên tham gia.</li>
        <li><b className="text-ink">2.</b> Tải bài giảng lên (video, audio hoặc link YouTube).</li>
        <li><b className="text-ink">3.</b> Duyệt thẻ và câu hỏi do AI sinh, rồi giao cho lớp.</li>
      </ol>
      <div className="mt-8">
        <NewClassForm
          onDone={(c) => {
            reload();
            router.push(`/teacher/classes/${c.id}`);
          }}
        />
      </div>
    </div>
  );
}
