"use strict";
/* ====================================================================
   state.js — dữ liệu mặc định, state chung, các hàm tiện ích dùng khắp nơi
   (ngày tháng, định dạng tiền, số dư...). File này KHÔNG chứa logic
   render hay xử lý sự kiện của tab nào — chỉ là nền dùng chung.
   Phải load TRƯỚC mọi file js/ khác.

   LƯU Ý: normalizeData() có gọi tinhLichTraNo()/monthKeyAdd() ở vayno.js.
   Hợp lệ vì normalizeData chỉ được GỌI sau khi mọi file đã load xong
   (từ driveLoad), không phải lúc parse file này.
   ==================================================================== */

var DEFAULT_DATA = {
  settings: { soDuDauKy: 957000, ngayBatDau: "2026-09-25" },
  journal: {},
  categories: { thu: [
    { id: "luong", ten: "Lương", chiTieu: 0 },
    { id: "thuHoiChoVay", ten: "Thu hồi cho vay", chiTieu: 0 },
    { id: "nhanTienVay", ten: "Nhận tiền vay", chiTieu: 0, khongDuTru: true }
  ], chi: [
    { id: "an", ten: "Ăn", chiTieu: 0 },
    { id: "xang", ten: "Xăng", chiTieu: 0 },
    { id: "tieu", ten: "Tiêu", chiTieu: 0 },
    { id: "traNo", ten: "Trả nợ", chiTieu: 0 },
    { id: "choVay", ten: "Cho vay", chiTieu: 0, khongDuTru: true }
  ]},
  duTru: { thu: {}, chi: {} },
  vayNo: { choVay: [], vayNoPhaiTra: [] }
};

var state = {
  data: null,
  driveFileId: null,
  dirty: false,
  saving: false,
  loading: true,
  errorMsg: null,
  lastSync: null,
  tab: 'sotay',
  soTayMonth: null,   // "YYYY-MM"
  dongTienYear: null,
  editingDate: null,
  soTaySearch: '',
  soTayFrom: '',
  soTayTo: '',
};

/* ====================================================================
   LIÊN KẾT journal <-> khoản vay/cho vay (refs)
   Mỗi entry journal có thêm mảng refs:
     [{ loanId, loai, soTien, note, ky }]
   loai cho biết số tiền đó nằm ở thu/chi và danh mục nào (REF_MAP).
   Nhờ refs mà xóa/sửa khoản vay biết chính xác phải sửa giao dịch nào,
   thay vì để lại giao dịch mồ côi làm số dư sai.
   ==================================================================== */
var REF_MAP = {
  nhanTienVay:  { kind: 'thu', cat: 'nhanTienVay'  },
  thuHoiChoVay: { kind: 'thu', cat: 'thuHoiChoVay' },
  choVay:       { kind: 'chi', cat: 'choVay'       },
  traNo:        { kind: 'chi', cat: 'traNo'        },
  tatToan:      { kind: 'chi', cat: 'traNo'        }
};

function blankEntry(){ return { thu: {}, chi: {}, ghiChu: '', refs: [] }; }

// bỏ đúng 1 mẩu ghi chú do app tự sinh ra khỏi chuỗi "a; b; c"
function journalRemoveNote(entry, note){
  if (!note || !entry.ghiChu) return;
  entry.ghiChu = entry.ghiChu.split('; ').filter(function(s){ return s !== note; }).join('; ');
}

function entryIsEmpty(entry){
  var hasThu = Object.keys(entry.thu || {}).some(function(k){ return num(entry.thu[k]) !== 0; });
  var hasChi = Object.keys(entry.chi || {}).some(function(k){ return num(entry.chi[k]) !== 0; });
  return !hasThu && !hasChi && !(entry.ghiChu || '').trim() && !(entry.refs || []).length;
}

// ghi 1 giao dịch do khoản vay sinh ra: cộng tiền vào danh mục + thêm ghi chú + gắn ref
function journalAddRef(date, loanId, loai, soTien, note, extra){
  var m = REF_MAP[loai];
  if (!m || num(soTien) <= 0) return;
  var e = state.data.journal[date] || blankEntry();
  e.thu = e.thu || {}; e.chi = e.chi || {}; e.refs = e.refs || [];
  e[m.kind][m.cat] = num(e[m.kind][m.cat]) + num(soTien);
  if (note) e.ghiChu = e.ghiChu ? (e.ghiChu + '; ' + note) : note;
  var ref = { loanId: loanId, loai: loai, soTien: num(soTien), note: note || '' };
  if (extra) Object.keys(extra).forEach(function(k){ ref[k] = extra[k]; });
  e.refs.push(ref);
  state.data.journal[date] = e;
}

// chỉ GẮN ref vào số tiền người dùng đã tự nhập ở Sổ tay (không cộng thêm tiền,
// không thêm ghi chú) — dùng cho form nhập nhanh có chọn khoản vay/cho vay
function journalTagRef(date, loanId, loai, soTien, extra){
  var m = REF_MAP[loai];
  if (!m || num(soTien) <= 0) return;
  var e = state.data.journal[date];
  if (!e) return;
  e.refs = e.refs || [];
  var ref = { loanId: loanId, loai: loai, soTien: num(soTien), note: '' };
  if (extra) Object.keys(extra).forEach(function(k){ ref[k] = extra[k]; });
  e.refs.push(ref);
}

// xóa các ref khớp điều kiện + TRỪ lại số tiền tương ứng khỏi journal.
// loai/ky để null nếu muốn xóa tất cả. Trả về danh sách đã xóa để báo cho người dùng.
function journalRemoveRefs(loanId, loai, ky){
  var removed = [];
  Object.keys(state.data.journal).forEach(function(date){
    var e = state.data.journal[date];
    if (!e.refs || !e.refs.length) return;
    var keep = [];
    e.refs.forEach(function(r){
      var match = r.loanId === loanId
        && (loai == null || r.loai === loai)
        && (ky == null || num(r.ky) === num(ky));
      var m = REF_MAP[r.loai];
      if (!match || !m){ keep.push(r); return; }
      var bucket = e[m.kind] || {};
      bucket[m.cat] = num(bucket[m.cat]) - num(r.soTien);
      if (bucket[m.cat] <= 0.004) delete bucket[m.cat];
      journalRemoveNote(e, r.note);
      removed.push({ date: date, loai: r.loai, soTien: num(r.soTien), ky: r.ky });
    });
    e.refs = keep;
    if (entryIsEmpty(e)) delete state.data.journal[date];
  });
  invalidateBalanceCache();
  return removed;
}

function journalRemoveLoanRefs(loanId){ return journalRemoveRefs(loanId, null, null); }

// sửa/ghi lại giao dịch "một lần duy nhất" của khoản vay (Nhận tiền vay, Cho vay):
// xóa bản cũ ở bất kỳ ngày nào rồi ghi lại theo số/ngày mới -> không bao giờ cộng dồn
function journalUpsertRef(date, loanId, loai, soTien, note){
  journalRemoveRefs(loanId, loai, null);
  journalAddRef(date, loanId, loai, soTien, note);
  invalidateBalanceCache();
}

// tổng tiền của 1 danh mục trong 1 ngày mà ĐANG bị ràng buộc bởi khoản vay
// (phần này không cho sửa tay ở Sổ tay, phải sửa từ tab Vay - Nợ)
function entryRefSum(entry, kind, cat){
  var s = 0;
  (entry.refs || []).forEach(function(r){
    var m = REF_MAP[r.loai];
    if (m && m.kind === kind && m.cat === cat) s += num(r.soTien);
  });
  return s;
}

function normalizeData(d){
  d.settings = d.settings || { soDuDauKy: 0, ngayBatDau: "2026-01-01" };
  d.journal = d.journal || {};
  d.planItems = d.planItems || [];
  d.categories = d.categories || { thu: [], chi: [] };
  d.categories.thu = d.categories.thu || [];
  d.categories.chi = d.categories.chi || [];
  d.categories.thu.forEach(function(c){ if (c.chiTieu==null) c.chiTieu = 0; if (c.khongDuTru==null) c.khongDuTru = false; if (c.coDinhChiTieu==null) c.coDinhChiTieu = false; });
  d.categories.chi.forEach(function(c){ if (c.chiTieu==null) c.chiTieu = 0; if (c.khongDuTru==null) c.khongDuTru = false; if (c.coDinhChiTieu==null) c.coDinhChiTieu = false; });
  d.duTru = d.duTru || { thu: {}, chi: {} };
  d.duTru.thu = d.duTru.thu || {};
  d.duTru.chi = d.duTru.chi || {};
  d.vayNo = d.vayNo || { choVay: [], vayNoPhaiTra: [] };
  d.vayNo.choVay = d.vayNo.choVay || [];
  d.vayNo.vayNoPhaiTra = d.vayNo.vayNoPhaiTra || [];
  if (!d.categories.thu.some(function(c){ return c.id === 'thuHoiChoVay'; })){
    d.categories.thu.push({ id: 'thuHoiChoVay', ten: 'Thu hồi cho vay', chiTieu: 0 });
  }
  if (!d.categories.thu.some(function(c){ return c.id === 'nhanTienVay'; })){
    d.categories.thu.push({ id: 'nhanTienVay', ten: 'Nhận tiền vay', chiTieu: 0, khongDuTru: true });
  }
  // danh mục chi "Cho vay": tiền ra khỏi ví khi cho vay, đối xứng với "Nhận tiền vay"
  if (!d.categories.chi.some(function(c){ return c.id === 'choVay'; })){
    d.categories.chi.push({ id: 'choVay', ten: 'Cho vay', chiTieu: 0, khongDuTru: true });
  }
  // mốc bắt đầu tính dự trù: tháng ĐẦY ĐỦ đầu tiên. Nếu ngayBatDau không phải ngày 01
  // thì tháng đó là tháng lẻ (số liệu không phản ánh đúng cả tháng) -> bỏ, lấy tháng sau.
  // Cố ý tách khỏi ngayBatDau để khóa sổ KHÔNG làm mất lịch sử dùng cho dự trù.
  if (!d.settings.thangBatDauDuTru){
    var nb = d.settings.ngayBatDau || todayStr();
    d.settings.thangBatDauDuTru = (nb.slice(8,10) === '01') ? monthKey(nb) : monthKeyAdd(monthKey(nb), 1);
  }
  // migrate dữ liệu cũ: thu là số đơn -> chuyển thành object theo danh mục (giữ nguyên tổng)
  Object.keys(d.journal).forEach(function(date){
    var e = d.journal[date];
    if (!e.thu || typeof e.thu !== 'object'){
      var oldVal = num(e.thu);
      e.thu = oldVal ? { _khac: oldVal } : {};
    }
    e.chi = e.chi || {};
    e.refs = e.refs || [];
  });
  // migrate khoản vay: daTraGoc (1 số tổng) -> traNo[] (từng kỳ, có số tiền thực trả).
  // Suy ra các kỳ đã trả ĐỦ từ daTraGoc cũ; các kỳ này không sinh giao dịch Sổ tay
  // (chúng đã xảy ra trước khi có ref) nên gắn cờ truocKhiDungApp để khỏi hiểu nhầm.
  d.vayNo.vayNoPhaiTra.forEach(function(loan){
    if (!Array.isArray(loan.traNo)){
      loan.traNo = [];
      var daTra = num(loan.daTraGoc);
      if (daTra > 0){
        var sch = tinhLichTraNo(loan), cum = 0;
        for (var i=0;i<sch.length;i++){
          cum += sch[i].goc;
          if (cum > daTra + 0.01) break;
          loan.traNo.push({ ky: i, mk: sch[i].mk, soTien: sch[i].tongTra, ngay: loan.ngayVay || '', truocKhiDungApp: true });
        }
      }
    }
    // dongKy: trước đây cứ ghi nhận là coi như xong kỳ, không có khái niệm trả một
    // phần -> bản ghi cũ đều là kỳ ĐÃ ĐÓNG. rid để xóa đúng LẦN trả nào khi xóa
    // ngày ở Sổ tay (1 kỳ giờ có thể có nhiều lần trả).
    loan.traNo.forEach(function(r, i){
      if (r.dongKy == null) r.dongKy = true;
      if (!r.rid) r.rid = 'r' + num(r.ky) + '_' + i + '_' + (r.ngay || '');
    });
    delete loan.daTraGoc;
    if (loan.tatToan) loan.trangThai = 'da_tra_het';
  });
  // khoản cho vay đã tất toán (bỏ phần không đòi được) -> không còn chờ thu
  d.vayNo.choVay.forEach(function(c){
    if (c.daThu == null) c.daThu = 0;
    if (c.tatToan) c.trangThai = 'da_thu_du';
  });
  invalidateBalanceCache();
  return d;
}

function thuTotal(entry){
  var s = 0;
  var thu = entry.thu;
  if (thu && typeof thu === 'object'){
    Object.keys(thu).forEach(function(k){ s += num(thu[k]); });
  } else {
    s = num(thu);
  }
  return s;
}
function chiTotal(entry){
  var s = 0;
  var chi = entry.chi || {};
  Object.keys(chi).forEach(function(k){ s += num(chi[k]); });
  return s;
}

/* ---------------- helpers chung ---------------- */
function fmt(n){ return (Number(n)||0).toLocaleString('vi-VN') + ' ₫'; }
function num(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }
// giống num() nhưng chặn số âm -> về 0 (dùng cho các ô nhập tiền)
function numNonNeg(v){ var n = num(v); return n < 0 ? 0 : n; }
function pad2(n){ return n<10 ? '0'+n : ''+n; }
function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function monthKey(dateStr){ return dateStr.slice(0,7); }
var MONTH_NAMES = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12'];
function monthLabel(mk){ var p=mk.split('-'); return 'Tháng ' + parseInt(p[1],10) + '/' + p[0]; }
function daysBetween(d1, d2){ return Math.round((new Date(d2) - new Date(d1)) / 86400000); }
function slugify(s){
  var out = s.toString().toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g,'a').replace(/[èéẹẻẽêềếệểễ]/g,'e')
    .replace(/[ìíịỉĩ]/g,'i').replace(/[òóọỏõôồốộổỗơờớợởỡ]/g,'o')
    .replace(/[ùúụủũưừứựửữ]/g,'u').replace(/[ỳýỵỷỹ]/g,'y').replace(/đ/g,'d')
    .replace(/[^a-z0-9]+/g,'');
  return out || ('m' + Date.now());
}

function sortedJournalDates(){
  return Object.keys(state.data.journal).sort();
}
// các ngày được tính vào số dư: từ ngayBatDau (mốc khóa sổ) trở đi. Data trước mốc này
// vẫn còn nguyên trong journal (xem được ở Sổ tay, xuất Excel được) nhưng không cộng vào số dư nữa.
function balanceDates(){
  var start = state.data.settings.ngayBatDau || '';
  var dates = sortedJournalDates();
  return start ? dates.filter(function(d){ return d >= start; }) : dates;
}

/* ---------------- cache số dư ----------------
   Trước đây mỗi lần gọi balanceAt() là một lần quét + sort toàn bộ journal, mà hàm này
   được gọi cho TỪNG dòng bảng và từng dòng Excel -> O(n^2), chậm dần theo thời gian dùng.
   Giờ dựng 1 lần mảng ngày + prefix sum, rồi binary search. Cache phải được xóa mỗi khi
   dữ liệu đổi: invalidateBalanceCache() được gọi ở scheduleSave/driveLoad/renderAll. */
var _balCache = null;
function invalidateBalanceCache(){ _balCache = null; }
function balanceCache(){
  if (_balCache) return _balCache;
  var dates = balanceDates();
  var start = num(state.data.settings.soDuDauKy);
  var pre = new Array(dates.length);
  var bal = start;
  for (var i=0;i<dates.length;i++){
    var e = state.data.journal[dates[i]];
    bal += thuTotal(e) - chiTotal(e);
    pre[i] = bal;
  }
  _balCache = { dates: dates, pre: pre, start: start };
  return _balCache;
}
// số phần tử đầu mảng thỏa dates[i] <= key (dùng cho "tính tới hết ngày key")
function _countUpTo(dates, key){
  var lo = 0, hi = dates.length;
  while (lo < hi){ var mid = (lo+hi) >> 1; if (dates[mid] <= key) lo = mid+1; else hi = mid; }
  return lo;
}
// số phần tử đầu mảng thỏa dates[i] < key (dùng cho "tính tới TRƯỚC ngày key")
function _countBefore(dates, key){
  var lo = 0, hi = dates.length;
  while (lo < hi){ var mid = (lo+hi) >> 1; if (dates[mid] < key) lo = mid+1; else hi = mid; }
  return lo;
}
// balance at end of given date (inclusive), chỉ tính các phát sinh từ ngayBatDau trở đi
function balanceAt(dateStr){
  var c = balanceCache();
  var k = _countUpTo(c.dates, dateStr);
  return k === 0 ? c.start : c.pre[k-1];
}
function balanceBeforeMonth(mk){
  var c = balanceCache();
  var k = _countBefore(c.dates, mk + '-01');
  return k === 0 ? c.start : c.pre[k-1];
}
// số dư tính tới hết tháng mk (cộng dồn toàn bộ lịch sử, không phụ thuộc năm đang xem)
function balanceAtEndOfMonth(mk){
  var p = mk.split('-'); var y = parseInt(p[0],10), m = parseInt(p[1],10) + 1;
  if (m > 12){ m = 1; y++; }
  return balanceBeforeMonth(y + '-' + pad2(m));
}

// Đang gõ dở hoặc đang mở dropdown -> không cho poll ghi đè state.data.
// SELECT phải có trong danh sách: thiếu nó thì đổi "Loại vay" rồi ngồi nghĩ là
// mất trắng form đang điền khi poll 35s nổ.
function isTypingNow(){
  var el = document.activeElement;
  return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'));
}
// đang có form mở dở (thêm/sửa khoản vay, sửa 1 ngày Sổ tay) -> cũng không được ghi đè
function isFormOpen(){
  return !!(state.vnFormKind || state.editingDate);
}

