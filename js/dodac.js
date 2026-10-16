"use strict";
/* ====================================================================
   dodac.js — SỔ ĐỒ ĐẠC (trang trong tab Công cụ): món đã mua, chi phí MỖI NGÀY dùng, giá trị còn lại, hạn bảo hành.
   doDac[] = [{ id, ten, gia, ngayMua, soNam (dự định dùng bao nhiêu năm), baoHanhDen ('YYYY-MM-DD' hoặc ''), ghiChu,
                tt: 'dung' | 'het', ngayHet, giaBan }]
   - Chi phí mỗi ngày dùng (hiện tại) = (giá − tiền bán lại nếu đã bỏ) ÷ số ngày đã dùng. Đồ đang dùng còn có "dự kiến nếu dùng đủ" = giá ÷ (số năm × 365):
     con số này giảm dần theo thời gian, cho thấy dùng càng lâu càng rẻ.
   - Giá trị còn lại: khấu hao ĐỀU theo số năm dự định dùng, về 0 khi dùng đủ. Chỉ là ước lượng để tham khảo.
   - Hạn bảo hành: "sắp hết" khi còn <= 30 ngày. Chỉ nhắc trong app.
   - Sổ này chỉ ghi nhớ: KHÔNG đụng Sổ tay, số dư hay Tài sản ròng. "Mua rồi" ở Muốn mua có công tắc thêm món vào sổ này (ddThem).
   Cần state.js, loihua.js (lhSoNgay), danhmuc.js, vayno.js (vnF, vnSheetKhung), vayno-tinh.js (monthKeyAdd, ngayTraCuaKy), congcu.js load trước.
   ==================================================================== */

var DD_NAM_MAC_DINH = 3;
var DD_SAP_HET = 30;

/* ---- tính toán thuần ---- */
// d = món; homNay mặc định hôm nay. Trả { ngayDung, cpNgay, cpDuKien, conGiaTri, baoHanh: '' | 'con' | 'sap' | 'het', baoHanhCon (số ngày, âm = đã hết) }
function ddTinh(d, homNay){
  homNay = homNay || todayStr();
  var het = d.tt === 'het' && d.ngayHet, den = het ? d.ngayHet : homNay;
  var ngayDung = Math.max(1, lhSoNgay(d.ngayMua, den) + 1);
  var tong = Math.max(1, Math.round(num(d.soNam) * 365));
  var giaRong = Math.max(0, num(d.gia) - (d.tt === 'het' ? num(d.giaBan) : 0));
  var r = { ngayDung: ngayDung, tongNgay: tong, giaRong: giaRong, cpNgay: giaRong / ngayDung, cpDuKien: num(d.gia) / tong,
            conGiaTri: d.tt === 'het' ? num(d.giaBan) : num(d.gia) * Math.max(0, 1 - ngayDung / tong), baoHanh: '', baoHanhCon: null };
  if (d.baoHanhDen){
    r.baoHanhCon = lhSoNgay(homNay, d.baoHanhDen);
    r.baoHanh = r.baoHanhCon < 0 ? 'het' : (r.baoHanhCon <= DD_SAP_HET ? 'sap' : 'con');
  }
  return r;
}
// "12 ngày", "5 tháng", "1 năm 2 tháng"
function ddThoiGian(ngay){
  if (ngay < 30) return ngay + ' ngày';
  if (ngay < 365) return Math.floor(ngay / 30) + ' tháng';
  var nam = Math.floor(ngay / 365), thang = Math.floor((ngay - nam * 365) / 30);
  return nam + ' năm' + (thang ? ' ' + thang + ' tháng' : '');
}
// thêm món (dùng cho bảng thêm và cho "Mua rồi" ở Muốn mua); trả món vừa thêm
function ddThem(o){
  var ds = state.data.doDac = state.data.doDac || [];
  var d = { id: 'dd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ten: String(o.ten || '').trim().slice(0, 80), gia: numNonNeg(o.gia),
            ngayMua: o.ngayMua || todayStr(), soNam: num(o.soNam) > 0 ? Math.min(50, num(o.soNam)) : DD_NAM_MAC_DINH, baoHanhDen: o.baoHanhDen || '',
            ghiChu: String(o.ghiChu || '').trim().slice(0, 120), tt: 'dung', ngayHet: '', giaBan: 0 };
  ds.push(d);
  return d;
}
function ddDangDung(){ return (state.data.doDac || []).filter(function(d){ return d.tt !== 'het'; }); }

/* ---- giao diện ---- */
function ddTomTat(){
  var dung = ddDangDung(), hom = todayStr();
  if (!(state.data.doDac || []).length) return { chu: 'Món đã mua: tốn bao nhiêu mỗi ngày, hạn bảo hành' };
  var sap = dung.filter(function(d){ var t = ddTinh(d, hom); return t.baoHanh === 'sap'; }).length;
  return { chu: dung.length + ' món đang dùng' + (sap ? ' · ' + sap + ' món sắp hết bảo hành' : ''), canh: sap > 0 };
}
function ddBaoHanhTag(t){
  if (t.baoHanh === 'sap') return '<span class="cc-tag warn">Bảo hành còn ' + t.baoHanhCon + ' ngày</span>';
  if (t.baoHanh === 'het') return '<span class="cc-tag">Hết bảo hành</span>';
  if (t.baoHanh === 'con') return '<span class="cc-tag ok">Bảo hành còn ' + ddThoiGian(t.baoHanhCon) + '</span>';
  return '';
}
function ddDongHtml(d, hom){
  var t = ddTinh(d, hom), het = d.tt === 'het';
  var dong2 = het
    ? 'Đã dùng ' + ddThoiGian(t.ngayDung) + ' · tốn ' + fmt(Math.round(t.cpNgay)) + '/ngày' + (num(d.giaBan) > 0 ? ' (đã trừ tiền bán ' + fmt(Math.round(d.giaBan)) + ')' : '')
    : 'Dùng ' + ddThoiGian(t.ngayDung) + ' · đang tốn ' + fmt(Math.round(t.cpNgay)) + '/ngày' + (t.ngayDung < t.tongNgay ? ' → ' + fmt(Math.round(t.cpDuKien)) + '/ngày nếu dùng đủ ' + gcSoChu(num(d.soNam)) + ' năm' : '');
  return '<div class="cc-it" role="button" tabindex="0" data-act="ddSua" data-id="' + esc(d.id) + '" aria-label="Sửa ' + esc(d.ten) + '">'
    + '<div class="cc-it-h"><b>' + esc(d.ten) + '</b><b class="chi">' + fmt(Math.round(d.gia)) + '</b></div>'
    + '<div class="cc-it-s"><span class="muted">' + dong2 + '</span></div>'
    + '<div class="cc-it-s">' + (het ? '<span class="cc-tag">Không dùng nữa</span>' : ddBaoHanhTag(t) + '<span class="muted">Còn giá trị ≈ ' + fmt(Math.round(t.conGiaTri)) + '</span>') + '</div></div>';
}
function ddPageHtml(){
  var hom = todayStr(), ds = state.data.doDac || [], dung = ddDangDung();
  var h = '<div class="card dm-card cc-card">' + dmHead('Sổ đồ đạc', '<button class="btn secondary sm" data-act="ddThem">+ Thêm</button>')
    + '<div class="dm-sub">Món đã mua: tốn bao nhiêu mỗi ngày dùng, còn giá trị bao nhiêu, bảo hành đến khi nào. Chỉ ghi nhớ, không đụng số dư.</div>';
  if (!ds.length) return h + '<div class="empty">Chưa có món nào. Ví dụ: điện thoại 25.000.000, mua 01/01, dùng 3 năm.</div></div>';
  if (dung.length){
    var mua = 0, con = 0, ngay = 0;
    dung.forEach(function(d){ var t = ddTinh(d, hom); mua += num(d.gia); con += t.conGiaTri; ngay += t.cpDuKien; });
    h += '<div class="cc-r"><span>Tổng giá đã mua (đang dùng)</span><b>' + fmt(Math.round(mua)) + '</b></div>'
      + '<div class="cc-r"><span>Còn giá trị ước tính</span><b>' + fmt(Math.round(con)) + '</b></div>'
      + '<div class="cc-r"><span>Chi phí mỗi ngày nếu dùng đủ</span><b>' + fmt(Math.round(ngay)) + '</b></div>';
    h += giaiThichSo([{ ten: 'Chi phí mỗi ngày nếu dùng đủ', ct: 'Cộng, cho từng món đang dùng: giá ÷ (số năm dự định dùng × 365).',
        pt: dung.slice(0, 4).map(function(d){ return soGt(d.gia) + ' ÷ ' + Math.max(1, Math.round(num(d.soNam) * 365)) + ' = ' + soGt(ddTinh(d, hom).cpDuKien); }).join(' · ') + (dung.length > 4 ? ' · ...' : '') },
      { ten: 'Còn giá trị', ct: 'Khấu hao đều: giá × (1 − số ngày đã dùng ÷ số ngày dự định dùng), về 0 khi dùng đủ. Chỉ là ước lượng.',
        pt: dung.slice(0, 2).map(function(d){ var t = ddTinh(d, hom); return soGt(d.gia) + ' × (1 − ' + t.ngayDung + ' ÷ ' + t.tongNgay + ') ≈ ' + soGt(t.conGiaTri); }).join(' · ') }], 'Cách tính các số này');
  }
  var xep = dung.slice().sort(function(a, b){
    var ta = ddTinh(a, hom), tb = ddTinh(b, hom), ua = (ta.baoHanh === 'sap' ? 0 : 1), ub = (tb.baoHanh === 'sap' ? 0 : 1);
    return (ua - ub) || (a.ngayMua < b.ngayMua ? 1 : -1);
  });
  h += '<div class="cc-ds">' + xep.map(function(d){ return ddDongHtml(d, hom); }).join('') + '</div>';
  var het = ds.filter(function(d){ return d.tt === 'het'; }).sort(function(a, b){ return a.ngayHet < b.ngayHet ? 1 : -1; });
  if (het.length) h += '<div class="dm-sub" style="margin-top:16px"><b>Không dùng nữa</b></div><div class="cc-ds">' + het.slice(0, 5).map(function(d){ return ddDongHtml(d, hom); }).join('') + '</div>';
  return h + '</div>';
}
function ddSheetHtml(id){
  var ds = state.data.doDac || [], ed = id ? ds.filter(function(x){ return x.id === id; })[0] : null;
  var d = ed || { ten: '', gia: '', ngayMua: todayStr(), soNam: DD_NAM_MAC_DINH, baoHanhDen: '', ghiChu: '', tt: 'dung', ngayHet: todayStr(), giaBan: '' };
  var h = vnF('Tên món', '<input type="text" id="dd_ten" maxlength="80" value="' + esc(d.ten) + '" placeholder="VD: Điện thoại">')
    + '<div class="vn-2">' + vnF('Giá mua', dmMoney('dd_gia', d.gia)) + vnF('Ngày mua', '<input type="date" id="dd_ngay" value="' + esc(d.ngayMua) + '">') + '</div>'
    + '<div class="vn-2">' + vnF('Dự định dùng (năm)', '<input type="number" id="dd_nam" min="0.1" max="50" step="0.5" inputmode="decimal" value="' + esc(d.soNam) + '">')
    + vnF('Bảo hành đến', '<input type="date" id="dd_bh" value="' + esc(d.baoHanhDen || '') + '">') + '</div>'
    + vnF('Ghi chú <span class="mp-hint">(tùy chọn)</span>', '<input type="text" id="dd_note" maxlength="120" value="' + esc(d.ghiChu || '') + '" placeholder="VD: mua ở Thế Giới Di Động">');
  if (ed){
    h += dmToggle('dd_het', 'Không dùng nữa', 'Đã bán, hỏng hoặc cho đi. App tính chi phí mỗi ngày tới ngày này.', ed.tt === 'het')
      + '<div class="vn-2">' + vnF('Ngày thôi dùng', '<input type="date" id="dd_ngayhet" value="' + esc(ed.ngayHet || todayStr()) + '">')
      + vnF('Tiền bán lại <span class="mp-hint">(nếu có)</span>', dmMoney('dd_giaban', ed.giaBan)) + '</div>'
      + '<button type="button" class="btn danger dm-xoa" data-act="ddXoa" data-id="' + esc(ed.id) + '">' + icon('trash') + ' Xóa món này</button>';
  }
  return vnSheetKhung(ed ? 'Sửa món đồ' : 'Thêm món đồ', h, ed ? 'Cập nhật' : 'Lưu', 'ddLuu', 'mmHuy');
}

/* ---- sự kiện ---- */
function handleDoDacAction(act, el){
  el = el || {};
  var ds = state.data.doDac = state.data.doDac || [];
  var idOf = function(){ return el.getAttribute && el.getAttribute('data-id'); };
  if (act === 'ddThem'){ state.ccForm = { loai: 'dd', id: '' }; ccSheetVe(); }
  else if (act === 'ddSua'){ state.ccForm = { loai: 'dd', id: idOf() }; ccSheetVe(); }
  else if (act === 'ddLuu'){
    var ten = ((document.getElementById('dd_ten') || {}).value || '').trim();
    var gia = numNonNeg(docSo((document.getElementById('dd_gia') || {}).value));
    var ngay = (document.getElementById('dd_ngay') || {}).value || '';
    var nam = num((document.getElementById('dd_nam') || {}).value);
    var bh = (document.getElementById('dd_bh') || {}).value || '';
    var note = ((document.getElementById('dd_note') || {}).value || '').trim();
    if (!ten){ toast('Nhập tên món.', { loai: 'warn' }); return true; }
    if (gia <= 0){ toast('Nhập giá mua.', { loai: 'warn' }); return true; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)){ toast('Chọn ngày mua.', { loai: 'warn' }); return true; }
    if (!(nam > 0) || nam > 50){ toast('Số năm dự định dùng từ 0,1 đến 50.', { loai: 'warn' }); return true; }
    var cu = ds.filter(function(x){ return x.id === (state.ccForm && state.ccForm.id); })[0];
    if (cu){
      var het = !!(document.getElementById('dd_het') || {}).checked, ngayHet = (document.getElementById('dd_ngayhet') || {}).value || '';
      if (het && !/^\d{4}-\d{2}-\d{2}$/.test(ngayHet)){ toast('Chọn ngày thôi dùng.', { loai: 'warn' }); return true; }
      if (het && ngayHet < ngay){ toast('Ngày thôi dùng phải sau ngày mua.', { loai: 'warn' }); return true; }
      Object.assign(cu, { ten: ten.slice(0, 80), gia: gia, ngayMua: ngay, soNam: nam, baoHanhDen: bh, ghiChu: note.slice(0, 120),
        tt: het ? 'het' : 'dung', ngayHet: het ? ngayHet : '', giaBan: het ? numNonNeg(docSo((document.getElementById('dd_giaban') || {}).value)) : 0 });
    } else {
      ddThem({ ten: ten, gia: gia, ngayMua: ngay, soNam: nam, baoHanhDen: bh, ghiChu: note });
    }
    state.ccForm = null; scheduleSave(); renderCongCu();
    toast('Đã lưu "' + ten + '".');
  } else if (act === 'ddXoa'){
    var xi = ds.findIndex(function(x){ return x.id === idOf(); });
    if (xi < 0) return true;
    var xoa = ds.splice(xi, 1)[0];
    state.ccForm = null; scheduleSave(); renderCongCu();
    toast('Đã xóa "' + xoa.ten + '".', { hoanTac: function(){ ds.splice(Math.min(xi, ds.length), 0, xoa); scheduleSave(); renderCongCu(); } });
  } else return false;
  return true;
}
