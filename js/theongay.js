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
    ngay.push({ d: d, chi: chi, muc: muc, ok: ok });
    if (d < den && ok) soOk++;
    da += chi;
  }
  var chuoi = 0;
  for (var j = den - 2; j >= 0 && ngay[j].ok; j--) chuoi++;
  var daTruoc = da - ngay[den - 1].chi;
  return { mk: mk, cap: hn.cap, soNgay: N, den: den, ngay: ngay, chuoi: chuoi, soOk: soOk, soQua: den - 1,
           deu: hn.cap * (den - 1) / N - daTruoc };
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
function tnLichTien(homNay, soNgay){
  homNay = homNay || todayStr(); soNgay = soNgay || TN_SO_NGAY;
  var cuoi = tnNgayCong(homNay, soNgay - 1), ds = {}, ngayList = [], thangs = [], ghiChu = [], d = state.data;
  for (var i = 0; i < soNgay; i++){
    var n = tnNgayCong(homNay, i);
    ngayList.push(n); ds[n] = { vao: [], ra: [] };
    if (thangs.indexOf(monthKey(n)) < 0) thangs.push(monthKey(n));
  }
  var them = function(ngay, loai, ten, soTien){
    if (!(soTien > 0.5)) return;
    if (ngay < homNay) ngay = homNay;
    if (ngay > cuoi) return;
    ds[ngay][loai].push({ ten: ten, soTien: soTien });
  };
  // khoản đã ghi trước cho ngày sau hôm nay (đã có trong sổ nhưng chưa vào số dư hôm nay)
  ngayList.forEach(function(n){
    var e = d.journal[n];
    if (n === homNay || !e) return;
    them(n, 'vao', 'Khoản thu đã ghi trước', thuTotal(e));
    them(n, 'ra', 'Khoản chi đã ghi trước', chiTotal(e));
  });
  // trả nợ theo lịch
  (d.vayNo.vayNoPhaiTra || []).forEach(function(loan){
    if (!loanIsActive(loan) || loan.tatToan) return;
    var sch = tinhLichTraNo(loan);
    sch.forEach(function(row, k){
      if (kyDaDong(loan, k)) return;
      them(row.ngayTra, 'ra', 'Trả nợ: ' + loan.ten + ' · kỳ ' + (k + 1) + (row.ngayTra < homNay ? ' (quá hạn)' : ''), conThieuKy(loan, k, sch));
    });
  });
  // thu hồi cho vay đúng hẹn
  (d.vayNo.choVay || []).forEach(function(c){
    if (c.tatToan || c.trangThai === 'da_thu_du' || !c.ngayDuKienThu) return;
    var cl = conLaiPhaiThu(c);
    if (cl <= 0) return;
    if (c.ngayDuKienThu < homNay){ ghiChu.push('Chưa tính khoản cho vay quá hẹn: ' + c.ten + ' ' + fmt(Math.round(cl)) + '.'); return; }
    them(c.ngayDuKienThu, 'vao', 'Thu nợ: ' + c.ten, cl);
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
          them(ngayTraCuaKy(mk, k.ngay), 'ra', k.ten || c.ten, num(k.soTien));
        });
        return;
      }
      var con = num(c.chiTieu) - da, nh = catNgayHan(c);
      if (con <= 0) return;
      them(nh ? ngayTraCuaKy(mk, nh) : (mk === monthKey(homNay) ? homNay : mk + '-01'), 'ra', c.ten + (nh ? '' : ' (chưa có ngày chi)'), con);
    });
    // khoản thu có ngày
    (d.categories.thu || []).forEach(function(c){
      if (CAT_HE_THONG.thu[c.id]) return;
      var dks = dkCua('thu', c.id), ds2 = [];
      if (dks.length){
        dks.forEach(function(k){
          if ((k.bo || []).indexOf(mk) >= 0 || dinhKyDaGhi(k, mk)) return;
          ds2.push({ ngay: ngayTraCuaKy(mk, k.ngay), ten: k.ten || c.ten, soTien: num(k.soTien) });
        });
      } else {
        var nh = catNgayHan(c), con = num(c.chiTieu) - actualCatInMonth('thu', c.id, mk);
        if (nh && con > 0) ds2.push({ ngay: ngayTraCuaKy(mk, nh), ten: c.ten, soTien: con });
      }
      ds2.forEach(function(x){
        if (x.ngay < homNay){ ghiChu.push(x.ten + ' (ngày ' + ngayNganVN(x.ngay) + ') chưa ghi nên chưa tính.'); return; }
        them(x.ngay, 'vao', x.ten, x.soTien);
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
    if (n === homNay) return conHomNay;
    if (!tm) return nhip;
    return monthKey(n) === monthKey(homNay) ? tm.muc : hn.cap / daysInMonth(monthKey(n));
  };
  var dau = balanceAt(homNay), bal = dau, out = [], thap = null, am = null;
  ngayList.forEach(function(n){
    var x = ds[n], vao = 0, ra = 0, c = chiNgay(n);
    x.vao.forEach(function(e){ vao += e.soTien; }); x.ra.forEach(function(e){ ra += e.soTien; });
    bal += vao - ra - c;
    var r = { ngay: n, vao: x.vao, ra: x.ra, tongVao: vao, tongRa: ra, chiNgay: c, cuoi: bal };
    out.push(r);
    if (!thap || bal < thap.cuoi) thap = r;
    if (!am && bal < -0.5) am = r;
  });
  return { dau: dau, ngay: out, thap: thap, am: am, ghiChu: ghiChu, theoNhip: !tm, mucNgay: tm ? tm.muc : nhip };
}

/* ---- giao diện ---- */
function tnHomNayHtml(t, tm){
  var h = '<div class="card hero bc-hero tn-hero" id="tnHomNay">';
  if (!t || !tm){
    return h + '<div class="hero-lbl">Hôm nay</div><div class="bc-pace-n" style="margin-top:8px">Chưa có hạn mức cho khoản chi hằng ngày nào (Ăn, Xăng...). '
      + 'Đặt "Hạn mức/tháng" ở tab Danh mục để theo dõi mỗi ngày còn tiêu được bao nhiêu.</div></div>';
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
  return h + '</div>';
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
    + '<div class="tn-leg"><span><i class="ok"></i>Trong mức</span><span><i class="vuot"></i>Vượt mức</span><span><i class="nay"></i>Hôm nay</span></div>';
  return h + '</div>';
}
function tnLichTienHtml(L){
  var h = '<div class="card bc-card" id="tnLichTien"><h3 class="bc-h"><span>Tiền '+TN_SO_NGAY+' ngày tới</span><span class="bc-h-s">hôm nay '+fmt(Math.round(L.dau))+'</span></h3>';
  h += '<div class="tn-thap">Thấp nhất <b class="'+(L.thap.cuoi < 0 ? 'chi' : '')+'">'+fmt(Math.round(L.thap.cuoi))+'</b> vào <b>'+tnThu(L.thap.ngay)+' '+ngayNganVN(L.thap.ngay)+'</b></div>';
  if (L.am) h += '<div class="tn-canh">'+icon('alert')+' Có thể thiếu tiền từ '+ngayNganVN(L.am.ngay)+' (âm '+fmt(Math.round(-L.am.cuoi))+')</div>';
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
  h += ghiChuGon('Bắt đầu từ tổng số dư các ví hết hôm nay (gồm ví để dành, đã trừ dư nợ thẻ). Mỗi ngày trừ chi hằng ngày '
    + (L.theoNhip ? 'theo nhịp chi thực tế tháng này ('+fmt(Math.round(L.mucNgay))+'/ngày, vì chưa đặt hạn mức)' : 'theo mức '+fmt(Math.round(L.mucNgay))+'/ngày (tháng sau: hạn mức ÷ số ngày)')
    + '. Cộng / trừ thêm: khoản thu có ngày (lương...), trả nợ theo lịch (kỳ quá hạn tính vào hôm nay), khoản cố định theo định kỳ hoặc "Ngày chi hằng tháng" '
    + '(chưa có ngày thì tính vào hôm nay / ngày 1 tháng sau), thu hồi cho vay đúng hẹn, khoản đã ghi trước. Thanh toán thẻ là chuyển giữa các ví nên không đổi tổng.', 'Tính thế nào?');
  return h + '</div>';
}

function renderTheoNgay(){
  var root = document.getElementById('tabContent');
  var hom = todayStr(), t = tnNgayThang(hom), tm = tieuMoiNgay(hom), L = tnLichTien(hom);
  root.innerHTML = dtCheDoHtml() + '<div class="cot2"><div class="cot-trai">' + tnHomNayHtml(t, tm) + tnLichThangHtml(t)
    + '</div><div class="cot-phai">' + tnLichTienHtml(L) + '</div></div>';
  if (typeof mpSheetVe === 'function') mpSheetVe();
}
function handleTheoNgayAction(act, el){
  if (act === 'tnNgay'){ state.tnNgay = el.getAttribute('data-ngay'); renderTheoNgay(); return true; }
  if (act === 'tnHet'){ state.tnHet = !state.tnHet; renderTheoNgay(); return true; }
  return false;
}
