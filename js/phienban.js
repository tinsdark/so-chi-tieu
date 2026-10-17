"use strict";
/* ====================================================================
   phienban.js — NHẬT KÝ CẬP NHẬT hiển thị ở Cài đặt → Ứng dụng → "Phiên bản và cập nhật".
   Mới nhất ở ĐẦU danh sách. Mỗi pull request làm thay đổi người dùng thấy thì thêm MỘT mục lên đầu (xem README mục 5).
   - ban: số phiên bản dạng năm.tháng.ngày (thêm .2, .3 nếu cùng ngày có nhiều bản); PHIEN_BAN lấy từ mục đầu.
   - muc: vài câu ngắn, viết cho người dùng (không nhắc tên hàm / file).
   Khác "mã bản" (APP_VER ở app.js, băm nội dung file, dùng để báo có bản mới): ban là số để người đọc biết mình đang ở đâu.
   ==================================================================== */

var NHAT_KY = [
  { ban: '2026.10.17', ngay: '2026-10-17', ten: 'Mở app là hiện sẵn bảng Ghi nhanh',
    muc: ['Cài đặt → Ứng dụng → Giao diện và làm mới có công tắc "Mở app là hiện sẵn bảng Ghi nhanh" (mặc định tắt, riêng từng máy). Bật lên thì mỗi lần mở app mới, bảng Ghi nhanh hiện sẵn trên Sổ tay: ghi xong bảng đóng và khoản vừa ghi hiện ở Sổ tay (có Hoàn tác); muốn vào xem thì chạm ra ngoài bảng hoặc bấm nút đóng. App hiện lại từ nền không tự bật bảng; có mã PIN thì mở khóa xong mới hiện bảng.'] },
  { ban: '2026.10.16.12', ngay: '2026-10-16', ten: 'Gỡ app con Ghi nhanh',
    muc: ['Gỡ app con "Ghi nhanh" trên màn hình chính: iPhone giữ bộ nhớ riêng cho từng biểu tượng nên nó không đọc được dữ liệu Sổ Tiền. Nếu đã thêm biểu tượng đó ra màn hình chính thì xóa đi. Ghi nhanh vẫn dùng trong app như thường, và ghi nhanh không cần mở app thì dùng Phím tắt (hướng dẫn trong README).'] },
  { ban: '2026.10.16.11', ngay: '2026-10-16', ten: 'Sửa Ghi nhanh trên màn hình chính bị trống',
    muc: ['Mở biểu tượng Ghi nhanh mà nó không thấy dữ liệu thì không còn hiện màn trống trơn, mà báo rõ lý do và cách ghi khác.'] },
  { ban: '2026.10.16.10', ngay: '2026-10-16', ten: 'Biểu tượng riêng cho Ghi nhanh',
    muc: ['App con Ghi nhanh trên màn hình chính có biểu tượng riêng: dấu cộng trên nền nâu, giống nút Ghi nhanh trong app, để không nhầm với biểu tượng Sổ Tiền.'] },
  { ban: '2026.10.16.9', ngay: '2026-10-16', ten: 'App con Ghi nhanh trên màn hình chính',
    muc: ['Có thể thêm một biểu tượng "Ghi nhanh" ra màn hình chính: mở là thấy ngay bảng Ghi nhanh giống hệt trong app, ghi xong hiện "Xong" (có Hoàn tác). Nó dùng chung dữ liệu với app chính, không giữ bản riêng. Địa chỉ và cách thêm ở Cài đặt → Ứng dụng.',
      'Hai bản app cùng ghi không còn đè nhau: app hiện lại hoặc sắp ghi nhanh thì tự lấy bản mới nhất trước. Ghi chú ở Cài đặt về app trên màn hình chính đã sửa cho đúng cách mở app mới.'] },
  { ban: '2026.10.16.8', ngay: '2026-10-16', ten: 'Mở app là vào thẳng, ghi nhanh bằng Phím tắt',
    muc: ['Mở app là vào thẳng bằng dữ liệu trên máy, không còn màn đăng nhập hay bảng chọn (chỉ máy mới chưa có dữ liệu mới hiện màn đầu). Google Drive là nơi đồng bộ: app tự đồng bộ khi còn phiên đăng nhập, không thì chạm dòng trạng thái trên đầu trang hoặc nút Đồng bộ ở Cài đặt. Chỉ hỏi khi cả máy này và Drive cùng có thay đổi.',
      'Ghi nhanh bằng Phím tắt trên iPhone, không cần mở app: mỗi khoản lưu thành một file nhỏ. Mở app, chọn các file đó ở nút nhập trong Sổ tay, xem danh sách kèm số tiền rồi tick khoản nào ghi. Hai khoản giống hệt trong ngày vẫn là hai khoản, chọn lại file cũ không bị ghi trùng. Cách dựng phím tắt nằm trong README.',
      'Đăng xuất ở Cài đặt giờ ghi rõ là xóa cả dữ liệu trên máy. Hết phiên Google không còn làm app thử đăng nhập lại liên tục, và lỗi tải Drive lúc mở app không còn làm mất phiên đăng nhập còn hạn.'] },
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
