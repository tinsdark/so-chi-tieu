"use strict";
/* ====================================================================
   tongket.js — TỔNG KẾT THÁNG: nhìn lại một tháng ĐÃ KẾT THÚC, ở tab Báo cáo (chọn tháng bằng thanh tháng sẵn có).
   Một thẻ, các dòng: thu - chi, chi hằng ngày so với hạn mức (và số ngày trong mức), chi cố định, trả nợ + nợ gốc còn lại,
   tài sản ròng so với tháng trước, danh mục chi hằng ngày tăng mạnh nhất.
   Sổ tay chỉ có 1 chip "Tổng kết tháng N ›" trong 7 ngày đầu tháng để dẫn sang đây (tkGoiY), không có thẻ riêng.
   Chỉ ĐỌC dữ liệu. Ngày trong mức tính theo hạn mức HIỆN TẠI (xem tnNgayThang, theongay.js): đổi hạn mức rồi xem lại tháng cũ
   thì số ngày này đổi theo. Cần state.js, vayno.js (taiSanRongThang), sotay.js (hanMucHangNgay, catChiHangNgay),
   bieudo.js (bdThang, bdThangTruoc, bdTien), theongay.js (tnNgayThang) load trước.
   ==================================================================== */

var TK_NGAY_GOI_Y = 7;      // chip ở Sổ tay hiện trong N ngày đầu tháng

// số liệu tổng kết tháng mk; null nếu tháng chưa kết thúc hoặc không có giao dịch.
// Tháng TRƯỚC mốc bắt đầu sổ (ngayBatDau) vẫn tổng kết được: giao dịch còn nguyên trong sổ, chỉ riêng TÀI SẢN RÒNG cần số dư
// tính từ mốc nên để null (nợ gốc tính từ lịch vay, không phụ thuộc mốc).
function tongKetThang(mk){
  var hom = todayStr(), start = (state.data.settings.ngayBatDau || '').slice(0, 7);
  if (mk >= monthKey(hom)) return null;
  var cur = bdThang(mk);
  if (!cur.coDl) return null;
  var prevMk = bdThangTruoc(mk), prev = bdThang(prevMk);
  var coSoDu = !start || mk >= start, coSoDuTruoc = !start || prevMk >= start;
  // thu / chi THẬT (không gồm vay nợ, xem bdThang); phần vay nợ tính riêng ở r.vayNo
  var r = { mk: mk, prevMk: prevMk, soNgay: cur.soNgay, thu: cur.tongThuThat, chi: cur.tongChiThat, hangNgay: cur.tongChiHN,
            coDinh: cur.tongChiThat - cur.tongChiHN, traNo: cur.vayNo.traNo, vayNo: cur.vayNo, cap: hanMucHangNgay().cap,
            ngayOk: null, tang: null, no: null, noTruoc: null, rong: null, rongTruoc: null };
  // số ngày chi hằng ngày không vượt mức (không chi gì cũng là trong mức)
  var t = tnNgayThang(mk + '-' + pad2(cur.soNgay));
  if (t) r.ngayOk = t.ngay.filter(function(x){ return x.ok; }).length;
  // danh mục chi hằng ngày tăng mạnh nhất so với tháng trước
  if (prev.coDl){
    Object.keys(cur.theoCat).forEach(function(k){
      if (!catChiHangNgay(k)) return;
      var d = cur.theoCat[k] - num(prev.theoCat[k]);
      if (d > 0.5 && (!r.tang || d > r.tang.d)) r.tang = { id: k, ten: catTen('chi', k), d: d, v: cur.theoCat[k] };
    });
  }
  var th = taiSanRongThang(mk), tp = taiSanRongThang(prevMk);
  r.no = th.no; r.noTruoc = tp.no;
  if (coSoDu) r.rong = th.rong;
  if (coSoDu && coSoDuTruoc) r.rongTruoc = tp.rong;
  return r;
}

function tkDong(nhan, v, phu, lop){
  return '<div class="tk-r"><div class="tk-r1"><span>'+nhan+'</span><b'+(lop ? ' class="'+lop+'"' : '')+'>'+v+'</b></div>'
    + (phu ? '<div class="tk-r2">'+phu+'</div>' : '') + '</div>';
}
function tongKetCardHtml(mk){
  var r = tongKetThang(mk);
  if (!r) return '';
  var cl = r.thu - r.chi, ten = parseInt(mk.slice(5, 7), 10) + '/' + mk.slice(0, 4);
  var h = '<div class="card bc-card" id="cardTongKet"><h3 class="bc-h"><span>Tổng kết tháng '+ten+'</span></h3>'
    + tkDong('Dư thật', (cl > 0 ? '+' : (cl < 0 ? '−' : '')) + bdTien(Math.abs(cl)), 'Thu nhập ' + bdTien(r.thu) + ' · chi tiêu ' + bdTien(r.chi) + ' (chưa tính vay nợ)', cl >= 0 ? 'thu' : 'chi');
  if (r.cap > 0){
    var tt = r.ngayOk != null ? r.ngayOk + '/' + r.soNgay + ' ngày trong mức · ' : '';
    var pct = Math.round(r.hangNgay / r.cap * 100);
    h += tkDong('Chi hằng ngày', bdTien(r.hangNgay), tt + 'hạn mức ' + bdTien(r.cap) + ' (' + pct + '%)', r.hangNgay > r.cap ? 'chi' : '');
  } else {
    h += tkDong('Chi hằng ngày', bdTien(r.hangNgay), 'chưa đặt hạn mức');
  }
  if (r.coDinh > 0.5) h += tkDong('Chi cố định', bdTien(r.coDinh), 'tiền nhà và các danh mục bật "Chi cố định"');
  if (r.traNo > 0.5 || r.no > 0.5 || r.vayNo.vay > 0.5){
    var giam = r.noTruoc != null ? r.noTruoc - r.no : null;
    h += tkDong('Trả nợ (tính riêng)', bdTien(r.traNo), (r.vayNo.vay > 0.5 ? 'vay thêm ' + bdTien(r.vayNo.vay) + ' · ' : '') + 'nợ gốc còn ' + bdTien(r.no)
      + (giam != null && Math.abs(giam) >= 1 ? (giam > 0 ? ', giảm ' : ', tăng ') + bdTien(Math.abs(giam)) + ' so với đầu tháng' : ''));
  }
  if (r.rong != null){
    var dRong = r.rongTruoc != null ? r.rong - r.rongTruoc : null;
    h += tkDong('Tài sản ròng thực tế cuối tháng', bdTien(r.rong),
      dRong != null && Math.abs(dRong) >= 1 ? (dRong > 0 ? '↑ ' : '↓ ') + bdTien(Math.abs(dRong)) + ' so với tháng trước' : '', r.rong < 0 ? 'chi' : '');
  }
  if (r.tang) h += tkDong('Tăng mạnh nhất', esc(r.tang.ten), '+' + bdTien(r.tang.d) + ' so với tháng ' + parseInt(r.prevMk.slice(5, 7), 10) + ' (chi hằng ngày)');
  return h + tkGiaiThichHtml(r) + '</div>';
}
// cách tính từng dòng của thẻ, có phép tính bằng số thật của tháng đó (giaiThichSo ở state.js)
function tkGiaiThichHtml(r){
  var ds = [], cl = r.thu - r.chi;
  ds.push({ ten: 'Dư thật', ct: 'Thu nhập − chi tiêu của tháng, chưa tính vay nợ.', pt: ptCong([r.thu, -r.chi], cl) });
  if (r.cap > 0) ds.push({ ten: 'Chi hằng ngày', ct: 'Chi của các danh mục tiêu hằng ngày so với tổng hạn mức của chúng. Một ngày "trong mức" khi chi hôm đó không vượt (hạn mức còn lại đầu ngày ÷ số ngày còn lại).',
    pt: soGt(r.hangNgay) + ' ÷ ' + soGt(r.cap) + ' = ' + Math.round(r.hangNgay / r.cap * 100) + '%' + (r.ngayOk != null ? '; ' + r.ngayOk + '/' + r.soNgay + ' ngày trong mức' : '') });
  if (r.coDinh > 0.5) ds.push({ ten: 'Chi cố định', ct: 'Chi tiêu − chi hằng ngày.', pt: ptCong([r.chi, -r.hangNgay], r.coDinh) });
  if (r.traNo > 0.5 || r.no > 0.5 || r.vayNo.vay > 0.5){
    ds.push({ ten: 'Trả nợ (tính riêng)', ct: 'Tổng các lần trả nợ trong tháng (gồm tất toán). Nợ gốc còn lại tính từ lịch vay tới cuối tháng.',
      pt: 'trả ' + soGt(r.traNo) + (r.vayNo.vay > 0.5 ? ' · vay thêm ' + soGt(r.vayNo.vay) : '') + ' · nợ gốc cuối tháng ' + soGt(r.no) + (r.noTruoc != null ? ' (đầu tháng ' + soGt(r.noTruoc) + ')' : '') });
  }
  if (r.rong != null) ds.push({ ten: 'Tài sản ròng thực tế cuối tháng', ct: 'Số dư các ví + cho vay chưa thu − nợ gốc còn lại, theo số đã ghi.',
    pt: soGt(r.rong) + (r.rongTruoc != null ? ' (tháng trước ' + soGt(r.rongTruoc) + ' → ' + (r.rong - r.rongTruoc >= 0 ? '+' : '−') + soGt(Math.abs(r.rong - r.rongTruoc)) + ')' : '') });
  if (r.tang) ds.push({ ten: 'Tăng mạnh nhất', ct: 'Danh mục chi hằng ngày có mức tăng lớn nhất so với tháng trước.', pt: soGt(r.tang.v) + ' − ' + soGt(r.tang.v - r.tang.d) + ' = +' + soGt(r.tang.d) });
  return giaiThichSo(ds, 'Cách tính các số này');
}

// tháng cần gợi ý ở Sổ tay: tháng trước, trong N ngày đầu tháng, và tháng đó có tổng kết; '' nếu không
function tkGoiY(homNay){
  homNay = homNay || todayStr();
  if (parseInt(homNay.slice(8, 10), 10) > TK_NGAY_GOI_Y) return '';
  var mk = bdThangTruoc(monthKey(homNay));
  return tongKetThang(mk) ? mk : '';
}
