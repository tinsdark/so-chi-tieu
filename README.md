# Sổ Chi Tiêu

Web app quản lý chi tiêu cá nhân bằng tiếng Việt. Chạy hoàn toàn trên trình duyệt (HTML + CSS + JavaScript thuần, **không framework, không build, không server riêng**). Dữ liệu lưu trong **Google Drive của chính người dùng**, dùng được như app trên điện thoại (PWA) và mở được cả khi mất mạng.

---

## 1. Project đã có gì

### 6 tab chính

| Tab | Phím tắt | Nội dung |
|---|---|---|
| **Sổ tay** | `1` | Ghi giao dịch thu/chi theo ngày. Thẻ đầu là số dư (chọn tháng, đầu tháng / cuối tháng, thanh thu-chi). **Ghi nhanh**: thanh nổi phía trên thanh tab, chạm mở bảng trượt từ đáy (số tiền, danh mục, ví, ghi chú, 1 nút Lưu); bấm vào một ngày để sửa cả ngày trong form đầy đủ. Số dư theo từng ví và chuyển tiền giữa các ví, nhắc **giao dịch định kỳ** đến hạn, tìm kiếm / lọc, xuất Excel, nhập từ file CSV/Excel, vuốt ngày để sửa/xóa, hoàn tác khi xóa. |
| **Dòng tiền** | `2` | Ba chế độ: **Theo ngày** (xem mục 1, "Theo dõi theo ngày"), **Theo tháng** và **Mô phỏng**. **Theo tháng** (trước gọi là "Thực tế & dự kiến"): chọn tháng, Cân đối tháng (thiếu / dư), thanh Thu / Chi / Trả nợ, thu và chi theo danh mục chia nhóm "Cần chú ý" / "Ổn" (chạm một dòng để xem 4 số chi tiết, vượt hạn mức có chip "Vượt X"), **Dòng tiền tích lũy tương lai** (chọn 6 / 12 / 24 tháng: số tích lũy cuối kỳ, mức thấp nhất, biểu đồ, bảng Tháng / Cân đối / Lũy kế đủ số tháng đã chọn; chạm một dòng để chọn tháng), bảng cả năm sau nút "Xem bảng cả năm". **Mô phỏng**: vùng nháp để thử số liệu mà không đụng dữ liệu thật, thêm điều chỉnh (thu/chi một lần, lặp lại mỗi tháng, **vay thêm** tự tính số trả và tổng lãi, trả hết khoản vay sớm), bật/tắt từng điều chỉnh, so sánh với dữ liệu gốc 6 / 12 / 24 / 36 tháng. |
| **Báo cáo** | `3` | Thẻ đầu theo tháng, theo dõi **hạn mức** từng danh mục chi, **tài sản ròng** (tiền các ví + cho vay chưa thu − nợ gốc), **mục tiêu tiết kiệm** (tiến độ, cần để dành mỗi tháng bao nhiêu), biểu đồ chi tiêu (Tổng quan / Danh mục / Xu hướng), so sánh tháng với cùng kỳ. |
| **Vay - Nợ** | `4` | **Cho vay** và **vay phải trả** (ngân hàng / ví / bạn bè / người thân). Hình thức trả: 1 lần, không lãi, có lãi, trả cố định/tháng, gốc đều lãi giảm dần. Thẻ tổng quan (còn nợ, cho vay chờ thu, nợ ròng, tháng này cần trả / đã trả, dự kiến hết nợ), thẻ "Sắp đến hạn / quá hạn", mỗi khoản là một thẻ với **lịch trả theo từng kỳ** (đã trả đủ / xong kỳ nhưng thiếu / trả dở / chưa trả), ghi nhận trả (trả một phần hoặc đóng kỳ), tất toán sớm, **Bảng theo dõi** (chọn 6 / 12 / 24 tháng): mỗi tháng một dòng, 2 cột Số tiền trả (các kỳ trả nợ) và Số tiền thu (cho vay), dạng "đã / dự kiến": số nhỏ là tiền THẬT đã trả / thu, số to là dự kiến; lần trả / thu đã hoàn thành (kỳ đã đóng, khoản cho vay thu đủ hoặc xóa nợ) có nhãn **Done** ở góc trên phải ô, kể cả khi tiền thật ít hơn dự kiến (2.900.000 / 3.000.000 · Done). Chạm một tháng để xem từng khoản; kỳ quá hạn chưa xong dồn vào tháng này. Dòng tiền cả sổ (thu chi sinh hoạt, số dư lũy kế) xem ở tab Dòng tiền. Ghi thu/trả tự hạch toán sang Sổ tay. Thêm/sửa khoản vay có khối xem trước số trả mỗi tháng, tổng lãi, tháng trả xong. |
| **Công cụ** | `5` | Công cụ hỗ trợ quyết định, không phải sổ ghi: **Muốn mua / Mua được không**, **Giờ công**, **Lời hứa** (xem mục 1, "Tính năng nền tảng"). |
| **Cài đặt** | `6` | Ba khối. **Danh mục**: thu / chi (tên, màu, hạn mức tháng, "Không tính dự kiến", "Cố định theo Hạn mức", kéo thả đổi thứ tự). **Tiền & kế hoạch**: số dư đầu kỳ, ví (mặc định, để dành), chốt số dư, giao dịch định kỳ (chỉ nhắc, không tự ghi), mục tiêu tiết kiệm (gắn ví hoặc tự gom). **Ứng dụng**: cài lên màn hình chính, sao lưu / khôi phục, khóa app, đăng xuất. |

Phím tắt khác (desktop): `N` thêm giao dịch, `/` tìm trong Sổ tay, `?` xem bảng phím tắt, `Esc` đóng hộp thoại.

### Tính năng nền tảng

- **Nhắc thu/chi theo ngày của danh mục.** Mỗi danh mục thu/chi (trừ danh mục hệ thống của Vay - Nợ) có ô "Ngày thu/chi hằng tháng" (`cat.ngay`, 1–31): Tiền nhà ngày 5, Lương ngày 20... Trong vòng 7 ngày trước hạn, thẻ tổng quan Sổ tay hiện chip "N khoản thu/chi sắp đến hạn"; bấm mở bảng trượt từ đáy (giống Ghi nhanh) liệt kê từng khoản, có nút **Ghi** mở Ghi nhanh với đúng danh mục đó. Hết nhắc khi tháng này đã có giao dịch ở danh mục đó (quá hạn mà chưa ghi thì nhắc "Quá hạn N ngày" suốt tháng); đã ghi rồi thì cuối tháng nhắc kỳ tháng sau. Mỗi dòng trong bảng còn có nút **Hoàn thành**: chỉ tắt nhắc kỳ đó (lưu `cat.xong = ['YYYY-MM', ...]`, giữ 6 tháng gần nhất), KHÔNG ghi giao dịch hay đổi số dư; có Hoàn tác ở toast. Số khoản này cũng hiện thành badge đỏ trên tab Sổ tay (thấy được từ mọi tab). Chỉ nhắc trong app, chưa phải thông báo đẩy (xem 7.1). Code ở `js/nhachan.js`.
- **Nhãn (tag) cho giao dịch.** Ô "Nhãn" ở Ghi nhanh (giữ nguyên sau mỗi lần ghi để ghi liền cả chuyến đi) và khi sửa một dòng; nhiều nhãn cách nhau bằng dấu phẩy. Lưu ở `it.nhan` (mảng chữ, không có nhãn thì không có trường), hai tên chỉ khác hoa/thường là một nhãn. Thẻ **Theo nhãn** ở Báo cáo: tổng chi / thu, số khoản, khoảng ngày, chạm để xem từng khoản, đổi tên / gộp, gỡ nhãn. Tìm ở Sổ tay cũng tìm theo nhãn. Nhãn không đổi số dư hay hạn mức.
- **Xuất nhắc việc ra Lịch (.ics).** Tab Cài đặt → khối Ứng dụng → "Nhắc việc lên Lịch" → Xuất file .ics. Gồm (12 tháng tới, chỉ từ hôm nay): kỳ trả nợ chưa đóng, ngày dự kiến thu của khoản cho vay, danh mục có ngày thu/chi (bỏ tháng đã ghi / đã Hoàn thành), giao dịch định kỳ đang bật. Sự kiện cả ngày, mỗi cái có 2 báo thức (9:00 sáng hôm trước, 8:00 sáng đúng ngày). Là ảnh chụp lúc xuất, đổi dữ liệu thì xuất lại; mỗi sự kiện có UID cố định nên nhập lại không bị nhân đôi. Trên điện thoại có Web Share thì mở bảng chia sẻ, không thì tải file về. Code ở `js/lich.js`. File sinh ra đã được kiểm bằng thư viện đọc iCalendar; **việc iOS có giữ báo thức khi nhập, và PWA mở từ màn hình chính có giao file được không, chưa kiểm trên máy thật.**
- **Đối soát số dư ví.** Tab Cài đặt → thẻ Ví → nút **Đối soát** trên từng ví (mỗi ví hiện "Trong sổ X · Đối soát dd/mm · khớp / lệch ±Y"). Nhập số dư thật (nhìn ở app ngân hàng, đếm tiền mặt) và ngày (mặc định là NGÀY CUỐI THÁNG hiện tại); app so với số trong sổ tới hết ngày đó, báo khớp hay lệch bao nhiêu. Hai nút: **Ghi nhận đối soát** (chỉ lưu lịch sử `w.doiSoat`, 12 lần gần nhất, sổ không đổi, để tự đi tìm khoản ghi sót) và **Tạo khoản điều chỉnh** (ví thật nhiều hơn → khoản thu, ít hơn → khoản chi, danh mục hệ thống "Điều chỉnh số dư" `dieuChinh` tự tạo lần đầu, ẩn khỏi Ghi nhanh, không tính dự báo; là dòng bình thường, sửa/xóa được ở Sổ tay). Có xác nhận và Hoàn tác. Chưa có nhắc đối soát định kỳ.
- **Thẻ tín dụng / ví trả sau.** Một ví có thể bật "Thẻ tín dụng / ví trả sau" (tab Cài đặt → sửa ví): đặt hạn mức thẻ (không bắt buộc), ngày sao kê, ngày đến hạn thanh toán. Quẹt thẻ là khoản chi ghi vào ví thẻ nên ví thẻ ÂM = dư nợ; chi vẫn tính vào THÁNG MUA (đúng cho hạn mức và báo cáo) và tổng số dư giảm ngay vì nợ thẻ là nợ thật. **Thanh toán thẻ** (nút trên thẻ ví) là CHUYỂN VÍ từ ví thường sang ví thẻ: không phải chi nên không bị tính hai lần, tổng số dư không đổi; có Hoàn tác. Thẻ ví hiện dư nợ / hạn mức / còn dùng, số sao kê gần nhất, số còn phải trả và hạn (quá hạn chuyển màu); thẻ còn phải trả mà hạn trong 7 ngày (hoặc quá hạn) hiện chip "N thẻ sắp đến hạn thanh toán" ở thẻ tổng quan Sổ tay. Dư nợ vượt hạn mức thẻ thì cảnh báo khi ghi chi (ví thẻ âm là bình thường nên không cảnh báo "ví âm"). Mọi số tính lại từ giao dịch, không lưu thêm. Thẻ đang nợ từ trước khi dùng sổ: nhập số dư đầu kỳ của ví là số ÂM. Chưa có: lãi / phí trả chậm, trả góp, số tiền thanh toán tối thiểu. Code ở `js/thetindung.js`.
- **Mức tiêu mỗi ngày.** Thẻ tổng quan Sổ tay (tháng hiện tại, khi có hạn mức): "Hôm nay còn tiêu được", mức/ngày = (tổng hạn mức tiêu hằng ngày − đã chi trước hôm nay) ÷ số ngày còn lại tính cả hôm nay, số đầu ngày nên cả ngày không đổi. **Khoản cố định không vào mức này** (nếu vào, tiền nhà ăn hết hạn mức): danh mục cố định là danh mục bật "Khoản cố định" (xem mục Tách chi cố định bên dưới); danh mục hệ thống (Trả nợ, Cho vay...) và "Không tính dự kiến" cũng loại. Phần cố định còn phải ra tháng này (hạn mức chưa chi hoặc định kỳ chưa ghi, kỳ trả nợ chưa đóng) hiện ở dòng riêng để biết, không trừ vào mức hằng ngày. Danh mục không đặt hạn mức không có trong con số. Chưa có hạn mức tiêu hằng ngày nào thì không hiện gì thay vì đoán. Code ở `sotay.js` (`tieuMoiNgay`).
- **Theo dõi theo ngày** (Dòng tiền → Theo ngày; từ Sổ tay bấm "Xem theo ngày" ở khối Hôm nay còn tiêu được). Ba thẻ, mỗi thẻ một việc. **Hôm nay**: còn tiêu được (cùng công thức với Sổ tay), chuỗi ngày liên tiếp trong mức tới hôm qua, đang dư / vượt bao nhiêu so với nhịp đều (hạn mức × số ngày đã qua ÷ số ngày của tháng). **Từng ngày**: lịch tháng này, ngày trong mức xanh / vượt mức đỏ, chạm một ngày xem chi / mức của ngày đó (mức ngày d = phần hạn mức còn lại đầu ngày ÷ số ngày còn lại; dùng hạn mức hiện tại cho cả ngày đã qua). **Tiền 30 ngày tới**: số dư dự kiến từng ngày từ tổng số dư các ví hết hôm nay, biểu đồ, ngày thấp nhất, cảnh báo "Có thể thiếu tiền từ ..." nếu xuống dưới 0, danh sách các ngày có tiền vào / ra. Tính: chi hằng ngày theo mức/ngày (chưa có hạn mức thì theo nhịp thực tế), lương / khoản thu có ngày (ngày đã qua mà chưa ghi thì không giả định là có, có ghi chú), trả nợ theo lịch (kỳ quá hạn tính vào hôm nay), khoản cố định theo định kỳ hoặc "Ngày chi hằng tháng" (chưa có ngày thì tính vào hôm nay / ngày 1 tháng sau), thu hồi cho vay đúng hẹn, khoản đã ghi trước. Chỉ đọc dữ liệu. Code ở `js/theongay.js`.
- **Tổng kết tháng** (tab Báo cáo, chỉ tháng ĐÃ KẾT THÚC; chọn tháng bằng thanh tháng sẵn có). Một thẻ ngay dưới thẻ đầu: thu − chi, chi hằng ngày so với hạn mức kèm số ngày trong mức, chi cố định, trả nợ và nợ gốc còn lại (giảm / tăng bao nhiêu so với đầu tháng), tài sản ròng cuối tháng so với tháng trước, danh mục chi hằng ngày tăng mạnh nhất. Sổ tay chỉ có chip "Tổng kết tháng N ›" trong 7 ngày đầu tháng để dẫn sang. Tháng nằm TRƯỚC "Ngày bắt đầu" của sổ vẫn tổng kết được (giao dịch còn nguyên), chỉ bỏ dòng tài sản ròng vì số dư chỉ tính từ ngày bắt đầu. Số ngày trong mức tính theo hạn mức HIỆN TẠI nên đổi hạn mức rồi xem lại tháng cũ thì số này đổi theo. Chỉ đọc dữ liệu. Code ở `js/tongket.js`.
- **Ẩn số tiền.** Nút con mắt trên đầu trang: mọi số tiền trên màn hình thành "•••••" (cả trục / chú thích biểu đồ, toast), %, ngày, số ngày vẫn hiện. Riêng từng máy (localStorage, như chế độ tối). Che ở tầng hiển thị (`anSoChuoi` ở `state.js` + MutationObserver ở `ui.js`), KHÔNG sửa `fmt()` vì `fmt()` còn dùng để ghi ghi chú vào dữ liệu (ghi định kỳ, nhập sao kê, file .ics). Ô nhập tiền vẫn hiện số thật khi đang gõ.
- **Lịch tiền theo từng ví (cảnh báo ví thiếu tiền).** Ở Dòng tiền → Theo ngày → "Tiền 30 ngày tới" có bộ chọn **Tổng | từng ví** (không gồm thẻ tín dụng). Chọn một ví thì thấy số dư dự kiến RIÊNG của ví đó, ngày thấp nhất, và nếu ví xuống dưới 0 thì báo rõ khoản nào làm ví âm, thiếu bao nhiêu, kèm nút "Chuyển X vào ví này" mở sẵn form Chuyển ví (ví nhận và số tiền điền sẵn). Mục đích: tổng các ví đủ nhưng ví dùng để trả nợ (VD Techcombank) có thể thiếu tiền đúng ngày trả. Mỗi khoản thu / chi đi theo ví của nó (khoản vay, định kỳ, dòng đã ghi trước); **khoản không có ví riêng (lương, khoản cố định theo hạn mức) tính vào ví mặc định**; chuyển ví đã ghi trước tính hai đầu; thanh toán thẻ đến hạn **giả định trả từ ví mặc định** (chưa biết sẽ trả từ ví nào); chi hằng ngày chia theo **tỉ lệ ví trong chi hằng ngày 30 ngày qua** (ước lượng, ghi rõ trên màn). Có từ 2 ví mà có ví sắp thiếu thì Sổ tay hiện chip "Ví X có thể thiếu tiền từ dd/mm". Chế độ Tổng giữ nguyên cách tính cũ. Code ở `theongay.js` (`tnLichTien(homNay, soNgay, viId)`, `tnViSapThieu`, `tnTiLeViHangNgay`).
- **Tổng kết quả tìm / lọc.** Khi tìm theo từ khóa và / hoặc lọc danh mục ở Chi tiết theo ngày có dòng tổng: "N khoản trong M ngày · chi X · TB Y/khoản", kèm số tháng trước để so (không so khi lọc theo khoảng ngày), và mục "Cách tính". Cộng đúng các DÒNG khớp chứ không phải cả ngày có dòng khớp (`locTongKet` ở `sotay.js`). Tìm vẫn chỉ tìm trong ghi chú và nhãn của dòng, không tìm theo tên danh mục.
- **Giải thích bằng số thật.** Mỗi con số được tính toán đều có lời giải thích gồm 2 phần: cách tính bằng chữ và PHÉP TÍNH BẰNG CHÍNH SỐ TRÊN MÀN HÌNH (VD "Dư thật: 80.000 − 1.212.600 = −1.132.600"; "Số dư hiện tại: đầu tháng 2.956.343 − 1.132.600 + 11.479.827 = 13.303.570"). Lời giải thích CHỈ hiện khi bấm vào mục "Cách tính..." / ghi chú ⓘ (luôn gập sẵn, không hiện sẵn dòng nào để màn hình không dài thêm). Mục gập "Cách tính các số này" có ở: thẻ đầu Sổ tay, thẻ đầu Báo cáo, Tổng kết tháng, Tài sản ròng, Xu hướng (tiết kiệm TB), Mục tiêu tiết kiệm, Dòng tiền Theo tháng (Cân đối, thu / chi dự kiến, số dư lũy kế), Theo ngày (hôm nay, chuỗi, nhịp đều, mức từng ngày, lịch tiền 30 ngày), thẻ đầu Vay - Nợ (còn nợ, còn nợ so với nợ gốc ở Tài sản ròng, tháng cần trả, nợ ròng), Thanh toán thẻ. Các ghi chú giải thích khái niệm ở tab Cài đặt / Vay - Nợ / Dòng tiền (Hạn mức, Số dư đầu kỳ, Ví, Mục tiêu, Định kỳ, Chốt số dư, Sao lưu, Sổ nợ theo đối tượng, Cho vay) có thêm khối "Với số của bạn" lấy từ dữ liệu thật. Code: `giaiThichSo`, `gtViDu`, `ptCong`, `soGt` ở `state.js`.
- **Dòng tiền Theo tháng cũng tách vay nợ.** Thẻ Thu nhập / Chi và thanh Thu / Chi cố định chỉ còn thu nhập và chi thật; Nhận tiền vay, Thu hồi cho vay, Cho vay, Điều chỉnh số dư không còn nằm trong đó (trước đây vay 50tr làm "Thu vượt kế hoạch 457%" và Cho vay bị tính vào "Chi cố định"). Chúng hiện ở dòng **Vay nợ (tính riêng)** dưới thanh Trả nợ. **Cân đối** vẫn là dòng tiền thật (gồm vay nợ vì tiền thật ra vào ví) nhưng ghi rõ "gồm vay thêm X · không tính vay: Y" và nhãn **Dư nhờ vay** khi cân đối dương chỉ nhờ tiền vay. Thu đúng bằng kế hoạch ghi "Đủ kế hoạch" thay cho "Vượt kế hoạch 0 ₫". Sổ tay: tiêu đề khoản do Vay - Nợ sinh ra không còn lặp nhãn ("Tất toán — Tất toán: ...").
- **Thu chi thật (tách vay nợ khỏi thu nhập / chi tiêu).** Trước đây "Tổng thu / Tổng chi / Chênh lệch" cộng cả Nhận tiền vay, Thu hồi / Cho vay, Trả nợ, Tất toán nên vay 50tr làm tháng trông như dư 10tr. Giờ chia theo danh mục hệ thống (`CAT_HE_THONG`): **thu nhập / chi tiêu thật** = mọi khoản thu chi còn lại, **Dư thật** = thu nhập − chi tiêu; **Vay nợ** tính riêng thành một dòng "vào (nhận vay + thu hồi cho vay) · ra (trả nợ gồm tất toán + cho vay) · ròng"; "Điều chỉnh số dư" không thuộc nhóm nào. Lãi nằm trong nhóm Vay nợ, không phải chi tiêu (khoản Tất toán chỉ ghi một số tiền thực trả nên không tách được gốc / lãi). Áp dụng: thẻ đầu Sổ tay (và dòng so sánh cùng kỳ), thẻ đầu / Phân tích / Chi theo danh mục / Xu hướng / lịch chi tiêu ở Báo cáo, Tổng kết tháng. KHÔNG đổi: số dư các ví, tài sản ròng, Dòng tiền và lịch tiền (tiền vay và trả nợ có ra vào ví thật), danh sách Chi tiết theo ngày. `bdThang` (bieudo.js) trả thêm `tongThuThat`, `tongChiThat`, `vayNo`.
- **Tách chi cố định khỏi chi hằng ngày.** Một quy tắc dùng chung (`catChiLaCoDinh` ở `sotay.js`): chi CỐ ĐỊNH là danh mục hệ thống (Trả nợ, Cho vay, Điều chỉnh số dư) hoặc danh mục chi bật công tắc **"Khoản cố định"** (tab Cài đặt → sửa danh mục; lưu `cat.khoanCoDinh`); còn lại là chi HẰNG NGÀY. App KHÔNG đoán từ "Cố định theo Hạn mức" hay giao dịch định kỳ (hai cờ đó có việc riêng: Ăn bật chúng vẫn là chi hằng ngày). Dữ liệu cũ chưa có công tắc: danh mục có "Ngày chi hằng tháng" được bật sẵn một lần khi nạp (`normalizeData`), tắt rồi thì giữ tắt. Mọi số mang tính đánh giá chỉ xét chi hằng ngày: thanh hạn mức ở thẻ tổng quan Sổ tay, % đã dùng / vạch nhịp / "giữ nhịp này thì vượt hay còn dư" ở thẻ đầu Báo cáo, câu "đang vượt / đúng / dưới nhịp" ở Dòng tiền, trung bình mỗi ngày, ngày chi nhiều nhất, top ngày chi nhiều, chip "danh mục vượt hạn mức". Khoản cố định hiện thành nhóm **Cố định** riêng (đã chi đủ / còn / chưa chi, không cảnh báo) ở thẻ Hạn mức của Báo cáo và Dòng tiền, Dòng tiền có thêm thanh "Chi cố định". Tổng đã chi, tổng chi tháng, lịch chi tiêu, cân đối và ước tính chi cả tháng vẫn là số THẬT, gồm cả khoản cố định. Lý do: trả tiền nhà ngày 5 làm đầu tháng nào cũng "vượt nhịp", và trả nợ chưa ghi bị đem so với hạn mức vốn không có trả nợ nên báo vượt hạn mức giả.
- **Quá hạn nhiều kỳ (Vay - Nợ).** Khoản trễ từ 2 kỳ trở lên: thẻ khoản vay ghi "Quá hạn N kỳ" kèm TỔNG số đang trễ và hạn kỳ cũ nhất, danh sách "Sắp đến hạn / quá hạn" cũng ghi tổng đó ("Trả nợ 2 kỳ · từ ..."), thay vì chỉ số tiền của kỳ cũ nhất. Trễ 1 kỳ thì nhãn là "Kỳ quá hạn" thay cho "Kỳ tới" (`kyQuaHan` ở `vayno.js`).
- **Sổ nợ theo đối tượng.** Mỗi khoản cho vay / vay có ô "Đối tượng" (người hoặc nơi vay, ví dụ Minh, Vietcombank) (`loan.nguoi`). Thẻ **Sổ nợ theo đối tượng** ở Vay - Nợ gom các khoản còn mở cùng một đối tượng để thấy số ròng (họ nợ mình / mình nợ họ), chạm một khoản để nhảy tới thẻ của nó. Chỉ gom để xem: từng khoản vẫn giữ hình thức, lịch trả, kỳ và tất toán riêng. Khoản cũ chưa gán người thì chưa vào sổ (mở khoản, điền ô Đối tượng).
- **Chia hóa đơn nhóm.** Nút trong thẻ Cho vay: mình trả cả hóa đơn, nhập tổng và mỗi dòng một người (`Lan 150k` nếu không chia đều; người không ghi số chia đều phần còn lại cùng mình, lẻ đồng dồn về mình). Phần của mình thành một khoản chi ở Sổ tay, mỗi người khác thành một khoản cho vay (gắn `nguoi`), có Hoàn tác. Chưa có chiều ngược lại (người khác trả hộ, mình nợ họ).

- **Muốn mua / Mua được không** (tab Công cụ). Hỏi TRƯỚC khi tiêu. Nhập tên món, giá, ví trả, tùy chọn trả góp (số tháng + lãi %/năm) và mức muốn giữ lại tối thiểu; bấm **Kiểm tra** thì app chèn khoản chi vào **lịch tiền 60 ngày tới** (`tnLichTien`, tổng các ví) và trả lời: số dư thấp nhất nếu mua và ngày nào; **ngày sớm nhất mua mà vẫn an toàn** (không ngày nào sau đó xuống dưới mức giữ lại); mức tiêu mỗi ngày trước → sau nếu tính vào chi hằng ngày (chỉ để biết); mục tiêu tiết kiệm gắn đúng ví trả bị lùi bao nhiêu (số còn thiếu, số cần để dành mỗi tháng, khoảng bao nhiêu ngày); ví trả có đủ tiền hôm nay không. **Kết luận chỉ dựa vào SỐ DƯ**, không dựa vào hạn mức chi hằng ngày (món lớn nào cũng vượt hạn mức tháng). Trả góp: tiền góp theo lãi dư nợ giảm dần, lần đầu đúng ngày mua, các lần sau cùng ngày của tháng sau; dự báo xa hơn 30 ngày kém chắc hơn. **Lưu vào danh sách** (`muonMua[]`): món có thời gian chờ (mặc định 7 ngày); kết luận từng món TÍNH LẠI mỗi lần mở tab; đủ thời gian chờ thì hỏi "còn muốn mua không?". **Mua rồi** mở bảng (số tiền, ngày, danh mục, ví, ghi chú) rồi ghi khoản chi vào Sổ tay, có Hoàn tác; **Bỏ** không ghi gì, cộng vào "Đã nhịn được". Phân tích chỉ đọc dữ liệu. Có mục "Cách tính" bằng số thật. Code: `js/congcu.js` (`mmPhanTich`, `mmKeHoachTra`, `mmMucNgay`, `mmMucTieu`).
- **Giờ công** (tab Công cụ). Đổi tiền ra thời gian đi làm. Giá 1 giờ = thu nhập mỗi tháng ÷ số giờ làm mỗi tháng (mặc định 176 = 22 ngày × 8 giờ). Thu nhập: tự nhập (`settings.gioCong.thuNhapThang`) hoặc, bỏ trống, tự lấy TRUNG BÌNH thu nhập thật (không gồm vay nợ) của tối đa 3 tháng trọn gần nhất có thu (chưa có thì lấy tháng này). Thẻ có: giá 1 giờ, ô tính nhanh (gõ giá ra ngay "≈ 2 giờ 30 phút" / "1,5 ngày công (12 giờ)"), và chi tiêu thật của tháng này quy ra giờ (tổng + top 5 danh mục). Chỉ đọc dữ liệu; chỉ thu nhập / số giờ là được lưu. Có mục "Cách tính" bằng số thật. Code: `js/giocong.js`.
- **Lời hứa** (tab Công cụ). Cam kết có thời hạn với chính mình, khác hạn mức (hạn mức chỉ là số mềm). `loiHua[]`: danh mục chi, kiểu "số lần" hoặc "số tiền", mức tối đa (0 = không chi), từ ngày – đến ngày, và CÂU bạn tự viết. Trạng thái TÍNH TỪ SỔ TAY, không lưu: chưa bắt đầu / đang giữ (ngày thứ N) / đã phá (ngày của khoản làm vượt) / đã giữ lời; sửa hay xóa dòng chi thì trạng thái tự đổi theo. Khi bấm Lưu một khoản chi làm VƯỢT lời hứa (Ghi nhanh, hoặc thêm / sửa một dòng ở Sổ tay), hộp "Kiểm tra trước khi ghi" hiện đúng câu đó ("Đây sẽ là lần thứ 5, hứa tối đa 4"); vẫn ghi được bằng "Vẫn ghi". Lời hứa đã bị phá thì không nhắc lặp lại. Chưa nhắc ở form "Sửa cả ngày". Code: `js/loihua.js` (`lhTrangThai`, `lhViPham`, `canhBaoLoiHua` nối vào `handleSoTayAction`).
- **Cảnh báo khoản chi bất thường.** Khi bấm Lưu ở Ghi nhanh (hoặc sửa số tiền một dòng ở Sổ tay), app so số tiền với các khoản chi CÙNG DANH MỤC trong 6 tháng qua. Chỉ hỏi lại ("Có gõ thừa số 0 không?") khi đủ 4 điều kiện: có ít nhất 5 khoản trong lịch sử, số mới > 3 lần trung vị, số mới lớn hơn mọi khoản đã ghi (khoản lớn lâu lâu mới có thì không bị coi là nhầm), và từ 50.000 trở lên. Danh mục hệ thống không xét. Dùng chung hộp "Kiểm tra trước khi ghi" với cảnh báo ví âm; không chặn, bấm "Vẫn ghi" là ghi. Code: `chiBatThuong`, `canhBaoBatThuong` ở `sotay.js`.
- **Chi hằng ngày theo thứ trong tuần.** Báo cáo → Biểu đồ chi tiêu → tab Xu hướng, cuối tab: trung bình chi mỗi ngày theo từng thứ (T2 tới CN), gộp tháng đang xem + 2 tháng trước. Chỉ tính chi hằng ngày (không gồm khoản cố định và vay nợ); ngày không chi tính 0 đồng; bỏ ngày tương lai và ngày trước giao dịch đầu tiên của sổ; chưa đủ cả 7 thứ có dữ liệu thì không hiện. Có mục "Cách tính" bằng số thật. Chỉ đọc dữ liệu. Code: `bdTheoThu`, `bdTheoThuHtml` ở `bieudo.js`.

- **Đăng nhập Google, dữ liệu ở Drive của bạn.** Chỉ xin quyền `drive.file` (chỉ thấy file do app tạo), lưu 1 file `chitieu-canhan-data.json`. Không có server nào khác.
- **Dùng khi mất mạng.** Có bản nháp và bản sao dữ liệu trong `localStorage`; có mạng lại thì tự đồng bộ. Service worker giữ khung app để mở được offline.
- **Sao lưu hằng ngày** lên Drive (giữ vài bản gần nhất), sao lưu thủ công bất cứ lúc nào, xem danh sách và **khôi phục** một bản ngay trong tab Cài đặt. Trước khi khôi phục hoặc khi bản nháp đè lên bản Drive, app tự sao lưu bản hiện tại để còn quay lại được.
- **Khóa app trên từng máy**: mã PIN 6 số (băm PBKDF2-SHA256, không lưu PIN thô), mở nhanh bằng vân tay / Face ID (WebAuthn).
- **Ô tiền thông minh**: gõ phép tính, gõ `45k`, `1,5tr`, phím nhanh `000`.
- **Giao diện** sáng/tối, tối ưu điện thoại (thanh tab dưới đáy, kéo xuống để làm mới, vuốt ngày, animation tôn trọng `prefers-reduced-motion`) và màn rộng ≥1024px chia 2 cột. Thêm / sửa luôn qua **bảng trượt từ đáy** (cùng một khung ở Sổ tay, Mô phỏng, Vay - Nợ, Danh mục), nút Lưu cố định ở đáy bảng để bàn phím không che.
- **Biểu đồ tự vẽ bằng SVG**, không dùng thư viện biểu đồ, nên xem được cả khi offline.
- Có trang [Chính sách quyền riêng tư](privacy.html).

---

## 2. Đã làm được gì (lịch sử tóm tắt)

- Bản đầu: sổ thu/chi theo ngày + Vay - Nợ + danh mục, đồng bộ Drive.
- Thiết kế lại giao diện: icon SVG, font Be Vietnam Pro lưu sẵn trong `fonts/`, nền kem ấm / nâu cà phê, màu chủ đạo đỏ gạch, họa tiết nền (`img/`), logo và bộ icon riêng (`icons/`).
- Thay Chart.js bằng biểu đồ SVG tự vẽ; thêm tab Báo cáo riêng, gộp Mô phỏng vào Dòng tiền.
- Thêm: Vay - Nợ kiểu "Trả cố định/tháng", mục tiêu tiết kiệm, ví để dành, tài sản ròng, cảnh báo ví bị âm (chỉ cảnh báo, vẫn cho ghi).
- Thêm: nhập sao kê CSV/Excel (có bước xem trước, bỏ qua dòng trùng, nhớ cách ghép cột theo từng ngân hàng).
- Thêm: khóa PIN + sinh trắc, PWA/offline, sao lưu ngày, chuyển cảnh và cử chỉ.
- Tài khoản mới bắt đầu với số dư đầu kỳ 0 và ngày bắt đầu là hôm nay.
- Đã bỏ tính năng "quy tắc tự phân loại" (làm rồi gỡ hẳn khỏi Danh mục, Ghi nhanh, Nhập từ file).
- **Đợt thiết kế lại từng tab** (thiết kế bằng Claude Design, code và kiểm tra ở 320 / 375 / 1280px, sáng và tối): Sổ tay, Báo cáo, Dòng tiền (Thực tế & dự kiến + Mô phỏng), Vay - Nợ, Danh mục. Điểm chung: thẻ gọn thay cho bảng nhiều cột, bảng trượt từ đáy cho form, thu màu xanh / chi màu đỏ trầm / trả nợ màu hổ phách, tiền hiện đầy đủ không viết tắt.
- Cho vay có 2 nút trên thẻ: **Tất toán** ghi số tiền THỰC THU (chọn ngày, ví) thành giao dịch thu "Thu hồi cho vay" ở Sổ tay, gắn đúng khoản (thu thiếu thì chọn: thu một phần, hoặc tất toán với phần thiếu thành xóa nợ). **Xóa nợ** bỏ phần không đòi được, không ghi giao dịch: xóa hết thì đóng khoản (`tatToan`), xóa một phần thì ghi `daBo` (`[{soTien, ngay}]`), khoản vẫn mở, có nút Hoàn lại lần xóa nợ. Tài sản ròng theo ngày trừ đúng các lần xóa nợ tới ngày đó. Các thao tác có thể gây bất ngờ đều hỏi xác nhận kèm giải thích: tất toán bỏ phần thiếu, ngày thu ở tương lai, Hủy xóa nợ, Hoàn lại lần xóa nợ, sửa số cho vay làm đổi tình trạng khoản (mở lại / đóng / đã xóa nợ theo số cũ), xóa ngày thu ở Sổ tay khi khoản đã tất toán (khoản mở lại). Khoản cho vay đã xong (thu đủ hoặc đã xóa nợ) và khoản vay đã trả hết nằm trong mục **Đã xong (N)** gấp lại ở cuối từng danh sách.
- Mọi hộp xác nhận / chọn một (`xacNhan`, `chonMot` trong `ui.js`) hiện dạng bảng trượt từ đáy trên điện thoại, giữa màn hình trên desktop.
- Thẻ Tài khoản (Danh mục) hiện tên / email Google, lấy từ Drive `about.get` (không cần thêm quyền), lưu `localStorage` và xóa khi đăng xuất.
- Có 315 unit test cho phần logic thuần và các đoạn HTML sinh ra, đang pass hết.

---

## 3. Cấu trúc thư mục

```
index.html          Khung trang, nạp các file js theo đúng thứ tự
style.css           Toàn bộ CSS (biến màu sáng/tối)
manifest.json       Cấu hình PWA (tên, icon, màu)
sw.js               Service worker (mạng trước, cache khi offline)
privacy.html        Chính sách quyền riêng tư
js/
  state.js          Dữ liệu mặc định, state chung, hàm tiện ích (ngày, tiền, số dư)
  ui.js             Toast, hộp thoại, chế độ tối
  lock.js           Khóa PIN + vân tay / Face ID
  drive-sync.js     Đăng nhập Google, đọc/ghi Drive, bản nháp, sao lưu
  vayno.js          Tab Vay - Nợ: tính lịch trả nợ, thẻ khoản vay / cho vay, lịch trả theo kỳ, bảng trượt thêm-sửa và ghi nhận trả
  sotay.js          Tab Sổ tay (ghi nhanh, danh sách ngày, xuất Excel)
  bieudo.js         Biểu đồ SVG + thẻ biểu đồ ở Báo cáo
  nhan.js           Nhãn (tag) cho giao dịch + thẻ "Theo nhãn" ở Báo cáo
  nhachan.js        Nhắc thu/chi theo ngày của danh mục + bảng "Sắp đến hạn"
  lich.js           Xuất nhắc việc ra file .ics để nhập vào Lịch
  doisoat.js        Đối soát số dư ví (so số thật với số trong sổ, tùy chọn tạo khoản điều chỉnh)
  thetindung.js     Ví loại thẻ tín dụng / trả sau: dư nợ, sao kê, hạn thanh toán, nút Thanh toán thẻ
  nguoi.js          Đối tượng trong Vay - Nợ: Sổ nợ theo đối tượng + Chia hóa đơn nhóm
  nhap.js           Nhập giao dịch từ CSV / Excel
  danhmuc.js        Tab Cài đặt: danh mục, ví, định kỳ, mục tiêu, chốt số dư, sao lưu, khóa app
  dongtien.js       Tab Dòng tiền (Theo tháng) + thanh chọn 3 chế độ
  theongay.js       Dòng tiền · Theo ngày: hôm nay, từng ngày tháng này, tiền 30 ngày tới
  congcu.js         Tab Công cụ (phím 5): thẻ Muốn mua / Mua được không + bảng trượt dùng chung
  giocong.js        Thẻ Giờ công (tab Công cụ): đổi tiền ra giờ đi làm
  loihua.js         Thẻ Lời hứa (tab Công cụ) + nhắc khi khoản chi làm vượt lời hứa
  tongket.js        Tổng kết tháng đã kết thúc (thẻ ở Báo cáo + chip ở Sổ tay)
  mophong.js        Chế độ Mô phỏng của Dòng tiền
  motion.js         Animation dùng chung
  app.js            Khởi động, render tổng, dispatcher sự kiện, phím tắt
tests/run-tests.js  Unit test (Node, không cần cài gói nào)
tools/bump.js       Cập nhật số phiên bản ?v= trong index.html
fonts/ icons/ img/  Font, icon, ảnh nền
```

**Thứ tự nạp file quan trọng**: `state.js` nạp đầu, `app.js` nạp cuối cùng (xem cuối `index.html`). Mỗi file có comment đầu file ghi rõ nó cần file nào nạp trước.

---

## 4. Chạy trên máy

Cần Node.js (chỉ để chạy test và script bump) và một web server tĩnh bất kỳ. **Không mở thẳng bằng `file://`**: đăng nhập Google và service worker không hoạt động ở đó.

```bash
git clone https://github.com/tinsdark/so-chi-tieu.git
cd so-chi-tieu

# chạy thử (chọn 1)
python -m http.server 8080
# hoặc
npx serve .
```

Mở `http://localhost:8080`.

### Lưu ý về đăng nhập Google

`CLIENT_ID` nằm ở đầu `js/drive-sync.js` và gắn với 1 OAuth client trong Google Cloud Console. Google chỉ cho đăng nhập từ các địa chỉ đã khai ở mục **Authorized JavaScript origins** của client đó. Muốn chạy ở `http://localhost:8080` hoặc tên miền mới thì phải thêm địa chỉ đó vào client, nếu không sẽ báo lỗi đăng nhập. Muốn dùng project Google riêng thì tạo OAuth client mới (loại Web), bật Google Drive API và thay `CLIENT_ID`.

---

## 5. Quy trình khi sửa code

```bash
node tests/run-tests.js     # chạy unit test, phải 0 fail
node tools/bump.js          # chạy SAU MỖI lần sửa js/*.js hoặc style.css
node tools/bump.js --check  # chỉ kiểm tra số phiên bản có khớp không
```

- `bump.js` đặt `?v=<hash>` cho các file js/css trong `index.html` theo **nội dung file**. Số này vừa để trình duyệt không giữ file cũ, vừa để app biết có bản mới và báo cho người dùng. Quên chạy thì test sẽ báo lệch.
- Muốn ép mọi máy đã cài app xóa cache cũ thì tăng `VERSION` trong `sw.js`.
- Tên danh mục, cấu trúc dữ liệu có migration trong `normalizeData()` ở `state.js`. Đổi cấu trúc dữ liệu thì phải thêm migration cho dữ liệu cũ, vì dữ liệu thật của người dùng nằm trên Drive.

### Nguyên tắc đã áp dụng trong code

- **Tiền của ngày tính từ danh sách giao dịch** (`entryTinhLai`), không ghi 2 nơi để tránh lệch.
- **Mô phỏng không bao giờ ghi dữ liệu thật**: bản nháp chỉ nằm trong RAM, không đi vào đường lưu Drive.
- **Nhập hàng loạt luôn có bước xem trước**, dòng trùng mặc định bị bỏ qua nên nhập lại cùng 1 file không nhân đôi tiền.
- Các danh mục sinh ra từ Vay - Nợ (nhận tiền vay, cho vay, trả nợ, thu hồi) không nhập tay ở Sổ tay (ô bị khóa, Ghi nhanh không có), để khỏi tạo tiền mồ côi không gắn với khoản vay nào. Mọi thao tác ghi ở tab Vay - Nợ (thêm khoản, Ghi nhận trả, Tất toán) tự sinh giao dịch và vẫn hiện trong Chi tiết theo ngày ở Sổ tay (dòng có ổ khóa).

### Quy ước giao diện

- **Lời giải thích nào cũng phải có số thật.** Con số mới được tính toán thì thêm `giaiThichSo([{ ten, ct, pt }], 'Cách tính các số này')` với `pt` là phép tính bằng số đang hiện (dùng `ptCong`, `soGt`); ghi chú giải thích khái niệm thì thêm `gtViDu([...])` ("Với số của bạn"). Không viết lời giải thích chung chung mà không có số. Có test (`kiemPhepCong` trong tests/run-tests.js) kiểm mọi phép cộng / trừ trong giải thích đúng về số học.

- Màu: thu xanh, chi đỏ trầm, trả nợ / sắp đến hạn hổ phách. Chữ phần trăm để màu trung tính.
- Tiền hiện đầy đủ (`4.769.960`), không viết tắt "tr" / "k" (trừ trục biểu đồ).
- Danh sách dài dùng thẻ + nút "Xem thêm / Xem tất cả" thay cho bảng cuộn lồng nhau; dưới 375px bớt cột phụ.
- Thêm / sửa qua bảng trượt: khung `.qa-sheet` (Sổ tay), `.vn-sheet` (Vay - Nợ, Danh mục). Bảng nằm ngoài `#tabContent` và giữ nguyên DOM khi vẽ lại trang, nên đồng bộ Drive không làm mất ô đang gõ.
- Các lớp `position:fixed` neo theo khung layout, nhưng trên iOS (vuốt lên, nảy ở đáy trang, app mở từ màn hình chính) có lúc khung đó ngắn hơn / lệch so với phần nhìn thấy: thanh tab lơ lửng, màn hình khóa PIN chỉ phủ một phần. `canKhungNhin()` trong `ui.js` đo `visualViewport` và đặt biến CSS `--vv-top`, `--vv-h` trên `<html>`: lớp phủ toàn màn hình (`.gate`, `.modal-back`, nền) dùng chúng thay cho `inset:0`; thanh tab và thanh Ghi nhanh đặt theo **đáy phần nhìn thấy** (`top: vv-top + vv-h` rồi `translateY(-100%)`) thay cho `bottom:0`. Bàn phím mở thì `<html data-kb>`: thanh tab / Ghi nhanh ẩn. Lớp phủ MỚI toàn màn hình phải dùng các biến này thay vì `inset:0`. Đừng dịch thanh tab theo số đo vị trí (đã thử: lúc iOS nảy ở đáy trang số đo sai làm thanh trượt khỏi màn hình), và đừng dùng View Transitions API khi đổi tab (nó chụp ảnh cả trang, trên iOS làm thanh tab chớp mờ): đổi tab chỉ cho `#tabContent` mờ dần vào.
- Mỗi tab dài có tiền tố CSS riêng (`dt-` Dòng tiền, `mp-` Mô phỏng, `vn-` Vay - Nợ, `dm-` Danh mục, `bc-` Báo cáo).

---

## 6. Hạn chế cần biết

- Khóa PIN là khóa **màn hình**, không mã hóa dữ liệu trong `localStorage`. Ai mở được DevTools trên máy vẫn đọc được. Mục đích chỉ là người khác cầm máy đang mở app không xem được số tiền.
- Quên PIN thì chỉ còn cách xóa khóa cùng dữ liệu lưu trên máy đó rồi đăng nhập Google lại (dữ liệu trên Drive vẫn còn).
- Token Google chỉ sống khoảng 1 giờ (app không có server nên không có refresh token), nên app lưu token tạm trong `localStorage`; quá hạn thì phải đăng nhập lại.
- Hộp thoại có ô nhập (hỏi số, hỏi chữ, nhập PIN) vẫn hiện giữa màn hình, không phải bảng trượt, để bàn phím điện thoại không che nút.
- Cần mạng ở lần mở đầu để tải thư viện Google đăng nhập và SheetJS (từ `cdn.sheetjs.com`).

---

## 7. Hướng phát triển

Chia hai nhóm: **cần triển khai** (đã chốt sẽ làm, sắp xếp thứ tự sau) và **hướng phát triển tương lai** (chưa làm, có thể làm khi cần). Cuối mục có các việc **đã cân nhắc và quyết định không làm**, để khỏi đề xuất lại.

### 7.1. Cần triển khai

Đã làm: nhãn cho giao dịch, chia hóa đơn nhóm, sổ nợ theo đối tượng, nhắc thu/chi theo ngày của danh mục (xem mục 1). Còn lại:

1. **Nhắc việc trên iPhone (thông báo ngoài app)** — đã có xuất `.ics` (xem mục 1), còn chờ thử trên máy thật; hướng Google Calendar / Web Push chưa làm. Ghi chú cân nhắc ban đầu: cho kỳ trả nợ, các khoản có ngày ở danh mục, ngày dự kiến thu và giao dịch định kỳ (app chưa có thông báo nào). **Chưa chốt cách làm**, đang cân nhắc:
   - **Xuất file `.ics`** rồi nhập vào Lịch iPhone, kèm báo thức nhắc trước hạn. Không cần server nhưng là ảnh chụp tại thời điểm xuất, dữ liệu đổi thì phải xuất lại. Cần thử: iOS có giữ báo thức trong file khi nhập không, và app mở từ màn hình chính có tải được file `.ics` để nhập không.
   - **Tạo sự kiện thẳng vào Google Calendar** qua đăng nhập Google sẵn có (tự cập nhật, đồng bộ sang Lịch iPhone nếu tài khoản Google đã thêm vào máy). Phải xin thêm quyền Lịch (quyền nhạy cảm hơn `drive.file` hiện tại, đổi màn hình đồng ý và `privacy.html`).
   - **Thông báo đẩy (Web Push)**: cần có server riêng, trái nguyên tắc "không server", không chọn.
2. **Đường dẫn ghi nhanh** (ví dụ `?them=45000&ghichu=...`) kết hợp iPhone Shortcuts để tin nhắn ngân hàng mở app với số tiền và nội dung điền sẵn. Không cần AI hay server. **Cần nghiên cứu thêm trước khi làm:** Shortcuts có mở được PWA ổn trên máy dùng thật không, và cú pháp đọc nội dung tin nhắn của từng ngân hàng.

### 7.2. Hướng phát triển tương lai

- **Mã hóa dữ liệu bằng mã PIN** (WebCrypto) cho bản lưu trên máy, tùy chọn cả file trên Drive. Hiện khóa PIN chỉ là khóa màn hình (xem mục 6). Nặng và rủi ro cao: quên PIN thì không giải mã được, cần cảnh báo rõ, migration cho dữ liệu cũ và test kỹ.
- **Báo cáo để chia sẻ:** tổng kết tháng / năm xuất ảnh hoặc PDF.
- **Đính kèm ảnh hóa đơn** vào giao dịch (lưu lên Drive, quyền `drive.file` đủ). Cần quản lý dung lượng.
- **Huy hiệu số trên biểu tượng app** (số khoản sắp tới hạn). **Chưa chắc** iOS hỗ trợ ổn cho web app khi chưa có đẩy thông báo, cần thử.
- **Sổ tiết kiệm có kỳ hạn** (lãi suất, ngày đáo hạn, tự tính lãi) và **vàng / chứng khoán** vào tài sản ròng. Giá nhập tay vì không có server.
- **Đa tiền tệ**, chỉ đáng khi có chi tiêu bằng ngoại tệ.

### 7.3. Đã cân nhắc, quyết định không làm

- **AI / chatbot** trong app: không cần.
- **Giao dịch định kỳ tự ghi:** giữ nhắc rồi ghi tay, vì số tiền nhiều khoản không cố định.
- **Mẫu giao dịch / yêu thích** ở Ghi nhanh: giữ ghi tay cho khỏi rối giao diện.
- **Dùng chung sổ nhiều người:** rủi ro xung đột ghi chồng, bỏ.

Phần này ghi lại khi có ý tưởng mới.
