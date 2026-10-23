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

```bash
# Backend (Python 3.12+)
python -m venv .venv && .venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
cd backend
alembic upgrade head                        # tạo/cập nhật bảng (SQLite dev.db)
SYNC_JOBS=1 uvicorn app.main:app --reload   # chạy job ngay trong request, không cần Redis
# PowerShell: $env:PYTHONPATH="..;."; alembic upgrade head; $env:SYNC_JOBS=1; uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
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
