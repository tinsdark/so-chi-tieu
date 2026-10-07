"use strict";
/* ====================================================================
   sotay.js — tab "Sổ tay": nhập/sửa/xóa giao dịch theo ngày, tìm kiếm/lọc,
   xuất Excel, và các biểu đồ chi tiêu trong tháng.
   Cần state.js, drive-sync.js, vayno.js (conLaiPhaiThu, loanIsActive, tienDoTraNo) load trước.
   ==================================================================== */


/* Hai danh mục này CHỈ được sinh ra từ tab Vay - Nợ (tạo khoản vay / khoản cho vay)
   rồi tự hạch toán sang Sổ tay. Nhập tay ở đây sẽ tạo tiền mồ côi không gắn với
   khoản nào, sửa/xóa khoản vay không hoàn lại được -> khóa ô.
   Ngoại lệ: ngày đang sửa đã có số nhập tay (dữ liệu cũ) thì vẫn mở để xóa đi được. */
var VN_ONLY_THU = { nhanTienVay: 1 };
var VN_ONLY_CHI = { choVay: 1 };

/* ====================================================================
   GHI NHANH — thẻ ở đầu Sổ tay: số tiền, danh mục, ghi chú, 1 nút Lưu.
   Đi qua entryAddItem (cùng đường lưu với dòng chi tiết / nhập file) nên tổng thu/chi,
   số dư và ví luôn khớp. Các danh mục của Vay-Nợ (Trả nợ, Thu hồi cho vay, Nhận tiền
   vay, Cho vay) KHÔNG có ở đây vì cần gắn khoản vay: dùng "Nhập đầy đủ" bên dưới.
   ==================================================================== */
var QA_KEY = 'chitieu_qa_v1';
(function(){
  try{
    var o = JSON.parse(localStorage.getItem(QA_KEY) || 'null');
    if (o){ state.qa.kind = (o.kind === 'thu') ? 'thu' : 'chi'; state.qa.cat = (o.cat && typeof o.cat === 'object') ? o.cat : {}; }
  }catch(e){}
})();
function qaGhiNho(){
  try{ localStorage.setItem(QA_KEY, JSON.stringify({ kind: state.qa.kind, cat: state.qa.cat })); }catch(e){}
}
function qaCats(kind){
  var he = CAT_HE_THONG[kind] || {};
  return (state.data.categories[kind] || []).filter(function(c){ return !he[c.id]; });
}
// tối đa n danh mục dùng nhiều nhất trong 90 ngày gần nhất (đếm số dòng chi tiết); thiếu thì bù theo thứ tự danh mục
function qaTopCats(kind, n){
  var p = todayStr().split('-'), t = new Date(+p[0], +p[1] - 1, +p[2] - 90);
  var tu = t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  var dem = {};
  Object.keys(state.data.journal).forEach(function(d){
    if (d < tu) return;
    entryItems(state.data.journal[d]).forEach(function(it){
      if (it.kind === kind) dem[it.catId] = (dem[it.catId] || 0) + 1;
    });
  });
  var cats = qaCats(kind);
  var theoDem = cats.filter(function(c){ return dem[c.id]; })
    .sort(function(a, b){ return dem[b.id] - dem[a.id]; });
  var con = cats.filter(function(c){ return !dem[c.id]; });
  return theoDem.concat(con).slice(0, n);
}
// gợi ý ghi chú cho ô Ghi chú của Ghi nhanh: các ghi chú hay dùng nhất của danh mục này trong 180 ngày gần nhất
function qaGoiYGhiChu(kind, catId, n){
  var p = todayStr().split('-'), t = new Date(+p[0], +p[1] - 1, +p[2] - 180);
  var tu = t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  var dem = {};
  Object.keys(state.data.journal).forEach(function(d){
    if (d < tu) return;
    entryItems(state.data.journal[d]).forEach(function(it){
      var g = (it.ghiChu || '').trim();
      if (it.kind !== kind || it.catId !== catId || !g || g === '(chưa chi tiết)') return;
      dem[g] = (dem[g] || 0) + 1;
    });
  });
  return Object.keys(dem).sort(function(a, b){ return dem[b] - dem[a] || (a < b ? -1 : 1); }).slice(0, n || 8);
}
// danh mục đang chọn của 1 loại: lần chọn gần nhất (nếu còn tồn tại và dùng được), không thì cái dùng nhiều nhất
function qaCatChon(kind){
  var ok = qaCats(kind).some(function(c){ return c.id === state.qa.cat[kind]; });
  if (ok) return state.qa.cat[kind];
  var top = qaTopCats(kind, 1);
  return top.length ? top[0].id : '';
}
function ghiNhanhHtml(){
  var kind = (state.qa.kind === 'thu') ? 'thu' : 'chi';
  var cats = qaCats(kind), top = qaTopCats(kind, 5), sel = qaCatChon(kind);
  var topIds = top.map(function(c){ return c.id; });
  var rest = cats.filter(function(c){ return topIds.indexOf(c.id) < 0; });
  var homNay = todayStr(), ngay = state.qa.date || homNay;
  var h = '<div class="card qa k-in" id="ghiNhanh">'
    // xác nhận NGAY TRONG THẺ (không chỉ ở toast): trên iPhone bàn phím đang mở che toast ở mép dưới màn hình
    + (state.qa.last ? '<div class="qa-last" id="qaLast" role="status"><span>'+icon('check')+' '+esc(state.qa.last.text)+'</span>'
        + '<button type="button" class="qa-undo" data-act="qaHoanTac">Hoàn tác</button></div>' : '')
    // hàng 1: Chi/Thu. Hàng 2: tài khoản (trái, chỉ khi có từ 2 ví) + số tiền (phải)
    + '<div class="qa-top"><div class="qa-seg" role="group" aria-label="Loại giao dịch">'
    +   '<button type="button" class="chi'+(kind === 'chi' ? ' on' : '')+'" data-act="qaKind" data-kind="chi" aria-pressed="'+(kind === 'chi')+'">'+icon('arrow-down')+' Chi</button>'
    +   '<button type="button" class="thu'+(kind === 'thu' ? ' on' : '')+'" data-act="qaKind" data-kind="thu" aria-pressed="'+(kind === 'thu')+'">'+icon('arrow-up')+' Thu</button>'
    + '</div></div>'
    + '<div class="qa-amtrow'+(((state.data.wallets || []).length > 1) ? '' : ' one')+'">'
    + (((state.data.wallets || []).length > 1)
        ? '<select id="qa_wallet" class="qa-wallet" data-act="qaWallet" aria-label="Tài khoản / ví">'
          + viOptionsHtml(walletById(state.qa.wallet) ? state.qa.wallet : viDienSan()) + '</select>'
        : '')
    + '<input type="text" inputmode="numeric" autocomplete="off" class="money qa-amt" id="qa_amount" placeholder="0 ₫" aria-label="Số tiền (gõ được 45k, 1,5tr, 45.000+30.000)" value="'+esc(state.qa.amt)+'"></div>'
    // phím nhanh: điện thoại bàn phím số không có + / 000
    + '<div class="qa-keys" aria-label="Phím nhanh cho ô số tiền">'
    +   '<button type="button" data-chen="000" data-for="qa_amount">000</button>'
    +   '<button type="button" data-chen="+" data-for="qa_amount" aria-label="Cộng">+</button>'
    +   '<button type="button" data-chen="-" data-for="qa_amount" aria-label="Trừ">−</button>'
    + '</div>';
  if (!cats.length){
    h += '<div class="empty">Chưa có danh mục '+(kind === 'thu' ? 'thu' : 'chi')+' — thêm ở tab "Danh mục".</div>';
  } else {
    h += '<div class="qa-chips" role="group" aria-label="Danh mục">'
      + top.map(function(c){
          return '<button type="button" class="qa-chip'+(c.id === sel ? ' on' : '')+'" data-act="qaCat" data-cat="'+esc(c.id)+'" aria-pressed="'+(c.id === sel)+'">'+catDot(kind, c.id)+esc(c.ten)+'</button>';
        }).join('')
      + (rest.length
          ? '<select class="qa-more'+(topIds.indexOf(sel) < 0 ? ' on' : '')+'" data-act="qaCatSel" aria-label="Danh mục khác"><option value="">Khác…</option>'
            + rest.map(function(c){ return '<option value="'+esc(c.id)+'"'+(c.id === sel ? ' selected' : '')+'>'+esc(c.ten)+'</option>'; }).join('')
            + '</select>'
          : '')
      + '</div>';
  }
  h += '<div class="qa-row">'
    + '<input type="text" id="qa_note" placeholder="Ghi chú" aria-label="Ghi chú" list="qa_note_goiy" autocomplete="off" value="'+esc(state.qa.note)+'">'
    + '<datalist id="qa_note_goiy">' + (sel ? qaGoiYGhiChu(kind, sel).map(function(g){ return '<option value="'+esc(g)+'">'; }).join('') : '') + '</datalist>'
    + '<input type="date" id="qa_date" class="qa-date'+(ngay !== homNay ? ' lech' : '')+'" aria-label="Ngày" data-act="qaDate" value="'+esc(ngay)+'">'
    + '</div>';
  h += '<button type="button" class="btn qa-save '+kind+'" data-act="qaSave"'+(cats.length ? '' : ' disabled')+'>Ghi khoản '+(kind === 'thu' ? 'thu' : 'chi')+'</button>'
    // nhiều danh mục 1 lần / trả nợ theo khoản / nhập file: ít dùng nên chỉ là đường dẫn nhỏ, không chiếm thẻ riêng
    + '<div class="qa-links">'
    +   '<button type="button" data-act="formToggle" aria-expanded="'+(!!state.fullFormOpen)+'">'+icon('list')+' Nhập đầy đủ (nhiều khoản, trả nợ)</button>'
    +   '<button type="button" data-act="impMo">'+icon('upload')+' Nhập từ file</button>'
    + '</div>'
    + '</div>';
  return h;
}
/* ====================================================================
   TỔNG QUAN — thẻ đầu Sổ tay: số dư to, thu/chi tháng, đã chi bao nhiêu so với chỉ tiêu,
   và "việc cần làm" (định kỳ đến hạn, vay/nợ đến hạn, danh mục vượt hạn mức) bấm là nhảy tới.
   Chỉ ĐỌC dữ liệu, không ghi gì. Số liệu giống các thẻ bên dưới (hanMucThangRows, dinhKyDenHan,
   danhSachSapDenHan) nên không có con số thứ hai nào để lệch.
   ==================================================================== */
function tongQuanHtml(mk, tongThu, tongChi, duDau, duCuoi, beforeLock){
  var laThangNay = (mk === monthKey(todayStr()));
  var so = function(v){ return beforeLock ? '—' : fmt(Math.round(v)); };
  var rows = hanMucThangRows(mk);
  var tongDa = 0, tongCap = 0;
  rows.forEach(function(r){ tongDa += r.da; tongCap += r.cap; });
  var h = '<div class="card hero">'
    + '<div class="hero-lbl">'+(laThangNay ? 'Số dư hiện tại' : 'Số dư cuối tháng')+' · '+monthLabel(mk)+'</div>'
    + '<div class="hero-val">'+so(duCuoi)+'</div>'
    + '<div class="hero-sub">Đầu tháng '+so(duDau)+'</div>'
    + '<div class="hero-split">'
    +   '<div><div class="l">'+icon('arrow-up')+' Thu tháng</div><div class="v">'+fmt(Math.round(tongThu))+'</div></div>'
    +   '<div><div class="l">'+icon('arrow-down')+' Chi tháng</div><div class="v">'+fmt(Math.round(tongChi))+'</div></div>'
    + '</div>';
  var ws = state.data.wallets || [];
  if (ws.length > 1 && !beforeLock){
    var cuoiVi = mk + '-31';
    h += '<div class="hero-vi">' + ws.map(function(w){
        var b = soDuTheoVi(w.id, cuoiVi);
        return '<span><small>'+esc(w.ten)+'</small><b'+(b < 0 ? ' class="am"' : '')+'>'+fmt(Math.round(b))+'</b></span>';
      }).join('')
      + '<button type="button" class="hero-chip" data-act="viChuyenMo">'+icon('transfer')+' Chuyển ví</button></div>';
  }
  if (rows.length){
    var pct = tongCap > 0 ? tongDa / tongCap : 0;
    var muc = hanMucMuc(pct);
    h += '<div class="hero-bud"><div class="hero-bud-top"><span>Chi theo hạn mức</span><span>'
      + (tongDa > tongCap ? 'vượt ' + fmt(Math.round(tongDa - tongCap)) : 'còn ' + fmt(Math.round(tongCap - tongDa))) + '</span></div>'
      + '<div class="hero-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100, Math.round(pct * 100))+'" aria-label="Đã chi so với hạn mức tháng">'
      + '<i class="'+muc+'" style="width:'+Math.min(100, Math.round(pct * 100))+'%"></i></div>'
      + '<div class="hero-bud-sub">'+fmt(Math.round(tongDa))+' / '+fmt(Math.round(tongCap))+' · '+Math.round(pct * 100)+'%</div></div>';
  }
  var nDk = dinhKyDenHan(todayStr()).length;
  var nVn = danhSachSapDenHan(7).length;
  var nVuot = rows.filter(function(r){ return r.pct > 1; }).length;
  var chips = '';
  if (nDk) chips += '<button type="button" class="hero-chip" data-act="tqCuon" data-to="cardDinhKy">'+icon('repeat')+' '+nDk+' khoản định kỳ đến hạn</button>';
  if (nVn) chips += '<button type="button" class="hero-chip" data-act="goVayNo">'+icon('clock')+' '+nVn+' khoản vay/nợ sắp đến hạn</button>';
  if (nVuot) chips += '<button type="button" class="hero-chip" data-act="goBaoCao" data-to="cardHanMuc">'+icon('alert')+' '+nVuot+' danh mục vượt hạn mức</button>';
  h += chips ? '<div class="hero-chips">'+chips+'</div>' : '<div class="hero-ok">'+icon('check')+' Không có khoản nào cần xử lý</div>';
  return h + '</div>';
}

// hoàn tác 1 lần ghi nhanh. Gọi từ cả nút trong thẻ lẫn nút ở toast: cờ daHoan chặn hoàn tác 2 lần
// (lần 2 sẽ gỡ nhầm một đoạn ghi chú trùng nội dung của khoản khác).
function qaHoanTacLanGhi(ban){
  if (!ban || ban.daHoan) return;
  ban.daHoan = true;
  if (state.qa.last === ban.moc) state.qa.last = null;
  dinhKyHoanTac(ban);          // gỡ ghi chú + xóa dòng (xóa luôn ngày nếu rỗng)
  scheduleSave();
  renderSoTay();
}
function qaVeLai(){
  var box = document.getElementById('ghiNhanh');
  if (box) box.outerHTML = ghiNhanhHtml();
}
document.addEventListener('input', function(ev){
  var el = ev.target;
  if (!el || !el.id) return;
  if (el.id === 'qa_amount') state.qa.amt = el.value;
  else if (el.id === 'qa_note'){ state.qa.note = el.value; qaApDungQuyTac(); }
});
// gõ ghi chú khớp quy tắc tự phân loại -> chọn sẵn danh mục (chưa tự bấm chọn danh mục nào).
// Chỉ đổi lớp .on của chip / giá trị ô "Khác…", KHÔNG vẽ lại thẻ (vẽ lại là mất focus, bàn phím sập).
function qaApDungQuyTac(){
  if (state.qa.catTay) return;
  var kind = (state.qa.kind === 'thu') ? 'thu' : 'chi';
  var id = nhapQuyTac(kind, state.qa.note);
  if (!id || id === qaCatChon(kind)) return;
  state.qa.cat[kind] = id;
  var box = document.getElementById('ghiNhanh');
  if (!box) return;
  var trongChip = false;
  box.querySelectorAll('[data-act=qaCat]').forEach(function(b){
    var on = b.getAttribute('data-cat') === id; if (on) trongChip = true;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
  var sel = box.querySelector('[data-act=qaCatSel]');
  if (sel){ sel.value = trongChip ? '' : id; sel.classList.toggle('on', !trongChip); }
}

// thanh chọn tháng dùng chung cho Sổ tay và Báo cáo (cùng state.soTayMonth)
function thangNavHtml(mk){
  var monthOpts = soTayMonthList().map(function(m){
    return '<option value="'+m+'"'+(m===mk?' selected':'')+'>'+monthLabel(m)+'</option>';
  }).join('');
  return '<div class="month-nav">'
    + '<button data-act="prevMonth" aria-label="Tháng trước">‹</button>'
    + '<select data-act="jumpMonth">'+monthOpts+'</select>'
    + '<button data-act="nextMonth" aria-label="Tháng sau">›</button>'
    + '</div>';
}
// vẽ lại tab đang mở (thẻ mục tiêu / thanh tháng có ở cả Sổ tay và Báo cáo)
function veLaiTabSoTay(){ if (state.tab === 'baocao') renderBaoCao(); else renderSoTay(); }
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
  if (typeof XLSX === 'undefined'){ toast('Chưa tải được thư viện Excel (cần mạng lần đầu). Thử lại khi có mạng.', { loai:'err' }); return; }
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
  html += thangNavHtml(mk);
  // màn rộng (>=1024px, CSS .cot2): cột trái = tổng quan + ghi nhanh + việc cần làm, cột phải = form + danh sách
  html += '<div class="cot2"><div class="cot-trai">';
  html += tongQuanHtml(mk, tongThu, tongChi, duDauThang, duCuoiThang, beforeLock);
  if (beforeLock){
    html += '<div class="empty" style="margin-top:-6px">Tháng này trước mốc chốt số dư ('+state.data.settings.ngayBatDau+') nên không còn tính vào số dư — dữ liệu vẫn xem được bên dưới.</div>';
  }

  // Sổ tay chỉ giữ việc hằng ngày: tổng quan -> ghi nhanh -> việc cần làm -> danh sách giao dịch.
  // Hạn mức, mục tiêu, biểu đồ nằm ở tab Báo cáo (renderBaoCao, bieudo.js).
  html += viSoDuCardHtml(mk);
  html += ghiNhanhHtml();
  html += dinhKyDenHanHtml();

  // Entry form — mặc định ẨN (thẻ "Ghi nhanh" lo việc thường ngày); mở khi đang sửa 1 ngày hoặc bấm "Nhập đầy đủ" ở Ghi nhanh
  // id=formGiaoDich: mốc để cuộn tới khi sửa ngày
  var formMo = !!(state.editingDate || state.fullFormOpen);
  var htmlTruocForm = html;
  html = '';
  html += '<div class="card" id="formGiaoDich"><div class="form-head"><h3>'+(state.editingDate? 'Sửa ngày '+editDate : 'Nhập đầy đủ')+'</h3>'
    + (state.editingDate ? '' : '<button class="btn secondary sm" data-act="formToggle" aria-expanded="true">Thu gọn ▴</button>') + '</div>';
  html += '<div class="form-row">';
  // đang sửa thì KHÓA ngày: đổi ngày ở đây từng ghi đè ngày đích và để nguyên ngày gốc (tiền nhân đôi/mất)
  html += '<div><label>Ngày'+(state.editingDate ? ' <span style="color:var(--muted);font-weight:400">(không đổi được khi sửa)</span>' : '')+'</label><input type="date" id="f_date" value="'+editDate+'"'+(state.editingDate ? ' disabled' : '')+'></div>';
  // chọn ví chỉ cho thêm MỚI: sửa 1 ngày cũ không biết dòng nào của ví nào, nên ví từng dòng
  // chỉnh ở bảng chi tiết. Khoản vay/cho vay luôn đi theo ví của chính khoản đó.
  if ((state.data.wallets || []).length > 1 && !state.editingDate){
    html += '<div><label>Ví / nguồn tiền</label><select id="f_wallet">'
      + viOptionsHtml(viDienSan()) + '</select></div>';
  }
  html += '</div>';
  // THU và CHI là 2 khối riêng (màu + viền + tiêu đề), nhưng vẫn CÙNG 1 form / 1 nút Lưu:
  // saveEntry là đường lưu duy nhất, tách thành 2 form là dựng đường lưu thứ hai.
  html += '<div class="form-sec thu"><div class="form-sec-head">'+icon('arrow-up')+' Khoản thu</div>';
  html += '<div class="form-row">';
  if (!thuCats.length){
    html += '<div class="empty">Chưa có danh mục thu — thêm ở tab "Danh mục".</div>';
  }
  thuCats.forEach(function(c){
    var lockThu = hasRefs ? entryRefSum(editEntry, 'thu', c.id) : 0;
    var vt = num((editEntry.thu||{})[c.id]) - lockThu;
    if (vt <= 0) vt = '';
    var roThu = !!VN_ONLY_THU[c.id] && !vt;
    html += '<div><label>'+esc(c.ten)
      + (lockThu > 0 ? ' <span style="color:var(--muted);font-weight:400">(+'+fmt(Math.round(lockThu))+' khóa từ Vay-Nợ)</span>' : '')
      + '</label><input type="text" inputmode="numeric" autocomplete="off" class="money f_thu" data-cat="'+c.id+'" data-lock="'+lockThu+'" value="'+veSo(vt)+'" placeholder="0"'
      + (roThu ? ' readonly tabindex="-1" style="background:var(--bg);color:var(--muted)" title="Danh mục này chỉ ghi được từ tab Vay - Nợ"' : '')
      + '>';
    if (VN_ONLY_THU[c.id]){
      html += '<div class="empty" style="padding:2px 0 0;font-size:11px;text-align:left">'
        + (roThu ? 'Ghi ở tab Vay - Nợ (thêm khoản vay) — tự hạch toán sang đây.'
                 : 'Số này nhập tay, không gắn khoản vay nào. Nên xóa và tạo khoản ở tab Vay - Nợ.')
        + '</div>';
    }
    if (c.id === 'thuHoiChoVay' && !state.editingDate){
      var pendingCV = (state.data.vayNo.choVay||[]).filter(function(l){ return l.trangThai !== 'da_thu_du' && conLaiPhaiThu(l) > 0.01; });
      if (pendingCV.length){
        html += '<select id="sotay_selChoVay" data-act="soTayChonChoVay" style="margin-top:4px;width:100%;font-size:12px">'
          + '<option value="">— chọn khoản cho vay (tùy chọn) —</option>'
          + pendingCV.map(function(l){ return '<option value="'+l.id+'">'+esc(l.ten)+' (còn '+fmt(conLaiPhaiThu(l))+')</option>'; }).join('')
          + '</select>';
      }
    }
    html += '</div>';
  });
  html += '</div></div>';     // đóng form-row + khối THU
  html += '<div class="form-sec chi"><div class="form-sec-head">'+icon('arrow-down')+' Khoản chi</div>';
  html += '<div class="form-row">';
  if (!cats.length){
    html += '<div class="empty">Chưa có danh mục chi — thêm ở tab "Danh mục".</div>';
  }
  cats.forEach(function(c){
    var lockChi = hasRefs ? entryRefSum(editEntry, 'chi', c.id) : 0;
    var v = num((editEntry.chi||{})[c.id]) - lockChi;
    if (v <= 0) v = '';
    var roChi = !!VN_ONLY_CHI[c.id] && !v;
    html += '<div><label>'+esc(c.ten)
      + (lockChi > 0 ? ' <span style="color:var(--muted);font-weight:400">(+'+fmt(Math.round(lockChi))+' khóa từ Vay-Nợ)</span>' : '')
      + '</label><input type="text" inputmode="numeric" autocomplete="off" class="money f_chi" data-cat="'+c.id+'" data-lock="'+lockChi+'" value="'+veSo(v)+'" placeholder="0"'
      + (roChi ? ' readonly tabindex="-1" style="background:var(--bg);color:var(--muted)" title="Danh mục này chỉ ghi được từ tab Vay - Nợ"' : '')
      + '>';
    if (VN_ONLY_CHI[c.id]){
      html += '<div class="empty" style="padding:2px 0 0;font-size:11px;text-align:left">'
        + (roChi ? 'Ghi ở tab Vay - Nợ (thêm khoản cho vay) — tự hạch toán sang đây.'
                 : 'Số này nhập tay, không gắn khoản cho vay nào. Nên xóa và tạo khoản ở tab Vay - Nợ.')
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
              return '<option value="'+l.id+'">'+esc(l.ten)+' ('+td.daTraKy+'/'+td.tongKy+' kỳ, kỳ '+(td.kyTiepIdx+1)+' còn '+fmt(Math.round(thieu))+')</option>';
            }).join('')
          + '</select>';
      }
    }
    html += '</div>';
  });
  html += '</div></div>';     // đóng form-row + khối CHI
  if (hasRefs){
    html += '<div class="empty" style="padding:0 0 4px">Ngày này có giao dịch do khoản vay/cho vay sinh ra (phần "khóa"). Ô nhập chỉ chứa phần nhập tay; phần khóa muốn sửa thì vào tab Vay - Nợ.</div>';
  }
  html += '<label>Nội dung</label><input type="text" id="f_ghichu" value="'+(editEntry.ghiChu||'').replace(/"/g,'&quot;')+'" placeholder="Ghi chú...">';
  html += '<div style="margin-top:12px;display:flex;gap:8px">';
  html += '<button class="btn" data-act="saveEntry">'+(state.editingDate?'Cập nhật':'Lưu')+'</button>';
  if (state.editingDate) html += '<button class="btn secondary" data-act="cancelEdit">Hủy</button>';
  html += '</div></div>';
  var formHtml = html;
  html = htmlTruocForm;
  html += '</div><div class="cot-phai">';
  if (formMo) html += formHtml;

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

  html += nhapCardHtml();
  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Chi tiết theo ngày <span style="display:flex;gap:6px"><button class="btn secondary sm" data-act="exportExcel">'+icon('download')+' Xuất Excel</button></span></h3>';
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
      ? '<div class="empty-box">Không có giao dịch khớp với bộ lọc.'
        + '<div><button class="btn secondary sm" data-act="soTayClearFilter">Xóa lọc</button></div></div>'
      : '<div class="empty-box">Chưa có giao dịch trong '+monthLabel(mk)+'.'
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
          + '<button class="icon-btn" data-act="editDay" data-date="'+d+'" title="Sửa ngày này" aria-label="Sửa giao dịch ngày '+d+'">'+icon('pencil')+'</button>'
          + '<button class="icon-btn" data-act="delDay" data-date="'+d+'" title="Xóa ngày này" aria-label="Xóa giao dịch ngày '+d+'">'+icon('trash')+'</button>'
          + '</td>'
        + '</tr>';
      if (moRong) html += soTayDetailHtml(d);
    });
    html += '</tbody></table>';
  }
  html += '</div></div>';

  // Biểu đồ: js/bieudo.js (SVG tự vẽ, 3 tab)

  html += '</div></div>';
  root.innerHTML = html;
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
            + viOptionsHtml(it ? viCuaItem(it) : viDienSan()) + '</select>'
          : '')
      + '</td>'
    + '<td><input type="text" inputmode="numeric" autocomplete="off" class="money" id="st_it_tien" placeholder="0" value="'+(it?veSo(num(it.soTien)):'')+'"></td>'
    + '<td style="text-align:left"><input type="text" id="st_it_note" placeholder="Nội dung..." value="'+(it?esc(it.ghiChu):'')+'"></td>'
    + '<td class="actions-col">'
      + '<button class="icon-btn" data-act="stSaveItem" data-date="'+date+'" data-iid="'+(it?it.iid:'')+'" title="Lưu" aria-label="Lưu">'+icon('check')+'</button>'
      + '<button class="icon-btn" data-act="stCancelItem" title="Hủy" aria-label="Hủy">'+icon('x')+'</button>'
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
        + '<td style="text-align:left">'+catDot(it.kind, it.catId)+esc(catTen(it.kind, it.catId))
          + ((state.data.wallets || []).length > 1 ? ' <span class="vi-chip">'+esc(viTen(viCuaItem(it)))+'</span>' : '')+'</td>'
        + '<td style="color:var(--'+(it.kind==='thu'?'green':'red')+')">'+fmt(Math.round(num(it.soTien)))+'</td>'
        + '<td style="text-align:left;white-space:normal">'+esc(it.ghiChu||'')+'</td>'
        + '<td class="actions-col">'
          + '<button class="icon-btn" data-act="stEditItem" data-date="'+date+'" data-iid="'+it.iid+'" title="Sửa dòng này" aria-label="Sửa dòng này">'+icon('pencil')+'</button>'
          + '<button class="icon-btn" data-act="stDelItem" data-date="'+date+'" data-iid="'+it.iid+'" title="Xóa dòng này" aria-label="Xóa dòng này">'+icon('trash')+'</button>'
        + '</td></tr>';
    });
    // refs: chỉ đọc, bấm vào là nhảy sang tab Vay - Nợ để sửa cho đúng chỗ
    refs.forEach(function(r){
      var m = REF_MAP[r.loai];
      if (!m) return;
      h += '<tr class="st-ref">'
        + '<td style="text-align:left"><span class="st-kind '+m.kind+'">'+(m.kind==='thu'?'Thu':'Chi')+'</span></td>'
        + '<td style="text-align:left">'+esc(catTen(m.kind, m.cat))+' <span class="st-lock">'+icon('lock')+' Vay-Nợ</span>'
          + ((state.data.wallets || []).length > 1 ? ' <span class="vi-chip">'+esc(viTen(viCuaRef(r)))+'</span>' : '')+'</td>'
        + '<td style="color:var(--'+(m.kind==='thu'?'green':'red')+')">'+fmt(Math.round(num(r.soTien)))+'</td>'
        + '<td style="text-align:left;white-space:normal">'+esc(REF_LABEL[r.loai]||r.loai)
          + (r.ky != null ? ' · kỳ '+(num(r.ky)+1) : '')
          + (r.note ? ' — '+esc(r.note) : '')+'</td>'
        + '<td class="actions-col"><button class="icon-btn" data-act="goVayNo" title="Sửa ở tab Vay - Nợ" aria-label="Sửa ở tab Vay - Nợ">'+icon('up-right')+'</button></td>'
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
   MỤC TIÊU TIẾT KIỆM — card tiến độ. Logic ở state.js (mucTieuTienDo); khai báo ở tab Danh mục.
   ==================================================================== */
function mucTieuCardHtml(){
  var gs = state.data.mucTieu || [];
  if (!gs.length) return '';
  var hom = todayStr();
  var h = '<div class="card k-goal"><h3>Mục tiêu tiết kiệm</h3><div class="hm-list">';
  gs.forEach(function(g){
    var t = mucTieuTienDo(g, hom);
    var rong = Math.min(100, Math.round(t.pct * 100));
    var phu;
    if (t.xong) phu = '<span style="color:var(--green)">Đã đủ mục tiêu</span>';
    else if (t.quaHan) phu = '<span style="color:var(--red)">Quá hạn '+g.hanChot.slice(5)+'/'+g.hanChot.slice(0, 4)+' · còn thiếu '+fmt(Math.round(t.conThieu))+'</span>';
    else {
      phu = 'Còn thiếu '+fmt(Math.round(t.conThieu));
      if (t.canMoiThang != null){
        phu += ' · cần ~<b>'+fmt(Math.round(t.canMoiThang))+'</b>/tháng ('+t.soThangCon+' tháng tới hết '+g.hanChot.slice(5)+'/'+g.hanChot.slice(0, 4)+')';
      }
    }
    h += '<div class="hm-row">'
      + '<div class="hm-top"><span class="hm-ten">'+esc(g.ten)
        + (t.theoVi ? ' <span class="vi-chip">'+esc(viTen(g.walletId))+'</span>' : '') + '</span>'
      + '<span class="hm-so">'+fmt(Math.round(t.da))+' / '+fmt(Math.round(t.dich))+' · '+Math.round(t.pct * 100)+'%</span></div>'
      + '<div class="hm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rong+'" aria-label="'+esc(g.ten)+'">'
      + '<div class="hm-fill mt'+(t.xong ? ' done' : '')+'" style="width:'+rong+'%"></div></div>'
      + '<div class="hm-vuot" style="color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px">'
        + '<span>'+phu+'</span>'
        + (t.theoVi ? '' : '<button class="btn secondary sm" data-act="mtGom" data-id="'+esc(g.id)+'">+ Gom thêm</button>')
      + '</div></div>';
  });
  return h + '</div></div>';
}

/* ====================================================================
   KHOẢN ĐỊNH KỲ ĐẾN HẠN — card nhắc ở đầu Sổ tay. Mẫu khai báo ở tab Danh mục;
   logic nằm ở state.js (dinhKyDenHan / dinhKyGhi). Bấm "Ghi vào Sổ tay" mới có tiền.
   ==================================================================== */
function dinhKyDenHanHtml(){
  var ds = dinhKyDenHan(todayStr());
  if (!ds.length) return '';
  var h = '<div class="card dk-card k-act" id="cardDinhKy"><h3 style="display:flex;align-items:center;gap:8px">Khoản định kỳ đến hạn <span class="hm-badge over">'+ds.length+'</span></h3>';
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
  var ds = (state.data.chuyenVi || []).filter(function(t){ return monthKey(t.ngay) === mk; })
    .sort(function(a, b){ return a.ngay < b.ngay ? 1 : (a.ngay > b.ngay ? -1 : 0); });
  // số dư từng ví đã nằm ở thẻ tổng quan; thẻ này chỉ hiện khi đang chuyển tiền hoặc tháng có lần chuyển
  if (!state.viFormOpen && !ds.length) return '';
  var h = '<div class="card k-wal"><h3>Chuyển tiền giữa ví'
    + (state.viFormOpen ? '' : '<button class="btn secondary sm" data-act="viChuyenMo">'+icon('transfer')+' Chuyển ví</button>') + '</h3>';
  if (state.viFormOpen){
    var tuMd = walletById(viDienSan()) ? viDienSan() : ws[0].id;
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
      + '<div class="empty" style="padding:0;text-align:left">Chuyển tiền không phải thu hay chi: không vào tổng thu/chi, biểu đồ hay dự kiến, và không đổi tổng số dư.</div></div>';
  }
  if (ds.length){
    // danh sách (không phải bảng): bảng 4 cột tràn ngang màn hình điện thoại, cột Ghi chú bị cắt
    h += '<div class="vi-ds">';
    ds.forEach(function(t){
      h += '<div class="vi-ct">'
        + '<div class="vi-ct-main"><div><b>'+t.ngay.slice(8,10)+'/'+t.ngay.slice(5,7)+'</b> · '+esc(viTen(t.tuVi))+' → '+esc(viTen(t.denVi))+'</div>'
        + (t.ghiChu ? '<div class="vi-ct-note">'+esc(t.ghiChu)+'</div>' : '') + '</div>'
        + '<div class="vi-ct-tien">'+fmt(Math.round(num(t.soTien)))+'</div>'
        + '<button class="icon-btn" data-act="viChuyenXoa" data-id="'+esc(t.id)+'" title="Xóa lần chuyển này" aria-label="Xóa lần chuyển tiền ngày '+t.ngay+'">'+icon('trash')+'</button></div>';
    });
    h += '</div>';
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
  var h = '<div class="card k-bud" id="cardHanMuc"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:8px">Hạn mức '+monthLabel(mk).toLowerCase()
    + (nVuot ? ' <span class="hm-badge over">'+nVuot+' danh mục vượt</span>' : '') + '</h3><div class="hm-list">';
  rows.forEach(function(r){
    var muc = hanMucMuc(r.pct);
    var rong = Math.min(100, Math.round(r.pct * 100));
    h += '<div class="hm-row">'
      + '<div class="hm-top"><span class="hm-ten">'+catDot('chi', r.id)+esc(r.ten)+'</span>'
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
/* ---- Sổ tay: handlers ---- */
function handleSoTayAction(act, el){
  if (handleBieuDoAction(act, el)) return true;
  if (act === 'prevMonth' || act === 'nextMonth'){
    var p = state.soTayMonth.split('-'); var y=parseInt(p[0],10), m=parseInt(p[1],10);
    m += (act==='nextMonth'?1:-1);
    if (m<1){m=12;y--;} if (m>12){m=1;y++;}
    state.soTayMonth = y+'-'+pad2(m);
    veLaiTabSoTay();
  } else if (act === 'saveEntry'){
    var date = state.editingDate || document.getElementById('f_date').value || todayStr();
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
      // danh mục không còn trong form (đã bị xóa từ trước) mà ngày này vẫn có tiền: GIỮ NGUYÊN,
      // nếu không repairEntryItems sẽ xóa phần tiền đó khỏi các dòng chi tiết
      var coONhap = { thu: {}, chi: {} };
      document.querySelectorAll('.f_thu').forEach(function(inp){ coONhap.thu[inp.getAttribute('data-cat')] = 1; });
      document.querySelectorAll('.f_chi').forEach(function(inp){ coONhap.chi[inp.getAttribute('data-cat')] = 1; });
      ['thu', 'chi'].forEach(function(kd){
        var dst = (kd === 'thu') ? thu : chi;
        Object.keys(oldE[kd] || {}).forEach(function(cid){
          if (!coONhap[kd][cid] && num(oldE[kd][cid]) > 0) dst[cid] = num(oldE[kd][cid]);
        });
      });
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
            var itNew = { iid: newIid(), kind: kind, catId: cid, soTien: src[cid], ghiChu: ghiChu, walletId: viSel };
            // mẩu ghi chú ngày của lần lưu này (có thể dùng chung cho nhiều dòng) — để xóa dòng thì gỡ chữ theo
            if (ghiChuLuu) itNew.gc = ghiChuLuu;
            eNew.items.push(itNew);
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
    // chiều ngược lại: có nhập tiền mà không chọn khoản -> tiền vẫn vào Sổ tay nhưng khoản vay/cho vay
    // không đổi gì (vẫn còn nợ / còn phải thu), nên nhắc để người dùng biết
    if (!wasEditing && selCV && !cvIdSel && thu['thuHoiChoVay']){
      toast('Đã ghi "Thu hồi cho vay" nhưng chưa chọn khoản cho vay — khoản đó vẫn tính là chưa thu.', { loai:'warn' });
    }
    if (!wasEditing && selVN && !vnIdSel && chi['traNo']){
      toast('Đã ghi "Trả nợ" nhưng chưa chọn khoản vay — tiến độ trả nợ của khoản vay không đổi.', { loai:'warn' });
    }
    ketThuc();
  } else if (act === 'qaKind'){
    state.qa.kind = (el.getAttribute('data-kind') === 'thu') ? 'thu' : 'chi';
    qaGhiNho();
    qaVeLai();
    qaApDungQuyTac();
  } else if (act === 'qaCat'){
    state.qa.cat[state.qa.kind === 'thu' ? 'thu' : 'chi'] = el.getAttribute('data-cat');
    state.qa.catTay = true;      // tự bấm chọn danh mục thì quy tắc tự phân loại không đổi nữa
    qaGhiNho();
    qaVeLai();
  } else if (act === 'qaSave'){
    var kQ = (state.qa.kind === 'thu') ? 'thu' : 'chi';
    var tienQ = numNonNeg(docSo((document.getElementById('qa_amount') || {}).value));
    var noteQ = ((document.getElementById('qa_note') || {}).value || '').trim();
    var ngayQ = (document.getElementById('qa_date') || {}).value || todayStr();
    var viQ = (document.getElementById('qa_wallet') || {}).value || '';
    var catQ = qaCatChon(kQ);
    if (tienQ <= 0){
      toast('Nhập số tiền.', { loai:'warn' });
      var oTien = document.getElementById('qa_amount'); if (oTien && oTien.focus) oTien.focus();
      return true;
    }
    if (!catQ){ toast('Chưa có danh mục '+(kQ === 'thu' ? 'thu' : 'chi')+' để ghi — thêm ở tab "Danh mục".', { loai:'warn' }); return true; }
    var itQ = entryAddItem(ngayQ, kQ, catQ, tienQ, noteQ, viQ || state.viChon);
    if (!itQ){ toast('Không ghi được khoản này.', { loai:'err' }); return true; }
    // ghi chú của NGÀY: giống saveEntry — có nội dung thì gắn thêm số tiền để cột Nội dung đọc ra luôn có số
    var ghiQ = noteQ ? noteQ + ' ' + fmt(Math.round(tienQ)) : '';
    if (ghiQ){
      var eQ = state.data.journal[ngayQ];
      eQ.ghiChu = eQ.ghiChu ? eQ.ghiChu + '; ' + ghiQ : ghiQ;
      itQ.gc = ghiQ;       // xóa dòng này thì mẩu ghi chú ngày cũng đi theo
    }
    state.qa.cat[kQ] = catQ; qaGhiNho();
    state.qa.amt = ''; state.qa.note = ''; state.qa.catTay = false; state.qa.date = (ngayQ !== todayStr()) ? ngayQ : '';
    // có ví mặc định đã tích chọn: lần nhập sau quay về ví đó; chưa có thì nhớ ví vừa chọn như trước
    if (viQ && walletById(viQ)){ state.viChon = viQ; state.qa.wallet = viMacDinhDaChon() ? '' : viQ; }
    var banGhi = { date: ngayQ, iid: itQ.iid, note: ghiQ, daHoan: false };
    var startQ = state.data.settings.ngayBatDau || '';
    var truocMoc = !!(startQ && ngayQ < startQ);
    var tinQ = 'Đã ghi ' + (kQ === 'thu' ? 'thu' : 'chi') + ' ' + catTen(kQ, catQ) + ' ' + fmt(Math.round(tienQ))
      + ' (' + ngayQ.slice(8,10) + '/' + ngayQ.slice(5,7) + ')'
      + (truocMoc ? ' — trước mốc chốt số dư ' + ngayVN(startQ) + ', không tính vào số dư.' : '.');
    state.qa.last = { text: tinQ, ban: banGhi };
    banGhi.moc = state.qa.last;
    // hạ bàn phím: bàn phím che toast ở đáy màn hình, và ô số tiền sắp được xóa trắng để nhập khoản sau
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    scheduleSave();
    renderSoTay();
    if (typeof motionDaGhi === 'function') motionDaGhi();     // nút Ghi chớp dấu tích + rung nhẹ
    var chotQ = state.qa.last;
    setTimeout(function(){
      if (state.qa.last === chotQ){
        state.qa.last = null;
        var eL = document.getElementById('qaLast');
        if (eL && eL.parentNode) eL.parentNode.removeChild(eL);
      }
    }, 20000);
    toast(tinQ, { loai: truocMoc ? 'warn' : undefined, giay: 8, hoanTac: function(){ qaHoanTacLanGhi(banGhi); } });
  } else if (act === 'qaHoanTac'){
    if (state.qa.last){ var banH = state.qa.last.ban; qaHoanTacLanGhi(banH); toast('Đã hoàn tác.'); }
  } else if (act === 'goBaoCao'){
    var toBC = el.getAttribute('data-to') || '';
    chuyenTab('baocao');
    // đổi tab có chuyển cảnh thì tab mới vẽ sau 1 nhịp -> đợi rồi mới cuộn tới thẻ
    setTimeout(function(){
      var dichBC = document.getElementById(toBC);
      if (dichBC && dichBC.scrollIntoView) dichBC.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 320);
  } else if (act === 'tqCuon'){
    var dich = document.getElementById(el.getAttribute('data-to') || '');
    if (dich && dich.scrollIntoView) dich.scrollIntoView({ behavior:'smooth', block:'start' });
  } else if (act === 'formToggle'){
    state.fullFormOpen = !state.fullFormOpen;
    renderSoTay();
    if (state.fullFormOpen){ var bF = document.getElementById('formGiaoDich'); if (bF && bF.scrollIntoView) bF.scrollIntoView({ behavior:'smooth', block:'start' }); }
  } else if (act === 'cancelEdit'){
    state.editingDate = null;
    renderSoTay();
  } else if (act === 'editDay'){
    state.editingDate = el.getAttribute('data-date');
    renderSoTay();
    var bE = document.getElementById('formGiaoDich');
    if (bE && bE.scrollIntoView) bE.scrollIntoView({ behavior:'smooth', block:'start' }); else window.scrollTo({top:0, behavior:'smooth'});
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
  } else if (act === 'mtGom'){
    var mtG = (state.data.mucTieu || []).find(function(g){ return g.id === el.getAttribute('data-id'); });
    if (!mtG) return true;
    (async function(){
      var them = await hoiSo('Gom thêm cho "'+mtG.ten+'"', 'Số tiền vừa để dành thêm cho mục tiêu này. Chỉ cộng vào số đã gom, không ghi thu/chi ở Sổ tay.', 'Số tiền gom thêm');
      if (them == null) return;
      mtG.daGom = num(mtG.daGom) + them;
      scheduleSave();
      veLaiTabSoTay();
      toast('Đã gom thêm '+fmt(Math.round(them))+' cho "'+mtG.ten+'".', { hoanTac: function(){
        mtG.daGom = num(mtG.daGom) - them;
        scheduleSave(); veLaiTabSoTay();
      } });
    })();
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
    /* Xóa NGAY + Hoàn tác trong toast (giống xóa cả ngày không có ref): 1 dòng nhập tay không dính khoản vay,
       hoàn tác = trả lại nguyên object ngày trước khi xóa. Chỉ hoàn tác khi ngày đó KHÔNG bị sửa gì thêm
       sau lần xóa (so với bản ngay sau khi xóa) — sửa rồi mà trả bản cũ là mất phần sửa. */
    var truocXoa = JSON.parse(JSON.stringify(eD));
    var nhanItD = '"'+(itD.ghiChu||catTen(itD.kind, itD.catId))+'" · '+fmt(Math.round(num(itD.soTien)));
    entryDeleteItem(dD, iidD);
    var sauXoa = JSON.stringify(state.data.journal[dD] || null);
    if (!state.data.journal[dD]) state.soTayDetailDate = null;
    state.soTayEditIid = null;
    scheduleSave();
    renderSoTay();
    toast('Đã xóa dòng '+nhanItD+'.', { giay:6, hoanTac:function(){
      if (JSON.stringify(state.data.journal[dD] || null) !== sauXoa){
        toast('Ngày này đã được sửa thêm sau khi xóa nên không hoàn tác được.', { loai:'warn' });
        return;
      }
      state.data.journal[dD] = truocXoa;
      invalidateBalanceCache();
      scheduleSave();
      renderSoTay();
      toast('Đã hoàn tác.');
    } });
  } else if (act === 'goVayNo'){
    state.tab = 'vayno';
    document.querySelectorAll('.tab').forEach(function(t){
      t.classList.toggle('active', t.getAttribute('data-tab') === 'vayno');
    });
    renderAll();
    window.scrollTo({top:0, behavior:'smooth'});
  } else if (act === 'fabAdd'){
    /* FAB không mở bottom sheet riêng mà cuộn tới + focus thẻ "Ghi nhanh" đang có ở đầu Sổ tay.
       Thẻ đó và form đầy đủ đều ghi qua entryAddItem; các ràng buộc khóa ref / gắn khoản vay /
       chống nhập tay danh mục Vay-Nợ nằm ở form đầy đủ, còn Ghi nhanh loại hẳn các danh mục đó. */
    if (state.tab !== 'sotay'){
      state.tab = 'sotay';
      document.querySelectorAll('.tab').forEach(function(t){
        t.classList.toggle('active', t.getAttribute('data-tab') === 'sotay');
      });
      renderAll();
    }
    var box = document.getElementById('ghiNhanh') || document.getElementById('formGiaoDich');
    if (box) box.scrollIntoView({ behavior:'smooth', block:'center' });
    // ô số tiền của thẻ Ghi nhanh; nếu không có (chưa đăng nhập xong) thì ô chi đầu tiên của form đầy đủ
    var oNhap = document.getElementById('qa_amount')
             || document.querySelector('.f_chi:not([readonly])')
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
    veLaiTabSoTay();
    return true;
  } else if (el.matches('[data-act=qaCatSel]')){
    if (el.value){ state.qa.cat[state.qa.kind === 'thu' ? 'thu' : 'chi'] = el.value; state.qa.catTay = true; qaGhiNho(); }
    qaVeLai();
    return true;
  } else if (el.matches('[data-act=qaWallet]')){
    // nhớ ví đang chọn: các lần vẽ lại thẻ (chạm nút danh mục, đổi Chi/Thu) không được đặt lại về ví mặc định
    if (walletById(el.value)) state.qa.wallet = el.value;
    return true;
  } else if (el.matches('[data-act=qaDate]')){
    state.qa.date = (el.value && el.value !== todayStr()) ? el.value : '';
    qaVeLai();
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
