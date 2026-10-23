# Kế hoạch 10 tuần

Tuần 1 đã có khung chạy end-to-end với mock. Từ đó mỗi người thay phần mock của mình bằng phần thật, **không đổi API contract** trừ khi cả nhóm đồng ý qua PR sửa `docs/openapi.json`.

| Tuần | Speech (P1) | LLM (P2) | Backend (P3) | Frontend + Deploy (P4) | Mốc |
| --- | --- | --- | --- | --- | --- |
| 1 | Đọc code khung, chạy được | Đọc code khung, chạy được | Đọc code khung, chạy được | Đọc code khung, chạy được | Cả nhóm chạy `docker compose up` |
| 2 | S-1 tải/tách audio thật | L-1 prompt tóm tắt map-reduce | ~~B-1~~ (xong) → B-2 | F-1 deploy thử (Vercel + Render) | Có bản deploy mock |
| 3 | S-2 PhoWhisper trên Colab | L-2 sinh thẻ JSON + retry | B-3b OCR cho PDF scan | F-2 trạng thái lỗi/rỗng đầy đủ | |
| 4 | S-3 worker GPU từ xa | L-3 chia đoạn theo chủ đề | B-4 phân trang + index | F-3 xem transcript, nhảy theo timestamp | **Demo pipeline thật lần 1** |
| 5 | S-4 bộ test WER (gán nhãn) | L-4 đánh giá chất lượng thẻ | B-5 rate limit + bảo mật | F-4 tối ưu mobile cho màn ôn | |
| 6 | S-5 so sánh WER PhoWhisper vs Whisper | L-5 prompt riêng cho PDF/slide | B-6 thống kê theo thời gian | F-5 xem PDF ngay trong trang | |
| 7 | S-6 chống ồn, VAD | L-6 media trong .apkg (ảnh slide) | B-7 test tải | F-6 biểu đồ thống kê | **Demo tính năng đủ** |
| 8 | Hỗ trợ tích hợp | Hỗ trợ tích hợp | Hỗ trợ tích hợp | F-7 a11y + Playwright e2e | Đóng băng tính năng |
| 9 | Viết báo cáo WER | Viết báo cáo LLM | Viết báo cáo kiến trúc | Video demo, slide | |
| 10 | Dự phòng / sửa lỗi | | | | **Bảo vệ** |

## Issue đề xuất

Mỗi dòng là một GitHub issue (gắn label theo người: `speech`, `llm`, `backend`, `frontend`).

### Speech: `ai/speech/`
- **S-1** Tải audio YouTube (yt-dlp) + tách audio từ video (ffmpeg) trong worker; test với video 1 giờ. *Xong khi:* `SPEECH_ENGINE=whisper` chạy được với file thật.
- **S-2** Chạy `vinai/PhoWhisper-small` (rồi `-medium`) trên Colab GPU; giữ timestamp từng đoạn. Ghi thời gian xử lý / 1 giờ audio.
- **S-3** Worker chạy từ xa: script khởi động RQ worker trên Colab/Modal nối vào Redis + Postgres của VPS. Tài liệu hoá trong README.
- **S-4** Bộ test WER: 10–15 đoạn bài giảng × 2–3 phút, tự gán nhãn transcript chuẩn (`ai/speech/testset/`). Có hướng dẫn chuẩn hoá (dấu câu, số).
- **S-5** Script `python -m ai.speech.eval` in bảng WER PhoWhisper vs Whisper (small/medium), theo từng loại ghi âm (micro tốt, phòng học ồn). Đưa vào báo cáo.
- **S-6** (tuỳ chọn) VAD/khử ồn trước khi nhận dạng; đo WER trước/sau.

### LLM: `ai/llm/`
- **L-1** Prompt tóm tắt map-reduce cho tiếng Việt; thử trên 3 bài giảng thật; đặt giới hạn token mỗi chunk.
- **L-2** Sinh flashcard/quiz bằng `response_format=json`, validate Pydantic, **retry 1 lần** khi JSON lỗi (hiện đang bỏ qua chunk). Log tỉ lệ chunk hỏng.
- **L-3** Chia đoạn theo chủ đề (embedding + điểm cắt cosine) thay cho chia theo độ dài. So sánh chất lượng tóm tắt.
- **L-4** Bộ tiêu chí đánh giá thẻ (đúng, đủ ý, không trùng, có timestamp hợp lệ); chấm tay 50 thẻ cho báo cáo.
- **L-5** Prompt riêng cho PDF/slide: với tài liệu, `source_start` là **số trang** (xem `documents.py`); prompt phải giữ đúng số trang trong JSON.
- ~~**L-6** Xuất `.apkg`~~ — **đã xong** (`/lectures/{id}/export.apkg`, GUID ổn định để import lại không trùng). Mở rộng: kèm ảnh slide vào thẻ.

### Backend: `backend/`
- ~~**B-1** Alembic~~ — **đã xong**: `backend/migrations/`, Docker tự `upgrade head`, CI chạy `alembic check`.
- **B-2** Tiến độ chi tiết trong job (vd. % theo số chunk đã nhận dạng); endpoint huỷ/thử lại job lỗi.
- ~~**B-3** Trích text PDF/PPTX~~ — **đã xong** (`backend/app/documents.py`).
- **B-3b** OCR cho PDF dạng scan (hiện báo lỗi "Không trích được chữ"): thử Tesseract `vie` hoặc VietOCR.
- **B-4** Phân trang `/classes/{id}/lectures`, index cho `review_logs(user_id, flashcard_id)`; tối ưu `class_stats` (hiện đang query theo từng sinh viên).
- **B-5** Rate limit đăng nhập, kiểm tra MIME file upload, `JWT_SECRET` bắt buộc khi production.
- **B-6** Thống kê theo thời gian: số lượt ôn mỗi ngày, tỉ lệ nhớ theo bài giảng.
- **B-7** Test tải (locust) với 200 sinh viên; test phân quyền (sinh viên lớp A không đọc được lớp B).

### Frontend + Deploy: `frontend/`, `docker-compose.yml`, `.github/`
- **F-1** Deploy: frontend lên Vercel, backend lên Render/VPS; biến môi trường; HTTPS; CORS.
- **F-2** Rà các trạng thái loading/lỗi/rỗng trên mọi màn; toast khi lưu/xoá.
- **F-3** Màn transcript cho sinh viên: bấm câu nào thì video nhảy tới giây đó; highlight đoạn đang phát.
- **F-4** Màn ôn trên điện thoại: vuốt để chấm điểm, PWA (thêm vào màn hình chính).
- **F-5** Xem PDF ngay trong trang bài giảng (pdf.js), bấm số trang trên thẻ thì cuộn tới trang đó, thay vì mở tab mới.
- **F-6** Biểu đồ thống kê lớp (sau B-6).
- **F-7** Playwright e2e cho luồng chính (giảng viên upload → duyệt → giao; sinh viên tham gia → ôn → làm quiz) chạy trong CI; kiểm tra WCAG AA.
