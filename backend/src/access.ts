import type { User } from "./auth.ts";
import type { Db, Row } from "./db.ts";
import { HttpError } from "./http.ts";

/** Columns of LectureOut. class_id is where it was uploaded; class_ids is where it is assigned. */
export const LECTURE = `l.id, l.class_id, l.title, l.source_type, l.source_url, l.status, l.progress, l.error,
  l.mock, l.created_at,
  COALESCE((SELECT json_agg(a.class_id ORDER BY a.class_id) FROM assignments a WHERE a.lecture_id = l.id), '[]')
    AS class_ids,
  EXISTS (SELECT 1 FROM assignments a WHERE a.lecture_id = l.id) AS published`;

export const assignedTo = (param: string) => `(SELECT lecture_id FROM assignments WHERE class_id = ${param})`;

export async function getClass(db: Db, classId: number, user: User) {
  const [c] = await db.query("SELECT id, name, code, teacher_id FROM classes WHERE id = $1", [classId]);
  if (!c) throw new HttpError(404, "Không tìm thấy lớp");
  if (user.role === "teacher" && c.teacher_id === user.id) return c;
  if (user.role === "student") {
    const [e] = await db.query("SELECT 1 FROM enrollments WHERE user_id = $1 AND class_id = $2", [user.id, classId]);
    if (e) return c;
  }
  throw new HttpError(403, "Bạn không thuộc lớp này");
}

/** Teachers reach lectures uploaded to their classes; students only those assigned to a class they joined. */
export async function getLecture(db: Db, lectureId: number, user: User, edit = false) {
  const [lec] = await db.query(`SELECT ${LECTURE}, l.file_path FROM lectures l WHERE l.id = $1`, [lectureId]);
  if (!lec) throw new HttpError(404, "Không tìm thấy bài giảng");
  if (user.role === "teacher") await getClass(db, lec.class_id, user);
  else {
    const [seen] = await db.query(
      `SELECT 1 FROM assignments a JOIN enrollments e ON e.class_id = a.class_id
       WHERE a.lecture_id = $1 AND e.user_id = $2`,
      [lectureId, user.id],
    );
    if (edit || !seen) throw new HttpError(403, "Bài giảng chưa được giao");
  }
  return lec;
}

/** LectureOut: never leak the server-side file path. */
export const lectureOut = ({ file_path: _, ...l }: Row) => l;

/** A flashcard or quiz question the teacher may edit. */
export async function ownedItem(db: Db, table: "flashcards" | "quiz_questions", itemId: number, user: User) {
  const [row] = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [itemId]);
  if (!row) throw new HttpError(404, "Không tìm thấy");
  await getLecture(db, row.lecture_id, user, true);
  return row;
}
