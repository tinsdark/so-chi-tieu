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
  var icon = loai === 'err' ? '⚠' : (loai === 'warn' ? '!' : '✓');
  el.innerHTML = '<span class="toast-ico">'+icon+'</span><span class="toast-msg">'+esc(msg)+'</span>';
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
  x.textContent = '✕';
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
    back.className = 'modal-back';
    var box = document.createElement('div');
    box.className = 'modal-box' + (cf.nguyHiem ? ' nguy-hiem' : '');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    var h = '<div class="modal-title">'+esc(cf.tieuDe||'')+'</div>';
    if (cf.noiDung) h += '<div class="modal-body">'+esc(cf.noiDung).replace(/\n/g,'<br>')+'</div>';
    if (cf.oNhap){
      // kieu:'tien' -> ô text có phân cách nghìn (đọc lại bằng docSo), bàn phím số trên điện thoại
      var laTien = (cf.oNhap.kieu === 'tien');
      h += '<label for="modal_inp">'+esc(cf.oNhap.nhan||'')+'</label>'
         + '<input id="modal_inp" type="'+(laTien ? 'text' : (cf.oNhap.kieu||'text'))+'"'
         + (laTien ? ' class="money" inputmode="numeric" autocomplete="off"' : '')
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
      if (back.parentNode) back.parentNode.removeChild(back);
      _modalDangMo = false;
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

// "1.800.000" / "-1.800.000" / 1800000 -> số. Bóc hết ký tự không phải chữ số.
function docSo(v){
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  var s = String(v);
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
  var am = /^\s*-/.test(truoc);
  var d = truoc.replace(/[^0-9]/g, '').replace(/^0+(?=[0-9])/, '');
  var sau = d ? Number(d).toLocaleString('vi-VN') : '';
  if (am) sau = '-' + sau;
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
    btn.textContent = (t === 'auto') ? '◐' : (t === 'dark' ? '☾' : '☀');
    btn.setAttribute('aria-label', 'Giao diện: ' + (t==='auto'?'theo hệ thống':(t==='dark'?'tối':'sáng')) + ' — bấm để đổi');
    btn.title = btn.getAttribute('aria-label');
  }
  // Chart.js đọc màu chữ/lưới MỘT LẦN lúc vẽ -> phải set trước khi render lại
  if (window.Chart){
    Chart.defaults.color = thuc === 'dark' ? '#c9b49c' : '#6b5a3e';       // = --muted của từng theme
    Chart.defaults.borderColor = thuc === 'dark' ? '#54402e' : '#e6d3a0';   // = --border của từng theme
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
