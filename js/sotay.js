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
var VN_ONLY_THU = { nhanTienVay: 1, thuHoiChoVay: 1 };
var VN_ONLY_CHI = { choVay: 1 };

/* ====================================================================
   GHI NHANH — thẻ ở đầu Sổ tay: số tiền, danh mục, ghi chú, 1 nút Lưu.
   Đi qua entryAddItem (cùng đường lưu với dòng chi tiết / nhập file) nên tổng thu/chi,
   số dư và ví luôn khớp. Các danh mục của Vay-Nợ (Trả nợ, Thu hồi cho vay, Nhận tiền
   vay, Cho vay) KHÔNG có ở đây vì cần gắn khoản vay: ghi ở tab Vay - Nợ.
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
function qaNgayLui(n){
  var p = todayStr().split('-'), t = new Date(+p[0], +p[1] - 1, +p[2] - n);
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
}
// nút "Ghi khoản chi" đổi thành "Nhập số tiền để ghi" khi chưa có số: gọi lại mỗi lần gõ vào ô số tiền
function qaNutCapNhat(){
  var b = document.querySelector('#ghiNhanh .qa-save');
  if (!b) return;
  var co = numNonNeg(docSo(state.qa.amt)) > 0, kind = (state.qa.kind === 'thu') ? 'thu' : 'chi';
  b.textContent = co ? 'Ghi khoản ' + kind : 'Nhập số tiền để ghi';
  b.classList.toggle('chua', !co);
}
/* Thanh "Ghi nhanh" nổi trên thanh tab: bấm = mở bảng ghi khoản (ghiNhanhHtml). Thanh nằm trong trang Sổ tay
   nên rời tab là mất; bảng ghi thì nằm ngoài #tabContent (xem qaSheetVe) để không bị animation của thẻ làm lệch. */
function qaBarHtml(){
  var vi = ((state.data.wallets || []).length > 1)
    ? '<span class="qa-bar-vi">'+esc(viTen(walletById(state.qa.wallet) ? state.qa.wallet : viDienSan()))+'</span>' : '';
  return '<div class="qa-bar-wrap"><button type="button" class="qa-bar" data-act="qaMo" aria-haspopup="dialog">'
    + '<span class="qa-bar-plus">'+icon('plus')+'</span>'
    + '<span class="qa-bar-txt"><b>Ghi nhanh</b><small>Khoản chi hoặc khoản thu</small></span>'+vi+'</button></div>';
}
// Bảng ghi khoản (bottom sheet). Cùng id (qa_amount, qa_note, qa_date, qa_wallet) và cùng đường lưu qaSave như thẻ cũ.
function ghiNhanhHtml(){
  var kind = (state.qa.kind === 'thu') ? 'thu' : 'chi';
  var cats = qaCats(kind), top = qaTopCats(kind, 5), sel = qaCatChon(kind);
  var topIds = top.map(function(c){ return c.id; });
  var rest = cats.filter(function(c){ return topIds.indexOf(c.id) < 0; });
  var homNay = todayStr(), ngay = state.qa.date || homNay;
  var coTien = numNonNeg(docSo(state.qa.amt)) > 0;
  var ws = state.data.wallets || [], viChon = walletById(state.qa.wallet) ? state.qa.wallet : viDienSan();
  var h = '<div class="qa-sheet" id="ghiNhanh" role="dialog" aria-modal="true" aria-label="Ghi khoản mới">'
    + '<div class="qa-grab" aria-hidden="true"></div>'
    + '<div class="qa-head"><h3>Ghi khoản mới</h3><button type="button" class="qa-x" data-act="qaDong" aria-label="Đóng">'+icon('x')+'</button></div>'
    + '<div class="qa-body">'
    + '<div class="qa-seg" role="group" aria-label="Loại giao dịch">'
    +   '<button type="button" class="chi'+(kind === 'chi' ? ' on' : '')+'" data-act="qaKind" data-kind="chi" aria-pressed="'+(kind === 'chi')+'">'+icon('arrow-down')+' Khoản chi</button>'
    +   '<button type="button" class="thu'+(kind === 'thu' ? ' on' : '')+'" data-act="qaKind" data-kind="thu" aria-pressed="'+(kind === 'thu')+'">'+icon('arrow-up')+' Khoản thu</button>'
    + '</div>'
    + '<input type="text" inputmode="numeric" autocomplete="off" class="money qa-amt" id="qa_amount" placeholder="0 ₫" aria-label="Số tiền (gõ được 45k, 1,5tr, 45.000+30.000)" value="'+esc(state.qa.amt)+'">'
    // phím nhanh: điện thoại bàn phím số không có + / 000
    + '<div class="qa-keys" aria-label="Phím nhanh cho ô số tiền">'
    +   '<button type="button" data-chen="000" data-for="qa_amount">000</button>'
    +   '<button type="button" data-chen="+" data-for="qa_amount" aria-label="Cộng">+</button>'
    +   '<button type="button" data-chen="-" data-for="qa_amount" aria-label="Trừ">−</button>'
    +   '<button type="button" data-act="qaXoa">Xoá</button>'
    + '</div>'
    // ghi chú ngay dưới số tiền: gõ xong số là tới ghi chú, không phải cuộn xuống khi bàn phím đang che màn hình
    + '<input type="text" id="qa_note" class="qa-note" placeholder="Ghi chú, ví dụ: Ăn trưa với Nhật" aria-label="Ghi chú" list="qa_note_goiy" autocomplete="off" value="'+esc(state.qa.note)+'">'
    + '<datalist id="qa_note_goiy">' + (sel ? qaGoiYGhiChu(kind, sel).map(function(g){ return '<option value="'+esc(g)+'">'; }).join('') : '') + '</datalist>'
    // nhãn (tùy chọn): giữ nguyên sau mỗi lần ghi để ghi liền cả chuyến đi; xóa chữ là hết gắn
    + '<input type="text" id="qa_nhan" class="qa-note qa-nhan" placeholder="Nhãn (tùy chọn), ví dụ: Du lịch Đà Lạt" aria-label="Nhãn" list="qa_nhan_goiy" autocomplete="off" value="'+esc(state.qa.nhan || '')+'">'
    + '<datalist id="qa_nhan_goiy">' + nhanThongKe().slice(0, 30).map(function(r){ return '<option value="'+esc(r.ten)+'">'; }).join('') + '</datalist>';
  h += '<div class="qa-lbl">Danh mục</div>';
  if (!cats.length){
    h += '<div class="empty">Chưa có danh mục '+(kind === 'thu' ? 'thu' : 'chi')+' — thêm ở tab "Danh mục".</div>';
  } else {
    h += '<div class="qa-chips qa-cats" role="group" aria-label="Danh mục">'
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
  if (ws.length > 1){
    // ô ẩn qa_wallet: qaSave đọc ví từ đây (cùng cách cũ); các thẻ ví bên dưới chỉ đổi state.qa.wallet rồi vẽ lại
    h += '<div class="qa-lbl">'+(kind === 'thu' ? 'Nhận vào ví' : 'Trả từ ví')+'</div>'
      + '<input type="hidden" id="qa_wallet" value="'+esc(viChon)+'">'
      + '<div class="qa-vis" role="group" aria-label="Ví">' + ws.map(function(w, i){
          var on = (w.id === viChon);
          return '<button type="button" class="qa-vi vc'+(i % 4)+(on ? ' on' : '')+'" data-act="qaViChon" data-id="'+esc(w.id)+'" aria-pressed="'+on+'">'
            + '<i class="qa-vi-bar"></i><span><b>'+esc(w.ten)+'</b><small>'+fmt(Math.round(soDuTheoVi(w.id, homNay)))+'</small></span></button>';
        }).join('') + '</div>';
  }
  var d1 = qaNgayLui(1), d2 = qaNgayLui(2);
  var chipNgay = function(d, nhan){
    return '<button type="button" class="qa-chip'+(ngay === d ? ' on' : '')+'" data-act="qaNgay" data-d="'+d+'" aria-pressed="'+(ngay === d)+'">'+nhan+'</button>';
  };
  var tuyChon = (ngay !== homNay && ngay !== d1 && ngay !== d2);
  h += '<div class="qa-lbl">Ngày</div><div class="qa-chips">'
    + chipNgay(homNay, 'Hôm nay') + chipNgay(d1, 'Hôm qua') + chipNgay(d2, d2.slice(8,10)+'/'+d2.slice(5,7))
    + '<label class="qa-chip qa-chon'+(tuyChon ? ' on' : '')+'">'+icon('calendar')+' '+(tuyChon ? ngay.slice(8,10)+'/'+ngay.slice(5,7) : 'Chọn ngày')
    +   '<input type="date" id="qa_date" class="qa-date-in" aria-label="Chọn ngày" data-act="qaDate" value="'+esc(ngay)+'"></label>'
    + '</div>';
  h += '</div>'          // đóng .qa-body
    + '<div class="qa-foot"><button type="button" class="btn qa-save '+kind+(coTien ? '' : ' chua')+'" data-act="qaSave"'+(cats.length ? '' : ' disabled')+'>'
    + (coTien ? 'Ghi khoản '+kind : 'Nhập số tiền để ghi')+'</button></div>'
    + '</div>';
  return h;
}
// Dựng / gỡ lớp phủ chứa bảng ghi khoản (nằm trong body, ngoài #tabContent). Đã mở sẵn thì GIỮ NGUYÊN DOM:
// vẽ lại cả trang (poll Drive...) không được làm mất ô đang gõ; thay đổi từng phần đi qua qaVeLai().
function qaSheetVe(){
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  if (state.qa.open && state.tab !== 'sotay') state.qa.open = false;      // rời tab Sổ tay = đóng
  var root = document.getElementById('qaSheetRoot');
  if (!state.qa.open || !state.data){
    document.body.classList.remove('qa-mo');
    if (!root) return;
    var giam = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (giam || root.classList.contains('dong')){ if (root.parentNode) root.parentNode.removeChild(root); return; }
    root.classList.add('dong');           // trượt xuống rồi gỡ (qaMoSheet gỡ ngay nếu mở lại giữa chừng)
    setTimeout(function(){ if (root.parentNode && root.classList.contains('dong')) root.parentNode.removeChild(root); }, 200);
    return;
  }
  if (root) return;
  root = document.createElement('div');
  root.id = 'qaSheetRoot';
  root.className = 'qa-back moi';
  root.innerHTML = '<div class="qa-scrim" data-act="qaDong"></div>' + ghiNhanhHtml();
  document.body.appendChild(root);
  document.body.classList.add('qa-mo');
  qaKhopKhungNhin();
  setTimeout(function(){ root.classList.remove('moi'); }, 400);
}
// iPhone: bàn phím chỉ thu nhỏ "khung nhìn thấy" (visualViewport), không thu nhỏ khung layout -> bảng neo đáy bị bàn phím đè,
// ô số tiền trôi lên khỏi màn hình. Ép lớp phủ đúng bằng vùng nhìn thấy để bảng nằm TRÊN bàn phím.
function qaKhopKhungNhin(){
  var root = document.getElementById('qaSheetRoot'), vv = window.visualViewport;
  if (!root || !vv) return;
  root.style.top = vv.offsetTop + 'px';
  root.style.height = vv.height + 'px';
  root.style.bottom = 'auto';
  var b = root.querySelector('.qa-body'); if (b && !b._daCuon){ b.scrollTop = 0; b._daCuon = true; }
}
if (typeof window !== 'undefined' && window.visualViewport){
  window.visualViewport.addEventListener('resize', qaKhopKhungNhin);
  window.visualViewport.addEventListener('scroll', qaKhopKhungNhin);
}
function qaMoSheet(){
  state.qa.open = true;
  var cu = document.getElementById('qaSheetRoot');
  if (cu && cu.parentNode) cu.parentNode.removeChild(cu);
  qaSheetVe();
  var o = document.getElementById('qa_amount');
  if (o && o.focus) o.focus();      // gọi ngay trong cú bấm: iPhone chỉ bật bàn phím khi focus nằm trong thao tác của người dùng
}
function qaDongSheet(){
  state.qa.open = false;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  qaSheetVe();
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
  var chenh = tongThu - tongChi, tongLuong = tongThu + tongChi;
  var phanThu = tongLuong > 0 ? Math.round(tongThu / tongLuong * 100) : 50;
  var h = '<div class="card hero">'
    + '<div class="hero-top"><div class="hero-lbl">'+(laThangNay ? 'Số dư hiện tại' : 'Số dư cuối tháng')+'</div>'+thangNavHtml(mk)+'</div>'
    + '<div class="hero-val">'+so(duCuoi)+'</div>'
    + '<div class="hero-sub">Đầu tháng '+so(duDau)+(laThangNay ? ' · còn '+(daysInMonth(mk) - parseInt(todayStr().slice(8, 10), 10))+' ngày' : '')+'</div>'
    // thanh chia theo tỷ lệ thu : chi của tháng, để nhìn một cái biết tháng này thu hay chi nhiều hơn
    + '<div class="hero-flow" aria-hidden="true"><i class="thu" style="flex:'+phanThu+'"></i><i class="chi" style="flex:'+(100 - phanThu)+'"></i></div>'
    + '<div class="hero-nums">'
    +   '<div><div class="l"><i class="dot thu"></i>Tổng thu</div><div class="v">'+fmt(Math.round(tongThu))+'</div></div>'
    +   '<div><div class="l"><i class="dot chi"></i>Tổng chi</div><div class="v">'+fmt(Math.round(tongChi))+'</div></div>'
    + '</div>'
    // hàng riêng: 3 số hàng chục triệu nằm chung 1 hàng sẽ tràn ra ngoài thẻ trên điện thoại
    + '<div class="hero-cl"><span>Chênh lệch</span><b class="'+(chenh < 0 ? 'am' : 'duong')+'">'+(chenh > 0 ? '+' : (chenh < 0 ? '−' : ''))+fmt(Math.abs(Math.round(chenh)))+'</b></div>';
  if (rows.length){
    var pct = tongCap > 0 ? tongDa / tongCap : 0;
    var muc = hanMucMuc(pct);
    h += '<div class="hero-bud"><div class="hero-bud-top"><span>Chi theo hạn mức</span><span>'
      + (tongDa > tongCap ? 'vượt ' + fmt(Math.round(tongDa - tongCap)) : 'còn ' + fmt(Math.round(tongCap - tongDa))) + '</span></div>'
      + '<div class="hero-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100, Math.round(pct * 100))+'" aria-label="Đã chi so với hạn mức tháng">'
      + '<i class="'+muc+'" style="width:'+Math.min(100, Math.round(pct * 100))+'%"></i></div>'
      + '<div class="hero-bud-sub">'+fmt(Math.round(tongDa))+' / '+fmt(Math.round(tongCap))+' · '+Math.round(pct * 100)+'%</div></div>';
  }
  h += tongQuanSoSanhHtml(mk, tongChi, beforeLock);
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

// 1 dòng đọc nhanh dưới số dư: chi tháng này so với tháng trước (đang chạy dở thì CÙNG KỲ: ngày 1 -> hôm nay).
// Dùng lại bdThangSoSanh (bieudo.js) nên con số giống tab Báo cáo. Thiếu dữ liệu tháng trước thì không hiện gì.
function tongQuanSoSanhHtml(mk, tongChi, beforeLock){
  if (beforeLock || typeof bdThangSoSanh !== 'function') return '';
  var prev = bdThangSoSanh(mk);
  if (!prev.coDl || !(prev.tongChi > 0)) return '';
  var pct = bdPhanTram(tongChi, prev.tongChi);
  var hu, ic, lop;
  if (Math.abs(pct) < 3){ hu = 'Chi gần bằng'; ic = ''; lop = ''; }
  else if (pct > 0){ hu = 'Chi nhiều hơn ' + pct + '% so với'; ic = icon('arrow-up'); lop = ' len'; }
  else { hu = 'Chi ít hơn ' + (-pct) + '% so với'; ic = icon('arrow-down'); lop = ' xuong'; }
  return '<div class="hero-tin'+lop+'">'+ic+'<span>'+hu+' '+(/^\d/.test(prev.nhan) ? 'cùng kỳ ' : '')+esc(prev.nhan)+'</span></div>';
}

/* ====================================================================
   THẺ VÍ — dải thẻ màu cuộn ngang ngay dưới thẻ tổng quan (chỉ hiện khi có từ 2 ví).
   Số dư tính tới hết tháng đang xem, cùng mốc với "Số dư cuối tháng". Bấm thẻ = chọn ví đang ghi
   cho thẻ Ghi nhanh (cùng ô chọn ví ở đó), nhãn "Đang ghi" cho biết khoản mới sẽ vào ví nào.
   ==================================================================== */
function viTheHtml(mk, beforeLock){
  var ws = state.data.wallets || [];
  if (ws.length < 2 || beforeLock) return '';
  var cuoi = mk + '-31', macDinh = viMacDinhId();
  var dangGhi = walletById(state.qa.wallet) ? state.qa.wallet : viDienSan();
  return '<div class="vi-sec"><div class="vi-sec-head"><h3>Số dư theo ví</h3>'
    + '<button type="button" class="vi-chuyen" data-act="viChuyenMo">'+icon('transfer')+' Chuyển ví</button></div>'
    + '<div class="vi-scroll">' + ws.map(function(w, i){
        var b = soDuTheoVi(w.id, cuoi), on = (w.id === dangGhi);
        return '<button type="button" class="vi-the vc'+(i % 4)+(on ? ' on' : '')+'" data-act="viCardChon" data-id="'+esc(w.id)+'" aria-pressed="'+on+'">'
          + '<span class="vi-the-top"><span class="vi-the-ten">'+esc(w.ten)+'</span>'+(on ? '<span class="vi-the-tag">Đang ghi</span>' : '')+'</span>'
          + '<span class="vi-the-sub">'+(w.id === macDinh ? 'Mặc định' : 'Số dư')+'</span>'
          + '<span class="vi-the-so'+(b < 0 ? ' am' : '')+'">'+fmt(Math.round(b))+'</span></button>';
      }).join('') + '</div></div>';
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
  if (el.id === 'qa_amount'){ state.qa.amt = el.value; qaNutCapNhat(); }
  else if (el.id === 'qa_note'){ state.qa.note = el.value; }
  else if (el.id === 'qa_nhan'){ state.qa.nhan = el.value; }
});

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
  // màn rộng (>=1024px, CSS .cot2): cột trái = tổng quan + ghi nhanh + việc cần làm, cột phải = form + danh sách
  html += '<div class="cot2"><div class="cot-trai">';
  html += tongQuanHtml(mk, tongThu, tongChi, duDauThang, duCuoiThang, beforeLock);
  if (beforeLock){
    html += '<div class="empty" style="margin-top:-6px">Tháng này trước mốc chốt số dư ('+state.data.settings.ngayBatDau+') nên không còn tính vào số dư — dữ liệu vẫn xem được bên dưới.</div>';
  }

  // Sổ tay chỉ giữ việc hằng ngày: tổng quan -> ghi nhanh -> việc cần làm -> danh sách giao dịch.
  // Hạn mức, mục tiêu, biểu đồ nằm ở tab Báo cáo (renderBaoCao, bieudo.js).
  html += viTheHtml(mk, beforeLock);
  html += viSoDuCardHtml(mk);
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
        + (roThu ? 'Ghi ở tab Vay - Nợ — tự hạch toán sang đây.'
                 : 'Số này nhập tay, không gắn khoản vay nào. Nên xóa và tạo khoản ở tab Vay - Nợ.')
        + '</div>';
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
    return entryItems(ed).some(function(it){ return (it.ghiChu||'').toLowerCase().indexOf(kw) !== -1 || nhanChuoi(it).toLowerCase().indexOf(kw) !== -1; });
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
  html += ngayListHtml(displayDates, hasRange, filterActive, catSel, mk);

  // Biểu đồ: js/bieudo.js (SVG tự vẽ, 3 tab)

  html += '</div></div>';
  html += '<div class="qa-spacer"></div>' + qaBarHtml();       // đệm để thanh nổi không che khoản cuối cùng
  root.innerHTML = html;
  state.soTayVuaGhi = null;
}

/* ====================================================================
   CHI TIẾT THEO NGÀY — mỗi ngày là 1 nhóm: tiêu đề (Hôm nay / Thứ Ba, tổng thu & chi) + thẻ các khoản.
   Mỗi khoản = 1 dòng items[] (nhập tay) hoặc 1 ref (do khoản vay sinh ra, CHỈ ĐỌC: sửa ở đây sẽ làm
   số Sổ tay lệch tiến độ khoản vay, nên bấm vào là nhảy sang tab Vay - Nợ).
   Bấm 1 khoản = mở Sửa / Xóa; bấm tiêu đề ngày = mở số dư cuối ngày + Xóa cả ngày.
   Sửa/xóa 1 dòng tự cộng/trừ lại entry.thu/chi tương ứng (entryUpdateItem / entryDeleteItem),
   nên tổng của ngày luôn khớp — không có bước tính lại riêng nào.
   Vuốt (js/motion.js) tìm nhóm ngày qua class .dl-day + data-date.
   ==================================================================== */
var SO_NGAY_HIEN = 10;     // số ngày hiện mỗi lần ở "Chi tiết theo ngày" (bấm "Xem thêm" để hiện thêm từng đợt)
var THU_TRONG_TUAN = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
// "Hôm nay" / "Hôm qua" / "Thứ Ba" cho tiêu đề nhóm ngày
function ngayTenNgan(d){
  var p = d.split('-'), t = new Date(+p[0], +p[1] - 1, +p[2]);
  var hq = new Date(); hq.setDate(hq.getDate() - 1);
  if (d === todayStr()) return 'Hôm nay';
  if (d === hq.getFullYear() + '-' + pad2(hq.getMonth() + 1) + '-' + pad2(hq.getDate())) return 'Hôm qua';
  return THU_TRONG_TUAN[t.getDay()];
}
// "Thứ Năm, 8 tháng 10" (thêm năm khi xem khoảng ngày hoặc khác năm hiện tại)
function ngayTenDai(d, kemNam){
  var p = d.split('-'), t = new Date(+p[0], +p[1] - 1, +p[2]);
  return THU_TRONG_TUAN[t.getDay()] + ', ' + (+p[2]) + ' tháng ' + (+p[1]) + ((kemNam || p[0] !== todayStr().slice(0, 4)) ? ' năm ' + p[0] : '');
}
function dlSoTien(kind, v){ return (kind === 'thu' ? '+' : '−') + fmt(Math.round(num(v))); }
// ô sửa 1 khoản (cùng id với bản cũ nên stSaveItem không đổi)
function dlSuaHtml(date, it){
  var kind = it ? it.kind : 'chi', catId = it ? it.catId : '';
  var opt = function(k){
    return (state.data.categories[k] || []).map(function(c){
      return '<option value="'+k+'|'+c.id+'"'+((kind===k && catId===c.id)?' selected':'')+'>'
           + (k==='thu'?'Thu · ':'Chi · ') + esc(c.ten) + '</option>';
    }).join('');
  };
  return '<div class="dl-edit">'
    + '<select id="st_it_cat" aria-label="Danh mục"><option value="">— chọn danh mục —</option>' + opt('thu') + opt('chi') + '</select>'
    + ((state.data.wallets || []).length > 1
        ? '<select id="st_it_wallet" aria-label="Ví / nguồn tiền">' + viOptionsHtml(it ? viCuaItem(it) : viDienSan()) + '</select>' : '')
    + '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="st_it_tien" placeholder="0" aria-label="Số tiền" value="'+(it ? veSo(num(it.soTien)) : '')+'">'
    + '<input type="text" id="st_it_note" placeholder="Nội dung..." aria-label="Nội dung" value="'+(it ? esc(it.ghiChu) : '')+'">'
    + '<input type="text" id="st_it_nhan" placeholder="Nhãn (tùy chọn)" aria-label="Nhãn" list="st_it_nhan_goiy" autocomplete="off" value="'+(it ? esc(nhanChuoi(it)) : '')+'">'
    + '<datalist id="st_it_nhan_goiy">' + nhanThongKe().slice(0, 30).map(function(r){ return '<option value="'+esc(r.ten)+'">'; }).join('') + '</datalist>'
    + '<div class="dl-edit-btn"><button type="button" class="btn sm" data-act="stSaveItem" data-date="'+date+'" data-iid="'+(it ? it.iid : '')+'">'+icon('check')+' Lưu</button>'
    + '<button type="button" class="btn secondary sm" data-act="stCancelItem">Hủy</button></div></div>';
}
function dlDongHtml(date, it){
  if (state.soTayEditIid === it.iid) return '<div class="dl-row dang-sua">' + dlSuaHtml(date, it) + '</div>';
  var e = state.data.journal[date] || {};
  var mo = (state.soTayOpenIid === it.iid), ten = catTen(it.kind, it.catId);
  var vi = ((state.data.wallets || []).length > 1) ? ' · ' + esc(viTen(viCuaItem(it))) : '';
  // dữ liệu cũ (chưa có dòng chi tiết): mọi khoản của ngày mang nguyên ghi chú chung của cả ngày -> lặp lại ở từng dòng thì rối,
  // lấy tên danh mục làm tiêu đề (chữ ghi chú vẫn ở ô Sửa)
  var ghiChung = !!(it.ghiChu && e.ghiChu === it.ghiChu && entryItems(e).length > 1);
  var tieuDe = (it.ghiChu && !ghiChung) ? it.ghiChu : ten;
  return '<div class="dl-row'+(mo ? ' mo' : '')+(it.iid === state.soTayVuaGhi ? ' anim-moi' : '')+'">'
    + '<div class="dl-main" role="button" tabindex="0" aria-expanded="'+mo+'" data-act="stItem" data-iid="'+it.iid+'">'
    +   '<span class="dl-dot" style="--c:'+catMau(it.kind, it.catId)+'" aria-hidden="true"></span>'
    +   '<span class="dl-txt"><span class="dl-t1">'+esc(tieuDe)+'</span><span class="dl-t2">'+((tieuDe === ten ? vi.replace(/^ · /, '') : esc(ten)+vi) + itemNhan(it).map(function(t){ return ' · #'+esc(t); }).join('')).replace(/^ · /, '')+'</span></span>'
    +   '<span class="dl-amt '+it.kind+'">'+dlSoTien(it.kind, it.soTien)+'</span>'
    + '</div>'
    + (mo ? '<div class="dl-act"><button type="button" class="btn secondary sm" data-act="stEditItem" data-date="'+date+'" data-iid="'+it.iid+'">'+icon('pencil')+' Sửa</button>'
          + '<button type="button" class="btn secondary sm nguy" data-act="stDelItem" data-date="'+date+'" data-iid="'+it.iid+'">'+icon('trash')+' Xóa</button></div>' : '')
    + '</div>';
}
function dlRefHtml(r){
  var m = REF_MAP[r.loai];
  if (!m) return '';
  var ten = catTen(m.kind, m.cat);
  var vi = ((state.data.wallets || []).length > 1) ? ' · ' + esc(viTen(viCuaRef(r))) : '';
  return '<div class="dl-row ref"><div class="dl-main" role="button" tabindex="0" data-act="goVayNo" title="Sửa ở tab Vay - Nợ">'
    + '<span class="dl-dot" style="--c:'+catMau(m.kind, m.cat)+'" aria-hidden="true"></span>'
    + '<span class="dl-txt"><span class="dl-t1">'+esc(REF_LABEL[r.loai] || r.loai)+(r.ky != null ? ' · kỳ '+(num(r.ky)+1) : '')+(r.note ? ' — '+esc(r.note) : '')+'</span>'
    +   '<span class="dl-t2">'+esc(ten)+vi+' · '+icon('lock')+' Vay-Nợ</span></span>'
    + '<span class="dl-amt '+m.kind+'">'+dlSoTien(m.kind, r.soTien)+'</span>'
    + '</div></div>';
}
function dlNgayHtml(d, kemNam){
  var e = state.data.journal[d];
  var items = entryItems(e), refs = e.refs || [];
  var thu = thuTotal(e), chi = chiTotal(e), mo = (state.soTayDetailDate === d);
  var h = '<section class="dl-day'+(mo ? ' mo' : '')+'" data-date="'+d+'">'
    + '<div class="dl-head" role="button" tabindex="0" aria-expanded="'+mo+'" data-act="stToggleDetail" data-date="'+d+'" title="Số dư cuối ngày, xóa cả ngày">'
    +   '<span class="dl-d"><b>'+ngayTenNgan(d)+'</b><small>'+ngayTenDai(d, kemNam)+' · '+(items.length + refs.length)+' khoản</small></span>'
    +   '<span class="dl-t">'+(thu ? '<span class="thu">+'+fmt(Math.round(thu))+'</span>' : '')+(chi ? '<span class="chi">−'+fmt(Math.round(chi))+'</span>' : '')+'</span>'
    + '</div>';
  if (mo){
    h += '<div class="dl-dayact"><span>Số dư cuối ngày <b>'+fmt(balanceAt(d))+'</b></span>'
      + '<button type="button" class="btn secondary sm nguy" data-act="delDay" data-date="'+d+'">'+icon('trash')+' Xóa cả ngày</button></div>';
  }
  h += '<div class="dl-card">';
  if (!items.length && !refs.length) h += '<div class="empty" style="text-align:left">Ngày này chưa có khoản nào.</div>';
  // khoản ghi sau nằm trên (items[] xếp theo thứ tự ghi); khoản do Vay-Nợ sinh ra (refs) không có giờ ghi nên xếp dưới cùng
  items.slice().reverse().forEach(function(it){ h += dlDongHtml(d, it); });
  refs.forEach(function(r){ h += dlRefHtml(r); });
  return h + '</div></section>';
}
// tiêu đề "Chi tiết theo ngày" + 3 nút (tìm & lọc, xuất Excel, nhập từ file) + bộ lọc + danh sách nhóm ngày
function ngayListHtml(displayDates, hasRange, filterActive, catSel, mk){
  var h = '<div class="dl"><div class="dl-bar"><h3>Chi tiết theo ngày</h3><div class="dl-tools">'
    + '<button type="button" class="icon-btn'+((state.soTayLocMo || filterActive) ? ' on' : '')+'" data-act="stLocMo" title="Tìm kiếm và lọc" aria-label="Tìm kiếm và lọc" aria-expanded="'+!!(state.soTayLocMo || filterActive)+'">'+icon('search')+'</button>'
    + '<button type="button" class="icon-btn" data-act="exportExcel" title="Xuất Excel" aria-label="Xuất Excel">'+icon('download')+'</button>'
    + '<button type="button" class="icon-btn" data-act="impMo" title="Nhập từ file" aria-label="Nhập từ file">'+icon('upload')+'</button>'
    + '</div></div>';
  if (state.soTayLocMo || filterActive){
    h += '<div class="search-row">'
      + '<div class="fld"><label>Tìm nội dung</label><input type="text" data-act="soTaySearchInput" value="'+(state.soTaySearch||'').replace(/"/g,'&quot;')+'" placeholder="Từ khóa trong ghi chú..."></div>'
      + '<div class="fld"><label>Danh mục</label><select data-act="soTayCatInput">'+soTayCatOptions(state.soTayCat)+'</select></div>'
      + '<div class="fld"><label>Từ ngày</label><input type="date" data-act="soTayFromInput" value="'+(state.soTayFrom||'')+'"></div>'
      + '<div class="fld"><label>Đến ngày</label><input type="date" data-act="soTayToInput" value="'+(state.soTayTo||'')+'"></div>'
      + (filterActive ? '<div class="fld" style="flex:0"><label>&nbsp;</label><button class="btn secondary sm" data-act="soTayClearFilter">Xóa lọc</button></div>' : '')
      + '</div>';
  }
  if (hasRange){
    h += '<div class="empty" style="padding:0 0 8px">Đang lọc theo khoảng ngày ('+state.soTayFrom+' → '+state.soTayTo+'), danh sách dưới không theo tháng đang chọn ở trên nữa.</div>';
  }
  if (catSel.length === 2 && catSel[1] && displayDates.length){
    var tongCat = 0;
    displayDates.forEach(function(d){ tongCat += num((state.data.journal[d][catSel[0]] || {})[catSel[1]]); });
    h += '<div class="empty" style="padding:0 0 8px">'+displayDates.length+' ngày có '
      + (catSel[0] === 'thu' ? 'thu' : 'chi') + ' "'+esc(catTenTheoId(catSel[0], catSel[1]))+'" · tổng '
      + '<b style="color:var(--'+(catSel[0] === 'thu' ? 'green' : 'red')+')">'+fmt(Math.round(tongCat))+'</b></div>';
  }
  if (!displayDates.length){
    h += filterActive
      ? '<div class="empty-box">Không có giao dịch khớp với bộ lọc.'
        + '<div><button class="btn secondary sm" data-act="soTayClearFilter">Xóa lọc</button></div></div>'
      : '<div class="empty-box">Chưa có giao dịch trong '+monthLabel(mk)+'.'
        + '<div><button class="btn" data-act="fabAdd">+ Ghi khoản đầu tiên</button></div></div>';
  } else {
    // mặc định chỉ hiện SO_NGAY_HIEN ngày gần nhất của tháng cho trang đỡ dài; đang tìm / lọc thì hiện hết
    var ds = displayDates.slice().sort().reverse();
    var hien = filterActive ? ds : ds.slice(0, state.soTayGioiHan[mk] || SO_NGAY_HIEN);
    hien.forEach(function(d){ h += dlNgayHtml(d, hasRange); });
    if (hien.length < ds.length){
      h += '<div class="dl-them"><button type="button" class="btn secondary" data-act="stThem" data-mk="'+mk+'">Xem thêm '+Math.min(SO_NGAY_HIEN, ds.length - hien.length)+' ngày</button>'
        + '<small>Đang hiện '+hien.length+'/'+ds.length+' ngày</small></div>';
    }
  }
  return h + '</div>';
}

/* ====================================================================
   MỤC TIÊU TIẾT KIỆM — card tiến độ. Logic ở state.js (mucTieuTienDo); khai báo ở tab Danh mục.
   ==================================================================== */
function mucTieuCardHtml(){
  var gs = state.data.mucTieu || [];
  if (!gs.length) return '';
  var hom = todayStr(), tongDa = 0;
  var hanTxt = function(g){ return g.hanChot ? g.hanChot.slice(5)+'/'+g.hanChot.slice(0, 4) : ''; };
  var h = '';
  gs.forEach(function(g){
    var t = mucTieuTienDo(g, hom);
    tongDa += t.da;
    var mau = t.xong ? 'done' : (t.quaHan ? 'over' : 'mt'), tr, note;
    if (t.xong){ tr = '<span class="mt-st ok">Hoàn thành</span>'; note = 'Đã đủ mục tiêu' + (g.hanChot ? ', kịp trước ' + hanTxt(g) : '') + '.'; }
    else if (t.quaHan){ tr = '<span class="mt-st over">Quá hạn</span>'; note = 'Đã quá hạn ' + hanTxt(g) + ', còn thiếu ' + fmt(Math.round(t.conThieu)) + '.'; }
    else {
      tr = g.hanChot ? '<span class="mt-st">Hạn ' + hanTxt(g) + '</span>' : '';
      note = t.canMoiThang != null
        ? 'Gom thêm ~' + fmt(Math.round(t.canMoiThang)) + ' mỗi tháng là kịp hạn ' + hanTxt(g) + '.'
        : 'Còn thiếu ' + fmt(Math.round(t.conThieu)) + '.';
    }
    h += '<div class="mt-c"><div class="mt-r">' + bcVong(t.pct, mau, Math.round(t.pct * 100) + '%', '')
      + '<div class="mt-b"><div class="mt-h"><b class="mt-ten">'+esc(g.ten)+'</b>'
      + (t.theoVi ? '<span class="vi-chip">'+esc(viTen(g.walletId))+'</span>' : '') + tr + '</div>'
      + '<div class="mt-big">'+fmt(Math.round(t.da))+'</div><div class="mt-dich">/ '+fmt(Math.round(t.dich))+'</div></div></div>'
      + '<div class="mt-f"><span class="mt-note'+(t.quaHan ? ' over' : (t.xong ? ' ok' : ''))+'">'+note+'</span>'
      + ((t.theoVi || t.xong) ? '' : '<button type="button" class="btn secondary sm" data-act="mtGom" data-id="'+esc(g.id)+'">+ Gom thêm</button>') + '</div></div>';
  });
  return '<div class="card bc-card" id="cardMucTieu"><h3 class="bc-h"><span>Mục tiêu tiết kiệm</span><span class="bc-h-s">'+fmt(Math.round(tongDa))+' đã gom</span></h3>'
    + '<div class="mt-list">' + h + '</div></div>';
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
  var nhip = bcNhip(mk), cur = bdThang(mk), cap = 0, da = 0;
  rows.forEach(function(r){ cap += r.cap; da += r.da; });
  var nVuot = rows.filter(function(r){ return r.pct > 1; }).length;
  // từ 80% hạn mức trở lên (hoặc vượt) = cần chú ý; còn lại = ổn (rows đã xếp % giảm dần)
  var chuY = rows.filter(function(r){ return r.pct >= 0.8; }), on = rows.filter(function(r){ return r.pct < 0.8; });
  var pctAll = cap > 0 ? da / cap : 0;
  var h = '<div class="card bc-card" id="cardHanMuc"><h3 class="bc-h"><span>Hạn mức '+monthLabel(mk).toLowerCase()+'</span>'
    + (nVuot ? '<span class="hm-badge over">'+nVuot+' danh mục vượt</span>' : '') + '</h3>';
  // tóm tắt: vòng % đã dùng + thanh chia theo danh mục (tỉ trọng trong tổng chi)
  var chia = bdXepCat('chi', cur.theoCat, null, 0), tong = 0;
  chia.forEach(function(c){ tong += c.v; });
  h += '<div class="hm-sum">' + bcVong(pctAll, hanMucMuc(pctAll), Math.round(pctAll * 100) + '%', 'đã dùng') + '<div class="hm-sum-r">';
  if (tong > 0){
    h += '<div class="hm-sum-t">Chi theo danh mục</div><div class="hm-stack" aria-hidden="true">'
      + chia.map(function(c){ return '<i style="flex:'+c.v+';background:'+c.mau+'"></i>'; }).join('') + '</div><div class="hm-stack-l">'
      + chia.slice(0, 3).map(function(c){ return '<span><i style="background:'+c.mau+'"></i>'+esc(c.ten)+' '+Math.round(c.v / tong * 100)+'%</span>'; }).join('') + '</div>';
  } else {
    h += '<div class="hm-sum-t">Chưa có khoản chi nào trong tháng này</div>';
  }
  h += '</div></div>';
  if (chuY.length){
    h += '<div class="hm-sec"><b>Cần chú ý · '+chuY.length+'</b>'
      + (nhip.dangChay ? '<span class="hm-leg"><i class="tk"></i> nhịp hôm nay <i class="en"></i> hạn mức</span>' : '') + '</div><div class="hm-cg">';
    chuY.forEach(function(r){
      var muc = hanMucMuc(r.pct), rong = Math.min(100, Math.round(r.pct * 100));
      h += '<div class="hm-c '+muc+'">'
        + '<div class="hm-c-t">'+catDot('chi', r.id)+'<span>'+esc(r.ten)+'</span></div>'
        + '<div class="hm-c-p">'+Math.round(r.pct * 100)+'%</div>'
        + '<div class="hm-c-chip">'+(r.pct > 1 ? 'Vượt '+fmt(Math.round(r.da - r.cap)) : 'Còn '+fmt(Math.round(r.cap - r.da)))+'</div>'
        + '<div class="hm-c-bar'+(r.pct > 1 ? ' of' : '')+'" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rong+'" aria-label="'+esc(r.ten)+'">'
        + '<div class="hm-fill" style="width:'+rong+'%;background:'+catMau('chi', r.id)+'"></div>'
        + (nhip.dangChay ? '<i class="tick" style="left:'+(Math.round(nhip.tyLe * 1000) / 10)+'%"></i>' : '') + '</div>'
        + '<div class="hm-c-so"><span>'+fmt(Math.round(r.da))+'</span> <span>/ '+fmt(Math.round(r.cap))+'</span></div></div>';
    });
    h += '</div>';
  }
  if (on.length){
    var hien = state.hmMoHet ? on : on.slice(0, 3);
    h += '<div class="hm-sec"><b>Ổn · '+on.length+'</b></div><div class="hm-og">';
    hien.forEach(function(r){
      h += '<div class="hm-o"><span class="nm">'+catDot('chi', r.id)+'<span>'+esc(r.ten)+'</span></span>'
        + '<span class="cl">còn '+fmt(Math.round(r.cap - r.da)).replace(/\s*₫$/, '')+'</span>'
        + '<span class="mb"><i style="width:'+Math.max(r.da > 0 ? 6 : 0, Math.round(r.pct * 100))+'%;background:'+catMau('chi', r.id)+'"></i></span>'
        + '<b>'+Math.round(r.pct * 100)+'%</b></div>';
    });
    h += '</div>';
    if (on.length > 3) h += '<button type="button" class="hm-more" data-act="hmXem">'+(state.hmMoHet ? 'Thu gọn' : 'Xem thêm '+(on.length - 3))+'</button>';
  }
  return h + '</div>';
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
// Cảnh báo ví sắp âm trước khi ghi (chỉ cảnh báo, bấm Đồng ý vẫn ghi). Trả câu cảnh báo hoặc ''.
function canhBaoViAm(act, el){
  var d = state.data;
  if (act === 'qaSave'){
    if (state.qa.kind === 'thu') return '';
    var t = numNonNeg(docSo((document.getElementById('qa_amount') || {}).value));
    var v = (document.getElementById('qa_wallet') || {}).value || state.viChon;
    return viCanhBaoAm(v, -t);
  }
  if (act === 'viChuyenLuu'){
    var tu = (document.getElementById('vi_tu') || {}).value;
    var den = (document.getElementById('vi_den') || {}).value;
    if (tu === den) return '';
    return viCanhBaoAm(tu, -numNonNeg(docSo((document.getElementById('vi_tien') || {}).value)));
  }
  if (act === 'stSaveItem'){
    var kc = ((document.getElementById('st_it_cat') || {}).value || '').split('|');
    var tien = numNonNeg(docSo((document.getElementById('st_it_tien') || {}).value));
    var vi = (document.getElementById('st_it_wallet') || {}).value || '';
    var viId = walletById(vi) ? vi : viMacDinhId();
    var moi = (kc[0] === 'chi' ? -tien : (kc[0] === 'thu' ? tien : 0));
    var cu = 0, iid = el.getAttribute && el.getAttribute('data-iid');
    if (iid){
      entryItems(d.journal[el.getAttribute('data-date')]).forEach(function(it){
        if (it.iid === iid && viCuaItem(it) === viId) cu = (it.kind === 'chi' ? -1 : 1) * num(it.soTien);
      });
    }
    return viCanhBaoAm(viId, moi - cu);
  }
  if (act === 'saveEntry' && !state.editingDate){
    var tong = 0;
    document.querySelectorAll('.f_chi').forEach(function(inp){ tong += numNonNeg(docSo(inp.value)); });
    var vf = (document.getElementById('f_wallet') || {}).value || viMacDinhId();
    return viCanhBaoAm(vf, -tong);
  }
  return '';
}

function handleSoTayAction(act, el){
  el = el || {};      // phím N / Enter ở ô tiền gọi handleAction(..., null): không có phần tử bấm
  if (handleBieuDoAction(act, el)) return true;
  if (!el._daBaoAm && (act === 'qaSave' || act === 'viChuyenLuu' || act === 'stSaveItem' || act === 'saveEntry')){
    var canhBao = canhBaoViAm(act, el);
    if (canhBao){
      xacNhan('Kiểm tra trước khi ghi', canhBao + '\n\nVẫn ghi khoản này?', { chuOk: 'Vẫn ghi', chuHuy: 'Quay lại' })
        .then(function(ok){ if (ok){ el._daBaoAm = true; try{ handleSoTayAction(act, el); }finally{ el._daBaoAm = false; } } });
      return true;
    }
  }
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
    var selVN = document.getElementById('sotay_selVayNo');
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
      // -> để repair co/giãn các dòng chi tiết cho khớp tổng mới, rồi tính lại thu/chi từ items + refs
      repairEntryItems(editedE);
      entryTinhLai(editedE);
    } else if (state.data.journal[date]){
      // thêm vào ngày đã có: CHỈ thêm ghi chú; tiền vào thu/chi khi ketThuc() tạo dòng items / gắn refs
      var existing = state.data.journal[date];
      existing.refs = existing.refs || [];
      existing.items = Array.isArray(existing.items) ? existing.items : [];
      if (ghiChuLuu) existing.ghiChu = existing.ghiChu ? (existing.ghiChu + '; ' + ghiChuLuu) : ghiChuLuu;
    } else {
      state.data.journal[date] = { thu: {}, chi: {}, ghiChu: ghiChuLuu, refs: [], items: [] };
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
        entryTinhLai(eNew);      // tiền = các dòng vừa tạo + refs đã gắn (không còn cộng thẳng vào thu/chi)
      }
      state.editingDate = null;
      state.soTayEditIid = null;
      scheduleSave();
      renderSoTay();
      toast('Đã lưu giao dịch ngày ' + date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4) + '.');
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
    // chiều ngược lại: có nhập tiền mà không chọn khoản -> tiền vẫn vào Sổ tay nhưng khoản vay
    // không đổi gì (vẫn còn nợ / còn phải thu), nên nhắc để người dùng biết
    if (!wasEditing && selVN && !vnIdSel && chi['traNo']){
      toast('Đã ghi "Trả nợ" nhưng chưa chọn khoản vay — tiến độ trả nợ của khoản vay không đổi.', { loai:'warn' });
    }
    ketThuc();
  } else if (act === 'qaMo'){
    qaMoSheet();
  } else if (act === 'qaDong'){
    qaDongSheet();
  } else if (act === 'qaViChon'){
    // thẻ ví trong bảng ghi: nhớ ví chọn (các lần vẽ lại không được đặt lại về mặc định), vẽ lại cả trang để nhãn "Đang ghi" theo
    if (walletById(el.getAttribute('data-id'))) state.qa.wallet = el.getAttribute('data-id');
    qaVeLai();
    renderSoTay();
  } else if (act === 'qaNgay'){
    var dQ = el.getAttribute('data-d');
    state.qa.date = (dQ && dQ !== todayStr()) ? dQ : '';
    qaVeLai();
  } else if (act === 'qaXoa'){
    state.qa.amt = '';
    var oXoa = document.getElementById('qa_amount');
    if (oXoa){ oXoa.value = ''; if (oXoa.focus) oXoa.focus(); }
    qaNutCapNhat();
  } else if (act === 'qaKind'){
    state.qa.kind = (el.getAttribute('data-kind') === 'thu') ? 'thu' : 'chi';
    qaGhiNho();
    qaVeLai();
  } else if (act === 'qaCat'){
    state.qa.cat[state.qa.kind === 'thu' ? 'thu' : 'chi'] = el.getAttribute('data-cat');
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
    itemDatNhan(itQ, nhanParse((document.getElementById('qa_nhan') || {}).value));
    state.soTayVuaGhi = itQ.iid;       // khoản này hiện dần ở lần vẽ ngay sau đây (xem cuối renderSoTay)
    // ghi chú của NGÀY: giống saveEntry — có nội dung thì gắn thêm số tiền để cột Nội dung đọc ra luôn có số
    var ghiQ = noteQ ? noteQ + ' ' + fmt(Math.round(tienQ)) : '';
    if (ghiQ){
      var eQ = state.data.journal[ngayQ];
      eQ.ghiChu = eQ.ghiChu ? eQ.ghiChu + '; ' + ghiQ : ghiQ;
      itQ.gc = ghiQ;       // xóa dòng này thì mẩu ghi chú ngày cũng đi theo
    }
    state.qa.cat[kQ] = catQ; qaGhiNho();
    state.qa.amt = ''; state.qa.note = ''; state.qa.date = (ngayQ !== todayStr()) ? ngayQ : '';
    // có ví mặc định đã tích chọn: lần nhập sau quay về ví đó; chưa có thì nhớ ví vừa chọn như trước
    if (viQ && walletById(viQ)){ state.viChon = viQ; state.qa.wallet = viMacDinhDaChon() ? '' : viQ; }
    var banGhi = { date: ngayQ, iid: itQ.iid, note: ghiQ, daHoan: false };
    var startQ = state.data.settings.ngayBatDau || '';
    var truocMoc = !!(startQ && ngayQ < startQ);
    var tinQ = 'Đã ghi ' + (kQ === 'thu' ? 'thu' : 'chi') + ' ' + catTen(kQ, catQ) + ' ' + fmt(Math.round(tienQ))
      + ' (' + ngayQ.slice(8,10) + '/' + ngayQ.slice(5,7) + ')'
      + (truocMoc ? ' — trước mốc chốt số dư ' + ngayVN(startQ) + ', không tính vào số dư.' : '.');
    state.qa.last = { text: tinQ, ban: banGhi };       // giữ bản ghi cuối để hoàn tác (nút ở toast) chỉ chạy 1 lần
    banGhi.moc = state.qa.last;
    // hạ bàn phím: bàn phím che toast ở đáy màn hình, và ô số tiền sắp được xóa trắng để nhập khoản sau
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state.qa.open = false; qaSheetVe();                        // ghi xong: đóng bảng, xác nhận + Hoàn tác nằm ở toast
    scheduleSave();
    renderSoTay();
    toast(tinQ, { loai: truocMoc ? 'warn' : undefined, giay: 8, hoanTac: function(){ qaHoanTacLanGhi(banGhi); } });
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
            var cvR = r.loai === 'thuHoiChoVay' && (state.data.vayNo.choVay||[]).find(function(x){ return x.id === r.loanId; });
            return '  • ' + (REF_LABEL[r.loai]||r.loai) + ' · ' + fmt(r.soTien)
                 + (r.ky != null ? ' (kỳ '+(num(r.ky)+1)+' → về chưa trả)' : '')
                 + (cvR ? ' → khoản "'+cvR.ten+'" lùi số đã thu' + (cvR.tatToan ? '; khoản đã tất toán nên sẽ MỞ LẠI và phần xóa nợ cũ bị bỏ, còn phải thu tính lại' : '') : '');
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
  } else if (act === 'stItem'){
    var iidO = el.getAttribute('data-iid');
    state.soTayOpenIid = (state.soTayOpenIid === iidO) ? null : iidO;
    state.soTayEditIid = null;
    renderSoTay();
  } else if (act === 'stThem'){
    var mkT = el.getAttribute('data-mk');
    state.soTayGioiHan[mkT] = (state.soTayGioiHan[mkT] || SO_NGAY_HIEN) + SO_NGAY_HIEN;
    renderSoTay();
  } else if (act === 'stLocMo'){
    state.soTayLocMo = !state.soTayLocMo;
    renderSoTay();
    if (state.soTayLocMo){ var oL = document.querySelector('[data-act=soTaySearchInput]'); if (oL) oL.focus(); }
  } else if (act === 'viCardChon'){
    state.qa.wallet = el.getAttribute('data-id');
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
    var nhanS = nhanParse((document.getElementById('st_it_nhan') || {}).value);
    if (iidS){
      if (!entryUpdateItem(dS, iidS, tienS, noteS, kindS, catS, viS)){ toast('Không tìm thấy dòng cần sửa.', { loai:'err' }); return true; }
      itemDatNhan(entryFindItem(state.data.journal[dS], iidS), nhanS);
    } else {
      var itS = entryAddItem(dS, kindS, catS, tienS, noteS, viS);
      if (!itS){ toast('Không thêm được dòng này.', { loai:'err' }); return true; }
      itemDatNhan(itS, nhanS);
    }
    state.soTayEditIid = null; state.soTayOpenIid = null;
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
    state.soTayEditIid = null; state.soTayOpenIid = null;
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
    /* mở bảng ghi khoản (cùng thanh "Ghi nhanh"): phím N, nút "+ Ghi khoản đầu tiên". Bảng ghi qua entryAddItem,
       danh mục Vay-Nợ không có ở đây (cần gắn khoản vay: ghi ở tab Vay - Nợ). */
    if (state.tab !== 'sotay'){
      state.tab = 'sotay';
      document.querySelectorAll('.tab').forEach(function(t){
        t.classList.toggle('active', t.getAttribute('data-tab') === 'sotay');
      });
      renderAll();
    }
    qaMoSheet();
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
    if (el.value){ state.qa.cat[state.qa.kind === 'thu' ? 'thu' : 'chi'] = el.value; qaGhiNho(); }
    qaVeLai();
    return true;
  } else if (el.matches('[data-act=qaDate]')){
    state.qa.date = (el.value && el.value !== todayStr()) ? el.value : '';
    qaVeLai();
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
