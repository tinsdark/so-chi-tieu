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

['state.js', 'vayno.js', 'dongtien.js', 'sotay.js', 'nhap.js', 'danhmuc.js', 'mophong.js'].forEach(function(f){
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

test('journalTagRef chỉ gắn ref, KHÔNG cộng thêm tiền', function(){
  var d = baseData();
  d.journal = { '2026-11-05': { thu:{}, chi:{traNo:980000}, ghiChu:'tự nhập', refs:[] } };
  loadData(d);
  ctx.journalTagRef('2026-11-05', 'vn1', 'traNo', 980000, { ky: 0 });
  eq(ctx.state.data.journal['2026-11-05'].chi.traNo, 980000, 'tiền không được cộng thêm');
  eq(ctx.state.data.journal['2026-11-05'].refs.length, 1, 'đã gắn ref');
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
  ok(kq.dong[1].canhBao.indexOf('khóa sổ') >= 0, 'cảnh báo mốc khóa sổ'); eq(kq.nOk, 2);
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
    ctx.handleSoTayAction('saveEntry', {});
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
    ctx.handleSoTayAction('saveEntry', {});
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
            vn_vn_soTien:'6000000', vn_vn_soThang:'6', vn_vn_daoHan:'', vn_vn_laiSuat:'', vn_vn_tatToan:'', vn_vn_daTraKy:'2' };
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
  ctx.state.dongTienYear = 2026;
  voiDom({ tabContent: root }, null, function(){ ctx.renderDongTien(); });
  var hang = root.innerHTML.split('Lũy kế số dư')[1].split('</tr>')[0];
  var soTien = function(n){ return '<td>' + ctx.fmt(n) + '</td>'; };
  ok(hang.indexOf(soTien(4000000)) >= 0, 'T10 = 5tr - 1tr: ' + hang);
  ok(hang.indexOf(soTien(3000000)) >= 0, 'T11 = 4tr - 1tr: ' + hang);
  ok(hang.indexOf(soTien(2000000)) >= 0, 'T12 = 3tr - 1tr: ' + hang);
  setToday('2026-10-01');
});

test('Sổ tay: nhập thu hồi / trả nợ mà không chọn khoản thì có nhắc', function(){
  setToday('2026-10-10');
  var d = baseTraNo();
  d.categories.thu = [{ id:'luong', ten:'Lương', chiTieu:0 }, { id:'thuHoiChoVay', ten:'Thu hồi', chiTieu:0 }];
  d.vayNo.choVay = [{ id:'c1', ten:'A', soTien:1000000, daThu:0, trangThai:'dang_cho', ngayChoVay:'2026-09-01', ngayDuKienThu:'2026-10-20' }];
  d.vayNo.vayNoPhaiTra = [haiKhoanVay()[0]];
  loadData(d);
  thongBao.length = 0;
  ctx.state.editingDate = null;
  voiDom({ f_date:{ value:'2026-10-10' }, f_ghichu:{ value:'' }, sotay_selChoVay:{ value:'' }, sotay_selVayNo:{ value:'' } },
         { '.f_thu':[ oNhap('thuHoiChoVay', '500000') ], '.f_chi':[ oNhap('traNo', '300000') ] },
         function(){ ctx.handleSoTayAction('saveEntry', {}); });
  ok(thongBao.some(function(m){ return m.indexOf('Thu hồi cho vay') >= 0 && m.indexOf('chưa chọn khoản') >= 0; }), 'nhắc thu hồi: ' + thongBao.join(' | '));
  ok(thongBao.some(function(m){ return m.indexOf('Trả nợ') >= 0 && m.indexOf('chưa chọn khoản') >= 0; }), 'nhắc trả nợ: ' + thongBao.join(' | '));
  eq(ctx.state.data.vayNo.choVay[0].daThu, 0, 'khoản cho vay không đổi');
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
    ctx.handleSoTayAction('qaSave', {});
  });
  var e = ctx.state.data.journal['2026-10-10'];
  eq(ctx.num(e.chi.an), 45000, 'tiền vào danh mục');
  eq(ctx.itemsSum(e, 'chi', 'an'), 45000, 'có dòng chi tiết khớp tổng');
  eq(e.ghiChu, 'Ăn sáng ' + ctx.fmt(45000), 'ghi chú ngày kèm số tiền');
  eq(ctx.balanceAt('2026-10-10'), 1000000 - 45000, 'số dư');
  eq(ctx.state.qa.amt, '', 'xóa số đã gõ sau khi ghi');
  ok(thongBao.some(function(m){ return m.indexOf('Đã ghi chi') === 0; }), 'có thông báo: ' + thongBao.join('|'));
});

test('qaSave: không có số tiền thì không ghi; ghi thu vào danh mục thu; ngày trước mốc khóa sổ có cảnh báo', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{}, amt:'', note:'', date:'', wallet:'' };
  voiDom({ qa_amount:{ value:'' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
  eq(Object.keys(ctx.state.data.journal).length, 0, 'số tiền rỗng -> không tạo ngày nào');
  ctx.state.qa = { kind:'thu', cat:{}, amt:'', note:'', date:'', wallet:'' };
  voiDom({ qa_amount:{ value:'2.000.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
  eq(ctx.num(ctx.state.data.journal['2026-10-10'].thu.luong), 2000000, 'vào danh mục thu đầu tiên dùng được');
  thongBao.length = 0;
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'' };
  voiDom({ qa_amount:{ value:'10.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-09-01' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
  ok(thongBao.some(function(m){ return m.indexOf('trước mốc khóa sổ') >= 0; }), 'cảnh báo mốc: ' + thongBao.join('|'));
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
  ok(h.indexOf('1 danh mục vượt chỉ tiêu') >= 0, 'Xăng 300k > 200k');
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
  ctx.state.dongTienYear = 2026; ctx.state.dtThang = null;
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
  } finally { ctx.window.matchMedia = mm0; ctx.state.dtThang = null; setToday('2026-10-01'); }
});

test('Bảng Vay-Nợ dạng thẻ: có class m-cards, mỗi ô có nhãn cột (data-th)', function(){
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
  eq((h.match(/<table class="m-cards">/g) || []).length, 4, '4 bảng: sắp đến hạn, cho vay, vay nợ, lịch trả');
  ok(h.indexOf('data-th="Dư nợ còn lại"') >= 0 && h.indexOf('data-th="Dự kiến thu"') >= 0 && h.indexOf('data-th="Theo lịch"') >= 0, 'nhãn cột');
  ok(h.indexOf('<tr class="m-detail">') >= 0, 'dòng chứa lịch trả');
  ctx.state.vnDetailId = null;
  setToday('2026-10-01');
});

test('Đăng xuất không còn ở thanh đầu trang mà ở tab Danh mục', function(){
  var idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok(idx.indexOf('btnSignOut') < 0, 'index.html không còn nút Đăng xuất');
  loadData(baseData());
  ok(ctx.taiKhoanCardHtml().indexOf('data-act="dangXuat"') >= 0, 'thẻ Tài khoản có nút');
});

/* ==================================================================== */
group('V2. Sau khi thử trên iPhone: xác nhận trong thẻ, chạm khoản nhảy tới khoản, Dòng tiền không cuộn lồng');

test('Ghi nhanh: có dòng xác nhận + Hoàn tác ngay trong thẻ; hoàn tác 1 lần duy nhất, số dư về như cũ', function(){
  setToday('2026-10-10');
  loadData(dataGhiNhanh());
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  var truoc = ctx.balanceAt('9999-12-31');
  voiDom({ qa_amount:{ value:'45.000' }, qa_note:{ value:'Ăn sáng' }, qa_date:{ value:'2026-10-10' } }, null, function(){
    ctx.handleSoTayAction('qaSave', {});
  });
  ok(ctx.state.qa.last && ctx.state.qa.last.text.indexOf('Đã ghi chi') === 0, 'có bản ghi cuối');
  var h = ctx.ghiNhanhHtml();
  ok(h.indexOf('id="qaLast"') >= 0 && h.indexOf('data-act="qaHoanTac"') >= 0, 'thẻ hiện dòng xác nhận + nút Hoàn tác');
  eq(ctx.balanceAt('9999-12-31'), truoc - 45000, 'đã ghi');
  var ban = ctx.state.qa.last.ban;
  ctx.handleSoTayAction('qaHoanTac', {});
  ctx.invalidateBalanceCache();
  eq(ctx.balanceAt('9999-12-31'), truoc, 'hoàn tác: số dư về cũ');
  eq(ctx.state.data.journal['2026-10-10'], undefined, 'ngày rỗng bị xóa');
  eq(ctx.state.qa.last, null, 'dòng xác nhận biến mất');
  ctx.qaHoanTacLanGhi(ban);   // bấm thêm lần nữa (nút ở toast) không được làm gì
  eq(ctx.balanceAt('9999-12-31'), truoc, 'hoàn tác lần 2 không đổi gì');
  ok(ctx.ghiNhanhHtml().indexOf('qaLast') < 0, 'thẻ hết dòng xác nhận');
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
    voiDom({ qa_amount:{ value:tien }, qa_note:{ value:note }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
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
    voiDom({ qa_amount:{ value:'30.000' }, qa_note:{ value:'Cà phê' }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
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
         { '.f_chi':[ oNhap('an', '100000'), oNhap('xang', '50000') ] }, function(){ ctx.handleSoTayAction('saveEntry', {}); });
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
    voiDom({ qa_amount:{ value:tien }, qa_note:{ value:note }, qa_date:{ value:'2026-10-10' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
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
         { '.f_chi':[ oNhap('an', '100000'), oNhap('xang', '50000') ] }, function(){ ctx.handleSoTayAction('saveEntry', {}); });
  ctx.state.fullFormOpen = false;
  var e = ctx.state.data.journal['2026-10-10'];
  var a = e.items.filter(function(it){ return it.catId === 'an'; })[0];
  ctx.entryUpdateItem('2026-10-10', a.iid, 120000, 'Đi chợ', 'chi', 'an', '');
  eq(e.ghiChu, 'Đi chợ ' + ctx.fmt(150000) + '; Đi chợ ' + ctx.fmt(120000), 'mẩu chung giữ cho dòng xăng, dòng đã sửa có mẩu riêng');
  var xang = e.items.filter(function(it){ return it.catId === 'xang'; })[0];
  ctx.entryDeleteItem('2026-10-10', xang.iid);
  eq(e.ghiChu, 'Đi chợ ' + ctx.fmt(120000), 'xóa dòng xăng -> chỉ gỡ mẩu chung, còn mẩu của dòng đã sửa');
});

test('Ghi nhanh: có từ 2 ví thì ô tài khoản nằm TRƯỚC (bên trái) ô số tiền, cùng hàng; 1 ví thì không có ô tài khoản', function(){
  setToday('2026-10-10');
  var d = dataGhiNhanh();
  d.wallets = [{ id:'w1', ten:'Techcombank', soDuDauKy:500000 }, { id:'w2', ten:'Tiền mặt', soDuDauKy:500000 }];
  loadData(d);
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  var h = ctx.ghiNhanhHtml();
  var iVi = h.indexOf('id="qa_wallet"'), iTien = h.indexOf('id="qa_amount"'), iHang = h.indexOf('class="qa-amtrow"');
  ok(iVi > 0 && iTien > iVi, 'ô tài khoản đứng trước ô số tiền');
  ok(iHang > 0 && iHang < iVi, 'cả hai nằm trong cùng hàng qa-amtrow');
  ok(h.indexOf('Techcombank') >= 0 && h.indexOf('Tiền mặt') >= 0, 'liệt kê các tài khoản');
  loadData(dataGhiNhanh());
  ok(ctx.ghiNhanhHtml().indexOf('qa_wallet') < 0, '1 ví: không có ô tài khoản');
});

test('Ghi nhanh: chọn tài khoản được nhớ qua các lần vẽ lại và dùng khi ghi', function(){
  setToday('2026-10-10');
  var d = dataGhiNhanh();
  d.wallets = [{ id:'w1', ten:'Techcombank', soDuDauKy:500000 }, { id:'w2', ten:'Tiền mặt', soDuDauKy:500000 }];
  loadData(d);
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  ctx.handleSoTayChange({ value:'w2', matches:function(s){ return s === '[data-act=qaWallet]'; } });
  eq(ctx.state.qa.wallet, 'w2', 'đã nhớ ví chọn');
  ok(ctx.ghiNhanhHtml().indexOf('<option value="w2" selected>') >= 0, 'vẽ lại vẫn chọn Tiền mặt');
  voiDom({ qa_amount:{ value:'20.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' }, qa_wallet:{ value:'w2' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
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

test('Danh mục: tích chọn ví mặc định lưu vào settings, không đổi dòng đã ghi; xóa ví mặc định thì bỏ cờ', function(){
  setToday('2026-10-10');
  var d = dataHaiVi();
  d.journal['2026-10-02'] = { thu:{}, chi:{ an:10000 }, ghiChu:'', refs:[], items:[ { iid:'i1', kind:'chi', catId:'an', soTien:10000, ghiChu:'', walletId:'w1' } ] };
  loadData(d);
  var h = ctx.viCardHtml();
  ok(/data-act="viMd" data-id="w1" checked/.test(h) && !/data-act="viMd" data-id="w2" checked/.test(h), 'ví đầu đang là mặc định');
  ctx.handleDanhMucChange({ checked:true, matches:function(s){ return s === '[data-act=viMd]'; }, getAttribute:function(a){ return a === 'data-id' ? 'w2' : null; } });
  eq(ctx.state.data.settings.viMacDinh, 'w2', 'đã lưu');
  ok(/data-act="viMd" data-id="w2" checked/.test(ctx.viCardHtml()), 'giao diện đánh dấu Tiền mặt');
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
  voiDom({ qa_amount:{ value:'10.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' }, qa_wallet:{ value:'w2' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
  eq(ctx.state.data.journal['2026-10-10'].items[0].walletId, 'w2', 'lần này ghi vào Tiền mặt như đã chọn');
  ok(ctx.ghiNhanhHtml().indexOf('<option value="w1" selected>') >= 0, 'lần sau quay về Techcombank (mặc định)');
  loadData(dataHaiVi());
  ctx.state.qa = { kind:'chi', cat:{ chi:'an' }, amt:'', note:'', date:'', wallet:'', last:null };
  voiDom({ qa_amount:{ value:'10.000' }, qa_note:{ value:'' }, qa_date:{ value:'2026-10-10' }, qa_wallet:{ value:'w2' } }, null, function(){ ctx.handleSoTayAction('qaSave', {}); });
  ok(ctx.ghiNhanhHtml().indexOf('<option value="w2" selected>') >= 0, 'chưa tích mặc định: nhớ ví vừa chọn như trước');
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

/* ==================================================================== */
console.log('\n' + '='.repeat(60));
console.log('KẾT QUẢ: ' + pass + ' pass, ' + fail + ' fail');
if (fail){
  console.log('\nCác test fail:');
  failures.forEach(function(f){ console.log('  - ' + f.name + ': ' + f.msg); });
}
console.log('='.repeat(60));
process.exit(fail ? 1 : 0);
