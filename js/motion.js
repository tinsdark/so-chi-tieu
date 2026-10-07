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
var _MO_SO = '.hero-val, .hero-split .v, .k-wal .stat .val';
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
var _MO_HANG = 'tr, .dk-row, .form-row, li';
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
   - đổi tab: View Transitions API, nội dung trượt sang trái/phải theo thứ tự tab; header + thanh tab đứng yên.
     Trình duyệt chưa có API -> đổi tab như cũ (thẻ hiện lần lượt).
   - Sổ tay trên điện thoại: vuốt 1 ngày sang TRÁI = xóa ngày (có Hoàn tác / hỏi như nút thùng rác),
     vuốt sang PHẢI = sửa ngày. Chỉ nhận khi vuốt ngang rõ ràng (không cướp thao tác cuộn dọc).
   - kéo xuống ở đầu trang = Làm mới (app mở từ màn hình chính không có kéo-làm-mới của trình duyệt).
   - ghi xong ở Ghi nhanh: nút chớp dấu tích + rung nhẹ (Android; iPhone không cho web rung).
   Tất cả tắt khi "Giảm chuyển động" (trừ vuốt / kéo làm mới: đó là thao tác, không phải trang trí).
   ==================================================================== */
var _moVT = false;      // đang trong 1 view transition: bỏ hiệu ứng thẻ hiện lần lượt (đã có trượt cả trang)
function motionChuyenTab(huong, lam){
  if (_moGiam() || !document.startViewTransition){ lam(); return; }
  document.documentElement.setAttribute('data-huong', huong > 0 ? 'toi' : 'lui');
  _moVT = true;
  var vt;
  try { vt = document.startViewTransition(function(){ lam(); window.scrollTo(0, 0); }); }
  catch (e){ _moVT = false; lam(); return; }
  vt.finished.finally(function(){ _moVT = false; document.documentElement.removeAttribute('data-huong'); });
}
(function(){
  var _cardGoc = _moCard;
  _moCard = function(root){ if (!_moVT) _cardGoc(root); };
})();

function motionDaGhi(){
  var b = document.querySelector('#ghiNhanh .qa-save');
  if (navigator.vibrate){ try { navigator.vibrate(12); } catch (e){} }
  if (!b || _moGiam()) return;
  b.classList.add('da-ghi');
  setTimeout(function(){ b.classList.remove('da-ghi'); }, 700);
}

/* ---- vuốt ngang 1 ngày ở Sổ tay (chỉ màn hình cảm ứng) ---- */
(function(){
  if (typeof window === 'undefined' || !window.document || !document.addEventListener) return;
  var bd = null;
  document.addEventListener('touchstart', function(ev){
    if (ev.touches.length !== 1 || state.tab !== 'sotay') return;
    var row = ev.target.closest && ev.target.closest('tr.st-row');
    if (!row || ev.target.closest('button, a, input, select')) { bd = null; return; }
    bd = { row: row, x: ev.touches[0].clientX, y: ev.touches[0].clientY, dx: 0, ngang: null };
  }, { passive: true });
  document.addEventListener('touchmove', function(ev){
    if (!bd) return;
    var dx = ev.touches[0].clientX - bd.x, dy = ev.touches[0].clientY - bd.y;
    if (bd.ngang === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) bd.ngang = Math.abs(dx) > Math.abs(dy) * 1.5;
    if (!bd.ngang) return;
    bd.dx = dx;
    bd.row.style.transition = 'none';
    bd.row.style.transform = 'translateX(' + dx + 'px)';
    bd.row.classList.toggle('vuot-xoa', dx < -40);
    bd.row.classList.toggle('vuot-sua', dx > 40);
  }, { passive: true });
  document.addEventListener('touchend', function(){
    if (!bd) return;
    var r = bd.row, dx = bd.dx, nguong = Math.min(120, r.offsetWidth * 0.3);
    r.style.transition = ''; r.style.transform = '';
    r.classList.remove('vuot-xoa', 'vuot-sua');
    bd = null;
    if (Math.abs(dx) < nguong) return;
    var nut = r.querySelector(dx < 0 ? '[data-act=delDay]' : '[data-act=editDay]');
    if (nut) nut.click();
  });
  document.addEventListener('touchcancel', function(){ if (bd){ bd.row.style.transform = ''; bd.row.classList.remove('vuot-xoa', 'vuot-sua'); bd = null; } });
})();

/* ---- kéo xuống ở đầu trang để làm mới ---- */
(function(){
  if (typeof window === 'undefined' || !window.document || !document.addEventListener) return;
  var keo = null, NGUONG = 80;
  function chiBao(){
    var el = document.getElementById('keoLamMoi');
    if (!el){ el = document.createElement('div'); el.id = 'keoLamMoi'; el.className = 'keo-lam-moi'; document.body.appendChild(el); }
    return el;
  }
  document.addEventListener('touchstart', function(ev){
    var app = document.getElementById('app');
    if (ev.touches.length !== 1 || window.scrollY > 0 || !app || app.style.display === 'none' || _modalDangMo || _khoaDangMoAn()) { keo = null; return; }
    keo = { y: ev.touches[0].clientY, x: ev.touches[0].clientX, d: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', function(ev){
    if (!keo) return;
    var d = ev.touches[0].clientY - keo.y;
    if (d <= 0 || window.scrollY > 0 || Math.abs(ev.touches[0].clientX - keo.x) > d){ keo.d = 0; chiBao().classList.remove('hien', 'du'); return; }
    keo.d = d;
    var el = chiBao();
    el.classList.add('hien'); el.classList.toggle('du', d >= NGUONG);
    el.textContent = d >= NGUONG ? 'Thả để làm mới' : 'Kéo xuống để làm mới';
    el.style.transform = 'translate(-50%,' + Math.min(d, NGUONG + 20) * 0.6 + 'px)';
  }, { passive: true });
  document.addEventListener('touchend', function(){
    if (!keo) return;
    var du = keo.d >= NGUONG; keo = null;
    var el = document.getElementById('keoLamMoi');
    if (el){ el.classList.remove('hien', 'du'); el.style.transform = ''; }
    if (du){ var b = document.getElementById('btnRefresh'); if (b) b.click(); }
  });
  function _khoaDangMoAn(){ return typeof _khoaDangMo !== 'undefined' && _khoaDangMo; }
})();
