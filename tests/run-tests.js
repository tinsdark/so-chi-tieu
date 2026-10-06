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

['state.js', 'vayno.js', 'dongtien.js', 'sotay.js'].forEach(function(f){
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
console.log('\n' + '='.repeat(60));
console.log('KẾT QUẢ: ' + pass + ' pass, ' + fail + ' fail');
if (fail){
  console.log('\nCác test fail:');
  failures.forEach(function(f){ console.log('  - ' + f.name + ': ' + f.msg); });
}
console.log('='.repeat(60));
process.exit(fail ? 1 : 0);
