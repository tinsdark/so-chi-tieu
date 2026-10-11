"use strict";
/* ====================================================================
   loihua.js — thẻ LỜI HỨA ở tab Công cụ: cam kết có thời hạn với chính mình, khác hạn mức (hạn mức chỉ là số mềm báo "vượt").
   loiHua[] = [{ id, catId (danh mục chi), kieu: 'lan' | 'tien', gioiHan (số lần | số tiền; 0 = không chi), tuNgay, denNgay, cau, ngayTao }]
   - 'lan': tối đa N dòng chi ở danh mục đó trong khoảng ngày; 'tien': tổng tiền chi tối đa X.
   - Trạng thái TÍNH TỪ SỔ TAY, không lưu: chưa bắt đầu / đang giữ (ngày thứ N) / đã phá (ngày dòng chi làm vượt) / đã giữ lời (hết hạn mà chưa vượt).
     Sửa hay xóa dòng chi ở Sổ tay thì trạng thái tự đổi theo, không có số liệu thứ hai để lệch.
   - Lúc bấm Lưu một khoản chi sẽ làm VƯỢT lời hứa (Ghi nhanh, hoặc sửa / thêm một dòng ở Sổ tay) thì hiện đúng câu bạn tự viết trong hộp
     "Kiểm tra trước khi ghi" (canhBaoLoiHua, nối vào handleSoTayAction ở sotay.js). Vẫn ghi được: bấm "Vẫn ghi" là phá lời hứa, app chỉ không làm ngơ.
     Lời hứa đã bị phá rồi thì không nhắc nữa cho khỏi lặp. Form "Sửa cả ngày" chưa có nhắc.
   Cần state.js, sotay.js, danhmuc.js (dmHead, dmSeg, dmMoney, dkCatOptions), vayno.js (vnF, vnSheetKhung), congcu.js (sheet dùng chung) load trước.
   ==================================================================== */

function lhSoNgay(a, b){      // số ngày từ a đến b (cùng 'YYYY-MM-DD'), a = b là 0
  var pa = a.split('-'), pb = b.split('-');
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
}
// các dòng chi của danh mục trong khoảng ngày, theo thứ tự ngày; boIid = dòng đang sửa (không tính)
function lhDongChi(h, boIid){
  var out = [];
  Object.keys(state.data.journal).sort().forEach(function(ngay){
    if (ngay < h.tuNgay || ngay > h.denNgay) return;
    entryItems(state.data.journal[ngay]).forEach(function(it){
      if (it.kind === 'chi' && it.catId === h.catId && it.iid !== boIid && num(it.soTien) > 0) out.push({ ngay: ngay, iid: it.iid, soTien: num(it.soTien) });
    });
  });
  return out;
}
/* trạng thái 1 lời hứa tại homNay: { n, tong, pha ('' hoặc ngày làm vượt), trang: 'chua'|'dang'|'pha'|'giu', ngayGiu, tongNgay } */
function lhTrangThai(h, homNay, boIid){
  homNay = homNay || todayStr();
  var ds = lhDongChi(h, boIid), tong = 0, pha = '', i;
  ds.forEach(function(x){ tong += x.soTien; });
  if (h.kieu === 'tien'){
    var cum = 0;
    for (i = 0; i < ds.length; i++){ cum += ds[i].soTien; if (cum > h.gioiHan + 0.5){ pha = ds[i].ngay; break; } }
  } else if (ds.length > h.gioiHan){
    pha = ds[Math.round(h.gioiHan)].ngay;
  }
  var tongNgay = lhSoNgay(h.tuNgay, h.denNgay) + 1, trang;
  if (pha) trang = 'pha';
  else if (homNay < h.tuNgay) trang = 'chua';
  else if (homNay > h.denNgay) trang = 'giu';
  else trang = 'dang';
  return { n: ds.length, tong: tong, pha: pha, trang: trang, tongNgay: tongNgay,
           ngayGiu: trang === 'chua' ? 0 : Math.min(tongNgay, lhSoNgay(h.tuNgay, homNay) + 1) };
}
function lhQuyTac(h){
  var ten = catTen('chi', h.catId);
  if (h.kieu === 'tien') return h.gioiHan > 0 ? ten + ': tối đa ' + fmt(Math.round(h.gioiHan)) : ten + ': không chi';
  return h.gioiHan > 0 ? ten + ': tối đa ' + Math.round(h.gioiHan) + ' lần' : ten + ': không chi';
}
/* khoản chi (danh mục, số tiền, ngày) sắp ghi có làm vượt lời hứa nào chưa bị phá không: trả mảng câu nhắc */
function lhViPham(catId, tien, ngay, boIid, homNay){
  var out = [];
  (state.data.loiHua || []).forEach(function(h){
    if (h.catId !== catId || ngay < h.tuNgay || ngay > h.denNgay || tien <= 0) return;
    var t = lhTrangThai(h, homNay, boIid);
    if (t.trang === 'pha') return;
    var dau = 'Bạn đã hứa: "' + h.cau + '". ';
    if (h.kieu === 'tien'){
      if (t.tong + tien <= h.gioiHan + 0.5) return;
      out.push(dau + (h.gioiHan > 0 ? 'Tổng chi ' + catTen('chi', catId) + ' sẽ thành ' + fmt(Math.round(t.tong + tien)) + ', vượt mức đã hứa ' + fmt(Math.round(h.gioiHan)) + ' (hết ' + ngayNganVN(h.denNgay) + ').'
        : 'Bạn hứa không chi ' + catTen('chi', catId) + ' tới hết ' + ngayNganVN(h.denNgay) + '.'));
    } else {
      if (t.n + 1 <= h.gioiHan) return;
      out.push(dau + (h.gioiHan > 0 ? 'Đây sẽ là lần thứ ' + (t.n + 1) + ' chi ' + catTen('chi', catId) + ' (hứa tối đa ' + Math.round(h.gioiHan) + ' lần, hết ' + ngayNganVN(h.denNgay) + ').'
        : 'Bạn hứa không chi ' + catTen('chi', catId) + ' tới hết ' + ngayNganVN(h.denNgay) + '.'));
    }
  });
  return out;
}
// nối vào hộp "Kiểm tra trước khi ghi" ở sotay.js; chỉ xét khoản CHI
function canhBaoLoiHua(act, el){
  if (!(state.data.loiHua || []).length) return '';
  var catId, tien, ngay, boIid = '';
  if (act === 'qaSave'){
    if (state.qa.kind === 'thu') return '';
    catId = qaCatChon('chi');
    tien = numNonNeg(docSo((document.getElementById('qa_amount') || {}).value));
    ngay = (document.getElementById('qa_date') || {}).value || todayStr();
  } else if (act === 'stSaveItem'){
    var kc = ((document.getElementById('st_it_cat') || {}).value || '').split('|');
    if (kc[0] !== 'chi') return '';
    catId = kc[1];
    tien = numNonNeg(docSo((document.getElementById('st_it_tien') || {}).value));
    ngay = (el.getAttribute && el.getAttribute('data-date')) || todayStr();
    boIid = (el.getAttribute && el.getAttribute('data-iid')) || '';
    if (boIid){      // sửa mà không đổi danh mục / số tiền thì không nhắc lại
      var cu = entryItems(state.data.journal[ngay]).filter(function(it){ return it.iid === boIid; })[0];
      if (cu && cu.catId === catId && num(cu.soTien) === tien) return '';
    }
  } else return '';
  return lhViPham(catId, tien, ngay, boIid).join('\n\n');
}

/* ---- giao diện ---- */
function lhTheTrang(h, t){
  if (t.trang === 'pha') return '<span class="cc-tag bad">Đã phá lời hứa ngày ' + ngayNganVN(t.pha) + '</span>';
  if (t.trang === 'giu') return '<span class="cc-tag ok">Đã giữ lời · ' + t.tongNgay + ' ngày</span>';
  if (t.trang === 'chua') return '<span class="cc-tag">Bắt đầu ' + ngayNganVN(h.tuNgay) + '</span>';
  return '<span class="cc-tag ok">Đang giữ · ngày thứ ' + t.ngayGiu + '/' + t.tongNgay + '</span>';
}
function lhDongHtml(h, hom){
  var t = lhTrangThai(h, hom), tien = h.kieu === 'tien';
  var dung = h.gioiHan > 0 ? 'Đã dùng ' + (tien ? fmt(Math.round(t.tong)) + ' / ' + fmt(Math.round(h.gioiHan)) : t.n + ' / ' + Math.round(h.gioiHan) + ' lần')
    : (t.n > 0 ? 'Đã chi ' + t.n + ' lần · ' + fmt(Math.round(t.tong)) : 'Chưa chi lần nào');
  var pct = h.gioiHan > 0 ? Math.min(100, Math.round((tien ? t.tong : t.n) / h.gioiHan * 100)) : (t.n > 0 ? 100 : 0);
  return '<div class="cc-it lh-' + t.trang + '" role="button" tabindex="0" data-act="lhSua" data-id="' + esc(h.id) + '" aria-label="Sửa lời hứa ' + esc(lhQuyTac(h)) + '">'
    + '<div class="cc-it-h"><b>' + esc(lhQuyTac(h)) + '</b><span class="muted">' + ngayNganVN(h.tuNgay) + ' – ' + ngayNganVN(h.denNgay) + '</span></div>'
    + '<div class="lh-cau">“' + esc(h.cau) + '”</div>'
    + '<div class="cc-it-s">' + lhTheTrang(h, t) + '<span class="muted">' + dung + '</span></div>'
    + (t.trang === 'chua' ? '' : '<div class="dt-track sm" style="margin:2px 0 0"><i style="width:' + pct + '%' + (t.trang === 'pha' ? ';background:var(--red)' : '') + '"></i></div>')
    + '</div>';
}
function lhCardHtml(){
  var hom = todayStr(), ds = state.data.loiHua || [];
  var h = '<div class="card dm-card cc-card">' + dmHead('Lời hứa', '<button class="btn secondary sm" data-act="lhThem">+ Thêm</button>')
    + '<div class="dm-sub">Tự hứa với mình có thời hạn. Khi ghi khoản làm vượt lời hứa, app nhắc đúng câu bạn đã viết. Vẫn ghi được, nhưng phải xác nhận.</div>';
  if (!ds.length) return h + '<div class="empty">Chưa có lời hứa nào. Ví dụ: "không trà sữa tới hết tháng" hoặc "tối đa 4 lần cà phê ngoài".</div></div>';
  var thu = { dang: 0, chua: 1, pha: 2, giu: 3 };
  var xep = ds.map(function(x){ return { h: x, t: lhTrangThai(x, hom) }; })
    .sort(function(a, b){ return (thu[a.t.trang] - thu[b.t.trang]) || (a.h.denNgay < b.h.denNgay ? -1 : 1); });
  var xong = xep.filter(function(x){ return x.t.trang === 'giu' || x.t.trang === 'pha'; });
  var hien = xep.filter(function(x){ return x.t.trang === 'dang' || x.t.trang === 'chua'; }).concat(xong.slice(0, 5));
  h += '<div class="cc-ds">' + hien.map(function(x){ return lhDongHtml(x.h, hom); }).join('') + '</div>';
  var giu = xep.filter(function(x){ return x.t.trang === 'giu'; }), ngay = 0, dang = xep.filter(function(x){ return x.t.trang === 'dang'; });
  giu.forEach(function(x){ ngay += x.t.tongNgay; }); dang.forEach(function(x){ ngay += x.t.ngayGiu; });
  if (giu.length || dang.length){
    h += '<div class="cc-nhin">' + icon('check') + ' Đã giữ lời ' + giu.length + ' lời hứa' + (dang.length ? ', đang giữ ' + dang.length : '') + ' · tổng <b>' + ngay + ' ngày</b></div>';
  }
  return h + '</div>';
}
function lhSheetHtml(id){
  var ds = state.data.loiHua || [], ed = id ? ds.filter(function(x){ return x.id === id; })[0] : null;
  var hom = todayStr(), cuoiThang = monthKey(hom) + '-' + pad2(daysInMonth(monthKey(hom)));
  var d = ed || { catId: '', kieu: 'lan', gioiHan: '', tuNgay: hom, denNgay: cuoiThang, cau: '' };
  var h = vnF('Danh mục chi', '<select id="lh_cat">' + dkCatOptions('chi', d.catId ? 'chi|' + d.catId : '') + '</select>')
    + vnF('Giới hạn theo', dmSeg('lh_kieu', d.kieu === 'tien' ? 'tien' : 'lan', [['lan', 'Số lần'], ['tien', 'Số tiền']]))
    + vnF('Tối đa <span class="mp-hint">(bỏ trống hoặc 0 = không chi)</span>', dmMoney('lh_gioiHan', d.gioiHan, '0'))
    + '<div class="vn-2">' + vnF('Từ ngày', '<input type="date" id="lh_tu" value="' + esc(d.tuNgay) + '">')
    + vnF('Đến ngày', '<input type="date" id="lh_den" value="' + esc(d.denNgay) + '">') + '</div>'
    + vnF('Câu bạn tự hứa', '<input type="text" id="lh_cau" maxlength="120" value="' + esc(d.cau) + '" placeholder="VD: Tháng này nhịn trà sữa để dành tiền mua xe">',
        '', 'Khi ghi khoản làm vượt lời hứa, app hiện đúng câu này.');
  if (ed) h += '<button type="button" class="btn danger dm-xoa" data-act="lhXoa" data-id="' + esc(ed.id) + '">' + icon('trash') + ' Xóa lời hứa</button>';
  return vnSheetKhung(ed ? 'Sửa lời hứa' : 'Thêm lời hứa', h, ed ? 'Cập nhật' : 'Lưu', 'lhLuu', 'mmHuy');
}

/* ---- sự kiện ---- */
function handleLoiHuaAction(act, el){
  el = el || {};
  var ds = state.data.loiHua = state.data.loiHua || [];
  var idOf = function(){ return el.getAttribute && el.getAttribute('data-id'); };
  if (act === 'lhThem'){ state.ccForm = { loai: 'lh', id: '' }; ccSheetVe(); }
  else if (act === 'lhSua'){ state.ccForm = { loai: 'lh', id: idOf() }; ccSheetVe(); }
  else if (act === 'lhLuu'){
    var cat = ((document.getElementById('lh_cat') || {}).value || '').split('|');
    var tu = (document.getElementById('lh_tu') || {}).value, den = (document.getElementById('lh_den') || {}).value;
    var kieu = (document.getElementById('lh_kieu') || {}).value === 'tien' ? 'tien' : 'lan';
    var gh = numNonNeg(docSo((document.getElementById('lh_gioiHan') || {}).value));
    var cau = ((document.getElementById('lh_cau') || {}).value || '').trim();
    if (cat.length !== 2 || !cat[1]){ toast('Chọn danh mục chi.', { loai: 'warn' }); return true; }
    if (!tu || !den || den < tu){ toast('Ngày kết thúc phải sau ngày bắt đầu.', { loai: 'warn' }); return true; }
    if (!cau){ toast('Viết một câu hứa để app nhắc lại cho bạn.', { loai: 'warn' }); return true; }
    var o = { catId: cat[1], kieu: kieu, gioiHan: kieu === 'lan' ? Math.round(gh) : gh, tuNgay: tu, denNgay: den, cau: cau };
    var cu = ds.filter(function(x){ return x.id === (state.ccForm && state.ccForm.id); })[0];
    if (cu) Object.assign(cu, o);
    else ds.push(Object.assign({ id: 'lh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ngayTao: todayStr() }, o));
    state.ccForm = null; scheduleSave(); renderCongCu();
    toast('Đã lưu lời hứa: ' + lhQuyTac(o) + '.');
  } else if (act === 'lhXoa'){
    var xi = ds.findIndex(function(x){ return x.id === idOf(); });
    if (xi < 0) return true;
    var xoa = ds.splice(xi, 1)[0];
    state.ccForm = null; scheduleSave(); renderCongCu();
    toast('Đã xóa lời hứa.', { hoanTac: function(){ ds.splice(Math.min(xi, ds.length), 0, xoa); scheduleSave(); renderCongCu(); } });
  } else return false;
  return true;
}
