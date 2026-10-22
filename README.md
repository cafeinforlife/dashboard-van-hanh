# Kiểm Kê Linh Kiện — Kingsport · Xe điện Move

Webapp kiểm kê linh kiện tại chi nhánh: dùng **camera iPhone + nhận diện văn bản (OCR)** để đọc mã hàng, đối chiếu với file tồn kho import đầu vào, xuất báo cáo Excel.

## Tính năng
| Nhóm | Chi tiết |
|---|---|
| Đợt kiểm kê | Tạo đợt theo chi nhánh, ngày, nhân sự; import Excel/CSV (tự nhận diện cột, gộp mã trùng); tải file mẫu |
| Quét bằng camera | Khung ngắm, tiền xử lý ảnh (tăng tương phản + nhị phân Otsu), OCR Tesseract chạy ngay trên máy, so khớp mờ với danh mục (chịu lỗi O/0, I/1, S/5, B/8…), chế độ **quét liên tục** tự cộng SL, đèn flash (nếu máy hỗ trợ), nhập tay |
| Đối chiếu | Khớp / Thiếu / Thừa / Chưa kiểm / Ngoài DS, giá trị chênh lệch theo đơn giá, độ chính xác, tiến độ |
| Báo cáo | KPI, biểu đồ cơ cấu, lọc theo kết quả, **xuất Excel 3 sheet** (Tổng hợp · Đối chiếu · Nhật ký quét), in |
| Danh mục (admin) | Tài khoản & phân quyền, địa điểm, hàng hóa/linh kiện (mã vạch, mã phụ), nhân sự — sửa trực tiếp hoặc nhập/xuất Excel |
| Giao diện | Sáng/tối/theo máy, 6 bộ màu + tự chọn màu chủ đạo & màu phối, cài như app trên iPhone (PWA) |
| Mất mạng | Lượt quét được xếp hàng và tự đồng bộ khi có mạng |

Vai trò: **Quản trị** (toàn quyền) · **Quản lý** (tạo/chốt đợt, báo cáo) · **Nhân viên kiểm kê** (quét).

## Bản cá nhân (mặc định)
Không cài máy chủ → app chạy **Bản cá nhân**: mở link, nhập tên + chọn kho là dùng, không cần tài khoản.
- Dữ liệu lưu trên chính máy đó; **sao lưu / khôi phục** bằng file trong Cài đặt.
- Có sẵn danh sách địa điểm; **danh mục hàng hóa người dùng tự nạp** (Danh mục → Nhập Excel). Hướng dẫn: [HUONG-DAN.md](HUONG-DAN.md) hoặc trong app Cài đặt → 📖 Hướng dẫn.
- Toàn bộ thư viện nằm trong `vendor/` → sau lần mở đầu tiên **chạy được khi mất mạng**.
- iPhone: mở bằng Safari → Chia sẻ → **Thêm vào MH chính** (bắt buộc nên làm: Safari có thể xóa dữ liệu web không dùng sau 7 ngày nếu không thêm vào màn hình chính).

## Triển khai miễn phí
1. **Frontend – GitHub Pages**: merge code vào nhánh `main` → Settings → Pages → Source: **GitHub Actions**. Link dạng `https://<user>.github.io/dashboard-van-hanh/` (https — bắt buộc để iPhone mở camera).
2. **Backend – Google Sheets**: xem [backend/README.md](backend/README.md). Chưa cài backend thì app chạy **chế độ DEMO** (dữ liệu lưu trên trình duyệt; tài khoản `admin / admin123`).

## Tùy biến nhanh
| Muốn đổi | Sửa ở |
|---|---|
| Logo | `assets/` (logo gốc Kingsport, MOVE, Đông Dương) — đường dẫn trong `js/config.js` → `logos` |
| Màu thương hiệu, bộ màu | `js/config.js` → `palettes` |
| Cột file mẫu & tên cột tự nhận diện | `js/config.js` → `template` |
| Độ nhạy OCR | `js/config.js` → `ocr` |
| Danh mục, tài khoản | Trong app (Danh mục) hoặc trực tiếp trên Google Sheet |

## Cấu trúc
```
index.html          khung trang, nạp thư viện (SheetJS, Tesseract.js)
css/app.css         giao diện, theme sáng/tối
js/config.js        cấu hình
js/app.js           các màn hình + điều hướng
js/ocr.js           camera, xử lý ảnh, OCR, thuật toán so khớp mã
js/io.js            nhập/xuất Excel, đối chiếu
js/store.js         dữ liệu (DEMO / Google Sheets), hàng đợi offline
backend/Code.gs     API Google Apps Script
```
