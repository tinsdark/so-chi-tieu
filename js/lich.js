"use strict";
/* ====================================================================
   lich.js — XUẤT NHẮC VIỆC RA FILE .ics để nhập vào Lịch (iPhone / Google Calendar / Outlook).
   App không có server nên không đẩy được thông báo; file .ics là ẢNH CHỤP tại lúc xuất: đổi dữ liệu thì xuất lại.
   Nhập lại file mới KHÔNG nhân đôi sự kiện vì mỗi sự kiện có UID cố định (cùng khoản + cùng kỳ = cùng UID, Lịch tự cập nhật).
   Sự kiện cả ngày, mỗi cái có 2 báo thức: 9:00 sáng hôm trước và 8:00 sáng đúng ngày.
   Gồm (trong 12 tháng tới, chỉ từ hôm nay trở đi):
     - kỳ trả nợ chưa đóng,
     - ngày dự kiến thu của khoản cho vay chưa xong,
     - danh mục có "Ngày thu/chi hằng tháng" (bỏ tháng đã có giao dịch / đã bấm Hoàn thành),
     - giao dịch định kỳ đang bật (bỏ tháng đã ghi / đã bỏ qua).
   Cần state.js, vayno.js (tinhLichTraNo, kyDaDong, conThieuKy, ngayTraCuaKy), nhachan.js (catNgayHan) load trước.
   ==================================================================== */

var LICH_SO_THANG = 12;
var LICH_TEN_FILE = 'so-chi-tieu-nhac-viec.ics';

// danh sách sự kiện: [{ uid, ngay ('YYYY-MM-DD'), tieuDe, moTa }], ngày tăng dần
function lichSuKien(homNay){
  homNay = homNay || todayStr();
  var out = [], mk0 = monthKey(homNay), den = monthKeyAdd(mk0, LICH_SO_THANG - 1);
  var them = function(uid, ngay, tieuDe, moTa){
    if (ngay >= homNay && monthKey(ngay) <= monthKeyAdd(den, 1)) out.push({ uid: uid, ngay: ngay, tieuDe: tieuDe, moTa: moTa || '' });
  };
  // 1. kỳ trả nợ chưa đóng
  (state.data.vayNo.vayNoPhaiTra || []).forEach(function(v){
    if (!loanIsActive(v)) return;
    var sch = tinhLichTraNo(v);
    sch.forEach(function(row, i){
      if (kyDaDong(v, i)) return;
      them('kytra-' + v.id + '-' + (i + 1), row.ngayTra, 'Trả nợ: ' + v.ten + ' (kỳ ' + (i + 1) + ')',
        'Cần trả ' + fmt(Math.round(conThieuKy(v, i, sch))) + '.');
    });
  });
  // 2. ngày dự kiến thu của khoản cho vay
  (state.data.vayNo.choVay || []).forEach(function(c){
    if (choVayDaXong(c) || !c.ngayDuKienThu) return;
    them('thu-' + c.id, c.ngayDuKienThu, 'Thu nợ: ' + c.ten, 'Còn thu ' + fmt(Math.round(conLaiPhaiThu(c))) + '.');
  });
  // 3. danh mục có ngày thu/chi hằng tháng
  ['thu', 'chi'].forEach(function(kind){
    var he = CAT_HE_THONG[kind] || {};
    (state.data.categories[kind] || []).forEach(function(c){
      var n = catNgayHan(c);
      if (!n || he[c.id]) return;
      for (var i = 0; i < LICH_SO_THANG; i++){
        var mk = monthKeyAdd(mk0, i);
        if (Array.isArray(c.xong) && c.xong.indexOf(mk) >= 0) continue;
        if (i === 0 && actualCatInMonth(kind, c.id, mk) > 0) continue;
        them('dm-' + kind + '-' + c.id + '-' + mk, ngayTraCuaKy(mk, n), (kind === 'thu' ? 'Thu: ' : 'Chi: ') + c.ten, '');
      }
    });
  });
  // 4. giao dịch định kỳ
  (state.data.dinhKy || []).forEach(function(dk){
    if (!dk.bat) return;
    for (var i = 0; i < LICH_SO_THANG; i++){
      var mk = monthKeyAdd(mk0, i);
      if ((dk.bo || []).indexOf(mk) >= 0) continue;
      if (i === 0 && dinhKyDaGhi(dk, mk)) continue;
      them('dk-' + dk.id + '-' + mk, ngayTraCuaKy(mk, dk.ngay), 'Định kỳ: ' + dk.ten,
        (dk.kind === 'thu' ? 'Thu ' : 'Chi ') + fmt(Math.round(dk.soTien)) + '.');
    }
  });
  out.sort(function(a, b){ return a.ngay < b.ngay ? -1 : (a.ngay > b.ngay ? 1 : (a.uid < b.uid ? -1 : 1)); });
  return out;
}

/* ---- định dạng iCalendar (RFC 5545) ---- */
function icsEsc(s){
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
// dòng dài hơn 75 BYTE (UTF-8) phải gập: các dòng tiếp theo bắt đầu bằng 1 dấu cách. Không cắt giữa 1 ký tự.
function icsGap(dong){
  var out = [], cur = '', bytes = 0, gioiHan = 75;
  for (var i = 0; i < dong.length; i++){
    var cp = dong.charCodeAt(i), ch = dong.charAt(i);
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < dong.length){ ch += dong.charAt(++i); cp = 0x10000; }
    var b = cp < 0x80 ? 1 : (cp < 0x800 ? 2 : (cp < 0x10000 ? 3 : 4));
    if (bytes + b > gioiHan){ out.push(cur); cur = ' '; bytes = 1; gioiHan = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}
function icsNgay(d){ return d.slice(0, 4) + d.slice(5, 7) + d.slice(8, 10); }
function icsNgaySau(d){
  var t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 1));
  return t.getUTCFullYear() + pad2(t.getUTCMonth() + 1) + pad2(t.getUTCDate());
}
function icsStamp(t){
  return t.getUTCFullYear() + pad2(t.getUTCMonth() + 1) + pad2(t.getUTCDate()) + 'T' + pad2(t.getUTCHours()) + pad2(t.getUTCMinutes()) + pad2(t.getUTCSeconds()) + 'Z';
}
// dựng nội dung file .ics từ danh sách sự kiện; bay = thời điểm tạo (mặc định bây giờ)
function lichIcs(ds, bay){
  var stamp = icsStamp(bay || new Date());
  var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//So Chi Tieu//Nhac viec//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Sổ Chi Tiêu'];
  ds.forEach(function(e){
    L.push('BEGIN:VEVENT', 'UID:' + e.uid + '@sochitieu', 'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + icsNgay(e.ngay), 'DTEND;VALUE=DATE:' + icsNgaySau(e.ngay),
      'SUMMARY:' + icsEsc(e.tieuDe));
    if (e.moTa) L.push('DESCRIPTION:' + icsEsc(e.moTa));
    L.push('TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.tieuDe), 'TRIGGER:-PT15H', 'END:VALARM',     // 9:00 sáng hôm trước
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.tieuDe), 'TRIGGER:PT8H', 'END:VALARM',       // 8:00 sáng đúng ngày
      'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(icsGap).join('\r\n') + '\r\n';
}

/* ---- giao file cho người dùng ---- */
function lichTaiXuong(blob, ten){
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = ten; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 4000);
}
// Phải gọi ĐỒNG BỘ trong cú bấm (trình duyệt chỉ cho chia sẻ / tải khi có thao tác của người dùng).
// iPhone: ưu tiên bảng chia sẻ (có mục thêm vào Lịch); không có thì tải file về.
function lichGiao(text){
  var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' }), file = null;
  try { file = new File([blob], LICH_TEN_FILE, { type: 'text/calendar' }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })){
    navigator.share({ files: [file], title: 'Nhắc việc Sổ Chi Tiêu' }).catch(function(e){
      if (!e || e.name !== 'AbortError') lichTaiXuong(blob, LICH_TEN_FILE);
    });
    return 'share';
  }
  lichTaiXuong(blob, LICH_TEN_FILE);
  return 'tai';
}

function lichCardHtml(){
  var n = lichSuKien().length;
  return '<div class="card dm-card">'+dmHead('Nhắc việc lên Lịch')
    + '<div class="dm-sub">'+(n ? n + ' sự kiện trong '+LICH_SO_THANG+' tháng tới' : 'Chưa có khoản nào để nhắc')+'</div>'
    + '<button type="button" class="btn secondary sm" data-act="lichXuat"'+(n ? '' : ' disabled')+'>'+icon('calendar')+' Xuất file .ics</button>'
    + ghiChuGon('Xuất kỳ trả nợ, ngày dự kiến thu, danh mục có ngày thu/chi và giao dịch định kỳ ra file .ics để nhập vào Lịch của máy (mỗi sự kiện có báo thức 9:00 sáng hôm trước và 8:00 sáng đúng ngày). '
      + '<b>Đây là ảnh chụp lúc xuất</b>: thêm / đổi / trả xong khoản nào thì xuất lại. Nhập lại file mới không bị nhân đôi sự kiện, Lịch tự cập nhật theo mã sự kiện. Sự kiện của khoản đã xong trước đó vẫn nằm trong Lịch, xóa tay nếu cần.', 'Xuất ra Lịch hoạt động thế nào?')
    + '</div>';
}
function handleLichAction(act, el){
  if (act !== 'lichXuat') return false;
  var ds = lichSuKien();
  if (!ds.length){ toast('Chưa có khoản nào để xuất.', { loai:'warn' }); return true; }
  var kq = lichGiao(lichIcs(ds));
  if (kq === 'tai') toast('Đã tải file ' + LICH_TEN_FILE + ' (' + ds.length + ' sự kiện). Mở file để thêm vào Lịch.');
  return true;
}
