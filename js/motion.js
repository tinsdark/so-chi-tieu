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
  Array.prototype.forEach.call(root.children, function(c){
    if (!c.classList || !(c.classList.contains('card') || c.classList.contains('month-nav'))) return;
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

var _MO_TAB = { renderSoTay:'sotay', renderVayNo:'vayno', renderDongTien:'dongtien', renderMoPhong:'mophong', renderDanhMuc:'danhmuc' };
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
  ['renderSoTay', 'renderVayNo', 'renderDongTien', 'renderMoPhong', 'renderDanhMuc'].forEach(motionBoc);
}
