# Cài backend miễn phí (Google Sheets + Apps Script) — ~10 phút

1. Tạo 1 Google Sheet mới, đặt tên `KiemKe_Data`.
2. Menu **Tiện ích mở rộng → Apps Script**. Xóa code mẫu, dán toàn bộ nội dung `Code.gs` → **Lưu**.
3. Chọn hàm `setup` → bấm **Chạy ▶** → cấp quyền. Sheet sẽ có 7 trang: `users, locations, items, staff, sessions, expected, counts` và tài khoản **admin / admin123**.
4. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**:
   - Thực thi với tư cách: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
5. Copy **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).
6. Dán URL vào `js/config.js` → `apiUrl` (áp dụng cho mọi máy), hoặc vào trang **Cài đặt → Máy chủ dữ liệu** trên từng máy.
7. Đăng nhập admin/admin123 → **đổi mật khẩu ngay** trong Danh mục → Tài khoản.

## Lưu ý
- Có thể sửa danh mục trực tiếp trên Google Sheet (trang `items`, `locations`, `staff`). Không sửa cột `password_hash` bằng tay.
- Khi sửa `Code.gs`: **Triển khai → Quản lý triển khai → Sửa → Phiên bản mới** (giữ nguyên URL).
- Giới hạn miễn phí của Google đủ cho vài chục người quét đồng thời; mỗi lượt quét là 1 dòng trong trang `counts`.
