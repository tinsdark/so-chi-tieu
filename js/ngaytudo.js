"use strict";
/* ====================================================================
   ngaytudo.js — NGÀY TỰ DO: tiền các ví đủ cho bao nhiêu ngày sống không cần thêm đồng thu nào.
   Giờ công đổi tiền ra thời gian ĐI LÀM; Ngày tự do đổi ngược lại: tiền đang có = bao nhiêu ngày KHÔNG phải đi làm.

   - chi mỗi ngày = chi THẬT (không gồm vay nợ, bdThang.tongChiThat) của tối đa 3 tháng trọn gần nhất (forecastEligibleMonths)
     ÷ tổng số ngày của các tháng đó. Chưa có tháng trọn nào thì lấy tháng này tới hết hôm qua, nếu đã qua ít nhất 7 ngày (dangDo).
   - ngày tự do = tiền các ví hôm nay (balanceAt) ÷ chi mỗi ngày; ví âm thì 0. Mốc: 7, 30, 90, 180, 365 ngày.
   - xu hướng: cùng công thức tại cuối từng tháng đã trọn (tối đa 5 tháng) + hôm nay.
   - tự do tài chính (quy tắc 25 lần): cần = 25 × chi mỗi ngày × 365. Mô phỏng theo tháng: tiền = tiền × (1 + lãi thực/12) + để dành,
     tới khi đủ. Lãi THỰC (đã trừ lạm phát) 0 / 3 / 6% do người dùng chọn. Chỉ là ước lượng, không phải lời khuyên đầu tư.
   - Ghi nhanh: dưới ô số tiền hiện "≈ 0,3 ngày tự do" (chi) / "+0,5 ngày tự do" (thu).
   Chỉ ĐỌC dữ liệu; chỉ lưu trong RAM (state.ntd): không ghi gì lên Drive.
   Cần state.js, vayno.js (daysInMonth), dongtien.js (forecastEligibleMonths), bieudo.js (bdThang), bieudo.js load trước.
   ==================================================================== */

var NTD_MOC = [7, 30, 90, 180, 365];
var NTD_LAI = [0, 3, 6];        // % lãi thực mỗi năm để chọn
var NTD_HE_SO = 25;             // tiền cần = 25 × chi cả năm (quy tắc 4%)
var NTD_THEM = 1000000;         // "mỗi X để dành thêm" trong lời so sánh
var NTD_BUOC = 100000;
state.ntd = state.ntd || { tietKiem: null, lai: 3 };

function ntdSoChu(x){ return (Math.round(x * 10) / 10).toString().replace('.', ','); }
function ntdNgayChu(x){ return x >= 10 ? String(Math.round(x)) : ntdSoChu(x); }

/* ---- chi mỗi ngày + thu nhập mỗi tháng từ các tháng trọn gần nhất; null nếu chưa đủ dữ liệu ---- */
function ntdChiNgay(homNay){
  homNay = homNay || todayStr();
  var ds = [], dangDo = false;
  forecastEligibleMonths().slice(-3).forEach(function(mk){
    var b = bdThang(mk);
    ds.push({ mk: mk, chi: b.tongChiThat, thu: b.tongThuThat, soNgay: daysInMonth(mk) });
  });
  if (!ds.length){
    var d = parseInt(homNay.slice(8, 10), 10), mk0 = monthKey(homNay);
    if (d >= 8){
      var b0 = bdThang(mk0, d - 1);
      ds.push({ mk: mk0, chi: b0.tongChiThat, thu: b0.tongThuThat, soNgay: d - 1 }); dangDo = true;
    }
  }
  var chi = 0, thu = 0, soNgay = 0;
  ds.forEach(function(x){ chi += x.chi; thu += x.thu; soNgay += x.soNgay; });
  if (!(soNgay > 0) || !(chi > 0)) return null;
  var chiNgay = chi / soNgay, k = 365 / 12;
  return { ds: ds, chi: chi, soNgay: soNgay, chiNgay: chiNgay, dangDo: dangDo,
           chiThang: chiNgay * k, thuThang: thu / soNgay * k, duThang: (thu - chi) / soNgay * k };
}
function ntdTinh(homNay){
  homNay = homNay || todayStr();
  var c = ntdChiNgay(homNay);
  if (!c) return null;
  var tien = balanceAt(homNay);
  return { c: c, tien: tien, ngay: tien > 0 ? tien / c.chiNgay : 0 };
}
// mốc đã qua / sắp tới của số ngày; toi = null khi đã vượt mốc cao nhất
function ntdMoc(ngay){
  var truoc = 0, toi = null, i;
  for (i = 0; i < NTD_MOC.length; i++){
    if (ngay >= NTD_MOC[i]) truoc = NTD_MOC[i];
    else { toi = NTD_MOC[i]; break; }
  }
  return { truoc: truoc, toi: toi, pct: toi ? Math.max(0, Math.min(100, Math.round(ngay / toi * 100))) : 100 };
}
// xu hướng: [{ nhan, v }] cuối từng tháng đã trọn (tối đa 5) + "Nay"; [] nếu không đủ 2 điểm
function ntdXuHuong(homNay){
  homNay = homNay || todayStr();
  var ms = forecastEligibleMonths(), out = [];
  ms.slice(-5).forEach(function(mk){
    var cua = ms.filter(function(m){ return m <= mk; }).slice(-3), chi = 0, ngay = 0;
    cua.forEach(function(m){ chi += bdThang(m).tongChiThat; ngay += daysInMonth(m); });
    if (!(chi > 0)) return;
    var tien = balanceAtEndOfMonth(mk);
    out.push({ nhan: 'T' + parseInt(mk.slice(5, 7), 10), v: tien > 0 ? tien / (chi / ngay) : 0 });
  });
  var t = ntdTinh(homNay);
  if (t) out.push({ nhan: 'Nay', v: t.ngay });
  return out.length >= 2 ? out : [];
}

/* ---- tự do tài chính ---- */
function ntdCanCo(c){ return NTD_HE_SO * c.chiNgay * 365; }
// số tháng để tiền đạt đủ mức cần; 0 nếu đã đạt; null nếu quá 100 năm
function ntdSoThang(tien, tietKiem, laiNam, canCo){
  if (tien >= canCo) return 0;
  var r = laiNam / 100 / 12, m, a = Math.max(0, tien);
  for (m = 1; m <= 1200; m++){ a = a * (1 + r) + tietKiem; if (a >= canCo) return m; }
  return null;
}
function ntdKhoangChu(m){
  if (m == null) return 'hơn 100 năm';
  if (m <= 0) return '0 tháng';
  var n = Math.floor(m / 12), t = m % 12;
  return (n ? n + ' năm' : '') + (n && t ? ' ' : '') + (t ? t + ' tháng' : '');
}
function ntdTietKiemMacDinh(t){ return Math.max(0, Math.round(t.c.duThang / NTD_BUOC) * NTD_BUOC); }
function ntdTietKiemToiDa(t){
  var tren = Math.max(t.c.thuThang, t.c.chiThang, ntdTietKiemMacDinh(t) * 2);
  return Math.max(NTD_BUOC * 10, Math.ceil(tren / 1000000) * 1000000);
}
function ntdTietKiem(t){
  var v = state.ntd.tietKiem;
  if (v == null || !isFinite(v)) v = ntdTietKiemMacDinh(t);
  return Math.max(0, Math.min(v, ntdTietKiemToiDa(t)));
}
function ntdLai(){ return NTD_LAI.indexOf(Number(state.ntd.lai)) >= 0 ? Number(state.ntd.lai) : 3; }

/* ---- giao diện ---- */
function ntdBangXuHuongHtml(xh){
  var max = 0;
  xh.forEach(function(x){ if (x.v > max) max = x.v; });
  return '<div class="ntd-xh" role="img" aria-label="Ngày tự do cuối từng tháng">' + xh.map(function(x, i){
    var h = max > 0 ? Math.max(4, Math.round(x.v / max * 100)) : 4;
    return '<div class="ntd-xc' + (i === xh.length - 1 ? ' nay' : '') + '"><span class="ntd-xv">' + ntdNgayChu(x.v) + '</span><i style="height:' + h + '%"></i><span class="ntd-xn">' + x.nhan + '</span></div>';
  }).join('') + '</div>';
}
function ntdKetQuaHtml(t, tietKiem, lai){
  var canCo = ntdCanCo(t.c), m = ntdSoThang(t.tien, tietKiem, lai, canCo), m2 = ntdSoThang(t.tien, tietKiem + NTD_THEM, lai, canCo);
  var h = '<div class="ntd-kq"><span>Tới tự do tài chính</span><b>' + (m === 0 ? 'Đã đạt' : ntdKhoangChu(m)) + '</b>'
    + '<small>Cần khoảng ' + fmt(Math.round(canCo)) + ' (25 lần chi cả năm)</small></div>';
  if (m != null && m > 0){
    var s = m2 == null ? null : m - m2;
    if (s != null && s > 0) h += '<div class="vn-tom">Mỗi <b>' + fmt(NTD_THEM) + '</b> để dành thêm mỗi tháng là sớm hơn <b>' + ntdKhoangChu(s) + '</b>.</div>';
  } else if (m == null){
    h += '<div class="vn-tom">Với mức để dành này thì chưa tới được trong 100 năm. Kéo thanh trượt sang phải hoặc chọn lãi thực cao hơn.</div>';
  }
  return h;
}
function ntdGiaiThich(t, tietKiem, lai){
  var c = t.c, canCo = ntdCanCo(c);
  var tuChi = c.ds.map(function(x){ return soGt(x.chi); }).join(' + '), tuNgay = c.ds.map(function(x){ return String(x.soNgay); }).join(' + ');
  var ds = [
    { ten: 'Chi mỗi ngày', ct: 'Chi thật (không gồm vay nợ) ÷ số ngày, ' + (c.dangDo ? 'tháng này tới hết hôm qua (mới dùng app, chưa có tháng trọn nào).' : 'của ' + c.ds.length + ' tháng trọn gần nhất (' + c.ds.map(function(x){ return monthLabel(x.mk); }).join(', ') + ').'),
      pt: '(' + tuChi + ') ÷ (' + tuNgay + ') = ' + soGt(c.chiNgay) },
    { ten: 'Ngày tự do', ct: 'Tiền các ví hôm nay ÷ chi mỗi ngày' + (t.tien <= 0 ? ' (ví đang không có tiền nên là 0)' : '') + '.',
      pt: soGt(t.tien) + ' ÷ ' + soGt(c.chiNgay) + ' = ' + ntdSoChu(t.ngay) + ' ngày' },
    { ten: 'Số tiền để tự do tài chính', ct: 'Quy tắc 25 lần: sống bằng khoảng 4% mỗi năm của số tiền này. Giả định chi tiêu sau này bằng chi tiêu hiện tại.',
      pt: NTD_HE_SO + ' × ' + soGt(c.chiNgay * 365) + ' = ' + soGt(canCo) },
    { ten: 'Thời gian tới đó', ct: 'Mô phỏng từng tháng: tiền = tiền × (1 + ' + lai + '% ÷ 12) + ' + soGt(tietKiem) + ' để dành, lặp tới khi đủ. Lãi thực là lãi đã trừ lạm phát. '
      + 'Chỉ là ước lượng, không phải lời khuyên đầu tư.' }
  ];
  return giaiThichSo(ds, 'Cách tính các số này');
}
function ntdLaiChonHtml(lai){
  return '<select id="ntd_lai" aria-label="Lãi thực mỗi năm">' + NTD_LAI.map(function(l){
    return '<option value="' + l + '"' + (l === lai ? ' selected' : '') + '>' + l + '% mỗi năm</option>';
  }).join('') + '</select>';
}
function ntdCardHtml(){
  var t = ntdTinh();
  if (!t) return '<div class="card bc-card ntd-card" id="cardNgayTuDo"><h3 class="bc-h"><span>Ngày tự do</span></h3>'
    + '<div class="empty" style="padding:0;text-align:left">Chưa đủ dữ liệu. Cần ít nhất một tháng đã trọn (hoặc 7 ngày ghi chi tiêu) để biết bạn thường chi bao nhiêu mỗi ngày. '
    + 'Khi đủ, đây là số ngày bạn sống được bằng tiền đang có mà không cần thêm đồng thu nào.</div></div>';
  var moc = ntdMoc(t.ngay), tk = ntdTietKiem(t), lai = ntdLai(), max = ntdTietKiemToiDa(t), xh = ntdXuHuong();
  var h = '<div class="card bc-card ntd-card" id="cardNgayTuDo"><h3 class="bc-h"><span>Ngày tự do</span></h3>'
    + '<div class="ntd-big"><b>' + ntdNgayChu(t.ngay) + '</b><span>ngày</span></div>'
    + '<div class="ntd-sub">Tiền các ví <b>' + fmt(Math.round(t.tien)) + '</b>, chi thật khoảng <b>' + fmt(Math.round(t.c.chiNgay)) + '</b> mỗi ngày: đủ sống '
    + (t.ngay > 0 ? 'khoảng <b>' + ntdNgayChu(t.ngay) + ' ngày</b> mà không cần thêm đồng thu nào.' : 'chưa được ngày nào (ví đang không có tiền).') + '</div>'
    + '<div class="ntd-bar" role="progressbar" aria-valuenow="' + moc.pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + moc.pct + '%"></i></div>'
    + '<div class="ntd-moc">' + (moc.toi ? 'Còn <b>' + ntdNgayChu(moc.toi - t.ngay) + ' ngày</b> tới mốc ' + moc.toi + ' ngày' + (moc.truoc ? ' (đã qua mốc ' + moc.truoc + ')' : '')
      : 'Đã vượt mốc <b>' + moc.truoc + ' ngày</b> (1 năm).') + '</div>'
    + (xh.length ? '<div class="qa-lbl ntd-lbl">Cuối từng tháng</div>' + ntdBangXuHuongHtml(xh) : '')
    + '<div class="ntd-fire"><div class="qa-lbl ntd-lbl">Bao lâu nữa tới tự do tài chính?</div>'
    + '<div class="ntd-hint">Tự do tài chính là khi tiền đủ để sống nhờ lãi, không cần đi làm. Kéo để thử mỗi tháng để dành bao nhiêu.</div>'
    + '<input type="range" class="ns-range" id="ntd_tk" min="0" max="' + max + '" step="' + NTD_BUOC + '" value="' + tk + '" aria-label="Số tiền để dành mỗi tháng">'
    + '<div class="ntd-tkv"><span>Để dành mỗi tháng <b id="ntd_tkv">' + fmt(tk) + '</b></span>' + ntdLaiChonHtml(lai) + '</div>'
    + '<div id="ntd_kq">' + ntdKetQuaHtml(t, tk, lai) + '</div></div>'
    + '<div id="ntd_gt">' + ntdGiaiThich(t, tk, lai) + '</div></div>';
  return h;
}
function ntdCapNhat(){
  var tkEl = document.getElementById('ntd_tk'), kq = document.getElementById('ntd_kq');
  if (!tkEl || !kq) return;
  var t = ntdTinh(); if (!t) return;
  state.ntd.tietKiem = Number(tkEl.value) || 0;
  var lEl = document.getElementById('ntd_lai'); if (lEl) state.ntd.lai = Number(lEl.value);
  var tk = ntdTietKiem(t), lai = ntdLai();
  var v = document.getElementById('ntd_tkv'); if (v) v.textContent = fmt(tk);
  kq.innerHTML = ntdKetQuaHtml(t, tk, lai);
  var gt = document.getElementById('ntd_gt'); if (gt) gt.innerHTML = ntdGiaiThich(t, tk, lai);
}
function handleNgayTuDoInput(el){
  if (!el || (el.id !== 'ntd_tk' && el.id !== 'ntd_lai')) return false;
  ntdCapNhat();
  return true;
}

/* ---- gợi ý ở Ghi nhanh: số tiền đang gõ = bao nhiêu ngày tự do ---- */
function ntdGoiY(kind, tien){
  tien = Number(tien) || 0;
  if (!(tien > 0)) return '';
  var t = ntdTinh();
  if (!t) return '';
  var n = tien / t.c.chiNgay;
  var s = n < 0.05 ? 'chưa tới 0,1' : ntdSoChu(n);
  return kind === 'thu' ? '+' + s + ' ngày tự do' : 'Khoản này ≈ ' + s + ' ngày tự do';
}
function ntdGoiYCapNhat(){
  var el = document.getElementById('qa_ntd');
  if (!el) return;
  var kind = (state.qa.kind === 'thu') ? 'thu' : 'chi';
  el.textContent = ntdGoiY(kind, numNonNeg(docSo(state.qa.amt)));
}
