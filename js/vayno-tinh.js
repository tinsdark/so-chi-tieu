"use strict";
/* ====================================================================
   vayno-tinh.js — LOGIC THUẦN của Vay - Nợ (không chạm DOM): nhãn hình thức vay, lịch trả nợ (tinhLichTraNo, laiNgamThang, laiThucNam),
   trạng thái từng kỳ, tiến độ, dư nợ / phải thu theo ngày, tài sản ròng thực tế và dự kiến, dự trù thu chi theo danh mục từng tháng,
   số dư hiện tại có cộng khoản đến hạn chưa ghi. Phần giao diện và xử lý hành động của tab nằm ở vayno.js.
   Cần state.js load trước; nạp TRƯỚC vayno.js (và mọi file khác đều gọi các hàm ở đây lúc chạy, không lúc nạp).
   ==================================================================== */

var LOAI_VAY_LABEL = { ngan_hang:'Ngân hàng', vi:'Ví', ban_be:'Bạn bè', nguoi_than:'Người thân' };
var CACH_GOC_LABEL = { deu:'Gốc chia đều + phí cố định', giam:'Lãi trên dư nợ giảm dần' };
var HINH_THUC_LABEL = { tra_1_lan:'Trả 1 lần', khong_lai:'Không lãi suất', co_lai:'Có lãi suất', tra_co_dinh:'Trả cố định/tháng', lai_goc_cuoi:'Lãi hằng tháng, gốc cuối kỳ', goc_deu:'Gốc đều, lãi giảm dần' };

function monthsBetweenMk(a, b){ var x = a.split('-'), y = b.split('-'); return (parseInt(y[0], 10) - parseInt(x[0], 10)) * 12 + (parseInt(y[1], 10) - parseInt(x[1], 10)); }
function monthKeyAdd(mk, n){
  var p = mk.split('-'); var y = parseInt(p[0],10), m = parseInt(p[1],10) + n;
  while (m > 12){ m -= 12; y++; }
  while (m < 1){ m += 12; y--; }
  return y + '-' + pad2(m);
}
function loanIsActive(loan){ return loan.trangThai !== 'da_tra_het'; }
// khoản cho vay đã xong (thu đủ, hoặc đã xóa nợ phần còn lại) -> vào mục "Đã xong", không hiện ở danh sách chính
function choVayDaXong(c){ return !!c.tatToan || c.trangThai === 'da_thu_du' || conLaiPhaiThu(c) <= 0; }
// số ngày của tháng mk (YYYY-MM)
function daysInMonth(mk){ var p = mk.split('-'); return new Date(parseInt(p[0],10), parseInt(p[1],10), 0).getDate(); }
// ghép tháng mk + "ngày trong tháng" (1-31) -> "YYYY-MM-DD", tự co về ngày cuối tháng
// nếu tháng đó không có đủ ngày (vd ngày 31 rơi vào tháng 2/4/6/9/11)
function ngayTraCuaKy(mk, ngayTrongThang){
  var n = Math.max(1, Math.min(31, num(ngayTrongThang) || 1));
  return mk + '-' + pad2(Math.min(n, daysInMonth(mk)));
}
// Lãi suất NGẦM mỗi tháng của khoản "trả cố định": vay goc, trả đều tra mỗi tháng trong n tháng.
// Giải pmt(r) = goc·r / (1 − (1+r)^−n) = tra bằng chia đôi khoảng [0, 100%/tháng]. Trả tổng ≤ gốc thì không có lãi -> 0.
function laiNgamThang(goc, tra, n){
  goc = num(goc); tra = num(tra); n = Math.round(num(n));
  if (!(goc > 0) || !(n > 0) || tra * n <= goc + 0.5) return 0;
  var lo = 0, hi = 1;
  for (var i = 0; i < 80; i++){
    var r = (lo + hi) / 2, pmt = r < 1e-12 ? goc / n : goc * r / (1 - Math.pow(1 + r, -n));
    if (pmt < tra) lo = r; else hi = r;
  }
  return (lo + hi) / 2;
}
// lãi suất thực %/năm (= lãi ngầm tháng × 12) của khoản trả cố định; null nếu không phải loại này hoặc không có lãi
function laiThucNam(loan){
  if (!loan || loan.hinhThuc !== 'tra_co_dinh') return null;
  var r = laiNgamThang(loan.soTienGoc, loan.soTienTraThang, loan.soThangVay);
  return r > 0 ? r * 1200 : null;
}
function vnSoChuLai(x){ return (Math.round(x * 10) / 10).toString().replace('.', ','); }
// trả về lịch trả từng tháng: [{mk, ngayTra, goc, lai, tongTra, duNoConLai}], mọi số đã làm tròn về đồng.
// Số trả mỗi kỳ làm tròn trước (nên khoản trả đều vẫn đều đúng một con số), gốc làm tròn, lãi = số trả − gốc; kỳ cuối trả hết gốc còn lại
// nên tổng gốc đúng bằng số vay (1.000.000 / 3 kỳ = 333.333 + 333.333 + 333.334).
function tinhLichTraNo(loan){
  var sch = tinhLichTraNoTho(loan);
  var du = Math.round(num(loan.soTienGoc));
  for (var i = 0; i < sch.length; i++){
    var k = sch[i], tt = Math.round(k.tongTra), g = (i === sch.length - 1) ? du : Math.min(du, Math.round(k.goc));
    k.goc = g; k.lai = Math.max(0, tt - g); k.tongTra = g + k.lai;
    du -= g; k.duNoConLai = Math.max(0, du);
  }
  return sch;
}
// lịch chưa làm tròn (số thực)
function tinhLichTraNoTho(loan){
  var sch = [];
  var startMk = monthKey(loan.ngayVay || todayStr());
  var goc0 = num(loan.soTienGoc);
  // "ngày trả hàng tháng" là field nhập tay riêng (1-31), tách biệt với ngày vay;
  // khoản cũ chưa có thì tạm lấy ngày-trong-tháng của ngày vay làm mặc định
  var ngayTrongThang = num(loan.ngayTraHangThang) || (loan.ngayVay ? parseInt(loan.ngayVay.slice(8,10),10) : 1);
  if (loan.hinhThuc === 'tra_1_lan'){
    var mkDue = loan.ngayDaoHan ? monthKey(loan.ngayDaoHan) : monthKeyAdd(startMk, num(loan.soThangVay) || 0);
    var ngayTraDue = loan.ngayDaoHan || ngayTraCuaKy(mkDue, ngayTrongThang);
    // có nhập lãi suất thì lãi ĐƠN: gốc × lãi %/năm × số tháng ÷ 12 (số tháng = kỳ hạn nhập, không thì tính từ ngày vay tới tháng đáo hạn)
    var thangDao = num(loan.soThangVay) > 0 ? num(loan.soThangVay) : Math.max(0, monthsBetweenMk(startMk, mkDue));
    var laiMot = goc0 * numNonNeg(loan.laiSuatNam) / 100 * thangDao / 12;
    sch.push({ mk: mkDue, ngayTra: ngayTraDue, goc: goc0, lai: laiMot, tongTra: goc0 + laiMot, duNoConLai: 0 });
    return sch;
  }
  // lai_goc_cuoi: mỗi tháng chỉ trả lãi (gốc × lãi %/năm ÷ 12), kỳ cuối trả thêm toàn bộ gốc. Không lãi suất thì chỉ có kỳ cuối (trả gốc).
  if (loan.hinhThuc === 'lai_goc_cuoi'){
    var nL = Math.max(1, num(loan.soThangVay)), laiThangL = goc0 * numNonNeg(loan.laiSuatNam) / 100 / 12;
    for (var u = (laiThangL > 0 ? 1 : nL); u <= nL; u++){
      var mkU = monthKeyAdd(startMk, u), cuoiU = u === nL;
      sch.push({ mk: mkU, ngayTra: ngayTraCuaKy(mkU, ngayTrongThang), goc: cuoiU ? goc0 : 0, lai: laiThangL, tongTra: (cuoiU ? goc0 : 0) + laiThangL, duNoConLai: cuoiU ? 0 : goc0 });
    }
    return sch;
  }
  var n = Math.max(1, num(loan.soThangVay));
  // trả cố định/tháng (trả góp điện máy, vay qua app, vay người quen): chỉ biết gốc, số tiền trả mỗi tháng
  // và số kỳ, không biết lãi suất. Phần chênh (tổng trả − gốc) coi là lãi, chia đều mỗi kỳ; gốc mỗi kỳ = gốc/n.
  // Tổng trả < gốc (nhập sai) thì không có lãi âm: coi như không lãi, chia đều gốc.
  // loan.cachGoc = 'giam' (vay tiêu dùng kiểu FE Credit): lãi tính trên dư nợ còn lại với lãi suất NGẦM (laiNgamThang), gốc mỗi kỳ = số trả − lãi,
  // kỳ cuối trả hết dư nợ. Còn lại ('deu', mặc định, kiểu SPayLater): gốc chia đều + phí cố định như trên.
  if (loan.hinhThuc === 'tra_co_dinh' && loan.cachGoc === 'giam' && laiNgamThang(goc0, loan.soTienTraThang, n) > 0){
    var rNgam = laiNgamThang(goc0, loan.soTienTraThang, n), traG = num(loan.soTienTraThang), duG2 = goc0;
    for (var q = 1; q <= n; q++){
      var laiQ = duG2 * rNgam, gocQ = q === n ? duG2 : Math.min(duG2, Math.max(0, traG - laiQ));
      duG2 -= gocQ;
      var mkQ = monthKeyAdd(startMk, q);
      sch.push({ mk: mkQ, ngayTra: ngayTraCuaKy(mkQ, ngayTrongThang), goc: gocQ, lai: laiQ, tongTra: gocQ + laiQ, duNoConLai: Math.max(0, duG2) });
    }
    return sch;
  }
  if (loan.hinhThuc === 'tra_co_dinh'){
    var tra = num(loan.soTienTraThang), gocKy = goc0 / n, laiKy = Math.max(0, tra - gocKy), duNoCD = goc0;
    for (var c=1;c<=n;c++){
      duNoCD -= gocKy;
      var mkC = monthKeyAdd(startMk,c);
      sch.push({ mk: mkC, ngayTra: ngayTraCuaKy(mkC, ngayTrongThang), goc: gocKy, lai: laiKy, tongTra: gocKy + laiKy, duNoConLai: Math.max(0,duNoCD) });
    }
    return sch;
  }
  if (loan.hinhThuc === 'khong_lai'){
    var gocThang = goc0 / n, duNo = goc0;
    for (var i=1;i<=n;i++){
      duNo -= gocThang;
      var mkI = monthKeyAdd(startMk,i);
      sch.push({ mk: mkI, ngayTra: ngayTraCuaKy(mkI, ngayTrongThang), goc: gocThang, lai: 0, tongTra: gocThang, duNoConLai: Math.max(0,duNo) });
    }
    return sch;
  }
  // goc_deu (form khoản vay và tab Mô phỏng đều dùng) — mỗi kỳ trả gốc bằng nhau, lãi tính trên dư nợ còn lại nên giảm dần
  if (loan.hinhThuc === 'goc_deu'){
    var rg = num(loan.laiSuatNam) / 12 / 100, gocG = goc0 / n, duG = goc0;
    for (var g=1;g<=n;g++){
      var laiG = duG * rg;
      duG -= gocG;
      var mkG = monthKeyAdd(startMk,g);
      sch.push({ mk: mkG, ngayTra: ngayTraCuaKy(mkG, ngayTrongThang), goc: gocG, lai: laiG, tongTra: gocG + laiG, duNoConLai: Math.max(0,duG) });
    }
    return sch;
  }
  // co_lai — trả đều (annuity), lãi %/năm quy đổi tháng
  var r = num(loan.laiSuatNam) / 12 / 100;
  var duNo2 = goc0;
  if (r <= 0){
    var gocThang2 = goc0 / n;
    for (var j=1;j<=n;j++){
      duNo2 -= gocThang2;
      var mkJ = monthKeyAdd(startMk,j);
      sch.push({ mk: mkJ, ngayTra: ngayTraCuaKy(mkJ, ngayTrongThang), goc: gocThang2, lai: 0, tongTra: gocThang2, duNoConLai: Math.max(0,duNo2) });
    }
    return sch;
  }
  var pow = Math.pow(1+r, n);
  var pmt = goc0 * r * pow / (pow - 1);
  for (var k=1;k<=n;k++){
    var laiK = duNo2 * r, gocK = pmt - laiK;
    duNo2 -= gocK;
    var mkK = monthKeyAdd(startMk,k);
    sch.push({ mk: mkK, ngayTra: ngayTraCuaKy(mkK, ngayTrongThang), goc: gocK, lai: laiK, tongTra: pmt, duNoConLai: Math.max(0,duNo2) });
  }
  return sch;
}
// còn phải thu của 1 khoản cho vay. Đã tất toán = phần còn lại coi như không đòi
// được (cho luôn / mất) -> không còn nằm trong "sẽ thu được" nữa.
// daBo = các lần bỏ MỘT PHẦN (không đòi nữa, khoản vẫn mở): [{soTien, ngay}]. Khác tatToan là bỏ hết phần còn lại và đóng khoản.
function tongDaBo(loan, d){
  var s = 0;
  (loan.daBo || []).forEach(function(x){ if (!d || !x.ngay || x.ngay <= d) s += num(x.soTien); });
  return s;
}
// soBo so với phần còn phải thu: 'qua-so' (lớn hơn, không hợp lệ) | 'mot-phan' (chỉ ghi daBo) | 'het' (tất toán cả khoản)
function loaiBoChoVay(c, soBo){
  var cl = conLaiPhaiThu(c);
  if (soBo > cl + 0.01) return 'qua-so';
  return soBo < cl - 0.01 ? 'mot-phan' : 'het';
}
function choVayBoMotPhan(c, soBo){ c.daBo = (c.daBo || []).concat([{ soTien: soBo, ngay: todayStr() }]); }
// hoàn lần bỏ gần nhất; trả về lần vừa hoàn (null nếu không có gì để hoàn)
function choVayHoanBo(c){
  if (c.tatToan || !(c.daBo || []).length) return null;
  var lan = c.daBo.pop();
  choVayCapNhatTrangThai(c);
  return lan;
}
// ghi số tiền THỰC THU của khoản cho vay: cộng daThu + giao dịch thu "Thu hồi cho vay" ở Sổ tay (có ref gắn khoản).
// dongKhoan = tất toán: phần thiếu coi như xóa nợ (tatToan) và đóng khoản. Trả về phần thiếu (>0 nếu còn).
function choVayGhiThu(c, so, ngay, viId, dongKhoan){
  var thieu = conLaiPhaiThu(c) - so;
  c.daThu = num(c.daThu) + so;
  journalAddRef(ngay, c.id, 'thuHoiChoVay', so, 'Thu hồi cho vay: ' + c.ten, { rid: 't' + Date.now().toString(36), walletId: viId });
  if (dongKhoan && thieu > 0.01) c.tatToan = { soTien: thieu, ngay: ngay };
  choVayCapNhatTrangThai(c);
  invalidateBalanceCache();
  return thieu;
}
// trạng thái khoản cho vay luôn suy ra từ số liệu: đóng khi đã xóa nợ phần còn lại hoặc thu + xóa nợ đủ số cho vay
function choVayCapNhatTrangThai(c){
  c.trangThai = (c.tatToan || conLaiPhaiThu(c) <= 0.01) ? 'da_thu_du' : 'dang_cho';
}
// lời nhắc khi SỬA số cho vay làm đổi tình trạng khoản (hiện trong hộp xác nhận); '' nếu không có gì đáng nói
function canhBaoSuaChoVay(c, soTienMoi){
  if (!c || num(c.soTien) === soTienMoi) return '';
  var t = Object.assign({}, c, { soTien: soTienMoi });
  var xongTruoc = choVayDaXong(c), xongSau = !!t.tatToan || conLaiPhaiThu(t) <= 0.01;
  var daTra = num(c.daThu) + tongDaBo(c), ghi = [];
  ghi.push('Số cho vay đổi từ ' + fmt(Math.round(num(c.soTien))) + ' thành ' + fmt(Math.round(soTienMoi)) + '.');
  if (c.tatToan) ghi.push('Khoản này đã xóa nợ ' + fmt(Math.round(num(c.tatToan.soTien))) + ' theo số cũ. Đổi số cho vay không tự đổi phần xóa nợ, nên số thu + xóa nợ sẽ lệch số mới. Muốn chính xác thì bấm "Hủy xóa nợ" trước, sửa số, rồi xóa nợ lại.');
  else if (soTienMoi < daTra - 0.01) ghi.push('Số mới nhỏ hơn số đã thu + đã xóa nợ (' + fmt(Math.round(daTra)) + '): coi như thu vượt, còn phải thu về 0.');
  if (xongTruoc && !xongSau) ghi.push('Khoản đang ở mục "Đã xong" sẽ mở lại, còn phải thu ' + fmt(Math.round(conLaiPhaiThu(t))) + '.');
  else if (!xongTruoc && xongSau && !c.tatToan) ghi.push('Khoản sẽ đóng và chuyển vào mục "Đã xong".');
  ghi.push('Giao dịch "Cho vay" ở Sổ tay được ghi lại theo số mới.');
  return ghi.length > 2 ? ghi.join('\n\n') : '';
}
// bỏ phần xóa nợ hết (tatToan); trả về false nếu khoản không có gì để hủy
function choVayHuyXoaNo(c){
  if (!c || !c.tatToan) return false;
  c.tatToan = null;
  choVayCapNhatTrangThai(c);
  return true;
}
function conLaiPhaiThu(loan){
  if (loan.tatToan) return 0;
  return Math.max(0, num(loan.soTien) - num(loan.daThu) - tongDaBo(loan));
}
// số ngày quá hạn của 1 khoản cho vay (0 nếu chưa tới hạn / đã thu đủ)
function soNgayQuaHan(loan){
  if (!loan.ngayDuKienThu || loan.trangThai === 'da_thu_du') return 0;
  if (conLaiPhaiThu(loan) <= 0) return 0;
  var d = daysBetween(loan.ngayDuKienThu, todayStr());
  return d > 0 ? d : 0;
}
// tháng dự kiến trả hết nợ (mk của dòng cuối lịch trả)
function thangDuKienHetNo(loan){
  var sch = tinhLichTraNo(loan);
  return sch.length ? sch[sch.length-1].mk : null;
}

/* ====================================================================
   SẮP ĐẾN HẠN / QUÁ HẠN — gộp chung Cho vay (ngày dự kiến thu) và Vay-Nợ
   phải trả (ngày trả của kỳ tới), dùng cho card nhắc ở đầu tab + badge nav.
   soNgay: dương = còn mấy ngày tới hạn, 0 = đúng hôm nay, âm = đã quá hạn.
   ==================================================================== */
function danhSachSapDenHan(nNgay){
  nNgay = nNgay || 7;
  var out = [];
  (state.data.vayNo.choVay||[]).forEach(function(c){
    if (c.tatToan || c.trangThai === 'da_thu_du') return;
    if (!c.ngayDuKienThu || conLaiPhaiThu(c) <= 0) return;
    var soNgay = daysBetween(todayStr(), c.ngayDuKienThu);
    if (soNgay <= nNgay) out.push({ loai: 'choVay', id: c.id, ten: c.ten, ngay: c.ngayDuKienThu, soNgay: soNgay, soTien: conLaiPhaiThu(c) });
  });
  (state.data.vayNo.vayNoPhaiTra||[]).forEach(function(v){
    if (!loanIsActive(v)) return;
    var td = tienDoTraNo(v), ky = td.kyTiepTheo;
    if (!ky) return;
    var soNgay = daysBetween(todayStr(), ky.ngayTra), qh = kyQuaHan(v);
    // trễ từ 2 kỳ trở lên: số tiền là tổng các kỳ đang trễ (kỳ cũ nhất thôi là ghi thiếu)
    if (soNgay <= nNgay) out.push({ loai: 'vayNo', id: v.id, ten: v.ten, ngay: ky.ngayTra, soNgay: soNgay,
      soTien: qh.n >= 2 ? qh.tong : conThieuKy(v, td.kyTiepIdx, td.sch), soKy: qh.n >= 2 ? qh.n : 0 });
  });
  out.sort(function(a,b){ return a.soNgay - b.soNgay; });
  return out;
}
// các kỳ ĐÃ QUA HẠN (ngày trả trước homNay) mà chưa đóng và còn thiếu tiền: { n, tong (tổng còn thiếu), cuNhat (hạn kỳ cũ nhất) }
// để thẻ khoản vay / danh sách sắp đến hạn ghi đủ số đang trễ, không chỉ kỳ cũ nhất
function kyQuaHan(loan, homNay){
  homNay = homNay || todayStr();
  var sch = tinhLichTraNo(loan), r = { n: 0, tong: 0, cuNhat: null };
  if (loan.tatToan || !loanIsActive(loan)) return r;
  sch.forEach(function(row, i){
    if (row.ngayTra >= homNay || kyDaDong(loan, i)) return;
    var thieu = conThieuKy(loan, i, sch);
    if (thieu <= 0) return;
    r.n++; r.tong += thieu;
    if (!r.cuNhat || row.ngayTra < r.cuNhat) r.cuNhat = row.ngayTra;
  });
  return r;
}

/* ====================================================================
   TRẢ NỢ THEO TỪNG KỲ
   loan.traNo = [{ rid, ky, mk, soTien, ngay, dongKy, truocKhiDungApp? }]

   TÁCH HẲN 2 khái niệm, vì số tiền KHÔNG BAO GIỜ phân biệt được 2 ca này:
     - đã ghi nhận tiền : có tiền vào kỳ đó. 1 kỳ trả nhiều lần thì cộng dồn.
     - kỳ ĐÃ ĐÓNG      : dongKy = true, coi như thanh toán xong kỳ đó.
   Thiếu 50k ở kỳ 500k là trả dở, thiếu 50k ở kỳ 10tr là xong kỳ — nên app
   không đoán, mà hỏi người dùng đúng lúc trả thiếu (xem vnGhiNhanTra).

   Kỳ đã đóng: phần thiếu chuyển sang mục "chênh lệch", KHÔNG nằm trong dư nợ
   (tiền thực tế đã ghi ở Sổ tay rồi).
   Kỳ trả dở : phần còn thiếu VẪN nằm trong dư nợ và trong dự trù tháng đó.
   ==================================================================== */
function kyRecords(loan, kyIdx){
  return (loan.traNo || []).filter(function(r){ return num(r.ky) === num(kyIdx); });
}
function kyDaGhiNhan(loan, kyIdx){ return kyRecords(loan, kyIdx).length > 0; }
// kỳ đã đóng: chỉ cần 1 lần trả trong kỳ được đánh dấu đóng kỳ
function kyDaDong(loan, kyIdx){
  return kyRecords(loan, kyIdx).some(function(r){ return !!r.dongKy; });
}
// tổng tiền thực tế đã trả cho kỳ kyIdx
function soTienTraKy(loan, kyIdx){
  var s = 0;
  kyRecords(loan, kyIdx).forEach(function(r){ s += num(r.soTien); });
  return s;
}
// số còn thiếu của 1 kỳ so với lịch (>= 0)
function conThieuKy(loan, kyIdx, sch){
  sch = sch || tinhLichTraNo(loan);
  var can = sch[kyIdx] ? num(sch[kyIdx].tongTra) : 0;
  return Math.max(0, can - soTienTraKy(loan, kyIdx));
}
// trạng thái 1 kỳ: 'chua' | 'motphan' | 'du' | 'thieu'
//   motphan = có tiền vào nhưng CHƯA đóng kỳ  -> vẫn là kỳ đang chờ
//   thieu   = đã đóng kỳ nhưng tiền ít hơn lịch -> chênh lệch ghi riêng
function kyStatus(loan, kyIdx, sch){
  sch = sch || tinhLichTraNo(loan);
  var can = sch[kyIdx] ? num(sch[kyIdx].tongTra) : 0;
  if (!kyDaGhiNhan(loan, kyIdx)) return { trangThai: 'chua', da: 0, can: can, lech: -can, dong: false };
  var da = soTienTraKy(loan, kyIdx);
  var lech = da - can;
  if (!kyDaDong(loan, kyIdx)) return { trangThai: 'motphan', da: da, can: can, lech: lech, dong: false };
  return { trangThai: (lech >= -1 ? 'du' : 'thieu'), da: da, can: can, lech: lech, dong: true };
}
// tiến độ trả nợ: đếm kỳ ĐÃ ĐÓNG. Kỳ tiếp theo = kỳ chưa đóng đầu tiên, có thể
// là kỳ đang trả dở (trả tiếp sẽ cộng dồn vào đúng kỳ đó).
function tienDoTraNo(loan){
  var sch = tinhLichTraNo(loan);
  var daTraKy = 0, kyTiepTheo = null, kyTiepIdx = -1;
  for (var i=0;i<sch.length;i++){
    if (kyDaDong(loan, i)) daTraKy++;
    else if (!kyTiepTheo){ kyTiepTheo = sch[i]; kyTiepIdx = i; }
  }
  return { tongKy: sch.length, daTraKy: daTraKy, kyTiepTheo: kyTiepTheo, kyTiepIdx: kyTiepIdx, sch: sch };
}
// tổng còn phải trả (gồm lãi) = các kỳ CHƯA ĐÓNG, đã trừ phần đã trả vào kỳ dở.
// Tất toán -> 0.
function soTienConLaiPhaiTra(loan){
  if (loan.tatToan) return 0;
  var sch = tinhLichTraNo(loan);
  var s = 0;
  for (var i = 0; i < sch.length; i++){
    if (kyDaDong(loan, i)) continue;
    s += conThieuKy(loan, i, sch);
  }
  return s;
}
// gốc còn lại sau kỳ đã đóng gần nhất (chưa đóng kỳ nào = toàn bộ gốc). Khác
// soTienConLaiPhaiTra: số đó cộng cả lãi các kỳ tương lai, còn tất toán sớm
// thực tế chỉ trả gốc còn lại + lãi tới ngày tất toán -> thường THẤP hơn.
function gocConLai(loan){
  var sch = tinhLichTraNo(loan), g = num(loan.soTienGoc);
  for (var i = 0; i < sch.length; i++){
    if (kyDaDong(loan, i)) g = sch[i].duNoConLai;
  }
  return g;
}
// tổng chênh lệch (âm = trả thiếu so với lịch) của các kỳ ĐÃ ĐÓNG. Kỳ đang trả
// dở không tính vào đây — phần thiếu của nó vẫn đang nằm ở dư nợ.
function tongLechTraNo(loan){
  var sch = tinhLichTraNo(loan), s = 0;
  for (var i=0;i<sch.length;i++){
    if (!kyDaDong(loan, i)) continue;
    if (kyRecords(loan, i).every(function(r){ return r.truocKhiDungApp; })) continue;
    s += soTienTraKy(loan, i) - num(sch[i].tongTra);
  }
  return s;
}
// dự trù trả nợ tháng mk: kỳ đã đóng thì bỏ qua, kỳ trả dở chỉ dự trù PHẦN CÒN
// THIẾU (phần đã trả nằm trong Sổ tay rồi, dự trù cả kỳ nữa là tính 2 lần).
// Kỳ QUÁ HẠN mà chưa đóng dồn vào tháng hiện tại (giống tongThuHoiThang): để ở tháng cũ
// là khoản phải trả đó biến mất khỏi mọi dự báo.
// loan.mpTatToanMk: chỉ tab Mô phỏng đặt — từ tháng này trở đi khoản vay đã tất toán, không còn kỳ nào.
function tongTraNoThang(mk){
  var curMk = monthKey(todayStr());
  var s = 0;
  (state.data.vayNo.vayNoPhaiTra||[]).forEach(function(loan){
    if (!loanIsActive(loan)) return;
    var sch = tinhLichTraNo(loan);
    sch.forEach(function(row, idx){
      if (loan.mpTatToanMk && row.mk >= loan.mpTatToanMk) return;
      if (kyDaDong(loan, idx)) return;
      var eff = (row.mk < curMk) ? curMk : row.mk;
      if (eff !== mk) return;
      s += conThieuKy(loan, idx, sch);
    });
  });
  return s;
}
// dự trù thu hồi cho vay tháng mk. Khoản đã QUÁ HẠN mà chưa thu được thì dồn vào
// tháng hiện tại — để quá hạn ở tháng cũ là coi như khoản tiền đó bốc hơi khỏi dự báo.
function tongThuHoiThang(mk){
  var curMk = monthKey(todayStr());
  var s = 0;
  (state.data.vayNo.choVay||[]).forEach(function(loan){
    if (loan.trangThai === 'da_thu_du') return;
    var cl = conLaiPhaiThu(loan);
    if (cl <= 0 || !loan.ngayDuKienThu) return;       // chưa có ngày dự kiến thu thì không đoán là thu về lúc nào
    var duKien = monthKey(loan.ngayDuKienThu);
    var eff = (duKien < curMk) ? curMk : duKien;
    if (eff === mk) s += cl;
  });
  return s;
}

/* ====================================================================
   TÀI SẢN RÒNG tại 1 ngày (tab Báo cáo) = tiền trong các ví + cho vay chưa thu − nợ GỐC còn lại.
   Tính lại theo NGÀY (không dùng số hiện tại) để vẽ được lịch sử từng tháng:
   - cho vay: số cho vay − các lần thu hồi (ref thuHoiChoVay ở Sổ tay) tới ngày đó; đã tất toán trước ngày đó = 0
   - vay: gốc − phần GỐC của các lần trả (traNo[].ngay) tới ngày đó, tách gốc theo tỉ lệ goc/tongTra của kỳ;
     tất toán trước ngày đó = 0. Lãi tương lai không tính (chưa phải nợ).
   ==================================================================== */
function _thuHoiTheoKhoan(){
  var m = {};
  Object.keys(state.data.journal).forEach(function(d){
    (state.data.journal[d].refs || []).forEach(function(r){
      if (r.loai !== 'thuHoiChoVay') return;
      (m[r.loanId] = m[r.loanId] || []).push({ ngay: d, soTien: num(r.soTien) });
    });
  });
  return m;
}
function phaiThuTaiNgay(loan, d, thuHoi){
  if (!loan.ngayChoVay || loan.ngayChoVay > d) return 0;
  if (loan.tatToan && loan.tatToan.ngay && loan.tatToan.ngay <= d) return 0;
  var da = 0;
  ((thuHoi || _thuHoiTheoKhoan())[loan.id] || []).forEach(function(x){ if (x.ngay <= d) da += x.soTien; });
  return Math.max(0, num(loan.soTien) - da - tongDaBo(loan, d));
}
function noGocTaiNgay(loan, d){
  if (!loan.ngayVay || loan.ngayVay > d) return 0;
  if (loan.tatToan && loan.tatToan.ngay && loan.tatToan.ngay <= d) return 0;
  var sch = tinhLichTraNo(loan), tra = 0;
  (loan.traNo || []).forEach(function(r){
    var k = sch[num(r.ky)];
    if (!k || !r.ngay || r.ngay > d || !(num(k.tongTra) > 0)) return;
    tra += num(r.soTien) * num(k.goc) / num(k.tongTra);
  });
  return Math.max(0, num(loan.soTienGoc) - tra);
}
// tài sản ròng tại cuối tháng mk
function taiSanRongThang(mk, thuHoi){
  var d = mk + '-31', th = thuHoi || _thuHoiTheoKhoan(), phaiThu = 0, no = 0;
  (state.data.vayNo.choVay || []).forEach(function(l){ phaiThu += phaiThuTaiNgay(l, d, th); });
  (state.data.vayNo.vayNoPhaiTra || []).forEach(function(l){ no += noGocTaiNgay(l, d); });
  var tien = balanceAtEndOfMonth(mk);
  return { tien: tien, phaiThu: phaiThu, no: no, rong: tien + phaiThu - no };
}
// tài sản ròng DỰ KIẾN cuối tháng mk (mk từ tháng hiện tại trở đi); tien = số dư ví dự kiến cuối tháng đó, do nơi gọi chiếu ra.
// Cùng cách dự trù với tongTraNoThang / tongThuHoiThang: kỳ trả chưa đóng rơi vào tháng của nó (quá hạn dồn vào tháng hiện tại)
// và làm nợ gốc giảm đúng phần GỐC của số tiền còn thiếu của kỳ; khoản cho vay hết "phải thu" từ tháng dự kiến thu.
// Khoản vay Mô phỏng chưa tới ngày vay thì tính từ tháng vay; loan.mpTatToanMk: từ tháng đó nợ gốc về 0. Lãi tương lai không tính.
function taiSanRongDuKien(mk, tien){
  var today = todayStr(), curMk = monthKey(today), phaiThu = 0, no = 0;
  (state.data.vayNo.choVay || []).forEach(function(loan){
    if (loan.trangThai === 'da_thu_du') return;
    var cl = conLaiPhaiThu(loan);
    if (cl <= 0) return;
    if (!loan.ngayDuKienThu){ phaiThu += cl; return; }     // chưa có ngày thu: vẫn là tiền phải thu, chưa biết bao giờ về
    var duKien = monthKey(loan.ngayDuKienThu);
    if ((duKien < curMk ? curMk : duKien) > mk) phaiThu += cl;
  });
  (state.data.vayNo.vayNoPhaiTra || []).forEach(function(loan){
    if (!loanIsActive(loan) || !loan.ngayVay || monthKey(loan.ngayVay) > mk) return;
    if (loan.mpTatToanMk && mk >= loan.mpTatToanMk) return;
    var sch = tinhLichTraNo(loan);
    var con = loan.ngayVay > today ? num(loan.soTienGoc) : noGocTaiNgay(loan, today);
    sch.forEach(function(row, idx){
      if (loan.mpTatToanMk && row.mk >= loan.mpTatToanMk) return;
      if (kyDaDong(loan, idx) || !(num(row.tongTra) > 0)) return;
      if ((row.mk < curMk ? curMk : row.mk) > mk) return;
      con -= num(row.goc) * conThieuKy(loan, idx, sch) / num(row.tongTra);
    });
    no += Math.max(0, con);
  });
  return { tien: tien, phaiThu: phaiThu, no: no, rong: tien + phaiThu - no };
}
// cột Tài sản ròng chỉ có nghĩa khi có nợ / cho vay đang mở: ròng khác số dư ở ít nhất một tháng của bảng (rows có bal và rong)
function coCotTaiSanRong(rows){
  return rows.some(function(r){ return Math.abs(r.rong - r.bal) >= 0.5; });
}

/* ---- tổng thu / chi cả tháng (dùng cho dự báo ở Dòng tiền, Mô phỏng, Báo cáo) ---- */
function actualCatMonthAll(kind, mk){
  var s = 0;
  Object.keys(state.data.journal).forEach(function(d){
    if (monthKey(d) !== mk) return;
    var e = state.data.journal[d];
    s += (kind==='thu') ? thuTotal(e) : chiTotal(e);
  });
  return s;
}
// tổng thực tế của 1 danh mục trong 1 tháng (dùng để kiểm tra đã ghi Sổ tay chưa)
function actualCatInMonth(kind, cid, mk){
  var s = 0;
  Object.keys(state.data.journal).forEach(function(d){
    if (monthKey(d) !== mk) return;
    var obj = state.data.journal[d][kind] || {};
    s += num(obj[cid]);
  });
  return s;
}
// SỐ DỰ KIẾN của 1 danh mục (thu hoặc chi) cho tháng mk, theo hạn mức rồi theo thực tế:
// - tháng ĐẦU KỲ (thangBatDauDuTru) và mọi tháng chưa có tháng hoàn chỉnh nào phía trước: số cơ sở = Hạn mức/Kế hoạch của danh mục
// - các tháng sau: số cơ sở = TB tối đa 3 tháng liền trước (tháng đã qua dùng THỰC TẾ, tháng đang chạy / tương lai dùng số dự kiến của nó)
//   -> T11 = số T10, T12 = TB(T10, T11), T1 = TB(T10, T11, T12), T2 = TB(T11, T12, T1)...
// - tháng ĐANG CHẠY: dự kiến = max(thực tế, số cơ sở): chưa tới mức thì lấy đúng mức, vượt rồi thì lấy số đã vượt
// - tháng tương lai: dự kiến = số cơ sở. Danh mục bật "Cố định theo Hạn mức": số cơ sở luôn là Hạn mức.
// Chỉ cần tối đa 3 tháng đã qua + tháng đang chạy + các tháng tới mk: duyệt tuần tự, không đệ quy.
function duKienChuoiSo(kind, cid, mk){
  var cur = monthKey(todayStr());
  var cat0 = state.data.categories[kind].find(function(c){ return c.id === cid; });
  var hm = cat0 ? num(cat0.chiTieu) : 0;
  var s = state.data.settings.thangBatDauDuTru || monthKey(state.data.settings.ngayBatDau || todayStr());
  if (s > cur) s = cur;
  var lo = monthKeyAdd(cur, -3);
  if (lo < s) lo = s;
  var last = mk > cur ? mk : cur, v = {}, m = lo, guard = 0;
  while (m <= last && guard++ < 1200){
    if (m < cur){
      v[m] = actualCatInMonth(kind, cid, m);
    } else {
      var win = [], p = m;
      for (var i = 0; i < 3; i++){
        p = monthKeyAdd(p, -1);
        if (p < s || v[p] == null) break;
        win.push(v[p]);
      }
      var co = hm;
      if (!(cat0 && cat0.coDinhChiTieu && hm > 0) && win.length){
        co = 0;
        win.forEach(function(x){ co += x; });
        co /= win.length;
      }
      v[m] = (m === cur) ? Math.max(actualCatInMonth(kind, cid, m), co) : co;
    }
    m = monthKeyAdd(m, 1);
  }
  return v[mk] == null ? actualCatInMonth(kind, cid, mk) : v[mk];
}
// dự trù 1 danh mục cho tháng mk (tháng tương lai). Thứ tự ưu tiên:
// 1. kế hoạch: khoản định kỳ đang bật + bật "Dùng làm dự báo" + có kỳ phủ tháng mk -> lấy đúng số của kỳ (thay hẳn ước lượng)
// 2. danh mục: lịch Vay - Nợ, rồi duKienChuoiSo (hạn mức / TB các tháng liền trước, xem trên)
// MỘT nguồn duy nhất cho mọi nơi (hàng từng danh mục ở Dòng tiền, tổng dự kiến, tích lũy, Mô phỏng):
// duTruGoiY trả null = "không có gợi ý" (màn hiện "—"), duTruDanhMucThang là bản số (null -> 0).
function duTruGoiY(kind, cid, mk){
  if (mk > monthKey(todayStr()) && !CAT_HE_THONG[kind][cid]){
    var duBao = dinhKyDuBaoThang(kind, cid, mk);
    if (duBao != null) return duBao;
  }
  var cat0 = state.data.categories[kind].find(function(c){ return c.id===cid; });
  // Trả nợ / Thu hồi cho vay lấy từ lịch Vay - Nợ, không phải ước lượng: cờ "Không tính dự kiến" không áp dụng
  if (kind==='chi' && cid==='traNo') return tongTraNoThang(mk) || null;
  if (kind==='thu' && cid==='thuHoiChoVay') return tongThuHoiThang(mk) || null;
  // Cho vay / Nhận tiền vay không đoán, nhưng giao dịch đã GHI ở ngày tương lai (cho vay hẹn tháng sau) là tiền chắc chắn đi / về
  if (cat0 && cat0.khongDuTru){
    var ghi = (mk > monthKey(todayStr()) && (cid === 'choVay' || cid === 'nhanTienVay')) ? actualCatInMonth(kind, cid, mk) : 0;
    return ghi > 0 ? ghi : null;
  }
  if (!cat0 || (cat0.coDinhChiTieu && num(cat0.chiTieu) <= 0)) return null;
  var so = duKienChuoiSo(kind, cid, mk);
  return so > 0 ? so : (recentAvgActual(kind, cid, 3) != null || num(cat0.chiTieu) > 0 ? 0 : null);
}
function duTruDanhMucThang(kind, cid, mk){ return num(duTruGoiY(kind, cid, mk)); }
function duTruThuThang(mk){
  var s=0; state.data.categories.thu.forEach(function(c){ s += duTruDanhMucThang('thu', c.id, mk); }); return s;
}
function duTruChiThang(mk){
  var s=0; state.data.categories.chi.forEach(function(c){ s += duTruDanhMucThang('chi', c.id, mk); }); return s;
}
// phần Trả nợ / Thu hồi cho vay BIẾT TRƯỚC của tháng mk mà Sổ tay chưa phản ánh.
// tongTraNoThang/tongThuHoiThang đã tự bỏ phần đã ghi nhận qua khoản vay (kỳ đóng, đã thu),
// nên chỉ cần trừ thêm phần NHẬP TAY không gắn khoản nào (tiền đó đã đi mà lịch vay vẫn còn nợ).
// Tính theo từng khoản vay chứ không theo cả danh mục: trả 1 khoản không làm khoản kia mất khỏi dự báo.
function bietTruocChuaGhi(kind, cid, mk){
  var known = (kind === 'chi') ? tongTraNoThang(mk) : tongThuHoiThang(mk);
  if (known <= 0) return 0;
  var tay = actualCatInMonth(kind, cid, mk);
  Object.keys(state.data.journal).forEach(function(d){
    if (monthKey(d) === mk) tay -= entryRefSum(state.data.journal[d], kind, cid);
  });
  return Math.max(0, known - Math.max(0, tay));
}
// 1 danh mục / 1 tháng, số HIỂN THỊ ở Dòng tiền (hàng từng danh mục) và là phần tử cộng của thẻ tổng. MỘT nguồn duy nhất:
// - tháng tương lai: gợi ý (duTruGoiY, null = không có gợi ý)
// - tháng hiện tại: Trả nợ / Thu hồi cho vay = thực tế + phần còn lại theo lịch vay; danh mục "Không tính dự kiến" và danh mục
//   hệ thống giữ đúng thực tế; mọi danh mục còn lại = max(thực tế + khoản định kỳ chưa ghi, số cơ sở) (duKienChuoiSo: Hạn mức
//   hoặc TB các tháng liền trước). Lấy MAX chứ không cộng: hạn mức của danh mục dùng làm dự báo đã được đồng bộ theo kỳ định kỳ
//   (dinhKyDongBoHanMuc) nên cộng cả hai là tính 2 lần; khoản định kỳ chỉ thắng khi danh mục chưa có hạn mức đủ lớn
// - tháng đã qua: thực tế
function duKienThangCat(kind, cid, mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return duTruGoiY(kind, cid, mk);
  var av = actualCatInMonth(kind, cid, mk);
  if (mk === currentMk){
    if ((kind === 'chi' && cid === 'traNo') || (kind === 'thu' && cid === 'thuHoiChoVay')) return av + bietTruocChuaGhi(kind, cid, mk);
    var cat0 = state.data.categories[kind].find(function(c){ return c.id === cid; });
    if (!cat0 || cat0.khongDuTru || CAT_HE_THONG[kind][cid]) return av;
    return Math.max(av + dinhKyChuaGhiThang(mk, kind, cid), duKienChuoiSo(kind, cid, mk));
  }
  return av;
}
// tổng thu / chi cả tháng của thẻ. Tháng hiện tại = tổng thực tế + phần "biết trước chưa ghi" của TỪNG danh mục còn tồn tại
// (khoản định kỳ trỏ vào danh mục đã xóa không còn nơi hiển thị nên không được cộng, giống tháng tương lai)
function tongThangCard(kind, mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return kind === 'thu' ? duTruThuThang(mk) : duTruChiThang(mk);
  var s = actualCatMonthAll(kind, mk);
  if (mk === currentMk){
    state.data.categories[kind].forEach(function(c){ s += duKienThangCat(kind, c.id, mk) - actualCatInMonth(kind, c.id, mk); });
  }
  return s;
}
function tongThuThangCard(mk){ return tongThangCard('thu', mk); }
function tongChiThangCard(mk){ return tongThangCard('chi', mk); }

/* ====================================================================
   SỐ DƯ HIỆN TẠI "ĐÃ ĐIỀU CHỈNH" — dùng ở tab Mô phỏng.
   Số dư thật trong Sổ tay + các khoản biết trước ĐÃ TỚI HẠN tính tới hôm nay mà chưa ghi (người dùng hay quên ghi):
     - giao dịch định kỳ (lương, tiền nhà...) đã tới ngày, chưa ghi, chưa bấm Bỏ qua
     - kỳ trả vay chưa đóng có ngày trả <= hôm nay (kể cả kỳ quá hạn của tháng trước); phần nhập tay "Trả nợ"
       không gắn khoản trong tháng được trừ bớt (tiền đó đã đi), giống bietTruocChuaGhi
   KHÔNG tính thu hồi cho vay (tiền người khác trả, chưa chắc đã về) và khoản CHƯA tới ngày.
   Trả về { goc: số dư thật, tong: số dư đã điều chỉnh, items: [{ten, kind, soTien}] }.
   ==================================================================== */
function soDuHienTaiDieuChinh(homNay){
  var items = [];
  dinhKyDenHan(homNay).forEach(function(x){
    items.push({ ten: x.dk.ten, kind: x.dk.kind, soTien: x.tien });
  });
  var curMk = monthKey(homNay), tongVay = 0;
  (state.data.vayNo.vayNoPhaiTra || []).forEach(function(loan){
    if (!loanIsActive(loan)) return;
    var sch = tinhLichTraNo(loan);
    sch.forEach(function(row, idx){
      if (kyDaDong(loan, idx) || row.ngayTra > homNay) return;
      tongVay += conThieuKy(loan, idx, sch);
    });
  });
  if (tongVay > 0){
    var tay = actualCatInMonth('chi', 'traNo', curMk);
    Object.keys(state.data.journal).forEach(function(d){
      if (monthKey(d) === curMk) tay -= entryRefSum(state.data.journal[d], 'chi', 'traNo');
    });
    tongVay = Math.max(0, tongVay - Math.max(0, tay));
    if (tongVay > 0) items.push({ ten: 'Trả vay', kind: 'chi', soTien: tongVay });
  }
  var goc = balanceAt(homNay), tong = goc;
  items.forEach(function(x){ tong += (x.kind === 'thu' ? 1 : -1) * x.soTien; });
  return { goc: goc, tong: tong, items: items };
}
