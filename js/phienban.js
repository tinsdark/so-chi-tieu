"use strict";
/* ====================================================================
   phienban.js — NHẬT KÝ CẬP NHẬT hiển thị ở Cài đặt → Ứng dụng → "Phiên bản và cập nhật".
   Mới nhất ở ĐẦU danh sách. Mỗi pull request làm thay đổi người dùng thấy thì thêm MỘT mục lên đầu (xem README mục 5).
   - ban: số phiên bản dạng năm.tháng.ngày (thêm .2, .3 nếu cùng ngày có nhiều bản); PHIEN_BAN lấy từ mục đầu.
   - muc: vài câu ngắn, viết cho người dùng (không nhắc tên hàm / file).
   Khác "mã bản" (APP_VER ở app.js, băm nội dung file, dùng để báo có bản mới): ban là số để người đọc biết mình đang ở đâu.
   ==================================================================== */

var NHAT_KY = [
  { ban: '2026.10.16.7', ngay: '2026-10-16', ten: 'Dòng tiền khớp số khi ghi trước cho tháng sau',
    muc: ['Dòng tiền → Theo tháng: khoản Cho vay hoặc Nhận tiền vay đã ghi trước cho một tháng sau giờ hiện đúng ở dòng của danh mục đó, không còn hiện 0 trong khi Tiền vào − ra đã tính khoản này.','Không xóa được danh mục đang dùng cho một khoản định kỳ (trước đây xóa được, rồi khoản định kỳ đó làm số tháng này lệch với các dòng). Xóa hoặc đổi danh mục của khoản định kỳ trước.'] },
  { ban: '2026.10.16.6', ngay: '2026-10-16', ten: 'Bảng thuật ngữ có thêm số nợ',
    muc: ['Cài đặt → Ứng dụng → "Các số trong app nghĩa là gì" giải thích thêm "Còn phải trả (gồm lãi)" và "Nợ sau khi trừ tiền cho vay".'] },
  { ban: '2026.10.16.5', ngay: '2026-10-16', ten: 'Thẻ Vay - Nợ gọn hơn',
    muc: ['Vay - Nợ: dòng "gốc … · lãi …" ngắn lại cho vừa một dòng; chỉ hiện "Nợ sau khi trừ tiền cho vay" khi có khoản cho vay chờ thu (không còn lặp lại đúng số nợ ở trên).'] },
  { ban: '2026.10.16.4', ngay: '2026-10-16', ten: 'Gọi tên các số nợ rõ hơn',
    muc: ['Vay - Nợ: "Còn nợ" đổi thành "Còn phải trả (gồm lãi)", có dòng tách phần gốc và phần lãi chưa tới hạn. "Nợ ròng" đổi thành "Nợ sau khi trừ tiền cho vay" để không nhầm với Tài sản ròng.','Báo cáo → Tài sản ròng: ghi rõ "Nợ gốc còn lại (chưa tính lãi)" và nhắc số nợ đầy đủ ở tab Vay - Nợ.'] },
  { ban: '2026.10.16.3', ngay: '2026-10-16', ten: 'Khóa thư viện Excel',
    muc: ['Thư viện đọc / ghi file Excel được kiểm tra chữ ký khi tải, tránh bị thay đổi nội dung giữa đường. Nhập và xuất Excel dùng như cũ; chưa tải được thư viện thì báo rõ thay vì lỗi khó hiểu.'] },
  { ban: '2026.10.16.2', ngay: '2026-10-16', ten: 'Mục Phiên bản và cập nhật',
    muc: ['Cài đặt → Ứng dụng có mục "Phiên bản và cập nhật": xem bản đang dùng, kiểm tra bản mới và đọc những gì đã đổi.'] },
  { ban: '2026.10.16', ngay: '2026-10-16', ten: 'Số liệu nhất quán, xuất / nhập file, người mới',
    muc: [
      'Sổ tay hiện số dư tới hôm nay, cùng số với Dòng tiền → Theo ngày. Khoản đã ghi trước cho ngày sau hiện ở dòng phụ.',
      'Khoản vay "Trả cố định/tháng": chọn cách chia gốc (SPayLater hay FE Credit) và xem lãi thực. "Trả 1 lần" nhập được lãi; thêm hình thức "Lãi hằng tháng, gốc cuối kỳ". Lịch trả làm tròn về đồng.',
      'Đổi tên "Dư thật" thành "Để dành được" (âm thì "Chi vượt thu"), "Cân đối" thành "Tiền vào − ra". Có bảng thuật ngữ ở Cài đặt → Ứng dụng.',
      'Tải toàn bộ dữ liệu về file .json trên máy và khôi phục từ file.',
      'Khóa PIN: sai 5 lần phải chờ, mỗi lần bị khóa chờ lâu hơn (30 giây đến 15 phút).',
      'Cảnh báo khi ví dùng hằng ngày ít tiền hơn mức "còn tiêu được".',
      'Thẻ "Bắt đầu" 3 bước cho tài khoản mới; chữ nhỏ trong app đọc rõ hơn.',
      'Báo cáo: thẻ biểu đồ gập thêm phần Thu theo danh mục, Số dư cuối tháng và Chi theo thứ sau một nút.'
    ] },
  { ban: '2026.10.15', ngay: '2026-10-15', ten: 'Báo cáo gọn hơn',
    muc: [
      'Báo cáo: thẻ đầu gọn lại, Hạn mức, Tài sản ròng, Mục tiêu hiện trước; Điều đáng chú ý, Ngày tự do, Tết, Nhãn nằm sau nút "Xem thêm".',
      'Biểu đồ chi tiêu: số dư cuối ngày, lịch chi tiêu, top ngày chi nhiều gập sau một nút.',
      'Sửa nút "Ghi khoản thu" bị mất chữ; Ghi nhanh hiện gợi ý "Khoản này ≈ … ngày tự do" cả với khoản thu.'
    ] },
  { ban: '2026.10.14', ngay: '2026-10-14', ten: 'Khoản định kỳ theo kỳ, dòng tiền rõ hơn',
    muc: [
      'Khoản định kỳ chia theo kỳ: đổi mức lương hay tiền nhà là thêm một kỳ mới, kỳ cũ vào mục Lưu trữ; sửa tháng / số tiền và xóa từng kỳ ngay trong form.',
      'Công tắc "Dùng làm dự báo" cho khoản định kỳ; "Chi cố định" thay tên cho "Khoản cố định".',
      'Dòng tiền: cột "Lũy kế" đổi tên thành "Số dư"; thêm cột Tài sản ròng dự kiến khi còn nợ hoặc cho vay.'
    ] }
];
var PHIEN_BAN = NHAT_KY[0].ban;
