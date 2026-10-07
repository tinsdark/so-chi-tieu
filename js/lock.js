"use strict";
/* ====================================================================
   lock.js — KHÓA APP TRÊN MÁY NÀY bằng mã PIN, mở nhanh bằng vân tay / Face ID (WebAuthn).
   Cấu hình là của THIẾT BỊ (localStorage), không đi vào data/Drive: máy nào muốn khóa thì tự bật.

   Giới hạn (nói thẳng): đây là khóa MÀN HÌNH. Dữ liệu trong localStorage (bản ngoại tuyến, token
   Google ~1 giờ) không bị mã hóa — ai mở được DevTools trên máy này vẫn đọc được. Mục đích: người
   khác cầm máy đang mở app không xem được số tiền.

   - PIN không lưu thô: PBKDF2-SHA256 150.000 vòng + muối ngẫu nhiên.
   - Vân tay / Face ID: tạo 1 khóa WebAuthn "platform" chỉ để hỏi xác thực người dùng (không có server
     nên không kiểm chữ ký; trình duyệt chỉ trả kết quả khi người dùng xác thực thành công).
   - Khóa khi mở app và khi quay lại app sau khi rời quá N phút (0 = khóa ngay khi rời).
   - Quên PIN: chỉ có cách xóa khóa CÙNG dữ liệu lưu trên máy này rồi đăng nhập Google lại
     (dữ liệu trên Drive còn nguyên). Không có lối tắt bỏ khóa mà giữ dữ liệu.
   Cần ui.js (toast, moHoiThoai, xacNhan) nạp trước; phải nạp TRƯỚC app.js.
   ==================================================================== */
var KHOA_KEY = 'chitieu_khoa_v1';
var KHOA_VONG = 150000;
var _khoaDangMo = false;      // màn khóa đang hiện -> app.js chặn phím tắt
var _khoaAnLuc = null;        // lúc app bị ẩn (rời app)
var _khoaSai = 0, _khoaChoDen = 0;

function khoaCauHinh(){
  try{
    var o = JSON.parse(localStorage.getItem(KHOA_KEY) || 'null');
    return (o && o.hash && o.salt) ? o : null;
  }catch(e){ return null; }
}
function khoaGhi(o){
  try{ if (o) localStorage.setItem(KHOA_KEY, JSON.stringify(o)); else localStorage.removeItem(KHOA_KEY); }catch(e){}
}
function _b64(buf){
  var s = '', a = new Uint8Array(buf);
  for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}
function _tuB64(b64){
  var s = atob(b64), a = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
function _ngauNhien(n){ var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }

async function khoaBam(pin, saltB64, vong){
  var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: _tuB64(saltB64), iterations: vong || KHOA_VONG }, key, 256);
  return _b64(bits);
}
async function khoaDungPin(pin){
  var c = khoaCauHinh();
  if (!c) return true;
  return (await khoaBam(pin, c.salt, c.vong)) === c.hash;
}
function khoaPinHopLe(v){ return /^[0-9]{4,12}$/.test(String(v || '')) ? null : 'Mã PIN gồm 4–12 chữ số.'; }
function khoaCoSinhTrac(){
  return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
}

/* ---- màn khóa ---- */
function khoaHien(){
  if (!khoaCauHinh()) return;
  _khoaDangMo = true;
  var g = document.getElementById('lockGate');
  if (!g){
    g = document.createElement('div');
    g.id = 'lockGate';
    g.className = 'lock-gate';
    g.setAttribute('role', 'dialog');
    g.setAttribute('aria-modal', 'true');
    g.setAttribute('aria-label', 'Sổ Chi Tiêu đã khóa');
    document.body.appendChild(g);
  }
  _khoaVe(g, false);
  document.body.classList.add('dang-khoa');
}
function _khoaVe(g, quen){
  var c = khoaCauHinh();
  if (quen){
    g.innerHTML = '<div class="auth-card">'
      + '<h2>Quên mã PIN?</h2>'
      + '<p>Không có cách xem lại mã PIN. Cách duy nhất: xóa khóa <b>cùng toàn bộ dữ liệu lưu trên máy này</b> '
      + '(bản mở ngoại tuyến, thay đổi chưa kịp đồng bộ, phiên đăng nhập), rồi đăng nhập Google lại để tải dữ liệu từ Drive.</p>'
      + '<p>Dữ liệu trên Google Drive <b>không bị ảnh hưởng</b>. Thay đổi chưa đồng bộ lên Drive (nếu có) sẽ mất.</p>'
      + '<button class="btn danger" id="lockXoa">Xóa khóa và dữ liệu trên máy này</button>'
      + '<button class="btn secondary" id="lockQuay" style="margin-top:8px">Quay lại</button></div>';
    g.querySelector('#lockXoa').addEventListener('click', khoaXoaHet);
    g.querySelector('#lockQuay').addEventListener('click', function(){ _khoaVe(g, false); });
    return;
  }
  g.innerHTML = '<div class="auth-card">'
    + '<div class="auth-logo"><img src="icons/icon-192.png" alt="" width="64" height="64"></div>'
    + '<h2>Sổ Chi Tiêu đã khóa</h2>'
    + '<input id="lockPin" class="lock-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Mã PIN" aria-label="Mã PIN">'
    + '<div class="auth-msg" id="lockMsg" role="alert"></div>'
    + '<button class="btn" id="lockMo">Mở khóa</button>'
    + (c && c.credId && khoaCoSinhTrac() ? '<button class="btn secondary" id="lockSinhTrac" style="margin-top:8px">Dùng vân tay / Face ID</button>' : '')
    + '<button class="lock-quen" id="lockQuen" type="button">Quên mã PIN?</button></div>';
  var inp = g.querySelector('#lockPin');
  g.querySelector('#lockMo').addEventListener('click', khoaThuPin);
  inp.addEventListener('keydown', function(ev){ if (ev.key === 'Enter'){ ev.preventDefault(); khoaThuPin(); } });
  var st = g.querySelector('#lockSinhTrac');
  if (st) st.addEventListener('click', khoaThuSinhTrac);
  g.querySelector('#lockQuen').addEventListener('click', function(){ _khoaVe(g, true); });
  try{ inp.focus(); }catch(e){}
}
function khoaDong(){
  _khoaDangMo = false;
  _khoaSai = 0;
  var g = document.getElementById('lockGate');
  if (g && g.parentNode) g.parentNode.removeChild(g);
  document.body.classList.remove('dang-khoa');
}
async function khoaThuPin(){
  var inp = document.getElementById('lockPin'), msg = document.getElementById('lockMsg');
  if (!inp) return;
  var conCho = Math.ceil((_khoaChoDen - Date.now()) / 1000);
  if (conCho > 0){ msg.textContent = 'Sai nhiều lần — thử lại sau ' + conCho + ' giây.'; return; }
  if (await khoaDungPin(inp.value)){ khoaDong(); return; }
  _khoaSai++;
  inp.value = '';
  if (_khoaSai >= 5){ _khoaChoDen = Date.now() + 30000; _khoaSai = 0; msg.textContent = 'Sai 5 lần — đợi 30 giây rồi thử lại.'; }
  else msg.textContent = 'Mã PIN không đúng.';
}
async function khoaThuSinhTrac(){
  var c = khoaCauHinh(), msg = document.getElementById('lockMsg');
  if (!c || !c.credId) return;
  try{
    await navigator.credentials.get({ publicKey: {
      challenge: _ngauNhien(32),
      allowCredentials: [{ type: 'public-key', id: _tuB64(c.credId) }],
      userVerification: 'required', timeout: 60000 } });
    khoaDong();
  }catch(e){
    if (msg) msg.textContent = 'Không xác thực được bằng vân tay / Face ID. Nhập mã PIN.';
  }
}
function khoaXoaHet(){
  try{
    Object.keys(localStorage).forEach(function(k){ if (k.indexOf('chitieu_') === 0) localStorage.removeItem(k); });
  }catch(e){}
  location.reload();
}

/* ---- bật / tắt / đổi (gọi từ thẻ ở tab Danh mục) ---- */
function _hoiPin(tieuDe, noiDung){
  return moHoiThoai({
    tieuDe: tieuDe, noiDung: noiDung,
    oNhap: { kieu: 'pin', nhan: 'Mã PIN' }, kiemTra: khoaPinHopLe,
    nut: [ { ma: 'ok', chu: 'Tiếp' }, { ma: 'huy', chu: 'Hủy', kieu: 'secondary', huy: true } ]
  }).then(function(kq){ return (kq && kq.nut === 'ok') ? kq.giaTri : null; });
}
async function khoaDatPin(){
  var cu = khoaCauHinh();
  if (cu){
    var pinCu = await _hoiPin('Đổi mã PIN', 'Nhập mã PIN hiện tại.');
    if (pinCu == null) return false;
    if (!(await khoaDungPin(pinCu))){ toast('Mã PIN hiện tại không đúng.', { loai: 'err' }); return false; }
  }
  var p1 = await _hoiPin(cu ? 'Mã PIN mới' : 'Đặt mã PIN khóa app', 'Từ 4 đến 12 chữ số. Chỉ áp dụng trên máy này.');
  if (p1 == null) return false;
  var p2 = await _hoiPin('Nhập lại mã PIN', '');
  if (p2 == null) return false;
  if (p1 !== p2){ toast('Hai lần nhập không khớp, chưa đổi gì.', { loai: 'err' }); return false; }
  var salt = _b64(_ngauNhien(16));
  khoaGhi({ salt: salt, vong: KHOA_VONG, hash: await khoaBam(p1, salt, KHOA_VONG),
    credId: cu ? cu.credId : '', phut: cu ? cu.phut : 1 });
  toast(cu ? 'Đã đổi mã PIN.' : 'Đã bật khóa app trên máy này.');
  return true;
}
async function khoaTat(){
  if (!khoaCauHinh()) return false;
  var pin = await _hoiPin('Tắt khóa app', 'Nhập mã PIN hiện tại để tắt.');
  if (pin == null) return false;
  if (!(await khoaDungPin(pin))){ toast('Mã PIN không đúng.', { loai: 'err' }); return false; }
  khoaGhi(null);
  toast('Đã tắt khóa app trên máy này.');
  return true;
}
async function khoaBatSinhTrac(){
  var c = khoaCauHinh();
  if (!c || !khoaCoSinhTrac()) return false;
  try{
    var cred = await navigator.credentials.create({ publicKey: {
      challenge: _ngauNhien(32),
      rp: { name: 'Sổ Chi Tiêu' },
      user: { id: _ngauNhien(16), name: 'so-chi-tieu', displayName: 'Sổ Chi Tiêu' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000 } });
    c.credId = _b64(cred.rawId);
    khoaGhi(c);
    toast('Đã bật mở khóa bằng vân tay / Face ID.');
    return true;
  }catch(e){
    console.error('[chitieu] Không bật được vân tay / Face ID:', e);
    toast('Máy hoặc trình duyệt này không bật được vân tay / Face ID. Vẫn dùng mã PIN.', { loai: 'warn' });
    return false;
  }
}
function khoaTatSinhTrac(){ var c = khoaCauHinh(); if (c){ c.credId = ''; khoaGhi(c); } }
function khoaDatPhut(phut){ var c = khoaCauHinh(); if (c){ c.phut = Math.max(0, num(phut)); khoaGhi(c); } }

/* ---- khi nào khóa ---- */
document.addEventListener('visibilitychange', function(){
  var c = khoaCauHinh();
  if (!c) return;
  if (document.hidden){ _khoaAnLuc = Date.now(); return; }
  if (!_khoaDangMo && _khoaAnLuc != null && Date.now() - _khoaAnLuc >= num(c.phut) * 60000) khoaHien();
  _khoaAnLuc = null;
});
if (khoaCauHinh()) khoaHien();      // mở app: khóa trước khi có số liệu nào hiện ra
