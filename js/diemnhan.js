"use strict";
/* ====================================================================
   diemnhan.js — thẻ "ĐIỀU ĐÁNG CHÚ Ý" ở đầu tab Báo cáo: app tự đọc dữ liệu của tháng đang xem và kể lại bằng 3 đến 5 CÂU NGẮN, mỗi câu kèm số thật.
   KHÔNG dùng AI: là một bộ luật cố định, mỗi luật cho ra một câu (hoặc không có câu nào nếu không đáng chú ý) kèm điểm; lấy 5 điểm cao nhất.
   Đặt ở Báo cáo (nơi để HIỂU tiền) chứ không ở chuông (nơi để LÀM việc): chuông có số đỏ, điều đáng chú ý thì không.
   Chỉ ĐỌC dữ liệu. Tháng đang chạy so với CÙNG KHOẢNG NGÀY của các tháng trước (không so tháng dở với tháng trọn).
   Luật: tổng chi so với TB 3 tháng trước · danh mục tăng mạnh nhất · dư thật (để dành / chi vượt thu) · chuỗi ngày chi hằng ngày trong mức ·
         khoản chi lớn nhất · giờ công chi tiêu · thứ trong tuần chi nhiều nhất · lời hứa đang giữ / vừa phá · nợ gốc tăng giảm · số ngày không chi.
   dnTatCa(mk, homNay) là hàm thuần để test; dnCardHtml(mk) là thẻ (rỗng nếu chưa có gì đáng nói), ẩn / hiện được ở Cài đặt → Hiển thị.
   Cần bieudo.js (bdThang, bdTheoThu), theongay.js, tongket.js, giocong.js, loihua.js, sotay.js load trước.
   ==================================================================== */

var DN_TOI_DA = 5;
var DN_MIN_DIEM = 25;

// tối đa soThang tháng liền trước có chi tiêu; denNgay (nếu có) = chỉ tính tới ngày đó mỗi tháng để so cùng kỳ
function dnThangTruoc(mk, soThang, denNgay){
  var out = [], k = mk;
  for (var i = 0; i < 6 && out.length < soThang; i++){
    k = bdThangTruoc(k);
    var b = bdThang(k, denNgay);
    if (b.coDl && b.tongChiThat > 0) out.push({ mk: k, b: b });
  }
  return out;
}
function dnPhanTram(x){ return Math.round(Math.abs(x) * 100) + '%'; }
function dnNgay(d){ return d.slice(8, 10) + '/' + d.slice(5, 7); }

/* trả [{ id, tone: 'tot'|'xau'|'trung', diem, html (câu, đã escape), ten, ct, pt }] đã sắp theo điểm giảm dần, tối đa DN_TOI_DA */
function dnTatCa(mk, homNay, giuHet){
  homNay = homNay || todayStr();
  var laNay = mk === monthKey(homNay), den = laNay ? parseInt(homNay.slice(8, 10), 10) : undefined;
  var cur = bdThang(mk, den), out = [];
  if (!cur.coDl) return out;
  var nhan = laNay ? 'tháng này' : monthLabel(mk).toLowerCase();
  var them = function(o){ if (o.diem >= DN_MIN_DIEM) out.push(o); };
  var truoc = (!laNay || den >= 7) ? dnThangTruoc(mk, 3, den) : [];
  var chi = cur.tongChiThat, thu = cur.tongThuThat, hn = hanMucHangNgay();

  // 1. tổng chi so với trung bình các tháng trước (cùng kỳ)
  if (truoc.length >= 2 && chi > 0){
    var vals = truoc.map(function(x){ return x.b.tongChiThat; }), tong = 0; vals.forEach(function(v){ tong += v; });
    var avg = tong / vals.length, pct = (chi - avg) / avg;
    if (Math.abs(pct) >= 0.15){
      them({ id: 'chi', tone: pct > 0 ? 'xau' : 'tot', diem: 20 + Math.min(70, Math.abs(pct) * 100), ten: 'Chi tiêu so với trung bình',
        html: 'Chi tiêu ' + nhan + (laNay ? ' (tới ngày ' + den + ')' : '') + ' <b>' + (pct > 0 ? 'tăng ' : 'giảm ') + dnPercent(pct) + '</b> so với trung bình ' + vals.length + ' tháng trước: <b>' + fmt(Math.round(chi)) + '</b> so với <b>' + fmt(Math.round(avg)) + '</b>.',
        ct: 'Chi tiêu thật (không gồm vay nợ) so với trung bình các tháng trước, cùng khoảng ngày' + (laNay ? ' (tới ngày ' + den + ')' : '') + '.',
        pt: ptCong(vals, tong) + ' ÷ ' + vals.length + ' = ' + soGt(avg) + ' · (' + soGt(chi) + ' − ' + soGt(avg) + ') ÷ ' + soGt(avg) + ' = ' + Math.round(pct * 100) + '%' });
    }
  }
  // 2. danh mục tăng mạnh nhất so với trung bình
  if (truoc.length >= 2){
    var tot = null;
    Object.keys(cur.theoCatThat).forEach(function(id){
      var v = cur.theoCatThat[id], s = 0; truoc.forEach(function(x){ s += num(x.b.theoCatThat[id]); });
      var a = s / truoc.length, d = v - a;
      if (d >= 200000 && (a > 0 ? v >= a * 1.3 : v >= 500000) && (!tot || d > tot.d)) tot = { id: id, v: v, a: a, d: d };
    });
    if (tot){
      var ten = catTen('chi', tot.id);
      them({ id: 'cat', tone: 'xau', diem: 30 + Math.min(50, tot.d / 40000), ten: 'Danh mục tăng mạnh nhất',
        html: '<b>' + esc(ten) + '</b> ' + (tot.a > 0 ? 'tăng <b>' + fmt(Math.round(tot.d)) + '</b> (+' + dnPercent(tot.d / tot.a) + ') so với trung bình' : 'là khoản <b>mới</b> so với các tháng trước') + ': <b>' + fmt(Math.round(tot.v)) + '</b>' + (tot.a > 0 ? ' so với ' + fmt(Math.round(tot.a)) : '') + '.',
        ct: 'Danh mục chi (thật) tăng nhiều tiền nhất so với trung bình các tháng trước; cần tăng ít nhất 200.000 và 30%.',
        pt: ptCong([tot.v, -tot.a], tot.d) });
    }
  }
  // 3. dư thật: để dành được bao nhiêu / chi vượt thu
  if (!laNay || den >= 15){
    var du = thu - chi;
    if (du < -0.5 && thu > 0){            // chưa ghi khoản thu nào thì "chi vượt thu" vô nghĩa (có thể chỉ là chưa ghi lương)
      them({ id: 'du', tone: 'xau', diem: 90, ten: 'Chi vượt thu', html: 'Chi tiêu <b>vượt thu nhập ' + fmt(Math.round(-du)) + '</b> (thu ' + fmt(Math.round(thu)) + ', chi ' + fmt(Math.round(chi)) + ').',
        ct: 'Thu nhập thật − chi tiêu thật của ' + nhan + ', không gồm vay nợ.', pt: ptCong([thu, -chi], du) });
    } else if (thu > 0 && du > 0.5){
      var tl = du / thu;
      them({ id: 'du', tone: tl >= 0.2 ? 'tot' : 'trung', diem: tl >= 0.2 ? 45 : 26, ten: 'Để dành được',
        html: 'Bạn để dành được <b>' + fmt(Math.round(du)) + '</b> ' + nhan + ' (' + dnPercent(tl) + ' thu nhập).',
        ct: 'Thu nhập thật − chi tiêu thật, rồi chia cho thu nhập thật.', pt: ptCong([thu, -chi], du) + ' · ' + soGt(du) + ' ÷ ' + soGt(thu) + ' = ' + Math.round(tl * 100) + '%' });
    }
  }
  // 4. chuỗi ngày chi hằng ngày trong mức (cần hạn mức hằng ngày)
  if (hn.cap > 0){
    if (laNay){
      var tn = tnNgayThang(homNay);
      if (tn && tn.chuoi >= 5) them({ id: 'chuoi', tone: 'tot', diem: 55 + Math.min(20, tn.chuoi), ten: 'Chuỗi ngày trong mức',
        html: 'Đã <b>' + tn.chuoi + ' ngày liên tiếp</b> chi hằng ngày trong mức.', ct: 'Số ngày liền nhau tính tới hôm qua mà chi hằng ngày không vượt mức của ngày đó (xem Dòng tiền → Theo ngày).', pt: tn.chuoi + ' ngày liên tiếp tới hôm qua' });
    } else {
      var tk = tongKetThang(mk);
      if (tk && tk.ngayOk != null && tk.ngayOk / tk.soNgay >= 0.8) them({ id: 'chuoi', tone: 'tot', diem: 40, ten: 'Ngày trong mức',
        html: 'Có <b>' + tk.ngayOk + '/' + tk.soNgay + ' ngày</b> chi hằng ngày trong mức.', ct: 'Số ngày chi hằng ngày không vượt mức của ngày đó, trên số ngày của tháng.', pt: tk.ngayOk + ' ÷ ' + tk.soNgay + ' = ' + Math.round(tk.ngayOk / tk.soNgay * 100) + '%' });
    }
  }
  // 5. khoản chi lớn nhất tháng (so với khoản thường)
  var ds = [], he = CAT_HE_THONG.chi;
  Object.keys(state.data.journal).forEach(function(ng){
    if (monthKey(ng) !== mk || (den && parseInt(ng.slice(8, 10), 10) > den)) return;
    entryItems(state.data.journal[ng]).forEach(function(it){ if (it.kind === 'chi' && !he[it.catId] && num(it.soTien) > 0) ds.push({ ng: ng, it: it, v: num(it.soTien) }); });
  });
  if (ds.length >= 6){
    var sx = ds.map(function(x){ return x.v; }).sort(function(a, b){ return a - b; }), h = Math.floor(sx.length / 2), med = sx.length % 2 ? sx[h] : (sx[h - 1] + sx[h]) / 2;
    var lon = ds.reduce(function(a, b){ return b.v > a.v ? b : a; });
    if (lon.v >= 300000 && lon.v >= med * 3) them({ id: 'lon', tone: 'trung', diem: 45, ten: 'Khoản chi lớn nhất',
      html: 'Khoản chi lớn nhất ' + nhan + ': <b>' + fmt(Math.round(lon.v)) + '</b> (' + esc(String(lon.it.ghiChu || '').trim() || catTen('chi', lon.it.catId)) + ', ' + dnNgay(lon.ng) + '), gấp ' + Math.round(lon.v / med) + ' lần khoản thường.',
      ct: 'Khoản chi (không gồm Trả nợ, Cho vay) lớn nhất, so với trung vị các khoản chi trong tháng.', pt: soGt(lon.v) + ' ÷ ' + soGt(med) + ' ≈ ' + Math.round(lon.v / med) + ' lần' });
  }
  // 6. chi tiêu quy ra giờ công
  var cfg = gcCauHinh(homNay);
  if (cfg.giaGio > 0 && chi > 0){
    var gio = chi / cfg.giaGio, top = null;
    Object.keys(cur.theoCatThat).forEach(function(id){ if (!top || cur.theoCatThat[id] > top.v) top = { id: id, v: cur.theoCatThat[id] }; });
    them({ id: 'gio', tone: 'trung', diem: 38, ten: 'Chi tiêu theo giờ công',
      html: 'Bạn đã làm <b>' + gcGioChu(gio) + '</b> ' + nhan + ' để trả cho chi tiêu' + (top ? ', riêng <b>' + esc(catTen('chi', top.id)) + '</b> mất ' + gcGioChu(top.v / cfg.giaGio) : '') + '.',
      ct: 'Chi tiêu thật ÷ giá một giờ làm (xem Công cụ → Giờ công).', pt: soGt(chi) + ' ÷ ' + soGt(cfg.giaGio) + ' = ' + gcSoChu(gio) + ' giờ' });
  }
  // 7. thứ trong tuần chi nhiều nhất
  var th = bdTheoThu(mk, homNay), co = th.rows.filter(function(r){ return r.soNgay > 0; });
  if (co.length === 7 && th.tong > 0){
    var mx = co.reduce(function(a, b){ return b.tb > a.tb ? b : a; }), mn = Math.min.apply(null, co.map(function(r){ return r.tb; }));
    if (mn > 0 && mx.tb / mn >= 1.8) them({ id: 'thu', tone: 'trung', diem: 30, ten: 'Thứ chi nhiều nhất',
      html: 'Chi hằng ngày nhiều nhất vào <b>' + mx.ten + '</b> (TB ' + fmt(Math.round(mx.tb)) + '/ngày, gấp ' + gcSoChu(mx.tb / mn) + ' lần ngày ít nhất).',
      ct: 'Trung bình chi hằng ngày theo từng thứ, gộp tháng này và 2 tháng trước (Báo cáo → Biểu đồ → Xu hướng).', pt: mx.ten + ': ' + soGt(mx.tong) + ' ÷ ' + mx.soNgay + ' ngày = ' + soGt(mx.tb) });
  }
  // 8. lời hứa đang giữ lâu / vừa bị phá trong tháng
  (state.data.loiHua || []).forEach(function(l){
    var t = lhTrangThai(l, homNay);
    if (t.trang === 'dang' && t.ngayGiu >= 7 && laNay) them({ id: 'hua' + l.id, tone: 'tot', diem: 48, ten: 'Lời hứa đang giữ',
      html: 'Đã giữ lời hứa "<b>' + esc(l.cau) + '</b>" được <b>' + t.ngayGiu + ' ngày</b> (' + esc(lhQuyTac(l)) + ').', ct: 'Số ngày từ lúc bắt đầu lời hứa tới hôm nay mà chưa vượt mức.', pt: t.ngayGiu + ' ngày kể từ ' + dnNgay(l.tuNgay) });
    else if (t.trang === 'pha' && monthKey(t.pha) === mk) them({ id: 'hua' + l.id, tone: 'xau', diem: 70, ten: 'Lời hứa bị phá',
      html: 'Đã phá lời hứa "<b>' + esc(l.cau) + '</b>" ngày <b>' + dnNgay(t.pha) + '</b> (' + esc(lhQuyTac(l)) + ').', ct: 'Ngày của khoản chi làm vượt mức đã hứa.', pt: 'khoản vượt: ngày ' + dnNgay(t.pha) });
  });
  // 9. nợ gốc tăng / giảm (tháng đã kết thúc)
  if (!laNay){
    var tkn = tongKetThang(mk);
    if (tkn && tkn.no != null && tkn.noTruoc != null && Math.abs(tkn.no - tkn.noTruoc) >= 100000){
      var dn = tkn.no - tkn.noTruoc;
      them({ id: 'no', tone: dn < 0 ? 'tot' : 'xau', diem: dn < 0 ? 50 : 55, ten: 'Nợ gốc',
        html: 'Nợ gốc còn lại <b>' + (dn < 0 ? 'giảm ' : 'tăng ') + fmt(Math.round(Math.abs(dn))) + '</b>, còn <b>' + fmt(Math.round(tkn.no)) + '</b>.', ct: 'Nợ gốc còn lại cuối tháng so với cuối tháng trước (xem Tổng kết tháng).', pt: ptCong([tkn.noTruoc, dn], tkn.no) });
    }
  }
  // 10. số ngày không chi hằng ngày
  var khong = 0, soDuyet = den || cur.soNgay;
  for (var d = 0; d < soDuyet; d++) if (!(cur.chiHN[d] > 0)) khong++;
  if (soDuyet >= 7 && khong >= 5 && soDuyet - khong >= 5) them({ id: 'khong', tone: 'tot', diem: 28, ten: 'Ngày không chi',
    html: 'Có <b>' + khong + ' ngày</b> không chi tiêu hằng ngày ' + nhan + '.', ct: 'Số ngày mà chi hằng ngày (không gồm khoản cố định, vay nợ) bằng 0; chỉ nêu khi tháng có ít nhất 5 ngày có ghi chi (ghi thưa thì con số này không đáng tin).', pt: khong + ' ngày trong ' + soDuyet + ' ngày' });

  out.sort(function(a, b){ return b.diem - a.diem; });
  return giuHet ? out : out.slice(0, DN_TOI_DA);       // giuHet: chỉ để test, lấy mọi câu thay vì 5 câu đầu
}
function dnPercent(x){ return dnPhanTram(x); }

function dnCardHtml(mk){
  if (htAn('baocao', 'diemnhan')) return '';
  var ds = dnTatCa(mk);
  if (!ds.length) return '';
  var laNay = mk === monthKey(todayStr());
  var h = '<div class="card bc-card" id="cardDiemNhan"><h3 class="bc-h"><span>Điều đáng chú ý</span><span class="bc-h-s">' + (laNay ? 'tháng này' : monthLabel(mk).toLowerCase()) + '</span></h3><ul class="dn-ds">';
  ds.forEach(function(x){ h += '<li class="dn-' + x.tone + '"><i aria-hidden="true"></i><span>' + x.html + '</span></li>'; });
  return h + '</ul>' + giaiThichSo(ds.map(function(x){ return { ten: x.ten, ct: x.ct, pt: x.pt }; }), 'Cách tính các số này') + '</div>';
}
