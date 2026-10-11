"use strict";
/* ====================================================================
   theongay.js — DÒNG TIỀN "THEO NGÀY" (tab Dòng tiền: Theo ngày | Theo tháng | Mô phỏng).
   3 thẻ, mỗi thẻ một việc:
   1. Hôm nay      : còn tiêu được (cùng công thức tieuMoiNgay ở sotay.js), chuỗi ngày trong mức, dư / vượt so với nhịp đều.
   2. Từng ngày    : ngày nào của tháng này trong mức / vượt mức (tnNgayThang).
   3. 30 ngày tới  : số dư dự kiến từng ngày, ngày thấp nhất, các ngày có tiền vào / ra (tnLichTien).
   "Chi hằng ngày" = danh mục chi KHÔNG phải khoản cố định và có hạn mức (hanMucHangNgay ở sotay.js).
   Chỉ ĐỌC dữ liệu, không ghi gì. Cần state.js, vayno.js, sotay.js (hanMucHangNgay, tieuMoiNgay, catChiCoDinh),
   nhachan.js (catNgayHan), bieudo.js (bdLine, bdThang, bdNhipNgayThuong, BD_DAYS), dongtien.js (dtCheDoHtml) load trước.
   ==================================================================== */

var TN_SO_NGAY = 30;

function tnNgayCong(ngay, n){
  var d = new Date(parseInt(ngay.slice(0, 4), 10), parseInt(ngay.slice(5, 7), 10) - 1, parseInt(ngay.slice(8, 10), 10) + n);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function tnThu(ngay){
  return BD_DAYS[new Date(parseInt(ngay.slice(0, 4), 10), parseInt(ngay.slice(5, 7), 10) - 1, parseInt(ngay.slice(8, 10), 10)).getDay()];
}

/* ---- 1 + 2: từng ngày của tháng này so với mức ----
   Mức của ngày d = (hạn mức hằng ngày − đã chi trước ngày d) ÷ số ngày còn lại tính cả ngày d (giống tieuMoiNgay).
   Ngày trong mức: chi hằng ngày của ngày đó <= mức của ngày đó (không chi gì cũng là trong mức).
   chuoi: số ngày ĐÃ QUA liên tiếp trong mức, đếm lùi từ hôm qua (hôm nay chưa hết nên không tính), chỉ trong tháng này.
   deu  : hạn mức × (số ngày đã qua ÷ số ngày của tháng) − đã chi tới hết hôm qua; > 0 là đang tiêu ít hơn nhịp đều.
   Dùng hạn mức HIỆN TẠI cho cả các ngày đã qua. null = chưa có hạn mức hằng ngày nào. */
function tnNgayThang(homNay){
  homNay = homNay || todayStr();
  var hn = hanMucHangNgay();
  if (hn.cap <= 0) return null;
  var mk = monthKey(homNay), N = daysInMonth(mk), den = parseInt(homNay.slice(8, 10), 10);
  var ngay = [], da = 0, soOk = 0;
  for (var d = 1; d <= den; d++){
    var e = state.data.journal[mk + '-' + pad2(d)], chi = 0;
    if (e) Object.keys(hn.bien).forEach(function(id){ chi += num((e.chi || {})[id]); });
    var muc = Math.max(0, hn.cap - da) / (N - d + 1), ok = chi <= muc + 0.5;
    ngay.push({ d: d, chi: chi, muc: muc, ok: ok, da: da });
    if (d < den && ok) soOk++;
    da += chi;
  }
  var chuoi = 0;
  for (var j = den - 2; j >= 0 && ngay[j].ok; j--) chuoi++;
  var daTruoc = da - ngay[den - 1].chi;
  return { mk: mk, cap: hn.cap, soNgay: N, den: den, ngay: ngay, chuoi: chuoi, soOk: soOk, soQua: den - 1,
           deu: hn.cap * (den - 1) / N - daTruoc, daTruoc: daTruoc, nhipDeu: hn.cap * (den - 1) / N };
}

/* ---- 3: tiền 30 ngày tới ----
   Bắt đầu từ TỔNG số dư các ví hết hôm nay (balanceAt: gồm ví để dành, đã trừ dư nợ thẻ). Mỗi ngày:
   + khoản thu có ngày: định kỳ thu, hoặc danh mục thu có "Ngày thu hằng tháng" + kế hoạch (phần chưa ghi);
     ngày đã qua mà chưa ghi thì KHÔNG giả định là sẽ có (ghi chú lại); thu hồi cho vay đúng hẹn (quá hẹn thì không tính)
   − trả nợ theo lịch Vay - Nợ (kỳ quá hạn chưa đóng tính vào hôm nay)
   − khoản cố định: định kỳ chi của danh mục đó, không có thì phần hạn mức chưa chi vào "Ngày chi hằng tháng"
     (chưa có ngày thì tính vào hôm nay / ngày 1 tháng sau); ngày đã qua mà chưa chi thì tính vào hôm nay
   ± các khoản đã ghi trước cho ngày sau hôm nay
   − chi hằng ngày: hôm nay = phần còn tiêu được; ngày sau = mức/ngày; tháng sau = hạn mức ÷ số ngày tháng đó.
     Chưa có hạn mức thì dùng nhịp chi hằng ngày thực tế của tháng này.
   Thanh toán thẻ là chuyển ví nên không đổi tổng, không có ở đây. */
/* viId (tùy chọn): '' = TỔNG các ví (mặc định). Có viId = lịch tiền của RIÊNG ví đó: mỗi khoản thu / chi đi theo ví của nó (khoản vay, định kỳ, dòng
   đã ghi trước; khoản không có ví thì tính vào ví mặc định), chuyển ví đã ghi trước tính hai đầu, thanh toán thẻ tính vào ví mặc định (không
   phải thẻ) vì chưa biết sẽ trả từ ví nào, và chi hằng ngày chia theo TỈ LỆ ví đó trong chi hằng ngày 30 ngày qua (tnTiLeViHangNgay).
   Mục đích: biết ví nào sẽ THIẾU TIỀN trước ngày trả nợ dù tổng các ví vẫn đủ. */
function tnLichTien(homNay, soNgay, viId){
  homNay = homNay || todayStr(); soNgay = soNgay || TN_SO_NGAY; viId = viId || '';
  var cuoi = tnNgayCong(homNay, soNgay - 1), ds = {}, ngayList = [], thangs = [], ghiChu = [], d = state.data;
  var macDinh = viMacDinhId(), tiLe = viId ? tnTiLeViHangNgay(homNay) : null;
  for (var i = 0; i < soNgay; i++){
    var n = tnNgayCong(homNay, i);
    ngayList.push(n); ds[n] = { vao: [], ra: [] };
    if (thangs.indexOf(monthKey(n)) < 0) thangs.push(monthKey(n));
  }
  var them = function(ngay, loai, ten, soTien, vi){
    if (!(soTien > 0.5)) return;
    if (viId && (vi || macDinh) !== viId) return;           // chế độ 1 ví: chỉ giữ khoản của ví đó
    if (ngay < homNay) ngay = homNay;
    if (ngay > cuoi) return;
    ds[ngay][loai].push({ ten: ten, soTien: soTien });
  };
  // khoản đã ghi trước cho ngày sau hôm nay (đã có trong sổ nhưng chưa vào số dư hôm nay)
  ngayList.forEach(function(n){
    var e = d.journal[n];
    if (n === homNay || !e) return;
    if (!viId){
      them(n, 'vao', 'Khoản thu đã ghi trước', thuTotal(e));
      them(n, 'ra', 'Khoản chi đã ghi trước', chiTotal(e));
      return;
    }
    entryItems(e).forEach(function(it){
      them(n, it.kind === 'thu' ? 'vao' : 'ra', 'Đã ghi trước: ' + (it.ghiChu || catTen(it.kind, it.catId)), num(it.soTien), viCuaItem(it));
    });
    (e.refs || []).forEach(function(rf){
      var m = REF_MAP[rf.loai];
      if (m) them(n, m.kind === 'thu' ? 'vao' : 'ra', 'Đã ghi trước: ' + (REF_LABEL[rf.loai] || rf.loai) + (rf.note ? ' — ' + rf.note : ''), num(rf.soTien), viCuaRef(rf));
    });
  });
  if (viId){
    // chuyển ví đã ghi trước cho ngày sau hôm nay: ra khỏi ví đi, vào ví đến (tổng các ví không đổi nên chế độ Tổng bỏ qua)
    (d.chuyenVi || []).forEach(function(t){
      if (t.ngay <= homNay) return;
      if (t.tuVi === viId) them(t.ngay, 'ra', 'Chuyển sang ' + viTen(t.denVi) + (t.ghiChu ? ' — ' + t.ghiChu : ''), num(t.soTien), viId);
      if (t.denVi === viId) them(t.ngay, 'vao', 'Nhận từ ' + viTen(t.tuVi) + (t.ghiChu ? ' — ' + t.ghiChu : ''), num(t.soTien), viId);
    });
    // thanh toán thẻ tín dụng đến hạn: chưa biết trả từ ví nào -> giả định ví mặc định (nếu không phải thẻ, không thì ví thường đầu tiên)
    var nguon = (walletById(macDinh) && !viLaThe(walletById(macDinh))) ? macDinh : ((d.wallets || []).filter(function(w){ return !viLaThe(w); })[0] || {}).id;
    if (nguon === viId) (d.wallets || []).forEach(function(w){
      if (!viLaThe(w)) return;
      var tt = theTinh(w, homNay);
      if (tt.conPhaiTra > 0) them(tt.han, 'ra', 'Thanh toán thẻ ' + w.ten + ' (giả định trả từ ví này)', tt.conPhaiTra, viId);
    });
  }
  // trả nợ theo lịch
  (d.vayNo.vayNoPhaiTra || []).forEach(function(loan){
    if (!loanIsActive(loan) || loan.tatToan) return;
    var sch = tinhLichTraNo(loan);
    sch.forEach(function(row, k){
      if (kyDaDong(loan, k)) return;
      them(row.ngayTra, 'ra', 'Trả nợ: ' + loan.ten + ' · kỳ ' + (k + 1) + (row.ngayTra < homNay ? ' (quá hạn)' : ''), conThieuKy(loan, k, sch), loan.walletId);
    });
  });
  // thu hồi cho vay đúng hẹn
  (d.vayNo.choVay || []).forEach(function(c){
    if (c.tatToan || c.trangThai === 'da_thu_du' || !c.ngayDuKienThu) return;
    var cl = conLaiPhaiThu(c);
    if (cl <= 0) return;
    if (c.ngayDuKienThu < homNay){ ghiChu.push('Chưa tính khoản cho vay quá hẹn: ' + c.ten + ' ' + fmt(Math.round(cl)) + '.'); return; }
    them(c.ngayDuKienThu, 'vao', 'Thu nợ: ' + c.ten, cl, c.walletId);
  });
  var dkCua = function(kind, catId){
    return (d.dinhKy || []).filter(function(k){ return k.bat && k.kind === kind && k.catId === catId && num(k.soTien) > 0; });
  };
  thangs.forEach(function(mk){
    // khoản cố định
    (d.categories.chi || []).forEach(function(c){
      if (CAT_HE_THONG.chi[c.id] || c.khongDuTru || !catChiCoDinh(c)) return;
      var dks = dkCua('chi', c.id), da = actualCatInMonth('chi', c.id, mk);
      if (dks.length){
        var tongDk = 0; dks.forEach(function(k){ tongDk += num(k.soTien); });
        if (da >= tongDk) return;                       // tháng này đã chi đủ (kể cả ghi tay không qua nút định kỳ)
        dks.forEach(function(k){
          if ((k.bo || []).indexOf(mk) >= 0 || dinhKyDaGhi(k, mk)) return;
          them(ngayTraCuaKy(mk, k.ngay), 'ra', k.ten || c.ten, num(k.soTien), k.walletId);
        });
        return;
      }
      var con = num(c.chiTieu) - da, nh = catNgayHan(c);
      if (con <= 0) return;
      them(nh ? ngayTraCuaKy(mk, nh) : (mk === monthKey(homNay) ? homNay : mk + '-01'), 'ra', c.ten + (nh ? '' : ' (chưa có ngày chi)'), con);   // không có ví riêng -> ví mặc định
    });
    // khoản thu có ngày
    (d.categories.thu || []).forEach(function(c){
      if (CAT_HE_THONG.thu[c.id]) return;
      var dks = dkCua('thu', c.id), ds2 = [];
      if (dks.length){
        dks.forEach(function(k){
          if ((k.bo || []).indexOf(mk) >= 0 || dinhKyDaGhi(k, mk)) return;
          ds2.push({ ngay: ngayTraCuaKy(mk, k.ngay), ten: k.ten || c.ten, soTien: num(k.soTien), vi: k.walletId });
        });
      } else {
        var nh = catNgayHan(c), con = num(c.chiTieu) - actualCatInMonth('thu', c.id, mk);
        if (nh && con > 0) ds2.push({ ngay: ngayTraCuaKy(mk, nh), ten: c.ten, soTien: con });
      }
      ds2.forEach(function(x){
        if (x.ngay < homNay){ ghiChu.push(x.ten + ' (ngày ' + ngayNganVN(x.ngay) + ') chưa ghi nên chưa tính.'); return; }
        them(x.ngay, 'vao', x.ten, x.soTien, x.vi);
      });
    });
  });
  // chi hằng ngày
  var tm = tieuMoiNgay(homNay), hn = hanMucHangNgay(), nhip = 0, conHomNay = 0;
  if (tm) conHomNay = Math.max(0, tm.honNayCon);
  else {
    var cur = bdThang(monthKey(homNay), parseInt(homNay.slice(8, 10), 10));
    nhip = bdNhipNgayThuong(cur.chiHN);
    conHomNay = Math.max(0, nhip - cur.chiHN[cur.chiHN.length - 1]);
  }
  var chiNgay = function(n){
    var v = n === homNay ? conHomNay : (!tm ? nhip : (monthKey(n) === monthKey(homNay) ? tm.muc : hn.cap / daysInMonth(monthKey(n))));
    return viId ? v * (tiLe[viId] || 0) : v;               // chế độ 1 ví: chỉ phần chi hằng ngày của ví đó
  };
  if (viId){
    var tl = Object.keys(tiLe).filter(function(k){ return tiLe[k] > 0.005; }).map(function(k){ return viTen(k) + ' ' + Math.round(tiLe[k] * 100) + '%'; });
    ghiChu.push('Chi hằng ngày chia theo tỉ lệ dùng 30 ngày qua: ' + (tl.length ? tl.join(' · ') : 'chưa có dữ liệu → tính vào ví mặc định') + '.');
  }
  var dau = viId ? soDuTheoVi(viId, homNay) : balanceAt(homNay), bal = dau, out = [], thap = null, am = null;
  ngayList.forEach(function(n){
    var x = ds[n], vao = 0, ra = 0, c = chiNgay(n);
    x.vao.forEach(function(e){ vao += e.soTien; }); x.ra.forEach(function(e){ ra += e.soTien; });
    bal += vao - ra - c;
    var r = { ngay: n, vao: x.vao, ra: x.ra, tongVao: vao, tongRa: ra, chiNgay: c, cuoi: bal };
    out.push(r);
    if (!thap || bal < thap.cuoi) thap = r;
    if (!am && bal < -0.5) am = r;
  });
  return { dau: dau, ngay: out, thap: thap, am: am, ghiChu: ghiChu, theoNhip: !tm, mucNgay: tm ? tm.muc : nhip, viId: viId, tiLe: tiLe };
}
// tỉ lệ từng ví trong CHI HẰNG NGÀY của 30 ngày trước hôm nay: { walletId: 0..1 } (cộng lại = 1); chưa có chi nào -> toàn bộ vào ví mặc định.
// Đây là ước lượng: không biết ngày mai mày sẽ tiêu bằng ví nào.
function tnTiLeViHangNgay(homNay){
  var tu = tnNgayCong(homNay, -30), m = {}, tong = 0;
  Object.keys(state.data.journal).forEach(function(n){
    if (n < tu || n >= homNay) return;
    entryItems(state.data.journal[n]).forEach(function(it){
      if (it.kind !== 'chi' || !catChiHangNgay(it.catId)) return;
      var w = viCuaItem(it), v = num(it.soTien);
      m[w] = (m[w] || 0) + v; tong += v;
    });
  });
  var r = {};
  if (!(tong > 0)){ r[viMacDinhId()] = 1; return r; }
  Object.keys(m).forEach(function(k){ r[k] = m[k] / tong; });
  return r;
}
// các ví (không phải thẻ) có thể THIẾU TIỀN trong N ngày tới: [{ w, L }], L = lịch tiền riêng của ví (L.am = ngày đầu tiên âm). Cần từ 2 ví trở lên.
function tnViSapThieu(homNay, soNgay){
  var ws = (state.data.wallets || []).filter(function(w){ return !viLaThe(w); });
  if ((state.data.wallets || []).length < 2) return [];
  var out = [];
  ws.forEach(function(w){
    var L = tnLichTien(homNay, soNgay, w.id);
    if (L.am) out.push({ w: w, L: L });
  });
  return out;
}

/* ---- giao diện ---- */
function tnHomNayHtml(t, tm){
  var h = '<div class="card hero bc-hero tn-hero" id="tnHomNay">';
  if (!t || !tm){
    return h + '<div class="hero-lbl">Hôm nay</div><div class="bc-pace-n" style="margin-top:8px">Chưa có hạn mức cho khoản chi hằng ngày nào (Ăn, Xăng...). '
      + 'Đặt "Hạn mức/tháng" ở tab Cài đặt để theo dõi mỗi ngày còn tiêu được bao nhiêu.</div></div>';
  }
  var vuotNgay = !tm.het && tm.honNayCon < 0;
  var nhan = tm.het ? 'Hạn mức tiêu hằng ngày đã hết' : (vuotNgay ? 'Hôm nay đã vượt mức' : 'Hôm nay còn tiêu được');
  var so = tm.het ? (tm.vuot > 0 ? 'vượt ' + fmt(Math.round(tm.vuot)) : fmt(0)) : fmt(Math.round(Math.abs(tm.honNayCon)));
  h += '<div class="hero-lbl">'+nhan+'</div>'
    + '<div class="bc-val"><span class="bc-v'+(tm.het || vuotNgay ? ' am' : '')+'">'+so+'</span></div>'
    + '<div class="bc-pace-n">'+(tm.het ? '' : 'Mức '+fmt(Math.round(tm.muc))+'/ngày · ')+'đã tiêu hôm nay '+fmt(Math.round(tm.daHomNay))+' · còn '+tm.soNgay+' ngày (tính cả hôm nay)</div>';
  var dauThang = t.soQua === 0;
  h += '<div class="tn-stats">'
    + '<div><small>Chuỗi trong mức</small><b>'+(dauThang ? '—' : t.chuoi+' ngày')+'</b><span>'+(dauThang ? 'ngày đầu tháng' : 'liên tiếp tới hôm qua')+'</span></div>'
    + '<div><small>So với nhịp đều</small><b class="'+(dauThang ? '' : (t.deu >= 0 ? 'thu' : 'chi'))+'">'+(dauThang ? '—' : (t.deu >= 0 ? 'dư ' : 'vượt ')+fmt(Math.round(Math.abs(t.deu))))+'</b>'
    +   '<span>'+(dauThang ? 'ngày đầu tháng' : 'tới hết hôm qua')+'</span></div>'
    + '</div>';
  return h + tnHomNayGiaiThichHtml(t, tm) + '</div>';
}
// cách tính 3 số của thẻ Hôm nay, có phép tính bằng số thật (giaiThichSo ở state.js)
function tnHomNayGiaiThichHtml(t, tm){
  var ds = [], dauThang = t.soQua === 0;
  ds.push({ ten: 'Hôm nay còn tiêu được', ct: '(Hạn mức hằng ngày − đã chi trước hôm nay) ÷ số ngày còn lại (tính cả hôm nay) = mức mỗi ngày; trừ phần đã tiêu hôm nay.',
    pt: tm.het ? 'đã chi hằng ngày ' + soGt(tm.daTruoc + tm.daHomNay) + ' ≥ hạn mức ' + soGt(tm.cap) + ' → hết hạn mức'
      : '(' + soGt(tm.cap) + ' − ' + soGt(tm.daTruoc) + ') ÷ ' + tm.soNgay + ' = ' + soGt(tm.muc) + '/ngày; ' + soGt(tm.muc) + ' − ' + soGt(tm.daHomNay) + ' = ' + soGt(tm.honNayCon) });
  if (!dauThang){
    var vuot = null;
    for (var j = t.den - 2; j >= 0; j--){ if (!t.ngay[j].ok){ vuot = t.ngay[j]; break; } }
    ds.push({ ten: 'Chuỗi trong mức', ct: 'Số ngày liên tiếp, tính lùi từ hôm qua, mà chi hằng ngày không vượt mức của ngày đó. Hôm nay chưa hết ngày nên chưa tính.',
      pt: t.chuoi + ' ngày' + (vuot ? ' · ngày vượt gần nhất: ' + ngayNganVN(t.mk + '-' + pad2(vuot.d)) + ' (chi ' + soGt(vuot.chi) + ' > mức ' + soGt(vuot.muc) + ')' : ' · chưa có ngày nào vượt mức từ đầu tháng') });
    ds.push({ ten: 'So với nhịp đều', ct: 'Hạn mức × (số ngày đã qua ÷ số ngày của tháng) = số được phép chi nếu chi đều mỗi ngày; so với số đã chi tới hết hôm qua.',
      pt: soGt(t.cap) + ' × ' + t.soQua + '/' + t.soNgay + ' = ' + soGt(t.nhipDeu) + '; đã chi ' + soGt(t.daTruoc) + ' → ' + (t.deu >= 0 ? 'dư ' : 'vượt ') + soGt(Math.abs(t.deu)) });
  }
  return giaiThichSo(ds, 'Cách tính các số này');
}
function tnLichThangHtml(t){
  if (!t) return '';
  var mk = t.mk, sel = state.tnNgay && state.tnNgay.slice(0, 7) === mk ? parseInt(state.tnNgay.slice(8, 10), 10) : t.den;
  if (sel > t.den) sel = t.den;
  var dau = (new Date(parseInt(mk.slice(0, 4), 10), parseInt(mk.slice(5, 7), 10) - 1, 1).getDay() + 6) % 7;
  var h = '<div class="card bc-card" id="tnTungNgay"><h3 class="bc-h"><span>Từng ngày</span>'
    + (t.soQua > 0 ? '<span class="bc-h-s">'+t.soOk+'/'+t.soQua+' ngày trong mức</span>' : '') + '</h3>'
    + '<div class="tn-cal">' + ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(function(x){ return '<span class="tn-wd">'+x+'</span>'; }).join('');
  for (var b = 0; b < dau; b++) h += '<span></span>';
  for (var d = 1; d <= t.soNgay; d++){
    var x = t.ngay[d - 1], lop = !x ? 'sau' : (d === t.den ? 'nay' : (x.ok ? 'ok' : 'vuot'));
    h += x ? '<button type="button" class="tn-d '+lop+(d === sel ? ' sel' : '')+'" data-act="tnNgay" data-ngay="'+mk+'-'+pad2(d)+'" aria-pressed="'+(d === sel)+'">'+d+'</button>'
           : '<span class="tn-d sau">'+d+'</span>';
  }
  h += '</div>';
  var s = t.ngay[sel - 1], ngay = mk + '-' + pad2(sel), chenh = s.muc - s.chi;
  h += '<div class="tn-ct"><span>'+tnThu(ngay)+' '+ngayNganVN(ngay)+(sel === t.den ? ' · hôm nay' : '')+'</span>'
    + '<span>Chi <b>'+fmt(Math.round(s.chi))+'</b> / mức '+fmt(Math.round(s.muc))
    + (sel === t.den ? '' : (chenh >= -0.5 ? ' · <b class="thu">trong mức</b>' : ' · <b class="chi">vượt '+fmt(Math.round(-chenh))+'</b>')) + '</span></div>'
    + '<div class="tn-leg"><span><i class="ok"></i>Trong mức</span><span><i class="vuot"></i>Vượt mức</span><span><i class="nay"></i>Hôm nay</span></div>'
    + giaiThichSo([{ ten: 'Mức của ngày ' + sel, ct: 'Hạn mức còn lại đầu ngày ÷ số ngày còn lại (tính cả ngày đó). Ngày "trong mức" khi chi hằng ngày hôm đó không vượt mức; không chi gì cũng là trong mức.',
      pt: '(' + soGt(t.cap) + ' − ' + soGt(s.da) + ') ÷ ' + (t.soNgay - sel + 1) + ' = ' + soGt(s.muc) + '; chi ' + soGt(s.chi) + (s.chi <= s.muc + 0.5 ? ' ≤ mức → trong mức' : ' > mức → vượt ' + soGt(s.chi - s.muc)) }], 'Cách tính ngày này');
  return h + '</div>';
}
// bộ chọn Tổng / từng ví (không gồm thẻ tín dụng): chỉ hiện khi có từ 2 ví
function tnViChonHtml(viId){
  var ws = (state.data.wallets || []).filter(function(w){ return !viLaThe(w); });
  if ((state.data.wallets || []).length < 2 || !ws.length) return '';
  var nut = function(id, ten){ return '<button type="button" class="tn-vi-b'+(id === viId ? ' on' : '')+'" data-act="tnVi" data-id="'+esc(id)+'" aria-pressed="'+(id === viId)+'">'+esc(ten)+'</button>'; };
  return '<div class="tn-vi" role="group" aria-label="Xem theo ví">' + nut('', 'Tổng') + ws.map(function(w){ return nut(w.id, w.ten); }).join('') + '</div>';
}
function tnLichTienHtml(L){
  var h = '<div class="card bc-card" id="tnLichTien"><h3 class="bc-h"><span>'+(L.viId ? esc(viTen(L.viId))+' · ' : 'Tiền ')+TN_SO_NGAY+' ngày tới</span><span class="bc-h-s">hôm nay '+fmt(Math.round(L.dau))+'</span></h3>';
  h += tnViChonHtml(L.viId);
  h += '<div class="tn-thap">Thấp nhất <b class="'+(L.thap.cuoi < 0 ? 'chi' : '')+'">'+fmt(Math.round(L.thap.cuoi))+'</b> vào <b>'+tnThu(L.thap.ngay)+' '+ngayNganVN(L.thap.ngay)+'</b></div>';
  if (L.am && L.viId){
    // 1 ví thiếu tiền: nói rõ khoản nào làm ví âm và cần chuyển vào bao nhiêu trước ngày nào
    var can = Math.max(0, -L.thap.cuoi), kh = L.am.ra.slice().sort(function(a, b){ return b.soTien - a.soTien; })[0];
    h += '<div class="tn-canh">'+icon('alert')+'<span>Ví '+esc(viTen(L.viId))+' có thể thiếu tiền từ <b>'+ngayNganVN(L.am.ngay)+'</b>'
      + (kh ? ' khi ' + esc(kh.ten) + ' ' + fmt(Math.round(kh.soTien)) : '')
      + '. Thấp nhất âm ' + fmt(Math.round(can)) + ' vào ' + ngayNganVN(L.thap.ngay) + ': cần chuyển vào ví này ít nhất ' + fmt(Math.ceil(can)) + ' trước ' + ngayNganVN(L.am.ngay) + '.</span></div>'
      + '<button type="button" class="btn secondary sm tn-chuyen" data-act="tnChuyenVi" data-id="'+esc(L.viId)+'" data-tien="'+Math.ceil(can)+'" data-ngay="'+L.am.ngay+'">'+icon('transfer')+' Chuyển '+fmt(Math.ceil(can))+' vào ví này</button>';
  } else if (L.am){
    h += '<div class="tn-canh">'+icon('alert')+' Có thể thiếu tiền từ '+ngayNganVN(L.am.ngay)+' (âm '+fmt(Math.round(-L.am.cuoi))+')</div>';
  }
  var labels = L.ngay.map(function(r){ return r.ngay.slice(8, 10) + '/' + r.ngay.slice(5, 7); });
  h += '<div class="bd-box" style="margin-top:10px">' + bdLine({ W: 350, H: 170, labels: labels,
      series: [{ ten: 'Số dư', vals: L.ngay.map(function(r){ return Math.round(r.cuoi); }), cls: L.am ? 'chi' : 'thu', fill: true }],
      base: L.am ? 0 : null, baseLabel: '0', sel: L.ngay.indexOf(L.thap),
      tipTitle: function(i){ return tnThu(L.ngay[i].ngay) + ' ' + labels[i]; }, money: bdTien, aria: 'Số dư dự kiến ' + TN_SO_NGAY + ' ngày tới' }) + '</div>';
  var coViec = L.ngay.filter(function(r){ return r.vao.length || r.ra.length; });
  if (!coViec.length) h += '<div class="empty" style="padding:8px 0;text-align:left">Không có khoản thu / chi có ngày nào trong '+TN_SO_NGAY+' ngày tới.</div>';
  else {
    var hienHet = !!state.tnHet, gioiHan = 6, dsHien = hienHet ? coViec : coViec.slice(0, gioiHan);
    h += '<div class="tn-evs">' + dsHien.map(function(r){
      return '<div class="tn-ev"><div class="tn-ev-h"><b>'+tnThu(r.ngay)+' '+ngayNganVN(r.ngay)+'</b><span class="'+(r.cuoi < 0 ? 'chi' : '')+'">còn '+fmt(Math.round(r.cuoi))+'</span></div>'
        + r.vao.map(function(e){ return '<div class="tn-ev-r"><span>'+esc(e.ten)+'</span><b class="thu">+'+fmt(Math.round(e.soTien))+'</b></div>'; }).join('')
        + r.ra.map(function(e){ return '<div class="tn-ev-r"><span>'+esc(e.ten)+'</span><b class="chi">−'+fmt(Math.round(e.soTien))+'</b></div>'; }).join('')
        + '</div>';
    }).join('') + '</div>';
    if (coViec.length > gioiHan) h += '<button type="button" class="dt-more" data-act="tnHet">'+(hienHet ? 'Thu gọn' : 'Xem thêm '+(coViec.length - gioiHan)+' ngày')+'</button>';
  }
  if (L.ghiChu.length) h += '<div class="dt-ghichu">'+L.ghiChu.map(esc).join('<br>')+'</div>';
  h += tnLichTienGiaiThichHtml(L);
  return h + '</div>';
}

// cách tính lịch tiền 30 ngày, kèm phép tính bằng số thật cho ngày cuối kỳ và ngày thấp nhất
function tnLichTienGiaiThichHtml(L){
  var vao = 0, ra = 0, chi = 0, vaoT = 0, raT = 0, chiT = 0, iT = L.ngay.indexOf(L.thap);
  L.ngay.forEach(function(r, i){ vao += r.tongVao; ra += r.tongRa; chi += r.chiNgay; if (i <= iT){ vaoT += r.tongVao; raT += r.tongRa; chiT += r.chiNgay; } });
  var cuoi = L.ngay[L.ngay.length - 1];
  // chi hằng ngày: hôm nay + các đoạn ngày liền nhau cùng mức (tháng này, tháng sau)
  var g = [], giaTri = null;
  L.ngay.slice(1).forEach(function(r){
    var v = Math.round(r.chiNgay);
    if (g.length && g[g.length - 1].v === v) g[g.length - 1].n++; else g.push({ n: 1, v: v });
  });
  var ptChi = soGt(L.ngay[0].chiNgay) + ' (hôm nay)' + g.map(function(x){ return ' + ' + x.n + ' ngày × ' + soGt(x.v); }).join('') + ' = ' + soGt(chi);
  return giaiThichSo([
    { ten: 'Số dư ngày cuối (' + ngayNganVN(cuoi.ngay) + ')', ct: 'Tổng số dư các ví hết hôm nay (gồm ví để dành, đã trừ dư nợ thẻ) + khoản thu có ngày − khoản chi có ngày − chi hằng ngày.',
      pt: ptCong([L.dau, vao, -ra, -chi], cuoi.cuoi) },
    { ten: 'Ngày thấp nhất (' + ngayNganVN(L.thap.ngay) + ')', ct: 'Cùng phép tính, cộng dồn tới ngày đó.', pt: ptCong([L.dau, vaoT, -raT, -chiT], L.thap.cuoi) },
    L.viId ? { ten: 'Phạm vi: ví ' + esc(viTen(L.viId)), ct: 'Chỉ tính khoản thu / chi của ví này (khoản không có ví riêng tính vào ví mặc định), chuyển ví đã ghi trước, và thanh toán thẻ (giả định trả từ ví mặc định). Chi hằng ngày nhân với tỉ lệ ví này trong chi hằng ngày 30 ngày qua.',
      pt: 'tỉ lệ chi hằng ngày: ' + Object.keys(L.tiLe || {}).map(function(k){ return esc(viTen(k)) + ' ' + Math.round(L.tiLe[k] * 100) + '%'; }).join(' · ') } : null,
    { ten: 'Chi hằng ngày', ct: L.theoNhip ? 'Theo nhịp chi thực tế tháng này vì chưa đặt hạn mức: hôm nay = nhịp − đã tiêu hôm nay.' : 'Hôm nay = phần còn tiêu được; các ngày còn lại của tháng = mức mỗi ngày; tháng sau = hạn mức ÷ số ngày của tháng đó.', pt: ptChi },
    { ten: 'Khoản thu / chi có ngày', ct: 'Lương và khoản thu có ngày (ngày đã qua mà chưa ghi thì không tính), trả nợ theo lịch (kỳ quá hạn tính vào hôm nay), khoản cố định theo định kỳ hoặc "Ngày chi hằng tháng" (chưa có ngày thì tính vào hôm nay / ngày 1 tháng sau), thu hồi cho vay đúng hẹn, khoản đã ghi trước. Thanh toán thẻ là chuyển giữa các ví nên không đổi tổng.',
      pt: 'vào ' + soGt(vao) + ' · ra ' + soGt(ra) }
  ], 'Tính thế nào?');
}

function renderTheoNgay(){
  var root = document.getElementById('tabContent');
  var hom = todayStr(), t = tnNgayThang(hom), tm = tieuMoiNgay(hom);
  if (state.tnVi && (!walletById(state.tnVi) || viLaThe(walletById(state.tnVi)))) state.tnVi = '';       // ví đã xóa / là thẻ: về Tổng
  var L = tnLichTien(hom, undefined, state.tnVi || '');
  root.innerHTML = dtCheDoHtml() + '<div class="cot2"><div class="cot-trai">' + tnHomNayHtml(t, tm) + tnLichThangHtml(t)
    + '</div><div class="cot-phai">' + tnLichTienHtml(L) + '</div></div>';
  if (typeof mpSheetVe === 'function') mpSheetVe();
}
function handleTheoNgayAction(act, el){
  if (act === 'tnNgay'){ state.tnNgay = el.getAttribute('data-ngay'); renderTheoNgay(); return true; }
  if (act === 'tnHet'){ state.tnHet = !state.tnHet; renderTheoNgay(); return true; }
  if (act === 'tnVi'){ state.tnVi = el.getAttribute('data-id') || ''; state.tnHet = false; renderTheoNgay(); return true; }
  if (act === 'tnChuyenVi'){
    // mở form Chuyển ví ở Sổ tay, điền sẵn ví nhận và số cần chuyển (viSoDuCardHtml đọc state.viChuyenGoiY)
    state.viChuyenGoiY = { den: el.getAttribute('data-id'), tien: parseInt(el.getAttribute('data-tien'), 10) || 0 };
    state.viFormOpen = true; state.soTayMonth = monthKey(todayStr());
    chuyenTab('sotay'); return true;
  }
  return false;
}
