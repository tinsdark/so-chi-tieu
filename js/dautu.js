"use strict";
/* ====================================================================
   dautu.js — KHOẢN ĐẦU TƯ: theo dõi DÒNG TIỀN của từng khoản, không định giá tài sản.
   dauTu[] = [{ id, ten, ngayMo, dong, ngayDong, ghiChu }]. CHỈ có tên; số tiền nằm ở journal (refs), không lưu hai nơi.
   - Bỏ vốn  = một dòng CHI ở Sổ tay (ref 'dauTuVon', danh mục hệ thống dauTuVon): tiền ra khỏi ví, số dư và Tài sản ròng giảm thật.
   - Thu về  = một dòng THU (ref 'dauTuThu', danh mục hệ thống dauTuThu): tiền vào ví.
   - Lãi / lỗ = tổng thu về − tổng vốn đã bỏ. Vốn coi như đã mất, chỉ tiền thu về mới cộng lại (không có "giá trị hiện tại").
   Hai danh mục nằm trong CAT_HE_THONG (state.js) nên KHÔNG tính vào Thu nhập / Chi tiêu / hạn mức / chi hằng ngày; số dư vẫn tính đủ.
   Phần tiền hiện thành dòng "Đầu tư" riêng cạnh dòng "Vay nợ" (bdThang → dauTu, bdDauTuDongHtml ở bieudo.js).
   Ref dùng loanId = id khoản đầu tư để tái dùng journalAddRef / journalRemoveRefs. loanRevertRef (vayno.js) bỏ qua loai lạ nên xóa ngày không hỏng.
   Cần state.js load trước. Giao diện (trang Đầu tư) ở lần sau.
   ==================================================================== */

// danh mục hệ thống chỉ được thêm khi người dùng đã có khoản đầu tư (khỏi hiện hai ô vô nghĩa ở sổ của người không đầu tư)
function dauTuDamBaoDanhMuc(d){
  d = d || state.data;
  if (!d.categories.chi.some(function(c){ return c.id === 'dauTuVon'; })) d.categories.chi.push({ id: 'dauTuVon', ten: 'Bỏ vốn đầu tư', chiTieu: 0, khongDuTru: true });
  if (!d.categories.thu.some(function(c){ return c.id === 'dauTuThu'; })) d.categories.thu.push({ id: 'dauTuThu', ten: 'Thu về từ đầu tư', chiTieu: 0, khongDuTru: true });
}
function dauTuTim(id, d){
  var a = ((d || state.data).dauTu) || [];
  for (var i = 0; i < a.length; i++){ if (a[i].id === id) return a[i]; }
  return null;
}
// thêm khoản (chỉ tên); trả khoản vừa thêm, null nếu thiếu tên
function dauTuThem(ten, ngayMo, ghiChu){
  ten = String(ten || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!ten) return null;
  var x = { id: 'dt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ten: ten,
            ngayMo: /^\d{4}-\d{2}-\d{2}$/.test(ngayMo || '') ? ngayMo : todayStr(), dong: false, ghiChu: String(ghiChu || '').slice(0, 120) };
  state.data.dauTu = state.data.dauTu || [];
  state.data.dauTu.push(x);
  dauTuDamBaoDanhMuc();
  return x;
}
// ghi 1 lần bỏ vốn / thu về vào Sổ tay. loai: 'dauTuVon' | 'dauTuThu'. Trả true nếu đã ghi.
function dauTuGhi(id, loai, ngay, soTien, viId, note){
  var x = dauTuTim(id), so = Math.round(num(soTien));
  if (!x || (loai !== 'dauTuVon' && loai !== 'dauTuThu') || !/^\d{4}-\d{2}-\d{2}$/.test(ngay || '') || !(so > 0)) return false;
  dauTuDamBaoDanhMuc();
  var vi = (viId && walletById(viId)) ? viId : viMacDinhId();
  journalAddRef(ngay, id, loai, so, note || ((loai === 'dauTuVon' ? 'Bỏ vốn: ' : 'Thu về: ') + x.ten),
    { rid: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), walletId: vi });
  invalidateBalanceCache();
  return true;
}
function dauTuBoVon(id, ngay, soTien, viId, note){ return dauTuGhi(id, 'dauTuVon', ngay, soTien, viId, note); }
function dauTuThuVe(id, ngay, soTien, viId, note){ return dauTuGhi(id, 'dauTuThu', ngay, soTien, viId, note); }

// tổng 1 khoản (tới hết ngayDen nếu có): { von, thu, lai (thu − vốn, âm = lỗ), lo (số tiền đang lỗ, 0 nếu hòa / lãi), soLanVon, soLanThu, tt }
// tt: 'chua' (chưa bỏ vốn) | 'lo' | 'hoa' | 'lai'
function dauTuTong(id, ngayDen, d){
  d = d || state.data;
  var r = { von: 0, thu: 0, soLanVon: 0, soLanThu: 0, lanCuoi: '' };
  Object.keys(d.journal).sort().forEach(function(date){
    if (ngayDen && date > ngayDen) return;
    ((d.journal[date] || {}).refs || []).forEach(function(rf){
      if (rf.loanId !== id) return;
      if (rf.loai === 'dauTuVon'){ r.von += num(rf.soTien); r.soLanVon++; r.lanCuoi = date; }
      else if (rf.loai === 'dauTuThu'){ r.thu += num(rf.soTien); r.soLanThu++; r.lanCuoi = date; }
    });
  });
  r.lai = r.thu - r.von;
  r.lo = r.lai < 0 ? -r.lai : 0;
  r.tt = r.von <= 0 && r.thu <= 0 ? 'chua' : (Math.abs(r.lai) < 0.5 ? 'hoa' : (r.lai < 0 ? 'lo' : 'lai'));
  return r;
}
// tổng mọi khoản: { von, thu, lai }
function dauTuTongTat(ngayDen, d){
  d = d || state.data;
  var r = { von: 0, thu: 0, lai: 0 };
  (d.dauTu || []).forEach(function(x){ var t = dauTuTong(x.id, ngayDen, d); r.von += t.von; r.thu += t.thu; });
  r.lai = r.thu - r.von;
  return r;
}
// đóng khoản (coi như xong, chốt lãi / lỗ) / mở lại
function dauTuDong(id, ngay){
  var x = dauTuTim(id); if (!x) return false;
  x.dong = true; x.ngayDong = /^\d{4}-\d{2}-\d{2}$/.test(ngay || '') ? ngay : todayStr();
  return true;
}
function dauTuMoLai(id){
  var x = dauTuTim(id); if (!x) return false;
  x.dong = false; delete x.ngayDong;
  return true;
}
// xóa khoản: gỡ luôn mọi dòng bỏ vốn / thu về ở Sổ tay (số dư tự trả lại như chưa từng có khoản này). Trả số dòng đã gỡ.
function dauTuXoa(id){
  var a = state.data.dauTu || [], i = -1;
  for (var k = 0; k < a.length; k++){ if (a[k].id === id){ i = k; break; } }
  if (i < 0) return -1;
  var go = journalRemoveRefs(id, 'dauTuVon', null).length + journalRemoveRefs(id, 'dauTuThu', null).length;
  a.splice(i, 1);
  return go;
}
// dòng chữ lãi / lỗ: "Còn lỗ 5.000.000" | "Hòa vốn" | "Lãi 2.000.000"
function dauTuNhanLaiLo(t){
  if (t.tt === 'chua') return 'Chưa bỏ vốn';
  if (t.tt === 'hoa') return 'Hòa vốn';
  return t.tt === 'lo' ? 'Còn lỗ ' + fmt(Math.round(t.lo)) : 'Lãi ' + fmt(Math.round(t.lai));
}
