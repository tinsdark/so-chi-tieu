"use strict";
/* ====================================================================
   tests/run-tests.js — unit test cho phần LOGIC THUẦN của app
   (lịch trả nợ, tiến độ trả nợ theo kỳ, số dư, refs journal<->khoản vay,
   công thức dự trù TB tháng hoàn chỉnh, migration dữ liệu cũ).

   Chạy:  node tests/run-tests.js
   Không cần cài gì thêm. Không load app.js (file đó chạm vào DOM ngay khi load).
   ==================================================================== */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var JS_DIR = path.join(__dirname, '..', 'js');

/* ---------- dựng môi trường giả lập trình duyệt (tối thiểu) ---------- */
var ctx = {
  console: console,
  Math: Math, Date: Date, JSON: JSON, Object: Object, Array: Array,
  Number: Number, String: String, parseFloat: parseFloat, parseInt: parseInt,
  isNaN: isNaN,
  setTimeout: function(){ return 0; }, clearTimeout: function(){},
  setInterval: function(){ return 0; },
  document: {
    getElementById: function(){ return null; },
    querySelector: function(){ return null; },
    querySelectorAll: function(){ return []; },
    addEventListener: function(){},
    activeElement: null
  },
  window: { addEventListener: function(){} },
  localStorage: { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} },
  Chart: function(){ return { destroy: function(){} }; },
  XLSX: {},
  alert: function(){}, confirm: function(){ return true; }, prompt: function(){ return null; }
};
ctx.globalThis = ctx;
vm.createContext(ctx);

['state.js', 'vayno.js', 'dongtien.js', 'sotay.js', 'bieudo.js', 'nhap.js', 'danhmuc.js', 'mophong.js'].forEach(function(f){
  var code = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
  vm.runInContext(code, ctx, { filename: f });
});

/* ---------- khung test tối giản ---------- */
var pass = 0, fail = 0, failures = [];
function test(name, fn){
  try{
    fn();
    pass++;
    console.log('  ✓ ' + name);
  }catch(e){
    fail++;
    failures.push({ name: name, msg: e.message });
    console.log('  ✗ ' + name + '\n      ' + e.message);
  }
}
function group(name){ console.log('\n' + name); }
function ok(cond, msg){ if (!cond) throw new Error(msg || 'điều kiện không đúng'); }
function eq(actual, expected, msg){
  if (actual !== expected) throw new Error((msg||'') + ' — mong đợi ' + JSON.stringify(expected) + ', nhận được ' + JSON.stringify(actual));
}
function near(actual, expected, tol, msg){
  tol = tol == null ? 1 : tol;
  if (Math.abs(actual - expected) > tol) throw new Error((msg||'') + ' — mong đợi ~' + expected + ' (±' + tol + '), nhận được ' + actual);
}

/* ---------- helper dựng dữ liệu ---------- */
function setToday(d){ ctx.todayStr = function(){ return d; }; }
function loadData(d){
  ctx.state.data = ctx.normalizeData(JSON.parse(JSON.stringify(d)));
  ctx.invalidateBalanceCache();
  return ctx.state.data;
}
function baseData(over){
  var d = {
    settings: { soDuDauKy: 0, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' },
    journal: {},
    categories: { thu: [{id:'luong',ten:'Lương',chiTieu:0}], chi: [{id:'an',ten:'Ăn',chiTieu:0}] },
    vayNo: { choVay: [], vayNoPhaiTra: [] }
  };
  if (over) Object.keys(over).forEach(function(k){ d[k] = over[k]; });
  return d;
}

setToday('2026-10-01');

/* ==================================================================== */
group('1. tinhLichTraNo — lịch trả nợ 3 hình thức');

test('tra_1_lan: đúng 1 kỳ, rơi vào tháng đáo hạn, không lãi', function(){
  loadData(baseData());
  var sch = ctx.tinhLichTraNo({ hinhThuc:'tra_1_lan', soTienGoc:50000000, ngayVay:'2026-10-05', ngayDaoHan:'2027-04-10' });
  eq(sch.length, 1, 'số kỳ');
  eq(sch[0].mk, '2027-04', 'tháng đáo hạn');
  eq(sch[0].tongTra, 50000000, 'tổng trả');
  eq(sch[0].duNoConLai, 0, 'dư nợ sau kỳ cuối');
});

test('tra_co_dinh: vay 10tr trả 1tr/tháng × 12 kỳ -> gốc 833.333/kỳ, lãi chia đều, tổng lãi 2tr', function(){
  var sch = ctx.tinhLichTraNo({ hinhThuc:'tra_co_dinh', soTienGoc:10000000, soTienTraThang:1000000, soThangVay:12, ngayVay:'2026-10-05' });
  eq(sch.length, 12);
  sch.forEach(function(r){ near(r.tongTra, 1000000, 0.01, 'mỗi kỳ trả đúng số cố định'); });
  var g = 0, l = 0; sch.forEach(function(r){ g += r.goc; l += r.lai; });
  near(g, 10000000, 0.5, 'tổng gốc'); near(l, 2000000, 0.5, 'tổng lãi = tổng trả − gốc');
  near(sch[11].duNoConLai, 0, 0.5, 'kỳ cuối hết nợ');
  eq(sch[0].mk, '2026-11'); eq(sch[0].ngayTra, '2026-11-05');
});

test('tra_co_dinh: tổng trả < gốc (nhập sai) không sinh lãi âm', function(){
  var sch = ctx.tinhLichTraNo({ hinhThuc:'tra_co_dinh', soTienGoc:12000000, soTienTraThang:500000, soThangVay:12, ngayVay:'2026-10-05' });
  sch.forEach(function(r){ eq(r.lai, 0); near(r.goc, 1000000, 0.01); });
});

test('tra_1_lan: không có ngày đáo hạn thì tính theo số tháng vay', function(){
  var sch = ctx.tinhLichTraNo({ hinhThuc:'tra_1_lan', soTienGoc:10000000, ngayVay:'2026-10-05', soThangVay:6 });
  eq(sch[0].mk, '2027-04', 'ngày vay T10 + 6 tháng');
});

test('khong_lai: chia đều, tổng gốc = gốc vay, kỳ cuối dư nợ 0', function(){
  var goc = 100000000;
  var sch = ctx.tinhLichTraNo({ hinhThuc:'khong_lai', soTienGoc:goc, ngayVay:'2026-10-15', soThangVay:12 });
  eq(sch.length, 12, 'số kỳ');
  eq(sch[0].mk, '2026-11', 'kỳ đầu là tháng sau tháng vay');
  eq(sch[11].mk, '2027-10', 'kỳ cuối');
  var sum = sch.reduce(function(s,r){ return s + r.goc; }, 0);
  near(sum, goc, 0.01, 'tổng gốc');
  near(sch[11].duNoConLai, 0, 0.01, 'dư nợ kỳ cuối');
  sch.forEach(function(r){ eq(r.lai, 0, 'lãi phải = 0'); });
});

test('co_lai 100tr/12 tháng/10%: tổng gốc khớp 100tr, dư nợ kỳ cuối 0, trả đều', function(){
  var goc = 100000000;
  var sch = ctx.tinhLichTraNo({ hinhThuc:'co_lai', soTienGoc:goc, ngayVay:'2026-10-15', soThangVay:12, laiSuatNam:10 });
  eq(sch.length, 12, 'số kỳ');
  var sumGoc = sch.reduce(function(s,r){ return s + r.goc; }, 0);
  near(sumGoc, goc, 1, 'tổng gốc 12 kỳ');
  near(sch[11].duNoConLai, 0, 1, 'dư nợ kỳ cuối');
  // annuity: tổng trả mỗi kỳ bằng nhau
  sch.forEach(function(r){ near(r.tongTra, sch[0].tongTra, 0.01, 'tongTra kỳ phải bằng nhau'); });
  // lãi kỳ đầu = dư nợ * r
  near(sch[0].lai, goc * 10/12/100, 0.01, 'lãi kỳ đầu');
  // tổng trả > gốc (có lãi)
  ok(sch.reduce(function(s,r){ return s+r.tongTra; },0) > goc, 'tổng trả phải lớn hơn gốc');
});

test('co_lai với lãi suất 0 thì về đúng như không lãi', function(){
  var a = ctx.tinhLichTraNo({ hinhThuc:'co_lai', soTienGoc:12000000, ngayVay:'2026-10-01', soThangVay:12, laiSuatNam:0 });
  var b = ctx.tinhLichTraNo({ hinhThuc:'khong_lai', soTienGoc:12000000, ngayVay:'2026-10-01', soThangVay:12 });
  eq(JSON.stringify(a), JSON.stringify(b), 'hai lịch phải giống nhau');
});

/* ==================================================================== */
group('2. Trả nợ theo kỳ — trạng thái đã trả đủ kỳ / chưa trả đủ kỳ (P1-4, P1-5)');

function loanKhongLai(over){
  var l = { id:'vn1', ten:'Vay test', loaiVay:'ban_be', hinhThuc:'khong_lai',
            soTienGoc:12000000, ngayVay:'2026-10-01', soThangVay:12, traNo:[], trangThai:'dang_vay' };
  if (over) Object.keys(over).forEach(function(k){ l[k] = over[k]; });
  return l;
}

test('trả THIẾU vài nghìn: kỳ vẫn tính là ĐÃ ghi nhận, trạng thái "thieu", kỳ tiếp theo là kỳ 2', function(){
  var d = baseData();
  var loan = loanKhongLai({ traNo: [{ ky:0, mk:'2026-11', soTien: 995000, ngay:'2026-11-05' }] });
  d.vayNo.vayNoPhaiTra = [loan];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  var st = ctx.kyStatus(l, 0);
  eq(st.trangThai, 'thieu', 'trạng thái kỳ 0');
  near(st.lech, -5000, 0.01, 'số thiếu');
  var td = ctx.tienDoTraNo(l);
  eq(td.daTraKy, 1, 'số kỳ đã ghi nhận');
  eq(td.kyTiepIdx, 1, 'index kỳ tiếp theo');
  eq(td.kyTiepTheo.mk, '2026-12', 'tháng kỳ tiếp theo');
});

test('trả ĐỦ: trạng thái "du"', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [{ ky:0, mk:'2026-11', soTien: 1000000, ngay:'2026-11-05' }] })];
  loadData(d);
  eq(ctx.kyStatus(ctx.state.data.vayNo.vayNoPhaiTra[0], 0).trangThai, 'du', 'trạng thái kỳ 0');
});

test('kỳ chưa trả: trạng thái "chua", lech = -tổng phải trả kỳ đó', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai()];
  loadData(d);
  var st = ctx.kyStatus(ctx.state.data.vayNo.vayNoPhaiTra[0], 3);
  eq(st.trangThai, 'chua', 'trạng thái');
  eq(st.da, 0, 'đã trả');
  near(st.lech, -1000000, 0.01, 'lệch');
});

test('BUG CŨ P1-4: trả thiếu 5k ở kỳ 1 KHÔNG còn làm tụt tiến độ về 0 kỳ', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [{ ky:0, mk:'2026-11', soTien: 995000, ngay:'2026-11-05' }] })];
  loadData(d);
  eq(ctx.tienDoTraNo(ctx.state.data.vayNo.vayNoPhaiTra[0]).daTraKy, 1,
     'cách tính cũ (cộng dồn gốc) sẽ cho 0 kỳ');
});

test('soTienConLaiPhaiTra = tổng các kỳ CHƯA ghi nhận (không cộng ngược số thiếu)', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { ky:0, mk:'2026-11', soTien: 995000, ngay:'2026-11-05' },
    { ky:1, mk:'2026-12', soTien: 1000000, ngay:'2026-12-05' }
  ]})];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  near(ctx.soTienConLaiPhaiTra(l), 10000000, 0.01, 'còn 10 kỳ x 1tr');
  near(ctx.tongLechTraNo(l), -5000, 0.01, 'tổng chênh lệch hiện riêng');
});

test('trả vượt (lump sum) không làm kỳ sau tự nhảy sang đã trả', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [{ ky:0, mk:'2026-11', soTien: 5000000, ngay:'2026-11-05' }] })];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  eq(ctx.tienDoTraNo(l).daTraKy, 1, 'vẫn chỉ 1 kỳ được ghi nhận');
  near(ctx.tongLechTraNo(l), 4000000, 0.01, 'thừa 4tr hiện ở chênh lệch');
});

test('tất toán: còn lại = 0', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ tatToan: { soTien: 9500000, ngay:'2026-12-20' } })];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  eq(ctx.soTienConLaiPhaiTra(l), 0, 'dư nợ sau tất toán');
  eq(l.trangThai, 'da_tra_het', 'normalizeData phải set trạng thái khi có tatToan');
});

test('ghi nhận hết 12 kỳ: còn lại = 0', function(){
  var d = baseData();
  var tra = [];
  for (var i=0;i<12;i++) tra.push({ ky:i, mk:'2026-11', soTien:1000000, ngay:'2026-11-05' });
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: tra })];
  loadData(d);
  eq(ctx.soTienConLaiPhaiTra(ctx.state.data.vayNo.vayNoPhaiTra[0]), 0, 'dư nợ');
});

/* ==================================================================== */
group('2b. Trả một phần: tách "đã ghi nhận tiền" khỏi "kỳ đã ĐÓNG"');

test('trả 400k/1tr mà chưa đóng kỳ: trạng thái "motphan", kỳ tiếp theo VẪN là kỳ 1', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { rid:'a', ky:0, mk:'2026-11', soTien:400000, ngay:'2026-11-05', dongKy:false }
  ]})];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  var st = ctx.kyStatus(l, 0);
  eq(st.trangThai, 'motphan', 'trạng thái kỳ 0');
  eq(st.dong, false, 'kỳ chưa đóng');
  near(st.da, 400000, 0.01, 'đã trả trong kỳ');
  near(ctx.conThieuKy(l, 0), 600000, 0.01, 'còn thiếu trong kỳ');
  var td = ctx.tienDoTraNo(l);
  eq(td.daTraKy, 0, 'chưa đóng kỳ nào');
  eq(td.kyTiepIdx, 0, 'vẫn đang ở kỳ 1');
});

test('trả tiếp lần 2 cho đủ kỳ: cộng dồn -> "du", kỳ tiếp theo mới nhảy sang kỳ 2', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { rid:'a', ky:0, mk:'2026-11', soTien:400000, ngay:'2026-11-05', dongKy:false },
    { rid:'b', ky:0, mk:'2026-11', soTien:600000, ngay:'2026-11-20', dongKy:true }
  ]})];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  var st = ctx.kyStatus(l, 0);
  eq(st.trangThai, 'du', 'trạng thái kỳ 0');
  near(st.da, 1000000, 0.01, 'tổng 2 lần trả');
  eq(ctx.tienDoTraNo(l).kyTiepIdx, 1, 'sang kỳ 2');
  near(ctx.soTienConLaiPhaiTra(l), 11000000, 0.01, 'còn 11 kỳ');
  eq(ctx.tongLechTraNo(l), 0, 'không chênh lệch');
});

test('kỳ đang trả dở: phần THIẾU vẫn nằm trong dư nợ và trong dự trù tháng đó', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { rid:'a', ky:0, mk:'2026-11', soTien:400000, ngay:'2026-11-05', dongKy:false }
  ]})];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  near(ctx.soTienConLaiPhaiTra(l), 11600000, 0.01, '11 kỳ đủ + 600k còn thiếu kỳ 1');
  near(ctx.tongTraNoThang('2026-11'), 600000, 0.01, 'dự trù T11 chỉ còn phần thiếu, không tính lại cả kỳ');
  eq(ctx.tongLechTraNo(l), 0, 'kỳ chưa đóng thì KHÔNG tính vào chênh lệch');
});

test('đóng kỳ dù trả thiếu: phần thiếu rời dư nợ, chuyển sang chênh lệch', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { rid:'a', ky:0, mk:'2026-11', soTien:400000, ngay:'2026-11-05', dongKy:true }
  ]})];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  var st = ctx.kyStatus(l, 0);
  eq(st.trangThai, 'thieu', 'trạng thái kỳ 0');
  eq(st.dong, true, 'kỳ đã đóng');
  near(ctx.soTienConLaiPhaiTra(l), 11000000, 0.01, 'chỉ còn 11 kỳ, bỏ 600k thiếu');
  near(ctx.tongLechTraNo(l), -600000, 0.01, '600k thiếu hiện ở chênh lệch');
  eq(ctx.tongTraNoThang('2026-11'), 0, 'T11 đã đóng -> không dự trù nữa');
});

test('migration: bản ghi cũ không có dongKy -> coi là kỳ ĐÃ ĐÓNG và được gắn rid', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { ky:0, mk:'2026-11', soTien:995000, ngay:'2026-11-05' }
  ]})];
  loadData(d);
  var r = ctx.state.data.vayNo.vayNoPhaiTra[0].traNo[0];
  eq(r.dongKy, true, 'dongKy backfill');
  ok(!!r.rid, 'rid được sinh ra');
  eq(ctx.kyDaDong(ctx.state.data.vayNo.vayNoPhaiTra[0], 0), true, 'kỳ 0 đã đóng');
});

test('loanRevertRef xóa đúng MỘT lần trả theo rid, không xóa cả kỳ', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { rid:'r0_a', ky:0, mk:'2026-11', soTien:400000, ngay:'2026-11-05', dongKy:false },
    { rid:'r0_b', ky:0, mk:'2026-11', soTien:600000, ngay:'2026-11-20', dongKy:true }
  ]})];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  ctx.loanRevertRef({ loanId:'vn1', loai:'traNo', ky:0, rid:'r0_b', soTien:600000 });
  eq(l.traNo.length, 1, 'còn lại 1 lần trả');
  eq(l.traNo[0].rid, 'r0_a', 'giữ đúng lần trả còn lại');
  eq(ctx.kyStatus(l, 0).trangThai, 'motphan', 'kỳ 0 quay về trả một phần');
});

test('loanRevertRef của ref CŨ (không có rid) vẫn xóa cả kỳ', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { ky:0, mk:'2026-11', soTien:1000000, ngay:'2026-11-05' }
  ]})];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  ctx.loanRevertRef({ loanId:'vn1', loai:'traNo', ky:0, soTien:1000000 });
  eq(l.traNo.length, 0, 'xóa hết lần trả của kỳ 0');
});

test('cho vay TẤT TOÁN: hết phải thu, hết quá hạn, không còn dự trù — KHÔNG sinh giao dịch', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'Bạn A', soTien:1000000, daThu:900000, trangThai:'dang_cho',
                      ngayChoVay:'2026-10-01', ngayDuKienThu:'2026-11-01',
                      tatToan: { soTien:100000, ngay:'2026-12-10' } }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  eq(c.trangThai, 'da_thu_du', 'normalizeData set trạng thái khi có tatToan');
  eq(ctx.conLaiPhaiThu(c), 0, 'không còn phải thu');
  eq(ctx.soNgayQuaHan(c), 0, 'không còn quá hạn');
  eq(ctx.tongThuHoiThang('2026-12'), 0, 'không còn dự trù thu hồi');
  eq(Object.keys(ctx.state.data.journal).length, 0, 'tất toán cho vay KHÔNG ghi giao dịch nào');
  setToday('2026-10-01');
});

test('cho vay BỎ MỘT PHẦN: còn phải thu giảm, khoản vẫn mở; thu nốt phần còn lại thì đóng; không sinh giao dịch', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'Bạn A', soTien:1000000, daThu:400000, trangThai:'dang_cho',
                      ngayChoVay:'2026-10-01', ngayDuKienThu:'2026-11-01' }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  eq(ctx.conLaiPhaiThu(c), 600000, 'trước khi bỏ');
  eq(ctx.loaiBoChoVay(c, 700000), 'qua-so', 'bỏ nhiều hơn phần còn lại không hợp lệ');
  eq(ctx.loaiBoChoVay(c, 600000), 'het', 'bỏ đúng bằng phần còn lại = tất toán cả khoản');
  eq(ctx.loaiBoChoVay(c, 200000), 'mot-phan', 'bỏ ít hơn = một phần');
  ctx.choVayBoMotPhan(c, 200000);
  eq(ctx.conLaiPhaiThu(c), 400000, 'còn phải thu = 1.000.000 − 400.000 đã thu − 200.000 đã bỏ');
  eq(c.trangThai, 'dang_cho', 'khoản vẫn mở');
  eq(c.tatToan, undefined, 'không phải tất toán');
  ok(ctx.soNgayQuaHan(c) > 0, 'phần còn lại vẫn có thể quá hạn');
  eq(ctx.tongThuHoiThang('2026-12'), 400000, 'dự trù thu hồi chỉ tính phần còn lại');
  eq(Object.keys(ctx.state.data.journal).length, 0, 'bỏ một phần KHÔNG ghi giao dịch nào');
  eq(ctx.loaiBoChoVay(c, 400000), 'het', 'sau khi bỏ một phần, "hết" tính theo phần còn lại mới');
});

test('cho vay bỏ một phần: tài sản ròng theo NGÀY chỉ trừ các lần bỏ đã xảy ra tới ngày đó', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'Bạn A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01',
                      daBo:[{ soTien:300000, ngay:'2026-11-15' }] }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  eq(ctx.phaiThuTaiNgay(c, '2026-11-01', {}), 1000000, 'trước ngày bỏ vẫn phải thu đủ');
  eq(ctx.phaiThuTaiNgay(c, '2026-11-15', {}), 700000, 'từ ngày bỏ trừ đi phần đã bỏ');
  eq(ctx.phaiThuTaiNgay(c, '2026-12-10', {}), 700000, 'sau đó giữ nguyên');
});

test('cho vay bỏ một phần: thu nốt phần còn lại ở Sổ tay thì khoản đóng; xóa lần thu thì mở lại; hoàn lần bỏ', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'Bạn A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01',
                      daBo:[{ soTien:300000, ngay:'2026-11-15' }] }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  c.daThu = 700000;   // thu đủ phần còn lại (1.000.000 − 300.000 đã bỏ)
  c.trangThai = ctx.conLaiPhaiThu(c) <= 0.01 ? 'da_thu_du' : 'dang_cho';
  eq(c.trangThai, 'da_thu_du', 'thu hết phần còn lại thì đóng dù daThu < soTien');
  ctx.loanRevertRef({ loanId:'cv1', loai:'thuHoiChoVay', soTien:200000 });
  eq(c.daThu, 500000, 'xóa lần thu 200.000');
  eq(c.trangThai, 'dang_cho', 'xóa lần thu thì mở lại khoản');
  var lan = ctx.choVayHoanBo(c);
  eq(lan.soTien, 300000, 'hoàn đúng lần bỏ gần nhất');
  eq(ctx.conLaiPhaiThu(c), 500000, 'sau khi hoàn: 1.000.000 − 500.000 đã thu');
  eq(ctx.choVayHoanBo(c), null, 'không còn gì để hoàn');
});

test('cho vay: dữ liệu cũ không có daBo vẫn chạy như cũ (normalizeData thêm mảng rỗng)', function(){
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'Bạn A', soTien:1000000, daThu:250000, trangThai:'dang_cho', ngayChoVay:'2026-10-01' }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  ok(Array.isArray(c.daBo) && c.daBo.length === 0, 'daBo = []');
  eq(ctx.conLaiPhaiThu(c), 750000, 'công thức cũ không đổi');
  eq(ctx.phaiThuTaiNgay(c, '2026-12-10', {}), 1000000, 'tài sản ròng cũ không đổi (daThu lấy từ journal)');
});

/* ==================================================================== */
group('3. Migration dữ liệu cũ daTraGoc -> traNo[]');

test('daTraGoc = 3tr của khoản 12tr/12 tháng -> đúng 3 kỳ đã trả, gắn cờ truocKhiDungApp', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [{ id:'vn1', ten:'Vay cũ', hinhThuc:'khong_lai', loaiVay:'ban_be',
    soTienGoc:12000000, ngayVay:'2026-10-01', soThangVay:12, daTraGoc:3000000, trangThai:'dang_vay' }];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  eq(l.daTraGoc, undefined, 'daTraGoc phải bị xóa sau migrate');
  eq(l.traNo.length, 3, 'số kỳ migrate được');
  eq(l.traNo.every(function(r){ return r.truocKhiDungApp === true; }), true, 'phải gắn cờ truocKhiDungApp');
  eq(ctx.tienDoTraNo(l).daTraKy, 3, 'tiến độ sau migrate');
  near(ctx.soTienConLaiPhaiTra(l), 9000000, 0.01, 'còn phải trả');
  near(ctx.tongLechTraNo(l), 0, 0.01, 'kỳ khai trước khi dùng app không tính vào chênh lệch');
});

test('migrate chạy 2 lần không nhân đôi dữ liệu (idempotent)', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [{ id:'vn1', ten:'Vay cũ', hinhThuc:'khong_lai', loaiVay:'ban_be',
    soTienGoc:12000000, ngayVay:'2026-10-01', soThangVay:12, daTraGoc:3000000, trangThai:'dang_vay' }];
  var once = ctx.normalizeData(JSON.parse(JSON.stringify(d)));
  var twice = ctx.normalizeData(JSON.parse(JSON.stringify(once)));
  eq(twice.vayNo.vayNoPhaiTra[0].traNo.length, 3, 'số kỳ sau khi normalize lần 2');
});

test('danh mục chi "Cho vay" được thêm tự động khi thiếu', function(){
  var d = loadData(baseData());
  ok(d.categories.chi.some(function(c){ return c.id === 'choVay'; }), 'phải có danh mục choVay');
  var cv = d.categories.chi.find(function(c){ return c.id === 'choVay'; });
  eq(cv.khongDuTru, true, 'choVay không được dự trù');
});

test('thangBatDauDuTru suy ra từ ngayBatDau: ngày 25 -> lấy tháng sau', function(){
  var d = baseData();
  d.settings = { soDuDauKy: 0, ngayBatDau: '2026-09-25' };
  var out = ctx.normalizeData(JSON.parse(JSON.stringify(d)));
  eq(out.settings.thangBatDauDuTru, '2026-10', 'tháng 9 là tháng lẻ -> bỏ');
});

test('thangBatDauDuTru: ngày 01 thì lấy chính tháng đó', function(){
  var d = baseData();
  d.settings = { soDuDauKy: 0, ngayBatDau: '2026-09-01' };
  var out = ctx.normalizeData(JSON.parse(JSON.stringify(d)));
  eq(out.settings.thangBatDauDuTru, '2026-09', 'tháng 9 đầy đủ -> dùng luôn');
});

/* ==================================================================== */
group('4. Số dư — cache prefix-sum phải khớp với cách tính thô (P2-11)');

function naiveBalanceAt(dateStr){
  var s = ctx.num(ctx.state.data.settings.soDuDauKy);
  var start = ctx.state.data.settings.ngayBatDau || '';
  Object.keys(ctx.state.data.journal).sort().forEach(function(d){
    if (start && d < start) return;
    if (d > dateStr) return;
    var e = ctx.state.data.journal[d];
    s += ctx.thuTotal(e) - ctx.chiTotal(e);
  });
  return s;
}

function journalFixture(){
  return {
    '2026-09-28': { thu:{luong:1000000}, chi:{}, ghiChu:'trước khóa sổ', refs:[] },
    '2026-10-02': { thu:{luong:20000000}, chi:{an:100000}, ghiChu:'', refs:[] },
    '2026-10-05': { thu:{}, chi:{an:250000}, ghiChu:'', refs:[] },
    '2026-10-31': { thu:{}, chi:{an:300000}, ghiChu:'', refs:[] },
    '2026-11-01': { thu:{}, chi:{an:400000}, ghiChu:'', refs:[] },
    '2026-11-15': { thu:{luong:20000000}, chi:{}, ghiChu:'', refs:[] }
  };
}

test('tài khoản mới: số dư đầu kỳ mặc định = 0, bắt đầu từ hôm nay', function(){
  var d = JSON.parse(JSON.stringify(ctx.DEFAULT_DATA));
  eq(d.settings.soDuDauKy, 0, 'số dư đầu kỳ mặc định');
  eq(/^\d{4}-\d{2}-\d{2}$/.test(d.settings.ngayBatDau), true, 'ngày bắt đầu mặc định là ngày hợp lệ');
});

test('balanceAt khớp cách tính thô ở mọi mốc ngày', function(){
  var d = baseData();
  d.settings.soDuDauKy = 957000;
  d.journal = journalFixture();
  loadData(d);
  ['2026-09-27','2026-09-28','2026-10-01','2026-10-02','2026-10-04','2026-10-05','2026-10-31','2026-11-01','2026-11-15','2026-12-31']
    .forEach(function(dt){
      eq(ctx.balanceAt(dt), naiveBalanceAt(dt), 'balanceAt(' + dt + ')');
    });
});

test('ngày trước mốc khóa sổ KHÔNG được cộng vào số dư', function(){
  var d = baseData();
  d.settings.soDuDauKy = 957000;
  d.journal = journalFixture();
  loadData(d);
  eq(ctx.balanceAt('2026-09-30'), 957000, 'số dư trước ngayBatDau = đúng số dư đầu kỳ');
});

test('balanceBeforeMonth / balanceAtEndOfMonth đúng mốc đầu-cuối tháng', function(){
  var d = baseData();
  d.settings.soDuDauKy = 957000;
  d.journal = journalFixture();
  loadData(d);
  eq(ctx.balanceBeforeMonth('2026-11'), ctx.balanceAt('2026-10-31'), 'đầu T11 = cuối T10');
  eq(ctx.balanceAtEndOfMonth('2026-10'), ctx.balanceAt('2026-10-31'), 'cuối T10');
  eq(ctx.balanceAtEndOfMonth('2026-12'), ctx.balanceAt('2026-12-31'), 'cuối T12 (vắt sang năm sau)');
});

test('cache bị xóa sau khi journal đổi thì số dư cập nhật theo', function(){
  var d = baseData();
  d.journal = journalFixture();
  loadData(d);
  var before = ctx.balanceAt('2026-12-31');
  ctx.state.data.journal['2026-12-01'] = { thu:{}, chi:{an:500000}, ghiChu:'', refs:[] };
  ctx.invalidateBalanceCache();
  eq(ctx.balanceAt('2026-12-31'), before - 500000, 'số dư sau khi thêm chi 500k');
});

/* ==================================================================== */
group('5. refs journal <-> khoản vay (P0-2)');

test('journalAddRef cộng tiền đúng danh mục + gắn ref', function(){
  loadData(baseData());
  ctx.journalAddRef('2026-10-03', 'vn1', 'nhanTienVay', 50000000, 'Nhận tiền vay: A');
  var e = ctx.state.data.journal['2026-10-03'];
  eq(e.thu.nhanTienVay, 50000000, 'tiền thu');
  eq(e.refs.length, 1, 'số ref');
  eq(e.ghiChu, 'Nhận tiền vay: A', 'ghi chú');
});

test('journalUpsertRef sửa số không cộng dồn, đổi ngày thì chuyển hẳn sang ngày mới', function(){
  loadData(baseData());
  ctx.journalUpsertRef('2026-10-03', 'vn1', 'nhanTienVay', 50000000, 'Nhận tiền vay: A');
  ctx.journalUpsertRef('2026-10-03', 'vn1', 'nhanTienVay', 60000000, 'Nhận tiền vay: A');
  eq(ctx.state.data.journal['2026-10-03'].thu.nhanTienVay, 60000000, 'số tiền sau khi sửa');
  eq(ctx.state.data.journal['2026-10-03'].refs.length, 1, 'không được có 2 ref');
  ctx.journalUpsertRef('2026-10-07', 'vn1', 'nhanTienVay', 60000000, 'Nhận tiền vay: A');
  eq(ctx.state.data.journal['2026-10-03'], undefined, 'ngày cũ rỗng thì phải bị xóa');
  eq(ctx.state.data.journal['2026-10-07'].thu.nhanTienVay, 60000000, 'ngày mới');
});

test('journalRemoveLoanRefs trừ lại tiền và xóa ngày rỗng, giữ nguyên tiền nhập tay', function(){
  var d = baseData();
  d.journal = { '2026-10-03': { thu:{}, chi:{an:200000}, ghiChu:'ăn trưa', refs:[] } };
  loadData(d);
  ctx.journalAddRef('2026-10-03', 'vn1', 'nhanTienVay', 50000000, 'Nhận tiền vay: A');
  ctx.journalAddRef('2026-10-09', 'vn1', 'traNo', 1000000, 'Trả nợ: A (kỳ 1)', { ky: 0 });
  eq(ctx.state.data.journal['2026-10-09'].chi.traNo, 1000000, 'chi trả nợ trước khi xóa');

  var removed = ctx.journalRemoveLoanRefs('vn1');
  eq(removed.length, 2, 'số giao dịch được hoàn');
  eq(ctx.state.data.journal['2026-10-09'], undefined, 'ngày chỉ có giao dịch của khoản vay -> bị xóa');
  var e = ctx.state.data.journal['2026-10-03'];
  ok(e, 'ngày có thêm tiền nhập tay thì phải giữ lại');
  eq(e.thu.nhanTienVay, undefined, 'tiền vay bị trừ hết');
  eq(e.chi.an, 200000, 'tiền ăn nhập tay giữ nguyên');
  eq(e.ghiChu, 'ăn trưa', 'ghi chú của app bị bỏ, ghi chú người dùng giữ lại');
});

test('journalRemoveRefs theo đúng kỳ, không ảnh hưởng kỳ khác', function(){
  loadData(baseData());
  ctx.journalAddRef('2026-11-05', 'vn1', 'traNo', 1000000, 'Trả nợ: A (kỳ 1)', { ky: 0 });
  ctx.journalAddRef('2026-12-05', 'vn1', 'traNo', 1000000, 'Trả nợ: A (kỳ 2)', { ky: 1 });
  ctx.journalRemoveRefs('vn1', 'traNo', 1);
  eq(ctx.state.data.journal['2026-11-05'].chi.traNo, 1000000, 'kỳ 1 còn nguyên');
  eq(ctx.state.data.journal['2026-12-05'], undefined, 'kỳ 2 bị hoàn');
});

test('refs của khoản vay khác không bị xóa lây', function(){
  loadData(baseData());
  ctx.journalAddRef('2026-10-03', 'vn1', 'nhanTienVay', 10000000, 'Nhận tiền vay: A');
  ctx.journalAddRef('2026-10-03', 'vn2', 'nhanTienVay', 20000000, 'Nhận tiền vay: B');
  ctx.journalRemoveLoanRefs('vn1');
  eq(ctx.state.data.journal['2026-10-03'].thu.nhanTienVay, 20000000, 'chỉ còn tiền của vn2');
  eq(ctx.state.data.journal['2026-10-03'].refs.length, 1, 'còn 1 ref');
});

test('journalTagRef: gắn ref thì tiền vào thu/chi qua refs (không cần dòng items, không đếm 2 lần)', function(){
  var d = baseData();
  d.journal = { '2026-11-05': { thu:{}, chi:{}, ghiChu:'tự nhập', refs:[], items:[] } };
  loadData(d);
  ctx.journalTagRef('2026-11-05', 'vn1', 'traNo', 980000, { ky: 0 });
  var e = ctx.state.data.journal['2026-11-05'];
  eq(e.chi.traNo, 980000, 'tiền = phần ref'); eq(e.refs.length, 1, 'đã gắn ref'); eq(e.items.length, 0, 'không sinh dòng items');
  eq(ctx.journalKiemTra().length, 0, 'khớp nguồn gốc');
});

test('entryRefSum tách được phần tiền bị khóa bởi khoản vay', function(){
  var d = baseData();
  d.journal = { '2026-11-05': { thu:{}, chi:{traNo:1500000}, ghiChu:'', refs:[
    { loanId:'vn1', loai:'traNo', soTien:1000000, note:'', ky:0 }
  ]}};
  loadData(d);
  var e = ctx.state.data.journal['2026-11-05'];
  eq(ctx.entryRefSum(e, 'chi', 'traNo'), 1000000, 'phần khóa');
  eq(ctx.num(e.chi.traNo) - ctx.entryRefSum(e, 'chi', 'traNo'), 500000, 'phần nhập tay');
});

test('loanRevertRef lùi tiến độ trả nợ khi xóa giao dịch ở Sổ tay', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [
    { ky:0, mk:'2026-11', soTien:1000000, ngay:'2026-11-05' },
    { ky:1, mk:'2026-12', soTien:1000000, ngay:'2026-12-05' }
  ]})];
  loadData(d);
  ctx.loanRevertRef({ loanId:'vn1', loai:'traNo', soTien:1000000, ky:1 });
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  eq(l.traNo.length, 1, 'còn 1 kỳ');
  eq(ctx.tienDoTraNo(l).kyTiepIdx, 1, 'kỳ 2 về lại chưa trả');
  eq(l.trangThai, 'dang_vay', 'trạng thái về đang vay');
});

test('loanRevertRef lùi "đã thu" của khoản cho vay', function(){
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'Cho A', soTien:5000000, daThu:5000000, trangThai:'da_thu_du', ngayChoVay:'2026-10-01', ngayDuKienThu:'2026-11-01' }];
  loadData(d);
  ctx.loanRevertRef({ loanId:'cv1', loai:'thuHoiChoVay', soTien:2000000 });
  var c = ctx.state.data.vayNo.choVay[0];
  eq(c.daThu, 3000000, 'đã thu sau khi hoàn');
  eq(c.trangThai, 'dang_cho', 'trạng thái về đang chờ');
});

test('loanRevertRef hoàn tất toán', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ tatToan: { soTien:9000000, ngay:'2026-12-20' } })];
  loadData(d);
  ctx.loanRevertRef({ loanId:'vn1', loai:'tatToan', soTien:9000000 });
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  eq(l.tatToan, undefined, 'tatToan bị bỏ');
  eq(l.trangThai, 'dang_vay', 'về đang vay');
  near(ctx.soTienConLaiPhaiTra(l), 12000000, 0.01, 'dư nợ quay lại');
});

/* ==================================================================== */
group('6. Dự trù trả nợ / thu hồi theo tháng');

test('tongTraNoThang KHÔNG cộng kỳ đã ghi nhận trả (tránh tính 2 lần)', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ traNo: [{ ky:0, mk:'2026-11', soTien:1000000, ngay:'2026-11-05' }] })];
  loadData(d);
  eq(ctx.tongTraNoThang('2026-11'), 0, 'T11 đã ghi nhận -> không dự trù nữa');
  near(ctx.tongTraNoThang('2026-12'), 1000000, 0.01, 'T12 chưa trả');
});

test('tongTraNoThang bỏ qua khoản đã trả hết', function(){
  var d = baseData();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ trangThai:'da_tra_het' })];
  loadData(d);
  eq(ctx.tongTraNoThang('2026-12'), 0, 'khoản đã tất toán/trả hết');
});

test('tongThuHoiThang: khoản QUÁ HẠN dồn vào tháng hiện tại (P1-6)', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [
    { id:'cv1', ten:'Quá hạn', soTien:3000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', ngayDuKienThu:'2026-11-01' },
    { id:'cv2', ten:'Đúng hạn', soTien:5000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', ngayDuKienThu:'2027-01-15' }
  ];
  loadData(d);
  eq(ctx.tongThuHoiThang('2026-11'), 0, 'tháng quá khứ không còn giữ số nữa');
  eq(ctx.tongThuHoiThang('2026-12'), 3000000, 'dồn vào tháng hiện tại');
  eq(ctx.tongThuHoiThang('2027-01'), 5000000, 'khoản chưa tới hạn giữ nguyên tháng');
  setToday('2026-10-01');
});

test('soNgayQuaHan đếm đúng số ngày', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'Quá hạn', soTien:3000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', ngayDuKienThu:'2026-12-01' }];
  loadData(d);
  eq(ctx.soNgayQuaHan(ctx.state.data.vayNo.choVay[0]), 9, 'từ 01/12 đến 10/12');
  ctx.state.data.vayNo.choVay[0].daThu = 3000000;
  ctx.state.data.vayNo.choVay[0].trangThai = 'da_thu_du';
  eq(ctx.soNgayQuaHan(ctx.state.data.vayNo.choVay[0]), 0, 'đã thu đủ thì không quá hạn');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('7. Dự trù TB theo tháng ĐÃ HOÀN CHỈNH (P1-8)');

// kịch bản của user: bắt đầu dùng app cuối T9/2026 -> dự trù tính từ T10/2026
function forecastFixture(){
  var d = baseData();
  d.settings = { soDuDauKy: 0, ngayBatDau: '2026-09-25', thangBatDauDuTru: '2026-10' };
  d.categories = {
    thu: [{ id:'luong', ten:'Lương', chiTieu: 15000000 }],
    chi: [{ id:'an', ten:'Ăn', chiTieu: 3000000 }]
  };
  d.journal = {
    '2026-09-28': { thu:{}, chi:{an: 500000}, ghiChu:'', refs:[] },   // tháng lẻ, phải bị loại
    '2026-10-10': { thu:{}, chi:{an: 3000000}, ghiChu:'', refs:[] },
    '2026-11-10': { thu:{}, chi:{an: 4000000}, ghiChu:'', refs:[] },
    '2026-12-10': { thu:{}, chi:{an: 2000000}, ghiChu:'', refs:[] },
    '2027-01-10': { thu:{}, chi:{an: 6000000}, ghiChu:'', refs:[] }
  };
  return d;
}

test('tháng 10/2026 (chưa có tháng hoàn chỉnh nào): TB = null -> dùng chỉ tiêu', function(){
  setToday('2026-10-15');
  loadData(forecastFixture());
  eq(ctx.forecastEligibleMonths().length, 0, 'chưa có tháng hoàn chỉnh');
  eq(ctx.recentAvgActual('chi','an',3), null, 'TB phải là null');
  eq(ctx.duTruDanhMucThang('chi','an','2026-11'), 3000000, 'fallback về chỉ tiêu 3tr');
});

test('tháng 9/2026 (tháng lẻ) KHÔNG được tính vào TB', function(){
  setToday('2026-11-15');
  loadData(forecastFixture());
  eq(JSON.stringify(ctx.forecastEligibleMonths()), JSON.stringify(['2026-10']), 'chỉ T10');
  near(ctx.recentAvgActual('chi','an',3), 3000000, 0.01, 'TB = đúng thực tế T10, không bị 500k của T9 kéo xuống');
});

test('dự trù T12 = TB(T10, T11)', function(){
  setToday('2026-12-05');
  loadData(forecastFixture());
  eq(JSON.stringify(ctx.forecastEligibleMonths()), JSON.stringify(['2026-10','2026-11']), 'cửa sổ');
  near(ctx.recentAvgActual('chi','an',3), (3000000+4000000)/2, 0.01, 'TB 2 tháng');
});

test('dự trù T1/2027 = TB(T10, T11, T12)', function(){
  setToday('2027-01-05');
  loadData(forecastFixture());
  near(ctx.recentAvgActual('chi','an',3), (3000000+4000000+2000000)/3, 0.01, 'TB 3 tháng');
});

test('dự trù T2/2027 = TB(T11, T12, T1) — cửa sổ trượt, bỏ T10', function(){
  setToday('2027-02-05');
  loadData(forecastFixture());
  eq(JSON.stringify(ctx.forecastEligibleMonths().slice(-3)), JSON.stringify(['2026-11','2026-12','2027-01']), 'cửa sổ 3 tháng gần nhất');
  near(ctx.recentAvgActual('chi','an',3), (4000000+2000000+6000000)/3, 0.01, 'TB 3 tháng mới');
});

test('tháng KHÔNG phát sinh tính là 0 vào TB (mua 1 lần rồi thôi thì gợi ý giảm dần)', function(){
  setToday('2027-01-05');
  var d = forecastFixture();
  d.categories.chi.push({ id:'dodien', ten:'Đồ điện', chiTieu: 0 });
  d.journal['2026-10-20'] = { thu:{}, chi:{dodien: 9000000}, ghiChu:'mua máy giặt', refs:[] };
  loadData(d);
  near(ctx.recentAvgActual('chi','dodien',3), 9000000/3, 0.01, 'T11, T12 không mua -> tính 0');
  setToday('2027-04-05');
  near(ctx.recentAvgActual('chi','dodien',3), 0, 0.01, 'ra khỏi cửa sổ 3 tháng -> gợi ý về 0');
  setToday('2026-10-01');
});

test('danh mục có cờ "Không dự trù" luôn trả 0', function(){
  setToday('2027-01-05');
  var d = forecastFixture();
  d.categories.chi.push({ id:'choVay', ten:'Cho vay', chiTieu: 0, khongDuTru: true });
  d.journal['2026-10-20'] = { thu:{}, chi:{choVay: 5000000}, ghiChu:'', refs:[] };
  loadData(d);
  eq(ctx.duTruDanhMucThang('chi','choVay','2027-02'), 0, 'không dự trù');
  setToday('2026-10-01');
});

test('danh mục "Cố định theo Chỉ tiêu" dùng chỉ tiêu, bỏ qua TB thực tế', function(){
  setToday('2027-01-05');
  var d = forecastFixture();
  d.categories.thu[0].coDinhChiTieu = true;
  d.journal['2026-11-01'] = { thu:{luong: 9000000}, chi:{}, ghiChu:'', refs:[] };
  loadData(d);
  eq(ctx.duTruDanhMucThang('thu','luong','2027-02'), 15000000, 'lấy đúng chỉ tiêu 15tr');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('8. Helper nhỏ');

test('numNonNeg chặn số âm', function(){
  eq(ctx.numNonNeg('-500'), 0, 'số âm về 0');
  eq(ctx.numNonNeg('1500'), 1500, 'số dương giữ nguyên');
  eq(ctx.numNonNeg('abc'), 0, 'chuỗi rác về 0');
});

test('monthKeyAdd vắt qua năm cả 2 chiều', function(){
  eq(ctx.monthKeyAdd('2026-11', 3), '2027-02', 'cộng vắt năm');
  eq(ctx.monthKeyAdd('2027-02', -3), '2026-11', 'trừ vắt năm');
  eq(ctx.monthKeyAdd('2026-10', 0), '2026-10', 'cộng 0');
});

test('daysBetween', function(){
  eq(ctx.daysBetween('2026-12-01','2026-12-10'), 9, '9 ngày');
  eq(ctx.daysBetween('2026-12-10','2026-12-01'), -9, 'âm khi ngược chiều');
});

test('entryIsEmpty', function(){
  loadData(baseData());
  eq(ctx.entryIsEmpty({ thu:{}, chi:{}, ghiChu:'', refs:[] }), true, 'entry rỗng');
  eq(ctx.entryIsEmpty({ thu:{}, chi:{an:0}, ghiChu:'', refs:[] }), true, 'số 0 vẫn coi là rỗng');
  eq(ctx.entryIsEmpty({ thu:{}, chi:{an:1}, ghiChu:'', refs:[] }), false, 'có tiền');
  eq(ctx.entryIsEmpty({ thu:{}, chi:{}, ghiChu:'ghi chú', refs:[] }), false, 'có ghi chú');
  eq(ctx.entryIsEmpty({ thu:{}, chi:{}, ghiChu:'', refs:[{loanId:'x',loai:'traNo',soTien:0}] }), false, 'có ref');
});

/* ==================================================================== */
group('H. Hạn mức tháng + chuỗi số dư theo ngày (sotay.js)');

function dataHanMuc(){
  var d = baseData({
    settings: { soDuDauKy: 1000000, ngayBatDau: '2026-09-01', thangBatDauDuTru: '2026-09' },
    categories: {
      thu: [{id:'luong',ten:'Lương',chiTieu:0}],
      chi: [{id:'an',ten:'Ăn',chiTieu:1000000},{id:'xang',ten:'Xăng',chiTieu:500000},
            {id:'khac',ten:'Khác',chiTieu:0},{id:'choVay',ten:'Cho vay',chiTieu:900000,khongDuTru:true}]
    }
  });
  d.journal['2026-10-02'] = { thu:{luong:5000000}, chi:{an:900000}, ghiChu:'', refs:[], items:[] };
  d.journal['2026-10-05'] = { thu:{}, chi:{an:200000, xang:100000, choVay:700000}, ghiChu:'', refs:[], items:[] };
  return d;
}

test('hanMucMuc: ngưỡng 80% / 100%', function(){
  eq(ctx.hanMucMuc(0.79), 'ok'); eq(ctx.hanMucMuc(0.8), 'warn');
  eq(ctx.hanMucMuc(1), 'warn', 'đúng 100% chưa vượt'); eq(ctx.hanMucMuc(1.01), 'over');
});

test('hanMucThangRows: chỉ danh mục có chỉ tiêu, bỏ khongDuTru, sắp % giảm dần', function(){
  loadData(dataHanMuc());
  var r = ctx.hanMucThangRows('2026-10');
  eq(r.length, 2, 'Khác (chỉ tiêu 0) và Cho vay (khongDuTru) bị loại');
  eq(r[0].id, 'an', 'Ăn 110% đứng đầu');
  eq(r[0].da, 1100000, 'cộng dồn cả 2 ngày');
  near(r[0].pct, 1.1, 0.0001, '% của Ăn');
  eq(r[1].id, 'xang'); near(r[1].pct, 0.2, 0.0001, '% của Xăng');
});

test('hanMucThangRows: tháng không có phát sinh -> 0%', function(){
  loadData(dataHanMuc());
  var r = ctx.hanMucThangRows('2026-11');
  eq(r.length, 2); eq(r[0].da, 0);
});

test('balanceSeries: số dư cuối ngày khớp balanceAt, tháng quá khứ đủ ngày', function(){
  loadData(dataHanMuc());
  setToday('2026-12-15');
  var s = ctx.balanceSeries('2026-10');
  eq(s.vals.length, 31, 'tháng 10 đủ 31 ngày khi đã qua');
  eq(s.vals[0], 1000000, 'trước ngày 02 chưa có phát sinh');
  eq(s.vals[1], 5100000, '02/10: +5tr -900k');
  eq(s.vals[4], 4100000, '05/10: 5,1tr trừ 1tr (gồm cả khoản cho vay 700k)');
  eq(s.vals[30], ctx.balanceAt('2026-10-31'));
  setToday('2026-10-01');
});

test('balanceSeries: tháng đang diễn ra chỉ tới hôm nay; trước mốc khóa sổ thì rỗng', function(){
  loadData(dataHanMuc());
  setToday('2026-10-07');
  eq(ctx.balanceSeries('2026-10').vals.length, 7);
  eq(ctx.balanceSeries('2026-08').vals.length, 0, 'tháng 8 trước mốc khóa sổ 09/2026');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('W. Ví / nguồn tiền');

function dataVi(){
  var d = baseData({ settings: { soDuDauKy: 5000000, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' } });
  d.wallets = [ { id:'a', ten:'Tiền mặt', soDuDauKy: 3000000 }, { id:'b', ten:'Vietcombank', soDuDauKy: 2000000 } ];
  d.journal['2026-10-02'] = { thu:{luong:10000000}, chi:{an:100000}, ghiChu:'', refs:[], items:[
    { iid:'i1', kind:'thu', catId:'luong', soTien:10000000, walletId:'b' },
    { iid:'i2', kind:'chi', catId:'an', soTien:100000, walletId:'a' } ] };
  return d;
}

test('migration: dữ liệu cũ chỉ có soDuDauKy -> 1 ví mang đúng số đó, tổng không đổi, idempotent', function(){
  var d = baseData({ settings: { soDuDauKy: 7500000, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' } });
  d.journal['2026-10-02'] = { thu:{}, chi:{an:50000}, ghiChu:'x', refs:[] };
  loadData(d);
  var st = ctx.state.data;
  eq(st.wallets.length, 1); eq(st.wallets[0].soDuDauKy, 7500000);
  eq(st.settings.soDuDauKy, 7500000);
  eq(ctx.balanceAt('2026-10-31'), 7450000, 'số dư tổng giữ nguyên');
  ok(st.journal['2026-10-02'].items.every(function(it){ return it.walletId === st.wallets[0].id; }), 'item được gắn ví');
  var again = ctx.normalizeData(JSON.parse(JSON.stringify(st)));
  eq(JSON.stringify(again.wallets), JSON.stringify(st.wallets), 'chạy lần 2 không đổi');
});

test('settings.soDuDauKy luôn = tổng số dư đầu kỳ các ví', function(){
  loadData(dataVi());
  eq(ctx.state.data.settings.soDuDauKy, 5000000);
});

test('soDuTheoVi: từng ví đúng, tổng các ví = balanceAt', function(){
  var d = dataVi();
  d.vayNo.vayNoPhaiTra.push({ id:'L1', ten:'Vay', walletId:'b', hinhThuc:'khong_lai', soTienGoc:1000000, soThangVay:2, ngayVay:'2026-10-01', traNo:[] });
  d.journal['2026-10-03'] = { thu:{nhanTienVay:1000000}, chi:{}, ghiChu:'', refs:[{loanId:'L1',loai:'nhanTienVay',soTien:1000000,note:''}], items:[] };
  loadData(d);
  eq(ctx.soDuTheoVi('a','2026-10-31'), 2900000, 'ví a: 3tr - 100k');
  eq(ctx.soDuTheoVi('b','2026-10-31'), 13000000, 'ví b: 2tr + 10tr + 1tr tiền vay (ví của khoản vay)');
  eq(ctx.soDuTheoVi('a','2026-10-31') + ctx.soDuTheoVi('b','2026-10-31'), ctx.balanceAt('2026-10-31'), 'tổng ví = số dư tổng');
  eq(ctx.soDuTheoVi('b','2026-10-02'), 12000000, 'tính tới đúng ngày, không lấy khoản vay ngày 03');
});

test('chuyển tiền giữa ví: đổi số dư từng ví, KHÔNG đổi tổng, KHÔNG đụng journal', function(){
  loadData(dataVi());
  var truoc = ctx.balanceAt('2026-10-31'), jTruoc = JSON.stringify(ctx.state.data.journal);
  ok(ctx.chuyenViThem('2026-10-05','b','a',4000000,'rút tiền'), 'tạo được');
  eq(ctx.soDuTheoVi('a','2026-10-31'), 6900000); eq(ctx.soDuTheoVi('b','2026-10-31'), 8000000);
  eq(ctx.balanceAt('2026-10-31'), truoc, 'tổng không đổi');
  eq(JSON.stringify(ctx.state.data.journal), jTruoc, 'journal không bị thêm gì');
  eq(ctx.soDuTheoVi('a','2026-10-04'), 2900000, 'chưa tới ngày chuyển');
  eq(ctx.chuyenViThem('2026-10-05','a','a',1,''), null, 'cùng ví');
  eq(ctx.chuyenViThem('2026-10-05','a','zzz',1,''), null, 'ví không tồn tại');
  eq(ctx.chuyenViThem('2026-10-05','a','b',0,''), null, 'số tiền 0');
});

test('chuyển tiền trước mốc khóa sổ không tính; xóa lần chuyển hoàn lại số dư', function(){
  loadData(dataVi());
  ctx.chuyenViThem('2026-09-15','b','a',1000000,'');
  eq(ctx.soDuTheoVi('a','2026-10-31'), 2900000, 'trước ngayBatDau bị bỏ qua');
  var t = ctx.chuyenViThem('2026-10-10','b','a',500000,'');
  eq(ctx.soDuTheoVi('a','2026-10-31'), 3400000);
  ok(ctx.chuyenViXoa(t.id), 'xóa được'); eq(ctx.soDuTheoVi('a','2026-10-31'), 2900000, 'hoàn lại');
  eq(ctx.chuyenViXoa('khong-co'), null);
});

test('viDangDung: đếm dòng + khoản vay + lần chuyển; ví chưa dùng = 0', function(){
  var d = dataVi();
  d.wallets.push({ id:'c', ten:'Momo', soDuDauKy: 0 });
  loadData(d);
  eq(ctx.viDangDung('c'), 0, 'ví mới chưa dùng');
  eq(ctx.viDangDung('a'), 1); eq(ctx.viDangDung('b'), 1);
  ctx.chuyenViThem('2026-10-06','a','c',1000,'');
  eq(ctx.viDangDung('c'), 1, 'có lần chuyển tham chiếu');
});

test('entryAddItem / entryUpdateItem mang walletId; walletId lạ -> ví mặc định', function(){
  loadData(dataVi());
  var it = ctx.entryAddItem('2026-10-04','chi','an',70000,'ăn','b');
  eq(it.walletId, 'b'); eq(ctx.soDuTheoVi('b','2026-10-31'), 11930000);
  var it2 = ctx.entryAddItem('2026-10-04','chi','an',1000,'x','khong-ton-tai');
  eq(it2.walletId, 'a', 'rơi về ví đầu tiên');
  ctx.entryUpdateItem('2026-10-04', it.iid, 70000, 'ăn', null, null, 'a');
  eq(ctx.soDuTheoVi('b','2026-10-31'), 12000000, 'đổi ví: ví b được hoàn lại');
  eq(ctx.soDuTheoVi('a','2026-10-31'), 2900000 - 70000 - 1000);
  eq(ctx.soDuTheoVi('a','2026-10-31') + ctx.soDuTheoVi('b','2026-10-31'), ctx.balanceAt('2026-10-31'));
});

test('viChotSoDuDauKy: chốt từng ví, tổng giữ nguyên = số dư thật', function(){
  var d = dataVi();
  loadData(d);
  ctx.chuyenViThem('2026-10-05','b','a',4000000,'');
  var tong = ctx.balanceAt('2026-10-31');
  ctx.viChotSoDuDauKy('2026-10-31');
  var w = ctx.state.data.wallets;
  eq(w[0].soDuDauKy, 6900000); eq(w[1].soDuDauKy, 8000000);
  eq(ctx.state.data.settings.soDuDauKy, tong);
  eq(w[0].soDuDauKy + w[1].soDuDauKy, tong);
});

/* ==================================================================== */
group('K. Giao dịch định kỳ');

function dataDinhKy(){
  var d = baseData({ settings: { soDuDauKy: 0, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' } });
  d.categories = { thu: [{id:'luong',ten:'Lương',chiTieu:0}], chi: [{id:'nha',ten:'Tiền nhà',chiTieu:0},{id:'net',ten:'Net',chiTieu:0}] };
  d.dinhKy = [
    { id:'k1', ten:'Lương', kind:'thu', catId:'luong', soTien:10000000, ngay:5 },
    { id:'k2', ten:'Tiền nhà', kind:'chi', catId:'nha', soTien:3000000, ngay:31 },
    { id:'k3', ten:'Net', kind:'chi', catId:'net', soTien:200000, ngay:10, bat:false }
  ];
  return d;
}

test('dinhKyDenHan: chưa tới ngày thì không nhắc; tới ngày thì nhắc; tắt thì không', function(){
  loadData(dataDinhKy());
  eq(ctx.dinhKyDenHan('2026-10-04').length, 0, 'chưa tới ngày 5');
  var r = ctx.dinhKyDenHan('2026-10-05');
  eq(r.length, 1); eq(r[0].dk.id, 'k1'); eq(r[0].han, '2026-10-05');
  eq(ctx.dinhKyDenHan('2026-10-20').some(function(x){ return x.dk.id === 'k3'; }), false, 'k3 đang tắt');
});

test('dinhKyDenHan: ngày 31 co về cuối tháng ngắn', function(){
  loadData(dataDinhKy());
  eq(ctx.dinhKyDenHan('2026-11-29').some(function(x){ return x.dk.id === 'k2'; }), false, 'T11 có 30 ngày, chưa tới');
  var r = ctx.dinhKyDenHan('2026-11-30').filter(function(x){ return x.dk.id === 'k2'; });
  eq(r.length, 1); eq(r[0].han, '2026-11-30');
});

test('dinhKyGhi: tạo đúng dòng, mang dkId, cộng đúng tiền, hết nhắc sau khi ghi', function(){
  loadData(dataDinhKy());
  var dk = ctx.state.data.dinhKy[0];
  var r = ctx.dinhKyGhi(dk, '2026-10', '2026-10-07');
  eq(r.date, '2026-10-05');
  var e = ctx.state.data.journal['2026-10-05'];
  eq(e.thu.luong, 10000000); eq(ctx.entryItems(e)[0].dkId, 'k1');
  ok(e.ghiChu.indexOf('Lương') === 0, 'ghi chú ngày có tên khoản');
  eq(ctx.dinhKyDenHan('2026-10-07').length, 0, 'đã ghi thì hết nhắc');
  eq(ctx.dinhKyDaGhi(dk, '2026-11'), false, 'tháng sau thì chưa ghi');
  eq(ctx.dinhKyDenHan('2026-11-06').filter(function(x){ return x.dk.id === 'k1'; }).length, 1, 'tháng sau nhắc lại');
});

test('dinhKyGhi: ngày đến hạn trước mốc khóa sổ thì ghi vào hôm nay', function(){
  var d = dataDinhKy(); d.settings.ngayBatDau = '2026-10-10';
  loadData(d);
  var r = ctx.dinhKyGhi(ctx.state.data.dinhKy[0], '2026-10', '2026-10-12');
  eq(r.date, '2026-10-12', 'không ghi vào 05/10 (đã khóa sổ)');
});

test('bỏ qua tháng: hết nhắc tháng đó nhưng tháng sau vẫn nhắc', function(){
  loadData(dataDinhKy());
  ctx.state.data.dinhKy[0].bo.push('2026-10');
  eq(ctx.dinhKyDenHan('2026-10-20').filter(function(x){ return x.dk.id === 'k1'; }).length, 0);
  eq(ctx.dinhKyDenHan('2026-11-20').filter(function(x){ return x.dk.id === 'k1'; }).length, 1);
});

test('dinhKyHoanTac: trả lại tiền, xóa ghi chú và xóa ngày nếu rỗng', function(){
  loadData(dataDinhKy());
  var r = ctx.dinhKyGhi(ctx.state.data.dinhKy[0], '2026-10', '2026-10-07');
  ctx.dinhKyHoanTac(r);
  eq(ctx.state.data.journal['2026-10-05'], undefined, 'ngày rỗng bị xóa');
  eq(ctx.dinhKyDenHan('2026-10-07').length, 1, 'lại nhắc');
});

test('dinhKy: ghi đè walletId + migrate giá trị lạ', function(){
  var d = dataDinhKy(); d.dinhKy.push({ ten:'x', kind:'??', catId:'net', soTien:'5', ngay:99 });
  loadData(d);
  var k = ctx.state.data.dinhKy[3];
  eq(k.kind, 'chi'); eq(k.ngay, 31, 'ngày bị kẹp về 1-31'); eq(k.soTien, 5); ok(k.id && Array.isArray(k.bo) && k.bat === true);
});

/* ==================================================================== */
group('M. Mục tiêu tiết kiệm');

function dataMucTieu(){
  var d = baseData({ settings: { soDuDauKy: 0, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' } });
  d.wallets = [ { id:'a', ten:'Chính', soDuDauKy: 1000000 }, { id:'q', ten:'Quỹ mua xe', soDuDauKy: 2000000 } ];
  d.mucTieu = [
    { id:'m1', ten:'Mua xe', soTien:10000000, hanChot:'2027-03', walletId:'q', daGom:0 },
    { id:'m2', ten:'Du lịch', soTien:6000000, hanChot:'', walletId:'', daGom:1500000 }
  ];
  return d;
}

test('monthDiff', function(){
  eq(ctx.monthDiff('2026-10','2026-10'), 0); eq(ctx.monthDiff('2026-10','2027-03'), 5);
  eq(ctx.monthDiff('2026-12','2026-10'), -2, 'âm khi hạn đã qua');
});

test('gắn ví: số đã gom = số dư ví, tự tăng khi chuyển tiền vào ví', function(){
  loadData(dataMucTieu());
  var g = ctx.state.data.mucTieu[0];
  var t = ctx.mucTieuTienDo(g, '2026-10-06');
  eq(t.da, 2000000); eq(t.theoVi, true); near(t.pct, 0.2, 1e-9); eq(t.conThieu, 8000000);
  ctx.chuyenViThem('2026-10-07','a','q',500000,'');
  eq(ctx.mucTieuTienDo(g, '2026-10-31').da, 2500000, 'chuyển 500k vào ví quỹ');
  eq(ctx.mucTieuTienDo(g, '2026-10-06').da, 2000000, 'tính tới đúng ngày');
});

test('cần gom mỗi tháng = còn thiếu / số tháng còn lại (tính cả tháng hạn chót)', function(){
  loadData(dataMucTieu());
  var t = ctx.mucTieuTienDo(ctx.state.data.mucTieu[0], '2026-10-06');
  eq(t.soThangCon, 6, 'T10/2026 -> T3/2027 gồm cả 2 đầu = 6 tháng');
  near(t.canMoiThang, 8000000 / 6, 0.01);
  var cuoi = ctx.mucTieuTienDo(ctx.state.data.mucTieu[0], '2027-03-02');
  eq(cuoi.soThangCon, 1, 'tháng hạn chót: phải gom hết trong tháng này');
});

test('gom tay (không gắn ví) + không có hạn chót thì không tính cần/tháng', function(){
  loadData(dataMucTieu());
  var t = ctx.mucTieuTienDo(ctx.state.data.mucTieu[1], '2026-10-06');
  eq(t.da, 1500000); eq(t.theoVi, false); eq(t.canMoiThang, null); eq(t.soThangCon, null); near(t.pct, 0.25, 1e-9);
});

test('đã đủ / quá hạn', function(){
  var d = dataMucTieu(); d.mucTieu[1].daGom = 6000000; d.mucTieu[0].hanChot = '2026-08';
  loadData(d);
  var xong = ctx.mucTieuTienDo(ctx.state.data.mucTieu[1], '2026-10-06');
  eq(xong.xong, true); eq(xong.conThieu, 0);
  var qua = ctx.mucTieuTienDo(ctx.state.data.mucTieu[0], '2026-10-06');
  eq(qua.quaHan, true); eq(qua.canMoiThang, null);
  d.mucTieu[0].soTien = 1000000; loadData(d);
  eq(ctx.mucTieuTienDo(ctx.state.data.mucTieu[0], '2026-10-06').quaHan, false, 'đã đủ thì không tính là quá hạn');
});

test('số âm không làm tiến độ âm; walletId lạ bị gỡ khi normalize; mục tiêu không đổi số dư tổng', function(){
  var d = dataMucTieu(); d.wallets[1].soDuDauKy = -500000; d.mucTieu[1].walletId = 'khong-co';
  loadData(d);
  eq(ctx.mucTieuTienDo(ctx.state.data.mucTieu[0], '2026-10-06').da, 0, 'ví âm -> 0, không âm theo');
  eq(ctx.state.data.mucTieu[1].walletId, '', 'ví không tồn tại bị gỡ');
  eq(ctx.balanceAt('2026-10-31'), 500000, 'số dư tổng chỉ từ ví, không dính mục tiêu');
});

/* ==================================================================== */
group('N. Nhập CSV / Excel (nhap.js)');

test('nhapParseNgay: nhiều kiểu, ngày trước tháng, serial Excel, từ chối ngày ảo', function(){
  eq(ctx.nhapParseNgay('2026-10-05'), '2026-10-05');
  eq(ctx.nhapParseNgay('5/10/2026'), '2026-10-05', 'kiểu VN: ngày/tháng');
  eq(ctx.nhapParseNgay('05-10-26'), '2026-10-05', 'năm 2 chữ số');
  eq(ctx.nhapParseNgay('05.10.2026 14:30'), '2026-10-05', 'có giờ phía sau');
  eq(ctx.nhapParseNgay(46300), '2026-10-05', 'số ngày của Excel');
  eq(ctx.nhapParseNgay('31/02/2026'), '', 'ngày không tồn tại');
  eq(ctx.nhapParseNgay('13/13/2026'), '', 'tháng 13');
  eq(ctx.nhapParseNgay('abc'), ''); eq(ctx.nhapParseNgay(''), '');
});

test('nhapParseTien: định dạng VN/Mỹ, ký hiệu tiền, số âm, số lẻ bị bỏ', function(){
  eq(ctx.nhapParseTien('1.500.000'), 1500000); eq(ctx.nhapParseTien('1,500,000'), 1500000);
  eq(ctx.nhapParseTien('50.000đ'), 50000); eq(ctx.nhapParseTien('50.000 ₫'), 50000); eq(ctx.nhapParseTien('1500000 VND'), 1500000);
  eq(ctx.nhapParseTien('-50.000'), -50000); eq(ctx.nhapParseTien('(50.000)'), -50000); eq(ctx.nhapParseTien('−20,000'), -20000);
  eq(ctx.nhapParseTien('1.500,50'), 1500, 'phần lẻ 2 chữ số bị bỏ'); eq(ctx.nhapParseTien('1.500'), 1500, '3 chữ số = hàng nghìn');
  eq(ctx.nhapParseTien(75000), 75000); eq(ctx.nhapParseTien(-75000), -75000);
  ok(isNaN(ctx.nhapParseTien('')) && isNaN(ctx.nhapParseTien('abc')), 'rỗng/chữ -> NaN');
});

test('nhapParseLoai: có hiểu thu/chi, KHÔNG đoán Nợ/Có', function(){
  eq(ctx.nhapParseLoai('Thu'), 'thu'); eq(ctx.nhapParseLoai('Thu nhập'), 'thu'); eq(ctx.nhapParseLoai('income'), 'thu');
  eq(ctx.nhapParseLoai('Chi tiêu'), 'chi'); eq(ctx.nhapParseLoai('expense'), 'chi'); eq(ctx.nhapParseLoai('-'), 'chi');
  eq(ctx.nhapParseLoai('Nợ'), ''); eq(ctx.nhapParseLoai('Có'), ''); eq(ctx.nhapParseLoai(''), '');
});

test('nhapParseCsv: ngoặc kép, dấu phẩy trong ô, ; và tab, BOM, xuống dòng trong ô', function(){
  var a = ctx.nhapParseCsv('﻿Ngày,Số tiền,Nội dung\n5/10/2026,"50,000","Ăn ""trưa"", cơm"\n');
  eq(a.length, 2); eq(a[0][0], 'Ngày'); eq(a[1][1], '50,000'); eq(a[1][2], 'Ăn "trưa", cơm');
  var b = ctx.nhapParseCsv('Ngày;Số tiền\r\n5/10/2026;1.500.000\r\n6/10/2026;20.000');
  eq(b.length, 3); eq(b[1][1], '1.500.000'); eq(b[2][0], '6/10/2026');
  var c = ctx.nhapParseCsv('a\tb\n1\t"x\ny"\n'); eq(c[1][1], 'x\ny');
});

test('nhapCoHeader + nhapDoanCot: có tiêu đề theo tên, không tiêu đề theo nội dung', function(){
  var r1 = ctx.nhapParseCsv('Ngày,Số tiền,Loại,Danh mục,Ghi chú\n5/10/2026,50000,Chi,Ăn,Cơm');
  eq(ctx.nhapCoHeader(r1), true);
  var m1 = ctx.nhapDoanCot(r1, true);
  eq(m1.ngay, 0); eq(m1.tien, 1); eq(m1.loai, 2); eq(m1.cat, 3); eq(m1.note, 4);
  var r2 = ctx.nhapParseCsv('5/10/2026,50000,Cơm trưa\n6/10/2026,20000,Cà phê');
  eq(ctx.nhapCoHeader(r2), false);
  var m2 = ctx.nhapDoanCot(r2, false);
  eq(m2.ngay, 0); eq(m2.tien, 1); eq(m2.note, 2);
});

function impCoBan(csv, over){
  var rows = ctx.nhapParseCsv(csv), hd = ctx.nhapCoHeader(rows);
  var imp = { rows: rows, coHeader: hd, map: ctx.nhapDoanCot(rows, hd), soDuong: 'chi', catMacDinh: 'chi|an', catMap: {}, boTrung: true, viId: undefined };
  if (over) Object.keys(over).forEach(function(k){ imp[k] = over[k]; });
  return imp;
}
function dataNhap(){
  var d = baseData({ settings: { soDuDauKy: 1000000, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' } });
  d.categories = { thu: [{id:'luong',ten:'Lương',chiTieu:0},{id:'nhanTienVay',ten:'Nhận tiền vay',chiTieu:0}],
                   chi: [{id:'an',ten:'Ăn',chiTieu:0},{id:'xang',ten:'Xăng',chiTieu:0},{id:'choVay',ten:'Cho vay',chiTieu:0}] };
  return d;
}

test('nhapPhanTich: ghép danh mục có sẵn theo tên (bỏ dấu/hoa thường), dòng lỗi, danh mục mới', function(){
  loadData(dataNhap());
  var kq = ctx.nhapPhanTich(impCoBan('Ngày,Số tiền,Loại,Danh mục,Ghi chú\n5/10/2026,50000,Chi,an,Cơm\n6/10/2026,5000000,Thu,LƯƠNG,T10\nxx,100,Chi,Ăn,sai ngày\n7/10/2026,0,Chi,Ăn,tiền 0\n8/10/2026,30000,Chi,Cà phê,Cf'));
  eq(kq.dong.length, 5);
  eq(kq.dong[0].catId, 'an'); eq(kq.dong[0].kind, 'chi'); eq(kq.dong[0].soTien, 50000);
  eq(kq.dong[1].catId, 'luong'); eq(kq.dong[1].kind, 'thu');
  ok(kq.dong[2].loi.indexOf('Ngày') === 0, 'ngày hỏng'); ok(kq.dong[3].loi.indexOf('Số tiền') === 0, 'tiền 0');
  eq(kq.dong[4].catMoi, 'Cà phê', 'danh mục lạ -> tạo mới');
  eq(kq.nOk, 3); eq(kq.nLoi, 2); eq(kq.tongThu, 5000000); eq(kq.tongChi, 80000);
});

test('nhapPhanTich: số âm = chi; số dương theo soDuong; cột Loại thắng dấu số', function(){
  loadData(dataNhap());
  var kq = ctx.nhapPhanTich(impCoBan('Ngày,Số tiền,Ghi chú\n5/10/2026,-50000,a\n6/10/2026,200000,b', { soDuong: 'thu', catMacDinh: 'thu|luong' }));
  eq(kq.dong[0].kind, 'chi'); eq(kq.dong[0].soTien, 50000, 'số âm -> chi, lấy trị tuyệt đối');
  eq(kq.dong[1].kind, 'thu');
  var kq2 = ctx.nhapPhanTich(impCoBan('Ngày,Số tiền,Loại\n5/10/2026,-50000,Thu', { catMacDinh: 'thu|luong' }));
  eq(kq2.dong[0].kind, 'thu', 'cột Loại ghi Thu thì là thu dù số âm');
});

test('nhapPhanTich: không danh mục + không mặc định -> lỗi; danh mục Vay-Nợ không bị ghép tự động', function(){
  loadData(dataNhap());
  var kq = ctx.nhapPhanTich(impCoBan('Ngày,Số tiền\n5/10/2026,50000', { catMacDinh: '' }));
  ok(kq.dong[0].loi.indexOf('danh mục') >= 0, 'báo thiếu danh mục');
  var kq2 = ctx.nhapPhanTich(impCoBan('Ngày,Số tiền,Danh mục\n5/10/2026,50000,Cho vay'));
  eq(kq2.dong[0].catId, '', 'không ghép vào "Cho vay" (chỉ ghi từ tab Vay-Nợ)'); eq(kq2.dong[0].catMoi, 'Cho vay');
});

test('nhập + nhập lại cùng file: không nhân đôi (trùng bị bỏ qua); số dư đúng', function(){
  loadData(dataNhap());
  var csv = 'Ngày,Số tiền,Loại,Danh mục,Ghi chú\n5/10/2026,50000,Chi,Ăn,Cơm\n5/10/2026,50000,Chi,Ăn,Cơm tối\n6/10/2026,5000000,Thu,Lương,T10';
  var imp = impCoBan(csv);
  var kq = ctx.nhapPhanTich(imp), r = ctx.nhapThucHien(imp, kq);
  eq(r.da.length, 3, 'nhập 3 dòng'); eq(ctx.balanceAt('2026-10-31'), 1000000 - 100000 + 5000000);
  var e = ctx.state.data.journal['2026-10-05'];
  eq(e.chi.an, 100000); eq(ctx.entryItems(e).length, 2); ok(e.ghiChu.indexOf('Cơm') >= 0, 'ghi chú ngày có nội dung');
  var kq2 = ctx.nhapPhanTich(imp);
  eq(kq2.nTrung, 3, 'lần 2: cả 3 dòng trùng'); eq(kq2.nOk, 0);
  ctx.nhapThucHien(imp, kq2);
  eq(ctx.balanceAt('2026-10-31'), 5900000, 'nhập lần 2 không đổi số dư');
});

test('dòng giống nhau TRONG file không bị coi là trùng nhau (2 ly cà phê cùng giá)', function(){
  loadData(dataNhap());
  var kq = ctx.nhapPhanTich(impCoBan('Ngày,Số tiền,Ghi chú\n5/10/2026,30000,Cf\n5/10/2026,30000,Cf'));
  eq(kq.nOk, 2); eq(kq.nTrung, 0);
});

test('tạo danh mục mới khi nhập, dùng chung cho nhiều dòng; hoàn tác xóa dòng + danh mục mới + số dư về cũ', function(){
  loadData(dataNhap());
  var truoc = ctx.balanceAt('2026-10-31'), soCat = ctx.state.data.categories.chi.length;
  var imp = impCoBan('Ngày,Số tiền,Danh mục\n5/10/2026,30000,Cà phê\n6/10/2026,35000,cà phê');
  var kq = ctx.nhapPhanTich(imp), r = ctx.nhapThucHien(imp, kq);
  eq(ctx.state.data.categories.chi.length, soCat + 1, 'chỉ tạo 1 danh mục cho 2 dòng cùng tên');
  eq(r.moi.length, 1); eq(ctx.balanceAt('2026-10-31'), truoc - 65000);
  ctx.nhapHoanTac(r);
  eq(ctx.state.data.categories.chi.length, soCat, 'danh mục mới bị gỡ'); eq(ctx.balanceAt('2026-10-31'), truoc, 'số dư về cũ');
  eq(Object.keys(ctx.state.data.journal).length, 0, 'ngày rỗng bị xóa');
});

test('nhập vào ví chọn; ngày trước mốc khóa sổ chỉ cảnh báo, không chặn', function(){
  var d = dataNhap(); d.wallets = [{id:'a',ten:'A',soDuDauKy:600000},{id:'b',ten:'B',soDuDauKy:400000}];
  loadData(d);
  var imp = impCoBan('Ngày,Số tiền,Ghi chú\n5/10/2026,50000,x\n15/9/2026,10000,cũ', { viId: 'b' });
  var kq = ctx.nhapPhanTich(imp);
  ok(kq.dong[1].canhBao.indexOf('chốt số dư') >= 0, 'cảnh báo mốc khóa sổ'); eq(kq.nOk, 2);
  ctx.nhapThucHien(imp, kq);
  eq(ctx.soDuTheoVi('b', '2026-10-31'), 350000, 'ví B trừ 50k (dòng cũ trước mốc không tính)'); eq(ctx.soDuTheoVi('a', '2026-10-31'), 600000);
});

test('danh mục mặc định riêng cho thu và chi: file hỗn hợp không có cột danh mục', function(){
  loadData(dataNhap());
  var kq = ctx.nhapPhanTich(impCoBan('Ngày,Số tiền\n5/10/2026,-50000\n6/10/2026,200000', { soDuong: 'thu', catMacDinh: '', catMD: { thu: 'thu|luong', chi: 'chi|an' } }));
  eq(kq.nOk, 2, 'cả thu lẫn chi đều có danh mục'); eq(kq.dong[0].catId, 'an'); eq(kq.dong[1].catId, 'luong');
  var thieu = ctx.nhapPhanTich(impCoBan('Ngày,Số tiền\n5/10/2026,-50000\n6/10/2026,200000', { soDuong: 'thu', catMacDinh: '', catMD: { thu: '', chi: 'chi|an' } }));
  eq(thieu.nOk, 1); eq(thieu.nLoi, 1, 'thiếu mặc định cho thu -> chỉ dòng thu lỗi');
});

/* ==================================================================== */
group('C. Màu danh mục');

test('catMau: màu người dùng chọn thắng; mặc định theo vị trí và ổn định; mã màu hỏng bị gỡ', function(){
  var d = baseData(); d.categories.chi = [{id:'a',ten:'A',mau:'#112233'},{id:'b',ten:'B'},{id:'c',ten:'C',mau:'đỏ'}];
  loadData(d);
  eq(ctx.catMau('chi','a'), '#112233', 'màu đã chọn');
  eq(ctx.catMau('chi','b'), ctx.CAT_PALETTE[1], 'mặc định theo vị trí (index 1)');
  eq(ctx.state.data.categories.chi[2].mau, '', 'mã màu không hợp lệ bị bỏ khi normalize');
  eq(ctx.catMau('chi','c'), ctx.CAT_PALETTE[2]);
  eq(ctx.catMau('chi','khong-co'), '#9ca3af', 'danh mục đã xóa -> xám');
});

/* ==================================================================== */
group('V. Số phiên bản ?v= (tools/bump.js)');

test('?v= trong index.html khớp nội dung file — nếu lệch: chạy "node tools/bump.js"', function(){
  var bump = require(path.join(__dirname, '..', 'tools', 'bump.js'));
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var r = bump.capNhat(html);
  ok(r.html === html, 'index.html còn ?v= cũ (đúng phải là ' + r.ver + '). Banner "Có bản mới" sẽ KHÔNG báo nếu quên bước này. Chạy: node tools/bump.js');
});

test('bump: băm đổi khi nội dung đổi, ổn định khi không đổi, mọi file đều có ?v= cùng số', function(){
  var bump = require(path.join(__dirname, '..', 'tools', 'bump.js'));
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var files = bump.filesInIndex(html);
  ok(files.length >= 10 && files.indexOf('js/app.js') >= 0 && files.indexOf('style.css') >= 0, 'đọc được danh sách file: ' + files.join(','));
  eq(bump.tinhVer(html), bump.tinhVer(html), 'cùng nội dung -> cùng số');
  var vers = {}; html.replace(/\?v=([0-9a-f]+)"/g, function(_, v){ vers[v] = 1; });
  eq(Object.keys(vers).length, 1, 'tất cả file dùng chung 1 số ?v=');
});

/* ==================================================================== */
group('R. Rà soát logic 10/2026 (xử lý form, khóa sổ, dự báo, mô phỏng)');

// giả lập tối thiểu những thứ ui.js / drive-sync.js / app.js cung cấp, chỉ cho nhóm test này
var thongBao = [];
ctx.toast = function(msg){ thongBao.push(String(msg)); };
ctx.scheduleSave = function(){};
ctx.docSo = function(v){ if (typeof v === 'number') return v; var am = /^\s*-/.test(String(v)); var n = Number(String(v == null ? '' : v).replace(/[^0-9]/g, '')) || 0; return am ? -n : n; };
ctx.veSo = function(n){ var x = Math.round(ctx.docSo(n)); return x ? String(x) : ''; };
ctx.xacNhan = function(){ return Promise.resolve(true); };
var renderThat = {};   // bản render thật, để test nào cần vẽ HTML thì lấy lại
['renderSoTay', 'renderDanhMuc', 'renderVayNo', 'renderMoPhong'].forEach(function(n){ renderThat[n] = ctx[n]; ctx[n] = function(){}; });

// chạy fn với DOM giả: els = {id: {value}}, lists = {selector: [phần tử]}
function voiDom(els, lists, fn){
  var g0 = ctx.document.getElementById, q0 = ctx.document.querySelectorAll;
  ctx.document.getElementById = function(id){ return els[id] || null; };
  ctx.document.querySelectorAll = function(sel){ return (lists && lists[sel]) || []; };
  try{ return fn(); } finally { ctx.document.getElementById = g0; ctx.document.querySelectorAll = q0; }
}
function oNhap(cat, value, lock){
  return { value: value, getAttribute: function(a){ return a === 'data-cat' ? cat : (a === 'data-lock' ? String(lock || 0) : null); } };
}
function elAct(attrs){ return { getAttribute: function(a){ return attrs[a] == null ? null : attrs[a]; } }; }
function entryChi(date, cat){ var e = ctx.state.data.journal[date]; return e ? ctx.num((e.chi || {})[cat]) : 0; }

test('Sổ tay: sửa ngày rồi đổi ô Ngày KHÔNG ghi đè ngày khác', function(){
  setToday('2026-10-10');
  var d = baseData();
  d.journal['2026-10-01'] = { thu:{}, chi:{ an:100000 }, ghiChu:'X', refs:[], items:[] };
  d.journal['2026-10-02'] = { thu:{}, chi:{ an:200000 }, ghiChu:'Y', refs:[], items:[] };
  loadData(d);
  ctx.state.editingDate = '2026-10-01';
  voiDom({ f_date:{ value:'2026-10-02' }, f_ghichu:{ value:'X' } }, { '.f_chi':[ oNhap('an', '150000') ] }, function(){
    ctx.handleSoTayAction('saveEntry', { _daBaoAm: true });
  });
  ctx.state.editingDate = null;
  eq(entryChi('2026-10-02', 'an'), 200000, 'ngày 02 phải còn nguyên');
  eq(entryChi('2026-10-01', 'an'), 150000, 'sửa phải vào đúng ngày 01');
});

test('Sổ tay: sửa ngày có tiền ở danh mục đã bị xóa — tiền đó phải được GIỮ', function(){
  setToday('2026-10-10');
  var d = baseData();
  d.journal['2026-10-03'] = { thu:{}, chi:{ an:50000, xang:70000 }, ghiChu:'', refs:[], items:[] };   // 'xang' không có trong categories
  loadData(d);
  var truoc = ctx.balanceAt('9999-12-31');
  ctx.state.editingDate = '2026-10-03';
  voiDom({ f_date:{ value:'2026-10-03' }, f_ghichu:{ value:'' } }, { '.f_chi':[ oNhap('an', '50000') ] }, function(){
    ctx.handleSoTayAction('saveEntry', { _daBaoAm: true });
  });
  ctx.state.editingDate = null;
  ctx.invalidateBalanceCache();
  eq(entryChi('2026-10-03', 'xang'), 70000, 'tiền danh mục đã xóa');
  eq(ctx.balanceAt('9999-12-31'), truoc, 'số dư không đổi khi lưu mà không sửa gì');
  eq(ctx.itemsSum(ctx.state.data.journal['2026-10-03'], 'chi', 'xang'), 70000, 'dòng chi tiết vẫn còn');
});

test('Danh mục: không xóa được danh mục còn tiền / danh mục của Vay-Nợ; danh mục trống xóa được', function(){
  setToday('2026-10-10');
  var d = baseData();
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }, { id:'xang', ten:'Xăng', chiTieu:0 }, { id:'traNo', ten:'Trả nợ', chiTieu:0 }];
  d.journal['2026-10-03'] = { thu:{}, chi:{ an:50000 }, ghiChu:'', refs:[], items:[] };
  loadData(d);
  var ids = function(){ return ctx.state.data.categories.chi.map(function(c){ return c.id; }); };
  ctx.handleDanhMucAction('delCat', elAct({ 'data-kind':'chi', 'data-id':'an' }));
  ok(ids().indexOf('an') >= 0, 'còn tiền -> không xóa');
  ctx.handleDanhMucAction('delCat', elAct({ 'data-kind':'chi', 'data-id':'traNo' }));
  ok(ids().indexOf('traNo') >= 0, 'danh mục Vay-Nợ -> không xóa');
  eq(ctx.catDangCoTien('chi', 'an'), 1, 'đếm số ngày có tiền');
  ctx.handleDanhMucAction('delCat', elAct({ 'data-kind':'chi', 'data-id':'xang' }));
  ok(ids().indexOf('xang') < 0, 'danh mục trống -> xóa được');
});

test('Khóa sổ: không cho khóa tháng nằm trước mốc khóa sổ hiện tại (số dư không đổi)', function(){
  setToday('2026-10-10');
  var d = baseData({ settings:{ soDuDauKy:5000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.journal['2026-05-10'] = { thu:{}, chi:{ an:900000 }, ghiChu:'', refs:[], items:[] };
  d.journal['2026-10-02'] = { thu:{}, chi:{ an:100000 }, ghiChu:'', refs:[], items:[] };
  loadData(d);
  var truoc = ctx.balanceAt('9999-12-31');
  var daHoi = 0, xn0 = ctx.xacNhan;
  ctx.xacNhan = function(){ daHoi++; return Promise.resolve(false); };   // hỏi mà trả "không" -> cũng không đổi mốc
  try{ voiDom({ cfg_khoa:{ value:'2026-03' } }, null, function(){ ctx.handleDanhMucAction('lockMonth', {}); }); }
  finally { ctx.xacNhan = xn0; }
  eq(daHoi, 0, 'phải chặn ngay, không được mở hộp thoại xác nhận khóa sổ');
  eq(ctx.state.data.settings.ngayBatDau, '2026-10-01', 'mốc không bị lùi');
  eq(ctx.balanceAt('9999-12-31'), truoc, 'số dư không đổi');
});

test('Khoản vay mới khai "đã trả N kỳ": tiến độ đúng NGAY, không cần tải lại', function(){
  setToday('2026-10-10');
  loadData(baseData());
  ctx.state.vnFormId = null;
  var f = { vn_vn_ten:'Vay A', vn_vn_hinh:'khong_lai', vn_vn_ngay:'2026-06-10', vn_vn_ngayTra:'10', vn_vn_loai:'ban_be',
            vn_vn_soTien:'6000000', vn_vn_soThang:'6', vn_vn_daoHan:'', vn_vn_laiSuat:'', vn_vn_traThang:'', vn_vn_tatToan:'', vn_vn_daTraKy:'2' };
  Object.keys(f).forEach(function(k){ f[k] = { value: f[k] }; });
  voiDom(f, null, function(){ ctx.handleVayNoAction('vnSaveVayNo', {}); });
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  var td = ctx.tienDoTraNo(l);
  eq(td.daTraKy, 2, 'đã đóng 2 kỳ');
  eq(td.kyTiepIdx, 2, 'kỳ tiếp theo là kỳ 3');
  near(ctx.soTienConLaiPhaiTra(l), 4000000, 0.01, 'dư nợ');
});

function haiKhoanVay(){
  return [
    loanKhongLai({ id:'v1', ten:'V1', soTienGoc:3000000, soThangVay:3, ngayVay:'2026-09-10', ngayTraHangThang:20 }),
    loanKhongLai({ id:'v2', ten:'V2', soTienGoc:3000000, soThangVay:3, ngayVay:'2026-09-10', ngayTraHangThang:20 })
  ];
}
function baseTraNo(){
  var d = baseData();
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }, { id:'traNo', ten:'Trả nợ', chiTieu:0 }];
  return d;
}

test('Dự báo tháng này: trả 1 trong 2 khoản vay thì khoản còn lại VẪN còn trong dự báo', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = haiKhoanVay();
  loadData(d);
  eq(ctx.tongChiThangCard('2026-10'), 2000000, 'chưa trả gì: 2 khoản x 1tr');
  // trả khoản v1 kỳ tháng 10 qua đúng đường của app (có ref + đóng kỳ)
  var v1 = ctx.state.data.vayNo.vayNoPhaiTra[0];
  v1.traNo.push({ rid:'r1', ky:0, mk:'2026-10', soTien:1000000, ngay:'2026-10-05', dongKy:true });
  ctx.journalAddRef('2026-10-05', 'v1', 'traNo', 1000000, 'Trả nợ V1', { ky:0, rid:'r1' });
  eq(ctx.tongChiThangCard('2026-10'), 2000000, '1tr đã trả + 1tr của V2 còn phải trả');
});

test('Dự báo tháng này: tiền trả nợ NHẬP TAY không gắn khoản thì không tính 2 lần', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = haiKhoanVay();
  d.journal['2026-10-05'] = { thu:{}, chi:{ traNo:1000000 }, ghiChu:'', refs:[], items:[] };
  loadData(d);
  eq(ctx.tongChiThangCard('2026-10'), 2000000, '1tr đã chi + (2tr lịch - 1tr nhập tay) = 2tr');
});

test('Dự báo tháng này: thu hồi cho vay theo từng khoản, không theo cả danh mục', function(){
  setToday('2026-10-10');
  var d = baseData();
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'thuHoiChoVay', ten:'Thu hồi', chiTieu:0 }];
  d.vayNo.choVay = [
    { id:'c1', ten:'A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-20' },
    { id:'c2', ten:'B', soTien:2000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-25' }
  ];
  loadData(d);
  eq(ctx.tongThuThangCard('2026-10'), 3000000, 'chưa thu gì');
  var a = ctx.state.data.vayNo.choVay[0];
  a.daThu = 1000000; a.trangThai = 'da_thu_du';
  ctx.journalAddRef('2026-10-08', 'c1', 'thuHoiChoVay', 1000000, 'Thu hồi A');
  eq(ctx.tongThuThangCard('2026-10'), 3000000, '1tr đã thu + 2tr của B còn phải thu');
});

test('tongTraNoThang: kỳ QUÁ HẠN chưa trả dồn vào tháng hiện tại', function(){
  setToday('2026-12-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ id:'v1', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:10 })];   // kỳ: T10..T3
  loadData(d);
  eq(ctx.tongTraNoThang('2026-10'), 0, 'tháng cũ không còn giữ số');
  eq(ctx.tongTraNoThang('2026-11'), 0, 'tháng cũ không còn giữ số');
  eq(ctx.tongTraNoThang('2026-12'), 3000000, 'T10 + T11 quá hạn + T12');
  eq(ctx.tongTraNoThang('2027-01'), 1000000, 'tháng sau giữ nguyên');
  setToday('2026-10-01');
});

test('Mô phỏng tất toán sớm: các kỳ TRƯỚC tháng tất toán vẫn phải trả, tất toán = phần còn lại từ tháng đó', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ id:'v1', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:10 })];   // kỳ: T10..T3, 1tr/kỳ
  loadData(d);
  ctx.state.mp.data = JSON.parse(JSON.stringify(ctx.state.data));
  ctx.state.mp.dieuChinh = [{ loai:'traSom', bat:true, loanId:'v1', mk:'2027-01', soTienTatToan:0 }];
  var sc = ctx.mpBuildScenario();
  var rows = ctx.mpChieuDongTien(sc.data, '2026-10', 6, sc.overlay);
  var chi = rows.map(function(r){ return Math.round(r.chi); });
  eq(JSON.stringify(chi), JSON.stringify([1000000, 1000000, 1000000, 3000000, 0, 0]), 'T10-T12 trả đều, T1 tất toán 3 kỳ còn lại, sau đó hết');
  // nhập số tất toán thực tế thì lấy số đó
  ctx.state.mp.dieuChinh[0].soTienTatToan = 2500000;
  var sc2 = ctx.mpBuildScenario();
  var rows2 = ctx.mpChieuDongTien(sc2.data, '2026-10', 6, sc2.overlay);
  eq(Math.round(rows2[3].chi), 2500000, 'dùng số tất toán đã nhập');
  ctx.state.mp.dieuChinh = []; ctx.state.mp.data = null;
  setToday('2026-10-01');
});

test('Dòng tiền: "Lũy kế số dư" từ tháng hiện tại cộng dồn cả số dự báo', function(){
  setToday('2026-10-10');
  var d = baseData({ settings:{ soDuDauKy:5000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:1000000, coDinhChiTieu:true }];
  loadData(d);
  var root = { innerHTML:'' };
  ctx.state.dongTienYear = 2026; ctx.state.dtBangNam = true;
  voiDom({ tabContent: root }, null, function(){ ctx.renderDongTien(); });
  ctx.state.dtBangNam = false;
  var hang = root.innerHTML.split('Lũy kế số dư')[1].split('</tr>')[0];
  var soTien = function(n){ return '<td>' + ctx.fmt(n) + '</td>'; };
  ok(hang.indexOf(soTien(4000000)) >= 0, 'T10 = 5tr - 1tr: ' + hang);
  ok(hang.indexOf(soTien(3000000)) >= 0, 'T11 = 4tr - 1tr: ' + hang);
  ok(hang.indexOf(soTien(2000000)) >= 0, 'T12 = 3tr - 1tr: ' + hang);
  setToday('2026-10-01');
});

test('Sổ tay: nhập trả nợ mà không chọn khoản thì có nhắc (thu hồi cho vay không còn nhập ở Sổ tay)', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'thuHoiChoVay', ten:'Thu hồi', chiTieu:0 }];
  d.vayNo.choVay = [{ id:'c1', ten:'A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-20' }];
  d.vayNo.vayNoPhaiTra = [haiKhoanVay()[0]];
  loadData(d);
  thongBao.length = 0;
  ctx.state.editingDate = null;
  voiDom({ f_date:{ value:'2026-10-10' }, f_ghichu:{ value:'' }, sotay_selChoVay:{ value:'' }, sotay_selVayNo:{ value:'' } },
         { '.f_thu':[], '.f_chi':[ oNhap('traNo', '300000') ] },
         function(){ ctx.handleSoTayAction('saveEntry', { _daBaoAm: true }); });
  ok(thongBao.some(function(m){ return m.indexOf('Trả nợ') >= 0 && m.indexOf('chưa chọn khoản') >= 0; }), 'nhắc trả nợ: ' + thongBao.join(' | '));
  eq(ctx.state.data.vayNo.choVay[0].daThu, 0, 'khoản cho vay không đổi');
});

test('cho vay TẤT TOÁN (thu thực tế): thu đủ -> ghi thu vào Sổ tay đúng ví/ngày, khoản đóng, sổ cái khớp; xóa ngày thì khoản mở lại', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.wallets = [{ id:'w1', ten:'Chính', soDuDauKy: 0 }, { id:'w2', ten:'Tiền mặt', soDuDauKy: 0 }];
  d.vayNo.choVay = [{ id:'cv1', ten:'Bạn A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', walletId:'w1' }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  var thieu = ctx.choVayGhiThu(c, 1000000, '2026-12-09', 'w2', false);
  eq(thieu, 0, 'không còn thiếu');
  eq(c.daThu, 1000000, 'daThu'); eq(c.trangThai, 'da_thu_du', 'thu đủ thì đóng'); eq(c.tatToan, undefined, 'không có xóa nợ');
  var e = ctx.state.data.journal['2026-12-09'];
  eq(e.refs.length, 1, 'có 1 ref'); eq(e.refs[0].loai, 'thuHoiChoVay'); eq(ctx.num(e.thu.thuHoiChoVay), 1000000, 'thu hồi vào Sổ tay');
  eq(ctx.soDuTheoVi('w2', '2026-12-10'), 1000000, 'tiền vào đúng ví đã chọn'); eq(ctx.soDuTheoVi('w1', '2026-12-10'), 0, 'ví khác không đổi');
  eq(ctx.journalKiemTra().length, 0, 'sổ cái khớp');
  ok(ctx.dlRefHtml(e.refs[0]).indexOf('Thu hồi cho vay') >= 0, 'vẫn hiện ở chi tiết theo ngày');
  ctx.loanRevertRef(e.refs[0]);
  eq(c.daThu, 0, 'xóa ngày thu thì daThu lùi lại'); eq(c.trangThai, 'dang_cho', 'khoản mở lại');
});

test('cho vay TẤT TOÁN: thu thiếu -> giữ mở (thu một phần) hoặc đóng với phần thiếu = xóa nợ', function(){
  setToday('2026-12-10');
  var mk = function(){
    var d = baseData();
    d.vayNo.choVay = [{ id:'cv1', ten:'Bạn A', soTien:1000000, daThu:100000, trangThai:'dang_cho', ngayChoVay:'2026-10-01' }];
    loadData(d); return ctx.state.data.vayNo.choVay[0];
  };
  var c = mk();
  eq(ctx.choVayGhiThu(c, 500000, '2026-12-09', '', false), 400000, 'thiếu 400k');
  eq(c.trangThai, 'dang_cho', 'thu một phần: khoản vẫn mở'); eq(ctx.conLaiPhaiThu(c), 400000, 'còn 400k'); eq(c.tatToan, undefined);
  c = mk();
  eq(ctx.choVayGhiThu(c, 500000, '2026-12-09', '', true), 400000, 'thiếu 400k');
  eq(c.trangThai, 'da_thu_du', 'tất toán: đóng'); eq(c.tatToan.soTien, 400000, 'phần thiếu = xóa nợ'); eq(ctx.conLaiPhaiThu(c), 0);
  eq(ctx.num(ctx.state.data.journal['2026-12-09'].thu.thuHoiChoVay), 500000, 'chỉ ghi số thực thu vào Sổ tay');
  eq(ctx.phaiThuTaiNgay(c, '2026-12-10'), 0, 'tài sản ròng: không còn phải thu sau tất toán');
  eq(ctx.journalKiemTra().length, 0);
});

test('Cho vay: khoản đã xong (thu đủ / đã xóa nợ) vào mục "Đã xong", không hiện ở danh sách chính; bấm mới mở', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [
    { id:'cv1', ten:'Đang chờ', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01' },
    { id:'cv2', ten:'Thu đủ', soTien:500000, daThu:500000, trangThai:'da_thu_du', ngayChoVay:'2026-10-01' },
    { id:'cv3', ten:'Đã xóa nợ', soTien:300000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', tatToan:{ soTien:300000, ngay:'2026-12-01' } }
  ];
  loadData(d);
  eq(ctx.choVayDaXong(ctx.state.data.vayNo.choVay[0]), false, 'đang chờ thu: chưa xong');
  eq(ctx.choVayDaXong(ctx.state.data.vayNo.choVay[1]), true, 'thu đủ: xong');
  eq(ctx.choVayDaXong(ctx.state.data.vayNo.choVay[2]), true, 'đã xóa nợ: xong');
  ctx.state.vnXongCV = false;
  var h = ctx.vnChoVayHtml();
  ok(h.indexOf('id="vn-cv-cv1"') >= 0, 'khoản đang chờ vẫn hiện');
  ok(h.indexOf('id="vn-cv-cv2"') < 0 && h.indexOf('id="vn-cv-cv3"') < 0, 'khoản đã xong bị gấp lại');
  ok(h.indexOf('Đã xong (2)') >= 0, 'có nút Đã xong (2)');
  ctx.state.vnXongCV = true;
  h = ctx.vnChoVayHtml();
  ok(h.indexOf('id="vn-cv-cv2"') >= 0 && h.indexOf('id="vn-cv-cv3"') >= 0, 'bấm mở thì hiện đủ');
  ctx.state.vnXongCV = false;
  ctx.state.data.vayNo.choVay = [d.vayNo.choVay[1]];
  h = ctx.vnChoVayHtml();
  ok(h.indexOf('Không còn khoản nào đang chờ thu') >= 0 && h.indexOf('Đã xong (1)') >= 0, 'toàn khoản đã xong: có dòng báo và vẫn có mục Đã xong');
});

test('fmt: làm tròn đồng, không hiện phần lẻ (tổng cộng từ lãi chia lẻ)', function(){
  eq(ctx.fmt(3323544.303), ctx.fmt(3323544), 'bỏ phần lẻ');
  eq(ctx.fmt(13676455.697), ctx.fmt(13676456), 'làm tròn lên');
  ok(ctx.fmt(1234.4).indexOf(',') < 0, 'không còn dấu thập phân: ' + ctx.fmt(1234.4));
  eq(ctx.fmt(null), ctx.fmt(0), 'null -> 0');
});

/* ==================================================================== */
group('Q. Ghi nhanh (thẻ đầu Sổ tay)');

function dataGhiNhanh(){
  var d = baseData({ settings:{ soDuDauKy:1000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }, { id:'xang', ten:'Xăng', chiTieu:0 }, { id:'tieu', ten:'Tiêu', chiTieu:0 },
                      { id:'traNo', ten:'Trả nợ', chiTieu:0 }, { id:'choVay', ten:'Cho vay', chiTieu:0 }];
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'thuHoiChoVay', ten:'Thu hồi', chiTieu:0 }, { id:'nhanTienVay', ten:'Nhận vay', chiTieu:0 }];
  return d;
}

test('qaCats: loại các danh mục của Vay-Nợ (cần gắn khoản vay)', function(){
  loadData(dataGhiNhanh());
  eq(ctx.qaCats('chi').map(function(c){ return c.id; }).join(','), 'an,xang,tieu');
  eq(ctx.qaCats('thu').map(function(c){ return c.id; }).join(','), 'luong');
});

test('qaTopCats: xếp theo số lần dùng trong 90 ngày, bù theo thứ tự danh mục, bỏ giao dịch cũ hơn 90 ngày', function(){
  setToday('2026-10-10');
  var d = dataGhiNhanh();
  var it = function(date, cat){ return { iid:'i'+Math.random(), kind:'chi', catId:cat, soTien:1000, ghiChu:'', walletId:'w_chinh' }; };
  d.journal['2026-10-01'] = { thu:{}, chi:{ tieu:2000, xang:1000 }, ghiChu:'', refs:[], items:[ it('', 'tieu'), it('', 'tieu'), it('', 'xang') ] };
  d.journal['2026-02-01'] = { thu:{}, chi:{ an:9000 }, ghiChu:'', refs:[], items:[ it('', 'an'), it('', 'an'), it('', 'an') ] };   // quá cũ
  loadData(d);
  eq(ctx.qaTopCats('chi', 5).map(function(c){ return c.id; }).join(','), 'tieu,xang,an', 'tieu(2) > xang(1) > an(0, bù)');
  eq(ctx.qaTopCats('chi', 1).length, 1);
  eq(ctx.qaCatChon('chi'), 'tieu', 'chưa chọn gì -> cái dùng nhiều nhất');
  ctx.state.qa.cat = { chi: 'an' };
  eq(ctx.qaCatChon('chi'), 'an', 'đã chọn lần trước');
  ctx.state.qa.cat = { chi: 'khong-co' };
  eq(ctx.qaCatChon('chi'), 'tieu', 'lần chọn cũ không còn -> quay về cái dùng nhiều nhất');
  ctx.state.qa.cat = {};
  setToday('2026-10-01');
});

test('qaSave: ghi 1 khoản chi qua entryAddItem — tổng, số dư, dòng chi tiết, ghi chú ngày khớp nhau', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'' };
  thongBao.length = 0;
  voiDom({ qa_amount:{ value:'45.000' }, qa_note:{ value:'Ăn sáng' }, qa_date:{ value:'2026-10-10' } }, null, function(){
    ctx.handleSoTayAction('qaSave', { _daBaoAm: true });
  });
  var e = ctx.state.data.journal['2026-10-10'];
  eq(ctx.num(e.chi.an), 45000, 'tiền vào danh mục');
  eq(ctx.itemsSum(e, 'chi', 'an'), 45000, 'có dòng chi tiết khớp tổng');
  eq(e.ghiChu, 'Ăn sáng ' + ctx.fmt(45000), 'ghi chú ngày kèm số tiền');
  eq(ctx.balanceAt('2026-10-10'), 1000000 - 45000, 'số dư');
  eq(ctx.state.qa.amt, '', 'xóa số đã gõ sau khi ghi');
  ok(thongBao.some(function(m){ return m.indexOf('Đã ghi chi') === 0; }), 'có thông báo: ' + thongBao.join('|'));
});

test('cảnh báo ví sắp âm: chi quá số dư thì hỏi trước; Đồng ý mới ghi; ví đã âm không nhắc lại; đủ tiền không hỏi', async function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());          // số dư 1.000.000
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'' };
  var x0 = ctx.xacNhan, hoi = 0, traLoi = false, noiDung = '';
  ctx.xacNhan = function(t, nd){ hoi++; noiDung = nd; return Promise.resolve(traLoi); };
  try{
    var dom = { qa_amount:{ value:'1.500.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' } };
    var kq;
    voiDom(dom, null, function(){ kq = ctx.handleSoTayAction('qaSave', {}); });
    await Promise.resolve();
    eq(kq, true, 'đã xử lý (chặn lại để hỏi)');
    eq(hoi, 1, 'có hỏi khi ví sẽ âm');
    ok(noiDung.indexOf('sẽ âm') >= 0, 'câu hỏi nêu số âm: ' + noiDung);
    eq(!!ctx.state.data.journal['2026-10-10'], false, 'chưa Đồng ý thì chưa ghi');
    traLoi = true;
    var el = {};
    voiDom(dom, null, function(){ ctx.handleSoTayAction('qaSave', el); });
    await Promise.resolve(); await Promise.resolve();
    eq(ctx.num(ctx.state.data.journal['2026-10-10'].chi.an), 1500000, 'Đồng ý thì ghi');
    // ví đã âm từ trước: ghi tiếp không hỏi lại
    hoi = 0;
    voiDom({ qa_amount:{ value:'1.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
    eq(hoi, 0, 'ví đã âm thì không nhắc lại');
    // đủ tiền: không hỏi
    loadData(dataGhiNhanh()); hoi = 0;
    voiDom({ qa_amount:{ value:'45.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
    eq(hoi, 0, 'đủ tiền thì không hỏi');
    eq(ctx.viCanhBaoAm('', 100) , '', 'khoản thu không bao giờ cảnh báo');
  } finally { ctx.xacNhan = x0; }
});

test('Ví để dành: lấy tiền ra là hỏi dù còn đủ tiền; ví đang gắn mục tiêu thì không xóa được; dữ liệu cũ mặc định không phải ví để dành', function(){
  var d = dataGhiNhanh();
  d.wallets = [{ id:'w1', ten:'Chính', soDuDauKy: 1000000 }, { id:'w2', ten:'Quỹ mua xe', soDuDauKy: 5000000 }];
  d.mucTieu = [{ id:'mt1', ten:'Mua xe', soTien: 30000000, hanChot:'', walletId:'w2', daGom: 0 }];
  loadData(d);
  eq(ctx.walletById('w2').deDanh, false, 'mặc định không phải ví để dành');
  eq(ctx.viCanhBaoAm('w2', -100000), '', 'chưa đánh dấu: chi nhỏ, còn đủ tiền -> không hỏi');
  ctx.walletById('w2').deDanh = true;
  var msg = ctx.viCanhBaoAm('w2', -100000);
  ok(msg.indexOf('ví để dành') >= 0 && msg.indexOf('Mua xe') >= 0, 'hỏi, có nêu mục tiêu: ' + msg);
  eq(ctx.viCanhBaoAm('w2', 100000), '', 'bỏ tiền VÀO ví để dành không hỏi');
  eq(ctx.viCanhBaoAm('w1', -100000), '', 'ví thường không hỏi');
  ok(ctx.viDangDung('w2') > 0, 'ví đang gắn mục tiêu được tính là đang dùng (không xóa được)');
});

test('qaSave: không có số tiền thì không ghi; ghi thu vào danh mục thu; ngày trước mốc khóa sổ có cảnh báo', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{}, amt:'', note:'', date:'', wallet:'' };
  voiDom({ qa_amount:{ value:'' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  eq(Object.keys(ctx.state.data.journal).length, 0, 'số tiền rỗng -> không tạo ngày nào');
  ctx.state.qa = { kind:'thu', cat:{}, amt:'', note:'', date:'', wallet:'' };
  voiDom({ qa_amount:{ value:'2.000.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  eq(ctx.num(ctx.state.data.journal['2026-10-10'].thu.luong), 2000000, 'vào danh mục thu đầu tiên dùng được');
  thongBao.length = 0;
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'' };
  voiDom({ qa_amount:{ value:'10.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-09-01' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  ok(thongBao.some(function(m){ return m.indexOf('trước mốc chốt số dư') >= 0; }), 'cảnh báo mốc: ' + thongBao.join('|'));
  eq(ctx.state.qa.date, '2026-09-01', 'giữ ngày đã chọn để ghi tiếp cùng ngày');
});

test('ghiNhanhHtml: có chip danh mục + nút ghi theo loại; không lộ danh mục Vay-Nợ', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{}, amt:'12.000', note:'cf', date:'', wallet:'' };
  var h = ctx.ghiNhanhHtml();
  ok(h.indexOf('data-act="qaSave"') >= 0 && h.indexOf('Ghi khoản chi') >= 0, 'nút ghi chi');
  ok(h.indexOf('data-cat="an"') >= 0, 'chip Ăn');
  ok(h.indexOf('traNo') < 0 && h.indexOf('choVay') < 0, 'không lộ danh mục Vay-Nợ');
  ok(h.indexOf('value="12.000"') >= 0 && h.indexOf('value="cf"') >= 0, 'giữ bản nháp đang gõ khi vẽ lại');
  ctx.state.qa = { kind:'chi', cat:{}, amt:'', note:'', date:'', wallet:'' };
});

/* ==================================================================== */
group('T. Thẻ tổng quan (đầu Sổ tay)');

test('tongQuanHtml: số dư, thu/chi, còn lại theo chỉ tiêu, chip việc cần làm', function(){
  setToday('2026-10-10');
  var d = baseData({ settings:{ soDuDauKy:3000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:1000000 }, { id:'xang', ten:'Xăng', chiTieu:200000 }];
  d.journal['2026-10-02'] = { thu:{}, chi:{ an:400000, xang:300000 }, ghiChu:'', refs:[], items:[] };
  d.dinhKy = [{ id:'dk1', ten:'Tiền net', kind:'chi', catId:'an', soTien:200000, ngay:5, bat:true, bo:[] }];
  d.vayNo.choVay = [{ id:'c1', ten:'A', soTien:500000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-12' }];
  loadData(d);
  var h = ctx.tongQuanHtml('2026-10', 0, 700000, 3000000, 2300000, false);
  ok(h.indexOf('Số dư hiện tại') >= 0, 'tháng này gọi là "hiện tại"');
  ok(h.indexOf(ctx.fmt(2300000)) >= 0, 'số dư');
  ok(h.indexOf('còn ' + ctx.fmt(500000)) >= 0, 'đã chi 700k / chỉ tiêu 1,2tr -> còn 500k: ' + h);
  ok(h.indexOf('1 khoản định kỳ đến hạn') >= 0, 'chip định kỳ');
  ok(h.indexOf('1 khoản vay/nợ sắp đến hạn') >= 0, 'chip vay nợ');
  ok(h.indexOf('1 danh mục vượt hạn mức') >= 0, 'Xăng 300k > 200k');
  var h2 = ctx.tongQuanHtml('2026-09', 0, 0, 0, 0, true);
  ok(h2.indexOf('Số dư cuối tháng') >= 0 && h2.indexOf('>—<') >= 0, 'tháng khác/trước mốc: nhãn "cuối tháng", số dư "—"');
  setToday('2026-10-01');
});

test('tongQuanHtml: không có việc gì thì báo gọn, không có chip', function(){
  setToday('2026-10-10');
  loadData(baseData({ settings:{ soDuDauKy:1000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } }));
  var h = ctx.tongQuanHtml('2026-10', 0, 0, 1000000, 1000000, false);
  ok(h.indexOf('hero-chip') < 0 && h.indexOf('Không có khoản nào cần xử lý') >= 0, 'không chip');
  ok(h.indexOf('hero-bud') < 0, 'không có chỉ tiêu thì không hiện thanh');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('U. Điện thoại: Dòng tiền xem từng tháng, bảng Vay-Nợ dạng thẻ, Đăng xuất ở Danh mục');

test('Dòng tiền trên điện thoại: chỉ 1 cột tháng + hàng nút chọn tháng; bấm nút đổi tháng; máy tính vẫn đủ cột', function(){
  setToday('2026-10-10');
  var d = baseData({ settings:{ soDuDauKy:3000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:1000000, coDinhChiTieu:true }];
  loadData(d);
  ctx.state.dongTienYear = 2026; ctx.state.dtThang = null; ctx.state.dtBangNam = true;
  var mm0 = ctx.window.matchMedia;
  var root = { innerHTML:'' };
  try{
    ctx.window.matchMedia = function(){ return { matches:true }; };
    voiDom({ tabContent: root }, null, function(){ ctx.renderDongTien(); });
    var bang = root.innerHTML.split('<table>')[1].split('</table>')[0];
    eq((bang.match(/class="dt-input th-month"/g) || []).length, 1, 'bảng chính chỉ 1 cột tháng');
    ok(root.innerHTML.indexOf('data-act="dtThang"') >= 0 && root.innerHTML.indexOf('>T12*<') >= 0, 'có nút chọn tháng');
    ok(bang.indexOf('Tháng 10') >= 0, 'mặc định là tháng hiện tại');
    voiDom({ tabContent: root }, null, function(){ ctx.handleDongTienAction('dtThang', elAct({ 'data-mk':'2026-12' })); });
    var bang2 = root.innerHTML.split('<table>')[1].split('</table>')[0];
    ok(bang2.indexOf('Tháng 12') >= 0 && bang2.indexOf('Tháng 10') < 0, 'đã chuyển sang tháng 12');
    ctx.window.matchMedia = function(){ return { matches:false }; };
    voiDom({ tabContent: root }, null, function(){ ctx.renderDongTien(); });
    var bang3 = root.innerHTML.split('<table>')[1].split('</table>')[0];
    eq((bang3.match(/class="dt-input th-month"/g) || []).length, 3, 'máy tính: đủ 3 tháng T10-T12');
  } finally { ctx.window.matchMedia = mm0; ctx.state.dtThang = null; ctx.state.dtBangNam = false; setToday('2026-10-01'); }
});

test('Vay-Nợ dạng thẻ: mỗi khoản là 1 thẻ có id, lịch trả là danh sách kỳ (không còn bảng)', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ id:'v1', ten:'Xe', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:10 })];
  d.vayNo.choVay = [{ id:'c1', ten:'A', soTien:500000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-12' }];
  loadData(d);
  ctx.state.vnDetailId = 'v1';
  var root = { innerHTML:'' };
  var rv0 = ctx.renderVayNo;
  ctx.renderVayNo = renderThat.renderVayNo;
  try{ voiDom({ tabContent: root }, null, function(){ ctx.renderVayNo(); }); } finally { ctx.renderVayNo = rv0; }
  var h = root.innerHTML;
  eq((h.match(/<table/g) || []).length, 0, 'không còn bảng nào');
  ok(h.indexOf('id="vn-vn-v1"') >= 0 && h.indexOf('id="vn-cv-c1"') >= 0, 'thẻ khoản vay + cho vay có id');
  ok(h.indexOf('Dư nợ còn lại') >= 0 && h.indexOf('Dự kiến hết nợ') >= 0, 'nhãn thẻ khoản vay');
  eq((h.match(/class="vn-ky /g) || []).length, 6, 'lịch 6 kỳ mở sẵn (khoản vay ngắn, hiện đủ)');
  ok(h.indexOf('data-act="vnGhiNhanTra"') >= 0, 'kỳ tiếp theo có nút Ghi nhận đã trả');
  ok(h.indexOf('Gốc / lãi') >= 0, 'mỗi kỳ có gốc / lãi');
  ctx.state.vnDetailId = null;
  setToday('2026-10-01');
});

test('Vay-Nợ: thẻ tổng quan cộng đúng nợ / cho vay / tháng này; Sắp đến hạn hiện phần CÒN THIẾU của kỳ trả dở', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  var v = loanKhongLai({ id:'v1', ten:'Xe', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:12 });
  v.traNo = [{ rid:'r0', ky:0, mk:'2026-10', soTien:600000, ngay:'2026-10-05', dongKy:false }];
  d.vayNo.vayNoPhaiTra = [v];
  d.vayNo.choVay = [{ id:'c1', ten:'Hùng', soTien:500000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-12' }];
  loadData(d);
  var ds = ctx.danhSachSapDenHan(7).filter(function(x){ return x.loai === 'vayNo'; });
  near(ds[0].soTien, 400000, 0.01, 'kỳ trả dở: chỉ còn 400.000');
  var root = { innerHTML:'' };
  var rv0 = ctx.renderVayNo; ctx.renderVayNo = renderThat.renderVayNo;
  try{ voiDom({ tabContent: root }, null, function(){ ctx.renderVayNo(); }); } finally { ctx.renderVayNo = rv0; }
  var h = root.innerHTML;
  ok(h.indexOf('5.400.000') >= 0, 'còn nợ = 6.000.000 − 600.000');
  ok(h.indexOf('Nợ ròng') >= 0 && h.indexOf('4.900.000') >= 0, 'nợ ròng = nợ − cho vay chờ thu (500.000)');
  ok(h.indexOf('<b>60%</b>') >= 0, 'tháng này đã trả 600.000 / 1.000.000');
  ok(h.indexOf('kỳ 1') >= 0 || h.indexOf('Kỳ 1 còn thiếu') >= 0, 'thẻ ghi rõ kỳ đang trả dở còn thiếu');
  setToday('2026-10-01');
});

test('Đăng xuất không còn ở thanh đầu trang mà ở tab Danh mục', function(){
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(idx.indexOf('btnSignOut') < 0, 'index.html không còn nút Đăng xuất');
  loadData(baseData());
  ok(ctx.taiKhoanCardHtml().indexOf('data-act="dangXuat"') >= 0, 'thẻ Tài khoản có nút');
});

test('Thẻ Tài khoản: hiện tên + email Google nếu đã lưu, escape HTML; chưa có thì không hiện dòng đó', function(){
  loadData(baseData());
  ok(ctx.taiKhoanCardHtml().indexOf('Đang đăng nhập') < 0, 'chưa có thông tin thì không hiện');
  var cu = ctx.localStorage;
  ctx.localStorage = { getItem: function(k){ return k === ctx.TAI_KHOAN_KEY ? JSON.stringify({ ten:'Đạt <b>', email:'a@gmail.com' }) : null; }, setItem: function(){}, removeItem: function(){} };
  try{
    var h = ctx.taiKhoanCardHtml();
    ok(h.indexOf('Đạt &lt;b&gt;') >= 0 && h.indexOf('a@gmail.com') >= 0, 'có tên (đã escape) và email');
  }finally{ ctx.localStorage = cu; }
});

/* ==================================================================== */
group('V2. Sau khi thử trên iPhone: xác nhận trong thẻ, chạm khoản nhảy tới khoản, Dòng tiền không cuộn lồng');

test('Ghi nhanh: ghi xong đóng bảng, Hoàn tác (ở toast) chạy 1 lần duy nhất, số dư về như cũ', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null, open:true };
  var truoc = ctx.balanceAt('9999-12-31');
  voiDom({ qa_amount:{ value:'45.000' }, qa_note:{ value:'Ăn sáng' }, qa_date:{ value:'2026-10-10' } }, null, function(){
    ctx.handleSoTayAction('qaSave', { _daBaoAm: true });
  });
  ok(ctx.state.qa.last && ctx.state.qa.last.text.indexOf('Đã ghi chi') === 0, 'có bản ghi cuối');
  eq(ctx.state.qa.open, false, 'ghi xong thì đóng bảng');
  eq(ctx.balanceAt('9999-12-31'), truoc - 45000, 'đã ghi');
  var ban = ctx.state.qa.last.ban;
  ctx.qaHoanTacLanGhi(ban);
  ctx.invalidateBalanceCache();
  eq(ctx.balanceAt('9999-12-31'), truoc, 'hoàn tác: số dư về cũ');
  eq(ctx.state.data.journal['2026-10-10'], undefined, 'ngày rỗng bị xóa');
  eq(ctx.state.qa.last, null, 'bản ghi cuối được xóa');
  ctx.qaHoanTacLanGhi(ban);   // bấm thêm lần nữa (nút ở toast) không được làm gì
  eq(ctx.balanceAt('9999-12-31'), truoc, 'hoàn tác lần 2 không đổi gì');
});

test('Chi tiết theo ngày: khoản ghi sau nằm trên khoản ghi trước; bảng ghi khoản có ô ghi chú ngay dưới số tiền', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.entryAddItem('2026-10-10', 'chi', 'an', 30000, 'Ăn sáng', undefined);
  ctx.entryAddItem('2026-10-10', 'chi', 'an', 40000, 'Ăn tối', undefined);
  var h = ctx.dlNgayHtml('2026-10-10', false);
  ok(h.indexOf('Ăn tối') > 0 && h.indexOf('Ăn tối') < h.indexOf('Ăn sáng'), 'khoản mới nhất ở trên');
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  var g = ctx.ghiNhanhHtml();
  var iTien = g.indexOf('id="qa_amount"'), iGhiChu = g.indexOf('id="qa_note"'), iDm = g.indexOf('data-cat="an"');
  ok(iTien > 0 && iGhiChu > iTien && iDm > iGhiChu, 'thứ tự: số tiền, ghi chú, danh mục');
});

test('Chi tiết theo ngày: ghi chú chung của cả ngày (dữ liệu cũ) không lặp ở từng khoản — tiêu đề là tên danh mục', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  var e = { thu:{}, chi:{ an:70000 }, refs:[], ghiChu:'Ăn sáng 30.000 đ; Ăn tối 40.000 đ',
    items:[ { iid:'i1', kind:'chi', catId:'an', soTien:30000, ghiChu:'Ăn sáng 30.000 đ; Ăn tối 40.000 đ' },
            { iid:'i2', kind:'chi', catId:'an', soTien:40000, ghiChu:'Ăn sáng 30.000 đ; Ăn tối 40.000 đ' } ] };
  ctx.state.data.journal['2026-10-09'] = e;
  var h = ctx.dlNgayHtml('2026-10-09', false);
  ok(h.indexOf('class="dl-t1">Ăn sáng') < 0 && h.indexOf('class="dl-t1">Ăn<') >= 0, 'tiêu đề lấy tên danh mục, không lặp ghi chú chung');
  ctx.entryAddItem('2026-10-10', 'chi', 'an', 20000, 'Cà phê', undefined);
  ok(ctx.dlNgayHtml('2026-10-10', false).indexOf('class="dl-t1">Cà phê') >= 0, 'ghi chú riêng của khoản vẫn là tiêu đề');
});

test('Thẻ tổng quan: dòng so sánh chi với tháng trước (đúng chiều, đúng nhãn); không có dữ liệu tháng trước thì không hiện', function(){
  setToday('2026-10-10');
  var d = dataGhiNhanh();
  loadData(d);
  eq(ctx.tongQuanSoSanhHtml('2026-10', 100000, false), '', 'chưa có tháng trước: không hiện');
  ctx.entryAddItem('2026-09-03', 'chi', 'an', 100000, '', undefined);
  var nhieu = ctx.tongQuanSoSanhHtml('2026-10', 150000, false);
  ok(nhieu.indexOf('Chi nhiều hơn 50%') >= 0 && nhieu.indexOf('cùng kỳ 1–10/9') >= 0 && nhieu.indexOf('hero-tin len') >= 0, 'chi nhiều hơn, so cùng kỳ');
  var it = ctx.tongQuanSoSanhHtml('2026-10', 50000, false);
  ok(it.indexOf('Chi ít hơn 50%') >= 0 && it.indexOf('hero-tin xuong') >= 0, 'chi ít hơn');
  ok(ctx.tongQuanSoSanhHtml('2026-10', 101000, false).indexOf('Chi gần bằng') >= 0, 'lệch dưới 3% là gần bằng');
  eq(ctx.tongQuanSoSanhHtml('2026-10', 150000, true), '', 'tháng trước mốc chốt số dư: không hiện');
});

test('Lớp chồng: bảng ghi khoản nằm DƯỚI hộp thoại (cảnh báo ví âm hiện trên bảng) và TRÊN thanh tab', function(){
  var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  var z = function(re){ var m = re.exec(css); return m ? parseInt(m[1], 10) : -1; };
  var bang = z(/\.qa-back\{[^}]*z-index:(\d+)/), modal = z(/\.modal-back\{[^}]*z-index:(\d+)/), tab = z(/padding-bottom:env\(safe-area-inset-bottom\);z-index:(\d+)/);
  ok(bang > 0 && modal > 0 && tab > 0, 'đọc được z-index: ' + [bang, modal, tab].join('/'));
  ok(bang < modal, 'bảng ghi (' + bang + ') phải thấp hơn hộp thoại (' + modal + ')');
  ok(bang > tab, 'bảng ghi (' + bang + ') phải cao hơn thanh tab (' + tab + ')');
});

test('Vay-Nợ: thẻ Sắp đến hạn — chạm vào khoản nhảy tới đúng khoản (cho vay / vay nợ) bên dưới', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ id:'v1', ten:'Xe', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:12 })];
  d.vayNo.choVay = [{ id:'c1', ten:'Hùng', soTien:500000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-12' }];
  loadData(d);
  var ds = ctx.danhSachSapDenHan(7);
  eq(ds.map(function(x){ return x.loai + ':' + x.id; }).sort().join(','), 'choVay:c1,vayNo:v1', 'mỗi khoản có id');
  var root = { innerHTML:'' };
  var rv0 = ctx.renderVayNo; ctx.renderVayNo = renderThat.renderVayNo;
  try{ voiDom({ tabContent: root }, null, function(){ ctx.renderVayNo(); }); } finally { ctx.renderVayNo = rv0; }
  var h = root.innerHTML;
  ok(h.indexOf('data-act="vnCuonTo" data-loai="choVay" data-id="c1"') >= 0, 'dòng cho vay chạm được');
  ok(h.indexOf('data-act="vnCuonTo" data-loai="vayNo" data-id="v1"') >= 0, 'dòng vay nợ chạm được');
  ok(h.indexOf('id="vn-cv-c1"') >= 0 && h.indexOf('id="vn-vn-v1"') >= 0, 'dòng đích có id');
  // bấm: phải cuộn tới đúng phần tử đích và bật hiệu ứng
  var got = {};
  var mkEl = function(name){ var cls = {}; return { scrollIntoView:function(o){ got[name] = o; }, offsetWidth:0, classList:{ add:function(c){ cls[c]=1; got[name+'+']=c; }, remove:function(c){ delete cls[c]; } } }; };
  var phanTu = { 'vn-cv-c1': mkEl('cv'), 'vn-vn-v1': mkEl('vn') };
  voiDom(phanTu, null, function(){
    ctx.handleVayNoAction('vnCuonTo', elAct({ 'data-loai':'choVay', 'data-id':'c1' }));
    ctx.handleVayNoAction('vnCuonTo', elAct({ 'data-loai':'vayNo', 'data-id':'v1' }));
  });
  ok(got.cv && got.cv.block === 'center', 'cuộn tới khoản cho vay');
  ok(got.vn && got.vn.block === 'center', 'cuộn tới khoản vay');
  eq(got['cv+'], 'vn-flash', 'có hiệu ứng nhấp nháy');
  setToday('2026-10-01');
});

test('Dòng tiền: bảng chính không còn khung cuộn dọc riêng (chỉ cuộn ngang khi nhiều cột)', function(){
  var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  var rule = /\.table-wrap-year\{[^}]*\}/.exec(css);
  ok(rule, 'còn class table-wrap-year');
  ok(rule[0].indexOf('max-height') < 0, 'không giới hạn chiều cao: ' + rule[0]);
  ok(!/overflow:auto/.test(rule[0]) && /overflow-x:auto/.test(rule[0]), 'chỉ overflow-x');
});

/* ==================================================================== */
group('X. Xóa 1 dòng chi tiết thì ghi chú của ngày cũng đi theo');

test('journalRemoveNote chỉ bỏ MỘT mẩu: 2 khoản giống hệt nhau, xóa 1 vẫn còn 1', function(){
  var e = { ghiChu: 'cf 30.000 ₫; ăn trưa 50.000 ₫; cf 30.000 ₫' };
  ctx.journalRemoveNote(e, 'cf 30.000 ₫');
  eq(e.ghiChu, 'ăn trưa 50.000 ₫; cf 30.000 ₫');
  ctx.journalRemoveNote(e, 'không có');
  eq(e.ghiChu, 'ăn trưa 50.000 ₫; cf 30.000 ₫', 'mẩu không tồn tại -> không đổi');
});

test('Xóa dòng ghi nhanh: tiền trừ VÀ chữ trong Nội dung cũng mất; ghi chú của khoản khác giữ nguyên', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  var ghi = function(tien, note){
    voiDom({ qa_amount:{ value:tien }, qa_note:{ value:note }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  };
  ghi('45.000', 'Ăn sáng');
  ghi('30.000', 'Cà phê');
  var e = ctx.state.data.journal['2026-10-10'];
  eq(e.ghiChu, 'Ăn sáng ' + ctx.fmt(45000) + '; Cà phê ' + ctx.fmt(30000), 'trước khi xóa');
  var iidSai = e.items.filter(function(it){ return it.ghiChu === 'Ăn sáng'; })[0].iid;
  ok(ctx.entryDeleteItem('2026-10-10', iidSai), 'xóa được');
  e = ctx.state.data.journal['2026-10-10'];
  eq(e.ghiChu, 'Cà phê ' + ctx.fmt(30000), 'chữ của khoản sai đã mất, khoản kia còn');
  eq(ctx.num(e.chi.an), 30000, 'tiền trừ đúng');
  var iidCon = e.items[0].iid;
  ctx.entryDeleteItem('2026-10-10', iidCon);
  eq(ctx.state.data.journal['2026-10-10'], undefined, 'xóa hết thì ngày rỗng bị xóa luôn');
});

test('Xóa dòng: hai khoản giống hệt nhau (cùng nội dung + số tiền) thì xóa 1, chữ còn đúng 1 mẩu', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  for (var i = 0; i < 2; i++){
    voiDom({ qa_amount:{ value:'30.000' }, qa_note:{ value:'Cà phê' }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  }
  var e = ctx.state.data.journal['2026-10-10'];
  eq(e.items.length, 2);
  ctx.entryDeleteItem('2026-10-10', e.items[0].iid);
  e = ctx.state.data.journal['2026-10-10'];
  eq(e.ghiChu, 'Cà phê ' + ctx.fmt(30000), 'còn đúng 1 mẩu');
  eq(ctx.num(e.chi.an), 30000);
});

test('Xóa dòng: dòng cũ chưa có gc vẫn gỡ được chữ theo dạng "<nội dung> <số tiền>"; không đoán bừa khi không khớp', function(){
  setToday('2026-10-10');
  var d = baseData({ settings:{ soDuDauKy:0, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.journal['2026-10-05'] = { thu:{}, chi:{ an:80000 }, ghiChu:'Ăn trưa ' + ctx.fmt(50000) + '; ghi chú tự gõ', refs:[],
    items:[ { iid:'a', kind:'chi', catId:'an', soTien:50000, ghiChu:'Ăn trưa' }, { iid:'b', kind:'chi', catId:'an', soTien:30000, ghiChu:'Nước' } ] };
  loadData(d);
  ctx.entryDeleteItem('2026-10-05', 'a');
  eq(ctx.state.data.journal['2026-10-05'].ghiChu, 'ghi chú tự gõ', 'gỡ đúng mẩu "Ăn trưa …", giữ chữ tự gõ');
  ctx.entryDeleteItem('2026-10-05', 'b');   // "Nước 30.000 ₫" không có trong ghi chú -> không đụng gì
  eq(ctx.state.data.journal['2026-10-05'].ghiChu, 'ghi chú tự gõ', 'chữ tự gõ vẫn còn');
});

test('Xóa dòng của form đầy đủ nhiều danh mục: mẩu ghi chú dùng chung chỉ mất khi xóa dòng cuối', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.editingDate = null; ctx.state.fullFormOpen = true;
  voiDom({ f_date:{ value:'2026-10-10' }, f_ghichu:{ value:'Đi chợ' }, sotay_selChoVay:null, sotay_selVayNo:null },
         { '.f_chi':[ oNhap('an', '100000'), oNhap('xang', '50000') ] }, function(){ ctx.handleSoTayAction('saveEntry', { _daBaoAm: true }); });
  var e = ctx.state.data.journal['2026-10-10'];
  eq(e.ghiChu, 'Đi chợ ' + ctx.fmt(150000), 'ghi chú ngày gắn tổng 2 khoản');
  eq(e.items.length, 2);
  ctx.entryDeleteItem('2026-10-10', e.items[0].iid);
  eq(ctx.state.data.journal['2026-10-10'].ghiChu, 'Đi chợ ' + ctx.fmt(150000), 'còn 1 dòng dùng chung mẩu này -> giữ');
  ctx.entryDeleteItem('2026-10-10', ctx.state.data.journal['2026-10-10'].items[0].iid);
  eq(ctx.state.data.journal['2026-10-10'], undefined, 'xóa dòng cuối -> hết chữ, ngày rỗng bị xóa');
  ctx.state.fullFormOpen = false;
});

test('Sửa dòng: đổi số tiền / nội dung thì chữ ở Nội dung đổi theo, đúng chỗ, không đụng khoản khác', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  var ghi = function(tien, note){
    voiDom({ qa_amount:{ value:tien }, qa_note:{ value:note }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  };
  ghi('45.000', 'Ăn sáng'); ghi('30.000', 'Cà phê'); ghi('20.000', 'Nước');
  var e = ctx.state.data.journal['2026-10-10'];
  var iid = e.items.filter(function(it){ return it.ghiChu === 'Ăn sáng'; })[0].iid;
  ok(ctx.entryUpdateItem('2026-10-10', iid, 50000, 'Ăn sáng ngon', 'chi', 'an', ''), 'sửa được');
  eq(e.ghiChu, 'Ăn sáng ngon ' + ctx.fmt(50000) + '; Cà phê ' + ctx.fmt(30000) + '; Nước ' + ctx.fmt(20000), 'thay tại chỗ, giữ thứ tự, khoản khác nguyên');
  eq(ctx.num(e.chi.an), 100000, 'tiền: 50k + 30k + 20k');
  // chỉ đổi số tiền
  ctx.entryUpdateItem('2026-10-10', iid, 60000, 'Ăn sáng ngon', 'chi', 'an', '');
  ok(e.ghiChu.indexOf('Ăn sáng ngon ' + ctx.fmt(60000)) === 0 && e.ghiChu.indexOf(ctx.fmt(50000)) < 0, 'số cũ không còn: ' + e.ghiChu);
  // xóa nội dung -> bỏ mẩu chữ
  ctx.entryUpdateItem('2026-10-10', iid, 60000, '', 'chi', 'an', '');
  eq(e.ghiChu, 'Cà phê ' + ctx.fmt(30000) + '; Nước ' + ctx.fmt(20000), 'không còn nội dung -> mẩu chữ bị bỏ');
  // thêm nội dung cho dòng chưa có
  ctx.entryUpdateItem('2026-10-10', iid, 60000, 'Bữa tối', 'chi', 'an', '');
  eq(e.ghiChu, 'Cà phê ' + ctx.fmt(30000) + '; Nước ' + ctx.fmt(20000) + '; Bữa tối ' + ctx.fmt(60000), 'thêm vào cuối');
  // chỉ đổi danh mục: chữ không đổi
  var truoc = e.ghiChu;
  ctx.entryUpdateItem('2026-10-10', iid, 60000, 'Bữa tối', 'chi', 'xang', '');
  eq(e.ghiChu, truoc, 'đổi danh mục không làm đổi chữ');
  // xóa sau khi sửa vẫn gỡ đúng mẩu mới
  ctx.entryDeleteItem('2026-10-10', iid);
  eq(e.ghiChu, 'Cà phê ' + ctx.fmt(30000) + '; Nước ' + ctx.fmt(20000), 'xóa dòng đã sửa -> gỡ đúng mẩu mới');
});

test('Sửa dòng: chữ do người dùng tự sửa ở ngày thì không bị đụng; mẩu dùng chung thì dòng đã sửa có mẩu riêng', function(){
  setToday('2026-10-10');
  var d = baseData({ settings:{ soDuDauKy:0, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.journal['2026-10-05'] = { thu:{}, chi:{ an:50000 }, ghiChu:'tự gõ lại hết', refs:[],
    items:[ { iid:'a', kind:'chi', catId:'an', soTien:50000, ghiChu:'Ăn trưa' } ] };
  loadData(d);
  ctx.entryUpdateItem('2026-10-05', 'a', 70000, 'Ăn trưa', 'chi', 'an', '');
  eq(ctx.state.data.journal['2026-10-05'].ghiChu, 'tự gõ lại hết', 'không tìm thấy mẩu cũ -> không đụng chữ người dùng');
  // mẩu dùng chung (form đầy đủ 2 danh mục)
  loadData(dataGhiNhanh());
  ctx.state.fullFormOpen = true;
  voiDom({ f_date:{ value:'2026-10-10' }, f_ghichu:{ value:'Đi chợ' }, sotay_selChoVay:null, sotay_selVayNo:null },
         { '.f_chi':[ oNhap('an', '100000'), oNhap('xang', '50000') ] }, function(){ ctx.handleSoTayAction('saveEntry', { _daBaoAm: true }); });
  ctx.state.fullFormOpen = false;
  var e = ctx.state.data.journal['2026-10-10'];
  var a = e.items.filter(function(it){ return it.catId === 'an'; })[0];
  ctx.entryUpdateItem('2026-10-10', a.iid, 120000, 'Đi chợ', 'chi', 'an', '');
  eq(e.ghiChu, 'Đi chợ ' + ctx.fmt(150000) + '; Đi chợ ' + ctx.fmt(120000), 'mẩu chung giữ cho dòng xăng, dòng đã sửa có mẩu riêng');
  var xang = e.items.filter(function(it){ return it.catId === 'xang'; })[0];
  ctx.entryDeleteItem('2026-10-10', xang.iid);
  eq(e.ghiChu, 'Đi chợ ' + ctx.fmt(120000), 'xóa dòng xăng -> chỉ gỡ mẩu chung, còn mẩu của dòng đã sửa');
});

test('Ghi nhanh: có từ 2 ví thì bảng ghi có thẻ chọn ví (sau danh mục); 1 ví thì không có', function(){
  setToday('2026-10-10');
  var d = dataGhiNhanh();
  d.wallets = [{ id:'w1', ten:'Techcombank', soDuDauKy:500000 }, { id:'w2', ten:'Tiền mặt', soDuDauKy:500000 }];
  loadData(d);
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  var h = ctx.ghiNhanhHtml();
  var iTien = h.indexOf('id="qa_amount"'), iVi = h.indexOf('id="qa_wallet"'), iCat = h.indexOf('data-cat="an"');
  ok(iTien > 0 && iCat > iTien && iVi > iCat, 'thứ tự: số tiền, danh mục, ví');
  ok(h.indexOf('data-act="qaViChon" data-id="w1"') >= 0 && h.indexOf('data-act="qaViChon" data-id="w2"') >= 0, 'mỗi ví một thẻ chọn');
  ok(h.indexOf('Techcombank') >= 0 && h.indexOf('Tiền mặt') >= 0, 'liệt kê các tài khoản');
  ok(h.indexOf('Trả từ ví') >= 0, 'chi: nhãn "Trả từ ví"');
  loadData(dataGhiNhanh());
  ok(ctx.ghiNhanhHtml().indexOf('qa_wallet') < 0, '1 ví: không có ô tài khoản');
});

test('Ghi nhanh: chọn tài khoản được nhớ qua các lần vẽ lại và dùng khi ghi', function(){
  setToday('2026-10-10');
  var d = dataGhiNhanh();
  d.wallets = [{ id:'w1', ten:'Techcombank', soDuDauKy:500000 }, { id:'w2', ten:'Tiền mặt', soDuDauKy:500000 }];
  loadData(d);
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  ctx.handleSoTayAction('qaViChon', { getAttribute:function(){ return 'w2'; } });
  eq(ctx.state.qa.wallet, 'w2', 'đã nhớ ví chọn');
  ok(ctx.ghiNhanhHtml().indexOf('id="qa_wallet" value="w2"') >= 0, 'vẽ lại vẫn chọn Tiền mặt');
  voiDom({ qa_amount:{ value:'20.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' }, qa_wallet:{ value:'w2' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  var it = ctx.state.data.journal['2026-10-10'].items[0];
  eq(it.walletId, 'w2', 'ghi vào ví Tiền mặt');
  eq(ctx.soDuTheoVi('w2', '2026-10-10'), 480000, 'số dư ví Tiền mặt giảm');
  eq(ctx.soDuTheoVi('w1', '2026-10-10'), 500000, 'ví Techcombank không đổi');
});

/* ==================================================================== */
group('Y. Tài khoản (ví) mặc định');

function dataHaiVi(md){
  var d = dataGhiNhanh();
  d.wallets = [{ id:'w1', ten:'Techcombank', soDuDauKy:500000 }, { id:'w2', ten:'Tiền mặt', soDuDauKy:500000 }];
  if (md) d.settings.viMacDinh = md;
  return d;
}

test('viMacDinhId / viDienSan: chưa tích chọn thì ví đầu + nhớ ví vừa chọn; đã tích chọn thì luôn là ví đó', function(){
  loadData(dataHaiVi());
  eq(ctx.viMacDinhId(), 'w1', 'chưa chọn: ví đầu tiên');
  eq(ctx.viMacDinhDaChon(), '', 'chưa tích chọn');
  ctx.state.viChon = 'w2';
  eq(ctx.viDienSan(), 'w2', 'chưa tích chọn: nhớ ví chọn gần nhất');
  loadData(dataHaiVi('w2'));
  ctx.state.viChon = 'w1';
  eq(ctx.viMacDinhId(), 'w2');
  eq(ctx.viDienSan(), 'w2', 'đã tích chọn: bỏ qua ví vừa chọn');
  ctx.state.viChon = '';
});

test('normalizeData: ví mặc định đã bị xóa / không có thật thì bỏ, quay về ví đầu', function(){
  loadData(dataHaiVi('w9'));
  eq(ctx.state.data.settings.viMacDinh, '', 'bỏ id lạ');
  eq(ctx.viMacDinhId(), 'w1');
});

test('Danh mục: hàng ví KHÔNG hiện số dư đầu kỳ (dễ nhầm với tiền đang có), số chỉ nằm trong bảng sửa', function(){
  loadData(dataHaiVi());
  ctx.state.data.wallets[0].soDuDauKy = 1234567;
  var h = ctx.viCardHtml();
  ok(!/1[.,]?234[.,]?567/.test(h), 'thẻ ví không hiện số tiền');
  ok(h.indexOf('Tổng số dư đầu kỳ') < 0, 'không còn dòng tổng');
  var sheet = ctx.viSheetHtml({ loai:'vi', id: ctx.state.data.wallets[0].id });
  ok(/id="dm_vi_du" value="1[.,]?234[.,]?567"/.test(sheet) && sheet.indexOf('KHÔNG phải số tiền ví đang có') >= 0, 'bảng sửa có số đầu kỳ và nhắc đây không phải số đang có');
});

test('Danh mục: tích chọn ví mặc định lưu vào settings, không đổi dòng đã ghi; xóa ví mặc định thì bỏ cờ', function(){
  setToday('2026-10-10');
  var d = dataHaiVi();
  d.journal['2026-10-02'] = { thu:{}, chi:{ an:10000 }, ghiChu:'', refs:[], items:[ { iid:'i1', kind:'chi', catId:'an', soTien:10000, ghiChu:'', walletId:'w1' } ] };
  loadData(d);
  var h = ctx.viCardHtml();
  ok(/data-id="w1"[^>]*>\s*<span class="dm-main"><b class="dm-n">[^<]*<\/b><span class="dm-chips"><span class="dm-chip md">Mặc định/.test(h) && (h.match(/Mặc định<\/span>/g) || []).length === 1, 'ví đầu đang là mặc định (đúng 1 ví có chip)');
  ctx.viDatMacDinh('w2');
  eq(ctx.state.data.settings.viMacDinh, 'w2', 'đã lưu');
  ok(/data-id="w2"[^>]*>\s*<span class="dm-main"><b class="dm-n">[^<]*<\/b><span class="dm-chips"><span class="dm-chip md">Mặc định/.test(ctx.viCardHtml()), 'giao diện đánh dấu ví mới');
  eq(ctx.state.data.journal['2026-10-02'].items[0].walletId, 'w1', 'dòng cũ không bị xếp lại ví');
  eq(ctx.soDuTheoVi('w1', '2026-10-10'), 490000, 'số dư ví cũ không đổi');
  // thêm dòng mới không chọn ví -> vào ví mặc định mới
  var it = ctx.entryAddItem('2026-10-10', 'chi', 'an', 5000, '', undefined);
  eq(it.walletId, 'w2', 'dòng mới vào ví mặc định');
});

test('Ghi nhanh: có ví mặc định thì lần nhập sau quay về ví đó dù lần trước chọn ví khác; chưa có thì nhớ ví đã chọn', function(){
  setToday('2026-10-10');
  loadData(dataHaiVi('w1'));
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  voiDom({ qa_amount:{ value:'10.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' }, qa_wallet:{ value:'w2' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  eq(ctx.state.data.journal['2026-10-10'].items[0].walletId, 'w2', 'lần này ghi vào Tiền mặt như đã chọn');
  ok(ctx.ghiNhanhHtml().indexOf('id="qa_wallet" value="w1"') >= 0, 'lần sau quay về Techcombank (mặc định)');
  loadData(dataHaiVi());
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  voiDom({ qa_amount:{ value:'10.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' }, qa_wallet:{ value:'w2' } }, null, function(){ ctx.handleSoTayAction('qaSave', { _daBaoAm: true }); });
  ok(ctx.ghiNhanhHtml().indexOf('id="qa_wallet" value="w2"') >= 0, 'chưa tích mặc định: nhớ ví vừa chọn như trước');
});

/* ==================================================================== */
group('Z. Mô phỏng: số dư hiện tại + khoản định kỳ / trả vay đã tới hạn mà chưa ghi');

function dataMoPhong(){
  var d = baseData({ settings:{ soDuDauKy:10000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }];
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }, { id:'nha', ten:'Nhà', chiTieu:0 }, { id:'traNo', ten:'Trả nợ', chiTieu:0 }];
  d.dinhKy = [
    { id:'dk1', ten:'Lương', kind:'thu', catId:'luong', soTien:15000000, ngay:5, bat:true, bo:[] },
    { id:'dk2', ten:'Tiền nhà', kind:'chi', catId:'nha', soTien:3000000, ngay:8, bat:true, bo:[] },
    { id:'dk3', ten:'Tiền net', kind:'chi', catId:'an', soTien:200000, ngay:25, bat:true, bo:[] },
    { id:'dk4', ten:'Đã tắt', kind:'chi', catId:'an', soTien:999000, ngay:2, bat:false, bo:[] }
  ];
  d.vayNo.vayNoPhaiTra = [ loanKhongLai({ id:'v1', ten:'Vay xe', soTienGoc:3000000, soThangVay:3, ngayVay:'2026-09-10', ngayTraHangThang:8 }) ];   // kỳ T10 ngày 8: 1tr
  return d;
}

test('dinhKyChuaGhiThang: gồm cả khoản chưa tới ngày; bỏ khoản đã ghi / đã bỏ qua / đang tắt', function(){
  setToday('2026-10-10');
  loadData(dataMoPhong());
  eq(ctx.dinhKyChuaGhiThang('2026-10', 'thu'), 15000000, 'thu: lương');
  eq(ctx.dinhKyChuaGhiThang('2026-10', 'chi'), 3200000, 'chi: nhà + net (khoản tắt không tính)');
  eq(ctx.dinhKyChuaGhiThang('2026-10', 'chi', 'nha'), 3000000, 'theo danh mục');
  ctx.dinhKyGhi(ctx.state.data.dinhKy[1], '2026-10', '2026-10-10');            // ghi tiền nhà
  ctx.state.data.dinhKy[2].bo.push('2026-10');                                  // bỏ qua tiền net
  eq(ctx.dinhKyChuaGhiThang('2026-10', 'chi'), 0, 'đã ghi + đã bỏ qua -> hết');
  eq(ctx.dinhKyChuaGhiThang('2026-11', 'chi'), 3200000, 'ghi / bỏ qua của tháng 10 không ảnh hưởng tháng 11 (nhà + net đều chưa ghi)');
});

test('Dự báo tháng này cộng khoản định kỳ chưa ghi (cả khoản chưa tới ngày), không tính 2 lần với chỉ tiêu cố định', function(){
  setToday('2026-10-10');
  var d = dataMoPhong();
  d.categories.chi[1].coDinhChiTieu = true; d.categories.chi[1].chiTieu = 3000000;   // Nhà vừa có chỉ tiêu cố định vừa có định kỳ
  loadData(d);
  // chi: nhà 3tr (định kỳ, KHÔNG cộng thêm chỉ tiêu cố định) + net 0,2tr + trả vay kỳ T10 1tr
  eq(ctx.tongChiThangCard('2026-10'), 3000000 + 200000 + 1000000, 'chi tháng này');
  eq(ctx.tongThuThangCard('2026-10'), 15000000, 'thu tháng này gồm lương chưa ghi');
  // ghi lương rồi thì không tính lại
  ctx.dinhKyGhi(ctx.state.data.dinhKy[0], '2026-10', '2026-10-10');
  ctx.invalidateBalanceCache();
  eq(ctx.tongThuThangCard('2026-10'), 15000000, 'đã ghi lương: 15tr là số thật, không cộng thêm lần nữa');
  // tháng sau không bị ảnh hưởng bởi khoản định kỳ chưa ghi
  eq(ctx.dinhKyChuaGhiThang('2026-10', 'thu'), 0);
});

test('soDuHienTaiDieuChinh: số dư thật + định kỳ & kỳ trả vay ĐÃ TỚI HẠN chưa ghi; bỏ khoản chưa tới ngày', function(){
  setToday('2026-10-10');
  loadData(dataMoPhong());
  var r = ctx.soDuHienTaiDieuChinh('2026-10-10');
  eq(r.goc, 10000000, 'số dư theo Sổ tay');
  eq(r.items.map(function(x){ return x.ten; }).join(','), 'Lương,Tiền nhà,Trả vay', 'tiền net (ngày 25) chưa tới nên không có; khoản tắt không có');
  eq(r.tong, 10000000 + 15000000 - 3000000 - 1000000, 'cộng lương, trừ nhà và kỳ vay');
  // trước ngày lương: chưa tính lương
  var r2 = ctx.soDuHienTaiDieuChinh('2026-10-04');
  eq(r2.items.length, 0, 'ngày 4: chưa có khoản nào tới hạn');
  eq(r2.tong, 10000000);
});

test('soDuHienTaiDieuChinh: khoản đã ghi thì không cộng 2 lần; trả nợ nhập tay không gắn khoản được trừ bớt', function(){
  setToday('2026-10-10');
  loadData(dataMoPhong());
  ctx.dinhKyGhi(ctx.state.data.dinhKy[0], '2026-10', '2026-10-10');            // đã ghi lương 15tr
  ctx.entryAddItem('2026-10-09', 'chi', 'traNo', 400000, 'trả vay tay', undefined);   // trả tay 400k, không gắn khoản
  ctx.invalidateBalanceCache();
  var r = ctx.soDuHienTaiDieuChinh('2026-10-10');
  eq(r.goc, 10000000 + 15000000 - 400000, 'số dư thật đã có lương và 400k trả tay');
  eq(r.items.map(function(x){ return x.ten; }).join(','), 'Tiền nhà,Trả vay', 'lương đã ghi nên không còn trong danh sách');
  var vay = r.items.filter(function(x){ return x.ten === 'Trả vay'; })[0];
  eq(vay.soTien, 600000, 'kỳ 1tr trừ 400k trả tay');
  eq(r.tong, r.goc - 3000000 - 600000);
});

test('Tab Mô phỏng: ô đầu là "Số dư hiện tại" (kèm khoản đã cộng), không còn "Số dư cuối kỳ"', function(){
  setToday('2026-10-10');
  loadData(dataMoPhong());
  ctx.state.mp = { data: JSON.parse(JSON.stringify(ctx.state.data)), napLuc: new Date(), horizon: 12, formOpen:false, editIdx:-1, dieuChinh:[] };
  var root = { innerHTML:'' };
  var rm0 = ctx.renderMoPhong; ctx.renderMoPhong = renderThat.renderMoPhong;
  try{ voiDom({ tabContent: root }, null, function(){ ctx.renderMoPhong(); }); } finally { ctx.renderMoPhong = rm0; }
  var h = root.innerHTML;
  ok(h.indexOf('Số dư hiện tại') >= 0, 'có ô Số dư hiện tại');
  ok(h.indexOf(ctx.fmt(21000000)) >= 0, 'giá trị đã điều chỉnh 21tr: ' + h.slice(h.indexOf('Số dư hiện tại'), h.indexOf('Số dư hiện tại') + 400));
  ok(h.indexOf('Đã tính thêm 3 khoản đến hạn chưa ghi') >= 0 && h.indexOf('Lương +') >= 0, 'nói rõ đã cộng khoản nào');
  ok(h.indexOf('Số dư cuối kỳ') < 0, 'không còn ô cuối kỳ');
  ok(h.indexOf('Cuối tháng này — kịch bản') >= 0 && h.indexOf('Chênh lệch sau 12 tháng') >= 0, 'các ô còn lại');
  ctx.state.mp = { data: null, napLuc: null, horizon: 24, formOpen: false, editIdx: -1, dieuChinh: [] };
  setToday('2026-10-01');
});

/* ==================================================================== */
group('DT. Dòng tiền thiết kế mới (Thực tế & dự kiến + Mô phỏng)');

function dataDongTien(){
  var d = baseData({ settings:{ soDuDauKy:10000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:10000000 }, { id:'thuNgoai', ten:'Thu ngoài', chiTieu:0 }];
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:1000000 }, { id:'xang', ten:'Xăng', chiTieu:500000 }, { id:'tieu', ten:'Tiêu', chiTieu:0 }, { id:'traNo', ten:'Trả nợ', chiTieu:0 }];
  d.journal['2026-10-05'] = { items:[], refs:[], thu:{ luong:10000000, thuNgoai:80000 }, chi:{ an:1200000, xang:100000 }, ghiChu:'' };
  return d;
}
function renderDT(){
  var root = { innerHTML:'' };
  voiDom({ tabContent: root }, null, function(){ ctx.renderDongTien(); });
  return root.innerHTML;
}

test('dtThangDuLieu: thu/chi thực tế, kế hoạch, Trả nợ tách riêng, cân đối = thu − chi của tháng', function(){
  setToday('2026-10-10');
  loadData(dataDongTien());
  var d = ctx.dtThangDuLieu('2026-10');
  eq(d.thuAct, 10080000); eq(d.thuPlan, 10000000);
  eq(d.chiAct, 1300000); eq(d.chiPlan, 1500000);
  ok(d.traNo && d.traNo.id === 'traNo', 'Trả nợ không nằm trong d.chi');
  ok(d.chi.every(function(r){ return r.id !== 'traNo'; }));
  eq(Math.round(d.cb), Math.round(ctx.tongThuThangCard('2026-10') - ctx.tongChiThangCard('2026-10')));
  setToday('2026-10-01');
});

test('Dòng tiền: thẻ đầu, Thu/Chi theo danh mục, dự kiến; không còn <table>, có nút "Xem bảng cả năm"', function(){
  setToday('2026-10-10');
  loadData(dataDongTien());
  ctx.state.dtMk = null; ctx.state.dtBangNam = false; ctx.state.dtMoPhong = false;
  var h = renderDT();
  ok(h.indexOf('Cân đối tháng') >= 0 && h.indexOf('id="dtDau"') >= 0, 'thẻ đầu');
  ok(h.indexOf('Thu nhập tháng 10') >= 0 && h.indexOf('Chi theo hạn mức') >= 0 && h.indexOf('Dự kiến các tháng tới') >= 0);
  ok(h.indexOf('<table') < 0, 'không còn bảng ở màn chính');
  ok(h.indexOf('data-act="dtBangNam"') >= 0 && h.indexOf('Xem bảng cả năm') >= 0);
  ok(h.indexOf('data-act="dtJump"') >= 0 && h.indexOf('data-act="dtPrev"') >= 0, 'chọn tháng');
  // Ăn 120% hạn mức -> "Cần chú ý" + chip Vượt; Xăng 20% -> Ổn
  ok(h.indexOf('Cần chú ý · 1') >= 0 && h.indexOf('Vượt '+ctx.fmt(200000)) >= 0, 'Ăn vượt hạn mức');
  ok(h.indexOf('Ổn · 1') >= 0, 'Xăng ổn');
  ok(h.indexOf('Thu ngoài') >= 0 && h.indexOf('ngoài kế hoạch') >= 0, 'thu ngoài kế hoạch');
  setToday('2026-10-01');
});

test('Dòng tiền: sang tháng sau là tháng gợi ý (nhãn gợi ý, không có nhịp ngày); mở rộng 1 dòng chi; bảng cả năm mở bằng nút', function(){
  setToday('2026-10-10');
  loadData(dataDongTien());
  ctx.state.dtMk = null; ctx.state.dtBangNam = false; ctx.state.dtMoDong = null; ctx.state.dtMoPhong = false;
  var root = { innerHTML:'' };
  voiDom({ tabContent: root }, null, function(){ ctx.handleDongTienAction('dtNext', elAct({})); });
  eq(ctx.state.dtMk, '2026-11');
  ok(root.innerHTML.indexOf('Thu nhập '+ctx.monthLabel('2026-11').toLowerCase()) >= 0 && root.innerHTML.indexOf('gợi ý') >= 0);
  ok(root.innerHTML.indexOf('Đã qua') < 0, 'tháng chưa tới không có nhịp ngày');
  voiDom({ tabContent: root }, null, function(){ ctx.handleDongTienAction('dtPrev', elAct({})); });
  voiDom({ tabContent: root }, null, function(){ ctx.handleDongTienAction('dtMoDong', elAct({ 'data-id':'an' })); });
  ok(root.innerHTML.indexOf('class="dt-ct"') >= 0 && root.innerHTML.indexOf('Nhịp hiện tại') >= 0, 'chi tiết dòng Ăn');
  voiDom({ tabContent: root }, null, function(){ ctx.handleDongTienAction('dtBangNam', elAct({})); });
  ok(root.innerHTML.indexOf('Lũy kế số dư') >= 0 && root.innerHTML.indexOf('Ẩn bảng cả năm') >= 0, 'bảng cả năm hiện sau nút');
  ctx.state.dtBangNam = false; ctx.state.dtMoDong = null; ctx.state.dtMk = null;
  setToday('2026-10-01');
});

test('Dòng tiền: dtDuKienRows cộng dồn từ số dư trước tháng hiện tại; tháng đã qua dùng số dư cuối tháng', function(){
  setToday('2026-10-10');
  loadData(dataDongTien());
  var rows = ctx.dtDuKienRows(3);
  eq(rows.length, 3); eq(rows[0].mk, '2026-10');
  eq(Math.round(rows[0].bal), Math.round(ctx.balanceBeforeMonth('2026-10') + rows[0].cb));
  eq(Math.round(rows[1].bal), Math.round(rows[0].bal + rows[1].cb));
  eq(ctx.dtLuyKe('2026-10', rows), rows[0].bal);
  setToday('2026-10-01');
});

test('Mô phỏng: mpTinhVay trả cố định 150tr/9%/36 tháng = 4.769.960, tổng lãi 21.718.556; gốc đều thì giảm dần', function(){
  var a = ctx.mpTinhVay({ hinhThuc:'co_lai', soTien:150000000, laiSuatNam:9, soThang:36, mkTu:'2026-11' });
  eq(Math.round(a.tra), 4769960); eq(Math.round(a.tongLai), 21718556); eq(a.hetMk, '2029-11');
  var b = ctx.mpTinhVay({ hinhThuc:'goc_deu', soTien:12000000, laiSuatNam:12, soThang:12, mkTu:'2026-11' });
  eq(Math.round(b.tra), 1000000 + 120000, 'kỳ đầu = gốc 1tr + lãi 1%/tháng trên 12tr');
  eq(Math.round(b.tongLai), 780000, 'lãi giảm dần: 1% × (12+11+…+1)tr');
  var c = ctx.mpTinhVay({ hinhThuc:'tra_co_dinh', soTien:12000000, laiSuatNam:0, soThang:12, mkTu:'2026-11', traTay:1100000 });
  eq(Math.round(c.tongLai), 1200000, 'tự nhập số trả: phần chênh là lãi');
});

test('Mô phỏng: mpDcDelta ghi đúng dấu ảnh hưởng; vay gốc đều đi qua mpBuildScenario', function(){
  setToday('2026-10-10');
  loadData(dataMoPhong());
  ctx.state.mp.data = JSON.parse(JSON.stringify(ctx.state.data));
  eq(ctx.mpDcDelta({ loai:'motLan', kind:'chi', soTien:25000000 }).t, '−' + ctx.fmt(25000000) + ' một lần');
  eq(ctx.mpDcDelta({ loai:'dinhKy', kind:'thu', soTien:3000000, soThang:12 }).t, '+' + ctx.fmt(36000000) + ' trong 12 tháng');
  var v = { loai:'vayMoi', bat:true, ten:'Xe', soTien:12000000, hinhThuc:'goc_deu', laiSuatNam:12, soTienTraThang:0, soThang:12, mkTu:'2026-11' };
  ok(ctx.mpDcDelta(v).t.indexOf('(kỳ đầu)') >= 0);
  ctx.state.mp.dieuChinh = [v];
  var sc = ctx.mpBuildScenario();
  var rows = ctx.mpChieuDongTien(sc.data, '2026-10', 3, sc.overlay);
  var base = ctx.mpChieuDongTien(ctx.state.mp.data, '2026-10', 3, []);
  eq(Math.round(rows[1].thu - base[1].thu), 12000000, 'tiền vay về ví tháng nhận');
  eq(Math.round(rows[2].chi - base[2].chi), 1120000, 'kỳ đầu gốc đều trả tháng sau');
  ctx.state.mp.dieuChinh = []; ctx.state.mp.data = null;
  setToday('2026-10-01');
});

test('Mô phỏng: màn mới có vùng nháp, công tắc, tab số tháng; sheet form là bảng trượt (mpFormHtml)', function(){
  setToday('2026-10-10');
  loadData(dataMoPhong());
  ctx.state.mp = { data: JSON.parse(JSON.stringify(ctx.state.data)), napLuc: new Date(), horizon: 12, formOpen:false, editIdx:-1,
    dieuChinh:[{ loai:'motLan', kind:'chi', ten:'Mua laptop', soTien:25000000, mk:'2026-12', bat:true }] };
  var root = { innerHTML:'' };
  var rm0 = ctx.renderMoPhong; ctx.renderMoPhong = renderThat.renderMoPhong;
  try{ voiDom({ tabContent: root }, null, function(){ ctx.renderMoPhong(); }); } finally { ctx.renderMoPhong = rm0; }
  var h = root.innerHTML;
  ok(h.indexOf('Vùng nháp') >= 0 && h.indexOf('Không được lưu') >= 0, 'vùng nháp');
  ok(h.indexOf('class="mp-sw"') >= 0 && h.indexOf('data-act="mpToggleDc"') >= 0, 'công tắc');
  ok(h.indexOf('Mua laptop') >= 0 && h.indexOf('một lần') >= 0, 'dòng điều chỉnh có delta');
  ok(h.indexOf('data-act="mpHorizon"') >= 0 && h.indexOf('Xem thêm 6 tháng') >= 0, 'tab số tháng + danh sách rút gọn');
  ok(h.indexOf('<table') < 0, 'không còn bảng');
  var f = ctx.mpFormHtml();
  ok(f.indexOf('qa-sheet') >= 0 && f.indexOf('data-act="mpDoiLoai"') >= 0 && f.indexOf('Áp vào kịch bản') >= 0);
  ctx.state.mp.formLoai = 'vayMoi';
  var f2 = ctx.mpFormHtml();
  ok(f2.indexOf('Gốc đều, lãi giảm') >= 0 && f2.indexOf('id="mp_traThang"') >= 0 && f2.indexOf('id="mp_tom"') >= 0);
  ctx.state.mp = { data: null, napLuc: null, horizon: 24, formOpen: false, editIdx: -1, dieuChinh: [] };
  setToday('2026-10-01');
});

/* ==================================================================== */
group('I. Icon thay emoji, font tự lưu');

test('icon(): trả SVG nét mảnh dùng currentColor; tên lạ trả chuỗi rỗng', function(){
  var s = ctx.icon('trash');
  ok(s.indexOf('<svg') === 0 && s.indexOf('stroke="currentColor"') > 0 && s.indexOf('aria-hidden="true"') > 0, 'có svg: ' + s.slice(0, 80));
  eq(ctx.icon('khong-co'), '', 'tên lạ');
  ok(ctx.icon('check', 'to').indexOf('class="ic to"') > 0, 'nhận thêm class');
});

test('Mã nguồn giao diện không còn emoji / ký tự biểu tượng (dùng icon() thay)', function(){
  var re = /[\u{1F300}-\u{1FAFF}☀-➿⬀-⯿⏩-⏿▲▼⟳◐]/u;
  var files = ['index.html'].concat(fs.readdirSync(JS_DIR).filter(function(f){ return /\.js$/.test(f); }).map(function(f){ return 'js/' + f; }));
  var vi = [];
  files.forEach(function(f){
    fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n').forEach(function(l, i){
      var t = l.trim();
      if (/^(\/\/|\/\*|\*)/.test(t)) return;                  // bỏ qua dòng chú thích
      if (re.test(l)) vi.push(f + ':' + (i + 1) + ' ' + t.slice(0, 60));
    });
  });
  eq(vi.length, 0, 'còn ký tự biểu tượng: ' + vi.slice(0, 3).join(' | '));
});

test('Font Be Vietnam Pro: đủ file woff2 cho latin + vietnamese 400/600/700 và có giấy phép', function(){
  var dir = path.join(__dirname, '..', 'fonts');
  ['latin', 'vietnamese'].forEach(function(sub){
    [400, 600, 700].forEach(function(w){
      ok(fs.existsSync(path.join(dir, 'be-vietnam-pro-' + sub + '-' + w + '.woff2')), 'thiếu ' + sub + '-' + w);
    });
  });
  ok(fs.existsSync(path.join(dir, 'OFL.txt')), 'thiếu giấy phép OFL');
  var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  ok(css.indexOf("font-family:'Be Vietnam Pro'") >= 0 && css.indexOf('U+20AB') >= 0, '@font-face có phạm vi tiếng Việt (gồm ký hiệu ₫)');
});

test('Nút + nổi (FAB) đã bỏ hẳn; phím N vẫn ghi nhanh', function(){
  var root = path.join(__dirname, '..');
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  ok(html.indexOf('id="fabAdd"') < 0 && css.indexOf('.fab') < 0, 'còn sót FAB');
  ok(fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8').indexOf("handleAction('fabAdd'") >= 0, 'mất phím tắt N');
});

test('Thẻ phân màu theo loại + "Số dư theo ví" nằm ngay dưới thẻ tổng quan', function(){
  var root = path.join(__dirname, '..');
  var st = fs.readFileSync(path.join(root, 'js', 'sotay.js'), 'utf8');
  var iThe = st.indexOf('html += viTheHtml(mk, beforeLock);'), i = st.indexOf('html += viSoDuCardHtml(mk);');
  ok(iThe > 0 && i > iThe, 'dải thẻ ví đứng ngay sau thẻ tổng quan, trước thẻ chuyển ví');
  ok(st.indexOf('html += ghiNhanhHtml();') < 0 && st.lastIndexOf('qaBarHtml()') > i, 'Ghi nhanh là thanh nổi + bảng ghi, không còn thẻ trong luồng trang');
  ok(st.indexOf('card k-wal') > 0 && st.indexOf('k-act') > 0);   // Hạn mức / Mục tiêu ở tab Báo cáo đã chuyển sang thẻ bc-card (không viền màu theo loại)
  var css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  ['k-act', 'k-bud', 'k-goal', 'k-wal', 'k-in', 'k-debt', 'k-asset'].forEach(function(k){
    ok(css.indexOf('.' + k + '{') >= 0, 'thiếu CSS ' + k);
    ok(css.indexOf('--' + k + ':') >= 0 && css.indexOf('[data-theme="dark"]{\n  --k-act') >= 0, 'thiếu biến ' + k);
  });
});

test('Animation: motion.js được nạp, bọc đủ 5 hàm render, tôn trọng "giảm chuyển động"', function(){
  var root = path.join(__dirname, '..');
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var m = fs.readFileSync(path.join(root, 'js', 'motion.js'), 'utf8');
  var css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  ok(html.indexOf('js/motion.js') > 0 && html.indexOf('js/motion.js') < html.indexOf('js/app.js'), 'motion.js phải nạp trước app.js');
  ['renderSoTay', 'renderVayNo', 'renderDongTien', 'renderMoPhong', 'renderDanhMuc'].forEach(function(n){ ok(m.indexOf("'" + n + "'") >= 0, 'thiếu bọc ' + n); });
  ok(m.indexOf('prefers-reduced-motion') >= 0 && css.indexOf('@media (prefers-reduced-motion:reduce)') >= 0, 'thiếu tắt animation khi giảm chuyển động');
  ['anim-card', 'anim-mo', 'anim-moi', 'anim-xoa'].forEach(function(k){ ok(css.indexOf('.' + k + '{') >= 0, 'thiếu CSS ' + k); });
});

group('BD. Biểu đồ tự vẽ (bieudo.js)');

test('bdRut / bdBuoc / bdTruc: số ngắn và trục chia đẹp', function(){
  eq(ctx.bdRut(1200000), '1,2tr'); eq(ctx.bdRut(2000000), '2tr'); eq(ctx.bdRut(350000), '350k'); eq(ctx.bdRut(-2500000), '-2,5tr'); eq(ctx.bdRut(900), '900');
  var ax = ctx.bdTruc(0, 29390000);
  ok(ax.ticks.length >= 3 && ax.ticks.length <= 6, 'số vạch ' + ax.ticks.length);
  ok(ax.mx >= 29390000 && ax.mn === 0, 'trục phủ hết dữ liệu');
  var neg = ctx.bdTruc(-5000000, 3000000);
  ok(neg.mn <= -5000000 && neg.mx >= 3000000 && neg.ticks.indexOf(0) >= 0, 'trục có số âm vẫn có vạch 0');
  eq(ctx.bdTruc(0, 0).ticks.length >= 2, true, 'dữ liệu rỗng không vỡ');
});

test('bdLine: 1 và nhiều đường, 1 điểm không vỡ, thẻ giá trị theo điểm chọn', function(){
  var h = ctx.bdLine({ W: 350, H: 190, labels: ['01', '02', '03'], series: [{ ten: 'A', vals: [1000000, 3000000, 2000000], cls: 'chi', fill: true }], sel: 1,
    tipTitle: function(i){ return 'Ngày ' + (i + 1); }, money: function(v){ return v + 'đ'; } });
  ok(h.indexOf('<svg') === 0 && h.indexOf('class="bd-ln bd-s-chi') > 0, 'có đường');
  ok(h.indexOf('Ngày 2') > 0 && h.indexOf('3000000đ') > 0, 'thẻ giá trị theo sel');
  var h2 = ctx.bdLine({ W: 350, H: 190, labels: ['a', 'b'], series: [{ ten: 'X', vals: [1, 2], cls: 'gray', dash: true }, { ten: 'Y', vals: [2, 3], cls: 'chi' }] });
  ok(h2.indexOf('X: ') > 0 && h2.indexOf('Y: ') > 0, 'nhiều đường hiện đủ giá trị');
  ok(h2.indexOf('dash') > 0 && h2.indexOf('bd-draw') > 0, 'đường nét đứt không bị animation vẽ đè (chỉ đường liền có bd-draw)');
  ctx.bdLine({ W: 350, H: 190, labels: ['a'], series: [{ ten: 'X', vals: [5], cls: 'chi', fill: true }] });   // 1 điểm: không ném lỗi
});

test('bdXepCat: xếp giảm dần, gộp phần dư thành "Khác", giữ tổng', function(){
  var d = baseData({ categories: { thu: [], chi: ['a','b','c','d','e','f','g','h'].map(function(k, i){ return { id: k, ten: k.toUpperCase(), chiTieu: 0 }; }) } });
  loadData(d);
  var theo = { a: 10, b: 80, c: 30, d: 5, e: 60, f: 20, g: 1, h: 0 };
  var r = ctx.bdXepCat('chi', theo, null, 6);
  eq(r.length, 6, 'tối đa 6 mục'); eq(r[0].id, 'b'); eq(r[1].id, 'e');
  eq(r[5].id, '_khac'); eq(r[5].v, 6, 'Khác = mục thứ 6 trở đi (5 + 1)');
  var tong = 0; r.forEach(function(x){ tong += x.v; });
  eq(tong, 206, 'tổng không đổi sau khi gộp');
});

test('bieuDoCardHtml: 3 tab vẽ được với dữ liệu thật; tháng trống không vỡ', function(){
  var d = baseData({ settings: { soDuDauKy: 1000000, ngayBatDau: '2026-08-01', thangBatDauDuTru: '2026-08' }, journal: {
    '2026-09-10': { thu: { luong: 10000000 }, chi: { an: 2000000 }, ghiChu: '' },
    '2026-10-02': { thu: {}, chi: { an: 500000 }, ghiChu: '' },
    '2026-10-05': { thu: { luong: 12000000 }, chi: { an: 1500000 }, ghiChu: '' } } });
  loadData(d); setToday('2026-10-06');
  ctx.state.bdTab = 'tq';
  var tq = ctx.bieuDoCardHtml('2026-10');
  ok(tq.indexOf('id="bieuDoCard"') > 0 && tq.indexOf('Phân tích') > 0 && tq.indexOf('bd-cal') > 0, 'tab Tổng quan');
  // tháng 9 chỉ có giao dịch ngày 10 -> cùng kỳ 1–6/9 trống: không so (trước đây so với cả tháng 9 ra "giảm" sai)
  ok(tq.indexOf('so với tháng 9') < 0 && tq.indexOf('chi nhiều nhất') > 0, 'cùng kỳ trống thì không so với cả tháng trước');
  ctx.state.bdTab = 'dm'; ctx.state.bdMode = 'vong';
  ok(ctx.bieuDoCardHtml('2026-10').indexOf('bd-donut') > 0, 'donut');
  ctx.state.bdMode = 'thanh';
  ok(ctx.bieuDoCardHtml('2026-10').indexOf('bd-hb-r') > 0, 'thanh ngang');
  ctx.state.bdTab = 'xh';
  ok(ctx.bieuDoCardHtml('2026-10').indexOf('bd-lc') > 0, 'tab Xu hướng');
  ['tq', 'dm', 'xh'].forEach(function(t){ ctx.state.bdTab = t; ok(ctx.bieuDoCardHtml('2026-03').indexOf('bieuDoCard') > 0, 'tháng không dữ liệu (' + t + ')'); });
  ctx.state.bdTab = 'tq'; ctx.state.bdMode = 'vong'; ctx.state.bdCat = null; setToday('2026-10-01');
});

function dataBaoCao(){
  var d = baseData({ settings: { soDuDauKy: 5000000, ngayBatDau: '2026-01-01', thangBatDauDuTru: '2026-02' },
    categories: { thu: [{ id:'luong', ten:'Lương', chiTieu:0 }],
      chi: [{ id:'an', ten:'Ăn', chiTieu:1000000 }, { id:'xang', ten:'Xăng', chiTieu:250000 }, { id:'tieu', ten:'Tiêu', chiTieu:500000 }, { id:'nha', ten:'Nhà', chiTieu:2000000 },
            { id:'gui', ten:'Gửi mẹ', chiTieu:500000 }, { id:'ca', ten:'Cà phê', chiTieu:300000 }, { id:'khac', ten:'Khác', chiTieu:0 }] },
    journal: {
      '2026-09-05': { thu: { luong: 10000000 }, chi: { an: 600000 }, ghiChu: '' },
      '2026-10-02': { thu: {}, chi: { an: 1200000, xang: 215000, tieu: 410000 }, ghiChu: '' },
      '2026-10-05': { thu: { luong: 11000000 }, chi: { nha: 100000 }, ghiChu: '' } } });
  d.mucTieu = [{ id:'g1', ten:'Quỹ', soTien:10000000, hanChot:'2027-03', walletId:'', daGom:3000000 },
               { id:'g2', ten:'Xe', soTien:8000000, hanChot:'2026-09', walletId:'', daGom:6200000 },
               { id:'g3', ten:'Quà', soTien:1500000, hanChot:'2026-11', walletId:'', daGom:1500000 }];
  return d;
}
test('Báo cáo: nhịp tháng — chỉ tháng đang chạy mới có nhịp', function(){
  setToday('2026-10-18');
  var n = ctx.bcNhip('2026-10');
  ok(n.dangChay && n.ngayQua === 18 && n.soNgay === 31 && Math.abs(n.tyLe - 18 / 31) < 1e-9, 'tháng đang chạy: 18/31');
  var q = ctx.bcNhip('2026-09'), tl = ctx.bcNhip('2026-12');
  ok(!q.dangChay && q.tyLe === 1 && !tl.dangChay && tl.tyLe === 0, 'đã qua = 1, chưa tới = 0');
});

test('Báo cáo: thẻ Hạn mức tách "Cần chú ý" (từ 80% hoặc vượt) và "Ổn"; vạch nhịp chỉ ở tháng đang chạy', function(){
  setToday('2026-10-18'); loadData(dataBaoCao());
  var h = ctx.hanMucThangHtml('2026-10');
  ok(h.indexOf('id="cardHanMuc"') > 0 && h.indexOf('Cần chú ý · 3') > 0 && h.indexOf('Ổn · 3') > 0, 'Ăn 120% / Xăng 86% / Tiêu 82% cần chú ý; Nhà, Gửi mẹ, Cà phê ổn');
  ok(h.indexOf('1 danh mục vượt') > 0 && h.indexOf('Vượt 200.000') > 0, 'badge + số vượt (Ăn 1.200.000 / 1.000.000)');
  ok(h.indexOf('class="tick"') > 0 && h.indexOf('nhịp hôm nay') > 0, 'tháng đang chạy có vạch nhịp');
  ok(h.indexOf('Gửi mẹ') > h.indexOf('Ổn · 3'), 'danh mục chưa phát sinh nằm ở nhóm Ổn');
  var q = ctx.hanMucThangHtml('2026-09');
  ok(q.indexOf('class="tick"') < 0 && q.indexOf('nhịp hôm nay') < 0, 'tháng đã qua: không có vạch nhịp');
  loadData(baseData()); eq(ctx.hanMucThangHtml('2026-10'), '', 'chưa đặt hạn mức: không có thẻ (renderBaoCao hiện gợi ý)');
});

test('Báo cáo: thẻ đầu — đã chi / hạn mức, vạch Hôm nay, ước tính, chip cảnh báo; không hạn mức thì chỉ hiện số đã chi', function(){
  setToday('2026-10-18'); loadData(dataBaoCao());
  var h = ctx.baoCaoDauHtml('2026-10');
  ok(h.indexOf('Đã chi tháng này') > 0 && h.indexOf('1.925.000') > 0 && h.indexOf('/ 4.550.000') > 0, 'tổng đã chi 1.925.000 (1.200.000+215.000+410.000+100.000) trên hạn mức 4.550.000');
  ok(h.indexOf('Hôm nay') > 0 && h.indexOf('Đã qua 18/31 ngày') > 0 && h.indexOf('class="bc-chip red"') > 0 && h.indexOf('class="bc-chip amber"') > 0, 'vạch Hôm nay + chip vượt + chip mục tiêu quá hạn');
  ok(h.indexOf('Giữ nhịp này') > 0, 'có dòng ước tính cuối tháng');
  var q = ctx.baoCaoDauHtml('2026-09');
  ok(q.indexOf('Đã chi tháng 9') > 0 && q.indexOf('Hôm nay') < 0 && q.indexOf('Giữ nhịp này') < 0, 'tháng đã qua: bỏ vạch Hôm nay và ước tính');
  var d = dataBaoCao(); d.categories.chi.forEach(function(c){ c.chiTieu = 0; }); loadData(d);
  var k = ctx.baoCaoDauHtml('2026-10');
  ok(k.indexOf('bc-pace ') < 0 && k.indexOf('Chưa đặt hạn mức') > 0 && k.indexOf('Đã chi tháng này') > 0, 'chưa đặt hạn mức: chỉ số đã chi + gợi ý');
});

test('Báo cáo: Mục tiêu tiết kiệm — trạng thái Hạn / Quá hạn / Hoàn thành; xong thì không còn nút Gom thêm', function(){
  setToday('2026-10-18'); loadData(dataBaoCao());
  var h = ctx.mucTieuCardHtml();
  ok(h.indexOf('id="cardMucTieu"') > 0 && h.indexOf('10.700.000') > 0 && h.indexOf('đã gom') > 0, 'tổng đã gom 3.000.000+6.200.000+1.500.000');
  ok(h.indexOf('Hạn 03/2027') > 0 && h.indexOf('>Quá hạn<') > 0 && h.indexOf('Hoàn thành') > 0, 'ba trạng thái');
  eq((h.match(/data-act="mtGom"/g) || []).length, 2, 'mục tiêu đã đủ thì không có nút Gom thêm');
});

test('Báo cáo: Tài sản ròng — chip chênh lệch đúng số tháng, hạ xuống dưới Hạn mức và trên Mục tiêu', function(){
  setToday('2026-10-18'); loadData(dataBaoCao());
  var h = ctx.taiSanRongCardHtml('2026-10');
  ok(h.indexOf('id="cardTaiSanRong"') > 0 && h.indexOf('tsr-tbl') > 0 && h.indexOf('Tiền các ví') > 0, 'số lớn + bảng thành phần');
  ok(/so với 9 tháng trước/.test(h), 'dữ liệu bắt đầu 01/2026 nên so với 9 tháng trước, không nói 12');
  var st = fs.readFileSync(path.join(__dirname, '..', 'js', 'bieudo.js'), 'utf8');
  var r = st.slice(st.indexOf('function renderBaoCao'));
  ok(r.indexOf('baoCaoDauHtml(mk)') < r.indexOf('hanMucThangHtml(mk)') && r.indexOf('hanMucThangHtml(mk)') < r.indexOf('taiSanRongCardHtml(mk)') && r.indexOf('taiSanRongCardHtml(mk)') < r.indexOf('mucTieuCardHtml()'), 'thứ tự: thẻ đầu, hạn mức, tài sản ròng, mục tiêu');
});

test('Xu hướng: trung bình / tiết kiệm bỏ tháng đang chạy dở và ghi rõ khoảng tháng; vòng tròn ghi số danh mục', function(){
  var d = baseData({ settings: { soDuDauKy: 0, ngayBatDau: '2026-01-01', thangBatDauDuTru: '2026-02' }, journal: {
    '2026-08-05': { thu: { luong: 10000000 }, chi: { an: 4000000 }, ghiChu: '' },
    '2026-09-05': { thu: { luong: 10000000 }, chi: { an: 6000000 }, ghiChu: '' },
    '2026-10-05': { thu: { luong: 500000 }, chi: { an: 100000 }, ghiChu: '' } } });
  loadData(d); setToday('2026-10-12'); ctx.state.bdTab = 'xh';
  var h = ctx.bieuDoCardHtml('2026-10');
  ok(h.indexOf('T8–T9') > 0 && h.indexOf('thu trừ chi') > 0, 'khoảng tháng đã trọn: T8–T9');
  ok(h.indexOf('5.000.000') > 0 && h.indexOf('T10 tính đến 12/10') > 0, 'tiết kiệm TB = (6tr + 4tr) / 2 = 5.000.000 (không kéo bởi T10 mới 12 ngày)');
  ctx.state.bdTab = 'dm'; ctx.state.bdMode = 'vong';
  ok(ctx.bieuDoCardHtml('2026-10').indexOf('1 danh mục') > 0, 'tâm vòng ghi số danh mục');
  ctx.state.bdTab = 'tq'; ctx.state.bdMode = 'vong'; setToday('2026-10-01');
});

test('Phân tích tháng: tháng đang chạy so CÙNG KỲ, tháng đã qua so cả tháng', function(){
  // nhịp chi đều 100k/ngày cả tháng 9 và 7 ngày đầu tháng 10 -> không được báo "giảm 77%"
  var j = {};
  for (var dd = 1; dd <= 30; dd++) j['2026-09-' + (dd < 10 ? '0' + dd : dd)] = { thu: {}, chi: { an: 100000 }, ghiChu: '' };
  for (var d2 = 1; d2 <= 7; d2++) j['2026-10-0' + d2] = { thu: {}, chi: { an: 100000 }, ghiChu: '' };
  loadData(baseData({ settings: { soDuDauKy: 0, ngayBatDau: '2026-09-01', thangBatDauDuTru: '2026-09' }, journal: j }));
  setToday('2026-10-07');
  var p = ctx.bdThangSoSanh('2026-10');
  eq(p.tongChi, 700000, 'chỉ cộng 1–7/9'); eq(p.nhan, '1–7/9');
  ctx.state.bdTab = 'tq';
  var h = ctx.bieuDoCardHtml('2026-10');
  ok(h.indexOf('không đổi') > 0 && h.indexOf('so với 1–7/9') > 0, 'nhịp như nhau -> "không đổi so với 1–7/9"');
  ok(h.indexOf('giảm') < 0, 'không còn báo giảm sai');
  // xem lại tháng đã qua: so với cả tháng trước
  setToday('2026-11-15');
  var p2 = ctx.bdThangSoSanh('2026-10');
  eq(p2.nhan, 'tháng 9'); eq(p2.tongChi, 3000000);
  // ngày 31/3 so với tháng 2: hết tháng 2 rồi -> cả tháng 2, nhãn "tháng 2"
  setToday('2027-03-31'); eq(ctx.bdThangSoSanh('2027-03').nhan, 'tháng 2');
  setToday('2026-10-01');
});

test('Ước tính chi hết tháng: 1 khoản lớn không bị nhân lên cả tháng; cộng định kỳ chưa ghi', function(){
  var j = {};
  for (var dd = 1; dd <= 10; dd++) j['2026-10-' + (dd < 10 ? '0' + dd : dd)] = { thu: {}, chi: { an: 100000 }, ghiChu: '' };
  j['2026-10-03'].chi.an = 3100000;      // 1 lần mua lớn
  loadData(baseData({ journal: j, dinhKy: [{ id: 'dk1', ten: 'Tiền nhà', kind: 'chi', catId: 'an', soTien: 2000000, ngay: 25, bat: true }] }));
  setToday('2026-10-10');
  var u = ctx.bdUocTinhChiThang('2026-10', 10);
  eq(u.daChi, 4000000, 'đã chi');
  near(u.bietTruoc, 2000000, 1, 'định kỳ chưa ghi');
  // ngày thường: 9 ngày 100k + ngày lớn bị chặn ở 3×100k = 1,2tr / 10 ngày = 120k/ngày × 21 ngày còn lại
  near(u.them, 120000 * 21 + 2000000, 1, 'dự kiến thêm');
  ok(u.tong < 4000000 / 10 * 31 + 2000000, 'thấp hơn cách ngoại suy cũ');
  setToday('2026-10-01');
});

test('Mô phỏng: poll Drive chỉ nhường khi nháp đã có điều chỉnh (nháp tự nạp chưa sửa thì không chặn)', function(){
  loadData(baseData());
  ctx.mpXoaNhap(); eq(ctx.mpCoThayDoi(), false, 'chưa nạp');
  ctx.mpNapGoc(); eq(ctx.mpCoThayDoi(), false, 'vừa tự nạp, chưa sửa');
  ctx.state.mp.dieuChinh.push({ loai:'motLan', kind:'chi', mk:'2026-11', soTien:100 });
  eq(ctx.mpCoThayDoi(), true, 'có điều chỉnh');
  ctx.mpXoaNhap();
});

test('handleBieuDoAction: đổi tab / kiểu / chọn lát / chọn ngày chỉ đổi state, không ghi dữ liệu', function(){
  loadData(baseData()); ctx.state.soTayMonth = '2026-10';
  var kt = JSON.stringify(ctx.state.data);
  var el = function(o){ return { getAttribute: function(k){ return o[k]; } }; };
  ok(ctx.handleBieuDoAction('bdTab', el({ 'data-tab': 'dm' })) === true && ctx.state.bdTab === 'dm');
  ctx.handleBieuDoAction('bdMode', el({ 'data-mode': 'thanh' })); eq(ctx.state.bdMode, 'thanh');
  ctx.handleBieuDoAction('bdPick', el({ 'data-i': '2' })); eq(ctx.state.bdCat, 2);
  ctx.handleBieuDoAction('bdPick', el({ 'data-i': '2' })); eq(ctx.state.bdCat, null, 'bấm lại bỏ chọn');
  ctx.handleBieuDoAction('bdDay', el({ 'data-date': '2026-10-03' })); eq(ctx.state.bdDay, '2026-10-03');
  eq(ctx.handleBieuDoAction('khac', el({})), false);
  eq(JSON.stringify(ctx.state.data), kt, 'không đụng dữ liệu');
  ctx.state.bdTab = 'tq'; ctx.state.bdMode = 'vong'; ctx.state.bdDay = null;
});

test('Chart.js đã gỡ: không còn nạp thư viện, không còn <canvas> biểu đồ', function(){
  var root = path.join(__dirname, '..');
  ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').indexOf('chart.js') < 0, 'index.html còn nạp Chart.js');
  ['sotay.js', 'vayno.js', 'mophong.js'].forEach(function(f){
    var c = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    ok(c.indexOf('new Chart') < 0 && c.indexOf('<canvas') < 0, f + ' còn dùng Chart.js');
  });
});

test('stDelItem: xóa ngay không hỏi, Hoàn tác trả lại đúng dòng; ngày bị sửa thêm thì không hoàn tác', function(){
  setToday('2026-10-10');
  var d = baseData();
  d.journal['2026-10-05'] = { thu:{}, chi:{ an:80000 }, ghiChu:'Phở 50.000 ₫; Cơm 30.000 ₫', refs:[], items:[
    { iid:'p', kind:'chi', catId:'an', soTien:50000, ghiChu:'Phở', gc:'Phở 50.000 ₫' }, { iid:'c', kind:'chi', catId:'an', soTien:30000, ghiChu:'Cơm', gc:'Cơm 30.000 ₫' } ] };
  loadData(d);
  var goc = JSON.stringify(ctx.state.data.journal['2026-10-05']);
  var t0 = ctx.toast, undo = null, hoi = 0, x0 = ctx.xacNhan;
  ctx.toast = function(m, o){ if (o && o.hoanTac) undo = o.hoanTac; };
  ctx.xacNhan = function(){ hoi++; return Promise.resolve(true); };
  try{
    ctx.handleSoTayAction('stDelItem', elAct({ 'data-date':'2026-10-05', 'data-iid':'p' }));
    eq(hoi, 0, 'không mở hộp thoại'); eq(entryChi('2026-10-05', 'an'), 30000, 'đã trừ ngay');
    ok(undo, 'có nút Hoàn tác'); undo();
    eq(JSON.stringify(ctx.state.data.journal['2026-10-05']), goc, 'hoàn tác về đúng như cũ');
    // xóa rồi sửa thêm ngày đó -> hoàn tác bị từ chối
    ctx.handleSoTayAction('stDelItem', elAct({ 'data-date':'2026-10-05', 'data-iid':'p' }));
    ctx.entryAddItem('2026-10-05', 'chi', 'an', 10000, 'Trà đá');
    undo();
    eq(entryChi('2026-10-05', 'an'), 40000, 'không trả bản cũ đè lên phần vừa thêm');
  } finally { ctx.toast = t0; ctx.xacNhan = x0; }
});

test('Tài sản ròng: tiền ví + cho vay chưa thu − nợ gốc, tính lại đúng theo từng tháng', function(){
  setToday('2026-12-15');
  var d = baseData({ settings: { soDuDauKy: 10000000, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' } });
  d.categories.thu.push({ id:'thuHoiChoVay', ten:'Thu hồi', chiTieu:0 });
  d.journal['2026-11-20'] = { thu:{ thuHoiChoVay: 1000000 }, chi:{}, ghiChu:'', refs:[{ loanId:'cv', loai:'thuHoiChoVay', soTien:1000000 }], items:[] };
  d.vayNo = { choVay: [{ id:'cv', ten:'A', soTien:3000000, daThu:1000000, ngayChoVay:'2026-10-05' }],
    vayNoPhaiTra: [{ id:'vn', ten:'B', soTienGoc:6000000, ngayVay:'2026-10-10', soThangVay:6, hinhThuc:'khong_lai', ngayTraHangThang:10,
      traNo:[{ rid:'r1', ky:0, mk:'2026-11', soTien:1000000, ngay:'2026-11-10', dongKy:true }] }] };
  loadData(d);
  var t10 = ctx.taiSanRongThang('2026-10'), t11 = ctx.taiSanRongThang('2026-11');
  eq(t10.phaiThu, 3000000, 'T10 chưa thu đồng nào'); eq(t11.phaiThu, 2000000, 'T11 đã thu 1tr');
  near(t10.no, 6000000, 0.5, 'T10 nợ nguyên gốc'); near(t11.no, 5000000, 0.5, 'T11 đã trả 1 kỳ gốc 1tr');
  eq(t11.rong, t11.tien + 2000000 - t11.no);
  ctx.state.data.vayNo.vayNoPhaiTra[0].tatToan = { soTien: 5000000, ngay: '2026-12-01' };
  eq(ctx.taiSanRongThang('2026-12').no, 0, 'tất toán rồi thì hết nợ');
  near(ctx.taiSanRongThang('2026-11').no, 5000000, 0.5, 'tháng trước tất toán vẫn còn nợ');
  setToday('2026-10-01');
});

test('Nhập file: lưu cách ghép cột theo dòng tiêu đề, giữ tối đa 10 mẫu', function(){
  loadData(baseData());
  var imp = { rows: [['Ngày GD','Số tiền','Diễn giải']], coHeader: true, map: { ngay:0, tien:1, note:2, loai:-1, cat:-1, vi:-1 }, soDuong:'chi', catMD:{ thu:'', chi:'chi|an' }, viId:'' };
  ctx.nhapLuuMau(imp);
  var m = ctx.state.data.settings.mauNhap[ctx.nhapChuKy(imp.rows, true)];
  ok(m && m.map.note === 2 && m.catMD.chi === 'chi|an', 'đã lưu mẫu');
  eq(ctx.nhapChuKy(imp.rows, false), '', 'không có tiêu đề thì không lưu mẫu');
  for (var i = 0; i < 12; i++) ctx.nhapLuuMau({ rows: [['c' + i]], coHeader: true, map: {}, soDuong:'chi', catMD:{} });
  eq(Object.keys(ctx.state.data.settings.mauNhap).length, 10);
});

/* ==================================================================== */
group('D. Tiền của ngày = items + refs (entryTinhLai) — lưới hồi quy cho việc đổi nguồn sự thật');

// dữ liệu kiểu CŨ (chỉ có số tổng, thiếu items, lệch 2 chiều...) phải nạp ra ĐÚNG số tổng đã lưu: không đổi số dư của ai
test('Nạp dữ liệu cũ: số tổng theo danh mục giữ nguyên (cả khi thiếu items, items lệch, thu dạng số đơn, ref một phần)', function(){
  var d = baseData();
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }, { id:'traNo', ten:'Trả nợ', chiTieu:0 }];
  d.journal = {
    '2026-10-01': { thu:{ luong: 1000 }, chi:{ an: 500 }, ghiChu:'', refs:[] },
    '2026-10-02': { thu: 700, chi:{}, ghiChu:'', refs:[] },
    '2026-10-03': { thu:{}, chi:{ traNo: 1500000 }, ghiChu:'', refs:[{ loanId:'v', loai:'traNo', soTien:1000000, note:'', ky:0 }] },
    '2026-10-04': { thu:{}, chi:{ an: 300 }, ghiChu:'', refs:[], items:[{ iid:'a', kind:'chi', catId:'an', soTien:100, ghiChu:'x' }] },
    '2026-10-05': { thu:{}, chi:{ an: 100 }, ghiChu:'', refs:[], items:[{ iid:'b', kind:'chi', catId:'an', soTien:300, ghiChu:'y' }] },
    '2026-10-06': { thu:{ daXoa: 50 }, chi:{}, ghiChu:'', refs:[] },
    '2026-10-07': { thu:{}, chi:{ traNo: 833333.3333 }, ghiChu:'', refs:[{ loanId:'v', loai:'traNo', soTien:833333.3333, note:'', ky:1 }], items:[] }
  };
  var truoc = {};
  Object.keys(d.journal).forEach(function(k){
    var e = d.journal[k], t = (typeof e.thu === 'number') ? { _khac: e.thu } : e.thu;
    truoc[k] = { thu: JSON.parse(JSON.stringify(t)), chi: JSON.parse(JSON.stringify(e.chi)) };
  });
  loadData(d);
  Object.keys(truoc).forEach(function(k){
    var e = ctx.state.data.journal[k];
    ['thu', 'chi'].forEach(function(kind){
      Object.keys(truoc[k][kind]).forEach(function(c){ near(ctx.num(e[kind][c]), truoc[k][kind][c], 0.001, k + ' ' + kind + ' ' + c); });
      Object.keys(e[kind]).forEach(function(c){ ok(truoc[k][kind][c] != null, 'xuất hiện danh mục lạ ' + k + ' ' + kind + ' ' + c); });
    });
  });
  eq(ctx.journalKiemTra().length, 0, 'sau khi nạp: thu/chi khớp items + refs');
  eq(vm.runInContext('_soNgayLechLucNap', ctx), 2, 'đếm đúng 2 ngày lệch (có items nhưng số tổng khác: 10-04 và 10-05); file cũ chưa có items không bị tính');
  // nạp lần 2 từ chính kết quả (đóng gói JSON như lúc lưu / tải Drive) phải y hệt
  var json1 = JSON.stringify(ctx.state.data.journal);
  loadData(JSON.parse(JSON.stringify(ctx.state.data)));
  eq(JSON.stringify(ctx.state.data.journal), json1, 'nạp lại không đổi gì (idempotent)');
  // thu/chi vẫn được LƯU trong file (bản app cũ chỉ đọc thu/chi vẫn chạy)
  ok(JSON.parse(json1)['2026-10-01'].chi.an === 500, 'số tổng vẫn nằm trong file');
});

// sổ cái độc lập với code: ghi lại ý định của từng thao tác rồi so với thu/chi của từng ngày
function tinhFuzz(seed){
  var a = seed >>> 0;
  var rnd = function(){ a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  var pick = function(arr){ return arr[Math.floor(rnd() * arr.length)]; };
  var DATES = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
  var CATS = { thu: ['luong'], chi: ['an', 'xang'] };
  var SYS = [ ['traNo', 'chi'], ['choVay', 'chi'], ['nhanTienVay', 'thu'], ['thuHoiChoVay', 'thu'] ];
  var d = baseData();
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'thuHoiChoVay', ten:'TH', chiTieu:0 }, { id:'nhanTienVay', ten:'NV', chiTieu:0 }];
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }, { id:'xang', ten:'Xăng', chiTieu:0 }, { id:'traNo', ten:'TN', chiTieu:0 }, { id:'choVay', ten:'CV', chiTieu:0 }];
  loadData(d); setToday('2026-10-05');
  var so = ctx.state.data, ledger = {}, log = [], nLoan = 0;
  var L = function(date, kind, cat, v){ ledger[date] = ledger[date] || { thu:{}, chi:{} }; ledger[date][kind][cat] = (ledger[date][kind][cat] || 0) + v; };
  var allItems = function(){ var r = []; Object.keys(so.journal).forEach(function(dt){ ctx.entryItems(so.journal[dt]).forEach(function(it){ r.push({ date: dt, it: it }); }); }); return r; };
  var kiem = function(buoc){
    var lech = ctx.journalKiemTra();
    if (lech.length) throw new Error('seed ' + seed + ' bước ' + buoc + ' [' + log.join(' | ') + '] thu/chi lệch items+refs: ' + JSON.stringify(lech[0]));
    Object.keys(ledger).concat(Object.keys(so.journal)).forEach(function(dt){
      ['thu', 'chi'].forEach(function(kind){
        var cats = {};
        Object.keys((ledger[dt] || { thu:{}, chi:{} })[kind]).forEach(function(c){ cats[c] = 1; });
        Object.keys(((so.journal[dt] || {})[kind]) || {}).forEach(function(c){ cats[c] = 1; });
        Object.keys(cats).forEach(function(c){
          var mong = ((ledger[dt] || { thu:{}, chi:{} })[kind][c] || 0), co = ctx.num(((so.journal[dt] || {})[kind] || {})[c]);
          if (Math.abs(co - mong) > 0.001) throw new Error('seed ' + seed + ' bước ' + buoc + ' [' + log.join(' | ') + '] ' + dt + ' ' + kind + ' ' + c + ': có ' + co + ', sổ cái ' + mong);
        });
      });
    });
  };
  var voiForm = function(date, nhap, sua){
    var lists = { '.f_thu': [], '.f_chi': [] };
    ['thu', 'chi'].forEach(function(kind){
      so.categories[kind].forEach(function(c){
        var lock = sua ? ctx.entryRefSum(so.journal[date] || {}, kind, c.id) : 0;
        lists['.f_' + kind].push(oNhap(c.id, String(nhap[kind + '|' + c.id] || ''), lock));
      });
    });
    voiDom({ f_date:{ value: date }, f_ghichu:{ value: 'ghi chú' } }, lists, function(){ ctx.handleSoTayAction('saveEntry', { _daBaoAm: true }); });
  };
  for (var step = 0; step < 40; step++){
    var op = pick(['add', 'add', 'add', 'upd', 'del', 'ref', 'ref', 'rmref', 'upsert', 'form', 'formEdit', 'delDay']);
    var date = pick(DATES);
    if (op === 'add'){
      var kind = pick(['thu', 'chi']), cat = pick(CATS[kind]), v = Math.round(rnd() * 500000) / (rnd() < 0.2 ? 2 : 1) + 1;
      ctx.entryAddItem(date, kind, cat, v, rnd() < 0.7 ? 'n' + step : ''); L(date, kind, cat, v); log.push('add ' + date + ' ' + kind + cat + ' ' + v);
    } else if (op === 'upd'){
      var xs = allItems(); if (!xs.length) continue;
      var x = pick(xs), k2 = pick(['thu', 'chi']), c2 = pick(CATS[k2]), v2 = Math.round(rnd() * 400000) + 1;
      L(x.date, x.it.kind, x.it.catId, -ctx.num(x.it.soTien)); L(x.date, k2, c2, v2);
      ctx.entryUpdateItem(x.date, x.it.iid, v2, 'sửa', k2, c2); log.push('upd ' + x.date + ' -> ' + k2 + c2 + ' ' + v2);
    } else if (op === 'del'){
      var ys = allItems(); if (!ys.length) continue;
      var y = pick(ys); L(y.date, y.it.kind, y.it.catId, -ctx.num(y.it.soTien));
      ctx.entryDeleteItem(y.date, y.it.iid); log.push('del ' + y.date);
    } else if (op === 'ref'){
      var sy = pick(SYS), vr = Math.round(rnd() * 900000) + 1000 + (rnd() < 0.3 ? 0.3333 : 0), loan = 'L' + (nLoan++ % 3);
      ctx.journalAddRef(date, loan, sy[0], vr, 'ref ' + step, { ky: step }); L(date, sy[1], sy[0], vr); log.push('ref ' + date + ' ' + loan + sy[0] + ' ' + vr);
    } else if (op === 'rmref'){
      var loan2 = 'L' + Math.floor(rnd() * 3);
      var gone = ctx.journalRemoveRefs(loan2, null, null);
      gone.forEach(function(g){ var m = ctx.REF_MAP[g.loai]; L(g.date, m.kind, m.cat, -g.soTien); }); log.push('rmref ' + loan2 + ' x' + gone.length);
    } else if (op === 'upsert'){
      var sy2 = pick([['choVay', 'chi'], ['nhanTienVay', 'thu']]), loan3 = 'U' + Math.floor(rnd() * 2), vu = Math.round(rnd() * 800000) + 1;
      Object.keys(so.journal).forEach(function(dt){ (so.journal[dt].refs || []).forEach(function(r){ if (r.loanId === loan3 && r.loai === sy2[0]) L(dt, sy2[1], sy2[0], -ctx.num(r.soTien)); }); });
      ctx.journalUpsertRef(date, loan3, sy2[0], vu, 'up'); L(date, sy2[1], sy2[0], vu); log.push('upsert ' + date + ' ' + loan3 + sy2[0] + ' ' + vu);
    } else if (op === 'form'){
      ctx.state.editingDate = null;
      var nh = {}, any = false;
      ['luong'].forEach(function(c){ if (rnd() < 0.5){ nh['thu|' + c] = Math.round(rnd() * 900000) + 1; } });
      ['an', 'xang', 'traNo'].forEach(function(c){ if (rnd() < 0.5){ nh['chi|' + c] = Math.round(rnd() * 900000) + 1; } });
      Object.keys(nh).forEach(function(k){ var pr = k.split('|'); L(date, pr[0], pr[1], nh[k]); any = true; });
      voiForm(date, nh, false); log.push('form ' + date + ' ' + JSON.stringify(nh));
    } else if (op === 'formEdit'){
      if (!so.journal[date]) continue;
      ctx.state.editingDate = date;
      var nh2 = {};
      ['thu|luong', 'chi|an', 'chi|xang', 'chi|traNo'].forEach(function(k){ if (rnd() < 0.6) nh2[k] = Math.round(rnd() * 900000) + 1; });
      // sửa ngày: số mới của từng ô (+ phần khóa của refs) THAY cho tổng cũ của danh mục đó
      ['thu', 'chi'].forEach(function(kind){
        so.categories[kind].forEach(function(c){
          var ref = ctx.entryRefSum(so.journal[date], kind, c.id), moi = ctx.num(nh2[kind + '|' + c.id]) + ref;
          var cu = ((ledger[date] || { thu:{}, chi:{} })[kind][c.id] || 0);
          L(date, kind, c.id, moi - cu);
        });
      });
      voiForm(date, nh2, true); ctx.state.editingDate = null; log.push('formEdit ' + date + ' ' + JSON.stringify(nh2));
    } else if (op === 'delDay'){
      var e = so.journal[date];
      if (!e || (e.refs || []).length) continue;
      ctx.handleSoTayAction('delDay', elAct({ 'data-date': date })); delete ledger[date]; log.push('delDay ' + date);
    }
    kiem(step + ':' + op);
  }
  setToday('2026-10-01');
}
test('Fuzz 150 chuỗi × 40 thao tác (thêm/sửa/xóa dòng, gắn/gỡ ref, form đầy đủ, sửa ngày, xóa ngày): thu/chi luôn = items + refs = sổ cái', function(){
  var t0 = ctx.toast, x0 = ctx.xacNhan;
  ctx.toast = function(){};
  try{
    for (var seed = 1; seed <= 150; seed++) tinhFuzz(seed);
  } finally { ctx.toast = t0; ctx.xacNhan = x0; ctx.state.editingDate = null; }
});

test('Form đầy đủ vào ngày ĐÃ CÓ dòng: thêm đúng phần mới, phần cũ giữ nguyên; phần thu mới đi vào items', function(){
  var d = baseData();
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }];
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }];
  loadData(d); setToday('2026-10-10');
  ctx.entryAddItem('2026-10-08', 'chi', 'an', 100000, 'Cơm');
  ctx.state.editingDate = null;
  var t0 = ctx.toast; ctx.toast = function(){};
  try{
    voiDom({ f_date:{ value:'2026-10-08' }, f_ghichu:{ value:'thu nợ' } },
      { '.f_thu': [ oNhap('luong', '300000') ], '.f_chi': [ oNhap('an', '50000') ] },
      function(){ ctx.handleSoTayAction('saveEntry', { _daBaoAm: true }); });
  } finally { ctx.toast = t0; }
  var e = ctx.state.data.journal['2026-10-08'];
  eq(ctx.num(e.chi.an), 150000, 'Ăn = 100k cũ + 50k mới'); eq(ctx.num(e.thu.luong), 300000, 'lương = 300k');
  eq(ctx.entryItems(e).filter(function(it){ return it.catId === 'luong'; }).length, 1, 'lương thành 1 dòng items');
  eq(ctx.entryItems(e).filter(function(it){ return it.catId === 'an'; }).length, 2, 'Ăn có 2 dòng');
  eq(ctx.journalKiemTra().length, 0);
  setToday('2026-10-01');
});

/* ==================================================================== */
group('CV. Vòng đời khoản cho vay: thu thực tế / xóa nợ / hoàn lại / xóa ngày — fuzz bất biến');

function fuzzChoVay(seed){
  var a = seed >>> 0;
  var rnd = function(){ a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  var pick = function(arr){ return arr[Math.floor(rnd() * arr.length)]; };
  var DATES = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'];
  var d = baseData();
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'thuHoiChoVay', ten:'TH', chiTieu:0 }];
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }, { id:'choVay', ten:'CV', chiTieu:0 }];
  d.vayNo.choVay = [{ id:'cv1', ten:'A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01' }];
  loadData(d); setToday('2026-10-05');
  var c = ctx.state.data.vayNo.choVay[0], log = [];
  var sumThuRefs = function(){
    var s = 0;
    Object.keys(ctx.state.data.journal).forEach(function(dt){
      (ctx.state.data.journal[dt].refs || []).forEach(function(r){ if (r.loai === 'thuHoiChoVay' && r.loanId === 'cv1') s += ctx.num(r.soTien); });
    });
    return s;
  };
  var kiem = function(op){
    var cl = ctx.conLaiPhaiThu(c), tag = 'seed ' + seed + ' sau [' + log.join(' > ') + ']: ';
    ok(cl >= 0, tag + 'còn phải thu âm ' + cl);
    near(c.daThu, sumThuRefs(), 0.01, tag + 'daThu khác tổng ref thu hồi trong Sổ tay');
    eq(c.trangThai === 'da_thu_du', !!c.tatToan || cl <= 0.01, tag + 'trạng thái không khớp (' + c.trangThai + ', còn ' + cl + ')');
    near(ctx.phaiThuTaiNgay(c, '2026-10-05'), cl, 0.01, tag + 'tài sản ròng theo ngày khác còn phải thu');
    if (c.tatToan) near(c.daThu + ctx.tongDaBo(c) + ctx.num(c.tatToan.soTien), c.soTien, 0.01, tag + 'khoản đã đóng nhưng thu + xóa nợ + phần tất toán ≠ số cho vay (tiền bị mất dấu)');
    eq(ctx.journalKiemTra().length, 0, tag + 'sổ cái lệch');
  };
  for (var i = 0; i < 25; i++){
    var cl = ctx.conLaiPhaiThu(c), op = pick(['thuMot', 'thuDu', 'tatToan', 'xoaMot', 'xoaHet', 'hoanXoa', 'huyXoaHet', 'xoaNgay']);
    if (op === 'thuMot' && cl > 2){ var x = Math.max(1, Math.floor(cl * (0.1 + rnd() * 0.7))); log.push('thuMot ' + x); ctx.choVayGhiThu(c, x, pick(DATES), '', false); }
    else if (op === 'thuDu' && cl > 0.01){ log.push('thuDu ' + cl); ctx.choVayGhiThu(c, cl, pick(DATES), '', false); }
    else if (op === 'tatToan' && cl > 2){ var y = Math.max(1, Math.floor(cl * rnd() * 0.9)); log.push('tatToan ' + y); ctx.choVayGhiThu(c, y, pick(DATES), '', true); }
    else if (op === 'xoaMot' && cl > 2){ var z = Math.max(1, Math.floor(cl * (0.1 + rnd() * 0.7))); log.push('xoaMot ' + z); ctx.choVayBoMotPhan(c, z); c.trangThai = ctx.conLaiPhaiThu(c) <= 0.01 ? 'da_thu_du' : 'dang_cho'; }
    else if (op === 'xoaHet' && cl > 0.01){ log.push('xoaHet'); c.tatToan = { soTien: cl, ngay: '2026-10-05' }; c.trangThai = 'da_thu_du'; }
    else if (op === 'hoanXoa'){ log.push('hoanXoa'); ctx.choVayHoanBo(c); }
    else if (op === 'huyXoaHet' && c.tatToan){ log.push('huyXoaHet'); c.tatToan = null; c.trangThai = ctx.conLaiPhaiThu(c) <= 0.01 ? 'da_thu_du' : 'dang_cho'; }
    else if (op === 'xoaNgay'){
      var ngay = Object.keys(ctx.state.data.journal).filter(function(dt){ return (ctx.state.data.journal[dt].refs || []).some(function(r){ return r.loai === 'thuHoiChoVay'; }); });
      if (!ngay.length) continue;
      var dn = pick(ngay); log.push('xoaNgay ' + dn);
      (ctx.state.data.journal[dn].refs || []).forEach(function(r){ ctx.loanRevertRef(r); });
      delete ctx.state.data.journal[dn];
    } else continue;
    ctx.invalidateBalanceCache();
    kiem();
  }
}
test('Fuzz 300 chuỗi × 25 thao tác trên khoản cho vay: còn phải thu ≥ 0, daThu = tổng ref thu hồi, trạng thái khớp, tài sản ròng = còn phải thu, sổ cái khớp', function(){
  for (var seed = 1; seed <= 300; seed++) fuzzChoVay(seed);
  setToday('2026-10-01');
});

test('Cho vay: xóa ngày thu ở Sổ tay khi khoản đã tất toán -> khoản mở lại, không mất dấu tiền (hồi quy từ fuzz)', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01' }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  ctx.choVayGhiThu(c, 600000, '2026-12-09', '', true);       // thu 600k, phần thiếu 400k xóa nợ -> đóng
  eq(c.trangThai, 'da_thu_du'); eq(c.tatToan.soTien, 400000);
  var e = ctx.state.data.journal['2026-12-09'];
  e.refs.forEach(function(r){ ctx.loanRevertRef(r); }); delete ctx.state.data.journal['2026-12-09'];
  eq(c.daThu, 0, 'hoàn lại số đã thu'); eq(c.tatToan, null, 'phần xóa nợ cũ không còn đúng số -> bỏ');
  eq(c.trangThai, 'dang_cho', 'khoản mở lại'); eq(ctx.conLaiPhaiThu(c), 1000000, 'còn phải thu = cả khoản');
});

test('Cho vay: sửa số cho vay — có lời nhắc khi đổi tình trạng khoản; đổi tên/ngày thì không hỏi; trạng thái luôn tính lại', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [
    { id:'cv1', ten:'A', soTien:500000, daThu:500000, trangThai:'da_thu_du', ngayChoVay:'2026-10-01', ngayDuKienThu:'' },
    { id:'cv2', ten:'B', soTien:1000000, daThu:300000, trangThai:'dang_cho', ngayChoVay:'2026-10-01' },
    { id:'cv3', ten:'C', soTien:1000000, daThu:600000, trangThai:'da_thu_du', ngayChoVay:'2026-10-01', tatToan:{ soTien:400000, ngay:'2026-11-01' } }
  ];
  loadData(d);
  var cv = ctx.state.data.vayNo.choVay;
  var n1 = ctx.canhBaoSuaChoVay(cv[0], 800000);
  ok(n1.indexOf('mở lại') >= 0 && n1.indexOf('300.000') >= 0, 'đã thu đủ rồi tăng số: nhắc khoản mở lại, còn 300.000: ' + n1);
  var n2 = ctx.canhBaoSuaChoVay(cv[1], 200000);
  ok(n2.indexOf('đóng') >= 0 && n2.indexOf('thu vượt') >= 0, 'giảm xuống dưới số đã thu: nhắc đóng + thu vượt: ' + n2);
  var n2b = ctx.canhBaoSuaChoVay(cv[1], 300000);
  ok(n2b.indexOf('đóng') >= 0 && n2b.indexOf('thu vượt') < 0, 'giảm đúng bằng số đã thu: nhắc đóng, không phải thu vượt: ' + n2b);
  var n3 = ctx.canhBaoSuaChoVay(cv[2], 1200000);
  ok(n3.indexOf('Hủy xóa nợ') >= 0 && n3.indexOf('400.000') >= 0, 'khoản đã xóa nợ: nhắc phần xóa nợ không tự đổi: ' + n3);
  eq(ctx.canhBaoSuaChoVay(cv[1], 1000000), '', 'số không đổi thì không nhắc');
  eq(ctx.canhBaoSuaChoVay(cv[1], 900000), '', 'đổi số nhưng khoản vẫn mở, chưa thu vượt thì không nhắc');
  // đổi số xong thì trạng thái tính lại
  cv[0].soTien = 800000; ctx.choVayCapNhatTrangThai(cv[0]);
  eq(cv[0].trangThai, 'dang_cho', 'mở lại'); eq(ctx.choVayDaXong(cv[0]), false, 'không còn trong Đã xong');
  cv[0].soTien = 500000; ctx.choVayCapNhatTrangThai(cv[0]);
  eq(cv[0].trangThai, 'da_thu_du', 'đóng lại'); eq(ctx.choVayDaXong(cv[0]), true);
  // sửa tên (số không đổi): lưu thẳng, không hỏi
  var t0 = ctx.toast, hoi = 0, x0 = ctx.xacNhan; ctx.toast = function(){}; ctx.xacNhan = function(){ hoi++; return Promise.resolve(true); };
  try{
    ctx.state.vnFormId = 'cv2';
    voiDom({ vn_cv_ten:{ value:'B mới' }, vn_cv_soTien:{ value:'1000000' }, vn_cv_ngay:{ value:'2026-10-01' }, vn_cv_ngayThu:{ value:'' }, vn_cv_wallet:null },
      null, function(){ ctx.handleVayNoAction('vnSaveChoVay', {}); });
    eq(hoi, 0, 'sửa tên không hỏi'); eq(cv[1].ten, 'B mới', 'đã lưu ngay');
  } finally { ctx.toast = t0; ctx.xacNhan = x0; ctx.state.vnFormId = null; }
});

test('normalizeData: daBo có mục hỏng (số âm, không phải số, null) thì bỏ, còn phải thu không bị đội lên', function(){
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01',
                      daBo:[{ soTien:-300000, ngay:'2026-11-01' }, null, { soTien:'abc' }, { soTien:200000, ngay:'2026-11-02' }] }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  eq(c.daBo.length, 1, 'chỉ còn mục hợp lệ'); eq(ctx.conLaiPhaiThu(c), 800000, '1.000.000 − 200.000');
});

test('Cho vay: Hủy xóa nợ (khoản đã tất toán có thu) -> còn phải thu = số cho vay − đã thu − xóa nợ một phần', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [{ id:'cv1', ten:'A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', daBo:[{ soTien:100000, ngay:'2026-11-01' }] }];
  loadData(d);
  var c = ctx.state.data.vayNo.choVay[0];
  ctx.choVayGhiThu(c, 400000, '2026-12-09', '', true);    // còn 900k, thu 400k, xóa nợ 500k, đóng
  eq(c.tatToan.soTien, 500000);
  eq(ctx.choVayHuyXoaNo(c), true, 'hủy được');
  eq(ctx.choVayHuyXoaNo(c), false, 'không còn gì để hủy');
  eq(c.tatToan, null); eq(c.trangThai, 'dang_cho'); eq(ctx.conLaiPhaiThu(c), 500000, '1.000.000 − 400.000 − 100.000');
});

/* ==================================================================== */
group('IMG. Ảnh nền được tham chiếu trong CSS phải tồn tại');
test('mọi url(img/...) trong style.css trỏ tới file có thật (nền họa tiết, ảnh đầu màn đăng nhập)', function(){
  var root = path.join(__dirname, '..');
  var css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  var dung = {}, re = /url\(\s*['"]?(img\/[^)'"\s]+)['"]?\s*\)/g, m;
  while ((m = re.exec(css))) dung[m[1]] = 1;
  var ds = Object.keys(dung);
  ok(ds.length >= 3, 'phải có ít nhất 3 ảnh nền (nen-sang, nen-toi, dau-man), thấy ' + ds.length);
  ds.forEach(function(f){
    ok(fs.existsSync(path.join(root, f)), 'thiếu file ' + f);
    ok(fs.statSync(path.join(root, f)).size < 200 * 1024, f + ' nặng quá 200KB (nền không nên nặng)');
  });
});

/* ==================================================================== */
group('UI. Ô tiền thông minh (ui.js)');
var uiCtx = (function(){
  var c = { console: console, Math: Math, Date: Date, JSON: JSON, Object: Object, Array: Array, Number: Number, String: String,
    parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN, setTimeout: function(){ return 0; }, clearTimeout: function(){},
    document: { addEventListener: function(){}, getElementById: function(){ return null; }, documentElement: { setAttribute: function(){} } },
    window: {}, localStorage: { getItem: function(){ return null; }, setItem: function(){} }, icon: function(){ return ''; }, esc: function(x){ return x; } };
  c.globalThis = c; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, 'ui.js'), 'utf8'), c, { filename: 'ui.js' });
  return c;
})();

test('docSo: phép tính, k / tr, số thường và số âm', function(){
  var d = uiCtx.docSo;
  eq(d('45.000+30.000'), 75000); eq(d('120k'), 120000); eq(d('1,5tr'), 1500000); eq(d('2tr-300k'), 1700000);
  eq(d('50k*3'), 150000); eq(d('50k×3'), 150000); eq(d('100.000/4'), 25000); eq(d('10+5*2'), 20, 'nhân trước cộng sau');
  eq(d('1.800.000'), 1800000); eq(d('-50.000'), -50000, 'dấu trừ đầu là số âm'); eq(d(''), 0); eq(d(1234), 1234);
  eq(d('45.000+'), 45000, 'đang gõ dở (dấu + cuối) không ra số rác');
});

test('tinhBieuThucTien: sai cú pháp / chia 0 trả null', function(){
  eq(uiCtx.tinhBieuThucTien('abc'), null); eq(uiCtx.tinhBieuThucTien('5/0'), null); eq(uiCtx.tinhBieuThucTien('*5'), null);
});

test('dinhDangOTien: đang gõ phép tính thì giữ toán tử, chấm nghìn từng số', function(){
  var el = { value: '45000+3000', selectionStart: 10, selectionEnd: 10, setSelectionRange: function(){} };
  uiCtx.dinhDangOTien(el); eq(el.value, '45.000+3.000');
  el.value = '45000+'; el.selectionStart = 6; uiCtx.dinhDangOTien(el); eq(el.value, '45.000+');
  el.value = '1500000'; el.selectionStart = 7; uiCtx.dinhDangOTien(el); eq(el.value, '1.500.000');
});

test('qaGoiYGhiChu: ghi chú hay dùng nhất của danh mục, bỏ "(chưa chi tiết)"', function(){
  loadData(baseData({ journal: {
    '2026-09-20': { thu:{}, chi:{ an: 150000 }, ghiChu:'', items:[
      { iid:'a', kind:'chi', catId:'an', soTien:50000, ghiChu:'Phở' }, { iid:'b', kind:'chi', catId:'an', soTien:50000, ghiChu:'Cơm' },
      { iid:'c', kind:'chi', catId:'an', soTien:50000, ghiChu:'Phở' } ] },
    '2026-09-21': { thu:{}, chi:{ an: 30000 }, ghiChu:'', items:[ { iid:'d', kind:'chi', catId:'an', soTien:30000, ghiChu:'(chưa chi tiết)' } ] } } }));
  setToday('2026-10-01');
  var g = ctx.qaGoiYGhiChu('chi', 'an');
  eq(g.join('|'), 'Phở|Cơm');
});

/* ==================================================================== */
console.log('\n' + '='.repeat(60));
console.log('KẾT QUẢ: ' + pass + ' pass, ' + fail + ' fail');
if (fail){
  console.log('\nCác test fail:');
  failures.forEach(function(f){ console.log('  - ' + f.name + ': ' + f.msg); });
}
console.log('='.repeat(60));
process.exit(fail ? 1 : 0);
