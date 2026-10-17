# Trí nhớ dự án — Webapp Kiểm Kê Linh Kiện

Người dùng: ASM vận hành khu vực Đông Nam Bộ (giao hàng, bảo hành). Thích dữ liệu, trình bày chỉn chu; ngân sách AI hạn hẹp → trả lời ngắn, gom việc, nhắc cách tiết kiệm token.

## Hệ sinh thái thương hiệu
- **Tập đoàn Đông Dương** (Cty TNHH XNK Phát Triển Đông Dương, MST 0310037930) — công ty mẹ. Logo: mặt trời đỏ `#DE3024` + núi xanh `#4392D4` (`assets/logo-dongduong*.svg`, file gốc người dùng cung cấp).
- **Kingsport** — 16+ năm; ghế massage, máy chạy bộ, xe đạp tập, súng massage, thiết bị sức khỏe. Logo: vương miện + chữ KINGSPORT (chữ I là hình người chạy) + slogan "CUỘC SỐNG GIÀU HẠNH PHÚC". `assets/logo-kingsport.svg` hiện là bản DỰNG LẠI theo tem — chờ file gốc. Mã màu web chưa xác minh (tạm `#E30613`). Hotline tem: 028-22 37 70 84.
- **MOVE (xedienmove.vn)** — thương hiệu xe điện thuộc Đông Dương. Brand Guideline 2026: MOVE Red `#BE0000`, Black `#0B1718`, White, Purple `#A331F4`, Neutral `#6D6D6D`, Neutral Lighter `#F2F2F2`; font Mona Sans (tiêu đề), Josefin Sans (nội dung); favicon = nền đỏ + logomark trắng. Logo: ô vuông bo góc + wordmark MOVE. `assets/logo-xedienmove.svg` là bản DỰNG LẠI — chờ file gốc.

## Xe điện MOVE (theo tìm kiếm web 10/2026 — giá có thể đổi, cần đối chiếu)
| Mẫu | Loại | Giá niêm yết |
|---|---|---|
| Boss, Mission (BST Smart MOVE, ra mắt Vietnam Cycle Expo 08/2026) | XMĐ hiệu năng cao | 54 tr |
| Thinking | XMĐ cao cấp | 39 tr |
| Target S | XMĐ | 36,5 tr |
| Isabella | XMĐ | 19,9 tr |
| Athena Pro | XMĐ phổ thông | 14,99 tr (ắc quy 60V20Ah ~90 km) / 20,9 tr (pin LFP 2,5 kWh ~200 km) |
| Athena | XMĐ phổ thông | 14,5 tr |
| Mentor | XMĐ | 10,9 tr |
| 911 (16,5 tr, 90 km), 007, E6 Pro, 946 | Xe đạp điện | 7,9–17 tr |
Athena Pro: motor hub 1000W (max 1600W), 45 km/h, bánh 10", khóa NFC, cốp 15 L. Dòng cao cấp dùng pin LFP bảo hành 10 năm; chính sách "bảo hành tại nhà".
Thẻ giá xe (hangtag) KHÔNG có mã hàng → kiểm kê xe nên quét số khung/số máy hoặc tem serial.

## Dữ liệu ERP (Business Central / NAV)
- Bảng giá xuất "Lines": `Product No.`, `Description`, `Unit of Measure Code`, `Unit Price`; một mã lặp nhiều dòng theo nhóm giá (B2C…) → lấy dòng đầu.
- Báo cáo Nhập-Xuất-Tồn: tiêu đề song ngữ 2 dòng ở dòng 8; cột `Mã hàng (Item)`, `Số lượng cuối kỳ (Ending Balance)`; mã kho ở đầu file `Kho (Location): BR01`; dòng cuối "Tổng theo kho".
- Mã ghế massage dạng `KMC0B10T1PRD`, `KMCVG89T5NGY`, `KMC00G16S4BK`, `KMC0G25S4DBK`; linh kiện dạng `KGMB7-A48`, `KXLD10-A12`.
- Tem trên máy có thể in mã KHÁC ERP (tem B10 in `KMC0T10PRD`) → dùng tính năng "học mã tem" (bảng `aliases`). Tem serial: `302510280211`, `OYL2604220077`.

## Kỹ thuật
- Frontend tĩnh (vanilla JS module), GitHub Pages; backend Google Apps Script + Sheets (`backend/Code.gs`), chế độ DEMO dùng localStorage.
- OCR: Tesseract.js, nhị phân Otsu KHÔNG tự đảo màu (tem trắng trên thân máy đen), lượt 2 ảnh xám; so khớp mờ + chuỗi con + model trong tên hàng.
- Icon ngành hàng `assets/icons/*.png` (mặt nạ alpha, tô màu bằng CSS mask) — người dùng cung cấp.
- Sandbox không truy cập trực tiếp kingsport.vn / xedienmove.vn (DNS bị chặn); chỉ dùng được WebSearch.
