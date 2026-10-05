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
    banner.innerHTML = state.errorMsg ? '<div class="banner">⚠ ' + state.errorMsg + '</div>' : '';
  }
}

function renderAll(){
  renderSyncStatus();
  if (state.tab === 'sotay') renderSoTay();
  else if (state.tab === 'dongtien') renderDongTien();
  else if (state.tab === 'vayno') renderVayNo();
  else renderDanhMuc();
  renderVayNoBadge();
  updateStickyOffsets();
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
  if (tabs) document.documentElement.style.setProperty('--tabs-h', tabs.offsetHeight + 'px');
}
window.addEventListener('resize', updateStickyOffsets);

/* ---------------- events ---------------- */
document.addEventListener('click', function(ev){
  var t = ev.target.closest('[data-act]');
  if (t){
    var act = t.getAttribute('data-act');
    handleAction(act, t, ev);
    return;
  }
  var tabBtn = ev.target.closest('.tab');
  if (tabBtn){
    state.tab = tabBtn.getAttribute('data-tab');
    document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('active', b===tabBtn); });
    renderAll();
  }
});

document.getElementById('btnSignIn').addEventListener('click', signIn);
document.getElementById('btnSignOut').addEventListener('click', signOut);

document.getElementById('btnRefresh').addEventListener('click', async function(){
  state.errorMsg = null;
  await driveLoad();
  renderAll();
});

document.addEventListener('change', function(ev){
  var el = ev.target;
  if (handleSoTayChange(el)) return;
  if (handleVayNoChange(el)) return;
  if (handleDanhMucChange(el)) return;
});

// dispatcher: thử lần lượt handler của từng tab, dừng ở handler đầu tiên xử lý được (trả về true)
function handleAction(act, el){
  if (handleSoTayAction(act, el)) return;
  if (handleDongTienAction(act, el)) return;
  if (handleVayNoAction(act, el)) return;
  if (handleDanhMucAction(act, el)) return;
}

/* ---------------- init ---------------- */
showGate('');
