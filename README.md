# LectureCards

Biến bài giảng tiếng Việt (video, audio, YouTube) thành tóm tắt, flashcard và trắc nghiệm; sinh viên ôn theo lịch lặp lại ngắt quãng (SM-2), mỗi thẻ gắn đúng giây trong bài giảng.

## Chạy nhanh (Docker)

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API + Swagger: http://localhost:8000/docs

Không cần `.env` để chạy thử. Muốn dùng AI thật thì `cp .env.example .env`, điền key (xem mục **Bật model thật**), rồi chạy lại lệnh trên.

Bài giảng có thể là video/audio, link YouTube, hoặc **PDF/PPTX** (trích chữ theo trang; thẻ ghi số trang thay cho mốc thời gian). Xuất thẻ sang Anki dạng `.apkg` hoặc CSV.

Mặc định mọi thứ chạy với **mock** (`SPEECH_ENGINE=mock`, `LLM_PROVIDER=mock`): không cần GPU hay API key, pipeline vẫn chạy end-to-end với dữ liệu giả. Tạo tài khoản giảng viên → tạo lớp → tải bài giảng (dán một link YouTube bất kỳ) → duyệt thẻ → **Giao cho lớp**. Mở cửa sổ ẩn danh, đăng ký sinh viên, nhập mã lớp, rồi ôn bài.

## Chạy khi phát triển (không Docker)

Backend và frontend là **2 server chạy song song, mỗi cái chiếm 1 terminal** và không trả lại dấu nhắc. Dán từng khung dưới đây vào đúng terminal của nó, đừng dán chung. Nếu Docker đang chạy thì `docker compose down` trước (trùng cổng 3000/8000).

**Windows PowerShell** — mọi terminal mở ở thư mục gốc `web-project`:

Bước 1 — cài đặt, **chỉ chạy lần đầu** (Python 3.12+, Node 20+):

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
cd frontend; npm install; cd ..
```

Bước 2 — **Terminal 1**, backend ở http://localhost:8000 (SQLite `backend/dev.db`, job chạy ngay trong request nên không cần Redis; `--env-file` để đọc key LLM trong `.env`):

```powershell
.venv\Scripts\Activate.ps1
cd backend
$env:PYTHONPATH = "..;."; $env:SYNC_JOBS = "1"
alembic upgrade head
uvicorn app.main:app --reload --env-file ../.env
```

Bước 3 — mở **Terminal 2** mới (nút `+` trong khung Terminal), frontend ở http://localhost:3000:

```powershell
cd frontend
npm run dev
```

Mở http://localhost:3000 khi Terminal 2 hiện `✓ Ready`. `Ctrl+C` trong terminal nào thì tắt server đó.

**macOS / Linux / Git Bash** — giống hệt, chỉ khác cú pháp:

```bash
# lần đầu
python -m venv .venv && source .venv/bin/activate   # Git Bash: source .venv/Scripts/activate
pip install -e ".[dev]" && (cd frontend && npm install)
```

```bash
# Terminal 1 — backend
source .venv/bin/activate && cd backend
PYTHONPATH=..:. alembic upgrade head
PYTHONPATH=..:. SYNC_JOBS=1 uvicorn app.main:app --reload --env-file ../.env
```

```bash
# Terminal 2 — frontend
cd frontend && npm run dev
```

Đổi model trong `backend/app/models.py` thì tạo migration: `cd backend && alembic revision --autogenerate -m "mo ta"`, đọc lại file sinh ra, rồi commit cùng PR. CI chạy `alembic check` để bắt trường hợp quên tạo migration.

Test & lint: `pytest -q`, `ruff check ai backend`, `cd frontend && npm run lint && npx tsc --noEmit`.

## Cấu trúc repo (theo người phụ trách)

| Thư mục | Người | Nội dung |
| --- | --- | --- |
| `ai/speech/` | 1 – Speech | yt-dlp/ffmpeg, PhoWhisper/Whisper, đo WER (`wer.py`) |
| `ai/llm/` | 2 – LLM | Làm sạch từ đệm, chia đoạn, tóm tắt map-reduce, sinh thẻ + validate bằng Pydantic, lọc trùng |
| `backend/` | 3 – Backend | FastAPI, SQLAlchemy, job RQ (`pipeline.py`), JWT, SM-2 (`sm2.py`) |
| `frontend/`, `docker-compose.yml`, `.github/` | 4 – Frontend + Deploy | Next.js + Tailwind, Docker, CI |
| `docs/` | Cả nhóm | `openapi.json` (API contract), `PLAN.md` (kế hoạch + issue) |

## API contract

`docs/openapi.json` là hợp đồng giữa các phần. Nó được sinh từ `backend/app/schemas.py` + các route:

```bash
PYTHONPATH=.:backend python -m app.export_openapi      # cập nhật
```

CI sẽ fail nếu file này cũ hơn code. Đổi API thì sửa `schemas.py`, export lại, rồi commit cả hai trong cùng một PR để frontend thấy diff.

## Bật model thật

- **YouTube:** nếu video có phụ đề (tiếng Việt, hoặc tiếng Anh), hệ thống dùng luôn phụ đề đó làm lời giảng kèm timestamp, không cần GPU. Bài nào xử lý bằng mock sẽ có nhãn **"Dữ liệu mẫu"** trên giao diện.

- **LLM:** đặt `LLM_PROVIDER=openai` cùng `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Mọi endpoint tương thích OpenAI đều dùng được (OpenAI, Gemini, Groq, Ollama/vLLM tự host); xem ví dụ trong `.env.example`.
- **Speech (file tải lên, video không có phụ đề):** `SPEECH_ENGINE=api` gửi âm thanh (nén Opus, khoảng 7 MB/giờ) tới Whisper trên Groq, dùng chung key LLM, không cần GPU. Muốn chạy model trên máy mình: `pip install -e ".[speech]"` trên máy có GPU rồi đặt `SPEECH_ENGINE=phowhisper` (hoặc `whisper`). Cần có `ffmpeg`; image Docker đã cài sẵn.

## Luồng xử lý

```
upload/YouTube → API lưu file, tạo Lecture(status=queued) → RQ queue
worker: transcribing → summarizing → generating → ready   (FE poll GET /lectures/{id})
```

## Deploy

Một VPS + Docker, có HTTPS tự động (Caddy): xem từng bước trong [deploy/README.md](deploy/README.md).

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build
```

## Thiết kế

`PRODUCT.md` (người dùng, nguyên tắc) và `DESIGN.md` (màu, chữ, chuyển động: thế giới "lịch blốc") là nguồn chuẩn cho UI. Giao diện tiếng Việt; code và comment tiếng Anh.
