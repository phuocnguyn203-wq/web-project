# LectureCards

Biến bài giảng tiếng Việt (video, audio, YouTube) thành tóm tắt, flashcard và trắc nghiệm; sinh viên ôn theo lịch lặp lại ngắt quãng (SM-2), mỗi thẻ gắn đúng giây trong bài giảng.

## Chạy nhanh (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:3000
- API + Swagger: http://localhost:8000/docs

Bài giảng có thể là video/audio, link YouTube, hoặc **PDF/PPTX** (trích chữ theo trang; thẻ ghi số trang thay cho mốc thời gian). Xuất thẻ sang Anki dạng `.apkg` hoặc CSV.

Mặc định mọi thứ chạy với **mock** (`SPEECH_ENGINE=mock`, `LLM_PROVIDER=mock`): không cần GPU hay API key, pipeline vẫn chạy end-to-end với dữ liệu giả. Tạo tài khoản giảng viên → tạo lớp → tải bài giảng (dán một link YouTube bất kỳ) → duyệt thẻ → **Giao cho lớp**. Mở cửa sổ ẩn danh, đăng ký sinh viên, nhập mã lớp, rồi ôn bài.

## Chạy khi phát triển (không Docker)

Mở 2 terminal ở thư mục gốc. `--env-file ../.env` để backend đọc key LLM trong `.env`.

**macOS / Linux / Git Bash**

```bash
# Terminal 1 — Backend (Python 3.12+)
python -m venv .venv && source .venv/bin/activate   # Git Bash: source .venv/Scripts/activate
pip install -e ".[dev]"
cd backend
PYTHONPATH=..:. alembic upgrade head                 # tạo/cập nhật bảng (SQLite dev.db)
PYTHONPATH=..:. SYNC_JOBS=1 uvicorn app.main:app --reload --env-file ../.env   # job chạy ngay trong request, không cần Redis

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev
```

**Windows PowerShell**

```powershell
# Terminal 1 — Backend
python -m venv .venv; .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
cd backend
$env:PYTHONPATH = "..;."; $env:SYNC_JOBS = "1"
alembic upgrade head
uvicorn app.main:app --reload --env-file ../.env

# Terminal 2 — Frontend
cd frontend; npm install; npm run dev
```

Nếu Docker đang chạy thì `docker compose down` trước, vì cổng 3000/8000 bị chiếm.

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
- **Speech:** `pip install -e ".[speech]"` trên máy có GPU, đặt `SPEECH_ENGINE=phowhisper` (hoặc `whisper`). Nếu không có GPU: chạy worker trên Colab/Modal, trỏ cùng `REDIS_URL` và `DATABASE_URL`.

## Luồng xử lý

```
upload/YouTube → API lưu file, tạo Lecture(status=queued) → RQ queue
worker: transcribing → summarizing → generating → ready   (FE poll GET /lectures/{id})
```

## Deploy

- Frontend → Vercel: root `frontend/`, env `NEXT_PUBLIC_API_URL=https://<backend>`.
- Backend → VPS/Render: `docker compose up -d` (bỏ service `web`), đặt `CORS_ORIGINS` là domain Vercel và một `JWT_SECRET` thật.

## Thiết kế

`PRODUCT.md` (người dùng, nguyên tắc) và `DESIGN.md` (màu, chữ, chuyển động: thế giới "lịch blốc") là nguồn chuẩn cho UI. Giao diện tiếng Việt; code và comment tiếng Anh.
