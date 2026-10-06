"use strict";
/* ====================================================================
   app.js — điểm khởi động chung: render tổng (renderAll), trạng thái
   đồng bộ, đăng ký sự kiện click/change, dispatcher handleAction gọi tới
   handler của từng tab, và lệnh khởi động cuối cùng.
   PHẢI load SAU CÙNG (sau state.js, drive-sync.js, vayno.js, sotay.js,
   danhmuc.js, dongtien.js) vì cần mọi hàm/biến ở các file trên đã tồn tại.
   ==================================================================== */

function renderSyncStatus(){
  var el = document.getElementById('syncStatus');
  if (!el) return;
  el.classList.remove('err','ok');
  if (state.saving){ el.textContent = 'Đang lưu…'; }
  else if (state.dirty){ el.textContent = 'Có thay đổi chưa lưu…'; }
  else if (state.errorMsg){ el.textContent = state.errorMsg; el.classList.add('err'); }
  else if (state.lastSync){
    el.textContent = 'Đã đồng bộ lúc ' + pad2(state.lastSync.getHours())+':'+pad2(state.lastSync.getMinutes());
    el.classList.add('ok');
  } else {
    el.textContent = '';
  }
  var banner = document.getElementById('bannerZone');
  if (banner){
    if (state.offline){
      var tu = state.offlineTu ? new Date(state.offlineTu) : null;
      banner.innerHTML = '<div class="banner">⚠ Đang ngoại tuyến'
        + (tu ? ' — dữ liệu trên máy lúc ' + pad2(tu.getHours()) + ':' + pad2(tu.getMinutes()) + ' ' + tu.toLocaleDateString('vi-VN') : '')
        + '. Thay đổi chỉ lưu trên máy, chưa lên Drive. '
        + '<button class="btn sm" data-act="dangNhapLai" style="margin-left:6px">Đăng nhập để đồng bộ</button></div>';
    } else {
      banner.innerHTML = state.errorMsg ? '<div class="banner">⚠ ' + state.errorMsg + '</div>' : '';
    }
  }
}

function renderAll(){
  renderSyncStatus();
  if (state.tab === 'sotay') renderSoTay();
  else if (state.tab === 'dongtien') renderDongTien();
  else if (state.tab === 'vayno') renderVayNo();
  else if (state.tab === 'mophong') renderMoPhong();
  else renderDanhMuc();
  renderVayNoBadge();
  updateStickyOffsets();
  // FAB chỉ có nghĩa ở Sổ tay (nơi có form nhập); tab khác hiện ra là nút chết
  var fab = document.getElementById('fabAdd');
  if (fab) fab.classList.toggle('fab-hien', state.tab === 'sotay');
}

// badge số trên tab nav "Vay - Nợ": đếm khoản sắp/đã tới hạn, thấy được dù đang ở tab khác
function renderVayNoBadge(){
  var el = document.getElementById('vnBadge');
  if (!el) return;
  var n = (state.data && state.data.vayNo) ? vnBadgeCount(7) : 0;
  if (n > 0){ el.textContent = n; el.style.display = 'inline-block'; }
  else { el.style.display = 'none'; }
}

function updateStickyOffsets(){
  var header = document.querySelector('header');
  var tabs = document.querySelector('.tabs');
  if (header) document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  // Ở <=700px CSS cho .tabs position:fixed xuống đáy -> nav KHÔNG còn chiếm chỗ
  // ở đỉnh. .month-nav/.year-nav dán ở top: header-h + tabs-h, nên nếu vẫn đo
  // offsetHeight thì có một dải trống đúng bằng chiều cao nav. Đọc computed
  // position thay vì tự đoán breakpoint để CSS đổi là JS theo luôn.
  if (tabs){
    var navDuoi = getComputedStyle(tabs).position === 'fixed';
    document.documentElement.style.setProperty('--tabs-h', navDuoi ? '0px' : tabs.offsetHeight + 'px');
  }
}
window.addEventListener('resize', updateStickyOffsets);
// Chiều cao header/thanh tab đổi SAU lần vẽ (chữ "Đã đồng bộ lúc..." hiện ra, xuống dòng, đổi cỡ chữ): nếu chỉ
// đo trong renderAll thì --header-h cũ làm các thanh dán dưới nó (chọn tháng, chọn năm) lệch chỗ / bị che.
if (window.ResizeObserver){
  var _ro = new ResizeObserver(updateStickyOffsets);
  ['header', '.tabs'].forEach(function(sel){ var el = document.querySelector(sel); if (el) _ro.observe(el); });
}

/* ---------------- events ---------------- */
document.addEventListener('click', function(ev){
  var t = ev.target.closest('[data-act]');
  if (t){
    var act = t.getAttribute('data-act');
    // <a href="#"> mà không chặn mặc định thì trình duyệt nhảy về "#" = kéo lên đầu trang
    if (t.tagName === 'A') ev.preventDefault();
    handleAction(act, t, ev);
    return;
  }
  var tabBtn = ev.target.closest('.tab');
  if (tabBtn) chuyenTab(tabBtn.getAttribute('data-tab'));
});

// chuyển tab: dùng chung cho click vào thanh tab và phím tắt 1-5
function chuyenTab(tab){
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
  renderAll();
}

/* ---------------- phím tắt (desktop) ----------------
   Không bắt phím khi: đang gõ trong ô nhập/chọn (isTypingNow), đang mở hộp thoại,
   giữ Ctrl/Alt/Cmd (để không cướp phím tắt của trình duyệt), chưa đăng nhập. */
var PHIM_TAT_TAB = { '1':'sotay', '2':'dongtien', '3':'vayno', '4':'mophong', '5':'danhmuc' };
function hienPhimTat(){
  moHoiThoai({
    tieuDe: 'Phím tắt',
    noiDung: 'N — thêm giao dịch (nhảy tới form ở Sổ tay)\n'
      + '/ — tìm trong Sổ tay\n'
      + '1 · 2 · 3 · 4 · 5 — Sổ tay · Dòng tiền · Vay-Nợ · Mô phỏng · Danh mục\n'
      + '? — mở bảng này\n'
      + 'Esc — đóng hộp thoại\n\n'
      + 'Phím tắt không hoạt động khi đang gõ trong một ô nhập.',
    nut: [ { ma:'ok', chu:'Đóng' } ]
  });
}
document.addEventListener('keydown', function(ev){
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing || ev.defaultPrevented) return;
  if (_modalDangMo || isTypingNow()) return;
  var appEl = document.getElementById('app');
  if (!appEl || appEl.style.display === 'none' || !state.data) return;
  var k = ev.key;
  if (PHIM_TAT_TAB[k]){
    ev.preventDefault();
    chuyenTab(PHIM_TAT_TAB[k]);
    window.scrollTo(0, 0);
  } else if (k === 'n' || k === 'N'){
    ev.preventDefault();
    handleAction('fabAdd', null);
  } else if (k === '/'){
    ev.preventDefault();
    if (state.tab !== 'sotay') chuyenTab('sotay');
    var oTim = document.querySelector('[data-act=soTaySearchInput]');
    if (oTim){ oTim.scrollIntoView({ behavior:'smooth', block:'center' }); oTim.focus(); }
  } else if (k === '?'){
    ev.preventDefault();
    hienPhimTat();
  }
});
var btnPT = document.getElementById('btnPhimTat');
if (btnPT) btnPT.addEventListener('click', hienPhimTat);

document.getElementById('btnSignIn').addEventListener('click', signIn);
document.getElementById('btnOffline').addEventListener('click', moNgoaiTuyen);
document.getElementById('btnSignOut').addEventListener('click', signOut);
document.getElementById('btnTheme').addEventListener('click', doiTheme);

document.getElementById('btnRefresh').addEventListener('click', async function(){
  if (state.offline){ signIn(); return; }     // chưa có token Drive: làm mới = đăng nhập lại
  state.errorMsg = null;
  await driveLoad();
  renderAll();
});

document.addEventListener('change', function(ev){
  var el = ev.target;
  if (handleSoTayChange(el)) return;
  if (handleNhapChange(el)) return;
  if (handleVayNoChange(el)) return;
  if (handleDanhMucChange(el)) return;
  if (handleMoPhongChange(el)) return;
});

// dispatcher: thử lần lượt handler của từng tab, dừng ở handler đầu tiên xử lý được (trả về true)
function handleAction(act, el){
  if (act === 'dangNhapLai'){ signIn(); return; }
  if (handleSoTayAction(act, el)) return;
  if (handleNhapAction(act, el)) return;
  if (handleDongTienAction(act, el)) return;
  if (handleVayNoAction(act, el)) return;
  if (handleDanhMucAction(act, el)) return;
  if (handleMoPhongAction(act, el)) return;
}

/* ---------------- init ---------------- */
showGate('');

// service worker (cần HTTPS hoặc localhost; mở bằng file:// thì bỏ qua) — xem sw.js
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(e){ console.error('[chitieu] Không đăng ký được service worker:', e); });
  });
}
