# VNR202 — Hành trình lịch sử

Website học VNR202 và trò chơi nhập vai 3D về chiến dịch Điện Biên Phủ. Nội dung tĩnh nằm trong thư mục `dist/`.

## Chạy cục bộ

```bash
python -m http.server 4173 --directory dist
```

Mở `http://localhost:4173/` để xem trang học tập. Chọn **Bước vào chiến dịch** hoặc mở `http://localhost:4173/game.html` để vào trò chơi 3D. Đường dẫn cũ `/learn.html` vẫn hoạt động.

Vercel triển khai trực tiếp thư mục `dist/` theo cấu hình `vercel.json`.
