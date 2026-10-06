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
  coBanMoi: false,        // trên mạng đã có bản app mới hơn bản đang chạy (xem kiemTraBanMoi ở app.js)
  taiLoi: false,          // lần tải Drive gần nhất THẤT BẠI (khác với 'chưa có file'): cấm tạo file mới đè lên file thật
  offline: false,         // đang mở ở chế độ ngoại tuyến (chưa đăng nhập Google, dữ liệu là bản lưu trên máy)
  offlineTu: null,        // thời điểm của bản dữ liệu ngoại tuyến (ms)
  imp: null,              // nhập CSV/Excel đang làm dở ở Sổ tay (xem js/nhap.js)
  mtForm: null,           // form mục tiêu tiết kiệm ở tab Danh mục (như dkForm)
  dkForm: null,           // form giao dịch định kỳ ở tab Danh mục: null = đóng, {id:''} = thêm mới, {id:'dk_x'} = sửa
  viFormOpen: false,      // form chuyển tiền giữa ví đang mở
  viChon: '',             // ví chọn gần nhất ở form nhập (mặc định: ví đầu tiên)
  backupDs: null,         // danh sách bản sao lưu đã tải ở tab Danh mục (null = chưa tải)
  backupBusy: false,
  soTayCat: '',           // lọc bảng theo danh mục: '' | 'thu:<id>' | 'chi:<id>'
  soTayDetailDate: null,  // ngày đang bung chi tiết giao dịch
  fullFormOpen: false,    // form nhập đầy đủ ở Sổ tay đang mở (mặc định gấp lại, thẻ "Ghi nhanh" lo việc thường ngày)
  // thẻ "Ghi nhanh" ở đầu Sổ tay. Bản nháp (amt/note/date) giữ ở đây chứ không chỉ trong ô nhập,
  // để vẽ lại trang (poll Drive, đổi tab) không làm mất số vừa gõ.
  qa: { kind: 'chi', cat: {}, amt: '', note: '', date: '', wallet: '' },
  soTayEditIid: null,     // iid dòng chi tiết đang sửa (null = không sửa gì)
  // bản nháp mô phỏng — CHỈ nằm trong RAM, không bao giờ ghi vào data/Drive.
  // Thoát trang / đăng xuất / tải lại từ Drive là mất sạch (cố ý).
  mp: { data: null, napLuc: null, horizon: 24, formOpen: false, editIdx: -1, dieuChinh: [] },
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
// nhãn tiếng Việt của từng loại ref, dùng khi báo cho người dùng biết 1 ngày ở Sổ tay
// đang chứa giao dịch gì của khoản vay (sotay.js nhánh delDay).
var REF_LABEL = {
  nhanTienVay:  'Nhận tiền vay',
  thuHoiChoVay: 'Thu hồi cho vay',
  choVay:       'Cho vay',
  traNo:        'Trả nợ',
  tatToan:      'Tất toán'
};

function blankEntry(){ return { thu: {}, chi: {}, ghiChu: '', refs: [], items: [] }; }

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

/* ====================================================================
   TẦNG CHI TIẾT GIAO DỊCH (items)
   entry.items[] = { iid, kind:'thu'|'chi', catId, soTien, ghiChu }
   CHỈ chứa các giao dịch NHẬP TAY. Phần tiền do khoản vay sinh ra vẫn
   nằm ở entry.refs[] như cũ và CỐ Ý không đưa vào items.

   entry.thu / entry.chi VẪN LÀ NGUỒN SỰ THẬT cho mọi phép tính
   (thuTotal, chiTotal, balanceCache, actualCatInMonth, dòng tiền, biểu đồ,
   xuất Excel). items chỉ là tầng chi tiết song song, có ràng buộc:

     itemsSum(e, kind, cat) === num(e[kind][cat]) - entryRefSum(e, kind, cat)

   => Thêm/sửa/xóa 1 item BẮT BUỘC đi qua entryAddItem/entryUpdateItem/
      entryDeleteItem để 2 bên không lệch. repairEntryItems() là lưới an
      toàn: chạy mỗi lần load, quy mọi sai số về 1 dòng "(chưa chi tiết)".
   ==================================================================== */
var _iidSeq = 0;
function newIid(){ return 'i' + (_iidSeq++).toString(36) + '_' + Date.now().toString(36); }

function entryItems(entry){ return (entry && Array.isArray(entry.items)) ? entry.items : []; }

function itemsSum(entry, kind, catId){
  var s = 0;
  entryItems(entry).forEach(function(it){
    if (it.kind === kind && it.catId === catId) s += num(it.soTien);
  });
  return s;
}

// cộng delta vào entry[kind][catId], tự xóa key khi về 0 (ngưỡng giống journalRemoveRefs)
function _bucketAdd(entry, kind, catId, delta){
  entry[kind] = entry[kind] || {};
  var v = num(entry[kind][catId]) + num(delta);
  if (v <= 0.004) delete entry[kind][catId];
  else entry[kind][catId] = v;
}

function entryFindItem(entry, iid){
  var arr = entryItems(entry);
  for (var i=0;i<arr.length;i++){ if (arr[i].iid === iid) return arr[i]; }
  return null;
}

function entryAddItem(date, kind, catId, soTien, ghiChu, walletId){
  var v = num(soTien);
  if (!date || !catId || (kind !== 'thu' && kind !== 'chi') || v <= 0) return null;
  var e = state.data.journal[date] || blankEntry();
  e.thu = e.thu || {}; e.chi = e.chi || {}; e.refs = e.refs || [];
  e.items = Array.isArray(e.items) ? e.items : [];
  var it = { iid: newIid(), kind: kind, catId: catId, soTien: v, ghiChu: ghiChu || '',
             walletId: walletById(walletId) ? walletId : viMacDinhId() };
  e.items.push(it);
  _bucketAdd(e, kind, catId, v);
  state.data.journal[date] = e;
  invalidateBalanceCache();
  return it;
}

// sửa 1 dòng: đổi được cả số tiền, nội dung, loại thu/chi và danh mục.
// Trừ hết ở chỗ cũ rồi cộng vào chỗ mới -> không bao giờ cộng dồn sai.
function entryUpdateItem(date, iid, soTien, ghiChu, kindMoi, catIdMoi, walletIdMoi){
  var e = state.data.journal[date];
  if (!e) return false;
  var it = entryFindItem(e, iid);
  if (!it) return false;
  var v = num(soTien);
  if (v <= 0) return false;
  var kindM = (kindMoi === 'thu' || kindMoi === 'chi') ? kindMoi : it.kind;
  var catM  = catIdMoi || it.catId;
  _bucketAdd(e, it.kind, it.catId, -num(it.soTien));
  it.kind = kindM; it.catId = catM; it.soTien = v;
  if (ghiChu != null) it.ghiChu = ghiChu;
  if (walletIdMoi && walletById(walletIdMoi)) it.walletId = walletIdMoi;
  _bucketAdd(e, kindM, catM, v);
  invalidateBalanceCache();
  return true;
}

function entryDeleteItem(date, iid){
  var e = state.data.journal[date];
  if (!e || !Array.isArray(e.items)) return false;
  var idx = -1;
  for (var i=0;i<e.items.length;i++){ if (e.items[i].iid === iid){ idx = i; break; } }
  if (idx < 0) return false;
  var it = e.items[idx];
  _bucketAdd(e, it.kind, it.catId, -num(it.soTien));
  e.items.splice(idx, 1);
  if (entryIsEmpty(e)) delete state.data.journal[date];
  invalidateBalanceCache();
  return true;
}

// dữ liệu cũ chưa có items -> sinh 1 item cho mỗi danh mục có tiền nhập tay.
// Chi tiết thật của quá khứ không tách được (chưa từng được lưu), lấy ghi chú của ngày.
function migrateEntryItems(e){
  if (Array.isArray(e.items)) return false;
  e.items = [];
  ['thu','chi'].forEach(function(kind){
    var bucket = e[kind];
    if (!bucket || typeof bucket !== 'object') return;
    Object.keys(bucket).forEach(function(catId){
      var conLai = num(bucket[catId]) - entryRefSum(e, kind, catId);
      if (conLai > 0.004){
        e.items.push({ iid: newIid(), kind: kind, catId: catId, soTien: conLai, ghiChu: e.ghiChu || '' });
      }
    });
  });
  return true;
}

// lưới an toàn cho ràng buộc tổng. Thiếu -> thêm dòng "(chưa chi tiết)";
// thừa -> trừ dần từ dòng mới nhất. Không bao giờ sửa thu/chi (nguồn sự thật).
function repairEntryItems(e){
  e.items = Array.isArray(e.items) ? e.items : [];
  ['thu','chi'].forEach(function(kind){
    var bucket = e[kind];
    if (!bucket || typeof bucket !== 'object') return;
    var cats = {};
    Object.keys(bucket).forEach(function(c){ cats[c] = 1; });
    e.items.forEach(function(it){ if (it.kind === kind) cats[it.catId] = 1; });
    Object.keys(cats).forEach(function(catId){
      var lech = (num(bucket[catId]) - entryRefSum(e, kind, catId)) - itemsSum(e, kind, catId);
      if (lech > 0.004){
        e.items.push({ iid: newIid(), kind: kind, catId: catId, soTien: lech, ghiChu: '(chưa chi tiết)', walletId: viMacDinhId() });
      } else if (lech < -0.004){
        var con = -lech;
        for (var i = e.items.length - 1; i >= 0 && con > 0.004; i--){
          var it = e.items[i];
          if (it.kind !== kind || it.catId !== catId) continue;
          var tru = Math.min(con, num(it.soTien));
          it.soTien = num(it.soTien) - tru;
          con -= tru;
          if (num(it.soTien) <= 0.004) e.items.splice(i, 1);
        }
      }
    });
  });
}

// tên danh mục để hiển thị. Danh mục đã bị xóa khỏi settings mà journal còn tiền
// -> trả về chính id trong ngoặc để không biến mất khỏi bảng chi tiết.
// màu danh mục: màu người dùng chọn (c.mau) hoặc màu mặc định theo vị trí trong danh sách,
// để biểu đồ và chấm màu luôn nhất quán giữa các lần vẽ (trước đây màu theo thứ tự lọc, đổi mỗi lần)
var CAT_PALETTE = ['#4f46e5','#16a34a','#d97706','#dc2626','#0891b2','#9333ea','#ca8a04','#db2777'];
function catMau(kind, catId){
  var arr = (state.data.categories[kind] || []);
  for (var i = 0; i < arr.length; i++){
    if (arr[i].id === catId) return /^#[0-9a-f]{6}$/i.test(arr[i].mau || '') ? arr[i].mau : CAT_PALETTE[i % CAT_PALETTE.length];
  }
  return '#9ca3af';
}
function catDot(kind, catId){
  return '<span class="cat-dot" style="background:'+catMau(kind, catId)+'"></span>';
}

function catTen(kind, catId){
  var arr = (state.data.categories[kind] || []);
  for (var i=0;i<arr.length;i++){ if (arr[i].id === catId) return arr[i].ten; }
  return '(' + catId + ')';
}

// danh mục do tab Vay - Nợ sinh/dùng: xóa đi là tiền khoản vay mất chỗ hiển thị
var CAT_HE_THONG = { thu: { nhanTienVay: 1, thuHoiChoVay: 1 }, chi: { choVay: 1, traNo: 1 } };
// số NGÀY trong Sổ tay còn tiền ở danh mục này (>0 thì không được xóa danh mục)
function catDangCoTien(kind, catId){
  var n = 0;
  Object.keys(state.data.journal).forEach(function(d){
    var e = state.data.journal[d];
    if (num((e[kind] || {})[catId]) > 0 || entryItems(e).some(function(it){ return it.kind === kind && it.catId === catId; })) n++;
  });
  return n;
}

// escape khi nhồi text người dùng vào innerHTML
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
    // sinh items[] cho dữ liệu cũ. PHẢI chạy SAU bước scalar->object ở trên
    // vì migrateEntryItems đọc Object.keys(e.thu).
    migrateEntryItems(e);
    // tự chữa lệch invariant (file sửa tay, bản cũ ghi thiếu item...) -> hiện
    // thành dòng "(chưa chi tiết)" thay vì làm số liệu sai âm thầm.
    repairEntryItems(e);
  });
  // migrate khoản vay: daTraGoc (1 số tổng) -> traNo[] (từng kỳ, có số tiền thực trả).
  // Suy ra các kỳ đã trả ĐỦ từ daTraGoc cũ; các kỳ này không sinh giao dịch Sổ tay
  // (chúng đã xảy ra trước khi có ref) nên gắn cờ truocKhiDungApp để khỏi hiểu nhầm.
  d.vayNo.vayNoPhaiTra.forEach(function(loan){
    // khoản cũ chưa có "ngày trả hàng tháng" (field nhập tay riêng, tách biệt ngày vay)
    // -> tạm lấy ngày-trong-tháng của ngày vay làm mặc định, sửa lại sau nếu khác
    if (!loan.ngayTraHangThang){
      loan.ngayTraHangThang = loan.ngayVay ? parseInt(loan.ngayVay.slice(8,10),10) : 1;
    }
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
  // ví / nguồn tiền: dữ liệu cũ chỉ có 1 số dư đầu kỳ -> thành 1 ví mang đúng số đó (tổng không đổi)
  if (!Array.isArray(d.wallets) || !d.wallets.length){
    d.wallets = [{ id: 'w_chinh', ten: 'Tài khoản chính', soDuDauKy: num(d.settings.soDuDauKy) }];
  }
  d.wallets.forEach(function(w){
    w.soDuDauKy = num(w.soDuDauKy);
    if (!w.ten) w.ten = 'Ví';
    if (!w.id) w.id = 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  });
  d.chuyenVi = Array.isArray(d.chuyenVi) ? d.chuyenVi : [];
  // giao dịch định kỳ: chỉ là MẪU để nhắc, không phải tiền thật (xem khối GIAO DỊCH ĐỊNH KỲ)
  d.dinhKy = Array.isArray(d.dinhKy) ? d.dinhKy : [];
  ['thu', 'chi'].forEach(function(k){
    d.categories[k].forEach(function(c){ if (c.mau && !/^#[0-9a-f]{6}$/i.test(c.mau)) c.mau = ''; });
  });
  // mục tiêu tiết kiệm (xem khối MỤC TIÊU TIẾT KIỆM)
  d.mucTieu = Array.isArray(d.mucTieu) ? d.mucTieu : [];
  d.mucTieu.forEach(function(g){
    if (!g.id) g.id = 'mt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    g.soTien = num(g.soTien); g.daGom = num(g.daGom);
    if (!g.hanChot || !/^\d{4}-\d{2}$/.test(g.hanChot)) g.hanChot = '';
    if (g.walletId && !d.wallets.some(function(w){ return w.id === g.walletId; })) g.walletId = '';
  });
  d.dinhKy.forEach(function(k){
    if (!k.id) k.id = 'dk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    if (k.bat == null) k.bat = true;
    if (!Array.isArray(k.bo)) k.bo = [];
    k.ngay = Math.max(1, Math.min(31, Math.round(num(k.ngay)) || 1));
    k.soTien = num(k.soTien);
    k.kind = (k.kind === 'thu') ? 'thu' : 'chi';
  });
  // settings.soDuDauKy luôn = tổng số dư đầu kỳ của các ví: mọi hàm số dư cũ vẫn đọc số này
  d.settings.soDuDauKy = d.wallets.reduce(function(s, w){ return s + w.soDuDauKy; }, 0);
  // gắn walletId tường minh cho mọi dòng/khoản vay còn thiếu, để sau này đổi ví mặc định
  // (hoặc thêm ví) không âm thầm xếp lại lịch sử sang ví khác
  var viMd = d.wallets[0].id;
  var viCoThat = function(id){ return !!id && d.wallets.some(function(w){ return w.id === id; }); };
  Object.keys(d.journal).forEach(function(date){
    (d.journal[date].items || []).forEach(function(it){ if (!viCoThat(it.walletId)) it.walletId = viMd; });
  });
  d.vayNo.vayNoPhaiTra.concat(d.vayNo.choVay).forEach(function(l){ if (!viCoThat(l.walletId)) l.walletId = viMd; });
  invalidateBalanceCache();
  return d;
}

/* ====================================================================
   VÍ / NGUỒN TIỀN
   - wallets[] = [{id, ten, soDuDauKy}]: số dư đầu kỳ từng ví, cộng lại = settings.soDuDauKy.
   - Mỗi dòng nhập tay (items[]) mang walletId. Phần do khoản vay sinh ra (refs[])
     đi theo ví của khoản vay (loan.walletId) — đổi ví khoản vay là đổi cho cả lịch sử.
   - chuyenVi[] = [{id, ngay, tuVi, denVi, soTien, ghiChu}] nằm NGOÀI journal: chuyển
     tiền không phải thu cũng không phải chi, để vào journal sẽ làm phồng tổng thu/chi,
     biểu đồ và dự trù. Tổng số dư không đổi nên balanceAt() & mọi hàm tổng khỏi sửa.
   - Số dư theo ví chỉ tính từ ngayBatDau (cùng mốc khóa sổ với số dư tổng).
   ==================================================================== */
function viMacDinhId(d){ d = d || state.data; return (d && d.wallets && d.wallets[0]) ? d.wallets[0].id : undefined; }
function walletById(id, d){
  d = d || state.data;
  var a = (d && d.wallets) || [];
  for (var i = 0; i < a.length; i++){ if (a[i].id === id) return a[i]; }
  return null;
}
function viTen(id){ var w = walletById(id); return w ? w.ten : '(ví đã xóa)'; }
// ví của 1 dòng nhập tay; walletId thiếu/không còn tồn tại -> ví mặc định (ví đầu tiên)
function viCuaItem(it, d){
  var w = (it && it.walletId) ? walletById(it.walletId, d) : null;
  return w ? w.id : viMacDinhId(d);
}
// ví của 1 ref: ref.walletId > ví của khoản vay/cho vay > ví mặc định
function viCuaRef(r, d){
  d = d || state.data;
  var loan = null;
  if (r.loanId){
    var vn = (d.vayNo && d.vayNo.vayNoPhaiTra) || [], cv = (d.vayNo && d.vayNo.choVay) || [];
    loan = vn.find(function(l){ return l.id === r.loanId; }) || cv.find(function(l){ return l.id === r.loanId; }) || null;
  }
  var id = r.walletId || (loan && loan.walletId);
  var w = id ? walletById(id, d) : null;
  return w ? w.id : viMacDinhId(d);
}
// số dư 1 ví tính tới hết ngày dateStr
function soDuTheoVi(walletId, dateStr, d){
  d = d || state.data;
  var w = walletById(walletId, d);
  if (!w) return 0;
  var start = d.settings.ngayBatDau || '';
  var bal = num(w.soDuDauKy);
  Object.keys(d.journal).forEach(function(date){
    if ((start && date < start) || date > dateStr) return;
    var e = d.journal[date];
    entryItems(e).forEach(function(it){
      if (viCuaItem(it, d) !== walletId) return;
      bal += (it.kind === 'thu' ? 1 : -1) * num(it.soTien);
    });
    (e.refs || []).forEach(function(r){
      var m = REF_MAP[r.loai];
      if (!m || viCuaRef(r, d) !== walletId) return;
      bal += (m.kind === 'thu' ? 1 : -1) * num(r.soTien);
    });
  });
  (d.chuyenVi || []).forEach(function(t){
    if ((start && t.ngay < start) || t.ngay > dateStr) return;
    if (t.tuVi === walletId) bal -= num(t.soTien);
    if (t.denVi === walletId) bal += num(t.soTien);
  });
  return bal;
}
// số chỗ đang tham chiếu tới ví: dòng nhập tay + khoản vay/cho vay + lần chuyển tiền.
// > 0 thì không được xóa ví (xóa là làm mồ côi dữ liệu).
function viDangDung(id, d){
  d = d || state.data;
  var n = 0;
  Object.keys(d.journal).forEach(function(date){
    entryItems(d.journal[date]).forEach(function(it){ if (it.walletId === id) n++; });
  });
  ((d.vayNo && d.vayNo.vayNoPhaiTra) || []).concat((d.vayNo && d.vayNo.choVay) || []).forEach(function(l){ if (l.walletId === id) n++; });
  (d.chuyenVi || []).forEach(function(t){ if (t.tuVi === id || t.denVi === id) n++; });
  return n;
}
// <option> chọn ví, dùng chung cho form Sổ tay / dòng chi tiết / khoản vay
function viOptionsHtml(sel){
  return (state.data.wallets || []).map(function(w){
    return '<option value="'+esc(w.id)+'"'+(w.id === sel ? ' selected' : '')+'>'+esc(w.ten)+'</option>';
  }).join('');
}
function chuyenViThem(ngay, tuVi, denVi, soTien, ghiChu){
  var v = num(soTien);
  if (!ngay || v <= 0 || tuVi === denVi || !walletById(tuVi) || !walletById(denVi)) return null;
  var t = { id: 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            ngay: ngay, tuVi: tuVi, denVi: denVi, soTien: v, ghiChu: ghiChu || '' };
  state.data.chuyenVi = state.data.chuyenVi || [];
  state.data.chuyenVi.push(t);
  return t;
}
function chuyenViXoa(id){
  var a = state.data.chuyenVi || [];
  for (var i = 0; i < a.length; i++){
    if (a[i].id === id){ return a.splice(i, 1)[0]; }
  }
  return null;
}
// Khóa sổ: chốt số dư TỪNG ví tới hết dateStr làm số dư đầu kỳ mới. Tổng số dư thật
// (balanceAt) là nguồn sự thật: nếu cộng các ví lệch tổng thì dồn phần lệch vào ví đầu
// để tổng không đổi. PHẢI gọi TRƯỚC khi đổi settings.ngayBatDau (số dư tính theo mốc cũ).
function viChotSoDuDauKy(dateStr){
  var tong = balanceAt(dateStr);
  var moi = state.data.wallets.map(function(w){ return soDuTheoVi(w.id, dateStr); });
  var lech = tong - moi.reduce(function(s, x){ return s + x; }, 0);
  if (Math.abs(lech) > 0.5) moi[0] += lech;
  state.data.wallets.forEach(function(w, i){ w.soDuDauKy = moi[i]; });
  state.data.settings.soDuDauKy = tong;
}

/* ====================================================================
   GIAO DỊCH ĐỊNH KỲ — lương, tiền nhà, tiền net...
   dinhKy[] = [{id, ten, kind, catId, soTien, ngay(1-31), walletId, ghiChu, bat, bo[]}]
   App KHÔNG tự sinh tiền: "tiền thật chỉ nhập ở Sổ tay". Chỉ NHẮC khi tới ngày mà
   tháng đó chưa ghi, và điền hộ khi người dùng bấm "Ghi vào Sổ tay".
   Dòng được ghi mang dkId (+ dkMk) -> biết chắc khoản nào của tháng nào đã ghi, không
   đoán theo số tiền/danh mục. bo[] = các tháng đã chọn "Bỏ qua".
   Chỉ xét THÁNG HIỆN TẠI: khoản của tháng cũ mà quên thì không dồn nhắc mãi.
   Hàm ngayTraCuaKy (vayno.js) tự co ngày 31 về cuối tháng ngắn.
   ==================================================================== */
function dinhKyDaGhi(dk, mk){
  var da = false;
  Object.keys(state.data.journal).forEach(function(date){
    if (da || monthKey(date) !== mk) return;
    if (entryItems(state.data.journal[date]).some(function(it){ return it.dkId === dk.id; })) da = true;
  });
  return da;
}
// các khoản đã tới ngày trong tháng của homNay mà chưa ghi / chưa bỏ qua
function dinhKyDenHan(homNay){
  var mk = monthKey(homNay), out = [];
  (state.data.dinhKy || []).forEach(function(dk){
    if (!dk.bat || num(dk.soTien) <= 0) return;
    var han = ngayTraCuaKy(mk, dk.ngay);
    if (homNay < han || (dk.bo || []).indexOf(mk) >= 0 || dinhKyDaGhi(dk, mk)) return;
    out.push({ dk: dk, mk: mk, han: han });
  });
  out.sort(function(a, b){ return a.han < b.han ? -1 : (a.han > b.han ? 1 : 0); });
  return out;
}
// ghi 1 khoản định kỳ vào Sổ tay. Ngày ghi = ngày đến hạn; nếu ngày đó đã nằm trước mốc
// khóa sổ (không còn tính vào số dư) thì ghi vào hôm nay để tiền không biến mất khỏi số dư.
// Trả về {date, iid, note} để hoàn tác được; null nếu không ghi được.
function dinhKyGhi(dk, mk, homNay){
  var han = ngayTraCuaKy(mk, dk.ngay);
  var start = state.data.settings.ngayBatDau || '';
  var date = (!start || han >= start) ? han : homNay;
  var it = entryAddItem(date, dk.kind, dk.catId, dk.soTien, dk.ghiChu || dk.ten, dk.walletId);
  if (!it) return null;
  it.dkId = dk.id; it.dkMk = mk;
  var e = state.data.journal[date];
  var note = dk.ten + ' ' + fmt(Math.round(dk.soTien));
  e.ghiChu = e.ghiChu ? e.ghiChu + '; ' + note : note;
  return { date: date, iid: it.iid, note: note };
}
function dinhKyHoanTac(r){
  var e = state.data.journal[r.date];
  if (!e) return;
  journalRemoveNote(e, r.note);
  entryDeleteItem(r.date, r.iid);   // xóa luôn ngày nếu rỗng
}

/* ====================================================================
   MỤC TIÊU TIẾT KIỆM
   mucTieu[] = [{id, ten, soTien (đích), hanChot ('YYYY-MM' hoặc ''), walletId ('' = gom tay), daGom}]
   - Gắn ví: số đã gom = số dư HIỆN TẠI của ví đó (ví chuyên để dành, vd "Quỹ mua xe").
     Cộng tiền vào ví bằng giao dịch/chuyển tiền bình thường là mục tiêu tự tăng, không nhập 2 lần.
   - Không gắn ví: số đã gom do người dùng tự cộng tay (daGom).
   Thuần hiển thị: mục tiêu KHÔNG phải tiền, không đổi số dư/dự trù/biểu đồ.
   ==================================================================== */
function monthDiff(mk1, mk2){
  var a = mk1.split('-'), b = mk2.split('-');
  return (parseInt(b[0], 10) - parseInt(a[0], 10)) * 12 + (parseInt(b[1], 10) - parseInt(a[1], 10));
}
function mucTieuTienDo(g, homNay){
  var theoVi = !!(g.walletId && walletById(g.walletId));
  var da = Math.max(0, theoVi ? soDuTheoVi(g.walletId, homNay) : num(g.daGom));
  var dich = num(g.soTien);
  var conThieu = Math.max(0, dich - da);
  var xong = dich > 0 && da >= dich - 0.5;
  var r = { da: da, dich: dich, conThieu: conThieu, pct: dich > 0 ? da / dich : 0, xong: xong,
            theoVi: theoVi, quaHan: false, soThangCon: null, canMoiThang: null };
  if (g.hanChot && !xong){
    var diff = monthDiff(monthKey(homNay), g.hanChot);     // 0 = hạn chót ngay trong tháng này
    if (diff < 0) r.quaHan = true;
    else { r.soThangCon = diff + 1; r.canMoiThang = conThieu / (diff + 1); }
  }
  return r;
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
// VND không có phần lẻ: làm tròn ở đây để số tổng (cộng từ nhiều khoản chia lẻ như lãi) không hiện ",303"
function fmt(n){ return Math.round(Number(n)||0).toLocaleString('vi-VN') + ' ₫'; }
function num(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }
// giống num() nhưng chặn số âm -> về 0 (dùng cho các ô nhập tiền)
function numNonNeg(v){ var n = num(v); return n < 0 ? 0 : n; }
function pad2(n){ return n<10 ? '0'+n : ''+n; }
function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function monthKey(dateStr){ return dateStr.slice(0,7); }
var MONTH_NAMES = ['Th1','Th2','Th3','Th4','Th5','Th6','Th7','Th8','Th9','Th10','Th11','Th12'];
function monthLabel(mk){ var p=mk.split('-'); return 'Tháng ' + parseInt(p[1],10) + '/' + p[0]; }
// "YYYY-MM-DD" -> "DD/MM/YYYY", dùng hiển thị ngày trả/ngày thu cụ thể
function ngayVN(d){ return d ? d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4) : ''; }
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
  return !!(state.vnFormKind || state.editingDate || state.soTayEditIid
            || state.viFormOpen || state.dkForm || state.mtForm || state.imp || state.fullFormOpen
            || (state.mp && state.mp.formOpen));
}

/* ====================================================================
   withData — chạy tạm 1 bộ dữ liệu KHÁC (bản nháp mô phỏng) rồi trả về
   nguyên trạng. Mọi hàm tính toán (thuTotal, balanceAt, duTru*, tongThu...)
   đều đọc thẳng state.data, nên đây là cách duy nhất để tính trên dữ liệu
   nháp mà KHÔNG phải sửa chữ ký của ~15 hàm.

   CỰC KỲ QUAN TRỌNG:
   - try/finally bắt buộc: nếu fn() throw mà không restore, app sẽ cầm dữ liệu
     nháp và ghi thẳng nó lên Drive -> mất data thật.
   - fn() KHÔNG được async. await sẽ nhả stack ra ngoài khối finally,
     lúc đó state.data đã bị trả lại -> tính sai, hoặc tệ hơn là timer khác
     chen vào đúng lúc đang swap.
   - state.dirty phải được giữ nguyên: tính toán trên nháp không được làm
     app tưởng data thật đã đổi rồi đẩy lên Drive.
   ==================================================================== */
function withData(d, fn){
  var goc = state.data;
  var keoDirty = state.dirty;
  state.data = d;
  invalidateBalanceCache();
  try { return fn(); }
  finally {
    state.data = goc;
    state.dirty = keoDirty;
    invalidateBalanceCache();
  }
}

