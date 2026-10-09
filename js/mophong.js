"use strict";
/* ====================================================================
   mophong.js — tab "Mô phỏng": vùng nháp để thử số liệu.

   NGUYÊN TẮC SỐ 1: KHÔNG BAO GIỜ chạm vào dữ liệu thật.
   - Toàn bộ bản nháp nằm trong state.mp, CHỈ trong RAM. Nó không có trong
     state.data nên normalizeData/driveSave không hề biết nó tồn tại ->
     không có đường nào ghi được lên Drive.
   - Thoát trang / F5 / đăng xuất / bấm "Làm mới" là mất sạch nháp (cố ý).
   - Muốn có số liệu để thử thì bấm "Nạp dữ liệu gốc" — nó CLONE (deep copy)
     dữ liệu thật sang nháp. Sửa nháp sau đó không vọng lại bản gốc.

   Cần state.js (withData, balanceBeforeMonth...), vayno.js (tongThuThangCard,
   tongChiThangCard, monthKeyAdd, soTienConLaiPhaiTra, tinhLichTraNo) load trước.
   ==================================================================== */


var MP_LOAI_LABEL = {
  motLan: 'Khoản 1 lần',
  dinhKy: 'Khoản hàng tháng',
  vayMoi: 'Vay thêm',
  traSom: 'Tất toán sớm'
};

function mpClone(o){ return JSON.parse(JSON.stringify(o)); }

function mpDaNap(){ return !!(state.mp && state.mp.data); }
// nháp đã có điều chỉnh người dùng tự thêm: tải lại từ Drive (poll ngầm) sẽ làm mất -> poll phải nhường.
// Nháp vừa tự nạp mà chưa sửa gì thì cứ để poll chạy, lần vẽ sau tự nạp lại bản mới.
function mpCoThayDoi(){ return mpDaNap() && (state.mp.dieuChinh || []).length > 0; }

// CLONE dữ liệu thật sang nháp. Dùng JSON deep copy nên không còn chung
// tham chiếu object nào với state.data -> sửa nháp không vọng về bản gốc.
function mpNapGoc(){
  state.mp.data = mpClone(state.data);
  state.mp.napLuc = new Date();
  state.mp.formOpen = false;
  state.mp.editIdx = -1;
}

function mpXoaNhap(){
  state.mp.data = null;
  state.mp.napLuc = null;
  state.mp.dieuChinh = [];
  state.mp.formOpen = false;
  state.mp.editIdx = -1;
}

/* ---- tổng điều chỉnh overlay của 1 tháng ----
   motLan/dinhKy KHÔNG ghi vào journal của nháp, vì engine dự báo bỏ qua
   journal ở tháng tương lai (tháng tương lai dùng dự trù). Nên cộng thẳng
   vào tổng thu/chi của tháng. Số tiền cho phép ÂM = giảm bớt khoản đó. */
function mpDcSum(dieuChinh, kind, mk){
  var s = 0;
  (dieuChinh || []).forEach(function(dc){
    if (dc.kind !== kind) return;
    if (dc.loai === 'motLan'){
      if (dc.mk === mk) s += num(dc.soTien);
    } else if (dc.loai === 'dinhKy'){
      var n = Math.max(1, num(dc.soThang) || 1);
      for (var i=0;i<n;i++){ if (monthKeyAdd(dc.mkTu, i) === mk){ s += num(dc.soTien); break; } }
    } else if (dc.loai === 'traSom'){
      // phần tiền phải bỏ ra để tất toán — số tiền được tính lúc dựng kịch bản
      if (dc.mk === mk) s += num(dc.soTien);
    }
  });
  return s;
}

/* số tiền tất toán: nhập ở điều chỉnh > số dự kiến của khoản vay > phần còn phải trả theo lịch
   TỪ tháng tất toán trở đi (gồm cả lãi các kỳ sau nên thường CAO hơn số thực trả) */
function mpSoTienTatToan(d, dc, loan){
  var duNoTuThang = withData(d, function(){
    var sch = tinhLichTraNo(loan), s = 0;
    sch.forEach(function(row, idx){
      if (row.mk >= dc.mk && !kyDaDong(loan, idx)) s += conThieuKy(loan, idx, sch);
    });
    return s;
  });
  return num(dc.soTienTatToan) > 0 ? num(dc.soTienTatToan)
       : (num(loan.soTienTatToan) > 0 ? num(loan.soTienTatToan) : duNoTuThang);
}

/* ---- dựng bộ dữ liệu kịch bản ----
   Clone LẦN NỮA từ state.mp.data rồi mới nặn, để bấm tính nhiều lần không
   dồn tích điều chỉnh (vay thêm 1 khoản 3 lần thành 3 khoản). */
function mpBuildScenario(){
  var d = mpClone(state.mp.data);
  var overlay = [];
  (state.mp.dieuChinh || []).forEach(function(dc){
    if (!dc.bat) return;
    if (dc.loai === 'motLan' || dc.loai === 'dinhKy'){
      overlay.push(dc);
    } else if (dc.loai === 'vayMoi'){
      d.vayNo.vayNoPhaiTra.push({
        id: 'mp_' + Math.random().toString(36).slice(2,9),
        ten: dc.ten || 'Khoản vay mô phỏng',
        loaiVay: dc.loaiVay || 'ngan_hang',
        hinhThuc: dc.hinhThuc || 'khong_lai',
        soTienGoc: num(dc.soTien),
        laiSuatNam: num(dc.laiSuatNam),
        soTienTraThang: num(dc.soTienTraThang),
        soThangVay: Math.max(1, num(dc.soThang) || 1),
        ngayVay: kyTu(dc.mkTu),
        ngayTraHangThang: ngayKy(),
        traNo: [],
        trangThai: 'dang_vay'
      });
      // tiền vay về ví ngay tháng bắt đầu
      overlay.push({ loai:'motLan', kind:'thu', mk: dc.mkTu, soTien: num(dc.soTien), bat:true });
    } else if (dc.loai === 'traSom'){
      var loan = (d.vayNo.vayNoPhaiTra || []).find(function(x){ return x.id === dc.loanId; });
      if (!loan) return;
      // Các kỳ TRƯỚC tháng tất toán vẫn phải trả như thường; từ tháng tất toán trở đi không còn kỳ nào
      // (loan.mpTatToanMk, xem tongTraNoThang) và thay bằng 1 khoản tất toán ở overlay.
      // Không tắt khoản vay (trangThai/tatToan): làm thế là mất luôn các kỳ trước tháng tất toán.
      var soTT = mpSoTienTatToan(d, dc, loan);
      loan.mpTatToanMk = dc.mk;
      overlay.push({ loai:'traSom', kind:'chi', mk: dc.mk, soTien: soTT, bat:true });
    }
  });
  return { data: d, overlay: overlay };
}

/* ---- chiếu dòng tiền horizon tháng trên 1 bộ dữ liệu ----
   LƯU Ý: callback truyền vào withData TUYỆT ĐỐI không được async. */
function mpChieuDongTien(d, startMk, horizon, overlay){
  var months = [];
  for (var i=0;i<horizon;i++) months.push(monthKeyAdd(startMk, i));
  return withData(d, function(){
    var bal = balanceBeforeMonth(startMk);
    return months.map(function(mk){
      var thu = tongThuThangCard(mk) + mpDcSum(overlay, 'thu', mk);
      var chi = tongChiThangCard(mk) + mpDcSum(overlay, 'chi', mk);
      bal += thu - chi;
      return { mk: mk, thu: thu, chi: chi, bal: bal };
    });
  });
}


/* ---- tính khoản vay thêm: số trả mỗi tháng, tổng lãi, tháng trả xong (dùng lịch trả của Vay - Nợ) ----
   o = { hinhThuc: 'co_lai' (trả cố định) | 'goc_deu' | 'tra_co_dinh' (số trả tự nhập), soTien, laiSuatNam, soThang, mkTu, traTay } */
function mpTinhVay(o){
  var loan = { hinhThuc: o.hinhThuc, soTienGoc: num(o.soTien), laiSuatNam: num(o.laiSuatNam), soThangVay: Math.max(1, num(o.soThang) || 1),
    ngayVay: kyTu(o.mkTu), ngayTraHangThang: ngayKy(), soTienTraThang: num(o.traTay) };
  var sch = tinhLichTraNo(loan), lai = 0;
  sch.forEach(function(r){ lai += r.lai; });
  return { tra: sch.length ? sch[0].tongTra : 0, tongLai: lai, hetMk: sch.length ? sch[sch.length - 1].mk : null };
}
var MP_HT_NHAN = { co_lai:'trả cố định', tra_co_dinh:'trả cố định', goc_deu:'gốc đều, lãi giảm', khong_lai:'không lãi', tra_1_lan:'trả 1 lần' };
var MP_LOAI_MOTA = { motLan:'Thu/chi một lần', dinhKy:'Lặp lại mỗi tháng', vayMoi:'Khoản vay mới', traSom:'Trả hết khoản vay' };

/* ---- form thêm/sửa 1 điều chỉnh (nằm trong bảng trượt từ đáy — mpSheetVe) ---- */
function mpFormHtml(){
  var dc = (state.mp.editIdx >= 0) ? state.mp.dieuChinh[state.mp.editIdx] : null;
  var loai = dc ? dc.loai : (state.mp.formLoai || 'motLan');
  var curMk = monthKey(todayStr());
  var mkOpts = function(sel){
    var o = '';
    for (var i=0;i<Math.max(state.mp.horizon, 36);i++){
      var m = monthKeyAdd(curMk, i);
      o += '<option value="'+m+'"'+(m===sel?' selected':'')+'>'+monthLabel(m)+'</option>';
    }
    return o;
  };
  var money = function(id, v, ph){
    return '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="'+id+'" value="'+(v ? veSo(v) : '')+'" placeholder="'+(ph || '0')+'">';
  };
  var h = '<div class="qa-sheet mp-sheet" role="dialog" aria-modal="true" aria-label="'+(dc ? 'Sửa điều chỉnh' : 'Thêm điều chỉnh')+'"><div class="qa-grab"></div>'
    + '<div class="qa-head"><h3>'+(dc ? 'Sửa điều chỉnh' : 'Thêm điều chỉnh')+'</h3>'
    + '<button type="button" class="qa-x" data-act="mpCancelDc" aria-label="Đóng">'+icon('x')+'</button></div><div class="qa-body">';
  h += '<input type="hidden" id="mp_loai" value="'+loai+'"><div class="mp-tiles-l">'
     + Object.keys(MP_LOAI_LABEL).map(function(k){
         return '<button type="button" class="mp-tl '+k+(k === loai ? ' on' : '')+'" data-act="mpDoiLoai" data-v="'+k+'"'+(dc && k !== loai ? ' disabled' : '')+'>'
           + '<b><i></i>'+MP_LOAI_LABEL[k]+'</b><small>'+MP_LOAI_MOTA[k]+'</small></button>'; }).join('')
     + '</div>';
  var tom = '';
  if (loai === 'motLan' || loai === 'dinhKy'){
    var kind = dc ? dc.kind : 'chi';
    h += '<div class="qa-lbl">Thu hay chi?</div><input type="hidden" id="mp_kind" value="'+kind+'"><div class="qa-seg" id="mp_kindSeg">'
       + '<button type="button" class="chi'+(kind === 'chi' ? ' on' : '')+'" data-act="mpKind" data-v="chi">Chi</button>'
       + '<button type="button" class="thu'+(kind === 'thu' ? ' on' : '')+'" data-act="mpKind" data-v="thu">Thu</button></div>';
    h += '<div class="qa-lbl">Mô tả</div><input type="text" id="mp_ten" value="'+(dc?esc(dc.ten):'')+'" placeholder="VD: Mua laptop">';
    h += '<div class="qa-lbl">Số tiền <span class="mp-hint">(âm = giảm bớt)</span></div>'+money('mp_soTien', dc ? dc.soTien : 0);
    h += '<div class="mp-2"><div><div class="qa-lbl">'+(loai==='dinhKy'?'Bắt đầu từ tháng':'Vào tháng')+'</div><select id="mp_mk">'+mkOpts(dc ? (dc.mk || dc.mkTu) : curMk)+'</select></div>';
    if (loai === 'dinhKy') h += '<div><div class="qa-lbl">Kéo dài (tháng)</div><input type="number" id="mp_soThang" min="1" value="'+(dc?num(dc.soThang):state.mp.horizon)+'"></div>';
    h += '</div>';
  } else if (loai === 'vayMoi'){
    var ht = (dc && dc.hinhThuc === 'goc_deu') ? 'goc_deu' : 'co_lai';
    var tay = (dc && dc.hinhThuc === 'tra_co_dinh') ? num(dc.soTienTraThang) : 0;
    h += '<div class="qa-lbl">Tên khoản vay</div><input type="text" id="mp_ten" value="'+(dc?esc(dc.ten):'')+'" placeholder="VD: Vay ngân hàng mua xe">';
    h += '<div class="qa-lbl">Số tiền gốc</div>'+money('mp_soTien', dc ? dc.soTien : 0);
    h += '<div class="qa-lbl">Hình thức trả</div><input type="hidden" id="mp_hinhThuc" value="'+ht+'"><div class="qa-seg" id="mp_htSeg">'
       + '<button type="button" class="'+(ht === 'co_lai' ? 'on' : '')+'" data-act="mpHinhThuc" data-v="co_lai">Trả cố định</button>'
       + '<button type="button" class="'+(ht === 'goc_deu' ? 'on' : '')+'" data-act="mpHinhThuc" data-v="goc_deu">Gốc đều, lãi giảm</button></div>';
    h += '<div class="mp-2"><div><div class="qa-lbl">Lãi suất %/năm</div><input type="number" id="mp_laiSuatNam" min="0" step="0.01" value="'+(dc?num(dc.laiSuatNam):'')+'"></div>'
       + '<div><div class="qa-lbl">Số tháng</div><input type="number" id="mp_soThang" min="1" value="'+(dc?num(dc.soThang):12)+'"></div></div>';
    h += '<div class="qa-lbl">Nhận tiền tháng</div><select id="mp_mk">'+mkOpts(dc?dc.mkTu:curMk)+'</select>';
    h += '<div class="qa-lbl" id="mp_traNhan">Trả mỗi tháng · tự tính, có thể sửa</div>'
       + '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="mp_traThang" value="'+(tay ? veSo(tay) : '')+'"'+(tay ? ' data-tay="1"' : '')+' placeholder="0">';
    tom = '<div class="mp-tom" id="mp_tom"></div>';
  } else if (loai === 'traSom') {
    var dsLoan = ((state.mp.data.vayNo||{}).vayNoPhaiTra || []).filter(function(l){
      return loanIsActive(l) && !l.tatToan;
    });
    if (!dsLoan.length){
      h += '<div class="empty">Bản nháp không có khoản vay nào đang trả — không có gì để tất toán sớm.</div>';
    } else {
      h += '<div class="qa-lbl">Khoản vay</div><select id="mp_loanId">'
         + dsLoan.map(function(l){
             return '<option value="'+l.id+'"'+((dc&&dc.loanId===l.id)?' selected':'')+'>'
                  + esc(l.ten)+' — còn '+fmt(Math.round(withData(state.mp.data, function(){ return soTienConLaiPhaiTra(l); })))
                  + '</option>'; }).join('')
         + '</select>';
      h += '<div class="qa-lbl">Tất toán vào tháng</div><select id="mp_mk">'+mkOpts(dc?dc.mk:curMk)+'</select>';
      h += '<div class="qa-lbl">Số tiền tất toán</div>'+money('mp_soTienTatToan', dc ? dc.soTienTatToan : 0, 'Bỏ trống = số dự kiến của khoản vay / tổng còn phải trả');
    }
  }
  h += '</div><div class="qa-foot">'+tom+'<button type="button" class="btn qa-save" data-act="mpSaveDc">'+(dc ? 'Cập nhật kịch bản' : 'Áp vào kịch bản')+'</button></div></div>';
  return h;
}

// bảng trượt: nằm trong body (ngoài #tabContent), đã mở thì GIỮ NGUYÊN DOM để vẽ lại trang không làm mất ô đang gõ
function mpKhopKhungNhin(){
  var root = document.getElementById('mpSheetRoot'), vv = window.visualViewport;
  if (!root || !vv) return;
  root.style.top = vv.offsetTop + 'px';
  root.style.height = vv.height + 'px';
  root.style.bottom = 'auto';
}
if (typeof window !== 'undefined' && window.visualViewport){
  window.visualViewport.addEventListener('resize', mpKhopKhungNhin);
  window.visualViewport.addEventListener('scroll', mpKhopKhungNhin);
}
function mpSheetVe(){
  if (typeof document === 'undefined' || !document.body || !document.createElement || !state.mp) return;
  var dangMo = state.tab === 'dongtien' && state.dtMoPhong && mpDaNap();
  if (!dangMo && state.mp.formOpen){ state.mp.formOpen = false; state.mp.editIdx = -1; }
  var root = document.getElementById('mpSheetRoot');
  if (!state.mp.formOpen){
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (!document.getElementById('qaSheetRoot')) document.body.classList.remove('qa-mo');
    return;
  }
  if (root) return;
  root = document.createElement('div');
  root.id = 'mpSheetRoot';
  root.className = 'qa-back moi';
  root.innerHTML = '<div class="qa-scrim" data-act="mpCancelDc"></div>' + mpFormHtml();
  document.body.appendChild(root);
  document.body.classList.add('qa-mo');
  mpKhopKhungNhin();
  mpVayCapNhat();
  setTimeout(function(){ root.classList.remove('moi'); }, 400);
}
// dựng lại bảng (đổi loại điều chỉnh): bỏ DOM cũ rồi vẽ mới
function mpSheetLamMoi(){
  var root = document.getElementById('mpSheetRoot');
  if (root && root.parentNode) root.parentNode.removeChild(root);
  mpSheetVe();
}
// cập nhật "Trả mỗi tháng", tổng lãi, tháng trả xong khi người dùng gõ ở form Vay thêm
function mpDocVay(){
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var traEl = document.getElementById('mp_traThang');
  var tay = (traEl && traEl.getAttribute('data-tay')) ? numNonNeg(docSo(traEl.value)) : 0;
  return { hinhThuc: g('mp_hinhThuc') || 'co_lai', soTien: numNonNeg(docSo(g('mp_soTien'))), laiSuatNam: numNonNeg(g('mp_laiSuatNam')),
    soThang: Math.max(1, num(g('mp_soThang')) || 1), mkTu: g('mp_mk') || monthKey(todayStr()), tay: tay };
}
function mpVayCapNhat(){
  var tom = document.getElementById('mp_tom'), traEl = document.getElementById('mp_traThang');
  if (!tom || !traEl) return;
  var v = mpDocVay();
  var auto = mpTinhVay({ hinhThuc: v.hinhThuc, soTien: v.soTien, laiSuatNam: v.laiSuatNam, soThang: v.soThang, mkTu: v.mkTu });
  var dungTay = v.tay > 0 && v.hinhThuc === 'co_lai';
  var kq = dungTay ? mpTinhVay({ hinhThuc: 'tra_co_dinh', soTien: v.soTien, laiSuatNam: v.laiSuatNam, soThang: v.soThang, mkTu: v.mkTu, traTay: v.tay }) : auto;
  var nhan = document.getElementById('mp_traNhan');
  if (nhan) nhan.textContent = v.hinhThuc === 'goc_deu' ? 'Trả kỳ đầu · giảm dần mỗi tháng' : 'Trả mỗi tháng · tự tính, có thể sửa';
  traEl.readOnly = v.hinhThuc === 'goc_deu';
  if (!dungTay) traEl.value = auto.tra > 0 ? veSo(Math.round(auto.tra)) : '';
  tom.innerHTML = v.soTien > 0 && kq.hetMk
    ? 'Tổng lãi ≈ <b>'+fmt(Math.round(kq.tongLai))+'</b> · trả xong '+kq.hetMk.slice(5, 7)+'/'+kq.hetMk.slice(0, 4)
    : 'Nhập số tiền gốc để xem tổng lãi.';
}

// ảnh hưởng lên số dư của 1 điều chỉnh (để ghi dòng "−25.000.000 ₫ một lần")
function mpDcDelta(dc){
  var dau = function(v){ return (v < 0 ? '−' : '+') + fmt(Math.abs(Math.round(v))); };
  var hs = dc.kind === 'thu' ? 1 : -1;
  if (dc.loai === 'motLan') return { v: hs * num(dc.soTien), t: dau(hs * num(dc.soTien)) + ' một lần' };
  if (dc.loai === 'dinhKy'){
    var n = Math.max(1, num(dc.soThang) || 1);
    return { v: hs * num(dc.soTien), t: dau(hs * num(dc.soTien) * n) + ' trong ' + n + ' tháng' };
  }
  if (dc.loai === 'vayMoi'){
    var kq = mpTinhVay({ hinhThuc: dc.hinhThuc === 'goc_deu' ? 'goc_deu' : (num(dc.soTienTraThang) > 0 ? 'tra_co_dinh' : 'co_lai'),
      soTien: dc.soTien, laiSuatNam: dc.laiSuatNam, soThang: dc.soThang, mkTu: dc.mkTu, traTay: dc.soTienTraThang });
    return { v: -kq.tra, t: dau(-kq.tra) + '/tháng' + (dc.hinhThuc === 'goc_deu' ? ' (kỳ đầu)' : '') };
  }
  if (dc.loai === 'traSom'){
    var l = ((state.mp.data.vayNo||{}).vayNoPhaiTra||[]).find(function(x){ return x.id===dc.loanId; });
    var so = l ? Math.round(mpSoTienTatToan(state.mp.data, dc, l)) : 0;
    return { v: -so, t: dau(-so) + ' một lần' };
  }
  return { v: 0, t: '' };
}
function mpDcMoTa(dc){
  if (dc.loai === 'motLan'){
    return (dc.kind==='thu'?'thu':'chi') + ' ' + fmt(Math.round(num(dc.soTien))) + ' · ' + monthLabel(dc.mk);
  }
  if (dc.loai === 'dinhKy'){
    return (dc.kind==='thu'?'thu':'chi') + ' ' + fmt(Math.round(num(dc.soTien)))
         + '/tháng · ' + dc.mkTu.slice(5, 7) + '/' + dc.mkTu.slice(0, 4) + ' → ' + num(dc.soThang) + ' tháng';
  }
  if (dc.loai === 'vayMoi'){
    return 'gốc ' + fmt(Math.round(num(dc.soTien))) + ' · ' + (MP_HT_NHAN[dc.hinhThuc]||dc.hinhThuc)
         + (num(dc.laiSuatNam) ? ' ' + num(dc.laiSuatNam) + '%/năm' : '')
         + ' · ' + num(dc.soThang) + ' tháng từ ' + dc.mkTu.slice(5, 7) + '/' + dc.mkTu.slice(0, 4);
  }
  if (dc.loai === 'traSom'){
    return 'vào ' + monthLabel(dc.mk) + (num(dc.soTienTatToan) > 0 ? ' · số tiền ' + fmt(Math.round(num(dc.soTienTatToan))) : '');
  }
  return dc.loai;
}
function mpDcTen(dc){
  if (dc.loai === 'traSom'){
    var l = ((state.mp.data.vayNo||{}).vayNoPhaiTra||[]).find(function(x){ return x.id===dc.loanId; });
    return 'Tất toán sớm "' + esc(l ? l.ten : dc.loanId) + '"';
  }
  return esc(dc.ten || '(không tên)');
}

/* ---- render ---- */
var MP_SO = function(v){ return Math.round(v).toLocaleString('vi-VN'); };
function renderMoPhong(){
  var root = document.getElementById('tabContent');
  var html = '';
  // vào tab là ai cũng muốn có số liệu để thử: tự nạp bản sao dữ liệu thật, không bắt bấm "Nạp dữ liệu gốc"
  if (!mpDaNap() && state.data) mpNapGoc();

  // Thẻ 1: vùng nháp
  html += '<div class="card mp-nhap"><h3 class="bc-h"><span>Vùng nháp</span><span class="mp-khong">Không được lưu</span></h3>';
  if (!mpDaNap()){
    html += '<div class="empty" style="padding:0 0 10px">Đây là vùng nháp RỖNG, tách hoàn toàn khỏi dữ liệu thật. '
         + 'Bấm nút dưới để copy dữ liệu hiện tại sang nháp rồi thử thoải mái — sửa ở đây '
         + '<b>không</b> ảnh hưởng Sổ tay / Vay-Nợ và <b>không</b> được lưu lên Drive. '
         + 'Thoát trang hoặc làm mới (kéo xuống) là nháp mất sạch.</div>';
    html += '<button class="btn" data-act="mpNapGoc">'+icon('download')+' Nạp dữ liệu gốc</button>';
  } else {
    html += '<div class="mp-nd">Bạn đang thử trên <b>bản sao</b> của dữ liệu. Không ghi vào dữ liệu thật, không lên Drive, mất khi tải lại trang.</div>'
         + '<div class="mp-luc">Đã nạp bản nháp lúc '+pad2(state.mp.napLuc.getHours())+':'+pad2(state.mp.napLuc.getMinutes())+'</div>'
         + '<div class="mp-btns">'
         + '<button class="btn secondary" data-act="mpNapGoc">'+icon('refresh')+' Nạp lại từ gốc</button>'
         + '<button class="btn danger" data-act="mpXoaNhap">'+icon('trash')+' Làm lại từ đầu</button>'
         + '</div>';
  }
  html += '</div>';

  if (!mpDaNap()){
    root.innerHTML = dtCheDoHtml() + html;
    mpSheetVe();
    return;
  }

  // Thẻ 2: danh sách điều chỉnh
  html += '<div class="card bc-card" id="mpDcCard"><h3 class="bc-h"><span>Các điều chỉnh thử</span>'
       + '<button class="btn sm" data-act="mpAddDc">+ Thêm điều chỉnh</button></h3>';
  var ds = state.mp.dieuChinh || [];
  if (!ds.length){
    html += '<div class="mp-trong">'+icon('sliders')+'<b>Chưa có điều chỉnh nào</b><span>Kết quả bên dưới đang là dự báo y như hiện tại. Thử thêm một khoản chi lớn, tăng lương hay khoản vay mới.</span></div>';
  } else {
    html += '<div class="mp-ds">';
    ds.forEach(function(dc, i){
      var dl = mpDcDelta(dc);
      html += '<div class="mp-dc'+(dc.bat?'':' off')+'">'
        + '<label class="mp-sw"><input type="checkbox" data-act="mpToggleDc" data-idx="'+i+'"'+(dc.bat?' checked':'')+' aria-label="Bật/tắt điều chỉnh này"><span></span></label>'
        + '<div class="mp-dc-b"><span class="mp-chip '+dc.loai+'"><i></i>'+MP_LOAI_LABEL[dc.loai]+'</span>'
        + '<b class="mp-dc-t">'+mpDcTen(dc)+'</b><span class="mp-dc-d">'+mpDcMoTa(dc)+'</span>'
        + '<span class="mp-dc-v '+(dl.v < 0 ? 'chi' : 'thu')+'">'+dl.t+'</span></div>'
        + '<div class="mp-dc-x"><button class="icon-btn" data-act="mpEditDc" data-idx="'+i+'" title="Sửa điều chỉnh" aria-label="Sửa điều chỉnh">'+icon('pencil')+'</button>'
        + '<button class="icon-btn" data-act="mpDelDc" data-idx="'+i+'" title="Xóa điều chỉnh" aria-label="Xóa điều chỉnh">'+icon('trash')+'</button></div></div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Thẻ 3: kết quả so sánh
  var curMk = monthKey(todayStr());
  var hz = state.mp.horizon || 24;
  var sc = mpBuildScenario();
  var rowsGoc = mpChieuDongTien(state.mp.data, curMk, hz, []);
  var rowsMoi = mpChieuDongTien(sc.data, curMk, hz, sc.overlay);

  var cuoiGoc = rowsGoc.length ? rowsGoc[rowsGoc.length-1].bal : 0;
  var cuoiMoi = rowsMoi.length ? rowsMoi[rowsMoi.length-1].bal : 0;
  // số dư HIỆN TẠI (đã cộng khoản định kỳ / trả vay đã tới hạn mà chưa ghi), tính trên bản nháp
  var hienTai = withData(state.mp.data, function(){ return soDuHienTaiDieuChinh(todayStr()); });
  var thangNayGoc = rowsGoc.length ? rowsGoc[0].bal : 0;
  var thangNayMoi = rowsMoi.length ? rowsMoi[0].bal : 0;
  var ghiChuHienTai = hienTai.items.length
    ? 'Đã tính thêm ' + hienTai.items.length + ' khoản đến hạn chưa ghi: '
      + hienTai.items.map(function(x){ return esc(x.ten) + ' ' + (x.kind === 'thu' ? '+' : '−') + fmt(Math.round(x.soTien)); }).join(', ')
      + '. Số dư theo Sổ tay: ' + fmt(Math.round(hienTai.goc))
    : 'Theo Sổ tay';
  var amDauTien = null, thapNhat = Infinity;
  for (var i=0;i<rowsMoi.length;i++){
    if (amDauTien == null && rowsMoi[i].bal < 0) amDauTien = rowsMoi[i].mk;
    if (rowsMoi[i].bal < thapNhat) thapNhat = rowsMoi[i].bal;
  }
  var chenh = Math.round(cuoiMoi - cuoiGoc), coDc = ds.some(function(dc){ return dc.bat; });
  var mkCuoi = rowsMoi.length ? rowsMoi[rowsMoi.length-1].mk : curMk;

  var tile = function(cls, lbl, val, sub, nho){ return '<div class="mp-t '+cls+'"><div class="lbl">'+lbl+'</div><div class="val'+(nho ? ' txt' : '')+'">'+val+'</div>'+(sub ? '<div class="sub">'+sub+'</div>' : '')+'</div>'; };
  html += '<div class="mp-tiles">'
    + tile('gold', 'Số dư hiện tại', fmt(Math.round(hienTai.tong)), ghiChuHienTai)
    + tile(thangNayMoi < 0 ? 'chi' : '', 'Cuối tháng này — kịch bản', fmt(Math.round(thangNayMoi)),
        Math.round(thangNayMoi) !== Math.round(thangNayGoc) ? 'Chưa điều chỉnh: ' + fmt(Math.round(thangNayGoc)) : '')
    + tile(!coDc ? '' : (chenh >= 0 ? 'thu' : 'chi'), 'Chênh lệch sau ' + hz + ' tháng', coDc ? (chenh >= 0 ? '+' : '') + fmt(chenh) : 'Chưa thay đổi',
        'Cuối ' + dtNhanThang(mkCuoi) + ': ' + fmt(Math.round(cuoiMoi)), !coDc)
    + tile(amDauTien ? 'chi' : 'thu', 'Tháng âm tiền đầu tiên', amDauTien ? monthLabel(amDauTien) : 'Không có', 'Thấp nhất ' + fmt(Math.round(thapNhat === Infinity ? 0 : thapNhat)))
    + '</div>';

  var cung = !coDc;
  html += '<div class="card bc-card" id="mpSoSanh"><h3 class="bc-h"><span>So sánh dòng tiền</span></h3>'
    + '<div class="mp-hz" role="tablist" aria-label="Số tháng xem">'
    + [6,12,24,36].map(function(h){ return '<button type="button" role="tab" data-act="mpHorizon" data-h="'+h+'" class="'+(h===hz?'on':'')+'" aria-selected="'+(h===hz)+'">'+h+' tháng</button>'; }).join('')
    + '</div>'
    + '<div class="mp-leg"><span><i class="g"></i>Hiện tại</span><span><i class="k"></i>Kịch bản</span><span><i class="a"></i>Tháng âm tiền</span></div>'
    + '<div class="bd-box">'
    + bdLine({ W: 350, H: 200, labels: rowsMoi.map(function(r){ return dtNhanThang(r.mk); }),
      series: [{ ten: 'Hiện tại', vals: rowsGoc.map(function(r){ return Math.round(r.bal); }), cls: 'gray', dash: true },
               { ten: 'Kịch bản', vals: rowsMoi.map(function(r){ return Math.round(r.bal); }), cls: 'chi', fill: true }],
      tipTitle: function(k){ return monthLabel(rowsMoi[k].mk); }, money: function(v){ return fmt(v); }, aria: 'Số dư lũy kế: hiện tại và kịch bản' }) + '</div>'
    + '<div class="mp-strip" aria-hidden="true">'+rowsMoi.map(function(r){ return '<i'+(r.bal < 0 ? ' class="am"' : '')+' title="'+monthLabel(r.mk)+'"></i>'; }).join('')+'</div>'
    + '<div class="mp-hint c">Chạm hoặc kéo trên biểu đồ để xem từng tháng'+(cung ? ' · chưa điều chỉnh nên hai đường trùng nhau' : '')+'</div>';
  var hien = state.mp.hetThang ? rowsMoi : rowsMoi.slice(0, 6);
  html += '<div class="dt-ml mp-ml"><div class="dt-ml-h"><span>Tháng</span><span>Cân đối</span><span>Số dư</span><span>Chênh lệch</span></div>';
  hien.forEach(function(r, idx){
    var g = rowsGoc[idx], lech = Math.round(r.bal - g.bal), cb = r.thu - r.chi;
    html += '<div class="dt-ml-r'+(r.bal < 0 ? ' am' : '')+'"><span class="m"><i class="'+(r.bal < 0 ? 'am' : '')+'"></i>'+dtNhanThang(r.mk)+'</span>'
      + '<span class="c '+(cb < 0 ? 'xau' : 'tot')+'">'+MP_SO(cb)+'</span><span class="l'+(r.bal < 0 ? ' xau' : '')+'">'+MP_SO(r.bal)+'</span>'
      + '<span class="d '+(lech === 0 ? '' : (lech > 0 ? 'tot' : 'xau'))+'">'+(lech === 0 ? '–' : (lech > 0 ? '+' : '')+MP_SO(lech))+'</span></div>';
  });
  html += '</div>';
  if (rowsMoi.length > 6) html += '<button type="button" class="dt-more" data-act="mpHetThang">'+(state.mp.hetThang ? 'Thu gọn' : 'Xem thêm '+(rowsMoi.length - 6)+' tháng')+'</button>';
  html += '<div class="mp-hint c">Cách tính giống thẻ "Dòng tiền tích lũy tương lai" ở chế độ Thực tế &amp; dự kiến · số tính bằng ₫</div></div>';

  var phai = html.indexOf('<div class="mp-tiles">');
  root.innerHTML = dtCheDoHtml() + '<div class="cot2"><div class="cot-trai">' + html.slice(0, phai) + '</div><div class="cot-phai">' + html.slice(phai) + '</div></div>';
  mpSheetVe();
}

/* ---- actions ---- */
function handleMoPhongAction(act, el){
  if (act === 'mpNapGoc'){
    if (!mpDaNap()){ mpNapGoc(); renderMoPhong(); toast('Đã nạp dữ liệu gốc sang vùng nháp.'); return true; }
    // hộp thoại trả Promise -> bọc IIFE async, handler vẫn trả true đồng bộ cho dispatcher
    (async function(){
      if (!await xacNhan('Nạp lại từ dữ liệu gốc?',
            'Bản nháp hiện tại sẽ bị ghi đè. Các điều chỉnh thử vẫn được giữ.',
            { chuOk:'Nạp lại' })) return;
      mpNapGoc();
      renderMoPhong();
      toast('Đã nạp lại dữ liệu gốc.');
    })();
  } else if (act === 'mpXoaNhap'){
    (async function(){
      if (!await xacNhan('Bỏ toàn bộ điều chỉnh, làm lại từ dữ liệu gốc?',
            'Dữ liệu thật không bị ảnh hưởng — vùng nháp chỉ nằm trong bộ nhớ.',
            { nguyHiem:true, chuOk:'Làm lại' })) return;
      mpXoaNhap();
      renderMoPhong();
      toast('Đã bỏ các điều chỉnh, nháp lấy lại từ dữ liệu gốc.');
    })();
  } else if (act === 'mpAddDc'){
    state.mp.formOpen = true;
    state.mp.editIdx = -1;
    state.mp.formLoai = 'motLan';
    mpSheetLamMoi();
  } else if (act === 'mpEditDc'){
    state.mp.formOpen = true;
    state.mp.editIdx = parseInt(el.getAttribute('data-idx'),10);
    mpSheetLamMoi();
  } else if (act === 'mpCancelDc'){
    state.mp.formOpen = false;
    state.mp.editIdx = -1;
    mpSheetVe();
  } else if (act === 'mpDoiLoai'){
    // đổi loại -> dựng lại form cho đúng các ô cần nhập (đang sửa thì khóa loại, nút bị disabled)
    if (state.mp.editIdx >= 0) return true;
    state.mp.formLoai = el.getAttribute('data-v');
    mpSheetLamMoi();
  } else if (act === 'mpKind'){
    var k = document.getElementById('mp_kind'); if (k) k.value = el.getAttribute('data-v');
    var seg = document.getElementById('mp_kindSeg');
    if (seg) [].forEach.call(seg.querySelectorAll('button'), function(b){ b.classList.toggle('on', b === el); });
  } else if (act === 'mpHinhThuc'){
    var ht = document.getElementById('mp_hinhThuc'); if (ht) ht.value = el.getAttribute('data-v');
    var seg2 = document.getElementById('mp_htSeg');
    if (seg2) [].forEach.call(seg2.querySelectorAll('button'), function(b){ b.classList.toggle('on', b === el); });
    var tr = document.getElementById('mp_traThang'); if (tr) tr.removeAttribute('data-tay');
    mpVayCapNhat();
  } else if (act === 'mpDelDc'){
    state.mp.dieuChinh.splice(parseInt(el.getAttribute('data-idx'),10), 1);
    state.mp.formOpen = false;
    state.mp.editIdx = -1;
    renderMoPhong();
  } else if (act === 'mpHorizon'){
    state.mp.horizon = parseInt(el.getAttribute('data-h'),10) || 24;
    renderMoPhong();
  } else if (act === 'mpHetThang'){
    state.mp.hetThang = !state.mp.hetThang;
    renderMoPhong();
  } else if (act === 'mpSaveDc'){
    var loai = (document.getElementById('mp_loai')||{}).value || 'motLan';
    var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
    var dc = { loai: loai, bat: true };
    if (loai === 'motLan' || loai === 'dinhKy'){
      dc.kind = g('mp_kind') || 'chi';
      dc.ten = g('mp_ten');
      dc.soTien = docSo(g('mp_soTien'));
      if (!dc.soTien){ toast('Số tiền phải khác 0.', { loai:'warn' }); return true; }
      if (loai === 'motLan') dc.mk = g('mp_mk');
      else { dc.mkTu = g('mp_mk'); dc.soThang = Math.max(1, num(g('mp_soThang')) || 1); }
    } else if (loai === 'vayMoi'){
      var v = mpDocVay();
      dc.ten = g('mp_ten');
      dc.soTien = v.soTien;
      dc.hinhThuc = v.hinhThuc;
      dc.laiSuatNam = v.laiSuatNam;
      dc.soTienTraThang = 0;
      // người dùng tự sửa số trả mỗi tháng (khác số tự tính) -> khoản trả cố định theo số đó
      if (v.hinhThuc === 'co_lai' && v.tay > 0){
        var auto = mpTinhVay({ hinhThuc: 'co_lai', soTien: v.soTien, laiSuatNam: v.laiSuatNam, soThang: v.soThang, mkTu: v.mkTu });
        if (Math.abs(auto.tra - v.tay) >= 1){ dc.hinhThuc = 'tra_co_dinh'; dc.soTienTraThang = v.tay; }
      }
      dc.soThang = v.soThang;
      dc.mkTu = v.mkTu;
      dc.loaiVay = 'ngan_hang';
      if (dc.soTien <= 0){ toast('Số tiền gốc phải lớn hơn 0.', { loai:'warn' }); return true; }
    } else if (loai === 'traSom'){
      dc.loanId = g('mp_loanId');
      dc.mk = g('mp_mk');
      dc.soTienTatToan = numNonNeg(docSo(g('mp_soTienTatToan')));
      if (!dc.loanId){ toast('Chưa chọn khoản vay.', { loai:'warn' }); return true; }
    }
    if (state.mp.editIdx >= 0){
      dc.bat = state.mp.dieuChinh[state.mp.editIdx].bat;
      state.mp.dieuChinh[state.mp.editIdx] = dc;
    } else {
      state.mp.dieuChinh.push(dc);
    }
    state.mp.formOpen = false;
    state.mp.editIdx = -1;
    renderMoPhong();
  } else {
    return false;
  }
  return true;
}

function handleMoPhongChange(el){
  if (el.matches('[data-act=mpToggleDc]')){
    var i = parseInt(el.getAttribute('data-idx'),10);
    state.mp.dieuChinh[i].bat = el.checked;
    renderMoPhong();
    return true;
  } else if (el.id === 'mp_mk' || el.id === 'mp_soThang' || el.id === 'mp_laiSuatNam'){
    mpVayCapNhat();
    return true;
  }
  return false;
}
// gõ ở form Vay thêm: tính lại số trả, tổng lãi (ô "Trả mỗi tháng" do người dùng gõ thì đánh dấu là số tự nhập)
function handleMoPhongInput(el){
  if (!el || !el.id) return false;
  if (el.id === 'mp_traThang'){ el.setAttribute('data-tay', '1'); mpVayCapNhat(); return true; }
  if (el.id === 'mp_soTien' || el.id === 'mp_soThang' || el.id === 'mp_laiSuatNam'){ mpVayCapNhat(); return true; }
  return false;
}
