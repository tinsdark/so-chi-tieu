"use strict";
/* ====================================================================
   phienban.js — NHẬT KÝ CẬP NHẬT hiển thị ở Cài đặt → Ứng dụng → "Phiên bản và cập nhật".
   Mới nhất ở ĐẦU danh sách. Mỗi pull request làm thay đổi người dùng thấy thì thêm MỘT mục lên đầu (xem README mục 3).
   - ban: số phiên bản dạng năm.tháng.ngày (thêm .2, .3 nếu cùng ngày có nhiều bản); PHIEN_BAN lấy từ mục đầu.
   - muc: vài câu ngắn, viết cho người dùng (không nhắc tên hàm / file).
   Khác "mã bản" (APP_VER ở app.js, băm nội dung file, dùng để báo có bản mới): ban là số để người đọc biết mình đang ở đâu.
   ==================================================================== */

var NHAT_KY = [
  { ban: '2026.10.22', ngay: '2026-10-22', ten: 'Khoá phóng to màn hình',
    muc: ['Không còn véo hai ngón hay chạm đúp để phóng to trang nữa, tránh lỡ tay làm lệch giao diện. Cuộn vẫn bình thường.'] },
  { ban: '2026.10.20.3', ngay: '2026-10-20', ten: 'Dự kiến tháng đang chạy: khoản định kỳ lấy đúng số tiền',
    muc: ['Ở tháng đang chạy, danh mục có khoản định kỳ bật "Dùng làm dự báo" (lương, tiền nhà...) lấy đúng số tiền của kỳ, không bị trung bình các tháng trước kéo lệch. Ví dụ lương định kỳ 9.400.000 mà tháng trước thực nhận 12.000.000 thì tháng này vẫn dự kiến 9.400.000.'] },
  { ban: '2026.10.20.2', ngay: '2026-10-20', ten: 'Dự kiến các tháng sau: trung bình 3 tháng liền trước',
    muc: ['Dự kiến của từng danh mục là trung bình 3 tháng liền trước. Tháng trước tháng bắt đầu tính dự kiến lấy Hạn mức, tháng đã hết lấy số thực tế, tháng chưa hết (đang chạy hoặc ở tương lai) lấy số dự kiến của chính nó. Ví dụ bắt đầu từ tháng 10: tháng 11 = (tháng 10 + 2 × hạn mức) / 3, tháng 12 = (tháng 10 + tháng 11 + hạn mức) / 3.',
      'Nhờ vậy dự kiến chỉ dùng số thật của tháng sau khi tháng đó chạy xong, không lấy số dở dang của tháng đang chạy làm căn cứ cho tháng sau.',
      'Danh mục "Không tính dự kiến" (thưởng, thu nhập ngoài...) không mang số của tháng này sang tháng sau. Riêng khoản định kỳ có bật "Dùng làm dự báo" vẫn lấy đúng số tiền theo từng kỳ, kể cả tháng đang chạy, và hết kỳ (Dừng) thì không tính nữa.'] },
  { ban: '2026.10.20', ngay: '2026-10-20', ten: 'Dự kiến cuối tháng tính theo hạn mức',
    muc: ['Số dư và "Tiền vào − ra" dự kiến cuối tháng không còn bỏ sót khoản chưa phát sinh. Tháng đang chạy, mỗi danh mục thu hoặc chi lấy số lớn hơn giữa thực tế và hạn mức: chưa tới hạn mức thì lấy đúng hạn mức, vượt rồi thì lấy số đã vượt. Danh mục "Không tính dự kiến" chỉ lấy số đã ghi.',
      'Các tháng sau: tháng đầu kỳ lấy theo hạn mức, từ khi có tháng đã qua thì lấy trung bình thực tế (tối đa 3 tháng liền trước). Ví dụ sang tháng 11 thì dự kiến theo đúng số thực tế đã phát sinh của tháng 10, tháng 12 theo trung bình tháng 10 và 11.',
      'Khoản định kỳ chưa ghi không bị cộng thêm lần nữa vào hạn mức đã có. Trả nợ vẫn lấy theo lịch Vay - Nợ như trước.'] },
  { ban: '2026.10.19.5', ngay: '2026-10-19', ten: 'Logo to hơn và canh giữa',
    muc: ['Logo trong biểu tượng ứng dụng, tab trình duyệt, thanh tiêu đề và màn hình khóa được phóng to hơn và canh giữa theo cột D và C, để thanh T dài thò sang trái không làm logo lệch về một bên.'] },
  { ban: '2026.10.19.4', ngay: '2026-10-19', ten: 'Đổi logo và biểu tượng ứng dụng',
    muc: ['Ứng dụng có logo mới: ba chữ cái chung một thân dọc, nâu đậm trên nền be. Biểu tượng cài lên màn hình điện thoại, tab trình duyệt, thanh tiêu đề và màn hình khóa đều đổi theo.',
      'Máy đã cài ứng dụng có thể mất một lúc mới thấy biểu tượng mới trên màn hình chính; gỡ rồi thêm lại là thấy ngay.'] },
  { ban: '2026.10.19.3', ngay: '2026-10-19', ten: 'Mở bảng thêm mới không tự bật bàn phím',
    muc: ['Mở bất kỳ bảng nào (Ghi nhanh, thêm giao dịch định kỳ, Tạo QR, Tất toán, hộp thoại hỏi số, tìm kiếm...) không còn tự nhảy vào ô nhập và bật bàn phím. Bảng mở ở trạng thái bình thường, chạm vào ô nào thì nhập ô đó.'] },
  { ban: '2026.10.19.2', ngay: '2026-10-19', ten: 'Thẻ QR: gộp Lưu ảnh và Chia sẻ thành một nút',
    muc: ['Thẻ QR chỉ còn một nút "Lưu / Chia sẻ", vì trên iPhone hai nút cũ đều mở cùng một bảng chia sẻ. Bấm vào, chọn "Lưu hình ảnh" để lưu vào thư viện Ảnh, hoặc chọn Zalo, Tin nhắn... để gửi cho người chuyển tiền. Máy tính thì tải ảnh về.',
      'Nhấn giữ vào ảnh QR sẽ sao chép ảnh, rồi dán thẳng vào Zalo hoặc Tin nhắn để gửi.'] },
  { ban: '2026.10.19', ngay: '2026-10-19', ten: 'Tạo QR nhận tiền; chọn nguồn tiền khi duyệt khoản ghi lúc khóa',
    muc: ['Sổ tay có nút QR: chọn loại (Thu nợ vay hoặc Nhận tiền khác như chia bill), nhập số tiền và ghi chú rồi bấm Tạo QR để ra mã VietQR đúng số tiền đó. Thu nợ vay có ô chọn khoản cho vay, chọn xong tự điền số còn lại. Có nút Lưu ảnh và Chia sẻ (iPhone chọn "Lưu hình ảnh" để vào thư viện Ảnh).',
      'Cài tài khoản nhận tiền một lần ở Cài đặt → Tiền → QR nhận tiền: chọn ngân hàng và nhập số tài khoản. Mã tạo ngay trên máy, số tài khoản không gửi cho ai.',
      'Mỗi mã vừa tạo thành một thông báo "Có 1 khoản tiền cần xác nhận" ở chuông. Bấm vào thì tới đúng nơi ghi: thu nợ vay mở Tất toán khoản cho vay đã điền sẵn số, nhận tiền khác mở Ghi nhanh khoản thu đã điền sẵn. Ghi xong thông báo tự hết, hoặc bấm Bỏ.',
      'Bước "Duyệt khoản ghi lúc khóa" có thêm ô chọn nguồn tiền cho từng khoản (khi có từ 2 ví), và ô đặt một lượt cho tất cả. Trước đây mọi khoản đều vào ví mặc định.'] },
  { ban: '2026.10.17.3', ngay: '2026-10-17', ten: 'Giờ ghi cho mọi khoản, gợi ý số tiền; nút dễ bấm hơn',
    muc: ['Mỗi khoản trong Sổ tay có thêm giờ ghi ở dòng phụ (ví dụ "07:42 · Ăn"), để phân biệt những dòng cùng danh mục không có ghi chú. Khoản ĐÃ GHI TRƯỚC ĐÂY cũng có giờ, không cần làm gì, và máy khác đồng bộ về cũng thấy. Chỉ hiện khi khoản được ghi đúng ngày của nó: ghi bù cho hôm qua hoặc ngày khác thì không hiện giờ. Khoản ghi trên màn khóa lấy giờ lúc ghi, không phải lúc duyệt. Giờ là lúc khoản được tạo trong app, nên khoản nhập từ file hay giao dịch định kỳ ghi trong ngày cũng hiện giờ lúc bấm.',
      'Trên điện thoại, các nút nhỏ dễ bấm hơn: ba nút đầu trang, dòng "Đã lưu trên máy · chưa đồng bộ Drive", nút Đồng bộ ở dòng nhắc và nút ‹ › chọn tháng. Nhìn vào gần như không đổi, chỉ vùng bấm rộng ra, và không chồng lên nút bên cạnh nên không còn bấm nhầm sang đồng bộ.',
      'Ghi nhanh gợi ý số tiền hay ghi: dưới ô số tiền có tối đa 3 số bạn hay ghi nhất ở danh mục đang chọn (trong 180 ngày gần nhất, số nào từ 2 lần trở lên). Chạm một số thì nó được điền vào ô để bạn sửa rồi mới bấm Ghi. Đổi danh mục thì các số đổi theo; danh mục chưa có thói quen thì không hiện. Ghi trên màn khóa không hiện gợi ý này vì nó lấy từ lịch sử.'] },
  { ban: '2026.10.17.2', ngay: '2026-10-17', ten: 'Màn khóa: Ghi nhanh không bị Face ID che',
    muc: ['Khi bật "Ghi nhanh ngay trên màn khóa", app không tự quét Face ID lúc mở nữa (hộp thoại Face ID của iPhone phủ kín màn hình và che mất nút Ghi nhanh). Muốn mở khóa bằng Face ID thì chạm biểu tượng ở bàn phím số. Công tắc tắt thì vẫn tự quét như cũ.',
      'Biểu tượng mở khóa bằng Face ID / vân tay ở bàn phím số đổi từ vân tay thành con mắt.'] },
  { ban: '2026.10.17', ngay: '2026-10-17', ten: 'Ghi nhanh ngay trên màn khóa',
    muc: ['Cài đặt → Ứng dụng → Khóa app có công tắc "Ghi nhanh ngay trên màn khóa" (mặc định tắt, riêng từng máy). Bật lên thì màn khóa có nút Ghi nhanh: ghi không cần nhập mã PIN, nhưng bảng ghi không hiện số dư hay lịch sử, và khoản ghi chỉ vào hàng chờ, chưa vào sổ.',
      'Nhập mã PIN xong sẽ hiện bước "Duyệt khoản ghi lúc khóa": các khoản được tick sẵn, bỏ tick khoản không phải của bạn rồi bấm "Ghi N khoản vào sổ". Khoản không tick bị bỏ. Chưa duyệt xong thì Sổ tay nhắc còn bao nhiêu khoản chờ.'] },
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
