# Sổ Chi Tiêu

Web app quản lý chi tiêu cá nhân bằng tiếng Việt. Chạy hoàn toàn trên trình duyệt (HTML + CSS + JavaScript thuần, **không framework, không build, không server riêng**). Dữ liệu lưu trong **Google Drive của chính người dùng**, dùng được như app trên điện thoại (PWA) và mở được cả khi mất mạng.

---

## 1. Project đã có gì

### 5 tab chính

| Tab | Phím tắt | Nội dung |
|---|---|---|
| **Sổ tay** | `1` | Ghi giao dịch thu/chi theo ngày. Thẻ đầu là số dư (chọn tháng, đầu tháng / cuối tháng, thanh thu-chi). **Ghi nhanh**: thanh nổi phía trên thanh tab, chạm mở bảng trượt từ đáy (số tiền, danh mục, ví, ghi chú, 1 nút Lưu); bấm vào một ngày để sửa cả ngày trong form đầy đủ. Số dư theo từng ví và chuyển tiền giữa các ví, nhắc **giao dịch định kỳ** đến hạn, tìm kiếm / lọc, xuất Excel, nhập từ file CSV/Excel, vuốt ngày để sửa/xóa, hoàn tác khi xóa. |
| **Dòng tiền** | `2` | Hai chế độ. **Thực tế & dự kiến**: chọn tháng, Cân đối tháng (thiếu / dư), thanh Thu / Chi / Trả nợ, thu và chi theo danh mục chia nhóm "Cần chú ý" / "Ổn" (chạm một dòng để xem 4 số chi tiết, vượt hạn mức có chip "Vượt X"), **Dòng tiền tích lũy tương lai** (chọn 6 / 12 / 24 tháng: số tích lũy cuối kỳ, mức thấp nhất, biểu đồ, bảng Tháng / Cân đối / Lũy kế đủ số tháng đã chọn; chạm một dòng để chọn tháng), bảng cả năm sau nút "Xem bảng cả năm". **Mô phỏng**: vùng nháp để thử số liệu mà không đụng dữ liệu thật, thêm điều chỉnh (thu/chi một lần, lặp lại mỗi tháng, **vay thêm** tự tính số trả và tổng lãi, trả hết khoản vay sớm), bật/tắt từng điều chỉnh, so sánh với dữ liệu gốc 6 / 12 / 24 / 36 tháng. |
| **Báo cáo** | `3` | Thẻ đầu theo tháng, theo dõi **hạn mức** từng danh mục chi, **tài sản ròng** (tiền các ví + cho vay chưa thu − nợ gốc), **mục tiêu tiết kiệm** (tiến độ, cần để dành mỗi tháng bao nhiêu), biểu đồ chi tiêu (Tổng quan / Danh mục / Xu hướng), so sánh tháng với cùng kỳ. |
| **Vay - Nợ** | `4` | **Cho vay** và **vay phải trả** (ngân hàng / ví / bạn bè / người thân). Hình thức trả: 1 lần, không lãi, có lãi, trả cố định/tháng, gốc đều lãi giảm dần. Thẻ tổng quan (còn nợ, cho vay chờ thu, nợ ròng, tháng này cần trả / đã trả, dự kiến hết nợ), thẻ "Sắp đến hạn / quá hạn", mỗi khoản là một thẻ với **lịch trả theo từng kỳ** (đã trả đủ / xong kỳ nhưng thiếu / trả dở / chưa trả), ghi nhận trả (trả một phần hoặc đóng kỳ), tất toán sớm, **Bảng theo dõi** (chọn 6 / 12 / 24 tháng): mỗi tháng một dòng, 2 cột Số tiền trả (các kỳ trả nợ) và Số tiền thu (cho vay), dạng "đã / dự kiến": số nhỏ là tiền THẬT đã trả / thu, số to là dự kiến; lần trả / thu đã hoàn thành (kỳ đã đóng, khoản cho vay thu đủ hoặc xóa nợ) có nhãn **Done** ở góc trên phải ô, kể cả khi tiền thật ít hơn dự kiến (2.900.000 / 3.000.000 · Done). Chạm một tháng để xem từng khoản; kỳ quá hạn chưa xong dồn vào tháng này. Dòng tiền cả sổ (thu chi sinh hoạt, số dư lũy kế) xem ở tab Dòng tiền. Ghi thu/trả tự hạch toán sang Sổ tay. Thêm/sửa khoản vay có khối xem trước số trả mỗi tháng, tổng lãi, tháng trả xong. |
| **Danh mục** | `5` | Ba khối. **Danh mục**: thu / chi (tên, màu, hạn mức tháng, "Không tính dự kiến", "Cố định theo Hạn mức", kéo thả đổi thứ tự). **Tiền & kế hoạch**: số dư đầu kỳ, ví (mặc định, để dành), chốt số dư, giao dịch định kỳ (chỉ nhắc, không tự ghi), mục tiêu tiết kiệm (gắn ví hoặc tự gom). **Ứng dụng**: cài lên màn hình chính, sao lưu / khôi phục, khóa app, đăng xuất. |

Phím tắt khác (desktop): `N` thêm giao dịch, `/` tìm trong Sổ tay, `?` xem bảng phím tắt, `Esc` đóng hộp thoại.

### Tính năng nền tảng

- **Đăng nhập Google, dữ liệu ở Drive của bạn.** Chỉ xin quyền `drive.file` (chỉ thấy file do app tạo), lưu 1 file `chitieu-canhan-data.json`. Không có server nào khác.
- **Dùng khi mất mạng.** Có bản nháp và bản sao dữ liệu trong `localStorage`; có mạng lại thì tự đồng bộ. Service worker giữ khung app để mở được offline.
- **Sao lưu hằng ngày** lên Drive (giữ vài bản gần nhất), sao lưu thủ công bất cứ lúc nào, xem danh sách và **khôi phục** một bản ngay trong tab Danh mục. Trước khi khôi phục hoặc khi bản nháp đè lên bản Drive, app tự sao lưu bản hiện tại để còn quay lại được.
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
- Có 217 unit test cho phần logic thuần và các đoạn HTML sinh ra, đang pass hết.

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
  nhap.js           Nhập giao dịch từ CSV / Excel
  danhmuc.js        Tab Danh mục: danh mục, ví, định kỳ, mục tiêu, chốt số dư, sao lưu, khóa app
  dongtien.js       Tab Dòng tiền (Thực tế & dự kiến)
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

Chưa có kế hoạch cố định. Một vài việc đã biết:


Phần này ghi lại khi có ý tưởng mới.
