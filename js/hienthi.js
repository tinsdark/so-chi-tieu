"use strict";
/* ====================================================================
   hienthi.js — phần "HIỂN THỊ" của tab Cài đặt: bật / tắt từng thẻ ở Sổ tay, Báo cáo, Công cụ, đổi thứ tự thẻ (mũi tên lên / xuống),
   chọn loại thông báo nào hiện ở chuông. Mọi thứ lưu THEO TỪNG MÁY (ht.js, localStorage), không lên Drive.
   Công tắc BẬT = thẻ hiện. Thẻ nào không có mũi tên là vì nằm cố định (trong thẻ đầu / cột phải); đổi thứ tự chỉ trong cùng nhóm
   (Công cụ: Quyết định / Sổ). Ẩn một thẻ chỉ đổi cách vẽ, không đổi số liệu.
   Cần ht.js, chuong.js (CB_LOAI, cbCapNhatNut), danhmuc.js (dmHead, dmSec) load trước.
   ==================================================================== */

function htDongHtml(nhom, id, vitri, dau, cuoi){
  var t = htThe(nhom, id), hien = !htAn(nhom, id);
  return '<div class="ht-row"><label class="ht-sw"><input type="checkbox" class="dm-swi" data-act="htAn" data-nhom="' + nhom + '" data-id="' + id + '"' + (hien ? ' checked' : '')
    + ' aria-label="Hiện ' + esc(t.ten) + '"><span class="ht-t"><b>' + esc(t.ten) + '</b>' + (t.mota ? '<small>' + esc(t.mota) + '</small>' : '') + '</span></label>'
    + (t.khongThuTu ? '<span class="ht-ud"></span>'
      : '<span class="ht-ud"><button type="button" class="ht-mt" data-act="htLen" data-nhom="' + nhom + '" data-id="' + id + '" aria-label="Đưa ' + esc(t.ten) + ' lên"' + (dau ? ' disabled' : '') + '>' + icon('arrow-up') + '</button>'
      + '<button type="button" class="ht-mt" data-act="htXuong" data-nhom="' + nhom + '" data-id="' + id + '" aria-label="Đưa ' + esc(t.ten) + ' xuống"' + (cuoi ? ' disabled' : '') + '>' + icon('arrow-down') + '</button></span>') + '</div>';
}
function htNhomCardHtml(nhom){
  var ds = htThuTu(nhom), doi = ds.filter(function(id){ return !htThe(nhom, id).khongThuTu; });
  var h = '<div class="card dm-card">' + dmHead(HT_NHOM_TEN[nhom]) + '<div class="dm-sub">' + (nhom === 'congcu' ? 'Mũi tên đổi thứ tự trong cùng nhóm (Quyết định / Sổ).' : (nhom === 'baocao' ? 'Mũi tên đổi thứ tự thẻ ở cột chính.' : 'Chọn phần nào hiện ở thẻ đầu Sổ tay.')) + '</div>';
  ds.forEach(function(id, i){
    var t = htThe(nhom, id), nc = doi.filter(function(x){ return nhom !== 'congcu' || htThe(nhom, x).nhomCon === t.nhomCon; }), j = nc.indexOf(id);
    h += htDongHtml(nhom, id, i, j === 0, j === nc.length - 1);
  });
  return h + '</div>';
}
function htThongBaoCardHtml(){
  var h = '<div class="card dm-card">' + dmHead('Thông báo ở chuông') + '<div class="dm-sub">Loại nào tắt thì không hiện và không tính vào số đỏ trên máy này.</div>';
  Object.keys(CB_LOAI).forEach(function(l){
    h += '<div class="ht-row"><label class="ht-sw"><input type="checkbox" class="dm-swi" data-act="htTb" data-loai="' + l + '"' + (htTbTat(l) ? '' : ' checked') + ' aria-label="Hiện thông báo ' + esc(CB_LOAI[l]) + '">'
      + '<span class="ht-t"><b>' + esc(CB_LOAI[l]) + '</b></span></label></div>';
  });
  return h + '</div>';
}
function hienThiHtml(){
  return '<div class="dm-grid">' + htNhomCardHtml('sotay') + htNhomCardHtml('baocao') + htNhomCardHtml('congcu') + htThongBaoCardHtml()
    + '<div class="card dm-card"><div class="dm-sub">Cài đặt hiển thị chỉ áp dụng cho <b>máy này</b>: điện thoại và máy tính có thể bày khác nhau. Ẩn một thẻ không làm mất số liệu.</div>'
    + '<button type="button" class="btn secondary" data-act="htDatLai">Đặt lại mặc định</button></div></div>';
}

function handleHienThiChange(el){
  if (el.matches && el.matches('[data-act=htAn]')){
    htDatAn(el.getAttribute('data-nhom'), el.getAttribute('data-id'), !el.checked);
    return true;
  }
  if (el.matches && el.matches('[data-act=htTb]')){
    htDatTbTat(el.getAttribute('data-loai'), !el.checked);
    cbCapNhatNut();
    return true;
  }
  return false;
}
function handleHienThiAction(act, el){
  if (act === 'htLen' || act === 'htXuong'){
    htDoiViTri(el.getAttribute('data-nhom'), el.getAttribute('data-id'), act === 'htLen' ? -1 : 1);
    renderDanhMuc();
    return true;
  }
  if (act === 'htDatLai'){
    (async function(){
      if (!await xacNhan('Đặt lại hiển thị?', 'Mọi thẻ hiện trở lại, thứ tự về mặc định, thông báo bật lại hết. Số liệu không đổi.', { chuOk: 'Đặt lại' })) return;
      htDatLai(); cbCapNhatNut(); renderDanhMuc(); toast('Đã đặt lại hiển thị.');
    })();
    return true;
  }
  return false;
}
