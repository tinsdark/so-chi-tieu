"use strict";
/* ====================================================================
   canhbao.js — HÀM CẢNH BÁO TRUNG TÂM cho mọi đường ghi một khoản vào sổ ("Kiểm tra trước khi ghi").
   Trước đây mỗi đường tự dán lệnh kiểm riêng nên chỉ 2 trong 8 đường (Ghi nhanh, sửa từng dòng) kiểm đủ ba thứ. Giờ MỘT hàm:
     canhBaoKhoan(o) -> mảng câu cảnh báo (rỗng = ổn), gồm: ví sắp âm / hạn mức thẻ / ví để dành · khoản chi BẤT THƯỜNG (gõ thừa số 0) · vượt LỜI HỨA.
   o = { kind: 'chi'|'thu', catId, tien, ngay, ghiChu, viId, viDelta (đổi số tiền ra khỏi ví, mặc định -tien), boIid (dòng đang sửa),
         homNay, batThuong:false (tắt luật bất thường), loiHua:false (tắt luật lời hứa), boViAm:true (không xét ví) }
   Chỉ khoản CHI bị xét bất thường và lời hứa; khoản thu không có cảnh báo nào.
   Khoản có SỐ TIỀN SẴN do người dùng xác nhận từ chỗ khác (Mua rồi, định kỳ, Sổ mừng) tắt luật bất thường (to là chuyện bình thường ở đó), vẫn xét ví và lời hứa.
   Mỗi đường chỉ còn một lớp mỏng: đọc ô nhập rồi gọi canhBaoKhoan, và hỏi xác nhận bằng chayNeuDongY (không hỏi lại lần hai nhờ el._daBaoAm).
   Cần state.js (viCanhBaoAm), sotay.js (chiBatThuong, qaCatChon), loihua.js (lhViPham, lhKhop, lhTrangThai), ui.js (xacNhan) load trước.
   ==================================================================== */

function thongDiepBatThuong(catId, tien, r){
  return 'Khoản chi ' + catTen('chi', catId) + ' ' + fmt(Math.round(tien)) + ' lớn gấp ' + Math.round(tien / r.m) + ' lần mức thường thấy '
    + '(trung vị ' + fmt(Math.round(r.m)) + ', cao nhất từng ghi ' + fmt(Math.round(r.max)) + ', tính trên ' + r.n + ' khoản trong 6 tháng qua). Có gõ thừa số 0 không?';
}
function canhBaoKhoan(o){
  var out = [], tien = num(o.tien);
  if (o.kind !== 'chi' || !(tien > 0)) return out;
  if (o.boViAm !== true){
    var a = viCanhBaoAm(o.viId, o.viDelta != null ? o.viDelta : -tien); if (a) out.push(a);
  }
  if (o.batThuong !== false){
    var r = chiBatThuong(o.catId, tien, o.boIid, o.homNay); if (r) out.push(thongDiepBatThuong(o.catId, tien, r));
  }
  if (o.loiHua !== false && (state.data.loiHua || []).length){
    lhViPham(o.catId, tien, o.ngay || todayStr(), o.boIid, o.homNay, o.ghiChu).forEach(function(x){ out.push(x); });
  }
  return out;
}
// hỏi xác nhận; trả Promise<boolean>
function xacNhanCanhBao(ds){
  return xacNhan('Kiểm tra trước khi ghi', ds.join('\n\n') + '\n\nVẫn ghi khoản này?', { chuOk: 'Vẫn ghi', chuHuy: 'Quay lại' });
}
// có cảnh báo thì hỏi, đồng ý thì chạy lại fn(act, el) với el._daBaoAm = true (để không hỏi lần hai); trả true nếu đã đứng ra hỏi (nơi gọi dừng lại)
function chayNeuDongY(ds, act, el, fn){
  if (!ds.length || el._daBaoAm) return false;
  xacNhanCanhBao(ds).then(function(ok){
    if (!ok) return;
    el._daBaoAm = true;
    try{ fn(act, el); }finally{ el._daBaoAm = false; }
  });
  return true;
}

/* ---- lớp mỏng cho các ô nhập ở Sổ tay (handleSoTayAction gọi): qaSave, stSaveItem, saveEntry, viChuyenLuu ---- */
function canhBaoGhi(act, el){
  var d = state.data, g = function(id){ return (document.getElementById(id) || {}).value; }, ds = [];
  if (act === 'qaSave'){
    if (state.qa.kind === 'thu') return '';
    ds = canhBaoKhoan({ kind: 'chi', catId: qaCatChon('chi'), tien: numNonNeg(docSo(g('qa_amount'))), ngay: g('qa_date') || todayStr(), ghiChu: g('qa_note') || '', viId: g('qa_wallet') || state.viChon });
  } else if (act === 'viChuyenLuu'){
    var tu = g('vi_tu'), den = g('vi_den');
    if (tu === den) return '';
    var a = viCanhBaoAm(tu, -numNonNeg(docSo(g('vi_tien'))));
    return a || '';
  } else if (act === 'stSaveItem'){
    var kc = (g('st_it_cat') || '').split('|'), tien = numNonNeg(docSo(g('st_it_tien')));
    var vi = g('st_it_wallet') || '', viId = walletById(vi) ? vi : viMacDinhId();
    var iid = (el.getAttribute && el.getAttribute('data-iid')) || '', ngay = (el.getAttribute && el.getAttribute('data-date')) || todayStr();
    var ghiChu = g('st_it_note') || '', cu = null, cuTien = 0;
    if (iid){
      cu = entryItems(d.journal[ngay]).filter(function(it){ return it.iid === iid; })[0] || null;
      if (cu && viCuaItem(cu) === viId) cuTien = (cu.kind === 'chi' ? -1 : 1) * num(cu.soTien);
    }
    var moi = (kc[0] === 'chi' ? -tien : (kc[0] === 'thu' ? tien : 0));
    var viAm = viCanhBaoAm(viId, moi - cuTien);
    if (viAm) ds.push(viAm);
    if (kc[0] === 'chi'){
      var doiTien = !(cu && num(cu.soTien) === tien), doiHet = !(cu && cu.catId === kc[1] && num(cu.soTien) === tien && String(cu.ghiChu || '') === ghiChu);
      ds = ds.concat(canhBaoKhoan({ kind: 'chi', catId: kc[1], tien: tien, ngay: ngay, ghiChu: ghiChu, boIid: iid, boViAm: true, batThuong: doiTien, loiHua: doiHet }));
    }
  } else if (act === 'saveEntry' && !state.editingDate){
    var tong = 0, cac = [];
    document.querySelectorAll('.f_chi').forEach(function(inp){
      var v = numNonNeg(docSo(inp.value)); tong += v;
      if (v > 0) cac.push({ catId: inp.getAttribute && inp.getAttribute('data-cat'), tien: v });
    });
    var vf = g('f_wallet') || viMacDinhId(), viAm2 = viCanhBaoAm(vf, -tong);
    if (viAm2) ds.push(viAm2);
    cac.forEach(function(c){
      ds = ds.concat(canhBaoKhoan({ kind: 'chi', catId: c.catId, tien: c.tien, ngay: g('f_date') || todayStr(), ghiChu: g('f_ghichu') || '', boViAm: true }));
    });
  } else return '';
  return ds.join('\n\n');
}

/* ---- Nhập file: cảnh báo ở bước XEM TRƯỚC (không hỏi từng dòng): ví sắp âm và lời hứa sẽ bị vượt khi nhập cả file ---- */
function canhBaoNhap(kq, viId){
  var out = [], rong = kq.tongThu - kq.tongChi;
  var a = viCanhBaoAm(viId, rong); if (a && rong < 0) out.push(a);
  (state.data.loiHua || []).forEach(function(h){
    var t = lhTrangThai(h);
    if (t.trang === 'pha') return;
    var moi = kq.dong.filter(function(x){
      return !x.loi && !x.trung && x.kind === 'chi' && x.ngay >= h.tuNgay && x.ngay <= h.denNgay && lhKhop(h, x.catId || '', x.note || x.catTen || '');
    });
    if (!moi.length) return;
    var tong = 0; moi.forEach(function(x){ tong += x.soTien; });
    var vuot = h.kieu === 'tien' ? t.tong + tong > h.gioiHan + 0.5 : t.n + moi.length > h.gioiHan;
    if (!vuot) return;
    out.push('Lời hứa "' + h.cau + '": file này thêm ' + moi.length + ' khoản chi (' + fmt(Math.round(tong)) + ') vào ' + lhDoiTuong(h) + ', sẽ làm vượt mức đã hứa ('
      + (h.kieu === 'tien' ? 'đã chi ' + fmt(Math.round(t.tong)) + ', tối đa ' + fmt(Math.round(h.gioiHan)) : 'đã ' + t.n + ' lần, tối đa ' + Math.round(h.gioiHan) + ' lần') + ').');
  });
  return out;
}
