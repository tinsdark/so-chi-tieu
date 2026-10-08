# Sổ Chi Tiêu

Web app quản lý chi tiêu cá nhân bằng tiếng Việt. Chạy hoàn toàn trên trình duyệt (HTML + CSS + JavaScript thuần, **không framework, không build, không server riêng**). Dữ liệu lưu trong **Google Drive của chính người dùng**, dùng được như app trên điện thoại (PWA) và mở được cả khi mất mạng.

---

## 1. Project đã có gì

### 5 tab chính

| Tab | Phím tắt | Nội dung |
|---|---|---|
| **Sổ tay** | `1` | Ghi giao dịch thu/chi theo ngày. Gồm: **Ghi nhanh** (số tiền, danh mục, ghi chú, 1 nút Lưu), **Nhập đầy đủ**, số dư theo từng ví, tìm kiếm / lọc, xuất Excel, nhập từ file CSV/Excel, vuốt ngày để sửa/xóa, hoàn tác khi xóa. |
| **Dòng tiền** | `2` | Bảng thu/chi theo từng tháng cả năm (thực tế + dự kiến tương lai), phân tích chênh lệch so với hạn mức, và vùng **Mô phỏng** để thử số liệu mà không đụng dữ liệu thật. |
| **Báo cáo** | `3` | Biểu đồ chi tiêu (Tổng quan / Danh mục / Xu hướng), theo dõi **hạn mức** từng danh mục, **mục tiêu tiết kiệm**, **tài sản ròng** theo tháng (tiền các ví + cho vay chưa thu − nợ gốc), so sánh tháng với cùng kỳ. |
| **Vay - Nợ** | `4` | Quản lý khoản **cho vay** và khoản **vay phải trả**: ngân hàng / ví / bạn bè / người thân. Hình thức: trả 1 lần, không lãi, có lãi, trả cố định/tháng. Tự tính lịch trả nợ, tiến độ, tất toán sớm; ghi thu/trả thì tự hạch toán sang Sổ tay. |
| **Danh mục** | `5` | Danh mục thu/chi (đổi tên, màu, kéo thả đổi thứ tự), hạn mức tháng, ví và ví mặc định, số dư đầu kỳ, **chốt số dư**. |

Phím tắt khác (desktop): `N` thêm giao dịch, `/` tìm trong Sổ tay, `?` xem bảng phím tắt, `Esc` đóng hộp thoại.

### Tính năng nền tảng

- **Đăng nhập Google, dữ liệu ở Drive của bạn.** Chỉ xin quyền `drive.file` (chỉ thấy file do app tạo), lưu 1 file `chitieu-canhan-data.json`. Không có server nào khác.
- **Dùng khi mất mạng.** Có bản nháp và bản sao dữ liệu trong `localStorage`; có mạng lại thì tự đồng bộ. Service worker giữ khung app để mở được offline.
- **Sao lưu hằng ngày** lên Drive, và tự sao lưu bản Drive hiện tại trước khi khôi phục bản nháp đè lên.
- **Khóa app trên từng máy**: mã PIN 6 số (băm PBKDF2-SHA256, không lưu PIN thô), mở nhanh bằng vân tay / Face ID (WebAuthn).
- **Ô tiền thông minh**: gõ phép tính, gõ `45k`, `1,5tr`, phím nhanh `000`.
- **Giao diện** sáng/tối, tối ưu điện thoại (thanh tab dưới đáy, kéo xuống để làm mới, vuốt ngày, animation tôn trọng `prefers-reduced-motion`) và màn rộng ≥1024px chia 2 cột.
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
- Có 173 unit test cho phần logic thuần, đang pass hết.

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
  vayno.js          Tab Vay - Nợ + tính lịch trả nợ
  sotay.js          Tab Sổ tay (ghi nhanh, danh sách ngày, xuất Excel)
  bieudo.js         Biểu đồ SVG + thẻ biểu đồ ở Báo cáo
  nhap.js           Nhập giao dịch từ CSV / Excel
  danhmuc.js        Tab Danh mục
  dongtien.js       Tab Dòng tiền
  mophong.js        Vùng Mô phỏng
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
- Các danh mục sinh ra từ Vay - Nợ (nhận tiền vay, cho vay, trả nợ, thu hồi) không nhập tay ở Sổ tay, để khỏi tạo tiền mồ côi không gắn với khoản vay nào.

---

## 6. Hạn chế cần biết

- Khóa PIN là khóa **màn hình**, không mã hóa dữ liệu trong `localStorage`. Ai mở được DevTools trên máy vẫn đọc được. Mục đích chỉ là người khác cầm máy đang mở app không xem được số tiền.
- Quên PIN thì chỉ còn cách xóa khóa cùng dữ liệu lưu trên máy đó rồi đăng nhập Google lại (dữ liệu trên Drive vẫn còn).
- Token Google chỉ sống khoảng 1 giờ (app không có server nên không có refresh token), nên app lưu token tạm trong `localStorage`; quá hạn thì phải đăng nhập lại.
- Cần mạng ở lần mở đầu để tải thư viện Google đăng nhập và SheetJS (từ `cdn.sheetjs.com`).

---

## 7. Hướng phát triển

Chưa có kế hoạch cố định. Phần này ghi lại khi có ý tưởng mới.
