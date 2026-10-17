// Cấu hình chung — sửa file này rồi push lên GitHub là app tự cập nhật.
export const CONFIG = {
  appName: 'Kiểm Kê Linh Kiện',
  company: 'Kingsport · Xe điện Move',
  version: '1.0.0',

  // URL Web App của Google Apps Script (xem backend/README.md).
  // Để trống => chạy chế độ DEMO, dữ liệu lưu trên trình duyệt của máy đang dùng.
  apiUrl: '',

  logos: {
    kingsport: 'assets/logo-kingsport.svg',
    move: 'assets/logo-xedienmove.svg',
  },

  // Bảng màu có sẵn. "kingsport" là mặc định cho giao diện sáng.
  // TODO: đối chiếu lại mã màu chính xác từ bộ nhận diện thương hiệu Kingsport / Move.
  palettes: {
    kingsport: { name: 'Kingsport', primary: '#E30613', accent: '#1F2A44' },
    move:      { name: 'Xe điện Move', primary: '#00A651', accent: '#0B3B2E' },
    ocean:     { name: 'Xanh biển', primary: '#0B6BCB', accent: '#0F2A4A' },
    sunset:    { name: 'Cam năng động', primary: '#F26A21', accent: '#3A2416' },
    violet:    { name: 'Tím', primary: '#6D4AFF', accent: '#231A4A' },
    graphite:  { name: 'Than chì', primary: '#334155', accent: '#0F172A' },
  },

  // Cột của file mẫu kiểm kê (import khi tạo đợt). Có thể thêm/bớt cột tùy ý,
  // các tên tương đương ở "aliases" sẽ được tự nhận diện khi import.
  template: {
    columns: ['Mã hàng', 'Tên hàng', 'ĐVT', 'Số lượng tồn', 'Đơn giá', 'Vị trí', 'Ghi chú'],
    aliases: {
      sku:   ['ma hang', 'ma', 'ma sp', 'ma linh kien', 'ma vat tu', 'ma vt', 'sku', 'code', 'item code', 'part no', 'part number'],
      name:  ['ten hang', 'ten', 'ten sp', 'ten linh kien', 'ten vat tu', 'mo ta', 'description', 'name'],
      unit:  ['dvt', 'don vi', 'don vi tinh', 'unit', 'uom'],
      qty:   ['so luong ton', 'so luong', 'sl', 'sl ton', 'ton', 'ton kho', 'ton so sach', 'qty', 'quantity'],
      price: ['don gia', 'gia', 'gia von', 'price', 'unit price'],
      bin:   ['vi tri', 'ke', 'vi tri ke', 'bin', 'location'],
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
