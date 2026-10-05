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

var chartMoPhong = null;

var MP_LOAI_LABEL = {
  motLan: 'Khoản 1 lần',
  dinhKy: 'Khoản hàng tháng',
  vayMoi: 'Vay thêm',
  traSom: 'Tất toán sớm'
};

function mpClone(o){ return JSON.parse(JSON.stringify(o)); }

function mpDaNap(){ return !!(state.mp && state.mp.data); }

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
        soThangVay: Math.max(1, num(dc.soThang) || 1),
        ngayVay: dc.mkTu + '-01',
        ngayTraHangThang: 1,
        traNo: [],
        trangThai: 'dang_vay'
      });
      // tiền vay về ví ngay tháng bắt đầu
      overlay.push({ loai:'motLan', kind:'thu', mk: dc.mkTu, soTien: num(dc.soTien), bat:true });
    } else if (dc.loai === 'traSom'){
      var loan = (d.vayNo.vayNoPhaiTra || []).find(function(x){ return x.id === dc.loanId; });
      if (!loan) return;
      // tính dư nợ TRÊN BẢN NHÁP (sau các điều chỉnh trước đó), rồi tắt khoản vay.
      // tongTraNoThang() lọc theo loanIsActive() nên phải set trangThai,
      // chỉ gắn cờ tatToan là nó vẫn tiếp tục dự trù các kỳ còn lại.
      var duNo = withData(d, function(){ return soTienConLaiPhaiTra(loan); });
      loan.trangThai = 'da_tra_het';
      loan.tatToan = { mk: dc.mk, soTien: duNo };
      overlay.push({ loai:'traSom', kind:'chi', mk: dc.mk, soTien: duNo, bat:true });
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

/* ---- form thêm/sửa 1 điều chỉnh ---- */
function mpFormHtml(){
  var dc = (state.mp.editIdx >= 0) ? state.mp.dieuChinh[state.mp.editIdx] : null;
  var loai = dc ? dc.loai : (state.mp.formLoai || 'motLan');
  var curMk = monthKey(todayStr());
  var mkOpts = function(sel){
    var o = '';
    for (var i=0;i<state.mp.horizon;i++){
      var m = monthKeyAdd(curMk, i);
      o += '<option value="'+m+'"'+(m===sel?' selected':'')+'>'+monthLabel(m)+'</option>';
    }
    return o;
  };
  var h = '<div class="form-row" style="margin-top:10px">';
  h += '<div><label>Loại điều chỉnh</label><select id="mp_loai" data-act="mpDoiLoai">'
     + Object.keys(MP_LOAI_LABEL).map(function(k){
         return '<option value="'+k+'"'+(k===loai?' selected':'')+'>'+MP_LOAI_LABEL[k]+'</option>'; }).join('')
     + '</select></div>';

  if (loai === 'motLan' || loai === 'dinhKy'){
    h += '<div><label>Thu hay chi?</label><select id="mp_kind">'
       + '<option value="chi"'+((dc&&dc.kind==='chi')||!dc?' selected':'')+'>Chi (tiền ra)</option>'
       + '<option value="thu"'+(dc&&dc.kind==='thu'?' selected':'')+'>Thu (tiền vào)</option>'
       + '</select></div>';
    h += '<div><label>Mô tả</label><input type="text" id="mp_ten" value="'+(dc?esc(dc.ten):'')+'" placeholder="VD: Mua laptop"></div>';
    h += '<div><label>Số tiền <span style="color:var(--muted);font-weight:400">(âm = giảm bớt)</span></label>'
       + '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="mp_soTien" value="'+(dc?veSo(dc.soTien):'')+'" placeholder="0"></div>';
    h += '<div><label>'+(loai==='dinhKy'?'Bắt đầu từ tháng':'Vào tháng')+'</label><select id="mp_mk">'
       + mkOpts(dc ? (dc.mk || dc.mkTu) : curMk) + '</select></div>';
    if (loai === 'dinhKy'){
      h += '<div><label>Kéo dài (tháng)</label><input type="number" id="mp_soThang" min="1" value="'+(dc?num(dc.soThang):state.mp.horizon)+'"></div>';
    }
  } else if (loai === 'vayMoi'){
    h += '<div><label>Tên khoản vay</label><input type="text" id="mp_ten" value="'+(dc?esc(dc.ten):'')+'" placeholder="VD: Vay ngân hàng mua xe"></div>';
    h += '<div><label>Số tiền gốc</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="mp_soTien" value="'+(dc?veSo(dc.soTien):'')+'" placeholder="0"></div>';
    h += '<div><label>Hình thức</label><select id="mp_hinhThuc">'
       + Object.keys(HINH_THUC_LABEL).map(function(k){
           return '<option value="'+k+'"'+((dc&&dc.hinhThuc===k)?' selected':'')+'>'+HINH_THUC_LABEL[k]+'</option>'; }).join('')
       + '</select></div>';
    h += '<div><label>Lãi suất / năm (%)</label><input type="number" id="mp_laiSuatNam" min="0" step="0.01" value="'+(dc?num(dc.laiSuatNam):'')+'"></div>';
    h += '<div><label>Số tháng vay</label><input type="number" id="mp_soThang" min="1" value="'+(dc?num(dc.soThang):12)+'"></div>';
    h += '<div><label>Nhận tiền tháng</label><select id="mp_mk">'+mkOpts(dc?dc.mkTu:curMk)+'</select></div>';
  } else if (loai === 'traSom') {
    var dsLoan = ((state.mp.data.vayNo||{}).vayNoPhaiTra || []).filter(function(l){
      return loanIsActive(l) && !l.tatToan;
    });
    if (!dsLoan.length){
      h += '<div class="empty">Bản nháp không có khoản vay nào đang trả — không có gì để tất toán sớm.</div>';
    } else {
      h += '<div><label>Khoản vay</label><select id="mp_loanId">'
         + dsLoan.map(function(l){
             return '<option value="'+l.id+'"'+((dc&&dc.loanId===l.id)?' selected':'')+'>'
                  + esc(l.ten)+' — còn '+fmt(Math.round(withData(state.mp.data, function(){ return soTienConLaiPhaiTra(l); })))
                  + '</option>'; }).join('')
         + '</select></div>';
      h += '<div><label>Tất toán vào tháng</label><select id="mp_mk">'+mkOpts(dc?dc.mk:curMk)+'</select></div>';
    }
  }
  h += '</div><div style="display:flex;gap:8px;margin-bottom:12px">'
     + '<button class="btn sm" data-act="mpSaveDc">'+(dc?'Cập nhật':'Thêm')+'</button>'
     + '<button class="btn secondary sm" data-act="mpCancelDc">Hủy</button></div>';
  return h;
}

function mpDcMoTa(dc){
  if (dc.loai === 'motLan'){
    return esc(dc.ten||'(không tên)') + ' · ' + (dc.kind==='thu'?'thu':'chi') + ' ' + fmt(Math.round(num(dc.soTien))) + ' · ' + monthLabel(dc.mk);
  }
  if (dc.loai === 'dinhKy'){
    return esc(dc.ten||'(không tên)') + ' · ' + (dc.kind==='thu'?'thu':'chi') + ' ' + fmt(Math.round(num(dc.soTien)))
         + '/tháng · ' + monthLabel(dc.mkTu) + ' → ' + num(dc.soThang) + ' tháng';
  }
  if (dc.loai === 'vayMoi'){
    return esc(dc.ten||'(không tên)') + ' · gốc ' + fmt(Math.round(num(dc.soTien)))
         + ' · ' + (HINH_THUC_LABEL[dc.hinhThuc]||dc.hinhThuc)
         + (num(dc.laiSuatNam) ? ' ' + num(dc.laiSuatNam) + '%/năm' : '')
         + ' · ' + num(dc.soThang) + ' tháng từ ' + monthLabel(dc.mkTu);
  }
  if (dc.loai === 'traSom'){
    var l = ((state.mp.data.vayNo||{}).vayNoPhaiTra||[]).find(function(x){ return x.id===dc.loanId; });
    return 'Tất toán sớm "' + esc(l?l.ten:dc.loanId) + '" vào ' + monthLabel(dc.mk);
  }
  return dc.loai;
}

/* ---- render ---- */
function renderMoPhong(){
  var root = document.getElementById('tabContent');
  var html = '';

  // Thẻ 1: nguồn dữ liệu nháp
  html += '<div class="card"><h3>Vùng nháp</h3>';
  if (!mpDaNap()){
    html += '<div class="empty" style="padding:0 0 10px">Đây là vùng nháp RỖNG, tách hoàn toàn khỏi dữ liệu thật. '
         + 'Bấm nút dưới để copy dữ liệu hiện tại sang nháp rồi thử thoải mái — sửa ở đây '
         + '<b>không</b> ảnh hưởng Sổ tay / Vay-Nợ và <b>không</b> được lưu lên Drive. '
         + 'Thoát trang hoặc bấm "Làm mới" là nháp mất sạch.</div>';
    html += '<button class="btn" data-act="mpNapGoc">⬇ Nạp dữ liệu gốc</button>';
  } else {
    html += '<div class="empty" style="padding:0 0 10px">Đã nạp bản nháp lúc '
         + pad2(state.mp.napLuc.getHours())+':'+pad2(state.mp.napLuc.getMinutes())
         + '. Mọi con số dưới đây là <b>nháp</b> — không ghi vào dữ liệu thật, không lên Drive.</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">'
         + '<button class="btn secondary sm" data-act="mpNapGoc">⟳ Nạp lại từ gốc</button>'
         + '<button class="btn danger sm" data-act="mpXoaNhap">🗑 Xóa nháp</button>'
         + '</div>';
  }
  html += '</div>';

  if (!mpDaNap()){
    root.innerHTML = html;
    if (chartMoPhong){ chartMoPhong.destroy(); chartMoPhong = null; }
    return;
  }

  // Thẻ 2: danh sách điều chỉnh
  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Các điều chỉnh thử'
       + (state.mp.formOpen ? '' : ' <button class="btn sm" data-act="mpAddDc">+ Thêm điều chỉnh</button>')
       + '</h3>';
  if (state.mp.formOpen) html += mpFormHtml();
  var ds = state.mp.dieuChinh || [];
  if (!ds.length){
    html += '<div class="empty">Chưa có điều chỉnh nào — bảng dưới đang là dự báo y như hiện tại.</div>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr><th class="mp-chk"></th><th style="text-align:left">Loại</th><th style="text-align:left">Nội dung</th><th class="actions-col"></th></tr></thead><tbody>';
    ds.forEach(function(dc, i){
      html += '<tr'+(dc.bat?'':' class="mp-off"')+'>'
        + '<td class="mp-chk"><input type="checkbox" data-act="mpToggleDc" data-idx="'+i+'"'+(dc.bat?' checked':'')+' title="Bật/tắt điều chỉnh này"></td>'
        + '<td style="text-align:left">'+MP_LOAI_LABEL[dc.loai]+'</td>'
        + '<td style="text-align:left;white-space:normal">'+mpDcMoTa(dc)+'</td>'
        + '<td class="actions-col">'
          + '<button class="icon-btn" data-act="mpEditDc" data-idx="'+i+'" title="Sửa điều chỉnh" aria-label="Sửa điều chỉnh">✎</button>'
          + '<button class="icon-btn" data-act="mpDelDc" data-idx="'+i+'" title="Xóa điều chỉnh" aria-label="Xóa điều chỉnh">🗑</button>'
        + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  // Thẻ 3: kết quả so sánh
  var curMk = monthKey(todayStr());
  var hz = state.mp.horizon;
  var sc = mpBuildScenario();
  var rowsGoc = mpChieuDongTien(state.mp.data, curMk, hz, []);
  var rowsMoi = mpChieuDongTien(sc.data, curMk, hz, sc.overlay);

  var cuoiGoc = rowsGoc.length ? rowsGoc[rowsGoc.length-1].bal : 0;
  var cuoiMoi = rowsMoi.length ? rowsMoi[rowsMoi.length-1].bal : 0;
  var amDauTien = null;
  for (var i=0;i<rowsMoi.length;i++){ if (rowsMoi[i].bal < 0){ amDauTien = rowsMoi[i].mk; break; } }

  html += '<div class="grid-summary">'
    + '<div class="stat"><div class="lbl">Số dư cuối kỳ — hiện tại</div><div class="val">'+fmt(Math.round(cuoiGoc))+'</div></div>'
    + '<div class="stat gold"><div class="lbl">Số dư cuối kỳ — kịch bản</div><div class="val">'+fmt(Math.round(cuoiMoi))+'</div></div>'
    + '<div class="stat '+(cuoiMoi>=cuoiGoc?'thu':'chi')+'"><div class="lbl">Chênh lệch</div><div class="val">'
      + (cuoiMoi-cuoiGoc>=0?'+':'')+fmt(Math.round(cuoiMoi-cuoiGoc))+'</div></div>'
    + '<div class="stat '+(amDauTien?'chi':'thu')+'"><div class="lbl">Tháng âm tiền đầu tiên</div><div class="val">'
      + (amDauTien?monthLabel(amDauTien):'Không có')+'</div></div>'
    + '</div>';

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">So sánh dòng tiền'
    + '<select id="mp_horizon" data-act="mpHorizonChange" style="width:auto;font-size:12px;padding:4px 8px">'
    + [6,12,24,36].map(function(h){ return '<option value="'+h+'"'+(h===hz?' selected':'')+'>'+h+' tháng tới</option>'; }).join('')
    + '</select></h3>';
  html += '<div class="empty" style="padding:0 0 10px">Cột "Hiện tại" là dự báo của bản nháp khi CHƯA điều chỉnh gì; '
    + 'cột "Kịch bản" là sau khi áp các điều chỉnh đang bật. Cách tính giống thẻ "Dòng tiền tích lũy tương lai" ở tab Vay - Nợ.</div>';
  html += '<div class="table-wrap"><table><thead>'
    + '<tr><th style="text-align:left" rowspan="2">Tháng</th><th colspan="2" class="th-month">Hiện tại</th><th colspan="3" class="th-month">Kịch bản</th><th rowspan="2">Chênh lệch dư</th></tr>'
    + '<tr><th>Thu - Chi</th><th>Số dư lũy kế</th><th>Thu</th><th>Chi</th><th>Số dư lũy kế</th></tr>'
    + '</thead><tbody>';
  rowsMoi.forEach(function(r, idx){
    var g = rowsGoc[idx];
    var lech = r.bal - g.bal;
    html += '<tr'+(r.bal<0?' class="mp-am"':'')+'>'
      + '<td style="text-align:left">'+monthLabel(r.mk)+'</td>'
      + '<td>'+fmt(Math.round(g.thu-g.chi))+'</td>'
      + '<td>'+fmt(Math.round(g.bal))+'</td>'
      + '<td style="color:var(--green)">'+fmt(Math.round(r.thu))+'</td>'
      + '<td style="color:var(--red)">'+fmt(Math.round(r.chi))+'</td>'
      + '<td style="font-weight:600">'+fmt(Math.round(r.bal))+'</td>'
      + '<td style="color:var(--'+(lech>=0?'green':'red')+')">'+(lech>=0?'+':'')+fmt(Math.round(lech))+'</td>'
      + '</tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="chart-box" style="margin-top:10px"><canvas id="chartMoPhong"></canvas></div>';
  html += '</div>';

  root.innerHTML = html;
  mpDrawChart(rowsGoc, rowsMoi);
}

function mpDrawChart(rowsGoc, rowsMoi){
  if (chartMoPhong) chartMoPhong.destroy();
  var ctx = document.getElementById('chartMoPhong');
  if (!ctx) return;
  chartMoPhong = new Chart(ctx, { type:'line',
    data:{ labels: rowsMoi.map(function(r){ return monthLabel(r.mk); }), datasets:[
      { label:'Hiện tại', data: rowsGoc.map(function(r){ return Math.round(r.bal); }),
        borderColor:'#9ca3af', borderDash:[5,4], fill:false, tension:.25 },
      { label:'Kịch bản', data: rowsMoi.map(function(r){ return Math.round(r.bal); }),
        borderColor:'#4f46e5', backgroundColor:'rgba(79,70,229,.1)', fill:true, tension:.25 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ title:{display:true,text:'Số dư lũy kế: hiện tại vs kịch bản'}, legend:{display:true,position:'bottom'} },
      scales:{ y:{ ticks:{ callback:function(v){ return v>=1000?(v/1000)+'k':v; } } } } }
  });
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
      if (!await xacNhan('Xóa bản nháp và toàn bộ điều chỉnh?',
            'Dữ liệu thật không bị ảnh hưởng — vùng nháp chỉ nằm trong bộ nhớ.',
            { nguyHiem:true, chuOk:'Xóa nháp' })) return;
      mpXoaNhap();
      renderMoPhong();
      toast('Đã xóa bản nháp.');
    })();
  } else if (act === 'mpAddDc'){
    state.mp.formOpen = true;
    state.mp.editIdx = -1;
    state.mp.formLoai = 'motLan';
    renderMoPhong();
  } else if (act === 'mpEditDc'){
    state.mp.formOpen = true;
    state.mp.editIdx = parseInt(el.getAttribute('data-idx'),10);
    renderMoPhong();
  } else if (act === 'mpCancelDc'){
    state.mp.formOpen = false;
    state.mp.editIdx = -1;
    renderMoPhong();
  } else if (act === 'mpDelDc'){
    state.mp.dieuChinh.splice(parseInt(el.getAttribute('data-idx'),10), 1);
    state.mp.formOpen = false;
    state.mp.editIdx = -1;
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
      dc.ten = g('mp_ten');
      dc.soTien = numNonNeg(docSo(g('mp_soTien')));
      dc.hinhThuc = g('mp_hinhThuc') || 'khong_lai';
      dc.laiSuatNam = numNonNeg(g('mp_laiSuatNam'));
      dc.soThang = Math.max(1, num(g('mp_soThang')) || 1);
      dc.mkTu = g('mp_mk');
      dc.loaiVay = 'ngan_hang';
      if (dc.soTien <= 0){ toast('Số tiền gốc phải lớn hơn 0.', { loai:'warn' }); return true; }
    } else if (loai === 'traSom'){
      dc.loanId = g('mp_loanId');
      dc.mk = g('mp_mk');
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
  if (el.matches('[data-act=mpDoiLoai]')){
    // đổi loại -> dựng lại form cho đúng các ô cần nhập. Bỏ chế độ sửa vì
    // bản ghi cũ là loại khác, giữ lại chỉ gây lẫn dữ liệu.
    state.mp.formLoai = el.value;
    state.mp.editIdx = -1;
    renderMoPhong();
    return true;
  } else if (el.matches('[data-act=mpHorizonChange]')){
    state.mp.horizon = parseInt(el.value,10) || 24;
    renderMoPhong();
    return true;
  } else if (el.matches('[data-act=mpToggleDc]')){
    var i = parseInt(el.getAttribute('data-idx'),10);
    state.mp.dieuChinh[i].bat = el.checked;
    renderMoPhong();
    return true;
  }
  return false;
}
