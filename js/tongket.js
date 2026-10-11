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

// số liệu tổng kết tháng mk; null nếu tháng chưa kết thúc, trước mốc bắt đầu sổ, hoặc không có giao dịch
function tongKetThang(mk){
  var hom = todayStr(), start = (state.data.settings.ngayBatDau || '').slice(0, 7);
  if (mk >= monthKey(hom) || (start && mk < start)) return null;
  var cur = bdThang(mk);
  if (!cur.coDl) return null;
  var prevMk = bdThangTruoc(mk), coTruoc = !start || prevMk >= start, prev = bdThang(prevMk);
  var r = { mk: mk, prevMk: prevMk, soNgay: cur.soNgay, thu: cur.tongThu, chi: cur.tongChi, hangNgay: cur.tongChiHN,
            coDinh: cur.tongChi - cur.tongChiHN, traNo: num(cur.theoCat.traNo), cap: hanMucHangNgay().cap,
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
  var th = taiSanRongThang(mk);
  r.no = th.no; r.rong = th.rong;
  if (coTruoc){ var tp = taiSanRongThang(prevMk); r.noTruoc = tp.no; r.rongTruoc = tp.rong; }
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
    + tkDong('Thu − Chi', (cl > 0 ? '+' : (cl < 0 ? '−' : '')) + bdTien(Math.abs(cl)), 'Thu ' + bdTien(r.thu) + ' · chi ' + bdTien(r.chi), cl >= 0 ? 'thu' : 'chi');
  if (r.cap > 0){
    var tt = r.ngayOk != null ? r.ngayOk + '/' + r.soNgay + ' ngày trong mức · ' : '';
    var pct = Math.round(r.hangNgay / r.cap * 100);
    h += tkDong('Chi hằng ngày', bdTien(r.hangNgay), tt + 'hạn mức ' + bdTien(r.cap) + ' (' + pct + '%)', r.hangNgay > r.cap ? 'chi' : '');
  } else {
    h += tkDong('Chi hằng ngày', bdTien(r.hangNgay), 'chưa đặt hạn mức');
  }
  if (r.coDinh > 0.5) h += tkDong('Chi cố định', bdTien(r.coDinh), 'tiền nhà, trả nợ và các khoản bật "Khoản cố định"');
  if (r.traNo > 0.5 || r.no > 0.5){
    var giam = r.noTruoc != null ? r.noTruoc - r.no : null;
    h += tkDong('Trả nợ', bdTien(r.traNo), 'nợ gốc còn ' + bdTien(r.no)
      + (giam != null && Math.abs(giam) >= 1 ? (giam > 0 ? ', giảm ' : ', tăng ') + bdTien(Math.abs(giam)) + ' so với đầu tháng' : ''));
  }
  var dRong = r.rongTruoc != null ? r.rong - r.rongTruoc : null;
  h += tkDong('Tài sản ròng cuối tháng', bdTien(r.rong),
    dRong != null && Math.abs(dRong) >= 1 ? (dRong > 0 ? '↑ ' : '↓ ') + bdTien(Math.abs(dRong)) + ' so với tháng trước' : '', r.rong < 0 ? 'chi' : '');
  if (r.tang) h += tkDong('Tăng mạnh nhất', esc(r.tang.ten), '+' + bdTien(r.tang.d) + ' so với tháng ' + parseInt(r.prevMk.slice(5, 7), 10) + ' (chi hằng ngày)');
  return h + '</div>';
}

// tháng cần gợi ý ở Sổ tay: tháng trước, trong N ngày đầu tháng, và tháng đó có tổng kết; '' nếu không
function tkGoiY(homNay){
  homNay = homNay || todayStr();
  if (parseInt(homNay.slice(8, 10), 10) > TK_NGAY_GOI_Y) return '';
  var mk = bdThangTruoc(monthKey(homNay));
  return tongKetThang(mk) ? mk : '';
}
