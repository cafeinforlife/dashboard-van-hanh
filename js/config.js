// Cấu hình chung — sửa file này rồi push lên GitHub là app tự cập nhật.
export const CONFIG = {
  appName: 'Kiểm Kê Linh Kiện',
  company: 'Tập đoàn Đông Dương · Kingsport · Xe điện MOVE',
  version: '1.0.0',

  // URL Web App của Google Apps Script (xem backend/README.md).
  // Để trống => chạy chế độ DEMO, dữ liệu lưu trên trình duyệt của máy đang dùng.
  apiUrl: '',

  logos: {
    // Logo gốc tải từ kingsport.vn (/logo/LOGO-2.svg) và xedienmove.vn (logo-footer.png)
    kingsport: 'assets/logo-kingsport.svg',          // chữ đen — giao diện sáng
    kingsportDark: 'assets/logo-kingsport-dark.svg', // chữ trắng — giao diện tối (bản gốc)
    move: 'assets/logo-xedienmove.png',              // tối màu trên nền sáng; nền tối tự đảo trắng (bảng âm)
    dongduong: 'assets/logo-dongduong.svg',          // công ty mẹ
    dongduongIcon: 'assets/logo-dongduong-icon.svg',
  },

  // Thứ tự khu vực trong danh sách địa điểm (khu vực phụ trách lên đầu)
  regionOrder: ['Đông Nam Bộ', 'TP.HCM', 'Tây Nguyên', 'Nam Trung Bộ', 'ĐB Sông Cửu Long', 'Miền Trung', 'Bắc Trung Bộ', 'Miền Bắc'],

  // Icon ngành hàng: nhận theo nhóm hàng hoặc từ khóa trong tên hàng (không dấu).
  // Thứ tự = ưu tiên (mục trên khớp trước). Không khớp mục nào → icon "Hàng hóa khác".
  categories: [
    { key: 'thiet-bi-y-te', label: 'Thiết bị y tế', file: 'thiet-bi-y-te.svg',
      words: ['huyet ap', 'xe lan', 'giuong dien', 'giuong co', 'giuong y te', 'giuong benh', 'ghe bo', 'ghe tap di', 'khung tap di', 'nhiet ke', 'may do duong huyet', 'can suc khoe'] },
    { key: 'qua-tang', label: 'Quà tặng', file: 'qua-tang.svg',
      words: ['qua tang', 'bong yoga', 'tham yoga', 'yoga', 'con lan tap bung', 'con lan tro luc', 'con lan bung', 'ao trum', 'bat ao trum', 'ao mua', 'non bao hiem', 'mu bao hiem', 'tui vai', 'tui xach', 'binh giu nhiet', 'ly giu nhiet', 'coc giu nhiet', 'tham trai san', 'gift'] },
    { key: 'xe-dien', label: 'Xe điện', words: ['xe may dien', 'xe dap dien', 'xe dien', 'move'] },
    { key: 'ghe-massage', label: 'Ghế massage', words: ['ghe massage', 'ghe mat xa'] },
    { key: 'may-chay-bo', label: 'Máy chạy bộ', words: ['may chay bo', 'bang tai', 'chay bo'] },
    { key: 'xe-dap-tap', label: 'Xe đạp tập', words: ['xe dap tap', 'xe dap the duc', 'xe dap'] },
    { key: 'sung-massage', label: 'Súng massage', words: ['sung massage', 'may massage cam tay', 'massage'] },
  ],
  otherCategory: { key: 'hang-hoa', label: 'Hàng hóa khác', file: 'hang-hoa.svg' },

  // Nhân sự: đồng bộ từ Google Sheet (link nhập trong Danh mục → Nhân sự, KHÔNG lưu vào mã nguồn
  // vì bảng có thông tin cá nhân). Tên cột tự nhận diện:
  staffSheetColumns: {
    code: ['ma nv', 'ma nhan vien', 'msnv', 'code'], name: ['ho va ten', 'ho ten', 'ten nhan vien', 'name'],
    branch: ['chi nhanh'], dept: ['bo phan', 'phong ban'], title: ['vi tri', 'chuc danh', 'chuc vu'], status: ['trang thai'],
  },

  // Bảng màu có sẵn. "kingsport" là mặc định cho giao diện sáng.
  // Kingsport: màu primary trên kingsport.vn. MOVE: Brand Guideline 2026.
  palettes: {
    kingsport: { name: 'Kingsport', primary: '#CC2338', accent: '#1A1A1A' },
    kingsportGold: { name: 'Kingsport Vàng', primary: '#CC2338', accent: '#B08D00' },
    dongduong: { name: 'Đông Dương', primary: '#DE3024', accent: '#4392D4' },
    // Theo MOVE Brand Guideline 2026: MOVE Red #BE0000, Black #0B1718, Purple #A331F4
    move:      { name: 'MOVE Red', primary: '#BE0000', accent: '#0B1718' },
    movePurple:{ name: 'MOVE Purple', primary: '#A331F4', accent: '#0B1718' },
    ocean:     { name: 'Xanh biển', primary: '#0B6BCB', accent: '#0F2A4A' },
    sunset:    { name: 'Cam năng động', primary: '#F26A21', accent: '#3A2416' },
    violet:    { name: 'Tím', primary: '#6D4AFF', accent: '#231A4A' },
    graphite:  { name: 'Than chì', primary: '#334155', accent: '#0F172A' },
  },

  // Cột của file mẫu kiểm kê (import khi tạo đợt). Có thể thêm/bớt cột tùy ý,
  // các tên tương đương ở "aliases" sẽ được tự nhận diện khi import.
  template: {
    columns: ['Mã hàng', 'Tên hàng', 'ĐVT', 'Số lượng tồn', 'Đơn giá', 'Vị trí', 'Ghi chú'],
    // Thứ tự = độ ưu tiên. Đã gồm tên cột báo cáo Nhập-Xuất-Tồn và bảng giá xuất từ ERP (Business Central).
    aliases: {
      sku:   ['ma hang', 'ma sp', 'ma san pham', 'ma linh kien', 'ma vat tu', 'ma vt', 'product no', 'item no', 'sku', 'code', 'item code', 'part no', 'part number', 'ma', 'item'],
      name:  ['ten hang', 'ten quy cach', 'ten sp', 'ten san pham', 'ten linh kien', 'ten vat tu', 'item description', 'description', 'mo ta', 'name', 'ten'],
      unit:  ['dvt', 'don vi tinh', 'don vi', 'unit of measure code', 'unit of measure', 'uom', 'unit'],
      qty:   ['so luong cuoi ky', 'ton cuoi ky', 'ending balance', 'so luong ton', 'sl ton', 'ton kho', 'ton so sach', 'so luong', 'sl', 'ton', 'qty', 'quantity'],
      price: ['don gia', 'unit price', 'gia ban', 'gia von', 'gia', 'price'],
      bin:   ['vi tri', 'vi tri ke', 'ke', 'bin', 'location'],
      note:  ['ghi chu', 'note', 'notes'],
    },
  },

  // Nhận diện văn bản (OCR)
  ocr: {
    // Ký tự cho phép trong mã hàng — giới hạn để OCR chính xác hơn.
    whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-./_',
    minScore: 0.72,      // ngưỡng khớp tối thiểu để gợi ý
    autoAcceptScore: 0.92, // ngưỡng tự nhận khi bật chế độ quét liên tục
    scanIntervalMs: 900,
  },
};
