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

// xóa ĐÚNG MỘT lần bỏ vốn / thu về (theo rid) khỏi Sổ tay. Trả ref đã gỡ (kèm ngay) để hoàn tác, null nếu không thấy.
function dauTuXoaLan(id, ngay, rid){
  var e = state.data.journal[ngay];
  if (!e || !e.refs) return null;
  for (var i = 0; i < e.refs.length; i++){
    var r = e.refs[i];
    if (r.loanId === id && r.rid === rid && REF_MAP[r.loai] && (r.loai === 'dauTuVon' || r.loai === 'dauTuThu')){
      e.refs.splice(i, 1);
      journalRemoveNote(e, r.note);
      entryTinhLai(e);
      if (entryIsEmpty(e)) delete state.data.journal[ngay];
      invalidateBalanceCache();
      return { ngay: ngay, loai: r.loai, soTien: num(r.soTien), note: r.note || '', rid: r.rid, walletId: r.walletId };
    }
  }
  return null;
}
// các lần ghi của 1 khoản, MỚI NHẤT trước: [{ ngay, loai, soTien, rid, viId }]
function dauTuLichSu(id, d){
  d = d || state.data;
  var out = [];
  Object.keys(d.journal).sort().reverse().forEach(function(date){
    ((d.journal[date] || {}).refs || []).slice().reverse().forEach(function(r){
      if (r.loanId === id && (r.loai === 'dauTuVon' || r.loai === 'dauTuThu')) out.push({ ngay: date, loai: r.loai, soTien: num(r.soTien), rid: r.rid || '', viId: viCuaRef(r, d) });
    });
  });
  return out;
}

/* ---- giao diện: trang "Đầu tư" trong Công cụ (CC_TRANG ở congcu.js) ---- */
var DT_LS_HIEN = 6;     // số lần ghi gần nhất hiện dưới mỗi khoản
function dtTomTat(){
  var ds = state.data.dauTu || [];
  if (!ds.length) return { chu: 'Bỏ vốn, thu về: còn lỗ hay đã lãi' };
  var dang = ds.filter(function(x){ return !x.dong; }), tong = dauTuTongTat();
  return { chu: (dang.length ? dang.length + ' khoản đang chạy' : 'Không có khoản đang chạy') + ' · ' + dauTuNhanLaiLo({ tt: Math.abs(tong.lai) < 0.5 ? 'hoa' : (tong.lai < 0 ? 'lo' : 'lai'), lo: -tong.lai, lai: tong.lai }).toLowerCase() };
}
function dtTagLaiLo(t){
  if (t.tt === 'chua') return '<span class="cc-tag">Chưa bỏ vốn</span>';
  return '<span class="cc-tag ' + (t.tt === 'lo' ? 'bad' : (t.tt === 'lai' ? 'ok' : '')) + '">' + esc(dauTuNhanLaiLo(t)) + '</span>';
}
function dtDongHtml(x){
  var t = dauTuTong(x.id), ls = dauTuLichSu(x.id), h = '<div class="cc-it">'
    + '<div class="cc-it-h"><b>' + esc(x.ten) + '</b>' + dtTagLaiLo(t) + '</div>'
    + '<div class="cc-it-s"><span class="muted">Đã bỏ vốn ' + fmt(Math.round(t.von)) + ' · thu về ' + fmt(Math.round(t.thu)) + '</span></div>'
    + (x.ghiChu ? '<div class="cc-it-s"><span class="muted">' + esc(x.ghiChu) + '</span></div>' : '');
  ls.slice(0, DT_LS_HIEN).forEach(function(l){
    h += '<div class="cc-it-s"><span class="muted">' + ngayVN(l.ngay) + ' · ' + (l.loai === 'dauTuVon' ? 'bỏ vốn' : 'thu về') + '</span><b class="' + (l.loai === 'dauTuVon' ? 'chi' : 'thu') + '">'
      + (l.loai === 'dauTuVon' ? '−' : '+') + fmt(Math.round(l.soTien)) + '</b>'
      + '<button type="button" class="btn secondary sm nguy" data-act="dtXoaLan" data-id="' + esc(x.id) + '" data-ngay="' + l.ngay + '" data-rid="' + esc(l.rid) + '" aria-label="Xóa lần ghi này">' + icon('trash') + '</button></div>';
  });
  if (ls.length > DT_LS_HIEN) h += '<div class="cc-it-s"><span class="muted">và ' + (ls.length - DT_LS_HIEN) + ' lần cũ hơn (xem ở Sổ tay)</span></div>';
  h += '<div class="cc-it-b">'
    + (x.dong ? '' : '<button type="button" class="btn secondary sm" data-act="dtVon" data-id="' + esc(x.id) + '">Bỏ thêm vốn</button>'
               + '<button type="button" class="btn secondary sm" data-act="dtThu" data-id="' + esc(x.id) + '">Thu về</button>')
    + '<button type="button" class="btn secondary sm" data-act="dtSua" data-id="' + esc(x.id) + '">' + icon('pencil') + ' Sửa</button></div></div>';
  return h;
}
function dtPageHtml(){
  var ds = state.data.dauTu || [], dang = ds.filter(function(x){ return !x.dong; }), xong = ds.filter(function(x){ return x.dong; });
  var h = '<div class="card dm-card cc-card">' + dmHead('Đầu tư', '<button class="btn secondary sm" data-act="dtThem">+ Thêm khoản</button>')
    + '<div class="dm-sub">Theo dõi dòng tiền từng khoản: bỏ vốn là tiền ra thật (số dư giảm, không tính là chi tiêu), tiền thu về cộng lại, còn lỗ hay đã lãi hiện ngay. Không định giá tài sản.</div>';
  if (!ds.length) return h + '<div class="empty">Chưa có khoản nào. Ví dụ: bỏ vốn 10.000.000 vào "Quỹ A", sau đó mỗi lần thu về thì bấm "Thu về" và nhập số tiền.</div></div>';
  var tong = dauTuTongTat(), tt = Math.abs(tong.lai) < 0.5 ? 'hoa' : (tong.lai < 0 ? 'lo' : 'lai');
  h += '<div class="cc-r"><span>Đã bỏ vốn</span><b class="chi">' + fmt(Math.round(tong.von)) + '</b></div>'
    + '<div class="cc-r"><span>Đã thu về</span><b class="thu">' + fmt(Math.round(tong.thu)) + '</b></div>'
    + '<div class="cc-r"><span>' + (tt === 'lai' ? 'Lãi' : (tt === 'hoa' ? 'Hòa vốn' : 'Còn lỗ')) + '</span><b class="' + (tt === 'lo' ? 'chi' : (tt === 'lai' ? 'thu' : '')) + '">' + fmt(Math.round(Math.abs(tong.lai))) + '</b></div>';
  h += giaiThichSo([
    { ten: 'Lãi / lỗ', ct: 'Tổng tiền thu về − tổng vốn đã bỏ, của mọi khoản (kể cả khoản đã đóng). Vốn coi như đã mất, chỉ tiền thu về mới cộng lại; không có "giá trị hiện tại".', pt: ptCong([tong.thu, -tong.von], tong.lai) },
    { ten: 'Ảnh hưởng tới số dư và Tài sản ròng', ct: 'Bỏ vốn làm số dư ví và Tài sản ròng giảm ngay; thu về làm tăng lại. Cả hai không tính vào Thu nhập, Chi tiêu, hạn mức hay "Hôm nay còn tiêu được".', pt: ptCong([-tong.von, tong.thu], tong.lai) }
  ], 'Cách tính các số này');
  h += '<div class="cc-ds">' + (dang.length ? dang.map(dtDongHtml).join('') : '<div class="empty">Không có khoản đang chạy.</div>') + '</div>';
  if (xong.length) h += '<div class="dm-sub" style="margin-top:16px"><b>Đã đóng</b></div><div class="cc-ds">' + xong.slice().sort(function(a, b){ return a.ngayDong < b.ngayDong ? 1 : -1; }).slice(0, 8).map(dtDongHtml).join('') + '</div>';
  return h + '</div>';
}
// ccForm.id = 'von|<id>' | 'thu|<id>' (ghi tiền) | 'k|<id>' (sửa khoản) | 'k|' (khoản mới)
function dtSheetHtml(khoa){
  var p = String(khoa || '').split('|'), kieu = p[0], id = p[1] || '', x = id ? dauTuTim(id) : null;
  if (kieu === 'k'){
    if (id && !x) return '';
    var d = x || { ten: '', ngayMo: todayStr(), ghiChu: '', dong: false };
    var h = vnF('Tên khoản', '<input type="text" id="dt_ten" maxlength="60" value="' + esc(d.ten) + '" placeholder="VD: Quỹ A, vàng, cổ phiếu">')
      + vnF('Ngày bắt đầu', '<input type="date" id="dt_ngay" value="' + esc(d.ngayMo) + '">')
      + vnF('Ghi chú <span class="mp-hint">(tùy chọn)</span>', '<input type="text" id="dt_note" maxlength="120" value="' + esc(d.ghiChu || '') + '">');
    if (!x){
      h += vnF('Vốn bỏ vào ngay <span class="mp-hint">(tùy chọn)</span>', dmMoney('dt_von', ''), '', 'Có số thì ghi luôn một lần bỏ vốn vào ngày bắt đầu. Tiền ra khỏi ví, không tính là chi tiêu.')
        + ((state.data.wallets || []).length > 1 ? vnF('Lấy từ ví', '<select id="dt_vi">' + viOptionsHtml(viDienSan()) + '</select>') : '');
    } else {
      h += dmToggle('dt_dong', 'Đóng khoản này', 'Coi như xong: vào mục "Đã đóng", không bỏ thêm vốn hay thu về nữa. Lãi / lỗ vẫn giữ nguyên.', x.dong)
        + '<button type="button" class="btn danger dm-xoa" data-act="dtXoaKhoan" data-id="' + esc(x.id) + '">' + icon('trash') + ' Xóa khoản này</button>';
    }
    return vnSheetKhung(x ? 'Sửa khoản đầu tư' : 'Thêm khoản đầu tư', h, x ? 'Cập nhật' : 'Lưu', 'dtKhoanLuu', 'mmHuy');
  }
  if (!x || (kieu !== 'von' && kieu !== 'thu')) return '';
  var von = kieu === 'von', t = dauTuTong(x.id);
  var h2 = '<div class="vn-note">' + icon('alert') + ' ' + (von ? 'Tiền ra khỏi ví, số dư giảm; không tính là chi tiêu.' : 'Tiền vào ví, số dư tăng; không tính là thu nhập.') + ' Hiện ' + esc(dauTuNhanLaiLo(t).toLowerCase()) + '.</div>'
    + vnF(von ? 'Số tiền bỏ vào' : 'Số tiền thu về', dmMoney('dt_tien', ''))
    + vnF('Ngày', '<input type="date" id="dt_ngay" value="' + todayStr() + '">')
    + ((state.data.wallets || []).length > 1 ? vnF(von ? 'Lấy từ ví' : 'Vào ví', '<select id="dt_vi">' + viOptionsHtml(viDienSan()) + '</select>') : '')
    + vnF('Ghi chú <span class="mp-hint">(tùy chọn)</span>', '<input type="text" id="dt_note" maxlength="60" value="">');
  return vnSheetKhung((von ? 'Bỏ vốn: ' : 'Thu về: ') + esc(x.ten), h2, 'Ghi vào Sổ tay', 'dtGhiLuu', 'mmHuy');
}

/* ---- sự kiện (handleCongCuAction chuyển tới đây) ---- */
function handleDauTuAction(act, el){
  el = el || {};
  var attr = function(k){ return (el.getAttribute && el.getAttribute(k)) || ''; };
  var val = function(i){ return ((document.getElementById(i) || {}).value || ''); };
  var ngayOk = function(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s); };
  if (act === 'dtThem'){ state.ccForm = { loai: 'dt', id: 'k|' }; ccSheetVe(); }
  else if (act === 'dtSua'){ state.ccForm = { loai: 'dt', id: 'k|' + attr('data-id') }; ccSheetVe(); }
  else if (act === 'dtVon' || act === 'dtThu'){ state.ccForm = { loai: 'dt', id: (act === 'dtVon' ? 'von|' : 'thu|') + attr('data-id') }; ccSheetVe(); }
  else if (act === 'dtKhoanLuu'){
    var p = String((state.ccForm && state.ccForm.id) || '').split('|'), cu = p[1] ? dauTuTim(p[1]) : null;
    var ten = val('dt_ten').replace(/\s+/g, ' ').trim(), ngay = val('dt_ngay'), note = val('dt_note').trim().slice(0, 120);
    if (!ten){ toast('Nhập tên khoản.', { loai: 'warn' }); return true; }
    if (!ngayOk(ngay)){ toast('Chọn ngày bắt đầu.', { loai: 'warn' }); return true; }
    if (cu){
      cu.ten = ten.slice(0, 60); cu.ngayMo = ngay; cu.ghiChu = note;
      var dong = !!(document.getElementById('dt_dong') || {}).checked;
      if (dong && !cu.dong) dauTuDong(cu.id, todayStr()); else if (!dong && cu.dong) dauTuMoLai(cu.id);
      state.ccForm = null; scheduleSave(); renderCongCu(); toast('Đã lưu "' + cu.ten + '".');
    } else {
      var von = numNonNeg(docSo(val('dt_von'))), vi = val('dt_vi');
      if (von > 0 && chayNeuDongY(canhBaoKhoan({ kind: 'chi', catId: 'dauTuVon', tien: von, ngay: ngay, ghiChu: ten, viId: vi || viMacDinhId(), batThuong: false, loiHua: false }), act, el, handleDauTuAction)) return true;
      var x = dauTuThem(ten, ngay, note);
      if (von > 0) dauTuBoVon(x.id, ngay, von, vi);
      state.ccForm = null; scheduleSave(); renderCongCu(); toast('Đã thêm "' + x.ten + '"' + (von > 0 ? ' và ghi bỏ vốn ' + fmt(Math.round(von)) + '.' : '.'));
    }
  } else if (act === 'dtGhiLuu'){
    var q = String((state.ccForm && state.ccForm.id) || '').split('|'), loai = q[0] === 'von' ? 'dauTuVon' : 'dauTuThu', k = dauTuTim(q[1]);
    if (!k) return true;
    var tien = numNonNeg(docSo(val('dt_tien'))), ng = val('dt_ngay'), vi2 = val('dt_vi') || viMacDinhId(), gc = val('dt_note').trim().slice(0, 60);
    if (!(tien > 0)){ toast('Nhập số tiền.', { loai: 'warn' }); return true; }
    if (!ngayOk(ng)){ toast('Chọn ngày.', { loai: 'warn' }); return true; }
    if (loai === 'dauTuVon' && chayNeuDongY(canhBaoKhoan({ kind: 'chi', catId: 'dauTuVon', tien: tien, ngay: ng, ghiChu: gc || k.ten, viId: vi2, batThuong: false, loiHua: false }), act, el, handleDauTuAction)) return true;
    var note2 = (loai === 'dauTuVon' ? 'Bỏ vốn: ' : 'Thu về: ') + k.ten + (gc ? ' (' + gc + ')' : '');
    var truoc = dauTuLichSu(k.id).map(function(l){ return l.rid; });
    if (!dauTuGhi(k.id, loai, ng, tien, vi2, note2)){ toast('Không ghi được khoản này.', { loai: 'err' }); return true; }
    var moi = dauTuLichSu(k.id).filter(function(l){ return truoc.indexOf(l.rid) < 0; })[0];
    state.ccForm = null; scheduleSave(); renderCongCu();
    toast((loai === 'dauTuVon' ? 'Đã ghi bỏ vốn ' : 'Đã ghi thu về ') + fmt(Math.round(tien)) + ' cho "' + k.ten + '". ' + dauTuNhanLaiLo(dauTuTong(k.id)) + '.', moi ? { hoanTac: function(){
      dauTuXoaLan(k.id, moi.ngay, moi.rid); scheduleSave(); renderCongCu();
    } } : undefined);
  } else if (act === 'dtXoaLan'){
    var id = attr('data-id'), g = dauTuXoaLan(id, attr('data-ngay'), attr('data-rid'));
    if (!g) return true;
    scheduleSave(); renderCongCu();
    toast('Đã xóa lần ' + (g.loai === 'dauTuVon' ? 'bỏ vốn ' : 'thu về ') + fmt(Math.round(g.soTien)) + '.', { hoanTac: function(){
      journalAddRef(g.ngay, id, g.loai, g.soTien, g.note, { rid: g.rid, walletId: g.walletId }); invalidateBalanceCache(); scheduleSave(); renderCongCu();
    } });
  } else if (act === 'dtXoaKhoan'){
    var kx = dauTuTim(attr('data-id')); if (!kx) return true;
    var n = dauTuLichSu(kx.id).length;
    var lam = function(){
      dauTuXoa(kx.id); state.ccForm = null; scheduleSave(); renderCongCu(); toast('Đã xóa "' + kx.ten + '"' + (n ? ' và ' + n + ' lần ghi ở Sổ tay.' : '.'));
    };
    if (!n) lam();
    else xacNhan('Xóa khoản "' + kx.ten + '"?', 'Xóa luôn ' + n + ' lần bỏ vốn / thu về ở Sổ tay, số dư trả về như chưa có khoản này. Không hoàn tác được. Muốn giữ lãi / lỗ thì chọn "Đóng khoản" thay vì xóa.', { chuOk: 'Xóa', chuHuy: 'Giữ lại' }).then(function(ok){ if (ok) lam(); });
  } else return false;
  return true;
}
