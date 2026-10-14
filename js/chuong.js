"use strict";
/* ====================================================================
   chuong.js — CHUÔNG THÔNG BÁO ở header: MỘT nơi duy nhất cho mọi lời nhắc của app (thay các nút nhỏ ở thẻ đầu Sổ tay,
   số đỏ trên tab Sổ tay / Vay - Nợ và bảng "Sắp đến hạn").

   QUY TẮC (theo yêu cầu):
   - Số đỏ trên chuông = số thông báo CHƯA XEM. Mở chuông KHÔNG làm số giảm. Chỉ khi bấm vào chính mục đó (mở nó) thì mục đó mới thành "đã xem"
     và số giảm 1. Mục đã xem VẪN nằm trong chuông (mờ hơn).
   - Một mục chỉ BIẾN MẤT khỏi chuông khi: (1) việc đã xong (đã thanh toán / ghi sổ / hoàn thành / đã bỏ qua, vì mọi mục đều TÍNH LẠI từ dữ liệu
     thật mỗi lần vẽ), hoặc (2) quá hạn hơn CB_HET_HAN = 15 ngày mà vẫn chưa xong. Chuông không lưu danh sách riêng nên không thể lệch với dữ liệu.
   - Mục đang "sắp đến hạn" rồi chuyển sang "đã đến hạn / quá hạn" là THÔNG BÁO MỚI (khóa khác nhau: hậu tố :s / :q) nên số đỏ tăng lại.
   - Trạng thái "đã xem" lưu ở settings.thongBaoXem = { khóa: 'YYYY-MM-DD' } (lên Drive, mọi máy cùng thấy); khóa cũ hơn 120 ngày tự dọn.
   - Loại thông báo có thể tắt riêng từng máy (ht.js, mục Cài đặt → Hiển thị): loại bị tắt không hiện và không đếm.

   11 loại: dk (định kỳ đến hạn), cat (khoản thu/chi theo ngày của danh mục), vn (Vay - Nợ đến hạn), the (thanh toán thẻ), vt (ví sắp thiếu tiền),
   ds (ví lâu chưa đối soát), bh (bảo hành sắp hết), mm (món Muốn mua đủ thời gian chờ), hm (danh mục vượt hạn mức), tk (tổng kết tháng),
   lh (lời hứa vừa bị phá). Ba mức: khan (cần làm ngay: đến hạn / quá hạn / sắp thiếu tiền), sap (sắp tới), de (để ý).
   cbTatCa là hàm thuần (đọc dữ liệu) để test. Cần mọi file dữ liệu load trước; ht.js (htTbTat); app.js (chuyenTab) lúc chạy.
   ==================================================================== */

var CB_HET_HAN = 15;
var CB_XEM_GIU = 120;
var CB_LOAI = {
  dk: 'Giao dịch định kỳ đến hạn', cat: 'Khoản thu / chi theo ngày', vn: 'Vay - Nợ đến hạn', the: 'Thanh toán thẻ tín dụng', vt: 'Ví có thể thiếu tiền',
  ds: 'Ví lâu chưa đối soát', bh: 'Bảo hành sắp hết', mm: 'Món muốn mua đủ thời gian chờ', hm: 'Danh mục vượt hạn mức', tk: 'Tổng kết tháng', lh: 'Lời hứa bị phá'
};
var CB_NGAY_DOI_SOAT = 35;
var CB_MUC = { khan: 'Cần làm ngay', sap: 'Sắp tới', de: 'Để ý' };
state.cb = state.cb || { mo: false, ds: [] };

function cbCongNgay(ngay, n){ return tnNgayCong(ngay, n); }
function cbNhan(so){ return so < 0 ? 'Quá hạn ' + (-so) + ' ngày' : (so === 0 ? 'Hôm nay' : (so === 1 ? 'Ngày mai' : 'Còn ' + so + ' ngày')); }

/* ---- tính toán thuần: danh sách thông báo đang có ---- */
function cbTatCa(homNay){
  homNay = homNay || todayStr();
  var d = state.data, out = [];
  var them = function(it){
    // quá hạn hơn CB_HET_HAN ngày: biến mất (việc vẫn nằm ở thẻ làm việc của tab, chỉ chuông thôi nhắc)
    if (it.han && daysBetween(it.han, homNay) > CB_HET_HAN) return;
    if (htTbTat(it.loai)) return;
    it.ten = CB_LOAI[it.loai];
    out.push(it);
  };
  var giaiDoan = function(han){ return han <= homNay ? 'q' : 's'; };
  // 1. định kỳ đến hạn
  dinhKyDenHan(homNay).forEach(function(x){
    them({ loai: 'dk', key: 'dk:' + x.dk.id + ':' + x.mk + ':q', muc: 'khan', han: x.han, tieu: x.dk.ten, phu: (x.dk.kind === 'thu' ? 'Thu' : 'Chi') + ' định kỳ · hạn ' + ngayNganVN(x.han),
           tien: fmt(Math.round(x.tien)), dich: { loai: 'dk' } });
  });
  // 2. khoản thu / chi theo ngày của danh mục
  // cùng một khoản (cùng loại, danh mục và ngày hạn) đã có thông báo định kỳ ở trên thì không nhắc lần hai: định kỳ có số tiền và nút Ghi nên giữ cái đó
  var daCoDk = {};
  dinhKyDenHan(homNay).forEach(function(x){ daCoDk[x.dk.kind + '|' + x.dk.catId + '|' + x.han] = 1; });
  dsCatSapDenHan(undefined, homNay).forEach(function(x){
    if (daCoDk[x.kind + '|' + x.id + '|' + x.han]) return;
    var g = giaiDoan(x.han);
    them({ loai: 'cat', key: 'cat:' + x.kind + ':' + x.id + ':' + x.mk + ':' + g, muc: g === 'q' ? 'khan' : 'sap', han: x.han, tieu: x.ten,
           phu: (x.kind === 'thu' ? 'Thu' : 'Chi') + ' · ' + cbNhan(x.soNgay) + ' (hạn ' + ngayNganVN(x.han) + ')', dich: { loai: 'cat', kind: x.kind, id: x.id, mk: x.mk }, coXong: true });
  });
  // 3. Vay - Nợ đến hạn / quá hạn
  danhSachSapDenHan(7).forEach(function(x){
    var g = giaiDoan(x.ngay), sn = daysBetween(homNay, x.ngay);
    them({ loai: 'vn', key: 'vn:' + x.loai + ':' + x.id + ':' + x.ngay + ':' + g, muc: g === 'q' ? 'khan' : 'sap', han: x.ngay, tieu: x.ten,
           phu: (x.loai === 'choVay' ? 'Thu nợ' : 'Trả nợ') + (x.soKy ? ' ' + x.soKy + ' kỳ' : '') + ' · ' + cbNhan(sn), tien: fmt(Math.round(x.soTien)), dich: { loai: 'vn' } });
  });
  // 4. thanh toán thẻ tín dụng
  theSapDenHan(homNay).forEach(function(x){
    var g = giaiDoan(x.t.han);
    them({ loai: 'the', key: 'the:' + x.w.id + ':' + x.t.han + ':' + g, muc: g === 'q' ? 'khan' : 'sap', han: x.t.han, tieu: 'Thẻ ' + x.w.ten,
           phu: 'Thanh toán thẻ · ' + cbNhan(x.t.soNgay) + ' (hạn ' + ngayNganVN(x.t.han) + ')' + (x.t.toiThieu != null && x.t.toiThieu > 0 ? ' · tối thiểu ' + fmt(Math.round(x.t.toiThieu)) : ''), tien: fmt(Math.round(x.t.conPhaiTra)), dich: { loai: 'the', id: x.w.id } });
  });
  // 5. ví có thể thiếu tiền (cần từ 2 ví trở lên)
  tnViSapThieu(homNay, TN_SO_NGAY).forEach(function(x){
    them({ loai: 'vt', key: 'vt:' + x.w.id + ':' + x.L.am.ngay, muc: 'khan', han: null, tieu: 'Ví ' + x.w.ten + ' có thể thiếu tiền',
           phu: 'Từ ' + ngayNganVN(x.L.am.ngay) + ', thấp nhất ' + fmt(Math.round(x.L.thap.cuoi)), dich: { loai: 'vt', id: x.w.id } });
  });
  // 6. ví lâu chưa đối soát (mốc: lần đối soát gần nhất, chưa có thì ngày bắt đầu của sổ)
  (d.wallets || []).forEach(function(w){
    if (viLaThe(w) || !(viDangDung(w.id) > 0 || num(w.soDuDauKy) !== 0)) return;
    var ds = Array.isArray(w.doiSoat) ? w.doiSoat : [], ref = '';
    ds.forEach(function(r){ if (r.ngay > ref) ref = r.ngay; });
    var moc = ref || d.settings.ngayBatDau || '';
    if (!moc) return;
    var qua = daysBetween(moc, homNay);
    if (qua < CB_NGAY_DOI_SOAT) return;
    them({ loai: 'ds', key: 'ds:' + w.id + ':' + (ref || 'chua'), muc: 'sap', han: cbCongNgay(moc, CB_NGAY_DOI_SOAT), tieu: 'Đối soát ví ' + w.ten,
           phu: ref ? 'Lần cuối ' + ngayVN(ref) + ' (' + qua + ' ngày trước)' : 'Chưa đối soát lần nào', dich: { loai: 'ds', id: w.id } });
  });
  // 7. bảo hành sắp hết (còn <= 30 ngày) hoặc vừa hết (trong 15 ngày)
  (d.doDac || []).forEach(function(x){
    if (x.tt === 'het' || !x.baoHanhDen) return;
    var t = ddTinh(x, homNay);
    if (t.baoHanhCon == null || t.baoHanhCon > DD_SAP_HET) return;
    var het = t.baoHanhCon < 0;
    them({ loai: 'bh', key: 'bh:' + x.id + ':' + (het ? 'q' : 's'), muc: het ? 'de' : 'sap', han: x.baoHanhDen, tieu: x.ten,
           phu: het ? 'Vừa hết bảo hành ' + ngayNganVN(x.baoHanhDen) : 'Bảo hành còn ' + t.baoHanhCon + ' ngày (hết ' + ngayNganVN(x.baoHanhDen) + ')', dich: { loai: 'bh', id: x.id } });
  });
  // 8. món Muốn mua đủ thời gian chờ
  (d.muonMua || []).forEach(function(m){
    if (!mmDenHanCho(m, homNay)) return;
    var han = cbCongNgay(m.ngayThem, m.soNgayCho || MM_CHO_MAC_DINH);
    them({ loai: 'mm', key: 'mm:' + m.id, muc: 'sap', han: han, tieu: m.ten, phu: 'Đủ thời gian chờ, còn muốn mua không?', tien: fmt(Math.round(m.soTien)), dich: { loai: 'mm', id: m.id } });
  });
  // 9. danh mục chi hằng ngày vượt hạn mức (tháng này)
  var mk = monthKey(homNay);
  hanMucThangRows(mk).forEach(function(r){
    if (r.coDinh || !(r.pct > 1)) return;
    them({ loai: 'hm', key: 'hm:' + r.id + ':' + mk, muc: 'de', han: mk + '-' + pad2(daysInMonth(mk)), tieu: r.ten + ' vượt hạn mức',
           phu: 'Đã chi ' + fmt(Math.round(r.da)) + ' / ' + fmt(Math.round(r.cap)) + ' (' + Math.round(r.pct * 100) + '%)', dich: { loai: 'hm' } });
  });
  // 10. tổng kết tháng vừa kết thúc
  var tk = tkGoiY(homNay);
  if (tk) them({ loai: 'tk', key: 'tk:' + tk, muc: 'de', han: mk + '-' + pad2(TK_NGAY_GOI_Y), tieu: 'Tổng kết ' + monthLabel(tk).toLowerCase(), phu: 'Tháng vừa kết thúc, xem thu chi và so sánh', dich: { loai: 'tk', mk: tk } });
  // 11. lời hứa vừa bị phá
  (d.loiHua || []).forEach(function(h){
    var t = lhTrangThai(h, homNay);
    if (t.trang !== 'pha') return;
    them({ loai: 'lh', key: 'lh:' + h.id + ':' + t.pha, muc: 'de', han: t.pha, tieu: 'Đã phá lời hứa', phu: lhQuyTac(h) + ' · ngày ' + ngayNganVN(t.pha), dich: { loai: 'lh', id: h.id } });
  });
  var thuTu = { khan: 0, sap: 1, de: 2 };
  out.sort(function(a, b){ return (thuTu[a.muc] - thuTu[b.muc]) || ((a.han || '9') < (b.han || '9') ? -1 : ((a.han || '9') > (b.han || '9') ? 1 : 0)); });
  out.forEach(function(it){ it.daXem = cbDaXem(it.key); });
  return out;
}
function cbDaXem(key){ var x = (state.data && state.data.settings && state.data.settings.thongBaoXem) || {}; return Object.prototype.hasOwnProperty.call(x, key); }
function cbSoChuaXem(homNay){ return cbTatCa(homNay).filter(function(it){ return !it.daXem; }).length; }
// đánh dấu đã xem (chỉ lúc người dùng bấm vào mục); dọn khóa quá cũ
function cbDanhDauXem(key, homNay){
  homNay = homNay || todayStr();
  var s = state.data.settings, x = s.thongBaoXem = (s.thongBaoXem && typeof s.thongBaoXem === 'object') ? s.thongBaoXem : {};
  x[key] = homNay;
  Object.keys(x).forEach(function(k){ if (daysBetween(x[k], homNay) > CB_XEM_GIU) delete x[k]; });
}

/* ---- giao diện ---- */
function cbCapNhatNut(){
  if (typeof document === 'undefined' || !document.getElementById) return;
  var b = document.getElementById('cbBadge'); if (!b) return;
  var n = (state.data && state.data.categories) ? cbSoChuaXem() : 0;
  if (n > 0){ b.textContent = n > 99 ? '99+' : n; b.style.display = 'flex'; } else { b.style.display = 'none'; }
  var nut = document.getElementById('btnChuong'); if (nut) nut.setAttribute('aria-label', n > 0 ? 'Thông báo: ' + n + ' chưa xem' : 'Thông báo');
}
function cbDongHtml(it, i){
  return '<div class="cb-r' + (it.daXem ? ' xem' : '') + ' ' + it.muc + '"><button type="button" class="cb-main" data-act="cbDen" data-i="' + i + '">'
    + '<span class="cb-cham" aria-hidden="true"></span><span class="cb-b"><b>' + esc(it.tieu) + '</b><small>' + esc(it.phu) + '</small></span>'
    + (it.tien ? '<span class="cb-t">' + esc(it.tien) + '</span>' : '') + '</button>'
    + (it.coXong ? '<button type="button" class="btn secondary sm" data-act="cbXong" data-i="' + i + '">Hoàn thành</button>' : '') + '</div>';
}
function cbDanhSachHtml(){
  var ds = state.cb.ds = cbTatCa();
  if (!ds.length) return '<div class="empty" style="padding:28px 8px">' + icon('check') + ' Không có thông báo nào.</div>';
  var h = '', muc = '';
  ds.forEach(function(it, i){
    if (it.muc !== muc){ muc = it.muc; h += '<div class="tim-nhom-t"><span>' + CB_MUC[muc] + '</span></div>'; }
    h += cbDongHtml(it, i);
  });
  return h + '<div class="cb-ghichu">Số đỏ chỉ giảm khi bạn bấm vào từng mục. Mục chỉ mất khi việc đã xong, hoặc quá hạn hơn ' + CB_HET_HAN + ' ngày mà chưa xong.</div>';
}
function cbVe(){
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  var root = document.getElementById('cbRoot');
  if (!state.cb.mo){
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (!vnMoKhoaNen()) document.body.classList.remove('qa-mo');
    return;
  }
  if (root){ var kq = document.getElementById('cbKq'); if (kq) kq.innerHTML = cbDanhSachHtml(); return; }
  root = document.createElement('div');
  root.id = 'cbRoot'; root.className = 'tim-back cb-back';
  root.innerHTML = '<div class="tim-scrim" data-act="cbDong"></div><div class="tim-panel" role="dialog" aria-modal="true" aria-label="Thông báo">'
    + '<div class="tim-bar cb-bar"><b class="cb-tit">Thông báo</b><button type="button" class="tim-x" data-act="cbDong" aria-label="Đóng">' + icon('x') + '</button></div>'
    + '<div class="tim-kq" id="cbKq">' + cbDanhSachHtml() + '</div></div>';
  document.body.appendChild(root);
  document.body.classList.add('qa-mo');
  vnKhopKhungNhin();
}

/* ---- điều hướng tới nơi xử lý ---- */
function cbDi(it){
  var g = it.dich || {}, tab = null, sau = null;
  if (g.loai === 'dk'){ tab = 'sotay'; sau = function(){ var o = document.getElementById('cardDinhKy'); if (o && o.scrollIntoView) o.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; }
  else if (g.loai === 'cat'){ tab = 'sotay'; sau = function(){ nhacHanGhi(g.kind, g.id); }; }
  else if (g.loai === 'vn'){ tab = 'vayno'; }
  else if (g.loai === 'the'){ state.dmTab = 'tien'; state.dmForm = { loai: 'thanhtoanthe', id: g.id }; tab = 'danhmuc'; }
  else if (g.loai === 'vt'){ state.tnVi = g.id || ''; state.dtTheoNgay = true; state.dtMoPhong = false; tab = 'dongtien'; }
  else if (g.loai === 'ds'){ state.dmTab = 'tien'; state.dmForm = { loai: 'doisoat', id: g.id }; tab = 'danhmuc'; }
  else if (g.loai === 'bh'){ state.ccTrang = 'dodac'; state.ccForm = { loai: 'dd', id: g.id }; tab = 'congcu'; }
  else if (g.loai === 'mm'){ state.ccTrang = 'muonmua'; tab = 'congcu'; }
  else if (g.loai === 'lh'){ state.ccTrang = 'loihua'; state.ccForm = { loai: 'lh', id: g.id }; tab = 'congcu'; }
  else if (g.loai === 'hm'){ tab = 'baocao'; sau = function(){ var o = document.getElementById('cardHanMuc'); if (o && o.scrollIntoView) o.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; }
  else if (g.loai === 'tk'){ state.soTayMonth = g.mk || state.soTayMonth; tab = 'baocao'; sau = function(){ var o = document.getElementById('cardTongKet'); if (o && o.scrollIntoView) o.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; }
  if (!tab) return;
  chuyenTab(tab);
  if (sau) setTimeout(sau, 350);
  if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
}

/* ---- sự kiện ---- */
function handleChuongAction(act, el){
  if (act === 'cbMo'){ state.cb.mo = !state.cb.mo; cbVe(); return true; }
  if (act === 'cbDong'){ state.cb.mo = false; cbVe(); return true; }
  if (act === 'cbDen'){
    var it = (state.cb.ds || [])[parseInt(el.getAttribute('data-i'), 10)];
    if (!it) return true;
    if (!it.daXem){ cbDanhDauXem(it.key); scheduleSave(); }
    state.cb.mo = false; cbVe(); cbCapNhatNut();
    cbDi(it);
    return true;
  }
  if (act === 'cbXong'){        // "Hoàn thành" của khoản thu / chi theo ngày: chỉ tắt nhắc kỳ đó, không ghi giao dịch (xem nhachan.js)
    var x = (state.cb.ds || [])[parseInt(el.getAttribute('data-i'), 10)];
    if (!x || !x.dich || x.dich.loai !== 'cat') return true;
    var g = x.dich;
    if (!nhacHanHoanThanh(g.kind, g.id, g.mk)) return true;
    scheduleSave(); cbVe(); cbCapNhatNut();
    toast('Đã tắt nhắc "' + catTen(g.kind, g.id) + '" (không ghi vào sổ).', { hoanTac: function(){
      nhacHanHoanTac(g.kind, g.id, g.mk); scheduleSave(); cbVe(); cbCapNhatNut();
    } });
    return true;
  }
  return false;
}
if (typeof document !== 'undefined' && document.addEventListener){
  document.addEventListener('keydown', function(ev){
    if (ev.key === 'Escape' && state.cb && state.cb.mo){ ev.preventDefault(); state.cb.mo = false; cbVe(); }
  });
}
