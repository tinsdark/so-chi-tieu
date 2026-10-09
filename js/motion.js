/* ====================================================================
   motion.js — animation dùng chung. Chỉ "trang trí" sau khi render, không đụng logic:
   bọc renderSoTay/renderVayNo/renderDongTien/renderMoPhong/renderDanhMuc.
   - đổi tab: thẻ hiện lần lượt (stagger), thanh tiến độ chạy từ 0, số lớn chạy số từ 0
   - cùng tab: số đổi giá trị thì chạy từ số cũ sang số mới
   - form mở ra (.vi-form, #formGiaoDich): trượt nhẹ vào
   - dòng mới hiện dần; dòng vừa xóa mờ dần (bản sao "bóng ma" rồi tự gỡ)
   Tôn trọng prefers-reduced-motion (tắt hết). Thiếu DOM / API (môi trường test) thì bỏ qua.
   ==================================================================== */
var _mo = { tab: null, so: {}, form: {} };

function _moGiam(){
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// số trong chuỗi kiểu "29.390.000 ₫" / "-1.200 ₫" -> số nguyên (null nếu không có)
function _moDocSo(txt){
  var m = /-?\d[\d.]*/.exec(txt || '');
  if (!m) return null;
  return { n: parseInt(m[0].replace(/\./g, ''), 10), m: m[0], i: m.index };
}

function _moChaySo(el, tu, den, txt){
  var p = _moDocSo(txt);
  var t0 = null, dai = 450;
  function buoc(t){
    if (t0 === null) t0 = t;
    var k = Math.min(1, (t - t0) / dai);
    var e = 1 - Math.pow(1 - k, 3);
    var v = Math.round(tu + (den - tu) * e);
    el.textContent = txt.slice(0, p.i) + v.toLocaleString('vi-VN') + txt.slice(p.i + p.m.length);
    if (k < 1) requestAnimationFrame(buoc); else el.textContent = txt;
  }
  requestAnimationFrame(buoc);
}

// chạy số cho các ô lớn: đổi tab -> từ 0; cùng tab -> từ giá trị cũ (nếu khác)
var _MO_SO = '.hero-val, .hero-nums .v, .hero-cl b, .vi-the-so, .bc-v, .tsr-val, .mt-big, .k-wal .stat .val';   // chạy số CẢ phần tử: chỉ cho ô chỉ chứa 1 số (không có phần tử con)
function _moSo(vao, root){
  var moi = {};
  root.querySelectorAll(_MO_SO).forEach(function(el, i){
    var key = state.tab + '|' + i;
    var txt = el.textContent, p = _moDocSo(txt);
    if (!p) return;
    moi[key] = p.n;
    var cu = vao ? 0 : _mo.so[key];
    if (cu != null && cu !== p.n) _moChaySo(el, cu, p.n, txt);
  });
  _mo.so = moi;
}

// thanh tiến độ: đổi tab -> rộng từ 0 ra đúng cỡ (transition trong CSS)
function _moThanh(root){
  root.querySelectorAll('.hm-fill, .hero-bar>i').forEach(function(el){
    var w = el.style.width;
    if (!w) return;
    el.style.width = '0%';
    void el.offsetWidth;
    el.style.width = w;
  });
}

function _moCard(root){
  var i = 0;
  // thẻ nằm thẳng trong #tabContent hoặc trong 2 cột của bố cục màn rộng (.cot2)
  Array.prototype.forEach.call(root.querySelectorAll(':scope > .card, :scope > .month-nav, :scope > .cot2 > div > .card'), function(c){
    c.style.animationDelay = Math.min(i++, 6) * 35 + 'ms';
    c.classList.add('anim-card');
    c.addEventListener('animationend', function f(){ c.classList.remove('anim-card'); c.style.animationDelay = ''; c.removeEventListener('animationend', f); });
  });
}

// hàng có nút xóa: key = các data-* của nút, vị trí = đường đi từ #tabContent
var _MO_HANG = 'tr, .dk-row, .form-row, li, .dl-row';
function _moChup(root){
  var kq = {};
  root.querySelectorAll('[data-act*="Xoa"], [data-act*="Del"]').forEach(function(b){
    var h = b.closest(_MO_HANG);
    if (!h) return;
    var key = b.getAttribute('data-act') + '|' + ['date', 'iid', 'id', 'i'].map(function(a){ return b.getAttribute('data-' + a) || ''; }).join('|');
    var duong = [], n = h;
    while (n && n !== root){ var par = n.parentNode; duong.unshift(Array.prototype.indexOf.call(par.children, n)); n = par; }
    kq[key] = { h: h.cloneNode(true), duong: duong };
  });
  return kq;
}
function _moGoc(root, duong){
  var n = root;
  for (var k = 0; k < duong.length - 1; k++){ n = n && n.children[duong[k]]; }
  return n;
}
function _moHang(root, truoc, sau){
  var cu = Object.keys(truoc), moi = Object.keys(sau);
  var mat = cu.filter(function(k){ return !sau[k]; });
  var them = moi.filter(function(k){ return !truoc[k]; });
  if (mat.length && mat.length <= 2){
    mat.forEach(function(k){
      var g = _moGoc(root, truoc[k].duong), idx = truoc[k].duong[truoc[k].duong.length - 1];
      if (!g || !g.tagName) return;
      var ma = truoc[k].h;
      ma.classList.add('anim-xoa');
      g.insertBefore(ma, g.children[idx] || null);
      setTimeout(function(){ if (ma.parentNode) ma.parentNode.removeChild(ma); }, 260);
    });
  }
  if (them.length && them.length <= 2 && cu.length){
    var cuoi = {};
    root.querySelectorAll('[data-act*="Xoa"], [data-act*="Del"]').forEach(function(b){
      var key = b.getAttribute('data-act') + '|' + ['date', 'iid', 'id', 'i'].map(function(a){ return b.getAttribute('data-' + a) || ''; }).join('|');
      if (them.indexOf(key) >= 0){ var h = b.closest(_MO_HANG); if (h) h.classList.add('anim-moi'); }
    });
  }
}

var _MO_FORM = ['.vi-form', '#formGiaoDich .form-row'];
function _moForm(root){
  _MO_FORM.forEach(function(sel){
    var co = !!root.querySelector(sel);
    if (co && !_mo.form[sel]) root.querySelectorAll(sel).forEach(function(e){ e.classList.add('anim-mo'); });
    _mo.form[sel] = co;
  });
}

var _MO_TAB = { renderSoTay:'sotay', renderVayNo:'vayno', renderDongTien:'dongtien', renderMoPhong:'dongtien', renderBaoCao:'baocao', renderDanhMuc:'danhmuc' };
function _moFormGhi(root){ _MO_FORM.forEach(function(sel){ _mo.form[sel] = !!root.querySelector(sel); }); }

function motionBoc(ten){
  var goc = window[ten];
  if (typeof goc !== 'function' || goc._moBoc) return;
  var moi = function(){
    var root = document.getElementById('tabContent');
    if (!root || state.tab !== _MO_TAB[ten] || _moGiam() || typeof requestAnimationFrame !== 'function') return goc.apply(this, arguments);
    var vao = _mo.tab !== state.tab;
    var truoc = vao ? null : _moChup(root);
    var kq = goc.apply(this, arguments);
    try {
      _moSo(vao, root);
      if (vao){ _moCard(root); _moThanh(root); _moFormGhi(root); }
      else { _moForm(root); _moHang(root, truoc, _moChup(root)); }
    } catch (e) { /* animation lỗi thì thôi, không được làm hỏng giao diện */ }
    _mo.tab = state.tab;
    return kq;
  };
  moi._moBoc = true;
  window[ten] = moi;
}
if (typeof window !== 'undefined' && window.document){
  ['renderSoTay', 'renderVayNo', 'renderDongTien', 'renderMoPhong', 'renderBaoCao', 'renderDanhMuc'].forEach(motionBoc);
}

/* ====================================================================
   CHUYỂN CẢNH & CỬ CHỈ (10/2026)
   - đổi tab: nội dung mờ dần vào (CSS), header + thanh tab không bị đụng tới. KHÔNG dùng View Transitions API (làm thanh tab chớp trên iOS).
   - Sổ tay trên điện thoại: vuốt 1 ngày sang TRÁI = xóa ngày (có Hoàn tác / hỏi như nút thùng rác),
     vuốt sang PHẢI = sửa ngày. Chỉ nhận khi vuốt ngang rõ ràng (không cướp thao tác cuộn dọc).
   - kéo xuống ở đầu trang = Làm mới (app mở từ màn hình chính không có kéo-làm-mới của trình duyệt).
   Tất cả tắt khi "Giảm chuyển động" (trừ vuốt / kéo làm mới: đó là thao tác, không phải trang trí).
   ==================================================================== */
var _moVT = false;      // đang đổi tab (~0,25s): bỏ hiệu ứng thẻ hiện lần lượt (đã có mờ dần cả vùng nội dung)
function motionChuyenTab(huong, lam){
  if (_moGiam()){ lam(); window.scrollTo(0, 0); return; }
  // KHÔNG dùng View Transitions: nó chụp ảnh cả trang rồi trộn, trên iOS làm thanh tab / header chớp mờ khi đổi tab.
  // Chỉ vùng nội dung mờ dần vào; thanh tab và header không bị đụng tới nên đứng yên tuyệt đối.
  _moVT = true;
  var nd = document.getElementById('tabContent');
  lam();
  window.scrollTo(0, 0);
  if (nd){
    nd.classList.remove('doi-tab'); void nd.offsetWidth;      // chạy lại hiệu ứng nếu đổi tab liên tục
    nd.classList.add('doi-tab');
  }
  setTimeout(function(){ _moVT = false; if (nd) nd.classList.remove('doi-tab'); }, 260);
}
(function(){
  var _cardGoc = _moCard;
  _moCard = function(root){ if (!_moVT) _cardGoc(root); };
})();

/* ---- vuốt ngang 1 ngày ở Sổ tay (chỉ màn hình cảm ứng) ----
   Vuốt SANG TRÁI = Xóa ngày, vuốt SANG PHẢI = Sửa ngày. Để người mới biết vuốt sẽ ra gì: vừa vuốt, phía sau dòng hiện
   nền màu + biểu tượng + chữ ("Xóa" đỏ / "Sửa" xanh); vuốt đủ xa thì đổi thành "Thả để xóa / Thả để sửa".
   Thả tay ở vị trí đủ xa thì HỎI XÁC NHẬN rồi mới làm (nhầm tay cũng không mất gì). Chưa đủ xa thì dòng bật về chỗ cũ. */
function vuotNenTao(row){
  var tbody = row.parentNode;   // khung .dl (position:relative) chứa các nhóm ngày
  var nen = document.createElement('div');
  nen.className = 'vuot-nen';
  nen.setAttribute('aria-hidden', 'true');
  nen.style.top = row.offsetTop + 'px';
  nen.style.height = row.offsetHeight + 'px';
  nen.innerHTML = '<span class="vn-sua">' + icon('pencil') + '<b>Sửa</b></span><span class="vn-xoa"><b>Xóa</b>' + icon('trash') + '</span>';
  tbody.classList.add('dang-vuot');
  tbody.appendChild(nen);
  row.classList.add('dang-vuot-dong');
  return nen;
}
function vuotNenBo(bd){
  if (bd.nen && bd.nen.parentNode) bd.nen.parentNode.removeChild(bd.nen);
  if (bd.row.parentNode) bd.row.parentNode.classList.remove('dang-vuot');
  bd.row.classList.remove('dang-vuot-dong');
  bd.row.style.transition = ''; bd.row.style.transform = '';
}
// nội dung hộp thoại xác nhận cho thao tác vuốt
function vuotHoi(loai, date){
  var e = state.data.journal[date];
  if (!e) return Promise.resolve(false);
  var nhan = ngayVN(date), nKhoan = entryItems(e).length + (e.refs || []).length;
  var tomTat = 'Ngày này có ' + nKhoan + ' khoản' + (thuTotal(e) ? ', thu ' + fmt(Math.round(thuTotal(e))) : '') + (chiTotal(e) ? ', chi ' + fmt(Math.round(chiTotal(e))) : '') + '.';
  if (loai === 'sua') return xacNhan('Sửa ngày ' + nhan + '?', tomTat + '\nMở form để sửa số tiền của ngày này.', { chuOk: 'Sửa' });
  return xacNhan('Xóa ngày ' + nhan + '?', tomTat + '\nSau khi xóa vẫn có nút Hoàn tác trong vài giây.', { nguyHiem: true, chuOk: 'Xóa' });
}
(function(){
  if (typeof window === 'undefined' || !window.document || !document.addEventListener) return;
  var bd = null;
  document.addEventListener('touchstart', function(ev){
    if (ev.touches.length !== 1 || state.tab !== 'sotay') return;
    var row = ev.target.closest && ev.target.closest('.dl-day');
    if (!row || ev.target.closest('button, a, input, select')) { bd = null; return; }
    bd = { row: row, x: ev.touches[0].clientX, y: ev.touches[0].clientY, dx: 0, ngang: null, nen: null, qua: false,
           nguong: Math.min(110, row.offsetWidth * 0.3) };
  }, { passive: true });
  document.addEventListener('touchmove', function(ev){
    if (!bd) return;
    var dx = ev.touches[0].clientX - bd.x, dy = ev.touches[0].clientY - bd.y;
    if (bd.ngang === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) bd.ngang = Math.abs(dx) > Math.abs(dy) * 1.5;
    if (!bd.ngang) return;
    if (!bd.nen) bd.nen = vuotNenTao(bd.row);
    bd.dx = dx;
    bd.row.style.transition = 'none';
    bd.row.style.transform = 'translateX(' + dx + 'px)';
    var qua = Math.abs(dx) >= bd.nguong;
    bd.nen.className = 'vuot-nen ' + (dx < 0 ? 'xoa' : 'sua') + (qua ? ' du' : '');
    bd.nen.style.setProperty('--tien', Math.min(1, Math.abs(dx) / bd.nguong));
    bd.nen.querySelector(dx < 0 ? '.vn-xoa b' : '.vn-sua b').textContent = qua ? (dx < 0 ? 'Thả để xóa' : 'Thả để sửa') : (dx < 0 ? 'Xóa' : 'Sửa');
    if (qua && !bd.qua && navigator.vibrate){ try { navigator.vibrate(8); } catch (e){} }   // rung nhẹ khi vừa đủ xa (Android)
    bd.qua = qua;
  }, { passive: true });
  function xong(huy){
    if (!bd) return;
    var b = bd, dx = b.dx; bd = null;
    vuotNenBo(b);
    if (huy || Math.abs(dx) < b.nguong) return;
    var loai = dx < 0 ? 'xoa' : 'sua';
    var date = b.row.getAttribute('data-date');
    if (!date) return;
    var chay = function(){
      // vẽ lại có thể đã thay nhóm ngày trong lúc hộp thoại mở: tìm lại theo ngày (handler chỉ đọc data-date)
      var n2 = document.querySelector('.dl-day[data-date="' + date + '"]');
      if (n2) handleAction(loai === 'xoa' ? 'delDay' : 'editDay', n2);
    };
    // ngày có khoản vay: nút Xóa tự hỏi bằng hộp thoại riêng, có liệt kê hậu quả ở Vay - Nợ -> không hỏi 2 lần
    var coRef = loai === 'xoa' && state.data.journal[date] && (state.data.journal[date].refs || []).length;
    if (coRef){ chay(); return; }
    vuotHoi(loai, date).then(function(ok){ if (ok) chay(); });
  }
  document.addEventListener('touchend', function(){ xong(false); });
  document.addEventListener('touchcancel', function(){ xong(true); });
})();

/* ---- kéo xuống ở đầu trang để làm mới ----
   Trên điện thoại nút "Làm mới" ở đầu trang bị ẩn (xem style.css), kéo xuống là cách duy nhất nên phải chắc ăn:
   - "ở đầu trang" cho lệch <= 2px (iOS đôi khi báo scrollY lẻ như 0.3 hoặc 1 dù đã ở trên cùng).
   - touchmove KHÔNG passive và chặn cử chỉ kéo xuống ở đầu trang, để iOS không giành mất cử chỉ
     (nảy cao su / kéo-làm-mới của trình duyệt) rồi hủy touch giữa chừng.
   - nếu iOS vẫn bắn touchcancel mà đã kéo đủ ngưỡng thì vẫn tính là làm mới. */
(function(){
  if (typeof window === 'undefined' || !window.document || !document.addEventListener) return;
  var keo = null, NGUONG = 80;
  function chiBao(){
    var el = document.getElementById('keoLamMoi');
    if (!el){ el = document.createElement('div'); el.id = 'keoLamMoi'; el.className = 'keo-lam-moi'; document.body.appendChild(el); }
    return el;
  }
  function oDauTrang(){
    var se = document.scrollingElement || document.documentElement;
    return (window.scrollY || 0) <= 2 && (se.scrollTop || 0) <= 2;
  }
  function an(){
    var el = document.getElementById('keoLamMoi');
    if (el){ el.classList.remove('hien', 'du'); el.style.transform = ''; }
  }
  function xong(huy){
    if (!keo) return;
    var du = keo.d >= NGUONG; keo = null;
    an();
    if (du){ var b = document.getElementById('btnRefresh'); if (b) b.click(); }
  }
  document.addEventListener('touchstart', function(ev){
    var app = document.getElementById('app');
    if (ev.touches.length !== 1 || !oDauTrang() || !app || app.style.display === 'none' || _modalDangMo || _khoaDangMoAn()) { keo = null; return; }
    keo = { y: ev.touches[0].clientY, x: ev.touches[0].clientX, d: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', function(ev){
    if (!keo) return;
    var d = ev.touches[0].clientY - keo.y;
    if (d <= 0 || !oDauTrang() || Math.abs(ev.touches[0].clientX - keo.x) > d){ keo.d = 0; an(); return; }
    keo.d = d;
    if (ev.cancelable && d > 6) ev.preventDefault();   // đang kéo xuống từ đầu trang: không để trình duyệt tự nảy/làm mới
    var el = chiBao();
    el.classList.add('hien'); el.classList.toggle('du', d >= NGUONG);
    el.textContent = d >= NGUONG ? 'Thả để làm mới' : 'Kéo xuống để làm mới';
    el.style.transform = 'translate(-50%,' + Math.min(d, NGUONG + 20) * 0.6 + 'px)';
  }, { passive: false });
  document.addEventListener('touchend', function(){ xong(false); });
  document.addEventListener('touchcancel', function(){ xong(true); });
  function _khoaDangMoAn(){ return typeof _khoaDangMo !== 'undefined' && _khoaDangMo; }
})();
