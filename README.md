# Sổ Tiền

Web app quản lý chi tiêu cá nhân bằng tiếng Việt. Chạy hoàn toàn trên trình duyệt (HTML + CSS + JavaScript thuần, **không framework, không build, không server riêng**). Dữ liệu nằm trên máy và đồng bộ qua **Google Drive của chính người dùng**. Dùng được như app điện thoại (PWA), mở được cả khi mất mạng.

---

## 1. Tính năng

### Sáu tab

| Tab | Phím | Nội dung |
|---|---|---|
| **Sổ tay** | `1` | Ghi thu/chi theo ngày. Thẻ đầu: số dư (tháng đang chạy là số dư tới hôm nay), số dư từng ví, Thu nhập / Chi tiêu / Để dành được, "Hôm nay còn tiêu được", thanh hạn mức. **Ghi nhanh** (thanh nổi trên thanh tab), nút **QR**, giao dịch định kỳ đến hạn, danh sách theo ngày (sửa / xóa / hoàn tác), tìm, xuất Excel, nhập CSV / Excel. |
| **Dòng tiền** | `2` | **Theo ngày** (hôm nay, lịch từng ngày, tiền 30 ngày tới, lịch từng ví), **Theo tháng** (tiền vào − ra, thu / chi theo danh mục, dòng tiền tích lũy 6–24 tháng) và **Mô phỏng** (vùng nháp thử thu / chi / vay thêm, không đụng dữ liệu thật). |
| **Báo cáo** | `3` | Hạn mức từng danh mục, tài sản ròng, mục tiêu tiết kiệm, biểu đồ chi tiêu (Tổng quan / Danh mục / Xu hướng), tổng kết tháng, điều đáng chú ý, theo nhãn, ngày tự do, Tết. |
| **Vay - Nợ** | `4` | Cho vay và vay phải trả, lịch trả theo kỳ, tất toán, bảng theo dõi 6–24 tháng, sổ nợ theo đối tượng, chia hóa đơn nhóm. |
| **Công cụ** | `5` | Muốn mua / Mua được không, Giờ công, Lời hứa, Sổ mừng và quà, Sổ đồ đạc. |
| **Cài đặt** | `6` | Năm phần: **Danh mục** · **Tiền** (số dư đầu kỳ, ví, QR nhận tiền, chốt số dư) · **Kế hoạch** (giao dịch định kỳ, mục tiêu) · **Hiển thị** · **Ứng dụng** (phiên bản, thuật ngữ, sao lưu, khóa app, tài khoản). |

Phím tắt khác (máy tính): `N` thêm giao dịch, `/` tìm kiếm, `?` bảng phím tắt, `Esc` đóng hộp thoại.

### Ghi chép

- **Ghi nhanh**: bảng trượt từ đáy (số tiền, danh mục, ví, ngày, ghi chú, nhãn). Ô tiền thông minh: gõ `45k`, `1,5tr`, `45.000+30.000`. Gợi ý tối đa 3 số hay ghi của danh mục đang chọn (từ 2 lần trong 180 ngày). Dưới ô tiền hiện "Khoản này ≈ N ngày tự do". Mỗi dòng có giờ ghi suy từ `it.iid` (khoản cũ cũng có).
- **Ví**: nhiều ví (tiền mặt, ngân hàng, ví điện tử, ví để dành), số dư đầu kỳ riêng, chuyển tiền giữa ví, **đối soát** số dư thật với số trong sổ (tùy chọn tạo khoản điều chỉnh). **Thẻ tín dụng / trả sau**: ví âm là dư nợ, "Thanh toán thẻ" là chuyển ví (không tính chi hai lần), hạn mức, ngày sao kê, thanh toán tối thiểu và lãi ước tính.
- **Giao dịch định kỳ theo kỳ**: mỗi khoản có nhiều kỳ nối tiếp (đổi lương / giá thuê = thêm kỳ mới), công tắc "Dùng làm dự báo" thay ước lượng bằng đúng số kỳ, hạn mức danh mục tự lấy theo kế hoạch.
- **Nhãn** cho giao dịch (gom theo chuyến đi, sự kiện), thẻ "Theo nhãn" ở Báo cáo.
- **Nhập / xuất**: nhập sao kê CSV / Excel luôn qua bước xem trước, bỏ dòng trùng, nhớ cách ghép cột từng ngân hàng; xuất Excel; xuất nhắc việc ra Lịch (`.ics`).
- **Cảnh báo trước khi ghi** (`canhBaoKhoan`): ví sắp âm, khoản chi bất thường (nghi gõ thừa số 0), vượt lời hứa. Chỉ hỏi lại, bấm "Vẫn ghi" là ghi. Mọi đường ghi đều đi qua hàm này.
- **Tìm kiếm toàn cục** (kính lúp hoặc `/`): giao dịch, vay nợ, sổ mừng, đồ đạc, danh mục, ví, mục tiêu, định kỳ, nhãn và lối đi tới các trang.

### Vay - Nợ

- Hình thức trả: 1 lần, không lãi, có lãi, trả cố định / tháng (chia gốc đều + phí cố định kiểu SPayLater, hoặc lãi trên dư nợ giảm dần kiểu FE Credit; app suy ra "Lãi thực ≈ X%/năm"), gốc đều lãi giảm dần. Lịch trả làm tròn về đồng, kỳ cuối trả hết gốc.
- Mỗi kỳ có trạng thái (đã trả đủ / thiếu / trả dở / chưa trả), trả một phần, tất toán sớm, báo quá hạn nhiều kỳ. Mọi thao tác ghi tự sinh giao dịch ở Sổ tay (dòng có ổ khóa), nên tiền vay và trả nợ không nhập tay.
- **Cho vay**: **Tất toán** ghi số tiền thực thu (thu thiếu thì chọn thu một phần hoặc đóng khoản), **Xóa nợ** bỏ phần không đòi được và không ghi giao dịch. Khoản xong nằm trong mục "Đã xong".
- **Sổ nợ theo đối tượng** (gom khoản cùng một người), **Chia hóa đơn nhóm** (mình trả hộ, mỗi người thành một khoản cho vay).

### Dự báo và báo cáo

- **Thu chi thật tách khỏi vay nợ**: Thu nhập / Chi tiêu / Để dành được không gồm nhận vay, thu hồi cho vay, cho vay, trả nợ, điều chỉnh số dư (hiện thành dòng "Vay nợ" riêng). Số dư ví, tài sản ròng và Dòng tiền vẫn tính đủ vì tiền vay có ra vào ví thật.
- **Chi cố định tách khỏi chi hằng ngày** (`catChiLaCoDinh`): hạn mức, nhịp chi, "Hôm nay còn tiêu được" chỉ xét chi hằng ngày.
- **Hôm nay còn tiêu được** = (hạn mức chi hằng ngày − đã chi trước hôm nay) ÷ số ngày còn lại. Báo thêm khi tiền các ví dùng hằng ngày ít hơn mức đó.
- **Dòng tiền Theo ngày**: số dư dự kiến 30 ngày tới (tổng hoặc từng ví, cảnh báo ví thiếu tiền kèm nút chuyển ví), chuỗi ngày trong mức. **Theo tháng** và **Mô phỏng**: dự báo từ định kỳ, lịch trả nợ, hạn mức hoặc trung bình 3 tháng trọn; từ tháng 13 chỉ là xu hướng.
- **Báo cáo**: tài sản ròng thực tế (ví + cho vay chưa thu − nợ gốc), mục tiêu tiết kiệm, tổng kết tháng đã qua, "Điều đáng chú ý" (3–5 câu tự rút ra bằng luật cố định, không dùng AI), chi theo thứ trong tuần, so cùng kỳ. Thẻ gập sau "Xem thêm", bật / tắt / sắp xếp ở Cài đặt → Hiển thị.
- **Ngày tự do**: tiền các ví ÷ chi thật mỗi ngày, kèm ước lượng thời gian tới tự do tài chính. **Tết đếm ngược + Quỹ Tết** (lịch âm tự tính, đúng 1800–2199). **Ngân sách tự lập**: kéo thanh "muốn để dành", app chia lại hạn mức từng danh mục chi (có Hoàn tác).
- Mỗi con số tính toán có mục **"Cách tính"** gập sẵn, kèm phép tính bằng đúng số trên màn hình.

### Công cụ

- **Muốn mua**: chèn khoản chi vào lịch tiền 60 ngày, trả lời số dư thấp nhất, ngày sớm nhất mua vẫn an toàn, ảnh hưởng mục tiêu; có danh sách chờ N ngày rồi hỏi "còn muốn mua không".
- **Giờ công**: đổi tiền ra thời gian đi làm. **Lời hứa**: cam kết có hạn (theo danh mục hoặc từ khóa ghi chú), trạng thái tính từ sổ. **Sổ mừng và quà** (có đi có lại, mặc định chỉ ghi nhớ). **Sổ đồ đạc** (chi phí mỗi ngày dùng, bảo hành).

### Nhắc nhở

- **Chuông thông báo** là nơi duy nhất cho mọi lời nhắc: số đỏ = chưa xem (chỉ giảm khi bấm vào mục), mục biến mất khi việc đã xong hoặc quá hạn 15 ngày. Ba mức: Cần làm ngay / Sắp tới / Để ý. Loại nhắc: định kỳ, thu / chi theo ngày của danh mục (dương hoặc âm lịch, có nút Hoàn thành), Vay - Nợ, thẻ, ví thiếu tiền, ví lâu chưa đối soát, bảo hành, Muốn mua, vượt hạn mức, tổng kết tháng, lời hứa, **khoản tiền cần xác nhận (QR)**. Tắt từng loại riêng từng máy. Mọi mục tính lại từ dữ liệu, chuông không lưu danh sách riêng.
- Chỉ nhắc trong app, chưa có thông báo đẩy. Xuất `.ics` (12 tháng tới, có báo thức) để nhập vào Lịch.

### QR nhận tiền (VietQR)

- Cài tài khoản ở **Cài đặt → Tiền → QR nhận tiền** (ngân hàng + số tài khoản, lưu ở `settings.qr`). Nút **QR** ở Sổ tay mở hộp thoại: chọn loại (**Thu nợ vay** hoặc **Nhận tiền khác**, ví dụ chia bill), số tiền, ghi chú; loại thu nợ vay có ô chọn khoản cho vay để tự điền số còn lại. Bấm **Tạo QR** thì hiện thẻ QR (ảnh PNG gồm QR, ngân hàng, STK, số tiền, nội dung) kèm hai nút **Lưu ảnh** và **Chia sẻ**.
- Mã VietQR / NAPAS tự tạo ngay trên máy (`js/qr.js`: bộ mã hóa QR + `vqPayload` + CRC16), không gọi dịch vụ ngoài nên số tài khoản không rời máy.
- Web không ghi thẳng vào thư viện Ảnh và tải file trên iPhone làm văng khỏi app, nên Lưu ảnh và Chia sẻ mở bảng chia sẻ của máy (iPhone chọn "Lưu hình ảnh" là vào Ảnh); máy tính thì Lưu ảnh tải file về.
- Mỗi mã vừa tạo thành một mục **"Có 1 khoản tiền cần xác nhận"** ở chuông (`state.data.qrCho`). Bấm vào: thu nợ vay mở hộp Tất toán của khoản đó điền sẵn số; nhận tiền khác mở Ghi nhanh khoản thu điền sẵn. Ghi xong mục tự hết, hoặc bấm Bỏ. **App không biết tiền đã vào hay chưa** (không có API ngân hàng), khoản thu vẫn do người dùng ghi.

### Dữ liệu và bảo mật

- **Dữ liệu nằm trên máy, Drive là nơi đồng bộ.** Có dữ liệu trên máy thì mở app vào thẳng, không chờ Drive. Đồng bộ tự chạy khi còn token, không thì chạm dòng trạng thái. Chỉ hỏi khi cả hai bên cùng đổi (`quyetDinhDongBo`). Chỉ xin quyền `drive.file`, lưu một file `chitieu-canhan-data.json`. Mất mạng vẫn dùng bình thường (dữ liệu và bản nháp trong `localStorage`, service worker giữ khung app).
- **Sao lưu**: tự động hằng ngày lên Drive (giữ vài bản), thủ công, tải về / khôi phục từ file `.json`. Trước khi khôi phục app tự sao lưu bản hiện tại.
- **Khóa app theo máy**: PIN 6 số (PBKDF2-SHA256, sai 5 lần thì chờ lâu dần), mở nhanh bằng vân tay / Face ID. **Ghi nhanh ngay trên màn khóa** (công tắc riêng từng máy, mặc định tắt): ghi không cần PIN nhưng không thấy số dư, khoản chỉ vào **hàng chờ** (`localStorage`, không lên Drive, tối đa 50). Nhập PIN xong có bước **Duyệt**: tick khoản đúng là của mình, chọn nguồn tiền từng khoản (hoặc đặt một lượt cho tất cả; chỉ hiện khi có từ 2 ví), rồi "Ghi N khoản vào sổ" (có Hoàn tác).
- **Ẩn số tiền** (nút con mắt): mọi số tiền thành "•••••" ở tầng hiển thị, không sửa dữ liệu.
- **Ghi nhanh không cần mở app (iPhone)**: Phím tắt lưu mỗi khoản thành một file CSV nhỏ, mở app chọn các file đó rồi tick khoản nào ghi (xem mục 5).

### Giao diện

Sáng / tối / theo máy, tối ưu điện thoại (thanh tab dưới đáy, kéo xuống để làm mới, vuốt ngày), màn ≥ 1024px chia 2 cột. Thêm / sửa qua bảng trượt từ đáy. Biểu đồ tự vẽ bằng SVG nên xem được khi offline. Có [Chính sách quyền riêng tư](privacy.html), mục **Phiên bản và cập nhật** (nhật ký thay đổi, nút kiểm tra bản mới) và bảng thuật ngữ trong app.

### Thuật ngữ chính

Bảng đầy đủ nằm trong app (Cài đặt → Ứng dụng → "Các số trong app nghĩa là gì", `THUAT_NGU` ở `danhmuc.js`); đổi tên một khái niệm thì đổi ở đó, có test kiểm tên còn xuất hiện trong giao diện.

| Tên | Nghĩa |
|---|---|
| **Thu nhập, Chi tiêu** | Thu / chi thường xuyên của tháng, không gồm vay nợ và điều chỉnh số dư. |
| **Để dành được** | Thu nhập − Chi tiêu (âm thì "Chi vượt thu"). "Tháng này có sống trong khả năng không". |
| **Tiền vào − ra** | Tiền vào ví − ra khỏi ví, **gồm cả tiền vay và trả nợ** (Dòng tiền). "Tháng này tiền có đủ không". |
| **Chi hằng ngày / Chi cố định** | Cố định là danh mục bật "Chi cố định" (tiền nhà...) và danh mục hệ thống (Trả nợ, Cho vay, Điều chỉnh). Hạn mức và nhịp chi chỉ xét chi hằng ngày. |
| **Tài sản ròng thực tế** | Tiền các ví + cho vay chưa thu − nợ gốc còn phải trả. Chỉ tính số đã ghi, không tính lãi tương lai. |
| **Ngày tự do** | Tiền các ví ÷ chi thật mỗi ngày: sống được bao nhiêu ngày mà không có thêm thu. |

---

## 2. Cấu trúc thư mục

```
index.html, style.css, manifest.json, sw.js, privacy.html
js/                       Global, không module; mỗi file có comment đầu ghi rõ cần file nào nạp trước
  state.js                Dữ liệu mặc định, state chung, migration (normalizeData), tiện ích ngày / tiền / số dư
  ui.js, motion.js        Toast, hộp thoại, chế độ tối, đo khung nhìn; animation
  lock.js, drive-sync.js  Khóa PIN + ghi nhanh màn khóa; đăng nhập Google, đồng bộ Drive, bản nháp, sao lưu
  vayno-tinh.js, vayno.js Logic thuần của Vay - Nợ (nạp trước); giao diện tab Vay - Nợ
  qr.js                   Bộ mã hóa QR, payload VietQR, hộp thoại Tạo QR, mục "cần xác nhận"
  sotay.js, nhap.js       Tab Sổ tay (ghi nhanh, danh sách ngày, duyệt hàng chờ); nhập CSV / Excel, Phím tắt iPhone
  dongtien.js, theongay.js, mophong.js   Tab Dòng tiền: Theo tháng, Theo ngày, Mô phỏng
  bieudo.js, diemnhan.js, tongket.js, nhan.js, ngaytudo.js, tet.js, amlich.js   Báo cáo và các thẻ của nó
  congcu.js, giocong.js, loihua.js, somung.js, dodac.js   Tab Công cụ và các trang con
  danhmuc.js, ht.js, hienthi.js, ngansach.js, doisoat.js, thetindung.js, nguoi.js, phienban.js   Tab Cài đặt và các phần của nó
  chuong.js, nhachan.js, lich.js, canhbao.js, tim.js   Chuông thông báo, nhắc theo ngày, xuất .ics, cảnh báo khi ghi, tìm kiếm
  app.js                  Khởi động, render tổng, dispatcher sự kiện, phím tắt (nạp cuối cùng)
tests/run-tests.js        Unit test (Node, không cần cài gói nào)
tools/bump.js             Đặt số phiên bản ?v= trong index.html
fonts/ icons/ img/ brand/ Font, icon, ảnh nền, logo
```

`state.js` nạp đầu, `app.js` nạp cuối (xem cuối `index.html`). Thêm file js mới phải thêm thẻ `<script>` đúng chỗ.

---

## 3. Chạy và phát triển

Cần Node.js (chạy test, script bump) và một web server tĩnh. **Không mở bằng `file://`**: đăng nhập Google và service worker không chạy ở đó.

```bash
git clone https://github.com/tinsdark/so-chi-tieu.git && cd so-chi-tieu
python -m http.server 8080        # hoặc: npx serve .   rồi mở http://localhost:8080
```

**Đăng nhập Google**: `CLIENT_ID` ở đầu `js/drive-sync.js` gắn với một OAuth client; Google chỉ cho đăng nhập từ địa chỉ khai ở *Authorized JavaScript origins*. Chạy ở `localhost` hoặc tên miền mới thì phải thêm địa chỉ đó. Muốn dùng project riêng thì tạo OAuth client Web, bật Drive API và thay `CLIENT_ID`.

### Quy trình khi sửa code

```bash
node tests/run-tests.js     # phải 0 fail (cũng chạy trên mỗi pull request: .github/workflows/test.yml)
node tools/bump.js          # chạy SAU MỖI lần sửa js/*.js hoặc style.css
node tools/bump.js --check  # chỉ kiểm tra
```

- **Mỗi pull request làm đổi thứ người dùng thấy thì thêm MỘT mục lên đầu `NHAT_KY`** (`js/phienban.js`): số phiên bản năm.tháng.ngày (thêm `.2` nếu cùng ngày), vài câu ngắn cho người dùng, không nhắc tên hàm / file. Test kiểm định dạng.
- `bump.js` đặt `?v=<hash nội dung>` cho js / css trong `index.html`: vừa chống cache cũ, vừa để app biết có bản mới. Quên chạy thì test báo lệch. Muốn ép mọi máy xóa cache thì tăng `VERSION` trong `sw.js`.
- Đổi cấu trúc dữ liệu thì thêm migration trong `normalizeData()`, vì dữ liệu thật nằm trên Drive.
- Test giữ các bất biến: không trùng tên toàn cục giữa các file, các số cùng một đại lượng tính ở nhiều nơi không lệch nhau (nhóm 7d, 60 hồ sơ ngẫu nhiên), mọi phép cộng trừ trong lời giải thích đúng số học (`kiemPhepCong`), 9 kịch bản người dùng (nhóm KB: sổ khớp, không NaN, không lộ `undefined`).

### Nguyên tắc trong code

- Tiền của ngày tính từ danh sách giao dịch (`entryTinhLai`), không ghi hai nơi.
- **Mô phỏng không bao giờ ghi dữ liệu thật** (bản nháp chỉ trong RAM).
- Nhập hàng loạt luôn có bước xem trước, dòng trùng bị bỏ nên nhập lại cùng file không nhân đôi tiền.
- Danh mục sinh ra từ Vay - Nợ không nhập tay (khỏi tạo tiền mồ côi).
- Lời giải thích nào cũng phải có số thật: `giaiThichSo([{ ten, ct, pt }])`, `gtViDu([...])`, `ptCong`, `soGt`.

### Quy ước giao diện

- Màu: thu xanh, chi đỏ trầm, trả nợ / sắp đến hạn hổ phách. Cái BẤM ĐƯỢC hoặc ĐANG CHỌN dùng `--action` (nâu đậm ở sáng, kem vàng ở tối); đỏ chỉ nghĩa "chi / vượt mức / nguy hiểm". Tiền hiện đầy đủ (`4.769.960`), không viết tắt (trừ trục biểu đồ).
- Thêm / sửa qua bảng trượt (`.qa-sheet`, `.vn-sheet`) nằm ngoài `#tabContent`, giữ nguyên DOM khi vẽ lại trang nên đồng bộ Drive không làm mất ô đang gõ. Hộp thoại có ô nhập vẫn ở giữa màn hình để bàn phím không che nút.
- **Lớp phủ toàn màn hình mới** phải dùng `--vv-top` / `--vv-h` (đo từ `visualViewport` ở `canKhungNhin()`), không dùng `inset:0`, vì trên iOS khung layout có lúc lệch so với phần nhìn thấy. Thanh tab và Ghi nhanh neo theo đáy phần nhìn thấy. Không dùng View Transitions khi đổi tab.
- **Vùng chạm**: nút nhỏ được nới lên khoảng 44px bằng `::after` trong `@media (pointer:coarse)`; không nới sang phía có phần tử bấm được khác (hai vùng chồng nhau thì phần tử nằm trên ăn). Đổi chỗ nào thì đo lại bằng `document.elementFromPoint`.
- Báo cáo giữ 3 thẻ đầu, gập phần còn lại (`BC_GIU`); thẻ mới cần id (`BC_DICH`) và tên chip (`BC_NHAN`). Mỗi tab dài có tiền tố CSS riêng (`dt-`, `mp-`, `vn-`, `dm-`, `bc-`).

---

## 4. Hạn chế cần biết

- Khóa PIN chỉ là khóa **màn hình**, không mã hóa `localStorage`; ai mở được DevTools vẫn đọc được. Quên PIN thì xóa khóa cùng dữ liệu trên máy rồi đăng nhập lại (Drive còn nguyên). Hàng chờ ghi nhanh lúc khóa cũng không mã hóa.
- Token Google sống khoảng 1 giờ (không có server nên không có refresh token). Hết hạn thì app vẫn dùng bằng dữ liệu trên máy, chỉ đồng bộ Drive cần bấm lại. Hẹn giờ chỉ chạy khi app đang mở.
- **Dữ liệu chính nằm trên máy**: mất máy hoặc xóa dữ liệu trình duyệt trước khi đồng bộ thì mất phần chưa đồng bộ (app nhắc khi quá 3 ngày chưa đồng bộ). "Đăng xuất" xóa cả dữ liệu trên máy.
- Cần mạng ở lần mở đầu để tải thư viện đăng nhập Google và SheetJS (`cdn.sheetjs.com`, khóa bằng `integrity` SHA-384; đổi phiên bản thì tính lại mã băm). Trang chưa có Content-Security-Policy.
- Kiểm xung đột Drive có khe hở nhỏ (đọc `modifiedTime` rồi mới ghi, hai yêu cầu riêng); hai máy ghi đúng lúc có thể đè nhau, phía sau còn nháp trên máy và 10 bản sao lưu. Mỗi lần lưu gửi cả file (~136 KB tăng mỗi năm), xem lại khi vượt ~1 MB.
- **Chưa kiểm trên iPhone thật**: xuất `.ics` (iOS có giữ báo thức, PWA có giao file được không), Ghi nhanh bằng Phím tắt, Ghi nhanh trên màn khóa, Lưu ảnh / Chia sẻ QR.
- Ghi nhanh trên màn khóa bật thì màn khóa không tự quét Face ID (hộp thoại Face ID của iOS che nút Ghi nhanh); mở bằng Face ID thì chạm biểu tượng ở bàn phím.

---

## 5. Ghi nhanh bằng Phím tắt (iPhone)

Phím tắt hỏi số tiền và danh mục rồi lưu mỗi khoản thành một file CSV nhỏ trong Tệp; mở app thì chọn nhiều file cùng lúc (Sổ tay → biểu tượng mũi tên lên ở "Chi tiết theo ngày"), xem danh sách, tick khoản nào ghi. App nhớ mã từng khoản (`settings.maDaNhap`) nên chọn lại file cũ không nhân đôi. Đặt phím tắt ở widget màn hình chính / khóa hoặc chạm hai lần mặt lưng. Dựng một phím tắt cho khoản chi:

1. **Hỏi nhập liệu**, kiểu Số, "Số tiền?".
2. **Chọn từ danh sách**: mỗi dòng một danh mục chi, gõ đúng tên trong app.
3. **Ngày hiện tại** → **Định dạng ngày** `yyyy-MM-dd`; thêm một cái `yyyy-MM-dd-HH-mm-ss` làm tên file.
4. **Văn bản** hai dòng, dòng cuối kết thúc bằng dấu phẩy: `Ngày,Loại,Số tiền,Danh mục,Ghi chú` / `<ngày>,chi,<số tiền>,<danh mục>,`
5. **Lưu tệp**: tắt "Hỏi nơi lưu", chọn thư mục iCloud Drive, tên `ghi-nhanh-<giờ>.csv` (**tên phải bắt đầu bằng `ghi-nhanh-`**).

Khoản thu: nhân đôi phím tắt, đổi `chi` thành `thu`. Chưa làm được việc tự hiện danh sách khi mở app (web app không tự đọc file ngoài nó).

---

## 6. Hướng phát triển (chưa làm)

- **Mã hóa dữ liệu bằng PIN** (WebCrypto): nặng và rủi ro (quên PIN là mất dữ liệu), cần migration và test kỹ.
- **Báo cáo xuất ảnh / PDF** để chia sẻ.
- **Đính kèm ảnh hóa đơn** vào giao dịch (lưu Drive, cần quản lý dung lượng).
- **Sổ tiết kiệm có kỳ hạn**, vàng / chứng khoán vào tài sản ròng (giá nhập tay); **Sổ Hụi** (dây hụi, lãi suất thực theo năm).
