"use strict";
/* ====================================================================
   doisoat.js — ĐỐI SOÁT SỐ DƯ VÍ: nhập số dư THẬT (nhìn ở app ngân hàng / đếm tiền mặt), app so với số trong sổ,
   báo chênh lệch, và (nếu người dùng chọn) tạo MỘT khoản điều chỉnh để số dư khớp.

   - Chỉ GHI NHẬN đối soát: không đổi gì ngoài lịch sử đối soát của ví (w.doiSoat = [{ngay, soThat, soSo, chenh, dieuChinh}],
     giữ 12 lần gần nhất). Để người dùng tự đi tìm khoản ghi sót.
   - Tạo khoản điều chỉnh: ví thật NHIỀU hơn sổ -> khoản THU, ít hơn -> khoản CHI, danh mục "Điều chỉnh số dư"
     (id dieuChinh, tự tạo lần đầu; thuộc CAT_HE_THONG nên không hiện ở Ghi nhanh, không tính vào nhịp chi hằng ngày, không xóa được).
     Là một dòng chi tiết bình thường (it.dieuChinh = true) nên sửa / xóa được ở Sổ tay như mọi dòng.
   Cần state.js (soDuTheoVi, entryAddItem...), danhmuc.js (vnSheetKhung) load trước; giao diện nằm ở thẻ Ví của tab Danh mục.
   ==================================================================== */

var DS_DANH_MUC = 'dieuChinh';
var DS_LICH_SU = 12;

// ngày đối soát mặc định: NGÀY CUỐI THÁNG của tháng hiện tại (đối soát chốt tháng)
function doiSoatNgayMacDinh(){
  var mk = monthKey(todayStr());
  return mk + '-' + pad2(daysInMonth(mk));
}
// số dư trong sổ của ví tới hết ngày; chenh = số thật − số trong sổ (>0: ví thật nhiều hơn sổ)
function doiSoatTinh(walletId, soThat, ngay){
  var soSo = soDuTheoVi(walletId, ngay || todayStr());
  return { soSo: soSo, soThat: soThat, chenh: soThat - soSo };
}
function doiSoatMoTa(chenh){
  if (Math.abs(chenh) < 0.5) return { khop: true, text: 'Khớp: số dư thật bằng số trong sổ.' };
  return chenh > 0
    ? { khop: false, text: 'Ví thật NHIỀU hơn sổ ' + fmt(Math.round(chenh)) + ': sổ có thể thiếu khoản thu hoặc ghi dư khoản chi.' }
    : { khop: false, text: 'Ví thật ÍT hơn sổ ' + fmt(Math.round(-chenh)) + ': sổ có thể thiếu khoản chi hoặc ghi dư khoản thu.' };
}
function doiSoatDanhMuc(kind){
  var arr = state.data.categories[kind];
  if (!arr.some(function(c){ return c.id === DS_DANH_MUC; })) arr.push({ id: DS_DANH_MUC, ten: 'Điều chỉnh số dư', chiTieu: 0, khongDuTru: true });
  return DS_DANH_MUC;
}
// ghi nhận 1 lần đối soát. dieuChinh = true: tạo khoản điều chỉnh cho đủ chênh lệch.
// Trả { ban (bản ghi lịch sử), date, iid } để hoàn tác; null nếu ví không tồn tại.
function doiSoatGhi(walletId, soThat, ngay, dieuChinh){
  var w = walletById(walletId);
  if (!w) return null;
  ngay = ngay || todayStr();
  var t = doiSoatTinh(walletId, soThat, ngay), iid = null;
  if (dieuChinh && Math.abs(t.chenh) >= 0.5){
    var kind = t.chenh > 0 ? 'thu' : 'chi';
    var it = entryAddItem(ngay, kind, doiSoatDanhMuc(kind), Math.abs(t.chenh), 'Điều chỉnh số dư ' + w.ten + ' (đối soát)', walletId);
    if (it){ it.dieuChinh = true; iid = it.iid; }
  }
  var ban = { ngay: ngay, soThat: soThat, soSo: t.soSo, chenh: t.chenh, dieuChinh: !!iid };
  w.doiSoat = (Array.isArray(w.doiSoat) ? w.doiSoat : []).concat([ban]).slice(-DS_LICH_SU);
  invalidateBalanceCache();
  return { ban: ban, date: ngay, iid: iid, walletId: walletId };
}
function doiSoatHoanTac(r){
  var w = walletById(r.walletId);
  if (r.iid) entryDeleteItem(r.date, r.iid);
  if (w && Array.isArray(w.doiSoat)){
    w.doiSoat = w.doiSoat.filter(function(b){ return b !== r.ban; });
    if (!w.doiSoat.length) delete w.doiSoat;
  }
  invalidateBalanceCache();
}
function doiSoatCuoi(w){ return (w && Array.isArray(w.doiSoat) && w.doiSoat.length) ? w.doiSoat[w.doiSoat.length - 1] : null; }
// dòng trạng thái dưới tên ví ở Danh mục
function doiSoatTrangThai(w){
  var b = doiSoatCuoi(w);
  if (!b) return 'Chưa đối soát';
  var kq = Math.abs(b.chenh) < 0.5 ? 'khớp' : 'lệch ' + (b.chenh > 0 ? '+' : '−') + fmt(Math.round(Math.abs(b.chenh))) + (b.dieuChinh ? ', đã điều chỉnh' : '');
  return 'Đối soát ' + ngayNganVN(b.ngay) + ' · ' + kq;
}

/* ---- bảng trượt ---- */
function doiSoatSheetHtml(f){
  var w = walletById(f.id);
  if (!w) return '';
  var mac = doiSoatNgayMacDinh(), ls = (Array.isArray(w.doiSoat) ? w.doiSoat : []).slice(-3).reverse();
  var h = '<div class="vn-sub">Số trong sổ tới <span id="ds_ngayNhan">'+(mac === todayStr() ? 'hôm nay' : ngayVN(mac))+'</span>: <b id="ds_soSo">'+fmt(Math.round(soDuTheoVi(w.id, mac)))+'</b></div>'
    + vnF('Số dư thật <span class="mp-hint">(nhìn ở app ngân hàng, hoặc đếm tiền mặt)</span>', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="ds_that" placeholder="0">')
    + vnF('Ngày đối soát', '<input type="date" id="ds_ngay" value="'+mac+'">', '', 'Mặc định là ngày cuối tháng.')
    + '<div class="vn-tom" id="ds_tom">Nhập số dư thật để so với sổ.</div>'
    + '<button type="button" class="btn secondary ds-dc" id="ds_dc" data-act="dsDieuChinh" hidden></button>';
  if (ls.length){
    h += '<div class="qa-lbl" style="margin-top:14px">Các lần đối soát gần đây</div>' + ls.map(function(b){
      return '<div class="ds-ls"><span>'+ngayVN(b.ngay)+'</span><span>'+(Math.abs(b.chenh) < 0.5 ? 'Khớp' : 'Lệch '+(b.chenh > 0 ? '+' : '−')+fmt(Math.round(Math.abs(b.chenh))) + (b.dieuChinh ? ' · đã điều chỉnh' : ''))+'</span></div>';
    }).join('');
  }
  return vnSheetKhung('Đối soát ví ' + esc(w.ten), h, 'Ghi nhận đối soát', 'dsGhi', 'dmHuy');
}
// đọc form: { soThat, ngay } hoặc null nếu chưa nhập số
function doiSoatDocForm(){
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  if (!String(g('ds_that')).trim()) return null;
  return { soThat: docSo(g('ds_that')), ngay: g('ds_ngay') || doiSoatNgayMacDinh() };
}
function doiSoatCapNhat(){
  var f = state.dmForm, tom = document.getElementById('ds_tom');
  if (!f || f.loai !== 'doisoat' || !tom) return;
  var ngay = (document.getElementById('ds_ngay') || {}).value || doiSoatNgayMacDinh();
  var soSo = soDuTheoVi(f.id, ngay);
  var e1 = document.getElementById('ds_soSo'); if (e1) e1.textContent = fmt(Math.round(soSo));
  var e2 = document.getElementById('ds_ngayNhan'); if (e2) e2.textContent = ngay === todayStr() ? 'hôm nay' : ngayVN(ngay);
  var dc = document.getElementById('ds_dc'), d = doiSoatDocForm();
  if (!d){ tom.textContent = 'Nhập số dư thật để so với sổ.'; if (dc) dc.hidden = true; return; }
  var t = doiSoatTinh(f.id, d.soThat, d.ngay), mt = doiSoatMoTa(t.chenh);
  tom.innerHTML = mt.text;
  if (dc){
    dc.hidden = mt.khop;
    if (!mt.khop) dc.textContent = 'Tạo khoản ' + (t.chenh > 0 ? 'thu' : 'chi') + ' điều chỉnh ' + fmt(Math.round(Math.abs(t.chenh))) + ' để khớp';
  }
}
function handleDoiSoatAction(act, el){
  if (act === 'dmDoiSoat'){
    state.dmForm = { loai: 'doisoat', id: el.getAttribute('data-id') }; renderDanhMuc(); return true;
  }
  if (act !== 'dsGhi' && act !== 'dsDieuChinh') return false;
  var f = state.dmForm; if (!f || f.loai !== 'doisoat') return true;
  var d = doiSoatDocForm();
  if (!d){ toast('Nhập số dư thật.', { loai: 'warn' }); return true; }
  var w = walletById(f.id), t = doiSoatTinh(f.id, d.soThat, d.ngay);
  var xong = function(dieuChinh){
    var r = doiSoatGhi(f.id, d.soThat, d.ngay, dieuChinh);
    if (!r) return;
    state.dmForm = null; scheduleSave(); renderDanhMuc();
    var kq = Math.abs(t.chenh) < 0.5 ? 'khớp' : (dieuChinh ? 'đã điều chỉnh ' + (t.chenh > 0 ? '+' : '−') + fmt(Math.round(Math.abs(t.chenh))) : 'lệch ' + (t.chenh > 0 ? '+' : '−') + fmt(Math.round(Math.abs(t.chenh))) + ' (chưa điều chỉnh)');
    toast('Đối soát ' + w.ten + ': ' + kq + '.', { giay: 7, hoanTac: function(){ doiSoatHoanTac(r); scheduleSave(); renderDanhMuc(); toast('Đã hoàn tác đối soát.'); } });
  };
  if (act === 'dsGhi'){ xong(false); return true; }
  if (Math.abs(t.chenh) < 0.5){ xong(false); return true; }
  xacNhan('Tạo khoản điều chỉnh?', 'Sẽ ghi 1 khoản ' + (t.chenh > 0 ? 'THU' : 'CHI') + ' ' + fmt(Math.round(Math.abs(t.chenh))) + ' (danh mục "Điều chỉnh số dư") vào ví ' + w.ten + ' ngày ' + ngayVN(d.ngay)
    + ' để số dư trong sổ bằng số thật. Nó là một dòng bình thường, sửa hoặc xóa được ở Sổ tay. Nếu chưa tìm ra khoản ghi sót, chọn "Ghi nhận đối soát" để chỉ ghi lại độ lệch.', { chuOk: 'Tạo điều chỉnh' })
    .then(function(ok){ if (ok) xong(true); });
  return true;
}
function handleDoiSoatInput(el){
  if (!el || !el.id || el.id.indexOf('ds_') !== 0) return false;
  doiSoatCapNhat();
  return true;
}
