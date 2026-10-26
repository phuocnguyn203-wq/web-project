# LectureCards

Biến bài giảng tiếng Việt (video, audio, YouTube, PDF/slide) thành tóm tắt, flashcard và trắc nghiệm; sinh viên ôn theo lịch lặp lại ngắt quãng (SM-2), mỗi thẻ gắn đúng giây trong bài giảng.

## Chạy nhanh (Docker)

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8000 (kiểm tra: `/health`; hợp đồng đầy đủ trong `docs/openapi.json`)

Không cần `.env` để chạy thử. Muốn dùng AI thật thì `cp .env.example .env`, điền key (xem mục **Bật model thật**), rồi chạy lại lệnh trên.

Bài giảng có thể là video/audio, link YouTube, hoặc **PDF/PPTX** (trích chữ theo trang; thẻ ghi số trang thay cho mốc thời gian). Xuất thẻ sang Anki dạng `.apkg` hoặc CSV.

Mặc định mọi thứ chạy với **mock** (`SPEECH_ENGINE=mock`, `LLM_PROVIDER=mock`): không cần GPU hay API key, pipeline vẫn chạy end-to-end với dữ liệu giả. Tạo tài khoản giảng viên → tạo lớp → tải bài giảng (dán một link YouTube bất kỳ) → duyệt thẻ → **Giao cho lớp**. Mở cửa sổ ẩn danh, đăng ký sinh viên, nhập mã lớp, rồi ôn bài.

## Kiến trúc

```
web (Next.js, React) ──▶ api (Node.js + Express) ──▶ PostgreSQL
                              │  REST, JWT, SM-2, thống kê, xuất CSV
                              └─HTTP nội bộ─▶ ai (FastAPI) ──▶ Redis ──▶ worker (RQ)
                                               sinh trắc nghiệm, .apkg    speech + LLM
                              ◀──────────── tiến độ + kết quả ───────────────┘
```

Chỉ `api` đọc/ghi database. Worker nhận job qua Redis, xử lý xong thì gửi tiến độ và kết quả về `api` qua `/internal/*` (có `INTERNAL_TOKEN`).

## Chạy khi phát triển (không Docker)

Ba server chạy song song, **mỗi cái chiếm một terminal** và không trả lại dấu nhắc. Dán từng khung vào đúng terminal của nó. Nếu Docker đang chạy thì `docker compose down` trước (trùng cổng 3000/8000).

**Windows PowerShell**, mọi terminal mở ở thư mục gốc `web-project`:

Bước 1: cài đặt, **chỉ chạy lần đầu** (Node 22.18+, Python 3.12+):

```powershell
cd backend; npm install; cd ..
cd frontend; npm install; cd ..
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

Bước 2: **Terminal 1**, API Node ở http://localhost:8000. Không cần cài Postgres: khi không có `DATABASE_URL`, API dùng Postgres nhúng (PGlite) lưu ở `backend/.data`.

```powershell
cd backend
npm run dev
```

Bước 3: **Terminal 2**, service AI ở cổng 8001. `SYNC_JOBS=1` chạy job ngay trong tiến trình, không cần Redis.

```powershell
.venv\Scripts\Activate.ps1
$env:SYNC_JOBS = "1"
uvicorn ai.service.app:app --port 8001 --env-file .env
```

Bước 4: **Terminal 3**, web ở http://localhost:3000:

```powershell
cd frontend
npm run dev
```

**macOS / Linux / Git Bash**: giống hệt, chỉ khác cú pháp:

```bash
(cd backend && npm install) && (cd frontend && npm install)
python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"   # Git Bash: .venv/Scripts/activate
```

```bash
cd backend && npm run dev                                                # Terminal 1
```

```bash
source .venv/bin/activate && SYNC_JOBS=1 uvicorn ai.service.app:app --port 8001 --env-file .env   # Terminal 2
```

```bash
cd frontend && npm run dev                                               # Terminal 3
```

Chưa có `.env` thì bỏ `--env-file .env` (mọi thứ chạy mock).

**Đổi schema database:** thêm file `backend/migrations/00N_mo_ta.sql` (SQL thuần). API tự áp các file chưa chạy khi khởi động và ghi lại trong bảng `schema_migrations`.

**Test:**

```bash
cd backend && npm run typecheck && npm test        # API: Vitest + Supertest trên PGlite
pytest -q && ruff check ai                         # service AI, speech, LLM
cd frontend && npm run lint && npx tsc --noEmit
```

## Cấu trúc repo (theo người phụ trách)

| Thư mục | Người | Nội dung |
| --- | --- | --- |
| `ai/speech/` | 1 – Speech | Phụ đề YouTube, yt-dlp/ffmpeg, Whisper qua API hoặc PhoWhisper/Whisper trên GPU, đo WER (`wer.py`) |
| `ai/llm/` | 2 – LLM | Làm sạch từ đệm, chia đoạn, tóm tắt map-reduce, sinh thẻ + trắc nghiệm, validate bằng Pydantic, lọc trùng |
| `ai/service/` | 1 + 2 | FastAPI nội bộ (`/jobs`, `/quiz`, `/export/apkg`) và job RQ (`pipeline.py`) |
| `backend/` | 3 – Backend | Node.js + Express (TypeScript): REST API, JWT, PostgreSQL, SM-2 (`src/sm2.ts`), migration SQL |
| `frontend/`, `deploy/`, `docker-compose.yml`, `.github/` | 4 – Frontend + Deploy | Next.js + Tailwind, Docker, Caddy, CI |
| `docs/` | Cả nhóm | `openapi.json` (API contract), `PLAN.md`, báo cáo |

## API contract

`docs/openapi.json` là hợp đồng giữa frontend và backend. Đổi API thì sửa file này và code Express trong cùng một PR. Test `every endpoint in the OpenAPI contract is served` (backend) fail nếu một endpoint trong hợp đồng không có route tương ứng.

## Bật model thật

- **YouTube:** nếu video có phụ đề (tiếng Việt, hoặc tiếng Anh), hệ thống dùng luôn phụ đề đó làm lời giảng kèm timestamp, không cần GPU. Bài nào xử lý bằng mock sẽ có nhãn **"Dữ liệu mẫu"** trên giao diện.
- **LLM:** đặt `LLM_PROVIDER=openai` cùng `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Mọi endpoint tương thích OpenAI đều dùng được (OpenAI, Gemini, Groq, Ollama/vLLM tự host); xem ví dụ trong `.env.example`.
- **Speech (file tải lên, video không có phụ đề):** `SPEECH_ENGINE=api` gửi âm thanh (nén Opus, khoảng 7 MB/giờ) tới Whisper trên Groq, dùng chung key LLM, không cần GPU. Muốn chạy model trên máy mình: `pip install -e ".[speech]"` trên máy có GPU rồi đặt `SPEECH_ENGINE=phowhisper` (hoặc `whisper`). Cần có `ffmpeg`; image Docker đã cài sẵn.

## Luồng xử lý

```
upload/YouTube → api lưu file, tạo Lecture(status=queued) → POST ai:/jobs → Redis
worker: transcribing → summarizing → generating → POST api:/internal/lectures/{id}/result → ready
frontend poll GET /lectures/{id}
```

## Deploy

Một VPS + Docker, có HTTPS tự động (Caddy): xem từng bước trong [deploy/README.md](deploy/README.md).

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

## Thiết kế

`PRODUCT.md` (người dùng, nguyên tắc) và `DESIGN.md` (màu, chữ, chuyển động: thế giới "lịch blốc") là nguồn chuẩn cho UI. Giao diện tiếng Việt; code và comment tiếng Anh.
