"use strict";
/* ====================================================================
   nhachan.js — NHẮC KHOẢN THU/CHI THEO NGÀY CỦA DANH MỤC (Tiền nhà, tiền dịch vụ, Lương...).
   Danh mục thu/chi có thể có cat.ngay (1-31, ngày thu/chi hằng tháng; không có = không nhắc). Chỉ NHẮC, không ghi tiền,
   không có số tiền: khác "giao dịch định kỳ" (có số tiền, ghi vào Sổ tay) và khác nhắc hạn Vay - Nợ.
   Một danh mục được nhắc từ N ngày trước hạn cho tới khi THÁNG ĐÓ có giao dịch ở danh mục này (quá hạn mà chưa ghi thì
   nhắc "quá hạn N ngày" suốt tháng). Đã ghi rồi thì nhắc lần tới của tháng sau khi còn trong N ngày.
   Nút "Hoàn thành" ở bảng chỉ TẮT NHẮC của kỳ đó (cat.xong = ['YYYY-MM', ...] các tháng đã tắt), KHÔNG ghi giao dịch nào,
   không đổi số dư. Ghi giao dịch thật ở Sổ tay cũng làm khoản đó hết nhắc (kỳ đó coi như đã thực hiện).
   Hiện thành chip "N khoản thu/chi sắp đến hạn" ở thẻ tổng quan Sổ tay; bấm vào mở bảng trượt từ đáy liệt kê, mỗi dòng có
   nút Ghi (mở Ghi nhanh với đúng danh mục đó). Danh mục hệ thống của Vay - Nợ không có ngày (đi theo lịch vay).
   Cần state.js (CAT_HE_THONG, catTen, catMau), vayno.js (ngayTraCuaKy, actualCatInMonth), sotay.js (qaMoSheet) load trước.
   ==================================================================== */

var NHAC_HAN_NGAY = 7;     // nhắc trước hạn bao nhiêu ngày

function catNgayHan(c){ var n = Math.round(num(c && c.ngay)); return (n >= 1 && n <= 31) ? n : 0; }

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
// badge số trên tab "Sổ tay": số khoản thu/chi sắp đến hạn (cùng con số với chip ở thẻ tổng quan), thấy được dù đang ở tab khác
function renderSoTayBadge(){
  var el = document.getElementById('stBadge');
  if (!el) return;
  var n = (state.data && state.data.categories) ? dsCatSapDenHan().length : 0;
  if (n > 0){ el.textContent = n; el.style.display = 'inline-block'; }
  else { el.style.display = 'none'; }
}
function nhacHanNhan(so){
  return so < 0 ? 'Quá hạn ' + (-so) + ' ngày' : (so === 0 ? 'Hôm nay' : (so === 1 ? 'Ngày mai' : 'Còn ' + so + ' ngày'));
}

/* ---- bảng trượt từ đáy ---- */
function nhacHanSheetHtml(){
  var ds = dsCatSapDenHan();
  var h = '<div class="qa-scrim" data-act="hanDong"></div>'
    + '<div class="qa-sheet" id="hanSheet" role="dialog" aria-modal="true" aria-label="Khoản thu chi sắp đến hạn"><div class="qa-grab" aria-hidden="true"></div>'
    + '<div class="qa-head"><h3>Sắp đến hạn</h3><button type="button" class="qa-x" data-act="hanDong" aria-label="Đóng">'+icon('x')+'</button></div>'
    + '<div class="qa-body">';
  if (!ds.length) h += '<div class="empty">Không còn khoản nào cần nhắc.</div>';
  ds.forEach(function(x){
    h += '<div class="han-r">'
      + '<span class="dl-dot" style="--c:'+catMau(x.kind, x.id)+'" aria-hidden="true"></span>'
      + '<span class="han-t"><b>'+esc(x.ten)+'</b><small>'+(x.kind === 'thu' ? 'Thu' : 'Chi')+' · hạn '+ngayVN(x.han)+'</small></span>'
      + '<span class="han-s'+(x.soNgay < 0 ? ' qua' : '')+'">'+nhacHanNhan(x.soNgay)+'</span>'
      + '<span class="han-b"><button type="button" class="btn secondary sm" data-act="hanXong" data-kind="'+x.kind+'" data-id="'+esc(x.id)+'" data-mk="'+x.mk+'">'+icon('check')+' Hoàn thành</button>'
      + '<button type="button" class="btn sm" data-act="hanGhi" data-kind="'+x.kind+'" data-id="'+esc(x.id)+'">Ghi</button></span></div>';
  });
  return h + '<div class="vn-hint" style="margin-top:12px">Nhắc theo "Ngày thu/chi hằng tháng" đặt ở từng danh mục (tab Danh mục). "Hoàn thành" chỉ tắt nhắc, không ghi vào sổ. Ghi giao dịch ở danh mục đó cũng tự hết nhắc.</div></div></div>';
}
function nhacHanSheetVe(){
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  if (state.tab !== 'sotay') state.hanMo = false;
  var root = document.getElementById('hanSheetRoot');
  if (!state.hanMo || !state.data){
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (!vnMoKhoaNen()) document.body.classList.remove('qa-mo');
    return;
  }
  if (root && root.parentNode) root.parentNode.removeChild(root);
  root = document.createElement('div');
  root.id = 'hanSheetRoot';
  root.className = 'qa-back moi';
  root.innerHTML = nhacHanSheetHtml();
  document.body.appendChild(root);
  document.body.classList.add('qa-mo');
  if (typeof qaKhopKhungNhin === 'function') qaKhopKhungNhin();
  setTimeout(function(){ root.classList.remove('moi'); }, 400);
}

function handleNhacHanAction(act, el){
  if (act === 'hanMo'){ state.hanMo = true; nhacHanSheetVe(); return true; }
  if (act === 'hanDong'){ state.hanMo = false; nhacHanSheetVe(); return true; }
  if (act === 'hanXong'){
    var kX = el.getAttribute('data-kind') === 'thu' ? 'thu' : 'chi', idX = el.getAttribute('data-id'), mkX = el.getAttribute('data-mk');
    if (!nhacHanHoanThanh(kX, idX, mkX)) return true;
    scheduleSave();
    nhacHanSheetVe();
    if (typeof renderSoTay === 'function' && state.tab === 'sotay') renderSoTay();
    toast('Đã tắt nhắc "' + catTen(kX, idX) + '" (không ghi vào sổ).', { hoanTac: function(){
      nhacHanHoanTac(kX, idX, mkX); scheduleSave();
      if (state.hanMo) nhacHanSheetVe();
      if (state.tab === 'sotay') renderSoTay();
    } });
    return true;
  }
  if (act === 'hanGhi'){
    var kind = el.getAttribute('data-kind') === 'thu' ? 'thu' : 'chi', id = el.getAttribute('data-id');
    state.hanMo = false; nhacHanSheetVe();
    state.qa.kind = kind; state.qa.cat[kind] = id;
    if (typeof qaGhiNho === 'function') qaGhiNho();
    qaMoSheet();
    return true;
  }
  return false;
}
