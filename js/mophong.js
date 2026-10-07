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
      // Các kỳ TRƯỚC tháng tất toán vẫn phải trả như thường; từ tháng tất toán trở đi không còn kỳ nào
      // (loan.mpTatToanMk, xem tongTraNoThang) và thay bằng 1 khoản tất toán ở overlay.
      // Không tắt khoản vay (trangThai/tatToan): làm thế là mất luôn các kỳ trước tháng tất toán.
      // số tiền tất toán: nhập ở điều chỉnh > số dự kiến của khoản vay > phần còn phải trả theo lịch
      // TỪ tháng tất toán trở đi (gồm cả lãi các kỳ sau nên thường CAO hơn số thực trả)
      var duNoTuThang = withData(d, function(){
        var sch = tinhLichTraNo(loan), s = 0;
        sch.forEach(function(row, idx){
          if (row.mk >= dc.mk && !kyDaDong(loan, idx)) s += conThieuKy(loan, idx, sch);
        });
        return s;
      });
      var soTT = num(dc.soTienTatToan) > 0 ? num(dc.soTienTatToan)
               : (num(loan.soTienTatToan) > 0 ? num(loan.soTienTatToan) : duNoTuThang);
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
    h += '<div><label>Trả mỗi tháng (nếu trả cố định)</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="mp_traThang" value="'+(dc?veSo(dc.soTienTraThang):'')+'" placeholder="0"></div>';
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
      h += '<div><label>Số tiền tất toán</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="mp_soTienTatToan" value="'+(dc?veSo(dc.soTienTatToan):'')+'" placeholder="Bỏ trống = số dự kiến của khoản vay / tổng còn phải trả"></div>';
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
    return 'Tất toán sớm "' + esc(l?l.ten:dc.loanId) + '" vào ' + monthLabel(dc.mk)
         + (num(dc.soTienTatToan) > 0 ? ' · số tiền ' + fmt(Math.round(num(dc.soTienTatToan))) : '');
  }
  return dc.loai;
}

/* ---- render ---- */
function renderMoPhong(){
  var root = document.getElementById('tabContent');
  var html = '';
  // vào tab là ai cũng muốn có số liệu để thử: tự nạp bản sao dữ liệu thật, không bắt bấm "Nạp dữ liệu gốc"
  if (!mpDaNap() && state.data) mpNapGoc();

  // Thẻ 1: nguồn dữ liệu nháp
  html += '<div class="card"><h3>Vùng nháp</h3>';
  if (!mpDaNap()){
    html += '<div class="empty" style="padding:0 0 10px">Đây là vùng nháp RỖNG, tách hoàn toàn khỏi dữ liệu thật. '
         + 'Bấm nút dưới để copy dữ liệu hiện tại sang nháp rồi thử thoải mái — sửa ở đây '
         + '<b>không</b> ảnh hưởng Sổ tay / Vay-Nợ và <b>không</b> được lưu lên Drive. '
         + 'Thoát trang hoặc bấm "Làm mới" là nháp mất sạch.</div>';
    html += '<button class="btn" data-act="mpNapGoc">'+icon('download')+' Nạp dữ liệu gốc</button>';
  } else {
    html += '<div class="empty" style="padding:0 0 10px">Đã nạp bản nháp lúc '
         + pad2(state.mp.napLuc.getHours())+':'+pad2(state.mp.napLuc.getMinutes())
         + '. Mọi con số dưới đây là <b>nháp</b> — không ghi vào dữ liệu thật, không lên Drive.</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">'
         + '<button class="btn secondary sm" data-act="mpNapGoc">'+icon('refresh')+' Nạp lại từ gốc</button>'
         + '<button class="btn danger sm" data-act="mpXoaNhap">'+icon('trash')+' Làm lại từ đầu</button>'
         + '</div>';
  }
  html += '</div>';

  if (!mpDaNap()){
    root.innerHTML = html;
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
          + '<button class="icon-btn" data-act="mpEditDc" data-idx="'+i+'" title="Sửa điều chỉnh" aria-label="Sửa điều chỉnh">'+icon('pencil')+'</button>'
          + '<button class="icon-btn" data-act="mpDelDc" data-idx="'+i+'" title="Xóa điều chỉnh" aria-label="Xóa điều chỉnh">'+icon('trash')+'</button>'
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
  // số dư HIỆN TẠI (đã cộng khoản định kỳ / trả vay đã tới hạn mà chưa ghi), tính trên bản nháp
  var hienTai = withData(state.mp.data, function(){ return soDuHienTaiDieuChinh(todayStr()); });
  var thangNayGoc = rowsGoc.length ? rowsGoc[0].bal : 0;
  var thangNayMoi = rowsMoi.length ? rowsMoi[0].bal : 0;
  var ghiChuHienTai = hienTai.items.length
    ? 'Đã tính thêm ' + hienTai.items.length + ' khoản đến hạn chưa ghi: '
      + hienTai.items.map(function(x){ return esc(x.ten) + ' ' + (x.kind === 'thu' ? '+' : '−') + fmt(Math.round(x.soTien)); }).join(', ')
      + '. Số dư theo Sổ tay: ' + fmt(Math.round(hienTai.goc))
    : 'Theo Sổ tay, không có khoản nào đến hạn mà chưa ghi';
  var amDauTien = null;
  for (var i=0;i<rowsMoi.length;i++){ if (rowsMoi[i].bal < 0){ amDauTien = rowsMoi[i].mk; break; } }

  html += '<div class="grid-summary">'
    + '<div class="stat gold"><div class="lbl">Số dư hiện tại</div><div class="val">'+fmt(Math.round(hienTai.tong))+'</div>'
      + '<div class="stat-sub">'+ghiChuHienTai+'</div></div>'
    + '<div class="stat"><div class="lbl">Cuối tháng này — kịch bản</div><div class="val">'+fmt(Math.round(thangNayMoi))+'</div>'
      + '<div class="stat-sub">Chưa điều chỉnh: '+fmt(Math.round(thangNayGoc))+'</div></div>'
    + '<div class="stat '+(cuoiMoi>=cuoiGoc?'thu':'chi')+'"><div class="lbl">Chênh lệch sau '+hz+' tháng</div><div class="val">'
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
  html += '<div class="bd-h" style="margin-top:14px">Số dư lũy kế: hiện tại và kịch bản</div><div class="bd-box">'
    + bdLine({ W: 350, H: 200, labels: rowsMoi.map(function(r){ return 'T' + parseInt(r.mk.slice(5, 7), 10) + (r.mk.slice(0, 4) !== rowsMoi[0].mk.slice(0, 4) ? '/' + r.mk.slice(2, 4) : ''); }),
      series: [{ ten: 'Hiện tại', vals: rowsGoc.map(function(r){ return Math.round(r.bal); }), cls: 'gray', dash: true },
               { ten: 'Kịch bản', vals: rowsMoi.map(function(r){ return Math.round(r.bal); }), cls: 'chi', fill: true }],
      tipTitle: function(i){ return monthLabel(rowsMoi[i].mk); }, money: function(v){ return fmt(v); }, aria: 'Số dư lũy kế: hiện tại và kịch bản' }) + '</div>'
    + '<div class="bd-key" style="margin-top:6px"><span class="l gray"></span> Hiện tại <span class="l chi"></span> Kịch bản</div>';
  html += '</div>';

  root.innerHTML = html;
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
      dc.soTienTraThang = numNonNeg(docSo(g('mp_traThang')));
      dc.soThang = Math.max(1, num(g('mp_soThang')) || 1);
      dc.mkTu = g('mp_mk');
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
