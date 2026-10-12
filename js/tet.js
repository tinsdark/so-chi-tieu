"use strict";
/* ====================================================================
   tet.js — TẾT ĐẾM NGƯỢC + QUỸ TẾT (thẻ ở tab Báo cáo, hiện khi còn dưới 150 ngày tới mùng 1 Tết hoặc đang trong mùa Tết).
   Mùa Tết = từ 20 tháng Chạp tới mùng 10 tháng Giêng (theo âm lịch, amlich.js). Thẻ cho biết:
     - còn bao nhiêu ngày tới mùng 1 Tết và tới 20 Chạp (lúc bắt đầu chi tiêu Tết);
     - Tết năm ngoái bạn chi bao nhiêu (chi THẬT, không gồm vay nợ, trong đúng mùa Tết năm trước) và các danh mục chi nhiều nhất;
       bắt đầu dùng sổ sau mùa Tết đó thì nói "chưa có dữ liệu";
     - quỹ Tết: mặc định gợi ý bằng số chi Tết năm ngoái (làm tròn lên 100.000), bấm một nút tạo MỤC TIÊU TIẾT KIỆM "Quỹ Tết <năm>"
       (hạn chót = tháng bắt đầu mùa Tết, g.tetNam = năm dương của Tết) để dùng sẵn thanh tiến độ / "Gom thêm" của mục tiêu.
       Đã có mục tiêu thì thẻ hiện tiến độ và số cần để dành mỗi ngày tới 20 Chạp.
   Chỉ ĐỌC dữ liệu, trừ nút tạo mục tiêu. Cần state.js, amlich.js, sotay.js (THU_TRONG_TUAN, mucTieuCardHtml) load trước.
   ==================================================================== */

var TET_HIEN_TRUOC = 150;      // hiện thẻ khi còn tối đa bấy nhiêu ngày tới Tết
var TET_LAM_TRON = 100000;

function tetThuChu(d){
  var t = new Date(parseInt(d.slice(0, 4), 10), parseInt(d.slice(5, 7), 10) - 1, parseInt(d.slice(8, 10), 10));
  return THU_TRONG_TUAN[t.getDay()];
}
// mùa Tết gắn với Tết của năm dương nam: { nam, tet, batDau (20 Chạp), ketThuc (mùng 10) }
function tetMua(nam){
  return { nam: nam, tet: alTet(nam), batDau: alSangDuong(20, 12, nam - 1, false), ketThuc: alSangDuong(10, 1, nam, false) };
}
// mùa Tết sắp tới hoặc đang diễn ra tại homNay (qua mùng 10 thì sang Tết năm sau)
function tetSapToi(homNay){
  homNay = homNay || todayStr();
  var y = parseInt(homNay.slice(0, 4), 10), m = tetMua(y);
  if (homNay > m.ketThuc) m = tetMua(y + 1);
  m.conNgay = daysBetween(homNay, m.tet);
  m.conToiBatDau = daysBetween(homNay, m.batDau);
  m.dangTrongMua = homNay >= m.batDau && homNay <= m.ketThuc;
  m.tenNam = alCanChi(alCua(m.tet).nam);
  return m;
}
// chi THẬT trong khoảng [tu, den]: { tong, ds: [{ id, ten, v }] lớn → nhỏ, coDuLieu }
// coDuLieu = false khi sổ bắt đầu SAU ngày bắt đầu khoảng (chưa dùng app hồi đó)
function tetChiTrong(tu, den){
  var theo = {}, tong = 0, bd = state.data.settings.ngayBatDau || '';
  Object.keys(state.data.journal).forEach(function(d){
    if (d < tu || d > den) return;
    var chi = state.data.journal[d].chi || {};
    Object.keys(chi).forEach(function(id){
      if (CAT_HE_THONG.chi[id]) return;
      var v = num(chi[id]);
      if (v > 0){ theo[id] = (theo[id] || 0) + v; tong += v; }
    });
  });
  var ds = Object.keys(theo).map(function(id){ return { id: id, ten: catTen('chi', id), v: theo[id] }; }).sort(function(a, b){ return b.v - a.v; });
  return { tong: tong, ds: ds, coDuLieu: !(bd && bd > tu) };
}
function tetGoiY(tong){ return tong > 0 ? Math.ceil(tong / TET_LAM_TRON) * TET_LAM_TRON : 0; }
function tetMucTieu(nam){
  return (state.data.mucTieu || []).filter(function(g){ return g.tetNam === nam; })[0] || null;
}
function tetTaoMucTieu(m, soTien){
  var g = { id: 'mt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ten: 'Quỹ Tết ' + m.nam, soTien: soTien,
            hanChot: m.batDau.slice(0, 7), walletId: '', daGom: 0, tetNam: m.nam };
  state.data.mucTieu = state.data.mucTieu || [];
  state.data.mucTieu.push(g);
  return g;
}

/* ---- giao diện ---- */
function tetCardHtml(homNay){
  homNay = homNay || todayStr();
  var m = tetSapToi(homNay);
  if (m.conNgay > TET_HIEN_TRUOC && !m.dangTrongMua) return '';
  var truoc = tetMua(m.nam - 1), ct = tetChiTrong(truoc.batDau, truoc.ketThuc), goiY = ct.coDuLieu ? tetGoiY(ct.tong) : 0, g = tetMucTieu(m.nam);
  var ngayTet = tetThuChu(m.tet) + ' ' + ngayVN(m.tet);
  var h = '<div class="card bc-card tet-card" id="cardTet"><h3 class="bc-h"><span>Tết ' + m.tenNam + '</span></h3>';
  if (m.conNgay === 0) h += '<div class="tet-big"><b>Hôm nay</b><span>là mùng 1 Tết</span></div>';
  else if (m.conNgay < 0) h += '<div class="tet-big"><b>Mùng ' + (1 - m.conNgay) + '</b><span>mùa Tết đang diễn ra</span></div>';
  else h += '<div class="tet-big"><b>' + m.conNgay + '</b><span>ngày nữa tới mùng 1 Tết</span></div>';
  h += '<div class="tet-sub">Mùng 1: <b>' + ngayTet + '</b>.'
    + (m.conToiBatDau > 0 ? ' Mùa Tết bắt đầu <b>' + ngayVN(m.batDau) + '</b> (20 Chạp), còn <b>' + m.conToiBatDau + ' ngày</b>.' : '') + '</div>';
  h += '<div class="qa-lbl tet-lbl">Tết năm ngoái (20 Chạp – mùng 10)</div>';
  if (!ct.coDuLieu) h += '<div class="tet-sub">Chưa có dữ liệu: sổ này bắt đầu sau mùa Tết đó.</div>';
  else if (!(ct.tong > 0)) h += '<div class="tet-sub">Sổ không ghi khoản chi nào trong mùa Tết năm ngoái.</div>';
  else h += '<div class="tet-sub">Bạn chi <b>' + fmt(Math.round(ct.tong)) + '</b>' + (ct.ds.length ? ', nhiều nhất: ' + ct.ds.slice(0, 3).map(function(x){ return esc(x.ten) + ' ' + fmt(Math.round(x.v)); }).join(', ') : '') + '.</div>';
  h += '<div class="qa-lbl tet-lbl">Quỹ Tết</div>';
  if (g){
    var t = mucTieuTienDo(g, homNay), ngayConLai = Math.max(1, m.conToiBatDau);
    h += '<div class="tet-sub"><b>' + esc(g.ten) + '</b>: đã gom <b>' + fmt(Math.round(t.da)) + '</b> / ' + fmt(Math.round(t.dich)) + ' (' + Math.round(t.pct * 100) + '%).'
      + (t.xong ? ' Đã đủ.' : (m.conToiBatDau > 0 ? ' Cần để dành khoảng <b>' + fmt(Math.round(t.conThieu / ngayConLai)) + '</b> mỗi ngày tới 20 Chạp (còn thiếu ' + fmt(Math.round(t.conThieu)) + ').' : ' Còn thiếu ' + fmt(Math.round(t.conThieu)) + '.')) + '</div>';
    if (!t.xong && !t.theoVi) h += '<button type="button" class="btn secondary sm tet-nut" data-act="mtGom" data-id="' + esc(g.id) + '">+ Gom thêm</button>';
  } else if (goiY > 0){
    h += '<div class="tet-sub">Gợi ý quỹ Tết: <b>' + fmt(goiY) + '</b> (bằng số đã chi năm ngoái'
      + (m.conToiBatDau > 0 ? ', tức khoảng <b>' + fmt(Math.ceil(goiY / m.conToiBatDau)) + '</b> mỗi ngày từ hôm nay tới 20 Chạp' : '') + ').</div>'
      + '<button type="button" class="btn sm tet-nut" data-act="tetTaoMt" data-nam="' + m.nam + '">Tạo mục tiêu Quỹ Tết ' + fmt(goiY) + '</button>';
  } else {
    h += '<div class="tet-sub">Chưa có số Tết năm ngoái để gợi ý. Tự đặt một mục tiêu để theo dõi tiến độ.</div>'
      + '<button type="button" class="btn secondary sm tet-nut" data-act="tetMoMt">+ Thêm mục tiêu</button>';
  }
  var ds = [
    { ten: 'Mùa Tết', ct: 'Từ 20 tháng Chạp tới mùng 10 tháng Giêng (âm lịch), đổi ra ngày dương bằng lịch âm trong app.',
      pt: ngayVN(m.batDau) + ' → ' + ngayVN(m.ketThuc) + ' (Tết ' + m.tenNam + ', mùng 1 = ' + ngayVN(m.tet) + ')' }
  ];
  if (ct.coDuLieu && ct.tong > 0) ds.push({ ten: 'Số chi Tết năm ngoái', ct: 'Cộng chi thật (không gồm vay nợ) từ ' + ngayVN(truoc.batDau) + ' tới ' + ngayVN(truoc.ketThuc) + '.',
    pt: ct.ds.length === 1 ? soGt(ct.tong) : ct.ds.slice(0, 3).map(function(x){ return soGt(x.v); }).join(' + ') + (ct.ds.length > 3 ? ' + ' + soGt(ct.tong - ct.ds.slice(0, 3).reduce(function(s, x){ return s + x.v; }, 0)) + ' (các danh mục khác)' : '') + ' = ' + soGt(ct.tong) });
  h += giaiThichSo(ds, 'Cách tính các số này');
  return h + '</div>';
}

function handleTetAction(act, el){
  if (act === 'tetMoMt'){            // mở bảng "Thêm mục tiêu tiết kiệm" ở Cài đặt → Kế hoạch (chuyển tab trước, vì bảng nằm ở đó)
    state.dmTab = 'kehoach'; state.mtForm = { id: '' }; chuyenTab('danhmuc');
    return true;
  }
  if (act !== 'tetTaoMt') return false;
  var nam = parseInt(el.getAttribute('data-nam'), 10), m = tetMua(nam);
  if (tetMucTieu(nam)){ toast('Đã có mục tiêu Quỹ Tết ' + nam + '.'); return true; }
  var truoc = tetMua(nam - 1), ctn = tetChiTrong(truoc.batDau, truoc.ketThuc), goiY = ctn.coDuLieu ? tetGoiY(ctn.tong) : 0;
  if (!(goiY > 0)) return true;
  var g = tetTaoMucTieu(m, goiY);
  scheduleSave(); renderAll();
  toast('Đã tạo mục tiêu "' + g.ten + '" ' + fmt(goiY) + '.', { giay: 7, hoanTac: function(){
    state.data.mucTieu = (state.data.mucTieu || []).filter(function(x){ return x.id !== g.id; });
    scheduleSave(); renderAll(); toast('Đã hoàn tác.');
  } });
  return true;
}
