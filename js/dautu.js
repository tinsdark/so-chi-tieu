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
function dauTuGhi(id, loai, ngay, soTien, viId, note, gc){
  var x = dauTuTim(id), so = Math.round(num(soTien));
  if (!x || (loai !== 'dauTuVon' && loai !== 'dauTuThu') || !/^\d{4}-\d{2}-\d{2}$/.test(ngay || '') || !(so > 0)) return false;
  dauTuDamBaoDanhMuc();
  var vi = (viId && walletById(viId)) ? viId : viMacDinhId();
  journalAddRef(ngay, id, loai, so, note || ((loai === 'dauTuVon' ? 'Bỏ vốn: ' : 'Thu về: ') + x.ten),
    gc ? { rid: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), walletId: vi, gc: String(gc).slice(0, 60) }
       : { rid: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), walletId: vi });
  invalidateBalanceCache();
  return true;
}
function dauTuBoVon(id, ngay, soTien, viId, note, gc){ return dauTuGhi(id, 'dauTuVon', ngay, soTien, viId, note, gc); }
function dauTuThuVe(id, ngay, soTien, viId, note, gc){ return dauTuGhi(id, 'dauTuThu', ngay, soTien, viId, note, gc); }

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
      return { ngay: ngay, loai: r.loai, soTien: num(r.soTien), note: r.note || '', rid: r.rid, walletId: r.walletId, gc: r.gc || '' };
    }
  }
  return null;
}
// ghi chú người dùng gõ cho 1 lần ghi: ref.gc (bản mới); bản đầu chưa có gc thì lấy phần trong ngoặc cuối của ghi chú "Bỏ vốn: Tên (ghi chú)"
function dauTuGcCuaRef(r){
  if (r.gc) return String(r.gc);
  var m = /\(([^()]*)\)\s*$/.exec(String(r.note || ''));
  return m ? m[1] : '';
}
// các lần ghi của MỘT khoản (id) hoặc của MỌI khoản (id rỗng), MỚI NHẤT trước:
// [{ id, ten, ngay, loai, soTien, rid, viId, gc }]. Khoản đã bị xóa thì không còn dòng nào (xóa khoản gỡ luôn các lần ghi).
function dauTuLichSu(id, d){
  d = d || state.data;
  var out = [];
  Object.keys(d.journal).sort().reverse().forEach(function(date){
    ((d.journal[date] || {}).refs || []).slice().reverse().forEach(function(r){
      if ((r.loai !== 'dauTuVon' && r.loai !== 'dauTuThu') || (id && r.loanId !== id)) return;
      var k = dauTuTim(r.loanId, d);
      if (!k) return;
      out.push({ id: r.loanId, ten: k.ten, ngay: date, loai: r.loai, soTien: num(r.soTien), rid: r.rid || '', viId: viCuaRef(r, d), gc: dauTuGcCuaRef(r) });
    });
  });
  return out;
}

/* PHÂN TÍCH (dashboard ở trang Đầu tư): chỉ đọc dòng tiền đã ghi, không định giá. Hàm thuần để test.
   Trả { tong:{von,thu,lai,thuLai (thu ÷ vốn, null nếu chưa bỏ vốn)}, dem:{tong,dang,dong,lai,lo,hoa}, khoan:[{id,ten,dong,von,thu,lai,thuLai,tt,ngayDau,lanCuoi,soNgay,conKet}],
          thang:[{mk,von,thu,lai(lũy kế tới cuối tháng)}] (tối đa 36 tháng gần nhất), conKet, thuTB (thu về TB/tháng của các khoản đang chạy, 3 tháng trọn gần nhất; null nếu < 2 tháng),
          thangHoaVon (ước số tháng nữa để thu đủ vốn còn kẹt; null nếu không ước được), tot, te (khoản lãi nhất / lỗ nhất), lau (khoản đang chạy còn lỗ, lâu chưa có lần ghi nào) } */
function dauTuPhanTich(homNay, d){
  d = d || state.data; homNay = homNay || todayStr();
  var ds = d.dauTu || [], byId = {}, refs = [];
  ds.forEach(function(x){ byId[x.id] = { x: x, von: 0, thu: 0, ngayDau: '', lanCuoi: '' }; });
  Object.keys(d.journal).sort().forEach(function(date){
    ((d.journal[date] || {}).refs || []).forEach(function(r){
      var b = byId[r.loanId];
      if (!b || (r.loai !== 'dauTuVon' && r.loai !== 'dauTuThu')) return;
      var v = num(r.soTien);
      if (r.loai === 'dauTuVon') b.von += v; else b.thu += v;
      if (!b.ngayDau) b.ngayDau = date; b.lanCuoi = date;
      refs.push({ id: r.loanId, ngay: date, von: r.loai === 'dauTuVon' ? v : 0, thu: r.loai === 'dauTuThu' ? v : 0 });
    });
  });
  var out = { tong: { von: 0, thu: 0, lai: 0, thuLai: null }, dem: { tong: ds.length, dang: 0, dong: 0, lai: 0, lo: 0, hoa: 0 }, khoan: [], thang: [], conKet: 0, thuTB: null, thangHoaVon: null, tot: null, te: null, lau: null };
  ds.forEach(function(x){
    var b = byId[x.id], lai = b.thu - b.von, tt = (b.von <= 0 && b.thu <= 0) ? 'chua' : (Math.abs(lai) < 0.5 ? 'hoa' : (lai < 0 ? 'lo' : 'lai'));
    var den = x.dong ? (x.ngayDong || homNay) : homNay;
    var k = { id: x.id, ten: x.ten, dong: x.dong, von: b.von, thu: b.thu, lai: lai, thuLai: b.von > 0 ? b.thu / b.von : null, tt: tt, ngayDau: b.ngayDau, lanCuoi: b.lanCuoi,
              soNgay: b.ngayDau ? Math.max(0, lhSoNgay(b.ngayDau, den)) : 0, conKet: (!x.dong && lai < 0) ? -lai : 0 };
    out.khoan.push(k);
    out.tong.von += b.von; out.tong.thu += b.thu;
    if (x.dong) out.dem.dong++; else out.dem.dang++;
    if (tt === 'lai') out.dem.lai++; else if (tt === 'lo') out.dem.lo++; else if (tt === 'hoa') out.dem.hoa++;
    out.conKet += k.conKet;
  });
  out.tong.lai = out.tong.thu - out.tong.von;
  out.tong.thuLai = out.tong.von > 0 ? out.tong.thu / out.tong.von : null;
  out.khoan.sort(function(a, b){ return a.lai - b.lai; });          // lỗ nhiều nhất lên đầu
  var coSo = out.khoan.filter(function(k){ return k.von > 0; });
  var tot = coSo.filter(function(k){ return k.lai > 0.5; }).sort(function(a, b){ return b.lai - a.lai; })[0], te = coSo.filter(function(k){ return k.lai < -0.5; })[0];
  out.tot = tot || null; out.te = te || null;
  out.lau = out.khoan.filter(function(k){ return k.conKet > 0 && k.lanCuoi && lhSoNgay(k.lanCuoi, homNay) >= 60; })
    .sort(function(a, b){ return a.lanCuoi < b.lanCuoi ? -1 : 1; })[0] || null;
  // theo tháng: từ tháng có lần ghi đầu tiên tới tháng hiện tại (hoặc tháng của lần ghi cuối nếu ở tương lai)
  if (refs.length){
    var mk0 = monthKey(refs[0].ngay), mk1 = monthKey(homNay), mkL = monthKey(refs[refs.length - 1].ngay);
    if (mkL > mk1) mk1 = mkL;
    var cum = 0, m = mk0, bang = {};
    refs.forEach(function(r){ var mk = monthKey(r.ngay); bang[mk] = bang[mk] || { von: 0, thu: 0, thuDang: 0 }; bang[mk].von += r.von; bang[mk].thu += r.thu; if (!byId[r.id].x.dong) bang[mk].thuDang += r.thu; });
    for (var i = 0; i < 600 && m <= mk1; i++){
      var b = bang[m] || { von: 0, thu: 0, thuDang: 0 };
      cum += b.thu - b.von;
      out.thang.push({ mk: m, von: b.von, thu: b.thu, thuDang: b.thuDang, lai: cum });
      m = monthKeyAdd(m, 1);
    }
    var tron = out.thang.filter(function(t){ return t.mk < monthKey(homNay); }).slice(-3);
    if (tron.length >= 2){
      var sum = 0; tron.forEach(function(t){ sum += t.thuDang; });
      out.thuTB = sum / tron.length; out.soThangTB = tron.length; out.sumTB = sum;
      if (out.conKet > 0 && out.thuTB > 0) out.thangHoaVon = Math.ceil(out.conKet / out.thuTB);
    }
    out.thang = out.thang.slice(-36);
  }
  return out;
}

/* ---- giao diện: trang "Đầu tư" trong Công cụ (CC_TRANG ở congcu.js): 3 phần Danh sách · Lịch sử · Phân tích ---- */
state.dtTab = state.dtTab || 'ds';        // 'ds' | 'ls' | 'pt'
state.dtLoc = state.dtLoc || '';          // tab Lịch sử: lọc theo id khoản ('' = tất cả)
state.dtLs = state.dtLs || {};            // số lần ghi đang hiện: theo id khoản (tab Danh sách) hoặc '*' (tab Lịch sử)
var DT_LS_DAU = 5, DT_LS_BUOC = 10;       // dưới mỗi khoản ở tab Danh sách: hiện 5 lần mới nhất, "Xem thêm" +10
var DT_LS_TAT_DAU = 20, DT_LS_TAT_BUOC = 20;   // tab Lịch sử: 20 lần, "Xem thêm" +20
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
// 1 lần ghi: ngày (+ tên khoản ở tab Lịch sử), loại · ví · ghi chú, số tiền, nút xóa
function dtLanHtml(l, hienTen){
  var coNhieuVi = (state.data.wallets || []).length > 1, von = l.loai === 'dauTuVon';
  var phu = [von ? 'Bỏ vốn' : 'Thu về'];
  if (coNhieuVi) phu.push(esc(viTen(l.viId)));
  if (l.gc) phu.push(esc(l.gc));
  return '<div class="dt-ln"><div class="dt-ln-m"><b>' + ngayVN(l.ngay) + (hienTen ? ' · ' + esc(l.ten) : '') + '</b><small>' + phu.join(' · ') + '</small></div>'
    + '<b class="' + (von ? 'chi' : 'thu') + '">' + (von ? '−' : '+') + fmt(Math.round(l.soTien)) + '</b>'
    + '<button type="button" class="btn secondary sm nguy" data-act="dtXoaLan" data-id="' + esc(l.id) + '" data-ngay="' + l.ngay + '" data-rid="' + esc(l.rid) + '" aria-label="Xóa lần ghi này">' + icon('trash') + '</button></div>';
}
// nút Xem thêm / Thu gọn cho một danh sách đã cắt: key = id khoản hoặc '*'
function dtNutXemThem(key, dangHien, tong, dau, buoc){
  if (tong <= dau) return '';
  var h = '<div class="dt-xt">';
  if (dangHien < tong) h += '<button type="button" class="btn secondary sm" data-act="dtXemThem" data-k="' + esc(key) + '">Xem thêm ' + Math.min(buoc, tong - dangHien) + ' lần (còn ' + (tong - dangHien) + ')</button>';
  if (dangHien > dau) h += '<button type="button" class="btn secondary sm" data-act="dtThuGon" data-k="' + esc(key) + '">Thu gọn</button>';
  return h + '</div>';
}
function dtDongHtml(x){
  var t = dauTuTong(x.id), ls = dauTuLichSu(x.id), n = Math.min(ls.length, num(state.dtLs[x.id]) || DT_LS_DAU), h = '<div class="cc-it">'
    + '<div class="cc-it-h"><b>' + esc(x.ten) + '</b>' + dtTagLaiLo(t) + '</div>'
    + '<div class="cc-it-s"><span class="muted">Đã bỏ vốn ' + fmt(Math.round(t.von)) + ' · thu về ' + fmt(Math.round(t.thu)) + '</span></div>'
    + (x.ghiChu ? '<div class="cc-it-s"><span class="muted">' + esc(x.ghiChu) + '</span></div>' : '');
  if (ls.length) h += '<div class="dt-lsx">' + ls.slice(0, n).map(function(l){ return dtLanHtml(l, false); }).join('') + '</div>' + dtNutXemThem(x.id, n, ls.length, DT_LS_DAU, DT_LS_BUOC);
  h += '<div class="cc-it-b">'
    + (x.dong ? '' : '<button type="button" class="btn secondary sm" data-act="dtVon" data-id="' + esc(x.id) + '">Bỏ thêm vốn</button>'
               + '<button type="button" class="btn secondary sm" data-act="dtThu" data-id="' + esc(x.id) + '">Thu về</button>')
    + '<button type="button" class="btn secondary sm" data-act="dtSua" data-id="' + esc(x.id) + '">' + icon('pencil') + ' Sửa</button></div></div>';
  return h;
}
function dtThanhTabHtml(){
  var T = [['ds', 'Danh sách'], ['ls', 'Lịch sử'], ['pt', 'Phân tích']];
  return '<div class="dt-mode dm-seg" role="tablist" aria-label="Phần của trang Đầu tư">' + T.map(function(t){
    var on = state.dtTab === t[0];
    return '<button type="button" role="tab" data-act="dtTab" data-v="' + t[0] + '" class="' + (on ? 'on' : '') + '" aria-selected="' + on + '">' + t[1] + '</button>';
  }).join('') + '</div>';
}
function dtTabDanhSachHtml(){
  var ds = state.data.dauTu || [], dang = ds.filter(function(x){ return !x.dong; }), xong = ds.filter(function(x){ return x.dong; });
  var tong = dauTuTongTat(), tt = Math.abs(tong.lai) < 0.5 ? 'hoa' : (tong.lai < 0 ? 'lo' : 'lai');
  var h = '<div class="cc-r"><span>Đã bỏ vốn</span><b class="chi">' + fmt(Math.round(tong.von)) + '</b></div>'
    + '<div class="cc-r"><span>Đã thu về</span><b class="thu">' + fmt(Math.round(tong.thu)) + '</b></div>'
    + '<div class="cc-r"><span>' + (tt === 'lai' ? 'Lãi' : (tt === 'hoa' ? 'Hòa vốn' : 'Còn lỗ')) + '</span><b class="' + (tt === 'lo' ? 'chi' : (tt === 'lai' ? 'thu' : '')) + '">' + fmt(Math.round(Math.abs(tong.lai))) + '</b></div>';
  h += giaiThichSo([
    { ten: 'Lãi / lỗ', ct: 'Tổng tiền thu về − tổng vốn đã bỏ, của mọi khoản (kể cả khoản đã đóng). Vốn coi như đã mất, chỉ tiền thu về mới cộng lại; không có "giá trị hiện tại".', pt: ptCong([tong.thu, -tong.von], tong.lai) },
    { ten: 'Ảnh hưởng tới số dư và Tài sản ròng', ct: 'Bỏ vốn làm số dư ví và Tài sản ròng giảm ngay; thu về làm tăng lại. Cả hai không tính vào Thu nhập, Chi tiêu, hạn mức hay "Hôm nay còn tiêu được".', pt: ptCong([-tong.von, tong.thu], tong.lai) }
  ], 'Cách tính các số này');
  h += '<div class="cc-ds">' + (dang.length ? dang.map(dtDongHtml).join('') : '<div class="empty">Không có khoản đang chạy.</div>') + '</div>';
  if (xong.length) h += '<div class="dm-sub" style="margin-top:16px"><b>Đã đóng</b></div><div class="cc-ds">' + xong.slice().sort(function(a, b){ return a.ngayDong < b.ngayDong ? 1 : -1; }).slice(0, 8).map(dtDongHtml).join('') + '</div>';
  return h;
}
// tab Lịch sử: mọi lần bỏ vốn / thu về, mới nhất trước, gom theo tháng, lọc theo khoản, Xem thêm
function dtTabLichSuHtml(){
  var ds = state.data.dauTu || [];
  if (state.dtLoc && !dauTuTim(state.dtLoc)) state.dtLoc = '';
  var h = '<div class="qa-chips" role="group" aria-label="Lọc theo khoản"><button type="button" class="qa-chip' + (state.dtLoc ? '' : ' on') + '" data-act="dtLoc" data-id="">Tất cả</button>'
    + ds.map(function(x){ return '<button type="button" class="qa-chip' + (state.dtLoc === x.id ? ' on' : '') + '" data-act="dtLoc" data-id="' + esc(x.id) + '">' + esc(x.ten) + '</button>'; }).join('') + '</div>';
  var ls = dauTuLichSu(state.dtLoc), n = Math.min(ls.length, num(state.dtLs['*']) || DT_LS_TAT_DAU);
  if (!ls.length) return h + '<div class="empty" style="margin-top:12px">Chưa có lần bỏ vốn hay thu về nào.</div>';
  var von = 0, thu = 0; ls.forEach(function(l){ if (l.loai === 'dauTuVon') von += l.soTien; else thu += l.soTien; });
  h += '<div class="dt-ls-tong">' + ls.length + ' lần · bỏ vốn <b class="chi">' + fmt(Math.round(von)) + '</b> · thu về <b class="thu">' + fmt(Math.round(thu)) + '</b></div>';
  var mk = '', ben = '';
  ls.slice(0, n).forEach(function(l){
    var m = monthKey(l.ngay);
    if (m !== mk){
      if (ben) h += ben + '</div>';
      mk = m;
      var rong = 0; ls.forEach(function(x){ if (monthKey(x.ngay) === m) rong += (x.loai === 'dauTuThu' ? 1 : -1) * x.soTien; });
      h += '<div class="dt-th"><span>Tháng ' + parseInt(m.slice(5), 10) + '/' + m.slice(0, 4) + '</span><span class="' + (rong < 0 ? 'chi' : 'thu') + '">' + (rong > 0 ? '+' : (rong < 0 ? '−' : '')) + fmt(Math.round(Math.abs(rong))) + '</span></div><div class="dt-lsx">';
      ben = '1';
    }
    h += dtLanHtml(l, !state.dtLoc);
  });
  return h + '</div>' + dtNutXemThem('*', n, ls.length, DT_LS_TAT_DAU, DT_LS_TAT_BUOC);
}
// tab Phân tích: số tổng, vốn còn kẹt và ước hòa vốn, 2 biểu đồ, từng khoản, nhận xét. Mọi con số có "Cách tính".
function dtTabPhanTichHtml(){
  var p = dauTuPhanTich(), t = p.tong;
  if (!p.dem.tong || (t.von <= 0 && t.thu <= 0)) return '<div class="empty">Chưa có lần bỏ vốn hay thu về nào để phân tích. Ghi vài lần ở tab Danh sách rồi quay lại.</div>';
  var tt = Math.abs(t.lai) < 0.5 ? 'hoa' : (t.lai < 0 ? 'lo' : 'lai');
  var kpi = function(nhan, v, lop, phu){ return '<div><small>' + nhan + '</small><b' + (lop ? ' class="' + lop + '"' : '') + '>' + v + '</b>' + (phu ? '<em class="muted">' + phu + '</em>' : '') + '</div>'; };
  var h = '<div class="bd-kpi">' + kpi('Đã bỏ vốn', bdTien(t.von), 'chi') + kpi('Đã thu về', bdTien(t.thu), 'thu') + '</div>'
    + '<div class="bd-kpi" style="margin-top:12px">' + kpi(tt === 'lai' ? 'Lãi' : (tt === 'hoa' ? 'Hòa vốn' : 'Còn lỗ'), bdTien(Math.abs(t.lai)), tt === 'lo' ? 'chi' : (tt === 'lai' ? 'thu' : ''), '')
    + kpi('Đã thu lại', t.thuLai != null ? Math.round(t.thuLai * 100) + '%' : '—', '', 'so với vốn đã bỏ') + '</div>'
    + '<div class="dt-ls-tong" style="margin-top:12px">' + p.dem.tong + ' khoản: ' + p.dem.dang + ' đang chạy, ' + p.dem.dong + ' đã đóng · ' + p.dem.lai + ' lãi · ' + p.dem.lo + ' lỗ' + (p.dem.hoa ? ' · ' + p.dem.hoa + ' hòa vốn' : '') + '</div>';
  // vốn còn kẹt + ước hòa vốn (chỉ khoản đang chạy còn lỗ)
  if (p.conKet > 0.5){
    h += '<div class="dm-sub" style="margin-top:14px"><b>Để hòa vốn</b></div><div class="cc-r"><span>Còn cần thu về thêm (khoản đang chạy)</span><b class="chi">' + fmt(Math.round(p.conKet)) + '</b></div>';
    if (p.thangHoaVon != null) h += '<div class="cc-r"><span>Nếu giữ nhịp thu về ' + fmt(Math.round(p.thuTB)) + '/tháng</span><b>khoảng ' + p.thangHoaVon + ' tháng nữa</b></div>';
    else h += '<div class="vn-sub">' + (p.thuTB == null ? 'Chưa đủ 2 tháng trọn có dữ liệu để ước thời gian hòa vốn.' : 'Các tháng gần đây chưa thu về khoản nào nên chưa ước được thời gian hòa vốn.') + '</div>';
  }
  // biểu đồ
  var gan = p.thang.slice(-24), nhan = gan.map(function(x){ return 'T' + parseInt(x.mk.slice(5), 10) + (gan[0].mk.slice(0, 4) !== gan[gan.length - 1].mk.slice(0, 4) ? '/' + x.mk.slice(2, 4) : ''); });
  if (gan.length >= 2){
    h += '<div class="dm-sub" style="margin-top:14px"><b>Lãi / lỗ lũy kế theo tháng</b></div><div class="bd-box">' + bdLine({ W: 350, H: 170, labels: nhan, series: [{ ten: 'Lãi / lỗ lũy kế', vals: gan.map(function(x){ return x.lai; }), cls: t.lai < 0 ? 'chi' : 'thu', fill: true }],
      tipTitle: function(ix){ return nhan[ix]; }, money: bdTien, aria: 'Lãi / lỗ đầu tư lũy kế theo tháng' }) + '</div>';
    var g12 = gan.slice(-12), n12 = nhan.slice(-12);
    h += '<div class="dm-sub" style="margin-top:14px"><b>Bỏ vốn và thu về theo tháng</b></div><div class="bd-box">' + bdCombo({ W: 350, H: 190, labels: n12, thu: g12.map(function(x){ return x.thu; }), chi: g12.map(function(x){ return x.von; }),
      nhanThu: 'Thu về', nhanChi: 'Bỏ vốn', money: bdTien, aria: 'Bỏ vốn và thu về đầu tư theo tháng', thuaNhan: g12.length > 8 }) + '</div>';
  }
  // từng khoản
  var lonNhat = 0; p.khoan.forEach(function(k){ lonNhat = Math.max(lonNhat, Math.abs(k.lai)); });
  h += '<div class="dm-sub" style="margin-top:14px"><b>Từng khoản</b></div><div class="dt-kk">' + p.khoan.filter(function(k){ return k.tt !== 'chua'; }).map(function(k){
    var lop = k.tt === 'lo' ? 'chi' : (k.tt === 'lai' ? 'thu' : '');
    return '<div class="dt-kk-r"><div class="cc-it-h"><b>' + esc(k.ten) + (k.dong ? ' <span class="cc-tag">Đã đóng</span>' : '') + '</b><b class="' + lop + '">' + esc(dauTuNhanLaiLo(k)) + '</b></div>'
      + '<div class="dt-bar" aria-hidden="true"><i class="' + lop + '" style="width:' + (lonNhat > 0 ? Math.max(2, Math.round(Math.abs(k.lai) / lonNhat * 100)) : 0) + '%"></i></div>'
      + '<div class="cc-it-s"><span class="muted">Vốn ' + fmt(Math.round(k.von)) + ' · thu về ' + fmt(Math.round(k.thu)) + (k.thuLai != null ? ' (' + Math.round(k.thuLai * 100) + '%)' : '') + (k.soNgay ? ' · ' + ddThoiGian(k.soNgay) : '') + '</span></div></div>';
  }).join('') + '</div>';
  // nhận xét
  var nx = [];
  if (p.tot) nx.push('Khoản lãi nhất: <b>' + esc(p.tot.ten) + '</b> (lãi ' + fmt(Math.round(p.tot.lai)) + ').');
  if (p.te) nx.push('Khoản lỗ nhất: <b>' + esc(p.te.ten) + '</b> (còn lỗ ' + fmt(Math.round(-p.te.lai)) + ').');
  if (p.lau) nx.push('<b>' + esc(p.lau.ten) + '</b> còn lỗ ' + fmt(Math.round(p.lau.conKet)) + ' mà đã ' + ddThoiGian(lhSoNgay(p.lau.lanCuoi, todayStr())) + ' chưa có lần ghi nào (lần cuối ' + ngayVN(p.lau.lanCuoi) + ').');
  if (nx.length) h += '<div class="dm-sub" style="margin-top:14px"><b>Đáng chú ý</b></div><ul class="dn-ds">' + nx.map(function(x, i){ return '<li class="dn-' + (i === 0 && p.tot ? 'tot' : 'xau') + '"><i aria-hidden="true"></i><span>' + x + '</span></li>'; }).join('') + '</ul>';
  // cách tính
  var ds = [
    { ten: 'Lãi / lỗ', ct: 'Tổng thu về − tổng vốn đã bỏ. Vốn coi như đã mất, chỉ tiền thu về mới cộng lại.', pt: ptCong([t.thu, -t.von], t.lai) },
    { ten: 'Đã thu lại', ct: 'Tổng thu về ÷ tổng vốn đã bỏ. 100% là hòa vốn.', pt: t.thuLai != null ? soGt(t.thu) + ' ÷ ' + soGt(t.von) + ' = ' + Math.round(t.thuLai * 100) + '%' : null }
  ];
  if (p.conKet > 0.5){
    var cg = p.khoan.filter(function(k){ return k.conKet > 0; });
    ds.push({ ten: 'Còn cần thu về thêm', ct: 'Cộng, với từng khoản đang chạy còn lỗ: vốn đã bỏ − tiền đã thu về.',
      pt: cg.slice(0, 4).map(function(k){ return soGt(k.von) + ' − ' + soGt(k.thu) + ' = ' + soGt(k.conKet); }).join(' · ') + (cg.length > 4 ? ' · ...' : '') });
    if (p.thangHoaVon != null) ds.push({ ten: 'Ước số tháng hòa vốn', ct: 'Số còn cần thu về ÷ thu về trung bình mỗi tháng (các khoản đang chạy, ' + p.soThangTB + ' tháng trọn gần nhất), làm tròn lên. Chỉ là ước lượng thô, tiền thu về mỗi tháng thường không đều.',
      pt: soGt(p.conKet) + ' ÷ ' + soGt(p.thuTB) + ' (' + soGt(p.sumTB) + ' ÷ ' + p.soThangTB + ') → ' + p.thangHoaVon + ' tháng' });
  }
  return h + giaiThichSo(ds, 'Cách tính các số này');
}
function dtPageHtml(){
  var ds = state.data.dauTu || [];
  if (['ds', 'ls', 'pt'].indexOf(state.dtTab) < 0) state.dtTab = 'ds';
  var h = '<div class="card dm-card cc-card">' + dmHead('Đầu tư', '<button class="btn secondary sm" data-act="dtThem">+ Thêm khoản</button>')
    + '<div class="dm-sub">Theo dõi dòng tiền từng khoản: bỏ vốn là tiền ra thật (số dư giảm, không tính là chi tiêu), tiền thu về cộng lại, còn lỗ hay đã lãi hiện ngay. Không định giá tài sản.</div>';
  if (!ds.length) return h + '<div class="empty">Chưa có khoản nào. Ví dụ: bỏ vốn 10.000.000 vào "Quỹ A", sau đó mỗi lần thu về thì bấm "Thu về" và nhập số tiền.</div></div>';
  h += dtThanhTabHtml();
  h += state.dtTab === 'ls' ? dtTabLichSuHtml() : (state.dtTab === 'pt' ? dtTabPhanTichHtml() : dtTabDanhSachHtml());
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
  if (act === 'dtTab'){ state.dtTab = ['ds', 'ls', 'pt'].indexOf(attr('data-v')) >= 0 ? attr('data-v') : 'ds'; renderCongCu(); }
  else if (act === 'dtLoc'){ state.dtLoc = attr('data-id'); state.dtLs['*'] = 0; renderCongCu(); }
  else if (act === 'dtXemThem'){
    var kx0 = attr('data-k'), tat = kx0 === '*';
    state.dtLs[kx0] = (num(state.dtLs[kx0]) || (tat ? DT_LS_TAT_DAU : DT_LS_DAU)) + (tat ? DT_LS_TAT_BUOC : DT_LS_BUOC); renderCongCu();
  } else if (act === 'dtThuGon'){ state.dtLs[attr('data-k')] = 0; renderCongCu(); }
  else if (act === 'dtThem'){ state.ccForm = { loai: 'dt', id: 'k|' }; ccSheetVe(); }
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
    if (!dauTuGhi(k.id, loai, ng, tien, vi2, note2, gc)){ toast('Không ghi được khoản này.', { loai: 'err' }); return true; }
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
      journalAddRef(g.ngay, id, g.loai, g.soTien, g.note, g.gc ? { rid: g.rid, walletId: g.walletId, gc: g.gc } : { rid: g.rid, walletId: g.walletId }); invalidateBalanceCache(); scheduleSave(); renderCongCu();
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
