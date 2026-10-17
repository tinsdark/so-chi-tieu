"use strict";
/* ====================================================================
   lock.js — KHÓA APP TRÊN MÁY NÀY bằng mã PIN, mở nhanh bằng vân tay / Face ID (WebAuthn).
   Cấu hình là của THIẾT BỊ (localStorage), không đi vào data/Drive: máy nào muốn khóa thì tự bật.

   Giới hạn (nói thẳng): đây là khóa MÀN HÌNH. Dữ liệu trong localStorage (bản ngoại tuyến, token
   Google ~1 giờ) không bị mã hóa — ai mở được DevTools trên máy này vẫn đọc được. Mục đích: người
   khác cầm máy đang mở app không xem được số tiền.

   - PIN không lưu thô: PBKDF2-SHA256 150.000 vòng + muối ngẫu nhiên. Có lưu ĐỘ DÀI PIN (len) để tự mở khi gõ đủ số
     (đánh đổi: lộ độ dài, không lộ nội dung).
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
// Sai 5 lần liên tiếp thì phải chờ; mỗi lần bị khóa chờ lâu hơn (30 giây, 1, 2, 5, 15 phút) và LƯU trên máy nên tải lại trang không xóa được.
// Gõ đúng thì xóa hết. Chỉ là khóa màn hình (xem README mục 6), không phải mã hóa.
var KHOA_CHO_KEY = 'chitieu_khoa_cho_v1';
function khoaChoGiay(lan){ var b = [30, 60, 120, 300, 900]; return b[Math.min(Math.max(Math.round(lan) || 1, 1), b.length) - 1]; }
function khoaChoChu(giay){ return giay < 60 ? giay + ' giây' : Math.round(giay / 60) + ' phút'; }
function khoaDocCho(){
  try{ var o = JSON.parse(localStorage.getItem(KHOA_CHO_KEY) || 'null'); return (o && typeof o === 'object') ? { lan: Math.max(0, +o.lan || 0), den: +o.den || 0 } : { lan: 0, den: 0 }; }
  catch(e){ return { lan: 0, den: 0 }; }
}
function khoaGhiCho(o){ try{ localStorage.setItem(KHOA_CHO_KEY, JSON.stringify(o)); }catch(e){} }
var _khoaSai = 0, _khoaChoDen = khoaDocCho().den;

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
var KHOA_DO_DAI = 6;      // mã PIN CỐ ĐỊNH 6 chữ số: gõ đủ 6 số là app tự kiểm tra (đúng thì mở, sai thì báo ngay)
function khoaPinHopLe(v){ return /^[0-9]{6}$/.test(String(v || '')) ? null : 'Mã PIN gồm đúng 6 chữ số.'; }
// độ dài PIN của cấu hình: 6; riêng cấu hình cũ đã học được độ dài khác (đặt từ bản cho phép 4–12 số) thì giữ độ dài đó để không khóa mất người dùng
function khoaDoDai(c){ return (c && c.len) ? c.len : KHOA_DO_DAI; }
function khoaCoSinhTrac(){
  return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
}

/* ---- màn khóa ----
   Chấm PIN + bàn phím số tự vẽ (không dùng ô nhập): bàn phím điện thoại không che màn hình, gõ nhanh bằng 1 ngón,
   và không dính lỗi iPhone vẽ ô nhập chưa tô màu thành đen. Máy tính vẫn gõ được bằng bàn phím thật. */
var _khoaNhap = '';           // các chữ số đã bấm
var _khoaQuen = false;        // đang ở màn "Quên mã PIN"
var _khoaBan = false;         // đang kiểm tra PIN (chặn bấm chồng)
var _khoaDangQuet = false;    // đang chờ Face ID / vân tay (chặn gọi chồng)

function khoaHien(){
  if (!khoaCauHinh()) return;
  _khoaDangMo = true; _khoaNhap = ''; _khoaQuen = false; _khoaBan = false;
  var g = document.getElementById('lockGate');
  if (!g){
    g = document.createElement('div');
    g.id = 'lockGate';
    g.className = 'gate lock-gate';
    g.setAttribute('role', 'dialog');
    g.setAttribute('aria-modal', 'true');
    g.setAttribute('aria-label', 'Sổ Tiền đã khóa');
    document.body.appendChild(g);
  }
  _khoaVe(g);
  document.body.classList.add('dang-khoa');
  khoaTuQuet();
}
// mở màn khóa là QUÉT LUÔN (Face ID trên iPhone có Face ID, vân tay trên máy dùng vân tay: trình duyệt tự chọn theo máy).
// iOS có thể từ chối quét khi chưa chạm vào trang: khi đó màn khóa báo nhẹ và nút sinh trắc ở bàn phím vẫn bấm quét lại được.
function khoaTuQuet(){
  var c = khoaCauHinh();
  if (!c || !c.credId || !khoaCoSinhTrac() || _khoaQuen) return;
  setTimeout(function(){ if (_khoaDangMo && !_khoaQuen && !_khoaNhap) khoaThuSinhTrac(true); }, 300);
}
function _khoaHero(phu){
  return '<div class="gate-hero nho"><div class="gate-logo"><img src="icons/icon-192.png" alt="" width="64" height="64"></div>'
    + '<h1 class="gate-ten">Sổ Tiền</h1><p class="gate-sub">' + phu + '</p></div>';
}
function _khoaVe(g){
  var c = khoaCauHinh();
  if (_khoaQuen){
    g.innerHTML = '<div class="gate-wrap">' + _khoaHero('Quên mã PIN') + '<div class="gate-body lock-quen-ct">'
      + '<p>Không có cách xem lại mã PIN. Cách duy nhất là xóa khóa <b>cùng toàn bộ dữ liệu lưu trên máy này</b> '
      + '(bản mở ngoại tuyến, thay đổi chưa đồng bộ, phiên đăng nhập), rồi đăng nhập Google lại để tải dữ liệu từ Drive.</p>'
      + '<p>Dữ liệu trên Google Drive <b>không bị ảnh hưởng</b>. Thay đổi chưa kịp đồng bộ lên Drive (nếu có) sẽ mất.</p>'
      + '<button class="btn danger" id="lockXoa">Xóa khóa và dữ liệu trên máy này</button>'
      + '<button class="btn secondary" id="lockQuay">Quay lại</button></div></div>';
    g.querySelector('#lockXoa').addEventListener('click', khoaXoaHet);
    g.querySelector('#lockQuay').addEventListener('click', function(){ _khoaQuen = false; _khoaNhap = ''; _khoaVe(g); });
    return;
  }
  var sinhTrac = !!(c && c.credId && khoaCoSinhTrac());
  var so = function(n){ return '<button type="button" data-so="' + n + '" aria-label="Số ' + n + '">' + n + '</button>'; };
  g.innerHTML = '<div class="gate-wrap">' + _khoaHero('Nhập mã PIN để mở')
    + '<div class="gate-body lock-body">'
    +   '<div class="pin-dots" id="pinDots" role="img" aria-label="Đã nhập 0 số"></div>'
    +   '<div class="gate-msg" id="lockMsg" role="alert"></div>'
    +   '<div class="pin-pad" role="group" aria-label="Bàn phím số">'
    +     [1, 2, 3, 4, 5, 6, 7, 8, 9].map(so).join('')
    +     (sinhTrac ? '<button type="button" class="phu" id="lockSinhTrac" aria-label="Dùng vân tay hoặc Face ID">' + icon('fingerprint') + '</button>'
                    : '<button type="button" class="trong" tabindex="-1" aria-hidden="true"></button>')
    +     so(0)
    +     '<button type="button" class="phu" id="lockXoaSo" aria-label="Xóa số vừa nhập">' + icon('backspace') + '</button>'
    +   '</div>'
    // nút Mở khóa CHỈ cho cấu hình cũ chưa học được độ dài PIN (lần mở thành công đầu tiên sẽ ghi nhớ rồi nút biến mất)
    +   (c && c.len ? '' : '<button class="btn lock-mo" id="lockMo">Mở khóa</button>')
    +   (ghiKhoaBatDoc() ? '<button type="button" class="btn secondary lock-ghi" id="lockGhi"><b>Ghi nhanh</b><small>Không cần mã PIN · chỉ ghi, không xem được sổ</small></button>' : '')
    +   '<button class="lock-quen" id="lockQuen" type="button">Quên mã PIN?</button>'
    + '</div></div>';
  g.querySelectorAll('[data-so]').forEach(function(b){
    // pointerdown: nhận ngay khi chạm (không đợi nhấc ngón), preventDefault để không bôi đen / phóng to khi bấm đúp
    b.addEventListener('pointerdown', function(ev){ ev.preventDefault(); khoaBamSo(b.getAttribute('data-so')); });
    b.addEventListener('keydown', function(ev){ if (ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); khoaBamSo(b.getAttribute('data-so')); } });
  });
  g.querySelector('#lockXoaSo').addEventListener('click', khoaLuiSo);
  var mo = g.querySelector('#lockMo');
  if (mo) mo.addEventListener('click', khoaThuPin);
  var st = g.querySelector('#lockSinhTrac');
  if (st) st.addEventListener('click', function(){ var m = document.getElementById('lockMsg'); if (m) m.textContent = ''; khoaThuSinhTrac(false); });
  g.querySelector('#lockQuen').addEventListener('click', function(){ _khoaQuen = true; _khoaVe(g); });
  var gk = g.querySelector('#lockGhi');
  if (gk) gk.addEventListener('click', ghiKhoaMo);
  _khoaVeChamPin();
}
function _khoaVeChamPin(sai){
  var el = document.getElementById('pinDots'), c = khoaCauHinh();
  if (!el) return;
  var tong = khoaDoDai(c);
  var h = '';
  for (var i = 0; i < tong; i++) h += '<i' + (i < _khoaNhap.length ? ' class="on"' : '') + '></i>';
  el.innerHTML = h;
  el.setAttribute('aria-label', 'Đã nhập ' + _khoaNhap.length + ' số');
  el.classList.remove('sai');
  if (sai){ void el.offsetWidth; el.classList.add('sai'); }
}
function khoaBamSo(n){
  if (!_khoaDangMo || _khoaQuen || _khoaBan) return;
  var c = khoaCauHinh(), toiDa = khoaDoDai(c);
  if (_khoaNhap.length >= toiDa) return;
  _khoaNhap += String(n);
  var m = document.getElementById('lockMsg'); if (m) m.textContent = '';
  _khoaVeChamPin();
  if (_khoaNhap.length === toiDa) khoaThuPin();    // đủ số thì tự kiểm tra: đúng thì mở, sai thì báo ngay
}
function khoaLuiSo(){
  if (!_khoaDangMo || _khoaQuen || _khoaBan) return;
  _khoaNhap = _khoaNhap.slice(0, -1);
  _khoaVeChamPin();
}
// máy tính: gõ số / Backspace / Enter bằng bàn phím thật
document.addEventListener('keydown', function(ev){
  if (!_khoaDangMo || _khoaQuen || ev.ctrlKey || ev.metaKey || ev.altKey || state.qa.khoa) return;      // state.qa.khoa: đang gõ số tiền ở Ghi nhanh trên màn khóa
  if (/^[0-9]$/.test(ev.key)){ ev.preventDefault(); khoaBamSo(ev.key); }
  else if (ev.key === 'Backspace'){ ev.preventDefault(); khoaLuiSo(); }
  else if (ev.key === 'Enter'){ ev.preventDefault(); khoaThuPin(); }
});
function khoaDong(){
  _khoaDangMo = false; _khoaNhap = ''; _khoaQuen = false;
  _khoaSai = 0;
  var g = document.getElementById('lockGate');
  if (g && g.parentNode) g.parentNode.removeChild(g);
  document.body.classList.remove('dang-khoa');
  if (typeof ghiKhoaDuyetMo === 'function' && ghiKhoaChoDoc().length) ghiKhoaDuyetMo();      // có khoản ghi lúc khóa: duyệt trước
  else if (typeof qaMoSanKhiMoApp === 'function') qaMoSanKhiMoApp();      // mở app có khóa: mở khóa xong mới hiện bảng Ghi nhanh (nếu bật)
}
async function khoaThuPin(){
  var msg = document.getElementById('lockMsg');
  if (_khoaBan || !_khoaNhap) return;
  var conCho = Math.ceil((_khoaChoDen - Date.now()) / 1000);
  if (conCho > 0){ if (msg) msg.textContent = 'Sai nhiều lần, thử lại sau ' + khoaChoChu(conCho) + '.'; _khoaNhap = ''; _khoaVeChamPin(); return; }
  _khoaBan = true;
  var pin = _khoaNhap, dung = false;
  try{ dung = await khoaDungPin(pin); } finally { _khoaBan = false; }
  if (dung){
    var c = khoaCauHinh();
    if (c && !c.len){ c.len = pin.length; khoaGhi(c); }      // nhớ độ dài PIN để lần sau tự mở khi đủ số
    _khoaSai = 0; _khoaChoDen = 0; khoaGhiCho({ lan: 0, den: 0 });
    khoaDong();
    return;
  }
  _khoaSai++;
  if (navigator.vibrate){ try { navigator.vibrate([30, 40, 30]); } catch (e){} }
  _khoaVeChamPin(true);
  if (_khoaSai >= 5){
    var lanKhoa = khoaDocCho().lan + 1, giayCho = khoaChoGiay(lanKhoa);
    _khoaChoDen = Date.now() + giayCho * 1000; _khoaSai = 0; khoaGhiCho({ lan: lanKhoa, den: _khoaChoDen });
    if (msg) msg.textContent = 'Sai 5 lần, đợi ' + khoaChoChu(giayCho) + ' rồi thử lại.';
  }
  else if (msg) msg.textContent = 'Mã PIN không chính xác.';
  setTimeout(function(){ _khoaNhap = ''; _khoaVeChamPin(); }, 450);   // để chấm đỏ kịp rung rồi mới xóa
}
async function khoaThuSinhTrac(tuDong){
  var c = khoaCauHinh();
  if (!c || !c.credId || _khoaDangQuet || !khoaCoSinhTrac()) return;
  _khoaDangQuet = true;
  try{
    await navigator.credentials.get({ publicKey: {
      challenge: _ngauNhien(32),
      allowCredentials: [{ type: 'public-key', id: _tuB64(c.credId) }],
      userVerification: 'required', timeout: 60000 } });
    khoaDong();
  }catch(e){
    // màn khóa có thể đã đóng / vẽ lại trong lúc chờ; đang gõ PIN dở thì không chen vào
    var msg = document.getElementById('lockMsg');
    if (msg && !_khoaNhap && !msg.textContent){
      msg.textContent = tuDong ? 'Chưa quét được. Chạm biểu tượng ở bàn phím để quét lại, hoặc nhập mã PIN.'
                               : 'Không xác thực được bằng vân tay / Face ID. Nhập mã PIN.';
    }
  }finally{ _khoaDangQuet = false; }
}
function khoaXoaHet(){
  try{
    Object.keys(localStorage).forEach(function(k){ if (k.indexOf('chitieu_') === 0) localStorage.removeItem(k); });
  }catch(e){}
  location.reload();
}

/* ---- bật / tắt / đổi (gọi từ thẻ ở tab Cài đặt) ---- */
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
  var p1 = await _hoiPin(cu ? 'Mã PIN mới' : 'Đặt mã PIN khóa app', 'Đúng 6 chữ số. Chỉ áp dụng trên máy này.');
  if (p1 == null) return false;
  var p2 = await _hoiPin('Nhập lại mã PIN', '');
  if (p2 == null) return false;
  if (p1 !== p2){ toast('Hai lần nhập không khớp, chưa đổi gì.', { loai: 'err' }); return false; }
  var salt = _b64(_ngauNhien(16));
  khoaGhi({ salt: salt, vong: KHOA_VONG, hash: await khoaBam(p1, salt, KHOA_VONG), len: p1.length,
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
      rp: { name: 'Sổ Tiền' },
      user: { id: _ngauNhien(16), name: 'so-chi-tieu', displayName: 'Sổ Tiền' },
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

/* ---- Ghi nhanh ngay trên màn khóa (công tắc riêng từng máy, mặc định tắt) ----
   Bấm "Ghi nhanh" trên màn khóa thì ghi KHÔNG cần PIN, nhưng khoản ghi chỉ vào HÀNG CHỜ (localStorage riêng, không nằm trong
   dữ liệu sổ, không lên Drive, không đổi số dư). Nhập PIN xong mới hiện bước duyệt: tick khoản nào đúng là của mình thì ghi
   vào sổ, khoản không tick bị bỏ. Chế độ này không đọc ra số dư / lịch sử nào (xem ghiNhanhHtml, state.qa.khoa).
   Hàng chờ tối đa GHI_KHOA_TOI_DA khoản để người lạ cầm máy không bơm rác vô hạn. Logic duyệt ở sotay.js (ghiKhoaDuyet*). */
var GHI_KHOA_BAT_KEY = 'chitieu_ghi_khoa_v1';
var GHI_KHOA_CHO_KEY = 'chitieu_ghi_cho_v1';
var GHI_KHOA_TOI_DA = 50;
function ghiKhoaBatDoc(){
  try{ return localStorage.getItem(GHI_KHOA_BAT_KEY) === '1'; }catch(e){ return false; }
}
function ghiKhoaBatDat(bat){
  try{ localStorage.setItem(GHI_KHOA_BAT_KEY, bat ? '1' : '0'); }catch(e){}
}
function ghiKhoaHopLe(x){
  return !!(x && typeof x.id === 'string' && x.id && (x.kind === 'chi' || x.kind === 'thu') && typeof x.catId === 'string' && x.catId
    && typeof x.ngay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.ngay) && typeof x.tien === 'number' && isFinite(x.tien) && x.tien > 0);
}
function ghiKhoaChoDoc(){
  var ds = [];
  try{ ds = JSON.parse(localStorage.getItem(GHI_KHOA_CHO_KEY) || '[]'); }catch(e){ ds = []; }
  return Array.isArray(ds) ? ds.filter(ghiKhoaHopLe).slice(0, GHI_KHOA_TOI_DA) : [];
}
function ghiKhoaChoGhi(ds){
  try{ localStorage.setItem(GHI_KHOA_CHO_KEY, JSON.stringify(ds)); }catch(e){}
}
// thêm một khoản vào hàng chờ: trả khoản đã thêm, hoặc null nếu hàng chờ đầy / khoản không hợp lệ
function ghiKhoaChoThem(x){
  var ds = ghiKhoaChoDoc();
  if (ds.length >= GHI_KHOA_TOI_DA) return null;
  var it = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), luc: Date.now(),
    ngay: x.ngay, kind: x.kind, catId: x.catId, tien: x.tien, ghiChu: String(x.ghiChu || ''), nhan: Array.isArray(x.nhan) ? x.nhan.slice() : [] };
  if (!ghiKhoaHopLe(it)) return null;
  ds.push(it);
  ghiKhoaChoGhi(ds);
  return it;
}
function ghiKhoaChoXoa(id){
  ghiKhoaChoGhi(ghiKhoaChoDoc().filter(function(x){ return x.id !== id; }));
}
function ghiKhoaMo(){
  var m = document.getElementById('lockMsg');
  if (!state.data){ if (m) m.textContent = 'App đang nạp dữ liệu, thử lại sau vài giây.'; return; }
  if (ghiKhoaChoDoc().length >= GHI_KHOA_TOI_DA){ if (m) m.textContent = 'Hàng chờ đầy. Nhập PIN để duyệt trước.'; return; }
  state.qa.khoa = true;
  qaMoSheet();
}

/* ---- khi nào khóa ---- */
document.addEventListener('visibilitychange', function(){
  var c = khoaCauHinh();
  if (!c) return;
  if (document.hidden){ _khoaAnLuc = Date.now(); return; }
  if (!_khoaDangMo && _khoaAnLuc != null && Date.now() - _khoaAnLuc >= num(c.phut) * 60000) khoaHien();
  _khoaAnLuc = null;
});
if (khoaCauHinh()) khoaHien();      // mở app: khóa trước khi có số liệu nào hiện ra
