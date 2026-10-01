"use strict";
/* ====================================================================
   vayno.js — toàn bộ logic + giao diện tab "Vay - Nợ": tính lịch trả nợ,
   render bảng Cho vay / Vay-Nợ phải trả, dòng tiền tích lũy tương lai,
   và xử lý các hành động (thêm/sửa/xóa/tất toán/ghi nhận thu-trả) của tab này.
   Cần state.js, drive-sync.js load trước.
   ==================================================================== */

var LOAI_VAY_LABEL = { ngan_hang:'Ngân hàng', vi:'Ví', ban_be:'Bạn bè', nguoi_than:'Người thân' };
var HINH_THUC_LABEL = { tra_1_lan:'Trả 1 lần', khong_lai:'Không lãi suất', co_lai:'Có lãi suất' };
var chartTichLuy = null;

function monthKeyAdd(mk, n){
  var p = mk.split('-'); var y = parseInt(p[0],10), m = parseInt(p[1],10) + n;
  while (m > 12){ m -= 12; y++; }
  while (m < 1){ m += 12; y--; }
  return y + '-' + pad2(m);
}
function loanIsActive(loan){ return loan.trangThai !== 'da_tra_het'; }
// trả về lịch trả từng tháng: [{mk, goc, lai, tongTra, duNoConLai}]
function tinhLichTraNo(loan){
  var sch = [];
  var startMk = monthKey(loan.ngayVay || todayStr());
  var goc0 = num(loan.soTienGoc);
  if (loan.hinhThuc === 'tra_1_lan'){
    var mkDue = loan.ngayDaoHan ? monthKey(loan.ngayDaoHan) : monthKeyAdd(startMk, num(loan.soThangVay) || 0);
    sch.push({ mk: mkDue, goc: goc0, lai: 0, tongTra: goc0, duNoConLai: 0 });
    return sch;
  }
  var n = Math.max(1, num(loan.soThangVay));
  if (loan.hinhThuc === 'khong_lai'){
    var gocThang = goc0 / n, duNo = goc0;
    for (var i=1;i<=n;i++){
      duNo -= gocThang;
      sch.push({ mk: monthKeyAdd(startMk,i), goc: gocThang, lai: 0, tongTra: gocThang, duNoConLai: Math.max(0,duNo) });
    }
    return sch;
  }
  // co_lai — trả đều (annuity), lãi %/năm quy đổi tháng
  var r = num(loan.laiSuatNam) / 12 / 100;
  var duNo2 = goc0;
  if (r <= 0){
    var gocThang2 = goc0 / n;
    for (var j=1;j<=n;j++){
      duNo2 -= gocThang2;
      sch.push({ mk: monthKeyAdd(startMk,j), goc: gocThang2, lai: 0, tongTra: gocThang2, duNoConLai: Math.max(0,duNo2) });
    }
    return sch;
  }
  var pow = Math.pow(1+r, n);
  var pmt = goc0 * r * pow / (pow - 1);
  for (var k=1;k<=n;k++){
    var laiK = duNo2 * r, gocK = pmt - laiK;
    duNo2 -= gocK;
    sch.push({ mk: monthKeyAdd(startMk,k), goc: gocK, lai: laiK, tongTra: pmt, duNoConLai: Math.max(0,duNo2) });
  }
  return sch;
}
function conLaiPhaiThu(loan){
  return Math.max(0, num(loan.soTien) - num(loan.daThu));
}
// tháng dự kiến trả hết nợ (mk của dòng cuối lịch trả)
function thangDuKienHetNo(loan){
  var sch = tinhLichTraNo(loan);
  return sch.length ? sch[sch.length-1].mk : null;
}
// tiến độ trả nợ: tổng số kỳ, số kỳ đã trả (dựa theo daTraGoc thực tế), kỳ tiếp theo chưa trả (hoặc null nếu đã hết)
function tienDoTraNo(loan){
  var sch = tinhLichTraNo(loan);
  var daTra = num(loan.daTraGoc);
  var cum = 0, daTraKy = 0, kyTiepTheo = null;
  for (var i=0;i<sch.length;i++){
    cum += sch[i].goc;
    if (cum <= daTra + 0.01) daTraKy++;
    else if (!kyTiepTheo) kyTiepTheo = sch[i];
  }
  return { tongKy: sch.length, daTraKy: daTraKy, kyTiepTheo: kyTiepTheo };
}
// tổng số tiền còn phải trả (gồm cả lãi) của các kỳ chưa trả
function soTienConLaiPhaiTra(loan){
  var sch = tinhLichTraNo(loan);
  var daTraKy = tienDoTraNo(loan).daTraKy;
  var s = 0;
  for (var i = daTraKy; i < sch.length; i++) s += sch[i].tongTra;
  return s;
}
function tongTraNoThang(mk){
  var s = 0;
  (state.data.vayNo.vayNoPhaiTra||[]).forEach(function(loan){
    if (!loanIsActive(loan)) return;
    tinhLichTraNo(loan).forEach(function(row){ if (row.mk === mk) s += row.tongTra; });
  });
  return s;
}
function tongThuHoiThang(mk){
  var s = 0;
  (state.data.vayNo.choVay||[]).forEach(function(loan){
    if (loan.trangThai === 'da_thu_du') return;
    if (monthKey(loan.ngayDuKienThu || todayStr()) === mk){
      var cl = conLaiPhaiThu(loan);
      if (cl > 0) s += cl;
    }
  });
  return s;
}

/* ---- dòng tiền tích lũy tương lai (thẻ dưới cùng của tab Vay-Nợ) ---- */
function actualCatMonthAll(kind, mk){
  var s = 0;
  Object.keys(state.data.journal).forEach(function(d){
    if (monthKey(d) !== mk) return;
    var e = state.data.journal[d];
    s += (kind==='thu') ? thuTotal(e) : chiTotal(e);
  });
  return s;
}
// tổng thực tế của 1 danh mục trong 1 tháng (dùng để kiểm tra đã ghi Sổ tay chưa)
function actualCatInMonth(kind, cid, mk){
  var s = 0;
  Object.keys(state.data.journal).forEach(function(d){
    if (monthKey(d) !== mk) return;
    var obj = state.data.journal[d][kind] || {};
    s += num(obj[cid]);
  });
  return s;
}
function duTruDanhMucThang(kind, cid, mk){
  var cat0 = state.data.categories[kind].find(function(c){ return c.id===cid; });
  if (cat0 && cat0.khongDuTru) return 0;
  if (kind==='chi' && cid==='traNo') return tongTraNoThang(mk);
  if (kind==='thu' && cid==='thuHoiChoVay') return tongThuHoiThang(mk);
  if (cat0 && cat0.coDinhChiTieu) return num(cat0.chiTieu) > 0 ? num(cat0.chiTieu) : 0;
  var avg = recentAvgActual(kind, cid, 3);
  if (avg != null) return avg;
  var cat = state.data.categories[kind].find(function(c){ return c.id===cid; });
  return (cat && num(cat.chiTieu) > 0) ? num(cat.chiTieu) : 0;
}
function duTruThuThang(mk){
  var s=0; state.data.categories.thu.forEach(function(c){ s += duTruDanhMucThang('thu', c.id, mk); }); return s;
}
function duTruChiThang(mk){
  var s=0; state.data.categories.chi.forEach(function(c){ s += duTruDanhMucThang('chi', c.id, mk); }); return s;
}
// tháng hiện tại: các khoản BIẾT TRƯỚC (Trả nợ/Thu hồi cho vay theo lịch vay, hoặc danh mục có cờ
// "Cố định theo Chỉ tiêu") mà chưa ghi Sổ tay thì cộng thêm số biết trước đó; các danh mục còn lại
// (ước lượng, không cố định) vẫn giữ nguyên thực tế (có thể 0)
function tongThuThangCard(mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return duTruThuThang(mk);
  var s = actualCatMonthAll('thu', mk);
  if (mk === currentMk){
    if (!actualCatInMonth('thu','thuHoiChoVay',mk)) s += (tongThuHoiThang(mk) || 0);
    state.data.categories.thu.forEach(function(c){
      if (c.id === 'thuHoiChoVay') return;
      if (c.coDinhChiTieu && !actualCatInMonth('thu', c.id, mk)){
        var b = num(c.chiTieu);
        if (b > 0) s += b;
      }
    });
  }
  return s;
}
function tongChiThangCard(mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return duTruChiThang(mk);
  var s = actualCatMonthAll('chi', mk);
  if (mk === currentMk){
    if (!actualCatInMonth('chi','traNo',mk)) s += (tongTraNoThang(mk) || 0);
    state.data.categories.chi.forEach(function(c){
      if (c.id === 'traNo') return;
      if (c.coDinhChiTieu && !actualCatInMonth('chi', c.id, mk)){
        var b = num(c.chiTieu);
        if (b > 0) s += b;
      }
    });
  }
  return s;
}

/* ---- render ---- */
function choVayFormHtml(){
  var editing = state.vnFormId ? state.data.vayNo.choVay.find(function(x){ return x.id===state.vnFormId; }) : null;
  var d = editing || { ten:'', soTien:'', ngayChoVay: todayStr(), ngayDuKienThu:'' };
  return '<div class="form-row" style="margin-top:10px">'
    + '<div><label>Tên / mô tả</label><input type="text" id="vn_cv_ten" value="'+(d.ten||'').replace(/"/g,'&quot;')+'"></div>'
    + '<div><label>Số tiền cho vay</label><input type="number" id="vn_cv_soTien" value="'+(d.soTien||'')+'" min="0"></div>'
    + '<div><label>Ngày cho vay</label><input type="date" id="vn_cv_ngay" value="'+(d.ngayChoVay||todayStr())+'"></div>'
    + '<div><label>Ngày dự kiến thu</label><input type="date" id="vn_cv_ngayThu" value="'+(d.ngayDuKienThu||'')+'"></div>'
    + '</div><div style="display:flex;gap:8px;margin-bottom:12px">'
    + '<button class="btn sm" data-act="vnSaveChoVay">Lưu</button>'
    + '<button class="btn secondary sm" data-act="vnCancelForm">Hủy</button></div>';
}

function vayNoFormHtml(){
  var editing = state.vnFormId ? state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===state.vnFormId; }) : null;
  var d = editing || { ten:'', loaiVay:'ngan_hang', hinhThuc:'khong_lai', soTienGoc:'', ngayVay: todayStr(), soThangVay:'', ngayDaoHan:'', laiSuatNam:'' };
  var daTraKyVal = editing ? tienDoTraNo(editing).daTraKy : '';
  var loaiOpts = Object.keys(LOAI_VAY_LABEL).map(function(k){ return '<option value="'+k+'"'+(d.loaiVay===k?' selected':'')+'>'+LOAI_VAY_LABEL[k]+'</option>'; }).join('');
  var hinhOpts = Object.keys(HINH_THUC_LABEL).map(function(k){ return '<option value="'+k+'"'+(d.hinhThuc===k?' selected':'')+'>'+HINH_THUC_LABEL[k]+'</option>'; }).join('');
  return '<div class="form-row" style="margin-top:10px">'
    + '<div><label>Tên / mô tả</label><input type="text" id="vn_vn_ten" value="'+(d.ten||'').replace(/"/g,'&quot;')+'"></div>'
    + '<div><label>Loại vay</label><select id="vn_vn_loai">'+loaiOpts+'</select></div>'
    + '<div><label>Hình thức trả</label><select id="vn_vn_hinh">'+hinhOpts+'</select></div>'
    + '<div><label>Số tiền vay (gốc)</label><input type="number" id="vn_vn_soTien" value="'+(d.soTienGoc||'')+'" min="0"></div>'
    + '<div><label>Ngày vay</label><input type="date" id="vn_vn_ngay" value="'+(d.ngayVay||todayStr())+'"></div>'
    + '<div><label>Kỳ hạn (số tháng)</label><input type="number" id="vn_vn_soThang" value="'+(d.soThangVay||'')+'" placeholder="Bỏ trống nếu trả 1 lần" min="0"></div>'
    + '<div><label>Ngày đáo hạn (nếu trả 1 lần)</label><input type="date" id="vn_vn_daoHan" value="'+(d.ngayDaoHan||'')+'"></div>'
    + '<div><label>Lãi suất %/năm</label><input type="number" id="vn_vn_laiSuat" value="'+(d.laiSuatNam||'')+'" placeholder="Chỉ cần nếu có lãi suất" min="0"></div>'
    + '<div><label>Số kỳ đã trả (nếu có, trước khi nhập vào đây)</label><input type="number" id="vn_vn_daTraKy" value="'+(daTraKyVal||'')+'" placeholder="0" min="0"></div>'
    + '</div><div style="display:flex;gap:8px;margin-bottom:12px">'
    + '<button class="btn sm" data-act="vnSaveVayNo">Lưu</button>'
    + '<button class="btn secondary sm" data-act="vnCancelForm">Hủy</button></div>';
}

function vayNoScheduleHtml(loan){
  var sch = tinhLichTraNo(loan);
  var tienDo = tienDoTraNo(loan);
  var rows = sch.map(function(row, idx){
    return { row: row, paid: idx < tienDo.daTraKy };
  });
  var nextIdx = tienDo.daTraKy;
  var html = '<div class="table-wrap" style="margin:8px 0"><table><thead><tr><th>Tháng</th><th>Gốc</th><th>Lãi</th><th>Tổng trả</th><th>Dư nợ còn lại</th><th></th></tr></thead><tbody>';
  rows.forEach(function(r, idx){
    html += '<tr'+(r.paid?' style="color:var(--muted)"':'')+'>'
      + '<td>'+monthLabel(r.row.mk)+'</td>'
      + '<td>'+fmt(Math.round(r.row.goc))+'</td>'
      + '<td>'+fmt(Math.round(r.row.lai))+'</td>'
      + '<td>'+fmt(Math.round(r.row.tongTra))+'</td>'
      + '<td>'+fmt(Math.round(r.row.duNoConLai))+'</td>'
      + '<td>'+(r.paid ? '✓ đã trả' : (idx===nextIdx ? '<button class="btn sm" data-act="vnGhiNhanTra" data-id="'+loan.id+'" data-goc="'+r.row.goc+'" data-tong="'+r.row.tongTra+'" data-mk="'+r.row.mk+'">Ghi nhận đã trả</button>' : ''))+'</td>'
      + '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function renderVayNo(){
  var root = document.getElementById('tabContent');
  var choVay = state.data.vayNo.choVay;
  var vayNoPhaiTra = state.data.vayNo.vayNoPhaiTra;
  var html = '';

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Cho vay <button class="btn sm" data-act="vnAddChoVay">+ Thêm khoản cho vay</button></h3>';
  if (state.vnFormKind === 'choVay') html += choVayFormHtml();
  if (!choVay.length){
    html += '<div class="empty">Chưa có khoản cho vay nào.</div>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Tên</th><th>Số tiền</th><th>Đã thu</th><th>Còn lại</th><th>Dự kiến thu</th><th>Trạng thái</th><th class="actions-col"></th></tr></thead><tbody>';
    choVay.forEach(function(c){
      var conLai = conLaiPhaiThu(c);
      html += '<tr>'
        + '<td style="text-align:left">'+c.ten+'</td>'
        + '<td>'+fmt(c.soTien)+'</td>'
        + '<td>'+fmt(c.daThu)+'</td>'
        + '<td>'+fmt(conLai)+'</td>'
        + '<td>'+(c.ngayDuKienThu||'')+'</td>'
        + '<td>'+(c.trangThai==='da_thu_du'?'Đã thu đủ':'Đang chờ')+'</td>'
        + '<td class="actions-col">'
        + (conLai>0 ? '<button class="icon-btn" data-act="vnGhiNhanThu" data-id="'+c.id+'" title="Ghi nhận đã thu">✓</button>' : '')
        + '<button class="icon-btn" data-act="vnEditChoVay" data-id="'+c.id+'">✎</button>'
        + '<button class="icon-btn" data-act="vnDelChoVay" data-id="'+c.id+'">🗑</button>'
        + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Vay - Nợ phải trả <button class="btn sm" data-act="vnAddVayNo">+ Thêm khoản vay</button></h3>';
  if (state.vnFormKind === 'vayNoPhaiTra') html += vayNoFormHtml();
  if (!vayNoPhaiTra.length){
    html += '<div class="empty">Chưa có khoản vay nào.</div>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Tên</th><th>Loại vay</th><th>Hình thức</th><th>Đã trả</th><th>Dư nợ còn lại</th><th>Số tiền trả kỳ tới</th><th>Dự kiến hết nợ</th><th>Trạng thái</th><th class="actions-col"></th></tr></thead><tbody>';
    vayNoPhaiTra.forEach(function(v){
      var duNo = soTienConLaiPhaiTra(v);
      var hetNoMk = thangDuKienHetNo(v);
      var tienDo = tienDoTraNo(v);
      html += '<tr>'
        + '<td style="text-align:left"><a href="#" data-act="vnToggleDetail" data-id="'+v.id+'" style="color:var(--primary-d);text-decoration:none">'+v.ten+'</a></td>'
        + '<td>'+LOAI_VAY_LABEL[v.loaiVay]+'</td>'
        + '<td>'+HINH_THUC_LABEL[v.hinhThuc]+'</td>'
        + '<td>'+tienDo.daTraKy+'/'+tienDo.tongKy+' kỳ</td>'
        + '<td>'+fmt(duNo)+'</td>'
        + '<td>'+(tienDo.kyTiepTheo ? fmt(Math.round(tienDo.kyTiepTheo.tongTra))+' ('+monthLabel(tienDo.kyTiepTheo.mk)+')' : '—')+'</td>'
        + '<td>'+(hetNoMk?monthLabel(hetNoMk):'—')+'</td>'
        + '<td>'+(v.trangThai==='da_tra_het'?'Đã trả hết':'Đang vay')+'</td>'
        + '<td class="actions-col">'
        + (loanIsActive(v) ? '<button class="btn sm secondary" data-act="vnTatToan" data-id="'+v.id+'" title="Tất toán sớm toàn bộ khoản vay">Tất toán</button>' : '')
        + '<button class="icon-btn" data-act="vnEditVayNo" data-id="'+v.id+'">✎</button>'
        + '<button class="icon-btn" data-act="vnDelVayNo" data-id="'+v.id+'">🗑</button>'
        + '</td></tr>';
      if (state.vnDetailId === v.id){
        html += '<tr><td colspan="9">'+vayNoScheduleHtml(v)+'</td></tr>';
      }
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  var horizon = state.vnHorizon || 12;
  var startMk = monthKey(todayStr());
  var months = [];
  for (var i=0;i<horizon;i++) months.push(monthKeyAdd(startMk, i));
  var runningBal = balanceBeforeMonth(startMk);
  var rowsData = months.map(function(mk){
    var thu = tongThuThangCard(mk), chi = tongChiThangCard(mk);
    runningBal += thu - chi;
    return { mk:mk, thu:thu, chi:chi, bal: runningBal };
  });

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Dòng tiền tích lũy tương lai'
    + '<select id="vn_horizon" data-act="vnHorizonChange" style="width:auto;font-size:12px;padding:4px 8px">'
    + [6,12,24].map(function(h){ return '<option value="'+h+'"'+(h===horizon?' selected':'')+'>'+h+' tháng tới</option>'; }).join('')
    + '</select></h3>';
  html += '<div class="empty" style="padding:0 0 10px">Tháng hiện tại/qua khứ dùng số thực tế từ Sổ tay; tháng tương lai dùng gợi ý (TB 3 tháng hoặc chỉ tiêu). Riêng Trả nợ/Thu hồi cho vay (lấy thẳng từ lịch vay) và các danh mục có cờ "Cố định theo Chỉ tiêu": nếu tháng hiện tại chưa ghi Sổ tay thì vẫn hiện số biết trước.</div>';
  html += '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Tháng</th><th>Thu</th><th>Chi</th><th>Số dư lũy kế</th></tr></thead><tbody>';
  rowsData.forEach(function(r){
    html += '<tr><td style="text-align:left">'+monthLabel(r.mk)+'</td><td style="color:var(--green)">'+fmt(Math.round(r.thu))+'</td><td style="color:var(--red)">'+fmt(Math.round(r.chi))+'</td><td>'+fmt(Math.round(r.bal))+'</td></tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="chart-box" style="margin-top:10px"><canvas id="chartTichLuy"></canvas></div>';
  html += '</div>';

  root.innerHTML = html;
  drawTichLuyChart(rowsData);
}

function drawTichLuyChart(rowsData){
  if (chartTichLuy) chartTichLuy.destroy();
  var ctx = document.getElementById('chartTichLuy');
  if (!ctx) return;
  chartTichLuy = new Chart(ctx, { type:'line',
    data:{ labels: rowsData.map(function(r){ return monthLabel(r.mk); }), datasets:[
      { label:'Số dư lũy kế', data: rowsData.map(function(r){ return Math.round(r.bal); }), borderColor:'#4f46e5', backgroundColor:'rgba(79,70,229,.1)', fill:true, tension:.25 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ title:{display:true,text:'Số dư lũy kế dự kiến'}, legend:{display:false} }, scales:{ y:{ ticks:{ callback:function(v){ return v>=1000?(v/1000)+'k':v; } } } } }
  });
}

/* ---- xử lý sự kiện của tab Vay-Nợ ---- */
// trả về true nếu đã xử lý (để app.js biết không cần thử module khác)
function handleVayNoAction(act, el){
  if (act === 'vnAddChoVay'){
    state.vnFormKind = 'choVay'; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnAddVayNo'){
    state.vnFormKind = 'vayNoPhaiTra'; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnCancelForm'){
    state.vnFormKind = null; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnEditChoVay'){
    state.vnFormKind = 'choVay'; state.vnFormId = el.getAttribute('data-id'); renderVayNo();
  } else if (act === 'vnEditVayNo'){
    state.vnFormKind = 'vayNoPhaiTra'; state.vnFormId = el.getAttribute('data-id'); renderVayNo();
  } else if (act === 'vnSaveChoVay'){
    var tenCV = document.getElementById('vn_cv_ten').value.trim();
    if (!tenCV){ alert('Nhập tên khoản cho vay.'); return true; }
    var objCV = {
      ten: tenCV,
      soTien: numNonNeg(document.getElementById('vn_cv_soTien').value),
      ngayChoVay: document.getElementById('vn_cv_ngay').value || todayStr(),
      ngayDuKienThu: document.getElementById('vn_cv_ngayThu').value || ''
    };
    if (state.vnFormId){
      var oldCV = state.data.vayNo.choVay.find(function(x){ return x.id===state.vnFormId; });
      Object.assign(oldCV, objCV);
    } else {
      objCV.id = 'cv_' + slugify(tenCV) + '_' + Date.now().toString(36);
      objCV.daThu = 0;
      objCV.trangThai = 'dang_cho';
      state.data.vayNo.choVay.push(objCV);
    }
    state.vnFormKind = null; state.vnFormId = null;
    scheduleSave(); renderVayNo();
  } else if (act === 'vnSaveVayNo'){
    var tenVN = document.getElementById('vn_vn_ten').value.trim();
    if (!tenVN){ alert('Nhập tên khoản vay.'); return true; }
    var hinh = document.getElementById('vn_vn_hinh').value;
    var objVN = {
      ten: tenVN,
      loaiVay: document.getElementById('vn_vn_loai').value,
      hinhThuc: hinh,
      soTienGoc: numNonNeg(document.getElementById('vn_vn_soTien').value),
      ngayVay: document.getElementById('vn_vn_ngay').value || todayStr(),
      soThangVay: numNonNeg(document.getElementById('vn_vn_soThang').value),
      ngayDaoHan: document.getElementById('vn_vn_daoHan').value || '',
      laiSuatNam: numNonNeg(document.getElementById('vn_vn_laiSuat').value)
    };
    if (hinh === 'tra_1_lan' && !objVN.ngayDaoHan && !objVN.soThangVay){
      alert('Nhập ngày đáo hạn hoặc kỳ hạn (số tháng) cho khoản vay trả 1 lần.'); return true;
    }
    if (hinh !== 'tra_1_lan' && !objVN.soThangVay){
      alert('Nhập kỳ hạn (số tháng) trả.'); return true;
    }
    var daTraKyInput = Math.max(0, Math.floor(numNonNeg(document.getElementById('vn_vn_daTraKy').value)));
    var schVN = tinhLichTraNo(objVN);
    daTraKyInput = Math.min(daTraKyInput, schVN.length);
    var daTraGocCalc = 0;
    for (var iDK=0; iDK<daTraKyInput; iDK++) daTraGocCalc += schVN[iDK].goc;
    objVN.daTraGoc = daTraGocCalc;
    if (objVN.daTraGoc >= objVN.soTienGoc && objVN.soTienGoc > 0) objVN.trangThai = 'da_tra_het';
    if (state.vnFormId){
      var oldVN = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===state.vnFormId; });
      Object.assign(oldVN, objVN);
    } else {
      objVN.id = 'vn_' + slugify(tenVN) + '_' + Date.now().toString(36);
      objVN.trangThai = objVN.trangThai || 'dang_vay';
      state.data.vayNo.vayNoPhaiTra.push(objVN);
      if (objVN.soTienGoc > 0){
        var dateVN = objVN.ngayVay || todayStr();
        var eVN = state.data.journal[dateVN] || { thu:{}, chi:{}, ghiChu:'' };
        eVN.thu = eVN.thu || {};
        eVN.thu['nhanTienVay'] = num(eVN.thu['nhanTienVay']) + objVN.soTienGoc;
        eVN.ghiChu = eVN.ghiChu ? (eVN.ghiChu + '; Nhận tiền vay: '+objVN.ten) : ('Nhận tiền vay: '+objVN.ten);
        state.data.journal[dateVN] = eVN;
      }
    }
    state.vnFormKind = null; state.vnFormId = null;
    scheduleSave(); renderVayNo();
  } else if (act === 'vnDelChoVay'){
    var idDC = el.getAttribute('data-id');
    if (confirm('Xóa khoản cho vay này?')){
      state.data.vayNo.choVay = state.data.vayNo.choVay.filter(function(x){ return x.id!==idDC; });
      scheduleSave(); renderVayNo();
    }
  } else if (act === 'vnDelVayNo'){
    var idDV = el.getAttribute('data-id');
    if (confirm('Xóa khoản vay này?')){
      state.data.vayNo.vayNoPhaiTra = state.data.vayNo.vayNoPhaiTra.filter(function(x){ return x.id!==idDV; });
      scheduleSave(); renderVayNo();
    }
  } else if (act === 'vnToggleDetail'){
    var idTD = el.getAttribute('data-id');
    state.vnDetailId = (state.vnDetailId === idTD) ? null : idTD;
    renderVayNo();
  } else if (act === 'vnGhiNhanThu'){
    var idGT = el.getAttribute('data-id');
    var cvItem = state.data.vayNo.choVay.find(function(x){ return x.id===idGT; });
    if (!cvItem) return true;
    var conLaiGT = conLaiPhaiThu(cvItem);
    var amtStr = prompt('Số tiền đã thu được (còn phải thu: '+fmt(conLaiGT)+'):', conLaiGT);
    if (amtStr === null) return true;
    var amt = numNonNeg(amtStr);
    if (amt <= 0) return true;
    cvItem.daThu = num(cvItem.daThu) + amt;
    if (cvItem.daThu >= cvItem.soTien - 0.01) cvItem.trangThai = 'da_thu_du';
    var dateGT = todayStr();
    var eGT = state.data.journal[dateGT] || { thu:{}, chi:{}, ghiChu:'' };
    eGT.thu = eGT.thu || {};
    eGT.thu['thuHoiChoVay'] = num(eGT.thu['thuHoiChoVay']) + amt;
    eGT.ghiChu = eGT.ghiChu ? (eGT.ghiChu + '; Thu hồi: '+cvItem.ten) : ('Thu hồi: '+cvItem.ten);
    state.data.journal[dateGT] = eGT;
    scheduleSave(); renderVayNo();
  } else if (act === 'vnGhiNhanTra'){
    var idGTr = el.getAttribute('data-id');
    var vnItem = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idGTr; });
    if (!vnItem) return true;
    var gocKy = num(el.getAttribute('data-goc'));
    var tongKy = num(el.getAttribute('data-tong'));
    var amtStr2 = prompt('Số tiền trả kỳ này (gợi ý: '+fmt(Math.round(tongKy))+'):', Math.round(tongKy));
    if (amtStr2 === null) return true;
    var amt2 = numNonNeg(amtStr2);
    if (amt2 <= 0) return true;
    vnItem.daTraGoc = num(vnItem.daTraGoc) + gocKy;
    if (vnItem.daTraGoc >= vnItem.soTienGoc - 0.01) vnItem.trangThai = 'da_tra_het';
    var dateGTr = todayStr();
    var eGTr = state.data.journal[dateGTr] || { thu:{}, chi:{}, ghiChu:'' };
    eGTr.chi = eGTr.chi || {};
    eGTr.chi['traNo'] = num(eGTr.chi['traNo']) + amt2;
    eGTr.ghiChu = eGTr.ghiChu ? (eGTr.ghiChu + '; Trả nợ: '+vnItem.ten) : ('Trả nợ: '+vnItem.ten);
    state.data.journal[dateGTr] = eGTr;
    scheduleSave(); renderVayNo();
  } else if (act === 'vnTatToan'){
    var idTT = el.getAttribute('data-id');
    var vnTT = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idTT; });
    if (!vnTT) return true;
    var amtStrTT = prompt('Số tiền tất toán khoản "'+vnTT.ten+'" (nhập đúng số ngân hàng/bên cho vay báo, có thể khác số dư nợ lý thuyết):', '');
    if (amtStrTT === null) return true;
    var amtTT = numNonNeg(amtStrTT);
    if (amtTT <= 0){ alert('Nhập số tiền tất toán hợp lệ.'); return true; }
    vnTT.daTraGoc = vnTT.soTienGoc;
    vnTT.trangThai = 'da_tra_het';
    var dateTT = todayStr();
    var eTT = state.data.journal[dateTT] || { thu:{}, chi:{}, ghiChu:'' };
    eTT.chi = eTT.chi || {};
    eTT.chi['traNo'] = num(eTT.chi['traNo']) + amtTT;
    eTT.ghiChu = eTT.ghiChu ? (eTT.ghiChu + '; Tất toán: '+vnTT.ten) : ('Tất toán: '+vnTT.ten);
    state.data.journal[dateTT] = eTT;
    scheduleSave(); renderVayNo();
  } else {
    return false;
  }
  return true;
}

function handleVayNoChange(el){
  if (el.matches('[data-act=vnHorizonChange]')){
    state.vnHorizon = parseInt(el.value, 10);
    renderVayNo();
    return true;
  }
  return false;
}
