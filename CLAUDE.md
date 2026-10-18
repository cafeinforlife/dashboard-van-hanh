# Trí nhớ dự án — Webapp Kiểm Kê Linh Kiện

Người dùng: ASM vận hành khu vực Đông Nam Bộ (giao hàng, bảo hành). Thích dữ liệu, trình bày chỉn chu; ngân sách AI hạn hẹp → trả lời ngắn, gom việc, nhắc cách tiết kiệm token.

## Hệ sinh thái thương hiệu
- **Tập đoàn Đông Dương** (Cty TNHH XNK Phát Triển Đông Dương, MST 0310037930) — công ty mẹ. Logo: mặt trời đỏ `#DE3024` + núi xanh `#4392D4` (`assets/logo-dongduong*.svg`, file gốc người dùng cung cấp).
- **Kingsport** — 16+ năm; ghế massage, máy chạy bộ, xe đạp tập, súng massage, thiết bị sức khỏe. Logo GỐC từ kingsport.vn `/logo/LOGO-2.svg`: vương miện vàng + chữ KINGSPORT (chữ I là người chạy), bản gốc chữ trắng → `assets/logo-kingsport-dark.svg`; bản chữ `#1A1A1A` cho nền sáng → `assets/logo-kingsport.svg`. Màu web (CSS Tailwind `primary`): đỏ `#CC2338`, vàng `#FCD205`/`#B08D00`, đen `#1A1A1A`, nền `#F4F4F4`. Hotline tem: 028-22 37 70 84.
- **MOVE (xedienmove.vn)** — thương hiệu xe điện thuộc Đông Dương. Brand Guideline 2026: MOVE Red `#BE0000`, Black `#0B1718`, White, Purple `#A331F4`, Neutral `#6D6D6D`, Neutral Lighter `#F2F2F2`; font Mona Sans (tiêu đề), Josefin Sans (nội dung); favicon = nền đỏ + logomark trắng. Logo GỐC từ xedienmove.vn `assets/catalog/logo/logo-footer.png` → `assets/logo-xedienmove.png` (đen; nền tối dùng CSS invert = bảng âm). Web `theme-color` = `#BE0000`.

## Xe điện MOVE (lấy trực tiếp từ trang chủ xedienmove.vn, 17/10/2026)
| Mẫu | Loại | Giá niêm yết | Quãng đường | Công suất | Vận tốc |
|---|---|---|---|---|---|
| BOSS | XMĐ (BST Smart MOVE) | 54.000.000 | 180 km | 3000W | 85 km/h |
| MISSION | XMĐ (BST Smart MOVE) | 54.000.000 | 180 km | 3000W | 85 km/h |
| THINKING | XMĐ | 39.000.000 | 200 km | 3000W | 85 km/h |
| TARGET S | XMĐ | 39.000.000 | 200 km | 3000W | 85 km/h |
| TARGET | XMĐ | 36.500.000 | 250 km | 1500W | 50 km/h |
| ISABELLA | XMĐ | 19.900.000 | 90 km | 800W | 50 km/h |
| ATHENA PRO | XMĐ | 14.990.000 (ắc quy) | 90 km | 1000W | 45 km/h |
| ATHENA | XMĐ | 14.500.000 | 80 km | 500W | 45 km/h |
| MENTOR | XMĐ | 14.700.000 | 80 km | 500W | 45 km/h |
| SPORT | XMĐ | 10.900.000 | 70 km | 500W | 45 km/h |
| STRONGER PRO | XMĐ | 10.500.000 | 80 km | 350W | 45 km/h |
| MOVE946 / 911 / 007 / E6 Pro / 133 | Xe đạp điện trợ lực | 15,8 / 16,5 / 13,9 / 10,8 / 11,5 tr | E6 Pro 80 km | E6 Pro 220W | 25 km/h |
Athena Pro bản pin LFP 2,5 kWh ~200 km, ~20,9 tr (theo tìm kiếm). Dòng cao cấp pin LFP bảo hành 10 năm; "bảo hành tại nhà". Hệ thống cửa hàng MOVE trải từ phía Bắc (Tuyên Quang, Sơn La, Yên Bái, Thái Nguyên, Lạng Sơn, Hạ Long…).
Thẻ giá xe (hangtag) KHÔNG có mã hàng → kiểm kê xe nên quét số khung/số máy hoặc tem serial.

## Dữ liệu ERP (Business Central / NAV)
- Bảng giá xuất "Lines": `Product No.`, `Description`, `Unit of Measure Code`, `Unit Price`; một mã lặp nhiều dòng theo nhóm giá (B2C…) → lấy dòng đầu.
- Location (kho/cửa hàng): `data/locations.json` tạo từ Locations.xlsx của ERP — 300 địa điểm (42 kho, 257 cửa hàng, 1 VP), 15 chi nhánh (nhóm theo "KS Customer No." BD00, BH00, BR00, HO00…). Bỏ dòng nhóm không tên và TRANS-IN/OUT. Ninh Thuận = HO39 (thuộc CN HCM).
- Báo cáo Nhập-Xuất-Tồn: tiêu đề song ngữ 2 dòng ở dòng 8; cột `Mã hàng (Item)`, `Số lượng cuối kỳ (Ending Balance)`; mã kho ở đầu file `Kho (Location): BR01`; dòng cuối "Tổng theo kho".
- Mã ghế massage dạng `KMC0B10T1PRD`, `KMCVG89T5NGY`, `KMC00G16S4BK`, `KMC0G25S4DBK`; linh kiện dạng `KGMB7-A48`, `KXLD10-A12`.
- CẤU TRÚC MÃ (phân tích 6.274 mã, 18/10/2026):
  - Thành phẩm ghế massage 12 ký tự `KMC|đệm 0/V|model|phiên bản|dòng|màu`, VD `KMCV·G89·T5·N·GY`, `KMC0·G25·S4·D·BK`, `KMC0·B10·T1·P·RD`. Phiên bản: T/V+số (lô), S4 = Sonic 4.0 ("sonic40"). Dòng: D=Deluxe, S=Standard, C=Classic, P=Premium, N=thường (K, L chưa rõ). Màu: BK đen, GY xám, BR nâu, BG/BE be, RD đỏ, YL vàng, WH trắng (DB, DO chưa rõ). Mã cũ dạng `KMCG000xx…` (53 mã) không theo mẫu này. 42 model, 30 model có nhiều mã (khác lô/màu).
  - Linh kiện `[K=Kingsport|A=ABC][GM ghế massage|CB chạy bộ|XD xe đạp|QH quạt|MX máy xay|MS…][model]-[mã bộ phận][-Vxx]`, VD `KGMB7-A48`. Mã bộ phận thống nhất giữa các model: A12 van từ đóng xả khí, A23 bộ cùm massage lưng, A29 da lót lưng, A40 bánh răng kết nối; B01 board điều khiển (máy chạy bộ).
  - Độ duy nhất theo hậu tố: 6 ký tự cuối 89,4%, 7 ký tự 94,7%, 8 ký tự 98,9%.
- Tem trên máy có thể in mã KHÁC ERP (tem B10 in `KMC0T10PRD`) → dùng tính năng "học mã tem" (bảng `aliases`). Tem serial: `302510280211`, `OYL2604220077`.

## Kỹ thuật
- Frontend tĩnh (vanilla JS module), GitHub Pages; backend Google Apps Script + Sheets (`backend/Code.gs`), chế độ DEMO dùng localStorage.
- OCR: Tesseract.js, nhị phân Otsu KHÔNG tự đảo màu (tem trắng trên thân máy đen), lượt 2 ảnh xám. Đối chiếu 2 lớp: (1) so khớp mờ mã + chuỗi con + mã tem đã học; (2) nếu lớp 1 < 90%: NHÓM SẢN PHẨM trên tem (GHẾ MASSAGE…) + MÃ MODEL (B10, G89NEW…) → hàng cùng nhóm + model, ưu tiên hàng trong phiếu tồn kho, thành phẩm trước linh kiện; điểm tối đa 89% nên luôn để người kiểm chọn (không tự cộng ở chế độ quét liên tục).
- Icon ngành hàng `assets/icons/` (mặt nạ alpha, tô màu bằng CSS mask): 5 PNG người dùng cung cấp + SVG tự vẽ: thiet-bi-y-te (máy đo huyết áp, xe lăn, giường điện/cơ, ghế bô, ghế tập đi), qua-tang (bóng/thảm yoga, con lăn bụng, áo trùm, áo mưa, nón BH, túi vải, bình giữ nhiệt…), hang-hoa (mặc định khi không xác định: bồn rửa, giàn tạ, tạ…). Quy tắc từ khóa ở `CONFIG.categories`.
- Nhân sự: đồng bộ từ Google Sheet HR (link chỉ lưu trên máy/admin, KHÔNG commit — repo public, sheet có SĐT/email/ngày sinh). Chỉ lấy Mã NV, Họ tên, Chi nhánh, Bộ phận, Vị trí, Trạng thái. 66 dòng/45 đang làm, Bảo hành + Kho vận, Đông Nam Bộ 1–4. Người kiểm: chọn danh sách hoặc gõ tay.
- Camera: khung 16:10 gọn (≤36dvh), zoom 1×/2×/3×(/5×) — zoom phần cứng nếu track hỗ trợ, không thì zoom số.
- Đã mở mạng cho kingsport.vn, xedienmove.vn (17/10/2026) → tải trực tiếp bằng curl được.
