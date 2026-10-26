# Deploy LectureCards lên một VPS

Toàn bộ hệ thống (web, API, worker, Postgres, Redis) chạy bằng Docker trên **một máy chủ**. Caddy đứng trước, tự xin và gia hạn chứng chỉ HTTPS. Bên ngoài chỉ thấy cổng 80/443; API nằm ở `https://<tên-miền>/api`.

```
Internet ──443──▶ Caddy ─┬─ /api/* ─▶ api (FastAPI) ──▶ Postgres, Redis ◀── worker (RQ)
                         └─ còn lại ─▶ web (Next.js)
```

## Cần chuẩn bị

| Thứ | Gợi ý |
| --- | --- |
| VPS | Ubuntu 24.04, **2 GB RAM** trở lên, 20 GB ổ (Hetzner CX22, DigitalOcean, Vultr… khoảng $5–6/tháng). Máy 1 GB cần thêm swap ở bước 2 vì build Next.js tốn RAM. |
| Tên miền | Một tên miền hoặc subdomain, ví dụ `lecturecards.ten-ban.com` |
| Key Groq | Tạo key **mới** tại console.groq.com. Đừng dùng key đã từng dán vào chat hoặc gửi đi đâu. |

## 1. Trỏ tên miền về VPS

Ở nơi quản lý DNS, tạo bản ghi **A**: tên `lecturecards` (hoặc `@`) → IP của VPS. Đợi vài phút rồi kiểm tra bằng `ping lecturecards.ten-ban.com`: phải ra đúng IP.

## 2. Cài Docker và tường lửa (SSH vào VPS)

```bash
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Chỉ khi VPS có 1 GB RAM: thêm 2 GB swap
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Lấy code và điền cấu hình

```bash
git clone https://github.com/phuocnguyn203-wq/web-project.git /opt/lecturecards
cd /opt/lecturecards
cp .env.example .env
openssl rand -hex 32   # dán vào JWT_SECRET
openssl rand -hex 24   # dán vào POSTGRES_PASSWORD
nano .env
```

Repo private thì dùng `git clone https://<token>@github.com/...` với một GitHub token chỉ có quyền đọc repo này.

Những dòng phải sửa trong `.env`:

```ini
DOMAIN=lecturecards.ten-ban.com
POSTGRES_PASSWORD=<chuỗi hex vừa tạo>
JWT_SECRET=<chuỗi hex 64 ký tự vừa tạo>
ALLOW_TEACHER_SIGNUP=1            # mở tạm để tạo tài khoản giảng viên, bước 5 sẽ đóng lại

SPEECH_ENGINE=api                 # nhận dạng giọng nói thật cho file tải lên (Groq Whisper, cùng key)
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=<key Groq mới>
LLM_MODEL=openai/gpt-oss-120b
LLM_FALLBACK_MODELS=openai/gpt-oss-20b
```

`CORS_ORIGINS` không cần sửa: bản production tự đặt theo `DOMAIN`. Nếu `JWT_SECRET` còn là chuỗi mẫu hoặc ngắn hơn 32 ký tự, API sẽ **từ chối khởi động**. Đây là chủ ý, để không chạy production với secret yếu.

## 4. Chạy

```bash
alias dc='docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml'
echo "alias dc='docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml'" >> ~/.bashrc

dc up -d --build      # lần đầu mất 5–10 phút
dc ps                 # 6 dịch vụ đều "running"
```

Mở `https://lecturecards.ten-ban.com`. Lần đầu Caddy cần khoảng 30 giây để lấy chứng chỉ. Nếu trình duyệt báo lỗi HTTPS, xem `dc logs caddy`; nguyên nhân thường là DNS chưa trỏ đúng hoặc cổng 80 bị chặn.

## 5. Tạo tài khoản giảng viên rồi đóng đăng ký

1. Trên web, đăng ký với vai trò **Giảng viên**. Dùng mật khẩu thật, không dùng `123456`.
2. Đóng đăng ký giảng viên, để người lạ không tạo tài khoản rồi dùng hết hạn mức Groq của bạn:

```bash
sed -i 's/^ALLOW_TEACHER_SIGNUP=.*/ALLOW_TEACHER_SIGNUP=0/' .env
dc up -d
```

Sinh viên vẫn tự đăng ký và vào lớp bằng mã lớp như bình thường.

## 6. Sao lưu tự động

`deploy/backup.sh` dump database và nén thư mục file tải lên vào `backups/`, giữ 14 bản mới nhất.

```bash
sh deploy/backup.sh                       # chạy thử
crontab -e                                # thêm dòng dưới: 3 giờ sáng mỗi ngày
0 3 * * * cd /opt/lecturecards && sh deploy/backup.sh >> backups/backup.log 2>&1
```

Backup nằm trên chính VPS. Thỉnh thoảng hãy chép về máy mình: `scp -r root@<ip>:/opt/lecturecards/backups .`

Khôi phục database từ một bản dump:

```bash
dc exec -T db pg_restore -U lc -d lc --clean --if-exists < backups/db-YYYYMMDD-HHMM.dump
```

## Vận hành hằng ngày

| Việc | Lệnh |
| --- | --- |
| Cập nhật code mới | `git pull && dc up -d --build` (migration tự chạy khi API khởi động) |
| Xem lỗi xử lý bài giảng | `dc logs -f worker` |
| Xem lỗi API | `dc logs -f api` |
| Khởi động lại | `dc restart` |
| Dung lượng ổ đĩa | `df -h` và `docker system df`. Dọn image cũ: `docker image prune -f` |

## Giới hạn nên biết

- **Hạn mức Groq gói miễn phí:** mỗi model khoảng 200.000 token/ngày, tức khoảng 5–6 bài giảng/ngày/model. Hết hạn mức thì hệ thống tự chuyển sang model dự phòng, và khi tất cả đều hết thì báo lỗi rõ ràng bằng tiếng Việt. Whisper có hạn mức riêng theo số giờ âm thanh; xem console.groq.com/settings/limits. Dùng nhiều thì nâng lên gói trả phí của Groq, không cần sửa code.
- **YouTube trên VPS:** YouTube đôi khi chặn IP của các nhà cung cấp máy chủ ("Sign in to confirm you're not a bot"). Khi đó không lấy được phụ đề và không tải được audio, nên bài giảng sẽ lỗi. Cách xử lý: tải file video/audio lên trực tiếp thay vì dán link.
- **File âm thanh tối đa khoảng 3 giờ** mỗi bài (25 MB sau khi nén), giới hạn của Whisper trên Groq.
- Một VPS 2 GB đủ cho một trường nhỏ (vài trăm sinh viên). Phần tốn tài nguyên nhất là AI, và phần đó chạy trên Groq chứ không chạy trên VPS.
