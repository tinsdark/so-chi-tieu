"use strict";
/* ====================================================================
   vayno.js — toàn bộ logic + giao diện tab "Vay - Nợ": tính lịch trả nợ,
   render bảng Cho vay / Vay-Nợ phải trả, dòng tiền tích lũy tương lai,
   và xử lý các hành động (thêm/sửa/xóa/tất toán/ghi nhận thu-trả) của tab này.
   Cần state.js, drive-sync.js load trước.
   ==================================================================== */

var LOAI_VAY_LABEL = { ngan_hang:'Ngân hàng', vi:'Ví', ban_be:'Bạn bè', nguoi_than:'Người thân' };
var HINH_THUC_LABEL = { tra_1_lan:'Trả 1 lần', khong_lai:'Không lãi suất', co_lai:'Có lãi suất', tra_co_dinh:'Trả cố định/tháng', goc_deu:'Gốc đều, lãi giảm dần' };

function monthKeyAdd(mk, n){
  var p = mk.split('-'); var y = parseInt(p[0],10), m = parseInt(p[1],10) + n;
  while (m > 12){ m -= 12; y++; }
  while (m < 1){ m += 12; y--; }
  return y + '-' + pad2(m);
}
function loanIsActive(loan){ return loan.trangThai !== 'da_tra_het'; }
// số ngày của tháng mk (YYYY-MM)
function daysInMonth(mk){ var p = mk.split('-'); return new Date(parseInt(p[0],10), parseInt(p[1],10), 0).getDate(); }
// ghép tháng mk + "ngày trong tháng" (1-31) -> "YYYY-MM-DD", tự co về ngày cuối tháng
// nếu tháng đó không có đủ ngày (vd ngày 31 rơi vào tháng 2/4/6/9/11)
function ngayTraCuaKy(mk, ngayTrongThang){
  var n = Math.max(1, Math.min(31, num(ngayTrongThang) || 1));
  return mk + '-' + pad2(Math.min(n, daysInMonth(mk)));
}
// trả về lịch trả từng tháng: [{mk, ngayTra, goc, lai, tongTra, duNoConLai}]
function tinhLichTraNo(loan){
  var sch = [];
  var startMk = monthKey(loan.ngayVay || todayStr());
  var goc0 = num(loan.soTienGoc);
  // "ngày trả hàng tháng" là field nhập tay riêng (1-31), tách biệt với ngày vay;
  // khoản cũ chưa có thì tạm lấy ngày-trong-tháng của ngày vay làm mặc định
  var ngayTrongThang = num(loan.ngayTraHangThang) || (loan.ngayVay ? parseInt(loan.ngayVay.slice(8,10),10) : 1);
  if (loan.hinhThuc === 'tra_1_lan'){
    var mkDue = loan.ngayDaoHan ? monthKey(loan.ngayDaoHan) : monthKeyAdd(startMk, num(loan.soThangVay) || 0);
    var ngayTraDue = loan.ngayDaoHan || ngayTraCuaKy(mkDue, ngayTrongThang);
    sch.push({ mk: mkDue, ngayTra: ngayTraDue, goc: goc0, lai: 0, tongTra: goc0, duNoConLai: 0 });
    return sch;
  }
  var n = Math.max(1, num(loan.soThangVay));
  // trả cố định/tháng (trả góp điện máy, vay qua app, vay người quen): chỉ biết gốc, số tiền trả mỗi tháng
  // và số kỳ, không biết lãi suất. Phần chênh (tổng trả − gốc) coi là lãi, chia đều mỗi kỳ; gốc mỗi kỳ = gốc/n.
  // Tổng trả < gốc (nhập sai) thì không có lãi âm: coi như không lãi, chia đều gốc.
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
  // goc_deu (chỉ tab Mô phỏng dùng) — mỗi kỳ trả gốc bằng nhau, lãi tính trên dư nợ còn lại nên giảm dần
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
  c.trangThai = conLaiPhaiThu(c) <= 0.01 ? 'da_thu_du' : 'dang_cho';
  return lan;
}
// ghi số tiền THỰC THU của khoản cho vay: cộng daThu + giao dịch thu "Thu hồi cho vay" ở Sổ tay (có ref gắn khoản).
// dongKhoan = tất toán: phần thiếu coi như xóa nợ (tatToan) và đóng khoản. Trả về phần thiếu (>0 nếu còn).
function choVayGhiThu(c, so, ngay, viId, dongKhoan){
  var thieu = conLaiPhaiThu(c) - so;
  c.daThu = num(c.daThu) + so;
  journalAddRef(ngay, c.id, 'thuHoiChoVay', so, 'Thu hồi cho vay: ' + c.ten, { rid: 't' + Date.now().toString(36), walletId: viId });
  if (dongKhoan && thieu > 0.01) c.tatToan = { soTien: thieu, ngay: ngay };
  c.trangThai = (c.tatToan || conLaiPhaiThu(c) <= 0.01) ? 'da_thu_du' : 'dang_cho';
  invalidateBalanceCache();
  return thieu;
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
    var soNgay = daysBetween(todayStr(), ky.ngayTra);
    if (soNgay <= nNgay) out.push({ loai: 'vayNo', id: v.id, ten: v.ten, ngay: ky.ngayTra, soNgay: soNgay, soTien: conThieuKy(v, td.kyTiepIdx, td.sch) });
  });
  out.sort(function(a,b){ return a.soNgay - b.soNgay; });
  return out;
}
// số khoản sắp/đã tới hạn trong N ngày — dùng cho badge trên tab nav
function vnBadgeCount(nNgay){ return danhSachSapDenHan(nNgay || 7).length; }

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
    if (cl <= 0) return;
    var duKien = monthKey(loan.ngayDuKienThu || todayStr());
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

/* ---- dòng tiền tích lũy tương lai (thẻ dưới cùng của tab Vay-Nợ) ---- */
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
function duTruDanhMucThang(kind, cid, mk){
  var cat0 = state.data.categories[kind].find(function(c){ return c.id===cid; });
  if (cat0 && cat0.khongDuTru) return 0;
  if (kind==='chi' && cid==='traNo') return tongTraNoThang(mk);
  if (kind==='thu' && cid==='thuHoiChoVay') return tongThuHoiThang(mk);
  if (cat0 && cat0.coDinhChiTieu) return num(cat0.chiTieu) > 0 ? num(cat0.chiTieu) : 0;
  var avg = recentAvgActual(kind, cid, 3);
  if (avg != null) return avg;
  var cat = state.data.categories[kind].find(function(c){ return c.id===cid; });
  return (cat && num(cat.chiTieu) > 0) ? num(cat.chiTieu) : 0;
}
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
// tháng hiện tại: các khoản BIẾT TRƯỚC (Trả nợ/Thu hồi cho vay theo lịch vay, hoặc danh mục có cờ
// "Cố định theo Chỉ tiêu") mà chưa ghi Sổ tay thì cộng thêm số biết trước đó; các danh mục còn lại
// (ước lượng, không cố định) vẫn giữ nguyên thực tế (có thể 0)
function tongThuThangCard(mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return duTruThuThang(mk);
  var s = actualCatMonthAll('thu', mk);
  if (mk === currentMk){
    s += bietTruocChuaGhi('thu', 'thuHoiChoVay', mk);
    s += dinhKyChuaGhiThang(mk, 'thu');       // lương... đã khai định kỳ mà tháng này chưa ghi
    state.data.categories.thu.forEach(function(c){
      if (c.id === 'thuHoiChoVay') return;
      // danh mục đã có khoản định kỳ chưa ghi thì dùng số định kỳ ở trên, không cộng thêm chỉ tiêu cố định (tránh tính 2 lần)
      if (c.coDinhChiTieu && !actualCatInMonth('thu', c.id, mk) && !dinhKyChuaGhiThang(mk, 'thu', c.id)){
        var b = num(c.chiTieu);
        if (b > 0) s += b;
      }
    });
  }
  return s;
}
function tongChiThangCard(mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return duTruChiThang(mk);
  var s = actualCatMonthAll('chi', mk);
  if (mk === currentMk){
    s += bietTruocChuaGhi('chi', 'traNo', mk);
    s += dinhKyChuaGhiThang(mk, 'chi');       // tiền nhà... đã khai định kỳ mà tháng này chưa ghi
    state.data.categories.chi.forEach(function(c){
      if (c.id === 'traNo') return;
      if (c.coDinhChiTieu && !actualCatInMonth('chi', c.id, mk) && !dinhKyChuaGhiThang(mk, 'chi', c.id)){
        var b = num(c.chiTieu);
        if (b > 0) s += b;
      }
    });
  }
  return s;
}

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
    items.push({ ten: x.dk.ten, kind: x.dk.kind, soTien: num(x.dk.soTien) });
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

// ví của khoản vay/cho vay lấy từ ô chọn trong form. Form chỉ có ô này khi có >= 2 ví;
// không có ô (1 ví) hoặc giá trị lạ -> giữ ví cũ của khoản đó, chưa có thì ví mặc định.
function vnViTuForm(selId, cu){
  var el = document.getElementById(selId);
  var v = el ? el.value : '';
  if (walletById(v)) return v;
  return (cu && walletById(cu.walletId)) ? cu.walletId : viMacDinhId();
}

/* ---- render ---- */
// nhãn tháng ngắn: "T9/2026"; dài: "tháng 2/2029"
function vnTMk(mk){ return 'T' + parseInt(mk.slice(5,7),10) + '/' + mk.slice(0,4); }
function vnMkDai(mk){ return 'tháng ' + parseInt(mk.slice(5,7),10) + '/' + mk.slice(0,4); }
function vnSo(n){ return Math.round(Number(n)||0).toLocaleString('vi-VN'); }
function vnChip(cls, noiDung){ return '<span class="vn-chip'+(cls ? ' '+cls : '')+'">'+noiDung+'</span>'; }
function vnTrangThaiHan(soNgay){
  if (soNgay < 0) return vnChip('red', 'Quá hạn '+(-soNgay)+' ngày');
  if (soNgay === 0) return vnChip('red', 'Hôm nay');
  if (soNgay <= 3) return vnChip('amber', 'Còn '+soNgay+' ngày');
  return vnChip('', 'Còn '+soNgay+' ngày');
}

// thẻ đầu: tổng nợ, cho vay chờ thu, tháng này cần trả bao nhiêu / đã trả bao nhiêu
function vnTongQuanHtml(){
  var vays = state.data.vayNo.vayNoPhaiTra, cvs = state.data.vayNo.choVay;
  if (!vays.length && !cvs.length) return '';
  var tongNo = 0, hetMk = '', curMk = monthKey(todayStr()), can = 0, da = 0;
  vays.filter(loanIsActive).forEach(function(v){
    tongNo += soTienConLaiPhaiTra(v);
    var m = thangDuKienHetNo(v);
    if (m && m > hetMk) hetMk = m;
    // kỳ của tháng này + kỳ các tháng trước mà chưa đóng (quá hạn, dồn vào tháng này như dự trù)
    tinhLichTraNo(v).forEach(function(row, i){
      if (row.mk > curMk) return;
      var dong = kyDaDong(v, i);
      if (row.mk < curMk && dong) return;
      var need = num(row.tongTra);
      can += need;
      da += dong ? need : Math.min(need, soTienTraKy(v, i));
    });
  });
  var phaiThu = 0;
  cvs.forEach(function(c){ phaiThu += conLaiPhaiThu(c); });
  var rong = tongNo - phaiThu;
  var pct = can > 0 ? Math.min(100, Math.round(da / can * 100)) : 0;
  var h = '<div class="card vn-tq"><div class="vn-lbl">Còn nợ</div><div class="vn-big">'+fmt(tongNo)+'</div>'
    + '<div class="vn-tq-r"><div><div class="vn-lbl">Cho vay chờ thu</div><b class="thu">'+fmt(phaiThu)+'</b></div>'
    + (Math.abs(rong) >= 1 ? vnChip(rong > 0 ? 'red' : 'ok', (rong > 0 ? 'Nợ ròng ' : 'Có ròng ')+fmt(Math.abs(rong))) : '')
    + '</div>';
  if (can > 0){
    h += '<div class="vn-th"><div class="vn-th-h"><span>'+monthLabel(curMk)+' cần trả</span><b>'+fmt(can)+'</b></div>'
      + '<div class="dt-track no"><i style="width:'+pct+'%"></i></div>'
      + '<div class="dt-b-f"><span><b>'+pct+'%</b> · đã trả '+fmt(da)+'</span><span>còn '+fmt(Math.max(0, can - da))+'</span></div></div>';
  } else if (vays.some(loanIsActive)){
    h += '<div class="vn-th"><div class="vn-sub">'+monthLabel(curMk)+' không có kỳ nào phải trả.</div></div>';
  }
  if (hetMk) h += '<div class="vn-het">'+icon('clock')+'<span>Dự kiến hết nợ: <b>'+vnMkDai(hetMk)+'</b></span></div>';
  return h + '</div>';
}

// thẻ nhắc hạn ở đầu tab, gộp cả Cho vay + Vay-Nợ phải trả
function sapDenHanHtml(nNgay){
  var list = danhSachSapDenHan(nNgay);
  if (!list.length) return '';
  var h = '<div class="card k-act vn-sapc"><h3>'+icon('clock')+' Sắp đến hạn / quá hạn</h3>'
    + '<div class="vn-sub">Trong '+nNgay+' ngày tới · chạm để xem khoản đó ở bên dưới</div>';
  list.forEach(function(x){
    h += '<button type="button" class="vn-row vn-sap" data-act="vnCuonTo" data-loai="'+x.loai+'" data-id="'+esc(x.id)+'">'
      + '<span class="vn-r1"><b>'+esc(x.ten)+'</b><b>'+fmt(Math.round(x.soTien))+'</b></span>'
      + '<span class="vn-r2"><span>'+(x.loai === 'choVay' ? 'Thu hồi cho vay' : 'Trả nợ')+' · '+ngayVN(x.ngay)+'</span>'+vnTrangThaiHan(x.soNgay)+'</span></button>';
  });
  return h + '</div>';
}

/* ---- khoản vay phải trả ---- */
function vnKyHtml(loan, row, idx, st, tienDo, lastClosedIdx){
  var coTien = st.trangThai !== 'chua';
  var chip, ghi = '';
  if (st.trangThai === 'du') chip = vnChip('ok', icon('check')+'đã trả đủ kỳ');
  else if (st.trangThai === 'thieu'){ chip = vnChip('ok', icon('check')+'xong kỳ'); ghi = '<span class="vn-bad">thiếu '+fmt(Math.round(-st.lech))+'</span>'; }
  else if (st.trangThai === 'motphan'){ chip = vnChip('bad', icon('alert')+'chưa trả đủ kỳ'); ghi = '<span class="vn-bad">còn '+fmt(Math.round(st.can - st.da))+'</span>'; }
  else chip = vnChip('', 'chưa trả');
  var ids = 'data-id="'+loan.id+'" data-ky="'+idx+'"';
  var acts = '';
  if (idx === tienDo.kyTiepIdx){
    acts = '<button class="btn sm" data-act="vnGhiNhanTra" '+ids+' data-mk="'+row.mk+'">'+(st.trangThai === 'motphan' ? 'Trả tiếp' : 'Ghi nhận đã trả')+'</button>';
    if (st.trangThai === 'motphan'){
      acts += '<details class="vn-mn"><summary aria-label="Thêm thao tác">'+icon('dots')+'</summary><div class="vn-mn-l">'
        + '<button type="button" data-act="vnDongKy" '+ids+' title="Coi kỳ này là đã thanh toán xong dù còn thiếu">Đóng kỳ</button>'
        + '<button type="button" data-act="vnHuyGhiNhanTra" '+ids+' title="Xóa hết các lần trả của kỳ này, hoàn lại giao dịch ở Sổ tay">Hủy ghi nhận</button></div></details>';
    }
  } else if (idx === lastClosedIdx){
    acts = '<details class="vn-mn"><summary aria-label="Thêm thao tác">'+icon('dots')+'</summary><div class="vn-mn-l">'
      + '<button type="button" data-act="vnMoLaiKy" '+ids+' title="Bỏ đánh dấu xong kỳ, giữ nguyên tiền đã trả">Mở lại kỳ</button>'
      + '<button type="button" data-act="vnHuyGhiNhanTra" '+ids+' title="Xóa hết các lần trả của kỳ này, hoàn lại giao dịch ở Sổ tay">Hủy ghi nhận</button></div></details>';
  }
  return '<div class="vn-ky '+st.trangThai+(idx === tienDo.kyTiepIdx ? ' next' : '')+'">'
    + '<div class="vn-ky-1"><b>Kỳ '+(idx+1)+' · '+vnTMk(row.mk)+'</b>'+chip+'</div>'
    + '<div class="vn-ky-n"><span>Ngày trả '+ngayVN(row.ngayTra)+'</span>'+ghi+'</div>'
    + '<div class="vn-ky-m"><span class="vn-ky-amt">'+fmt(Math.round(row.tongTra))+'</span>'
    + '<details class="vn-gl"><summary>Gốc / lãi</summary><div>Gốc '+fmt(Math.round(row.goc))+'<br>Lãi '+fmt(Math.round(row.lai))+'</div></details></div>'
    + '<div class="vn-ky-f"><span>Dư nợ sau kỳ '+fmt(Math.round(row.duNoConLai))+'</span>'+(coTien ? '<span>Đã trả '+fmt(Math.round(st.da))+'</span>' : '')+'</div>'
    + (acts ? '<div class="vn-ky-a">'+acts+'</div>' : '')
    + '</div>';
}

function vayNoScheduleHtml(loan){
  var tienDo = tienDoTraNo(loan), sch = tienDo.sch, n = sch.length;
  var lastClosedIdx = -1;
  for (var i=0;i<n;i++){ if (kyDaDong(loan, i)) lastClosedIdx = i; }
  // lịch dài: mặc định chỉ hiện quanh kỳ tiếp theo (2 kỳ trước + 4 kỳ sau)
  var tatCa = !!(state.vnLichAll && state.vnLichAll[loan.id]);
  var tam = tienDo.kyTiepIdx >= 0 ? tienDo.kyTiepIdx : n;
  var tu = tatCa ? 0 : Math.max(0, Math.min(tam - 2, n - 6));
  var den = tatCa ? n : Math.min(n, tu + 6);
  var an = n - (den - tu);
  var h = '<div class="vn-ls"><div class="vn-ls-h"><b>Lịch trả nợ</b><small>'
    + (an > 0 ? 'Kỳ '+(tu+1)+'–'+den+' / '+n : n+' kỳ')+'</small></div>';
  if (an > 0 || tatCa && n > 6){
    h += '<button type="button" class="vn-more" data-act="vnLichAll" data-id="'+loan.id+'">'
      + (tatCa ? 'Thu gọn' : (tu > 0 ? tu+' kỳ trước đã đóng · ' : '')+'Xem tất cả '+n+' kỳ')+'</button>';
  }
  for (var k = tu; k < den; k++) h += vnKyHtml(loan, sch[k], k, kyStatus(loan, k, sch), tienDo, lastClosedIdx);
  var lech = tongLechTraNo(loan);
  if (Math.abs(lech) >= 1){
    h += '<div class="vn-ghichu">'+(lech < 0 ? 'Trả thiếu ' : 'Trả thừa ')+'<b>'+fmt(Math.round(Math.abs(lech)))+'</b> ở các kỳ đã đóng. '
      + 'Không cộng ngược vào dư nợ — số tiền thực tế đã ghi ở Sổ tay. Kỳ còn đang trả dở thì phần thiếu vẫn nằm trong dư nợ.</div>';
  }
  if (loan.tatToan){
    h += '<div class="vn-ghichu">Đã tất toán ngày '+(loan.tatToan.ngay ? ngayVN(loan.tatToan.ngay) : '')+' với số tiền <b>'+fmt(loan.tatToan.soTien)+'</b>.</div>';
  }
  return h + '</div>';
}

function vnVayCardHtml(v){
  var xong = !loanIsActive(v);
  var td = tienDoTraNo(v), ky = td.kyTiepTheo, idx = td.kyTiepIdx;
  var duNo = soTienConLaiPhaiTra(v), hetMk = thangDuKienHetNo(v);
  var st = ky ? kyStatus(v, idx, td.sch) : null;
  var quaHan = ky ? daysBetween(ky.ngayTra, todayStr()) : 0;
  var chip = v.tatToan ? vnChip('', 'Đã tất toán')
    : (xong ? vnChip('ok', 'Đã trả hết')
    : (quaHan > 0 ? vnChip('red', 'Quá hạn '+quaHan+' ngày') : vnChip('amber', 'Đang vay')));
  var pct = td.tongKy ? Math.round(td.daTraKy / td.tongKy * 100) : 0;
  var mo = state.vnDetailId === v.id;
  var h = '<div class="vn-c'+(xong ? ' xong' : '')+'" id="vn-vn-'+esc(v.id)+'">'
    + '<div class="vn-c-h"><b class="vn-c-t">'+esc(v.ten)+'</b>'+chip+'</div>'
    + '<div class="vn-tags"><span class="vn-tag">'+LOAI_VAY_LABEL[v.loaiVay]+'</span><span class="vn-tag">'+HINH_THUC_LABEL[v.hinhThuc]+'</span></div>'
    + '<div class="vn-lbl">Dư nợ còn lại</div><div class="vn-big m">'+fmt(duNo)+'</div>'
    + '<div class="vn-prog"><div class="dt-track sm'+(xong ? '' : ' no')+'"><i style="width:'+pct+'%"></i></div><span>'+td.daTraKy+'/'+td.tongKy+' kỳ</span></div>';
  if (!xong){
    var motPhan = st && st.trangThai === 'motphan';
    h += '<div class="vn-2c"><div><div class="vn-lbl">'+(motPhan ? 'Kỳ '+(idx+1)+' còn thiếu' : 'Kỳ tới')+'</div>'
      + '<b'+(motPhan ? ' class="vn-bad"' : '')+'>'+(ky ? fmt(Math.round(motPhan ? conThieuKy(v, idx, td.sch) : ky.tongTra)) : '—')+'</b>'
      + (ky ? '<div class="vn-sub">Hạn '+ngayVN(ky.ngayTra)+'</div>' : '')+'</div>'
      + '<div><div class="vn-lbl">Dự kiến hết nợ</div><b>'+(hetMk ? monthLabel(hetMk) : '—')+'</b></div></div>';
  }
  h += '<div class="vn-act"><button type="button" class="vn-lich-b'+(mo ? ' mo' : '')+'" data-act="vnToggleDetail" data-id="'+v.id+'" aria-expanded="'+mo+'">'
    + (mo ? 'Thu gọn' : 'Lịch trả')+icon('chev')+'</button><span class="sp"></span>'
    + (loanIsActive(v) ? '<button class="btn sm secondary" data-act="vnTatToan" data-id="'+v.id+'" title="Tất toán sớm toàn bộ khoản vay">Tất toán</button>' : '')
    + (v.tatToan ? '<button class="btn sm secondary" data-act="vnHuyTatToan" data-id="'+v.id+'" title="Hủy tất toán, hoàn lại giao dịch Sổ tay">Hủy tất toán</button>' : '')
    + '<button class="icon-btn" data-act="vnEditVayNo" data-id="'+v.id+'" title="Sửa khoản vay" aria-label="Sửa khoản vay '+esc(v.ten)+'">'+icon('pencil')+'</button>'
    + '<button class="icon-btn" data-act="vnDelVayNo" data-id="'+v.id+'" title="Xóa khoản vay" aria-label="Xóa khoản vay '+esc(v.ten)+'">'+icon('trash')+'</button></div>';
  if (mo) h += vayNoScheduleHtml(v);
  return h + '</div>';
}

function vnVayHtml(){
  var ds = state.data.vayNo.vayNoPhaiTra;
  var dang = ds.filter(loanIsActive), xong = ds.filter(function(v){ return !loanIsActive(v); });
  var h = '<div class="card k-debt"><h3 class="vn-h3">Vay - Nợ phải trả <button class="btn sm" data-act="vnAddVayNo">+ Thêm khoản vay</button></h3>';
  if (!ds.length){
    h += '<div class="empty-box">Chưa có khoản vay nào.<div><button class="btn" data-act="vnAddVayNo">+ Thêm khoản vay</button></div></div>';
  } else {
    dang.forEach(function(v){ h += vnVayCardHtml(v); });
    if (xong.length){
      var moXong = state.vnXong || xong.some(function(v){ return v.id === state.vnDetailId; });
      h += '<button type="button" class="vn-more vn-xong-b" data-act="vnXong" aria-expanded="'+moXong+'">Đã xong ('+xong.length+')'+icon('chev')+'</button>';
      if (moXong) xong.forEach(function(v){ h += vnVayCardHtml(v); });
    }
  }
  return h + '</div>';
}

/* ---- cho vay ---- */
function vnChoVayCardHtml(c){
  var conLai = conLaiPhaiThu(c), qh = soNgayQuaHan(c);
  var xong = !!c.tatToan || c.trangThai === 'da_thu_du' || conLai <= 0;
  var daBo = tongDaBo(c);
  var chip = c.tatToan
    ? vnChip('', 'Đã đóng' + (num(c.tatToan.soTien) > 0 ? ' (xóa nợ '+fmt(Math.round(c.tatToan.soTien))+')' : ''))
    : (xong ? (daBo > 0 ? vnChip('', 'Đã đóng (xóa nợ '+fmt(Math.round(daBo))+')') : vnChip('ok', 'Đã thu đủ')) : (qh > 0 ? vnChip('red', 'Quá hạn '+qh+' ngày') : vnChip('amber', 'Đang chờ')));
  var pct = num(c.soTien) > 0 ? Math.min(100, Math.round(num(c.daThu) / num(c.soTien) * 100)) : 0;
  return '<div class="vn-c'+(xong ? ' xong' : '')+'" id="vn-cv-'+esc(c.id)+'">'
    + '<div class="vn-c-h"><b class="vn-c-t">'+esc(c.ten)+'</b>'+chip+'</div>'
    + '<div class="vn-3c"><div><div class="vn-lbl">Cho vay</div><b>'+vnSo(c.soTien)+'</b></div>'
    + '<div><div class="vn-lbl">Đã thu</div><b class="thu">'+vnSo(c.daThu)+'</b></div>'
    + '<div><div class="vn-lbl">Còn lại</div><b>'+vnSo(conLai)+'</b></div></div>'
    + '<div class="dt-track sm" style="margin:10px 0 0"><i style="width:'+pct+'%"></i></div>'
    + (daBo > 0 && !c.tatToan ? '<div class="vn-sub" style="margin-top:10px">Đã xóa nợ <b>'+fmt(Math.round(daBo))+'</b> (không đòi được)</div>' : '')
    + (c.ngayDuKienThu ? '<div class="vn-sub" style="margin-top:10px">Dự kiến thu <b>'+ngayVN(c.ngayDuKienThu)+'</b></div>' : '')
    + '<div class="vn-act"><span class="sp"></span>'
    + (c.tatToan
        ? '<button class="btn sm secondary" data-act="vnHuyTatToanChoVay" data-id="'+c.id+'" title="Hủy xóa nợ, mở lại phần đã xóa">Hủy xóa nợ</button>'
        : ((c.daBo || []).length ? '<button class="btn sm secondary" data-act="vnHoanBoChoVay" data-id="'+c.id+'" title="Hoàn lại lần xóa nợ gần nhất">Hoàn lại lần xóa nợ</button>' : '')
          + (conLai > 0 ? '<button class="btn sm secondary" data-act="vnXoaNoChoVay" data-id="'+c.id+'" title="Xóa nợ: bỏ phần không đòi được (cả khoản hoặc một phần). KHÔNG ghi giao dịch nào ở Sổ tay">Xóa nợ</button>'
              + '<button class="btn sm" data-act="vnTatToanChoVay" data-id="'+c.id+'" title="Ghi số tiền thực thu về, vào Sổ tay">Tất toán</button>' : ''))
    + '<button class="icon-btn" data-act="vnEditChoVay" data-id="'+c.id+'" title="Sửa khoản cho vay" aria-label="Sửa khoản cho vay '+esc(c.ten)+'">'+icon('pencil')+'</button>'
    + '<button class="icon-btn" data-act="vnDelChoVay" data-id="'+c.id+'" title="Xóa khoản cho vay" aria-label="Xóa khoản cho vay '+esc(c.ten)+'">'+icon('trash')+'</button></div></div>';
}

function vnChoVayHtml(){
  var ds = state.data.vayNo.choVay;
  var h = '<div class="card k-asset"><h3 class="vn-h3">Cho vay <button class="btn sm" data-act="vnAddChoVay">+ Thêm khoản cho vay</button></h3>';
  h += ghiChuGon('Bấm "Tất toán" trên khoản để ghi số tiền thực thu (chọn ngày và ví): app tự ghi giao dịch thu vào Sổ tay. "Xóa nợ" chỉ dùng để bỏ phần không đòi được và không tạo giao dịch nào.', 'Ghi tiền thu về thế nào?');
  if (!ds.length) h += '<div class="empty-box">Chưa có khoản cho vay nào.<div><button class="btn" data-act="vnAddChoVay">+ Thêm khoản cho vay</button></div></div>';
  else ds.forEach(function(c){ h += vnChoVayCardHtml(c); });
  return h + '</div>';
}

/* ---- dòng tiền tích lũy tương lai ---- */
function vnDongTienHtml(){
  var horizon = state.vnHorizon || 12;
  var startMk = monthKey(todayStr()), months = [];
  for (var i=0;i<horizon;i++) months.push(monthKeyAdd(startMk, i));
  var runningBal = balanceBeforeMonth(startMk);
  var rows = months.map(function(mk){
    var thu = tongThuThangCard(mk), chi = tongChiThangCard(mk);
    runningBal += thu - chi;
    return { mk:mk, thu:thu, chi:chi, bal: runningBal };
  });
  var cuoi = rows[rows.length-1], thap = rows.reduce(function(a, r){ return r.bal < a.bal ? r : a; }, rows[0]);
  var hien = state.vnHetThang ? rows : rows.slice(0, 6);
  var h = '<div class="card vn-dt"><h3>Dòng tiền tích lũy tương lai</h3><div class="mp-hz">'
    + [6,12,24].map(function(x){ return '<button type="button" class="'+(x === horizon ? 'on' : '')+'" data-act="vnHorizon" data-h="'+x+'">'+x+' tháng</button>'; }).join('')
    + '</div>'
    + '<div class="vn-lbl">Tích lũy dự kiến cuối '+vnTMk(cuoi.mk)+'</div><div class="vn-big m'+(cuoi.bal < 0 ? ' am' : '')+'">'+fmt(cuoi.bal)+'</div>'
    + '<div class="vn-sub">Thấp nhất '+fmt(thap.bal)+' vào '+vnTMk(thap.mk)+'</div>'
    + '<div class="bd-box" style="margin-top:8px">'
    + bdLine({ W: 350, H: 190, labels: rows.map(function(r){ return 'T' + parseInt(r.mk.slice(5, 7), 10) + (r.mk.slice(0, 4) !== rows[0].mk.slice(0, 4) ? '/' + r.mk.slice(2, 4) : ''); }),
      series: [{ ten: 'Số dư', vals: rows.map(function(r){ return Math.round(r.bal); }), cls: 'chi', fill: true }],
      tipTitle: function(i){ return monthLabel(rows[i].mk); }, money: function(v){ return fmt(v); }, aria: 'Số dư lũy kế dự kiến' }) + '</div>'
    + '<div class="vn-ml"><div class="vn-ml-h"><span>Tháng</span><span>Thu</span><span>Chi</span><span>Tích lũy</span></div>';
  hien.forEach(function(r){
    h += '<div class="vn-ml-r"><span>T'+parseInt(r.mk.slice(5,7),10)+'/'+r.mk.slice(2,4)+'</span><span class="t">'+vnSo(r.thu)+'</span><span class="c">'+vnSo(r.chi)+'</span>'
      + '<span class="l'+(r.bal < 0 ? ' am' : '')+'">'+vnSo(r.bal)+'</span></div>';
  });
  h += '</div>';
  if (rows.length > 6) h += '<button type="button" class="vn-more" data-act="vnHetThang">'+(state.vnHetThang ? 'Thu gọn' : 'Xem cả '+rows.length+' tháng')+'</button>';
  h += '<div class="vn-sub" style="text-align:center;margin-top:4px">Số tính bằng ₫</div>';
  // Khối giải thích dài đẩy hẳn bảng xuống dưới màn hình, mà đọc 1 lần là nhớ -> gấp lại, mặc định đóng.
  h += '<details class="giai-thich"><summary>ⓘ Số tháng tương lai tính thế nào?</summary>'
    + '<div>Tháng hiện tại/quá khứ dùng số thực tế từ Sổ tay; tháng tương lai dùng gợi ý: TB của tối đa 3 tháng ĐÃ HOÀN CHỈNH gần nhất (tính từ "Tháng bắt đầu tính dự kiến" ở tab Danh mục), chưa có tháng hoàn chỉnh nào thì dùng Hạn mức/tháng. Riêng Trả nợ/Thu hồi cho vay lấy thẳng từ lịch vay (kỳ đã ghi nhận trả thì không cộng lại; khoản cho vay quá hạn dồn vào tháng hiện tại), và các danh mục có cờ "Cố định theo Hạn mức": nếu tháng hiện tại chưa ghi Sổ tay thì vẫn hiện số biết trước.</div></details>';
  return h + '</div>';
}

function renderVayNo(){
  var root = document.getElementById('tabContent');
  var trai = vnTongQuanHtml() + sapDenHanHtml(7) + vnVayHtml();
  var phai = vnChoVayHtml() + vnDongTienHtml();
  root.innerHTML = '<div class="cot2"><div class="cot-trai">' + trai + '</div><div class="cot-phai">' + phai + '</div></div>';
  vnSheetVe();
}

/* ====================================================================
   BẢNG TRƯỢT TỪ ĐÁY (dùng lại khung .qa-sheet của Sổ tay)
   - vnSheetVe: form thêm/sửa khoản vay / cho vay. Nằm ngoài #tabContent, đã mở thì GIỮ NGUYÊN DOM
     để vẽ lại trang (đồng bộ, chuyển tab...) không làm mất ô đang gõ. Khóa = loại + id khoản.
   - vnDlMo: hộp thoại nhập số (ghi nhận trả kỳ, tất toán) -> Promise.
   ==================================================================== */
function vnKhopKhungNhin(){
  var vv = window.visualViewport;
  if (!vv) return;
  ['vnSheetRoot', 'vnDlRoot', 'dmSheetRoot'].forEach(function(id){
    var r = document.getElementById(id);
    if (!r) return;
    r.style.top = vv.offsetTop + 'px';
    r.style.height = vv.height + 'px';
    r.style.bottom = 'auto';
  });
}
if (typeof window !== 'undefined' && window.visualViewport){
  window.visualViewport.addEventListener('resize', vnKhopKhungNhin);
  window.visualViewport.addEventListener('scroll', vnKhopKhungNhin);
}
function vnMoKhoaNen(){
  return !!(document.getElementById('qaSheetRoot') || document.getElementById('mpSheetRoot')
    || document.getElementById('vnSheetRoot') || document.getElementById('vnDlRoot') || document.getElementById('dmSheetRoot'));
}

function vnF(nhan, noiDung, ht, ghiChu){
  return '<div class="vn-f"'+(ht ? ' data-ht="'+ht+'"' : '')+'><div class="qa-lbl">'+nhan+'</div>'+noiDung
    + (ghiChu ? '<div class="vn-hint">'+ghiChu+'</div>' : '')+'</div>';
}
function vnViSelect(selId, nhan, cu){
  if ((state.data.wallets || []).length < 2) return '';
  return vnF(nhan, '<select id="'+selId+'">'+viOptionsHtml((cu && cu.walletId) || viMacDinhId())+'</select>');
}
function vnChipsHtml(inputId, nhanMap, chon){
  return '<input type="hidden" id="'+inputId+'" value="'+chon+'"><div class="qa-chips">'
    + Object.keys(nhanMap).map(function(k){
        return '<button type="button" class="qa-chip'+(k === chon ? ' on' : '')+'" data-act="vnChip" data-f="'+inputId+'" data-v="'+k+'">'+nhanMap[k]+'</button>'; }).join('')
    + '</div>';
}
function vnSheetKhung(tieuDe, noiDung, nutLuu, actLuu, actHuy){
  return '<div class="qa-scrim" data-act="'+actHuy+'"></div>'
    + '<div class="qa-sheet vn-sheet" role="dialog" aria-modal="true" aria-label="'+tieuDe+'"><div class="qa-grab"></div>'
    + '<div class="qa-head"><h3>'+tieuDe+'</h3><button type="button" class="qa-x" data-act="'+actHuy+'" aria-label="Đóng">'+icon('x')+'</button></div>'
    + '<div class="qa-body">'+noiDung+'</div>'
    + '<div class="qa-foot vn-foot"><button type="button" class="btn secondary" data-act="'+actHuy+'">Hủy</button>'
    + '<button type="button" class="btn" data-act="'+actLuu+'">'+nutLuu+'</button></div></div>';
}

function vayNoFormHtml(){
  var editing = state.vnFormId ? state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===state.vnFormId; }) : null;
  var d = editing || { ten:'', loaiVay:'ngan_hang', hinhThuc:'khong_lai', soTienGoc:'', ngayVay: todayStr(), ngayTraHangThang:'', soThangVay:'', ngayDaoHan:'', laiSuatNam:'' };
  var h = '';
  if (editing) h += '<div class="vn-note">'+icon('alert')+' Muốn sửa lịch sử trả nợ thì mở lịch trả của khoản vay (bấm "Xem lịch trả") rồi dùng "Hủy ghi nhận" / "Ghi nhận đã trả" — sửa ở đó mới đồng bộ được với Sổ tay.</div>';
  h += vnF('Tên / mô tả', '<input type="text" id="vn_vn_ten" value="'+esc(d.ten||'')+'" placeholder="VD: Vay mua xe">')
    + vnF('Loại vay', vnChipsHtml('vn_vn_loai', LOAI_VAY_LABEL, d.loaiVay))
    + vnF('Hình thức trả', vnChipsHtml('vn_vn_hinh', HINH_THUC_LABEL, d.hinhThuc))
    + '<div class="vn-2">'
    + vnF('Số tiền vay (gốc)', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_vn_soTien" value="'+veSo(d.soTienGoc)+'" placeholder="0">')
    + vnF('Ngày vay', '<input type="date" id="vn_vn_ngay" value="'+(d.ngayVay||todayStr())+'">')
    + vnF('Ngày trả hàng tháng', '<input type="number" id="vn_vn_ngayTra" value="'+(d.ngayTraHangThang||'')+'" placeholder="Theo ngày vay" min="1" max="31">')
    + vnF('Kỳ hạn (số tháng)', '<input type="number" id="vn_vn_soThang" value="'+(d.soThangVay||'')+'" placeholder="0" min="0">')
    + '</div>'
    + vnF('Ngày đáo hạn', '<input type="date" id="vn_vn_daoHan" value="'+(d.ngayDaoHan||'')+'">', 'tra_1_lan', 'Trả 1 lần: nhập ngày đáo hạn hoặc kỳ hạn (số tháng).')
    + vnF('Lãi suất %/năm', '<input type="number" id="vn_vn_laiSuat" value="'+(d.laiSuatNam||'')+'" placeholder="0" min="0" step="0.01">', 'co_lai goc_deu')
    + vnF('Số tiền trả mỗi tháng', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_vn_traThang" value="'+veSo(d.soTienTraThang)+'" placeholder="0">', 'tra_co_dinh')
    + vnViSelect('vn_vn_wallet', 'Ví nhận tiền vay / trả nợ', editing)
    // số thực trả khi tất toán thường THẤP hơn tổng còn phải trả theo lịch (lãi các kỳ sau
    // không phải trả) -> nhập 1 lần ở đây, hộp thoại Tất toán + tab Mô phỏng lấy làm mặc định
    + vnF('Số tiền tất toán dự kiến <span class="mp-hint">(tùy chọn)</span>', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_vn_tatToan" value="'+veSo(d.soTienTatToan)+'" placeholder="Bỏ trống = tự tính theo gốc còn lại">')
    // "Số kỳ đã trả" CHỈ có khi thêm mới (khoản vay cũ đã trả được mấy kỳ trước khi nhập vào app).
    // Khi SỬA thì không được có ô này: sửa số kỳ ở đây sẽ ghi đè lịch sử trả nợ thực tế
    // mà không sinh/xóa giao dịch tương ứng -> số dư lệch. Sửa lịch sử bằng "Hủy ghi nhận" ở lịch trả.
    + (editing ? '' : vnF('Số kỳ đã trả trước khi nhập vào đây', '<input type="number" id="vn_vn_daTraKy" value="" placeholder="0" min="0">'))
    + '<div class="vn-tom" id="vn_tom"></div>';
  return vnSheetKhung(editing ? 'Sửa khoản vay' : 'Thêm khoản vay', h, editing ? 'Lưu thay đổi' : 'Lưu khoản vay', 'vnSaveVayNo', 'vnCancelForm');
}

function choVayFormHtml(){
  var editing = state.vnFormId ? state.data.vayNo.choVay.find(function(x){ return x.id===state.vnFormId; }) : null;
  var d = editing || { ten:'', soTien:'', ngayChoVay: todayStr(), ngayDuKienThu:'' };
  var h = vnF('Tên / mô tả', '<input type="text" id="vn_cv_ten" value="'+esc(d.ten||'')+'" placeholder="VD: Cho Minh vay">')
    + vnF('Số tiền cho vay', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_cv_soTien" value="'+veSo(d.soTien)+'" placeholder="0">')
    + '<div class="vn-2">'
    + vnF('Ngày cho vay', '<input type="date" id="vn_cv_ngay" value="'+(d.ngayChoVay||todayStr())+'">')
    + vnF('Ngày dự kiến thu', '<input type="date" id="vn_cv_ngayThu" value="'+(d.ngayDuKienThu||'')+'">')
    + '</div>'
    + vnViSelect('vn_cv_wallet', 'Ví cho vay / nhận lại tiền', editing)
    + '<div class="vn-tom">Khi được trả lại, bấm "Tất toán" trên thẻ khoản này để ghi số tiền thu về.</div>';
  return vnSheetKhung(editing ? 'Sửa khoản cho vay' : 'Thêm khoản cho vay', h, 'Lưu khoản cho vay', 'vnSaveChoVay', 'vnCancelForm');
}

function vnSheetVe(){
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  if (state.tab !== 'vayno' && state.vnFormKind){ state.vnFormKind = null; state.vnFormId = null; }
  var root = document.getElementById('vnSheetRoot');
  var khoa = state.vnFormKind ? state.vnFormKind + ':' + (state.vnFormId || '') : '';
  if (root && root.getAttribute('data-key') === khoa) return;
  if (root && root.parentNode) root.parentNode.removeChild(root);
  if (!khoa){
    if (!vnMoKhoaNen()) document.body.classList.remove('qa-mo');
    return;
  }
  root = document.createElement('div');
  root.id = 'vnSheetRoot';
  root.className = 'qa-back moi';
  root.setAttribute('data-key', khoa);
  root.innerHTML = state.vnFormKind === 'choVay' ? choVayFormHtml() : vayNoFormHtml();
  document.body.appendChild(root);
  document.body.classList.add('qa-mo');
  vnKhopKhungNhin();
  vnLocTruong();
  vnTomCapNhat();
  setTimeout(function(){ root.classList.remove('moi'); }, 400);
}

// ẩn/hiện các ô theo "Hình thức trả" (các ô ẩn vẫn giữ giá trị, handler lưu vẫn đọc được)
function vnLocTruong(){
  var root = document.getElementById('vnSheetRoot'), inp = document.getElementById('vn_vn_hinh');
  if (!root || !inp) return;
  [].forEach.call(root.querySelectorAll('[data-ht]'), function(el){
    el.hidden = (' ' + el.getAttribute('data-ht') + ' ').indexOf(' ' + inp.value + ' ') < 0;
  });
}
// khối xem trước ở cuối form vay: số trả mỗi tháng, tổng lãi, tháng trả xong
function vnDocFormVay(){
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var ngayVay = g('vn_vn_ngay') || todayStr(), nt = g('vn_vn_ngayTra');
  return { hinhThuc: g('vn_vn_hinh') || 'khong_lai', soTienGoc: numNonNeg(docSo(g('vn_vn_soTien'))), ngayVay: ngayVay,
    ngayTraHangThang: nt ? Math.min(31, Math.max(1, Math.round(numNonNeg(nt)))) : parseInt(ngayVay.slice(8,10),10),
    soThangVay: numNonNeg(g('vn_vn_soThang')), ngayDaoHan: g('vn_vn_daoHan'), laiSuatNam: numNonNeg(g('vn_vn_laiSuat')),
    soTienTraThang: numNonNeg(docSo(g('vn_vn_traThang'))) };
}
function vnTomCapNhat(){
  var tom = document.getElementById('vn_tom');
  if (!tom || !document.getElementById('vn_vn_hinh')) return;
  var o = vnDocFormVay();
  if (!(o.soTienGoc > 0)){ tom.textContent = 'Nhập số tiền vay để xem tính toán.'; return; }
  if (o.hinhThuc !== 'tra_1_lan' && !(o.soThangVay > 0)){ tom.textContent = 'Nhập kỳ hạn (số tháng) để xem tính toán.'; return; }
  var sch = tinhLichTraNo(o);
  if (!sch.length){ tom.textContent = ''; return; }
  var lai = 0;
  sch.forEach(function(r){ lai += num(r.lai); });
  if (o.hinhThuc === 'tra_1_lan'){
    tom.innerHTML = 'Trả 1 lần <b>'+fmt(Math.round(sch[0].tongTra))+'</b> vào '+ngayVN(sch[0].ngayTra)+'.';
    return;
  }
  tom.innerHTML = (o.hinhThuc === 'goc_deu' ? 'Kỳ đầu trả ≈ <b>'+fmt(Math.round(sch[0].tongTra))+'</b>, giảm dần mỗi tháng' : 'Trả mỗi tháng ≈ <b>'+fmt(Math.round(sch[0].tongTra))+'</b>')
    + '<br>Tổng lãi ≈ <b>'+fmt(Math.round(lai))+'</b> · trả xong '+vnMkDai(sch[sch.length-1].mk);
}

function vnDlMo(cf){
  return new Promise(function(resolve){
    if (typeof document === 'undefined' || !document.body || !document.createElement || _modalDangMo){ resolve(null); return; }
    _modalDangMo = true;
    var back = document.createElement('div');
    back.id = 'vnDlRoot';
    back.className = 'qa-back moi';
    back.innerHTML = '<div class="qa-scrim" data-vn-x="1"></div>'
      + '<div class="qa-sheet vn-sheet" role="dialog" aria-modal="true" aria-label="'+esc(cf.tieuDe)+'"><div class="qa-grab"></div>'
      + '<div class="qa-head"><div><h3>'+esc(cf.tieuDe)+'</h3>'+(cf.phu ? '<div class="vn-sub">'+cf.phu+'</div>' : '')+'</div>'
      + '<button type="button" class="qa-x" data-vn-x="1" aria-label="Đóng">'+icon('x')+'</button></div>'
      + '<div class="qa-body">'+cf.body+'<div class="modal-err" id="vn_dl_err"></div></div>'
      + '<div class="qa-foot vn-foot"><button type="button" class="btn secondary" data-vn-x="1">Hủy</button>'
      + '<button type="button" class="btn'+(cf.nguy ? ' danger' : '')+'" id="vn_dl_ok">'+esc(cf.nutOk || 'Xác nhận')+'</button></div></div>';
    document.body.appendChild(back);
    document.body.classList.add('qa-mo');
    vnKhopKhungNhin();
    setTimeout(function(){ back.classList.remove('moi'); }, 400);
    var xong = false;
    function dong(kq){
      if (xong) return;
      xong = true;
      document.removeEventListener('keydown', onKey, true);
      if (back.parentNode) back.parentNode.removeChild(back);
      _modalDangMo = false;
      if (!vnMoKhoaNen()) document.body.classList.remove('qa-mo');
      resolve(kq);
    }
    function onKey(ev){ if (ev.key === 'Escape'){ ev.preventDefault(); dong(null); } }
    function chot(){
      var r = cf.lay(back);
      if (r && r.loi){ var e = document.getElementById('vn_dl_err'); if (e) e.textContent = r.loi; return; }
      dong(r);
    }
    back.addEventListener('click', function(ev){
      var t = ev.target;
      if (t && t.closest && t.closest('[data-vn-x]')) dong(null);
      else if (t && t.closest && t.closest('#vn_dl_ok')) chot();
    });
    back.addEventListener('input', function(){ if (cf.khiNhap) cf.khiNhap(back); });
    back.addEventListener('change', function(){ if (cf.khiNhap) cf.khiNhap(back); });
    document.addEventListener('keydown', onKey, true);
    if (cf.khiNhap) cf.khiNhap(back);
    var inp = back.querySelector('input[type=text]');
    if (inp){ inp.focus(); if (inp.select) inp.select(); }
  });
}
function vnDlTile(nhan, giaTri){
  return '<div class="vn-tile"><span>'+nhan+'</span><b>'+giaTri+'</b></div>';
}
function vnDlNgayVi(cu){
  return '<div class="vn-2">' + vnF('Ngày', '<input type="date" id="vn_dl_ngay" value="'+todayStr()+'">')
    + vnViSelect('vn_dl_vi', 'Ví', cu) + '</div>';
}
function vnDlViDoc(cu){
  var el = document.getElementById('vn_dl_vi');
  return (el && walletById(el.value)) ? el.value : ((cu && walletById(cu.walletId)) ? cu.walletId : viMacDinhId());
}

/* ---- hoàn tác phần ở KHOẢN VAY của 1 ref (phần journal do nơi gọi tự xóa) ----
   Dùng khi xóa 1 ngày ở Sổ tay: tiền mất khỏi journal thì tiến độ trả nợ / đã thu
   của khoản vay cũng phải lùi lại, không thì 2 bên lệch nhau. */
function loanRevertRef(r){
  if (r.loai === 'traNo'){
    var l = (state.data.vayNo.vayNoPhaiTra||[]).find(function(x){ return x.id === r.loanId; });
    if (!l) return;
    // 1 kỳ giờ có thể có nhiều LẦN trả -> xóa đúng lần trả theo rid, chỉ fallback
    // về xóa cả kỳ với dữ liệu cũ (ref chưa có rid)
    if (r.rid) l.traNo = (l.traNo||[]).filter(function(x){ return x.rid !== r.rid; });
    else       l.traNo = (l.traNo||[]).filter(function(x){ return num(x.ky) !== num(r.ky); });
    if (!l.tatToan && soTienConLaiPhaiTra(l) > 0.01) l.trangThai = 'dang_vay';
  } else if (r.loai === 'tatToan'){
    var l2 = (state.data.vayNo.vayNoPhaiTra||[]).find(function(x){ return x.id === r.loanId; });
    if (!l2) return;
    delete l2.tatToan;
    l2.trangThai = soTienConLaiPhaiTra(l2) > 0.01 ? 'dang_vay' : 'da_tra_het';
  } else if (r.loai === 'thuHoiChoVay'){
    var c = (state.data.vayNo.choVay||[]).find(function(x){ return x.id === r.loanId; });
    if (!c) return;
    c.daThu = Math.max(0, num(c.daThu) - num(r.soTien));
    if (!c.tatToan && conLaiPhaiThu(c) > 0.01) c.trangThai = 'dang_cho';
  }
  // nhanTienVay / choVay là giao dịch GỐC sinh ra khoản vay -> không hoàn ở đây,
  // phải sửa/xóa chính khoản vay ở tab Vay - Nợ (xem chặn ở delDay của sotay.js)
}

/* ---- xóa khoản vay: báo rõ sẽ xóa những giao dịch nào, số dư đổi thế nào ---- */
var REF_LABEL = {
  nhanTienVay: 'Nhận tiền vay',
  thuHoiChoVay: 'Thu hồi cho vay',
  choVay: 'Cho vay (chi)',
  traNo: 'Trả nợ',
  tatToan: 'Tất toán'
};
function vnLoanRefs(loanId){
  var out = [];
  Object.keys(state.data.journal).forEach(function(date){
    (state.data.journal[date].refs || []).forEach(function(r){
      if (r.loanId === loanId) out.push({ date: date, loai: r.loai, soTien: num(r.soTien) });
    });
  });
  out.sort(function(a,b){ return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return out;
}
// trả về Promise<bool> -> nơi gọi phải await (bọc trong IIFE async, xem handleVayNoAction)
function vnConfirmDelete(loanId, nhan){
  var refs = vnLoanRefs(loanId);
  var msg = '';
  if (!refs.length){
    msg = 'Không có giao dịch nào ở Sổ tay gắn với khoản này.';
  } else {
    var delta = 0;
    msg = 'Sẽ XÓA LUÔN ' + refs.length + ' giao dịch mà khoản này đã sinh ra ở Sổ tay:\n';
    refs.forEach(function(r, i){
      var m = REF_MAP[r.loai];
      var laThu = !!(m && m.kind === 'thu');
      delta += laThu ? -r.soTien : r.soTien;
      if (i < 15) msg += '  • ' + r.date + ' · ' + (REF_LABEL[r.loai]||r.loai) + ' · ' + fmt(r.soTien) + (laThu ? ' (thu)' : ' (chi)') + '\n';
    });
    if (refs.length > 15) msg += '  … và ' + (refs.length - 15) + ' giao dịch nữa\n';
    var cur = balanceAt('9999-12-31');
    msg += '\nSố dư hiện tại: ' + fmt(Math.round(cur))
         + '\nSố dư sau khi xóa: ' + fmt(Math.round(cur + delta));
  }
  return xacNhan('Xóa ' + nhan + ' này?', msg, { nguyHiem:true, chuOk:'Xóa' });
}

/* ---- xử lý sự kiện của tab Vay-Nợ ---- */
// trả về true nếu đã xử lý (để app.js biết không cần thử module khác)
function handleVayNoAction(act, el){
  if (act === 'vnAddChoVay'){
    state.vnFormKind = 'choVay'; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnAddVayNo'){
    state.vnFormKind = 'vayNoPhaiTra'; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnCuonTo'){
    var dichVn = document.getElementById((el.getAttribute('data-loai') === 'choVay' ? 'vn-cv-' : 'vn-vn-') + el.getAttribute('data-id'));
    if (dichVn){
      if (dichVn.scrollIntoView) dichVn.scrollIntoView({ behavior:'smooth', block:'center' });
      dichVn.classList.remove('vn-flash');
      void dichVn.offsetWidth;                      // chạy lại hiệu ứng nếu bấm lần 2
      dichVn.classList.add('vn-flash');
      setTimeout(function(){ dichVn.classList.remove('vn-flash'); }, 2000);
    }
  } else if (act === 'vnChip'){
    var oChip = document.getElementById(el.getAttribute('data-f'));
    if (oChip) oChip.value = el.getAttribute('data-v');
    [].forEach.call(el.parentNode.querySelectorAll('.qa-chip'), function(b){ b.classList.toggle('on', b === el); });
    if (el.getAttribute('data-f') === 'vn_vn_hinh') vnLocTruong();
    vnTomCapNhat();
  } else if (act === 'vnHorizon'){
    state.vnHorizon = parseInt(el.getAttribute('data-h'), 10) || 12;
    renderVayNo();
  } else if (act === 'vnHetThang'){
    state.vnHetThang = !state.vnHetThang;
    renderVayNo();
  } else if (act === 'vnXong'){
    state.vnXong = !state.vnXong;
    renderVayNo();
  } else if (act === 'vnLichAll'){
    var idLA = el.getAttribute('data-id');
    state.vnLichAll = state.vnLichAll || {};
    state.vnLichAll[idLA] = !state.vnLichAll[idLA];
    var yLA = window.scrollY;
    renderVayNo();
    window.scrollTo(0, yLA);
  } else if (act === 'vnCancelForm'){
    state.vnFormKind = null; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnEditChoVay'){
    state.vnFormKind = 'choVay'; state.vnFormId = el.getAttribute('data-id'); renderVayNo();
  } else if (act === 'vnEditVayNo'){
    state.vnFormKind = 'vayNoPhaiTra'; state.vnFormId = el.getAttribute('data-id'); renderVayNo();
  } else if (act === 'vnSaveChoVay'){
    var tenCV = document.getElementById('vn_cv_ten').value.trim();
    if (!tenCV){ toast('Nhập tên khoản cho vay.', { loai:'warn' }); return true; }
    var cvCu = state.vnFormId ? state.data.vayNo.choVay.find(function(x){ return x.id===state.vnFormId; }) : null;
    var objCV = {
      walletId: vnViTuForm('vn_cv_wallet', cvCu),
      ten: tenCV,
      soTien: numNonNeg(docSo(document.getElementById('vn_cv_soTien').value)),
      ngayChoVay: document.getElementById('vn_cv_ngay').value || todayStr(),
      ngayDuKienThu: document.getElementById('vn_cv_ngayThu').value || ''
    };
    // ngày dự kiến thu không được trước ngày cho vay
    if (objCV.ngayDuKienThu && objCV.ngayDuKienThu < objCV.ngayChoVay){
      toast('Ngày dự kiến thu ('+objCV.ngayDuKienThu+') không được trước ngày cho vay ('+objCV.ngayChoVay+').', { loai:'err' });
      return true;
    }
    var cvId;
    if (state.vnFormId){
      var oldCV = state.data.vayNo.choVay.find(function(x){ return x.id===state.vnFormId; });
      Object.assign(oldCV, objCV);
      cvId = oldCV.id;
    } else {
      objCV.id = 'cv_' + slugify(tenCV) + '_' + Date.now().toString(36);
      objCV.daThu = 0;
      objCV.trangThai = 'dang_cho';
      state.data.vayNo.choVay.push(objCV);
      cvId = objCV.id;
    }
    // Cho vay = tiền RA khỏi ví -> phải ghi chi, đối xứng với "Nhận tiền vay".
    // upsert: sửa số/ngày thì giao dịch cũ bị xóa rồi ghi lại, không cộng dồn.
    if (objCV.soTien > 0){
      journalUpsertRef(objCV.ngayChoVay, cvId, 'choVay', objCV.soTien, 'Cho vay: ' + objCV.ten);
    } else {
      journalRemoveRefs(cvId, 'choVay', null);
    }
    state.vnFormKind = null; state.vnFormId = null;
    scheduleSave(); renderVayNo();
    toast('Đã lưu khoản cho vay "'+tenCV+'".');
  } else if (act === 'vnSaveVayNo'){
    var tenVN = document.getElementById('vn_vn_ten').value.trim();
    if (!tenVN){ toast('Nhập tên khoản vay.', { loai:'warn' }); return true; }
    var hinh = document.getElementById('vn_vn_hinh').value;
    var ngayVayVN = document.getElementById('vn_vn_ngay').value || todayStr();
    // "Ngày trả hàng tháng" là ô nhập tay riêng (chỉ số 1-31), tách biệt với ngày vay;
    // bỏ trống thì tạm lấy theo ngày-trong-tháng của ngày vay cho tiện
    var ngayTraInputVN = document.getElementById('vn_vn_ngayTra').value;
    var ngayTraHangThangVN = ngayTraInputVN
      ? Math.min(31, Math.max(1, Math.round(numNonNeg(ngayTraInputVN))))
      : parseInt(ngayVayVN.slice(8,10),10);
    var objVN = {
      ten: tenVN,
      loaiVay: document.getElementById('vn_vn_loai').value,
      hinhThuc: hinh,
      soTienGoc: numNonNeg(docSo(document.getElementById('vn_vn_soTien').value)),
      ngayVay: ngayVayVN,
      ngayTraHangThang: ngayTraHangThangVN,
      soThangVay: numNonNeg(document.getElementById('vn_vn_soThang').value),
      ngayDaoHan: document.getElementById('vn_vn_daoHan').value || '',
      laiSuatNam: numNonNeg(document.getElementById('vn_vn_laiSuat').value),
      soTienTraThang: numNonNeg(docSo(document.getElementById('vn_vn_traThang').value)),
      walletId: vnViTuForm('vn_vn_wallet', state.vnFormId ? state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===state.vnFormId; }) : null),
      soTienTatToan: numNonNeg(docSo(document.getElementById('vn_vn_tatToan').value))
    };
    if (hinh === 'tra_1_lan' && !objVN.ngayDaoHan && !objVN.soThangVay){
      toast('Nhập ngày đáo hạn hoặc kỳ hạn (số tháng) cho khoản vay trả 1 lần.', { loai:'warn' }); return true;
    }
    if (hinh !== 'tra_1_lan' && !objVN.soThangVay){
      toast('Nhập kỳ hạn (số tháng) trả.', { loai:'warn' }); return true;
    }
    if (hinh === 'tra_co_dinh'){
      if (!objVN.soTienTraThang){ toast('Nhập số tiền trả mỗi tháng.', { loai:'warn' }); return true; }
      if (objVN.soTienTraThang * objVN.soThangVay < objVN.soTienGoc - 0.5){
        toast('Trả ' + fmt(objVN.soTienTraThang) + ' × ' + objVN.soThangVay + ' tháng = ' + fmt(objVN.soTienTraThang * objVN.soThangVay)
          + ', ít hơn số tiền vay ' + fmt(objVN.soTienGoc) + '. Kiểm tra lại số tiền hoặc số tháng.', { loai:'warn' }); return true;
      }
    }
    var vnTarget = state.vnFormId
      ? state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===state.vnFormId; })
      : null;
    var schVN = tinhLichTraNo(objVN);

    /* Nhánh SỬA có thể phải hỏi (kỳ hạn rút ngắn làm mồ côi kỳ đã trả), hộp thoại
       mới trả Promise -> tách thành closure để gọi được sau khi Đạt trả lời.
       KHÔNG biến handleVayNoAction thành async: dispatcher đọc kết quả đồng bộ. */
    function vnKetThuc(){
      state.vnFormKind = null; state.vnFormId = null;
      scheduleSave(); renderVayNo();
      toast('Đã lưu khoản vay "'+tenVN+'".');
    }
    function vnApDungSua(){
      Object.assign(vnTarget, objVN);
      if (orphanVN.length){
        orphanVN.forEach(function(r){ journalRemoveRefs(vnTarget.id, 'traNo', r.ky); });
        vnTarget.traNo = (vnTarget.traNo||[]).filter(function(r){ return num(r.ky) < schVN.length; });
      }
      if (soTienConLaiPhaiTra(vnTarget) <= 0.01 && schVN.length) vnTarget.trangThai = 'da_tra_het';
      else if (!vnTarget.tatToan) vnTarget.trangThai = 'dang_vay';
      // sửa gốc/ngày vay -> cập nhật luôn giao dịch "Nhận tiền vay" đã sinh ra trước đó
      if (vnTarget.soTienGoc > 0){
        journalUpsertRef(vnTarget.ngayVay, vnTarget.id, 'nhanTienVay', vnTarget.soTienGoc, 'Nhận tiền vay: ' + vnTarget.ten);
      } else {
        journalRemoveRefs(vnTarget.id, 'nhanTienVay', null);
      }
      vnKetThuc();
    }
    var orphanVN = [];
    if (vnTarget){
      // kỳ hạn bị rút ngắn -> các kỳ đã ghi nhận vượt ngoài lịch mới là vô nghĩa,
      // phải hoàn lại giao dịch Sổ tay của chúng, không được để lại ref mồ côi.
      // Kiểm tra TRƯỚC Object.assign: bấm Hủy mà khoản vay đã bị ghi đè dở dang
      // thì dữ liệu sai âm thầm (lỗi của bản cũ).
      orphanVN = (vnTarget.traNo||[]).filter(function(r){ return num(r.ky) >= schVN.length; });
      if (orphanVN.length){
        (async function(){
          if (!await xacNhan('Kỳ hạn mới ngắn hơn số kỳ đã ghi nhận',
                'Lịch mới chỉ còn '+schVN.length+' kỳ, nhưng đang có '+orphanVN.length
                + ' kỳ đã ghi nhận trả nằm ngoài lịch mới.\n\n'
                + 'Tiếp tục sẽ HỦY ghi nhận các kỳ đó và hoàn lại giao dịch tương ứng ở Sổ tay.',
                { nguyHiem:true, chuOk:'Tiếp tục' })) return;
          vnApDungSua();
        })();
        return true;
      }
      vnApDungSua();
      return true;
    } else {
      objVN.id = 'vn_' + slugify(tenVN) + '_' + Date.now().toString(36);
      objVN.trangThai = 'dang_vay';
      // số kỳ đã trả TRƯỚC khi nhập vào app: dựng sẵn traNo[] theo đúng lịch,
      // gắn truocKhiDungApp để không sinh giao dịch Sổ tay (tiền đã đi từ trước)
      var daTraKyInput = Math.max(0, Math.floor(numNonNeg(document.getElementById('vn_vn_daTraKy').value)));
      daTraKyInput = Math.min(daTraKyInput, schVN.length);
      objVN.traNo = [];
      for (var iDK=0; iDK<daTraKyInput; iDK++){
        // dongKy + rid đặt ngay (normalizeData chỉ bù khi tải lại): thiếu thì tới lúc tải lại
        // các kỳ này hiện là "trả dở" và tiến độ báo 0 kỳ
        objVN.traNo.push({ rid: 'r' + iDK + '_' + iDK + '_' + objVN.ngayVay, ky: iDK, mk: schVN[iDK].mk, soTien: schVN[iDK].tongTra, ngay: objVN.ngayVay, dongKy: true, truocKhiDungApp: true });
      }
      if (daTraKyInput >= schVN.length && schVN.length) objVN.trangThai = 'da_tra_het';
      state.data.vayNo.vayNoPhaiTra.push(objVN);
      if (objVN.soTienGoc > 0){
        journalUpsertRef(objVN.ngayVay || todayStr(), objVN.id, 'nhanTienVay', objVN.soTienGoc, 'Nhận tiền vay: ' + objVN.ten);
      }
    }
    vnKetThuc();
  } else if (act === 'vnDelChoVay'){
    var idDC = el.getAttribute('data-id');
    (async function(){
      if (!await vnConfirmDelete(idDC, 'khoản cho vay')) return;
      journalRemoveLoanRefs(idDC);
      state.data.vayNo.choVay = state.data.vayNo.choVay.filter(function(x){ return x.id!==idDC; });
      scheduleSave(); renderVayNo();
      toast('Đã xóa khoản cho vay.');
    })();
  } else if (act === 'vnDelVayNo'){
    var idDV = el.getAttribute('data-id');
    (async function(){
      if (!await vnConfirmDelete(idDV, 'khoản vay')) return;
      journalRemoveLoanRefs(idDV);
      state.data.vayNo.vayNoPhaiTra = state.data.vayNo.vayNoPhaiTra.filter(function(x){ return x.id!==idDV; });
      scheduleSave(); renderVayNo();
      toast('Đã xóa khoản vay.');
    })();
  } else if (act === 'vnToggleDetail'){
    var idTD = el.getAttribute('data-id');
    state.vnDetailId = (state.vnDetailId === idTD) ? null : idTD;
    var yTD = window.scrollY;
    renderVayNo();
    window.scrollTo(0, yTD); // render lại innerHTML có thể làm trang nhảy; giữ nguyên vị trí đang xem
  } else if (act === 'vnTatToanChoVay'){
    // TẤT TOÁN cho vay = ghi số tiền THỰC THU: sinh giao dịch thu "Thu hồi cho vay" ở Sổ tay (có ref gắn khoản).
    // Thu thiếu thì chọn: thu một phần (khoản vẫn mở) hoặc tất toán (phần thiếu = xóa nợ, đóng khoản).
    var idTCV = el.getAttribute('data-id');
    var cvT = state.data.vayNo.choVay.find(function(x){ return x.id===idTCV; });
    if (!cvT) return true;
    var conT = conLaiPhaiThu(cvT);
    if (conT <= 0) return true;
    (async function(){
      var capNhat = function(root){
        var so = numNonNeg(docSo(root.querySelector('#vn_dl_so').value));
        var thieu = so > 0 && so < conT - 1;
        var kn = root.querySelector('#vn_dl_kieu');
        if (kn) kn.hidden = !thieu;
        var tx = root.querySelector('#vn_dl_thieu');
        if (tx) tx.textContent = 'Ít hơn số còn phải thu ' + fmt(Math.round(conT)) + '. Phần thiếu ' + fmt(Math.round(Math.max(0, conT - so))) + ' sẽ:';
      };
      var kq = await vnDlMo({
        tieuDe: 'Tất toán · ' + cvT.ten,
        phu: cvT.ngayDuKienThu ? 'Dự kiến thu ' + ngayVN(cvT.ngayDuKienThu) : '',
        nutOk: 'Ghi thu tiền',
        body: vnDlTile('Còn phải thu', fmt(Math.round(conT)))
          + vnF('Số tiền thực thu', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_dl_so" value="' + veSo(Math.round(conT)) + '" placeholder="0">')
          + '<div id="vn_dl_kieu" hidden><div class="vn-hint" id="vn_dl_thieu"></div>'
          + '<label class="vn-opt"><input type="radio" name="vn_dl_k" value="no" checked><span><b>Thu một phần, sẽ thu tiếp</b><br><small>Khoản vẫn mở, phần thiếu vẫn là tiền phải thu.</small></span></label>'
          + '<label class="vn-opt"><input type="radio" name="vn_dl_k" value="xong"><span><b>Tất toán, phần thiếu xóa nợ</b><br><small>Khoản đóng; phần thiếu coi như không đòi được (không ghi giao dịch).</small></span></label></div>'
          + vnDlNgayVi(cvT)
          + '<div class="vn-tom">Ghi một giao dịch thu "Thu hồi cho vay" vào Sổ tay đúng ngày và ví đã chọn.</div>',
        khiNhap: capNhat,
        lay: function(root){
          var so = numNonNeg(docSo(root.querySelector('#vn_dl_so').value));
          if (!(so > 0)) return { loi: 'Nhập số lớn hơn 0.' };
          if (so > conT + 0.01) return { loi: 'Không được lớn hơn số còn phải thu (' + fmt(Math.round(conT)) + ').' };
          var ngay = root.querySelector('#vn_dl_ngay').value;
          if (!ngay) return { loi: 'Chọn ngày thu.' };
          var xong = root.querySelector('input[name=vn_dl_k]:checked');
          return { so: so, ngay: ngay, viId: vnDlViDoc(cvT), tatToan: so < conT - 1 && !!xong && xong.value === 'xong' };
        }
      });
      if (!kq) return;
      var thieuT = choVayGhiThu(cvT, kq.so, kq.ngay, kq.viId, kq.tatToan);
      scheduleSave(); renderVayNo();
      toast('Đã ghi thu ' + fmt(Math.round(kq.so)) + ' từ khoản "' + cvT.ten + '".' + (kq.tatToan && thieuT > 0.01 ? ' Phần thiếu ' + fmt(Math.round(thieuT)) + ' đã xóa nợ.' : ''));
    })();
  } else if (act === 'vnXoaNoChoVay'){
    // XÓA NỢ cho vay = bỏ phần không đòi được. Xóa HẾT phần còn lại -> đóng khoản (tatToan);
    // xóa MỘT PHẦN -> ghi vào daBo, khoản vẫn mở để thu tiếp. KHÔNG sinh giao dịch nào ở Sổ tay:
    // tiền chi đã ghi đủ lúc cho vay, tiền thu chỉ ghi phần thực nhận -> số dư vốn đã đúng,
    // ghi thêm là đếm 2 lần.
    var idTTCV = el.getAttribute('data-id');
    var cvTT = state.data.vayNo.choVay.find(function(x){ return x.id===idTTCV; });
    if (!cvTT) return true;
    var boTT = conLaiPhaiThu(cvTT);
    if (boTT <= 0) return true;
    (async function(){
      var soBo = await hoiSo('Xóa nợ bao nhiêu của khoản "'+cvTT.ten+'"?',
        'Còn phải thu '+fmt(Math.round(boTT))+'. Nhập đúng số này để xóa nợ cả khoản (khoản đóng); nhập ít hơn thì chỉ xóa phần đó, khoản vẫn mở để thu tiếp. Không ghi giao dịch nào ở Sổ tay.',
        'Số tiền xóa nợ', Math.round(boTT));
      if (soBo == null) return;
      var loaiBo = loaiBoChoVay(cvTT, soBo);
      if (loaiBo === 'qua-so'){ toast('Số tiền xóa nợ không được lớn hơn phần còn phải thu ('+fmt(Math.round(boTT))+').'); return; }
      if (loaiBo === 'mot-phan'){
        choVayBoMotPhan(cvTT, soBo);
        scheduleSave(); renderVayNo();
        toast('Đã xóa nợ '+fmt(Math.round(soBo))+' của khoản "'+cvTT.ten+'", còn phải thu '+fmt(Math.round(conLaiPhaiThu(cvTT)))+'.');
        return;
      }
      if (!await xacNhan('Xóa nợ khoản cho vay "'+cvTT.ten+'"?',
            'Còn phải thu '+fmt(Math.round(boTT))+' sẽ coi như KHÔNG ĐÒI ĐƯỢC và bỏ qua.\n\n'
            + 'Không có giao dịch nào được ghi ở Sổ tay (số dư đã đúng từ trước).',
            { nguyHiem:true, chuOk:'Xóa nợ' })) return;
      cvTT.tatToan = { soTien: boTT, ngay: todayStr() };
      cvTT.trangThai = 'da_thu_du';
      scheduleSave(); renderVayNo();
      toast('Đã xóa nợ khoản cho vay "'+cvTT.ten+'".');
    })();
  } else if (act === 'vnHoanBoChoVay'){
    var idHB = el.getAttribute('data-id');
    var cvHB = state.data.vayNo.choVay.find(function(x){ return x.id===idHB; });
    var lanBo = cvHB && choVayHoanBo(cvHB);
    if (!lanBo) return true;
    scheduleSave(); renderVayNo();
    toast('Đã hoàn lại '+fmt(Math.round(num(lanBo.soTien)))+' đã xóa nợ.');
  } else if (act === 'vnHuyTatToanChoVay'){
    var idHTT = el.getAttribute('data-id');
    var cvHTT = state.data.vayNo.choVay.find(function(x){ return x.id===idHTT; });
    if (!cvHTT || !cvHTT.tatToan) return true;
    cvHTT.tatToan = null;
    cvHTT.trangThai = conLaiPhaiThu(cvHTT) <= 0.01 ? 'da_thu_du' : 'dang_cho';
    scheduleSave(); renderVayNo();
  } else if (act === 'vnGhiNhanTra'){
    var idGTr = el.getAttribute('data-id');
    var vnItem = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idGTr; });
    if (!vnItem) return true;
    var kyGTr = parseInt(el.getAttribute('data-ky'), 10);
    var mkGTr = el.getAttribute('data-mk');
    if (isNaN(kyGTr) || kyDaDong(vnItem, kyGTr)) return true;
    var schGTr = tinhLichTraNo(vnItem);
    if (!schGTr[kyGTr]) return true;
    var canKy = num(schGTr[kyGTr].tongTra);
    var daKy = soTienTraKy(vnItem, kyGTr);
    var conThieu = Math.max(0, canKy - daKy);
    (async function(){
      var thieuPhanTram = function(root){
        var so = numNonNeg(docSo(root.querySelector('#vn_dl_so').value));
        var thieu = so > 0 && so < conThieu - 1;
        var kn = root.querySelector('#vn_dl_kieu');
        if (kn) kn.hidden = !thieu;
        var tx = root.querySelector('#vn_dl_thieu');
        if (tx) tx.textContent = 'Ít hơn số phải trả ' + fmt(Math.round(conThieu)) + '. Kỳ này sẽ:';
        var xong = root.querySelector('input[name=vn_dl_k]:checked');
        var ok = root.querySelector('#vn_dl_ok');
        if (ok) ok.textContent = (thieu && xong && xong.value === 'no') ? 'Lưu, trả một phần' : 'Ghi nhận';
      };
      var kq = await vnDlMo({
        tieuDe: 'Ghi nhận đã trả · Kỳ ' + (kyGTr+1),
        phu: esc(vnItem.ten) + ' · hạn ' + ngayVN(schGTr[kyGTr].ngayTra),
        nutOk: 'Ghi nhận',
        body: vnDlTile(daKy > 0 ? 'Còn phải trả kỳ này' : 'Số tiền kỳ này', fmt(Math.round(conThieu)))
          + (daKy > 0 ? '<div class="vn-hint">Theo lịch ' + fmt(Math.round(canKy)) + ' · đã trả ' + fmt(Math.round(daKy)) + '</div>' : '')
          + vnF('Số tiền đã trả', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_dl_so" value="' + veSo(Math.round(conThieu)) + '" placeholder="0">')
          + '<div id="vn_dl_kieu" hidden><div class="vn-hint" id="vn_dl_thieu"></div>'
          + '<label class="vn-opt"><input type="radio" name="vn_dl_k" value="no" checked><span><b>Trả một phần, sẽ trả tiếp</b><br><small>Kỳ vẫn mở, phần thiếu vẫn nằm trong dư nợ. Lần sau bấm "Trả tiếp".</small></span></label>'
          + '<label class="vn-opt"><input type="radio" name="vn_dl_k" value="xong"><span><b>Đóng kỳ</b><br><small>Kỳ ghi "xong kỳ (thiếu …)", chênh lệch bỏ qua, chuyển sang kỳ sau.</small></span></label></div>'
          + vnDlNgayVi(vnItem),
        khiNhap: thieuPhanTram,
        lay: function(root){
          var so = numNonNeg(docSo(root.querySelector('#vn_dl_so').value));
          if (!(so > 0)) return { loi: 'Nhập số lớn hơn 0.' };
          var ngay = root.querySelector('#vn_dl_ngay').value;
          if (!ngay) return { loi: 'Chọn ngày trả.' };
          var xong = root.querySelector('input[name=vn_dl_k]:checked');
          // trả đủ -> xong kỳ; trả thiếu mà không chọn "Đóng kỳ" -> kỳ còn nợ tiếp (hướng an toàn)
          return { so: so, ngay: ngay, viId: vnDlViDoc(vnItem),
                   dongKy: !(so < conThieu - 1) || (xong && xong.value === 'xong') };
        }
      });
      if (!kq) return;
      var ridG = 'r' + kyGTr + '_' + Date.now().toString(36);
      vnItem.traNo = vnItem.traNo || [];
      vnItem.traNo.push({ rid: ridG, ky: kyGTr, mk: mkGTr, soTien: kq.so, ngay: kq.ngay, dongKy: kq.dongKy });
      journalAddRef(kq.ngay, vnItem.id, 'traNo', kq.so, 'Trả nợ: '+vnItem.ten+' (kỳ '+(kyGTr+1)+')', { ky: kyGTr, rid: ridG, walletId: kq.viId });
      if (soTienConLaiPhaiTra(vnItem) <= 0.01) vnItem.trangThai = 'da_tra_het';
      scheduleSave(); renderVayNo();
      toast('Đã ghi nhận trả '+fmt(Math.round(kq.so))+' cho kỳ '+(kyGTr+1)+'.');
    })();
  } else if (act === 'vnDongKy' || act === 'vnMoLaiKy'){
    // chỉ bật/tắt cờ "xong kỳ", KHÔNG đụng vào tiền đã trả lẫn giao dịch Sổ tay
    var idDK = el.getAttribute('data-id');
    var vnDK = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idDK; });
    if (!vnDK) return true;
    var kyDK = parseInt(el.getAttribute('data-ky'), 10);
    var recsDK = isNaN(kyDK) ? [] : kyRecords(vnDK, kyDK);
    if (!recsDK.length) return true;
    if (act === 'vnDongKy'){
      var thieuDK = conThieuKy(vnDK, kyDK);
      (async function(){
        if (!await xacNhan('Đóng kỳ '+(kyDK+1)+' dù còn thiếu '+fmt(Math.round(thieuDK))+'?',
              'Phần thiếu sẽ chuyển sang mục chênh lệch, không còn tính vào dư nợ.',
              { chuOk:'Đóng kỳ' })) return;
        recsDK[recsDK.length-1].dongKy = true;
        if (soTienConLaiPhaiTra(vnDK) <= 0.01) vnDK.trangThai = 'da_tra_het';
        scheduleSave(); renderVayNo();
        toast('Đã đóng kỳ '+(kyDK+1)+'.');
      })();
      return true;
    }
    recsDK.forEach(function(r){ r.dongKy = false; });
    if (!vnDK.tatToan && soTienConLaiPhaiTra(vnDK) > 0.01) vnDK.trangThai = 'dang_vay';
    scheduleSave(); renderVayNo();
    toast('Đã mở lại kỳ '+(kyDK+1)+'.');
  } else if (act === 'vnHuyGhiNhanTra'){
    var idHuy = el.getAttribute('data-id');
    var vnHuy = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idHuy; });
    if (!vnHuy) return true;
    var kyHuy = parseInt(el.getAttribute('data-ky'), 10);
    if (isNaN(kyHuy) || !kyDaGhiNhan(vnHuy, kyHuy)) return true;
    var recsHuy = kyRecords(vnHuy, kyHuy);
    var daHuy = soTienTraKy(vnHuy, kyHuy);
    var truoc = recsHuy.every(function(r){ return r.truocKhiDungApp; });
    (async function(){
      if (!await xacNhan('Hủy ghi nhận trả kỳ '+(kyHuy+1)+'?',
            recsHuy.length+' lần trả, tổng '+fmt(Math.round(daHuy))+'.\n\n'
            + (truoc ? 'Kỳ này được khai là đã trả trước khi dùng app nên không có giao dịch Sổ tay để hoàn.'
                     : 'Các giao dịch "Trả nợ" tương ứng ở Sổ tay sẽ bị xóa, số dư hoàn lại.'),
            { nguyHiem:true, chuOk:'Hủy ghi nhận' })) return;
      journalRemoveRefs(vnHuy.id, 'traNo', kyHuy);
      vnHuy.traNo = (vnHuy.traNo||[]).filter(function(r){ return num(r.ky) !== kyHuy; });
      if (!vnHuy.tatToan && soTienConLaiPhaiTra(vnHuy) > 0.01) vnHuy.trangThai = 'dang_vay';
      scheduleSave(); renderVayNo();
      toast('Đã hủy ghi nhận trả kỳ '+(kyHuy+1)+'.');
    })();
  } else if (act === 'vnTatToan'){
    var idTT = el.getAttribute('data-id');
    var vnTT = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idTT; });
    if (!vnTT) return true;
    var duNoTT = soTienConLaiPhaiTra(vnTT);
    var gocTT = gocConLai(vnTT);
    var duKienTT = num(vnTT.soTienTatToan);   // số đã nhập ở form khoản vay (0 = chưa nhập)
    (async function(){
      var kq = await vnDlMo({
        tieuDe: 'Tất toán khoản vay',
        phu: esc(vnTT.ten),
        nutOk: 'Tất toán',
        nguy: true,
        body: vnDlTile('Dư nợ còn lại theo lịch', fmt(Math.round(duNoTT)))
          + '<div class="vn-hint">Gốc còn lại ' + fmt(Math.round(gocTT)) + (duKienTT > 0 ? ' · số tất toán dự kiến ' + fmt(Math.round(duKienTT)) : '') + '</div>'
          + vnF('Số tiền thực trả', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_dl_so" value="' + veSo(Math.round(duKienTT > 0 ? duKienTT : gocTT)) + '" placeholder="0">',
              '', 'Tất toán sớm thường chỉ trả gốc còn lại + lãi/phí tới ngày tất toán nên THẤP hơn tổng theo lịch. Nhập đúng số ngân hàng / bên cho vay báo.')
          + vnDlNgayVi(vnTT)
          + '<div class="vn-tom">Khoản vay chuyển sang "Đã tất toán", dư nợ về 0 và ghi một giao dịch trả nợ vào Sổ tay.</div>',
        lay: function(root){
          var so = numNonNeg(docSo(root.querySelector('#vn_dl_so').value));
          if (!(so > 0)) return { loi: 'Nhập số lớn hơn 0.' };
          var ngay = root.querySelector('#vn_dl_ngay').value;
          if (!ngay) return { loi: 'Chọn ngày tất toán.' };
          return { so: so, ngay: ngay, viId: vnDlViDoc(vnTT) };
        }
      });
      if (!kq) return;
      // ghi nhận tất toán vào DATA (không chỉ là đổi trạng thái): số tiền + ngày,
      // kèm giao dịch chi ở Sổ tay có ref để xóa khoản vay thì hoàn lại được
      vnTT.tatToan = { soTien: kq.so, ngay: kq.ngay };
      vnTT.trangThai = 'da_tra_het';
      journalAddRef(kq.ngay, vnTT.id, 'tatToan', kq.so, 'Tất toán: '+vnTT.ten, { walletId: kq.viId });
      scheduleSave(); renderVayNo();
      toast('Đã tất toán "'+vnTT.ten+'" với số tiền '+fmt(Math.round(kq.so))+'.');
    })();
  } else if (act === 'vnHuyTatToan'){
    var idHTTV = el.getAttribute('data-id');
    var vnHTTV = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idHTTV; });
    if (!vnHTTV || !vnHTTV.tatToan) return true;
    (async function(){
      if (!await xacNhan('Hủy tất toán khoản "'+vnHTTV.ten+'"?',
            'Giao dịch "Tất toán" '+fmt(Math.round(vnHTTV.tatToan.soTien))+' ở Sổ tay sẽ bị xóa, dư nợ tính lại theo lịch.',
            { nguyHiem:true, chuOk:'Hủy tất toán' })) return;
      journalRemoveRefs(vnHTTV.id, 'tatToan', null);
      vnHTTV.tatToan = null;
      vnHTTV.trangThai = (soTienConLaiPhaiTra(vnHTTV) <= 0.01) ? 'da_tra_het' : 'dang_vay';
      scheduleSave(); renderVayNo();
      toast('Đã hủy tất toán "'+vnHTTV.ten+'".');
    })();
  } else {
    return false;
  }
  return true;
}

// form vay: gõ vào ô nào thì cập nhật khối xem trước (số trả mỗi tháng, tổng lãi, tháng trả xong)
function handleVayNoInput(el){
  if (!el || !el.id || el.id.indexOf('vn_vn_') !== 0) return false;
  vnTomCapNhat();
  return true;
}
function handleVayNoChange(el){
  if (el && el.id && el.id.indexOf('vn_vn_') === 0){ vnTomCapNhat(); return true; }
  return false;
}
