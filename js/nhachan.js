"use strict";
/* ====================================================================
   nhachan.js — NHẮC KHOẢN THU/CHI THEO NGÀY CỦA DANH MỤC (Tiền nhà, tiền dịch vụ, Lương...).
   Danh mục thu/chi có thể có cat.ngay (1-31, ngày thu/chi hằng tháng; không có = không nhắc). Chỉ NHẮC, không ghi tiền,
   không có số tiền: khác "giao dịch định kỳ" (có số tiền, ghi vào Sổ tay) và khác nhắc hạn Vay - Nợ.
   Một danh mục được nhắc từ N ngày trước hạn cho tới khi THÁNG ĐÓ có giao dịch ở danh mục này (quá hạn mà chưa ghi thì
   nhắc "quá hạn N ngày" suốt tháng). Đã ghi rồi thì nhắc lần tới của tháng sau khi còn trong N ngày.
   Nút "Hoàn thành" ở bảng chỉ TẮT NHẮC của kỳ đó (cat.xong = ['YYYY-MM', ...] các tháng đã tắt), KHÔNG ghi giao dịch nào,
   không đổi số dư. Ghi giao dịch thật ở Sổ tay cũng làm khoản đó hết nhắc (kỳ đó coi như đã thực hiện).
   Hiện ở CHUÔNG THÔNG BÁO (chuong.js, loại 'cat'): bấm vào mục thì mở Ghi nhanh với đúng danh mục đó (nhacHanGhi), nút "Hoàn thành" tắt nhắc kỳ đó.
   Danh mục hệ thống của Vay - Nợ không có ngày (đi theo lịch vay).
   Cần state.js (CAT_HE_THONG, catTen, catMau), vayno-tinh.js (ngayTraCuaKy, actualCatInMonth), sotay.js (qaMoSheet) load trước.
   ==================================================================== */

var NHAC_HAN_NGAY = 7;     // nhắc trước hạn bao nhiêu ngày

function catNgayHan(c){ var n = Math.round(num(c && c.ngay)); return (n >= 1 && n <= 31) ? n : 0; }
/* NHẮC THEO ÂM LỊCH (giỗ, mùng 1 / rằm, sinh nhật âm...): cat.ngayAm (1–30), cat.thangAm (0 = hằng tháng âm, 1–12 = hằng năm).
   Ngày dương (cat.ngay) đã đặt thì dùng ngày dương, bỏ qua âm lịch. Kỳ nhắc là TỪNG LẦN xảy ra (một ngày dương cụ thể), không theo tháng dương:
   nhắc từ N ngày trước tới 7 ngày sau (quá hạn); hết nhắc khi cat.xong có đúng ngày đó, hoặc đã có giao dịch ở danh mục trong [ngày−N, ngày+7].
   Cần amlich.js (alNgayDuong). */
var NHAC_QUA_HAN_AM = 7;
function catAm(c){
  if (!c || catNgayHan(c)) return null;
  var n = Math.round(num(c.ngayAm));
  if (!(n >= 1 && n <= 30)) return null;
  var t = Math.round(num(c.thangAm));
  return { ngay: n, thang: (t >= 1 && t <= 12) ? t : 0 };
}
function catAmHangNam(c){ var a = catAm(c); return !!(a && a.thang > 0); }
function catCongNgay(d, n){
  var t = new Date(parseInt(d.slice(0, 4), 10), parseInt(d.slice(5, 7), 10) - 1, parseInt(d.slice(8, 10), 10) + n);
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
}
// các ngày dương trong [tu, den] rơi đúng ngày âm của danh mục
function catAmNgayDuong(c, tu, den){ var a = catAm(c); return a ? alNgayDuong(a.ngay, a.thang, tu, den) : []; }
// ngày hạn của danh mục trong tháng dương mk: ngày dương nếu có, không thì lần âm lịch ĐẦU TIÊN rơi trong tháng; '' nếu không có
function catHanTrongThang(c, mk){
  var n = catNgayHan(c);
  if (n) return ngayTraCuaKy(mk, n);
  var ds = catAmNgayDuong(c, mk + '-01', mk + '-' + pad2(daysInMonth(mk)));
  return ds.length ? ds[0] : '';
}
// tổng tiền đã ghi ở danh mục trong khoảng ngày [tu, den]
function catGhiTrongKhoang(kind, id, tu, den){
  var s = 0;
  Object.keys(state.data.journal).forEach(function(d){
    if (d < tu || d > den) return;
    s += num((state.data.journal[d][kind] || {})[id]);
  });
  return s;
}

// các danh mục cần nhắc: [{ kind, id, ten, han ('YYYY-MM-DD'), soNgay (âm = quá hạn) }], gần hạn nhất trước
function dsCatSapDenHan(nNgay, homNay){
  nNgay = nNgay == null ? NHAC_HAN_NGAY : nNgay;
  homNay = homNay || todayStr();
  var mk = monthKey(homNay), mkSau = monthKeyAdd(mk, 1), out = [];
  ['thu', 'chi'].forEach(function(kind){
    var he = CAT_HE_THONG[kind] || {};
    (state.data.categories[kind] || []).forEach(function(c){
      var n = catNgayHan(c);
      if (!n || he[c.id]) return;
      var xong = Array.isArray(c.xong) ? c.xong : [];
      var han = ngayTraCuaKy(mk, n);
      if (!(actualCatInMonth(kind, c.id, mk) > 0)){
        if (xong.indexOf(mk) >= 0) return;
        // tháng này chưa có giao dịch: nhắc (kể cả quá hạn) khi còn trong N ngày
        var so = daysBetween(homNay, han);
        if (so <= nNgay) out.push({ kind: kind, id: c.id, ten: c.ten, han: han, soNgay: so, mk: mk });
        return;
      }
      // tháng này đã ghi: chỉ nhắc kỳ của tháng sau khi đã gần (cuối tháng)
      var han2 = ngayTraCuaKy(mkSau, n), so2 = daysBetween(homNay, han2);
      if (so2 <= nNgay && xong.indexOf(mkSau) < 0) out.push({ kind: kind, id: c.id, ten: c.ten, han: han2, soNgay: so2, mk: mkSau });
    });
    // theo âm lịch: mỗi lần xảy ra là một kỳ, khóa 'xong' là chính ngày dương đó
    (state.data.categories[kind] || []).forEach(function(c){
      if (he[c.id] || !catAm(c)) return;
      var xong = Array.isArray(c.xong) ? c.xong : [];
      catAmNgayDuong(c, catCongNgay(homNay, -NHAC_QUA_HAN_AM), catCongNgay(homNay, nNgay)).forEach(function(han){
        if (xong.indexOf(han) >= 0) return;
        if (catGhiTrongKhoang(kind, c.id, catCongNgay(han, -nNgay), catCongNgay(han, NHAC_QUA_HAN_AM)) > 0) return;
        out.push({ kind: kind, id: c.id, ten: c.ten, han: han, soNgay: daysBetween(homNay, han), mk: han, am: true });
      });
    });
  });
  out.sort(function(a, b){ return a.soNgay - b.soNgay || (a.ten < b.ten ? -1 : 1); });
  return out;
}
// tắt nhắc kỳ mk của danh mục (không ghi giao dịch). Chỉ giữ vài tháng gần nhất cho gọn dữ liệu.
function nhacHanHoanThanh(kind, id, mk){
  var c = (state.data.categories[kind] || []).filter(function(x){ return x.id === id; })[0];
  if (!c) return false;
  var ds = Array.isArray(c.xong) ? c.xong : [];
  if (ds.indexOf(mk) < 0) ds.push(mk);
  c.xong = ds.sort().slice(-6);
  return true;
}
function nhacHanHoanTac(kind, id, mk){
  var c = (state.data.categories[kind] || []).filter(function(x){ return x.id === id; })[0];
  if (!c || !Array.isArray(c.xong)) return;
  c.xong = c.xong.filter(function(m){ return m !== mk; });
  if (!c.xong.length) delete c.xong;
}
function nhacHanNhan(so){
  return so < 0 ? 'Quá hạn ' + (-so) + ' ngày' : (so === 0 ? 'Hôm nay' : (so === 1 ? 'Ngày mai' : 'Còn ' + so + ' ngày'));
}

/* ---- mở Ghi nhanh với đúng danh mục (từ chuông thông báo, chuong.js): vẫn Ghi ở Sổ tay, không ghi gì ở đây ---- */
function nhacHanGhi(kind, id){
  kind = kind === 'thu' ? 'thu' : 'chi';
  state.qa.kind = kind; state.qa.cat[kind] = id;
  if (typeof qaGhiNho === 'function') qaGhiNho();
  qaMoSheet();
}
