"use strict";
/* ====================================================================
   state.js — dữ liệu mặc định, state chung, các hàm tiện ích dùng khắp nơi
   (ngày tháng, định dạng tiền, số dư...). File này KHÔNG chứa logic
   render hay xử lý sự kiện của tab nào — chỉ là nền dùng chung.
   Phải load TRƯỚC mọi file js/ khác.
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
    { id: "traNo", ten: "Trả nợ", chiTieu: 0 }
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
  // migrate dữ liệu cũ: thu là số đơn -> chuyển thành object theo danh mục (giữ nguyên tổng)
  Object.keys(d.journal).forEach(function(date){
    var e = d.journal[date];
    if (!e.thu || typeof e.thu !== 'object'){
      var oldVal = num(e.thu);
      e.thu = oldVal ? { _khac: oldVal } : {};
    }
    e.chi = e.chi || {};
  });
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
// balance at end of given date (inclusive), chỉ tính các phát sinh từ ngayBatDau trở đi
function balanceAt(dateStr){
  var bal = num(state.data.settings.soDuDauKy);
  var dates = balanceDates();
  for (var i=0;i<dates.length;i++){
    if (dates[i] > dateStr) break;
    var e = state.data.journal[dates[i]];
    bal += thuTotal(e) - chiTotal(e);
  }
  return bal;
}
function balanceBeforeMonth(mk){
  var firstDay = mk + '-01';
  var bal = num(state.data.settings.soDuDauKy);
  var dates = balanceDates();
  for (var i=0;i<dates.length;i++){
    if (dates[i] >= firstDay) break;
    var e = state.data.journal[dates[i]];
    bal += thuTotal(e) - chiTotal(e);
  }
  return bal;
}
// số dư tính tới hết tháng mk (cộng dồn toàn bộ lịch sử, không phụ thuộc năm đang xem)
function balanceAtEndOfMonth(mk){
  var p = mk.split('-'); var y = parseInt(p[0],10), m = parseInt(p[1],10) + 1;
  if (m > 12){ m = 1; y++; }
  return balanceBeforeMonth(y + '-' + pad2(m));
}

function isTypingNow(){
  var el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}
