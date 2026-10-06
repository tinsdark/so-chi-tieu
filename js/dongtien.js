"use strict";
/* ====================================================================
   dongtien.js — tab "Dòng tiền": bảng thu/chi theo tháng cả năm (thực tế +
   gợi ý tương lai) và bảng phân tích chênh lệch so với chỉ tiêu.
   Cần state.js, vayno.js (tongTraNoThang, tongThuHoiThang) load trước.
   ==================================================================== */

/* ====================================================================
   DỰ TRÙ = TB CÁC THÁNG ĐÃ HOÀN CHỈNH
   Chỉ lấy tháng ĐÃ KẾT THÚC và từ settings.thangBatDauDuTru trở đi:
   - tháng đang chạy chưa đủ số liệu -> lấy vào là kéo TB xuống sai
   - tháng lẻ đầu tiên (bắt đầu dùng app từ giữa tháng) cũng không phản ánh cả tháng
   Cửa sổ trượt tối đa 3 tháng hoàn chỉnh gần nhất. Chưa có tháng nào -> null
   để nơi gọi fallback về Chỉ tiêu/tháng ở tab Danh mục.
   Ví dụ (bắt đầu dự trù T10/2026): dự trù T11 = thực tế T10; T12 = TB(T10,T11);
   T1/2027 = TB(T10,T11,T12); T2/2027 = TB(T11,T12,T1).
   Tháng không phát sinh TÍNH LÀ 0 vào TB — mua 1 lần rồi thôi thì gợi ý phải
   giảm dần, không được giữ mãi mức của tháng duy nhất có mua.
   ==================================================================== */
function forecastEligibleMonths(){
  var startMk = state.data.settings.thangBatDauDuTru
    || monthKey(state.data.settings.ngayBatDau || todayStr());
  var curMk = monthKey(todayStr());
  var out = [], mk = startMk, guard = 0;
  while (mk < curMk && guard++ < 600){ out.push(mk); mk = monthKeyAdd(mk, 1); }
  return out;
}
function recentAvgActual(kind, catId, n){
  var months = forecastEligibleMonths();
  if (!months.length) return null;
  var win = months.slice(-n);
  var sum = 0;
  win.forEach(function(mk){ sum += actualCatInMonth(kind, catId, mk); });
  return sum / win.length;
}

var DONGTIEN_GROUPS = [ { kind:'thu', title:'Thu nhập' }, { kind:'chi', title:'Chi' } ];

/* Màu ở tab này theo TỐT / XẤU chứ không theo dấu của con số:
     thu thiếu so với chỉ tiêu  = xấu (đỏ)     thu hơn chỉ tiêu   = tốt (xanh)
     chi vượt chỉ tiêu          = xấu (đỏ)     chi ít hơn chỉ tiêu = tốt (xanh)
   Vì vậy "-2.037.000" ở khoản chi màu XANH (tiết kiệm được) còn "-10.110.000" ở khoản thu
   màu ĐỎ (thu thiếu). Trước đây không có chữ nào giải thích nên nhìn như 2 khối dùng màu ngược nhau
   -> thêm nhãn chữ cạnh số + dòng chú thích. */
function chenhHtml(kind, diff){
  if (diff == null) return '—';
  if (Math.round(diff) === 0) return fmt(0);
  var xau = (kind === 'chi') ? diff > 0 : diff < 0;
  var nhan = (kind === 'chi') ? (diff > 0 ? 'chi vượt' : 'chi ít hơn') : (diff < 0 ? 'thu thiếu' : 'thu hơn');
  var cls = xau ? 'xau' : 'tot';
  return '<span class="chenh '+cls+'">'+fmt(Math.round(diff))+'</span><span class="chenh-nhan '+cls+'">'+nhan+'</span>';
}
function chuThichMauHtml(dau){
  return '<div class="chenh-chuthich">'+dau+'<span class="tot">Xanh</span> = tốt (thu hơn / chi ít hơn chỉ tiêu) · <span class="xau">Đỏ</span> = cần chú ý (thu thiếu / chi vượt chỉ tiêu).</div>';
}

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
      + '<button data-act="prevYear" class="icon-btn" title="Năm trước" aria-label="Năm trước">‹</button>'
      + '<div class="lbl">'+year+'</div>'
      + '<button data-act="nextYear" class="icon-btn" title="Năm sau" aria-label="Năm sau">›</button>'
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
    if (mk === currentMk){
      // thực tế + phần lịch vay còn phải trả/thu mà Sổ tay chưa ghi (xem bietTruocChuaGhi ở vayno.js)
      if ((kind==='chi' && cid==='traNo') || (kind==='thu' && cid==='thuHoiChoVay')) return av + bietTruocChuaGhi(kind, cid, mk);
      if (!av){
        var cat0 = state.data.categories[kind].find(function(c){ return c.id===cid; });
        if (cat0 && cat0.coDinhChiTieu){
          var bF = baseVal(kind, cid);
          if (bF > 0) return bF;
        }
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
    + '<button data-act="prevYear" class="icon-btn" title="Năm trước" aria-label="Năm trước">‹</button>'
    + '<div class="lbl">'+year+'</div>'
    + '<button data-act="nextYear" class="icon-btn" title="Năm sau" aria-label="Năm sau">›</button>'
    + '</div>';

  html += '<div class="card">' + chuThichMauHtml('Màu số liệu từng tháng so với chỉ tiêu (hiện cạnh tên danh mục): ')
    + '<div class="table-wrap table-wrap-year"><table><thead><tr><th class="sticky-col" style="min-width:170px">Khoản mục</th>';
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

  // Lũy kế: tháng đã qua = số dư thực; từ tháng hiện tại trở đi CỘNG DỒN dự báo (cùng cách tính với thẻ
  // "Dòng tiền tích lũy tương lai" ở tab Vay - Nợ). Trước đây tháng tương lai chỉ lấy số dư thực nên đứng yên.
  var luyKe = {};
  var lastMk = months[months.length-1];
  if (lastMk >= currentMk){
    var run = balanceBeforeMonth(currentMk), mc = currentMk, guard2 = 0;
    while (mc <= lastMk && guard2++ < 600){
      run += tongThuThangCard(mc) - tongChiThangCard(mc);
      luyKe[mc] = run;
      mc = monthKeyAdd(mc, 1);
    }
  }
  html += '<tr class="balance-row"><td class="sticky-col">Lũy kế số dư</td>';
  months.forEach(function(mk){
    html += (mk < startMk) ? '<td>—</td>' : '<td>'+fmt(luyKe[mk] != null ? luyKe[mk] : balanceAtEndOfMonth(mk))+'</td>';
  });
  html += '</tr>';

  html += '</tbody></table></div></div>';
  var fcM = forecastEligibleMonths();
  html += '<div class="empty" style="margin-top:-8px">* Tháng chưa tới: số liệu là gợi ý — TB của tối đa 3 tháng ĐÃ HOÀN CHỈNH gần nhất tính từ '
    + monthLabel(state.data.settings.thangBatDauDuTru || startMk) + ' ('
    + (fcM.length ? 'đang dùng: ' + fcM.slice(-3).map(monthLabel).join(', ') : 'chưa có tháng nào hoàn chỉnh → dùng Chỉ tiêu/tháng ở tab Danh mục')
    + '). Tháng không phát sinh được tính là 0 vào TB. Các khoản biết trước — "Trả nợ"/"Thu hồi cho vay" (lấy từ lịch vay) hoặc danh mục có cờ "Cố định theo Chỉ tiêu" — hiện số biết trước luôn kể cả tháng hiện tại nếu chưa ghi Sổ tay. "Lũy kế số dư" từ tháng hiện tại trở đi đã cộng cả số dự báo.</div>';

  // ---- Phân tích dòng tiền ----
  html += '<div class="card"><h3>Phân tích dòng tiền</h3>'
    + '<div class="empty" style="padding:0 0 10px">Chỉ tiêu lấy từ tab Danh mục — riêng "Trả nợ"/"Thu hồi cho vay" lấy số phải trả/thu tháng hiện tại theo lịch vay ở tab Vay - Nợ (không dùng chỉ tiêu Danh mục). TB thực tế tính trên các tháng có phát sinh trong năm '+year+'. Gợi ý tháng tới = TB của tối đa 3 tháng ĐÃ HOÀN CHỈNH gần nhất (từ '+monthLabel(state.data.settings.thangBatDauDuTru || startMk)+' trở đi, tháng không phát sinh tính là 0); chưa có tháng hoàn chỉnh nào thì lấy theo chỉ tiêu. Riêng "Trả nợ"/"Thu hồi cho vay" lấy từ lịch trả ở tab Vay - Nợ.</div>'
    + chuThichMauHtml('Chênh lệch = TB thực tế − Chỉ tiêu. ')
    + '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Danh mục</th><th>Chỉ tiêu/tháng</th><th>TB thực tế/tháng</th><th>Chênh lệch</th><th>Gợi ý tháng tới</th></tr></thead><tbody>';
  DONGTIEN_GROUPS.forEach(function(g){
    var kind = g.kind;
    // tiêu đề nhóm + dòng tổng để tách hẳn khối thu với khối chi (trước đây 2 nhóm
    // dính liền nhau, chỉ phân biệt bằng cái tag nhỏ ở cuối tên danh mục)
    html += '<tr><td colspan="5" class="group-title" style="background:var(--bg);text-align:left">'
      + (kind==='thu' ? '▲ ' : '▼ ') + g.title + '</td></tr>';
    var tBase=0, tTb=0, tGoi=0;
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
      var goiY = suggestVal(kind, c.id, monthKeyAdd(currentMk, 1));
      tBase += (base>0?base:0); tTb += (tbA||0); tGoi += (goiY||0);
      html += '<tr>'
        + '<td style="text-align:left;padding-left:18px">'+c.ten+'</td>'
        + '<td>'+(base>0?fmt(base):'—')+'</td>'
        + '<td>'+(tbA!=null?fmt(Math.round(tbA)):'—')+'</td>'
        + '<td>'+chenhHtml(kind, diff)+'</td>'
        + '<td>'+(goiY!=null?fmt(Math.round(goiY)):'—')+'</td>'
        + '</tr>';
    });
    var tDiff = tTb - tBase;
    html += '<tr class="total-row">'
      + '<td style="text-align:left">Tổng '+g.title.toLowerCase()+'</td>'
      + '<td>'+fmt(Math.round(tBase))+'</td>'
      + '<td>'+fmt(Math.round(tTb))+'</td>'
      + '<td>'+chenhHtml(kind, tDiff)+'</td>'
      + '<td>'+fmt(Math.round(tGoi))+'</td>'
      + '</tr>';
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
