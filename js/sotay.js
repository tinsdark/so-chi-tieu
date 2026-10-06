"use strict";
/* ====================================================================
   sotay.js — tab "Sổ tay": nhập/sửa/xóa giao dịch theo ngày, tìm kiếm/lọc,
   xuất Excel, và các biểu đồ chi tiêu trong tháng.
   Cần state.js, drive-sync.js, vayno.js (conLaiPhaiThu, loanIsActive, tienDoTraNo) load trước.
   ==================================================================== */

var chartDonut=null, chartDonutThu=null, chartDay=null, chartMonth=null, chartBal=null;

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

  html += dinhKyDenHanHtml();
  html += hanMucThangHtml(mk);
  html += viSoDuCardHtml(mk);

  // Entry form
  // id=formGiaoDich: mốc để nút FAB cuộn tới (data-act="fabAdd")
  html += '<div class="card" id="formGiaoDich"><h3>'+(state.editingDate? 'Sửa ngày '+editDate : 'Thêm / cập nhật giao dịch')+'</h3>';
  html += '<div class="form-row">';
  html += '<div><label>Ngày</label><input type="date" id="f_date" value="'+editDate+'"></div>';
  // chọn ví chỉ cho thêm MỚI: sửa 1 ngày cũ không biết dòng nào của ví nào, nên ví từng dòng
  // chỉnh ở bảng chi tiết. Khoản vay/cho vay luôn đi theo ví của chính khoản đó.
  if ((state.data.wallets || []).length > 1 && !state.editingDate){
    html += '<div><label>Ví / nguồn tiền</label><select id="f_wallet">'
      + viOptionsHtml(walletById(state.viChon) ? state.viChon : viMacDinhId()) + '</select></div>';
  }
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
      + '</label><input type="text" inputmode="numeric" autocomplete="off" class="money f_thu" data-cat="'+c.id+'" data-lock="'+lockThu+'" value="'+veSo(vt)+'" placeholder="0"'
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
      + '</label><input type="text" inputmode="numeric" autocomplete="off" class="money f_chi" data-cat="'+c.id+'" data-lock="'+lockChi+'" value="'+veSo(v)+'" placeholder="0"'
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
  // tìm cả trong nội dung từng dòng chi tiết, không chỉ ghi chú chung của ngày
  var displayDates = kw ? baseDates.filter(function(d){
    var ed = state.data.journal[d];
    if ((ed.ghiChu||'').toLowerCase().indexOf(kw) !== -1) return true;
    return entryItems(ed).some(function(it){ return (it.ghiChu||'').toLowerCase().indexOf(kw) !== -1; });
  }) : baseDates;
  // lọc theo danh mục: giữ ngày có phát sinh ở danh mục đó (tiền nằm ở bucket thu/chi của ngày)
  var catSel = (state.soTayCat || '').split(':');
  if (catSel.length === 2 && catSel[1]){
    displayDates = displayDates.filter(function(d){
      return num((state.data.journal[d][catSel[0]] || {})[catSel[1]]) > 0;
    });
  }
  var filterActive = !!(state.soTaySearch || state.soTayFrom || state.soTayTo || state.soTayCat);

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Chi tiết theo ngày <button class="btn secondary sm" data-act="exportExcel">⬇ Xuất Excel</button></h3>';
  html += '<div class="search-row">'
    + '<div class="fld"><label>Tìm nội dung</label><input type="text" data-act="soTaySearchInput" value="'+(state.soTaySearch||'').replace(/"/g,'&quot;')+'" placeholder="Từ khóa trong ghi chú..."></div>'
    + '<div class="fld"><label>Danh mục</label><select data-act="soTayCatInput">'+soTayCatOptions(state.soTayCat)+'</select></div>'
    + '<div class="fld"><label>Từ ngày</label><input type="date" data-act="soTayFromInput" value="'+(state.soTayFrom||'')+'"></div>'
    + '<div class="fld"><label>Đến ngày</label><input type="date" data-act="soTayToInput" value="'+(state.soTayTo||'')+'"></div>'
    + (filterActive ? '<div class="fld" style="flex:0"><label>&nbsp;</label><button class="btn secondary sm" data-act="soTayClearFilter">Xóa lọc</button></div>' : '')
    + '</div>';
  if (hasRange){
    html += '<div class="empty" style="padding:0 0 8px">Đang lọc theo khoảng ngày ('+state.soTayFrom+' → '+state.soTayTo+'), bảng dưới không theo tháng đang chọn ở trên nữa.</div>';
  }
  if (catSel.length === 2 && catSel[1] && displayDates.length){
    var tongCat = 0;
    displayDates.forEach(function(d){ tongCat += num((state.data.journal[d][catSel[0]] || {})[catSel[1]]); });
    html += '<div class="empty" style="padding:0 0 8px">'+displayDates.length+' ngày có '
      + (catSel[0] === 'thu' ? 'thu' : 'chi') + ' "'+esc(catTenTheoId(catSel[0], catSel[1]))+'" · tổng '
      + '<b style="color:var(--'+(catSel[0] === 'thu' ? 'green' : 'red')+')">'+fmt(Math.round(tongCat))+'</b></div>';
  }
  html += '<div class="table-wrap">';
  if (!displayDates.length){
    html += filterActive
      ? '<div class="empty-box"><span class="ico">🔍</span>Không có giao dịch khớp với bộ lọc.'
        + '<div><button class="btn secondary sm" data-act="soTayClearFilter">Xóa lọc</button></div></div>'
      : '<div class="empty-box"><span class="ico">📝</span>Chưa có giao dịch trong '+monthLabel(mk)+'.'
        + '<div><button class="btn" data-act="fabAdd">+ Ghi khoản đầu tiên</button></div></div>';
  } else {
    // class t-card: ở <=700px CSS đổi bảng này (và CHỈ bảng này) thành danh sách thẻ
    html += '<table class="t-card"><thead><tr><th>Ngày</th><th>Thu</th><th>Chi</th><th>Số dư</th><th>Nội dung</th><th class="actions-col"></th></tr></thead><tbody>';
    var tableDates = displayDates.slice().sort().reverse();
    tableDates.forEach(function(d){
      var e = state.data.journal[d];
      var moRong = (state.soTayDetailDate === d);
      var soDong = entryItems(e).length + (e.refs||[]).length;
      // data-th: nhãn cột, dùng cho td::before khi bảng thành thẻ trên mobile
      html += '<tr class="st-row'+(moRong?' st-open':'')+'">'
        + '<td class="st-c-day" style="text-align:left"><a href="#" class="st-day" data-act="stToggleDetail" data-date="'+d+'" title="Xem chi tiết từng giao dịch">'
          + '<span class="st-caret">'+(moRong?'▾':'▸')+'</span> '
          + d.slice(8,10)+'/'+d.slice(5,7)+(hasRange?'/'+d.slice(0,4):'')
          + (soDong?' <span class="st-count">'+soDong+'</span>':'')
          + '</a></td>'
        + '<td data-th="Thu" style="color:var(--green)">'+(thuTotal(e)?fmt(thuTotal(e)):'')+'</td>'
        + '<td data-th="Chi" style="color:var(--red)">'+(chiTotal(e)?fmt(chiTotal(e)):'')+'</td>'
        + '<td data-th="Số dư">'+fmt(balanceAt(d))+'</td>'
        + '<td data-th="Nội dung" style="text-align:left;white-space:normal">'+esc(e.ghiChu||'')+'</td>'
        + '<td class="actions-col">'
          + '<button class="icon-btn" data-act="editDay" data-date="'+d+'" title="Sửa ngày này" aria-label="Sửa giao dịch ngày '+d+'">✎</button>'
          + '<button class="icon-btn" data-act="delDay" data-date="'+d+'" title="Xóa ngày này" aria-label="Xóa giao dịch ngày '+d+'">🗑</button>'
          + '</td>'
        + '</tr>';
      if (moRong) html += soTayDetailHtml(d);
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  // Charts
  html += '<div class="card"><h3>Biểu đồ chi tiêu</h3><div class="charts-grid">'
    + '<div class="chart-box full"><canvas id="chartBal"></canvas></div>'
    + '<div class="chart-box"><canvas id="chartDonut"></canvas></div>'
    + '<div class="chart-box"><canvas id="chartDonutThu"></canvas></div>'
    + '<div class="chart-box"><canvas id="chartDay"></canvas></div>'
    + '<div class="chart-box full"><canvas id="chartMonth"></canvas></div>'
    + '</div></div>';

  root.innerHTML = html;
  drawCharts(mk, monthDates, cats);
}

/* ====================================================================
   Bảng chi tiết giao dịch trong 1 ngày (bung ra khi bấm vào ô Ngày).
   Chỉ hiển thị/sửa tầng items[] — tức là TỪNG GIAO DỊCH NHẬP TAY.
   Các dòng do khoản vay sinh ra (refs) hiện ở đây nhưng CHỈ ĐỌC, vì sửa
   chúng ở đây sẽ làm số Sổ tay lệch tiến độ khoản vay.
   Sửa/xóa 1 dòng chi tiết sẽ tự cộng/trừ lại entry.thu/chi tương ứng,
   nên bảng tổng phía trên luôn khớp — không có bước tính lại riêng nào.
   ==================================================================== */
function stItemEditRow(date, it){
  var kind = it ? it.kind : 'chi';
  var catId = it ? it.catId : '';
  var opt = function(k){
    return (state.data.categories[k] || []).map(function(c){
      return '<option value="'+k+'|'+c.id+'"'+((kind===k && catId===c.id)?' selected':'')+'>'
           + (k==='thu'?'Thu · ':'Chi · ') + esc(c.ten) + '</option>';
    }).join('');
  };
  return '<tr class="st-it-edit">'
    + '<td colspan="2" style="text-align:left"><select id="st_it_cat">'
      + '<option value="">— chọn danh mục —</option>' + opt('thu') + opt('chi')
      + '</select>'
      + ((state.data.wallets || []).length > 1
          ? '<select id="st_it_wallet" style="margin-top:4px" aria-label="Ví / nguồn tiền">'
            + viOptionsHtml(it ? viCuaItem(it) : (walletById(state.viChon) ? state.viChon : viMacDinhId())) + '</select>'
          : '')
      + '</td>'
    + '<td><input type="text" inputmode="numeric" autocomplete="off" class="money" id="st_it_tien" placeholder="0" value="'+(it?veSo(num(it.soTien)):'')+'"></td>'
    + '<td style="text-align:left"><input type="text" id="st_it_note" placeholder="Nội dung..." value="'+(it?esc(it.ghiChu):'')+'"></td>'
    + '<td class="actions-col">'
      + '<button class="icon-btn" data-act="stSaveItem" data-date="'+date+'" data-iid="'+(it?it.iid:'')+'" title="Lưu">✔</button>'
      + '<button class="icon-btn" data-act="stCancelItem" title="Hủy">✕</button>'
    + '</td></tr>';
}

function soTayDetailHtml(date){
  var e = state.data.journal[date];
  if (!e) return '';
  var items = entryItems(e);
  var refs  = e.refs || [];
  var h = '<tr class="st-detail"><td colspan="6"><div class="st-detail-box">';
  h += '<div class="st-detail-head">Chi tiết giao dịch ngày '+date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4)+'</div>';
  if (!items.length && !refs.length){
    h += '<div class="empty" style="text-align:left">Ngày này chưa có dòng chi tiết nào.</div>';
  } else {
    h += '<table class="st-detail-tbl"><tbody>';
    items.forEach(function(it){
      if (state.soTayEditIid === it.iid){ h += stItemEditRow(date, it); return; }
      h += '<tr>'
        + '<td style="text-align:left;width:46px"><span class="st-kind '+it.kind+'">'+(it.kind==='thu'?'Thu':'Chi')+'</span></td>'
        + '<td style="text-align:left">'+esc(catTen(it.kind, it.catId))
          + ((state.data.wallets || []).length > 1 ? ' <span class="vi-chip">'+esc(viTen(viCuaItem(it)))+'</span>' : '')+'</td>'
        + '<td style="color:var(--'+(it.kind==='thu'?'green':'red')+')">'+fmt(Math.round(num(it.soTien)))+'</td>'
        + '<td style="text-align:left;white-space:normal">'+esc(it.ghiChu||'')+'</td>'
        + '<td class="actions-col">'
          + '<button class="icon-btn" data-act="stEditItem" data-date="'+date+'" data-iid="'+it.iid+'" title="Sửa dòng này">✎</button>'
          + '<button class="icon-btn" data-act="stDelItem" data-date="'+date+'" data-iid="'+it.iid+'" title="Xóa dòng này">🗑</button>'
        + '</td></tr>';
    });
    // refs: chỉ đọc, bấm vào là nhảy sang tab Vay - Nợ để sửa cho đúng chỗ
    refs.forEach(function(r){
      var m = REF_MAP[r.loai];
      if (!m) return;
      h += '<tr class="st-ref">'
        + '<td style="text-align:left"><span class="st-kind '+m.kind+'">'+(m.kind==='thu'?'Thu':'Chi')+'</span></td>'
        + '<td style="text-align:left">'+esc(catTen(m.kind, m.cat))+' <span class="st-lock">🔒 Vay-Nợ</span>'
          + ((state.data.wallets || []).length > 1 ? ' <span class="vi-chip">'+esc(viTen(viCuaRef(r)))+'</span>' : '')+'</td>'
        + '<td style="color:var(--'+(m.kind==='thu'?'green':'red')+')">'+fmt(Math.round(num(r.soTien)))+'</td>'
        + '<td style="text-align:left;white-space:normal">'+esc(REF_LABEL[r.loai]||r.loai)
          + (r.ky != null ? ' · kỳ '+(num(r.ky)+1) : '')
          + (r.note ? ' — '+esc(r.note) : '')+'</td>'
        + '<td class="actions-col"><button class="icon-btn" data-act="goVayNo" title="Sửa ở tab Vay - Nợ">↗</button></td>'
        + '</tr>';
    });
    h += '</tbody></table>';
  }
  if (state.soTayEditIid === '_new'){
    h += '<table class="st-detail-tbl"><tbody>' + stItemEditRow(date, null) + '</tbody></table>';
  } else {
    h += '<button class="btn secondary sm" data-act="stAddItem" data-date="'+date+'" style="margin-top:6px">+ Thêm dòng</button>';
  }
  h += '</div></td></tr>';
  return h;
}

/* ====================================================================
   KHOẢN ĐỊNH KỲ ĐẾN HẠN — card nhắc ở đầu Sổ tay. Mẫu khai báo ở tab Danh mục;
   logic nằm ở state.js (dinhKyDenHan / dinhKyGhi). Bấm "Ghi vào Sổ tay" mới có tiền.
   ==================================================================== */
function dinhKyDenHanHtml(){
  var ds = dinhKyDenHan(todayStr());
  if (!ds.length) return '';
  var h = '<div class="card dk-card"><h3 style="display:flex;align-items:center;gap:8px">Khoản định kỳ đến hạn <span class="hm-badge over">'+ds.length+'</span></h3>';
  ds.forEach(function(x){
    var k = x.dk;
    h += '<div class="dk-row">'
      + '<div class="dk-main"><div class="dk-ten">'+esc(k.ten)
        + ((state.data.wallets || []).length > 1 ? ' <span class="vi-chip">'+esc(viTen(viCuaItem(k)))+'</span>' : '') + '</div>'
        + '<div class="dk-sub">'+(k.kind === 'thu' ? 'Thu' : 'Chi')+' · '+esc(catTen(k.kind, k.catId))+' · hạn '+ngayVN(x.han).slice(0, 5)+'</div></div>'
      + '<div class="dk-tien" style="color:var(--'+(k.kind === 'thu' ? 'green' : 'red')+')">'+fmt(Math.round(k.soTien))+'</div>'
      + '<div class="dk-btn"><button class="btn sm" data-act="dkGhi" data-id="'+esc(k.id)+'" data-mk="'+x.mk+'">Ghi vào Sổ tay</button>'
      + '<button class="btn secondary sm" data-act="dkBo" data-id="'+esc(k.id)+'" data-mk="'+x.mk+'" title="Không ghi khoản này trong tháng này">Bỏ qua</button></div>'
      + '</div>';
  });
  return h + '</div>';
}

/* ====================================================================
   SỐ DƯ THEO VÍ + chuyển tiền giữa ví (chỉ hiện khi có từ 2 ví trở lên).
   Số dư tính tới hết tháng đang xem, cùng mốc với ô "Số dư cuối tháng".
   Logic dữ liệu nằm ở state.js (soDuTheoVi, chuyenViThem, chuyenViXoa).
   ==================================================================== */
function viSoDuCardHtml(mk){
  var ws = state.data.wallets || [];
  if (ws.length < 2) return '';
  var cuoi = mk + '-31';   // so sánh chuỗi ngày: '2026-10-31' >= mọi ngày trong tháng 10
  var h = '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:8px">Số dư theo ví'
    + '<button class="btn secondary sm" data-act="viChuyenMo">⇄ Chuyển tiền giữa ví</button></h3>'
    + '<div class="vi-grid">';
  ws.forEach(function(w){
    var b = soDuTheoVi(w.id, cuoi);
    h += '<div class="stat"><div class="lbl">'+esc(w.ten)+'</div><div class="val"'+(b < 0 ? ' style="color:var(--red)"' : '')+'>'+fmt(Math.round(b))+'</div></div>';
  });
  h += '</div>';
  if (state.viFormOpen){
    var tuMd = walletById(state.viChon) ? state.viChon : ws[0].id;
    var denMd = (ws.find(function(w){ return w.id !== tuMd; }) || ws[1]).id;
    h += '<div class="vi-form"><div class="form-row">'
      + '<div><label>Từ ví</label><select id="vi_tu">'+viOptionsHtml(tuMd)+'</select></div>'
      + '<div><label>Sang ví</label><select id="vi_den">'+viOptionsHtml(denMd)+'</select></div>'
      + '<div><label>Số tiền</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="vi_tien" placeholder="0"></div>'
      + '<div><label>Ngày</label><input type="date" id="vi_ngay" value="'+todayStr()+'"></div>'
      + '<div><label>Ghi chú</label><input type="text" id="vi_ghichu" placeholder="Rút tiền, nạp ví..."></div>'
      + '</div><div style="display:flex;gap:8px;margin-bottom:6px">'
      + '<button class="btn sm" data-act="viChuyenLuu">Chuyển</button>'
      + '<button class="btn secondary sm" data-act="viChuyenHuy">Hủy</button></div>'
      + '<div class="empty" style="padding:0;text-align:left">Chuyển tiền không phải thu hay chi: không vào tổng thu/chi, biểu đồ hay dự trù, và không đổi tổng số dư.</div></div>';
  }
  var ds = (state.data.chuyenVi || []).filter(function(t){ return monthKey(t.ngay) === mk; })
    .sort(function(a, b){ return a.ngay < b.ngay ? 1 : (a.ngay > b.ngay ? -1 : 0); });
  if (ds.length){
    h += '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th style="text-align:left">Ngày</th><th style="text-align:left">Chuyển</th><th>Số tiền</th><th style="text-align:left">Ghi chú</th><th class="actions-col"></th></tr></thead><tbody>';
    ds.forEach(function(t){
      h += '<tr><td style="text-align:left">'+t.ngay.slice(8,10)+'/'+t.ngay.slice(5,7)+'</td>'
        + '<td style="text-align:left">'+esc(viTen(t.tuVi))+' → '+esc(viTen(t.denVi))+'</td>'
        + '<td>'+fmt(Math.round(num(t.soTien)))+'</td>'
        + '<td style="text-align:left;white-space:normal">'+esc(t.ghiChu||'')+'</td>'
        + '<td class="actions-col"><button class="icon-btn" data-act="viChuyenXoa" data-id="'+esc(t.id)+'" title="Xóa lần chuyển này" aria-label="Xóa lần chuyển tiền ngày '+t.ngay+'">🗑</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  return h + '</div>';
}

/* ====================================================================
   HẠN MỨC THÁNG — progress bar thực tế / chỉ tiêu cho từng danh mục chi có
   đặt "chỉ tiêu/tháng" ở tab Danh mục. Thuần hiển thị: chỉ ĐỌC categories +
   journal, không ghi gì. Danh mục khongDuTru (Cho vay...) bị loại vì không
   phải chi tiêu thật. Sắp theo % giảm dần để cái sắp/đã vượt nằm trên cùng.
   ==================================================================== */
function hanMucThangRows(mk){
  var rows = [];
  (state.data.categories.chi || []).forEach(function(c){
    var cap = num(c.chiTieu);
    if (cap <= 0 || c.khongDuTru) return;
    var da = actualCatInMonth('chi', c.id, mk);
    rows.push({ id: c.id, ten: c.ten, da: da, cap: cap, pct: da / cap });
  });
  rows.sort(function(a, b){ return b.pct - a.pct; });
  return rows;
}
// mức: 'ok' < 80% · 'warn' 80–100% · 'over' > 100%
function hanMucMuc(pct){ return pct > 1 ? 'over' : (pct >= 0.8 ? 'warn' : 'ok'); }
function hanMucThangHtml(mk){
  var rows = hanMucThangRows(mk);
  if (!rows.length) return '';
  var nVuot = rows.filter(function(r){ return r.pct > 1; }).length;
  var h = '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:8px">Hạn mức '+monthLabel(mk).toLowerCase()
    + (nVuot ? ' <span class="hm-badge over">'+nVuot+' danh mục vượt</span>' : '') + '</h3><div class="hm-list">';
  rows.forEach(function(r){
    var muc = hanMucMuc(r.pct);
    var rong = Math.min(100, Math.round(r.pct * 100));
    h += '<div class="hm-row">'
      + '<div class="hm-top"><span class="hm-ten">'+esc(r.ten)+'</span>'
      + '<span class="hm-so '+muc+'">'+fmt(Math.round(r.da))+' / '+fmt(Math.round(r.cap))+' · '+Math.round(r.pct * 100)+'%</span></div>'
      + '<div class="hm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rong+'" aria-label="'+esc(r.ten)+'">'
      + '<div class="hm-fill '+muc+'" style="width:'+rong+'%"></div></div>'
      + (r.pct > 1 ? '<div class="hm-vuot">Vượt '+fmt(Math.round(r.da - r.cap))+'</div>' : '')
      + '</div>';
  });
  return h + '</div></div>';
}

// <option> cho bộ lọc danh mục: nhóm Thu / Chi, giá trị dạng 'thu:<id>' | 'chi:<id>'
function soTayCatOptions(sel){
  function nhom(kind, nhan){
    var o = (state.data.categories[kind] || []).map(function(c){
      var v = kind + ':' + c.id;
      return '<option value="'+esc(v)+'"'+(v === sel ? ' selected' : '')+'>'+esc(c.ten)+'</option>';
    }).join('');
    return o ? '<optgroup label="'+nhan+'">'+o+'</optgroup>' : '';
  }
  return '<option value="">Tất cả</option>' + nhom('thu', 'Thu') + nhom('chi', 'Chi');
}
function catTenTheoId(kind, id){
  var c = (state.data.categories[kind] || []).find(function(x){ return x.id === id; });
  return c ? c.ten : id;
}

// số dư cuối ngày trong tháng mk. Tháng đang diễn ra chỉ vẽ tới hôm nay (sau đó
// là đường phẳng vô nghĩa); tháng trước mốc khóa sổ thì không có số dư để vẽ.
function balanceSeries(mk){
  var startLock = (state.data.settings.ngayBatDau || '').slice(0, 7);
  if (startLock && mk < startLock) return { labels: [], vals: [] };
  var hom = todayStr();
  var soNgay = daysInMonth(mk);
  var labels = [], vals = [];
  for (var i = 1; i <= soNgay; i++){
    var d = mk + '-' + pad2(i);
    if (d > hom && mk === monthKey(hom)) break;
    labels.push(pad2(i));
    vals.push(balanceAt(d));
  }
  return { labels: labels, vals: vals };
}
function drawBalanceChart(mk){
  if (chartBal) chartBal.destroy();
  var cv = document.getElementById('chartBal');
  if (!cv) return;
  var s = balanceSeries(mk);
  chartBal = new Chart(cv, { type:'line',
    data:{ labels: s.labels.length ? s.labels : ['—'],
      datasets:[{ label:'Số dư cuối ngày', data: s.vals.length ? s.vals : [0],
        borderColor:'#4f46e5', backgroundColor:'rgba(79,70,229,.12)', fill:true, tension:.25, pointRadius:2 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ title:{display:true,text:'Số dư cuối ngày — '+monthLabel(mk)}, legend:{display:false} },
      scales:{ y:{ ticks:{ callback:function(v){ return Math.abs(v)>=1000000?(v/1000000)+'tr':(Math.abs(v)>=1000?(v/1000)+'k':v); } } } } }
  });
}

function drawCharts(mk, monthDates, cats){
  drawBalanceChart(mk);
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
    var viSel = (document.getElementById('f_wallet') || {}).value || viMacDinhId();
    if (!wasEditing && walletById(viSel)) state.viChon = viSel;
    var selCV = document.getElementById('sotay_selChoVay');
    var selVN = document.getElementById('sotay_selVayNo');
    var cvIdSel = (!wasEditing && selCV) ? selCV.value : '';
    var vnIdSel = (!wasEditing && selVN) ? selVN.value : '';
    // data-lock = phần tiền do khoản vay sinh ra, ô nhập chỉ chứa phần nhập tay -> cộng lại
    var thu = {};
    document.querySelectorAll('.f_thu').forEach(function(inp){
      var v = numNonNeg(docSo(inp.value)) + num(inp.getAttribute('data-lock'));
      if (v) thu[inp.getAttribute('data-cat')] = v;
    });
    var chi = {};
    document.querySelectorAll('.f_chi').forEach(function(inp){
      var v = numNonNeg(docSo(inp.value)) + num(inp.getAttribute('data-lock'));
      if (v) chi[inp.getAttribute('data-cat')] = v;
    });
    // Mỗi lần Lưu = 1 khoản -> gắn tổng số tiền của lần đó vào cuối nội dung
    // ("Ăn trưa" -> "Ăn trưa 40.000 ₫") để cột Nội dung của bảng ngày đọc ra luôn có số.
    // CHỈ gắn vào ghi chú của NGÀY (ghiChuLuu). Dòng items[] bên dưới vẫn dùng
    // `ghiChu` gốc: chúng đã có ô tiền riêng, gắn nữa là hiện số 2 lần ở bảng chi tiết.
    // Sửa ngày cũ thì giữ nguyên nội dung, không bóc/ghép lại số (bóc đuôi số dễ cắt
    // nhầm nội dung vốn kết thúc bằng con số).
    var ghiChuLuu = ghiChu;
    if (!state.editingDate && ghiChu){
      var tongLan = 0;
      Object.keys(thu).forEach(function(cid){ tongLan += thu[cid]; });
      Object.keys(chi).forEach(function(cid){ tongLan += chi[cid]; });
      if (tongLan > 0) ghiChuLuu = ghiChu + ' ' + fmt(Math.round(tongLan));
    }
    if (state.editingDate){
      var oldE = state.data.journal[date] || blankEntry();
      // GIỮ refs + items: ghi đè cả entry là làm mồ côi liên kết với khoản vay -> số dư/tiến độ lệch
      var editedE = { thu: thu, chi: chi, ghiChu: ghiChu, refs: oldE.refs || [], items: entryItems(oldE) };
      state.data.journal[date] = editedE;
      // form chỉ sửa được TỔNG theo danh mục, không biết dòng nào thay đổi
      // -> để repair co/giãn các dòng chi tiết cho khớp tổng mới
      repairEntryItems(editedE);
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
      existing.items = Array.isArray(existing.items) ? existing.items : [];
      if (ghiChuLuu) existing.ghiChu = existing.ghiChu ? (existing.ghiChu + '; ' + ghiChuLuu) : ghiChuLuu;
    } else {
      state.data.journal[date] = { thu: thu, chi: chi, ghiChu: ghiChuLuu, refs: [], items: [] };
    }
    // danh mục được gắn vào khoản vay/cho vay bên dưới (journalTagRef): số tiền đó
    // chuyển sang tầng refs nên KHÔNG được sinh dòng items, nếu không sẽ đếm 2 lần.
    var daTag = {};

    /* Phần ghi nhận trả nợ có thể phải HỎI (trả thiếu so với lịch), mà hộp thoại
       mới trả về Promise -> tách đuôi hàm ra 2 closure để gọi được ở cả hai nhánh:
       hỏi xong mới chạy, hoặc chạy ngay khi không cần hỏi.
       KHÔNG biến handleSoTayAction thành async: dispatcher đọc giá trị trả về
       đồng bộ, async luôn trả Promise (truthy) nên chặn hết handler phía sau. */
    function ghiTraNo(vnA, tdA, kyA, dongKyA){
      var ridAp = 'r' + kyA + '_' + Date.now().toString(36);
      vnA.traNo = vnA.traNo || [];
      vnA.traNo.push({ rid: ridAp, ky: kyA, mk: tdA.sch[kyA].mk, soTien: chi['traNo'], ngay: date, dongKy: dongKyA });
      journalTagRef(date, vnA.id, 'traNo', chi['traNo'], { ky: kyA, rid: ridAp });
      daTag['chi|traNo'] = 1;
      if (soTienConLaiPhaiTra(vnA) <= 0.01) vnA.trangThai = 'da_tra_het';
    }
    function ketThuc(){
      // sinh dòng chi tiết cho phần nhập tay. Làm SAU phần gắn ref để biết
      // danh mục nào đã thuộc tầng refs mà bỏ qua (daTag).
      if (!wasEditing){
        var eNew = state.data.journal[date];
        eNew.items = Array.isArray(eNew.items) ? eNew.items : [];
        ['thu','chi'].forEach(function(kind){
          var src = (kind === 'thu') ? thu : chi;
          Object.keys(src).forEach(function(cid){
            if (daTag[kind+'|'+cid]) return;
            eNew.items.push({ iid: newIid(), kind: kind, catId: cid, soTien: src[cid], ghiChu: ghiChu, walletId: viSel });
          });
        });
        repairEntryItems(eNew);
      }
      state.editingDate = null;
      state.soTayEditIid = null;
      scheduleSave();
      renderSoTay();
      toast('Đã lưu giao dịch ngày ' + date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4) + '.');
    }

    if (cvIdSel && thu['thuHoiChoVay']){
      var cvApply = state.data.vayNo.choVay.find(function(x){ return x.id===cvIdSel; });
      if (cvApply){
        cvApply.daThu = num(cvApply.daThu) + thu['thuHoiChoVay'];
        if (cvApply.daThu >= cvApply.soTien - 0.01) cvApply.trangThai = 'da_thu_du';
        journalTagRef(date, cvApply.id, 'thuHoiChoVay', thu['thuHoiChoVay']);
        daTag['thu|thuHoiChoVay'] = 1;
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
          if (chi['traNo'] < thieuAp - 1){
            (function(vnA, tdA, kyA){
              (async function(){
                var ch = await chonMot('Trả thiếu so với lịch kỳ ' + (kyA+1),
                  'Khoản "'+vnA.ten+'": trả '+fmt(Math.round(chi['traNo']))+', còn thiếu '
                  + fmt(Math.round(thieuAp - chi['traNo']))+' so với lịch.',
                  [ { ma:'xong', chu:'Kỳ này đã trả xong' },
                    { ma:'no',   chu:'Kỳ này còn nợ tiếp' } ]);
                // Hủy / Esc = chọn hướng an toàn: kỳ còn nợ tiếp, tiền không bốc hơi khỏi dư nợ
                ghiTraNo(vnA, tdA, kyA, ch === 'xong');
                ketThuc();
              })();
            })(vnApply, tdApply, kyAp);
            return true;   // đuôi hàm chạy trong IIFE ở trên, sau khi Đạt trả lời
          }
          ghiTraNo(vnApply, tdApply, kyAp, true);
        }
      }
    } else if (vnIdSel && !chi['traNo']){
      toast('Đã chọn khoản vay nhưng chưa nhập số tiền ở danh mục "Trả nợ" — không ghi nhận kỳ trả nào.', { loai:'warn' });
    }
    ketThuc();
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
      toast('Ngày này chứa giao dịch gốc của khoản vay/cho vay ('
        + goc.map(function(r){ return REF_LABEL[r.loai]; }).join(', ')
        + '). Muốn bỏ thì xóa/sửa chính khoản đó ở tab "Vay - Nợ", không xóa từ Sổ tay.', { loai:'err' });
      return true;
    }
    var msgDel = '';
    if (refsDel.length){
      msgDel = 'Ngày này có '+refsDel.length+' giao dịch gắn với khoản vay, xóa sẽ hoàn tác luôn ở tab Vay - Nợ:\n'
        + refsDel.map(function(r){
            return '  • ' + (REF_LABEL[r.loai]||r.loai) + ' · ' + fmt(r.soTien)
                 + (r.ky != null ? ' (kỳ '+(num(r.ky)+1)+' → về chưa trả)' : '');
          }).join('\n');
    }
    var nhanD = d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
    var xoaNgay = function(){
      refsDel.forEach(function(r){ loanRevertRef(r); });
      delete state.data.journal[d];
      if (state.soTayDetailDate === d){ state.soTayDetailDate = null; state.soTayEditIid = null; }
      scheduleSave();
      renderSoTay();
    };
    /* KHÔNG có ref -> xóa ngay, cho Hoàn tác trong toast: chỉ phải trả lại
       đúng 1 object journal[d] nên hoàn tác chắc chắn khôi phục đủ.
       CÓ ref -> vẫn hỏi xác nhận như cũ: loanRevertRef() còn sửa khoản vay ở
       tab Vay - Nợ (kỳ trả về "chưa trả"…), hoàn tác phải vá nhiều nơi, nếu
       người dùng bấm việc khác trước khi Hoàn tác thì dữ liệu lệch. */
    if (!refsDel.length){
      var banSaoNgay = eDel;
      xoaNgay();
      toast('Đã xóa giao dịch ngày '+nhanD+'.', { giay:6, hoanTac:function(){
        state.data.journal[d] = banSaoNgay;
        scheduleSave();
        renderSoTay();
        toast('Đã hoàn tác ngày '+nhanD+'.');
      } });
      return true;
    }
    (async function(){
      if (!await xacNhan('Xóa toàn bộ giao dịch ngày '+nhanD+'?',
            msgDel, { nguyHiem:true, chuOk:'Xóa' })) return;
      xoaNgay();
      toast('Đã xóa giao dịch ngày '+nhanD+'.');
    })();
  } else if (act === 'stToggleDetail'){
    var dT = el.getAttribute('data-date');
    state.soTayDetailDate = (state.soTayDetailDate === dT) ? null : dT;
    state.soTayEditIid = null;
    renderSoTay();
  } else if (act === 'stAddItem'){
    state.soTayDetailDate = el.getAttribute('data-date');
    state.soTayEditIid = '_new';
    renderSoTay();
  } else if (act === 'stEditItem'){
    state.soTayDetailDate = el.getAttribute('data-date');
    state.soTayEditIid = el.getAttribute('data-iid');
    renderSoTay();
  } else if (act === 'dkGhi' || act === 'dkBo'){
    var dkS = (state.data.dinhKy || []).find(function(k){ return k.id === el.getAttribute('data-id'); });
    var dkMk = el.getAttribute('data-mk') || monthKey(todayStr());
    if (!dkS) return true;
    if (act === 'dkBo'){
      dkS.bo = dkS.bo || [];
      if (dkS.bo.indexOf(dkMk) < 0) dkS.bo.push(dkMk);
      scheduleSave();
      renderSoTay();
      toast('Đã bỏ qua "'+dkS.ten+'" tháng này.', { hoanTac: function(){
        dkS.bo = dkS.bo.filter(function(m){ return m !== dkMk; });
        scheduleSave(); renderSoTay();
      } });
      return true;
    }
    var kq = dinhKyGhi(dkS, dkMk, todayStr());
    if (!kq){ toast('Không ghi được khoản này (kiểm tra danh mục / số tiền).', { loai:'err' }); return true; }
    scheduleSave();
    renderSoTay();
    toast('Đã ghi "'+dkS.ten+'" vào ngày '+kq.date.slice(8,10)+'/'+kq.date.slice(5,7)+'.', { hoanTac: function(){
      dinhKyHoanTac(kq);
      scheduleSave(); renderSoTay();
    } });
  } else if (act === 'viChuyenMo'){
    state.viFormOpen = !state.viFormOpen;
    renderSoTay();
  } else if (act === 'viChuyenHuy'){
    state.viFormOpen = false;
    renderSoTay();
  } else if (act === 'viChuyenLuu'){
    var ctTu = (document.getElementById('vi_tu') || {}).value;
    var ctDen = (document.getElementById('vi_den') || {}).value;
    var ctTien = numNonNeg(docSo((document.getElementById('vi_tien') || {}).value));
    var ctNgay = (document.getElementById('vi_ngay') || {}).value || todayStr();
    var ctGhi = ((document.getElementById('vi_ghichu') || {}).value || '').trim();
    if (ctTu === ctDen){ toast('Ví đi và ví đến phải khác nhau.', { loai:'warn' }); return true; }
    if (ctTien <= 0){ toast('Số tiền chuyển phải lớn hơn 0.', { loai:'warn' }); return true; }
    if (!chuyenViThem(ctNgay, ctTu, ctDen, ctTien, ctGhi)){ toast('Không tạo được lần chuyển này.', { loai:'err' }); return true; }
    state.viFormOpen = false;
    scheduleSave();
    renderSoTay();
    toast('Đã chuyển '+fmt(Math.round(ctTien))+' từ "'+viTen(ctTu)+'" sang "'+viTen(ctDen)+'".');
  } else if (act === 'viChuyenXoa'){
    var ctGo = chuyenViXoa(el.getAttribute('data-id'));
    if (!ctGo) return true;
    scheduleSave();
    renderSoTay();
    toast('Đã xóa lần chuyển tiền.', { hoanTac: function(){
      state.data.chuyenVi.push(ctGo);
      scheduleSave();
      renderSoTay();
    } });
  } else if (act === 'stCancelItem'){
    state.soTayEditIid = null;
    renderSoTay();
  } else if (act === 'stSaveItem'){
    var dS = el.getAttribute('data-date');
    var iidS = el.getAttribute('data-iid');
    var kc = (document.getElementById('st_it_cat') || {}).value || '';
    var tienS = numNonNeg(docSo((document.getElementById('st_it_tien') || {}).value));
    var noteS = (document.getElementById('st_it_note') || {}).value || '';
    var viS = (document.getElementById('st_it_wallet') || {}).value || '';
    if (!kc){ toast('Chưa chọn danh mục.', { loai:'warn' }); return true; }
    var kindS = kc.split('|')[0], catS = kc.split('|')[1];
    if (tienS <= 0){ toast('Số tiền phải lớn hơn 0.', { loai:'warn' }); return true; }
    // hai danh mục này chỉ được sinh từ tab Vay - Nợ, nhập tay ở đây tạo tiền mồ côi
    if ((kindS === 'thu' && VN_ONLY_THU[catS]) || (kindS === 'chi' && VN_ONLY_CHI[catS])){
      toast('Danh mục "'+catTen(kindS, catS)+'" chỉ ghi được từ tab Vay - Nợ.', { loai:'err' });
      return true;
    }
    if (iidS){
      if (!entryUpdateItem(dS, iidS, tienS, noteS, kindS, catS, viS)){ toast('Không tìm thấy dòng cần sửa.', { loai:'err' }); return true; }
    } else {
      if (!entryAddItem(dS, kindS, catS, tienS, noteS, viS)){ toast('Không thêm được dòng này.', { loai:'err' }); return true; }
    }
    state.soTayEditIid = null;
    scheduleSave();
    renderSoTay();
    toast(iidS ? 'Đã sửa dòng chi tiết.' : 'Đã thêm dòng chi tiết.');
  } else if (act === 'stDelItem'){
    var dD = el.getAttribute('data-date');
    var iidD = el.getAttribute('data-iid');
    var eD = state.data.journal[dD];
    var itD = eD ? entryFindItem(eD, iidD) : null;
    if (!itD) return true;
    (async function(){
      if (!await xacNhan('Xóa dòng "'+(itD.ghiChu||catTen(itD.kind, itD.catId))+'" · '+fmt(Math.round(num(itD.soTien)))+'?',
            'Tổng '+(itD.kind==='thu'?'thu':'chi')+' của ngày sẽ giảm đúng số này.',
            { nguyHiem:true, chuOk:'Xóa' })) return;
      entryDeleteItem(dD, iidD);
      if (!state.data.journal[dD]) state.soTayDetailDate = null;
      state.soTayEditIid = null;
      scheduleSave();
      renderSoTay();
      toast('Đã xóa dòng chi tiết.');
    })();
  } else if (act === 'goVayNo'){
    state.tab = 'vayno';
    document.querySelectorAll('.tab').forEach(function(t){
      t.classList.toggle('active', t.getAttribute('data-tab') === 'vayno');
    });
    renderAll();
    window.scrollTo({top:0, behavior:'smooth'});
  } else if (act === 'fabAdd'){
    /* FAB không mở bottom sheet riêng mà cuộn tới + focus đúng form đang có.
       Lý do: form kia là đường lưu DUY NHẤT (saveEntry) với đủ ràng buộc
       khóa ref / chọn khoản vay / chống nhập tay danh mục Vay-Nợ. Dựng form
       thứ hai là dựng đường lưu thứ hai, sớm muộn hai bên lệch luật. */
    if (state.tab !== 'sotay'){
      state.tab = 'sotay';
      document.querySelectorAll('.tab').forEach(function(t){
        t.classList.toggle('active', t.getAttribute('data-tab') === 'sotay');
      });
      renderAll();
    }
    var box = document.getElementById('formGiaoDich');
    if (box) box.scrollIntoView({ behavior:'smooth', block:'center' });
    // ưu tiên ô CHI đầu tiên còn nhập được — ghi một khoản chi là việc làm nhiều nhất
    var oNhap = document.querySelector('.f_chi:not([readonly])')
             || document.querySelector('.f_thu:not([readonly])')
             || document.getElementById('f_date');
    if (oNhap) setTimeout(function(){ oNhap.focus(); }, 250);
  } else if (act === 'exportExcel'){
    exportExcel();
  } else if (act === 'soTayClearFilter'){
    state.soTaySearch = ''; state.soTayFrom = ''; state.soTayTo = ''; state.soTayCat = '';
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
      if (cvSel) inpThu.value = veSo(conLaiPhaiThu(cvSel));   // ô .money -> phải ghi dạng có phân cách
    }
    return true;
  } else if (el.matches('[data-act=soTayChonVayNo]')){
    var vnId = el.value;
    var inpChi = document.querySelector('.f_chi[data-cat=traNo]');
    if (vnId && inpChi){
      var vnSel = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===vnId; });
      if (vnSel){
        var tdSel = tienDoTraNo(vnSel);
        if (tdSel.kyTiepTheo) inpChi.value = veSo(tdSel.kyTiepTheo.tongTra);   // ô .money
      }
    }
    return true;
  } else if (el.matches('[data-act=soTaySearchInput]')){
    state.soTaySearch = el.value;
    renderSoTay();
    return true;
  } else if (el.matches('[data-act=soTayCatInput]')){
    state.soTayCat = el.value;
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
