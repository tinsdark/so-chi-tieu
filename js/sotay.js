"use strict";
/* ====================================================================
   sotay.js — tab "Sổ tay": nhập/sửa/xóa giao dịch theo ngày, tìm kiếm/lọc,
   xuất Excel, và các biểu đồ chi tiêu trong tháng.
   Cần state.js, drive-sync.js, vayno.js (conLaiPhaiThu, loanIsActive, tienDoTraNo) load trước.
   ==================================================================== */

var chartDonut=null, chartDonutThu=null, chartDay=null, chartMonth=null;

/* Hai danh mục này CHỈ được sinh ra từ tab Vay - Nợ (tạo khoản vay / khoản cho vay)
   rồi tự hạch toán sang Sổ tay. Nhập tay ở đây sẽ tạo tiền mồ côi không gắn với
   khoản nào, sửa/xóa khoản vay không hoàn lại được -> khóa ô.
   Ngoại lệ: ngày đang sửa đã có số nhập tay (dữ liệu cũ) thì vẫn mở để xóa đi được. */
var VN_ONLY_THU = { nhanTienVay: 1 };
var VN_ONLY_CHI = { choVay: 1 };

// danh sách các tháng có giao dịch + tháng đang xem + tháng hiện tại, mới nhất trước
function soTayMonthList(){
  var set = {};
  sortedJournalDates().forEach(function(d){ set[monthKey(d)] = true; });
  set[state.soTayMonth] = true;
  set[monthKey(todayStr())] = true;
  return Object.keys(set).sort().reverse();
}

// xuất toàn bộ Sổ tay ra file Excel (dùng để backup thủ công)
function exportExcel(){
  var thuCats = state.data.categories.thu;
  var chiCats = state.data.categories.chi;
  var dates = sortedJournalDates();
  var header = ['Ngày'];
  thuCats.forEach(function(c){ header.push('Thu: '+c.ten); });
  chiCats.forEach(function(c){ header.push('Chi: '+c.ten); });
  header.push('Tổng thu','Tổng chi','Số dư cuối ngày','Ghi chú');
  var rows = [header];
  dates.forEach(function(d){
    var e = state.data.journal[d];
    var row = [d];
    thuCats.forEach(function(c){ row.push(num((e.thu||{})[c.id]) || ''); });
    chiCats.forEach(function(c){ row.push(num((e.chi||{})[c.id]) || ''); });
    row.push(thuTotal(e), chiTotal(e), balanceAt(d), e.ghiChu||'');
    rows.push(row);
  });
  var ws = XLSX.utils.aoa_to_sheet(rows);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'So tay');
  XLSX.writeFile(wb, 'so-chi-tieu_' + todayStr() + '.xlsx');
}

/* ---- Sổ tay ---- */
function renderSoTay(){
  var root = document.getElementById('tabContent');
  if (!state.soTayMonth) state.soTayMonth = monthKey(todayStr());
  var mk = state.soTayMonth;
  var dates = sortedJournalDates();
  var monthDates = dates.filter(function(d){ return monthKey(d) === mk; }).sort();

  var tongThu = 0, tongChi = 0;
  monthDates.forEach(function(d){
    var e = state.data.journal[d];
    tongThu += thuTotal(e);
    tongChi += chiTotal(e);
  });
  // tháng hoàn toàn trước mốc khóa sổ (ngayBatDau) thì không còn tính vào số dư nữa -> hiện "—"
  var startMk = (state.data.settings.ngayBatDau || '').slice(0,7);
  var beforeLock = startMk && mk < startMk;
  var duDauThang = beforeLock ? null : balanceBeforeMonth(mk);
  var duCuoiThang = beforeLock ? null : (duDauThang + tongThu - tongChi);

  var thuCats = state.data.categories.thu;
  var cats = state.data.categories.chi;
  var editEntry = state.editingDate ? (state.data.journal[state.editingDate] || blankEntry()) : blankEntry();
  var editDate = state.editingDate || todayStr();
  // phần tiền trong ngày đang sửa mà do khoản vay/cho vay sinh ra: KHÓA, không cho sửa tay
  // (sửa ở đây thì số ở Sổ tay và tiến độ khoản vay lệch nhau ngay)
  var hasRefs = state.editingDate && (editEntry.refs||[]).length > 0;

  var html = '';
  html += '<div class="grid-summary">'
    + '<div class="stat"><div class="lbl">Số dư đầu tháng</div><div class="val">'+(beforeLock?'—':fmt(duDauThang))+'</div></div>'
    + '<div class="stat thu"><div class="lbl">Tổng thu tháng</div><div class="val">'+fmt(tongThu)+'</div></div>'
    + '<div class="stat chi"><div class="lbl">Tổng chi tháng</div><div class="val">'+fmt(tongChi)+'</div></div>'
    + '<div class="stat gold"><div class="lbl">Số dư cuối tháng</div><div class="val">'+(beforeLock?'—':fmt(duCuoiThang))+'</div></div>'
    + '</div>';
  if (beforeLock){
    html += '<div class="empty" style="margin-top:-6px">Tháng này trước mốc khóa sổ ('+state.data.settings.ngayBatDau+') nên không còn tính vào số dư — dữ liệu vẫn xem được bên dưới.</div>';
  }

  var monthOpts = soTayMonthList().map(function(m){
    return '<option value="'+m+'"'+(m===mk?' selected':'')+'>'+monthLabel(m)+'</option>';
  }).join('');
  html += '<div class="month-nav">'
    + '<button data-act="prevMonth">‹</button>'
    + '<select data-act="jumpMonth">'+monthOpts+'</select>'
    + '<button data-act="nextMonth">›</button>'
    + '</div>';

  // Entry form
  html += '<div class="card"><h3>'+(state.editingDate? 'Sửa ngày '+editDate : 'Thêm / cập nhật giao dịch')+'</h3>';
  html += '<div class="form-row">';
  html += '<div><label>Ngày</label><input type="date" id="f_date" value="'+editDate+'"></div>';
  html += '</div>';
  html += '<label style="margin-top:4px">Các khoản thu theo danh mục</label>';
  html += '<div class="form-row">';
  if (!thuCats.length){
    html += '<div class="empty">Chưa có danh mục thu — thêm ở tab "Danh mục".</div>';
  }
  thuCats.forEach(function(c){
    var lockThu = hasRefs ? entryRefSum(editEntry, 'thu', c.id) : 0;
    var vt = num((editEntry.thu||{})[c.id]) - lockThu;
    if (vt <= 0) vt = '';
    var roThu = !!VN_ONLY_THU[c.id] && !vt;
    html += '<div><label>'+c.ten
      + (lockThu > 0 ? ' <span style="color:var(--muted);font-weight:400">(+'+fmt(Math.round(lockThu))+' khóa từ Vay-Nợ)</span>' : '')
      + '</label><input type="number" class="f_thu" data-cat="'+c.id+'" data-lock="'+lockThu+'" value="'+(vt||'')+'" placeholder="0" min="0"'
      + (roThu ? ' readonly tabindex="-1" style="background:var(--bg);color:var(--muted)" title="Danh mục này chỉ ghi được từ tab Vay - Nợ"' : '')
      + '>';
    if (VN_ONLY_THU[c.id]){
      html += '<div class="empty" style="padding:2px 0 0;font-size:11px;text-align:left">'
        + (roThu ? 'Ghi ở tab Vay - Nợ (thêm khoản vay) — tự hạch toán sang đây.'
                 : '⚠ Số này nhập tay, không gắn khoản vay nào. Nên xóa và tạo khoản ở tab Vay - Nợ.')
        + '</div>';
    }
    if (c.id === 'thuHoiChoVay' && !state.editingDate){
      var pendingCV = (state.data.vayNo.choVay||[]).filter(function(l){ return l.trangThai !== 'da_thu_du' && conLaiPhaiThu(l) > 0.01; });
      if (pendingCV.length){
        html += '<select id="sotay_selChoVay" data-act="soTayChonChoVay" style="margin-top:4px;width:100%;font-size:12px">'
          + '<option value="">— chọn khoản cho vay (tùy chọn) —</option>'
          + pendingCV.map(function(l){ return '<option value="'+l.id+'">'+l.ten+' (còn '+fmt(conLaiPhaiThu(l))+')</option>'; }).join('')
          + '</select>';
      }
    }
    html += '</div>';
  });
  html += '</div>';
  html += '<label style="margin-top:4px">Các khoản chi theo danh mục</label>';
  html += '<div class="form-row">';
  if (!cats.length){
    html += '<div class="empty">Chưa có danh mục chi — thêm ở tab "Danh mục".</div>';
  }
  cats.forEach(function(c){
    var lockChi = hasRefs ? entryRefSum(editEntry, 'chi', c.id) : 0;
    var v = num((editEntry.chi||{})[c.id]) - lockChi;
    if (v <= 0) v = '';
    var roChi = !!VN_ONLY_CHI[c.id] && !v;
    html += '<div><label>'+c.ten
      + (lockChi > 0 ? ' <span style="color:var(--muted);font-weight:400">(+'+fmt(Math.round(lockChi))+' khóa từ Vay-Nợ)</span>' : '')
      + '</label><input type="number" class="f_chi" data-cat="'+c.id+'" data-lock="'+lockChi+'" value="'+(v||'')+'" placeholder="0" min="0"'
      + (roChi ? ' readonly tabindex="-1" style="background:var(--bg);color:var(--muted)" title="Danh mục này chỉ ghi được từ tab Vay - Nợ"' : '')
      + '>';
    if (VN_ONLY_CHI[c.id]){
      html += '<div class="empty" style="padding:2px 0 0;font-size:11px;text-align:left">'
        + (roChi ? 'Ghi ở tab Vay - Nợ (thêm khoản cho vay) — tự hạch toán sang đây.'
                 : '⚠ Số này nhập tay, không gắn khoản cho vay nào. Nên xóa và tạo khoản ở tab Vay - Nợ.')
        + '</div>';
    }
    if (c.id === 'traNo' && !state.editingDate){
      // chỉ hiện khoản vay còn kỳ CHƯA ĐÓNG — khoản đã đóng hết kỳ mà vẫn cho chọn
      // thì sinh ra bản ghi trả nợ khống (P0-3)
      var activeVN = (state.data.vayNo.vayNoPhaiTra||[]).filter(function(l){
        return loanIsActive(l) && !l.tatToan && tienDoTraNo(l).kyTiepIdx >= 0;
      });
      if (activeVN.length){
        html += '<select id="sotay_selVayNo" data-act="soTayChonVayNo" style="margin-top:4px;width:100%;font-size:12px">'
          + '<option value="">— chọn khoản vay (tùy chọn) —</option>'
          + activeVN.map(function(l){
              var td = tienDoTraNo(l);
              var thieu = conThieuKy(l, td.kyTiepIdx, td.sch);
              return '<option value="'+l.id+'">'+l.ten+' ('+td.daTraKy+'/'+td.tongKy+' kỳ, kỳ '+(td.kyTiepIdx+1)+' còn '+fmt(Math.round(thieu))+')</option>';
            }).join('')
          + '</select>';
      }
    }
    html += '</div>';
  });
  html += '</div>';
  if (hasRefs){
    html += '<div class="empty" style="padding:0 0 4px">Ngày này có giao dịch do khoản vay/cho vay sinh ra (phần "khóa"). Ô nhập chỉ chứa phần nhập tay; phần khóa muốn sửa thì vào tab Vay - Nợ.</div>';
  }
  html += '<label>Nội dung</label><input type="text" id="f_ghichu" value="'+(editEntry.ghiChu||'').replace(/"/g,'&quot;')+'" placeholder="Ghi chú...">';
  html += '<div style="margin-top:12px;display:flex;gap:8px">';
  html += '<button class="btn" data-act="saveEntry">'+(state.editingDate?'Cập nhật':'Lưu')+'</button>';
  if (state.editingDate) html += '<button class="btn secondary" data-act="cancelEdit">Hủy</button>';
  html += '</div></div>';

  // Table + tìm kiếm/lọc
  var hasRange = !!(state.soTayFrom && state.soTayTo);
  var baseDates = hasRange ? dates.filter(function(d){ return d >= state.soTayFrom && d <= state.soTayTo; }) : monthDates;
  var kw = (state.soTaySearch||'').trim().toLowerCase();
  var displayDates = kw ? baseDates.filter(function(d){ return (state.data.journal[d].ghiChu||'').toLowerCase().indexOf(kw) !== -1; }) : baseDates;
  var filterActive = !!(state.soTaySearch || state.soTayFrom || state.soTayTo);

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Chi tiết theo ngày <button class="btn secondary sm" data-act="exportExcel">⬇ Xuất Excel</button></h3>';
  html += '<div class="search-row">'
    + '<div class="fld"><label>Tìm nội dung</label><input type="text" data-act="soTaySearchInput" value="'+(state.soTaySearch||'').replace(/"/g,'&quot;')+'" placeholder="Từ khóa trong ghi chú..."></div>'
    + '<div class="fld"><label>Từ ngày</label><input type="date" data-act="soTayFromInput" value="'+(state.soTayFrom||'')+'"></div>'
    + '<div class="fld"><label>Đến ngày</label><input type="date" data-act="soTayToInput" value="'+(state.soTayTo||'')+'"></div>'
    + (filterActive ? '<div class="fld" style="flex:0"><label>&nbsp;</label><button class="btn secondary sm" data-act="soTayClearFilter">Xóa lọc</button></div>' : '')
    + '</div>';
  if (hasRange){
    html += '<div class="empty" style="padding:0 0 8px">Đang lọc theo khoảng ngày ('+state.soTayFrom+' → '+state.soTayTo+'), bảng dưới không theo tháng đang chọn ở trên nữa.</div>';
  }
  html += '<div class="table-wrap">';
  if (!displayDates.length){
    html += '<div class="empty">'+(filterActive ? 'Không có giao dịch khớp với bộ lọc.' : 'Chưa có giao dịch trong tháng này.')+'</div>';
  } else {
    html += '<table><thead><tr><th>Ngày</th><th>Thu</th><th>Chi</th><th>Số dư</th><th>Nội dung</th><th class="actions-col"></th></tr></thead><tbody>';
    var tableDates = displayDates.slice().sort().reverse();
    tableDates.forEach(function(d){
      var e = state.data.journal[d];
      html += '<tr>'
        + '<td>'+d.slice(8,10)+'/'+d.slice(5,7)+(hasRange?'/'+d.slice(0,4):'')+'</td>'
        + '<td style="color:var(--green)">'+(thuTotal(e)?fmt(thuTotal(e)):'')+'</td>'
        + '<td style="color:var(--red)">'+(chiTotal(e)?fmt(chiTotal(e)):'')+'</td>'
        + '<td>'+fmt(balanceAt(d))+'</td>'
        + '<td style="text-align:left;white-space:normal">'+(e.ghiChu||'')+'</td>'
        + '<td class="actions-col"><button class="icon-btn" data-act="editDay" data-date="'+d+'">✎</button><button class="icon-btn" data-act="delDay" data-date="'+d+'">🗑</button></td>'
        + '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  // Charts
  html += '<div class="card"><h3>Biểu đồ chi tiêu</h3><div class="charts-grid">'
    + '<div class="chart-box"><canvas id="chartDonut"></canvas></div>'
    + '<div class="chart-box"><canvas id="chartDonutThu"></canvas></div>'
    + '<div class="chart-box"><canvas id="chartDay"></canvas></div>'
    + '<div class="chart-box full"><canvas id="chartMonth"></canvas></div>'
    + '</div></div>';

  root.innerHTML = html;
  drawCharts(mk, monthDates, cats);
}

function drawCharts(mk, monthDates, cats){
  // 1. donut chi theo danh mục
  var byCat = {};
  cats.forEach(function(c){ byCat[c.id] = 0; });
  monthDates.forEach(function(d){
    var e = state.data.journal[d];
    Object.keys(e.chi||{}).forEach(function(cid){ byCat[cid] = (byCat[cid]||0) + num(e.chi[cid]); });
  });
  var labels1 = [], vals1 = [];
  cats.forEach(function(c){ if (byCat[c.id] > 0){ labels1.push(c.ten); vals1.push(byCat[c.id]); } });
  var palette = ['#4f46e5','#16a34a','#d97706','#dc2626','#0891b2','#9333ea','#ca8a04','#db2777'];
  if (chartDonut) chartDonut.destroy();
  var ctx1 = document.getElementById('chartDonut');
  if (ctx1){
    chartDonut = new Chart(ctx1, { type:'doughnut',
      data:{ labels: labels1.length?labels1:['Chưa có dữ liệu'], datasets:[{ data: vals1.length?vals1:[1], backgroundColor: vals1.length?palette:['#e5e7eb'] }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ title:{display:true,text:'Chi theo danh mục (tháng)'}, legend:{position:'bottom', labels:{boxWidth:10,font:{size:10}}} } }
    });
  }

  // 1b. donut thu theo danh mục
  var catsThu = state.data.categories.thu;
  var byCatThu = {};
  catsThu.forEach(function(c){ byCatThu[c.id] = 0; });
  monthDates.forEach(function(d){
    var e = state.data.journal[d];
    Object.keys(e.thu||{}).forEach(function(cid){ byCatThu[cid] = (byCatThu[cid]||0) + num(e.thu[cid]); });
  });
  var labels1b = [], vals1b = [];
  catsThu.forEach(function(c){ if (byCatThu[c.id] > 0){ labels1b.push(c.ten); vals1b.push(byCatThu[c.id]); } });
  if (chartDonutThu) chartDonutThu.destroy();
  var ctx1b = document.getElementById('chartDonutThu');
  if (ctx1b){
    chartDonutThu = new Chart(ctx1b, { type:'doughnut',
      data:{ labels: labels1b.length?labels1b:['Chưa có dữ liệu'], datasets:[{ data: vals1b.length?vals1b:[1], backgroundColor: vals1b.length?palette:['#e5e7eb'] }]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ title:{display:true,text:'Thu theo danh mục (tháng)'}, legend:{position:'bottom', labels:{boxWidth:10,font:{size:10}}} } }
    });
  }

  // 2. bar thu/chi theo ngày trong tháng
  var days = [], thuArr = [], chiArr = [];
  monthDates.forEach(function(d){
    var e = state.data.journal[d];
    days.push(d.slice(8,10));
    thuArr.push(thuTotal(e));
    chiArr.push(chiTotal(e));
  });
  if (chartDay) chartDay.destroy();
  var ctx2 = document.getElementById('chartDay');
  if (ctx2){
    chartDay = new Chart(ctx2, { type:'bar',
      data:{ labels: days, datasets:[
        { label:'Thu', data: thuArr, backgroundColor:'#16a34a' },
        { label:'Chi', data: chiArr, backgroundColor:'#dc2626' }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ title:{display:true,text:'Thu / Chi theo ngày'}, legend:{position:'bottom'} }, scales:{ y:{ ticks:{ callback:function(v){ return v>=1000?(v/1000)+'k':v; } } } } }
    });
  }

  // 3. bar thu/chi theo tháng (cả năm của tháng đang xem)
  var year = mk.slice(0,4);
  var mLabels=[], mThu=[], mChi=[];
  for (var m=1;m<=12;m++){
    var key = year+'-'+pad2(m);
    var t=0,c=0;
    Object.keys(state.data.journal).forEach(function(d){
      if (monthKey(d) === key){ var e=state.data.journal[d]; t+=thuTotal(e); c+=chiTotal(e); }
    });
    mLabels.push(MONTH_NAMES[m-1]); mThu.push(t); mChi.push(c);
  }
  if (chartMonth) chartMonth.destroy();
  var ctx3 = document.getElementById('chartMonth');
  if (ctx3){
    chartMonth = new Chart(ctx3, { type:'bar',
      data:{ labels:mLabels, datasets:[
        { label:'Thu', data:mThu, backgroundColor:'#16a34a' },
        { label:'Chi', data:mChi, backgroundColor:'#dc2626' }
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ title:{display:true,text:'Thu / Chi theo tháng — '+year}, legend:{position:'bottom'} }, scales:{ y:{ ticks:{ callback:function(v){ return v>=1000?(v/1000)+'k':v; } } } } }
    });
  }
}

/* ---- Sổ tay: handlers ---- */
function handleSoTayAction(act, el){
  if (act === 'prevMonth' || act === 'nextMonth'){
    var p = state.soTayMonth.split('-'); var y=parseInt(p[0],10), m=parseInt(p[1],10);
    m += (act==='nextMonth'?1:-1);
    if (m<1){m=12;y--;} if (m>12){m=1;y++;}
    state.soTayMonth = y+'-'+pad2(m);
    renderSoTay();
  } else if (act === 'saveEntry'){
    var date = document.getElementById('f_date').value || todayStr();
    var ghiChu = document.getElementById('f_ghichu').value;
    var wasEditing = !!state.editingDate;
    var selCV = document.getElementById('sotay_selChoVay');
    var selVN = document.getElementById('sotay_selVayNo');
    var cvIdSel = (!wasEditing && selCV) ? selCV.value : '';
    var vnIdSel = (!wasEditing && selVN) ? selVN.value : '';
    // data-lock = phần tiền do khoản vay sinh ra, ô nhập chỉ chứa phần nhập tay -> cộng lại
    var thu = {};
    document.querySelectorAll('.f_thu').forEach(function(inp){
      var v = numNonNeg(inp.value) + num(inp.getAttribute('data-lock'));
      if (v) thu[inp.getAttribute('data-cat')] = v;
    });
    var chi = {};
    document.querySelectorAll('.f_chi').forEach(function(inp){
      var v = numNonNeg(inp.value) + num(inp.getAttribute('data-lock'));
      if (v) chi[inp.getAttribute('data-cat')] = v;
    });
    if (state.editingDate){
      var oldE = state.data.journal[date] || blankEntry();
      // GIỮ refs: ghi đè cả entry là làm mồ côi liên kết với khoản vay -> số dư/tiến độ lệch
      state.data.journal[date] = { thu: thu, chi: chi, ghiChu: ghiChu, refs: oldE.refs || [] };
    } else if (state.data.journal[date]){
      var existing = state.data.journal[date];
      existing.thu = (existing.thu && typeof existing.thu === 'object') ? existing.thu : {};
      Object.keys(thu).forEach(function(cid){
        existing.thu[cid] = num(existing.thu[cid]) + thu[cid];
      });
      existing.chi = existing.chi || {};
      Object.keys(chi).forEach(function(cid){
        existing.chi[cid] = num(existing.chi[cid]) + chi[cid];
      });
      existing.refs = existing.refs || [];
      if (ghiChu) existing.ghiChu = existing.ghiChu ? (existing.ghiChu + '; ' + ghiChu) : ghiChu;
    } else {
      state.data.journal[date] = { thu: thu, chi: chi, ghiChu: ghiChu, refs: [] };
    }
    if (cvIdSel && thu['thuHoiChoVay']){
      var cvApply = state.data.vayNo.choVay.find(function(x){ return x.id===cvIdSel; });
      if (cvApply){
        cvApply.daThu = num(cvApply.daThu) + thu['thuHoiChoVay'];
        if (cvApply.daThu >= cvApply.soTien - 0.01) cvApply.trangThai = 'da_thu_du';
        journalTagRef(date, cvApply.id, 'thuHoiChoVay', thu['thuHoiChoVay']);
      }
    }
    // CHỈ ghi nhận trả nợ khi thực sự có nhập tiền vào danh mục "Trả nợ", và ghi đúng
    // SỐ ĐÃ NHẬP vào kỳ tiếp theo (trước đây chọn khoản vay mà không nhập tiền vẫn
    // cộng tiến độ 1 kỳ -> trả nợ khống)
    if (vnIdSel && chi['traNo']){
      var vnApply = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===vnIdSel; });
      if (vnApply){
        var tdApply = tienDoTraNo(vnApply);
        if (tdApply.kyTiepIdx >= 0){
          var kyAp = tdApply.kyTiepIdx;
          var thieuAp = conThieuKy(vnApply, kyAp, tdApply.sch);
          // trả ít hơn lịch -> hỏi ngay: xong kỳ (bỏ qua phần thiếu) hay còn nợ tiếp
          var dongKyAp = true;
          if (chi['traNo'] < thieuAp - 1){
            dongKyAp = confirm('Trả '+fmt(Math.round(chi['traNo']))+' cho kỳ '+(kyAp+1)+' của "'+vnApply.ten+'", vẫn thiếu '
              + fmt(Math.round(thieuAp - chi['traNo']))+' so với lịch.\n\n'
              + 'OK = coi kỳ này ĐÃ THANH TOÁN XONG (phần thiếu tính vào chênh lệch)\n'
              + 'Hủy = kỳ này CÒN NỢ TIẾP (phần thiếu vẫn nằm trong dư nợ)');
          }
          var ridAp = 'r' + kyAp + '_' + Date.now().toString(36);
          vnApply.traNo = vnApply.traNo || [];
          vnApply.traNo.push({ rid: ridAp, ky: kyAp, mk: tdApply.sch[kyAp].mk, soTien: chi['traNo'], ngay: date, dongKy: dongKyAp });
          journalTagRef(date, vnApply.id, 'traNo', chi['traNo'], { ky: kyAp, rid: ridAp });
          if (soTienConLaiPhaiTra(vnApply) <= 0.01) vnApply.trangThai = 'da_tra_het';
        }
      }
    } else if (vnIdSel && !chi['traNo']){
      alert('Đã chọn khoản vay nhưng chưa nhập số tiền ở danh mục "Trả nợ" — không ghi nhận kỳ trả nào.');
    }
    state.editingDate = null;
    scheduleSave();
    renderSoTay();
  } else if (act === 'cancelEdit'){
    state.editingDate = null;
    renderSoTay();
  } else if (act === 'editDay'){
    state.editingDate = el.getAttribute('data-date');
    renderSoTay();
    window.scrollTo({top:0, behavior:'smooth'});
  } else if (act === 'delDay'){
    var d = el.getAttribute('data-date');
    var eDel = state.data.journal[d];
    if (!eDel) return true;
    var refsDel = eDel.refs || [];
    // giao dịch GỐC của khoản vay (nhận tiền vay / cho vay) không được xóa từ đây:
    // xóa thì khoản vay vẫn còn mà tiền thì bốc hơi -> số dư sai
    var goc = refsDel.filter(function(r){ return r.loai === 'nhanTienVay' || r.loai === 'choVay'; });
    if (goc.length){
      alert('Ngày này chứa giao dịch gốc của khoản vay/cho vay ('
        + goc.map(function(r){ return REF_LABEL[r.loai]; }).join(', ')
        + '). Muốn bỏ thì xóa/sửa chính khoản đó ở tab "Vay - Nợ", không xóa từ Sổ tay.');
      return true;
    }
    var msgDel = 'Xóa giao dịch ngày '+d+'?';
    if (refsDel.length){
      msgDel += '\n\nNgày này có '+refsDel.length+' giao dịch gắn với khoản vay, xóa sẽ hoàn tác luôn ở tab Vay - Nợ:\n'
        + refsDel.map(function(r){
            return '  ' + (REF_LABEL[r.loai]||r.loai) + ' · ' + fmt(r.soTien)
                 + (r.ky != null ? ' (kỳ '+(num(r.ky)+1)+' → về chưa trả)' : '');
          }).join('\n');
    }
    if (confirm(msgDel)){
      refsDel.forEach(function(r){ loanRevertRef(r); });
      delete state.data.journal[d];
      scheduleSave();
      renderSoTay();
    }
  } else if (act === 'exportExcel'){
    exportExcel();
  } else if (act === 'soTayClearFilter'){
    state.soTaySearch = ''; state.soTayFrom = ''; state.soTayTo = '';
    renderSoTay();
  } else {
    return false;
  }
  return true;
}

function handleSoTayChange(el){
  if (el.matches('[data-act=jumpMonth]')){
    state.soTayMonth = el.value;
    renderSoTay();
    return true;
  } else if (el.matches('[data-act=soTayChonChoVay]')){
    var cvId = el.value;
    var inpThu = document.querySelector('.f_thu[data-cat=thuHoiChoVay]');
    if (cvId && inpThu){
      var cvSel = state.data.vayNo.choVay.find(function(x){ return x.id===cvId; });
      if (cvSel) inpThu.value = Math.round(conLaiPhaiThu(cvSel));
    }
    return true;
  } else if (el.matches('[data-act=soTayChonVayNo]')){
    var vnId = el.value;
    var inpChi = document.querySelector('.f_chi[data-cat=traNo]');
    if (vnId && inpChi){
      var vnSel = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===vnId; });
      if (vnSel){
        var tdSel = tienDoTraNo(vnSel);
        if (tdSel.kyTiepTheo) inpChi.value = Math.round(tdSel.kyTiepTheo.tongTra);
      }
    }
    return true;
  } else if (el.matches('[data-act=soTaySearchInput]')){
    state.soTaySearch = el.value;
    renderSoTay();
    return true;
  } else if (el.matches('[data-act=soTayFromInput]')){
    state.soTayFrom = el.value;
    renderSoTay();
    return true;
  } else if (el.matches('[data-act=soTayToInput]')){
    state.soTayTo = el.value;
    renderSoTay();
    return true;
  }
  return false;
}
