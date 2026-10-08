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
function conLaiPhaiThu(loan){
  if (loan.tatToan) return 0;
  return Math.max(0, num(loan.soTien) - num(loan.daThu));
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
    var ky = tienDoTraNo(v).kyTiepTheo;
    if (!ky) return;
    var soNgay = daysBetween(todayStr(), ky.ngayTra);
    if (soNgay <= nNgay) out.push({ loai: 'vayNo', id: v.id, ten: v.ten, ngay: ky.ngayTra, soNgay: soNgay, soTien: ky.tongTra });
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
  return Math.max(0, num(loan.soTien) - da);
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
function vnViSelectHtml(selId, nhan, cu){
  if ((state.data.wallets || []).length < 2) return '';
  return '<div><label>'+nhan+'</label><select id="'+selId+'">'+viOptionsHtml((cu && cu.walletId) || viMacDinhId())+'</select></div>';
}

/* ---- render ---- */
function choVayFormHtml(){
  var editing = state.vnFormId ? state.data.vayNo.choVay.find(function(x){ return x.id===state.vnFormId; }) : null;
  var d = editing || { ten:'', soTien:'', ngayChoVay: todayStr(), ngayDuKienThu:'' };
  return '<div class="form-row" style="margin-top:10px">'
    + '<div><label>Tên / mô tả</label><input type="text" id="vn_cv_ten" value="'+(d.ten||'').replace(/"/g,'&quot;')+'"></div>'
    + '<div><label>Số tiền cho vay</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_cv_soTien" value="'+veSo(d.soTien)+'" placeholder="0"></div>'
    + '<div><label>Ngày cho vay</label><input type="date" id="vn_cv_ngay" value="'+(d.ngayChoVay||todayStr())+'"></div>'
    + '<div><label>Ngày dự kiến thu</label><input type="date" id="vn_cv_ngayThu" value="'+(d.ngayDuKienThu||'')+'"></div>'
    + vnViSelectHtml('vn_cv_wallet', 'Ví cho vay / nhận lại tiền', editing)
    + '</div><div style="display:flex;gap:8px;margin-bottom:12px">'
    + '<button class="btn sm" data-act="vnSaveChoVay">Lưu</button>'
    + '<button class="btn secondary sm" data-act="vnCancelForm">Hủy</button></div>';
}

function vayNoFormHtml(){
  var editing = state.vnFormId ? state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===state.vnFormId; }) : null;
  var d = editing || { ten:'', loaiVay:'ngan_hang', hinhThuc:'khong_lai', soTienGoc:'', ngayVay: todayStr(), ngayTraHangThang:'', soThangVay:'', ngayDaoHan:'', laiSuatNam:'' };
  var loaiOpts = Object.keys(LOAI_VAY_LABEL).map(function(k){ return '<option value="'+k+'"'+(d.loaiVay===k?' selected':'')+'>'+LOAI_VAY_LABEL[k]+'</option>'; }).join('');
  var hinhOpts = Object.keys(HINH_THUC_LABEL).map(function(k){ return '<option value="'+k+'"'+(d.hinhThuc===k?' selected':'')+'>'+HINH_THUC_LABEL[k]+'</option>'; }).join('');
  return '<div class="form-row" style="margin-top:10px">'
    + '<div><label>Tên / mô tả</label><input type="text" id="vn_vn_ten" value="'+(d.ten||'').replace(/"/g,'&quot;')+'"></div>'
    + '<div><label>Loại vay</label><select id="vn_vn_loai">'+loaiOpts+'</select></div>'
    + '<div><label>Hình thức trả</label><select id="vn_vn_hinh">'+hinhOpts+'</select></div>'
    + '<div><label>Số tiền vay (gốc)</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_vn_soTien" value="'+veSo(d.soTienGoc)+'" placeholder="0"></div>'
    + '<div><label>Ngày vay</label><input type="date" id="vn_vn_ngay" value="'+(d.ngayVay||todayStr())+'"></div>'
    + '<div><label>Ngày trả hàng tháng (1-31)</label><input type="number" id="vn_vn_ngayTra" value="'+(d.ngayTraHangThang||'')+'" placeholder="Bỏ trống = lấy theo ngày vay" min="1" max="31"></div>'
    + '<div><label>Kỳ hạn (số tháng)</label><input type="number" id="vn_vn_soThang" value="'+(d.soThangVay||'')+'" placeholder="Bỏ trống nếu trả 1 lần" min="0"></div>'
    + '<div><label>Ngày đáo hạn (nếu trả 1 lần)</label><input type="date" id="vn_vn_daoHan" value="'+(d.ngayDaoHan||'')+'"></div>'
    + '<div><label>Lãi suất %/năm</label><input type="number" id="vn_vn_laiSuat" value="'+(d.laiSuatNam||'')+'" placeholder="Chỉ cần nếu có lãi suất" min="0"></div>'
    + '<div><label>Số tiền trả mỗi tháng</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_vn_traThang" value="'+veSo(d.soTienTraThang)+'" placeholder="Chỉ cho hình thức Trả cố định/tháng"></div>'
    // số thực trả khi tất toán thường THẤP hơn tổng còn phải trả theo lịch (lãi các kỳ sau
    // không phải trả) -> nhập 1 lần ở đây, hộp thoại Tất toán + tab Mô phỏng lấy làm mặc định
    + vnViSelectHtml('vn_vn_wallet', 'Ví nhận tiền vay / trả nợ', editing)
    + '<div><label>Số tiền tất toán dự kiến</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_vn_tatToan" value="'+veSo(d.soTienTatToan)+'" placeholder="Bỏ trống = tự tính theo gốc còn lại"></div>'
    // "Số kỳ đã trả" CHỈ có khi thêm mới (khoản vay cũ đã trả được mấy kỳ trước khi nhập vào app).
    // Khi SỬA thì không được có ô này: sửa số kỳ ở đây sẽ ghi đè lịch sử trả nợ thực tế
    // mà không sinh/xóa giao dịch tương ứng -> số dư lệch. Sửa lịch sử bằng "Hủy ghi nhận" ở lịch trả.
    + (editing ? '' : '<div><label>Số kỳ đã trả trước khi nhập vào đây</label><input type="number" id="vn_vn_daTraKy" value="" placeholder="0" min="0"></div>')
    + '</div>'
    + (editing ? '<div class="empty" style="padding:0 0 10px">Muốn sửa lịch sử trả nợ thì mở lịch trả của khoản vay (bấm vào tên) rồi dùng "Hủy ghi nhận" / "Ghi nhận đã trả" — sửa ở đó mới đồng bộ được với Sổ tay.</div>' : '')
    + '<div style="display:flex;gap:8px;margin-bottom:12px">'
    + '<button class="btn sm" data-act="vnSaveVayNo">Lưu</button>'
    + '<button class="btn secondary sm" data-act="vnCancelForm">Hủy</button></div>';
}

function vayNoScheduleHtml(loan){
  var tienDo = tienDoTraNo(loan);
  var sch = tienDo.sch;
  // kỳ ĐÃ ĐÓNG mới nhất mới được mở lại, để lịch sử không bị rỗ giữa
  var lastClosedIdx = -1;
  for (var i=0;i<sch.length;i++){ if (kyDaDong(loan, i)) lastClosedIdx = i; }
  var html = '<div class="table-wrap" style="margin:8px 0"><table class="m-cards"><thead><tr><th>Tháng</th><th>Ngày trả</th><th>Gốc</th><th>Lãi</th><th>Theo lịch</th><th>Thực trả</th><th>Dư nợ còn lại</th><th>Trạng thái</th><th></th></tr></thead><tbody>';
  sch.forEach(function(row, idx){
    var st = kyStatus(loan, idx, sch);
    var coTien = st.trangThai !== 'chua';
    var badge;
    if (st.trangThai === 'du')         badge = '<span style="color:var(--green)">'+icon('check')+' đã trả đủ kỳ</span>';
    else if (st.trangThai === 'thieu') badge = '<span style="color:var(--green)">'+icon('check')+' xong kỳ</span> <span style="color:var(--red)">(thiếu '+fmt(Math.round(-st.lech))+')</span>';
    else if (st.trangThai === 'motphan')badge = '<span style="color:var(--red)">'+icon('alert')+' chưa trả đủ kỳ (còn '+fmt(Math.round(st.can - st.da))+')</span>';
    else                               badge = '<span style="color:var(--muted)">chưa trả</span>';
    var btn = '';
    if (idx === tienDo.kyTiepIdx){
      btn = '<button class="btn sm" data-act="vnGhiNhanTra" data-id="'+loan.id+'" data-ky="'+idx+'" data-mk="'+row.mk+'">'
          + (st.trangThai === 'motphan' ? 'Trả tiếp' : 'Ghi nhận đã trả') + '</button>';
      if (st.trangThai === 'motphan'){
        btn += ' <button class="btn sm secondary" data-act="vnDongKy" data-id="'+loan.id+'" data-ky="'+idx+'" title="Coi kỳ này là đã thanh toán xong dù còn thiếu">Đóng kỳ</button>'
             + ' <button class="btn sm secondary" data-act="vnHuyGhiNhanTra" data-id="'+loan.id+'" data-ky="'+idx+'" title="Xóa hết các lần trả của kỳ này, hoàn lại giao dịch ở Sổ tay">Hủy ghi nhận</button>';
      }
    } else if (idx === lastClosedIdx){
      btn = '<button class="btn sm secondary" data-act="vnMoLaiKy" data-id="'+loan.id+'" data-ky="'+idx+'" title="Bỏ đánh dấu xong kỳ, giữ nguyên tiền đã trả">Mở lại kỳ</button>'
          + ' <button class="btn sm secondary" data-act="vnHuyGhiNhanTra" data-id="'+loan.id+'" data-ky="'+idx+'" title="Xóa hết các lần trả của kỳ này, hoàn lại giao dịch ở Sổ tay">Hủy ghi nhận</button>';
    }
    html += '<tr'+(st.dong?' style="color:var(--muted)"':'')+'>'
      + '<td class="m-title">'+monthLabel(row.mk)+'</td>'
      + '<td data-th="Ngày trả">'+ngayVN(row.ngayTra)+'</td>'
      + '<td data-th="Gốc">'+fmt(Math.round(row.goc))+'</td>'
      + '<td data-th="Lãi">'+fmt(Math.round(row.lai))+'</td>'
      + '<td data-th="Theo lịch">'+fmt(Math.round(row.tongTra))+'</td>'
      + '<td data-th="Thực trả">'+(coTien ? fmt(Math.round(st.da)) : '—')+'</td>'
      + '<td data-th="Dư nợ còn lại">'+fmt(Math.round(row.duNoConLai))+'</td>'
      + '<td data-th="Trạng thái">'+badge+'</td>'
      + '<td class="m-act">'+btn+'</td>'
      + '</tr>';
  });
  html += '</tbody></table></div>';
  var lech = tongLechTraNo(loan);
  if (Math.abs(lech) >= 1){
    html += '<div class="empty" style="padding:0 0 8px">Chênh lệch giữa thực trả và lịch ở các kỳ ĐÃ ĐÓNG: '
      + (lech < 0 ? 'trả thiếu ' : 'trả thừa ') + fmt(Math.round(Math.abs(lech)))
      + '. Không cộng ngược vào dư nợ — số tiền thực tế đã ghi ở Sổ tay. Kỳ còn đang trả dở thì phần thiếu vẫn nằm trong dư nợ.</div>';
  }
  if (loan.tatToan){
    html += '<div class="empty" style="padding:0 0 8px">Đã tất toán ngày '+(loan.tatToan.ngay ? ngayVN(loan.tatToan.ngay) : '')+' với số tiền '+fmt(loan.tatToan.soTien)+'.</div>';
  }
  return html;
}

// card nhắc hạn ở đầu tab Vay-Nợ, gộp cả Cho vay + Vay-Nợ phải trả
function sapDenHanHtml(nNgay){
  var list = danhSachSapDenHan(nNgay);
  if (!list.length) return '';
  var html = '<div class="card k-act"><h3>'+icon('clock')+' Sắp đến hạn / quá hạn (trong '+nNgay+' ngày tới)</h3>'
    + '<div class="empty" style="padding:0 0 8px">Chạm vào một khoản để xem khoản đó ở bên dưới.</div>';
  html += '<div class="table-wrap"><table class="m-cards"><thead><tr><th style="text-align:left">Khoản</th><th>Loại</th><th>Ngày</th><th>Số tiền</th><th>Trạng thái</th></tr></thead><tbody>';
  list.forEach(function(x){
    var trang;
    if (x.soNgay < 0) trang = '<span style="color:var(--red);font-weight:600">Quá hạn '+(-x.soNgay)+' ngày</span>';
    else if (x.soNgay === 0) trang = '<span style="color:var(--red);font-weight:600">Hôm nay</span>';
    else if (x.soNgay <= 3) trang = '<span style="color:var(--amber);font-weight:600">Còn '+x.soNgay+' ngày</span>';
    else trang = '<span style="color:var(--gold)">Còn '+x.soNgay+' ngày</span>';
    html += '<tr class="vn-sap" data-act="vnCuonTo" data-loai="'+x.loai+'" data-id="'+esc(x.id)+'"><td class="m-title" style="text-align:left">'+esc(x.ten)+'</td><td data-th="Loại">'+(x.loai==='choVay'?'Thu hồi cho vay':'Trả nợ')+'</td>'
      + '<td data-th="Ngày">'+ngayVN(x.ngay)+'</td><td data-th="Số tiền">'+fmt(Math.round(x.soTien))+'</td><td data-th="Trạng thái">'+trang+'</td></tr>';
  });
  html += '</tbody></table></div></div>';
  return html;
}

function renderVayNo(){
  var root = document.getElementById('tabContent');
  var choVay = state.data.vayNo.choVay;
  var vayNoPhaiTra = state.data.vayNo.vayNoPhaiTra;
  var html = '';

  html += sapDenHanHtml(7);

  html += '<div class="card k-asset"><h3 style="display:flex;align-items:center;justify-content:space-between">Cho vay <button class="btn sm" data-act="vnAddChoVay">+ Thêm khoản cho vay</button></h3>';
  if (state.vnFormKind === 'choVay') html += choVayFormHtml();
  html += ghiChuGon('Tiền thu về nhập ở tab Sổ tay (danh mục "Thu hồi cho vay", nhớ chọn khoản trong ô bên dưới) để ghi đúng ngày phát sinh. Nút dấu tích ở đây chỉ dùng để TẤT TOÁN phần không đòi được.', 'Ghi tiền thu về thế nào?');
  if (!choVay.length){
    html += '<div class="empty-box">Chưa có khoản cho vay nào.'
      + (state.vnFormKind === 'choVay' ? '' : '<div><button class="btn" data-act="vnAddChoVay">+ Thêm khoản cho vay</button></div>')
      + '</div>';
  } else {
    html += '<div class="table-wrap"><table class="m-cards"><thead><tr><th style="text-align:left">Tên</th><th>Số tiền</th><th>Đã thu</th><th>Còn lại</th><th>Dự kiến thu</th><th>Trạng thái</th><th class="actions-col"></th></tr></thead><tbody>';
    choVay.forEach(function(c){
      var conLai = conLaiPhaiThu(c);
      var qh = soNgayQuaHan(c);
      var tt = c.tatToan
        ? 'Đã tất toán' + (num(c.tatToan.soTien) > 0 ? ' (bỏ '+fmt(Math.round(c.tatToan.soTien))+')' : '')
        : ((c.trangThai==='da_thu_du' || conLai <= 0)
            ? 'Đã thu đủ'
            : (qh > 0
                ? '<span style="color:var(--red);font-weight:600">Quá hạn '+qh+' ngày</span>'
                : 'Đang chờ'));
      html += '<tr id="vn-cv-'+esc(c.id)+'">'
        + '<td class="m-title" style="text-align:left">'+esc(c.ten)+'</td>'
        + '<td data-th="Số tiền">'+fmt(c.soTien)+'</td>'
        + '<td data-th="Đã thu">'+fmt(c.daThu)+'</td>'
        + '<td data-th="Còn lại">'+fmt(conLai)+'</td>'
        + '<td data-th="Dự kiến thu">'+(c.ngayDuKienThu ? ngayVN(c.ngayDuKienThu) : '')+'</td>'
        + '<td data-th="Trạng thái">'+tt+'</td>'
        + '<td class="actions-col">'
        + (c.tatToan
            ? '<button class="icon-btn" data-act="vnHuyTatToanChoVay" data-id="'+c.id+'" title="Hủy tất toán, mở lại khoản" aria-label="Hủy tất toán, mở lại khoản">'+icon('undo')+'</button>'
            : (conLai>0 ? '<button class="icon-btn" data-act="vnTatToanChoVay" data-id="'+c.id+'" title="Tất toán: bỏ phần không đòi được. KHÔNG ghi giao dịch nào ở Sổ tay" aria-label="Tất toán khoản cho vay">'+icon('check')+'</button>' : ''))
        + '<button class="icon-btn" data-act="vnEditChoVay" data-id="'+c.id+'" title="Sửa khoản cho vay" aria-label="Sửa khoản cho vay '+esc(c.ten)+'">'+icon('pencil')+'</button>'
        + '<button class="icon-btn" data-act="vnDelChoVay" data-id="'+c.id+'" title="Xóa khoản cho vay" aria-label="Xóa khoản cho vay '+esc(c.ten)+'">'+icon('trash')+'</button>'
        + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  html += '<div class="card k-debt"><h3 style="display:flex;align-items:center;justify-content:space-between">Vay - Nợ phải trả <button class="btn sm" data-act="vnAddVayNo">+ Thêm khoản vay</button></h3>';
  if (state.vnFormKind === 'vayNoPhaiTra') html += vayNoFormHtml();
  if (!vayNoPhaiTra.length){
    html += '<div class="empty-box">Chưa có khoản vay nào.'
      + (state.vnFormKind === 'vayNoPhaiTra' ? '' : '<div><button class="btn" data-act="vnAddVayNo">+ Thêm khoản vay</button></div>')
      + '</div>';
  } else {
    html += '<div class="table-wrap"><table class="m-cards"><thead><tr><th style="text-align:left">Tên</th><th>Loại vay</th><th>Hình thức</th><th>Đã trả</th><th>Dư nợ còn lại</th><th>Số tiền trả kỳ tới</th><th>Dự kiến hết nợ</th><th>Trạng thái</th><th class="actions-col"></th></tr></thead><tbody>';
    vayNoPhaiTra.forEach(function(v){
      var duNo = soTienConLaiPhaiTra(v);
      var hetNoMk = thangDuKienHetNo(v);
      var tienDo = tienDoTraNo(v);
      html += '<tr id="vn-vn-'+esc(v.id)+'">'
        + '<td class="m-title" style="text-align:left"><a href="#" data-act="vnToggleDetail" data-id="'+v.id+'" style="color:var(--primary-d);text-decoration:none">'+esc(v.ten)+'</a></td>'
        + '<td data-th="Loại vay">'+LOAI_VAY_LABEL[v.loaiVay]+'</td>'
        + '<td data-th="Hình thức">'+HINH_THUC_LABEL[v.hinhThuc]+'</td>'
        + '<td data-th="Đã trả">'+tienDo.daTraKy+'/'+tienDo.tongKy+' kỳ</td>'
        + '<td data-th="Dư nợ còn lại">'+fmt(duNo)+'</td>'
        + '<td data-th="Trả kỳ tới">'+(tienDo.kyTiepTheo ? fmt(Math.round(tienDo.kyTiepTheo.tongTra))+' — '+ngayVN(tienDo.kyTiepTheo.ngayTra) : '—')+'</td>'
        + '<td data-th="Dự kiến hết nợ">'+(hetNoMk?monthLabel(hetNoMk):'—')+'</td>'
        + '<td data-th="Trạng thái">'+(v.tatToan ? 'Đã tất toán' : (v.trangThai==='da_tra_het'?'Đã trả hết':'Đang vay'))+'</td>'
        + '<td class="actions-col">'
        + (loanIsActive(v) ? '<button class="btn sm secondary" data-act="vnTatToan" data-id="'+v.id+'" title="Tất toán sớm toàn bộ khoản vay">Tất toán</button>' : '')
        + (v.tatToan ? '<button class="btn sm secondary" data-act="vnHuyTatToan" data-id="'+v.id+'" title="Hủy tất toán, hoàn lại giao dịch Sổ tay">Hủy tất toán</button>' : '')
        + '<button class="icon-btn" data-act="vnEditVayNo" data-id="'+v.id+'" title="Sửa khoản vay" aria-label="Sửa khoản vay '+esc(v.ten)+'">'+icon('pencil')+'</button>'
        + '<button class="icon-btn" data-act="vnDelVayNo" data-id="'+v.id+'" title="Xóa khoản vay" aria-label="Xóa khoản vay '+esc(v.ten)+'">'+icon('trash')+'</button>'
        + '</td></tr>';
      if (state.vnDetailId === v.id){
        html += '<tr class="m-detail"><td colspan="9">'+vayNoScheduleHtml(v)+'</td></tr>';
      }
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  var horizon = state.vnHorizon || 12;
  var startMk = monthKey(todayStr());
  var months = [];
  for (var i=0;i<horizon;i++) months.push(monthKeyAdd(startMk, i));
  var runningBal = balanceBeforeMonth(startMk);
  var rowsData = months.map(function(mk){
    var thu = tongThuThangCard(mk), chi = tongChiThangCard(mk);
    runningBal += thu - chi;
    return { mk:mk, thu:thu, chi:chi, bal: runningBal };
  });

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Dòng tiền tích lũy tương lai'
    + '<select id="vn_horizon" data-act="vnHorizonChange" style="width:auto;font-size:12px;padding:4px 8px">'
    + [6,12,24].map(function(h){ return '<option value="'+h+'"'+(h===horizon?' selected':'')+'>'+h+' tháng tới</option>'; }).join('')
    + '</select></h3>';
  // Khối giải thích dài 5 dòng đẩy hẳn cái bảng xuống dưới màn hình, mà đọc 1
  // lần là nhớ -> gấp vào <details>, mặc định đóng. Không cần JS, không cần
  // nhớ trạng thái vì mở/đóng chỉ sống trong 1 lần render.
  html += '<details class="giai-thich"><summary>ⓘ Số tháng tương lai tính thế nào?</summary>'
    + '<div>Tháng hiện tại/quá khứ dùng số thực tế từ Sổ tay; tháng tương lai dùng gợi ý: TB của tối đa 3 tháng ĐÃ HOÀN CHỈNH gần nhất (tính từ "Tháng bắt đầu tính dự kiến" ở tab Danh mục), chưa có tháng hoàn chỉnh nào thì dùng Hạn mức/tháng. Riêng Trả nợ/Thu hồi cho vay lấy thẳng từ lịch vay (kỳ đã ghi nhận trả thì không cộng lại; khoản cho vay quá hạn dồn vào tháng hiện tại), và các danh mục có cờ "Cố định theo Hạn mức": nếu tháng hiện tại chưa ghi Sổ tay thì vẫn hiện số biết trước.</div></details>';
  html += '<div class="table-wrap"><table class="t-compact"><thead><tr><th style="text-align:left">Tháng</th><th>Thu</th><th>Chi</th><th>Số dư lũy kế</th></tr></thead><tbody>';
  rowsData.forEach(function(r){
    html += '<tr><td style="text-align:left">T'+parseInt(r.mk.slice(5,7),10)+'/'+r.mk.slice(0,4)+'</td><td style="color:var(--green)">'+fmt(Math.round(r.thu))+'</td><td style="color:var(--red)">'+fmt(Math.round(r.chi))+'</td><td>'+fmt(Math.round(r.bal))+'</td></tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="bd-h" style="margin-top:14px">Số dư lũy kế dự kiến</div><div class="bd-box">'
    + bdLine({ W: 350, H: 190, labels: rowsData.map(function(r){ return 'T' + parseInt(r.mk.slice(5, 7), 10) + (r.mk.slice(0, 4) !== rowsData[0].mk.slice(0, 4) ? '/' + r.mk.slice(2, 4) : ''); }),
      series: [{ ten: 'Số dư', vals: rowsData.map(function(r){ return Math.round(r.bal); }), cls: 'chi', fill: true }],
      tipTitle: function(i){ return monthLabel(rowsData[i].mk); }, money: function(v){ return fmt(v); }, aria: 'Số dư lũy kế dự kiến' }) + '</div>';
  html += '</div>';

  root.innerHTML = html;
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
    if (c.daThu < num(c.soTien) - 0.01) c.trangThai = 'dang_cho';
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
    // TẤT TOÁN cho vay = phần còn lại không đòi được (cho luôn/mất). KHÔNG sinh
    // giao dịch nào ở Sổ tay: tiền chi đã ghi đủ lúc cho vay, tiền thu chỉ ghi
    // phần thực nhận -> số dư vốn đã đúng, ghi thêm là đếm 2 lần.
    var idTTCV = el.getAttribute('data-id');
    var cvTT = state.data.vayNo.choVay.find(function(x){ return x.id===idTTCV; });
    if (!cvTT) return true;
    var boTT = conLaiPhaiThu(cvTT);
    if (boTT <= 0) return true;
    (async function(){
      if (!await xacNhan('Tất toán khoản cho vay "'+cvTT.ten+'"?',
            'Còn phải thu '+fmt(Math.round(boTT))+' sẽ coi như KHÔNG ĐÒI ĐƯỢC và bỏ qua.\n\n'
            + 'Không có giao dịch nào được ghi ở Sổ tay (số dư đã đúng từ trước).',
            { nguyHiem:true, chuOk:'Tất toán' })) return;
      cvTT.tatToan = { soTien: boTT, ngay: todayStr() };
      cvTT.trangThai = 'da_thu_du';
      scheduleSave(); renderVayNo();
      toast('Đã tất toán khoản cho vay "'+cvTT.ten+'".');
    })();
  } else if (act === 'vnHuyTatToanChoVay'){
    var idHTT = el.getAttribute('data-id');
    var cvHTT = state.data.vayNo.choVay.find(function(x){ return x.id===idHTT; });
    if (!cvHTT || !cvHTT.tatToan) return true;
    cvHTT.tatToan = null;
    cvHTT.trangThai = (num(cvHTT.daThu) >= num(cvHTT.soTien) - 0.01) ? 'da_thu_du' : 'dang_cho';
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
      var amt2 = await hoiSo('Ghi nhận trả kỳ '+(kyGTr+1)+' — '+monthLabel(mkGTr),
        'Theo lịch: '+fmt(Math.round(canKy))
        + (daKy > 0 ? '\nĐã trả trong kỳ: '+fmt(Math.round(daKy))+' → còn thiếu '+fmt(Math.round(conThieu)) : '')
        + '\n\nNhập đúng số thực trả lần này.',
        'Số tiền thực trả', Math.round(conThieu));
      if (amt2 == null) return;
      // trả thiếu so với lịch -> hỏi ngay: coi là xong kỳ (chênh lệch bỏ qua)
      // hay vẫn còn nợ tiếp trong kỳ này (lần sau "Trả tiếp")
      var dongKyG = true;
      if (amt2 < conThieu - 1){
        var chG = await chonMot('Trả thiếu so với lịch kỳ '+(kyGTr+1),
          'Lần này trả '+fmt(Math.round(amt2))+', vẫn thiếu '+fmt(Math.round(conThieu - amt2))+' so với lịch.',
          [ { ma:'xong', chu:'Kỳ này đã trả xong' },
            { ma:'no',   chu:'Kỳ này còn nợ tiếp' } ]);
        // Hủy / Esc = hướng an toàn: kỳ còn nợ tiếp, phần thiếu vẫn nằm trong dư nợ
        dongKyG = (chG === 'xong');
      }
      var ridG = 'r' + kyGTr + '_' + Date.now().toString(36);
      vnItem.traNo = vnItem.traNo || [];
      vnItem.traNo.push({ rid: ridG, ky: kyGTr, mk: mkGTr, soTien: amt2, ngay: todayStr(), dongKy: dongKyG });
      journalAddRef(todayStr(), vnItem.id, 'traNo', amt2, 'Trả nợ: '+vnItem.ten+' (kỳ '+(kyGTr+1)+')', { ky: kyGTr, rid: ridG });
      if (soTienConLaiPhaiTra(vnItem) <= 0.01) vnItem.trangThai = 'da_tra_het';
      scheduleSave(); renderVayNo();
      toast('Đã ghi nhận trả '+fmt(Math.round(amt2))+' cho kỳ '+(kyGTr+1)+'.');
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
      var amtTT = await hoiSo('Tất toán khoản "'+vnTT.ten+'"',
        'Tổng còn phải trả theo lịch (gồm lãi các kỳ sau): '+fmt(Math.round(duNoTT))
        + '\nGốc còn lại: '+fmt(Math.round(gocTT))
        + (duKienTT > 0 ? '\nSố tiền tất toán dự kiến: '+fmt(Math.round(duKienTT)) : '')
        + '\n\nTất toán sớm thường chỉ trả gốc còn lại + lãi/phí tới ngày tất toán, nên THẤP hơn tổng theo lịch. Nhập đúng số ngân hàng / bên cho vay báo.',
        'Số tiền tất toán', Math.round(duKienTT > 0 ? duKienTT : gocTT) || '');
      if (amtTT == null) return;
      // ghi nhận tất toán vào DATA (không chỉ là đổi trạng thái): số tiền + ngày,
      // kèm giao dịch chi ở Sổ tay có ref để xóa khoản vay thì hoàn lại được
      var dateTT = todayStr();
      vnTT.tatToan = { soTien: amtTT, ngay: dateTT };
      vnTT.trangThai = 'da_tra_het';
      journalAddRef(dateTT, vnTT.id, 'tatToan', amtTT, 'Tất toán: '+vnTT.ten);
      scheduleSave(); renderVayNo();
      toast('Đã tất toán "'+vnTT.ten+'" với số tiền '+fmt(Math.round(amtTT))+'.');
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

function handleVayNoChange(el){
  if (el.matches('[data-act=vnHorizonChange]')){
    state.vnHorizon = parseInt(el.value, 10);
    renderVayNo();
    return true;
  }
  return false;
}
