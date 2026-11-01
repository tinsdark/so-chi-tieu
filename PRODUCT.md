# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mình chủ app, gia đình và người quen, người Việt dùng thật hằng ngày để ghi chi tiêu cá nhân. Không bán, không quảng bá rộng. Dùng chủ yếu trên điện thoại (cài như PWA lên màn hình chính, nhiều iPhone), thỉnh thoảng trên máy tính. Việc cần làm: ghi một khoản trong vài giây, biết hôm nay còn tiêu được bao nhiêu, theo dõi vay - nợ và dòng tiền sắp tới.

## Product Purpose

Sổ chi tiêu cá nhân bằng tiếng Việt: ghi thu chi theo ngày, nhiều ví và thẻ tín dụng, vay - nợ có lịch trả, dự báo dòng tiền, hạn mức theo danh mục, mục tiêu tiết kiệm. Thành công là người dùng tin con số trong app, hiểu nó tính ra sao, và không phải trả tiền hay nhường dữ liệu cho bên thứ ba.

## Positioning

- Tính đúng từng đồng, và mọi con số tính toán đều có mục "Cách tính" gập sẵn, kèm phép tính bằng đúng số trên màn hình.
- Tách thu chi thật khỏi vay nợ; tách chi cố định khỏi chi hằng ngày.
- "Điều đáng chú ý" rút ra bằng luật cố định, không dùng AI.
- Dữ liệu nằm trên máy và trong Google Drive của chính người dùng, không qua máy chủ nào khác.

## Operating Context

Chạy hoàn toàn trên trình duyệt, mở được khi mất mạng, đồng bộ Drive khi người dùng bấm. Cài lên màn hình chính như app điện thoại. Có khóa PIN theo máy, nút ẩn số tiền, ghi nhanh từ màn khóa hoặc từ Phím tắt iPhone. Nhập sao kê CSV / Excel, xuất Excel và lịch .ics, mã VietQR tạo ngay trên máy.

## Capabilities and Constraints

- HTML, CSS, JavaScript thuần: không framework, không bước build, không server riêng. Script dạng global, `state.js` nạp đầu, `app.js` nạp cuối.
- Dữ liệu thật nằm trên Drive của người dùng: đổi cấu trúc dữ liệu phải có migration trong `normalizeData()`.
- Số tiền luôn tính đúng từng đồng; lịch trả nợ làm tròn về đồng, kỳ cuối trả hết gốc.
- Cảnh báo trước khi ghi chỉ hỏi lại, bấm "Vẫn ghi" là ghi. Không chặn người dùng.
- Khóa phóng to (zoom) là chủ ý của chủ app, không coi là lỗi.
- Chỉ nhắc trong app (chuông), chưa có thông báo đẩy.
- Thuật ngữ chính nằm ở `THUAT_NGU` (`js/danhmuc.js`); đổi tên một khái niệm thì đổi ở đó.
- Test bằng Node thuần (`tests/run-tests.js`), `tools/bump.js` đặt số phiên bản `?v=` sau mỗi lần sửa JS / CSS.

## Brand Commitments

Tên "Sổ Tiền", giọng thân mật bằng tiếng Việt. Bảng màu lấy từ logo: nền kem vàng, chữ nâu đậm, màu hành động nâu cà phê; đỏ gạch là màu thương hiệu, còn đỏ tươi chỉ dành cho tín hiệu chi / vượt mức / lỗi. Có chế độ tối nâu ấm. Logo và icon ở `brand/` và `icons/`.

## Evidence on Hand

README đầy đủ (mục 1 đến 5), trang quyền riêng tư `privacy.html`, 529 unit test chạy trong CI, ảnh logo trong `brand/`. Không có testimonial, số liệu người dùng hay số liệu thị trường; đừng bịa.

## Product Principles

1. Nhanh trước: ghi một khoản phải xong trong vài giây, ngay cả khi mất mạng.
2. Con số phải giải thích được: không có số nào không kèm cách tính.
3. Riêng tư theo thiết kế: dữ liệu ở máy và Drive của người dùng, không thêm máy chủ hay bên thứ ba.
4. Hỏi lại thay vì chặn: cảnh báo để người dùng quyết.
5. Đơn giản trong dùng, kỹ trong tính: ít thao tác, nhưng không làm tròn mất đồng nào.

## Accessibility & Inclusion

Tiếng Việt, có dấu, dùng được một tay trên điện thoại. Độ tương phản chữ đã kiểm theo WCAG AA (chữ chính từ 13:1, chữ phụ từ 5,6:1, số xanh / đỏ từ 4,5:1). Tôn trọng `prefers-reduced-motion`. Khóa zoom là chủ ý nên cỡ chữ và vùng chạm phải đủ đọc, đủ bấm mà không cần phóng to.
