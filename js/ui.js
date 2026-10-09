"use strict";
/* ====================================================================
   ui.js — lớp giao diện dùng chung: toast, hộp thoại (thay alert/confirm/
   prompt của trình duyệt), và chế độ tối.

   VÌ SAO BỎ alert/confirm/prompt:
   - Chúng CHẶN cả tab (modal của trình duyệt), trên điện thoại hiện ra như
     popup hệ thống, không đọc được số tiền dài, không xuống dòng đẹp.
   - confirm chỉ có "OK / Hủy" nên phải viết "OK = ... / Hủy = ..." trong
     nội dung -> người dùng phải tự dịch. chonMot() cho đặt chữ lên nút.

   CÁCH DÙNG trong handler (handler phải trả về true/false ĐỒNG BỘ cho
   dispatcher, nên không được biến nó thành async) -> bọc trong IIFE async:

     } else if (act === 'xyz'){
       (async function(){
         if (!await xacNhan('Xóa?', '...')) return;
         ...
         renderX();
       })();
     }

   Phải load TRƯỚC các file tab (sotay/vayno/danhmuc/dongtien/mophong).
   ==================================================================== */

/* ---------------- toast ---------------- */
var _toastWrap = null;
function _toastRoot(){
  if (!_toastWrap){
    _toastWrap = document.createElement('div');
    _toastWrap.className = 'toast-wrap';
    _toastWrap.setAttribute('role', 'status');
    _toastWrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(_toastWrap);
  }
  return _toastWrap;
}

// toast(msg)                      -> thông báo thường
// toast(msg, {loai:'err'})        -> đỏ, tự tắt chậm hơn
// toast(msg, {hoanTac: fn})       -> có nút "Hoàn tác"
function toast(msg, opts){
  opts = opts || {};
  var loai = opts.loai || 'ok';
  var giay = opts.giay || (loai === 'err' ? 7 : (opts.hoanTac ? 8 : 4));
  var el = document.createElement('div');
  el.className = 'toast ' + loai;
  var bieuTuong = (loai === 'err' || loai === 'warn') ? icon('alert') : icon('check');
  el.innerHTML = '<span class="toast-ico">'+bieuTuong+'</span><span class="toast-msg">'+esc(msg)+'</span>';
  var hen = null;
  var dong = function(){
    if (hen) clearTimeout(hen);
    el.classList.add('out');
    setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, 200);
  };
  if (opts.hoanTac){
    var b = document.createElement('button');
    b.className = 'toast-undo';
    b.textContent = 'Hoàn tác';
    b.addEventListener('click', function(){ dong(); opts.hoanTac(); });
    el.appendChild(b);
  }
  var x = document.createElement('button');
  x.className = 'toast-x';
  x.setAttribute('aria-label', 'Đóng thông báo');
  x.innerHTML = icon('x');
  x.addEventListener('click', dong);
  el.appendChild(x);
  _toastRoot().appendChild(el);
  hen = setTimeout(dong, giay * 1000);
  return dong;
}

/* ---------------- hộp thoại ----------------
   moHoiThoai trả về Promise. Chỉ cho MỘT hộp thoại tại một thời điểm:
   mở cái thứ hai trong lúc cái đầu chưa trả lời sẽ làm promise đầu treo
   mãi (handler đứng im không rõ lý do) -> chủ động từ chối, trả null. */
var _modalDangMo = false;

function moHoiThoai(cf){
  if (_modalDangMo) return Promise.resolve(null);
  _modalDangMo = true;
  return new Promise(function(resolve){
    var back = document.createElement('div');
    // hộp không có ô nhập (xác nhận, chọn một) hiện dạng bảng trượt từ đáy như các form khác;
    // hộp có ô nhập giữ dạng giữa màn hình để bàn phím điện thoại không che nút
    back.className = 'modal-back' + (cf.oNhap ? '' : ' sheet');
    var box = document.createElement('div');
    box.className = 'modal-box' + (cf.nguyHiem ? ' nguy-hiem' : '');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    var h = cf.oNhap ? '' : '<div class="modal-grab"></div>';
    h += '<div class="modal-title">'+esc(cf.tieuDe||'')+'</div>';
    if (cf.noiDung) h += '<div class="modal-body">'+esc(cf.noiDung).replace(/\n/g,'<br>')+'</div>';
    if (cf.oNhap){
      // kieu:'tien' -> ô text có phân cách nghìn (đọc lại bằng docSo), bàn phím số trên điện thoại
      var laTien = (cf.oNhap.kieu === 'tien');
      h += '<label for="modal_inp">'+esc(cf.oNhap.nhan||'')+'</label>'
         + '<input id="modal_inp" type="'+(laTien ? 'text' : (cf.oNhap.kieu === 'pin' ? 'password' : (cf.oNhap.kieu||'text')))+'"'
         + (laTien ? ' class="money" inputmode="numeric" autocomplete="off"' : '')
         + (cf.oNhap.kieu === 'pin' ? ' inputmode="numeric" autocomplete="off" maxlength="6"' : '')
         + (cf.oNhap.kieu === 'number' ? ' min="0"' : '')
         + ' value="'+esc(cf.oNhap.macDinh == null ? '' : (laTien ? veSo(cf.oNhap.macDinh) : cf.oNhap.macDinh))+'">'
         + '<div class="modal-err" id="modal_err"></div>';
    }
    h += '<div class="modal-btns">';
    (cf.nut || []).forEach(function(n, i){
      h += '<button class="btn '+(n.kieu||'secondary')+' modal-btn" data-i="'+i+'">'+esc(n.chu)+'</button>';
    });
    h += '</div>';
    box.innerHTML = h;
    back.appendChild(box);
    document.body.appendChild(back);

    var inp = box.querySelector('#modal_inp');
    var errEl = box.querySelector('#modal_err');
    var truocDo = document.activeElement;

    function dong(kq){
      document.removeEventListener('keydown', onKey, true);
      _modalDangMo = false;
      if (back.classList && back.classList.contains('sheet')){
        // trượt xuống rồi mới gỡ khỏi DOM; resolve ngay để handler chạy tiếp không phải đợi
        back.classList.add('dong');
        setTimeout(function(){ if (back.parentNode) back.parentNode.removeChild(back); }, 200);
      } else if (back.parentNode) back.parentNode.removeChild(back);
      if (truocDo && truocDo.focus) { try { truocDo.focus(); } catch(e){} }
      resolve(kq);
    }
    function chon(i){
      var n = (cf.nut || [])[i];
      if (!n) return dong(null);
      if (n.huy) return dong(null);
      if (cf.oNhap){
        var raw = inp ? inp.value : '';
        if (cf.kiemTra){
          var loi = cf.kiemTra(raw);
          if (loi){ if (errEl) errEl.textContent = loi; if (inp) inp.focus(); return; }
        }
        return dong({ nut: n.ma, giaTri: raw });
      }
      dong({ nut: n.ma });
    }
    function onKey(ev){
      if (ev.key === 'Escape'){ ev.preventDefault(); dong(null); }
      else if (ev.key === 'Enter' && inp && document.activeElement === inp){
        ev.preventDefault();
        var iOk = (cf.nut||[]).findIndex(function(n){ return !n.huy; });
        if (iOk >= 0) chon(iOk);
      }
    }
    box.querySelectorAll('.modal-btn').forEach(function(b){
      b.addEventListener('click', function(){ chon(parseInt(b.getAttribute('data-i'),10)); });
    });
    // bấm ra ngoài = hủy (không bao giờ là đồng ý, tránh xóa nhầm)
    back.addEventListener('click', function(ev){ if (ev.target === back) dong(null); });
    document.addEventListener('keydown', onKey, true);

    if (inp){ inp.focus(); inp.select(); }
    else {
      var b0 = box.querySelector('.modal-btn');
      if (b0) b0.focus();
    }
  });
}

// xacNhan('Xóa khoản vay?', 'Chi tiết...') -> Promise<bool>
function xacNhan(tieuDe, noiDung, opts){
  opts = opts || {};
  return moHoiThoai({
    tieuDe: tieuDe,
    noiDung: noiDung,
    nguyHiem: !!opts.nguyHiem,
    nut: [
      { ma:'ok',  chu: opts.chuOk || 'Đồng ý', kieu: opts.nguyHiem ? 'danger' : '' },
      { ma:'huy', chu: opts.chuHuy || 'Hủy', kieu:'secondary', huy:true }
    ]
  }).then(function(kq){ return !!(kq && kq.nut === 'ok'); });
}

// hoiSo('Số tiền tất toán', 'Dư nợ còn 5.000.000', 'Số tiền', 5000000) -> Promise<number|null>
function hoiSo(tieuDe, noiDung, nhan, macDinh){
  return moHoiThoai({
    tieuDe: tieuDe,
    noiDung: noiDung,
    oNhap: { kieu:'tien', nhan: nhan || 'Số tiền', macDinh: macDinh },
    kiemTra: function(v){ return numNonNeg(docSo(v)) > 0 ? null : 'Nhập số lớn hơn 0.'; },
    nut: [ { ma:'ok', chu:'Xác nhận' }, { ma:'huy', chu:'Hủy', kieu:'secondary', huy:true } ]
  }).then(function(kq){ return (kq && kq.nut === 'ok') ? numNonNeg(docSo(kq.giaTri)) : null; });
}

// hoiChu('Tên danh mục mới', '', 'Tên') -> Promise<string|null>
function hoiChu(tieuDe, noiDung, nhan, macDinh){
  return moHoiThoai({
    tieuDe: tieuDe,
    noiDung: noiDung,
    oNhap: { kieu:'text', nhan: nhan || 'Nội dung', macDinh: macDinh },
    kiemTra: function(v){ return (v||'').trim() ? null : 'Không được để trống.'; },
    nut: [ { ma:'ok', chu:'Lưu' }, { ma:'huy', chu:'Hủy', kieu:'secondary', huy:true } ]
  }).then(function(kq){ return (kq && kq.nut === 'ok') ? kq.giaTri.trim() : null; });
}

// chonMot('Kỳ 3 trả thiếu', 'Thiếu 500.000 so với lịch', [{ma:'xong',chu:'Đã trả xong kỳ'},...])
// -> Promise<ma|null>. Dùng thay confirm khi hai lựa chọn KHÔNG phải đồng ý/hủy:
// chữ nằm trên nút nên không cần giải thích "OK = ... / Hủy = ..." trong nội dung.
function chonMot(tieuDe, noiDung, cacLuaChon){
  var nut = cacLuaChon.map(function(c, i){
    return { ma: c.ma, chu: c.chu, kieu: i === 0 ? '' : 'secondary' };
  });
  nut.push({ ma:'huy', chu:'Hủy', kieu:'secondary', huy:true });
  return moHoiThoai({ tieuDe: tieuDe, noiDung: noiDung, nut: nut })
    .then(function(kq){ return kq ? kq.nut : null; });
}

/* ====================================================================
   NHẬP TIỀN CÓ DẤU PHÂN CÁCH NGHÌN
   Ô tiền dùng type="text" + class="money" (KHÔNG phải type="number", vì
   number không cho chèn dấu "." và không cho đặt lại con trỏ).

   NGUY HIỂM: sau khi format, inp.value là "1.800.000".
   parseFloat("1.800.000") = 1.8 — KHÔNG lỗi, KHÔNG cảnh báo, số tiền sai
   1 triệu lần. Vì vậy MỌI chỗ đọc giá trị ô .money phải bọc docSo():
       numNonNeg(docSo(inp.value))      ĐÚNG
       numNonNeg(inp.value)             SAI (ra 1.8)
   và mọi chỗ GHI giá trị vào ô .money phải bọc veSo().
   ==================================================================== */

// ô tiền có PHÉP TÍNH hoặc đơn vị viết tắt: "45.000+30.000", "120k", "1,5tr", "2tr-300k", "50k*3".
// Có dấu phép tính nằm SAU một chữ số (dấu - đứng đầu là số âm, không phải phép trừ) hoặc có k/tr.
var _BT_RE = /[0-9]\s*[-+*\/×÷]|[0-9]\s*(k|tr|nghìn|ngàn|triệu)\b/i;
function laBieuThucTien(s){ return _BT_RE.test(String(s == null ? '' : s)); }
// tính biểu thức tiền, KHÔNG dùng eval: tách số (bỏ dấu chấm nghìn, dấu phẩy là thập phân: 1,5tr) + đơn vị + toán tử,
// nhân/chia trước, cộng/trừ sau. Sai cú pháp -> null.
function tinhBieuThucTien(s){
  var str = String(s).toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  var re = /^([-+*\/]?)([0-9][0-9.]*(?:,[0-9]+)?)(k|nghìn|ngàn|tr|triệu)?/;
  var toks = [], dau = true;
  while (str.length){
    var m = re.exec(str);
    if (!m) return null;
    var op = m[1] || (dau ? '+' : null);
    if (!op || (dau && (op === '*' || op === '/'))) return null;
    var n = Number(m[2].replace(/\./g, '').replace(',', '.'));
    if (m[3] === 'k' || m[3] === 'nghìn' || m[3] === 'ngàn') n *= 1000;
    else if (m[3]) n *= 1000000;
    toks.push({ op: op, n: n });
    str = str.slice(m[0].length); dau = false;
  }
  if (!toks.length) return null;
  var cong = [], i;
  for (i = 0; i < toks.length; i++){
    var t = toks[i];
    if (t.op === '*' || t.op === '/'){
      var truoc = cong[cong.length - 1];
      if (t.op === '/' && t.n === 0) return null;
      truoc.n = t.op === '*' ? truoc.n * t.n : truoc.n / t.n;
    } else cong.push({ dau: t.op === '-' ? -1 : 1, n: t.n });
  }
  var kq = 0;
  cong.forEach(function(c){ kq += c.dau * c.n; });
  return Math.round(kq);
}

// "1.800.000" / "-1.800.000" / 1800000 -> số. Bóc hết ký tự không phải chữ số.
// Có phép tính / k / tr thì tính ra số (xem tinhBieuThucTien).
function docSo(v){
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  var s = String(v);
  if (laBieuThucTien(s)){ var bt = tinhBieuThucTien(s); if (bt != null) return bt; }
  var am = /^\s*-/.test(s);
  var d = s.replace(/[^0-9]/g, '');
  if (!d) return 0;
  var n = Number(d);
  return am ? -n : n;
}

// số -> "1.800.000". Rỗng/0 trả về '' để ô nhập còn hiện placeholder.
function veSo(n){
  var x = Math.round(docSo(n));
  return x ? x.toLocaleString('vi-VN') : '';
}

/* Format lại ngay khi gõ, giữ con trỏ: đếm số CHỮ SỐ bên trái con trỏ trước
   khi format, rồi đặt con trỏ lại sau đúng số chữ số đó — nếu chỉ nhớ vị trí
   ký tự thì mỗi lần thêm dấu "." con trỏ sẽ nhảy lùi 1 ô. */
function dinhDangOTien(el){
  var truoc = el.value;
  var caret = el.selectionStart == null ? truoc.length : el.selectionStart;
  var soChuSoTruoc = (truoc.slice(0, caret).match(/[0-9]/g) || []).length;
  var sau;
  if (laBieuThucTien(truoc) || /[-+*\/×÷]\s*$/.test(truoc.replace(/^\s*-/, ''))){
    // đang gõ phép tính: chỉ chấm nghìn từng số, giữ nguyên toán tử / k / tr (tính ra số khi rời ô)
    sau = truoc.replace(/[0-9][0-9.]*/g, function(m){ return Number(m.replace(/\./g, '')).toLocaleString('vi-VN'); });
  } else {
    var am = /^\s*-/.test(truoc);
    var d = truoc.replace(/[^0-9]/g, '').replace(/^0+(?=[0-9])/, '');
    sau = d ? Number(d).toLocaleString('vi-VN') : '';
    if (am) sau = '-' + sau;
  }
  if (sau === truoc) return;
  el.value = sau;
  var i = 0, dem = 0;
  while (i < sau.length && dem < soChuSoTruoc){ if (sau.charCodeAt(i) >= 48 && sau.charCodeAt(i) <= 57) dem++; i++; }
  try { el.setSelectionRange(i, i); } catch(e){}
}

document.addEventListener('input', function(ev){
  var el = ev.target;
  if (el && el.classList && el.classList.contains('money')) dinhDangOTien(el);
});
// rời ô tiền đang có phép tính -> thay bằng kết quả (nơi đọc ô vẫn qua docSo nên bấm Lưu ngay cũng đúng)
document.addEventListener('focusout', function(ev){
  var el = ev.target;
  if (!el || !el.classList || !el.classList.contains('money') || !laBieuThucTien(el.value)) return;
  var kq = tinhBieuThucTien(el.value);
  if (kq == null) return;
  el.value = veSo(kq);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
// phím nhanh dưới ô tiền (000, +, −): pointerdown + preventDefault để ô KHÔNG mất focus -> bàn phím điện thoại không sập
document.addEventListener('pointerdown', function(ev){
  var b = ev.target.closest && ev.target.closest('[data-chen]');
  if (!b) return;
  ev.preventDefault();
  var el = document.getElementById(b.getAttribute('data-for'));
  if (!el) return;
  var v = el.value, a = el.selectionStart == null ? v.length : el.selectionStart, z = el.selectionEnd == null ? v.length : el.selectionEnd;
  var chen = b.getAttribute('data-chen');
  el.value = v.slice(0, a) + chen + v.slice(z);
  try { el.setSelectionRange(a + chen.length, a + chen.length); } catch(e){}
  if (document.activeElement !== el) el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

/* ---------------- chế độ tối ----------------
   Lưu ở localStorage (riêng từng máy, không đi vào data/Drive — đây là
   thiết lập của thiết bị, không phải dữ liệu chi tiêu). */
var THEME_KEY = 'chitieu_theme';

function themeHienTai(){
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch(e){ return 'auto'; }
}
function themeThucTe(t){
  if (t === 'auto'){
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return t;
}
function apDungTheme(){
  var t = themeHienTai();
  var thuc = themeThucTe(t);
  document.documentElement.setAttribute('data-theme', thuc);
  var btn = document.getElementById('btnTheme');
  if (btn){
    btn.innerHTML = icon(t === 'auto' ? 'contrast' : (t === 'dark' ? 'moon' : 'sun'));
    btn.setAttribute('aria-label', 'Giao diện: ' + (t==='auto'?'theo hệ thống':(t==='dark'?'tối':'sáng')) + ' — bấm để đổi');
    btn.title = btn.getAttribute('aria-label');
  }
}
function doiTheme(){
  var vong = ['auto','light','dark'];
  var i = vong.indexOf(themeHienTai());
  var moi = vong[(i + 1) % vong.length];
  try { localStorage.setItem(THEME_KEY, moi); } catch(e){}
  apDungTheme();
  if (state.data) renderAll();     // vẽ lại biểu đồ với màu mới
}
apDungTheme();
if (window.matchMedia){
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var onMq = function(){ if (themeHienTai() === 'auto'){ apDungTheme(); if (state.data) renderAll(); } };
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);
}

/* ====================================================================
   MỌI LỚP position:fixed PHẢI BÁM THEO PHẦN NHÌN THẤY (điện thoại)
   position:fixed neo theo khung LAYOUT. Trên iOS (nhất là khi vuốt lên / app mở từ màn hình chính) đôi khi khung layout
   ngắn hơn hoặc lệch so với phần NHÌN THẤY (visualViewport): thanh tab lơ lửng giữa màn hình, màn hình khóa PIN / đăng nhập chỉ phủ
   một phần phía trên. Nên đo visualViewport và đặt biến CSS trên <html>:
     --vv-top, --vv-h : vị trí / chiều cao phần nhìn thấy -> lớp phủ toàn màn hình (.gate, .modal-back, nền) dùng thay cho inset:0;
                        thanh tab và thanh Ghi nhanh đặt theo ĐÁY phần nhìn thấy (top = vv-top + vv-h, rồi translateY(-100%))
   Bình thường các biến bằng khung layout nên không đổi gì. Bàn phím mở (phần nhìn thấy thấp hơn khung layout >150px) thì gắn
   data-kb trên <html>: thanh tab / Ghi nhanh ẩn, còn lớp phủ co lại phía trên bàn phím.
   KHÔNG dịch thanh tab bằng số đo vị trí (bản cũ --vv-dy): lúc iOS nảy ở đáy trang số đo sai làm thanh trượt khỏi màn hình.
   ==================================================================== */
function coBanPhim(innerH, vvH){ return innerH - vvH > 150; }
function canKhungNhin(){
  var vv = window.visualViewport, root = document.documentElement;
  if (!vv || !root || !root.style) return;
  root.style.setProperty('--vv-top', Math.round(vv.offsetTop) + 'px');
  root.style.setProperty('--vv-h', Math.round(vv.height) + 'px');
  if (coBanPhim(window.innerHeight, vv.height)) root.setAttribute('data-kb', '1'); else root.removeAttribute('data-kb');
}
if (typeof window !== 'undefined' && window.document && window.visualViewport){
  (function(){
    var cho = 0;
    var lich = function(){ if (cho) return; cho = requestAnimationFrame(function(){ cho = 0; canKhungNhin(); }); };
    window.visualViewport.addEventListener('resize', lich);
    window.visualViewport.addEventListener('scroll', lich);
    window.addEventListener('resize', lich);
    window.addEventListener('scroll', lich, { passive: true });
    window.addEventListener('touchmove', lich, { passive: true });
    window.addEventListener('touchend', lich, { passive: true });
    window.addEventListener('orientationchange', lich);
    window.addEventListener('pageshow', lich);
    document.addEventListener('visibilitychange', lich);
    lich();
  })();
}
