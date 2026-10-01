"use strict";
/* ====================================================================
   dongtien.js — tab "Dòng tiền": bảng thu/chi theo tháng cả năm (thực tế +
   gợi ý tương lai) và bảng phân tích chênh lệch so với chỉ tiêu.
   Cần state.js, vayno.js (tongTraNoThang, tongThuHoiThang) load trước.
   ==================================================================== */

// TB thực tế N tháng gần nhất có phát sinh (toàn bộ lịch sử), dùng làm gợi ý dự trù
function recentAvgActual(kind, catId, n){
  var byMonth = {};
  Object.keys(state.data.journal).forEach(function(d){
    var obj = state.data.journal[d][kind] || {};
    if (!obj[catId]) return;
    var mk = monthKey(d);
    byMonth[mk] = (byMonth[mk]||0) + num(obj[catId]);
  });
  var mks = Object.keys(byMonth).sort();
  if (mks.length < n) return null; // chưa đủ n tháng dữ liệu thực tế -> chưa dùng trung bình, để fallback về chỉ tiêu
  var lastN = mks.slice(-n);
  if (!lastN.length) return null;
  var sum = lastN.reduce(function(s,mk){ return s+byMonth[mk]; },0);
  return sum/lastN.length;
}

var DONGTIEN_GROUPS = [ { kind:'thu', title:'Thu nhập' }, { kind:'chi', title:'Chi' } ];

function renderDongTien(){
  var root = document.getElementById('tabContent');
  if (!state.dongTienYear) state.dongTienYear = parseInt((state.data.settings.ngayBatDau||todayStr()).slice(0,4),10);
  var year = state.dongTienYear;
  var startMk = (state.data.settings.ngayBatDau||todayStr()).slice(0,7);
  var currentMk = monthKey(todayStr());
  // chỉ hiển thị các tháng từ mốc khóa sổ (ngayBatDau) trở đi — tháng trước đó không theo dõi Dòng tiền nữa
  var months = [];
  for (var m=1;m<=12;m++){
    var mk0 = year+'-'+pad2(m);
    if (mk0 >= startMk) months.push(mk0);
  }
  if (!months.length){
    root.innerHTML = '<div class="year-nav">'
      + '<button data-act="prevYear" class="icon-btn">‹</button>'
      + '<div class="lbl">'+year+'</div>'
      + '<button data-act="nextYear" class="icon-btn">›</button>'
      + '</div><div class="card"><div class="empty">Năm '+year+' không có tháng nào từ mốc khóa sổ ('+startMk+'). Bấm › để xem năm khác.</div></div>';
    return;
  }

  // thực tế = tổng theo danh mục/tháng lấy thẳng từ Sổ tay (chỉ năm đang xem)
  var actual = { thu:{}, chi:{} };
  ['thu','chi'].forEach(function(kind){
    state.data.categories[kind].forEach(function(c){ actual[kind][c.id] = {}; });
  });
  Object.keys(state.data.journal).forEach(function(d){
    if (d.slice(0,4) !== String(year)) return;
    var mk = monthKey(d);
    var e = state.data.journal[d];
    ['thu','chi'].forEach(function(kind){
      var obj = e[kind] || {};
      Object.keys(obj).forEach(function(cid){
        if (!actual[kind][cid]) actual[kind][cid] = {};
        actual[kind][cid][mk] = (actual[kind][cid][mk]||0) + num(obj[cid]);
      });
    });
  });

  function actualVal(kind, cid, mk){ return num((actual[kind][cid]||{})[mk]); }
  function baseVal(kind, cid){
    var cat = state.data.categories[kind].find(function(c){ return c.id===cid; });
    return cat ? num(cat.chiTieu) : 0;
  }
  // gợi ý: riêng "Trả nợ"/"Thu hồi cho vay" lấy thẳng từ lịch trả của module Vay-Nợ (không dùng TB 3 tháng nữa);
  // danh mục đánh dấu "Không dự trù" (khongDuTru) thì không đoán gì cả — luôn để trống ở tháng tương lai;
  // các danh mục khác vẫn TB thực tế 3 tháng gần nhất có phát sinh, nếu chưa có dữ liệu thì lấy chỉ tiêu
  function suggestVal(kind, cid, mk){
    var cat0 = state.data.categories[kind].find(function(c){ return c.id===cid; });
    if (cat0 && cat0.khongDuTru) return null;
    if (kind==='chi' && cid==='traNo') return tongTraNoThang(mk) || null;
    if (kind==='thu' && cid==='thuHoiChoVay') return tongThuHoiThang(mk) || null;
    if (cat0 && cat0.coDinhChiTieu){
      var bF = baseVal(kind, cid);
      return bF > 0 ? bF : null;
    }
    var avg = recentAvgActual(kind, cid, 3);
    if (avg != null) return avg;
    var b = baseVal(kind, cid);
    return b > 0 ? b : null;
  }
  // giá trị hiển thị cho 1 ô: tháng đã qua/hiện tại -> thực tế, tháng tương lai -> gợi ý
  // riêng "Trả nợ"/"Thu hồi cho vay" ở THÁNG HIỆN TẠI: nếu chưa ghi Sổ tay (actual=0) thì tạm hiện
  // số phải trả/thu theo lịch vay (đã biết trước, không phải ước lượng) thay vì hiện 0 — khi nào
  // ghi Sổ tay thật thì actual sẽ khác 0 và tự động được ưu tiên hiện số thật.
  function cellVal(kind, cid, mk){
    if (mk > currentMk) return suggestVal(kind, cid, mk);
    var av = actualVal(kind, cid, mk);
    if (mk === currentMk && !av){
      if (kind==='chi' && cid==='traNo') return tongTraNoThang(mk) || 0;
      if (kind==='thu' && cid==='thuHoiChoVay') return tongThuHoiThang(mk) || 0;
      var cat0 = state.data.categories[kind].find(function(c){ return c.id===cid; });
      if (cat0 && cat0.coDinhChiTieu){
        var bF = baseVal(kind, cid);
        if (bF > 0) return bF;
      }
    }
    return av;
  }
  function groupCell(kind, mk){
    var s = 0;
    state.data.categories[kind].forEach(function(c){ s += (cellVal(kind, c.id, mk) || 0); });
    return s;
  }

  var html = '<div class="year-nav">'
    + '<button data-act="prevYear" class="icon-btn">‹</button>'
    + '<div class="lbl">'+year+'</div>'
    + '<button data-act="nextYear" class="icon-btn">›</button>'
    + '</div>';

  html += '<div class="card"><div class="table-wrap table-wrap-year"><table><thead><tr><th class="sticky-col" style="min-width:170px">Khoản mục</th>';
  months.forEach(function(mk){ html += '<th class="dt-input th-month">Tháng '+parseInt(mk.slice(5,7),10)+(mk>currentMk?' *':'')+'</th>'; });
  html += '</tr></thead><tbody>';

  DONGTIEN_GROUPS.forEach(function(g){
    var cats = state.data.categories[g.kind];
    html += '<tr><td colspan="'+(months.length+1)+'" class="group-title">'+g.title+'</td></tr>';
    if (!cats.length){
      html += '<tr><td colspan="'+(months.length+1)+'" class="empty">Chưa có danh mục — thêm ở tab "Danh mục".</td></tr>';
    }
    cats.forEach(function(c){
      var base = baseVal(g.kind, c.id);
      var tagHtml = base>0 ? ' <span class="cat-tag" title="Chỉ tiêu/tháng">'+fmt(base)+'</span>' : '';
      html += '<tr><td class="sticky-col"><span class="cat-label">'+c.ten+tagHtml+'</span></td>';
      months.forEach(function(mk){
        var future = mk > currentMk;
        var val = cellVal(g.kind, c.id, mk);
        var showNum = future ? (val != null) : (!!val);
        var text = showNum ? fmt(Math.round(val)) : (future ? '—' : '');
        var cls = 'dt-input' + (future ? ' dt-suggest' : '');
        var style = '';
        if (showNum && base > 0){
          var bad = g.kind === 'chi' ? (val > base) : (val < base);
          style = ' style="color:'+(bad?'var(--red)':'var(--green)')+'"';
        }
        html += '<td class="'+cls+'"'+style+'>'+text+'</td>';
      });
      html += '</tr>';
    });
    html += '<tr class="total-row"><td class="sticky-col">Tổng '+g.title.toLowerCase()+'</td>';
    months.forEach(function(mk){ html += '<td>'+fmt(groupCell(g.kind,mk))+'</td>'; });
    html += '</tr>';
  });

  // cân đối + lũy kế
  html += '<tr class="balance-row"><td class="sticky-col">Cân đối tháng</td>';
  months.forEach(function(mk){ html += '<td>'+fmt(groupCell('thu',mk) - groupCell('chi',mk))+'</td>'; });
  html += '</tr>';

  html += '<tr class="balance-row"><td class="sticky-col">Lũy kế số dư</td>';
  months.forEach(function(mk){
    html += (mk < startMk) ? '<td>—</td>' : '<td>'+fmt(balanceAtEndOfMonth(mk))+'</td>';
  });
  html += '</tr>';

  html += '</tbody></table></div></div>';
  html += '<div class="empty" style="margin-top:-8px">* Tháng chưa tới: số liệu là gợi ý (TB thực tế 3 tháng gần nhất, hoặc chỉ tiêu nếu chưa có dữ liệu). Các khoản biết trước — "Trả nợ"/"Thu hồi cho vay" (lấy từ lịch vay) hoặc danh mục có cờ "Cố định theo Chỉ tiêu" — hiện số biết trước luôn kể cả tháng hiện tại nếu chưa ghi Sổ tay.</div>';

  // ---- Phân tích dòng tiền ----
  html += '<div class="card"><h3>Phân tích dòng tiền</h3>'
    + '<div class="empty" style="padding:0 0 10px">Chỉ tiêu lấy từ tab Danh mục — riêng "Trả nợ"/"Thu hồi cho vay" lấy số phải trả/thu tháng hiện tại theo lịch vay ở tab Vay - Nợ (không dùng chỉ tiêu Danh mục). TB thực tế tính trên các tháng có phát sinh trong năm '+year+'. Gợi ý tháng tới = TB thực tế 3 tháng gần nhất có dữ liệu (toàn bộ lịch sử); nếu chưa có dữ liệu thì lấy theo chỉ tiêu. Riêng "Trả nợ"/"Thu hồi cho vay" lấy từ lịch trả ở tab Vay - Nợ.</div>'
    + '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Danh mục</th><th>Chỉ tiêu/tháng</th><th>TB thực tế/tháng</th><th>Chênh lệch</th><th>Gợi ý tháng tới</th></tr></thead><tbody>';
  ['thu','chi'].forEach(function(kind){
    state.data.categories[kind].forEach(function(c){
      var sumA=0, cntA=0;
      months.forEach(function(mk){
        var av = actualVal(kind,c.id,mk);
        if (av){ sumA+=av; cntA++; }
      });
      var tbA = cntA ? sumA/cntA : null;
      // "Trả nợ"/"Thu hồi cho vay": lấy đúng số phải trả/thu THÁNG HIỆN TẠI theo lịch vay làm mốc
      // so sánh, thay vì chỉ tiêu tĩnh đặt tay ở Danh mục (số này biết trước và đổi theo từng tháng)
      var base = (kind==='chi' && c.id==='traNo') ? (tongTraNoThang(currentMk) || 0)
        : (kind==='thu' && c.id==='thuHoiChoVay') ? (tongThuHoiThang(currentMk) || 0)
        : baseVal(kind, c.id);
      var diff = (tbA!=null && base>0) ? (tbA-base) : null;
      var diffStyle = '';
      if (diff!=null && diff!==0){
        var bad = kind==='chi' ? diff>0 : diff<0;
        diffStyle = ' style="color:'+(bad?'var(--red)':'var(--green)')+'"';
      }
      var goiY = suggestVal(kind, c.id, monthKeyAdd(currentMk, 1));
      html += '<tr>'
        + '<td style="text-align:left">'+c.ten+' <span class="cat-tag">'+(kind==='thu'?'thu':'chi')+'</span></td>'
        + '<td>'+(base>0?fmt(base):'—')+'</td>'
        + '<td>'+(tbA!=null?fmt(Math.round(tbA)):'—')+'</td>'
        + '<td'+diffStyle+'>'+(diff!=null?fmt(Math.round(diff)):'—')+'</td>'
        + '<td>'+(goiY!=null?fmt(Math.round(goiY)):'—')+'</td>'
        + '</tr>';
    });
  });
  html += '</tbody></table></div></div>';

  root.innerHTML = html;
}

/* ---- Dòng tiền: handlers ---- */
function handleDongTienAction(act, el){
  if (act === 'prevYear' || act === 'nextYear'){
    state.dongTienYear += (act==='nextYear'?1:-1);
    renderDongTien();
  } else {
    return false;
  }
  return true;
}
