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

['state.js', 'lock.js', 'drive-sync.js', 'amlich.js', 'vayno-tinh.js', 'qr.js', 'vayno.js', 'dongtien.js', 'sotay.js', 'bieudo.js', 'nhan.js', 'nhachan.js', 'doisoat.js', 'thetindung.js', 'lich.js', 'nguoi.js', 'nhap.js', 'danhmuc.js', 'ngansach.js', 'mophong.js', 'theongay.js', 'tongket.js', 'congcu.js', 'giocong.js', 'ngaytudo.js', 'tet.js', 'loihua.js', 'somung.js', 'dodac.js', 'ht.js', 'tim.js', 'canhbao.js', 'chuong.js', 'hienthi.js', 'diemnhan.js', 'phienban.js'].forEach(function(f){
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
// test async: xếp hàng, chạy tuần tự SAU mọi test thường (mỗi test tự dựng dữ liệu của nó), có chờ Promise và báo lỗi đúng chỗ
var hangDoiAsync = [];
function testAsync(name, fn){ hangDoiAsync.push({ name: name, fn: fn }); }
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
  near(sch[0].lai, goc * 10/12/100, 1, 'lãi kỳ đầu (đã làm tròn về đồng)');
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
group('7b. Dự báo đồng bộ: dtSuggest (hàng Dòng tiền) ≡ duTruDanhMucThang (tổng, tích lũy, Mô phỏng)');

// Hai hàm này từng được viết thành 2 bản song song (dongtien.js và vayno-tinh.js) nên có lúc lệch nhau:
// hàng từng danh mục báo một số, còn Tiền vào − ra và dòng tiền tích lũy tính một số khác.
function dkFix(o){
  var ky = o.ky || [{ tuMk: '2026-07', soTien: o.soTien }];
  return { id: 'dk' + (o.catId || 'x') + (o.kind || 'chi'), ten: 'x', kind: 'chi', catId: 'an', soTien: o.soTien, ngay: 5, bat: true, bo: [], duBao: true, ky: ky, ...o };
}
function jr(thu, chi){ return { thu: thu || {}, chi: chi || {}, ghiChu: '', refs: [] }; }
// mỗi kịch bản sửa dữ liệu nền (hôm nay 15/10/2026, sổ bắt đầu 01/07/2026)
var DB_KB = {
  'trống': function(d){},
  'cho vay + nhận vay ghi ở ngày tương lai': function(d){ d.journal['2026-12-20'] = jr({}, {choVay: 5000000}); d.journal['2027-01-05'] = jr({nhanTienVay: 8000000}, {}); },
  'TB ăn 3 tháng + lương cố định theo hạn mức': function(d){
    d.journal['2026-08-10'] = jr({}, {an: 3000000}); d.journal['2026-09-10'] = jr({}, {an: 6000000});
    d.categories.thu[0].chiTieu = 15000000; d.categories.thu[0].coDinhChiTieu = true; },
  'định kỳ lương bật dự báo + kỳ dừng + tháng bỏ qua': function(d){
    d.categories.thu[0].chiTieu = 1;
    d.dinhKy = [dkFix({ kind: 'thu', catId: 'luong', soTien: 20000000, ky: [{ tuMk: '2026-07', soTien: 20000000 }, { tuMk: '2027-01', soTien: 0 }], bo: ['2026-12'] })]; },
  'định kỳ chi Ăn bật dự báo + đã ghi tay tháng này': function(d){
    d.categories.chi[0].chiTieu = 2000000; d.dinhKy = [dkFix({ kind: 'chi', catId: 'an', soTien: 2000000 })]; d.journal['2026-10-03'] = jr({}, {an: 700000}); },
  'định kỳ chỉ để nhắc (không bật dự báo)': function(d){
    d.dinhKy = [dkFix({ kind: 'chi', catId: 'an', soTien: 500000, duBao: false })]; d.journal['2026-09-10'] = jr({}, {an: 3000000}); },
  'khoản vay phải trả + cho vay có hẹn thu': function(d){
    d.vayNo = { choVay: [{ id: 'cv', ten: 'A', soTien: 3000000, daThu: 0, ngayChoVay: '2026-10-05', ngayDuKienThu: '2026-12-15', trangThai: 'dang_cho' }],
      vayNoPhaiTra: [{ id: 'vn1', ten: 'V', loaiVay: 'ngan_hang', hinhThuc: 'khong_lai', soTienGoc: 3000000, soThangVay: 3, ngayVay: '2026-10-01', ngayTraHangThang: 5, traNo: [], trangThai: 'dang_vay' }] }; },
  'khongDuTru thường + cố định theo hạn mức (0 và >0)': function(d){
    d.categories.chi.push({ id: 'xe', ten: 'Xe', chiTieu: 0, khongDuTru: true }, { id: 'net', ten: 'Net', chiTieu: 0, coDinhChiTieu: true }, { id: 'nha', ten: 'Nhà', chiTieu: 4000000, coDinhChiTieu: true });
    d.journal['2026-09-02'] = jr({}, {xe: 9000000}); },
  'khoản ghi trước ngày tương lai ở danh mục thường + khongDuTru': function(d){
    d.categories.chi.push({ id: 'xe', ten: 'Xe', chiTieu: 0, khongDuTru: true }); d.journal['2026-12-02'] = jr({}, {xe: 9000000, an: 1000000}); },
  'định kỳ trỏ vào danh mục đã bị xóa (mồ côi) + danh mục còn sống': function(d){
    d.dinhKy = [dkFix({ kind: 'chi', catId: 'daXoa', soTien: 1000000, duBao: false }), dkFix({ kind: 'thu', catId: 'daXoa2', soTien: 2000000, duBao: true }), dkFix({ kind: 'chi', catId: 'an', soTien: 300000, duBao: false })]; },
  'giao dịch ghi trước cho cuối THÁNG NÀY (cho vay + nhận vay)': function(d){ d.journal['2026-10-25'] = jr({}, {choVay: 5000000}); d.journal['2026-10-28'] = jr({nhanTienVay: 8000000}, {}); }
};
function dbNap(ten){
  setToday('2026-10-15');
  var d = baseData(); d.settings = { soDuDauKy: 0, ngayBatDau: '2026-07-01', thangBatDauDuTru: '2026-07' };
  DB_KB[ten](d); loadData(d);
  var cats = [];
  ['thu', 'chi'].forEach(function(k){ ctx.state.data.categories[k].forEach(function(c){ cats.push([k, c.id]); }); });
  return cats;
}
var DB_THANG_TUONG_LAI = ['2026-11', '2026-12', '2027-01', '2027-02'];

test('BẤT BIẾN 1: từng danh mục, tháng tương lai — num(dtSuggest) = duTruDanhMucThang (mọi kịch bản)', function(){
  var loi = [];
  Object.keys(DB_KB).forEach(function(ten){
    dbNap(ten).forEach(function(c){
      DB_THANG_TUONG_LAI.forEach(function(mk){
        var a = ctx.num(ctx.dtSuggest(c[0], c[1], mk)), b = ctx.duTruDanhMucThang(c[0], c[1], mk);
        if (a !== b) loi.push('[' + ten + '] ' + c[0] + '/' + c[1] + ' ' + mk + ': hàng=' + a + ' tổng=' + b);
      });
    });
  });
  setToday('2026-10-01');
  ok(!loi.length, loi.join(' | '));
});

test('BẤT BIẾN 2: tổng các hàng = thẻ Thu / Chi dự kiến (tháng tương lai dùng dtSuggest, tháng này dùng dtCell)', function(){
  var loi = [];
  Object.keys(DB_KB).forEach(function(ten){
    var cats = dbNap(ten);
    ['2026-10'].concat(DB_THANG_TUONG_LAI).forEach(function(mk){
      var cur = mk === '2026-10', sT = 0, sC = 0;
      cats.forEach(function(c){
        var v = ctx.num(cur ? ctx.dtCell(c[0], c[1], mk) : ctx.dtSuggest(c[0], c[1], mk));
        if (c[0] === 'thu') sT += v; else sC += v;
      });
      var cT = ctx.tongThuThangCard(mk), cC = ctx.tongChiThangCard(mk);
      if (Math.abs(sT - cT) > 0.5) loi.push('[' + ten + '] thu ' + mk + ': hàng=' + sT + ' thẻ=' + cT);
      if (Math.abs(sC - cC) > 0.5) loi.push('[' + ten + '] chi ' + mk + ': hàng=' + sC + ' thẻ=' + cC);
    });
  });
  setToday('2026-10-01');
  ok(!loi.length, loi.join(' | '));
});

test('Cho vay ghi ở ngày tương lai: dòng "Cho vay" của tháng đó = số đã ghi, và Tiền vào − ra đã gồm số đó', function(){
  dbNap('cho vay + nhận vay ghi ở ngày tương lai');
  var d = ctx.dtThangDuLieu('2026-12');
  eq(d.choVay, 5000000, 'dòng Cho vay');
  eq(d.cb, d.thuDK - d.chiDK, 'cân đối khớp thẻ');
  ok(d.chiDK >= 5000000, 'chi dự kiến đã gồm 5tr cho vay');
  setToday('2026-10-01');
});

test('Nhận vay ghi ở ngày tương lai: dòng "Vay thêm" của tháng đó = số đã ghi', function(){
  dbNap('cho vay + nhận vay ghi ở ngày tương lai');
  var d = ctx.dtThangDuLieu('2027-01');
  eq(d.vayThem, 8000000, 'vay thêm');
  ok(d.thuDK >= 8000000, 'thu dự kiến đã gồm 8tr nhận vay');
  setToday('2026-10-01');
});

test('Cho vay / nhận vay KHÔNG ghi ở tháng đó thì vẫn không đoán (0), không lấy tháng khác', function(){
  dbNap('cho vay + nhận vay ghi ở ngày tương lai');
  eq(ctx.num(ctx.dtSuggest('chi', 'choVay', '2026-11')), 0, 'T11 không có ghi');
  eq(ctx.num(ctx.dtSuggest('chi', 'choVay', '2027-02')), 0, 'T2 không có ghi');
  eq(ctx.duTruDanhMucThang('chi', 'choVay', '2026-11'), 0, 'tổng T11');
  setToday('2026-10-01');
});

test('dtSuggest giữ nghĩa null = "không có gợi ý" (màn hiện "—") ở các trường hợp cũ', function(){
  dbNap('khongDuTru thường + cố định theo hạn mức (0 và >0)');
  eq(ctx.dtSuggest('chi', 'xe', '2026-12'), null, 'khongDuTru, tháng đó không có ghi trước');
  eq(ctx.dtSuggest('chi', 'net', '2026-12'), null, 'cố định theo hạn mức nhưng hạn mức = 0');
  eq(ctx.dtSuggest('chi', 'nha', '2026-12'), 4000000, 'cố định theo hạn mức = hạn mức');
  eq(ctx.dtSuggest('chi', 'traNo', '2026-12'), null, 'không có khoản vay nào');
  setToday('2026-10-15');   // sổ mới bắt đầu T10: chưa có tháng hoàn chỉnh nào, danh mục chưa có hạn mức
  loadData(baseData());
  eq(ctx.dtSuggest('chi', 'an', '2026-12'), null, 'chưa có lịch sử và chưa có hạn mức');
  setToday('2026-10-01');
});

test('dtSuggest: có lịch sử nhưng TB = 0 thì trả 0 (không phải null) — giữ nguyên hành vi hiện tại', function(){
  setToday('2026-10-15');
  var d = baseData(); d.settings = { soDuDauKy: 0, ngayBatDau: '2026-07-01', thangBatDauDuTru: '2026-07' };
  loadData(d);
  eq(ctx.dtSuggest('chi', 'an', '2026-12'), 0, 'có 3 tháng hoàn chỉnh, không chi gì -> 0');
  setToday('2026-10-01');
});

test('Định kỳ bật dự báo: kỳ dừng (0) và tháng bỏ qua trả 0 chứ không rơi về ước lượng — cả hai hàm cùng số', function(){
  dbNap('định kỳ lương bật dự báo + kỳ dừng + tháng bỏ qua');
  eq(ctx.dtSuggest('thu', 'luong', '2026-11'), 20000000, 'T11 theo kỳ');
  eq(ctx.dtSuggest('thu', 'luong', '2026-12'), 0, 'T12 bỏ qua');
  eq(ctx.dtSuggest('thu', 'luong', '2027-01'), 0, 'T1 kỳ dừng');
  eq(ctx.duTruDanhMucThang('thu', 'luong', '2026-12'), 0, 'tổng T12');
  eq(ctx.duTruDanhMucThang('thu', 'luong', '2027-01'), 0, 'tổng T1');
  setToday('2026-10-01');
});

test('Trả nợ / thu hồi cho vay lấy từ lịch Vay - Nợ: hàng và tổng cùng số, khongDuTru không chặn', function(){
  dbNap('khoản vay phải trả + cho vay có hẹn thu');
  ['2026-11', '2026-12'].forEach(function(mk){
    eq(ctx.num(ctx.dtSuggest('chi', 'traNo', mk)), ctx.duTruDanhMucThang('chi', 'traNo', mk), 'trả nợ ' + mk);
    eq(ctx.num(ctx.dtSuggest('thu', 'thuHoiChoVay', mk)), ctx.duTruDanhMucThang('thu', 'thuHoiChoVay', mk), 'thu hồi ' + mk);
  });
  ok(ctx.duTruDanhMucThang('chi', 'traNo', '2026-11') > 0, 'có số trả nợ T11');
  ok(ctx.duTruDanhMucThang('thu', 'thuHoiChoVay', '2026-12') > 0, 'có số thu hồi T12');
  setToday('2026-10-01');
});

test('catDangDuocDinhKyDung: liệt kê khoản định kỳ đang trỏ vào danh mục (để chặn xóa danh mục)', function(){
  dbNap('định kỳ chi Ăn bật dự báo + đã ghi tay tháng này');
  eq(ctx.catDangDuocDinhKyDung('chi', 'an').length, 1, 'Ăn có 1 khoản định kỳ');
  eq(ctx.catDangDuocDinhKyDung('thu', 'luong').length, 0, 'Lương không có');
  eq(ctx.catDangDuocDinhKyDung('thu', 'an').length, 0, 'cùng id khác loại (thu/chi) không lẫn');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('7c. Cấu trúc file js: không trùng tên global, thứ tự nạp trong index.html');

// Mọi file js dùng chung global (không module). Khai báo trùng tên ở 2 file thì file nạp sau lặng lẽ đè file trước
// (từng có REF_LABEL khai báo 2 lần với 2 giá trị khác nhau). Thứ tự nạp chỉ làm hỏng được phụ thuộc LÚC NẠP
// (câu lệnh chạy ngay ở cột 0); phụ thuộc lúc chạy (gọi hàm khi bấm nút) thì lúc đó mọi file đã nạp xong.
var htmlIndex = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var jsTheoIndex = [];
htmlIndex.replace(/<script[^>]*\bsrc="js\/([^"?]+\.js)/g, function(_, f){ jsTheoIndex.push(f); return _; });
var jsTrenDia = fs.readdirSync(JS_DIR).filter(function(f){ return /\.js$/.test(f); });
function khaiBaoCot0(src){
  var out = [];
  src.split('\n').forEach(function(l, i){
    var m = l.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/) || l.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)/);
    if (m) out.push({ ten: m[1], dong: i + 1 });
  });
  return out;
}

test('mọi file trong js/ đều được index.html nạp, và mọi script js/ trong index.html đều tồn tại', function(){
  var thieu = jsTrenDia.filter(function(f){ return jsTheoIndex.indexOf(f) < 0; });
  var thua = jsTheoIndex.filter(function(f){ return jsTrenDia.indexOf(f) < 0; });
  eq(thieu.join(','), '', 'file có trong js/ nhưng index.html không nạp');
  eq(thua.join(','), '', 'index.html nạp file không tồn tại');
  eq(jsTheoIndex.length, new Set(jsTheoIndex).size, 'có file nạp 2 lần');
});

test('không có tên khai báo ở cột 0 trùng giữa các file js (file nạp sau sẽ đè file trước)', function(){
  var thay = {}, trung = [];
  jsTheoIndex.forEach(function(f){
    khaiBaoCot0(fs.readFileSync(path.join(JS_DIR, f), 'utf8')).forEach(function(d){
      (thay[d.ten] = thay[d.ten] || []).push(f + ':' + d.dong);
    });
  });
  Object.keys(thay).forEach(function(k){ if (thay[k].length > 1) trung.push(k + ' → ' + thay[k].join(' ; ')); });
  ok(!trung.length, trung.join(' | '));
});

test('nạp đủ các file đúng thứ tự index.html vào môi trường trống: không ReferenceError lúc nạp', function(){
  // proxy "gì cũng được" thay cho DOM / API trình duyệt: chỉ để câu lệnh cột 0 chạy được, không kiểm hành vi
  function U(){ var f = function(){ return U(); }; return new Proxy(f, { get: function(t, k){ return k === Symbol.toPrimitive ? function(){ return ''; } : (k === 'length' ? 0 : (k === 'then' ? undefined : U())); }, set: function(){ return true; }, apply: function(){ return U(); }, construct: function(){ return U(); }, has: function(){ return true; } }); }
  var c = {
    console: console, Math: Math, Date: Date, JSON: JSON, Object: Object, Array: Array, Number: Number, String: String, Boolean: Boolean, RegExp: RegExp,
    Error: Error, Promise: Promise, Map: Map, Set: Set, Symbol: Symbol, Intl: Intl, URL: URL, TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    Uint8Array: Uint8Array, ArrayBuffer: ArrayBuffer, parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN, isFinite: isFinite,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, escape: escape, unescape: unescape,
    setTimeout: function(){ return 0; }, clearTimeout: function(){}, setInterval: function(){ return 0; }, clearInterval: function(){}, requestAnimationFrame: function(){ return 0; },
    document: U(), window: U(), navigator: U(), location: U(), history: U(), screen: U(), crypto: U(), matchMedia: function(){ return U(); },
    localStorage: { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} },
    sessionStorage: { getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){} },
    XLSX: {}, Blob: function(){}, File: function(){}, FileReader: function(){}, XMLHttpRequest: function(){},
    fetch: function(){ return new Promise(function(){}); },     // không bao giờ xong: khỏi lỗi promise rơi ra ngoài test
    MutationObserver: function(){ return U(); }, IntersectionObserver: function(){ return U(); }, ResizeObserver: function(){ return U(); },
    alert: function(){}, confirm: function(){ return true; }, prompt: function(){ return null; }
  };
  c.globalThis = c; vm.createContext(c);
  var chuSoHuu = {};
  jsTheoIndex.forEach(function(f){ khaiBaoCot0(fs.readFileSync(path.join(JS_DIR, f), 'utf8')).forEach(function(d){ if (!chuSoHuu[d.ten]) chuSoHuu[d.ten] = f; }); });
  jsTheoIndex.forEach(function(f, i){
    try{ vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), c, { filename: f }); }
    catch(e){
      var m = String(e.message).match(/^(\w+) is not defined/), goiY = '';
      if (m && chuSoHuu[m[1]] && jsTheoIndex.indexOf(chuSoHuu[m[1]]) > i) goiY = ' — "' + m[1] + '" khai báo ở ' + chuSoHuu[m[1]] + ' nhưng index.html nạp file đó SAU ' + f;
      throw new Error(f + ' lỗi lúc nạp: ' + e.message + goiY);
    }
  });
});

/* ==================================================================== */
group('7d. Bất biến giữa các cài đặt song song: cùng một con số tính ở 2 nơi phải bằng nhau');

// Hồ sơ ngẫu nhiên (seed cố định) gồm danh mục thường, chi cố định, "không tính dự kiến", danh mục hệ thống và cả khoản ghi trước
// cho ngày sau hôm nay. Mỗi bất biến so 2 hàm độc lập cùng trả một đại lượng: lệch là có 1 trong 2 nơi đã trôi.
function dbHoSoNgauNhien(seed, coTuongLai){
  var s = seed >>> 0, r = function(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  var d = baseData(); d.settings = { soDuDauKy: Math.round(r() * 5e6), ngayBatDau: '2026-07-01', thangBatDauDuTru: '2026-07' };
  d.categories = { thu: [{ id: 'luong', ten: 'Lương', chiTieu: 0 }], chi: [
    { id: 'an', ten: 'Ăn', chiTieu: r() < 0.8 ? 3000000 : 0 }, { id: 'xang', ten: 'Xăng', chiTieu: r() < 0.5 ? 1000000 : 0 },
    { id: 'nha', ten: 'Nhà', chiTieu: r() < 0.7 ? 4000000 : 0, khoanCoDinh: true }, { id: 'kdt', ten: 'Khác', chiTieu: 2000000, khongDuTru: true }] };
  var cats = ['an', 'xang', 'nha', 'kdt', 'choVay', 'traNo', 'dieuChinh'], thus = ['luong', 'nhanTienVay', 'thuHoiChoVay', 'dieuChinh'];
  for (var m = 7; m <= 10; m++){
    var nd = m === 10 ? (coTuongLai ? 31 : 15) : 28;
    for (var dd = 1; dd <= nd; dd++){
      if (r() < 0.55) continue;
      var e = { thu: {}, chi: {}, ghiChu: '', refs: [] }, k = 1 + Math.floor(r() * 3);
      for (var i = 0; i < k; i++){ var c = cats[Math.floor(r() * cats.length)]; e.chi[c] = (e.chi[c] || 0) + Math.round(r() * 500) * 1000; }
      if (r() < 0.2){ var t = thus[Math.floor(r() * thus.length)]; e.thu[t] = Math.round(r() * 2000) * 1000; }
      d.journal['2026-' + ctx.pad2(m) + '-' + ctx.pad2(dd)] = e;
    }
  }
  return d;
}
function dbLoiBatBien(kiem, soHoSo){
  var loi = [];
  for (var seed = 1; seed <= (soHoSo || 60); seed++){
    setToday('2026-10-15');
    var coTL = (seed % 2) === 0;
    loadData(dbHoSoNgauNhien(seed, coTL));
    kiem(seed, coTL).forEach(function(l){ loi.push('hồ sơ ' + seed + ': ' + l); });
  }
  setToday('2026-10-01');
  return loi;
}

test('Chi thật của tháng: bdThang (Sổ tay / Báo cáo) = tetChiTrong (Quỹ Tết) cho cả tháng', function(){
  var loi = dbLoiBatBien(function(){
    var o = [];
    ['2026-07', '2026-08', '2026-09'].forEach(function(mk){
      var a = ctx.bdThang(mk).tongChiThat, b = ctx.tetChiTrong(mk + '-01', mk + '-' + ctx.daysInMonth(mk)).tong;
      if (Math.abs(a - b) > 0.5) o.push(mk + ' bdThang=' + a + ' tetChiTrong=' + b);
    });
    return o;
  });
  ok(!loi.length, loi.slice(0, 3).join(' | '));
});

test('Chi thật tới ngày N: bdThang = bdUocTinhChiThang.daChi (ước tính cuối tháng ở Báo cáo)', function(){
  var loi = dbLoiBatBien(function(){
    var o = [];
    [1, 8, 15].forEach(function(den){
      var a = ctx.bdThang('2026-10', den).tongChiThat, b = ctx.bdUocTinhChiThang('2026-10', den).daChi;
      if (Math.abs(a - b) > 0.5) o.push('đến ngày ' + den + ' bdThang=' + a + ' bdUoc=' + b);
    });
    return o;
  });
  ok(!loi.length, loi.slice(0, 3).join(' | '));
});

test('Đã chi hằng ngày có hạn mức: tieuMoiNgay (Hôm nay còn tiêu được) = Σ hạn mức hằng ngày ở thẻ Hạn mức (khi chưa có khoản ghi trước)', function(){
  var loi = dbLoiBatBien(function(seed, coTL){
    if (coTL) return [];
    var tm = ctx.tieuMoiNgay('2026-10-15'), sum = 0;
    ctx.hanMucThangRows('2026-10').forEach(function(x){ if (!x.coDinh) sum += x.da; });
    var got = tm ? tm.daTruoc + tm.daHomNay : 0;
    return Math.abs(sum - got) > 0.5 ? ['tieuMoiNgay=' + got + ' hanMucThangRows=' + sum] : [];
  });
  ok(!loi.length, loi.slice(0, 3).join(' | '));
});

test('Số dư liền mạch: cuối tháng M = đầu tháng M+1', function(){
  var loi = dbLoiBatBien(function(){
    var o = [];
    ['2026-07', '2026-08', '2026-09'].forEach(function(mk){
      var a = ctx.balanceAtEndOfMonth(mk), b = ctx.balanceBeforeMonth(ctx.monthKeyAdd(mk, 1));
      if (Math.abs(a - b) > 0.5) o.push(mk + ' cuối=' + a + ' đầu sau=' + b);
    });
    return o;
  });
  ok(!loi.length, loi.slice(0, 3).join(' | '));
});

/* ==================================================================== */
group('7e. Mở bằng dữ liệu trên máy, đồng bộ Drive là nút bấm (drive-sync.js)');

// kho localStorage giả có nhớ dữ liệu (môi trường test mặc định getItem luôn trả null)
function khoGia(){ var m = {}; return { getItem: function(k){ return k in m ? m[k] : null; }, setItem: function(k, v){ m[k] = String(v); }, removeItem: function(k){ delete m[k]; } }; }
// thay tạm các hàm / biến toàn cục của ctx, trả hàm khôi phục
function thayTam(over){
  var cu = {}, keys = Object.keys(over);
  keys.forEach(function(k){ cu[k] = ctx[k]; ctx[k] = over[k]; });
  return function(){ keys.forEach(function(k){ ctx[k] = cu[k]; }); };
}
function duLieuMay(them){ var d = baseData(); d.settings.ngayBatDau = '2026-10-01'; d.journal['2026-10-05'] = { thu: {}, chi: { an: 50000 }, ghiChu: '', refs: [] }; if (them) them(d); return d; }
// các hàm Drive / giao diện giả; ghi lại thứ tự gọi vào goi
function drGia(goi, o){
  o = o || {};
  var ghi = function(ten, tra){ return function(){ goi.push(ten); return tra; }; };
  return {
    localStorage: o.kho || khoGia(), showApp: ghi('showApp'), showGate: function(m){ goi.push('showGate:' + (m || '')); }, renderAll: function(){}, renderSyncStatus: function(){},
    findFile: function(){ goi.push('findFile'); if (o.loiTim) return Promise.reject(o.loiTim); return Promise.resolve(o.file === undefined ? null : o.file); },
    driveDocText: function(){ goi.push('driveDocText'); return Promise.resolve('{}'); },
    driveLoad: function(){ goi.push('driveLoad'); return Promise.resolve(o.taiOk !== false); },
    driveSave: function(){ goi.push('driveSave'); return Promise.resolve(); },
    checkLocalDraft: function(){ goi.push('checkLocalDraft'); return Promise.resolve(); },
    backupHangNgay: ghi('backup'), startPolling: ghi('polling'), scheduleSave: ghi('scheduleSave'), taiThongTinTaiKhoan: function(){},
    thuXinTokenAmTham: function(){ goi.push('thuXinToken'); return Promise.resolve(null); },
    toast: ghi('toast'), isFormOpen: function(){ return !!o.dangMoForm; }, isTypingNow: function(){ return false; }
  };
}
function dsVaoMayOffline(d, mocDrive, dirty){
  loadData(d || duLieuMay());
  ctx.state.driveModified = mocDrive === undefined ? 'T1' : mocDrive; ctx.state.dirty = !!dirty; ctx.state.offline = true;
  ctx.state.driveFileId = null; ctx.accessToken = 'tok';
}

test('quyetDinhDongBo: Drive chưa đổi thì giữ bản máy; chỉ hỏi khi cả hai cùng đổi hoặc chưa có mốc', function(){
  var q = ctx.quyetDinhDongBo;
  eq(q({ coFile: false, chuDong: true }), 'tao-file', 'Drive chưa có file, người dùng tự bấm: đẩy bản máy lên');
  eq(q({ coFile: false, chuDong: false }), 'cho', 'Drive chưa có file, chạy ngầm: không tự đổ dữ liệu vào tài khoản có thể là nhầm');
  [true, false].forEach(function(cd){ [true, false].forEach(function(dirty){
    eq(q({ coFile: true, modifiedTime: 'T1', mocCu: 'T1', dirty: dirty, chuDong: cd }), 'day-len', 'Drive không đổi từ lần đồng bộ cuối (dirty=' + dirty + ', chủ động=' + cd + ')');
  }); });
  eq(q({ coFile: true, modifiedTime: 'T2', mocCu: 'T1', dirty: false, chuDong: false }), 'lay-ve', 'máy không đổi, Drive có bản mới: lấy về, kể cả chạy ngầm');
  eq(q({ coFile: true, modifiedTime: 'T2', mocCu: 'T1', dirty: true, chuDong: true }), 'hoi', 'cả hai cùng đổi, người dùng bấm: hỏi');
  eq(q({ coFile: true, modifiedTime: 'T2', mocCu: 'T1', dirty: true, chuDong: false }), 'cho', 'cả hai cùng đổi, chạy ngầm: không tự hỏi');
  eq(q({ coFile: true, modifiedTime: 'T2', mocCu: null, dirty: false, chuDong: true }), 'hoi', 'máy chưa có mốc (chưa đồng bộ lần nào): hỏi chứ không tự lấy về');
  eq(q({ coFile: true, modifiedTime: 'T2', mocCu: null, dirty: false, chuDong: false }), 'cho', 'chưa có mốc, chạy ngầm: chờ bấm');
});

test('laLoiXacThuc: lỗi do phiên Google khác lỗi mạng', function(){
  var f = ctx.laLoiXacThuc;
  ok(f({ type: 'popup_closed' }) && f({ type: 'popup_failed_to_open' }), 'GIS error_callback');
  ok(f({ error: 'access_denied' }), 'GIS callback có error');
  ok(f(new Error('token-expired')) && f(new Error('save-failed:401')) && f(new Error('search-failed:401')), 'hết phiên / Drive trả 401');
  ok(!f(new Error('save-failed:500')) && !f(new Error('Failed to fetch')) && !f(null), 'lỗi mạng / lỗi máy chủ thì không phải lỗi xác thực');
});

test('soNgayChuaDongBo: tính từ lần đồng bộ cuối, chưa đồng bộ lần nào thì từ ngày bắt đầu sổ', function(){
  var now = new Date('2026-10-20T10:00:00').getTime(), ngay = 864e5;
  eq(ctx.soNgayChuaDongBo(now, now - 5 * ngay - 1000, '2026-01-01'), 5, '5 ngày trước');
  eq(ctx.soNgayChuaDongBo(now, now - 1000, '2026-01-01'), 0, 'vừa đồng bộ');
  eq(ctx.soNgayChuaDongBo(now, null, '2026-10-10'), 10, 'chưa đồng bộ lần nào: từ ngày bắt đầu');
  eq(ctx.soNgayChuaDongBo(now, null, ''), 0, 'không có mốc nào: không nhắc');
  eq(ctx.soNgayChuaDongBo(now, now + ngay, ''), 0, 'đồng hồ lệch về tương lai: không âm');
});

test('moNgoaiTuyen: vào thẳng bằng dữ liệu trên máy (chỉ có bản đồng bộ / chỉ có nháp / nháp mới hơn / không có gì)', function(){
  var kho = khoGia(), kp = thayTam({ localStorage: kho, showApp: function(){}, renderAll: function(){} });
  try{
    ctx.state.data = null;
    eq(ctx.moNgoaiTuyen(), false, 'máy chưa có gì: không mở');
    eq(ctx.state.data, null, 'và không đụng state');
    var dA = duLieuMay(), dB = duLieuMay(function(d){ d.journal['2026-10-06'] = { thu: {}, chi: { an: 70000 }, ghiChu: '', refs: [] }; });
    kho.setItem('chitieu_synced_v1', JSON.stringify({ data: dA, savedAt: 1000, baseModified: 'T1' }));
    eq(ctx.moNgoaiTuyen(), true, 'chỉ có bản đồng bộ: mở');
    eq(ctx.state.offline, true, 'chế độ trên máy'); eq(ctx.state.dirty, false, 'không có nháp thì không có gì chờ lên Drive');
    eq(ctx.state.driveModified, 'T1', 'giữ mốc Drive để sau này biết Drive có đổi không'); eq(ctx.state.lanDongBoCuoi, 1000, 'lần đồng bộ cuối');
    eq(Object.keys(ctx.state.data.journal).length, 1, 'dữ liệu của bản đồng bộ');
    kho.setItem('chitieu_draft_v1', JSON.stringify({ data: dB, savedAt: 2000, baseModified: 'T1' }));
    ctx.moNgoaiTuyen();
    eq(Object.keys(ctx.state.data.journal).length, 2, 'nháp mới hơn thì dùng nháp'); eq(ctx.state.dirty, true, 'còn thay đổi chưa lên Drive'); eq(ctx.state.lanDongBoCuoi, 1000, 'lần đồng bộ cuối vẫn là bản đồng bộ');
    kho.setItem('chitieu_draft_v1', JSON.stringify({ data: dB, savedAt: 500, baseModified: 'T0' }));
    ctx.moNgoaiTuyen();
    eq(Object.keys(ctx.state.data.journal).length, 1, 'nháp cũ hơn bản đồng bộ thì bỏ qua'); eq(ctx.state.dirty, false, 'nháp cũ không tính là thay đổi chờ');
    kho.removeItem('chitieu_synced_v1');
    kho.setItem('chitieu_draft_v1', JSON.stringify({ data: dB, savedAt: 700, baseModified: null }));
    eq(ctx.moNgoaiTuyen(), true, 'chỉ có nháp (dùng không đăng nhập, chưa đồng bộ lần nào): vẫn mở'); eq(ctx.state.dirty, true, 'chưa đồng bộ'); eq(ctx.state.lanDongBoCuoi, null, 'chưa đồng bộ lần nào');
  } finally { kp(); ctx.state.offline = false; }
});

test('batDauTrenMay: dùng ngay không đăng nhập; lần sau mở thẳng vào, không hiện lại màn đầu', function(){
  var kho = khoGia(), kp = thayTam({ localStorage: kho, showApp: function(){}, renderAll: function(){} });
  try{
    ctx.state.data = null;
    ctx.batDauTrenMay();
    eq(ctx.state.offline, true, 'chế độ trên máy'); ok(ctx.state.data && ctx.state.data.journal, 'có dữ liệu mặc định');
    eq(ctx.state.lanDongBoCuoi, null, 'chưa đồng bộ lần nào');
    ctx.state.data = null; ctx.state.offline = false;
    eq(ctx.moNgoaiTuyen(), true, 'mở lại thấy dữ liệu trên máy ngay, dù chưa ghi gì');
  } finally { kp(); ctx.state.offline = false; }
});

testAsync('dongBoDrive: Drive không đổi → giữ bản máy, KHÔNG tải đè, KHÔNG hỏi; có thay đổi thì đẩy lên', async function(){
  var goi = [], kp = thayTam(drGia(goi, { file: { id: 'f1', modifiedTime: 'T1' } }));
  try{
    dsVaoMayOffline(null, 'T1', false);
    await ctx.dongBoDrive(false);
    eq(goi.indexOf('driveLoad'), -1, 'không tải đè dữ liệu trên máy'); eq(goi.indexOf('checkLocalDraft'), -1, 'không hỏi gì'); eq(goi.indexOf('driveSave'), -1, 'không có gì để đẩy');
    eq(ctx.state.offline, false, 'đã nối Drive'); eq(ctx.state.driveFileId, 'f1', 'nhớ file Drive'); ok(goi.indexOf('backup') >= 0 && goi.indexOf('polling') >= 0, 'sao lưu ngày và bật cập nhật định kỳ');
    goi.length = 0;
    dsVaoMayOffline(null, 'T1', true);
    await ctx.dongBoDrive(false);
    ok(goi.indexOf('driveSave') >= 0, 'có thay đổi thì đẩy lên'); eq(goi.indexOf('driveLoad'), -1, 'vẫn không tải đè'); eq(goi.indexOf('checkLocalDraft'), -1, 'vẫn không hỏi');
  } finally { kp(); ctx.accessToken = null; ctx.state.offline = false; ctx.state.dirty = false; }
});

testAsync('dongBoDrive: Drive có bản mới và máy không có thay đổi → lấy về im lặng; cả hai cùng đổi → chỉ hỏi khi người dùng bấm', async function(){
  var goi = [], kp = thayTam(drGia(goi, { file: { id: 'f1', modifiedTime: 'T2' } }));
  try{
    dsVaoMayOffline(null, 'T1', false);
    await ctx.dongBoDrive(false);
    ok(goi.indexOf('driveLoad') >= 0, 'lấy bản mới về'); eq(goi.indexOf('checkLocalDraft'), -1, 'không có thay đổi của máy nên không hỏi'); eq(ctx.state.offline, false, 'đã nối Drive');
    goi.length = 0;
    dsVaoMayOffline(null, 'T1', true);
    await ctx.dongBoDrive(false);
    eq(goi.indexOf('driveLoad'), -1, 'chạy ngầm mà cả hai cùng đổi: KHÔNG tự tải đè'); eq(goi.indexOf('driveSave'), -1, 'cũng không tự ghi đè Drive');
    eq(ctx.accessToken, null, 'bỏ kết nối để không có đường ghi nhầm'); eq(ctx.state.offline, true, 'vẫn dùng dữ liệu trên máy'); eq(ctx.state.dirty, true, 'thay đổi vẫn chờ');
    goi.length = 0;
    dsVaoMayOffline(null, 'T1', true);
    await ctx.dongBoDrive(true);
    ok(goi.indexOf('driveLoad') >= 0 && goi.indexOf('checkLocalDraft') >= 0, 'người dùng bấm Đồng bộ: tải Drive rồi hỏi khôi phục nháp (luồng cũ)');
  } finally { kp(); ctx.accessToken = null; ctx.state.offline = false; ctx.state.dirty = false; }
});

testAsync('dongBoDrive: đang mở form thì không tự thay dữ liệu bên dưới; chưa có mốc thì chờ bấm', async function(){
  var goi = [], kp = thayTam(drGia(goi, { file: { id: 'f1', modifiedTime: 'T2' }, dangMoForm: true }));
  try{
    dsVaoMayOffline(null, 'T1', false);
    await ctx.dongBoDrive(false);
    eq(goi.indexOf('driveLoad'), -1, 'form đang mở: không tải'); eq(ctx.state.offline, true, 'giữ dữ liệu trên máy');
  } finally { kp(); }
  goi.length = 0; kp = thayTam(drGia(goi, { file: { id: 'f1', modifiedTime: 'T2' } }));
  try{
    dsVaoMayOffline(null, null, false);
    await ctx.dongBoDrive(false);
    eq(goi.indexOf('driveLoad'), -1, 'máy chưa có mốc Drive: chạy ngầm không tự lấy về'); eq(ctx.state.offline, true, 'chờ bấm');
  } finally { kp(); ctx.accessToken = null; ctx.state.offline = false; }
});

testAsync('dongBoDrive: Drive chưa có file → chỉ tự tạo khi người dùng bấm; lỗi mạng / tải lỗi → về dữ liệu trên máy, không văng', async function(){
  var kLog = thayTam({ console: { log: console.log, warn: console.warn, error: function(){} } });
  var goi = [], kp = thayTam(drGia(goi, { file: null }));
  try{
    dsVaoMayOffline(null, 'T1', false);
    await ctx.dongBoDrive(false);
    eq(goi.indexOf('scheduleSave'), -1, 'chạy ngầm: không tự tạo file (có thể là nhầm tài khoản)'); eq(ctx.accessToken, null, 'bỏ kết nối');
    goi.length = 0;
    dsVaoMayOffline(null, 'T1', false);
    await ctx.dongBoDrive(true);
    ok(goi.indexOf('scheduleSave') >= 0, 'bấm Đồng bộ: tạo file từ bản trên máy'); eq(ctx.state.driveFileId, null, 'chưa có file, driveSave sẽ tạo'); eq(ctx.state.driveModified, null, 'không còn mốc cũ');
  } finally { kp(); }
  goi.length = 0; kp = thayTam(drGia(goi, { loiTim: new Error('Failed to fetch') }));
  try{
    dsVaoMayOffline(null, 'T1', true);
    await ctx.dongBoDrive(false);
    eq(ctx.accessToken, null, 'lỗi mạng: bỏ kết nối'); eq(ctx.state.offline, true, 'dùng dữ liệu trên máy'); eq(ctx.state.dirty, true, 'thay đổi vẫn chờ');
    eq(goi.indexOf('toast'), -1, 'chạy ngầm: không làm phiền');
    await ctx.dongBoDrive(true);
    ok(goi.indexOf('toast') >= 0, 'người dùng bấm mà lỗi: có báo');
  } finally { kp(); }
  goi.length = 0; kp = thayTam(drGia(goi, { file: { id: 'f1', modifiedTime: 'T2' }, taiOk: false }));
  try{
    dsVaoMayOffline(null, 'T1', false);
    await ctx.dongBoDrive(false);
    eq(ctx.state.offline, true, 'tải lỗi: vẫn dùng dữ liệu trên máy'); eq(ctx.accessToken, null, 'bỏ kết nối');
  } finally { kp(); kLog(); ctx.accessToken = null; ctx.state.offline = false; ctx.state.dirty = false; }
});

testAsync('driveSave: hết phiên Google thì dừng thử lại và về dữ liệu trên máy (trước đây thử lại mỗi 4 giây, mỗi lần có thể bật cửa sổ Google)', async function(){
  var kLog = thayTam({ console: { log: console.log, warn: console.warn, error: function(){} } });
  var hen = [], kp = thayTam({ localStorage: khoGia(), renderSyncStatus: function(){}, setTimeout: function(fn, ms){ hen.push(ms); return 1; }, clearTimeout: function(){},
    driveFetch: function(){ return Promise.reject({ type: 'popup_closed' }); } });
  try{
    loadData(duLieuMay()); ctx.state.driveFileId = 'f1'; ctx.state.driveModified = null; ctx.state.taiLoi = false; ctx.state.saving = false; ctx.state.dirty = true;
    ctx.accessToken = 'tok';
    await ctx.driveSave();
    eq(ctx.accessToken, null, 'bỏ kết nối'); eq(ctx.state.offline, true, 'dùng dữ liệu trên máy'); eq(ctx.state.dirty, true, 'thay đổi vẫn chờ lên Drive'); eq(hen.length, 0, 'không đặt lịch thử lại');
    // lỗi mạng thường thì vẫn thử lại như cũ
    kp(); hen = [];
    kp = thayTam({ localStorage: khoGia(), renderSyncStatus: function(){}, setTimeout: function(fn, ms){ hen.push(ms); return 1; }, clearTimeout: function(){},
      driveFetch: function(){ return Promise.reject(new Error('Failed to fetch')); } });
    ctx.accessToken = 'tok'; ctx.state.offline = false; ctx.state.saving = false;
    await ctx.driveSave();
    eq(ctx.accessToken, 'tok', 'lỗi mạng không bỏ kết nối'); eq(hen.length, 1, 'lên lịch thử lại');
  } finally { kp(); kLog(); ctx.accessToken = null; ctx.state.offline = false; ctx.state.dirty = false; }
});

testAsync('khoiDong: có dữ liệu trên máy thì vào thẳng, không hiện màn đăng nhập; máy mới mới hiện; lỗi tải KHÔNG xóa token còn hạn', async function(){
  var goi = [], kho = khoGia(), kp = thayTam(drGia(goi, { kho: kho, file: { id: 'f1', modifiedTime: 'T1' } }));
  try{
    // 1) có dữ liệu trên máy, không token
    kho.setItem('chitieu_synced_v1', JSON.stringify({ data: duLieuMay(), savedAt: 1000, baseModified: 'T1' }));
    ctx.state.data = null; ctx.accessToken = null;
    await ctx.khoiDong();
    eq(goi.filter(function(g){ return g.indexOf('showGate') === 0; }).length, 0, 'không hiện màn đăng nhập');
    eq(ctx.state.offline, true, 'đang dùng dữ liệu trên máy'); eq(goi.indexOf('findFile'), -1, 'không có token thì không gọi Drive');
    // 2) có dữ liệu trên máy + còn token: đồng bộ nền, vẫn không màn đăng nhập
    goi.length = 0; ctx.state.data = null;
    kho.setItem('chitieu_tok_v1', JSON.stringify({ t: 'tok', exp: Date.now() + 3600000 }));
    await ctx.khoiDong();
    eq(goi.filter(function(g){ return g.indexOf('showGate') === 0; }).length, 0, 'không màn đăng nhập'); ok(goi.indexOf('findFile') >= 0, 'đồng bộ nền'); eq(ctx.state.offline, false, 'đã nối Drive');
    // 3) máy mới, không token
    goi.length = 0; kho.removeItem('chitieu_synced_v1'); kho.removeItem('chitieu_tok_v1'); ctx.state.data = null; ctx.state.offline = false; ctx.accessToken = null;
    await ctx.khoiDong();
    ok(goi.indexOf('showGate:') >= 0, 'máy chưa có gì: hiện màn đầu');
    // 4) máy chưa có dữ liệu, có token còn hạn nhưng tải Drive lỗi (mạng chưa lên): GIỮ token
    goi.length = 0; kp(); kp = thayTam(drGia(goi, { kho: kho, taiOk: false }));
    kho.setItem('chitieu_tok_v1', JSON.stringify({ t: 'tok', exp: Date.now() + 3600000 }));
    await ctx.khoiDong();
    eq(ctx.readSavedToken(), 'tok', 'token còn hạn không bị xóa vì một lần tải lỗi'); ok(goi.some(function(g){ return g.indexOf('showGate:') === 0; }), 'hiện màn đầu để thử lại');
  } finally { kp(); ctx.accessToken = null; ctx.state.offline = false; ctx.state.dirty = false; ctx.state.data = null; }
});

test('signOut: xóa cả bản đồng bộ lẫn nháp trên máy (còn nháp thì mở lại app vẫn vào thẳng bằng dữ liệu cũ)', function(){
  var kho = khoGia(), goi = [], kp = thayTam(drGia(goi, { kho: kho }));
  try{
    kho.setItem('chitieu_synced_v1', JSON.stringify({ data: duLieuMay(), savedAt: 1000, baseModified: 'T1' }));
    kho.setItem('chitieu_draft_v1', JSON.stringify({ data: duLieuMay(), savedAt: 2000, baseModified: 'T1' }));
    ctx.accessToken = null;
    ctx.signOut();
    eq(kho.getItem('chitieu_synced_v1'), null, 'bản đồng bộ đã xóa'); eq(kho.getItem('chitieu_draft_v1'), null, 'nháp đã xóa');
    eq(ctx.moNgoaiTuyen(), false, 'mở lại không còn dữ liệu cũ nào'); ok(goi.some(function(g){ return g.indexOf('showGate') === 0; }), 'về màn đầu');
  } finally { kp(); ctx.state.offline = false; }
});

/* ==================================================================== */
group('7f. Ghi nhanh bằng Phím tắt iPhone: nhập nhiều file, mã riêng từng khoản, tick bỏ khoản không ghi');

// mỗi lần bấm phím tắt tạo 1 file CSV tên ghi-nhanh-<giờ>.csv (cùng dòng tiêu đề)
var GN_DAU = 'Ngày,Loại,Số tiền,Danh mục,Ghi chú';
function gnFile(gio, dong){ return { ten: 'ghi-nhanh-2026-10-16-' + gio + '.csv', rows: ctx.nhapParseCsv(GN_DAU + '\n' + dong) }; }
function gnImp(ds){ var k = ctx.nhapTaoImp(ds); ok(!k.loi, 'dựng imp: ' + k.loi); return k.imp; }
function gnData(){ var d = baseData(); d.settings.ngayBatDau = '2026-10-01'; d.wallets = [{ id: 'w1', ten: 'Tiền mặt', soDuDauKy: 1000000 }]; return d; }
var GN_BA_FILE = [gnFile('09-12-33', '2026-10-16,chi,25000,Ăn,cà phê'), gnFile('09-40-02', '2026-10-16,chi,25000,Ăn,cà phê'), gnFile('12-05-10', '2026-10-16,thu,500000,Lương,')];

test('nhapGopFile: file thường giữ nguyên; nhiều file / file ghi-nhanh thì gộp và thêm cột Mã; khác kiểu cột thì báo lỗi', function(){
  var bank = { ten: 'sao-ke.csv', rows: ctx.nhapParseCsv('Ngày,Số tiền,Nội dung\n2026-10-01,-50000,Cơm') };
  var g = ctx.nhapGopFile([bank]);
  eq(g.maCot, -1, 'một file thường không thêm mã'); eq(g.rows, bank.rows, 'giữ nguyên rows');
  g = ctx.nhapGopFile([GN_BA_FILE[0]]);
  eq(g.maCot, 5, 'một file tên ghi-nhanh cũng thêm mã (cột thứ 6)'); eq(g.rows[0][5], 'Mã', 'tiêu đề cột mã');
  g = ctx.nhapGopFile(GN_BA_FILE);
  eq(g.loi, '', 'cùng kiểu thì gộp được'); eq(g.rows.length, 4, '1 dòng tiêu đề + 3 khoản'); eq(g.maCot, 5, 'cột mã');
  var ma = g.rows.slice(1).map(function(r){ return r[5]; });
  eq(new Set(ma).size, 3, 'ba mã khác nhau dù hai khoản giống hệt nhau'); eq(ma[0], 'ghi-nhanh-2026-10-16-09-12-33.csv#1', 'mã = tên file + số dòng');
  g = ctx.nhapGopFile([GN_BA_FILE[0], bank]);
  ok(g.loi.indexOf('cùng kiểu cột') >= 0, 'khác dòng tiêu đề: báo lỗi chứ không trộn: ' + g.loi);
  g = ctx.nhapGopFile([{ ten: 'ghi-nhanh-a.csv', rows: ctx.nhapParseCsv('2026-10-16,chi,10000,Ăn,') }, { ten: 'ghi-nhanh-b.csv', rows: ctx.nhapParseCsv('2026-10-16,chi,20000,Ăn,') }]);
  eq(g.rows.length, 2, 'file không có dòng tiêu đề vẫn gộp được'); eq(g.rows[0].length, 6, 'thêm cột mã');
});

test('ghi nhanh: dòng tiêu đề Ngày / Loại / Số tiền / Danh mục / Ghi chú được nhận đúng cột, danh mục khớp theo tên', function(){
  loadData(gnData());
  var imp = gnImp(GN_BA_FILE);
  eq(imp.coHeader, true, 'có tiêu đề');
  var m = imp.map; eq([m.ngay, m.loai, m.tien, m.cat, m.note].join(','), '0,1,2,3,4', 'đoán đúng cột');
  var kq = ctx.nhapPhanTich(imp);
  eq(kq.nOk, 3, 'cả 3 khoản hợp lệ'); eq(kq.nLoi, 0, 'không lỗi'); eq(kq.nTrung, 0, 'không trùng');
  eq(kq.tongChi, 50000, 'hai khoản chi 25.000'); eq(kq.tongThu, 500000, 'một khoản thu');
  eq(kq.dong[0].catId, 'an', 'Ăn khớp danh mục có sẵn'); eq(kq.dong[2].catId, 'luong', 'Lương khớp danh mục thu');
});

test('ghi nhanh: hai khoản GIỐNG HỆT trong ngày vẫn là hai khoản; nhập lại file cũ không nhân đôi; xóa khoản rồi không sống lại; hoàn tác thì nhập lại được', function(){
  loadData(gnData());
  var kq = ctx.nhapPhanTich(gnImp(GN_BA_FILE));
  var imp = gnImp(GN_BA_FILE), r = ctx.nhapThucHien(imp, kq);
  eq(r.da.length, 3, 'ghi đủ 3 khoản (không mất ly cà phê thứ hai)');
  eq(ctx.state.data.journal['2026-10-16'].items.filter(function(it){ return it.catId === 'an'; }).length, 2, 'hai khoản Ăn');
  eq(ctx.state.data.settings.maDaNhap.length, 3, 'nhớ 3 mã đã nhập');
  var lai = ctx.nhapPhanTich(gnImp(GN_BA_FILE));
  eq(lai.nTrung, 3, 'nhập lại cùng các file: cả 3 là đã nhập'); eq(lai.nOk, 0, 'không nhân đôi');
  // xóa 1 khoản vừa nhập ở Sổ tay, file vẫn còn trong Tệp: không sống lại
  var it0 = ctx.state.data.journal['2026-10-16'].items.filter(function(it){ return it.catId === 'an'; })[0];
  ctx.entryDeleteItem('2026-10-16', it0.iid);
  eq(ctx.nhapPhanTich(gnImp(GN_BA_FILE)).nOk, 0, 'xóa khoản rồi nhập lại file: không sống lại');
  // hoàn tác: mã được trả, nhập lại được
  loadData(gnData());
  var imp2 = gnImp(GN_BA_FILE), kq2 = ctx.nhapPhanTich(imp2), r2 = ctx.nhapThucHien(imp2, kq2);
  ctx.nhapHoanTac(r2);
  eq(ctx.state.data.settings.maDaNhap.length, 0, 'hoàn tác trả lại mã'); eq(ctx.nhapPhanTich(gnImp(GN_BA_FILE)).nOk, 3, 'nhập lại được');
});

test('ghi nhanh: bỏ tick thì khoản đó không ghi, không tính vào tổng, lần sau vẫn còn trong danh sách', function(){
  loadData(gnData());
  var imp = gnImp(GN_BA_FILE);
  var stt = ctx.nhapPhanTich(imp).dong.map(function(x){ return x.stt; });
  imp.bo = {}; imp.bo[stt[0]] = true;                // bỏ tick khoản đầu tiên
  var kq = ctx.nhapPhanTich(imp);
  eq(kq.nBo, 1, 'một dòng bỏ tick'); eq(kq.nOk, 2, 'còn 2 dòng sẽ ghi'); eq(kq.tongChi, 25000, 'tổng không tính dòng bỏ tick');
  var r = ctx.nhapThucHien(imp, kq);
  eq(r.da.length, 2, 'chỉ ghi 2 khoản'); eq(ctx.state.data.settings.maDaNhap.length, 2, 'chỉ nhớ mã 2 khoản đã ghi');
  var lai = ctx.nhapPhanTich(gnImp(GN_BA_FILE));
  eq(lai.nOk, 1, 'khoản bỏ tick vẫn còn trong danh sách lần sau'); eq(lai.nTrung, 2, 'hai khoản đã ghi thì là đã nhập');
});

test('nhập file ngân hàng thường vẫn như cũ: không có mã, trùng so theo ngày + loại + số tiền + nội dung', function(){
  loadData(gnData());
  var f = { ten: 'sao-ke.csv', rows: ctx.nhapParseCsv('Ngày,Số tiền,Nội dung\n2026-10-01,-50000,Cơm\n2026-10-01,-50000,Cơm') };
  var imp = gnImp([f]); imp.catMD.chi = 'chi|an';
  var kq = ctx.nhapPhanTich(imp);
  eq(imp.maCot, -1, 'không có cột mã'); eq(kq.nOk, 2, 'trong cùng file hai dòng giống nhau đều nhập (chỉ so với dữ liệu ĐÃ CÓ)');
  ctx.nhapThucHien(imp, kq);
  eq(ctx.nhapPhanTich(imp).nTrung, 2, 'nhập lại file đó: trùng theo nội dung như cũ'); eq(ctx.state.data.settings.maDaNhap.length, 0, 'không ghi mã');
});

test('settings.maDaNhap: qua lưu / nạp lại vẫn còn, dữ liệu cũ không có thì thành danh sách rỗng, giữ tối đa 2000', function(){
  loadData(gnData());
  eq(Array.isArray(ctx.state.data.settings.maDaNhap), true, 'dữ liệu cũ: mặc định rỗng');
  var d = gnData(); d.settings.maDaNhap = []; for (var i = 0; i < 2100; i++) d.settings.maDaNhap.push('m' + i); d.settings.maDaNhap.push(42);
  var n = ctx.normalizeData(JSON.parse(JSON.stringify(d)));
  eq(n.settings.maDaNhap.length, 2000, 'cắt còn 2000, bỏ phần tử không phải chuỗi'); eq(n.settings.maDaNhap[1999], 'm2099', 'giữ các mã mới nhất');
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
group('Cảnh báo chi bất thường + chi theo thứ');

function dataBatThuong(){
  var j = {};
  [['2026-08-03', 100000], ['2026-08-20', 120000], ['2026-09-02', 90000], ['2026-09-15', 110000], ['2026-10-01', 100000], ['2026-10-05', 130000]].forEach(function(x, i){
    j[x[0]] = { thu: {}, chi: { an: x[1] }, ghiChu: '', refs: [], items: [{ iid: 'i' + i, kind: 'chi', catId: 'an', soTien: x[1], ghiChu: '', walletId: 'w_chinh' }] };
  });
  return baseData({ journal: j, settings: { soDuDauKy: 0, ngayBatDau: '2026-08-01', thangBatDauDuTru: '2026-08' } });
}
test('chiBatThuong: gõ thừa số 0 thì cảnh báo; số bình thường, số nhỏ, thiếu dữ liệu, sửa chính dòng đó thì không', function(){
  setToday('2026-10-10'); loadData(dataBatThuong());
  var r = ctx.chiBatThuong('an', 1100000);
  ok(r && r.n === 6 && r.m === 105000 && r.max === 130000, 'cảnh báo: trung vị 105.000, cao nhất 130.000');
  eq(ctx.chiBatThuong('an', 300000), null, '300.000 chưa quá 3 lần trung vị (315.000)');
  eq(ctx.chiBatThuong('an', 320000) !== null, true, '320.000 > 3 lần trung vị và > mọi khoản cũ');
  eq(ctx.chiBatThuong('an', 40000), null, 'dưới 50.000 không xét');
  eq(ctx.chiBatThuong('traNo', 5000000), null, 'danh mục hệ thống không xét');
  eq(ctx.chiBatThuong('khac', 5000000), null, 'danh mục chưa có lịch sử');
  eq(ctx.chiBatThuong('an', 1100000, 'i5') !== null, true, 'bỏ 1 dòng đang sửa vẫn đủ 5 khoản');
  eq(ctx.chiBatThuong('an', 1100000, 'i5', '2027-06-10'), null, 'quá 6 tháng thì hết dữ liệu');
  var d = dataBatThuong(); d.journal['2026-09-02'].items[0].soTien = 2000000; d.journal['2026-09-02'].chi.an = 2000000;
  loadData(d); eq(ctx.chiBatThuong('an', 1100000), null, 'từng có khoản 2.000.000 thì 1.100.000 không bị coi là nhầm');
  setToday('2026-10-01');
});
test('bdTheoThu: chia đúng theo thứ, ngày không chi tính 0, bỏ ngày tương lai', function(){
  var j = {};
  // 2026-10-05 là thứ Hai, 2026-10-06 thứ Ba
  [['2026-10-05', 600000], ['2026-10-06', 300000], ['2026-10-12', 200000]].forEach(function(x, i){
    j[x[0]] = { thu: {}, chi: { an: x[1] }, ghiChu: '', refs: [], items: [{ iid: 'x' + i, kind: 'chi', catId: 'an', soTien: x[1], ghiChu: '', walletId: 'w_chinh' }] };
  });
  setToday('2026-10-14'); loadData(baseData({ journal: j }));
  var t = ctx.bdTheoThu('2026-10');
  eq(t.rows[0].ten, 'Thứ Hai'); eq(t.rows[0].tong, 800000); eq(t.rows[0].soNgay, 2, 'thứ Hai 5 và 12/10 (từ ngày có giao dịch đầu tiên)');
  eq(t.rows[0].tb, 400000); eq(t.rows[1].tong, 300000); eq(t.rows[1].soNgay, 2);
  eq(t.rows[2].soNgay, 2, 'thứ Tư 7 và 14/10 (14/10 là hôm nay)');
  eq(t.tong, 1100000);
  var h = ctx.bdTheoThuHtml('2026-10');
  ok(h.indexOf('Chi hằng ngày theo thứ') > 0 && h.indexOf('Thứ Hai tiêu nhiều nhất') > 0 && h.indexOf('Thứ Hai: 800.000 ÷ 2 ngày = 400.000') > 0, 'thẻ hiện thứ cao nhất + cách tính bằng số thật');
  setToday('2026-10-01');
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

test('dinhKyGhi: số tiền thật của kỳ này (nếu khác mẫu) được ghi, mẫu không đổi; thẻ Sổ tay có ô điền sẵn số mẫu', function(){
  loadData(dataDinhKy());
  var dk = ctx.state.data.dinhKy[0];
  setToday('2026-10-07');
  var o = ctx.dinhKyDenHanHtml();
  ok(o.indexOf('id="dk_tien_k1"') > 0 && o.indexOf('value="10.000.000"') > 0, 'ô tiền điền sẵn số mẫu');
  var r = ctx.dinhKyGhi(dk, '2026-10', '2026-10-07', 9400000);
  var e = ctx.state.data.journal[r.date];
  eq(e.thu.luong, 9400000, 'ghi đúng số thật'); ok(e.ghiChu.indexOf('9.400.000') > 0, 'ghi chú ngày mang số thật');
  eq(dk.soTien, 10000000, 'số tiền mẫu giữ nguyên');
  setToday('2026-10-01');
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
test('Định kỳ: bấm "Ghi vào Sổ tay" lấy số tiền trong ô (sửa được), ô trống / 0 thì dùng số mẫu', function(){
  loadData(dataDinhKy()); setToday('2026-10-07');
  var dk = ctx.state.data.dinhKy[0], el = function(){ return elAct({ 'data-id': 'k1', 'data-mk': '2026-10' }); };
  voiDom({ dk_tien_k1: { value: '9.400.000' } }, {}, function(){ ctx.handleSoTayAction('dkGhi', el()); });
  eq(ctx.state.data.journal['2026-10-05'].thu.luong, 9400000, 'ghi theo số trong ô'); eq(dk.soTien, 10000000, 'mẫu không đổi');
  ctx.dinhKyHoanTac({ date: '2026-10-05', iid: ctx.entryItems(ctx.state.data.journal['2026-10-05'])[0].iid, note: ctx.state.data.journal['2026-10-05'].ghiChu });
  voiDom({ dk_tien_k1: { value: '' } }, {}, function(){ ctx.handleSoTayAction('dkGhi', el()); });
  eq(ctx.state.data.journal['2026-10-05'].thu.luong, 10000000, 'ô trống thì dùng số mẫu');
  setToday('2026-10-01');
});
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

test('Tài sản ròng dự kiến: nợ gốc giảm theo từng kỳ trả trong lịch, về 0 khi trả hết', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ id:'v1', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:10 })];   // kỳ T10..T3, 1tr/kỳ, chưa trả kỳ nào
  loadData(d);
  var mks = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'];
  var no = mks.map(function(mk){ return Math.round(ctx.taiSanRongDuKien(mk, 0).no); });
  eq(JSON.stringify(no), JSON.stringify([5000000, 4000000, 3000000, 2000000, 1000000, 0, 0]), 'cuối mỗi tháng đã trả thêm 1 kỳ');
  eq(Math.round(ctx.taiSanRongDuKien('2026-11', 8000000).rong), 4000000, 'ròng = số dư 8tr − nợ gốc còn 4tr');
});

test('Tài sản ròng dự kiến: kỳ đã đóng ở Sổ tay không bị trừ nợ hai lần', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ id:'v1', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:10,
    traNo:[{ ky:0, ngay:'2026-10-05', soTien:1000000, dongKy:true }] })];   // đã trả đủ kỳ T10
  loadData(d);
  var no = ['2026-10', '2026-11', '2027-03'].map(function(mk){ return Math.round(ctx.taiSanRongDuKien(mk, 0).no); });
  eq(JSON.stringify(no), JSON.stringify([5000000, 4000000, 0]), 'T10 vẫn 5tr (kỳ đã trả nằm trong nợ hiện tại), T11 4tr, T3 hết');
});

test('Tài sản ròng dự kiến: cho vay còn phải thu tới tháng dự kiến thu rồi chuyển thành tiền', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.choVay = [{ id:'cv', ten:'A', soTien:3000000, daThu:0, ngayChoVay:'2026-10-05', ngayDuKienThu:'2026-12-15', trangThai:'dang_cho' }];
  loadData(d);
  var pt = ['2026-10', '2026-11', '2026-12'].map(function(mk){ return Math.round(ctx.taiSanRongDuKien(mk, 0).phaiThu); });
  eq(JSON.stringify(pt), JSON.stringify([3000000, 3000000, 0]), 'tháng 12 thu về: hết phải thu (đã nằm trong số dư)');
});

test('Mô phỏng: cột tài sản ròng theo kịch bản (tất toán sớm, vay thêm)', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ id:'v1', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:10 })];
  loadData(d);
  ctx.state.mp.data = JSON.parse(JSON.stringify(ctx.state.data));
  ctx.state.mp.dieuChinh = [{ loai:'traSom', bat:true, loanId:'v1', mk:'2027-01', soTienTatToan:0 }];
  var sc = ctx.mpBuildScenario();
  var rows = ctx.mpChieuDongTien(sc.data, '2026-10', 6, sc.overlay);
  eq(JSON.stringify(rows.map(function(r){ return Math.round(r.bal - r.rong); })), JSON.stringify([5000000, 4000000, 3000000, 0, 0, 0]), 'nợ gốc: giảm mỗi tháng, tất toán T1 về 0');
  // vay thêm 2tr từ T11, trả 2 kỳ (T12, T1): tiền vay vào ví nên ròng không đổi lúc vay, rồi nợ giảm dần
  ctx.state.mp.dieuChinh = [{ loai:'vayMoi', bat:true, ten:'Vay thử', hinhThuc:'khong_lai', soTien:2000000, soThang:2, mkTu:'2026-11' }];
  ctx.state.mp.data.vayNo.vayNoPhaiTra = [];
  var sc2 = ctx.mpBuildScenario();
  var rows2 = ctx.mpChieuDongTien(sc2.data, '2026-10', 4, sc2.overlay);
  eq(JSON.stringify(rows2.map(function(r){ return Math.round(r.bal - r.rong); })), JSON.stringify([0, 2000000, 1000000, 0]), 'nợ gốc khoản vay thêm: 0 → 2tr → 1tr → 0');
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
  var hang = root.innerHTML.split('Số dư cuối tháng')[1].split('</tr>')[0];
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

test('tongQuanHtml: số dư, thu/chi, còn lại theo chỉ tiêu; lời nhắc nằm ở chuông', function(){
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
  // Ăn có định kỳ (Tiền net) nhưng KHÔNG bật "Khoản cố định" -> vẫn là chi hằng ngày: 700k / 1,2tr -> còn 500k
  ok(h.indexOf('Chi hằng ngày theo hạn mức') >= 0 && h.indexOf('còn ' + ctx.fmt(500000)) >= 0, 'đã chi 700k / hạn mức 1,2tr -> còn 500k');
  ok(h.indexOf('hero-chip') < 0 && h.indexOf('hero-ok') < 0, 'thẻ đầu không còn chip lời nhắc (đã chuyển sang chuông)');
  var cb = ctx.cbTatCa('2026-10-10').map(function(x){ return x.loai; });
  ok(cb.indexOf('dk') >= 0 && cb.indexOf('vn') >= 0 && cb.indexOf('hm') >= 0, 'chuông có định kỳ, vay nợ, vượt hạn mức (Xăng 300k > 200k): ' + cb.join(','));
  var h2 = ctx.tongQuanHtml('2026-09', 0, 0, 0, 0, true);
  ok(h2.indexOf('Số dư cuối tháng') >= 0 && h2.indexOf('>—<') >= 0, 'tháng khác/trước mốc: nhãn "cuối tháng", số dư "—"');
  setToday('2026-10-01');
});

test('tongQuanHtml: không có chip lời nhắc; không có việc gì thì chuông trống', function(){
  setToday('2026-10-10');
  loadData(baseData({ settings:{ soDuDauKy:1000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } }));
  var h = ctx.tongQuanHtml('2026-10', 0, 0, 1000000, 1000000, false);
  ok(h.indexOf('hero-chip') < 0 && h.indexOf('hero-ok') < 0, 'không chip'); eq(ctx.cbTatCa('2026-10-10').length, 0, 'chuông trống');
  ok(h.indexOf('hero-bud') < 0, 'không có chỉ tiêu thì không hiện thanh');
  setToday('2026-10-01');
});

/* ==================================================================== */
test('Sổ tay: số dư hiện tại là số dư TỚI HÔM NAY, bằng số của Dòng tiền → Theo ngày; khoản ghi trước cho ngày sau chỉ hiện ở dòng phụ', function(){
  setToday('2026-10-10');
  var d = baseData({ settings:{ soDuDauKy:10000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.wallets = [{ id:'a', ten:'Tiền mặt', soDuDauKy:4000000 }, { id:'b', ten:'Techcom', soDuDauKy:6000000 }];
  d.journal['2026-10-03'] = { thu:{}, chi:{ an:500000 }, ghiChu:'', refs:[], items:[{ iid:'i1', kind:'chi', catId:'an', soTien:500000, walletId:'a' }] };
  d.journal['2026-10-20'] = { thu:{ luong:2000000 }, chi:{ an:300000 }, ghiChu:'', refs:[], items:[{ iid:'i2', kind:'thu', catId:'luong', soTien:2000000, walletId:'b' }, { iid:'i3', kind:'chi', catId:'an', soTien:300000, walletId:'a' }] };
  loadData(d);
  var root = { innerHTML: '' }; ctx.state.soTayMonth = '2026-10';
  var rs0 = ctx.renderSoTay; ctx.renderSoTay = renderThat.renderSoTay;
  voiDom({ tabContent: root }, null, function(){ ctx.renderSoTay(); });
  var h = root.innerHTML, hom = ctx.balanceAt('2026-10-10');
  eq(hom, 9500000, 'số dư tới hôm nay = 10tr − 500k (khoản ngày 20 chưa tới)');
  var iHero = h.indexOf('hero-val'), so = h.slice(iHero, iHero + 80);
  ok(so.indexOf(ctx.fmt(9500000)) > 0, 'số to ở thẻ đầu là số dư hôm nay: ' + so);
  ok(h.indexOf('Sau các khoản đã ghi trước cho những ngày tới') > 0 && h.indexOf(ctx.fmt(11200000)) > 0, 'dòng phụ cho số tới hết tháng 11.200.000');
  ok(h.indexOf('khoản đã ghi trước cho các ngày sau hôm nay') > 0, 'Cách tính nói rõ phần chênh');
  eq(kiemPhepCong(h).loi.join(' | '), '', 'phép cộng trong Cách tính vẫn đúng');
  // dải ví cũng tính tới hôm nay: Tiền mặt 4tr − 500k, Techcom 6tr (khoản 2tr ngày 20 chưa tính)
  ok(h.indexOf(ctx.fmt(3500000)) > 0 && h.indexOf(ctx.fmt(6000000)) > 0 && h.indexOf(ctx.fmt(8000000)) < 0, 'số dư từng ví tới hôm nay');
  // không có khoản ghi trước thì không có dòng phụ
  d.journal = { '2026-10-03': d.journal['2026-10-03'] }; loadData(d);
  voiDom({ tabContent: root }, null, function(){ ctx.renderSoTay(); });
  ok(root.innerHTML.indexOf('Sau các khoản đã ghi trước') < 0, 'không có khoản ghi trước: không hiện dòng phụ');
  ctx.renderSoTay = rs0; setToday('2026-10-01');
});

test('Trả cố định/tháng: lãi suất ngầm đúng; cách chia "Lãi trên dư nợ giảm dần" ra nợ gốc còn lại thật; "Gốc chia đều" giữ nguyên cách cũ', function(){
  // 10tr, trả 1tr x 12 tháng: lãi ngầm ≈ 2,92%/tháng (giải phương trình PMT bằng tay: PMT(2,92%, 12, 10tr) ≈ 1tr)
  var r = ctx.laiNgamThang(10000000, 1000000, 12);
  near(r, 0.0292, 0.0002, 'lãi ngầm tháng ≈ 2,92%');
  eq(ctx.laiNgamThang(10000000, 800000, 12), 0, 'tổng trả ≤ gốc thì không có lãi');
  var base = { id:'x', ten:'FE', hinhThuc:'tra_co_dinh', soTienGoc:10000000, soTienTraThang:1000000, soThangVay:12, ngayVay:'2026-01-10', ngayTraHangThang:10, traNo:[], trangThai:'dang_vay' };
  var deu = ctx.tinhLichTraNo(Object.assign({}, base)), giam = ctx.tinhLichTraNo(Object.assign({}, base, { cachGoc:'giam' }));
  near(deu[5].duNoConLai, 5000000, 3, 'gốc chia đều: sau kỳ 6 còn nửa gốc (cách cũ, lệch tối đa vài đồng do làm tròn)');
  near(giam[5].duNoConLai, 5431070, 4, 'dư nợ giảm dần: sau kỳ 6 còn 5.431.070 (tính tay: lãi từng kỳ trên dư nợ)');
  near(giam[2].duNoConLai, 7814195, 4, 'sau kỳ 3 còn 7.814.195');
  near(giam[0].lai, 10000000 * r, 1, 'lãi kỳ 1 = dư nợ × lãi ngầm');
  var tongGoc = 0; giam.forEach(function(k){ tongGoc += k.goc; });
  near(tongGoc, 10000000, 1, 'tổng gốc các kỳ = số vay'); near(giam[11].duNoConLai, 0, 0.01, 'kỳ cuối hết nợ');
  near(giam[11].tongTra, 1000000, 2, 'số trả mỗi tháng vẫn ≈ 1tr, kể cả kỳ cuối');
  ok(giam[0].goc < giam[11].goc, 'gốc tăng dần, lãi giảm dần');
  // làm tròn về đồng: 1tr / 3 kỳ không lãi = 333.333 + 333.333 + 333.334; mọi kỳ là số nguyên, tổng gốc đúng bằng số vay
  var ks = ctx.tinhLichTraNo(Object.assign({}, base, { hinhThuc:'khong_lai', soTienGoc:1000000, soThangVay:3 }));
  eq(ks.map(function(k){ return k.tongTra; }).join('+'), '333333+333333+333334', '1tr / 3 kỳ');
  var tr = ctx.tinhLichTraNo(Object.assign({}, base)); eq(tr.every(function(k){ return k.tongTra === 1000000; }), true, 'trả cố định 1tr: mọi kỳ đúng 1.000.000, kể cả kỳ cuối');
  var tongG = 0; tr.forEach(function(k){ tongG += k.goc; ok(k.goc === Math.round(k.goc) && k.lai === Math.round(k.lai), 'số nguyên'); }); eq(tongG, 10000000, 'tổng gốc');
  // lãi thực suy ra: SPayLater 10tr, 12 kỳ, phí 2,95%/tháng trên gốc = 833.333 + 295.000 = 1.128.333 mỗi tháng ≈ 5,00%/tháng ≈ 60%/năm
  near(ctx.laiThucNam({ hinhThuc:'tra_co_dinh', soTienGoc:10000000, soTienTraThang:1128333.33, soThangVay:12 }), 60, 0.3, 'SPayLater 12 kỳ ≈ 60%/năm');
  near(ctx.laiThucNam(base), 35.0, 0.3, 'khoản 10tr trả 1tr x 12 ≈ 35%/năm');
  eq(ctx.laiThucNam({ hinhThuc:'co_lai', soTienGoc:1, soTienTraThang:1, soThangVay:1 }), null, 'không phải trả cố định thì không hiện lãi thực');
  eq(ctx.laiThucNam({ hinhThuc:'tra_co_dinh', soTienGoc:12000000, soTienTraThang:1000000, soThangVay:12 }), null, 'không lãi thì null');
  // thẻ khoản vay hiện nhãn lãi thực; form có chip chọn cách chia
  setToday('2026-10-01');
  var d = baseData(); d.vayNo.vayNoPhaiTra = [Object.assign({}, base, { ngayVay:'2026-09-10', loaiVay:'ngan_hang', cachGoc:'giam' })]; loadData(d);
  var rv0 = ctx.renderVayNo; ctx.renderVayNo = renderThat.renderVayNo; var root = { innerHTML: '' };
  voiDom({ tabContent: root }, null, function(){ ctx.renderVayNo(); });
  ctx.renderVayNo = rv0;
  ok(root.innerHTML.indexOf('Lãi thực ≈ 35') > 0, 'thẻ khoản vay có nhãn Lãi thực ≈ 35%/năm');
  ctx.state.vnFormKind = 'vayNoPhaiTra'; ctx.state.vnFormId = null;
  var f = ctx.vayNoFormHtml();
  ok(f.indexOf('id="vn_vn_cachGoc"') > 0 && f.indexOf('Gốc chia đều + phí cố định') > 0 && f.indexOf('Lãi trên dư nợ giảm dần') > 0, 'form có chip chọn cách chia gốc');
  ctx.state.vnFormKind = null;
});

test('Tải dữ liệu về file .json rồi khôi phục: vòng khứ hồi giữ nguyên số dư, vay nợ, ví; file hỏng bị từ chối, không đoán', function(){
  setToday('2026-10-15');
  var d = baseData({ settings:{ soDuDauKy:5000000, ngayBatDau:'2026-09-01', thangBatDauDuTru:'2026-09' } });
  d.wallets = [{ id:'a', ten:'Tiền mặt', soDuDauKy:2000000 }, { id:'b', ten:'Techcom', soDuDauKy:3000000 }];
  d.vayNo.vayNoPhaiTra = [loanKhongLai({ id:'v1', ten:'Vay FE', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', hinhThuc:'tra_co_dinh', soTienTraThang:1100000, cachGoc:'giam' })];
  loadData(d);
  ctx.entryAddItem('2026-10-02', 'chi', 'an', 120000, 'phở', 'a'); ctx.entryAddItem('2026-10-05', 'thu', 'luong', 9000000, 'lương', 'b');
  ctx.chuyenViThem('2026-10-06', 'b', 'a', 1000000, 'rút'); ctx.invalidateBalanceCache();
  var truoc = { so: ctx.balanceAt('2026-10-31'), a: ctx.soDuTheoVi('a', '2026-10-31'), lich: JSON.stringify(ctx.tinhLichTraNo(ctx.state.data.vayNo.vayNoPhaiTra[0])) };
  var kq = ctx.docFileKhoiPhuc(JSON.stringify(ctx.state.data));
  ok(kq.data && !kq.loi, 'file xuất đọc lại được');
  loadData(kq.data); ctx.invalidateBalanceCache();
  eq(ctx.balanceAt('2026-10-31'), truoc.so, 'tổng số dư giữ nguyên'); eq(ctx.soDuTheoVi('a', '2026-10-31'), truoc.a, 'số dư từng ví giữ nguyên');
  eq(JSON.stringify(ctx.tinhLichTraNo(ctx.state.data.vayNo.vayNoPhaiTra[0])), truoc.lich, 'lịch trả (cả cachGoc) giữ nguyên');
  ok(ctx.docFileKhoiPhuc('\uFEFF' + JSON.stringify(ctx.state.data)).data, 'có BOM đầu file vẫn đọc được');
  ['', '   ', '{không phải json', '[]', '123', 'null', '{"a":1}', '{"journal":[]}', '{"journal":"x"}', '{"journal":{},"categories":[]}'].forEach(function(t){
    ok(ctx.docFileKhoiPhuc(t).loi && !ctx.docFileKhoiPhuc(t).data, 'từ chối: ' + t);
  });
  ok(ctx.docFileKhoiPhuc('{"journal":{}}').data, 'sổ trống tối thiểu vẫn hợp lệ (normalizeData điền phần thiếu)');
  eq(ctx.tenFileXuat(), 'so-tien-du-lieu_2026-10-15.json', 'tên file có ngày');
  if (ctx.BACKUP_GIU == null) ctx.BACKUP_GIU = 10;        // drive-sync.js không nạp trong test
  var cardH = ctx.backupCardHtml();
  ok(cardH.indexOf('data-act="bkTai"') > 0 && cardH.indexOf('id="bk_file"') > 0 && cardH.indexOf('accept=".json,application/json"') > 0, 'thẻ Sao lưu có nút Tải về máy và Khôi phục từ file');
  setToday('2026-10-01');
});

test('Khóa PIN: sai 5 lần phải chờ lâu dần (30 giây, 1, 2, 5, 15 phút), lưu trên máy nên tải lại trang không xóa được', function(){
  // lock.js chạm DOM nên không nạp cả file: cắt đúng khối hàm thuần ở đầu file
  var src = fs.readFileSync(path.join(JS_DIR, 'lock.js'), 'utf8');
  var i = src.indexOf('var KHOA_CHO_KEY'), j = src.indexOf('var _khoaSai');
  ok(i > 0 && j > i, 'tìm thấy khối hàm thuần');
  vm.runInContext(src.slice(i, j), ctx);
  eq([1, 2, 3, 4, 5, 6, 9].map(ctx.khoaChoGiay).join(','), '30,60,120,300,900,900,900', 'chờ tăng dần rồi giữ tối đa 15 phút');
  eq(ctx.khoaChoGiay(0), 30, 'đầu vào lạ về mức thấp nhất'); eq(ctx.khoaChoGiay(NaN), 30);
  eq(ctx.khoaChoChu(30), '30 giây'); eq(ctx.khoaChoChu(60), '1 phút'); eq(ctx.khoaChoChu(900), '15 phút');
  var luu = {}, ls0 = ctx.localStorage;
  ctx.localStorage = { getItem: function(k){ return k in luu ? luu[k] : null; }, setItem: function(k, v){ luu[k] = String(v); }, removeItem: function(k){ delete luu[k]; } };
  try{
    eq(JSON.stringify(ctx.khoaDocCho()), '{"lan":0,"den":0}', 'chưa có gì');
    ctx.khoaGhiCho({ lan: 3, den: 1234 }); eq(JSON.stringify(ctx.khoaDocCho()), '{"lan":3,"den":1234}', 'đọc lại đúng (giữ qua lần tải trang)');
    luu['chitieu_khoa_cho_v1'] = '{hỏng'; eq(JSON.stringify(ctx.khoaDocCho()), '{"lan":0,"den":0}', 'JSON hỏng: về mặc định, không báo lỗi');
    luu['chitieu_khoa_cho_v1'] = JSON.stringify({ lan: -5, den: 'x' }); eq(JSON.stringify(ctx.khoaDocCho()), '{"lan":0,"den":0}', 'số lạ bị chuẩn hóa');
  } finally { ctx.localStorage = ls0; }
});

test('Hôm nay còn tiêu được: ví dùng hằng ngày ít tiền hơn mức này thì báo; thẻ tín dụng và ví để dành không tính', function(){
  setToday('2026-10-10');
  var d = baseData({ settings:{ soDuDauKy:0, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:3100000 }];
  d.wallets = [{ id:'tm', ten:'Tiền mặt', soDuDauKy:50000 }, { id:'dd', ten:'Để dành', soDuDauKy:90000000, deDanh:true },
               { id:'the', ten:'Thẻ', soDuDauKy:0, the:true, hanMucThe:10000000, ngaySaoKe:25, ngayTraThe:15 }];
  loadData(d);
  var t = ctx.tieuMoiNgay('2026-10-10'); eq(Math.round(t.muc), 140909, 'mức/ngày = 3.100.000 ÷ 22 ngày còn lại (tính cả hôm nay)');
  eq(ctx.tieuViHangNgay('2026-10-10'), 50000, 'chỉ ví tiền mặt (ví để dành 90tr và thẻ không tính)');
  var h = ctx.tieuMoiNgayHtml('2026-10-10');
  ok(h.indexOf('Ví dùng hằng ngày chỉ còn <b>50.000') > 0, 'báo ví chỉ còn 50.000: ' + h);
  ctx.entryAddItem('2026-10-05', 'thu', 'luong', 5000000, 'lương', 'tm'); ctx.invalidateBalanceCache();
  ok(ctx.tieuMoiNgayHtml('2026-10-10').indexOf('Ví dùng hằng ngày') < 0, 'ví đủ tiền thì không báo');
  d.wallets = [{ id:'tm', ten:'Tiền mặt', soDuDauKy:-200000 }]; loadData(d);
  ok(ctx.tieuMoiNgayHtml('2026-10-10').indexOf('đang âm <b>200.000') > 0, 'ví âm thì báo đang âm');
  d.wallets = [{ id:'dd', ten:'Để dành', soDuDauKy:90000000, deDanh:true }]; loadData(d);
  eq(ctx.tieuViHangNgay('2026-10-10'), null, 'chỉ có ví để dành: không có số để so'); ok(ctx.tieuMoiNgayHtml('2026-10-10').indexOf('Ví dùng hằng ngày') < 0);
  setToday('2026-10-01');
});

test('Người mới: sổ trống thì có thẻ Bắt đầu 3 bước, Dòng tiền và Báo cáo chỉ hiện một thẻ trống; có dữ liệu thì mọi thứ biến mất', function(){
  setToday('2026-10-15');
  var ls0 = ctx.localStorage, luu = {};
  ctx.localStorage = { getItem: function(k){ return k in luu ? luu[k] : null; }, setItem: function(k, v){ luu[k] = String(v); }, removeItem: function(k){ delete luu[k]; } };
  try{
    loadData(baseData({ settings:{ soDuDauKy:0, ngayBatDau:'2026-10-15', thangBatDauDuTru:'2026-10' } }));
    eq(ctx.soChuaCoDuLieu(), true, 'sổ mới tinh là sổ trống');
    var hd = ctx.huongDanHtml();
    ok(hd.indexOf('id="cardHuongDan"') > 0 && hd.indexOf('0/3') > 0 && hd.indexOf('Đặt số dư các ví') > 0 && hd.indexOf('Ghi khoản đầu tiên') > 0 && hd.indexOf('Đặt hạn mức') > 0, 'thẻ Bắt đầu 0/3');
    // Dòng tiền: một thẻ thay cho bảng 12 tháng toàn số 0
    var root = { innerHTML: '' }, vd = function(fn){ voiDom({ tabContent: root }, null, fn); };
    vd(function(){ ctx.renderDongTien(); });
    ok(root.innerHTML.indexOf('Chưa có gì để dự báo') > 0 && root.innerHTML.indexOf('data-act="qaMo"') > 0 && root.innerHTML.indexOf('dt-ml') < 0, 'Dòng tiền: màn trống gọn, không có bảng tháng');
    vd(function(){ ctx.renderBaoCao(); });
    ok(root.innerHTML.indexOf('Chưa có gì để báo cáo') > 0 && root.innerHTML.indexOf('cardHanMuc') < 0 && root.innerHTML.indexOf('cardNgayTuDo') < 0, 'Báo cáo: một thẻ trống thay cho các thẻ trống');
    // bỏ qua: nhớ trên máy, không đổi dữ liệu
    var truoc = JSON.stringify(ctx.state.data); ctx.huongDanBo(); eq(ctx.huongDanHtml(), '', 'bấm Bỏ qua thì thẻ ẩn'); eq(JSON.stringify(ctx.state.data), truoc, 'không đổi dữ liệu');
    luu = {};
    // làm dần từng bước
    var d = baseData({ settings:{ soDuDauKy:0, ngayBatDau:'2026-10-15', thangBatDauDuTru:'2026-10' } }); d.wallets = [{ id:'a', ten:'Tiền mặt', soDuDauKy:2000000 }]; loadData(d);
    ok(ctx.huongDanHtml().indexOf('1/3') > 0, 'đặt số dư xong: 1/3');
    ctx.entryAddItem('2026-10-15', 'chi', 'an', 50000, 'phở', 'a'); ctx.invalidateBalanceCache();
    ok(ctx.huongDanHtml().indexOf('2/3') > 0 && ctx.soChuaCoDuLieu() === false, 'ghi khoản đầu tiên: 2/3, không còn là sổ trống');
    vd(function(){ ctx.renderDongTien(); }); ok(root.innerHTML.indexOf('Chưa có gì để dự báo') < 0, 'có dữ liệu: Dòng tiền vẽ đủ');
    ctx.state.data.categories.chi[0].chiTieu = 3000000;
    eq(ctx.huongDanHtml(), '', 'đủ 3 bước thì thẻ tự biến mất');
    // người dùng cũ (đã có giao dịch và hạn mức): không bao giờ thấy thẻ
    loadData(dataBaoCao()); eq(ctx.huongDanHtml(), '', 'sổ đang dùng không có thẻ Bắt đầu');
    // chỉ có hạn mức (chưa có giao dịch): Dòng tiền vẫn dự báo theo hạn mức nên không phải màn trống
    var d2 = baseData({ settings:{ soDuDauKy:0, ngayBatDau:'2026-10-15', thangBatDauDuTru:'2026-10' } }); d2.categories.chi[0].chiTieu = 3000000; loadData(d2);
    eq(ctx.soChuaCoDuLieu(), false, 'đặt hạn mức rồi thì không còn là sổ trống');
  } finally { ctx.localStorage = ls0; setToday('2026-10-01'); }
});

test('Vay "Trả 1 lần" có lãi đơn và "Lãi hằng tháng, gốc cuối kỳ": số tính tay', function(){
  var base = { id:'x', ten:'Vay', soTienGoc:10000000, ngayVay:'2026-01-10', ngayTraHangThang:10, traNo:[], trangThai:'dang_vay' };
  // trả 1 lần 10tr, 12%/năm, 6 tháng: lãi đơn 10tr × 12% × 6/12 = 600.000 -> 10.600.000
  var a = ctx.tinhLichTraNo(Object.assign({}, base, { hinhThuc:'tra_1_lan', laiSuatNam:12, soThangVay:6 }));
  eq(a.length, 1); eq(a[0].tongTra, 10600000, '10tr + 600k lãi'); eq(a[0].lai, 600000); eq(a[0].goc, 10000000); eq(a[0].mk, '2026-07');
  eq(ctx.tinhLichTraNo(Object.assign({}, base, { hinhThuc:'tra_1_lan', soThangVay:6 }))[0].tongTra, 10000000, 'không nhập lãi thì như cũ: chỉ trả gốc');
  // đáo hạn theo ngày, không nhập kỳ hạn: tính số tháng từ ngày vay (T1) tới tháng đáo hạn (T4) = 3 tháng -> lãi 300.000
  eq(ctx.tinhLichTraNo(Object.assign({}, base, { hinhThuc:'tra_1_lan', laiSuatNam:12, ngayDaoHan:'2026-04-10' }))[0].lai, 300000, 'lãi theo 3 tháng từ ngày vay tới ngày đáo hạn');
  // lãi hằng tháng, gốc cuối kỳ: 10tr, 12%/năm, 6 tháng -> mỗi tháng 100.000, kỳ cuối 100.000 + 10.000.000
  var b = ctx.tinhLichTraNo(Object.assign({}, base, { hinhThuc:'lai_goc_cuoi', laiSuatNam:12, soThangVay:6 }));
  eq(b.length, 6); eq(b.slice(0, 5).every(function(k){ return k.tongTra === 100000 && k.goc === 0; }), true, '5 tháng đầu chỉ trả lãi 100.000');
  eq(b[5].tongTra, 10100000, 'kỳ cuối lãi + gốc'); eq(b[5].duNoConLai, 0); eq(b[0].duNoConLai, 10000000, 'dư nợ gốc không giảm trước kỳ cuối');
  var tl = 0; b.forEach(function(k){ tl += k.lai; }); eq(tl, 600000, 'tổng lãi 600.000');
  // không lãi suất: chỉ có kỳ cuối (trả gốc), không có kỳ 0 đồng
  var c = ctx.tinhLichTraNo(Object.assign({}, base, { hinhThuc:'lai_goc_cuoi', laiSuatNam:0, soThangVay:6 }));
  eq(c.length, 1); eq(c[0].tongTra, 10000000); eq(c[0].mk, '2026-07');
  ctx.state.vnFormKind = 'vayNoPhaiTra'; ctx.state.vnFormId = null;
  var f = ctx.vayNoFormHtml(); ok(f.indexOf('Lãi hằng tháng, gốc cuối kỳ') > 0, 'form có hình thức mới'); ok(/data-ht="[^"]*tra_1_lan[^"]*"[^>]*><div class="qa-lbl">Lãi suất/.test(f), 'ô lãi suất hiện cho Trả 1 lần'); ctx.state.vnFormKind = null;
});

test('Bảng thuật ngữ: mỗi tên trong THUAT_NGU còn thật sự xuất hiện trong giao diện; thẻ có trong Cài đặt → Ứng dụng; không có tên cũ', function(){
  var files = fs.readdirSync(JS_DIR).filter(function(f){ return /\.js$/.test(f) && f !== 'danhmuc.js'; });
  var tat = files.map(function(f){ return fs.readFileSync(path.join(JS_DIR, f), 'utf8'); }).join('\n');
  ok(ctx.THUAT_NGU.length >= 10, 'có bảng');
  ctx.THUAT_NGU.forEach(function(t){
    t.ten.split(', ').forEach(function(ten){ ok(tat.indexOf(ten) >= 0, 'tên "' + ten + '" không còn trong giao diện (đổi tên thì đổi cả bảng thuật ngữ)'); });
    ok(t.nghia.length > 20 && t.nghia.indexOf('undefined') < 0, 'định nghĩa của "' + t.ten + '"');
  });
  var h = ctx.thuatNguCardHtml(); ok(h.indexOf('Các số trong app nghĩa là gì') > 0 && h.indexOf('Để dành được') > 0 && h.indexOf('Tiền vào − ra') > 0, 'thẻ hiện bảng');
  var all = fs.readdirSync(JS_DIR).map(function(f){ return fs.readFileSync(path.join(JS_DIR, f), 'utf8'); }).join('\n');
  ok(all.indexOf("'Dư thật'") < 0 && all.indexOf("'Cân đối'") < 0 && all.indexOf('>Dư thật<') < 0, 'không còn nhãn cũ Dư thật / Cân đối trong code');
});

test('Không có hai file js định nghĩa cùng một tên hàm (36 file chung một không gian tên: trùng tên là file nạp sau âm thầm đè file trước)', function(){
  var seen = {}, trung = [];
  fs.readdirSync(JS_DIR).filter(function(f){ return /\.js$/.test(f); }).forEach(function(f){
    var src = fs.readFileSync(path.join(JS_DIR, f), 'utf8'), re = /(?:^|\n)(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g, m;      // chỉ hàm ở cột 0 (toàn cục); hàm lồng trong hàm khác không đè gì
    while ((m = re.exec(src))){ if (seen[m[1]] && seen[m[1]] !== f) trung.push(m[1] + ' (' + seen[m[1]] + ' và ' + f + ')'); else seen[m[1]] = f; }
  });
  eq(trung.join(', '), '', 'hàm trùng tên giữa các file');
});

test('Nhật ký cập nhật (phienban.js): đúng định dạng, mới nhất ở đầu, viết cho người dùng; thẻ Phiên bản và cập nhật hiện đúng trạng thái', function(){
  ok(ctx.NHAT_KY.length >= 3, 'có nhật ký');
  var truoc = '9999-99-99', ban = {};
  ctx.NHAT_KY.forEach(function(m){
    ok(/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/.test(m.ban), 'số phiên bản ' + m.ban);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(m.ngay) && !isNaN(Date.parse(m.ngay)), 'ngày ' + m.ngay);
    ok(m.ban.indexOf(m.ngay.replace(/-/g, '.')) === 0, 'số phiên bản ' + m.ban + ' phải bắt đầu bằng ngày ' + m.ngay);
    ok(m.ngay <= truoc, 'mới nhất ở đầu: ' + m.ngay + ' sau ' + truoc); truoc = m.ngay;
    ok(!ban[m.ban], 'trùng số phiên bản ' + m.ban); ban[m.ban] = 1;
    ok(m.ten && m.muc.length >= 1, 'có tiêu đề và ít nhất một mục');
    m.muc.forEach(function(x){ ok(x.length > 15 && !/\.js\b|function |=>/.test(x), 'mục viết cho người dùng, không nhắc tên file / hàm: ' + x); });
  });
  eq(ctx.PHIEN_BAN, ctx.NHAT_KY[0].ban, 'PHIEN_BAN là mục đầu');
  ctx.state.coBanMoi = false;
  var h = ctx.phienBanCardHtml();
  ok(h.indexOf('Phiên bản và cập nhật') > 0 && h.indexOf(ctx.PHIEN_BAN) > 0 && h.indexOf('data-act="kiemTraMoi"') > 0 && h.indexOf('capNhatApp') < 0, 'chưa có bản mới: nút Kiểm tra');
  ok(h.indexOf(ctx.NHAT_KY[0].ten) > 0 && h.indexOf('Xem các bản trước (' + (ctx.NHAT_KY.length - 1) + ')') > 0 && h.indexOf(ctx.NHAT_KY[1].ten) > 0, 'bản mới nhất mở sẵn, các bản trước gập lại');
  ctx.state.coBanMoi = true;
  var h2 = ctx.phienBanCardHtml();
  ok(h2.indexOf('data-act="capNhatApp"') > 0 && h2.indexOf('kiemTraMoi') < 0 && h2.indexOf('Có bản mới') > 0, 'có bản mới: nút Cập nhật ngay');
  ctx.state.coBanMoi = false;
  ok(/tab === 'ungdung'\) return[^\n]*phienBanCardHtml\(\)/.test(fs.readFileSync(path.join(JS_DIR, 'danhmuc.js'), 'utf8')), 'thẻ nằm trong Cài đặt → Ứng dụng (phần Ứng dụng cần drive-sync.js nên không dựng cả trang trong test)');
});

group('U. Điện thoại: Dòng tiền xem từng tháng, bảng Vay-Nợ dạng thẻ, Đăng xuất ở Cài đặt');

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
  ok(h.indexOf('Nợ sau khi trừ tiền cho vay') >= 0 && h.indexOf('4.900.000') >= 0, 'nợ sau khi trừ cho vay = nợ − cho vay chờ thu (500.000)');
  ok(h.indexOf('Còn phải trả (gồm lãi)') >= 0, 'nhãn rõ gồm lãi');
  ok(h.indexOf('vn-sub">gốc <b>') < 0, 'khoản không lãi: không hiện dòng tách gốc / lãi');
  ok(h.indexOf('<b>60%</b>') >= 0, 'tháng này đã trả 600.000 / 1.000.000');
  ok(h.indexOf('kỳ 1') >= 0 || h.indexOf('Kỳ 1 còn thiếu') >= 0, 'thẻ ghi rõ kỳ đang trả dở còn thiếu');
  setToday('2026-10-01');
});

test('Đăng xuất không còn ở thanh đầu trang mà ở tab Cài đặt', function(){
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
  var hAll = ctx.viCardHtml(), h = hAll.replace(/<details class="giai-thich">[\s\S]*?<\/details>/g, '');      // hàng ví, bỏ mục gập giải thích
  ok(!/1[.,]?234[.,]?567/.test(h.replace(/Trong sổ [0-9.,]+/g, '')), 'thẻ ví không hiện số dư ĐẦU KỲ (chỉ có thêm số dư hiện tại trong sổ, ghi rõ "Trong sổ")');
  ok(/Số trong sổ của ví[\s\S]*1\.234\.567 \+ [\s\S]*=/.test(hAll), 'mục giải thích có ví dụ số: đầu kỳ + thay đổi = số trong sổ');
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
  ok(h.indexOf('Số dư tính cả khoản đến hạn') >= 0, 'có ô Số dư tính cả khoản đến hạn (không còn gọi là "hiện tại" để khỏi nhầm với số dư ở Sổ tay)');
  ok(h.indexOf(ctx.fmt(21000000)) >= 0, 'giá trị đã điều chỉnh 21tr: ' + h.slice(h.indexOf('Số dư tính cả khoản đến hạn'), h.indexOf('Số dư tính cả khoản đến hạn') + 400));
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
  ok(h.indexOf('Tiền vào − ra tháng') >= 0 && h.indexOf('id="dtDau"') >= 0, 'thẻ đầu');
  ok(h.indexOf('Thu nhập tháng 10') >= 0 && h.indexOf('Chi theo hạn mức') >= 0 && h.indexOf('Dòng tiền tích lũy tương lai') >= 0);
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
  ok(root.innerHTML.indexOf('Số dư cuối tháng') >= 0 && root.innerHTML.indexOf('Ẩn bảng cả năm') >= 0, 'bảng cả năm hiện sau nút');
  ctx.state.dtBangNam = false; ctx.state.dtMoDong = null; ctx.state.dtMk = null;
  setToday('2026-10-01');
});

test('Dòng tiền: dtDuKienRows có tài sản ròng = lũy kế + cho vay chưa thu − nợ gốc còn lại; bảng có cột Tài sản ròng', function(){
  setToday('2026-10-10');
  var d = dataDongTien();
  d.vayNo = { choVay: [{ id:'cv', ten:'A', soTien:3000000, daThu:0, ngayChoVay:'2026-10-05', ngayDuKienThu:'2026-12-15', trangThai:'dang_cho' }],
    vayNoPhaiTra: [loanKhongLai({ id:'v1', soTienGoc:6000000, soThangVay:6, ngayVay:'2026-09-10', ngayTraHangThang:10 })] };   // kỳ T10..T3, 1tr/kỳ
  loadData(d);
  var rows = ctx.dtDuKienRows(4);
  // T10: phải thu 3tr, nợ còn 5tr · T11: 3tr, 4tr · T12: thu về nên phải thu 0, nợ 3tr · T1: 0, 2tr
  var delta = rows.map(function(r){ return Math.round(r.rong - r.bal); });
  eq(JSON.stringify(delta), JSON.stringify([3000000 - 5000000, 3000000 - 4000000, 0 - 3000000, 0 - 2000000]), 'ròng − lũy kế = phải thu − nợ gốc');
  var html = ctx.dtDuKienHtml(rows, '2026-10');
  ok(html.indexOf('Tài sản ròng') >= 0 && html.indexOf('dt-ml4') >= 0, 'bảng có cột Tài sản ròng');
  ok(ctx.coCotTaiSanRong(rows), 'có nợ / cho vay đang mở thì hiện cột');
  // hết nợ, không cho vay: ròng = lũy kế nên bỏ cột
  d.vayNo = { choVay: [], vayNoPhaiTra: [] };
  loadData(d);
  var rows2 = ctx.dtDuKienRows(4), html2 = ctx.dtDuKienHtml(rows2, '2026-10');
  ok(!ctx.coCotTaiSanRong(rows2), 'không nợ không cho vay thì không có cột');
  ok(html2.indexOf('Tài sản ròng') < 0 && html2.indexOf('dt-ml4') < 0, 'bảng không còn cột Tài sản ròng');
  // khoản vay đã trả hết ở các tháng xa vẫn hiện cột nếu còn tháng nào trong bảng có nợ
  d.vayNo = { choVay: [], vayNoPhaiTra: [loanKhongLai({ id:'v1', soTienGoc:2000000, soThangVay:2, ngayVay:'2026-09-10', ngayTraHangThang:10 })] };   // trả T10, T11
  loadData(d);
  ok(ctx.coCotTaiSanRong(ctx.dtDuKienRows(4)), 'còn nợ ở T10 nên bảng 4 tháng vẫn hiện cột');
  ok(!ctx.coCotTaiSanRong(ctx.dtDuKienRows(4).slice(2)), 'từ T12 trở đi đã hết nợ nên đoạn đó không cần cột');
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

test('Mô phỏng: mpTinhVay trả cố định 150tr/9%/36 tháng = 4.769.960, tổng lãi 21.718.560; gốc đều thì giảm dần', function(){
  var a = ctx.mpTinhVay({ hinhThuc:'co_lai', soTien:150000000, laiSuatNam:9, soThang:36, mkTu:'2026-11' });
  eq(Math.round(a.tra), 4769960); eq(Math.round(a.tongLai), 21718560);   // = 4.769.960 × 36 − 150.000.000 (lịch đã làm tròn về đồng, số trả mỗi kỳ đúng 4.769.960) eq(a.hetMk, '2029-11');
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
  var iHero = st.indexOf('function tongQuanHtml'), iThe = st.indexOf("viTheHtml(mk, beforeLock))"), i = st.indexOf('html += viSoDuCardHtml(mk);');
  ok(iThe > iHero && st.indexOf('html += viTheHtml(') < 0 && i > iThe, 'dải thẻ ví nằm TRONG thẻ tổng quan, ngay dưới số dư, trước thẻ chuyển ví');
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
  ok(tq.indexOf('class="bd-extra dong"') > 0 && tq.indexOf('data-act="bdMo"') > 0 && tq.indexOf('bd-cal') > tq.indexOf('id="bdExtra_tq"') && tq.indexOf('Phân tích') < tq.indexOf('id="bdExtra_tq"'), 'chi tiết từng ngày nằm trong phần gập, Phân tích nằm ngoài');
  ctx.state.bdMo = { tq: true }; var tqMo = ctx.bieuDoCardHtml('2026-10'); ok(tqMo.indexOf('class="bd-extra"') > 0 && tqMo.indexOf('Thu gọn') > 0, 'mở thì hiện hết và nút đổi thành Thu gọn'); ctx.state.bdMo = {};
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
  ok(h.indexOf('Hôm nay') > 0 && h.indexOf('đã qua 18/31 ngày') > 0 && h.indexOf('class="bc-chip red"') > 0 && h.indexOf('class="bc-chip amber"') > 0, 'vạch Hôm nay + chip vượt + chip mục tiêu quá hạn');
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
  ok(h.indexOf('id="cardTaiSanRong"') > 0 && h.indexOf('tsr-tbl') > 0 && h.indexOf('Số dư các ví') > 0, 'số lớn + bảng thành phần');
  ok(/so với 9 tháng trước/.test(h), 'dữ liệu bắt đầu 01/2026 nên so với 9 tháng trước, không nói 12');
  var root = { innerHTML: '' }; ctx.state.soTayMonth = '2026-10';
  voiDom({ tabContent: root }, null, function(){ ctx.renderBaoCao(); });
  var pos = function(id){ return root.innerHTML.indexOf('id="' + id + '"'); };
  ok(pos('cardHanMuc') > 0 && pos('cardHanMuc') < pos('cardTaiSanRong') && pos('cardTaiSanRong') < pos('cardMucTieu'), 'thứ tự mặc định: hạn mức, tài sản ròng, mục tiêu');
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
  ctx.state.bdMo = {}; ctx.handleBieuDoAction('bdMo', el({})); eq(ctx.state.bdMo.tq, true, 'không có data-k thì là khóa tq, bấm thì mở'); ctx.handleBieuDoAction('bdMo', el({})); eq(ctx.state.bdMo.tq, false, 'bấm lại thì gập');
  ctx.handleBieuDoAction('bdMo', el({ 'data-k': 'th' })); eq(ctx.state.bdMo.th, true, 'mỗi khóa độc lập'); eq(!!ctx.state.bdMo.xh, false); ctx.state.bdMo = {};
  eq(ctx.handleBieuDoAction('khac', el({})), false);
  eq(JSON.stringify(ctx.state.data), kt, 'không đụng dữ liệu');
  ctx.state.bdTab = 'tq'; ctx.state.bdMode = 'vong'; ctx.state.bdDay = null;
});

test('Chart.js đã gỡ: không còn nạp thư viện, không còn <canvas> biểu đồ', function(){
  var root = path.join(__dirname, '..');
  ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').indexOf('chart.js') < 0, 'index.html còn nạp Chart.js');
  ['sotay.js', 'vayno-tinh.js', 'vayno.js', 'mophong.js'].forEach(function(f){
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
group('TD. Bảng theo dõi (Vay - Nợ) + Dòng tiền tích lũy tương lai (Dòng tiền)');

var tdVay = function(traNo, over){ var d = baseData(); d.vayNo.vayNoPhaiTra = [loanKhongLai(Object.assign({ traNo: traNo }, over || {}))]; loadData(d); return ctx.vnBangTheoDoi(4); };

test('Bảng theo dõi — trả nợ: chưa trả thì dự kiến to / đã 0; kỳ quá hạn dồn vào tháng này; tháng sau theo lịch', function(){
  setToday('2026-12-10');                                   // kỳ 0 = T11 (quá hạn), kỳ 1 = T12 (tháng này), kỳ 2 = T1/27
  var r = tdVay([]);
  eq(r.length, 4); eq(r[0].mk, '2026-12', 'bắt đầu từ tháng này');
  eq(r[0].tra.need, 2000000, 'T12 + kỳ T11 quá hạn'); eq(r[0].tra.da, 0); eq(r[0].tra.done, false);
  eq(r[0].tra.items.filter(function(x){ return x.quaHan; }).length, 1, 'đánh dấu kỳ quá hạn');
  eq(r[1].tra.need, 1000000, 'T1/27 theo lịch'); eq(r[1].tra.done, false);
  eq(r[0].thu.items.length, 0, 'không có cho vay thì ô thu trống');
});

test('Bảng theo dõi — Done ghi TIỀN THẬT: trả 900.000 / dự kiến 1.000.000 mà đã đóng kỳ vẫn hiện 900.000/1.000.000 + Done', function(){
  setToday('2026-12-10');
  var r = tdVay([{ ky:0, mk:'2026-11', soTien:1000000, ngay:'2026-11-05', dongKy:true }, { ky:1, mk:'2026-12', soTien:900000, ngay:'2026-12-05', dongKy:true }]);
  eq(r[0].tra.items.length, 1, 'kỳ T11 đã đóng từ tháng trước thì không hiện nữa');
  eq(r[0].tra.da, 900000, 'số thật'); eq(r[0].tra.need, 1000000, 'số dự kiến'); eq(r[0].tra.done, true, 'Done dù ít hơn dự kiến');
  var h = (function(){ var d = ctx.state.data; ctx.state.vnHorizon = 6; return ctx.vnBangTheoDoiHtml(); })();
  ok(h.indexOf('<small>900.000</small><i>/</i> <b>1.000.000</b>') >= 0, 'hiển thị "đã nhỏ / dự kiến to": ' + h.slice(h.indexOf('td-r'), h.indexOf('td-r') + 400));
  ok(h.indexOf('>Done<') >= 0, 'có nhãn Done');
});

test('Bảng theo dõi — trả dở chưa đóng kỳ: chưa Done; kỳ cũ đóng muộn trong tháng này thì vẫn hiện; trả sớm kỳ sau thì Done', function(){
  setToday('2026-12-10');
  var r = tdVay([{ ky:1, mk:'2026-12', soTien:400000, ngay:'2026-12-05', dongKy:false }]);
  eq(r[0].tra.da, 400000, 'đã trả 400k'); eq(r[0].tra.done, false, 'chưa đóng kỳ -> chưa Done');
  r = tdVay([{ ky:0, mk:'2026-11', soTien:1000000, ngay:'2026-12-02', dongKy:true }]);
  eq(r[0].tra.items.some(function(x){ return x.nhan === 'kỳ 1' && x.done && x.da === 1000000; }), true, 'kỳ T11 đóng muộn ở T12 vẫn hiện ở tháng này, Done');
  r = tdVay([{ ky:2, mk:'2027-01', soTien:1000000, ngay:'2026-12-08', dongKy:true }]);
  eq(r[1].tra.done, true, 'trả sớm kỳ T1/27: tháng đó Done'); eq(r[1].tra.da, 1000000);
});

test('Bảng theo dõi — khoản vay đã tất toán: kỳ chưa trả biến mất, số tất toán là 1 dòng Done ở tháng tất toán', function(){
  setToday('2026-12-10');
  var r = tdVay([], { tatToan:{ soTien:5000000, ngay:'2026-12-08' }, trangThai:'da_tra_het' });
  eq(r[0].tra.items.length, 1, 'chỉ còn dòng tất toán'); eq(r[0].tra.items[0].nhan, 'tất toán');
  eq(r[0].tra.da, 5000000); eq(r[0].tra.need, 5000000); eq(r[0].tra.done, true); eq(r[1].tra.items.length, 0, 'tháng sau không còn kỳ nào');
});

test('Bảng theo dõi — thu tiền: theo ngày dự kiến thu (quá hạn dồn vào tháng này); thu đủ thì Done; tất toán thu thiếu: số thật = phần đã thu', function(){
  setToday('2026-12-10');
  var d = baseData();
  d.vayNo.choVay = [
    { id:'cvA', ten:'A', soTien:500000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', ngayDuKienThu:'2027-01-15' },
    { id:'cvB', ten:'B', soTien:300000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', ngayDuKienThu:'2026-11-30' },
    { id:'cvC', ten:'C', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-10-01', ngayDuKienThu:'' }
  ];
  loadData(d);
  var cv = ctx.state.data.vayNo.choVay;
  var r = ctx.vnBangTheoDoi(3);
  eq(r[1].thu.need, 500000, 'A ở T1/27'); eq(r[1].thu.da, 0); eq(r[1].thu.done, false);
  eq(r[0].thu.items.filter(function(x){ return x.quaHan; }).length, 1, 'B quá hạn dồn vào tháng này');
  ctx.choVayGhiThu(cv[1], 100000, '2026-12-05', '', false);
  r = ctx.vnBangTheoDoi(3);
  eq(r[0].thu.items.filter(function(x){ return x.ten === 'B'; })[0].da, 100000, 'B đã thu 100k'); eq(r[0].thu.done, false, 'còn khoản chưa xong');
  ctx.choVayGhiThu(cv[1], 200000, '2026-12-06', '', false);                 // B thu nốt -> Done, vẫn hiện ở tháng thu
  ctx.choVayGhiThu(cv[2], 600000, '2026-12-09', '', true);                  // C: thu 600k, phần thiếu 400k xóa nợ -> Done
  r = ctx.vnBangTheoDoi(3);
  var B = r[0].thu.items.filter(function(x){ return x.ten === 'B'; })[0], C = r[0].thu.items.filter(function(x){ return x.ten === 'C'; })[0];
  eq(B.done, true); eq(B.da, 300000); eq(B.need, 300000);
  eq(C.done, true); eq(C.da, 600000, 'C: số thật = 600.000'); eq(C.need, 600000, 'C: dự kiến sau xóa nợ = 600.000');
  eq(r[0].thu.done, true, 'cả tháng này xong'); eq(r[1].thu.done, false, 'A tháng sau chưa');
});

test('Bảng theo dõi: ô hiển thị — tháng trống là "–", mở rộng một tháng thấy từng khoản, không có khoản nào thì ẩn thẻ', function(){
  setToday('2026-12-10');
  var d = baseData(); loadData(d);
  eq(ctx.vnBangTheoDoiHtml(), '', 'chưa có khoản nào -> ẩn');
  tdVay([]);
  ctx.state.vnHorizon = 6; ctx.state.vnTdMo = null;
  var h = ctx.vnBangTheoDoiHtml();
  ok(h.indexOf('Bảng theo dõi') >= 0 && h.indexOf('Số tiền trả') >= 0 && h.indexOf('Số tiền thu') >= 0, 'tiêu đề + 2 cột');
  eq((h.match(/class="td-r/g) || []).length, 6, '6 tháng -> 6 dòng'); ok(h.indexOf('td-c rong">–') >= 0, 'ô trống là –');
  ok(h.indexOf('td-ct') < 0, 'chưa mở rộng');
  ctx.state.vnTdMo = '2026-12'; h = ctx.vnBangTheoDoiHtml();
  ok(h.indexOf('td-ct') >= 0 && h.indexOf('Vay test') >= 0 && h.indexOf('quá hạn') >= 0, 'mở rộng thấy từng khoản + quá hạn');
  ctx.state.vnTdMo = null; ctx.state.vnHorizon = 24; eq((ctx.vnBangTheoDoiHtml().match(/class="td-r/g) || []).length, 24, '24 tháng -> 24 dòng');
  ctx.state.vnHorizon = 12;
});

test('Dòng tiền tích lũy tương lai (tab Dòng tiền): đủ số tháng đã chọn, 3 cột Tháng / Tiền vào − ra / Số dư, có số cuối kỳ + thấp nhất', function(){
  setToday('2026-12-10');
  loadData(baseData());
  var rows = ctx.dtDuKienRows(24), dem = function(){ return (ctx.dtDuKienHtml(rows, '2026-12').match(/class="dt-ml-r/g) || []).length; };
  ctx.state.dtHorizon = 12; var h = ctx.dtDuKienHtml(rows, '2026-12');
  ok(h.indexOf('Dòng tiền tích lũy tương lai') >= 0, 'tiêu đề');
  ok(h.indexOf('<span>Tháng</span><span>Tiền vào − ra</span><span>Số dư</span>') >= 0, 'đúng 3 cột');
  ok(h.indexOf('Số dư dự kiến cuối') >= 0 && h.indexOf('Thấp nhất') >= 0, 'số cuối kỳ + thấp nhất');
  ok(h.indexOf('Xem cả') < 0 && h.indexOf('Chi</span>') < 0, 'không còn nút Xem cả / cột Chi');
  eq(dem(), 12, '12 tháng'); ctx.state.dtHorizon = 6; eq(dem(), 6, '6 tháng'); ctx.state.dtHorizon = 24; eq(dem(), 24, '24 tháng');
  ctx.state.dtHorizon = 12;
});

/* ==================================================================== */
group('DK. Bảng màu chế độ tối: khung không chìm vào nền, chữ đủ tương phản');

test('dark: thẻ / viền / khung con tách khỏi nền; chữ chính, chữ phụ, số xanh / đỏ, nút đặc và chip Done đọc được (WCAG)', function(){
  var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  var i = css.indexOf('[data-theme="dark"]{'), blk = css.slice(i, css.indexOf('}', i));
  var v = function(n){ var m = new RegExp('--' + n + ':\\s*(#[0-9a-fA-F]{6})').exec(blk); ok(m, 'thiếu biến --' + n + ' trong khối dark'); return m[1]; };
  var lum = function(h){ var c = [1, 3, 5].map(function(k){ var x = parseInt(h.substr(k, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  var cr = function(a, b){ var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  var bg = v('bg'), card = v('card'), border = v('border'), hover = v('hover'), text = v('text'), muted = v('muted'), green = v('green'), red = v('red');
  ok(cr(card, bg) >= 1.25, 'thẻ phải sáng hơn nền (>= 1,25), đang ' + cr(card, bg).toFixed(2));
  ok(cr(border, card) >= 1.5, 'viền phải nổi so với thẻ (>= 1,5), đang ' + cr(border, card).toFixed(2));
  ok(cr(hover, card) >= 1.2, 'khung con (--hover) phải tách khỏi thẻ (>= 1,2), đang ' + cr(hover, card).toFixed(2));
  ok(cr(v('row-total'), card) >= 1.1, 'dòng tổng phải khác màu thẻ');
  [['chữ chính / thẻ', text, card], ['chữ phụ / thẻ', muted, card], ['chữ phụ / khung con', muted, hover], ['số xanh / khung con', green, hover],
   ['số đỏ / khung con', red, hover], ['số đỏ / dòng đang chọn', red, v('row-bal')], ['chữ trắng / nút đặc (chi-solid)', '#ffffff', v('chi-solid')],
   ['chữ trắng / chip Done (thu-solid)', '#ffffff', v('thu-solid')]].forEach(function(r){
    ok(cr(r[1], r[2]) >= 4.5, r[0] + ' cần >= 4,5, đang ' + cr(r[1], r[2]).toFixed(2));
  });
});

/* ==================================================================== */
group('IMG. Ảnh nền được tham chiếu trong CSS phải tồn tại');
test('mọi url(img/...) trong style.css trỏ tới file có thật (nền họa tiết)', function(){
  var root = path.join(__dirname, '..');
  var css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  var dung = {}, re = /url\(\s*['"]?(img\/[^)'"\s]+)['"]?\s*\)/g, m;
  while ((m = re.exec(css))) dung[m[1]] = 1;
  var ds = Object.keys(dung);
  ok(ds.length >= 2, 'phải có ít nhất 2 ảnh nền (nen-sang, nen-toi), thấy ' + ds.length);
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
group('TB. Thanh tab dưới đáy luôn dính đáy phần nhìn thấy (iOS)');

test('coBanPhim: chỉ coi là bàn phím khi phần nhìn thấy thấp hơn khung layout > 150px (lỗi khung layout ngắn hơn không bị nhầm)', function(){
  eq(uiCtx.coBanPhim(780, 780), false, 'bình thường');
  eq(uiCtx.coBanPhim(780, 420), true, 'bàn phím iOS mở');
  eq(uiCtx.coBanPhim(780, 700), false, 'thanh địa chỉ Safari co giãn ~80px: không phải bàn phím');
  eq(uiCtx.coBanPhim(500, 780), false, 'khung layout NGẮN hơn phần nhìn thấy (lỗi iOS): không phải bàn phím');
});

test('Thanh tab luôn đứng yên: không dùng View Transitions, không dịch thanh theo số đo, đặt theo đáy phần nhìn thấy', function(){
  var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  var mo = fs.readFileSync(path.join(JS_DIR, 'motion.js'), 'utf8'), ui = fs.readFileSync(path.join(JS_DIR, 'ui.js'), 'utf8');
  ok(css.indexOf('view-transition') < 0 && css.indexOf('::view-transition') < 0, 'CSS không còn view-transition');
  ok(mo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').indexOf('startViewTransition') < 0, 'motion.js không gọi startViewTransition');
  ok(css.indexOf('--vv-dy') < 0 && ui.replace(/\/\*[\s\S]*?\*\//g, '').indexOf('--vv-dy') < 0, 'không còn cơ chế dịch thanh --vv-dy');
  var rule = function(sel){ var i = css.indexOf(sel + '{'); ok(i >= 0, 'thiếu rule ' + sel); return css.slice(i, css.indexOf('}', i)); };
  ok(/#tabContent\.doi-tab\{[^}]*animation/.test(css) && rule('@keyframes doi-tab-vao').indexOf('transform') < 0, 'đổi tab chỉ mờ dần (opacity), không transform');
  ok(/\.tabs\{[^}]*top:calc\(var\(--vv-top,0px\) \+ var\(--vv-h,100%\)\)[^}]*translateY\(-100%\)/.test(css), '.tabs (điện thoại) đặt theo đáy phần nhìn thấy');
  var qb = (/(^|\n)\.qa-bar-wrap\{[^}]*\}/.exec(css) || [''])[0];
  ok(qb.indexOf('var(--vv-top,0px) + var(--vv-h,100%)') >= 0 && qb.indexOf('translateY(-100%)') >= 0, '.qa-bar-wrap đặt theo đáy phần nhìn thấy');
  ok(css.indexOf('html[data-kb] .tabs') >= 0, 'bàn phím mở thì ẩn thanh tab');
});

test('Lớp phủ toàn màn hình (.gate, .modal-back, nền) bám biến --vv-* thay vì chỉ neo theo khung layout', function(){
  var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ['.gate', '.modal-back', 'body::before'].forEach(function(sel){
    var i = css.indexOf(sel + '{'); ok(i >= 0, 'thiếu rule ' + sel);
    var r = css.slice(i, css.indexOf('}', i));
    ok(r.indexOf('var(--vv-h,100%)') >= 0 && r.indexOf('var(--vv-top,0px)') >= 0, sel + ' phải dùng --vv-top / --vv-h');
  });
});

/* ==================================================================== */
group('Nhãn (tag) cho giao dịch');

function nhanData(){
  var j = {};
  j['2026-10-02'] = { thu: {}, chi: { an: 300 }, ghiChu: '', refs: [], items: [{ iid:'a1', kind:'chi', catId:'an', soTien:100, ghiChu:'cơm', nhan:['Du lịch Đà Lạt'] }, { iid:'a2', kind:'chi', catId:'an', soTien:200, ghiChu:'', nhan:['du lịch đà lạt', 'Ăn chơi'] }] };
  j['2026-10-05'] = { thu: { luong: 50 }, chi: {}, ghiChu: '', refs: [], items: [{ iid:'b1', kind:'thu', catId:'luong', soTien:50, ghiChu:'hoàn tiền', nhan:['Du lịch Đà Lạt'] }] };
  return loadData(baseData({ journal: j }));
}
test('nhanParse: tách theo , ; #, bỏ rỗng và trùng (không phân biệt hoa/thường)', function(){
  eq(JSON.stringify(ctx.nhanParse('Du lịch,  #du lịch ; Đám cưới ,, ')), JSON.stringify(['Du lịch', 'Đám cưới']));
  eq(ctx.nhanParse('').length, 0); eq(ctx.nhanParse(null).length, 0);
  eq(ctx.nhanChuan('  ##a   b  '), 'a b');
  eq(ctx.nhanChuan(new Array(60).join('x')).length, 40);
});
test('nhanThongKe: gộp tên chỉ khác hoa/thường, cộng chi và thu riêng, khoảng ngày', function(){
  nhanData();
  var r = ctx.nhanThongKe(), dl = r.filter(function(x){ return x.khoa === 'du lịch đà lạt'; })[0];
  eq(r.length, 2); eq(dl.n, 3); eq(dl.chi, 300); eq(dl.thu, 50); eq(dl.tu, '2026-10-02'); eq(dl.den, '2026-10-05');
  eq(dl.ten, 'Du lịch Đà Lạt', 'tên theo lần gặp đầu (sổ đọc từ ngày cũ tới mới)');
});
test('nhãn không đổi số dư / tổng thu chi của ngày', function(){
  nhanData();
  eq(ctx.chiTotal(ctx.state.data.journal['2026-10-02']), 300);
  eq(ctx.balanceAt('2026-10-05'), 50 - 300);
});
test('nhanDoiTen: đổi tên, gộp vào nhãn đã có, không để trùng trong 1 dòng', function(){
  nhanData();
  eq(ctx.nhanDoiTen('ăn chơi', 'Du lịch Đà Lạt'), 1, 'chỉ a2 đổi');
  var it = ctx.state.data.journal['2026-10-02'].items[1];
  eq(JSON.stringify(it.nhan), JSON.stringify(['Du lịch Đà Lạt']), 'a2 có 2 nhãn cùng khóa -> còn 1');
  eq(ctx.nhanThongKe().length, 1);
  ctx.nhanDoiTen('du lịch đà lạt', 'Đà Lạt 2026');
  eq(ctx.nhanThongKe()[0].ten, 'Đà Lạt 2026'); eq(ctx.nhanThongKe()[0].n, 3);
});
test('nhanXoa: gỡ nhãn, dòng hết nhãn thì không còn trường nhan, giao dịch giữ nguyên', function(){
  nhanData();
  eq(ctx.nhanXoa('ăn chơi'), 1);
  eq(JSON.stringify(ctx.state.data.journal['2026-10-02'].items[1].nhan), JSON.stringify(['du lịch đà lạt']));
  ctx.nhanXoa('du lịch đà lạt');
  ok(!('nhan' in ctx.state.data.journal['2026-10-05'].items[0]), 'hết nhãn thì xóa trường');
  eq(ctx.nhanThongKe().length, 0); eq(ctx.chiTotal(ctx.state.data.journal['2026-10-02']), 300);
});
test('nhãn sống sót qua sửa dòng (entryUpdateItem) và thẻ Báo cáo vẽ được cả khi rỗng / có nhãn', function(){
  nhanData();
  ctx.entryUpdateItem('2026-10-02', 'a1', 150, 'cơm tối', 'chi', 'an', '');
  eq(ctx.state.data.journal['2026-10-02'].items[0].nhan[0], 'Du lịch Đà Lạt');
  ctx.state.nhanMo = 'du lịch đà lạt';
  var h = ctx.nhanCardHtml();
  ok(h.indexOf('Du lịch Đà Lạt') >= 0 && h.indexOf('nhanDoiTen') >= 0, 'thẻ có nhãn + nút đổi tên');
  ctx.state.nhanMo = null;
  loadData(baseData()); ok(ctx.nhanCardHtml().indexOf('Chưa có nhãn') >= 0, 'rỗng có hướng dẫn');
});

/* ==================================================================== */
group('Sổ nợ theo đối tượng + chia hóa đơn nhóm');
ctx.docSo = uiCtx.docSo;     // bản thật (hiểu 150k, 1,5tr) thay cho bản giả lập của nhóm test cũ

function nguoiData(){
  return loadData(baseData({ vayNo: {
    choVay: [
      { id:'cv1', ten:'Cho Minh vay', nguoi:'Minh', soTien:500000, daThu:100000, ngayChoVay:'2026-10-01', ngayDuKienThu:'', trangThai:'dang_cho' },
      { id:'cv2', ten:'Cho minh vay thêm', nguoi:'minh', soTien:300000, daThu:0, ngayChoVay:'2026-10-02', ngayDuKienThu:'', trangThai:'dang_cho' },
      { id:'cv3', ten:'Đã xong', nguoi:'Minh', soTien:100, daThu:100, ngayChoVay:'2026-09-01', ngayDuKienThu:'', trangThai:'da_thu_du' },
      { id:'cv4', ten:'Khoản chưa gán', soTien:999, daThu:0, ngayChoVay:'2026-10-02', ngayDuKienThu:'', trangThai:'dang_cho' }
    ],
    vayNoPhaiTra: [
      { id:'vn1', ten:'Mượn Minh', nguoi:'MINH', loaiVay:'ban_be', hinhThuc:'tra_1_lan', soTienGoc:200000, ngayVay:'2026-10-01', ngayDaoHan:'2026-12-01', traNo:[], trangThai:'dang_vay' },
      { id:'vn2', ten:'Vay xe', nguoi:'Vietcombank', loaiVay:'ngan_hang', hinhThuc:'khong_lai', soTienGoc:1200000, soThangVay:12, ngayVay:'2026-10-01', ngayTraHangThang:5, traNo:[], trangThai:'dang_vay' }
    ] } }));
}
test('nguoiTongHop: gom theo người không phân biệt hoa/thường, chỉ khoản còn mở, bỏ khoản chưa gán', function(){
  nguoiData();
  var ds = ctx.nguoiTongHop(), minh = ds.filter(function(x){ return x.khoa === 'minh'; })[0];
  eq(ds.length, 2, 'Minh + Vietcombank'); ok(minh, 'có Minh');
  eq(minh.khoan.length, 3, '2 cho vay còn mở + 1 vay, không tính khoản đã xong');
  eq(minh.phaiThu, 400000 + 300000); eq(minh.phaiTra, 200000); eq(minh.rong, 500000);
  eq(ds[0].khoa, 'vietcombank', 'sắp theo |ròng| giảm dần: 1.2tr > 500k');
  eq(ds[0].rong, -1200000);
});
test('nguoiDoiTen: đổi/gộp trên mọi khoản; nguoiCardHtml vẽ được, kể cả khi chưa gán ai', function(){
  nguoiData();
  eq(ctx.nguoiDoiTen('minh', 'Nguyễn Minh'), 4);
  eq(ctx.nguoiTongHop().filter(function(x){ return x.khoa === 'nguyễn minh'; }).length, 1);
  ok(ctx.nguoiCardHtml().indexOf('Nguyễn Minh') >= 0);
  loadData(baseData({ vayNo: { choVay: [{ id:'x', ten:'a', soTien:1, daThu:0, ngayChoVay:'2026-10-01', trangThai:'dang_cho' }], vayNoPhaiTra: [] } }));
  ok(ctx.nguoiCardHtml().indexOf('Chưa gán đối tượng') >= 0);
  loadData(baseData()); eq(ctx.nguoiCardHtml(), '');
});
test('chiaParseDs: mỗi dòng một người, số tiền tùy chọn (k, tr, dấu chấm), tên nhiều chữ', function(){
  var r = ctx.chiaParseDs('Minh\n  Lan Anh 150k \n\nHùng 1,5tr\nTú 120.000');
  eq(r.length, 4);
  eq(r[0].ten, 'Minh'); eq(r[0].tien, null);
  eq(r[1].ten, 'Lan Anh'); eq(r[1].tien, 150000);
  eq(r[2].tien, 1500000); eq(r[3].tien, 120000);
});
test('chiaTinh: chia đều cùng mình (lẻ dồn về mình); có người ghi số riêng thì phần còn lại chia đều', function(){
  var a = ctx.chiaTinh(1000000, ctx.chiaParseDs('A\nB\nC'));
  eq(a.minh, 250000); eq(a.phan[0].tien, 250000);
  var b = ctx.chiaTinh(100000, ctx.chiaParseDs('A\nB'));
  eq(b.phan[0].tien, 33333); eq(b.minh, 33334); eq(b.minh + b.phan[0].tien + b.phan[1].tien, 100000, 'tổng khớp');
  var c = ctx.chiaTinh(1000000, ctx.chiaParseDs('A 400k\nB\nC'));
  eq(c.phan[0].tien, 400000); eq(c.phan[1].tien, 200000); eq(c.phan[2].tien, 200000); eq(c.minh, 200000);
  var d = ctx.chiaTinh(1000000, ctx.chiaParseDs('A 600k\nB 400k'));
  eq(d.minh, 0, 'mình không phải trả phần nào');
});
test('chiaTinh: báo lỗi khi thiếu tổng / không có người / vượt tổng / số 0', function(){
  ok(ctx.chiaTinh(0, ctx.chiaParseDs('A')).loi); ok(ctx.chiaTinh(100, []).loi);
  ok(ctx.chiaTinh(100000, ctx.chiaParseDs('A 80k\nB 80k')).loi, 'vượt tổng');
  ok(ctx.chiaTinh(100000, [{ ten:'A', tien:0 }]).loi, 'số 0');
});
test('chiaGhi: phần mình thành khoản chi, mỗi người một khoản cho vay; tổng tiền ra khỏi ví = hóa đơn; hoàn tác sạch', function(){
  loadData(baseData());
  var kq = ctx.chiaTinh(1000000, ctx.chiaParseDs('A\nB'));
  var truoc = ctx.balanceAt('2026-10-10');
  var ket = ctx.chiaGhi({ ten:'Ăn lẩu', ngay:'2026-10-10', cat:'an', walletId:'', minh:kq.minh, phan:kq.phan });
  var d = ctx.state.data;
  eq(d.vayNo.choVay.length, 2); eq(d.vayNo.choVay[0].nguoi, 'A'); eq(d.vayNo.choVay[0].soTien, 333333);
  eq(ctx.chiTotal(d.journal['2026-10-10']), 1000000, 'cả hóa đơn ra khỏi ví');
  eq(ctx.balanceAt('2026-10-10'), truoc - 1000000);
  eq(ctx.chiTotal(d.journal['2026-10-10']) - ctx.entryRefSum(d.journal['2026-10-10'], 'chi', 'choVay'), kq.minh, 'phần chi của mình');
  ctx.chiaHoanTac(ket);
  eq(d.vayNo.choVay.length, 0); ok(!d.journal['2026-10-10'], 'ngày rỗng bị xóa'); eq(ctx.balanceAt('2026-10-10'), truoc);
});

/* ==================================================================== */
group('Nhắc thu/chi theo ngày của danh mục');

function hanData(ngayLuong, ngayNha, journal){
  var d = baseData({ journal: journal || {} });
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'thuHoiChoVay', ten:'Thu hồi cho vay', chiTieu:0 }];
  d.categories.chi = [{ id:'nha', ten:'Tiền nhà', chiTieu:0 }, { id:'traNo', ten:'Trả nợ', chiTieu:0 }];
  if (ngayLuong) d.categories.thu[0].ngay = ngayLuong;
  if (ngayNha) d.categories.chi[0].ngay = ngayNha;
  d.categories.thu[1].ngay = 5; d.categories.chi[1].ngay = 5;     // danh mục hệ thống: bị bỏ qua
  return loadData(d);
}
test('chưa tới 7 ngày thì chưa nhắc; trong 7 ngày thì nhắc đúng số ngày còn lại; danh mục hệ thống bị bỏ qua', function(){
  hanData(20, 0);
  eq(ctx.dsCatSapDenHan(7, '2026-10-10').length, 0, 'còn 10 ngày tới lương');
  var ds = ctx.dsCatSapDenHan(7, '2026-10-14');
  eq(ds.length, 1); eq(ds[0].id, 'luong'); eq(ds[0].kind, 'thu'); eq(ds[0].soNgay, 6); eq(ds[0].han, '2026-10-20');
  eq(ctx.nhacHanNhan(0), 'Hôm nay'); eq(ctx.nhacHanNhan(1), 'Ngày mai'); eq(ctx.nhacHanNhan(-3), 'Quá hạn 3 ngày');
});
test('quá hạn mà tháng này chưa ghi thì nhắc quá hạn; ghi rồi thì hết nhắc', function(){
  hanData(20, 5);
  var ds = ctx.dsCatSapDenHan(7, '2026-10-08');
  eq(ds.length, 1); eq(ds[0].id, 'nha'); eq(ds[0].soNgay, -3);
  var j = { '2026-10-07': { thu: {}, chi: { nha: 3000000 }, ghiChu: '', refs: [], items: [{ iid:'x', kind:'chi', catId:'nha', soTien:3000000, ghiChu:'' }] } };
  hanData(20, 5, j);
  eq(ctx.dsCatSapDenHan(7, '2026-10-08').length, 0, 'đã ghi tiền nhà tháng 10');
});
test('đã ghi tháng này thì cuối tháng nhắc kỳ tháng sau; ngày 31 co về cuối tháng ngắn', function(){
  var j = { '2026-10-07': { thu: {}, chi: { nha: 1 }, ghiChu: '', refs: [], items: [{ iid:'x', kind:'chi', catId:'nha', soTien:1, ghiChu:'' }] } };
  hanData(null, 5, j);
  var ds = ctx.dsCatSapDenHan(7, '2026-10-30');
  eq(ds.length, 1); eq(ds[0].han, '2026-11-05'); eq(ds[0].soNgay, 6);
  hanData(null, 31);
  eq(ctx.dsCatSapDenHan(7, '2026-11-26')[0].han, '2026-11-30', 'tháng 11 chỉ có 30 ngày');
});
test('không đặt ngày thì không nhắc; chuông có dòng Lương kèm số ngày còn lại và nút Hoàn thành', function(){
  hanData(0, 0);
  eq(ctx.dsCatSapDenHan(7, '2026-10-14').length, 0); eq(ctx.cbTatCa('2026-10-14').length, 0);
  setToday('2026-10-14'); hanData(20, 0);
  var it = ctx.cbTatCa('2026-10-14').filter(function(x){ return x.loai === 'cat'; })[0];
  ok(it && it.tieu === 'Lương' && it.phu.indexOf('Còn 6 ngày') >= 0 && it.coXong === true && it.muc === 'sap', 'có dòng Lương, còn 6 ngày, có nút Hoàn thành');
  ok(ctx.cbDongHtml(it, 0).indexOf('data-act="cbXong"') > 0, 'nút Hoàn thành trên dòng');
  var kind = null, id = null, qm0 = ctx.qaMoSheet, gn0 = ctx.qaGhiNho; ctx.qaMoSheet = function(){ kind = ctx.state.qa.kind; id = ctx.state.qa.cat[kind]; }; ctx.qaGhiNho = function(){};
  try { ctx.nhacHanGhi('thu', 'luong'); } finally { ctx.qaMoSheet = qm0; ctx.qaGhiNho = gn0; }
  eq(kind, 'thu'); eq(id, 'luong');
  setToday('2026-10-01');
});

test('cbCapNhatNut: số đỏ = số thông báo CHƯA XEM, ẩn khi 0, không lỗi khi chưa có phần tử', function(){
  var el = { textContent: '', style: { display: 'none' }, setAttribute: function(){} }, goc = ctx.document.getElementById;
  setToday('2026-10-14'); hanData(20, 0);
  ctx.cbCapNhatNut();                                       // chưa có phần tử: không lỗi
  ctx.document.getElementById = function(id){ return id === 'cbBadge' ? el : (id === 'btnChuong' ? { setAttribute: function(){} } : null); };
  try {
    ctx.cbCapNhatNut(); eq(el.textContent, 1); eq(el.style.display, 'flex');
    ctx.nhacHanHoanThanh('thu', 'luong', '2026-10'); ctx.cbCapNhatNut(); eq(el.style.display, 'none', 'hoàn thành -> mục mất khỏi chuông -> ẩn');
  } finally { ctx.document.getElementById = goc; setToday('2026-10-01'); }
});
test('Hoàn thành: tắt nhắc kỳ đó, không ghi giao dịch / số dư; tháng sau vẫn nhắc; hoàn tác được', function(){
  hanData(20, 5);
  var truoc = JSON.stringify(ctx.state.data.journal), bal = ctx.balanceAt('2026-10-31');
  var ds = ctx.dsCatSapDenHan(7, '2026-10-08');
  eq(ds.length, 1); eq(ds[0].mk, '2026-10');
  ok(ctx.nhacHanHoanThanh('chi', 'nha', '2026-10'));
  eq(ctx.dsCatSapDenHan(7, '2026-10-08').length, 0, 'hết nhắc');
  eq(JSON.stringify(ctx.state.data.journal), truoc, 'không ghi giao dịch'); eq(ctx.balanceAt('2026-10-31'), bal, 'số dư không đổi');
  eq(ctx.dsCatSapDenHan(7, '2026-11-01').length, 1, 'tháng 11 nhắc lại (còn 4 ngày)');
  ctx.nhacHanHoanTac('chi', 'nha', '2026-10');
  eq(ctx.dsCatSapDenHan(7, '2026-10-08').length, 1, 'hoàn tác -> nhắc lại'); ok(!('xong' in ctx.state.data.categories.chi[0]));
});
test('Hoàn thành kỳ tháng sau (nhắc cuối tháng) chỉ tắt kỳ tháng sau; chỉ giữ 6 tháng gần nhất', function(){
  var j = { '2026-10-07': { thu: {}, chi: { nha: 1 }, ghiChu: '', refs: [], items: [{ iid:'x', kind:'chi', catId:'nha', soTien:1, ghiChu:'' }] } };
  hanData(null, 5, j);
  var d = ctx.dsCatSapDenHan(7, '2026-10-30'); eq(d.length, 1); eq(d[0].mk, '2026-11');
  ctx.nhacHanHoanThanh('chi', 'nha', '2026-11');
  eq(ctx.dsCatSapDenHan(7, '2026-10-30').length, 0);
  ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'].forEach(function(m){ ctx.nhacHanHoanThanh('chi', 'nha', m); });
  eq(ctx.state.data.categories.chi[0].xong.length, 6);
});

/* ==================================================================== */
group('Xuất nhắc việc ra file .ics');

function lichData(){
  var d = baseData({ vayNo: {
    choVay: [{ id:'cv1', ten:'Cho Minh vay', soTien:500000, daThu:0, ngayChoVay:'2026-10-01', ngayDuKienThu:'2026-10-20', trangThai:'dang_cho' },
             { id:'cv2', ten:'Đã xong', soTien:100, daThu:100, ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-25', trangThai:'da_thu_du' }],
    vayNoPhaiTra: [{ id:'vn1', ten:'Vay xe, trả góp; "A"', loaiVay:'ngan_hang', hinhThuc:'khong_lai', soTienGoc:3000000, soThangVay:3, ngayVay:'2026-10-01', ngayTraHangThang:5, traNo:[], trangThai:'dang_vay' }] } });
  d.categories.thu = [{ id:'luong', ten:'Tiền lương', chiTieu:0, ngay: 20 }];
  d.categories.chi = [{ id:'nha', ten:'Tiền nhà', chiTieu:0, ngay: 31 }];
  d.dinhKy = [{ id:'dk1', ten:'Tiền net', kind:'chi', catId:'nha', soTien:200000, ngay:10, bat:true, bo:['2026-11'] },
              { id:'dk2', ten:'Tắt', kind:'chi', catId:'nha', soTien:1, ngay:10, bat:false, bo:[] }];
  return loadData(d);
}
test('lichSuKien: gom kỳ trả nợ, thu nợ, danh mục có ngày, định kỳ; chỉ từ hôm nay; bỏ khoản đã xong / đã tắt / tháng bỏ qua', function(){
  lichData();
  var ds = ctx.lichSuKien('2026-10-09'), ten = ds.map(function(e){ return e.tieuDe; });
  ok(ten.indexOf('Thu nợ: Cho Minh vay') >= 0, 'thu nợ'); ok(ten.indexOf('Thu nợ: Đã xong') < 0, 'khoản đã xong');
  eq(ten.filter(function(t){ return t.indexOf('Trả nợ:') === 0; }).length, 3, '3 kỳ trả nợ (5/11, 5/12, 5/1)');
  ok(ten.indexOf('Thu: Tiền lương') >= 0 && ten.indexOf('Chi: Tiền nhà') >= 0, 'danh mục có ngày');
  ok(ten.indexOf('Định kỳ: Tắt') < 0, 'định kỳ đã tắt');
  eq(ds.filter(function(e){ return e.uid === 'dk-dk1-2026-11'; }).length, 0, 'tháng 11 đã bỏ qua');
  ok(ds.every(function(e){ return e.ngay >= '2026-10-09'; }), 'không có sự kiện quá khứ');
  var nha = ds.filter(function(e){ return e.uid === 'dm-chi-nha-2026-11'; })[0];
  eq(nha.ngay, '2026-11-30', 'ngày 31 co về cuối tháng 11');
  var uids = {}; ds.forEach(function(e){ ok(!uids[e.uid], 'UID trùng: ' + e.uid); uids[e.uid] = 1; });
  for (var i = 1; i < ds.length; i++) ok(ds[i - 1].ngay <= ds[i].ngay, 'sắp theo ngày');
});
test('lichSuKien: tháng này đã có giao dịch / bấm Hoàn thành thì bỏ sự kiện của tháng đó', function(){
  var d = lichData();
  d.journal['2026-10-02'] = { thu: { luong: 1 }, chi: {}, ghiChu: '', refs: [], items: [{ iid:'q', kind:'thu', catId:'luong', soTien:1, ghiChu:'' }] };
  ctx.nhacHanHoanThanh('chi', 'nha', '2026-10');
  var uids = ctx.lichSuKien('2026-10-01').map(function(e){ return e.uid; });
  ok(uids.indexOf('dm-thu-luong-2026-10') < 0, 'lương tháng 10 đã ghi'); ok(uids.indexOf('dm-thu-luong-2026-11') >= 0, 'tháng 11 vẫn có');
  ok(uids.indexOf('dm-chi-nha-2026-10') < 0, 'tiền nhà tháng 10 đã hoàn thành');
});
test('lichIcs: cấu trúc VCALENDAR/VEVENT, CRLF, cả ngày (DTEND = hôm sau), 2 báo thức, escape , ; \\ xuống dòng', function(){
  lichData();
  var ics = ctx.lichIcs(ctx.lichSuKien('2026-10-09'), new Date(Date.UTC(2026, 9, 9, 3, 4, 5)));
  ok(ics.indexOf('BEGIN:VCALENDAR\r\n') === 0 && /END:VCALENDAR\r\n$/.test(ics), 'khung');
  ok(ics.indexOf('\n') === ics.indexOf('\r\n') + 1, 'CRLF');
  ok(ics.indexOf('DTSTAMP:20261009T030405Z') > 0, 'DTSTAMP');
  var nv = ics.split('BEGIN:VEVENT').length - 1, kt = ics.split('END:VEVENT').length - 1, al = ics.split('BEGIN:VALARM').length - 1;
  eq(nv, kt); eq(al, nv * 2, '2 báo thức mỗi sự kiện');
  ok(ics.indexOf('DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261121') > 0 || ics.indexOf('DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106') > 0, 'DTEND hôm sau');
  ok(ics.indexOf('Vay xe\\, trả góp\; "A"') >= 0, 'escape dấu phẩy, chấm phẩy');
  eq(ctx.icsEsc('a\\b\nc'), 'a\\\\b\\nc');
  eq(ctx.icsNgaySau('2026-12-31'), '20270101'); eq(ctx.icsNgaySau('2026-02-28'), '20260301');
});
test('icsGap: dòng ≤ 75 byte UTF-8, không cắt giữa ký tự, ghép lại đúng nguyên văn', function(){
  var dai = 'SUMMARY:' + new Array(40).join('Trả nợ góp ');
  var kq = ctx.icsGap(dai), dong = kq.split('\r\n');
  ok(dong.length > 1, 'có gập');
  dong.forEach(function(l){ ok(Buffer.byteLength(l, 'utf8') <= 75, 'dòng > 75 byte: ' + Buffer.byteLength(l, 'utf8')); });
  eq(dong.map(function(l, i){ return i ? l.slice(1) : l; }).join(''), dai, 'ghép lại đúng');
  eq(ctx.icsGap('ngắn'), 'ngắn');
});

/* ==================================================================== */
group('Đối soát số dư ví');

function dsData(){
  var j = {}; j['2026-10-02'] = { thu: { luong: 1000 }, chi: { an: 300 }, ghiChu: '', refs: [], items: [
    { iid:'a', kind:'thu', catId:'luong', soTien:1000, ghiChu:'', walletId:'w1' }, { iid:'b', kind:'chi', catId:'an', soTien:300, ghiChu:'', walletId:'w1' }] };
  var d = baseData({ journal: j });
  d.wallets = [{ id:'w1', ten:'TechcomBank', soDuDauKy: 500 }, { id:'w2', ten:'Tiền mặt', soDuDauKy: 50 }];
  return loadData(d);
}
test('doiSoatTinh: số trong sổ = đầu kỳ + thu − chi của ví; chênh = thật − sổ', function(){
  dsData();
  var t = ctx.doiSoatTinh('w1', 1300, '2026-10-05');
  eq(t.soSo, 1200); eq(t.chenh, 100);
  eq(ctx.doiSoatTinh('w2', 50, '2026-10-05').chenh, 0);
  ok(ctx.doiSoatMoTa(100).text.indexOf('NHIỀU hơn') >= 0); ok(ctx.doiSoatMoTa(-100).text.indexOf('ÍT hơn') >= 0); ok(ctx.doiSoatMoTa(0.2).khop);
});
test('đối soát chỉ ghi nhận (không điều chỉnh): sổ không đổi, lịch sử có 1 bản; giữ tối đa 12 lần', function(){
  dsData();
  var truoc = JSON.stringify(ctx.state.data.journal);
  var r = ctx.doiSoatGhi('w1', 1300, '2026-10-05', false);
  eq(JSON.stringify(ctx.state.data.journal), truoc, 'journal không đổi'); eq(r.iid, null);
  eq(ctx.walletById('w1').doiSoat.length, 1); eq(ctx.walletById('w1').doiSoat[0].chenh, 100); eq(ctx.walletById('w1').doiSoat[0].dieuChinh, false);
  ok(ctx.doiSoatTrangThai(ctx.walletById('w1')).indexOf('lệch +100') >= 0);
  for (var i = 0; i < 15; i++) ctx.doiSoatGhi('w1', 1200, '2026-10-05', false);
  eq(ctx.walletById('w1').doiSoat.length, 12);
  eq(ctx.doiSoatTrangThai(ctx.walletById('w2')), 'Chưa đối soát');
});
test('điều chỉnh: ví thật nhiều hơn -> khoản THU, ít hơn -> khoản CHI; số dư ví khớp số thật; tổng sổ đổi đúng chênh', function(){
  dsData();
  var tong0 = ctx.balanceAt('2026-10-05');
  var r = ctx.doiSoatGhi('w1', 1300, '2026-10-05', true);
  eq(ctx.soDuTheoVi('w1', '2026-10-05'), 1300, 'ví khớp'); eq(ctx.balanceAt('2026-10-05'), tong0 + 100);
  var it = ctx.entryFindItem(ctx.state.data.journal['2026-10-05'], r.iid);
  eq(it.kind, 'thu'); eq(it.catId, 'dieuChinh'); eq(it.dieuChinh, true); eq(it.walletId, 'w1');
  ok(ctx.state.data.categories.thu.some(function(c){ return c.id === 'dieuChinh' && c.khongDuTru; }), 'danh mục tự tạo, không dự báo');
  var r2 = ctx.doiSoatGhi('w1', 1000, '2026-10-06', true);
  eq(ctx.soDuTheoVi('w1', '2026-10-06'), 1000);
  eq(ctx.entryFindItem(ctx.state.data.journal['2026-10-06'], r2.iid).kind, 'chi');
  eq(ctx.state.data.categories.thu.filter(function(c){ return c.id === 'dieuChinh'; }).length, 1, 'không tạo trùng danh mục');
  ok(ctx.CAT_HE_THONG.thu.dieuChinh && ctx.CAT_HE_THONG.chi.dieuChinh, 'thuộc danh mục hệ thống (ẩn khỏi Ghi nhanh)');
  ok(ctx.qaCats('chi').every(function(c){ return c.id !== 'dieuChinh'; }), 'Ghi nhanh không hiện');
});
test('khớp thì điều chỉnh không tạo khoản; hoàn tác gỡ khoản và bản ghi lịch sử', function(){
  dsData();
  var r0 = ctx.doiSoatGhi('w1', 1200, '2026-10-05', true);
  eq(r0.iid, null, 'khớp: không có khoản'); ok(!ctx.state.data.journal['2026-10-05']);
  var bal = ctx.balanceAt('2026-10-31');
  var r = ctx.doiSoatGhi('w2', 80, '2026-10-05', true);
  ok(r.iid); ctx.doiSoatHoanTac(r);
  ok(!ctx.state.data.journal['2026-10-05'], 'ngày rỗng bị xóa'); eq(ctx.soDuTheoVi('w2', '2026-10-31'), 50);
  eq(ctx.walletById('w2').doiSoat, undefined); eq(ctx.balanceAt('2026-10-31'), bal);
  eq(ctx.doiSoatGhi('khongco', 1, '2026-10-05', true), null, 'ví không tồn tại');
});
test('ngày đối soát mặc định là ngày cuối tháng hiện tại (kể cả tháng 2, năm nhuận)', function(){
  dsData();
  setToday('2026-10-10'); eq(ctx.doiSoatNgayMacDinh(), '2026-10-31');
  setToday('2026-02-03'); eq(ctx.doiSoatNgayMacDinh(), '2026-02-28');
  setToday('2028-02-03'); eq(ctx.doiSoatNgayMacDinh(), '2028-02-29');
  setToday('2026-10-31'); eq(ctx.doiSoatNgayMacDinh(), '2026-10-31');
  setToday('2026-10-10');
  var h = ctx.doiSoatSheetHtml({ loai: 'doisoat', id: 'w1' });
  ok(h.indexOf('id="ds_ngay" value="2026-10-31"') >= 0, 'ô ngày điền sẵn cuối tháng'); ok(h.indexOf('max=') < 0, 'không chặn ngày tương lai');
  setToday('2026-10-01');
});
test('đối soát KHÔNG đụng số dư đầu kỳ (ví và sổ); ngày trước mốc bắt đầu thì không tạo điều chỉnh', function(){
  dsData();
  var d = ctx.state.data, w1 = d.wallets[0].soDuDauKy, w2 = d.wallets[1].soDuDauKy, dk = d.settings.soDuDauKy, bd = d.settings.ngayBatDau;
  ctx.doiSoatGhi('w1', 1300, '2026-10-05', true); ctx.doiSoatGhi('w2', 80, '2026-10-05', false);
  eq(d.wallets[0].soDuDauKy, w1); eq(d.wallets[1].soDuDauKy, w2); eq(d.settings.soDuDauKy, dk); eq(d.settings.ngayBatDau, bd);
  dsData();
  eq(ctx.doiSoatTruocMoc('2026-09-30'), true); eq(ctx.doiSoatTruocMoc('2026-10-01'), false);
  var r = ctx.doiSoatGhi('w1', 9999, '2026-09-30', true);
  eq(r.iid, null, 'trước mốc: không tạo khoản'); ok(!ctx.state.data.journal['2026-09-30']);
});
test('đổi số dư đầu kỳ của ví: số trong sổ dịch đúng bằng phần đổi; lịch sử đối soát cũ giữ nguyên số đã ghi', function(){
  dsData();
  ctx.doiSoatGhi('w1', 1300, '2026-10-05', false);
  var truoc = JSON.stringify(ctx.walletById('w1').doiSoat);
  ctx.walletById('w1').soDuDauKy += 100;
  eq(ctx.doiSoatTinh('w1', 1300, '2026-10-05').soSo, 1300, 'sổ dịch +100'); eq(ctx.doiSoatTinh('w1', 1300, '2026-10-05').chenh, 0);
  eq(JSON.stringify(ctx.walletById('w1').doiSoat), truoc, 'bản ghi cũ không bị tính lại');
});
test('bảng đối soát vẽ được; thẻ ví hiện số dư + trạng thái + nút Đối soát', function(){
  dsData();
  var h = ctx.doiSoatSheetHtml({ loai: 'doisoat', id: 'w1' });
  ok(h.indexOf('Đối soát ví TechcomBank') >= 0 && h.indexOf('ds_that') >= 0 && h.indexOf('dsGhi') >= 0 && h.indexOf('dsDieuChinh') >= 0);
  ok(ctx.viCardHtml().indexOf('dmDoiSoat') >= 0 && ctx.viCardHtml().indexOf('Chưa đối soát') >= 0);
});

/* ==================================================================== */
group('Thẻ tín dụng / ví trả sau (thetindung.js)');

// Techcom 10tr (tài khoản) + thẻ VPBank (hạn mức 20tr, sao kê ngày 25, hạn trả ngày 15). Hôm nay 10/10/2026.
function theData(chiThe, chuyen){
  var j = {};
  (chiThe || []).forEach(function(c, i){
    j[c[0]] = j[c[0]] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] };
    j[c[0]].chi.an = (j[c[0]].chi.an || 0) + c[1];
    j[c[0]].items.push({ iid: 'i' + i, kind: 'chi', catId: 'an', soTien: c[1], ghiChu: '', walletId: 'wt' });
  });
  var d = baseData({ journal: j });
  d.settings.ngayBatDau = '2026-09-01'; d.settings.thangBatDauDuTru = '2026-09';
  d.wallets = [{ id: 'w1', ten: 'Techcom', soDuDauKy: 10000000 },
               { id: 'wt', ten: 'Thẻ VPBank', soDuDauKy: 0, the: true, hanMucThe: 20000000, ngaySaoKe: 25, ngayTraThe: 15 }];
  d.chuyenVi = chuyen || [];
  setToday('2026-10-10');
  return loadData(d);
}
function chuyenThe(ngay, tien){ return { id: 'ct' + ngay, ngay: ngay, tuVi: 'w1', denVi: 'wt', soTien: tien, ghiChu: '' }; }

test('normalizeData: ví thẻ giữ cấu hình đã chuẩn hóa, ví thường không có trường thẻ, ví thẻ không "để dành"', function(){
  var d = theData();
  d.wallets[1].ngaySaoKe = 99; d.wallets[1].ngayTraThe = 'x'; d.wallets[1].hanMucThe = -5; d.wallets[1].deDanh = true;
  d.wallets[0].hanMucThe = 123; d.wallets[0].ngaySaoKe = 5;
  ctx.normalizeData(d);
  eq(d.wallets[1].ngaySaoKe, 31); eq(d.wallets[1].ngayTraThe, 1); eq(d.wallets[1].hanMucThe, 0); eq(d.wallets[1].deDanh, false);
  eq(d.wallets[0].hanMucThe, undefined); eq(d.wallets[0].ngaySaoKe, undefined); eq(d.wallets[0].the, undefined);
});
test('theNgaySaoKe / theHanTra: hạn trả là lần đầu ngày đó xuất hiện SAU ngày sao kê; ngày 31 co về cuối tháng ngắn', function(){
  var w = { ngaySaoKe: 25, ngayTraThe: 15 };
  eq(ctx.theNgaySaoKe(w, '2026-10-10'), '2026-09-25'); eq(ctx.theNgaySaoKe(w, '2026-10-25'), '2026-10-25'); eq(ctx.theNgaySaoKe(w, '2026-01-10'), '2025-12-25');
  eq(ctx.theHanTra(w, '2026-09-25'), '2026-10-15', 'sao kê 25, hạn 15 -> tháng sau');
  eq(ctx.theHanTra({ ngayTraThe: 25 }, '2026-10-05'), '2026-10-25', 'sao kê 5, hạn 25 -> cùng tháng');
  eq(ctx.theHanTra({ ngayTraThe: 20 }, '2026-10-20'), '2026-11-20', 'trùng ngày sao kê -> tháng sau');
  eq(ctx.theNgaySaoKe({ ngaySaoKe: 31 }, '2026-03-05'), '2026-02-28');
});
test('quẹt thẻ làm ví thẻ âm + tổng số dư giảm ngay; sao kê chỉ tính phần chi tới ngày sao kê', function(){
  theData([['2026-09-20', 3000000], ['2026-09-28', 2000000]]);
  eq(ctx.soDuTheoVi('wt', '2026-10-10'), -5000000); eq(ctx.balanceAt('2026-10-10'), 5000000, '10tr - 5tr nợ thẻ');
  var t = ctx.theTinh(ctx.walletById('wt'), '2026-10-10');
  eq(t.duNo, 5000000); eq(t.soSaoKe, 3000000, 'sao kê 25/9 chỉ có khoản 20/9'); eq(t.han, '2026-10-15'); eq(t.soNgay, 5);
  eq(t.conPhaiTra, 3000000); eq(t.khaDung, 15000000);
});
test('thanh toán thẻ = chuyển ví: giảm còn phải trả, KHÔNG đổi tổng số dư, KHÔNG thành chi tháng', function(){
  theData([['2026-09-20', 3000000], ['2026-09-28', 2000000]]);
  var truoc = ctx.balanceAt('2026-10-10'), chiThang = ctx.actualCatMonthAll('chi', '2026-10');
  ctx.chuyenViThem('2026-10-05', 'w1', 'wt', 1000000, 'trả thẻ'); ctx.invalidateBalanceCache();
  var t = ctx.theTinh(ctx.walletById('wt'), '2026-10-10');
  eq(t.daTra, 1000000); eq(t.conPhaiTra, 2000000); eq(t.duNo, 4000000);
  eq(ctx.balanceAt('2026-10-10'), truoc, 'tổng số dư không đổi'); eq(ctx.actualCatMonthAll('chi', '2026-10'), chiThang, 'không thành chi');
  ctx.chuyenViThem('2026-10-06', 'w1', 'wt', 2000000, ''); ctx.invalidateBalanceCache();
  eq(ctx.theTinh(ctx.walletById('wt'), '2026-10-10').conPhaiTra, 0, 'trả đủ sao kê'); eq(ctx.theTinh(ctx.walletById('wt'), '2026-10-10').duNo, 2000000, 'còn nợ phần quẹt sau sao kê');
});
test('trả TRƯỚC ngày sao kê không bị trừ hai lần; trả dư không làm còn phải trả âm; còn phải trả không vượt dư nợ', function(){
  theData([['2026-09-20', 3000000]], [chuyenThe('2026-09-22', 1000000)]);
  var t = ctx.theTinh(ctx.walletById('wt'), '2026-10-10');
  eq(t.soSaoKe, 2000000, 'dư nợ chốt đã trừ lần trả 22/9'); eq(t.daTra, 0); eq(t.conPhaiTra, 2000000);
  theData([['2026-09-20', 3000000]], [chuyenThe('2026-10-02', 5000000)]);
  t = ctx.theTinh(ctx.walletById('wt'), '2026-10-10'); eq(t.conPhaiTra, 0); eq(t.duNo, 0, 'trả dư: không còn nợ');
});
test('theSapDenHan: chỉ thẻ còn phải trả và trong vòng 7 ngày; quá hạn vẫn hiện (soNgay âm); trả đủ thì hết', function(){
  theData([['2026-09-20', 3000000]]);
  eq(ctx.theSapDenHan('2026-10-10').length, 1, 'hạn 15/10, còn 5 ngày');
  eq(ctx.theSapDenHan('2026-10-01').length, 0, 'còn 14 ngày: chưa nhắc');
  var qua = ctx.theSapDenHan('2026-10-20'); eq(qua.length, 1); eq(qua[0].t.soNgay, -5, 'quá hạn 5 ngày');
  ctx.chuyenViThem('2026-10-12', 'w1', 'wt', 3000000, ''); ctx.invalidateBalanceCache();
  eq(ctx.theSapDenHan('2026-10-13').length, 0, 'trả đủ rồi');
  theData([]); eq(ctx.theSapDenHan('2026-10-10').length, 0, 'thẻ không có nợ');
});
test('viCanhBaoAm: thẻ âm là bình thường, chỉ cảnh báo khi vượt hạn mức; ví thường vẫn cảnh báo khi sắp âm', function(){
  theData([['2026-09-20', 3000000]]);
  eq(ctx.viCanhBaoAm('wt', -1000000), '', 'thẻ đang nợ, tiêu thêm trong hạn mức');
  ok(ctx.viCanhBaoAm('wt', -18000000).indexOf('vượt') >= 0, 'dư nợ 21tr > hạn mức 20tr');
  eq(ctx.viCanhBaoAm('wt', 1000000), '', 'tiền vào không cảnh báo');
  ok(ctx.viCanhBaoAm('w1', -15000000).indexOf('âm') >= 0, 'ví thường: vẫn báo sắp âm');
  ctx.walletById('wt').hanMucThe = 0; eq(ctx.viCanhBaoAm('wt', -99000000), '', 'chưa đặt hạn mức thì không cảnh báo');
});
test('giao diện thẻ: dòng ở thẻ Ví có Dư nợ / sao kê / nút Thanh toán; bảng thanh toán chỉ cho chọn ví không phải thẻ', function(){
  theData([['2026-09-20', 3000000]]);
  var h = ctx.viCardHtml();
  ok(h.indexOf('Thẻ tín dụng') >= 0 && h.indexOf('Dư nợ') >= 0 && h.indexOf('data-act="theTra"') >= 0 && h.indexOf('còn phải trả') >= 0, 'thẻ ví');
  var s = ctx.theTraSheetHtml({ loai: 'thanhtoanthe', id: 'wt' });
  ok(s.indexOf('theTraLuu') >= 0 && s.indexOf('value="Techcom"') < 0 && s.indexOf('>Techcom<') >= 0 && s.indexOf('>Thẻ VPBank<') < 0, 'chỉ ví thường trong ô "Trả từ ví"');
  ok(s.indexOf('3.000.000') >= 0, 'điền sẵn số còn phải trả');
  var f = ctx.viSheetHtml({ loai: 'vi', id: 'wt' });
  ok(f.indexOf('dm_vi_the') >= 0 && f.indexOf('dm_vi_sk') >= 0 && f.indexOf('id="dm_vi_the_f" hidden') < 0, 'form ví thẻ mở sẵn khối cấu hình');
  ok(ctx.viSheetHtml({ loai: 'vi', id: 'w1' }).indexOf('id="dm_vi_the_f" hidden') >= 0, 'ví thường ẩn khối cấu hình');
  ok(ctx.viTheHtml('2026-10', false).indexOf('Thẻ · dư nợ') >= 0, 'dải thẻ ở Sổ tay ghi nhãn dư nợ');
});
test('theDocForm: bật thẻ phải có ngày hợp lệ; tắt thẻ xóa mọi trường thẻ', function(){
  var vals = { dm_vi_hm: '20.000.000', dm_vi_sk: '25', dm_vi_ht: '15' }, bat = true, cu = ctx.document.getElementById;
  ctx.document.getElementById = function(id){ return id === 'dm_vi_the' ? { checked: bat } : (id in vals ? { value: vals[id] } : null); };
  try{
    var w = {};
    eq(ctx.theDocForm(w), ''); eq(w.the, true); eq(w.hanMucThe, 20000000); eq(w.ngaySaoKe, 25); eq(w.ngayTraThe, 15);
    vals.dm_vi_ht = '40'; ok(ctx.theDocForm({}) !== '', 'ngày ngoài 1-31 bị chặn');
    bat = false; eq(ctx.theDocForm(w), ''); eq(w.the, undefined); eq(w.hanMucThe, undefined);
  } finally { ctx.document.getElementById = cu; }
});

/* ==================================================================== */
group('Mức tiêu mỗi ngày (tieuMoiNgay, sotay.js)');

// 10/10/2026 (tháng 31 ngày -> còn 22 ngày tính cả hôm nay).
// Tiêu hằng ngày: Ăn (2,6tr) + Xăng (0,9tr) = 3,5tr. Cố định (công tắc "Khoản cố định"): Tiền nhà, Điện (dữ liệu cũ có ngày chi
// -> bật sẵn khi nạp), Net (có thêm định kỳ để kiểm tra không cộng đôi).
function tnData(chi, over){
  var j = {};
  (chi || []).forEach(function(c, i){
    j[c[0]] = j[c[0]] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] };
    j[c[0]].chi[c[1]] = (j[c[0]].chi[c[1]] || 0) + c[2];
    j[c[0]].items.push({ iid: 'k' + i, kind: 'chi', catId: c[1], soTien: c[2], ghiChu: '', walletId: 'w_chinh' });
  });
  var d = baseData({ journal: j });
  d.settings.ngayBatDau = '2026-09-01'; d.settings.thangBatDauDuTru = '2026-09';
  d.categories.chi = [
    { id: 'an', ten: 'Ăn uống', chiTieu: 2600000 }, { id: 'xang', ten: 'Xăng', chiTieu: 900000 },
    { id: 'nha', ten: 'Tiền nhà', chiTieu: 5000000, khoanCoDinh: true },
    { id: 'dien', ten: 'Điện', chiTieu: 1000000, ngay: 5 },
    { id: 'net', ten: 'Net', chiTieu: 300000, khoanCoDinh: true },
    { id: 'choi', ten: 'Vui chơi', chiTieu: 0 }
  ];
  d.dinhKy = [{ id: 'dk1', ten: 'Net', kind: 'chi', catId: 'net', soTien: 300000, ngay: 12, bat: true, bo: [] }];
  if (over) over(d);
  setToday('2026-10-10');
  return loadData(d);
}
var TN_CHI = [['2026-10-05', 'an', 1000000], ['2026-10-08', 'xang', 300000], ['2026-10-05', 'nha', 5000000], ['2026-10-10', 'an', 30000]];

test('mức/ngày = (tổng hạn mức tiêu hằng ngày − đã chi trước hôm nay) ÷ số ngày còn lại; "còn tiêu được" trừ phần đã tiêu hôm nay', function(){
  tnData(TN_CHI);
  var t = ctx.tieuMoiNgay('2026-10-10');
  eq(t.cap, 3500000, 'chỉ Ăn + Xăng'); eq(t.daTruoc, 1300000); eq(t.daHomNay, 30000); eq(t.soNgay, 22);
  near(t.muc, 100000, 0.01); near(t.honNayCon, 70000, 0.01); eq(t.het, false);
});
test('khoản cố định KHÔNG vào mức hằng ngày (dù đã chi hay chưa) và hiện riêng ở "còn phải ra", không cộng đôi', function(){
  tnData(TN_CHI);
  var t = ctx.tieuMoiNgay('2026-10-10'), a = JSON.stringify(t.coDinh.map(function(x){ return [x.ten, x.con]; }));
  eq(t.cap, 3500000, 'nhà / điện / net không nằm trong hạn mức hằng ngày');
  eq(t.coDinhCon, 1300000, 'điện 1tr chưa chi + net 0,3tr (hạn mức và định kỳ là CÙNG khoản, chỉ tính 1 lần); nhà đã chi nên 0');
  eq(a, JSON.stringify([['Điện', 1000000], ['Net', 300000]]));
  tnData(TN_CHI.concat([['2026-10-06', 'dien', 400000]]));
  eq(ctx.tieuMoiNgay('2026-10-10').coDinhCon, 900000, 'điện đã chi 0,4tr -> còn 0,6tr');
  eq(ctx.tieuMoiNgay('2026-10-10').cap, 3500000, 'chi cố định không đụng mức hằng ngày');
});
test('trả nợ biết trước chưa đóng vào "còn phải ra", không vào mức hằng ngày', function(){
  tnData(TN_CHI, function(d){
    d.vayNo.vayNoPhaiTra = [{ id: 'v1', ten: 'Vay xe', loaiVay: 'ngan_hang', hinhThuc: 'khong_lai', soTienGoc: 6000000, soThangVay: 6, ngayVay: '2026-09-15', ngayTraHangThang: 20, walletId: 'w_chinh', traNo: [], trangThai: 'dang_vay' }];
  });
  var t = ctx.tieuMoiNgay('2026-10-10');
  eq(t.cap, 3500000); ok(t.coDinhCon > 1300000, 'có thêm kỳ trả nợ tháng này: ' + t.coDinhCon);
  ok(t.coDinh.some(function(x){ return x.ten === 'Trả nợ'; }));
});
test('khoản ghi trước cho ngày SAU hôm nay chưa tiêu nên không trừ; mức không đổi trong ngày khi tiêu thêm', function(){
  tnData(TN_CHI.concat([['2026-10-20', 'an', 500000]]));
  eq(ctx.tieuMoiNgay('2026-10-10').daTruoc, 1300000);
  var m1 = ctx.tieuMoiNgay('2026-10-10').muc;
  tnData(TN_CHI.concat([['2026-10-10', 'xang', 70000]]));
  var t = ctx.tieuMoiNgay('2026-10-10');
  near(t.muc, m1, 0.01, 'tiêu thêm hôm nay không làm mức/ngày tụt'); near(t.honNayCon, 0, 0.01);
  tnData(TN_CHI.concat([['2026-10-10', 'xang', 120000]]));
  ok(ctx.tieuMoiNgay('2026-10-10').honNayCon < 0, 'vượt mức hôm nay'); ok(ctx.tieuMoiNgayHtml('2026-10-10').indexOf('Hôm nay đã vượt mức') >= 0);
});
test('hết hạn mức tiêu hằng ngày: báo vượt; ngày cuối tháng chia cho 1 ngày', function(){
  tnData(TN_CHI.concat([['2026-10-09', 'an', 3000000]]));
  var t = ctx.tieuMoiNgay('2026-10-10');
  eq(t.het, true); eq(t.muc, 0); eq(t.vuot, 4330000 - 3500000);
  ok(ctx.tieuMoiNgayHtml('2026-10-10').indexOf('đã hết') >= 0);
  tnData(TN_CHI); setToday('2026-10-31');
  eq(ctx.tieuMoiNgay('2026-10-31').soNgay, 1);
  setToday('2026-10-01');
});
test('không có hạn mức hằng ngày nào -> không hiện (null / rỗng), thay vì đoán số', function(){
  tnData(TN_CHI, function(d){ d.categories.chi.forEach(function(c){ if (c.id === 'an' || c.id === 'xang') c.chiTieu = 0; }); });
  eq(ctx.tieuMoiNgay('2026-10-10'), null); eq(ctx.tieuMoiNgayHtml('2026-10-10'), '');
  tnData(TN_CHI, function(d){ d.categories.chi[0].khongDuTru = true; d.categories.chi[1].khongDuTru = true; });
  eq(ctx.tieuMoiNgay('2026-10-10'), null, 'Không tính dự kiến bị loại');
});
test('thẻ tổng quan Sổ tay: tháng này có khối "Hôm nay còn tiêu được"; tháng khác thì không', function(){
  tnData(TN_CHI);
  var h = ctx.tongQuanHtml('2026-10', 0, 0, 0, 0, false);
  ok(h.indexOf('Hôm nay còn tiêu được') >= 0 && h.indexOf('cố định còn phải ra') >= 0, 'tháng hiện tại');
  ok(ctx.tongQuanHtml('2026-09', 0, 0, 0, 0, false).indexOf('Hôm nay còn tiêu được') < 0, 'tháng cũ');
});

/* ==================================================================== */
group('Tách chi cố định khỏi chi hằng ngày (Báo cáo, Dòng tiền, Sổ tay) + quá hạn nhiều kỳ (Vay - Nợ)');

// Hôm nay 11/10/2026. Ăn 2,5tr + Xăng 0,5tr = hạn mức hằng ngày 3tr; Tiền nhà 3,5tr (có ngày chi 5) đã trả ngày 5.
// Vay anh Chiến 51tr không lãi, 17 kỳ × 3tr, kỳ 1 = 10/09, kỳ 2 = 10/10: chưa trả kỳ nào -> trễ 2 kỳ = 6tr.
function cdData(){
  var j = {}, add = function(d, cat, v){
    j[d] = j[d] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] };
    j[d].chi[cat] = (j[d].chi[cat] || 0) + v;
    j[d].items.push({ iid: d + cat, kind: 'chi', catId: cat, soTien: v, ghiChu: '', walletId: 'w_chinh' });
  };
  ['02', '04', '06', '08', '10'].forEach(function(dd){ add('2026-10-' + dd, 'an', 60000); });
  add('2026-10-03', 'xang', 80000); add('2026-10-05', 'nha', 3500000);
  var d = baseData({ journal: j });
  d.settings = { soDuDauKy: 20000000, ngayBatDau: '2026-08-01', thangBatDauDuTru: '2026-08' };
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 2500000 }, { id: 'xang', ten: 'Xăng', chiTieu: 500000 },
                      { id: 'nha', ten: 'Tiền nhà', chiTieu: 3500000, ngay: 5 }, { id: 'traNo', ten: 'Trả nợ', chiTieu: 0 }];
  d.vayNo.vayNoPhaiTra = [{ id: 'v1', ten: 'Vay anh Chiến', loaiVay: 'nguoi_than', hinhThuc: 'khong_lai', soTienGoc: 51000000, soThangVay: 17,
                            ngayVay: '2026-08-10', ngayTraHangThang: 10, walletId: 'w_chinh', traNo: [], trangThai: 'dang_vay' }];
  setToday('2026-10-11');
  return loadData(d);
}

test('A1 Báo cáo thẻ đầu: "giữ nhịp" so chi HẰNG NGÀY với hạn mức hằng ngày, không báo vượt vì trả nợ / tiền nhà', function(){
  cdData();
  var tong = ctx.bdUocTinhChiThang('2026-10', 11).tong, hn = ctx.bdUocTinhChiHangNgay('2026-10', 11);
  ok(tong > 3000000, 'tổng ước tính (gồm 6tr trả nợ chưa ghi) lớn hơn hạn mức: ' + tong);
  eq(hn.daChi, 380000, 'chi hằng ngày tới hôm nay = 5×60k + 80k');
  near(hn.tong, 380000 + 380000 / 11 * 20, 1, 'đã chi + nhịp ngày thường × 20 ngày còn lại');
  var h = ctx.baoCaoDauHtml('2026-10');
  ok(h.indexOf('Chi hằng ngày theo hạn mức') > 0 && h.indexOf(ctx.fmt(380000) + '</b> / ' + ctx.fmt(3000000)) > 0, 'dòng chi hằng ngày / hạn mức');
  ok(h.indexOf('Giữ nhịp này') > 0 && h.indexOf('còn dư') > 0 && h.indexOf('và vượt') < 0, 'không còn cảnh báo vượt giả');
  ok(h.indexOf(ctx.fmt(3880000)) > 0, 'số to vẫn là TỔNG đã chi thật (3,5tr tiền nhà + 380k = 3.880.000)');
  ok(h.indexOf('danh mục vượt') < 0, 'không có chip vượt');
});
test('A2 thẻ Hạn mức (Báo cáo): Tiền nhà trả đủ nằm ở nhóm "Cố định", không ở "Cần chú ý"; vòng % chỉ tính chi hằng ngày', function(){
  cdData();
  var r = ctx.hanMucThangRows('2026-10');
  eq(r.filter(function(x){ return x.coDinh; }).map(function(x){ return x.id; }).join(), 'nha');
  var h = ctx.hanMucThangHtml('2026-10');
  ok(h.indexOf('Cần chú ý') < 0, 'không có gì cần chú ý');
  ok(h.indexOf('Cố định · 1') > 0 && h.indexOf('đã chi đủ') > h.indexOf('Cố định · 1'), 'Tiền nhà ở nhóm cố định, đã chi đủ');
  ok(h.indexOf('13%') > 0, 'vòng % = 380k / 3tr = 13%');
  var stack = h.slice(h.indexOf('hm-stack-l'), h.indexOf('hm-stack-l') + 400);
  ok(stack.indexOf('Tiền nhà') < 0 && stack.indexOf('Ăn') >= 0, 'thanh chia danh mục chỉ có chi hằng ngày');
});
test('A2/A3 Dòng tiền: nhịp chỉ xét chi hằng ngày; khoản cố định thành nhóm riêng, có thanh "Chi cố định"', function(){
  cdData();
  var d = ctx.dtThangDuLieu('2026-10');
  eq(d.chiActHN, 380000); eq(d.chiPlanHN, 3000000); eq(d.chiActCD, 3500000); eq(d.chiPlanCD, 3500000);
  eq(d.chiAct, d.chiActHN + d.chiActCD, 'tổng chi không đổi');
  var gt = ctx.dtGiaiThichHtml(d);
  ok(gt.indexOf('Chi hằng ngày đang dưới nhịp') >= 0 && gt.indexOf('vượt nhịp') < 0, gt);
  var c = ctx.dtChiCardHtml(d);
  ok(c.indexOf('Cố định · 1') > 0 && c.indexOf('Cần chú ý') < 0 && c.indexOf('đã chi đủ') > 0, 'Tiền nhà không bị cảnh báo');
  var dau = ctx.dtDauHtml(d, null, '2026-08', '2026-12');
  ok(dau.indexOf('Chi hằng ngày') > 0 && dau.indexOf('Chi cố định') > 0, 'thẻ đầu tách 2 thanh');
});
test('A4 Phân tích / top ngày: trung bình và ngày chi nhiều nhất chỉ tính chi hằng ngày', function(){
  cdData();
  var cur = ctx.bdThang('2026-10', 11);
  eq(cur.tongChi, 3880000); eq(cur.tongChiHN, 380000); eq(cur.chiHN[4], 0, 'ngày 5 (tiền nhà) không có chi hằng ngày');
  ctx.state.bdTab = 'tq';
  var h = ctx.bdTongQuanHtml('2026-10');
  ok(h.indexOf('Chi hằng ngày trung bình <b>' + ctx.fmt(Math.round(380000 / 11)) + '/ngày') > 0, 'TB 34.545/ngày');
  ok(h.indexOf('nhiều nhất 03/10') > 0 && h.indexOf('không tính ' + ctx.fmt(3500000) + ' khoản cố định') > 0, 'ngày nhiều nhất là 03/10 (xăng), ghi rõ phần cố định bị bỏ');
  var top = h.slice(h.indexOf('Top ngày chi nhiều'));
  ok(top.indexOf('03/10 · Xăng') > 0 && top.indexOf('05/10') < 0, 'top ngày không có ngày trả tiền nhà');
  ok(h.indexOf('chi hằng ngày ≈') > 0, 'ước tính so hạn mức bằng chi hằng ngày');
  setToday('2026-10-01');
});
test('B1 Vay - Nợ: trễ 2 kỳ thì thẻ khoản vay và "Sắp đến hạn" ghi đủ 6tr, không chỉ 3tr của kỳ cũ nhất', function(){
  cdData();
  var v = ctx.state.data.vayNo.vayNoPhaiTra[0], q = ctx.kyQuaHan(v, '2026-10-11');
  eq(q.n, 2); eq(q.tong, 6000000); eq(q.cuNhat, '2026-09-10');
  var h = ctx.vnVayCardHtml(v);
  ok(h.indexOf('Quá hạn 2 kỳ') > 0 && h.indexOf(ctx.fmt(6000000)) > 0 && h.indexOf('Kỳ tới') < 0, 'thẻ khoản vay');
  var ds = ctx.danhSachSapDenHan(7);
  eq(ds.length, 1); eq(ds[0].soTien, 6000000); eq(ds[0].soKy, 2);
  // chỉ trễ 1 kỳ: nhãn "Kỳ quá hạn" thay cho "Kỳ tới"
  setToday('2026-09-15'); q = ctx.kyQuaHan(v);
  eq(q.n, 1); ok(ctx.vnVayCardHtml(v).indexOf('Kỳ quá hạn') > 0); eq(ctx.danhSachSapDenHan(7)[0].soTien, 3000000);
  setToday('2026-09-05'); ok(ctx.vnVayCardHtml(v).indexOf('Kỳ tới') > 0, 'chưa tới hạn: vẫn là "Kỳ tới"');
  setToday('2026-10-01');
});

test('"Khoản cố định" là công tắc người dùng bật: "Cố định theo Hạn mức" hay định kỳ KHÔNG làm danh mục thành cố định', function(){
  tnData(TN_CHI, function(d){
    d.categories.chi[0].coDinhChiTieu = true;                       // Ăn bật "Cố định theo Hạn mức" (việc dự báo)
    d.dinhKy.push({ id: 'dk2', ten: 'Cơm tháng', kind: 'chi', catId: 'xang', soTien: 100000, ngay: 3, bat: true, bo: [] });   // định kỳ gắn Xăng
  });
  var c = ctx.state.data.categories.chi;
  eq(ctx.catChiCoDinh(c[0]), false, 'Ăn vẫn là chi hằng ngày'); eq(ctx.catChiCoDinh(c[1]), false, 'Xăng vẫn là chi hằng ngày');
  eq(ctx.tieuMoiNgay('2026-10-10').cap, 3500000, 'Ăn + Xăng vẫn ở mức tiêu mỗi ngày');
  eq(ctx.catChiLaCoDinh({ id: 'traNo' }), true, 'Trả nợ (hệ thống) luôn cố định');
});
test('dữ liệu cũ: có "Ngày chi hằng tháng" thì bật sẵn Khoản cố định MỘT LẦN; người dùng tắt rồi thì giữ tắt', function(){
  var d = ctx.normalizeData(JSON.parse(JSON.stringify(baseData({ categories: { thu: [], chi: [
    { id: 'nha', ten: 'Nhà', chiTieu: 0, ngay: 5 }, { id: 'an', ten: 'Ăn', chiTieu: 0 }, { id: 'dien', ten: 'Điện', chiTieu: 0, ngay: 10, khoanCoDinh: false } ] } }))));
  var by = function(id){ return d.categories.chi.filter(function(c){ return c.id === id; })[0]; };
  eq(by('nha').khoanCoDinh, true, 'có ngày chi -> bật sẵn'); eq(by('an').khoanCoDinh, false, 'không có ngày -> hằng ngày');
  eq(by('dien').khoanCoDinh, false, 'đã tắt thì không bật lại');
  ctx.normalizeData(d); eq(by('dien').khoanCoDinh, false, 'nạp lại lần nữa vẫn giữ');
});
test('form danh mục: công tắc "Khoản cố định" chỉ có ở danh mục chi thường (không có ở thu và danh mục hệ thống)', function(){
  tnData(TN_CHI);
  ok(ctx.catSheetHtml({ loai: 'cat', kind: 'chi', id: 'nha' }).indexOf('id="dm_kcd" checked') > 0, 'Tiền nhà: đang bật');
  ok(ctx.catSheetHtml({ loai: 'cat', kind: 'chi', id: 'an' }).indexOf('id="dm_kcd">') > 0, 'Ăn: có công tắc, đang tắt');
  ok(ctx.catSheetHtml({ loai: 'cat', kind: 'thu', id: 'luong' }).indexOf('dm_kcd') < 0, 'thu: không có');
  ctx.state.data.categories.chi.push({ id: 'traNo', ten: 'Trả nợ', chiTieu: 0 });
  ok(ctx.catSheetHtml({ loai: 'cat', kind: 'chi', id: 'traNo' }).indexOf('dm_kcd') < 0, 'hệ thống: không có');
});

/* ==================================================================== */
group('Dòng tiền · Theo ngày (theongay.js) + ẩn số tiền');

// Hôm nay 11/10/2026 (tháng 31 ngày). Chi hằng ngày: Ăn hạn mức 3,1tr. Cố định: Tiền nhà 3,5tr ngày 5 (đã trả 05/10),
// Điện 500k ngày 20 (chưa trả), Gửi mẹ 2tr không có ngày. Lương 14tr ngày 1 (đã ghi 01/10).
// Vay 6tr không lãi 6 kỳ, kỳ 1 = 10/10 (quá hạn), kỳ 2 = 10/11 (ngoài 30 ngày: 11/10 → 09/11).
function tndData(soDuDauKy, over){
  var j = {}, add = function(d, kind, cat, v){
    j[d] = j[d] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] };
    j[d][kind][cat] = (j[d][kind][cat] || 0) + v;
    j[d].items.push({ iid: d + kind + cat + v, kind: kind, catId: cat, soTien: v, ghiChu: '', walletId: 'w_chinh' });
  };
  add('2026-10-01', 'thu', 'luong', 14000000);
  add('2026-10-02', 'chi', 'an', 200000); add('2026-10-05', 'chi', 'an', 50000); add('2026-10-08', 'chi', 'an', 300000); add('2026-10-11', 'chi', 'an', 30000);
  add('2026-10-05', 'chi', 'nha', 3500000);
  var d = baseData({ journal: j });
  d.settings = { soDuDauKy: soDuDauKy, ngayBatDau: '2026-09-01', thangBatDauDuTru: '2026-09' };
  d.categories = { thu: [{ id: 'luong', ten: 'Lương', chiTieu: 14000000, ngay: 1 }],
    chi: [{ id: 'an', ten: 'Ăn', chiTieu: 3100000 }, { id: 'nha', ten: 'Tiền nhà', chiTieu: 3500000, ngay: 5 },
          { id: 'dien', ten: 'Điện', chiTieu: 500000, ngay: 20 }, { id: 'me', ten: 'Gửi mẹ', chiTieu: 2000000, khoanCoDinh: true },
          { id: 'traNo', ten: 'Trả nợ', chiTieu: 0 }] };
  d.vayNo.vayNoPhaiTra = [{ id: 'v1', ten: 'Vay xe', loaiVay: 'ngan_hang', hinhThuc: 'khong_lai', soTienGoc: 6000000, soThangVay: 6,
                            ngayVay: '2026-09-10', ngayTraHangThang: 10, walletId: 'w_chinh', traNo: [], trangThai: 'dang_vay' }];
  if (over) over(d);
  setToday('2026-10-11');
  return loadData(d);
}

test('tnNgayThang: mức từng ngày, ngày vượt, chuỗi tới hôm qua, dư so với nhịp đều', function(){
  tndData(5000000);
  var t = ctx.tnNgayThang('2026-10-11');
  eq(t.cap, 3100000, 'chỉ Ăn'); eq(t.den, 11); eq(t.soQua, 10);
  near(t.ngay[0].muc, 100000, 0.01, 'ngày 1: 3,1tr / 31');
  eq(t.ngay[1].ok, false, 'ngày 2 chi 200k > ~103k'); eq(t.ngay[7].ok, false, 'ngày 8 chi 300k > ~118k'); eq(t.ngay[4].ok, true);
  eq(t.soOk, 8, '10 ngày đã qua, vượt 2'); eq(t.chuoi, 2, 'ngày 9, 10 trong mức; ngày 8 vượt');
  near(t.deu, 3100000 * 10 / 31 - 550000, 0.5, 'dư 450.000 so với nhịp đều');
  near(t.ngay[10].muc, ctx.tieuMoiNgay('2026-10-11').muc, 0.01, 'mức hôm nay khớp "Hôm nay còn tiêu được"');
  tndData(5000000, function(d){ d.categories.chi[0].chiTieu = 0; });
  eq(ctx.tnNgayThang('2026-10-11'), null, 'chưa có hạn mức hằng ngày');
});
test('tnLichTien: tiền vào / ra đúng ngày, số dư từng ngày, ngày thấp nhất', function(){
  tndData(5000000);
  var L = ctx.tnLichTien('2026-10-11');
  eq(L.ngay.length, 30); eq(L.ngay[29].ngay, '2026-11-09');
  eq(L.dau, 5000000 + 14000000 - 3500000 - 580000, 'tổng số dư hết hôm nay');
  var ngay = function(n){ return L.ngay.filter(function(r){ return r.ngay === n; })[0]; };
  var ten = function(arr){ return arr.map(function(e){ return e.ten + ' ' + e.soTien; }).sort().join(' | '); };
  eq(ten(ngay('2026-10-11').ra), 'Gửi mẹ (chưa có ngày chi) 2000000 | Trả nợ: Vay xe · kỳ 1 (quá hạn) 1000000', 'hôm nay: kỳ quá hạn + khoản cố định chưa có ngày');
  near(ngay('2026-10-11').chiNgay, (3100000 - 550000) / 21 - 30000, 0.01, 'hôm nay chỉ trừ phần còn tiêu được');
  eq(ten(ngay('2026-10-20').ra), 'Điện 500000');
  eq(ngay('2026-10-05'), undefined, 'ngày đã qua không có trong lịch');
  eq(ten(ngay('2026-11-01').vao), 'Lương 14000000', 'lương tháng sau'); eq(ten(ngay('2026-11-01').ra), 'Gửi mẹ (chưa có ngày chi) 2000000');
  eq(ten(ngay('2026-11-05').ra), 'Tiền nhà 3500000', 'tiền nhà tháng 10 đã trả, tháng 11 vào ngày 5');
  near(ngay('2026-11-02').chiNgay, 3100000 / 30, 0.01, 'tháng sau: hạn mức ÷ 30');
  ok(L.ngay.every(function(r){ return r.ra.every(function(e){ return e.ten.indexOf('Vay xe') < 0 || r.ngay === '2026-10-11'; }); }), 'kỳ 2 (10/11) ngoài 30 ngày');
  eq(L.thap.ngay, '2026-10-31', 'thấp nhất trước ngày lương'); near(L.thap.cuoi, 8900000, 1);
  near(L.ngay[29].cuoi, 16470000, 1, 'cuối kỳ');
  eq(L.am, null);
});
test('tnLichTien: báo ngày bắt đầu âm; lương quá ngày chưa ghi thì KHÔNG giả định là có (ghi chú lại)', function(){
  tndData(-6000000);
  var L = ctx.tnLichTien('2026-10-11');
  eq(L.am.ngay, '2026-10-18', 'ngày đầu tiên âm');
  var h = ctx.tnLichTienHtml(L);
  ok(h.indexOf('Có thể thiếu tiền từ 18/10') > 0, 'cảnh báo thiếu tiền');
  tndData(5000000, function(d){ delete d.journal['2026-10-01']; });
  L = ctx.tnLichTien('2026-10-11');
  ok(L.ghiChu.join().indexOf('Lương (ngày 01/10) chưa ghi') >= 0, 'ghi chú lương chưa ghi');
  ok(L.ngay.every(function(r){ return r.ngay === '2026-11-01' || r.vao.length === 0; }), 'không cộng lương tháng 10 vào ngày nào');
});
test('Dòng tiền có 3 chế độ: Theo ngày | Theo tháng | Mô phỏng; Theo ngày vẽ đủ 3 thẻ; Sổ tay có link sang', function(){
  tndData(5000000);
  ctx.state.dtMoPhong = false; ctx.state.dtTheoNgay = true;
  var c = ctx.dtCheDoHtml();
  ok(c.indexOf('data-v="ngay" class="on"') > 0 && c.indexOf('Theo tháng') > 0 && c.indexOf('Mô phỏng') > 0, c);
  var root = { innerHTML: '' };
  voiDom({ tabContent: root }, null, function(){ ctx.renderTheoNgay(); });
  ok(root.innerHTML.indexOf('id="tnHomNay"') > 0 && root.innerHTML.indexOf('id="tnTungNgay"') > 0 && root.innerHTML.indexOf('id="tnLichTien"') > 0, 'đủ 3 thẻ');
  ok(root.innerHTML.indexOf('2 ngày') > 0 && root.innerHTML.indexOf('8/10 ngày trong mức') > 0, 'chuỗi + số ngày trong mức');
  ok(root.innerHTML.indexOf('Thấp nhất') > 0 && root.innerHTML.indexOf('Thứ Bảy 31/10') > 0, 'ngày thấp nhất');
  ctx.state.dtTheoNgay = false;
  ok(ctx.dtCheDoHtml().indexOf('data-v="tt" class="on"') > 0, 'mặc định Theo tháng');
  ok(ctx.tieuMoiNgayHtml('2026-10-11').indexOf('data-act="goTheoNgay"') > 0, 'Sổ tay: Xem theo ngày');
  setToday('2026-10-01');
});
test('ẩn số tiền: che số tiền, giữ ngày / % / số ngày; fmt() KHÔNG đổi (ghi chú lưu vào dữ liệu vẫn có số thật)', function(){
  var a = ctx.anSoChuoi;
  eq(a('Còn 1.234.000 ₫'), 'Còn ••••• ₫'); eq(a('−3.500.000 ₫'), '••••• ₫'); eq(a('0 ₫'), '••••• ₫');
  eq(a('còn 125.000'), 'còn •••••'); eq(a('trục 350k · 1,2tr · 2 tỷ'), 'trục ••••• · ••••• · •••••');
  eq(a('Tháng 10/2026 · 29% · còn 21 ngày · 14:08 · Kỳ 3'), 'Tháng 10/2026 · 29% · còn 21 ngày · 14:08 · Kỳ 3');
  eq(a('Tiền nhà · 2 khoản'), 'Tiền nhà · 2 khoản');
  eq(ctx.fmt(1234000), '1.234.000 ₫', 'fmt giữ nguyên');
});

/* ==================================================================== */
group('Tổng kết tháng (tongket.js)');

// Tháng 9: Ăn 600k. Tháng 10: Ăn 580k (đi qua tndData), Tiền nhà 3,5tr, lương 14tr. Vay 6tr không lãi, kỳ 1 = 10/10 (chưa trả).
// Hôm nay 03/11: tháng 10 đã kết thúc.
function tkData(over){
  tndData(5000000, function(d){
    d.journal['2026-09-15'] = { thu: {}, chi: { an: 600000 }, ghiChu: '', refs: [], items: [{ iid: 'p1', kind: 'chi', catId: 'an', soTien: 600000, ghiChu: '', walletId: 'w_chinh' }] };
    d.journal['2026-10-12'] = { thu: {}, chi: { me: 2000000, an: 700000 }, ghiChu: '', refs: [], items: [
      { iid: 'q1', kind: 'chi', catId: 'me', soTien: 2000000, ghiChu: '', walletId: 'w_chinh' }, { iid: 'q2', kind: 'chi', catId: 'an', soTien: 700000, ghiChu: '', walletId: 'w_chinh' }] };
    if (over) over(d);
  });
  setToday('2026-11-03');
  return ctx.state.data;
}

test('tongKetThang: thu / chi, chi hằng ngày vs cố định, ngày trong mức, danh mục tăng mạnh nhất', function(){
  tkData();
  var r = ctx.tongKetThang('2026-10');
  eq(r.thu, 14000000);
  eq(r.hangNgay, 200000 + 50000 + 300000 + 30000 + 700000, 'Ăn cả tháng = 1.280.000 (580k + 700k)');
  eq(r.coDinh, 3500000 + 2000000, 'Tiền nhà + Gửi mẹ');
  eq(r.chi, r.hangNgay + r.coDinh, 'tổng chi = hằng ngày + cố định');
  eq(r.cap, 3100000);
  eq(r.soNgay, 31); ok(r.ngayOk > 0 && r.ngayOk < 31, 'có ngày vượt mức: ' + r.ngayOk);
  eq(r.tang.id, 'an'); eq(r.tang.d, 1280000 - 600000, 'Ăn tăng so với tháng 9'); eq(r.prevMk, '2026-09');
});
test('tongKetThang: nợ gốc giảm / tài sản ròng đổi so với tháng trước; tháng chưa kết thúc / trước mốc / không giao dịch thì null', function(){
  tkData();
  var r = ctx.tongKetThang('2026-10');
  eq(r.no, 6000000, 'nợ gốc còn lại'); eq(r.noTruoc, 6000000, 'tháng 9 chưa trả kỳ nào');
  eq(r.rong - r.rongTruoc, ctx.taiSanRongThang('2026-10').rong - ctx.taiSanRongThang('2026-09').rong);
  eq(ctx.tongKetThang('2026-11'), null, 'tháng hiện tại chưa kết thúc');
  eq(ctx.tongKetThang('2026-08'), null, 'tháng không có giao dịch');
  eq(ctx.tongKetThang('2026-12'), null, 'tháng tương lai');
  tkData(function(d){ d.journal = {}; });
  eq(ctx.tongKetThang('2026-10'), null, 'không có giao dịch');
});
test('tongKetCardHtml: đủ các dòng, tháng chưa kết thúc thì rỗng; chưa đặt hạn mức hằng ngày thì nói rõ', function(){
  tkData();
  var h = ctx.tongKetCardHtml('2026-10');
  ok(h.indexOf('id="cardTongKet"') > 0 && h.indexOf('Tổng kết tháng 10/2026') > 0, 'tiêu đề');
  ok(h.indexOf('Để dành được') > 0 && h.indexOf('Chi hằng ngày') > 0 && h.indexOf('trong mức') > 0 && h.indexOf('Chi cố định') > 0, 'các dòng chính');
  ok(h.indexOf('Trả nợ') > 0 && h.indexOf('Tài sản ròng thực tế cuối tháng') > 0 && h.indexOf('Tăng mạnh nhất') > 0 && h.indexOf('Ăn') > 0, 'nợ, tài sản ròng, danh mục tăng');
  eq(ctx.tongKetCardHtml('2026-11'), '');
  tkData(function(d){ d.categories.chi[0].chiTieu = 0; });
  var k = ctx.tongKetCardHtml('2026-10');
  ok(k.indexOf('chưa đặt hạn mức') > 0 && k.indexOf('ngày trong mức') < 0, 'không hạn mức: không đếm ngày trong mức');
});
test('Chuông: "Tổng kết tháng" chỉ trong 7 ngày đầu tháng và khi tháng trước có tổng kết; Báo cáo có thẻ ở tháng đã qua', function(){
  tkData();
  eq(ctx.tkGoiY('2026-11-03'), '2026-10'); eq(ctx.tkGoiY('2026-11-07'), '2026-10'); eq(ctx.tkGoiY('2026-11-08'), '', 'sau ngày 7');
  var tk = ctx.cbTatCa('2026-11-03').filter(function(x){ return x.loai === 'tk'; })[0];
  ok(tk && tk.dich.mk === '2026-10' && tk.tieu.indexOf('tháng 10') >= 0 && tk.muc === 'de', 'chuông có "Tổng kết tháng 10", mức Để ý');
  eq(ctx.cbTatCa('2026-11-20').filter(function(x){ return x.loai === 'tk'; }).length, 0, 'giữa tháng: không còn');
  ok(ctx.tongQuanHtml('2026-11', 0, 0, 0, 0, false).indexOf('goTongKet') < 0, 'thẻ đầu không còn chip');
  tkData(function(d){ d.journal = {}; }); eq(ctx.tkGoiY('2026-11-03'), '', 'tháng trước không có giao dịch');
  tkData();
  var rootTk = { innerHTML: '' }; ctx.state.soTayMonth = '2026-10';
  voiDom({ tabContent: rootTk }, null, function(){ ctx.renderBaoCao(); });
  var posTk = function(id){ return rootTk.innerHTML.indexOf('id="' + id + '"'); };
  ok(posTk('cardTongKet') > 0 && posTk('cardTongKet') < posTk('cardHanMuc'), 'thứ tự: tổng kết trước hạn mức');
  setToday('2026-10-01');
});

test('tháng TRƯỚC mốc bắt đầu sổ vẫn tổng kết được (chỉ bỏ tài sản ròng); tháng đầu sau mốc so với tháng trước mốc thì không có so sánh tài sản ròng', function(){
  tkData(function(d){ d.settings.ngayBatDau = '2026-10-01'; d.settings.thangBatDauDuTru = '2026-10'; });
  var r = ctx.tongKetThang('2026-09');
  ok(r && r.chi === 600000, 'tháng 9 còn nguyên giao dịch: chi 600k');
  eq(r.rong, null, 'không có số dư trước mốc'); eq(r.rongTruoc, null); eq(r.no, 6000000, 'nợ gốc tính từ lịch vay');
  var h = ctx.tongKetCardHtml('2026-09');
  ok(h.indexOf('Tổng kết tháng 9/2026') > 0 && h.indexOf('Chi hằng ngày') > 0 && h.indexOf('Tài sản ròng') < 0, 'có thẻ, không có dòng tài sản ròng');
  setToday('2026-12-02');
  var r10 = ctx.tongKetThang('2026-10');
  ok(r10.rong != null && r10.rongTruoc === null, 'tháng 10 (đúng mốc): có tài sản ròng, không có tháng trước để so');
  ok(ctx.tongKetCardHtml('2026-10').indexOf('Tài sản ròng thực tế cuối tháng') > 0 && ctx.tongKetCardHtml('2026-10').indexOf('(tháng trước') < 0 && ctx.tongKetCardHtml('2026-10').indexOf('↑') < 0);
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Thu chi thật: tách vay nợ khỏi thu nhập / chi tiêu');

// Giống ca của người dùng: lương 1tr, chi tiêu 1,2tr, VAY 50tr, tất toán 21,6tr + trả nợ 8,3tr, cho vay 2tr, thu hồi 0,5tr, điều chỉnh số dư 100k.
function tcData(){
  var j = {};
  j['2026-10-02'] = { thu: { luong: 1000000 }, chi: { an: 400000, nha: 800000 }, ghiChu: '', refs: [], items: [
    { iid: 'a', kind: 'thu', catId: 'luong', soTien: 1000000, ghiChu: '', walletId: 'w_chinh' },
    { iid: 'b', kind: 'chi', catId: 'an', soTien: 400000, ghiChu: '', walletId: 'w_chinh' },
    { iid: 'c', kind: 'chi', catId: 'nha', soTien: 800000, ghiChu: '', walletId: 'w_chinh' }] };
  j['2026-10-05'] = { thu: { nhanTienVay: 50000000, thuHoiChoVay: 500000, dieuChinh: 100000 }, chi: { traNo: 29900000, choVay: 2000000, dieuChinh: 40000 },
    ghiChu: '', refs: [], items: [] };
  var d = baseData({ journal: j });
  d.settings = { soDuDauKy: 0, ngayBatDau: '2026-09-01', thangBatDauDuTru: '2026-09' };
  d.categories.thu = [{ id: 'luong', ten: 'Lương', chiTieu: 0 }];
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 3000000 }, { id: 'nha', ten: 'Nhà', chiTieu: 800000, khoanCoDinh: true }, { id: 'traNo', ten: 'Trả nợ', chiTieu: 0 }];
  setToday('2026-10-11');
  return loadData(d);
}
test('bdThang: thu / chi THẬT không gồm nhận vay, thu hồi, cho vay, trả nợ, điều chỉnh; vayNo tách riêng; số dư vẫn tính từ TỔNG', function(){
  tcData();
  var c = ctx.bdThang('2026-10');
  eq(c.tongThuThat, 1000000, 'thu nhập thật = lương'); eq(c.tongChiThat, 1200000, 'chi tiêu thật = ăn + nhà');
  eq(c.tongThu, 51600000, 'tổng thu cũ gồm vay + thu hồi + điều chỉnh'); eq(c.tongChi, 33140000, 'tổng chi cũ gồm trả nợ + cho vay + điều chỉnh');
  eq(c.vayNo.vay, 50000000); eq(c.vayNo.thuHoi, 500000); eq(c.vayNo.choVay, 2000000); eq(c.vayNo.traNo, 29900000);
  eq(c.thuThat[4], 0, 'ngày 5 chỉ có vay nợ: thu thật 0'); eq(c.chiThat[4], 0); eq(c.chiThat[1], 1200000);
  eq(Object.keys(c.theoCatThat).sort().join(), 'an,nha', 'danh mục chi thật không có Trả nợ / Cho vay / Điều chỉnh');
  eq(Object.keys(c.theoCatThuThat).join(), 'luong');
  eq(ctx.balanceAt('2026-10-31'), 51600000 - 33140000, 'số dư ví vẫn tính từ tổng');
});
test('Sổ tay thẻ đầu: Thu nhập / Chi tiêu / Để dành được + dòng Vay nợ riêng; Số dư vẫn là số dư thật của ví', function(){
  tcData();
  var h = ctx.tongQuanHtml('2026-10', 51600000, 33140000, 0, 18460000, false);
  ok(h.indexOf('Thu nhập') > 0 && h.indexOf('Chi tiêu') > 0 && h.indexOf('Để dành được') > 0 && h.indexOf('Tổng thu</div>') < 0 && h.indexOf('>Chênh lệch<') < 0, 'nhãn mới');
  ok(h.indexOf('−' + ctx.fmt(200000).replace(' ₫', '')) > 0, 'dư thật = 1tr − 1,2tr = −200.000 (không phải +18,4tr)');
  ok(h.indexOf('Vay nợ') > 0 && h.indexOf('vào <b>' + ctx.fmt(50500000).replace(' ₫', '')) > 0 || h.indexOf(ctx.fmt(50500000)) > 0, 'vào = vay 50tr + thu hồi 0,5tr');
  ok(h.indexOf(ctx.fmt(31900000)) > 0, 'ra = trả nợ 29,9tr + cho vay 2tr');
  ok(h.indexOf(ctx.fmt(18460000)) > 0, 'số dư hiện tại giữ nguyên');
  setToday('2026-10-01');
});
test('Báo cáo: thẻ đầu, KPI, phân tích, danh mục, xu hướng đều dùng chi tiêu thật; Trả nợ không còn là một lát "chi theo danh mục"', function(){
  tcData();
  var dau = ctx.baoCaoDauHtml('2026-10');
  ok(dau.indexOf(ctx.fmt(1200000)) > 0 && dau.indexOf('Chưa tính ' + ctx.fmt(31900000) + ' trả nợ / cho vay') > 0, 'số to = chi tiêu thật + ghi chú phần tính riêng');
  ctx.state.bdTab = 'tq';
  var tq = ctx.bdTongQuanHtml('2026-10');
  ok(tq.indexOf('Thu nhập') > 0 && tq.indexOf('Chi tiêu') > 0 && tq.indexOf('Vay nợ') > 0, 'KPI + dòng vay nợ');
  ctx.state.bdTab = 'dm'; ctx.state.bdMode = 'thanh';
  var dm = ctx.bdDanhMucHtml('2026-10');
  ok(dm.indexOf('Trả nợ') < 0 && dm.indexOf('Cho vay') < 0 && dm.indexOf('Ăn') > 0, 'danh mục không có Trả nợ');
  ok(dm.indexOf('Nhận tiền vay') < 0 && dm.indexOf('Lương') > 0, 'thu theo danh mục không có Nhận tiền vay');
  var x = ctx.bdXuHuongHtml('2026-10');
  ok(x.indexOf(ctx.fmt(1000000).replace(' ₫', '')) >= 0 || x.length > 0, 'xu hướng vẽ được');
  // Danh mục: Chi theo danh mục luôn hiện, Thu theo danh mục nằm trong phần gập
  ctx.state.bdMo = {};
  ok(dm.indexOf('class="bd-extra dong" id="bdExtra_th"') > 0 && dm.indexOf('Thu theo danh mục') > dm.indexOf('id="bdExtra_th"') && dm.indexOf('Chi theo danh mục') < dm.indexOf('id="bdExtra_th"') && dm.indexOf('Xem thu theo danh mục') > 0, 'Danh mục: Thu gập sau nút');
  ok(x.indexOf('id="bdExtra_xh"') > 0 && x.indexOf('Thu / Chi theo tháng') < x.indexOf('id="bdExtra_xh"') && x.indexOf('Số dư cuối tháng') > x.indexOf('id="bdExtra_xh"') && x.indexOf('Xem số dư cuối tháng và chi theo thứ') > 0, 'Xu hướng: biểu đồ Thu / Chi nằm ngoài, Số dư cuối tháng nằm trong phần gập');
  var u = ctx.bdUocTinhChiThang('2026-10', 11);
  eq(u.daChi, 1200000, 'ước tính chi: đã chi thường xuyên'); eq(u.bietTruoc, 0, 'không cộng trả nợ biết trước');
  ctx.state.bdTab = 'tq'; ctx.state.bdMode = 'vong'; setToday('2026-10-01');
});
test('Tổng kết tháng: Để dành được, chi cố định không gồm trả nợ, dòng Trả nợ tính riêng kèm vay thêm', function(){
  tcData(); setToday('2026-11-03');
  var r = ctx.tongKetThang('2026-10');
  eq(r.thu, 1000000); eq(r.chi, 1200000); eq(r.coDinh, 800000, 'chỉ khoản cố định thật (Nhà)'); eq(r.traNo, 29900000);
  var h = ctx.tongKetCardHtml('2026-10');
  ok(h.indexOf('Để dành được') > 0 && h.indexOf('Thu − Chi') < 0 && h.indexOf('chưa tính vay nợ') > 0, 'dư thật');
  ok(h.indexOf('Trả nợ (tính riêng)') > 0 && h.indexOf('vay thêm ' + ctx.fmt(50000000)) > 0, 'dòng nợ kèm vay thêm');
  setToday('2026-10-01');
});
test('Sổ tay: so sánh cùng kỳ dùng chi tiêu thật (trả nợ lớn không làm "chi nhiều hơn 2335%")', function(){
  var j = {};
  j['2026-09-02'] = { thu: {}, chi: { an: 100000 }, ghiChu: '', refs: [], items: [{ iid: 'p', kind: 'chi', catId: 'an', soTien: 100000, ghiChu: '', walletId: 'w_chinh' }] };
  j['2026-10-02'] = { thu: {}, chi: { an: 100000, traNo: 40000000 }, ghiChu: '', refs: [], items: [{ iid: 'q', kind: 'chi', catId: 'an', soTien: 100000, ghiChu: '', walletId: 'w_chinh' }] };
  var d = baseData({ journal: j }); d.settings = { soDuDauKy: 0, ngayBatDau: '2026-09-01', thangBatDauDuTru: '2026-09' };
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 0 }, { id: 'traNo', ten: 'Trả nợ', chiTieu: 0 }];
  setToday('2026-10-10'); loadData(d);
  var h = ctx.tongQuanSoSanhHtml('2026-10', 100000, false);
  ok(h.indexOf('Chi gần bằng') > 0 && h.indexOf('nhiều hơn') < 0, h);
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Giải thích có số thật (giaiThichSo, ptCong)');

test('ptCong / soGt: định dạng phép tính; số hạng 0 ở sau bị bỏ; âm ghi "−"', function(){
  eq(ctx.soGt(-1132600), '−1.132.600'); eq(ctx.soGt(0), '0'); eq(ctx.soGt(1212600.4), '1.212.600');
  eq(ctx.ptCong([80000, -1212600], -1132600), '80.000 − 1.212.600 = −1.132.600');
  eq(ctx.ptCong([2956343, -1132600, 11479827, 0], 13303570), '2.956.343 − 1.132.600 + 11.479.827 = 13.303.570', 'số hạng 0 bỏ');
  eq(ctx.ptCong([-5, 3], -2), '−5 + 3 = −2');
});
// Mỗi phép tính trong lời giải thích phải ĐÚNG về số học và khớp số hiển thị: tách "a ± b ... = k" rồi cộng lại.
function kiemPhepCong(html){
  var n = 0, loi = [];
  (html.match(/[−\d][\d.]*(?: [+−] [\d.]+)+ = −?[\d.]+/g) || []).forEach(function(m){
    var kq = m.split(' = ')[1], ve = m.split(' = ')[0].replace(/\./g, ''), tong = 0, dau = 1, tok = ve.split(' ');
    var so = function(x){ return (x.charAt(0) === '−' ? -1 : 1) * parseInt(x.replace('−', ''), 10); };
    tong = so(tok[0]);
    for (var i = 1; i < tok.length; i += 2) tong += (tok[i] === '−' ? -1 : 1) * parseInt(tok[i + 1], 10);
    var vk = so(kq.replace(/\./g, '')); n++;
    if (Math.abs(tong - vk) > 1) loi.push(m + '  (cộng lại = ' + tong + ')');
  });
  return { n: n, loi: loi };
}
test('Sổ tay thẻ đầu: dòng "= thu nhập − chi tiêu" + mục Cách tính có phép tính ĐÚNG và khớp số dư', function(){
  tcData(); setToday('2026-10-11');
  var h = ctx.tongQuanHtml('2026-10', 51600000, 33140000, 0, 18460000, false);
  ok(h.indexOf('hero-ct') < 0 && h.indexOf('= thu nhập') < 0, 'không có dòng giải thích hiện sẵn: chỉ hiện khi bấm "Cách tính các số này"');
  ok(h.indexOf('<details class="giai-thich"><summary>ⓘ Cách tính các số này</summary>') > 0 && h.indexOf('<details class="giai-thich" open') < 0, 'mục giải thích gập sẵn');
  ok(h.indexOf('1.000.000 − 1.200.000 = −200.000') > 0, 'Để dành được = −200.000');
  ok(h.indexOf('51.600.000 − 50.500.000 − 100.000 = 1.000.000') > 0, 'Thu nhập = tổng thu − vay − điều chỉnh');
  ok(h.indexOf('33.140.000 − 31.900.000 − 40.000 = 1.200.000') > 0, 'Chi tiêu = tổng chi − nợ − điều chỉnh');
  ok(h.indexOf('0 − 200.000 + 18.600.000') > 0 || h.indexOf('−200.000 + 18.600.000') > 0, 'số dư = đầu tháng + dư thật + vay nợ ròng ...');
  var k = kiemPhepCong(h); ok(k.n >= 4, 'có ít nhất 4 phép tính: ' + k.n); eq(k.loi.join(' | '), '', 'mọi phép cộng đều đúng');
  setToday('2026-10-01');
});
test('Báo cáo / Tổng kết / Dòng tiền / Theo ngày: phép tính trong giải thích đều đúng', function(){
  tcData(); setToday('2026-11-03');
  var tk = ctx.tongKetCardHtml('2026-10'); ok(tk.indexOf('Cách tính các số này') > 0 && tk.indexOf('1.000.000 − 1.200.000 = −200.000') > 0, 'Tổng kết tháng');
  eq(kiemPhepCong(tk).loi.join(' | '), '');
  setToday('2026-10-11');
  var dau = ctx.baoCaoDauHtml('2026-10'); ok(dau.indexOf('Đã chi tháng này') > 0 && dau.indexOf('= 1.200.000') > 0 && dau.indexOf('Cách tính các số này') > 0, 'Báo cáo thẻ đầu');
  eq(kiemPhepCong(dau).loi.join(' | '), '');
  var ts = ctx.taiSanRongCardHtml('2026-10'); ok(/= −?[\d.]+/.test(ts) && ts.indexOf('Số dư các ví') > 0, 'Tài sản ròng'); eq(kiemPhepCong(ts).loi.join(' | '), '');
  tndData(5000000);
  var ng = ctx.tnHomNayGiaiThichHtml(ctx.tnNgayThang('2026-10-11'), ctx.tieuMoiNgay('2026-10-11'));
  ok(ng.indexOf('(3.100.000 − 550.000) ÷ 21 = 121.429/ngày') > 0 || ng.indexOf('÷ 21 =') > 0, 'Hôm nay còn tiêu được'); ok(ng.indexOf('Chuỗi trong mức') > 0 && ng.indexOf('So với nhịp đều') > 0);
  eq(kiemPhepCong(ng).loi.join(' | '), '');
  var lt = ctx.tnLichTienGiaiThichHtml(ctx.tnLichTien('2026-10-11')); ok(lt.indexOf('Số dư ngày cuối') > 0 && lt.indexOf('Ngày thấp nhất') > 0, 'Lịch tiền');
  eq(kiemPhepCong(lt).loi.join(' | '), '');
  var d = ctx.dtThangDuLieu('2026-10'), cd = ctx.dtCanDoiGiaiThichHtml(d, 1000000); ok(cd.indexOf('Tiền vào − ra') > 0 && cd.indexOf('Số dư') > 0, 'Dòng tiền Tiền vào − ra'); eq(kiemPhepCong(cd).loi.join(' | '), '');
  setToday('2026-10-01');
});
test('Tab Cài đặt / Vay - Nợ: ghi chú có ví dụ "Với số của bạn" bằng số thật, phép tính đúng', function(){
  tndData(5000000, function(d){
    d.mucTieu = [{ id: 'g1', ten: 'Quỹ', soTien: 20000000, hanChot: '2027-06', walletId: '', daGom: 3000000 }];
    d.dinhKy = [{ id: 'dk1', ten: 'Tiền điện', kind: 'chi', catId: 'dien', soTien: 600000, ngay: 1, bat: true, bo: [] }];
    d.vayNo.vayNoPhaiTra[0].nguoi = 'Anh Chiến';
    d.vayNo.choVay = [{ id: 'cv1', ten: 'Cho Minh vay', soTien: 1000000, daThu: 300000, trangThai: 'dang_cho', ngayChoVay: '2026-10-01', ngayDuKienThu: '2026-11-01', walletId: 'w_chinh' }];
  });
  var vi = ctx.viCardHtml(); ok(vi.indexOf('Với số của bạn') > 0 && vi.indexOf('Số trong sổ của ví') > 0, 'Ví');
  var mt = ctx.mtCardHtml(); ok(mt.indexOf('17.000.000 ÷ 9 tháng còn lại') > 0 && mt.indexOf('20.000.000 − 3.000.000') >= 0 || mt.indexOf('3.000.000 → ') >= 0 || mt.indexOf('17.000.000') > 0, 'Mục tiêu: còn thiếu 17tr chia 9 tháng');
  ok(mt.indexOf('17.000.000 ÷ 9 tháng còn lại = 1.888.889') > 0, 'Mục tiêu: cần để dành mỗi tháng 1.888.889');
  var dk = ctx.dkCardHtml(); ok(dk.indexOf('Với số của bạn') > 0 && dk.indexOf('600.000') > 0 && dk.indexOf('hạn 01/10') > 0, 'Định kỳ');
  var ct = ctx.chotCardHtml(); ok(ct.indexOf('Với số của bạn') > 0 && ct.indexOf('số dư đầu kỳ mới') > 0 && ct.indexOf('ngày bắt đầu mới 01/10/2026') > 0, 'Chốt số dư');
  var cv = ctx.vnChoVayHtml(); ok(cv.indexOf('1.000.000 − 300.000 = 700.000') > 0, 'Cho vay: còn phải thu 700.000');
  var ng = ctx.nguoiCardHtml(); ok(ng.indexOf('Với số của bạn') > 0 && ng.indexOf('phải trả') > 0 && ng.indexOf('mình nợ họ') > 0, 'Sổ nợ theo đối tượng');
  [vi, mt, dk, ct, cv, ng].forEach(function(x){ eq(kiemPhepCong(x).loi.join(' | '), ''); });
});
test('Hạn mức / Số dư đầu kỳ ở tab Cài đặt: ví dụ trung bình gợi ý bằng số thật của các tháng hoàn chỉnh', function(){
  var j = {};
  [['2026-08', 300000], ['2026-09', 900000]].forEach(function(x){ j[x[0] + '-05'] = { thu: {}, chi: { an: x[1] }, ghiChu: '', refs: [], items: [{ iid: x[0], kind: 'chi', catId: 'an', soTien: x[1], ghiChu: '', walletId: 'w_chinh' }] }; });
  var d = baseData({ journal: j }); d.settings = { soDuDauKy: 0, ngayBatDau: '2026-08-01', thangBatDauDuTru: '2026-08' };
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 2000000 }, { id: 'traNo', ten: 'Trả nợ', chiTieu: 0 }];
  setToday('2026-10-11'); loadData(d);
  var h = ctx.dmHanMucViDu('chi', d.categories.chi);
  ok(h.indexOf('(300.000 + 900.000) ÷ 2 = 600.000') > 0, 'trung bình T8, T9 = 600.000'); ok(h.indexOf('cố định theo hạn mức: 2.000.000') > 0);
  ok(h.indexOf('0 ÷ 2.000.000 = 0%') > 0 || h.indexOf('÷ 2.000.000 =') > 0, 'tháng này đã chi / hạn mức');
  ok(ctx.dmTbViDu().indexOf('(300.000 + 900.000) ÷ 2 = 600.000') > 0, 'ví dụ ở ghi chú Số dư đầu kỳ');
  eq(kiemPhepCong(h).loi.join(' | '), ''); setToday('2026-10-01');
});

/* ==================================================================== */
group('Dòng tiền Theo tháng: tách vay nợ khỏi Thu nhập / Chi');

test('dtThangDuLieu: Thu nhập / Chi không còn gồm nhận vay, thu hồi, cho vay, điều chỉnh; vay nợ ở d.vayThem...; Tiền vào − ra vẫn là dòng tiền thật', function(){
  tcData(); setToday('2026-10-11');
  var d = ctx.dtThangDuLieu('2026-10');
  eq(d.thuAct, 1000000, 'thu nhập = lương, không có vay 50tr'); eq(d.thuPlan, 0, 'chưa đặt kế hoạch thu');
  ok(d.thu.every(function(r){ return !ctx.CAT_HE_THONG.thu[r.id]; }) && d.chi.every(function(r){ return !ctx.CAT_HE_THONG.chi[r.id]; }), 'không có danh mục hệ thống trong thẻ');
  eq(d.chiAct, 1200000, 'chi = ăn + nhà (cho vay 2tr và điều chỉnh không tính)'); eq(d.chiActCD, 800000, 'chi cố định chỉ có Nhà, không có Cho vay');
  eq(d.vayThem, 50000000); eq(d.thuHoi, 500000); eq(d.choVay, 2000000);
  eq(d.cb, d.thuDK - d.chiDK, 'cân đối vẫn tính cả vay nợ'); ok(d.cb > 18000000, 'cân đối là dòng tiền thật: ' + d.cb);
  setToday('2026-10-01');
});
test('dtDauHtml: Thu không còn "vượt kế hoạch 457%"; có dòng Vay nợ riêng; Tiền vào − ra ghi "gồm vay thêm" và nhãn "Dư nhờ vay"', function(){
  tcData(); setToday('2026-10-11');
  ctx.state.data.categories.thu[0].chiTieu = 1000000;                       // kế hoạch thu = lương 1tr
  var d = ctx.dtThangDuLieu('2026-10'), h = ctx.dtDauHtml(d, 18460000, '2026-09', '2026-12');
  var ngoai = h.replace(/<details class="giai-thich">[\s\S]*?<\/details>/g, '');         // vùng hiển thị, bỏ mục gập giải thích
  ok(ngoai.indexOf('Vượt kế hoạch') < 0 && ngoai.indexOf('457') < 0 && ngoai.indexOf('51.600.000') < 0, 'thu bar không còn gồm tiền vay');
  ok(h.indexOf('1.000.000 ₫</b> / 1.000.000 ₫ kế hoạch') > 0, 'thu nhập 1tr / kế hoạch 1tr');
  ok(h.indexOf('class="bd-vn"') > 0 && h.indexOf('vay thêm') > 0 && h.indexOf('+50.000.000') > 0 && h.indexOf('thu hồi cho vay') > 0 && h.indexOf('cho vay') > 0, 'dòng Vay nợ tính riêng');
  ok(h.indexOf('Dư nhờ vay') > 0, 'cân đối dương nhờ vay: ' + h.slice(h.indexOf('dt-tag'), h.indexOf('dt-tag') + 80));
  ok(h.indexOf('gồm vay thêm') > 0 && h.indexOf('không tính vay: −') > 0, 'ghi rõ không vay thì thiếu bao nhiêu');
  ok(h.indexOf('nhờ vay thêm 50.000.000 ₫; không có khoản vay thì thiếu 31.540.000 ₫') > 0, 'câu tóm tắt nói rõ nhờ vay');
  ok(h.indexOf('18.460.000 − 50.000.000 = −31.540.000') > 0, 'giải thích có phép tính "không tính vay thêm"');
  eq(kiemPhepCong(h).loi.join(' | '), '');
  setToday('2026-10-01');
});
test('Sổ tay: tiêu đề khoản do Vay - Nợ sinh ra không lặp nhãn ("Tất toán — Tất toán: Vay xe" -> "Tất toán — Vay xe")', function(){
  eq(ctx.dlGhiChuRef({ loai: 'tatToan', note: 'Tất toán: Vay xe' }), 'Vay xe');
  eq(ctx.dlGhiChuRef({ loai: 'traNo', note: 'Trả nợ: Shopee' }), 'Shopee');
  eq(ctx.dlGhiChuRef({ loai: 'traNo', note: 'Kỳ 3 của Shopee' }), 'Kỳ 3 của Shopee', 'ghi chú khác giữ nguyên');
  eq(ctx.dlGhiChuRef({ loai: 'nhanTienVay', note: '' }), '');
  var h = ctx.dlRefHtml({ loai: 'tatToan', soTien: 21603205, note: 'Tất toán: Vay xe' });
  ok(h.indexOf('Tất toán — Vay xe') > 0 && h.indexOf('Tất toán — Tất toán') < 0, h);
});

/* ==================================================================== */
group('Lịch tiền theo từng ví (ví thiếu tiền) + tổng kết quả tìm kiếm');

// Hôm nay 11/10/2026. Techcombank (w1) 2tr, Tiền mặt (w2) 10tr -> TỔNG 12tr, đủ. Trả nợ 3tr/kỳ từ Techcombank, kỳ 1 = 28/10.
// Thẻ (wt) nợ 1tr, sao kê 25, hạn 15 -> 15/10 phải trả 1tr. Chuyển ví đã ghi trước: 20/10 Tiền mặt -> Techcombank 1,5tr.
// Chi hằng ngày tháng này đều bằng Tiền mặt (ví w2).
function pwData(over){
  var j = {};
  j['2026-10-05'] = { thu: {}, chi: { an: 100000 }, ghiChu: '', refs: [], items: [{ iid: 'x1', kind: 'chi', catId: 'an', soTien: 100000, ghiChu: 'Ăn', walletId: 'w2' }] };
  j['2026-09-20'] = { thu: {}, chi: { an: 1000000 }, ghiChu: '', refs: [], items: [{ iid: 'x2', kind: 'chi', catId: 'an', soTien: 1000000, ghiChu: 'Quẹt thẻ', walletId: 'wt' }] };
  var d = baseData({ journal: j });
  d.settings = { soDuDauKy: 12000000, ngayBatDau: '2026-09-01', thangBatDauDuTru: '2026-09' };
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 0 }, { id: 'traNo', ten: 'Trả nợ', chiTieu: 0 }];
  d.wallets = [{ id: 'w1', ten: 'Techcombank', soDuDauKy: 2000000 }, { id: 'w2', ten: 'Tiền mặt', soDuDauKy: 10000000 },
               { id: 'wt', ten: 'Thẻ VPBank', soDuDauKy: 0, the: true, hanMucThe: 20000000, ngaySaoKe: 25, ngayTraThe: 15 }];
  d.chuyenVi = [{ id: 'ct1', ngay: '2026-10-20', tuVi: 'w2', denVi: 'w1', soTien: 1500000, ghiChu: '' }];
  d.vayNo.vayNoPhaiTra = [{ id: 'v1', ten: 'Vay A', loaiVay: 'ngan_hang', hinhThuc: 'khong_lai', soTienGoc: 12000000, soThangVay: 4,
                            ngayVay: '2026-09-20', ngayTraHangThang: 28, walletId: 'w1', traNo: [], trangThai: 'dang_vay' }];
  d.settings.viMacDinh = 'w1';
  if (over) over(d);
  setToday('2026-10-11');
  return loadData(d);
}
test('tnLichTien theo ví: Techcombank thiếu tiền ngày trả nợ dù TỔNG các ví vẫn đủ; số liệu từng ví', function(){
  pwData();
  var T = ctx.tnLichTien('2026-10-11', 30), W1 = ctx.tnLichTien('2026-10-11', 30, 'w1'), W2 = ctx.tnLichTien('2026-10-11', 30, 'w2');
  eq(T.am, null, 'tổng 12tr đủ trả nợ'); eq(T.viId, '');
  eq(W1.dau, 2000000, 'Techcombank hôm nay 2tr'); eq(W1.am.ngay, '2026-10-28', 'âm đúng ngày trả kỳ 1');
  eq(W1.thap.cuoi, 2000000 - 1000000 + 1500000 - 3000000, 'trừ thẻ 15/10, cộng chuyển 20/10, trừ nợ 28/10 = −500.000');
  var ngay = function(L, n){ return L.ngay.filter(function(r){ return r.ngay === n; })[0]; };
  eq(ngay(W1, '2026-10-15').ra[0].ten, 'Thanh toán thẻ Thẻ VPBank (giả định trả từ ví này)'); eq(ngay(W1, '2026-10-15').ra[0].soTien, 1000000);
  eq(ngay(W1, '2026-10-20').vao[0].ten, 'Nhận từ Tiền mặt'); eq(ngay(W1, '2026-10-28').ra[0].ten, 'Trả nợ: Vay A · kỳ 1');
  eq(W1.ngay.every(function(r){ return r.chiNgay === 0; }), true, 'chi hằng ngày đều bằng Tiền mặt nên Techcombank không bị trừ');
  eq(W2.dau, 10000000 - 100000, 'Tiền mặt 10tr trừ 100k đã chi 05/10'); eq(W2.am, null); eq(ngay(W2, '2026-10-20').ra[0].ten, 'Chuyển sang Techcombank');
  ok(W2.ngay.some(function(r){ return r.chiNgay > 0; }), 'Tiền mặt gánh chi hằng ngày');
  ok(W2.ngay.every(function(r){ return r.ra.every(function(e){ return e.ten.indexOf('Trả nợ') < 0 && e.ten.indexOf('Thanh toán thẻ') < 0; }); }), 'khoản của ví khác không lẫn sang');
  eq(ctx.tnLichTien('2026-10-11', 30).thap.cuoi, T.thap.cuoi, 'chế độ Tổng không đổi');
});
test('tnTiLeViHangNgay: chia theo ví đã dùng trong 30 ngày qua; chưa có dữ liệu thì ví mặc định; chi trên thẻ chiếm phần của thẻ', function(){
  pwData();
  var t = ctx.tnTiLeViHangNgay('2026-10-11');
  near(t.w2, 100000 / 1100000, 1e-6, 'tiền mặt 100k'); near(t.wt, 1000000 / 1100000, 1e-6, 'thẻ 1tr (quẹt 20/9, trong 30 ngày)');
  pwData(function(d){ d.journal = {}; });
  var r = ctx.tnTiLeViHangNgay('2026-10-11'); eq(r.w1, 1, 'ví mặc định');
});
test('tnViSapThieu + chuông + giao diện: cảnh báo ví thiếu, nút Chuyển điền sẵn số; chỉ ví thường, cần từ 2 ví', function(){
  pwData();
  var ds = ctx.tnViSapThieu('2026-10-11', 30);
  eq(ds.length, 1); eq(ds[0].w.id, 'w1');
  var vt = ctx.cbTatCa('2026-10-11').filter(function(x){ return x.loai === 'vt'; })[0];
  ok(vt && vt.dich.id === 'w1' && vt.tieu === 'Ví Techcombank có thể thiếu tiền' && vt.phu.indexOf('Từ 28/10') >= 0 && vt.muc === 'khan', 'thông báo ở chuông');
  var L = ctx.tnLichTien('2026-10-11', 30, 'w1'), ui = ctx.tnLichTienHtml(L);
  ok(ui.indexOf('Techcombank · 30 ngày tới') > 0 && ui.indexOf('data-act="tnVi"') > 0, 'tiêu đề + bộ chọn ví');
  ok(ui.indexOf('Ví Techcombank có thể thiếu tiền từ <b>28/10</b> khi Trả nợ: Vay A · kỳ 1 3.000.000') > 0, 'nói rõ khoản nào làm ví âm');
  ok(ui.indexOf('cần chuyển vào ví này ít nhất 500.000 ₫ trước 28/10') > 0 && ui.indexOf('data-act="tnChuyenVi" data-id="w1" data-tien="500000"') > 0, 'nút chuyển điền sẵn 500.000');
  ok(ui.indexOf('Thẻ VPBank') < 0 || ui.indexOf('data-id="wt"') < 0, 'bộ chọn không có ví thẻ');
  ok(ctx.tnLichTienHtml(ctx.tnLichTien('2026-10-11', 30)).indexOf('data-act="tnVi" data-id="" aria-pressed="true"') > 0, 'chế độ Tổng: nút Tổng đang chọn');
  eq(kiemPhepCong(ui).loi.join(' | '), '');
  pwData(function(d){ d.wallets = [d.wallets[0]]; });
  eq(ctx.tnViSapThieu('2026-10-11', 30).length, 0, 'chỉ 1 ví: không có cảnh báo theo ví');
  pwData(function(d){ d.vayNo.vayNoPhaiTra = []; });
  eq(ctx.tnViSapThieu('2026-10-11', 30).length, 0, 'không có khoản trả lớn: các ví đều đủ');
  setToday('2026-10-01');
});
test('form Chuyển ví ở Sổ tay điền sẵn ví nhận và số cần chuyển khi đi từ cảnh báo', function(){
  pwData(); ctx.state.viFormOpen = true; ctx.state.viChuyenGoiY = { den: 'w1', tien: 500000 };
  var h = ctx.viSoDuCardHtml('2026-10');
  ok(/id="vi_den">[\s\S]*value="w1" selected/.test(h) && /id="vi_tien" placeholder="0" value="500\.?000"/.test(h), 'ví nhận = Techcombank, số = 500.000');
  ok(/id="vi_tu">[\s\S]*value="w2" selected/.test(h), 'ví đi là ví khác (Tiền mặt)');
  ctx.state.viChuyenGoiY = null; ctx.state.viFormOpen = false; setToday('2026-10-01');
});
test('locTongKet: cộng đúng các DÒNG khớp từ khóa / danh mục (không phải cả ngày), so với tháng trước', function(){
  var j = {}, it = function(id, kind, cat, v, ghi){ return { iid: id, kind: kind, catId: cat, soTien: v, ghiChu: ghi, walletId: 'w_chinh' }; };
  j['2026-10-02'] = { thu: {}, chi: { an: 60000 }, ghiChu: '', refs: [], items: [it('a', 'chi', 'an', 60000, 'Coffee')] };
  j['2026-10-05'] = { thu: {}, chi: { an: 30000 }, ghiChu: '', refs: [], items: [it('b', 'chi', 'an', 15000, 'Coffee'), it('c', 'chi', 'an', 15000, 'Ăn trưa')] };
  j['2026-09-10'] = { thu: {}, chi: { an: 50000 }, ghiChu: '', refs: [], items: [it('d', 'chi', 'an', 50000, 'coffee sữa')] };
  var d = baseData({ journal: j }); d.settings = { soDuDauKy: 0, ngayBatDau: '2026-09-01', thangBatDauDuTru: '2026-09' };
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 0 }];
  setToday('2026-10-11'); loadData(d);
  var oct = ['2026-10-02', '2026-10-05'];
  var r = ctx.locTongKet(oct, 'coffee', ['']);
  eq(r.n, 2); eq(r.chi, 75000, 'chỉ 2 dòng Coffee, không cộng "Ăn trưa" cùng ngày 05/10'); eq(r.ngay, 2);
  eq(ctx.locTongKet(oct, '', ['chi', 'an']).chi, 90000, 'lọc danh mục: cả 3 dòng'); eq(ctx.locTongKet(oct, 'trưa', ['']).chi, 15000);
  ctx.state.soTaySearch = 'coffee'; ctx.state.soTayCat = '';
  var h = ctx.locTongKetHtml(oct, false, '2026-10');
  ok(h.indexOf('2 khoản</b> trong 2 ngày') > 0 && h.indexOf('75.000') > 0 && h.indexOf('TB 37.500') > 0, 'dòng tổng');
  ok(h.indexOf('Tháng 9: 1 khoản · 50.000 ₫ (+50%)') > 0, 'so tháng trước: 75.000 so với 50.000');
  ok(h.indexOf('75.000 ÷ 2 khoản = 37.500/khoản') > 0, 'giải thích có phép tính');
  ok(ctx.locTongKetHtml(oct, true, '2026-10').indexOf('Tháng 9') < 0, 'khoảng ngày tùy chọn: không so tháng trước');
  ctx.state.soTaySearch = ''; ctx.state.soTayCat = ''; eq(ctx.locTongKetHtml(oct, false, '2026-10'), '', 'không lọc thì không có dòng tổng');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Công cụ: Muốn mua (mmPhanTich)');

// kiểm độc lập: mua ngày d (trả đủ một lần) có an toàn không = mọi ngày từ d trở đi, số dư lịch tiền − giá >= giu
function mmAnToan(L, d, gia, giu){
  return L.ngay.filter(function(r){ return r.ngay >= d; }).every(function(r){ return r.cuoi - gia >= giu - 0.5; });
}
test('mmTienGop: góp 0% chia đều; có lãi theo công thức niên kim', function(){
  near(ctx.mmTienGop(12000000, 12, 0), 1000000, 0.01); near(ctx.mmTienGop(12000000, 12, 12), 1066185.4, 1);
  eq(ctx.mmTienGop(5000000, 0, 10), 5000000, 'thang 0 = trả đủ'); eq(ctx.mmTienGop(5000000, 1, 10), 5000000);
  var kh = ctx.mmKeHoachTra(3000000, 3, 0, '2026-10-31');
  eq(kh.length, 3); eq(kh[0].ngay, '2026-10-31'); eq(kh[1].ngay, '2026-11-30', 'ngày 31 co về cuối tháng ngắn'); eq(kh[2].ngay, '2026-12-31'); eq(kh[0].soTien, 1000000);
});
test('mmPhanTich: số dư thấp nhất = thấp nhất lịch tiền − giá; mua nhỏ thì an toàn hôm nay', function(){
  tndData(5000000);
  var L = ctx.tnLichTien('2026-10-11', 60), minC = Math.min.apply(null, L.ngay.map(function(r){ return r.cuoi; }));
  var p = ctx.mmPhanTich({ soTien: 100000, thang: 0, lai: 0, giu: 0 }, '2026-10-11');
  near(p.thap.cuoi, minC - 100000, 0.5, 'thấp nhất nếu mua'); eq(p.mau, 'ok'); eq(p.antoanHomNay, true); eq(p.thieu, null);
  eq(p.mucTieu.length, 0);
  ok(p.mucNgay && p.mucNgay.truoc > p.mucNgay.sau, 'mức tiêu/ngày giảm sau khi tính khoản này');
});
test('mmPhanTich: mua lớn thì chưa an toàn hôm nay; ngày an toàn sớm nhất đúng với kiểm độc lập', function(){
  tndData(5000000);
  var L = ctx.tnLichTien('2026-10-11', 60), gia = Math.round(L.dau + 1000000), giu = 0;
  var p = ctx.mmPhanTich({ soTien: gia, thang: 0, lai: 0, giu: giu }, '2026-10-11');
  ok(p.mau === 'bad' && p.thieu, 'bad: số dư xuống âm'); eq(p.antoanHomNay, false);
  var truth = null;
  for (var i = 0; i < L.ngay.length; i++){ if (mmAnToan(L, L.ngay[i].ngay, gia, giu)){ truth = L.ngay[i].ngay; break; } }
  eq(p.antoan, truth, 'ngày an toàn sớm nhất khớp kiểm độc lập');
  if (p.antoan){ ok(mmAnToan(L, p.antoan, gia, giu), 'mua ngày đó thì an toàn'); }
  var h = ctx.mmKetQuaHtml(p);
  ok(h.indexOf('Chưa nên mua hôm nay') > 0 && h.indexOf('Cách tính các số này') > 0, 'kết quả + giải thích');
  eq(kiemPhepCong(h).loi.join(' | '), '', 'phép cộng trong giải thích đúng');
  setToday('2026-10-01');
});
test('mmPhanTich: giữ lại tối thiểu làm kết luận chặt hơn; trả góp nhẹ hơn trả đủ', function(){
  tndData(5000000);
  var L = ctx.tnLichTien('2026-10-11', 60), minC = Math.min.apply(null, L.ngay.map(function(r){ return r.cuoi; }));
  var gia = Math.round(minC - 500000);
  eq(ctx.mmPhanTich({ soTien: gia, thang: 0, lai: 0, giu: 0 }, '2026-10-11').mau, 'ok', 'còn dư 500.000');
  eq(ctx.mmPhanTich({ soTien: gia, thang: 0, lai: 0, giu: 1000000 }, '2026-10-11').mau, 'bad', 'muốn giữ 1.000.000 thì không đủ');
  var tra = ctx.mmPhanTich({ soTien: gia, thang: 12, lai: 0, giu: 1000000 }, '2026-10-11');
  eq(tra.tra.length, 12); near(tra.tra[0].soTien, gia / 12, 0.01); eq(tra.mau, 'ok', 'góp 12 tháng thì tháng đầu nhẹ');
  setToday('2026-10-01');
});
test('mmPhanTich: mục tiêu gắn ví trả bị lùi; ví không đủ tiền thì báo thiếu', function(){
  tndData(5000000, function(d){ d.mucTieu = [{ id: 'g1', ten: 'Mua xe', soTien: 20000000, hanChot: '2027-06', walletId: 'w_chinh', daGom: 0 }]; });
  var t = ctx.mucTieuTienDo(ctx.state.data.mucTieu[0], '2026-10-11'), p = ctx.mmPhanTich({ soTien: 1000000, thang: 0, lai: 0, giu: 0, viId: 'w_chinh' }, '2026-10-11');
  eq(p.mucTieu.length, 1); near(p.mucTieu[0].thieuSau, t.conThieu + 1000000, 0.5); near(p.mucTieu[0].luiNgay, Math.round(1000000 / (t.canMoiThang / 30)), 1);
  var vi = ctx.soDuTheoVi('w_chinh', '2026-10-11');
  var q = ctx.mmPhanTich({ soTien: vi + 1000000, thang: 0, lai: 0, giu: 0, viId: 'w_chinh' }, '2026-10-11');
  near(q.thieuVi, 1000000, 0.5, 'ví thiếu đúng 1.000.000');
  setToday('2026-10-01');
});
test('normalizeData: muonMua bỏ dòng hỏng, ép kiểu, mặc định chờ 7 ngày', function(){
  var d = baseData({ muonMua: [{ ten: 'Điện thoại', soTien: '25000000', thang: '12', tt: 'lạ' }, { ten: '', soTien: 5 }, null, { ten: 'x', soTien: 0 }] });
  var n = loadData(d).muonMua;
  eq(n.length, 1); eq(n[0].soTien, 25000000); eq(n[0].thang, 12); eq(n[0].tt, 'cho'); eq(n[0].soNgayCho, 7); ok(!!n[0].id && /^\d{4}-/.test(n[0].ngayThem));
  eq(loadData(baseData()).muonMua.length, 0, 'không có trường thì thành mảng rỗng');
});
test('mmCardHtml: có form, danh sách chờ với kết luận, đã nhịn được', function(){
  tndData(5000000, function(d){ d.muonMua = [
    { id: 'm1', ten: 'Tai nghe', soTien: 300000, viId: 'w_chinh', thang: 0, lai: 0, giu: 0, ngayThem: '2026-10-01', soNgayCho: 7, tt: 'cho' },
    { id: 'm2', ten: 'Giày', soTien: 2400000, thang: 0, lai: 0, giu: 0, ngayThem: '2026-09-01', soNgayCho: 7, tt: 'bo' }]; });
  ctx.state.cc = { ten: '', gia: '', vi: '', thang: '', lai: '', giu: '', kq: false, xem: '' };
  var h = ctx.mmCardHtml();
  ok(h.indexOf('Tai nghe') > 0 && h.indexOf('Mua được hôm nay') > 0, 'món chờ + kết luận');
  ok(h.indexOf('Đã đủ thời gian chờ') > 0, 'chờ từ 01/10 đủ 7 ngày tới 08/10, hôm nay 11/10');
  ok(h.indexOf('Giày') < 0 && h.indexOf('2.400.000') > 0 && h.indexOf('Đã nhịn được') > 0, 'món đã bỏ không nằm trong danh sách, cộng vào đã nhịn');
  eq(ctx.mmDenHanCho(ctx.state.data.muonMua[0], '2026-10-07'), false); eq(ctx.mmDenHanCho(ctx.state.data.muonMua[0], '2026-10-08'), true);
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Công cụ: Giờ công');

test('gcGioChu: phút / giờ / ngày công', function(){
  eq(ctx.gcGioChu(null), '—'); eq(ctx.gcGioChu(0.4), '24 phút'); eq(ctx.gcGioChu(2.5), '2 giờ 30 phút'); eq(ctx.gcGioChu(3), '3 giờ');
  eq(ctx.gcGioChu(12), '1,5 ngày công (12 giờ)'); eq(ctx.gcGioChu(0.0001), 'dưới 1 phút');
});
test('gcCauHinh: thu nhập tự lấy TB các tháng trọn (bỏ vay nợ); nhập tay thì ưu tiên', function(){
  var j = {}, add = function(d, v, cat){ j[d] = { thu: {}, chi: {}, ghiChu: '', refs: [], items: [{ iid: d + cat, kind: 'thu', catId: cat, soTien: v, ghiChu: '', walletId: 'w_chinh' }] }; j[d].thu[cat] = v; };
  add('2026-08-01', 12000000, 'luong'); add('2026-09-01', 14000000, 'luong'); add('2026-09-10', 50000000, 'nhanTienVay'); add('2026-10-01', 1000000, 'luong');
  var d = baseData({ journal: j, settings: { soDuDauKy: 0, ngayBatDau: '2026-08-01', thangBatDauDuTru: '2026-08' } });
  d.categories.thu = [{ id: 'luong', ten: 'Lương', chiTieu: 0 }, { id: 'nhanTienVay', ten: 'Nhận tiền vay', chiTieu: 0 }];
  setToday('2026-10-11'); loadData(d);
  var c = ctx.gcCauHinh('2026-10-11');
  eq(c.td.ds.length, 2, 'chỉ T8, T9 (tháng trọn, tháng này bỏ vì đã có tháng trọn)'); eq(c.thuNhap, 13000000, 'TB 12tr và 14tr, không tính 50tr tiền vay'); eq(c.tuDong, true);
  near(c.giaGio, 13000000 / 176, 0.01); near(ctx.gcDoiGio(45000, c), 45000 / (13000000 / 176), 0.0001);
  d.settings.gioCong = { thuNhapThang: 20000000, gioThang: 160 }; loadData(d);
  c = ctx.gcCauHinh('2026-10-11'); eq(c.thuNhap, 20000000); eq(c.tuDong, false); eq(c.gioThang, 160); eq(c.giaGio, 125000);
  d.settings.gioCong = { thuNhapThang: 'x', gioThang: 9999 }; loadData(d);
  eq(ctx.state.data.settings.gioCong.thuNhapThang, 0); eq(ctx.state.data.settings.gioCong.gioThang, 400, 'giờ làm tối đa 400');
  setToday('2026-10-01');
});
test('gcCardHtml: giá 1 giờ, chi tiêu tháng này quy ra giờ, cách tính có phép cộng đúng', function(){
  tndData(5000000, function(d){ d.settings.gioCong = { thuNhapThang: 17600000, gioThang: 176 }; });
  ctx.state.gc = { gia: '' };
  var h = ctx.gcCardHtml();
  ok(h.indexOf('100.000') > 0 && h.indexOf('1 giờ làm việc') > 0, 'giá 1 giờ = 17.600.000 ÷ 176 = 100.000');
  ok(h.indexOf('17.600.000 ÷ 176 giờ = 100.000/giờ') > 0, 'cách tính bằng số thật'); ok(h.indexOf('Tháng này bạn đã làm') > 0, 'chi tiêu tháng này quy ra giờ');
  eq(kiemPhepCong(h).loi.join(' | '), '');
  eq(ctx.gcKetQuaChu('250.000', ctx.gcCauHinh('2026-10-11')), '250.000 ₫ ≈ 2 giờ 30 phút đi làm');
  var trong = ctx.gcCardHtml(); ok(trong.indexOf('Nhập một số tiền') > 0);
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Công cụ: Lời hứa');

function dataLoiHua(over){
  var j = {}, add = function(d, v, i){ j[d] = j[d] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] }; j[d].chi.an = (j[d].chi.an || 0) + v;
    j[d].items.push({ iid: 'lh' + i, kind: 'chi', catId: 'an', soTien: v, ghiChu: '', walletId: 'w_chinh' }); };
  add('2026-10-02', 300000, 1); add('2026-10-05', 150000, 2);
  var d = baseData({ journal: j });
  d.settings = { soDuDauKy: 0, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' };
  d.loiHua = [{ id: 'h1', catId: 'an', kieu: 'lan', gioiHan: 2, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'Nhịn ăn ngoài tháng này' }];
  if (over) over(d);
  setToday('2026-10-11'); return loadData(d);
}
test('lhTrangThai: đang giữ / phá đúng ngày / chưa bắt đầu / đã giữ lời', function(){
  dataLoiHua();
  var h = ctx.state.data.loiHua[0], t = ctx.lhTrangThai(h, '2026-10-11');
  eq(t.trang, 'dang'); eq(t.n, 2); eq(t.pha, ''); eq(t.ngayGiu, 11); eq(t.tongNgay, 31);
  eq(ctx.lhTrangThai(h, '2026-09-20').trang, 'chua'); eq(ctx.lhTrangThai(h, '2026-11-02').trang, 'giu');
  dataLoiHua(function(d){ d.journal['2026-10-08'] = { thu: {}, chi: { an: 90000 }, ghiChu: '', refs: [], items: [{ iid: 'lh3', kind: 'chi', catId: 'an', soTien: 90000, ghiChu: '', walletId: 'w_chinh' }] }; });
  t = ctx.lhTrangThai(ctx.state.data.loiHua[0], '2026-10-11'); eq(t.trang, 'pha'); eq(t.pha, '2026-10-08', 'khoản thứ 3 làm vượt');
  eq(ctx.lhTrangThai(ctx.state.data.loiHua[0], '2026-11-30').trang, 'pha', 'đã phá thì hết hạn vẫn là phá');
  setToday('2026-10-01');
});
test('lhViPham: nhắc đúng câu hứa khi khoản mới làm vượt; không nhắc khi chưa vượt / ngoài khoảng / đã bị phá / đang sửa chính dòng đó', function(){
  dataLoiHua();
  var r = ctx.lhViPham('an', 50000, '2026-10-12', '', '2026-10-11');
  eq(r.length, 1); ok(r[0].indexOf('Nhịn ăn ngoài tháng này') > 0 && r[0].indexOf('lần thứ 3') > 0 && r[0].indexOf('tối đa 2 lần') > 0, r[0]);
  eq(ctx.lhViPham('an', 50000, '2026-11-02', '', '2026-10-11').length, 0, 'ngoài khoảng ngày'); eq(ctx.lhViPham('xang', 50000, '2026-10-12', '', '2026-10-11').length, 0, 'danh mục khác');
  eq(ctx.lhViPham('an', 50000, '2026-10-12', 'lh2', '2026-10-11').length, 0, 'sửa dòng lh2: bỏ nó ra thì mới 1 lần, thêm lại = lần 2 chưa vượt');
  dataLoiHua(function(d){ d.loiHua[0].gioiHan = 3; });
  eq(ctx.lhViPham('an', 50000, '2026-10-12', '', '2026-10-11').length, 0, 'lần 3 / tối đa 3 chưa vượt');
  dataLoiHua(function(d){ d.loiHua[0].gioiHan = 1; });
  eq(ctx.lhViPham('an', 50000, '2026-10-12', '', '2026-10-11').length, 0, 'đã bị phá rồi (2 lần > 1) thì không nhắc lặp lại');
  setToday('2026-10-01');
});
test('lhViPham: kiểu tiền và "không chi"', function(){
  dataLoiHua(function(d){ d.loiHua[0].kieu = 'tien'; d.loiHua[0].gioiHan = 600000; });
  eq(ctx.lhViPham('an', 100000, '2026-10-12', '', '2026-10-11').length, 0, '450.000 + 100.000 = 550.000 chưa vượt 600.000');
  var r = ctx.lhViPham('an', 200000, '2026-10-12', '', '2026-10-11');
  eq(r.length, 1); ok(r[0].indexOf('650.000') > 0 && r[0].indexOf('vượt mức đã hứa 600.000') > 0, r[0]);
  dataLoiHua(function(d){ d.journal = {}; d.loiHua[0].gioiHan = 0; });
  r = ctx.lhViPham('an', 20000, '2026-10-12', '', '2026-10-11');
  eq(r.length, 1); ok(r[0].indexOf('không chi') > 0, r[0]);
  setToday('2026-10-01');
});
test('lhCardHtml + normalizeData: thẻ hiện câu hứa, tiến độ, đã giữ N ngày; dòng hỏng bị bỏ', function(){
  dataLoiHua(function(d){ d.loiHua.push({ catId: '', kieu: 'lan', gioiHan: 1, tuNgay: '2026-10-01', denNgay: '2026-10-31' }, { catId: 'an', tuNgay: '2026-10-20', denNgay: '2026-10-01' }, { id: 'h2', catId: 'an', kieu: '?', gioiHan: '3.7', tuNgay: '2026-09-01', denNgay: '2026-09-30', cau: '' }); });
  var ds = ctx.state.data.loiHua;
  eq(ds.length, 2, 'bỏ dòng thiếu danh mục và dòng ngày ngược'); eq(ds[1].kieu, 'lan'); eq(ds[1].gioiHan, 4, 'số lần làm tròn'); ok(ds[1].cau.length > 0, 'câu mặc định');
  var h = ctx.lhCardHtml();
  ok(h.indexOf('Nhịn ăn ngoài tháng này') > 0 && h.indexOf('Đang giữ · ngày thứ 11/31') > 0 && h.indexOf('Đã dùng 2 / 2 lần') > 0, 'thẻ đang giữ');
  ok(h.indexOf('Đã giữ lời · 30 ngày') > 0 && h.indexOf('tổng <b>41 ngày</b>') > 0, 'T9 đã giữ (30 ngày) + 11 ngày đang giữ = 41');
  setToday('2026-10-01');
});

test('lhKhop / từ khóa: không phân biệt hoa thường và dấu, khớp theo từ nguyên, nhiều từ là "hoặc"', function(){
  var h = { catId: '', tuKhoa: 'trà sữa, Gong Cha' };
  ok(ctx.lhKhop(h, 'an', 'Trà sữa size L 45k'), 'có dấu'); ok(ctx.lhKhop(h, 'an', 'TRA SUA matcha'), 'không dấu, hoa'); ok(ctx.lhKhop(h, 'xang', 'gong cha chiều'), 'từ thứ hai');
  ok(!ctx.lhKhop(h, 'an', 'Cơm tấm'), 'không chứa'); ok(!ctx.lhKhop(h, 'an', ''), 'ghi chú trống thì không khớp');
  ok(!ctx.lhKhop({ catId: '', tuKhoa: 'an' }, 'an', 'bánh mì'), '"an" không khớp "bánh" (khớp theo từ nguyên)'); ok(ctx.lhKhop({ catId: '', tuKhoa: 'an' }, 'an', 'Ăn trưa'), '"an" khớp "Ăn"');
  ok(ctx.lhKhop({ catId: '', tuKhoa: 'đá' }, 'an', 'Cà phê đá'), 'đ -> d');
  ok(ctx.lhKhop({ catId: 'an', tuKhoa: '' }, 'an', ''), 'chỉ danh mục: không cần ghi chú'); ok(!ctx.lhKhop({ catId: 'an', tuKhoa: '' }, 'xang', 'x'), 'sai danh mục');
  ok(!ctx.lhKhop({ catId: 'an', tuKhoa: 'trà sữa' }, 'xang', 'trà sữa'), 'có cả danh mục lẫn từ khóa: phải khớp cả hai');
  ok(!ctx.lhKhop({ catId: '', tuKhoa: '' }, 'an', 'x'), 'không có danh mục lẫn từ khóa thì không khớp gì');
});
test('lời hứa theo từ khóa: đếm đúng dòng, nhắc đúng, nằm chung danh mục Ăn vẫn tách được', function(){
  dataLoiHua(function(d){
    d.journal = {};
    var add = function(ng, i, v, gc){ d.journal[ng] = d.journal[ng] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] }; d.journal[ng].chi.an = (d.journal[ng].chi.an || 0) + v;
      d.journal[ng].items.push({ iid: 'k' + i, kind: 'chi', catId: 'an', soTien: v, ghiChu: gc, walletId: 'w_chinh' }); };
    add('2026-10-02', 1, 45000, 'Trà sữa Gong Cha'); add('2026-10-03', 2, 60000, 'Cơm tấm'); add('2026-10-05', 3, 40000, 'tra sua');
    d.loiHua = [{ id: 'k1', catId: '', tuKhoa: 'trà sữa', kieu: 'lan', gioiHan: 2, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'Hết nghiện trà sữa' }];
  });
  var h = ctx.state.data.loiHua[0], t = ctx.lhTrangThai(h, '2026-10-11');
  eq(t.n, 2, 'chỉ 2 dòng trà sữa, "Cơm tấm" cùng danh mục Ăn không tính'); eq(t.tong, 85000); eq(t.trang, 'dang');
  var r = ctx.lhViPham('an', 45000, '2026-10-12', '', '2026-10-11', 'Trà sữa Phúc Long');
  eq(r.length, 1); ok(r[0].indexOf('Hết nghiện trà sữa') > 0 && r[0].indexOf('lần thứ 3') > 0 && r[0].indexOf('"trà sữa"') > 0, r[0]);
  eq(ctx.lhViPham('an', 45000, '2026-10-12', '', '2026-10-11', 'Cơm gà').length, 0, 'ghi chú không có từ khóa thì không nhắc');
  eq(ctx.lhViPham('an', 45000, '2026-10-12', '', '2026-10-11', '').length, 0, 'ghi chú trống thì không nhắc');
  eq(ctx.lhQuyTac(h), '"trà sữa": tối đa 2 lần'); ok(ctx.lhCardHtml().indexOf('&quot;trà sữa&quot;') > 0 || ctx.lhCardHtml().indexOf('"trà sữa": tối đa 2 lần') > 0, 'thẻ ghi rõ từ khóa');
  setToday('2026-10-01');
});
test('normalizeData lời hứa: cho phép chỉ từ khóa (không danh mục), bỏ dòng thiếu cả hai', function(){
  dataLoiHua(function(d){ d.loiHua = [
    { catId: '', tuKhoa: ' cà   phê ', kieu: 'lan', gioiHan: 3, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'x' },
    { catId: '', tuKhoa: ' , ; ', kieu: 'lan', gioiHan: 3, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'x' },
    { catId: 'an', kieu: 'lan', gioiHan: 3, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'cũ chưa có từ khóa' }]; });
  var ds = ctx.state.data.loiHua;
  eq(ds.length, 2); eq(ds[0].tuKhoa, 'cà phê', 'gộp khoảng trắng'); eq(ds[0].catId, ''); eq(ds[1].tuKhoa, '', 'lời hứa cũ giữ nguyên, không có từ khóa');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Công cụ: màn tổng hợp, Sổ mừng và quà, Sổ đồ đạc');

function dataSoMung(over){
  var d = baseData({ settings: { soDuDauKy: 5000000, ngayBatDau: '2024-01-01', thangBatDauDuTru: '2024-01' } });
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 0 }, { id: 'qua', ten: 'Quà mừng', chiTieu: 0 }];
  d.quaTang = [
    { id: 'q1', nguoi: 'Anh Minh', dip: 'cuoi', chieu: 'nhan', soTien: 1000000, ngay: '2024-05-01', ghiChu: '' },
    { id: 'q2', nguoi: 'anh minh', dip: 'sinhnhat', chieu: 'cho', soTien: 200000, ngay: '2025-03-10', ghiChu: 'sinh nhật con' },
    { id: 'q3', nguoi: 'Chị Lan', dip: 'hieu', chieu: 'nhan', soTien: 500000, ngay: '2026-02-01', ghiChu: '' },
    { id: 'q4', nguoi: 'Hùng', dip: 'cuoi', chieu: 'cho', soTien: 500000, ngay: '2026-04-01', ghiChu: '' },
    { id: 'q5', nguoi: 'Tú', dip: 'cuoi', chieu: 'cho', soTien: 300000, ngay: '2026-05-01', ghiChu: '' },
    { id: 'q6', nguoi: 'Bảo', dip: 'cuoi', chieu: 'cho', soTien: 400000, ngay: '2026-06-01', ghiChu: '' }];
  if (over) over(d);
  setToday('2026-10-11'); return loadData(d);
}
test('smNguoi / smCoDiCoLai: gom "Anh Minh" và "anh minh" thành một người; nhận chưa đáp / cho chưa nhận', function(){
  dataSoMung();
  var ng = ctx.smNguoi(), minh = ng.filter(function(r){ return r.khoa === 'anh minh'; })[0];
  eq(ng.length, 5, 'Minh, Lan, Hùng, Tú, Bảo'); eq(minh.nhan, 1000000); eq(minh.cho, 200000); eq(ctx.smCoDiCoLai(minh), '', 'cả hai bên đã có');
  var lan = ng.filter(function(r){ return r.khoa === 'chi lan'; })[0], hung = ng.filter(function(r){ return r.khoa === 'hung'; })[0];
  eq(ctx.smCoDiCoLai(lan), 'nhanChuaDap', 'Lan mừng mình, mình chưa mừng lại'); eq(ctx.smCoDiCoLai(hung), 'choChuaNhan');
  eq(ng[0].khoa, 'bao', 'người gần nhất lên đầu');
});
test('smGoiY / smTongNam / smLoc', function(){
  dataSoMung();
  var gy = ctx.smGoiY(); eq(gy.length, 1, 'chỉ dịp Cưới đủ 3 khoản'); eq(gy[0].ten, 'Cưới'); eq(gy[0].tien, 400000, 'trung vị 500k, 300k, 400k'); eq(gy[0].n, 3);
  var t = ctx.smTongNam('2026'); eq(t.cho, 1200000); eq(t.nCho, 3); eq(t.nhan, 500000); eq(t.nNhan, 1);
  eq(ctx.smLoc('minh').length, 2, 'tìm không dấu'); eq(ctx.smLoc('CƯỚI').length, 4, 'tìm theo tên dịp, hoa thường + dấu'); eq(ctx.smLoc('sinh nhat con').length, 1, 'tìm trong ghi chú'); eq(ctx.smLoc('').length, 6);
  setToday('2026-10-01');
});
test('smPageHtml / smDsHtml: hiện người chưa mừng lại, tóm tắt người khi tìm đúng tên', function(){
  dataSoMung();
  var h = ctx.smPageHtml();
  ok(h.indexOf('Họ đã mừng bạn, bạn chưa mừng lại') > 0 && h.indexOf('Chị Lan') > 0, 'có đi có lại'); ok(h.indexOf('Năm 2026 · bạn mừng') > 0 && h.indexOf('1.200.000') > 0, 'tổng năm nay');
  var d = ctx.smDsHtml('Anh Minh');
  ok(d.indexOf('Bạn mừng 200.000') > 0 && d.indexOf('họ mừng bạn 1.000.000') > 0, 'tóm tắt người'); ok(d.indexOf('chưa mừng lại') < 0, 'Minh đã cân');
  ok(ctx.smDsHtml('Lan').indexOf('Họ đã mừng bạn, bạn chưa mừng lại') > 0, 'Lan: nhắc');
  eq(ctx.smTomTat().canh, true); ok(ctx.smTomTat().chu.indexOf('1 người chưa mừng lại') > 0, ctx.smTomTat().chu);
  setToday('2026-10-01');
});
test('smLuu: mặc định không đụng Sổ tay; chọn "Có" thì ghi thành chi (bạn mừng) hoặc thu (họ mừng bạn)', function(){
  dataSoMung(function(d){ d.quaTang = []; });
  var root = { innerHTML: '' }, fm = function(over){ return Object.assign({ tabContent: root, sm_nguoi: { value: 'Cô Hoa' }, sm_chieu: { value: 'cho' }, sm_dip: { value: 'Cưới' }, sm_tien: { value: '500000' },
    sm_ngay: { value: '2026-10-05' }, sm_note: { value: 'cưới con' }, sm_ghi: { value: 'khong' }, sm_cat: { value: 'chi|qua' }, sm_vi: { value: '' } }, over || {}); };
  var so0 = ctx.balanceAt('2026-10-31'); ctx.state.ccForm = { loai: 'sm', id: '' };
  voiDom(fm(), null, function(){ ok(ctx.handleSoMungAction('smLuu', {}), 'xử lý'); });
  eq(ctx.state.data.quaTang.length, 1); eq(ctx.state.data.quaTang[0].ghiSo, ''); eq(ctx.balanceAt('2026-10-31'), so0, 'không đổi số dư'); eq(Object.keys(ctx.state.data.journal).length, 0, 'không đụng Sổ tay');
  ctx.state.ccForm = { loai: 'sm', id: '' };
  voiDom(fm({ sm_ghi: { value: 'co' }, sm_nguoi: { value: 'Bác Tư' }, sm_tien: { value: '300000' } }), null, function(){ ctx.handleSoMungAction('smLuu', {}); });
  var q = ctx.state.data.quaTang[1], e = ctx.state.data.journal['2026-10-05'];
  ok(/^2026-10-05\|/.test(q.ghiSo), 'có ghiSo'); eq(ctx.balanceAt('2026-10-31'), so0 - 300000, 'số dư giảm đúng khoản đã ghi'); eq(e.items.length, 1); eq(e.items[0].catId, 'qua'); ok(e.ghiChu.indexOf('Mừng Bác Tư (Cưới)') >= 0);
  ctx.state.ccForm = { loai: 'sm', id: '' };
  voiDom(fm({ sm_ghi: { value: 'co' }, sm_cat: { value: '' }, sm_nguoi: { value: 'X' } }), null, function(){ ctx.handleSoMungAction('smLuu', {}); });
  eq(ctx.state.data.quaTang.length, 2, 'bật ghi mà chưa chọn danh mục thì không lưu');
  ctx.state.ccForm = { loai: 'sm', id: '' };
  eq(ctx.state.data.quaTang.length, 2, 'bật ghi mà chưa chọn danh mục thì không lưu');
  ctx.state.ccForm = { loai: 'sm', id: '' };
  voiDom(fm({ sm_chieu: { value: 'nhan' }, sm_ghi: { value: 'co' }, sm_nguoi: { value: 'Dì Bảy' }, sm_cat: { value: 'chi|qua' } }), null, function(){ ctx.handleSoMungAction('smLuu', {}); });
  eq(ctx.state.data.quaTang.length, 2, 'họ mừng bạn mà chọn nhầm danh mục chi thì không lưu (phải là danh mục thu)');
  ctx.state.ccForm = { loai: 'sm', id: '' };
  voiDom(fm({ sm_chieu: { value: 'nhan' }, sm_ghi: { value: 'co' }, sm_nguoi: { value: 'Dì Bảy' }, sm_tien: { value: '200000' }, sm_cat: { value: 'thu|luong' } }), null, function(){ ctx.handleSoMungAction('smLuu', {}); });
  var thu = ctx.state.data.quaTang[2], e2 = ctx.state.data.journal['2026-10-05'];
  ok(/^2026-10-05\|/.test(thu.ghiSo), 'họ mừng bạn + chọn Có: ghi thành khoản THU'); eq(ctx.balanceAt('2026-10-31'), so0 - 300000 + 200000, 'số dư tăng 200.000');
  ok(e2.items.some(function(i){ return i.kind === 'thu' && i.catId === 'luong' && i.soTien === 200000; })); ok(e2.ghiChu.indexOf('Dì Bảy mừng (Cưới)') >= 0);
  ctx.state.ccForm = { loai: 'sm', id: '' };
  voiDom(fm({ sm_chieu: { value: 'nhan' }, sm_ghi: { value: 'khong' }, sm_nguoi: { value: 'Chú Sáu' } }), null, function(){ ctx.handleSoMungAction('smLuu', {}); });
  eq(ctx.state.data.quaTang[3].ghiSo, '', 'chọn Không thì không ghi'); eq(ctx.balanceAt('2026-10-31'), so0 - 300000 + 200000);
  setToday('2026-10-01');
});
test('Dịp là ô tự gõ: gom "cuoi" và "Cưới" thành một dịp, khoản không ghi dịp vẫn lưu được, dữ liệu cũ (khóa cố định) đổi sang chữ', function(){
  var n = dataSoMung(function(d){ d.quaTang = [
    { nguoi: 'A', dip: 'cuoi', chieu: 'cho', soTien: 100000, ngay: '2026-01-01' }, { nguoi: 'B', dip: ' Cưới ', chieu: 'cho', soTien: 300000, ngay: '2026-02-01' },
    { nguoi: 'C', dip: 'CƯỚI', chieu: 'cho', soTien: 200000, ngay: '2026-03-01' }, { nguoi: 'D', dip: '', chieu: 'cho', soTien: 900000, ngay: '2026-04-01' },
    { nguoi: 'E', dip: 'khac', chieu: 'cho', soTien: 700000, ngay: '2026-05-01' }, { nguoi: 'F', dip: 'Thôi nôi', chieu: 'cho', soTien: 400000, ngay: '2026-06-01' }]; });
  eq(n.quaTang[0].dip, 'Cưới', 'khóa cũ "cuoi" thành chữ'); eq(n.quaTang[4].dip, '', 'khóa cũ "khac" thành không ghi dịp'); eq(n.quaTang[1].dip, 'Cưới', 'cắt khoảng trắng');
  var gy = ctx.smGoiY(); eq(gy.length, 1); eq(gy[0].n, 3, '"cuoi", "Cưới", "CƯỚI" là một dịp'); eq(gy[0].tien, 200000); eq(gy[0].ten, 'CƯỚI', 'tên hiển thị theo lần gõ gần nhất');
  var g = ctx.smDipGoiY(); eq(g[0], 'Thôi nôi', 'dịp mới dùng gần nhất lên đầu'); ok(g.indexOf('Hiếu') > 0 && g.filter(function(x){ return ctx.lhChuanHoa(x) === 'cuoi'; }).length === 1, 'có gợi ý mặc định, không trùng');
  ok(ctx.smSheetHtml('').indexOf('<input type="text" id="sm_dip"') > 0 && ctx.smSheetHtml('').indexOf('<select id="sm_dip"') < 0, 'ô Dịp là ô gõ, không phải danh sách chọn');
  ok(ctx.smDongHtml(n.quaTang[3]).indexOf('dm-s">01/04/2026') > 0 && ctx.smDongHtml(n.quaTang[3]).indexOf('Khác') < 0, 'không ghi dịp thì không hiện chữ Khác');
  eq(ctx.smLoc('thoi noi').length, 1, 'tìm theo dịp không dấu');
  setToday('2026-10-01');
});
test('ddTinh: chi phí mỗi ngày, dự kiến, giá trị còn lại, bảo hành', function(){
  dataSoMung(function(d){ d.doDac = [
    { id: 'd1', ten: 'Điện thoại', gia: 21900000, ngayMua: '2026-04-14', soNam: 3, baoHanhDen: '2026-10-20', ghiChu: '', tt: 'dung' },
    { id: 'd2', ten: 'Máy giặt', gia: 10000000, ngayMua: '2024-10-11', soNam: 5, baoHanhDen: '2026-09-01', ghiChu: '', tt: 'dung' },
    { id: 'd3', ten: 'Xe cũ', gia: 30000000, ngayMua: '2025-10-11', soNam: 5, baoHanhDen: '', tt: 'het', ngayHet: '2026-10-11', giaBan: 12000000 }]; });
  var d = ctx.state.data.doDac, t = ctx.ddTinh(d[0], '2026-10-11');
  eq(t.ngayDung, 181, '14/04 → 11/10 = 180 ngày + 1'); near(t.cpNgay, 21900000 / 181, 0.01); eq(t.tongNgay, 1095); near(t.cpDuKien, 21900000 / 1095, 0.01); eq(t.cpDuKien, 20000);
  near(t.conGiaTri, 21900000 * (1 - 181 / 1095), 1); eq(t.baoHanh, 'sap'); eq(t.baoHanhCon, 9);
  eq(ctx.ddTinh(d[1], '2026-10-11').baoHanh, 'het');
  var x = ctx.ddTinh(d[2], '2026-10-11'); eq(x.ngayDung, 366); near(x.cpNgay, 18000000 / 366, 0.01, 'trừ tiền bán lại'); eq(x.conGiaTri, 12000000);
  eq(ctx.ddThoiGian(12), '12 ngày'); eq(ctx.ddThoiGian(150), '5 tháng'); eq(ctx.ddThoiGian(430), '1 năm 2 tháng');
  var h = ctx.ddPageHtml();
  ok(h.indexOf('Điện thoại') > 0 && h.indexOf('Bảo hành còn 9 ngày') > 0 && h.indexOf('Hết bảo hành') > 0 && h.indexOf('Không dùng nữa') > 0, 'trang đủ phần');
  ok(h.indexOf('21.900.000 ÷ 1095 = 20.000') > 0, 'cách tính bằng số thật'); eq(kiemPhepCong(h).loi.join(' | '), '');
  eq(ctx.ddTomTat().canh, true); ok(ctx.ddTomTat().chu.indexOf('2 món đang dùng') >= 0 && ctx.ddTomTat().chu.indexOf('1 món sắp hết bảo hành') > 0, ctx.ddTomTat().chu);
  setToday('2026-10-01');
});
test('normalizeData: quaTang và doDac bỏ dòng hỏng, ép kiểu, mặc định', function(){
  var n = dataSoMung(function(d){
    d.quaTang = [{ nguoi: ' A  B ', soTien: '100000', ngay: '2026-01-01', dip: '???' }, { nguoi: '', soTien: 5, ngay: '2026-01-01' }, { nguoi: 'C', soTien: 0, ngay: '2026-01-01' }, { nguoi: 'D', soTien: 5, ngay: 'xấu' }, null];
    d.doDac = [{ ten: 'Tủ lạnh', gia: '8000000', ngayMua: '2026-01-01', soNam: 999, tt: 'het' }, { ten: '', gia: 5 }, { ten: 'Rẻ', gia: 0 }]; });
  eq(n.quaTang.length, 1); eq(n.quaTang[0].nguoi, 'A B'); eq(n.quaTang[0].dip, '???', 'dịp là chữ tự gõ, giữ nguyên'); eq(n.quaTang[0].chieu, 'cho'); eq(n.quaTang[0].soTien, 100000);
  eq(n.doDac.length, 1); eq(n.doDac[0].soNam, 3, 'số năm ngoài 0..50 về mặc định'); eq(n.doDac[0].tt, 'dung', 'tt het mà không có ngày thôi dùng thì về đang dùng');
  eq(loadData(baseData()).quaTang.length, 0); eq(loadData(baseData()).doDac.length, 0);
  setToday('2026-10-01');
});
test('màn tổng hợp Công cụ: đủ 5 ô chia nhóm, bấm mở trang, quay lại; trang nào cũng dựng được', function(){
  dataSoMung(function(d){ d.muonMua = [{ id: 'm1', ten: 'Tai nghe', soTien: 300000, ngayThem: '2026-10-01', soNgayCho: 7, tt: 'cho' }]; });
  var h = ctx.ccHubHtml();
  ['Muốn mua', 'Giờ công', 'Lời hứa', 'Sổ mừng và quà', 'Sổ đồ đạc'].forEach(function(t){ ok(h.indexOf('<b>' + t + '</b>') > 0, 'có ô ' + t); });
  ok(h.indexOf('Quyết định') > 0 && h.indexOf('>Sổ<') > 0, 'hai nhóm'); ok(h.indexOf('1 món đang chờ · 1 món đủ thời gian chờ, hỏi lại') > 0, 'trạng thái Muốn mua');
  var root = { innerHTML: '' }, tr = ctx.window.scrollTo; ctx.window.scrollTo = function(){};
  voiDom({ tabContent: root }, null, function(){
    ctx.CC_TRANG.forEach(function(t){
      ctx.state.ccTrang = ''; ctx.handleCongCuAction('ccMo', elAct({ 'data-trang': t.key }));
      eq(ctx.state.ccTrang, t.key); ok(root.innerHTML.indexOf('data-act="ccVe"') > 0 && root.innerHTML.length > 400, 'trang ' + t.key + ' dựng được, có nút quay lại');
      ctx.handleCongCuAction('ccVe', {}); eq(ctx.state.ccTrang, ''); ok(root.innerHTML.indexOf('data-act="ccMo"') > 0, 'về màn tổng hợp');
    });
  });
  ctx.window.scrollTo = tr; ctx.state.ccTrang = '';
  setToday('2026-10-01');
});
test('Mua rồi + công tắc "Thêm vào Sổ đồ đạc": ghi chi, thêm món (giá đầy đủ, bảo hành theo tháng), hoàn tác gỡ cả hai', function(){
  dataSoMung(function(d){ d.muonMua = [{ id: 'm1', ten: 'Tai nghe', soTien: 900000, viId: '', thang: 0, lai: 0, giu: 0, ngayThem: '2026-10-01', soNgayCho: 7, tt: 'cho' }]; d.doDac = []; });
  var root = { innerHTML: '' }, so0 = ctx.balanceAt('2026-10-31'); ctx.state.ccForm = { loai: 'mm', id: 'm1' };
  var tt = [];
  var toast0 = ctx.toast; ctx.toast = function(m, o){ tt.push(o); };
  voiDom({ tabContent: root, cc_m_tien: { value: '900000' }, cc_m_ngay: { value: '2026-10-11' }, cc_m_cat: { value: 'chi|qua' }, cc_m_vi: { value: '' }, cc_m_note: { value: 'Tai nghe' },
           cc_m_dodac: { checked: true }, cc_m_nam: { value: '2' }, cc_m_bh: { value: '12' } }, null, function(){ ctx.handleCongCuAction('mmMuaLuu', {}); });
  ctx.toast = toast0;
  eq(ctx.balanceAt('2026-10-31'), so0 - 900000); eq(ctx.state.data.muonMua[0].tt, 'mua');
  var dd = ctx.state.data.doDac[0]; eq(ctx.state.data.doDac.length, 1); eq(dd.ten, 'Tai nghe'); eq(dd.gia, 900000); eq(dd.soNam, 2); eq(dd.baoHanhDen, '2027-10-11', 'bảo hành 12 tháng');
  voiDom({ tabContent: root }, null, function(){ tt[tt.length - 1].hoanTac(); });
  eq(ctx.balanceAt('2026-10-31'), so0); eq(ctx.state.data.doDac.length, 0, 'hoàn tác gỡ cả món khỏi Sổ đồ đạc'); eq(ctx.state.data.muonMua[0].tt, 'cho');
  setToday('2026-10-01');
});

test('ô nhập sống: gõ giá ở Giờ công và gõ tên ở Sổ mừng cập nhật vùng kết quả (qua handleCongCuInput)', function(){
  dataSoMung(function(d){ d.settings.gioCong = { thuNhapThang: 17600000, gioThang: 176 }; });
  ctx.state.gc = { gia: '' }; ctx.state.sm = { tim: '' };
  var kq = { textContent: '' }, ds = { innerHTML: '' };
  voiDom({ gcKq: kq, smDs: ds }, null, function(){
    ctx.handleCongCuInput({ id: 'gc_gia', value: '250000' });
    ctx.handleCongCuInput({ id: 'sm_tim', value: 'lan' });
  });
  eq(ctx.state.gc.gia, '250000'); eq(kq.textContent, '250.000 ₫ ≈ 2 giờ 30 phút đi làm', 'Giờ công tính ngay');
  eq(ctx.state.sm.tim, 'lan'); ok(ds.innerHTML.indexOf('Chị Lan') > 0 && ds.innerHTML.indexOf('Anh Minh') < 0 && ds.innerHTML.indexOf('Hùng') < 0, 'Sổ mừng lọc theo tên, bỏ các dòng không khớp');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Tìm kiếm toàn cục (tim.js)');

function dataTim(over){
  var d = dataSoMung(function(x){
    x.journal = {};
    var add = function(ng, i, kind, cat, v, gc){ x.journal[ng] = x.journal[ng] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] }; x.journal[ng][kind][cat] = (x.journal[ng][kind][cat] || 0) + v;
      x.journal[ng].items.push({ iid: 't' + i, kind: kind, catId: cat, soTien: v, ghiChu: gc, walletId: 'w_chinh' }); };
    add('2026-10-02', 1, 'chi', 'an', 45000, 'Trà sữa Gong Cha'); add('2026-10-03', 2, 'chi', 'an', 60000, 'Cơm với Minh'); add('2026-10-05', 3, 'thu', 'luong', 15000000, 'Lương T10');
    add('2026-09-20', 4, 'chi', 'qua', 500000, 'Mừng cưới anh Minh');
    x.vayNo.choVay = [{ id: 'cv1', ten: 'Cho Minh vay', nguoi: 'Minh', soTien: 1000000, daThu: 0, trangThai: 'dang_cho', ngayChoVay: '2026-09-01', ngayDuKienThu: '2026-11-01', walletId: 'w_chinh' }];
    x.doDac = [{ id: 'd1', ten: 'Điện thoại', gia: 21900000, ngayMua: '2026-04-14', soNam: 3, baoHanhDen: '', tt: 'dung' }];
    x.muonMua = [{ id: 'm1', ten: 'Tai nghe', soTien: 900000, ngayThem: '2026-10-01', soNgayCho: 7, tt: 'cho' }];
    x.loiHua = [{ id: 'h1', catId: 'an', tuKhoa: 'trà sữa', kieu: 'lan', gioiHan: 2, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'Hạn chế trà sữa' }];
    if (over) over(x); });
  return d;
}
function nhomTim(q, key){ return ctx.timTatCa(q).filter(function(n){ return n.key === key; })[0]; }
test('timTatCa: ô trống không có kết quả; không dấu / hoa thường vẫn khớp; kết quả theo nhóm', function(){
  dataTim();
  eq(ctx.timTatCa('').length, 0); eq(ctx.timTatCa('   ').length, 0);
  var gd = nhomTim('TRA SUA', 'gd'); eq(gd.tong, 1); eq(gd.ds[0].tieu, 'Trà sữa Gong Cha'); eq(gd.ds[0].tien, '−45.000 ₫'); eq(gd.ds[0].ngay, '2026-10-02');
  ok(nhomTim('tra sua', 'hua'), 'Lời hứa chứa từ khóa "trà sữa" cũng hiện');
  var m = ctx.timTatCa('minh').map(function(n){ return n.key; });
  ['gd', 'mung', 'vay'].forEach(function(k){ ok(m.indexOf(k) >= 0, 'minh khớp nhóm ' + k + ': ' + m.join(',')); });
  eq(nhomTim('minh', 'gd').tong, 2, '"Cơm với Minh" và "Mừng cưới anh Minh"'); eq(nhomTim('minh', 'gd').ds[0].ngay, '2026-10-03', 'mới nhất lên đầu');
  eq(nhomTim('điện thoại', 'dodac').ds[0].tien, '21.900.000 ₫'); eq(nhomTim('tai nghe', 'muon').ds[0].phu, 'Đang chờ');
  eq(nhomTim('lương', 'dm').ds[0].kind, 'thu', 'danh mục thu'); ok(nhomTim('ăn', 'dm') && nhomTim('ăn', 'dm').ds[0].id, 'danh mục chi');
  eq(ctx.timTatCa('khong co gi ca xyz').length, 0);
  setToday('2026-10-01');
});
test('timTatCa: gõ số thì khớp đúng số tiền (giao dịch, Sổ mừng, Sổ đồ đạc); "Đi tới" theo tên trang', function(){
  dataTim();
  eq(nhomTim('45000', 'gd').tong, 1); eq(nhomTim('45k', 'gd').tong, 1, '45k = 45.000 (docSo hiểu k)') ; eq(nhomTim('500000', 'mung').tong, 2, 'Chị Lan (họ mừng) và Hùng (bạn mừng) cùng 500.000'); ok(nhomTim('500000', 'mung').ds.some(function(r){ return r.tieu === 'Hùng'; }));
  ok(nhomTim('500000', 'gd').ds.some(function(r){ return r.tien === '−500.000 ₫'; }), 'số khớp cả khoản chi 500.000');
  eq(nhomTim('21900000', 'dodac').ds[0].tieu, 'Điện thoại');
  var tr = nhomTim('sổ mừng', 'trang'); eq(tr.ds[0].id, 'congcu:sommung'); eq(nhomTim('cai dat', 'trang').ds[0].id, 'danhmuc', 'tên tab "Cài đặt" trỏ về tab danhmuc');
  ok(nhomTim('ghi', 'trang').ds.some(function(r){ return r.loai === 'lenh'; }), 'lệnh nhanh "Ghi khoản chi"');
  setToday('2026-10-01');
});
test('timKetQuaHtml: Giao dịch gộp thành MỘT dòng đầu mục (chi tiết Sổ tay); nhóm khác có "Xem thêm"', function(){
  dataTim(function(x){ for (var i = 0; i < 20; i++){ var ng = '2026-08-' + (i < 9 ? '0' : '') + (i + 1); x.journal[ng] = x.journal[ng] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] };
    x.journal[ng].chi.an = 10000; x.journal[ng].items.push({ iid: 'z' + i, kind: 'chi', catId: 'an', soTien: 10000, ghiChu: 'cà phê sáng', walletId: 'w_chinh' }); } });
  var g = nhomTim('ca phe', 'gd'); eq(g.tong, 20); eq(g.ngay, 20); eq(g.chi, 200000); eq(g.ds[0].ngay, '2026-08-20', 'mới nhất trước (dữ liệu thuần)');
  var h = ctx.timKetQuaHtml('ca phe');
  ok(h.indexOf('Chi tiết Sổ tay') > 0 && h.indexOf('20 khoản khớp trong 20 ngày') > 0 && h.indexOf('chi 200.000') > 0, 'một dòng đầu mục có đếm và tổng');
  eq(ctx.state.tim.ds.length, 1); eq(ctx.state.tim.ds[0].loai, 'gdTat'); ok(h.indexOf('cà phê sáng') < 0, 'không liệt kê từng khoản');
  dataTim(function(x){ for (var i = 0; i < 12; i++) x.muonMua.push({ id: 'mx' + i, ten: 'Món thử ' + i, soTien: 1000, tt: 'cho', ngayThem: '2026-09-01', soNgayCho: 7, thang: 1 }); });
  ctx.state.tim = { mo: true, q: 'mon thu', sel: 0, het: {} };
  var h2 = ctx.timKetQuaHtml('mon thu'); ok(h2.indexOf('4 / 12') > 0 && h2.indexOf('Xem thêm 8 kết quả') > 0, 'nhóm khác hiện 4 đầu + nút xem thêm'); eq(ctx.state.tim.ds.length, 4);
  ctx.handleTimAction('timThem', elAct({ 'data-k': 'muon' }));
  eq(ctx.state.tim.het.muon, true);
  ok(ctx.timKetQuaHtml('mon thu').indexOf('Xem thêm') < 0 && ctx.state.tim.ds.length === 12, 'xem thêm mở hết nhóm');
  ok(ctx.timDanhDau('Cà phê & Sữa', 'ca phe').indexOf('<mark>Cà phê</mark> &amp; Sữa') === 0, 'bôi đậm không phân biệt dấu, escape phần còn lại');
  setToday('2026-10-01');
});
test('timKetQuaHtml: ô trống hiện lối tắt; không thấy gì thì báo; chữ gõ vào bị escape', function(){
  dataTim();
  var h0 = ctx.timKetQuaHtml(''); ok(h0.indexOf('Ghi khoản chi') > 0 && h0.indexOf('Sổ đồ đạc') > 0 && h0.indexOf('data-act="timDen"') > 0, 'lối tắt');
  eq(ctx.state.tim.ds[0].loai, 'lenh');
  var h1 = ctx.timKetQuaHtml('<img src=x onerror=alert(1)>'); ok(h1.indexOf('<img') < 0 && h1.indexOf('&lt;img') > 0, 'escape'); ok(h1.indexOf('Không tìm thấy') > 0);
  setToday('2026-10-01');
});
test('timDi: nhảy đúng tab và đặt đúng trạng thái cho từng loại kết quả', function(){
  dataTim();
  var tab = null, cu = ctx.chuyenTab; ctx.chuyenTab = function(t){ tab = t; };
  var di = function(r, q){ ctx.state.tim = { mo: true, q: q || '', sel: 0 }; tab = null; ctx.timDi(r); };
  di({ loai: 'gdTat' }, 'minh'); eq(tab, 'sotay'); eq(ctx.state.soTaySearch, 'minh', 'Sổ tay lọc sẵn theo từ khóa'); eq(ctx.state.soTayLocMo, true); eq(ctx.state.tim.mo, false, 'đóng ô tìm');
  di({ loai: 'mung', id: 'q1' }, 'minh'); eq(tab, 'congcu'); eq(ctx.state.ccTrang, 'sommung'); eq(ctx.state.sm.tim, 'minh');
  di({ loai: 'dodac', id: 'd1' }); eq(ctx.state.ccTrang, 'dodac');
  di({ loai: 'hua', id: 'h1' }); eq(ctx.state.ccTrang, 'loihua');
  di({ loai: 'muon', id: 'm1' }); eq(ctx.state.ccTrang, 'muonmua');
  di({ loai: 'dm', kind: 'chi', id: 'an' }); eq(tab, 'danhmuc'); eq(ctx.state.dmForm.loai, 'cat'); eq(ctx.state.dmForm.id, 'an');
  di({ loai: 'vi', id: 'w_chinh' }); eq(ctx.state.dmForm.loai, 'vi');
  di({ loai: 'vay', id: 'cv1' }); eq(tab, 'vayno'); di({ loai: 'nhan', id: 'x' }); eq(tab, 'baocao');
  di({ loai: 'trang', id: 'congcu:giocong' }); eq(tab, 'congcu'); eq(ctx.state.ccTrang, 'giocong'); di({ loai: 'trang', id: 'baocao' }); eq(tab, 'baocao');
  ctx.state.dmForm = null; ctx.state.ccForm = null; ctx.state.ccTrang = ''; ctx.state.soTaySearch = ''; ctx.state.soTayLocMo = false;
  ctx.chuyenTab = cu;
  var m0 = ctx.state.tim.mo; ctx.handleTimAction('timBat', {}); eq(ctx.state.tim.mo, true); eq(ctx.state.tim.q, ''); ctx.handleTimAction('timDong', {}); eq(ctx.state.tim.mo, false);
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Chuông thông báo (chuong.js)');

var luuTru = {};
ctx.localStorage = { getItem: function(k){ return Object.prototype.hasOwnProperty.call(luuTru, k) ? luuTru[k] : null; }, setItem: function(k, v){ luuTru[k] = String(v); } };
function cbVayQuaHan(ngayThu, over){
  hanData(0, 0);
  var d = ctx.state.data; d.vayNo.choVay = [{ id: 'cv1', ten: 'Cho Minh vay', nguoi: 'Minh', soTien: 1000000, daThu: 0, trangThai: 'dang_cho', ngayChoVay: '2026-09-01', ngayDuKienThu: ngayThu, walletId: 'w_chinh' }];
  if (over) over(d);
  return d;
}
test('chuông: mở chuông KHÔNG làm số giảm; bấm vào mục mới giảm; mục đã xem vẫn nằm trong chuông', function(){
  var cu = ctx.chuyenTab, dich = []; ctx.chuyenTab = function(t){ dich.push(t); };
  setToday('2026-10-14'); hanData(20, 0);
  eq(ctx.cbSoChuaXem('2026-10-14'), 1, 'Lương còn 6 ngày: 1 thông báo chưa xem');
  ctx.handleChuongAction('cbMo', {}); eq(ctx.state.cb.mo, true); eq(ctx.cbSoChuaXem('2026-10-14'), 1, 'mở chuông: số không giảm');
  ctx.cbDanhSachHtml();                                     // dựng danh sách như lúc mở bảng
  ctx.handleChuongAction('cbDen', elAct({ 'data-i': '0' }));
  eq(ctx.state.cb.mo, false, 'bấm vào mục thì đóng chuông'); eq(dich[0], 'sotay', 'chuyển tới Sổ tay'); eq(ctx.cbSoChuaXem('2026-10-14'), 0, 'đã xem: số giảm 1');
  var ds = ctx.cbTatCa('2026-10-14'); eq(ds.length, 1, 'mục đã xem VẪN còn trong chuông'); eq(ds[0].daXem, true);
  ok(ctx.cbDongHtml(ds[0], 0).indexOf('cb-r xem') > 0, 'hiển thị mờ hơn');
  ok(Object.keys(ctx.state.data.settings.thongBaoXem).length === 1, 'lưu vào settings.thongBaoXem (đi lên Drive)');
  ctx.chuyenTab = cu; setToday('2026-10-01');
});
test('chuông: khoản vừa là danh mục có ngày vừa là định kỳ cùng ngày thì chỉ nhắc MỘT lần khi đến hạn', function(){
  hanData(0, 20);
  var d = ctx.state.data;
  d.dinhKy = [{ id: 'dkNha', ten: 'Tiền nhà', kind: 'chi', catId: 'nha', soTien: 1400000, ngay: 20, bat: true, bo: [] },
              { id: 'dkDien', ten: 'Tiền điện nước', kind: 'chi', catId: 'nha', soTien: 554000, ngay: 11, bat: true, bo: [] }];
  var dem = function(h){ return ctx.cbTatCa(h).filter(function(x){ return x.loai === 'dk' || x.loai === 'cat'; }).map(function(x){ return x.loai + ':' + x.tieu; }); };
  eq(dem('2026-10-15').join(','), 'dk:Tiền điện nước,cat:Tiền nhà', 'trước hạn: Tiền nhà chỉ có lời nhắc sớm của danh mục (định kỳ ngày 20 chưa đến); điện nước ngày 11 đã đến hạn');
  eq(dem('2026-10-20').join(','), 'dk:Tiền điện nước,dk:Tiền nhà', 'đến hạn: định kỳ thay thế, KHÔNG còn nhắc lần hai từ danh mục; "điện nước" cùng danh mục nhưng ngày 11 vẫn nhắc riêng');
  d.dinhKy[0].bo = ['2026-10']; d.dinhKy[1].bo = ['2026-10'];
  eq(dem('2026-10-20').join(','), 'cat:Tiền nhà', 'định kỳ đã bỏ qua tháng này thì danh mục nhắc lại như cũ (không mất lời nhắc)');
  setToday('2026-10-01');
});
test('chuông: sắp đến hạn -> đến hạn là THÔNG BÁO MỚI (số đỏ tăng lại); xong thì mất khỏi chuông', function(){
  setToday('2026-10-14'); hanData(20, 0);
  var k1 = ctx.cbTatCa('2026-10-14')[0].key; ctx.cbDanhDauXem(k1, '2026-10-14');
  eq(ctx.cbSoChuaXem('2026-10-14'), 0);
  var d20 = ctx.cbTatCa('2026-10-20'); eq(d20.length, 1); ok(d20[0].key !== k1, 'khóa khác khi sang giai đoạn đến hạn'); eq(d20[0].daXem, false, 'chưa xem'); eq(d20[0].muc, 'khan', 'lên mức Cần làm ngay'); eq(ctx.cbSoChuaXem('2026-10-20'), 1);
  ctx.nhacHanHoanThanh('thu', 'luong', '2026-10'); eq(ctx.cbTatCa('2026-10-20').length, 0, 'hoàn thành (việc xong) -> mất khỏi chuông, dù chưa xem');
  setToday('2026-10-01');
});
test('chuông: quá hạn 15 ngày mà chưa xong thì mất; còn trong 15 ngày thì vẫn hiện; xong thì mất ngay', function(){
  cbVayQuaHan('2026-10-01');
  var co = function(hom){ setToday(hom); return ctx.cbTatCa(hom).filter(function(x){ return x.loai === 'vn'; }).length; };
  eq(co('2026-10-01'), 1, 'đúng hạn'); eq(co('2026-10-10'), 1, 'quá 9 ngày'); eq(co('2026-10-16'), 1, 'quá đúng 15 ngày: vẫn còn'); eq(co('2026-10-17'), 0, 'quá 16 ngày: mất khỏi chuông');
  setToday('2026-10-10'); var it = ctx.cbTatCa('2026-10-10').filter(function(x){ return x.loai === 'vn'; })[0];
  eq(it.muc, 'khan'); ok(it.phu.indexOf('Thu nợ') >= 0 && it.phu.indexOf('Quá hạn 9 ngày') >= 0, it.phu); eq(it.tien, '1.000.000 ₫');
  cbVayQuaHan('2026-10-01', function(d){ d.vayNo.choVay[0].trangThai = 'da_thu_du'; d.vayNo.choVay[0].daThu = 1000000; });
  eq(co('2026-10-10'), 0, 'đã thu đủ (xong) -> mất ngay');
  setToday('2026-10-01');
});
test('chuông: tắt một loại thông báo (theo máy) thì loại đó không hiện và không đếm; bật lại thì về', function(){
  cbVayQuaHan('2026-10-05'); setToday('2026-10-10');
  eq(ctx.cbSoChuaXem('2026-10-10'), 1);
  ctx.htDatTbTat('vn', true); eq(ctx.htTbTat('vn'), true); eq(ctx.cbSoChuaXem('2026-10-10'), 0, 'loại vn bị tắt'); eq(ctx.cbTatCa('2026-10-10').length, 0);
  ctx.htDatTbTat('vn', false); eq(ctx.cbSoChuaXem('2026-10-10'), 1, 'bật lại');
  setToday('2026-10-01');
});
test('chuông: thongBaoXem đi qua normalizeData (giữ giá trị đúng, bỏ giá trị hỏng); khóa quá cũ bị dọn khi đánh dấu', function(){
  var d = baseData(); d.settings.thongBaoXem = { 'vn:x:1': '2026-10-01', 'hỏng': 'không phải ngày', 'a:b': 5 };
  var n = loadData(d); eq(JSON.stringify(n.settings.thongBaoXem), JSON.stringify({ 'vn:x:1': '2026-10-01' }));
  var d2 = baseData(); d2.settings.thongBaoXem = [1, 2]; ok(loadData(d2).settings.thongBaoXem === undefined, 'không phải object: bỏ');
  var d3 = loadData(baseData()); d3.settings.thongBaoXem = { 'cu': '2026-01-01', 'moi': '2026-10-01' };
  ctx.cbDanhDauXem('khac', '2026-10-11'); ok(!d3.settings.thongBaoXem.cu && d3.settings.thongBaoXem.moi && d3.settings.thongBaoXem.khac, 'khóa cũ hơn 120 ngày bị dọn');
});
test('chuông: các loại còn lại (đối soát, bảo hành, Muốn mua, lời hứa bị phá) hiện đúng mức và tự mất khi xong / quá 15 ngày', function(){
  dataSoMung(function(x){
    x.doDac = [{ id: 'd1', ten: 'Điện thoại', gia: 21900000, ngayMua: '2026-04-14', soNam: 3, baoHanhDen: '2026-10-20', tt: 'dung' },
               { id: 'd2', ten: 'Máy giặt', gia: 10000000, ngayMua: '2024-10-11', soNam: 5, baoHanhDen: '2026-10-01', tt: 'dung' },
               { id: 'd3', ten: 'Tủ lạnh', gia: 8000000, ngayMua: '2024-01-11', soNam: 5, baoHanhDen: '2026-09-20', tt: 'dung' }];
    x.muonMua = [{ id: 'm1', ten: 'Tai nghe', soTien: 900000, ngayThem: '2026-10-01', soNgayCho: 7, tt: 'cho' }];
    x.wallets = [{ id: 'w_chinh', ten: 'Tài khoản chính', soDuDauKy: 5000000, doiSoat: [{ ngay: '2026-09-01', soThat: 1, soSo: 1, chenh: 0 }] }];
    x.loiHua = [{ id: 'h1', catId: 'an', kieu: 'lan', gioiHan: 0, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'Nhịn ăn ngoài' }];
    x.journal['2026-10-08'] = { thu: {}, chi: { an: 50000 }, ghiChu: '', refs: [], items: [{ iid: 'p1', kind: 'chi', catId: 'an', soTien: 50000, ghiChu: '', walletId: 'w_chinh' }] }; });
  var ds = ctx.cbTatCa('2026-10-11'), theo = function(l){ return ds.filter(function(x){ return x.loai === l; }); };
  eq(theo('ds').length, 1, 'đối soát: lần cuối 01/09 (40 ngày), hạn nhắc 06/10, chưa quá 15 ngày'); eq(theo('ds')[0].muc, 'sap'); ok(theo('ds')[0].phu.indexOf('40 ngày trước') > 0, theo('ds')[0].phu);
  var bh = theo('bh'); eq(bh.length, 2, 'Điện thoại (còn 9 ngày) + Máy giặt (vừa hết 10 ngày trước); Tủ lạnh hết 21 ngày trước thì mất');
  ok(bh.some(function(x){ return x.tieu === 'Điện thoại' && x.muc === 'sap'; }) && bh.some(function(x){ return x.tieu === 'Máy giặt' && x.muc === 'de'; }), 'mức sap / de');
  eq(theo('mm').length, 1, 'Tai nghe đủ thời gian chờ từ 08/10'); eq(theo('mm')[0].muc, 'sap');
  eq(theo('lh').length, 1, 'lời hứa bị phá ngày 08/10'); eq(theo('lh')[0].muc, 'de'); eq(theo('lh')[0].han, '2026-10-08');
  ctx.state.data.muonMua[0].tt = 'mua'; eq(ctx.cbTatCa('2026-10-11').filter(function(x){ return x.loai === 'mm'; }).length, 0, 'đã mua -> mất');
  eq(ctx.cbTatCa('2026-10-24').filter(function(x){ return x.loai === 'lh'; }).length, 0, 'lời hứa phá quá 15 ngày -> mất'); eq(ctx.cbTatCa('2026-10-23').filter(function(x){ return x.loai === 'lh'; }).length, 1);
  var muc = ctx.cbTatCa('2026-10-11').map(function(x){ return x.muc; }), thuTu = { khan: 0, sap: 1, de: 2 };
  ok(muc.every(function(m, i){ return i === 0 || thuTu[muc[i - 1]] <= thuTu[m]; }), 'sắp theo mức: Cần làm ngay, Sắp tới, Để ý');
  setToday('2026-10-01');
});
test('cbDi: nhảy đúng tab và đặt đúng trạng thái; cbXong tắt nhắc kỳ đó và hoàn tác được', function(){
  var cu = ctx.chuyenTab, tab = null; ctx.chuyenTab = function(t){ tab = t; };
  var di = function(dich){ tab = null; ctx.cbDi({ dich: dich }); };
  di({ loai: 'vn' }); eq(tab, 'vayno');
  di({ loai: 'the', id: 'wt' }); eq(tab, 'danhmuc'); eq(ctx.state.dmForm.loai, 'thanhtoanthe'); eq(ctx.state.dmForm.id, 'wt'); eq(ctx.state.dmTab, 'tien');
  di({ loai: 'ds', id: 'w1' }); eq(ctx.state.dmForm.loai, 'doisoat');
  di({ loai: 'vt', id: 'w1' }); eq(tab, 'dongtien'); eq(ctx.state.tnVi, 'w1'); eq(ctx.state.dtTheoNgay, true);
  di({ loai: 'bh', id: 'd1' }); eq(tab, 'congcu'); eq(ctx.state.ccTrang, 'dodac'); eq(ctx.state.ccForm.id, 'd1');
  di({ loai: 'mm', id: 'm1' }); eq(ctx.state.ccTrang, 'muonmua'); di({ loai: 'lh', id: 'h1' }); eq(ctx.state.ccTrang, 'loihua'); eq(ctx.state.ccForm.loai, 'lh');
  di({ loai: 'hm' }); eq(tab, 'baocao'); di({ loai: 'tk', mk: '2026-09' }); eq(ctx.state.soTayMonth, '2026-09');
  di({ loai: 'dk' }); eq(tab, 'sotay'); di({ loai: 'cat', kind: 'thu', id: 'luong' }); eq(tab, 'sotay');
  ctx.state.dmForm = null; ctx.state.ccForm = null; ctx.state.ccTrang = ''; ctx.chuyenTab = cu;
  setToday('2026-10-14'); hanData(20, 0); ctx.cbDanhSachHtml();
  var tt = [], t0 = ctx.toast; ctx.toast = function(m, o){ tt.push(o); };
  ctx.handleChuongAction('cbXong', elAct({ 'data-i': '0' })); ctx.toast = t0;
  eq(ctx.cbTatCa('2026-10-14').length, 0, 'Hoàn thành: mất khỏi chuông'); tt[0].hoanTac(); eq(ctx.cbTatCa('2026-10-14').length, 1, 'Hoàn tác: quay lại');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Cài đặt chia phần + Hiển thị (ht.js, hienthi.js)');

function htSach(){ Object.keys(luuTru).forEach(function(k){ delete luuTru[k]; }); }
test('ht: ẩn / hiện, thứ tự, đặt lại; chỉ đổi cách vẽ; id lạ và localStorage hỏng không gây lỗi', function(){
  htSach();
  eq(ctx.htAn('baocao', 'tongket'), false); eq(ctx.htDatAn('baocao', 'tongket', true), true); eq(ctx.htAn('baocao', 'tongket'), true); eq(ctx.htAn('sotay', 'tongket'), false, 'nhóm khác không ảnh hưởng');
  ctx.htDatAn('baocao', 'tongket', false); eq(ctx.htAn('baocao', 'tongket'), false);
  eq(ctx.htDatAn('baocao', 'khong-co', true), false, 'id lạ bị bỏ qua'); eq(ctx.htAn('baocao', 'khong-co'), false);
  eq(ctx.htThuTu('baocao').join(','), 'tongket,hanmuc,taisan,muctieu,diemnhan,ngaytudo,tet,nhan,bieudo', 'thứ tự mặc định');
  eq(ctx.htDoiViTri('baocao', 'muctieu', -1), true); eq(ctx.htThuTu('baocao').join(','), 'tongket,hanmuc,muctieu,taisan,diemnhan,ngaytudo,tet,nhan,bieudo', 'mục tiêu lên trên tài sản ròng');
  eq(ctx.htDoiViTri('baocao', 'tongket', -1), false, 'đã ở đầu thì không đổi'); eq(ctx.htDoiViTri('baocao', 'bieudo', -1), false, 'thẻ khongThuTu không đổi vị trí'); eq(ctx.htThuTu('baocao')[8], 'bieudo', 'biểu đồ luôn ở cuối');
  eq(ctx.htDoiViTri('baocao', 'nhan', 1), false, 'nhan là thẻ đổi được cuối cùng (bieudo cố định)');
  ctx.htDatAn('baocao', 'taisan', true); eq(ctx.htHien('baocao').join(','), 'tongket,hanmuc,muctieu,diemnhan,ngaytudo,tet,nhan,bieudo', 'htHien bỏ thẻ ẩn, giữ thứ tự');
  ctx.htDatLai(); eq(ctx.htThuTu('baocao').join(','), 'tongket,hanmuc,taisan,muctieu,diemnhan,ngaytudo,tet,nhan,bieudo'); eq(ctx.htAn('baocao', 'taisan'), false);
  luuTru['sct_hien_thi_v1'] = '{không phải json'; eq(ctx.htAn('baocao', 'tongket'), false, 'JSON hỏng: dùng mặc định'); eq(ctx.htThuTu('congcu').length, 5);
  luuTru['sct_hien_thi_v1'] = JSON.stringify({ thuTu: { baocao: ['nhan', 'cu-khong-con', 'hanmuc'] } });
  eq(ctx.htThuTu('baocao').join(','), 'nhan,hanmuc,tongket,taisan,muctieu,diemnhan,ngaytudo,tet,bieudo', 'id đã bỏ bị loại, thẻ mới rơi vào cuối phần còn lại, bieudo giữ vị trí gốc');
  htSach();
});
test('ht: Công cụ chỉ đổi vị trí trong CÙNG nhóm (Quyết định / Sổ)', function(){
  htSach();
  eq(ctx.htDoiViTri('congcu', 'giocong', -1), true); eq(ctx.htThuTu('congcu').join(','), 'giocong,muonmua,loihua,sommung,dodac');
  eq(ctx.htDoiViTri('congcu', 'loihua', 1), false, 'loihua là cuối nhóm Quyết định: không nhảy sang nhóm Sổ');
  eq(ctx.htDoiViTri('congcu', 'dodac', -1), true); eq(ctx.htThuTu('congcu').join(','), 'giocong,muonmua,loihua,dodac,sommung');
  htSach();
});
test('Báo cáo / Sổ tay / hub Công cụ vẽ theo tuỳ chọn: ẩn thẻ thì không vẽ, đổi thứ tự thì đổi vị trí, số liệu không đổi', function(){
  htSach(); setToday('2026-10-18'); loadData(dataBaoCao());
  var vebc = function(){ var r = { innerHTML: '' }; ctx.state.soTayMonth = '2026-10'; voiDom({ tabContent: r }, null, function(){ ctx.renderBaoCao(); }); return r.innerHTML; };
  var pos = function(h, id){ return h.indexOf('id="' + id + '"'); };
  var h0 = vebc(); ok(pos(h0, 'cardTaiSanRong') > 0 && pos(h0, 'cardMucTieu') > pos(h0, 'cardTaiSanRong'));
  ctx.htDatAn('baocao', 'taisan', true); var h1 = vebc(); eq(pos(h1, 'cardTaiSanRong'), -1, 'ẩn Tài sản ròng'); ok(pos(h1, 'cardHanMuc') > 0, 'thẻ khác còn');
  ctx.htDatAn('baocao', 'taisan', false); ctx.htDoiViTri('baocao', 'muctieu', -1); var h2 = vebc(); ok(pos(h2, 'cardMucTieu') < pos(h2, 'cardTaiSanRong'), 'Mục tiêu lên trước Tài sản ròng');
  ctx.htDatAn('baocao', 'bieudo', true); ok(vebc().indexOf('bieuDoCard') < 0, 'ẩn biểu đồ'); htSach();
  var hero0 = ctx.tongQuanHtml('2026-10', 0, 700000, 0, 0, false);
  ['tieu', 'hanmuc', 'sosanh', 'vi'].forEach(function(id){ ctx.htDatAn('sotay', id, true); });
  var hero1 = ctx.tongQuanHtml('2026-10', 0, 700000, 0, 0, false);
  ok(hero1.length < hero0.length && hero1.indexOf('hero-bud"') < 0 && hero1.indexOf('Số dư hiện tại') > 0, 'ẩn các phần phụ của thẻ đầu, số dư vẫn còn');
  htSach();
  var hub0 = ctx.ccHubHtml(); ok(hub0.indexOf('<b>Giờ công</b>') > 0);
  ctx.htDatAn('congcu', 'giocong', true); ok(ctx.ccHubHtml().indexOf('<b>Giờ công</b>') < 0 && ctx.ccHubHtml().indexOf('<b>Lời hứa</b>') > 0, 'ẩn một ô');
  ctx.htDatAn('congcu', 'giocong', false); ctx.htDoiViTri('congcu', 'loihua', -1); var hub2 = ctx.ccHubHtml(); ok(hub2.indexOf('<b>Lời hứa</b>') < hub2.indexOf('<b>Giờ công</b>'), 'Lời hứa lên trước Giờ công');
  ['muonmua', 'giocong', 'loihua', 'sommung', 'dodac'].forEach(function(id){ ctx.htDatAn('congcu', id, true); }); ok(ctx.ccHubHtml().indexOf('Đã ẩn hết công cụ') > 0, 'ẩn hết thì báo cách bật lại');
  htSach(); setToday('2026-10-01');
});
test('Cài đặt: 5 phần bằng thanh chọn (không phải danh sách bấm); mỗi phần chỉ chứa đúng thẻ của nó; bảng sửa nhảy đúng phần', function(){
  htSach(); loadData(baseData());
  // phần Ứng dụng dựa vào drive-sync.js / lock.js (không nạp trong test): thay bằng thẻ giả có nhãn riêng để kiểm cách ghép phần
  var goc = {}; ['caiAppCardHtml', 'lichCardHtml', 'backupCardHtml', 'khoaCardHtml', 'taiKhoanCardHtml'].forEach(function(n){ goc[n] = ctx[n]; });
  ctx.caiAppCardHtml = function(){ return '<div>Cài lên điện thoại</div>'; }; ctx.lichCardHtml = function(){ return '<div>Nhắc việc lên Lịch</div>'; };
  ctx.backupCardHtml = function(){ return '<div>Sao lưu dữ liệu</div>'; }; ctx.khoaCardHtml = function(){ return '<div>Khóa app</div>'; }; ctx.taiKhoanCardHtml = function(){ return '<div>Tài khoản</div>'; };
  var ve = function(){ var r = { innerHTML: '' }; voiDom({ tabContent: r }, null, function(){ renderThat.renderDanhMuc(); }); return r.innerHTML; };
  ctx.state.dmForm = null; ctx.state.dkForm = null; ctx.state.mtForm = null;
  ctx.state.dmTab = 'danhmuc'; var h = ve();
  eq((h.match(/data-act="dmTab"/g) || []).length, 5, '5 phần'); ok(h.indexOf('class="dt-mode dm-seg"') > 0, 'cùng kiểu thanh chọn của Dòng tiền');
  ok(h.indexOf('aria-selected="true">Danh mục<') > 0 && h.indexOf('Danh mục khoản thu') > 0 && h.indexOf('Giao dịch định kỳ') < 0 && h.indexOf('Sao lưu') < 0, 'phần Danh mục');
  ctx.state.dmTab = 'tien'; h = ve(); ok(h.indexOf('Danh mục khoản thu') < 0 && h.indexOf('Chốt số dư') > 0 && h.indexOf('Giao dịch định kỳ') < 0, 'phần Tiền: số dư, ví, chốt số dư');
  ctx.state.dmTab = 'kehoach'; h = ve(); ok(h.indexOf('Giao dịch định kỳ') > 0 && h.indexOf('Mục tiêu tiết kiệm') > 0 && h.indexOf('Chốt số dư') < 0, 'phần Kế hoạch: định kỳ, mục tiêu');
  ctx.state.dmTab = 'hienthi'; h = ve(); ok(h.indexOf('Thông báo ở chuông') > 0 && h.indexOf('data-act="htAn"') > 0 && h.indexOf('Đặt lại mặc định') > 0, 'phần Hiển thị');
  ctx.state.dmTab = 'ungdung'; h = ve(); ok(h.indexOf('Sao lưu') > 0 && h.indexOf('Khóa app') > 0 && h.indexOf('Danh mục khoản thu') < 0, 'phần Ứng dụng');
  ctx.state.dmTab = 'bậy'; h = ve(); eq(ctx.state.dmTab, 'danhmuc', 'giá trị lạ về mặc định');
  ctx.state.dmTab = 'danhmuc'; ctx.state.dmForm = { loai: 'vi', id: 'w_chinh' }; ve(); eq(ctx.state.dmTab, 'tien', 'mở bảng sửa ví -> nhảy sang phần Tiền');
  ctx.state.dmForm = null; ctx.state.mtForm = { id: '' }; ve(); eq(ctx.state.dmTab, 'kehoach', 'mục tiêu -> Kế hoạch'); ctx.state.mtForm = null;
  ctx.state.dmForm = { loai: 'cat', kind: 'chi', id: 'an' }; ve(); eq(ctx.state.dmTab, 'danhmuc'); ctx.state.dmForm = null;
  Object.keys(goc).forEach(function(n){ ctx[n] = goc[n]; });
  eq(ctx.dmTabCua('doisoat'), 'tien'); eq(ctx.dmTabCua('thanhtoanthe'), 'tien'); eq(ctx.dmTabCua('dk'), 'kehoach'); eq(ctx.dmTabCua('khoa'), 'ungdung');
  var rd = { innerHTML: '' }, w0 = ctx.window.scrollTo; ctx.window.scrollTo = function(){};
  ctx.state.dmTab = 'danhmuc'; voiDom({ tabContent: rd }, null, function(){ ctx.state.dmForm = { loai: 'cat' }; ctx.handleDanhMucAction('dmTab', elAct({ 'data-v': 'hienthi' })); });
  ctx.window.scrollTo = w0; eq(ctx.state.dmTab, 'hienthi', 'bấm phần Hiển thị'); eq(ctx.state.dmForm, null, 'đổi phần thì đóng bảng đang mở'); ctx.state.dmTab = 'danhmuc';
});
test('Hiển thị: công tắc bật = hiện; thông báo bị tắt thì chuông không đếm; mũi tên đổi thứ tự; đặt lại', function(){
  htSach(); setToday('2026-10-10'); cbVayQuaHan('2026-10-05');
  var sw = function(a, o){ return { matches: function(sel){ return sel === '[data-act=' + a + ']'; }, getAttribute: function(k){ return o[k] == null ? null : o[k]; }, checked: o.checked }; };
  ok(ctx.handleHienThiChange(sw('htAn', { 'data-nhom': 'baocao', 'data-id': 'nhan', checked: false })), 'xử lý'); eq(ctx.htAn('baocao', 'nhan'), true, 'bỏ tích = ẩn');
  ctx.handleHienThiChange(sw('htAn', { 'data-nhom': 'baocao', 'data-id': 'nhan', checked: true })); eq(ctx.htAn('baocao', 'nhan'), false, 'tích = hiện');
  eq(ctx.cbSoChuaXem('2026-10-10'), 1); ctx.handleHienThiChange(sw('htTb', { 'data-loai': 'vn', checked: false })); eq(ctx.cbSoChuaXem('2026-10-10'), 0, 'tắt loại Vay - Nợ ở chuông');
  ctx.handleHienThiChange(sw('htTb', { 'data-loai': 'vn', checked: true })); eq(ctx.cbSoChuaXem('2026-10-10'), 1);
  var rd = { innerHTML: '' }; ctx.state.dmTab = 'hienthi';
  voiDom({ tabContent: rd }, null, function(){ renderThat.renderDanhMuc = renderThat.renderDanhMuc; });
  var h = ctx.hienThiHtml(); ok(h.indexOf('aria-label="Hiện Tổng kết tháng"') > 0 && h.indexOf('data-act="htLen"') > 0, 'có công tắc và mũi tên');
  ok(/data-act="htLen" data-nhom="baocao" data-id="tongket"[^>]*disabled/.test(h), 'thẻ đầu danh sách: mũi tên lên bị khóa'); ok(h.indexOf('data-act="htLen" data-nhom="sotay"') < 0, 'thẻ trong thẻ đầu Sổ tay không có mũi tên');
  ok(/data-act="htAn" data-nhom="baocao" data-id="bieudo" checked/.test(h), 'đang hiện thì có tích'); ctx.htDatAn('baocao', 'bieudo', true); ok(!/data-act="htAn" data-nhom="baocao" data-id="bieudo" checked/.test(ctx.hienThiHtml()), 'ẩn thì không tích');
  htSach(); setToday('2026-10-01'); ctx.state.dmTab = 'danhmuc';
});

/* ==================================================================== */
group('Điều đáng chú ý (diemnhan.js)');

function dataDN(over){
  var j = {}, n = 0, add = function(ng, kind, cat, v, gc){ j[ng] = j[ng] || { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] }; j[ng][kind][cat] = (j[ng][kind][cat] || 0) + v;
    j[ng].items.push({ iid: 'n' + (n++), kind: kind, catId: cat, soTien: v, ghiChu: gc || '', walletId: 'w_chinh' }); };
  // T7, T8, T9: mỗi tháng chi Ăn 1.000.000 (ngày 05) và Xăng 300.000 (ngày 10); thu lương 15.000.000
  ['2026-07', '2026-08', '2026-09'].forEach(function(mk){ add(mk + '-01', 'thu', 'luong', 15000000, 'Lương'); add(mk + '-05', 'chi', 'an', 1000000, 'ăn'); add(mk + '-10', 'chi', 'xang', 300000, 'xăng'); });
  // T10 (tới ngày 18): Ăn nhiều hơn hẳn, thêm một khoản lớn
  add('2026-10-01', 'thu', 'luong', 15000000, 'Lương'); add('2026-10-05', 'chi', 'an', 1800000, 'ăn'); add('2026-10-08', 'chi', 'an', 200000, 'ăn'); add('2026-10-10', 'chi', 'xang', 300000, 'xăng');
  add('2026-10-12', 'chi', 'an', 60000, 'cà phê'); add('2026-10-13', 'chi', 'an', 50000, 'cà phê'); add('2026-10-14', 'chi', 'an', 70000, 'cơm'); add('2026-10-15', 'chi', 'an', 2500000, 'Mua loa');
  var d = baseData({ journal: j, settings: { soDuDauKy: 0, ngayBatDau: '2026-07-01', thangBatDauDuTru: '2026-07' } });
  d.categories.chi = [{ id: 'an', ten: 'Ăn uống', chiTieu: 0 }, { id: 'xang', ten: 'Xăng', chiTieu: 0 }];
  if (over) over(d);
  setToday('2026-10-18'); return loadData(d);
}
function dnCo(ds, id){ return ds.filter(function(x){ return x.id === id; })[0]; }
test('dnTatCa (tháng đang chạy): so CÙNG KỲ với TB 3 tháng trước; danh mục tăng mạnh; khoản chi lớn nhất; tối đa 5 câu, sắp theo điểm', function(){
  dataDN();
  var ds = ctx.dnTatCa('2026-10', '2026-10-18');
  var chi = dnCo(ds, 'chi'); ok(chi && chi.tone === 'xau', 'chi tăng'); ok(chi.html.indexOf('tăng') > 0 && chi.html.indexOf('tới ngày 18') > 0, chi.html);
  // T10 tới 18: ăn 1.8tr+0,2tr+60k+50k+70k+2,5tr = 4.68tr, xăng 0,3tr -> 4.98tr; TB 3 tháng cùng kỳ (tới ngày 18) = 1.3tr
  ok(chi.html.indexOf('4.980.000') > 0 && chi.html.indexOf('1.300.000') > 0, 'số thật: ' + chi.html);
  ok(chi.pt.indexOf('1.300.000 + 1.300.000 + 1.300.000 = 3.900.000 ÷ 3 = 1.300.000') >= 0, chi.pt);
  var cat = dnCo(ds, 'cat'); ok(cat && cat.html.indexOf('Ăn uống') > 0, 'Ăn uống tăng mạnh nhất');
  var lon = dnCo(ds, 'lon'); ok(lon && lon.html.indexOf('2.500.000') > 0 && lon.html.indexOf('Mua loa') > 0, 'khoản lớn nhất: ' + (lon && lon.html));
  ok(ds.length <= 5 && ds.every(function(x, i){ return i === 0 || ds[i - 1].diem >= x.diem; }), 'tối đa 5, sắp theo điểm');
  var duN = dnCo(ds, 'du'); ok(duN && duN.tone === 'tot' && duN.html.indexOf('10.020.000') > 0 && duN.html.indexOf('67%') > 0, 'đã qua ngày 15: có câu "để dành": ' + (duN && duN.html));
});
test('dnTatCa: dư thật (để dành / chi vượt thu); tháng đã kết thúc so cả tháng; không đủ dữ liệu thì im lặng', function(){
  dataDN();
  var t9 = ctx.dnTatCa('2026-09', '2026-10-18'), du = dnCo(t9, 'du');
  ok(du && du.tone === 'tot' && du.html.indexOf('13.700.000') > 0 && du.html.indexOf('91%') > 0, 'T9: thu 15tr − chi 1,3tr = 13,7tr = 91% thu nhập: ' + (du && du.html));
  eq(du.pt, '15.000.000 − 1.300.000 = 13.700.000 · 13.700.000 ÷ 15.000.000 = 91%');
  dataDN(function(d){ d.journal['2026-09-20'] = { thu: {}, chi: { an: 16000000 }, ghiChu: '', refs: [], items: [{ iid: 'big', kind: 'chi', catId: 'an', soTien: 16000000, ghiChu: 'x', walletId: 'w_chinh' }] }; });
  var xau = dnCo(ctx.dnTatCa('2026-09', '2026-10-18'), 'du'); ok(xau && xau.tone === 'xau' && xau.diem === 90 && xau.html.indexOf('vượt thu nhập 2.300.000') > 0, 'chi 17,3tr > thu 15tr: ' + (xau && xau.html));
  dataDN(function(d){ d.journal = { '2026-10-02': { thu: {}, chi: { an: 50000 }, ghiChu: '', refs: [], items: [{ iid: 'a', kind: 'chi', catId: 'an', soTien: 50000, ghiChu: '', walletId: 'w_chinh' }] } }; });
  eq(ctx.dnTatCa('2026-10', '2026-10-18').length, 0, 'chưa có tháng trước, chưa có thu, ghi thưa: không có câu nào (không khen / chê khi thiếu dữ liệu)');
  eq(ctx.dnTatCa('2026-05', '2026-10-18').length, 0, 'tháng trống');
  setToday('2026-10-01');
});
test('dnTatCa: lời hứa đang giữ / vừa phá; giờ công; mọi phép cộng trong "Cách tính" đúng', function(){
  dataDN(function(d){
    d.loiHua = [{ id: 'h1', catId: 'xang', kieu: 'lan', gioiHan: 5, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'Đi xe buýt bớt' },
                { id: 'h2', catId: 'an', kieu: 'tien', gioiHan: 1000000, tuNgay: '2026-10-01', denNgay: '2026-10-31', cau: 'Ăn ngoài vừa phải' }];
    d.settings.gioCong = { thuNhapThang: 17600000, gioThang: 176 }; });
  var ds = ctx.dnTatCa('2026-10', '2026-10-18');
  var giu = dnCo(ds, 'huah1'); ok(giu && giu.tone === 'tot' && giu.html.indexOf('18 ngày') > 0, 'giữ lời hứa 18 ngày: ' + (giu && giu.html));
  var pha = dnCo(ds, 'huah2'); ok(pha && pha.tone === 'xau' && pha.html.indexOf('15/10') < 0 && pha.html.indexOf('Ăn ngoài vừa phải') > 0, 'phá lời hứa tiền: ' + (pha && pha.html));
  var gio = dnCo(ctx.dnTatCa('2026-10', '2026-10-18', true), 'gio'); ok(gio && gio.html.indexOf('giờ') > 0 && gio.html.indexOf('Ăn uống') > 0, 'giờ công (lấy đủ mọi câu): ' + (gio && gio.html));
  var h = ctx.dnCardHtml('2026-10'); ok(h.indexOf('id="cardDiemNhan"') > 0 && h.indexOf('<li class="dn-') > 0 && h.indexOf('Cách tính các số này') > 0, 'thẻ có câu + cách tính');
  eq(kiemPhepCong(h).loi.join(' | '), '', 'phép cộng trong giải thích đúng');
  eq((h.match(/<li class="dn-/g) || []).length <= 5, true);
  ctx.htDatAn('baocao', 'diemnhan', true); eq(ctx.dnCardHtml('2026-10'), '', 'ẩn ở Cài đặt → Hiển thị thì không vẽ'); htSach();
  var root = { innerHTML: '' }; ctx.state.soTayMonth = '2026-10';
  voiDom({ tabContent: root }, null, function(){ ctx.renderBaoCao(); });
  ok(root.innerHTML.indexOf('id="cardDiemNhan"') > root.innerHTML.indexOf('id="cardHanMuc"') && root.innerHTML.indexOf('id="cardDiemNhan"') > root.innerHTML.indexOf('id="cardTaiSanRong"'), 'nằm sau Hạn mức và Tài sản ròng');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Cảnh báo trung tâm: mọi đường ghi một khoản chi đều qua canhBaoKhoan (canhbao.js)');

// xacNhan giả đồng bộ: trả lời theo traLoi, đếm số lần hỏi và lưu nội dung câu hỏi
var hoi = { n: 0, traLoi: true, noiDung: '' };
function xacNhanGia(){ ctx.xacNhan = function(tieuDe, nd){ hoi.n++; hoi.noiDung = nd; return { then: function(f){ f(hoi.traLoi); } }; }; }
function dataCanhBao(over){
  return dataLoiHua(function(d){                                  // Ăn: hứa tối đa 2 lần, đã đủ 2 (ngày 02, 05) -> khoản chi Ăn kế tiếp sẽ phá lời hứa
    d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 0 }, { id: 'xang', ten: 'Xăng', chiTieu: 0 }, { id: 'mua', ten: 'Mua sắm', chiTieu: 0 }];
    d.settings.soDuDauKy = 50000000; d.settings.ngayBatDau = '2026-09-01'; d.settings.thangBatDauDuTru = '2026-09';
    if (over) over(d); });
}
var ctxToast = ctx.toast;
test('canhBaoKhoan: ví âm + bất thường + lời hứa gộp một chỗ; cờ tắt từng luật; khoản thu không bị xét', function(){
  dataCanhBao();
  var cb = ctx.canhBaoKhoan({ kind: 'chi', catId: 'an', tien: 50000, ngay: '2026-10-12', ghiChu: 'cơm', viId: 'w_chinh' });
  eq(cb.length, 1); ok(cb[0].indexOf('Nhịn ăn ngoài tháng này') > 0 && cb[0].indexOf('lần thứ 3') > 0, cb[0]);
  eq(ctx.canhBaoKhoan({ kind: 'chi', catId: 'an', tien: 50000, ngay: '2026-10-12', loiHua: false }).length, 0, 'tắt luật lời hứa');
  eq(ctx.canhBaoKhoan({ kind: 'chi', catId: 'xang', tien: 50000, ngay: '2026-10-12', viId: 'w_chinh' }).length, 0, 'danh mục khác không bị lời hứa');
  eq(ctx.canhBaoKhoan({ kind: 'thu', catId: 'luong', tien: 99999999, ngay: '2026-10-12', viId: 'w_chinh' }).length, 0, 'khoản thu không có cảnh báo');
  eq(ctx.canhBaoKhoan({ kind: 'chi', catId: 'an', tien: 0, ngay: '2026-10-12' }).length, 0, 'số tiền 0');
  var am = ctx.canhBaoKhoan({ kind: 'chi', catId: 'xang', tien: 60000000, ngay: '2026-10-12', viId: 'w_chinh' }); ok(am.length >= 1 && am[0].indexOf('sẽ âm') > 0, 'ví sắp âm: ' + am.join('|'));
  eq(ctx.canhBaoKhoan({ kind: 'chi', catId: 'xang', tien: 60000000, ngay: '2026-10-12', viId: 'w_chinh', boViAm: true, batThuong: false }).length, 0, 'tắt ví + bất thường');
  setToday('2026-10-01');
});
test('Mua rồi: vượt lời hứa thì HỎI; "Quay lại" thì không ghi gì; "Vẫn ghi" thì ghi; không vi phạm thì không hỏi', function(){
  dataCanhBao(function(d){ d.muonMua = [{ id: 'm1', ten: 'Cơm tặng', soTien: 90000, viId: '', thang: 0, lai: 0, giu: 0, ngayThem: '2026-10-01', soNgayCho: 7, tt: 'cho' }]; });
  var root = { innerHTML: '' }, els = function(cat){ return { tabContent: root, cc_m_tien: { value: '90000' }, cc_m_ngay: { value: '2026-10-12' }, cc_m_cat: { value: cat }, cc_m_vi: { value: '' }, cc_m_note: { value: 'Cơm tặng' }, cc_m_dodac: { checked: false } }; };
  var chay = function(cat){ ctx.state.ccForm = { loai: 'mm', id: 'm1' }; voiDom(els(cat), null, function(){ ctx.handleCongCuAction('mmMuaLuu', {}); }); };
  var n0 = Object.keys(ctx.state.data.journal).length; xacNhanGia(); hoi.n = 0;
  hoi.traLoi = false; chay('chi|an'); eq(hoi.n, 1, 'hỏi 1 lần'); eq(ctx.state.data.muonMua[0].tt, 'cho', 'Quay lại: chưa mua'); eq(Object.keys(ctx.state.data.journal).length, n0, 'không ghi gì'); ok(hoi.noiDung.indexOf('Nhịn ăn ngoài tháng này') > 0 && hoi.noiDung.indexOf('Vẫn ghi khoản này?') > 0, 'câu hỏi nêu đúng câu hứa');
  hoi.traLoi = true; chay('chi|an'); eq(hoi.n, 2, 'đồng ý: chỉ hỏi 1 lần nữa (không hỏi lần hai)'); eq(ctx.state.data.muonMua[0].tt, 'mua', 'Vẫn ghi: đã mua'); ok(ctx.state.data.journal['2026-10-12'], 'đã ghi vào Sổ tay');
  dataCanhBao(function(d){ d.muonMua = [{ id: 'm1', ten: 'Dầu', soTien: 90000, viId: '', thang: 0, lai: 0, giu: 0, ngayThem: '2026-10-01', soNgayCho: 7, tt: 'cho' }]; }); hoi.n = 0;
  chay('chi|xang'); eq(hoi.n, 0, 'không vi phạm: ghi thẳng, không hỏi'); eq(ctx.state.data.muonMua[0].tt, 'mua');
  ctx.state.ccForm = null; setToday('2026-10-01');
});
test('Mua rồi: món lớn KHÔNG bị hỏi "gõ thừa số 0" (luật bất thường tắt), nhưng ví sắp âm vẫn hỏi', function(){
  dataCanhBao(function(d){ d.muonMua = [{ id: 'm1', ten: 'Laptop', soTien: 20000000, viId: '', thang: 0, lai: 0, giu: 0, ngayThem: '2026-10-01', soNgayCho: 7, tt: 'cho' }];
    var j = d.journal; [['2026-09-03', 3], ['2026-09-10', 4], ['2026-09-17', 5], ['2026-09-24', 6], ['2026-10-03', 7], ['2026-10-06', 8]].forEach(function(x){ j[x[0]] = { thu: {}, chi: { mua: 200000 }, ghiChu: '', refs: [], items: [{ iid: 'ms' + x[1], kind: 'chi', catId: 'mua', soTien: 200000, ghiChu: '', walletId: 'w_chinh' }] }; }); });
  var root = { innerHTML: '' }, e = { tabContent: root, cc_m_tien: { value: '20000000' }, cc_m_ngay: { value: '2026-10-12' }, cc_m_cat: { value: 'chi|mua' }, cc_m_vi: { value: '' }, cc_m_note: { value: 'Laptop' }, cc_m_dodac: { checked: false } };
  ok(ctx.chiBatThuong('mua', 20000000), 'Ghi nhanh sẽ hỏi (đã đủ 6 khoản, lớn gấp 100 lần)'); xacNhanGia(); hoi.n = 0; ctx.state.ccForm = { loai: 'mm', id: 'm1' };
  voiDom(e, null, function(){ ctx.handleCongCuAction('mmMuaLuu', {}); });
  eq(hoi.n, 0, 'Mua rồi: không hỏi dù lớn bất thường'); eq(ctx.state.data.muonMua[0].tt, 'mua'); ctx.state.ccForm = null; setToday('2026-10-01');
});
test('Sổ mừng ghi chi: vượt lời hứa thì hỏi; ghi thu thì không bao giờ hỏi', function(){
  dataCanhBao(function(d){ d.quaTang = []; });
  var root = { innerHTML: '' }, fm = function(chieu, cat){ return { tabContent: root, sm_nguoi: { value: 'Cô Hoa' }, sm_chieu: { value: chieu }, sm_dip: { value: 'Cưới' }, sm_tien: { value: '300000' }, sm_ngay: { value: '2026-10-12' }, sm_note: { value: '' }, sm_ghi: { value: 'co' }, sm_cat: { value: cat }, sm_vi: { value: '' } }; };
  xacNhanGia(); hoi.n = 0; hoi.traLoi = false; ctx.state.ccForm = { loai: 'sm', id: '' };
  voiDom(fm('cho', 'chi|an'), null, function(){ ctx.handleSoMungAction('smLuu', {}); });
  eq(hoi.n, 1); eq(ctx.state.data.quaTang.length, 0, 'Quay lại: không lưu, không ghi Sổ tay'); eq(ctx.state.data.journal['2026-10-12'], undefined);
  hoi.traLoi = true; voiDom(fm('cho', 'chi|an'), null, function(){ ctx.handleSoMungAction('smLuu', {}); });
  eq(ctx.state.data.quaTang.length, 1, 'Vẫn ghi: lưu'); ok(ctx.state.data.journal['2026-10-12'].items.some(function(i){ return i.catId === 'an' && i.soTien === 300000; }), 'và ghi vào Sổ tay');
  hoi.n = 0; ctx.state.ccForm = { loai: 'sm', id: '' }; voiDom(fm('nhan', 'thu|luong'), null, function(){ ctx.handleSoMungAction('smLuu', {}); }); eq(hoi.n, 0, 'họ mừng bạn (thu): không hỏi');
  ctx.state.ccForm = null; setToday('2026-10-01');
});
test('Chia hóa đơn: phần của mình vượt lời hứa HOẶC cả hóa đơn làm ví âm thì hỏi', function(){
  dataCanhBao(); var root = { innerHTML: '' };
  var fm = function(tong){ return { tabContent: root, vn_chia_ten: { value: 'Ăn lẩu' }, vn_chia_ngay: { value: '2026-10-12' }, vn_chia_cat: { value: 'an' }, vn_chia_tong: { value: tong }, vn_chia_ds: { value: 'Minh\nLan' }, vn_chia_wallet: { value: 'w_chinh' } }; };
  xacNhanGia(); hoi.n = 0; hoi.traLoi = false;
  voiDom(fm('900000'), null, function(){ ctx.handleNguoiAction('vnChiaLuu', {}); });
  eq(hoi.n, 1, 'phần mình 300.000 là lần thứ 3 chi Ăn'); eq(ctx.state.data.vayNo.choVay.length, 0, 'Quay lại: chưa tạo khoản cho vay nào'); ok(hoi.noiDung.indexOf('Nhịn ăn ngoài tháng này') > 0);
  hoi.traLoi = true; voiDom(fm('900000'), null, function(){ ctx.handleNguoiAction('vnChiaLuu', {}); });
  eq(ctx.state.data.vayNo.choVay.length, 2, 'Vẫn ghi: 2 khoản cho vay'); ok(ctx.state.data.journal['2026-10-12']);
  dataCanhBao(function(d){ d.settings.soDuDauKy = 600000; d.categories.chi.push({ id: 'cf', ten: 'Cà phê', chiTieu: 0 }); }); hoi.n = 0; hoi.traLoi = false;
  var fm2 = fm('900000'); fm2.vn_chia_cat = { value: 'cf' };
  voiDom(fm2, null, function(){ ctx.handleNguoiAction('vnChiaLuu', {}); });
  eq(hoi.n, 1, 'tổng hóa đơn 900.000 mà ví chỉ còn 150.000 (600.000 − 450.000 đã chi): ví sắp âm'); ok(hoi.noiDung.indexOf('sẽ âm') > 0, hoi.noiDung);
  setToday('2026-10-01');
});
test('Định kỳ "Ghi vào Sổ tay": vượt lời hứa thì hỏi; không vi phạm thì ghi thẳng', function(){
  dataCanhBao(function(d){ d.dinhKy = [{ id: 'dk1', ten: 'Ăn trưa', kind: 'chi', catId: 'an', soTien: 40000, ngay: 12, bat: true, bo: [] }, { id: 'dk2', ten: 'Xăng', kind: 'chi', catId: 'xang', soTien: 40000, ngay: 12, bat: true, bo: [] }]; });
  xacNhanGia(); hoi.n = 0; hoi.traLoi = false;
  var gh = function(id){ ctx.handleSoTayAction('dkGhi', elAct({ 'data-id': id, 'data-mk': '2026-10' })); };
  gh('dk1'); eq(hoi.n, 1); eq(ctx.state.data.journal['2026-10-12'], undefined, 'Quay lại: chưa ghi');
  hoi.traLoi = true; gh('dk1'); ok(ctx.state.data.journal['2026-10-12'], 'Vẫn ghi: ghi'); 
  hoi.n = 0; gh('dk2'); eq(hoi.n, 0, 'Xăng không vi phạm: ghi thẳng');
  setToday('2026-10-01');
});
test('Form "Sửa cả ngày" (ngày mới): kiểm TỪNG danh mục (lời hứa, bất thường), không chỉ ví âm', function(){
  dataCanhBao(); xacNhanGia(); hoi.n = 0; hoi.traLoi = false;
  var luu = function(cat){ voiDom({ f_date: { value: '2026-10-12' }, f_ghichu: { value: 'cơm trưa' } }, { '.f_chi': [oNhap(cat, '50000')] }, function(){ ctx.handleSoTayAction('saveEntry', {}); }); };
  luu('an'); eq(hoi.n, 1, 'Ăn lần thứ 3'); ok(hoi.noiDung.indexOf('Nhịn ăn ngoài tháng này') > 0); eq(ctx.state.data.journal['2026-10-12'], undefined, 'Quay lại: chưa lưu ngày');
  hoi.n = 0; luu('xang'); eq(hoi.n, 0, 'Xăng không vi phạm: lưu thẳng'); ok(ctx.state.data.journal['2026-10-12']);
  setToday('2026-10-01');
});
test('Nhập file: bước xem trước báo lời hứa / ví âm sẽ bị phá; không chặn nhập', function(){
  dataCanhBao();
  var kq = { tongThu: 0, tongChi: 300000, dong: [{ loi: '', trung: false, kind: 'chi', ngay: '2026-10-20', soTien: 100000, catId: 'an', note: 'cơm' }, { loi: '', trung: false, kind: 'chi', ngay: '2026-10-21', soTien: 200000, catId: 'xang', note: 'xăng' },
    { loi: 'lỗi', trung: false, kind: 'chi', ngay: '2026-10-22', soTien: 999999, catId: 'an', note: 'bỏ' }, { loi: '', trung: true, kind: 'chi', ngay: '2026-10-23', soTien: 999999, catId: 'an', note: 'trùng' }] };
  var cb = ctx.canhBaoNhap(kq, 'w_chinh'); eq(cb.length, 1, 'chỉ lời hứa: dòng lỗi và dòng trùng không tính'); ok(cb[0].indexOf('Nhịn ăn ngoài tháng này') >= 0 && cb[0].indexOf('thêm 1 khoản chi') > 0 && cb[0].indexOf('đã 2 lần, tối đa 2 lần') > 0, cb[0]);
  kq.dong[0].ngay = '2026-11-02'; eq(ctx.canhBaoNhap(kq, 'w_chinh').length, 0, 'ngoài khoảng ngày của lời hứa');
  var am = ctx.canhBaoNhap({ tongThu: 0, tongChi: 90000000, dong: [] }, 'w_chinh'); ok(am.length === 1 && am[0].indexOf('sẽ âm') > 0, 'ví sắp âm: ' + am.join('|'));
  eq(ctx.canhBaoNhap({ tongThu: 500, tongChi: 100, dong: [] }, 'w_chinh').length, 0, 'thu nhiều hơn chi: không cảnh báo');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Thẻ tín dụng: thanh toán tối thiểu + lãi ước tính');

function theTT(tl, lai, chuyen){
  var d = theData([['2026-09-20', 3000000], ['2026-09-28', 2000000]], chuyen);
  var w = ctx.state.data.wallets[1]; if (tl != null) w.tyLeToiThieu = tl; if (lai != null) w.laiSuatThe = lai;
  return ctx.state.data;
}
test('theTinh: tối thiểu = % số sao kê − đã trả, lãi ước tính một tháng trên phần còn lại nếu chỉ trả tối thiểu; không đặt thì null', function(){
  theTT();
  var t0 = ctx.theTinh(ctx.walletById('wt'), '2026-10-10'); eq(t0.toiThieu, null); eq(t0.laiUocTinh, null); eq(t0.conNeuToiThieu, null);
  theTT(5, 30);
  var t = ctx.theTinh(ctx.walletById('wt'), '2026-10-10');
  eq(t.soSaoKe, 3000000); eq(t.conPhaiTra, 3000000); eq(t.toiThieu, 150000, '5% × 3.000.000'); eq(t.conNeuToiThieu, 2850000); near(t.laiUocTinh, 3000000 * 30 / 100 / 12, 0.01, 'lãi 30%/năm ÷ 12 trên TOÀN BỘ 3.000.000 chưa trả đủ'); eq(Math.round(t.laiUocTinh), 75000);
  theTT(5, 30, [{ id: 'c1', ngay: '2026-10-05', tuVi: 'w1', denVi: 'wt', soTien: 100000, ghiChu: '' }]);
  var t2 = ctx.theTinh(ctx.walletById('wt'), '2026-10-10'); eq(t2.daTra, 100000); eq(t2.toiThieu, 50000, 'đã trả 100.000 thì tối thiểu còn 50.000'); eq(t2.conPhaiTra, 2900000);
  theTT(5, 30, [{ id: 'c2', ngay: '2026-10-05', tuVi: 'w1', denVi: 'wt', soTien: 200000, ghiChu: '' }]);
  var t3 = ctx.theTinh(ctx.walletById('wt'), '2026-10-10'); eq(t3.toiThieu, 0, 'đã trả quá mức tối thiểu: còn 0'); near(t3.laiUocTinh, 2800000 * 30 / 100 / 12, 0.01);
  theTT(100, 30); eq(ctx.theTinh(ctx.walletById('wt'), '2026-10-10').toiThieu, 3000000, '100% = trả hết'); eq(ctx.theTinh(ctx.walletById('wt'), '2026-10-10').laiUocTinh, 0, 'trả hết thì không có lãi');
  theTT(5, null); eq(ctx.theTinh(ctx.walletById('wt'), '2026-10-10').laiUocTinh, null, 'chưa đặt lãi suất: không ước tính lãi'); eq(ctx.theTinh(ctx.walletById('wt'), '2026-10-10').toiThieu, 150000);
  setToday('2026-10-01');
});
test('normalizeData: tyLeToiThieu / laiSuatThe ép về 0..100, bỏ khi trống hoặc ví không phải thẻ', function(){
  var d = theData(); d.wallets[1].tyLeToiThieu = '250'; d.wallets[1].laiSuatThe = -3; d.wallets[0].tyLeToiThieu = 5; d.wallets[0].laiSuatThe = 20;
  ctx.normalizeData(d); eq(d.wallets[1].tyLeToiThieu, 100); eq(d.wallets[1].laiSuatThe, undefined); eq(d.wallets[0].tyLeToiThieu, undefined); eq(d.wallets[0].laiSuatThe, undefined);
  var d2 = theData(); d2.wallets[1].tyLeToiThieu = 5; d2.wallets[1].laiSuatThe = 28.5; ctx.normalizeData(d2); eq(d2.wallets[1].tyLeToiThieu, 5); eq(d2.wallets[1].laiSuatThe, 28.5);
  setToday('2026-10-01');
});
test('thẻ hiện dòng tối thiểu + lãi ước tính; bảng Thanh toán có nút điền nhanh và cách tính bằng số thật; form lưu 2 trường mới', function(){
  theTT(5, 30);
  var w = ctx.walletById('wt'), h = ctx.theDongHtml(w);
  ok(h.indexOf('Tối thiểu 150.000') > 0 && h.indexOf('5% sao kê') > 0 && h.indexOf('còn nợ 2.850.000') > 0 && h.indexOf('lãi ước tính ~75.000 ₫/tháng') > 0, h);
  var s = ctx.theTraSheetHtml({ id: 'wt' });
  ok(s.indexOf('data-act="theDien" data-v="150000"') > 0 && s.indexOf('data-act="theDien" data-v="3000000"') > 0 && s.indexOf('data-act="theDien" data-v="5000000"') > 0, 'ba nút: tối thiểu / còn phải trả / hết dư nợ');
  ok(s.indexOf('3.000.000 × 5% = 150.000') > 0 && s.indexOf('3.000.000 × 30% ÷ 12 = 75.000') > 0, 'cách tính bằng số thật'); eq(kiemPhepCong(s).loi.join(' | '), '');
  theTT(); ok(ctx.theDongHtml(ctx.walletById('wt')).indexOf('Tối thiểu') < 0, 'chưa đặt thì không hiện'); ok(ctx.theTraSheetHtml({ id: 'wt' }).indexOf('Tối thiểu') < 0);
  var o = { value: '' }; voiDom({ tt_tien: o }, null, function(){ ctx.handleTheAction('theDien', elAct({ 'data-v': '150000' })); }); eq(o.value, '150000', 'nút điền nhanh');
  var wv = { id: 'wx', ten: 'Thẻ mới' };
  voiDom({ dm_vi_the: { checked: true }, dm_vi_sk: { value: '5' }, dm_vi_ht: { value: '25' }, dm_vi_hm: { value: '10000000' }, dm_vi_tt: { value: '5' }, dm_vi_lai: { value: '30' } }, null, function(){ eq(ctx.theDocForm(wv), ''); });
  eq(wv.tyLeToiThieu, 5); eq(wv.laiSuatThe, 30);
  voiDom({ dm_vi_the: { checked: true }, dm_vi_sk: { value: '5' }, dm_vi_ht: { value: '25' }, dm_vi_hm: { value: '' }, dm_vi_tt: { value: '' }, dm_vi_lai: { value: '0' } }, null, function(){ ctx.theDocForm(wv); });
  eq(wv.tyLeToiThieu, undefined, 'để trống: bỏ trường'); eq(wv.laiSuatThe, undefined);
  voiDom({ dm_vi_the: { checked: false } }, null, function(){ ctx.theDocForm(wv); }); eq(wv.the, undefined);
  setToday('2026-10-01');
});
test('chuông: thanh toán thẻ ghi thêm số tối thiểu khi đã đặt', function(){
  theTT(5, 30); setToday('2026-10-12');
  var th = ctx.cbTatCa('2026-10-12').filter(function(x){ return x.loai === 'the'; })[0];
  ok(th && th.phu.indexOf('tối thiểu 150.000') > 0, th && th.phu);
  setToday('2026-10-01');
});

group('Ngân sách tự lập (ngansach.js)');
function nsData(over){
  var j = {}, an = [3000000, 2000000, 4000000], gt = [500000, 1500000, 1000000];
  ['2026-07', '2026-08', '2026-09'].forEach(function(mk, i){
    j[mk + '-10'] = { thu: { luong: (over && over.khongThu) ? 0 : 10000000 }, chi: { an: an[i], giaitri: gt[i], nha: 3000000, xang: 500000, khac: (over && over.khac) || 0 }, ghiChu: '', refs: [], items: [] };
  });
  var d = baseData({ journal: j });
  d.settings = { soDuDauKy: 0, ngayBatDau: '2026-07-01', thangBatDauDuTru: (over && over.batDau) || '2026-07' };
  d.categories.thu = [{ id: 'luong', ten: 'Lương', chiTieu: 0 }];
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 5000000 }, { id: 'giaitri', ten: 'Giải trí', chiTieu: 0 }, { id: 'nha', ten: 'Nhà', chiTieu: 3000000, khoanCoDinh: true },
    { id: 'xang', ten: 'Xăng', chiTieu: 0 }, { id: 'khac', ten: 'Khác', chiTieu: 0, khongDuTru: true }];
  setToday('2026-10-11');
  ctx.state.ns.muc = null;
  return loadData(d);
}
test('nsDuLieu: thu nhập / chi TB 3 tháng, mức hiện tại, khoản cố định đã có hạn mức thì giữ nguyên', function(){
  nsData();
  var du = ctx.nsDuLieu();
  eq(du.n, 3); eq(du.thu, 10000000); eq(du.chi, 7500000); eq(du.hienTai, 2500000);
  eq(du.khac, 0, 'danh mục Khác chưa có số thì không có khoản không đổi');
  eq(du.dong.map(function(d){ return d.id; }).join(), 'an,giaitri,nha,xang');
  var nha = du.dong.filter(function(d){ return d.id === 'nha'; })[0];
  ok(nha.coDinh && nha.giu && nha.goc === 3000000, 'Nhà: cố định, giữ hạn mức đã đặt');
  ok(du.dong[0].flex > du.dong[3].flex, 'Ăn dao động nhiều hơn Xăng (không đổi) nên linh hoạt hơn');
  eq(du.dong[3].flex, 0.1, 'Xăng đều 500k mỗi tháng: độ linh hoạt sàn 0,1');
  setToday('2026-10-01');
});
test('nsPhanBo: mức để dành bằng hiện tại thì không cắt; để dành thêm thì chỉ cắt khoản linh hoạt, tổng khớp, không cắt quá 60%', function(){
  nsData();
  var du = ctx.nsDuLieu(), p0 = ctx.nsPhanBo(du, 2500000);
  eq(p0.canCat, 0, 'đã để dành đúng mức này');
  p0.rows.forEach(function(r){ near(r.de, r.goc, 500, r.id + ' không cắt'); });
  var p = ctx.nsPhanBo(du, 4500000);
  near(p.canCat, 2000000, 1, 'cần cắt = 7,5tr − (10tr − 4,5tr)');
  var R = {}; p.rows.forEach(function(r){ R[r.id] = r; });
  eq(R.nha.de, 3000000, 'khoản cố định giữ nguyên');
  near(p.tongDe, 5500000, 2500, 'tổng hạn mức chi = thu − để dành (sai số làm tròn nghìn)');
  near(p.daDanh, 4500000, 2500, 'để dành thực tế khớp thanh trượt');
  ok(R.an.cat > R.xang.cat, 'Ăn (dao động) bị cắt nhiều hơn Xăng (đều)');
  p.rows.forEach(function(r){ ok(r.cat <= r.tran + 1, r.id + ' không cắt quá 60%'); });
  ok(!p.thieu, 'còn chỗ cắt');
  setToday('2026-10-01');
});
test('nsPhanBo: để dành quá mức cắt được thì báo thiếu; mức tối đa = thu − (chi − phần cắt được)', function(){
  nsData();
  var du = ctx.nsDuLieu(), p = ctx.nsPhanBo(du, 9000000);
  ok(p.thieu, 'đòi để dành 9tr mà chỉ cắt được ít: thiếu chỗ cắt');
  near(ctx.nsPhanBo(du, 0).toiDa, 10000000 - (7500000 - 0.6 * 4500000), 1, 'tối đa = 10tr − (7,5tr − 60% của 4,5tr linh hoạt)');
  eq(ctx.nsMucToiDa(du), 5200000, 'thanh trượt dừng ở mức tối đa làm tròn bước');
  eq(ctx.nsMucMacDinh(du), 2500000, 'mặc định = mức đang để dành');
  setToday('2026-10-01');
});
test('nsPhanBo: chi của danh mục "Không tính dự kiến" là khoản không đổi, trừ khỏi ngân sách', function(){
  nsData({ khac: 300000 });
  var du = ctx.nsDuLieu();
  near(du.khac, 300000, 1);
  var p = ctx.nsPhanBo(du, 4000000);
  near(p.nganSach, 10000000 - 4000000 - 300000, 1);
  setToday('2026-10-01');
});
test('nsDuLieu: chưa có tháng hoàn chỉnh hoặc chưa có thu nhập thì báo đúng và bảng trượt chỉ hiện lời giải thích', function(){
  nsData({ batDau: '2026-10' });
  eq(ctx.nsDuLieu(), null, 'tháng dự kiến bắt đầu từ tháng này: chưa tháng nào trọn');
  ok(ctx.nsSheetHtml().indexOf('Chưa có tháng nào đủ dữ liệu') > 0 && ctx.nsSheetHtml().indexOf('ns_muc') < 0, 'không có thanh trượt');
  nsData({ khongThu: true });
  ok(ctx.nsDuLieu().thieuThu, 'chưa có thu');
  ok(ctx.nsSheetHtml().indexOf('chưa có khoản thu nào') > 0 && ctx.nsSheetHtml().indexOf('ns_muc') < 0);
  setToday('2026-10-01');
});
test('nsSheetHtml: có thanh trượt, danh sách danh mục, Cách tính có phép tính đúng', function(){
  nsData();
  var h = ctx.nsSheetHtml();
  ok(h.indexOf('id="ns_muc"') > 0 && h.indexOf('max="5200000"') > 0 && h.indexOf('value="2500000"') > 0, 'thanh trượt 0..5,2tr, mặc định 2,5tr');
  ok(h.indexOf('Ăn') > 0 && h.indexOf('Giải trí') > 0 && h.indexOf('Cố định, giữ nguyên') > 0, 'liệt kê danh mục, Nhà giữ nguyên');
  ok(h.indexOf('Cách tính các số này') > 0, 'có mục Cách tính');
  ok(h.indexOf('10.000.000 − 2.500.000 = 7.500.000') > 0, 'Tổng hạn mức chi = 10tr − 2,5tr');
  var k = kiemPhepCong(h); ok(k.n >= 1, 'có phép tính'); eq(k.loi.join(' | '), '', 'mọi phép cộng đều đúng');
  ctx.state.ns.muc = 4500000;
  var h2 = ctx.nsSheetHtml(); eq(kiemPhepCong(h2).loi.join(' | '), ''); ok(h2.indexOf('Cần cắt') > 0 && h2.indexOf('Cần cắt <b>') > 0);
  setToday('2026-10-01');
});
test('nsApDung / nsHoanTac: ghi chiTieu cho danh mục linh hoạt, không đụng khoản cố định đã có hạn mức, hoàn tác về như cũ', function(){
  nsData();
  var du = ctx.nsDuLieu(), cats = ctx.state.data.categories.chi;
  var an0 = cats.filter(function(c){ return c.id === 'an'; })[0].chiTieu;
  var cu = ctx.nsApDung(du, 4500000), p = ctx.nsPhanBo(du, 4500000), R = {};
  p.rows.forEach(function(r){ R[r.id] = r; });
  var an = cats.filter(function(c){ return c.id === 'an'; })[0], nha = cats.filter(function(c){ return c.id === 'nha'; })[0], kd = cats.filter(function(c){ return c.id === 'khac'; })[0];
  eq(an.chiTieu, R.an.de, 'Ăn nhận hạn mức đề xuất'); ok(an.chiTieu < 3000000, 'đã cắt so với TB 3tr');
  eq(nha.chiTieu, 3000000, 'Nhà giữ nguyên'); eq(kd.chiTieu, 0, 'danh mục Không tính dự kiến không bị đụng');
  eq(cu.length, 3, 'ghi 3 danh mục (Ăn, Giải trí, Xăng)');
  ctx.nsHoanTac(cu);
  eq(an.chiTieu, an0, 'hoàn tác về hạn mức cũ');
  setToday('2026-10-01');
});
test('Danh mục chi có nút "Tự lập hạn mức", danh mục thu thì không; sheet nstl thuộc phần Danh mục', function(){
  nsData();
  var chi = ctx.categoryCardHtml('chi', 'Danh mục khoản chi', ctx.state.data.categories.chi), thu = ctx.categoryCardHtml('thu', 'Danh mục khoản thu', ctx.state.data.categories.thu);
  ok(chi.indexOf('data-act="nsMo"') > 0 && thu.indexOf('data-act="nsMo"') < 0);
  eq(ctx.dmTabCua('nstl'), 'danhmuc');
  setToday('2026-10-01');
});

group('Ngày tự do (ngaytudo.js)');
test('ntdChiNgay / ntdTinh: chi thật mỗi ngày = chi 3 tháng trọn ÷ số ngày; ngày tự do = tiền các ví ÷ chi mỗi ngày', function(){
  nsData();
  ctx.state.ntd.tietKiem = null; ctx.state.ntd.lai = 3;
  var c = ctx.ntdChiNgay();
  eq(c.soNgay, 92, '31 + 31 + 30'); eq(c.chi, 22500000); near(c.chiNgay, 22500000 / 92, 0.01); eq(c.dangDo, false);
  near(c.duThang, (30000000 - 22500000) / 92 * 365 / 12, 1, 'dư mỗi tháng quy đổi');
  var t = ctx.ntdTinh();
  eq(t.tien, 7500000, 'tiền các ví = 3 tháng × dư 2,5tr'); near(t.ngay, 7500000 / (22500000 / 92), 0.001);
  setToday('2026-10-01');
});
test('ntdChiNgay: tháng đầu dùng app (chưa tháng trọn nào) thì lấy tháng này tới hết hôm qua nếu đã qua >= 7 ngày; ít hơn thì chưa đủ dữ liệu', function(){
  var j = { '2026-10-02': { thu: { luong: 5000000 }, chi: { an: 600000 }, ghiChu: '', refs: [], items: [] }, '2026-10-04': { thu: {}, chi: { an: 400000 }, ghiChu: '', refs: [], items: [] } };
  var d = baseData({ journal: j }); d.settings = { soDuDauKy: 0, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10' };
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 0 }];
  setToday('2026-10-11'); loadData(d);
  var c = ctx.ntdChiNgay(); eq(c.dangDo, true); eq(c.soNgay, 10, 'ngày 1 tới hết ngày 10'); near(c.chiNgay, 100000, 0.01);
  setToday('2026-10-05'); loadData(d); eq(ctx.ntdChiNgay(), null, 'mới 4 ngày: chưa đủ');
  eq(ctx.ntdTinh(), null);
  setToday('2026-10-01');
});
test('ntdTinh: ví không có tiền (hoặc âm) thì 0 ngày, không âm', function(){
  nsData();
  ctx.state.data.settings.soDuDauKy = -50000000; ctx.state.data.wallets[0].soDuDauKy = -50000000; ctx.invalidateBalanceCache();
  var t = ctx.ntdTinh(); ok(t.tien < 0, 'ví âm'); eq(t.ngay, 0);
  ok(ctx.ntdCardHtml().indexOf('chưa được ngày nào') > 0, 'câu nói đúng khi không có tiền');
  setToday('2026-10-01');
});
test('ntdMoc: mốc đã qua / sắp tới và % tiến độ', function(){
  var a = ctx.ntdMoc(0); eq(a.truoc, 0); eq(a.toi, 7); eq(a.pct, 0);
  var b = ctx.ntdMoc(30.67); eq(b.truoc, 30); eq(b.toi, 90); eq(b.pct, 34);
  var c = ctx.ntdMoc(400); eq(c.toi, null); eq(c.truoc, 365); eq(c.pct, 100);
  eq(ctx.ntdMoc(90).truoc, 90, 'đúng mốc thì tính là đã qua');
});
test('ntdSoThang / ntdKhoangChu: mô phỏng theo tháng, lãi thực rút ngắn thời gian, đã đạt = 0, không bao giờ tới = null', function(){
  eq(ctx.ntdSoThang(0, 1000000, 0, 10000000), 10);
  eq(ctx.ntdSoThang(12000000, 0, 0, 10000000), 0, 'đã đạt rồi');
  eq(ctx.ntdSoThang(0, 0, 0, 10000000), null, 'không để dành, không lãi: không bao giờ');
  ok(ctx.ntdSoThang(0, 1000000, 12, 20000000) < 20, 'lãi thực 12%/năm tới sớm hơn không lãi (20 tháng)');
  eq(ctx.ntdKhoangChu(0), '0 tháng'); eq(ctx.ntdKhoangChu(5), '5 tháng'); eq(ctx.ntdKhoangChu(24), '2 năm'); eq(ctx.ntdKhoangChu(14), '1 năm 2 tháng'); eq(ctx.ntdKhoangChu(null), 'hơn 100 năm');
  nsData(); var t = ctx.ntdTinh();
  near(ctx.ntdCanCo(t.c), 25 * (22500000 / 92) * 365, 1, '25 lần chi cả năm');
  setToday('2026-10-01');
});
test('ntdXuHuong: ngày tự do cuối từng tháng trọn + "Nay", tăng dần theo dư mỗi tháng', function(){
  nsData();
  var xh = ctx.ntdXuHuong();
  eq(xh.map(function(x){ return x.nhan; }).join(), 'T7,T8,T9,Nay');
  ok(xh[0].v < xh[1].v && xh[1].v < xh[2].v, 'tiền tăng đều nên số ngày tăng: ' + xh.map(function(x){ return x.v.toFixed(1); }).join());
  near(xh[3].v, xh[2].v, 0.001, 'Nay = cuối T9 (không phát sinh thêm)');
  eq(ctx.ntdBangXuHuongHtml(xh).split('ntd-xc').length - 1, 4, '4 cột: T7, T8, T9, Nay');
  setToday('2026-10-01');
});
test('ntdCardHtml: số lớn, mốc, xu hướng, thanh trượt tự do tài chính, Cách tính đúng; chưa đủ dữ liệu thì nói rõ', function(){
  nsData();
  var h = ctx.ntdCardHtml();
  ok(h.indexOf('<div class="ntd-big"><b>31</b>') > 0, 'ngày tự do 30,67 làm tròn 31 (từ 10 ngày trở lên bỏ số lẻ)');
  ok(h.indexOf('Còn <b>59 ngày</b> tới mốc 90 ngày (đã qua mốc 30)') > 0, 'mốc kế tiếp');
  ok(h.indexOf('id="ntd_tk"') > 0 && h.indexOf('id="ntd_lai"') > 0 && h.indexOf('Cuối từng tháng') > 0, 'có thanh trượt, chọn lãi, xu hướng');
  ok(h.indexOf('Cách tính các số này') > 0 && h.indexOf('25 × ') > 0, 'có Cách tính');
  eq(kiemPhepCong(h).loi.join(' | '), '', 'mọi phép cộng đúng');
  ctx.state.ntd.tietKiem = 0; ctx.state.ntd.lai = 0;
  ok(ctx.ntdCardHtml().indexOf('chưa tới được trong 100 năm') > 0, 'không để dành, không lãi: báo không tới được');
  ctx.state.ntd.tietKiem = null; ctx.state.ntd.lai = 3;
  nsData({ batDau: '2026-10' });
  ok(ctx.ntdCardHtml().indexOf('Chưa đủ dữ liệu') > 0 && ctx.ntdCardHtml().indexOf('ntd_tk') < 0, 'chưa đủ dữ liệu');
  setToday('2026-10-01');
});
test('ntdKetQuaHtml: nhận định đúng; mỗi 1tr để dành thêm sớm hơn bao lâu', function(){
  nsData(); var t = ctx.ntdTinh(), tk = 2000000;
  var h = ctx.ntdKetQuaHtml(t, tk, 3), m1 = ctx.ntdSoThang(t.tien, tk, 3, ctx.ntdCanCo(t.c)), m2 = ctx.ntdSoThang(t.tien, tk + 1000000, 3, ctx.ntdCanCo(t.c));
  ok(h.indexOf(ctx.ntdKhoangChu(m1)) > 0, 'hiện thời gian tới tự do'); ok(h.indexOf('sớm hơn <b>' + ctx.ntdKhoangChu(m1 - m2) + '</b>') > 0, 'so sánh +1tr');
  setToday('2026-10-01');
});
test('Ghi nhanh: dưới ô số tiền hiện bao nhiêu ngày tự do (chi: Khoản này ≈ …, thu: Khoản này ≈ +…); không có số tiền / dữ liệu thì rỗng', function(){
  nsData();
  var c = 22500000 / 92;
  eq(ctx.ntdGoiY('chi', c * 2), 'Khoản này ≈ 2 ngày tự do'); eq(ctx.ntdGoiY('thu', c * 0.5), 'Khoản này ≈ +0,5 ngày tự do'); eq(ctx.ntdGoiY('thu', 1), 'Khoản này ≈ chưa tới 0,1 ngày tự do', 'thu số nhỏ: không có dấu + trước chữ'); eq(ctx.ntdGoiY('chi', 1), 'Khoản này ≈ chưa tới 0,1 ngày tự do');
  eq(ctx.ntdGoiY('chi', 0), '', 'chưa nhập tiền');
  ctx.state.qa.amt = '489130'; ctx.state.qa.kind = 'chi';
  ok(ctx.ghiNhanhHtml().indexOf('id="qa_ntd">Khoản này ≈ 2 ngày tự do</div>') > 0, 'có sẵn trong bảng khi mở');
  nsData({ batDau: '2026-10' }); eq(ctx.ntdGoiY('chi', 100000), '', 'chưa đủ dữ liệu thì không gợi ý');
  ctx.state.qa.amt = '';
  setToday('2026-10-01');
});
test('Báo cáo: thẻ Ngày tự do nằm trong phần phụ (sau Hạn mức, Tài sản ròng, Mục tiêu), ẩn / hiện được ở Hiển thị', function(){
  eq(ctx.htThuTu('baocao').indexOf('ngaytudo') > ctx.htThuTu('baocao').indexOf('muctieu'), true);
  ok(ctx.htThe('baocao', 'ngaytudo') && !ctx.htThe('baocao', 'ngaytudo').khoa, 'không khóa: ẩn được');
});

group('Lịch âm (amlich.js)');
test('alTet: mùng 1 Tết các năm 2015 – 2030 theo giờ Việt Nam (UTC+7)', function(){
  var tet = { 2015: '2015-02-19', 2016: '2016-02-08', 2017: '2017-01-28', 2018: '2018-02-16', 2019: '2019-02-05', 2020: '2020-01-25', 2021: '2021-02-12',
    2022: '2022-02-01', 2023: '2023-01-22', 2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26', 2029: '2029-02-13',
    2030: '2030-02-02' };      // 2030: trăng mới lúc 23:08 ngày 2/2 giờ VN (sang 3/2 ở Trung Quốc UTC+8): Việt Nam ăn Tết sớm hơn một ngày
  Object.keys(tet).forEach(function(y){ eq(ctx.alTet(parseInt(y, 10)), tet[y], 'Tết ' + y); });
});
test('alCua: ngày âm, tháng nhuận (2023 nhuận 2, 2025 nhuận 6), rằm tháng 8', function(){
  var a = ctx.alCua('2026-02-17'); eq(a.ngay + '/' + a.thang + '/' + a.nam + '/' + a.nhuan, '1/1/2026/false', 'mùng 1 Tết Bính Ngọ');
  var n1 = ctx.alCua('2023-03-22'); eq(n1.ngay + '/' + n1.thang + '/' + n1.nhuan, '1/2/true', '2023: tháng 2 nhuận bắt đầu 22/3');
  eq(ctx.alCua('2023-02-20').nhuan, false, 'tháng 2 thường đứng trước'); eq(ctx.alCua('2023-04-20').thang, 3);
  var n2 = ctx.alCua('2025-07-25'); eq(n2.ngay + '/' + n2.thang + '/' + n2.nhuan, '1/6/true', '2025: tháng 6 nhuận bắt đầu 25/7');
  eq(ctx.alNhan('2025-07-25'), '1/6 nhuận âm'); eq(ctx.alNhan('2026-09-25'), '15/8 âm', 'Trung thu 2026');
  eq(ctx.alNhan('2025-10-06'), '15/8 âm', 'Trung thu 2025');
});
test('alSangDuong là nghịch đảo của alCua trên mọi ngày 2020 – 2030', function(){
  var loi = [], t = new Date(2020, 0, 1), n = 0;
  while (t < new Date(2031, 0, 1)){
    var d = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2), a = ctx.alCua(d);
    if (ctx.alSangDuong(a.ngay, a.thang, a.nam, a.nhuan) !== d) loi.push(d);
    n++; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
  }
  eq(loi.slice(0, 3).join(), '', 'ngày lệch'); ok(n > 4000);
  eq(ctx.alSangDuong(1, 2, 2024, true), '', 'năm 2024 không có tháng 2 nhuận');
});
test('alNgayDuong: rằm hằng tháng, giỗ hằng năm, ngày 30 của tháng thiếu rơi vào ngày 29, bỏ tháng nhuận', function(){
  eq(ctx.alNgayDuong(15, 0, '2026-10-12', '2026-12-31').join(), '2026-10-24,2026-11-23,2026-12-23', 'rằm 3 tháng liền');
  eq(ctx.alNgayDuong(12, 3, '2026-10-12', '2027-12-31').join(), '2027-04-18', 'giỗ 12/3 âm chỉ có một lần trong khoảng');
  var thieu = ctx.alNgayDuong(30, 0, '2026-01-01', '2026-12-31'), a = ctx.alCua(thieu[0]);
  ok(thieu.length >= 11 && thieu.length <= 13, 'mỗi tháng âm một lần: ' + thieu.length);
  thieu.forEach(function(d){ var x = ctx.alCua(d); ok(x.ngay === 30 || x.ngay === 29, d + ' = ' + x.ngay); });
  eq(ctx.alNgayDuong(1, 6, '2025-06-01', '2025-09-30').join(), '2025-06-25', 'mùng 1 tháng 6: lấy tháng 6 thường (25/6), bỏ tháng 6 nhuận (25/7)');
  eq(ctx.alNgayDuong(31, 0, '2026-01-01', '2026-12-31').length, 0, 'ngày âm 31 không có'); eq(ctx.alNgayDuong(0, 0, '2026-01-01', '2026-12-31').length, 0);
});
test('alCanChi: năm âm lịch', function(){
  eq(ctx.alCanChi(2026), 'Bính Ngọ'); eq(ctx.alCanChi(2027), 'Đinh Mùi'); eq(ctx.alCanChi(2024), 'Giáp Thìn'); eq(ctx.alCanChi(2000), 'Canh Thìn');
});

group('Lịch âm: danh mục nhắc theo âm lịch');
function amData(cats){
  var d = baseData({ journal: {} });
  d.settings = { soDuDauKy: 0, ngayBatDau: '2026-01-01', thangBatDauDuTru: '2026-01' };
  d.categories.thu = [{ id: 'luong', ten: 'Lương', chiTieu: 0 }];
  d.categories.chi = [{ id: 'ram', ten: 'Cúng rằm', chiTieu: 500000, ngayAm: 15, thangAm: 0 }, { id: 'gio', ten: 'Giỗ ông', chiTieu: 2000000, ngayAm: 12, thangAm: 3 },
    { id: 'nha', ten: 'Tiền nhà', chiTieu: 3000000, ngay: 5 }].concat(cats || []);
  setToday('2026-10-20');
  return loadData(d);
}
test('chuẩn hóa: ngayAm 1–30, thangAm 0–12; sai khuôn thì bỏ cả hai', function(){
  amData([{ id: 'x1', ten: 'X1', chiTieu: 0, ngayAm: 31, thangAm: 5 }, { id: 'x2', ten: 'X2', chiTieu: 0, ngayAm: 8, thangAm: 13 }, { id: 'x3', ten: 'X3', chiTieu: 0, ngayAm: 'abc' }]);
  var c = {}; ctx.state.data.categories.chi.forEach(function(x){ c[x.id] = x; });
  eq(c.ram.ngayAm, 15); eq(c.ram.thangAm, 0); eq(c.gio.thangAm, 3);
  eq(c.x1.ngayAm, undefined, 'ngày 31 không hợp lệ'); eq(c.x1.thangAm, undefined);
  eq(c.x2.ngayAm, 8); eq(c.x2.thangAm, 0, 'tháng 13 về hằng tháng'); eq(c.x3.ngayAm, undefined);
  setToday('2026-10-01');
});
test('catAm: ngày dương đã đặt thì bỏ qua âm lịch; hệ thống không có', function(){
  amData();
  var c = {}; ctx.state.data.categories.chi.forEach(function(x){ c[x.id] = x; });
  eq(ctx.catAm(c.ram).ngay, 15); eq(ctx.catAm(c.gio).thang, 3); eq(ctx.catAm(c.nha), null);
  c.ram.ngay = 10; eq(ctx.catAm(c.ram), null, 'đã có ngày dương: dùng ngày dương');
  eq(ctx.catAmHangNam(c.gio), true); eq(ctx.catAmHangNam({ id: 'q', ngayAm: 15, thangAm: 0 }), false, 'hằng tháng không phải hằng năm');
  setToday('2026-10-01');
});
test('catHanTrongThang: ngày dương, rằm hằng tháng âm, giỗ hằng năm (chỉ đúng tháng)', function(){
  amData();
  var c = {}; ctx.state.data.categories.chi.forEach(function(x){ c[x.id] = x; });
  eq(ctx.catHanTrongThang(c.nha, '2026-11'), '2026-11-05'); eq(ctx.catHanTrongThang(c.ram, '2026-11'), '2026-11-23');
  eq(ctx.catHanTrongThang(c.gio, '2027-04'), '2027-04-18'); eq(ctx.catHanTrongThang(c.gio, '2027-05'), '', 'giỗ chỉ một lần mỗi năm');
  setToday('2026-10-01');
});
test('dsCatSapDenHan: rằm âm nhắc đúng ngày dương, quá hạn tới 7 ngày, tắt bằng Hoàn thành hoặc khi đã ghi', function(){
  amData();
  var ds = ctx.dsCatSapDenHan(7, '2026-10-20').filter(function(x){ return x.id === 'ram'; });
  eq(ds.length, 1); eq(ds[0].han, '2026-10-24'); eq(ds[0].soNgay, 4); eq(ds[0].am, true); eq(ds[0].mk, '2026-10-24', 'kỳ = chính ngày dương');
  eq(ctx.dsCatSapDenHan(7, '2026-10-27').filter(function(x){ return x.id === 'ram'; })[0].soNgay, -3, 'quá hạn 3 ngày vẫn nhắc');
  eq(ctx.dsCatSapDenHan(7, '2026-11-02').filter(function(x){ return x.id === 'ram'; }).length, 0, 'quá 7 ngày thôi nhắc, rằm tháng sau còn xa');
  eq(ctx.dsCatSapDenHan(7, '2026-10-20').filter(function(x){ return x.id === 'gio'; }).length, 0, 'giỗ 12/3 âm chưa tới');
  ctx.nhacHanHoanThanh('chi', 'ram', '2026-10-24');
  eq(ctx.dsCatSapDenHan(7, '2026-10-20').filter(function(x){ return x.id === 'ram'; }).length, 0, 'Hoàn thành tắt nhắc kỳ đó');
  ctx.nhacHanHoanTac('chi', 'ram', '2026-10-24');
  ctx.state.data.journal['2026-10-22'] = { thu: {}, chi: { ram: 300000 }, ghiChu: '', refs: [], items: [] };
  eq(ctx.dsCatSapDenHan(7, '2026-10-20').filter(function(x){ return x.id === 'ram'; }).length, 0, 'đã ghi gần ngày rằm thì hết nhắc');
  setToday('2026-10-01');
});
test('dsCatSapDenHan: giỗ hằng năm nhắc đúng lần trong 7 ngày tới', function(){
  amData(); setToday('2027-04-14');
  var ds = ctx.dsCatSapDenHan(7, '2027-04-14').filter(function(x){ return x.id === 'gio'; });
  eq(ds.length, 1); eq(ds[0].han, '2027-04-18'); eq(ds[0].soNgay, 4);
  setToday('2026-10-01');
});
test('lichSuKien (.ics): lần âm lịch trong 12 tháng tới, tiêu đề ghi kèm ngày âm, bỏ lần đã Hoàn thành', function(){
  amData();
  var ds = ctx.lichSuKien('2026-10-20'), ram = ds.filter(function(e){ return e.uid.indexOf('dmam-chi-ram-') === 0; });
  ok(ram.length >= 11 && ram.length <= 13, 'rằm khoảng 12 lần: ' + ram.length);
  eq(ram[0].ngay, '2026-10-24'); eq(ram[0].tieuDe, 'Chi: Cúng rằm (15/9 âm)');
  var gio = ds.filter(function(e){ return e.uid.indexOf('dmam-chi-gio-') === 0; }); eq(gio.length, 1, 'giỗ một lần'); eq(gio[0].ngay, '2027-04-18');
  ctx.nhacHanHoanThanh('chi', 'ram', '2026-10-24');
  eq(ctx.lichSuKien('2026-10-20').filter(function(e){ return e.ngay === '2026-10-24' && e.uid.indexOf('dmam-') === 0; }).length, 0, 'lần đã tắt không xuất');
  setToday('2026-10-01');
});
test('bảng sửa danh mục: có ô ngày âm + chọn tháng âm, hiện lần tới; danh mục hệ thống thì không có', function(){
  amData();
  var arr = ctx.state.data.categories.chi, gio = arr.filter(function(c){ return c.id === 'gio'; })[0];
  var h = ctx.catSheetHtml({ loai: 'cat', kind: 'chi', id: 'gio' });
  ok(h.indexOf('id="dm_ngayAm"') > 0 && h.indexOf('value="12"') > 0 && h.indexOf('<option value="3" selected>Tháng 3</option>') > 0, 'đã điền 12, Tháng 3');
  ok(h.indexOf('Lần tới: <b>18/04/2027</b> (12/3 âm)') > 0, 'hiện ngày dương của lần tới');
  var h2 = ctx.catSheetHtml({ loai: 'cat', kind: 'chi', id: '' }); ok(h2.indexOf('id="dm_ngayAm"') > 0 && h2.indexOf('Lần tới') < 0, 'danh mục mới: ô trống');
  var list = ctx.categoryCardHtml('chi', 'Danh mục khoản chi', arr);
  ok(list.indexOf('Âm lịch 12/3') > 0 && list.indexOf('Âm lịch 15 hằng tháng') > 0, 'chip trong danh sách');
  setToday('2026-10-01');
});

group('Tết đếm ngược + Quỹ Tết (tet.js)');
function tetData(bd){
  var j = {};
  j['2026-02-08'] = { thu: {}, chi: { an: 3000000, qua: 1000000 }, ghiChu: '', refs: [], items: [] };
  j['2026-02-20'] = { thu: {}, chi: { an: 2000000, traNo: 5000000 }, ghiChu: '', refs: [], items: [] };
  j['2026-03-05'] = { thu: {}, chi: { an: 9000000 }, ghiChu: '', refs: [], items: [] };      // ngoài mùa Tết
  var d = baseData({ journal: j });
  d.settings = { soDuDauKy: 0, ngayBatDau: bd || '2026-01-01', thangBatDauDuTru: '2026-01' };
  d.categories.thu = [{ id: 'luong', ten: 'Lương', chiTieu: 0 }];
  d.categories.chi = [{ id: 'an', ten: 'Ăn', chiTieu: 0 }, { id: 'qua', ten: 'Quà', chiTieu: 0 }, { id: 'traNo', ten: 'Trả nợ', chiTieu: 0 }];
  setToday('2026-10-12');
  return loadData(d);
}
test('tetSapToi: Tết sắp tới, mốc 20 Chạp / mùng 10, đang trong mùa Tết, qua mùng 10 thì sang năm sau', function(){
  tetData();
  var m = ctx.tetSapToi('2026-10-12');
  eq(m.nam, 2027); eq(m.tet, '2027-02-06'); eq(m.batDau, '2027-01-27', '20 Chạp'); eq(m.ketThuc, '2027-02-15', 'mùng 10');
  eq(m.conNgay, 117); eq(m.conToiBatDau, 107); eq(m.dangTrongMua, false); eq(m.tenNam, 'Đinh Mùi');
  var d = ctx.tetSapToi('2027-02-10'); eq(d.nam, 2027); eq(d.dangTrongMua, true); eq(d.conNgay, -4, 'mùng 5: đã qua mùng 1');
  var n = ctx.tetSapToi('2027-02-16'); eq(n.nam, 2028); eq(n.tet, '2028-01-26'); eq(n.dangTrongMua, false);
  eq(ctx.tetThuChu('2027-02-06'), 'Thứ Bảy');
  setToday('2026-10-01');
});
test('tetChiTrong: cộng chi thật đúng mùa Tết năm ngoái (bỏ trả nợ, bỏ ngoài mùa), danh mục lớn trước; sổ bắt đầu sau mùa đó thì chưa có dữ liệu', function(){
  tetData();
  var t = ctx.tetMua(2026), c = ctx.tetChiTrong(t.batDau, t.ketThuc);
  eq(t.batDau, '2026-02-07'); eq(t.ketThuc, '2026-02-26');
  eq(c.tong, 6000000, '3tr + 1tr + 2tr, không gồm trả nợ 5tr và 9tr ngoài mùa'); eq(c.ds.map(function(x){ return x.id + ':' + x.v; }).join(), 'an:5000000,qua:1000000'); eq(c.coDuLieu, true);
  eq(ctx.tetGoiY(6000000), 6000000); eq(ctx.tetGoiY(5920001), 6000000, 'làm tròn lên 100.000'); eq(ctx.tetGoiY(0), 0);
  tetData('2026-06-01'); eq(ctx.tetChiTrong(t.batDau, t.ketThuc).coDuLieu, false, 'sổ bắt đầu 1/6/2026, sau mùa Tết đó');
  setToday('2026-10-01');
});
test('tetCardHtml: ẩn khi còn quá 150 ngày; hiện số ngày, mùng 1, mùa Tết, Tết năm ngoái, gợi ý quỹ và nút tạo mục tiêu', function(){
  tetData(); setToday('2026-08-01');
  eq(ctx.tetCardHtml('2026-08-01'), '', 'còn 189 ngày: chưa hiện');
  var h = ctx.tetCardHtml('2026-10-12');
  ok(h.indexOf('Tết Đinh Mùi') > 0 && h.indexOf('<b>117</b>') > 0 && h.indexOf('ngày nữa tới mùng 1 Tết') > 0, 'đếm ngược');
  ok(h.indexOf('Thứ Bảy 06/02/2027') > 0 && h.indexOf('27/01/2027') > 0 && h.indexOf('107 ngày') > 0, 'mùng 1 và 20 Chạp');
  ok(h.indexOf('Bạn chi <b>6.000.000') > 0 && h.indexOf('Ăn 5.000.000') > 0 && h.indexOf('Quà 1.000.000') > 0, 'Tết năm ngoái');
  ok(h.indexOf('Gợi ý quỹ Tết: <b>6.000.000') > 0 && h.indexOf('data-act="tetTaoMt"') > 0 && h.indexOf('Tạo mục tiêu Quỹ Tết 6.000.000') > 0, 'gợi ý + nút');
  ok(h.indexOf('Cách tính các số này') > 0, 'có Cách tính'); eq(kiemPhepCong(h).loi.join(' | '), '');
  tetData('2026-06-01'); ok(ctx.tetCardHtml('2026-10-12').indexOf('Chưa có dữ liệu: sổ này bắt đầu sau mùa Tết đó') > 0 && ctx.tetCardHtml('2026-10-12').indexOf('data-act="tetMoMt"') > 0, 'không có số năm ngoái: tự thêm mục tiêu');
  setToday('2026-10-01');
});
test('tetCardHtml: đang trong mùa Tết nói đúng ("Mùng 5", "Hôm nay là mùng 1")', function(){
  tetData(); setToday('2027-02-10');
  var h = ctx.tetCardHtml('2027-02-10'); ok(h.indexOf('<b>Mùng 5</b>') > 0 && h.indexOf('mùa Tết đang diễn ra') > 0, 'mùng 5');
  var h2 = ctx.tetCardHtml('2027-02-06'); ok(h2.indexOf('<b>Hôm nay</b>') > 0 && h2.indexOf('là mùng 1 Tết') > 0, 'mùng 1');
  setToday('2026-10-01');
});
test('tetTaoMt: tạo mục tiêu "Quỹ Tết 2027" bằng số gợi ý, hạn chót = tháng 20 Chạp, hoàn tác được; thẻ hiện tiến độ và số cần để dành mỗi ngày', function(){
  tetData(); ctx.renderAll = ctx.renderAll || function(){};
  var undo = null, t0 = ctx.toast; ctx.toast = function(m, o){ if (o && o.hoanTac) undo = o.hoanTac; };
  try{
    ctx.handleTetAction('tetTaoMt', elAct({ 'data-nam': '2027' }));
    var g = ctx.tetMucTieu(2027);
    ok(g, 'có mục tiêu'); eq(g.ten, 'Quỹ Tết 2027'); eq(g.soTien, 6000000); eq(g.hanChot, '2027-01'); eq(g.tetNam, 2027); eq(g.walletId, '');
    ctx.handleTetAction('tetTaoMt', elAct({ 'data-nam': '2027' })); eq(ctx.state.data.mucTieu.length, 1, 'bấm lại không tạo trùng');
    g.daGom = 1500000;
    var h = ctx.tetCardHtml('2026-10-12');
    ok(h.indexOf('Quỹ Tết 2027</b>: đã gom <b>1.500.000') > 0 && h.indexOf('(25%)') > 0, 'tiến độ'); ok(h.indexOf('data-act="mtGom"') > 0, 'nút Gom thêm');
    ok(h.indexOf('<b>' + ctx.fmt(Math.round(4500000 / 107))) > 0 || h.indexOf(ctx.fmt(Math.round(4500000 / 107))) > 0, 'cần để dành mỗi ngày = còn thiếu ÷ ngày tới 20 Chạp');
    ok(h.indexOf('tetTaoMt') < 0, 'đã có mục tiêu thì không còn nút tạo');
    undo(); eq(ctx.tetMucTieu(2027), null, 'hoàn tác xóa mục tiêu');
  } finally { ctx.toast = t0; }
  setToday('2026-10-01');
});

group('UX: màu hành động, header gọn, Báo cáo gập thẻ');
test('index.html: header không còn nút đổi giao diện / làm mới; không còn mã nào gọi hai nút đó', function(){
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(html.indexOf('id="btnTheme"') < 0 && html.indexOf('id="btnRefresh"') < 0, 'đã bỏ khỏi header');
  ['app.js', 'motion.js', 'ui.js'].forEach(function(f){
    var js = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
    ok(js.indexOf("getElementById('btnTheme')") < 0 && js.indexOf("getElementById('btnRefresh')") < 0, f + ' không còn tham chiếu nút đã bỏ');
  });
  ok(fs.readFileSync(path.join(JS_DIR, 'motion.js'), 'utf8').indexOf('lamMoiDuLieu()') > 0, 'kéo xuống làm mới gọi thẳng hàm làm mới');
});
test('Cài đặt → Ứng dụng: thẻ "Giao diện và làm mới" đứng đầu, 3 lựa chọn, mặc định Tự động, nút làm mới', function(){
  loadData(baseData({})); ctx.state.offline = false;
  var h = ctx.giaoDienCardHtml();
  ok(h.indexOf('Giao diện và làm mới') > 0, 'tiêu đề');
  ['auto', 'light', 'dark'].forEach(function(v){ ok(h.indexOf('data-act="themeDat" data-v="' + v + '"') > 0, 'có lựa chọn ' + v); });
  ok(h.indexOf('data-v="auto" class="on" aria-pressed="true"') > 0 && h.indexOf('data-v="dark" class="" aria-pressed="false"') > 0, 'mặc định Tự động');
  ok(h.indexOf('data-act="lamMoi"') > 0 && h.indexOf('>Làm mới<') > 0, 'nút làm mới');
  ctx.state.offline = true; ok(ctx.giaoDienCardHtml().indexOf('>Đồng bộ<') > 0, 'đang dùng dữ liệu trên máy thì nút là Đồng bộ'); ctx.state.offline = false;
  var src = fs.readFileSync(path.join(JS_DIR, 'danhmuc.js'), 'utf8');
  ok(src.indexOf("giaoDienCardHtml() + caiAppCardHtml() + lichCardHtml()") > 0, 'phần Ứng dụng: thẻ này đứng đầu');
  ok(ctx.dmPhanHtml('tien').indexOf('Giao diện và làm mới') < 0 && ctx.dmPhanHtml('danhmuc').indexOf('Giao diện và làm mới') < 0, 'không lẫn sang phần khác');
});
test('style.css: có màu hành động tách khỏi đỏ; --primary chỉ còn cho tên app, dòng số dư, tiêu đề nhóm', function(){
  var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  ok(/--action:#[0-9a-f]{6}; --action-d:#[0-9a-f]{6}; --action-tx:#[0-9a-f]{6};/.test(css), 'sáng có --action / --action-d / --action-tx');
  var toi = css.slice(css.indexOf('[data-theme="dark"]{')); ok(/--action:#[0-9a-f]{6};/.test(toi.slice(0, 2500)), 'tối có --action riêng');
  var con = (css.match(/var\(--primary(-d)?\)/g) || []).length; ok(con <= 6, 'chỗ còn dùng primary: ' + con);
  ok(css.indexOf('.btn{border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;color:var(--action-tx);background:var(--action)}') >= 0, 'nút chính dùng màu hành động');
  ok(css.indexOf('[data-theme="dark"] .btn{background:var(--chi-solid)}') < 0, 'bỏ ghi đè đỏ ở chế độ tối');
  ok(css.indexOf('.qa-save.chi{background:var(--chi-solid)}') > 0 && css.indexOf('.qa-save.thu{background:var(--thu-solid)}') > 0, 'nút Lưu khoản chi / thu vẫn giữ màu ngữ nghĩa');
});
function baoCaoVe(){
  var rd = { innerHTML: '' };
  voiDom({ tabContent: rd }, null, function(){ ctx.renderBaoCao(); });
  return rd.innerHTML;
}
test('Báo cáo: giữ 3 thẻ đầu, gập phần còn lại sau nút "Xem thêm", có hàng chip nhảy nhanh', function(){
  htSach(); tcData(); setToday('2026-10-11'); ctx.state.bcMo = false; ctx.state.soTayMonth = '2026-10';
  var h = baoCaoVe();
  ok(h.indexOf('class="bc-jump"') > 0 && h.indexOf('data-act="tqCuon" data-to="cardNgayTuDo"') > 0 && h.indexOf('data-to="bieuDoCard"') > 0, 'hàng chip có Ngày tự do và Biểu đồ');
  var iEx = h.indexOf('id="bcExtra"'); ok(iEx > 0 && h.indexOf('class="bc-extra dong"') > 0, 'phần gập có sẵn và đang gập');
  ok(h.indexOf('id="cardHanMuc"') > 0 && h.indexOf('id="cardHanMuc"') < iEx, 'Hạn mức (thẻ đầu) nằm ngoài phần gập');
  ok(h.indexOf('id="cardNgayTuDo"') > iEx, 'Ngày tự do nằm trong phần gập');
  ok(h.indexOf('id="cardNhan"') > iEx, 'thẻ cuối (Nhãn) nằm trong phần gập');
  ok(h.indexOf('data-act="bcMo"') > iEx && h.indexOf('Xem thêm ') > 0 && h.indexOf('aria-expanded="false"') > 0, 'nút Xem thêm sau phần gập');
  ctx.state.bcMo = true; var h2 = baoCaoVe(); ok(h2.indexOf('class="bc-extra"') > 0 && h2.indexOf('Thu gọn') > 0 && h2.indexOf('aria-expanded="true"') > 0, 'đã mở thì hiện hết, nút là Thu gọn');
  ctx.state.bcMo = false; htSach();
});
test('Báo cáo: ít thẻ thì không gập; thẻ bị ẩn ở Hiển thị không có chip', function(){
  htSach(); tcData(); setToday('2026-10-11'); ctx.state.bcMo = false; ctx.state.soTayMonth = '2026-10';
  ['tet', 'nhan', 'taisan', 'hanmuc', 'diemnhan', 'tongket', 'muctieu'].forEach(function(id){ ctx.htDatAn('baocao', id, true); });
  var h = baoCaoVe(); ok(h.indexOf('id="bcExtra"') < 0 && h.indexOf('data-act="bcMo"') < 0, 'chỉ còn Ngày tự do + biểu đồ: không gập');
  ok(h.indexOf('data-to="cardHanMuc"') < 0 && h.indexOf('data-to="cardNhan"') < 0, 'thẻ đã ẩn không có chip');
  htSach();
});
test('bcDatMo + tqCuon: bấm chip tới thẻ đang gập thì mở phần gập trước; đổi chữ nút và aria-expanded', function(){
  var cls = {}, nut = { attrs: {}, textContent: '', setAttribute: function(k, v){ this.attrs[k] = v; }, getAttribute: function(k){ return k === 'data-them' ? 'Hạn mức, Tài sản ròng, Nhãn' : null; } };
  var ex = { classList: { toggle: function(c, on){ cls[c] = on; } } };
  var cuon = 0, dich = { closest: function(s){ return s === '#bcExtra.dong' ? ex : null; }, scrollIntoView: function(){ cuon++; } };
  ctx.state.bcMo = false;
  voiDom({ bcExtra: ex, bcMore: nut, cardNhan: dich }, null, function(){ ctx.handleSoTayAction('tqCuon', elAct({ 'data-to': 'cardNhan' })); });
  eq(ctx.state.bcMo, true, 'đã mở phần gập'); eq(cls.dong, false, 'bỏ lớp dong'); eq(nut.attrs['aria-expanded'], 'true'); eq(nut.textContent, 'Thu gọn ⌃'); eq(cuon, 1, 'rồi mới cuộn tới thẻ');
  voiDom({ bcExtra: ex, bcMore: nut }, null, function(){ ctx.handleSoTayAction('bcMo', elAct({})); });
  eq(ctx.state.bcMo, false); eq(cls.dong, true); eq(nut.textContent, 'Xem thêm 3 thẻ: Hạn mức, Tài sản ròng, Nhãn ⌄', 'chữ nút liệt kê các thẻ đang gập');
});

/* ==================================================================== */
/* ==================================================================== */
group('Định kỳ có giới hạn + cho vay vào dòng tiền tích lũy');

function dataGioiHan(over){
  var d = baseData({ settings:{ soDuDauKy:10000000, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'duocCho', ten:'Được cho', chiTieu:0 }];
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }, { id:'traNo', ten:'Trả nợ', chiTieu:0 }, { id:'choVay', ten:'Cho vay', chiTieu:0, khongDuTru:true }];
  if (over) Object.keys(over).forEach(function(k){ d[k] = over[k]; });
  return d;
}
function balList(n){ return ctx.dtDuKienRows(n).map(function(r){ return Math.round(r.bal); }); }

function dkLuong(ky, over){
  var o = { id:'dkL', ten:'Lương', kind:'thu', catId:'luong', soTien:ky[0].soTien, ngay:5, bat:true, bo:[], duBao:true, ky:ky };
  if (over) Object.keys(over).forEach(function(k){ o[k] = over[k]; });
  return o;
}
function dataLuong(dk, journal){
  var d = dataGioiHan({ settings:{ soDuDauKy:0, ngayBatDau:'2026-10-01', thangBatDauDuTru:'2026-10' } });
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'duocCho', ten:'Được cho', chiTieu:0 }];
  d.dinhKy = dk; d.journal = journal || {};
  return d;
}
function cbList(n){ return ctx.dtDuKienRows(n).map(function(r){ return Math.round(r.cb / 1e5) / 10; }); }

test('Kỳ: dinhKyKy / dinhKySoTien lấy kỳ có tháng bắt đầu lớn nhất ≤ tháng hỏi; trước kỳ đầu = chưa có hiệu lực; kỳ 0 = dừng', function(){
  var dk = dkLuong([{ tuMk:'2026-12', soTien:10000000 }, { tuMk:'2027-06', soTien:12000000 }, { tuMk:'2028-01', soTien:0 }]);
  eq(ctx.dinhKySoTien(dk, '2026-11'), 0, 'trước kỳ đầu');
  eq(ctx.dinhKyTrongHan(dk, '2026-11'), false);
  eq(ctx.dinhKySoTien(dk, '2026-12'), 10000000, 'tháng đầu kỳ 1');
  eq(ctx.dinhKySoTien(dk, '2027-05'), 10000000, 'tháng cuối kỳ 1 (= tháng trước kỳ 2)');
  eq(ctx.dinhKySoTien(dk, '2027-06'), 12000000, 'đầu kỳ 2');
  eq(ctx.dinhKySoTien(dk, '2028-01'), 0, 'kỳ dừng');
  eq(ctx.dinhKyTrongHan(dk, '2028-02'), false, 'dừng thì không còn hiệu lực');
});

test('normalizeData: khoản định kỳ cũ (soTien phẳng) thành 1 kỳ; thu tự vào dự báo, chi hằng ngày thì không, chi cố định thì có', function(){
  setToday('2026-10-14');
  var d = dataLuong([{ id:'a', ten:'Lương', kind:'thu', catId:'luong', soTien:10000000, ngay:5, bat:true },
                     { id:'b', ten:'Net', kind:'chi', catId:'an', soTien:300000, ngay:5, bat:true },
                     { id:'c', ten:'Nhà', kind:'chi', catId:'nha', soTien:3000000, ngay:5, bat:true }]);
  d.categories.chi.push({ id:'nha', ten:'Nhà', chiTieu:0, khoanCoDinh:true });
  loadData(d);
  var k = ctx.state.data.dinhKy;
  eq(JSON.stringify(k[0].ky), JSON.stringify([{ tuMk:'2026-10', soTien:10000000 }]), 'một kỳ từ đầu sổ');
  eq(k[0].duBao, true, 'thu'); eq(k[1].duBao, false, 'chi hằng ngày'); eq(k[2].duBao, true, 'chi cố định');
  eq(k[0].soTien, 10000000, 'bản sao số tiền kỳ đang chạy');
  setToday('2026-10-01');
});

test('normalizeData: dữ liệu bản trước (gioiHan/tuMk/soThang) đổi thành kỳ + kỳ dừng; trường cũ bị bỏ', function(){
  setToday('2026-10-14');
  loadData(dataLuong([{ id:'a', ten:'Được cho', kind:'thu', catId:'duocCho', soTien:2000000, ngay:5, bat:true, gioiHan:true, tuMk:'2026-11', soThang:5 }]));
  var k = ctx.state.data.dinhKy[0];
  eq(JSON.stringify(k.ky), JSON.stringify([{ tuMk:'2026-11', soTien:2000000 }, { tuMk:'2027-04', soTien:0 }]));
  ok(k.gioiHan === undefined && k.soThang === undefined, 'bỏ trường cũ');
  setToday('2026-10-01');
});

test('Lương 10tr từ T10, đổi 12tr từ T6/2027: dòng tiền đúng từng tháng, KHÔNG cộng đôi với lương đã ghi tay', function(){
  setToday('2026-12-15');
  var j = {}; ['2026-10', '2026-11', '2026-12'].forEach(function(m){ j[m + '-05'] = { items:[], refs:[], thu:{ luong:10000000 }, chi:{}, ghiChu:'' }; });
  loadData(dataLuong([dkLuong([{ tuMk:'2026-10', soTien:10000000 }, { tuMk:'2027-06', soTien:12000000 }])], j));
  // T12/2026 (tháng này, đã ghi tay 10tr) rồi T1..T5/2027 = 10tr, T6..T12/2027 = 12tr
  eq(JSON.stringify(cbList(14)), JSON.stringify([10, 10, 10, 10, 10, 10, 12, 12, 12, 12, 12, 12, 12, 12]));
  setToday('2026-10-01');
});

test('Công tắc "Dùng làm dự báo" tắt: tháng tương lai quay về trung bình 3 tháng như cũ', function(){
  setToday('2026-12-15');
  var j = {}; ['2026-10', '2026-11', '2026-12'].forEach(function(m){ j[m + '-05'] = { items:[], refs:[], thu:{ luong:10300000 }, chi:{}, ghiChu:'' }; });
  loadData(dataLuong([dkLuong([{ tuMk:'2026-10', soTien:10000000 }], { duBao:false })], j));
  eq(ctx.tongThuThangCard('2027-02'), 10300000, 'trung bình thực tế, không phải 10tr của kế hoạch');
  setToday('2026-10-01');
});

test('Kỳ dừng (số tiền 0): được cho 2tr × 5 tháng từ T11, sau đó danh mục về 0 (không rơi về trung bình)', function(){
  setToday('2026-10-14');
  loadData(dataLuong([dkLuong([{ tuMk:'2026-11', soTien:2000000 }, { tuMk:'2027-04', soTien:0 }], { id:'dkC', ten:'Được cho', catId:'duocCho' })]));
  eq(JSON.stringify(cbList(8)), JSON.stringify([0, 2, 2, 2, 2, 2, 0, 0]));
  setToday('2026-10-01');
});

test('Hai khoản cùng danh mục (2 việc) thì cộng; khoản tắt nhắc thì không vào dự báo; tháng "Bỏ qua" tính 0', function(){
  setToday('2026-10-14');
  loadData(dataLuong([dkLuong([{ tuMk:'2026-10', soTien:10000000 }]), dkLuong([{ tuMk:'2026-10', soTien:3000000 }], { id:'dkL2' }),
                      dkLuong([{ tuMk:'2026-10', soTien:5000000 }], { id:'dkL3', bat:false })]));
  eq(ctx.dinhKyDuBaoThang('thu', 'luong', '2026-12'), 13000000, '10tr + 3tr, khoản tắt bỏ ra');
  ctx.state.data.dinhKy[1].bo = ['2026-12'];
  eq(ctx.dinhKyDuBaoThang('thu', 'luong', '2026-12'), 10000000, 'tháng bỏ qua của khoản 2');
  eq(ctx.dinhKyDuBaoThang('thu', 'duocCho', '2026-12'), null, 'danh mục không có khoản nào -> cách ước lượng thường');
  setToday('2026-10-01');
});

test('Tháng hiện tại: lương GHI TAY rồi thì không cộng thêm số định kỳ; ghi thiếu thì chỉ cộng phần thiếu; chi hằng ngày không bị trừ', function(){
  setToday('2026-10-14');
  var d = dataLuong([dkLuong([{ tuMk:'2026-10', soTien:10000000 }])], { '2026-10-03': { items:[], refs:[], thu:{ luong:10000000 }, chi:{}, ghiChu:'' } });
  loadData(d);
  eq(ctx.dinhKyChuaGhiThang('2026-10', 'thu'), 0, 'ghi tay đủ');
  d.journal['2026-10-03'].thu.luong = 4000000; loadData(d);
  eq(ctx.dinhKyChuaGhiThang('2026-10', 'thu'), 6000000, 'ghi 4tr thì còn thiếu 6tr');
  setToday('2026-10-01');
});

test('Nhắc / ghi Sổ tay dùng số tiền ĐÚNG KỲ của tháng; sắp xếp lại kỳ khi nhập lộn xộn', function(){
  setToday('2027-06-10');
  loadData(dataLuong([dkLuong([{ tuMk:'2027-06', soTien:12000000 }, { tuMk:'2026-10', soTien:10000000 }])]));
  var ds = ctx.dinhKyDenHan('2027-06-10');
  eq(ds.length, 1); eq(ds[0].tien, 12000000, 'T6/2027 đã sang kỳ 12tr');
  setToday('2027-05-10');
  eq(ctx.dinhKyDenHan('2027-05-10')[0].tien, 10000000, 'T5/2027 còn kỳ 10tr');
  setToday('2026-10-01');
});

test('dinhKyThemKy: tháng bắt đầu phải sau kỳ cuối; kỳ cuối tự đóng ở tháng trước; số 0 = dừng; thiếu số tiền thì lỗi', function(){
  var dk = dkLuong([{ tuMk:'2026-10', soTien:10000000 }]);
  ok(ctx.dinhKyThemKy(dk, '2026-10', 12000000) !== '', 'trùng tháng bắt đầu kỳ cuối');
  ok(ctx.dinhKyThemKy(dk, '2026-09', 12000000) !== '', 'trước kỳ cuối');
  ok(ctx.dinhKyThemKy(dk, '', 12000000) !== '', 'thiếu tháng');
  ok(ctx.dinhKyThemKy(dk, '2027-06', NaN) !== '', 'thiếu số tiền');
  eq(dk.ky.length, 1, 'lỗi thì không thêm gì');
  eq(ctx.dinhKyThemKy(dk, '2027-06', 12000000), '');
  eq(ctx.dinhKyThemKy(dk, '2028-01', 0), '', 'số 0 = dừng');
  eq(ctx.dinhKySoTien(dk, '2027-05'), 10000000, 'tháng trước kỳ mới vẫn là kỳ cũ'); eq(ctx.dinhKySoTien(dk, '2027-06'), 12000000); eq(ctx.dinhKySoTien(dk, '2028-02'), 0);
});

test('Cho vay KHÔNG có ngày dự kiến thu: tiền đã ra thì lũy kế giảm, không giả định thu về ngay tháng này; vẫn là tài sản ròng', function(){
  setToday('2026-10-14');
  var d = dataGioiHan();
  d.vayNo = { choVay: [{ id:'cv', ten:'A', soTien:3000000, daThu:0, ngayChoVay:'2026-10-10', ngayDuKienThu:'', trangThai:'dang_cho' }], vayNoPhaiTra: [] };
  loadData(d);
  ctx.journalUpsertRef('2026-10-10', 'cv', 'choVay', 3000000, 'Cho vay: A');
  ctx.invalidateBalanceCache();
  eq(ctx.tongThuHoiThang('2026-10'), 0, 'không có ngày thì không dự trù thu hồi');
  eq(JSON.stringify(balList(3)), JSON.stringify([7000000, 7000000, 7000000]), 'lũy kế giữ mức đã trừ 3tr');
  eq(JSON.stringify(ctx.dtDuKienRows(3).map(function(r){ return Math.round(r.rong); })), JSON.stringify([10000000, 10000000, 10000000]), 'tài sản ròng vẫn gồm 3tr phải thu');
  setToday('2026-10-01');
});

test('Cho vay có ngày thu T12: lũy kế giảm ngay, T12 tăng lại', function(){
  setToday('2026-10-14');
  var d = dataGioiHan();
  d.vayNo = { choVay: [{ id:'cv', ten:'A', soTien:3000000, daThu:0, ngayChoVay:'2026-10-10', ngayDuKienThu:'2026-12-15', trangThai:'dang_cho' }], vayNoPhaiTra: [] };
  loadData(d);
  ctx.journalUpsertRef('2026-10-10', 'cv', 'choVay', 3000000, 'Cho vay: A');
  ctx.invalidateBalanceCache();
  eq(JSON.stringify(balList(3)), JSON.stringify([7000000, 7000000, 10000000]));
  setToday('2026-10-01');
});

test('Cho vay hẹn ở THÁNG SAU (ngày cho vay tương lai): khoản chi vào đúng tháng đó trong dòng tiền', function(){
  setToday('2026-10-14');
  var d = dataGioiHan();
  d.vayNo = { choVay: [{ id:'cv', ten:'A', soTien:3000000, daThu:0, ngayChoVay:'2026-11-10', ngayDuKienThu:'2026-12-15', trangThai:'dang_cho' }], vayNoPhaiTra: [] };
  loadData(d);
  ctx.journalUpsertRef('2026-11-10', 'cv', 'choVay', 3000000, 'Cho vay: A');
  ctx.invalidateBalanceCache();
  eq(JSON.stringify(balList(3)), JSON.stringify([10000000, 7000000, 10000000]));
  setToday('2026-10-01');
});

test('Cho vay từ tháng trước (ngoài kỳ), thu 20/11: dòng tiền T11 +3tr kể cả khi danh mục "Thu hồi cho vay" bật "Không tính dự kiến"', function(){
  setToday('2026-10-14');
  [false, true].forEach(function(cam){
    var d = dataGioiHan();
    d.categories.thu.push({ id:'thuHoiChoVay', ten:'Thu hồi cho vay', chiTieu:0, khongDuTru:cam });
    d.vayNo = { choVay: [{ id:'cv', ten:'A', soTien:3000000, daThu:0, ngayChoVay:'2026-09-10', ngayDuKienThu:'2026-11-20', trangThai:'dang_cho' }], vayNoPhaiTra: [] };
    loadData(d);
    eq(JSON.stringify(balList(3)), JSON.stringify([10000000, 13000000, 13000000]), 'khongDuTru=' + cam);
  });
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Dọn công tắc danh mục (PR91)');

test('Form danh mục: "Cố định theo Hạn mức" bị ẩn ở danh mục thu (đang bật thì vẫn hiện để tắt được); chi vẫn có; lưu không làm mất cờ cũ', function(){
  setToday('2026-10-14');
  var d = dataLuong([]);
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'cu', ten:'Thu cũ', chiTieu:5000000, coDinhChiTieu:true }];
  d.categories.chi = [{ id:'an', ten:'Ăn', chiTieu:0 }];
  loadData(d);
  ok(ctx.catSheetHtml({ kind:'thu', id:'luong' }).indexOf('dm_codinh') < 0, 'thu bình thường: ẩn');
  ok(ctx.catSheetHtml({ kind:'thu', id:'cu' }).indexOf('id="dm_codinh" checked') > 0, 'thu đang bật: vẫn hiện, đang bật');
  ok(ctx.catSheetHtml({ kind:'chi', id:'an' }).indexOf('dm_codinh') > 0, 'chi: vẫn có');
  setToday('2026-10-01');
});

test('Công tắc đổi tên: "Chi cố định" (nhãn + chip), dữ liệu vẫn là khoanCoDinh', function(){
  tnData(TN_CHI);
  var h = ctx.catSheetHtml({ loai: 'cat', kind: 'chi', id: 'nha' });
  ok(h.indexOf('Chi cố định') > 0 && h.indexOf('Khoản cố định') < 0, 'form dùng tên mới');
});

test('Hạn mức tự lấy từ kế hoạch: = tổng số kỳ hiện tại của các khoản bật + "Dùng làm dự báo"; đổi kỳ / tắt nhắc / sang tháng mới thì đổi theo', function(){
  setToday('2026-10-14');
  var d = dataLuong([dkLuong([{ tuMk:'2026-10', soTien:10000000 }, { tuMk:'2026-12', soTien:12000000 }]), dkLuong([{ tuMk:'2026-10', soTien:3000000 }], { id:'dkL2' })]);
  d.categories.thu[0].chiTieu = 999;                      // số tay cũ bị thay bằng số của kế hoạch
  loadData(d);
  var luong = function(){ return ctx.state.data.categories.thu.filter(function(c){ return c.id === 'luong'; })[0].chiTieu; };
  eq(luong(), 13000000, '10tr + 3tr');
  ok(ctx.catHanMucTuKeHoach('thu', 'luong') && !ctx.catHanMucTuKeHoach('thu', 'duocCho'), 'chỉ danh mục có kế hoạch');
  setToday('2026-12-02'); ctx.dinhKyDongBoHanMuc(); eq(luong(), 15000000, 'sang T12: kỳ 12tr + 3tr');
  ctx.state.data.dinhKy[1].bat = false; ctx.dinhKyDongBoHanMuc();
  eq(luong(), 12000000, 'tắt nhắc khoản 2: chỉ còn khoản 1 (kỳ 12tr)');
  ctx.state.data.dinhKy[0].duBao = false; ctx.state.data.dinhKy[1].duBao = false; ctx.dinhKyDongBoHanMuc();
  eq(luong(), 12000000, 'không còn kế hoạch dự báo nào: không đụng, người dùng tự đặt lại');
  ok(ctx.catSheetHtml({ kind:'thu', id:'luong' }).indexOf('id="dm_base"') > 0, 'ô hạn mức nhập lại được');
  setToday('2026-10-01');
});

test('Form danh mục: ô Hạn mức bị khóa khi lấy từ kế hoạch; Ngân sách không đổi hạn mức của danh mục đó', function(){
  setToday('2026-10-14');
  var d = dataLuong([dkLuong([{ tuMk:'2026-10', soTien:10000000 }])]);
  loadData(d);
  var h = ctx.catSheetHtml({ kind:'thu', id:'luong' });
  ok(/id="dm_base"[^>]*disabled/.test(h) && h.indexOf('Tự lấy từ kế hoạch') > 0, 'khóa + giải thích');
  setToday('2026-10-01');
});

test('Kỳ sắp tới (khai trước, ước tính) được thay số bằng cách nhập lại đúng tháng; kỳ đã chạy thì không', function(){
  setToday('2026-10-14');
  var dk = dkLuong([{ tuMk:'2026-10', soTien:9400000 }]);
  eq(ctx.dinhKyThemKy(dk, '2027-02', 10500000), '');
  eq(ctx.dinhKyThemKy(dk, '2027-02', 11000000), '', 'thay số kỳ chưa bắt đầu');
  eq(dk.ky.length, 2, 'không nhân đôi'); eq(ctx.dinhKySoTien(dk, '2027-02'), 11000000); eq(ctx.dinhKySoTien(dk, '2027-01'), 9400000, 'kỳ cũ giữ nguyên');
  ok(ctx.dinhKyThemKy(dk, '2026-10', 12000000) !== '', 'kỳ đang chạy không bị ghi đè');
  setToday('2027-02-03');
  ok(ctx.dinhKyThemKy(dk, '2027-02', 12000000) !== '', 'kỳ đã bắt đầu rồi thì không thay số (lịch sử)');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('Sửa / xóa kỳ của khoản định kỳ (PR94)');

test('dinhKySuaKy: tháng bắt đầu nằm giữa kỳ liền trước và liền sau; sai thì lỗi và không đổi gì', function(){
  var ky = [{ tuMk:'2026-10', soTien:9400000 }, { tuMk:'2027-03', soTien:11400000 }, { tuMk:'2027-08', soTien:12000000 }];
  eq(ctx.dinhKySuaKy(ky, 1, '2027-02', 11500000), '', 'sửa T3 thành T2 (đúng ý: nhập nhầm tháng)');
  eq(ky[1].tuMk, '2027-02'); eq(ky[1].soTien, 11500000);
  ok(ctx.dinhKySuaKy(ky, 1, '2026-10', 1) !== '', 'trùng / trước kỳ liền trước');
  ok(ctx.dinhKySuaKy(ky, 1, '2027-08', 1) !== '', 'đụng kỳ liền sau');
  ok(ctx.dinhKySuaKy(ky, 1, '', 1) !== '' && ctx.dinhKySuaKy(ky, 1, '2027-04', NaN) !== '', 'thiếu tháng / số tiền');
  eq(ky[1].tuMk, '2027-02', 'lỗi thì giữ nguyên');
  eq(ctx.dinhKySuaKy(ky, 0, '2026-01', 9500000), '', 'kỳ đầu dời sớm hơn được (không có kỳ trước)');
  eq(ctx.dinhKySuaKy(ky, 2, '2030-01', 0), '', 'kỳ cuối dời xa + số 0 = dừng');
});

test('dinhKyXoaKy: xóa được kỳ nhập nhầm (kỳ liền trước chạy tiếp), luôn còn ít nhất 1 kỳ', function(){
  var ky = [{ tuMk:'2026-10', soTien:9400000 }, { tuMk:'2027-03', soTien:11400000 }];
  eq(ctx.dinhKyXoaKy(ky, 1), '');
  eq(ky.length, 1); eq(ctx.dinhKySoTien({ ky: ky }, '2030-01'), 9400000, 'kỳ 9,4tr chạy tiếp sau khi xóa kỳ sau');
  ok(ctx.dinhKyXoaKy(ky, 0) !== '' && ky.length === 1, 'không xóa kỳ cuối cùng');
  ok(ctx.dinhKyXoaKy(ky, 5) !== '', 'chỉ số sai');
});

test('dinhKyTrangThaiKy: lưu trữ / đang chạy / sắp tới', function(){
  var ky = [{ tuMk:'2026-01', soTien:1 }, { tuMk:'2026-10', soTien:2 }, { tuMk:'2027-02', soTien:3 }];
  eq(ctx.dinhKyTrangThaiKy(ky, 0, '2026-12'), 'luutru'); eq(ctx.dinhKyTrangThaiKy(ky, 1, '2026-12'), 'dangchay'); eq(ctx.dinhKyTrangThaiKy(ky, 2, '2026-12'), 'saptoi');
  eq(ctx.dinhKyTrangThaiKy(ky, 1, '2027-02'), 'luutru', 'sang T2/27 thì kỳ 2 vào lưu trữ');
});

test('Form sửa khoản định kỳ: liệt kê mọi kỳ; lưu trữ chỉ có Xóa, kỳ khác có Sửa + Xóa; không còn ô Số tiền / Từ tháng ngoài danh sách', function(){
  setToday('2026-12-15');
  var d = dataLuong([dkLuong([{ tuMk:'2026-10', soTien:9400000 }, { tuMk:'2026-12', soTien:10000000 }, { tuMk:'2027-02', soTien:11400000 }])]);
  loadData(d);
  ctx.state.dkForm = { id:'dkL' };
  var h = ctx.dkSheetHtml();
  ok(h.indexOf('Lưu trữ') > 0 && h.indexOf('Đang chạy') > 0 && h.indexOf('Sắp tới') > 0, 'đủ 3 trạng thái');
  eq((h.match(/data-act="dkKyMo" data-i="\d"/g) || []).length, 2, 'Sửa chỉ ở kỳ đang chạy và sắp tới');
  eq((h.match(/data-act="dkKyXoa"/g) || []).length, 3, 'Xóa ở cả 3 kỳ');
  ok(h.indexOf('id="dk_tien"') < 0 && h.indexOf('id="dk_tu"') < 0, 'ô số tiền / từ tháng cũ đã bỏ ở form sửa');
  ctx.state.dkForm = null; setToday('2026-10-01');
});

test('Form sửa khoản định kỳ: sửa tháng / xóa kỳ trong form chỉ có hiệu lực khi bấm Cập nhật; Hủy thì dữ liệu nguyên vẹn', function(){
  setToday('2026-10-14');
  loadData(dataLuong([dkLuong([{ tuMk:'2026-10', soTien:9400000 }, { tuMk:'2027-03', soTien:11400000 }])]));
  var dk = ctx.state.data.dinhKy[0];
  ctx.state.dkForm = { id:'dkL' }; ctx.dkSheetHtml();          // mở form -> tạo bản sao
  var fld = { dk_ten:{ value:'Lương' }, dk_cat:{ value:'thu|luong' }, dk_ngay:{ value:'20' }, dk_du:{ checked:true }, dk_note:{ value:'' }, dk_bat:{ checked:true },
              dk_ky_mk:{ value:'2027-02' }, dk_ky_tien:{ value:'11.500.000' } };
  voiDom(fld, null, function(){
    ctx.handleDanhMucAction('dkKyMo', elAct({ 'data-i':'1' }));
    ctx.handleDanhMucAction('dkKyLuu', elAct({ 'data-i':'1' }));
  });
  eq(JSON.stringify(dk.ky[1]), JSON.stringify({ tuMk:'2027-03', soTien:11400000 }), 'chưa Cập nhật: dữ liệu thật chưa đổi');
  eq(ctx.state.dkForm.ky[1].tuMk, '2027-02', 'bản sao đã đổi');
  voiDom(fld, null, function(){ ctx.handleDanhMucAction('dkLuu', elAct({})); });
  eq(JSON.stringify(dk.ky), JSON.stringify([{ tuMk:'2026-10', soTien:9400000 }, { tuMk:'2027-02', soTien:11500000 }]), 'Cập nhật: ghi đúng');
  eq(ctx.state.dkForm, null, 'form đóng');
  // Hủy: sửa rồi bỏ
  ctx.state.dkForm = { id:'dkL' }; ctx.dkSheetHtml();
  ctx.handleDanhMucAction('dkKyXoa', elAct({ 'data-i':'1' }));
  eq(ctx.state.dkForm.ky.length, 1, 'xóa trong bản sao');
  ctx.handleDanhMucAction('dkHuy', elAct({}));
  eq(dk.ky.length, 2, 'Hủy: kỳ vẫn còn');
  setToday('2026-10-01');
});

test('Nút "Ghi khoản thu" ở bảng Ghi nhanh có chữ: nhãn đúng và CSS ép chữ trắng (không bị .thu{color:green} ghi đè thành xanh trên xanh)', function(){
  setToday('2026-10-14');
  loadData(dataLuong([]));
  ctx.state.qa = Object.assign({}, ctx.state.qa, { kind:'thu', amt:'25000' });
  var h = ctx.ghiNhanhHtml();
  ok(/qa-save thu"[^>]*>Ghi khoản thu</.test(h), 'nhãn "Ghi khoản thu"');
  var css = require('fs').readFileSync(require('path').join(__dirname, '..', 'style.css'), 'utf8');
  ok(/\.qa-save\.chi,\.qa-save\.thu\{color:#fff\}/.test(css), 'CSS ép chữ trắng cho nút Chi / Thu (2 class thắng .thu 1 class)');
  ok(css.indexOf('.qa-save.chua{') > css.indexOf('.qa-save.chi,.qa-save.thu{color:#fff}'), 'trạng thái "Nhập số tiền" (chua) vẫn đè sau cùng, giữ chữ xám');
  setToday('2026-10-01');
});

/* ==================================================================== */
group('KB. Kịch bản đời thực: nhiều kiểu người dùng chạy qua hàm thật, kiểm các bất biến');

// bộ sinh số ngẫu nhiên có hạt giống (mulberry32): cùng seed luôn ra cùng kịch bản, fail thì chạy lại được
function kbRng(seed){
  var s = seed >>> 0;
  return function(){ s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function kbNgay(y, m, d){ return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d; }
function kbSoVo(v, path, out, sau){
  if (sau > 7 || v == null) return;
  if (typeof v === 'number'){ if (!isFinite(v)) out.push(path); return; }
  if (typeof v !== 'object') return;
  Object.keys(v).forEach(function(k){ kbSoVo(v[k], path + '.' + k, out, sau + 1); });
}
var KB_HTML = ['baoCaoDauHtml:mk', 'viSoDuCardHtml:mk', 'hanMucThangHtml:mk', 'ntdCardHtml', 'dnCardHtml:mk', 'tongKetCardHtml:mkTruoc', 'taiSanRongCardHtml:mk',
  'mucTieuCardHtml', 'tetCardHtml:homNay', 'nhanCardHtml', 'vnTongQuanHtml', 'ccHubHtml', 'tieuMoiNgayHtml:homNay'];
// chạy cả bộ kiểm tra lên dữ liệu đang nạp: sổ khớp, tổng các ví = số dư, mọi số hữu hạn, không chữ NaN / undefined / null trên màn hình
function kbKiemTra(nhan, homNay){
  setToday(homNay);
  ctx.invalidateBalanceCache();
  var d = ctx.state.data, mk = homNay.slice(0, 7), mkTruoc = ctx.monthKeyAdd(mk, -1);
  ctx.state.soTayMonth = mk;       // renderBaoCao / Sổ tay đặt tháng đang xem trước khi vẽ
  eq(JSON.stringify(ctx.journalKiemTra(d.journal)), '[]', nhan + ': số lưu của ngày phải khớp items + refs');
  var tong = 0;
  d.wallets.forEach(function(w){ tong += ctx.soDuTheoVi(w.id, homNay); });
  near(tong, ctx.balanceAt(homNay), 0.5, nhan + ': tổng số dư các ví = số dư tổng');
  var kq = { bd: ctx.bdThang(mk), rong: ctx.taiSanRongThang(mk), lich: ctx.tnLichTien(homNay, 30), ntd: ctx.ntdTinh(homNay), tieu: ctx.tieuMoiNgay(homNay),
    dn: ctx.dnTatCa(mk, homNay), cb: ctx.cbTatCa(homNay), dt: ctx.dtDuKienRows(12), chiThang: ctx.tongChiThangCard(mk), sap: ctx.danhSachSapDenHan(7) };
  d.wallets.forEach(function(w){ kq['lich_' + w.id] = ctx.tnLichTien(homNay, 30, w.id); });
  var xau = [];
  kbSoVo(kq, '', xau, 0);
  eq(xau.join(' '), '', nhan + ': có số không hữu hạn (NaN / Infinity)');
  KB_HTML.forEach(function(s){
    var p = s.split(':'), tham = { mk: mk, mkTruoc: mkTruoc, homNay: homNay }[p[1]];
    var h = p[1] ? ctx[p[0]](tham) : ctx[p[0]]();
    ok(typeof h === 'string', nhan + ': ' + p[0] + ' trả chuỗi');
    ok(!/NaN|undefined|Infinity|\[object/.test(h), nhan + ': ' + p[0] + ' lộ NaN / undefined trên màn hình: ' + (h.match(/.{0,40}(NaN|undefined|Infinity|\[object).{0,20}/) || [''])[0]);
  });
  return kq;
}
// lịch trả nợ của mọi khoản vay: tổng gốc các kỳ = số vay, dư nợ giảm dần về 0, tổng trả >= gốc, nợ gốc theo ngày không bao giờ tăng
function kbKiemVay(nhan){
  (ctx.state.data.vayNo.vayNoPhaiTra || []).forEach(function(l){
    var sch = ctx.tinhLichTraNo(l), g = 0, truoc = Infinity;
    sch.forEach(function(k){ g += k.goc; ok(k.lai >= -1e-6 && k.tongTra >= k.goc - 1e-6, nhan + ': ' + l.ten + ' kỳ ' + k.mk + ' lãi âm'); ok(k.duNoConLai <= truoc + 1e-6, nhan + ': dư nợ ' + l.ten + ' tăng'); truoc = k.duNoConLai; });
    near(g, l.soTienGoc, 1, nhan + ': ' + l.ten + ' tổng gốc các kỳ = số vay');
    near(sch[sch.length - 1].duNoConLai, 0, 1, nhan + ': ' + l.ten + ' kỳ cuối hết nợ');
    var no0 = Infinity;       // chỉ xét từ ngày vay trở đi (trước ngày vay chưa có nợ)
    for (var m = 0; m < 40; m++){
      var ng = m === 0 ? l.ngayVay : ctx.monthKeyAdd(l.ngayVay.slice(0, 7), m) + '-28', no = ctx.noGocTaiNgay(l, ng);
      ok(no <= no0 + 1e-6, nhan + ': nợ gốc ' + l.ten + ' tăng lên ở ' + ng); ok(no >= -1e-6, nhan + ': nợ gốc âm'); no0 = no;
    }
  });
}
function kbTraKy(l, ky, ngay){
  var k = ctx.tinhLichTraNo(l)[ky], rid = 'r' + l.id + ky;
  l.traNo = l.traNo || [];
  l.traNo.push({ rid: rid, ky: ky, mk: k.mk, soTien: Math.round(k.tongTra), ngay: ngay, dongKy: true });
  ctx.journalAddRef(ngay, l.id, 'traNo', Math.round(k.tongTra), 'Trả nợ ' + l.ten, { ky: ky, rid: rid });
}
function kbDuLieu(over){
  var d = baseData({ settings: { soDuDauKy: 0, ngayBatDau: '2026-07-01', thangBatDauDuTru: '2026-07' } });
  d.categories = { thu: [{ id: 'luong', ten: 'Lương', chiTieu: 0 }, { id: 'phu', ten: 'Thu phụ', chiTieu: 0 }],
    chi: [{ id: 'an', ten: 'Ăn', chiTieu: 3000000 }, { id: 'nha', ten: 'Tiền nhà', chiTieu: 4000000, khoanCoDinh: true }, { id: 'xe', ten: 'Xăng xe', chiTieu: 500000 }, { id: 'traNo', ten: 'Trả nợ', chiTieu: 0 }, { id: 'choVay', ten: 'Cho vay', chiTieu: 0 }] };
  if (over) Object.keys(over).forEach(function(k){ d[k] = over[k]; });
  return d;
}

test('KB1 Sinh viên: một ví tiền mặt, gia đình gửi tiền đầu tháng, chi vặt mỗi ngày, không nợ', function(){
  var r = kbRng(11), d = kbDuLieu({ settings: { soDuDauKy: 400000, ngayBatDau: '2026-07-01', thangBatDauDuTru: '2026-07' } });
  loadData(d);
  for (var m = 7; m <= 10; m++){
    ctx.entryAddItem(kbNgay(2026, m, 1), 'thu', 'phu', 3000000, 'Gia đình gửi', '');
    for (var day = 1; day <= (m === 10 ? 14 : 28); day++) for (var n = 0; n < 1 + Math.floor(r() * 3); n++)
      ctx.entryAddItem(kbNgay(2026, m, day), 'chi', r() < 0.7 ? 'an' : 'xe', 15000 + Math.round(r() * 65) * 1000, 'chi vặt', '');
  }
  ['2026-10-14', '2026-10-15', '2026-09-30', '2026-08-01'].forEach(function(h){ kbKiemTra('KB1 ' + h, h); });
});

test('KB2 Nhân viên văn phòng: lương định kỳ, 3 ví (có thẻ tín dụng), chuyển ví trả thẻ, vay ngân hàng trả đều 4 tháng', function(){
  var d = kbDuLieu();
  d.wallets = [{ id: 'tk', ten: 'Techcom', soDuDauKy: 8000000 }, { id: 'tm', ten: 'Tiền mặt', soDuDauKy: 500000 },
    { id: 'the', ten: 'Thẻ VPBank', soDuDauKy: 0, the: true, hanMucThe: 30000000, ngaySaoKe: 25, ngayTraThe: 15 }];
  d.dinhKy = [{ id: 'dkL', ten: 'Lương', kind: 'thu', catId: 'luong', soTien: 20000000, ngay: 5, bat: true, bo: [], duBao: true, ky: [{ tuMk: '2026-07', soTien: 20000000 }] }];
  d.vayNo.vayNoPhaiTra = [{ id: 'nh1', ten: 'Vay mua xe', loaiVay: 'ngan_hang', hinhThuc: 'co_lai', soTienGoc: 60000000, laiSuatNam: 9.5, ngayVay: '2026-06-20', ngayTraHangThang: 20, soThangVay: 24, walletId: 'tk', traNo: [], trangThai: 'dang_vay' }];
  loadData(d);
  var l = ctx.state.data.vayNo.vayNoPhaiTra[0];
  for (var m = 7; m <= 10; m++){
    ctx.entryAddItem(kbNgay(2026, m, 5), 'thu', 'luong', 20000000, 'Lương', 'tk');
    ctx.entryAddItem(kbNgay(2026, m, 6), 'chi', 'nha', 4000000, 'Tiền nhà', 'tk');
    for (var k = 0; k < 6; k++) ctx.entryAddItem(kbNgay(2026, m, 8 + k * 3), 'chi', 'an', 180000 + k * 20000, 'Ăn ngoài', 'the');
    ctx.chuyenViThem(kbNgay(2026, m, 15), 'tk', 'the', 1100000, 'Trả thẻ');
    if (m < 10) kbTraKy(l, m - 7, kbNgay(2026, m, 20));
  }
  ctx.invalidateBalanceCache();
  kbKiemVay('KB2');
  ['2026-10-15', '2026-10-31', '2026-11-01', '2026-10-20'].forEach(function(h){ kbKiemTra('KB2 ' + h, h); });
  var tr = ctx.balanceAt('2026-10-31');
  ctx.chuyenViThem('2026-10-16', 'tk', 'tm', 2000000, 'rút tiền mặt'); ctx.invalidateBalanceCache();
  near(ctx.balanceAt('2026-10-31'), tr, 0.5, 'chuyển giữa các ví không đổi tổng số dư');
  var a = ctx.entryAddItem('2026-10-17', 'chi', 'an', 250000, 'thêm rồi xóa', 'tm'); ctx.invalidateBalanceCache();
  ok(Math.abs(ctx.balanceAt('2026-10-31') - (tr - 250000)) < 0.5, 'thêm một khoản chi: số dư giảm đúng số đó');
});

test('KB3 Freelancer: tháng không thu đồng nào, tháng thu rất lớn, ví âm, chi cuối tháng', function(){
  var d = kbDuLieu({ settings: { soDuDauKy: 2000000, ngayBatDau: '2026-07-01', thangBatDauDuTru: '2026-07' } });
  loadData(d);
  var thu = { 7: 0, 8: 45000000, 9: 0, 10: 6000000 }, r = kbRng(33);
  Object.keys(thu).forEach(function(m){
    if (thu[m]) ctx.entryAddItem(kbNgay(2026, +m, 12), 'thu', 'luong', thu[m], 'Dự án', '');
    for (var i = 0; i < 18; i++) ctx.entryAddItem(kbNgay(2026, +m, 1 + Math.floor(r() * 27)), 'chi', i % 5 === 0 ? 'nha' : 'an', 90000 + Math.round(r() * 900) * 1000 / 10, 'chi', '');
  });
  ['2026-09-30', '2026-10-15', '2026-10-31'].forEach(function(h){ kbKiemTra('KB3 ' + h, h); });
});

test('KB4 Người hay cho vay: nhiều người, thu đủ / thu một phần / xóa nợ một phần / tất toán thiếu, tài sản ròng luôn khớp', function(){
  var d = kbDuLieu({ settings: { soDuDauKy: 30000000, ngayBatDau: '2026-07-01', thangBatDauDuTru: '2026-07' } });
  d.vayNo.choVay = [
    { id: 'cv1', ten: 'Cho Minh vay', nguoi: 'Minh', soTien: 5000000, ngayChoVay: '2026-07-10', ngayDuKienThu: '2026-09-10', daThu: 0, trangThai: 'dang_cho', walletId: '' },
    { id: 'cv2', ten: 'Cho Lan vay', nguoi: 'lan', soTien: 2000000, ngayChoVay: '2026-08-01', ngayDuKienThu: '', daThu: 0, trangThai: 'dang_cho' },
    { id: 'cv3', ten: 'Cho Hùng vay', nguoi: 'Hùng', soTien: 8000000, ngayChoVay: '2026-08-15', ngayDuKienThu: '2027-02-01', daThu: 0, trangThai: 'dang_cho' }];
  loadData(d);
  var cv = ctx.state.data.vayNo.choVay;
  cv.forEach(function(c){ ctx.journalAddRef(c.ngayChoVay, c.id, 'choVay', c.soTien, 'Cho vay ' + c.nguoi, {}); });
  cv[0].daThu = 5000000; ctx.journalAddRef('2026-09-12', 'cv1', 'thuHoiChoVay', 5000000, 'Minh trả', {}); cv[0].trangThai = 'da_thu_du';
  cv[1].daThu = 500000; ctx.journalAddRef('2026-09-20', 'cv2', 'thuHoiChoVay', 500000, 'Lan trả bớt', {});
  cv[1].daBo = [{ soTien: 300000, ngay: '2026-10-01' }];
  cv[2].daThu = 3000000; ctx.journalAddRef('2026-10-02', 'cv3', 'thuHoiChoVay', 3000000, 'Hùng trả bớt', {});
  cv[2].tatToan = { soTien: 5000000, ngay: '2026-10-05' }; cv[2].trangThai = 'da_thu_du';
  ctx.invalidateBalanceCache();
  ['2026-08-31', '2026-09-30', '2026-10-15', '2026-12-31'].forEach(function(h){
    kbKiemTra('KB4 ' + h, h);
    var t = ctx.taiSanRongThang(h.slice(0, 7));
    near(t.rong, t.tien + t.phaiThu - t.no, 0.5, 'tài sản ròng = tiền + phải thu - nợ gốc');
    ok(t.phaiThu >= -1e-6, 'phải thu không âm');
  });
  near(ctx.taiSanRongThang('2026-10').phaiThu, 1200000, 1, 'còn phải thu: Lan 2tr - 0,5tr đã thu - 0,3tr xóa nợ = 1,2tr; Minh đủ; Hùng đã tất toán');
});

test('KB5 Người mới: sổ trống hoàn toàn, rồi chỉ có đúng một khoản — mọi màn không vỡ', function(){
  loadData(baseData({ settings: { soDuDauKy: 0, ngayBatDau: '2026-10-15', thangBatDauDuTru: '2026-10' } }));
  kbKiemTra('KB5 trống', '2026-10-15');
  kbKiemTra('KB5 trống, 1 năm sau', '2027-10-15');
  ctx.entryAddItem('2026-10-15', 'chi', 'an', 1, 'một đồng', ''); ctx.invalidateBalanceCache();
  kbKiemTra('KB5 một khoản 1đ', '2026-10-15');
  eq(ctx.balanceAt('2026-10-15'), -1, 'chi 1đ khi ví 0 thì số dư -1');
});

test('KB6 Giá trị cực đoan: 10 tỷ, 1 đồng, ghi chú dài và ký tự HTML — không NaN, không để lọt thẻ HTML', function(){
  var d = kbDuLieu({ settings: { soDuDauKy: 10000000000, ngayBatDau: '2026-09-01', thangBatDauDuTru: '2026-09' } });
  d.categories.chi.push({ id: 'xss', ten: '<img src=x onerror=alert(1)>', chiTieu: 1 });
  d.wallets = [{ id: 'a', ten: '"><script>boom()</script>', soDuDauKy: 10000000000 }];
  loadData(d);
  ctx.entryAddItem('2026-10-10', 'chi', 'xss', 9999999999, '<b>đậm</b> & "trích" \'đơn\' ' + new Array(3000).join('x'), 'a');
  ctx.entryAddItem('2026-10-11', 'thu', 'luong', 1, '', 'a');
  ctx.invalidateBalanceCache();
  kbKiemTra('KB6', '2026-10-15');
  var h = ctx.viSoDuCardHtml('2026-10') + ctx.baoCaoDauHtml('2026-10') + ctx.hanMucThangHtml('2026-10') + ctx.dnCardHtml('2026-10') + ctx.ccHubHtml();
  ok(h.indexOf('<script>boom') < 0 && h.indexOf('<img src=x') < 0, 'tên ví / danh mục không được in thô vào HTML');
});

test('KB7 Ngày biên: năm nhuận 29/2, ngày trả 31, qua năm, ngày đầu tháng, ngày cuối tháng, sổ bắt đầu ở tương lai', function(){
  var d = kbDuLieu({ settings: { soDuDauKy: 1000000, ngayBatDau: '2027-11-01', thangBatDauDuTru: '2027-11' } });
  d.vayNo.vayNoPhaiTra = [
    { id: 'a', ten: 'Trả ngày 31', hinhThuc: 'khong_lai', soTienGoc: 12000000, ngayVay: '2027-11-30', ngayTraHangThang: 31, soThangVay: 6, traNo: [], trangThai: 'dang_vay' },
    { id: 'b', ten: 'Qua năm nhuận', hinhThuc: 'tra_co_dinh', soTienGoc: 5000000, soTienTraThang: 1100000, ngayVay: '2027-12-31', ngayTraHangThang: 29, soThangVay: 5, traNo: [], trangThai: 'dang_vay' },
    { id: 'c', ten: 'Một lần', hinhThuc: 'tra_1_lan', soTienGoc: 3000000, ngayVay: '2028-01-31', soThangVay: 1, traNo: [], trangThai: 'dang_vay' }];
  loadData(d);
  var sa = ctx.tinhLichTraNo(ctx.state.data.vayNo.vayNoPhaiTra[0]), sb = ctx.tinhLichTraNo(ctx.state.data.vayNo.vayNoPhaiTra[1]);
  eq(sa[2].ngayTra, '2028-02-29', 'ngày 31 rơi vào tháng 2 năm nhuận thì lùi về 29/2');
  eq(sb[1].ngayTra, '2028-02-29', 'ngày 29 ở tháng 2 nhuận vẫn là 29');
  kbKiemVay('KB7');
  ctx.entryAddItem('2028-02-29', 'chi', 'an', 50000, 'ngày nhuận', ''); ctx.invalidateBalanceCache();
  ['2028-02-29', '2028-03-01', '2027-12-31', '2028-01-01', '2027-10-15', '2027-11-01'].forEach(function(h){ kbKiemTra('KB7 ' + h, h); });
});

test('KB8 Dữ liệu cũ: không có ví, không items, khoản vay kiểu cũ (daTraGoc) — nạp xong dùng được, nạp lại không mất dữ liệu', function(){
  var d = { settings: { soDuDauKy: 3000000, ngayBatDau: '2026-08-01' }, journal: { '2026-09-03': { thu: { luong: 9000000 }, chi: { an: 400000 }, ghiChu: 'cũ', refs: [] } },
    categories: { thu: [{ id: 'luong', ten: 'Lương', chiTieu: 0 }], chi: [{ id: 'an', ten: 'Ăn', chiTieu: 0 }] },
    vayNo: { choVay: [], vayNoPhaiTra: [{ id: 'old', ten: 'Vay cũ', hinhThuc: 'khong_lai', soTienGoc: 6000000, ngayVay: '2026-08-10', soThangVay: 6, daTraGoc: 2000000, trangThai: 'dang_vay' }] } };
  loadData(d);
  eq(ctx.state.data.wallets.length, 1, 'tự tạo 1 ví mang số dư đầu kỳ');
  kbKiemTra('KB8', '2026-10-15'); kbKiemVay('KB8');
  // lần nạp đầu có thể thêm cờ mặc định (false) cho vài danh mục; từ lần nạp thứ hai trở đi phải đứng yên và không mất dữ liệu
  var n1 = ctx.normalizeData(JSON.parse(JSON.stringify(ctx.state.data))), s2 = JSON.stringify(n1), s3 = JSON.stringify(ctx.normalizeData(JSON.parse(s2)));
  eq(s3, s2, 'nạp lại lần 3 không đổi gì so với lần 2');
  eq(JSON.stringify(n1.journal), JSON.stringify(ctx.state.data.journal), 'sổ giao dịch không đổi khi nạp lại');
  near(ctx.balanceAt('2026-10-15'), 3000000 + 9000000 - 400000, 0.5, 'số dư đúng sau migration');
});

test('KB9 Fuzz 150 hồ sơ ngẫu nhiên (seed cố định): ví, thẻ, vay mọi hình thức, cho vay, định kỳ, chuyển ví, ngày hôm nay bất kỳ', function(){
  var hinh = ['khong_lai', 'co_lai', 'tra_co_dinh', 'goc_deu', 'tra_1_lan', 'lai_goc_cuoi'];
  for (var seed = 1; seed <= 150; seed++){
    var r = kbRng(seed * 7919), nhan = 'KB9 seed ' + seed, d = kbDuLieu({ settings: { soDuDauKy: Math.round(r() * 20000000), ngayBatDau: '2026-06-01', thangBatDauDuTru: '2026-06' } });
    d.wallets = [{ id: 'w0', ten: 'Ví 0', soDuDauKy: Math.round(r() * 5000000) }];
    if (r() < 0.5) d.wallets.push({ id: 'w1', ten: 'Ví 1', soDuDauKy: Math.round(r() * 5000000), deDanh: r() < 0.3 });
    if (r() < 0.4) d.wallets.push({ id: 'wt', ten: 'Thẻ', soDuDauKy: 0, the: true, hanMucThe: 10000000, ngaySaoKe: 1 + Math.floor(r() * 28), ngayTraThe: 1 + Math.floor(r() * 28) });
    d.settings.soDuDauKy = d.wallets.reduce(function(s, w){ return s + w.soDuDauKy; }, 0);
    for (var i = 0, nv = Math.floor(r() * 3); i < nv; i++){
      d.vayNo.vayNoPhaiTra.push({ id: 'v' + i, ten: 'Vay ' + i, hinhThuc: hinh[Math.floor(r() * hinh.length)], soTienGoc: 1000000 + Math.round(r() * 90) * 1000000,
        laiSuatNam: Math.round(r() * 20), soTienTraThang: 0, ngayVay: kbNgay(2026, 6 + Math.floor(r() * 4), 1 + Math.floor(r() * 28)), ngayTraHangThang: 1 + Math.floor(r() * 31),
        soThangVay: 1 + Math.floor(r() * 36), walletId: 'w0', traNo: [], trangThai: 'dang_vay', cachGoc: r() < 0.5 ? 'giam' : '' });
      var v = d.vayNo.vayNoPhaiTra[i]; v.soTienTraThang = Math.ceil(v.soTienGoc / v.soThangVay * 1.1);
    }
    for (var j = 0, nc = Math.floor(r() * 3); j < nc; j++)
      d.vayNo.choVay.push({ id: 'c' + j, ten: 'CV ' + j, nguoi: 'N' + j, soTien: 500000 + Math.round(r() * 20) * 500000, ngayChoVay: kbNgay(2026, 7 + Math.floor(r() * 3), 1 + Math.floor(r() * 28)),
        ngayDuKienThu: r() < 0.5 ? '' : kbNgay(2027, 1 + Math.floor(r() * 6), 10), daThu: 0, trangThai: 'dang_cho' });
    if (r() < 0.6) d.dinhKy = [{ id: 'dk', ten: 'Lương', kind: 'thu', catId: 'luong', soTien: 5000000 + Math.round(r() * 30) * 1000000, ngay: 1 + Math.floor(r() * 31), bat: true, bo: [], duBao: r() < 0.5, ky: [{ tuMk: '2026-06', soTien: 5000000 + Math.round(r() * 30) * 1000000 }] }];
    loadData(d);
    var st = ctx.state.data;
    st.vayNo.choVay.forEach(function(c){ ctx.journalAddRef(c.ngayChoVay, c.id, 'choVay', c.soTien, 'cho vay', {}); });
    st.vayNo.vayNoPhaiTra.forEach(function(v){ if (r() < 0.5) kbTraKy(v, 0, ctx.tinhLichTraNo(v)[0].ngayTra); });
    for (var n = 0, nn = 20 + Math.floor(r() * 80); n < nn; n++){
      var ng = kbNgay(2026, 6 + Math.floor(r() * 5), 1 + Math.floor(r() * 28)), w = st.wallets[Math.floor(r() * st.wallets.length)].id, thu = r() < 0.2;
      ctx.entryAddItem(ng, thu ? 'thu' : 'chi', thu ? 'luong' : ['an', 'nha', 'xe'][Math.floor(r() * 3)], 1000 + Math.round(r() * 2000) * 1000, r() < 0.3 ? 'ghi chú ' + n : '', w);
    }
    if (st.wallets.length > 1) ctx.chuyenViThem(kbNgay(2026, 9, 1 + Math.floor(r() * 28)), st.wallets[0].id, st.wallets[1].id, 100000 + Math.round(r() * 30) * 100000, '');
    kbKiemVay(nhan);
    kbKiemTra(nhan, kbNgay(2026, 8 + Math.floor(r() * 5), 1 + Math.floor(r() * 28)));
  }
});

group('7h. Ghi nhanh trên màn khóa: hàng chờ, duyệt rồi mới vào sổ (lock.js, sotay.js)');

function khoaGiaLap(dung){
  var kho = khoGia(), goi = { toast: [], luu: 0 };
  var body = { classList: { add: function(){}, remove: function(){} } };
  var undo = thayTam({ localStorage: kho, document: { getElementById: function(){ return null; }, querySelector: function(){ return null; }, querySelectorAll: function(){ return []; }, addEventListener: function(){}, body: body, activeElement: null },
    toast: function(m, o){ goi.toast.push({ m: m, o: o }); }, renderSyncStatus: function(){}, renderAll: function(){}, scheduleSave: function(){ goi.luu++; } });
  try{ return dung(kho, goi); } finally { undo(); }
}
function ghiCho(x){ return ctx.ghiKhoaChoThem(Object.assign({ ngay: '2026-10-01', kind: 'chi', catId: 'an', tien: 45000, ghiChu: 'Phở', nhan: [] }, x || {})); }
function soKhoan(){ var n = 0, t = 0; Object.keys(ctx.state.data.journal).forEach(function(d){ ctx.entryItems(ctx.state.data.journal[d]).forEach(function(it){ n++; t += it.soTien; }); }); return { n: n, t: t }; }

test('hàng chờ: nhận khoản hợp lệ, từ chối số tiền / loại / ngày sai; không đụng dữ liệu sổ', function(){
  khoaGiaLap(function(){
    loadData(baseData()); var truoc = JSON.stringify(ctx.state.data.journal);
    ok(ghiCho(), 'khoản đúng được nhận'); eq(ctx.ghiKhoaChoDoc().length, 1, 'có 1 khoản chờ');
    eq(ghiCho({ tien: 0 }), null, 'tiền 0'); eq(ghiCho({ tien: -5 }), null, 'tiền âm'); eq(ghiCho({ kind: 'vay' }), null, 'loại sai');
    eq(ghiCho({ ngay: '1/10' }), null, 'ngày sai'); eq(ghiCho({ catId: '' }), null, 'thiếu danh mục');
    eq(ctx.ghiKhoaChoDoc().length, 1, 'khoản sai không lọt vào');
    eq(JSON.stringify(ctx.state.data.journal), truoc, 'sổ không đổi khi mới ghi chờ');
  });
});
test('hàng chờ: tối đa 50 khoản; phần tử rác trong localStorage bị lọc khi đọc', function(){
  khoaGiaLap(function(kho){
    for (var i = 0; i < 50; i++) ok(ghiCho({ tien: 1000 + i }), 'khoản ' + i);
    eq(ghiCho(), null, 'khoản thứ 51 bị từ chối'); eq(ctx.ghiKhoaChoDoc().length, 50, 'vẫn 50');
    kho.setItem('chitieu_ghi_cho_v1', JSON.stringify([{ id: 'a', kind: 'chi', catId: 'an', ngay: '2026-10-01', tien: 5 }, { id: 'b', kind: 'chi', catId: 'an', ngay: 'x', tien: 5 }, 7, null, { id: 'c', kind: 'chi', catId: 'an', ngay: '2026-10-01', tien: '9' }]));
    eq(ctx.ghiKhoaChoDoc().length, 1, 'chỉ giữ khoản hợp lệ');
    kho.setItem('chitieu_ghi_cho_v1', 'khong-phai-json'); eq(ctx.ghiKhoaChoDoc().length, 0, 'hỏng thì coi như rỗng');
  });
});
test('công tắc ghi nhanh trên màn khóa: mặc định tắt, riêng từng máy, không nằm trong settings (không lên Drive)', function(){
  khoaGiaLap(function(){
    eq(ctx.ghiKhoaBatDoc(), false, 'mặc định tắt'); ctx.ghiKhoaBatDat(true); eq(ctx.ghiKhoaBatDoc(), true, 'bật'); ctx.ghiKhoaBatDat(false); eq(ctx.ghiKhoaBatDoc(), false, 'tắt');
    loadData(baseData()); ok(!('ghiKhoa' in ctx.state.data.settings), 'không vào settings');
  });
});
test('duyệt: chỉ khoản được tick vào sổ, hàng chờ xóa sạch, Hoàn tác trả lại sổ', function(){
  khoaGiaLap(function(kho, goi){
    loadData(baseData()); setToday('2026-10-01');
    var a = ghiCho({ tien: 45000 }), b = ghiCho({ tien: 60000, ghiChu: '' }), c = ghiCho({ tien: 7000, ghiChu: 'Cafe' });
    var bo = {}; bo[b.id] = true;
    ctx.state.khoaDuyet = { ds: ctx.ghiKhoaChoDoc(), bo: bo };
    ctx.ghiKhoaDuyetGhi();
    var r = soKhoan(); eq(r.n, 2, 'ghi 2 khoản'); eq(r.t, 52000, 'đúng 45.000 + 7.000, khoản bỏ tick không vào');
    eq(ctx.ghiKhoaChoDoc().length, 0, 'hàng chờ sạch (cả khoản bỏ tick)'); eq(ctx.state.khoaDuyet, null, 'đóng bước duyệt'); ok(goi.luu > 0, 'có lưu');
    var t = goi.toast[goi.toast.length - 1]; ok(/Đã ghi 2 khoản/.test(t.m), 'toast: ' + t.m);
    t.o.hoanTac(); eq(soKhoan().n, 0, 'Hoàn tác: sổ về như cũ');
  });
});
test('duyệt: danh mục đã bị xóa từ lúc ghi thì bỏ qua và báo; không có khoản nào tick thì không ghi gì', function(){
  khoaGiaLap(function(kho, goi){
    loadData(baseData());
    ghiCho({ catId: 'khong-con' }); ghiCho({ tien: 1000 });
    ctx.state.khoaDuyet = { ds: ctx.ghiKhoaChoDoc(), bo: {} }; ctx.ghiKhoaDuyetGhi();
    eq(soKhoan().n, 1, 'chỉ khoản có danh mục'); ok(/1 khoản bỏ vì danh mục đã bị xóa/.test(goi.toast[goi.toast.length - 1].m), 'báo khoản bị bỏ');
    var ds = [ghiCho({ tien: 2000 })], bo = {}; bo[ds[0].id] = true;
    ctx.state.khoaDuyet = { ds: ctx.ghiKhoaChoDoc(), bo: bo }; ctx.ghiKhoaDuyetGhi();
    eq(soKhoan().n, 1, 'tick hết bỏ thì không ghi thêm'); eq(ctx.ghiKhoaChoDoc().length, 0, 'hàng chờ vẫn được dọn');
  });
});
test('cảnh báo "lớn bất thường" ở bước duyệt dùng đúng luật chiBatThuong; khoản thu không bao giờ bị nhắc', function(){
  khoaGiaLap(function(){
    loadData(baseData()); setToday('2026-10-01');
    for (var i = 1; i <= 6; i++) ctx.entryAddItem('2026-09-0' + i, 'chi', 'an', 30000, '', '');
    ok(/lớn gấp \d+ lần mức thường thấy/.test(ctx.ghiKhoaCanhBao({ kind: 'chi', catId: 'an', tien: 9999000 })), 'khoản lớn bị nhắc');
    eq(ctx.ghiKhoaCanhBao({ kind: 'chi', catId: 'an', tien: 45000 }), '', 'khoản thường không nhắc');
    eq(ctx.ghiKhoaCanhBao({ kind: 'thu', catId: 'luong', tien: 9999000 }), '', 'khoản thu không nhắc');
  });
});
test('màn khóa tự quét Face ID khi mở, trừ khi bật Ghi nhanh trên màn khóa (hộp thoại iOS chắn mất nút Ghi nhanh)', function(){
  khoaGiaLap(function(kho){
    kho.setItem('chitieu_khoa_v1', JSON.stringify({ hash: 'h', salt: 's', credId: 'abc' }));
    var hen = 0, undo2 = thayTam({ window: { PublicKeyCredential: function(){}, isSecureContext: true, addEventListener: function(){} }, navigator: { credentials: {} }, setTimeout: function(){ hen++; return 0; } });
    try{
      ctx.ghiKhoaBatDat(false); ctx.khoaTuQuet(); eq(hen, 1, 'công tắc tắt: tự quét như cũ');
      ctx.ghiKhoaBatDat(true); ctx.khoaTuQuet(); eq(hen, 1, 'công tắc bật: không tự quét');
    } finally { undo2(); }
  });
});
test('bảng ghi ở chế độ khóa không lộ sổ: không số dư ví, không "ngày tự do", không gợi ý ghi chú / nhãn', function(){
  var d = baseData(); d.wallets = [{ id: 'w1', ten: 'Tiền mặt' }, { id: 'w2', ten: 'Ngân hàng' }];
  loadData(d); setToday('2026-10-01');
  ctx.state.qa.khoa = false; var thuong = ctx.ghiNhanhHtml();
  ctx.state.qa.khoa = true; var khoa = ctx.ghiNhanhHtml(); ctx.state.qa.khoa = false;
  ok(/qa-vis/.test(thuong) && /id="qa_ntd"/.test(thuong), 'bảng thường có chip ví và dòng ngày tự do');
  ok(!/qa-vis/.test(khoa) && !/qa_ntd/.test(khoa), 'bảng khóa không có hai thứ đó');
  ok(!/<option value=/.test(khoa.split('qa_note_goiy')[1].split('</datalist>')[0]), 'datalist ghi chú rỗng'); ok(/chờ duyệt/.test(khoa) && /Đang khóa/.test(khoa), 'có ghi chú đang khóa');
});

group('7i. Giờ ghi của khoản ghi nhanh (it.gio)');

test('itemDatGio: khoản thuộc đúng ngày ghi thì có giờ HH:MM theo giờ máy; ghi bù ngày khác thì không có', function(){
  var luc = new Date(2026, 9, 17, 7, 5, 30).getTime(), it = { iid: 'x' };
  ctx.itemDatGio(it, '2026-10-17', luc); eq(it.gio, '07:05', 'cùng ngày: có giờ, đệm số 0');
  ctx.itemDatGio(it, '2026-10-16', luc); ok(!('gio' in it), 'ghi bù hôm qua: bỏ giờ, không có trường');
  ctx.itemDatGio(it, '2026-10-17', NaN); ok(!('gio' in it), 'mốc hỏng: không có giờ');
});
test('giờ hiện ở dòng phụ, đứng đầu: có / không ghi chú, có nhãn; khoản cũ không có giờ thì dòng phụ y như trước', function(){
  eq(ctx.dlGioVaChu({ gio: '07:42' }, 'Ăn'), '07:42 · Ăn', 'giờ + danh mục');
  eq(ctx.dlGioVaChu({ gio: '07:42' }, ''), '07:42', 'chỉ có giờ');
  eq(ctx.dlGioVaChu({}, 'Ăn'), 'Ăn', 'khoản cũ: giữ nguyên');
  eq(ctx.dlGioVaChu({ gio: '<b>' }, 'Ăn'), 'Ăn', 'giờ sai định dạng bị bỏ, không chèn HTML');
});
test('giờ sống qua lưu / nạp lại và sửa khoản; entryAddItem thường (nhập file, định kỳ...) không tự thêm giờ', function(){
  loadData(baseData()); setToday('2026-10-01');
  var it = ctx.entryAddItem('2026-10-01', 'chi', 'an', 45000, 'Phở', ''); ok(!('gio' in it), 'entryAddItem không tự đặt giờ');
  ctx.itemDatGio(it, '2026-10-01', new Date(2026, 9, 1, 8, 30).getTime());
  ctx.entryUpdateItem('2026-10-01', it.iid, 50000, 'Phở bò', 'chi', 'an', '');
  var n = ctx.normalizeData(JSON.parse(JSON.stringify(ctx.state.data)));
  var lai = ctx.entryItems(n.journal['2026-10-01'])[0];
  eq(lai.gio, '08:30', 'sửa khoản và qua JSON + normalizeData vẫn còn giờ'); eq(lai.soTien, 50000, 'số tiền đã sửa');
});
test('itemGioHien: khoản CŨ không có it.gio vẫn có giờ nhờ iid (thời điểm tạo), chỉ khi tạo đúng ngày của khoản', function(){
  var luc = new Date(2026, 9, 17, 7, 42, 9).getTime(), iid = 'i3_' + luc.toString(36);
  eq(ctx.itemGioHien({ iid: iid }, '2026-10-17'), '07:42', 'khoản cũ ghi đúng hôm đó: có giờ');
  eq(ctx.itemGioHien({ iid: iid }, '2026-10-16'), '', 'ghi bù cho hôm qua: không giờ');
  eq(ctx.itemGioHien({ iid: iid, gio: '06:15' }, '2026-10-17'), '06:15', 'it.gio (khoản ghi trên màn khóa) được ưu tiên hơn iid');
  eq(ctx.itemGioHien({ iid: 'abc' }, '2026-10-17'), '', 'iid lạ: không giờ'); eq(ctx.itemGioHien({ iid: 'i1_zz' }, '2026-10-17'), '', 'số ngoài 2020 – 2100: không phải dấu thời gian');
  eq(ctx.itemGioHien({}, '2026-10-17'), '', 'không iid'); eq(ctx.itemGioHien(null, '2026-10-17'), '', 'null');
  eq(ctx.dlGioVaChu({ iid: iid }, 'Ăn', '2026-10-17'), '07:42 · Ăn', 'hiện ở dòng phụ');
});
test('khoản vừa ghi bằng Ghi nhanh có giờ qua iid, không cần lưu thêm trường nào (dữ liệu / file Drive không phình)', function(){
  loadData(baseData()); setToday('2026-10-01');
  var it = ctx.entryAddItem('2026-10-01', 'chi', 'an', 45000, '', ''), n = new Date();
  var homNay = n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2);
  ok(!('gio' in it), 'không lưu it.gio'); eq(ctx.itemGioHien(it, homNay), ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2), 'giờ suy từ iid');
});
test('duyệt khoản ghi lúc khóa: giờ là lúc GHI (x.luc), không phải lúc duyệt', function(){
  khoaGiaLap(function(){
    loadData(baseData()); setToday('2026-10-17');
    var luc = new Date(2026, 9, 17, 6, 15).getTime();
    var x = { id: 'g1', luc: luc, ngay: '2026-10-17', kind: 'chi', catId: 'an', tien: 30000, ghiChu: '', nhan: [] };
    ctx.state.khoaDuyet = { ds: [x], bo: {} }; ctx.ghiKhoaDuyetGhi();
    eq(ctx.entryItems(ctx.state.data.journal['2026-10-17'])[0].gio, '06:15', 'giờ lúc ghi trên màn khóa');
  });
});

group('7j. Vùng chạm cho ngón tay (style.css)');
test('vùng chạm nới chỉ nằm trong @media (pointer:coarse); nút đầu trang không nới xuống (tránh đè dòng trạng thái), dòng trạng thái không nới lên quá khoảng hở', function(){
  var css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  var i = css.indexOf('@media (pointer:coarse){'); ok(i > 0, 'có khối pointer:coarse');
  var truoc = css.slice(0, i), khoi = css.slice(i);
  ok(!/#btnTim::after/.test(truoc) && !/sync-status\[data-act\]::after/.test(truoc), 'desktop không bị nới');
  ok(/#btnTim::after[^}]*top:-12px;bottom:0;/.test(khoi), 'nút đầu trang nới lên, bottom:0');
  ok(/\.sync-status\[data-act\]::after[^}]*top:-4px;bottom:-12px/.test(khoi), 'dòng trạng thái nới xuống, hở trên đúng 4px (bằng khoảng cách tới nút đầu trang)');
  ok(/\.hero \.month-nav button:first-child::after\{inset:-7px 0 -7px -16px\}/.test(khoi) && /\.hero \.month-nav button:last-child::after\{inset:-7px -16px -7px 0\}/.test(khoi), '‹ › trong thẻ số dư chỉ nới ra ngoài');
});

group('7k. Chip số tiền hay ghi ở Ghi nhanh (qaGoiYTien)');
test('qaGoiYTien: số xuất hiện từ 2 lần, nhiều lần nhất trước, hòa thì số nhỏ trước, tối đa 3; số một lần không vào', function(){
  loadData(baseData()); setToday('2026-10-17');
  [45000, 45000, 45000, 60000, 60000, 38000, 38000, 70000, 25000].forEach(function(v, i){ ctx.entryAddItem('2026-10-' + pad(i + 1), 'chi', 'an', v, '', ''); });
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  eq(JSON.stringify(ctx.qaGoiYTien('chi', 'an', 3)), '[45000,38000,60000]', 'đúng thứ tự: 45k (3 lần), rồi 38k và 60k (2 lần, 38k nhỏ hơn)');
  eq(ctx.qaGoiYTien('chi', 'an', 1).length, 1, 'giới hạn n');
  eq(ctx.qaGoiYTien('chi', 'xang', 3).length, 0, 'danh mục chưa có lịch sử: không gợi ý');
  eq(ctx.qaGoiYTien('thu', 'an', 3).length, 0, 'khác loại thu / chi: không lẫn');
});
test('qaGoiYTien: chỉ tính 180 ngày gần nhất và bỏ khoản "(chưa chi tiết)"', function(){
  loadData(baseData()); setToday('2026-10-17');
  ctx.entryAddItem('2026-03-01', 'chi', 'an', 99000, '', ''); ctx.entryAddItem('2026-03-02', 'chi', 'an', 99000, '', '');     // quá 180 ngày
  ctx.entryAddItem('2026-10-01', 'chi', 'an', 11000, '(chưa chi tiết)', ''); ctx.entryAddItem('2026-10-02', 'chi', 'an', 11000, '(chưa chi tiết)', '');
  eq(ctx.qaGoiYTien('chi', 'an', 3).length, 0, 'số cũ và khoản chưa chi tiết không thành gợi ý');
});
test('hàng chip hiện ở bảng Ghi nhanh thường, đánh dấu chip đang điền; KHÔNG hiện ở chế độ khóa (lộ lịch sử)', function(){
  loadData(baseData()); setToday('2026-10-17');
  ctx.entryAddItem('2026-10-01', 'chi', 'an', 45000, '', ''); ctx.entryAddItem('2026-10-02', 'chi', 'an', 45000, '', '');
  ctx.state.qa.kind = 'chi'; ctx.state.qa.cat = { chi: 'an' }; ctx.state.qa.amt = ''; ctx.state.qa.khoa = false;
  var h = ctx.ghiNhanhHtml(); ok(/data-act="qaTien" data-v="45000"/.test(h) && /Hay ghi cho Ăn/.test(h), 'có chip 45.000');
  ctx.state.qa.amt = '45.000'; ok(/qa-chip on" data-act="qaTien" data-v="45000"/.test(ctx.ghiNhanhHtml()), 'chip trùng số đang điền được đánh dấu');
  ctx.state.qa.khoa = true; ok(!/qaTien/.test(ctx.ghiNhanhHtml()), 'chế độ khóa: không chip');
  ctx.state.qa.khoa = false; ctx.state.qa.amt = '';
});

test('SheetJS khóa integrity SHA-384 + crossorigin; sw bỏ bản opaque cũ; nhập file có guard thiếu thư viện', function(){
  var fs = require('fs'), root = require('path').join(__dirname, '..');
  var html = fs.readFileSync(root + '/index.html', 'utf8');
  var m = html.match(/<script[^>]*cdn\.sheetjs\.com[^>]*>/);
  ok(m, 'có thẻ SheetJS');
  ok(/integrity="sha384-[A-Za-z0-9+\/]{64}"/.test(m[0]), 'integrity sha384 64 ký tự');
  ok(/crossorigin="anonymous"/.test(m[0]), 'crossorigin');
  var sw = fs.readFileSync(root + '/sw.js', 'utf8');
  ok(/'opaque' && req\.mode === 'cors'/.test(sw), 'sw bỏ opaque cũ');
  ok(!/VERSION = 'v4'/.test(sw), 'đã tăng VERSION sw');
  ok(/typeof XLSX === 'undefined'/.test(fs.readFileSync(root + '/js/nhap.js', 'utf8')), 'guard XLSX ở nhập file');
});

group('7l. QR nhận tiền (qr.js)');

test('vqCrc16: vector chuẩn CRC16-CCITT-FALSE "123456789" = 29B1', function(){
  eq(ctx.vqCrc16('123456789'), '29B1');
});

test('vqPayload: đủ tag, CRC đúng, có số tiền thì tag 01 = 12', function(){
  var p = ctx.vqPayload('970407', '1711052003', 150000, 'Tra tien an');
  ok(p.indexOf('000201010212') === 0, 'mã động');
  ok(p.indexOf('A000000727') > 0 && p.indexOf('QRIBFTTA') > 0, 'tag 38');
  ok(p.indexOf('0006970407') > 0 && p.indexOf('01101711052003') > 0, 'BIN + số tài khoản');
  ok(p.indexOf('5406150000') > 0, 'số tiền');
  ok(p.indexOf('62150811Tra tien an') > 0, 'nội dung');
  eq(p.slice(-8, -4), '6304');
  eq(p.slice(-4), ctx.vqCrc16(p.slice(0, -4)), 'CRC khớp phần trước nó');
  eq(ctx.vqPayload('970407', '1711052003', 0, '').indexOf('000201010211'), 0, 'không tiền = mã tĩnh');
  eq(ctx.vqPayload('abc', '1711052003', 1000, ''), '', 'BIN sai -> rỗng');
});

test('vqBoDau: bỏ dấu tiếng Việt, ký tự lạ, cắt 25 ký tự', function(){
  eq(ctx.vqBoDau('Trả tiền ăn Đạt!'), 'Tra tien an Dat');
  eq(ctx.vqBoDau('a'.repeat(40)).length, 25);
});

test('qrMaTran: kích thước theo phiên bản, null khi quá dài', function(){
  var m = ctx.qrMaTran('HELLO');
  eq(m.length, 21, 'v1');
  eq(ctx.qrMaTran(ctx.vqPayload('970407', '1711052003', 150000, 'Tra tien an')).length >= 37, true, 'payload VietQR cần từ v5');
  eq(ctx.qrMaTran('x'.repeat(300)), null);
});

test('QR cần xác nhận: normalize giữ mục hợp lệ, chuông hiện "Có 1 khoản tiền cần xác nhận", khoản cho vay xong thì mục tự hết', function(){
  var d = loadData(baseData({ qrCho: [{ id: 'q1', loai: 'ngoai', tien: 185000, ghiChu: 'Chia bill' }, { id: 'q2', loai: 'sai', tien: 5 }, { id: 'q3', loai: 'no', tien: 0 }],
    settings: { soDuDauKy: 0, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10', qr: { bin: '970407', stk: '1711052003' } } }));
  eq(d.qrCho.length, 1, 'bỏ mục sai loại / số tiền 0');
  eq(d.settings.qr.stk, '1711052003');
  var it = ctx.cbTatCa('2026-10-05').filter(function(x){ return x.loai === 'qr'; });
  eq(it.length, 1); eq(it[0].tieu, 'Có 1 khoản tiền cần xác nhận'); eq(it[0].dich.id, 'q1');
  var d2 = loadData(baseData({ qrCho: [{ id: 'q9', loai: 'no', tien: 1000, cvId: 'cvX' }], vayNo: { vayNoPhaiTra: [], choVay: [{ id: 'cvX', ten: 'A', soTien: 1000, daThu: 1000, ngayChoVay: '2026-10-01' }] } }));
  eq(ctx.qrDanhSachCho().length, 0, 'khoản cho vay đã thu đủ');
  var d3 = loadData(baseData({ settings: { soDuDauKy: 0, ngayBatDau: '2026-10-01', thangBatDauDuTru: '2026-10', qr: { bin: '12', stk: 'x' } } }));
  ok(!d3.settings.qr, 'tài khoản QR sai thì bỏ');
});

(async function ketThuc(){
  if (hangDoiAsync.length) console.log('\nTest bất đồng bộ');
  for (var i = 0; i < hangDoiAsync.length; i++){
    var t = hangDoiAsync[i];
    try{ await t.fn(); pass++; console.log('  ✓ ' + t.name); }
    catch(e){ fail++; failures.push({ name: t.name, msg: e.message }); console.log('  ✗ ' + t.name + '\n      ' + e.message); }
  }
  console.log('\n' + '='.repeat(60));
  console.log('KẾT QUẢ: ' + pass + ' pass, ' + fail + ' fail');
  if (fail){
    console.log('\nCác test fail:');
    failures.forEach(function(f){ console.log('  - ' + f.name + ': ' + f.msg); });
  }
  console.log('='.repeat(60));
  process.exit(fail ? 1 : 0);
})();
