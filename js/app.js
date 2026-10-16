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
  else if (state.offline){
    // dùng dữ liệu trên máy: dữ liệu đã nằm an toàn trong máy, chỉ còn chuyện đã lên Drive chưa
    var lc = state.lanDongBoCuoi ? new Date(state.lanDongBoCuoi) : null;
    el.textContent = state.dirty ? 'Đã lưu trên máy · chưa đồng bộ Drive'
      : (lc ? 'Đã lưu trên máy · đồng bộ Drive lần cuối ' + pad2(lc.getDate()) + '/' + pad2(lc.getMonth() + 1) : 'Đã lưu trên máy');
    el.classList.add('ok');
  }
  else if (state.dirty){ el.textContent = 'Có thay đổi chưa lưu…'; }
  else if (state.errorMsg){ el.textContent = state.errorMsg; el.classList.add('err'); }
  else if (state.lastSync){
    el.textContent = 'Đã đồng bộ lúc ' + pad2(state.lastSync.getHours())+':'+pad2(state.lastSync.getMinutes());
    el.classList.add('ok');
  } else {
    el.textContent = '';
  }
  // dùng dữ liệu trên máy: chạm vào dòng trạng thái để đồng bộ Drive (không phải chờ banner nhắc)
  if (state.offline){ el.setAttribute('data-act', 'dangNhapLai'); el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.title = 'Chạm để đồng bộ Google Drive'; }
  else { el.removeAttribute('data-act'); el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('title'); }
  var banner = document.getElementById('bannerZone');
  if (banner){
    // bản mới luôn hiện đầu tiên, độc lập với các cảnh báo khác
    var bMoi = state.coBanMoi
      ? '<div class="banner banner-moi">'+icon('refresh')+' Có bản mới của app. <button class="btn sm" data-act="capNhatApp" style="margin-left:6px">Cập nhật</button></div>' : '';
    if (state.offline){
      // nhắc nhẹ khi lâu chưa đồng bộ (mở app bình thường không bị làm phiền)
      var soNgay = soNgayChuaDongBo(Date.now(), state.lanDongBoCuoi, state.data && state.data.settings && state.data.settings.ngayBatDau);
      banner.innerHTML = bMoi + (soNgay >= 3 ? '<div class="banner">'+icon('alert')+' Đã '+soNgay+' ngày chưa đồng bộ Google Drive, dữ liệu mới chỉ nằm trên máy này. '
        + '<button class="btn sm" data-act="dangNhapLai" style="margin-left:6px">Đồng bộ</button></div>' : '')
        + (state.errorMsg ? '<div class="banner">' + icon('alert') + ' ' + state.errorMsg + '</div>' : '');
    } else {
      banner.innerHTML = bMoi + (state.errorMsg ? '<div class="banner">' + icon('alert') + ' ' + state.errorMsg + '</div>' : '');
    }
  }
}

function renderAll(){
  dinhKyDongBoHanMuc();                // sang tháng mới thì hạn mức đổi theo kỳ mới của kế hoạch
  renderSyncStatus();
  var tcBusy = document.getElementById('tabContent');
  if (tcBusy) tcBusy.removeAttribute('aria-busy');
  if (state.tab === 'sotay') renderSoTay();
  else if (state.tab === 'dongtien'){ if (state.dtMoPhong) renderMoPhong(); else if (state.dtTheoNgay) renderTheoNgay(); else renderDongTien(); }
  else if (state.tab === 'baocao') renderBaoCao();
  else if (state.tab === 'vayno') renderVayNo();
  else if (state.tab === 'congcu') renderCongCu();
  else renderDanhMuc();
  qaSheetVe();                       // rời tab Sổ tay thì bảng ghi khoản tự đóng
  mpSheetVe();                       // rời Mô phỏng thì bảng thêm điều chỉnh tự đóng
  vnSheetVe();                       // rời Vay - Nợ thì form thêm/sửa khoản vay tự đóng
  ccSheetVe();                       // rời Công cụ thì bảng "Mua rồi" tự đóng
  dmSheetVe();                       // rời Cài đặt thì bảng sửa danh mục/ví/định kỳ/mục tiêu tự đóng
  cbCapNhatNut();                    // số đỏ trên chuông thông báo
  updateStickyOffsets();
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
    // chiều cao thanh tab ở ĐÁY (0 khi nằm trên đỉnh): thanh "Ghi nhanh" nổi đặt ngay phía trên nó
    document.documentElement.style.setProperty('--navduoi-h', navDuoi ? tabs.offsetHeight + 'px' : '0px');
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
    cbCapNhatNut();                // ghi giao dịch / hoàn thành / thanh toán: số đỏ trên chuông theo kịp
    return;
  }
  var tabBtn = ev.target.closest('.tab');
  if (tabBtn) chuyenTab(tabBtn.getAttribute('data-tab'));
});

// chuyển tab: dùng chung cho click vào thanh tab và phím tắt 1-5
// Đổi tab: nội dung mờ dần vào (motionChuyenTab ở motion.js)
var THU_TU_TAB = ['sotay', 'dongtien', 'baocao', 'vayno', 'congcu', 'danhmuc'];
function chuyenTab(tab){
  var cu = state.tab;
  var lam = function(){
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    renderAll();
  };
  if (cu !== tab && typeof motionChuyenTab === 'function') motionChuyenTab(THU_TU_TAB.indexOf(tab) > THU_TU_TAB.indexOf(cu) ? 1 : -1, lam);
  else lam();
}

/* ---------------- phím tắt (desktop) ----------------
   Không bắt phím khi: đang gõ trong ô nhập/chọn (isTypingNow), đang mở hộp thoại,
   giữ Ctrl/Alt/Cmd (để không cướp phím tắt của trình duyệt), chưa đăng nhập. */
var PHIM_TAT_TAB = { '1':'sotay', '2':'dongtien', '3':'baocao', '4':'vayno', '5':'congcu', '6':'danhmuc' };
function hienPhimTat(){
  moHoiThoai({
    tieuDe: 'Phím tắt',
    noiDung: 'N — thêm giao dịch (nhảy tới form ở Sổ tay)\n'
      + '/ — tìm kiếm (mọi thứ)\n'
      + '1 · 2 · 3 · 4 · 5 · 6 — Sổ tay · Dòng tiền · Báo cáo · Vay-Nợ · Công cụ · Cài đặt\n'
      + '? — mở bảng này\n'
      + 'Esc — đóng hộp thoại\n\n'
      + 'Phím tắt không hoạt động khi đang gõ trong một ô nhập.',
    nut: [ { ma:'ok', chu:'Đóng' } ]
  });
}
document.addEventListener('keydown', function(ev){
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing || ev.defaultPrevented) return;
  if (_modalDangMo || _khoaDangMo || isTypingNow()) return;
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
    handleAction('timBat', null);      // tìm kiếm toàn cục (kính lúp ở header); tìm riêng trong Sổ tay vẫn có ở nút kính lúp của danh sách ngày
  } else if (k === '?'){
    ev.preventDefault();
    hienPhimTat();
  }
});
var btnPT = document.getElementById('btnPhimTat');
if (btnPT) btnPT.addEventListener('click', hienPhimTat);

// Enter ở ô số tiền / ghi chú của thẻ Ghi nhanh = bấm Ghi
document.addEventListener('keydown', function(ev){
  if (ev.key !== 'Enter' || ev.isComposing || !ev.target || !ev.target.id) return;
  if (ev.target.id === 'qa_amount' || ev.target.id === 'qa_note'){
    ev.preventDefault();
    handleAction('qaSave', null);
  }
});

// Esc đóng bảng ghi khoản (kể cả khi đang gõ trong ô nhập)
document.addEventListener('keydown', function(ev){
  if (ev.key === 'Escape' && state.qa && state.qa.open && !_modalDangMo){ ev.preventDefault(); qaDongSheet(); }
});
document.addEventListener('keydown', function(ev){
  if (ev.key === 'Escape' && state.mp && state.mp.formOpen && !_modalDangMo){ ev.preventDefault(); handleAction('mpCancelDc', null); }
});
document.addEventListener('keydown', function(ev){
  if (ev.key === 'Escape' && (state.dmForm || state.dkForm || state.mtForm) && !_modalDangMo){ ev.preventDefault(); handleAction('dmHuy', null); }
});
document.addEventListener('keydown', function(ev){
  if (ev.key === 'Escape' && state.vnFormKind && !_modalDangMo){ ev.preventDefault(); handleAction('vnCancelForm', null); }
});
// khoản / tiêu đề ngày trong Sổ tay là <div role="button"> (để vuốt ngang được): Enter hoặc Space = bấm
document.addEventListener('keydown', function(ev){
  if ((ev.key !== 'Enter' && ev.key !== ' ') || ev.isComposing || !ev.target || !ev.target.matches) return;
  if (ev.target.matches('div[role=button][data-act]')){ ev.preventDefault(); ev.target.click(); }
});

// xoay ngang / đổi cỡ cửa sổ qua mốc 700px: Dòng tiền đổi giữa "bảng cả năm" và "1 tháng" nên phải vẽ lại
(function(){
  var mq = window.matchMedia && window.matchMedia('(max-width:700px)');
  var khi = function(){ if (state.data && state.tab === 'dongtien' && !state.dtMoPhong && !state.dtTheoNgay) renderDongTien(); };
  if (mq && mq.addEventListener) mq.addEventListener('change', khi);
})();

document.getElementById('btnSignIn').addEventListener('click', signIn);
document.getElementById('btnOffline').addEventListener('click', batDauTrenMay);
document.getElementById('btnAnSo').addEventListener('click', doiAnSo);

// làm mới dữ liệu từ Drive: nút ở Cài đặt → Ứng dụng ("lamMoi") và kéo xuống ở đầu trang (motion.js)
async function lamMoiDuLieu(){
  if (state.offline){ dongBoNgay(); return; }   // chưa kết nối Drive: làm mới = đồng bộ
  state.errorMsg = null;
  var tuLoi = state.taiLoi;                   // lần trước tải lỗi: các sửa trong lúc đó chỉ nằm ở nháp trên máy
  var ok = await driveLoad();
  renderAll();
  if (tuLoi && ok){ await checkLocalDraft(); renderAll(); }
}

document.addEventListener('input', function(ev){ handleMoPhongInput(ev.target); handleVayNoInput(ev.target); handleNguoiInput(ev.target); handleDanhMucInput(ev.target); handleNgayTuDoInput(ev.target); handleCongCuInput(ev.target); handleTimInput(ev.target); });

document.addEventListener('change', function(ev){
  var el = ev.target;
  if (handleSoTayChange(el)) return;
  if (handleNhapChange(el)) return;
  if (handleVayNoChange(el)) return;
  if (handleDanhMucChange(el)) return;
  if (handleDongTienChange(el)) return;
  if (handleMoPhongChange(el)) return;
});

// dispatcher: thử lần lượt handler của từng tab, dừng ở handler đầu tiên xử lý được (trả về true)
function handleAction(act, el){
  if (act === 'dangNhapLai'){ dongBoNgay(); return; }
  if (act === 'capNhatApp'){ capNhatApp(); return; }
  if (handleSoTayAction(act, el)) return;
  if (handleNhapAction(act, el)) return;
  if (handleNhanAction(act, el)) return;
  if (handleChuongAction(act, el)) return;
  if (handleHienThiAction(act, el)) return;
  if (handleLichAction(act, el)) return;
  if (handleNguoiAction(act, el)) return;
  if (handleDongTienAction(act, el)) return;
  if (handleTheoNgayAction(act, el)) return;
  if (handleVayNoAction(act, el)) return;
  if (handleTimAction(act, el)) return;
  if (handleCongCuAction(act, el)) return;
  if (handleDoiSoatAction(act, el)) return;
  if (handleNganSachAction(act, el)) return;
  if (handleTetAction(act, el)) return;
  if (handleTheAction(act, el)) return;
  if (handleDanhMucAction(act, el)) return;
  if (handleMoPhongAction(act, el)) return;
}

/* ---------------- cập nhật bản mới ----------------
   Trên iPhone, thoát app rồi quay lại chỉ TIẾP TỤC trang đang chạy dở (code cũ trong bộ nhớ),
   không tải lại — nên merge bản mới lên git mà không báo gì thì phải tự tắt hẳn app mới thấy.
   Cách làm: số ?v= trong index.html là dấu vân tay của bản code (tools/bump.js băm từ nội dung file).
   Định kỳ + mỗi lần quay lại app, tải index.html (bỏ qua cache) đọc ?v= trên mạng; khác bản đang
   chạy thì hiện banner "Có bản mới". Chỉ báo khi index.html ĐỔI: sửa file mà quên chạy bump thì không báo. */
var APP_VER = (function(){
  var s = document.querySelector('script[src*="js/app.js"]');
  var m = s ? /[?&]v=([^&"']+)/.exec(s.getAttribute('src') || '') : null;
  return m ? m[1] : null;
})();
var _lanKiemTraMoi = 0;
async function kiemTraBanMoi(){
  if (!APP_VER || state.coBanMoi || !/^https?:$/.test(location.protocol)) return;
  var now = Date.now();
  if (now - _lanKiemTraMoi < 60000) return;      // tối đa 1 lần/phút dù bị gọi từ nhiều sự kiện
  _lanKiemTraMoi = now;
  try{
    var res = await fetch('index.html?_=' + now, { cache: 'no-store' });
    if (!res.ok) return;
    var m = /js\/app\.js\?v=([^"'&]+)/.exec(await res.text());
    if (m && m[1] !== APP_VER){ state.coBanMoi = true; renderSyncStatus(); }
  }catch(e){ /* mất mạng: bỏ qua, lần sau kiểm tra lại */ }
}
// nút "Kiểm tra bản mới" ở Cài đặt → Ứng dụng: như kiemTraBanMoi nhưng chạy ngay (không chờ 1 phút) và báo kết quả cho người bấm
async function kiemTraBanMoiTay(){
  if (!APP_VER || !/^https?:$/.test(location.protocol)){ toast('Chế độ này không kiểm tra được bản mới.', { loai:'warn' }); return; }
  try{
    var res = await fetch('index.html?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    var m = /js\/app\.js\?v=([^"'&]+)/.exec(await res.text());
    if (m && m[1] !== APP_VER){ state.coBanMoi = true; renderSyncStatus(); toast('Có bản mới. Bấm "Cập nhật ngay".'); }
    else toast('Đang dùng bản mới nhất.');
  }catch(e){ toast('Không kiểm tra được (mất mạng?). Thử lại sau.', { loai:'warn' }); }
  if (state.tab === 'danhmuc') renderDanhMuc();
}
function capNhatApp(){
  // đang lưu dở thì tải lại là bỏ dở lần lưu (nháp vẫn giữ nhưng cứ đợi xong cho chắc)
  if (state.dirty || state.saving){ toast('Đang lưu dữ liệu — đợi vài giây rồi bấm Cập nhật lại.', { loai:'warn' }); return; }
  location.reload();
}
document.addEventListener('visibilitychange', function(){ if (!document.hidden) kiemTraBanMoi(); });
window.addEventListener('focus', kiemTraBanMoi);
setInterval(kiemTraBanMoi, 10 * 60 * 1000);
setTimeout(kiemTraBanMoi, 4000);

/* ---------------- init ---------------- */
showGate('');
var _ihd = document.getElementById('iosHintDong');
if (_ihd) _ihd.addEventListener('click', function(){
  try{ localStorage.setItem('chitieu_ios_hint', '1'); }catch(e){}
  document.getElementById('iosHint').style.display = 'none';
});
if (document.documentElement.hasAttribute('data-ghi')){
  // trang Ghi nhanh (ghi.html): phiên tạm. Hiện lại sau khi đã ghi xong thì tải mới hoàn toàn từ dữ liệu chung, không giữ gì cũ.
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && !state.qa.open && document.body.classList.contains('ghi-san')) location.reload(); });
  var _qaSheetVeGoc = qaSheetVe;
  qaSheetVe = function(){
    _qaSheetVeGoc();
    var x = document.getElementById('ghiXongTxt');
    if (x) x.textContent = state.qa.last ? state.qa.last.text : 'Chưa ghi khoản nào.';
  };
  khoiDongGhiNhanh();
} else {
  khoiDong();     // có dữ liệu trên máy thì vào thẳng, không màn đăng nhập (xem drive-sync.js)
}

// service worker (cần HTTPS hoặc localhost; mở bằng file:// thì bỏ qua) — xem sw.js
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(e){ console.error('[chitieu] Không đăng ký được service worker:', e); });
  });
}
