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
  settings: { soDuDauKy: 0, ngayBatDau: todayStr() },   // tài khoản mới: số dư đầu kỳ 0, bắt đầu từ hôm nay
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
  dtThang: null,          // tháng đang xem ở tab Dòng tiền trên điện thoại (mỗi lần 1 tháng)
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
  qa: { kind: 'chi', cat: {}, amt: '', note: '', date: '', wallet: '', open: false },   // open: bảng ghi khoản đang mở
  soTayEditIid: null,     // iid dòng chi tiết đang sửa (null = không sửa gì)
  soTayGioiHan: {},       // số ngày đang hiện ở "Chi tiết theo ngày", theo tháng (thiếu = mặc định, xem SO_NGAY_HIEN ở sotay.js)
  soTayOpenIid: null,     // iid khoản đang mở nút Sửa / Xóa trong danh sách ngày
  soTayLocMo: false,      // khung tìm kiếm & lọc ở "Chi tiết theo ngày" đang mở
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

// bỏ đúng 1 mẩu ghi chú do app tự sinh ra khỏi chuỗi "a; b; c".
// Chỉ bỏ MỘT mẩu (mẩu đầu khớp): 2 khoản giống hệt nhau trong ngày (cùng nội dung, cùng số tiền) sinh ra 2 mẩu
// giống nhau, xóa 1 khoản không được làm mất cả 2 mẩu.
function journalRemoveNote(entry, note){
  if (!note || !entry.ghiChu) return;
  var parts = entry.ghiChu.split('; ');
  var i = parts.indexOf(note);
  if (i < 0) return;
  parts.splice(i, 1);
  entry.ghiChu = parts.join('; ');
}
// mẩu ghi chú NGÀY mà 1 dòng chi tiết đã sinh ra. Dòng mới lưu sẵn trong it.gc; dòng cũ chưa có gc thì đoán theo
// cách ghi phổ biến "<nội dung> <số tiền>" (ghi nhanh, nhập file, định kỳ, form đầy đủ khi chỉ có 1 khoản).
function itemGhiChuNgay(it){
  return it.gc || (it.ghiChu ? it.ghiChu + ' ' + fmt(Math.round(num(it.soTien))) : '');
}
// xóa 1 dòng chi tiết thì mẩu ghi chú của nó trong cột Nội dung cũng phải đi theo (trước đây tiền trừ mà chữ vẫn còn).
// Gọi TRƯỚC khi bỏ it khỏi e.items. Mẩu dùng chung bởi nhiều dòng (1 lần lưu form đầy đủ nhiều danh mục) chỉ bị gỡ
// khi không còn dòng nào khác dùng nó: so số mẩu đang có với số dòng còn lại cùng mẩu.
function entryGoGhiChuCuaItem(e, it){
  var seg = itemGhiChuNgay(it);
  if (!seg || !e.ghiChu) return;
  var soMau = e.ghiChu.split('; ').filter(function(s){ return s === seg; }).length;
  if (!soMau) return;
  var conDung = entryItems(e).filter(function(x){ return x !== it && itemGhiChuNgay(x) === seg; }).length;
  if (soMau > conDung) journalRemoveNote(e, seg);
}

function entryIsEmpty(entry){
  var hasThu = Object.keys(entry.thu || {}).some(function(k){ return num(entry.thu[k]) !== 0; });
  var hasChi = Object.keys(entry.chi || {}).some(function(k){ return num(entry.chi[k]) !== 0; });
  return !hasThu && !hasChi && !(entry.ghiChu || '').trim() && !(entry.refs || []).length;
}

// ghi 1 giao dịch do khoản vay sinh ra: gắn ref (tiền vào danh mục do entryTinhLai) + thêm ghi chú
function journalAddRef(date, loanId, loai, soTien, note, extra){
  var m = REF_MAP[loai];
  if (!m || num(soTien) <= 0) return;
  var e = state.data.journal[date] || blankEntry();
  e.refs = e.refs || [];
  if (note) e.ghiChu = e.ghiChu ? (e.ghiChu + '; ' + note) : note;
  var ref = { loanId: loanId, loai: loai, soTien: num(soTien), note: note || '' };
  if (extra) Object.keys(extra).forEach(function(k){ ref[k] = extra[k]; });
  e.refs.push(ref);
  entryTinhLai(e);
  state.data.journal[date] = e;
}

// GẮN ref vào số tiền người dùng vừa nhập ở form Sổ tay (không thêm ghi chú) — dùng cho form có chọn
// khoản vay/cho vay. Số tiền đó thuộc tầng refs nên nơi gọi KHÔNG được tạo dòng items cho nó (đếm 2 lần).
function journalTagRef(date, loanId, loai, soTien, extra){
  var m = REF_MAP[loai];
  if (!m || num(soTien) <= 0) return;
  var e = state.data.journal[date];
  if (!e) return;
  e.refs = e.refs || [];
  var ref = { loanId: loanId, loai: loai, soTien: num(soTien), note: '' };
  if (extra) Object.keys(extra).forEach(function(k){ ref[k] = extra[k]; });
  e.refs.push(ref);
  entryTinhLai(e);
}

// xóa các ref khớp điều kiện (tiền tương ứng tự mất khỏi thu/chi qua entryTinhLai).
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
      journalRemoveNote(e, r.note);
      removed.push({ date: date, loai: r.loai, soTien: num(r.soTien), ky: r.ky });
    });
    e.refs = keep;
    entryTinhLai(e);
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
   TẦNG CHI TIẾT GIAO DỊCH (items) — NGUỒN SỰ THẬT CỦA TIỀN TRONG NGÀY
   entry.items[] = { iid, kind:'thu'|'chi', catId, soTien, ghiChu }
   CHỈ chứa các giao dịch NHẬP TAY. Phần tiền do khoản vay sinh ra nằm ở
   entry.refs[] và CỐ Ý không đưa vào items.

   Tiền của 1 ngày chỉ có 2 nguồn gốc: items (nhập tay) + refs (khoản vay).
   entry.thu / entry.chi là số TỔNG THEO DANH MỤC được TÍNH LẠI từ 2 nguồn đó bằng
   entryTinhLai(): cách đọc nhanh cho mọi phép tính (thuTotal, chiTotal, balanceCache,
   dòng tiền, biểu đồ, xuất Excel) và để các bản app cũ (chỉ đọc thu/chi) vẫn đọc được file.

     e[kind][cat] === itemsSum(e, kind, cat) + entryRefSum(e, kind, cat)

   => KHÔNG ghi thẳng vào e.thu / e.chi. Mọi thay đổi tiền đi qua entryAddItem /
      entryUpdateItem / entryDeleteItem (items) hoặc journalAddRef / journalTagRef /
      journalRemoveRefs (refs); các hàm đó tự gọi entryTinhLai. Nhờ vậy hết cảnh "2 nơi lệch nhau".
   Lúc NẠP file: migrateEntryItems + repairEntryItems coi số tổng đã lưu là đúng (không đổi số dư
   của người dùng) và đưa phần lệch vào dòng "(chưa chi tiết)", rồi entryTinhLai chốt lại.
   journalKiemTra() liệt kê ngày nào thu/chi lệch nguồn gốc (dùng trong test).
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

// Tính lại e.thu / e.chi từ nguồn gốc (items + refs). Danh mục về 0 thì bỏ key.
// Là NƠI DUY NHẤT sinh ra số trong e.thu / e.chi sau khi đã nạp (xem khối chú thích phía trên).
function entryTinhLai(e){
  var out = { thu: {}, chi: {} };
  function cong(kind, cat, v){ if (v) out[kind][cat] = (out[kind][cat] || 0) + v; }
  entryItems(e).forEach(function(it){
    if (it.kind === 'thu' || it.kind === 'chi') cong(it.kind, it.catId, num(it.soTien));
  });
  (e.refs || []).forEach(function(r){
    var m = REF_MAP[r.loai];
    if (m) cong(m.kind, m.cat, num(r.soTien));
  });
  ['thu', 'chi'].forEach(function(k){
    Object.keys(out[k]).forEach(function(c){ if (out[k][c] <= 0.004) delete out[k][c]; });
  });
  e.thu = out.thu; e.chi = out.chi;
  return e;
}
var _soNgayLechLucNap = 0;   // số ngày file lệch số lúc nạp lần gần nhất (chỉ để chẩn đoán / test)
// các chỗ thu/chi của ngày lệch so với nguồn gốc (items + refs): [{ date, kind, catId, daLuu, tinhLai }]
function journalKiemTra(journal){
  var ds = [];
  var j = journal || state.data.journal;
  Object.keys(j).forEach(function(date){
    var e = j[date], t = entryTinhLai({ items: e.items, refs: e.refs });
    ['thu', 'chi'].forEach(function(kind){
      var cats = {};
      Object.keys(e[kind] || {}).forEach(function(c){ cats[c] = 1; });
      Object.keys(t[kind]).forEach(function(c){ cats[c] = 1; });
      Object.keys(cats).forEach(function(c){
        var a = num((e[kind] || {})[c]), b = num(t[kind][c]);
        if (Math.abs(a - b) > 0.01) ds.push({ date: date, kind: kind, catId: c, daLuu: a, tinhLai: b });
      });
    });
  });
  return ds;
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
  entryTinhLai(e);
  state.data.journal[date] = e;
  invalidateBalanceCache();
  return it;
}

// sửa 1 dòng: đổi được cả số tiền, nội dung, loại thu/chi và danh mục.
// Trừ hết ở chỗ cũ rồi cộng vào chỗ mới -> không bao giờ cộng dồn sai.
// sửa 1 dòng chi tiết (đổi số tiền / nội dung) thì mẩu ghi chú của nó trong cột Nội dung của ngày cũng đổi theo.
// segCu = mẩu cũ (tính TRƯỚC khi sửa dòng), segMoi = mẩu mới ('' nếu dòng không còn nội dung).
//  - mẩu của riêng dòng này: thay tại chỗ (giữ nguyên thứ tự), hoặc bỏ nếu không còn nội dung
//  - mẩu dùng chung với dòng khác (1 lần lưu form đầy đủ nhiều danh mục): để nguyên cho các dòng kia, dòng này có mẩu riêng
//  - không tìm thấy mẩu cũ (người dùng đã tự sửa chữ ở ngày): KHÔNG đụng vào chữ đó
//  - dòng trước đó chưa có nội dung mà giờ có: thêm mẩu mới vào cuối
function entryDoiGhiChuCuaItem(e, it, segCu, segMoi){
  if (segMoi === segCu) return;
  var mau = e.ghiChu ? e.ghiChu.split('; ') : [];
  var viTri = segCu ? mau.indexOf(segCu) : -1;
  if (segCu && viTri >= 0){
    var soMau = mau.filter(function(s){ return s === segCu; }).length;
    var conDung = entryItems(e).filter(function(x){ return x !== it && itemGhiChuNgay(x) === segCu; }).length;
    if (soMau > conDung){
      if (segMoi) mau[viTri] = segMoi; else mau.splice(viTri, 1);
      e.ghiChu = mau.join('; ');
    } else if (segMoi){
      e.ghiChu = e.ghiChu ? e.ghiChu + '; ' + segMoi : segMoi;
    }
  } else if (!segCu && segMoi){
    e.ghiChu = e.ghiChu ? e.ghiChu + '; ' + segMoi : segMoi;
  }
  if (segMoi) it.gc = segMoi; else delete it.gc;
}

function entryUpdateItem(date, iid, soTien, ghiChu, kindMoi, catIdMoi, walletIdMoi){
  var e = state.data.journal[date];
  if (!e) return false;
  var it = entryFindItem(e, iid);
  if (!it) return false;
  var v = num(soTien);
  if (v <= 0) return false;
  var kindM = (kindMoi === 'thu' || kindMoi === 'chi') ? kindMoi : it.kind;
  var catM  = catIdMoi || it.catId;
  var segCu = itemGhiChuNgay(it);
  it.kind = kindM; it.catId = catM; it.soTien = v;
  if (ghiChu != null) it.ghiChu = ghiChu;
  entryDoiGhiChuCuaItem(e, it, segCu, it.ghiChu ? it.ghiChu + ' ' + fmt(Math.round(v)) : '');
  if (walletIdMoi && walletById(walletIdMoi)) it.walletId = walletIdMoi;
  entryTinhLai(e);
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
  entryGoGhiChuCuaItem(e, it);
  e.items.splice(idx, 1);
  entryTinhLai(e);
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

// chữa lệch giữa số tổng đã LƯU trong file và items + refs, CHỈ dùng lúc nạp file / sau khi form đầy đủ
// sửa tổng theo danh mục. Thiếu -> thêm dòng "(chưa chi tiết)"; thừa -> trừ dần từ dòng mới nhất.
// Coi số tổng đã lưu là đúng để không đổi số dư của người dùng; xong thì gọi entryTinhLai để chốt.
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
var CAT_PALETTE = ['#2563eb','#16a34a','#d97706','#9333ea','#0891b2','#db2777','#ca8a04','#64748b'];
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

// đoạn giải thích dài gấp lại sau nút ⓘ: nhìn số liệu trước, đọc luật sau (CSS .giai-thich).
// noiDung là HTML do code tự dựng, KHÔNG đưa text người dùng vào đây.
function ghiChuGon(noiDung, nhan){
  return '<details class="giai-thich"><summary>ⓘ '+(nhan || 'Giải thích')+'</summary><div>'+noiDung+'</div></details>';
}

/* ====================================================================
   BỘ ICON — nét mảnh 1.8px, tô bằng currentColor (đổi màu theo chữ, sáng/tối đều đúng).
   Thay cho emoji: emoji mỗi máy một kiểu, màu chói và là dấu hiệu "app làm bằng máy" dễ thấy nhất.
   Dùng: icon('trash') -> chuỗi <svg>. Icon thuần trang trí (aria-hidden): nút bấm vẫn phải có title/aria-label/chữ.
   ==================================================================== */
var ICON_PATHS = {
  'book': "<path d=\"M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14H6.5A1.5 1.5 0 0 0 5 18.5z\"/><path d=\"M5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3\"/><path d=\"M9 7h6\"/>",
  'trend': "<path d=\"M3 17l5.5-6 4 4L21 6\"/><path d=\"M15 6h6v6\"/>",
  'scale': "<path d=\"M12 4v16\"/><path d=\"M6.5 20h11\"/><path d=\"M5 7h14\"/><path d=\"M5 7l-2.5 6a3 3 0 0 0 5 0z\"/><path d=\"M19 7l-2.5 6a3 3 0 0 0 5 0z\"/>",
  'sliders': "<path d=\"M4 7h9\"/><path d=\"M17 7h3\"/><circle cx=\"15\" cy=\"7\" r=\"2\"/><path d=\"M4 17h3\"/><path d=\"M11 17h9\"/><circle cx=\"9\" cy=\"17\" r=\"2\"/>",
  'backspace': "<path d=\"M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z\"/><path d=\"M13 9.5l5 5\"/><path d=\"M18 9.5l-5 5\"/>",
  'fingerprint': "<path d=\"M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4\"/><path d=\"M14 13.12c0 2.38 0 6.38-1 8.88\"/><path d=\"M17.29 21.02c.12-.6.43-2.3.5-3.02\"/><path d=\"M2 12a10 10 0 0 1 18-6\"/><path d=\"M2 16h.01\"/><path d=\"M21.8 16c.2-2 .131-5.354 0-6\"/><path d=\"M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2\"/><path d=\"M8.65 22c.21-.66.45-1.32.57-2\"/><path d=\"M9 6.8a6 6 0 0 1 9 5.2v2\"/>",
  'pie': "<path d=\"M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z\"/><path d=\"M15 3.9A8.5 8.5 0 0 1 20.1 9H15z\"/>",
  'list': "<path d=\"M9 6h11\"/><path d=\"M9 12h11\"/><path d=\"M9 18h11\"/><path d=\"M4.5 6h.01\"/><path d=\"M4.5 12h.01\"/><path d=\"M4.5 18h.01\"/>",
  'refresh': "<path d=\"M20 12a8 8 0 1 1-2.3-5.7\"/><path d=\"M20 4v5h-5\"/>",
  'sun': "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4\"/>",
  'moon': "<path d=\"M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z\"/>",
  'contrast': "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 3.5v17a8.5 8.5 0 0 0 0-17z\" fill=\"currentColor\"/>",
  'pencil': "<path d=\"M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z\"/><path d=\"M14.5 6.5l3 3\"/>",
  'trash': "<path d=\"M4 7h16\"/><path d=\"M9 7V4.5h6V7\"/><path d=\"M6.5 7l1 13h9l1-13\"/><path d=\"M10 11v5M14 11v5\"/>",
  'check': "<path d=\"M5 12.5l4.5 4.5L19 7\"/>",
  'undo': "<path d=\"M9 14L4 9l5-5\"/><path d=\"M4 9h9a6 6 0 0 1 0 12h-2\"/>",
  'alert': "<path d=\"M12 4l9.5 16.5h-19z\"/><path d=\"M12 10v4.5\"/><path d=\"M12 17.5h.01\"/>",
  'clock': "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>",
  'repeat': "<path d=\"M17 3l3.5 3.5L17 10\"/><path d=\"M3.5 11V9.5a3 3 0 0 1 3-3H20\"/><path d=\"M7 21l-3.5-3.5L7 14\"/><path d=\"M20.5 13v1.5a3 3 0 0 1-3 3H4\"/>",
  'plus': "<path d=\"M12 5v14M5 12h14\"/>",
  'x': "<path d=\"M6 6l12 12M18 6L6 18\"/>",
  'up-right': "<path d=\"M7 17L17 7\"/><path d=\"M8 7h9v9\"/>",
  'lock': "<rect x=\"5\" y=\"11\" width=\"14\" height=\"9\" rx=\"1.5\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/>",
  'search': "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M16 16l4.5 4.5\"/>",
  'calendar': "<rect x=\"4\" y=\"5.5\" width=\"16\" height=\"14.5\" rx=\"2\"/><path d=\"M4 10h16\"/><path d=\"M8.5 3.5v4M15.5 3.5v4\"/>",
  'download': "<path d=\"M12 4v11\"/><path d=\"M7.5 11L12 15.5 16.5 11\"/><path d=\"M5 20h14\"/>",
  'upload': "<path d=\"M12 15V4\"/><path d=\"M7.5 8L12 3.5 16.5 8\"/><path d=\"M5 20h14\"/>",
  'transfer': "<path d=\"M4 8h14\"/><path d=\"M14.5 4.5L18 8l-3.5 3.5\"/><path d=\"M20 16H6\"/><path d=\"M9.5 12.5L6 16l3.5 3.5\"/>",
  'arrow-up': "<path d=\"M12 19V5\"/><path d=\"M6 11l6-6 6 6\"/>",
  'arrow-down': "<path d=\"M12 5v14\"/><path d=\"M18 13l-6 6-6-6\"/>"
};
function icon(ten, lop){
  var d = ICON_PATHS[ten];
  if (!d) return '';
  return '<svg class="ic'+(lop ? ' '+lop : '')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+d+'</svg>';
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
  var soNgayLech = 0;
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
    // file ĐÃ có items mà số tổng không khớp items + refs = bản app cũ ghi lệch hoặc file sửa tay (khác với file cũ
    // chưa có items: lệch hiển nhiên và được migrate bình thường) -> đếm để báo, không chữa âm thầm.
    var daCoItems = Array.isArray(e.items);
    if (daCoItems && journalKiemTra((function(o){ o[date] = e; return o; })({})).length) soNgayLech++;
    migrateEntryItems(e);
    // tự chữa lệch invariant (file sửa tay, bản cũ ghi thiếu item...) -> hiện
    // thành dòng "(chưa chi tiết)" thay vì làm số liệu sai âm thầm.
    repairEntryItems(e);
    // chốt: thu/chi = items + refs (sau repair thì khớp số đã lưu, không đổi số dư)
    entryTinhLai(e);
  });
  _soNgayLechLucNap = soNgayLech;
  if (soNgayLech) console.warn('[chitieu] ' + soNgayLech + ' ngày trong file có số tổng thu/chi không khớp các dòng chi tiết + khoản vay; đã chữa theo số tổng đã lưu (phần chênh nằm ở dòng "(chưa chi tiết)").');
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
    w.deDanh = !!w.deDanh;
    if (!w.ten) w.ten = 'Ví';
    if (!w.id) w.id = 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  });
  // ví mặc định đã tích chọn mà ví đó không còn (khôi phục bản sao lưu cũ, xóa ví...) -> bỏ, quay về ví đầu tiên
  if (d.settings.viMacDinh && !d.wallets.some(function(w){ return w.id === d.settings.viMacDinh; })) d.settings.viMacDinh = '';
  d.chuyenVi = Array.isArray(d.chuyenVi) ? d.chuyenVi : [];
  // giao dịch định kỳ: chỉ là MẪU để nhắc, không phải tiền thật (xem khối GIAO DỊCH ĐỊNH KỲ)
  d.dinhKy = Array.isArray(d.dinhKy) ? d.dinhKy : [];
  // quy tắc tự phân loại (từ khóa trong ghi chú -> danh mục) và cách ghép cột đã lưu cho từng kiểu file sao kê (nhap.js)
  d.settings.mauNhap = (d.settings.mauNhap && typeof d.settings.mauNhap === 'object') ? d.settings.mauNhap : {};
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
// Ví do người dùng TÍCH CHỌN làm mặc định ở tab Danh mục (settings.viMacDinh); '' nếu chưa chọn / ví đó không còn.
function viMacDinhDaChon(d){
  d = d || state.data;
  var id = d && d.settings && d.settings.viMacDinh;
  return (id && walletById(id, d)) ? id : '';
}
// Ví mặc định cho mọi thứ MỚI (dòng nhập, khoản vay, khoản định kỳ...): ví đã tích chọn, chưa chọn thì ví đầu tiên.
// Dòng/khoản ĐÃ có walletId thì không đổi theo — đổi mặc định không xếp lại lịch sử.
function viMacDinhId(d){
  d = d || state.data;
  var dm = viMacDinhDaChon(d);
  if (dm) return dm;
  return (d && d.wallets && d.wallets[0]) ? d.wallets[0].id : undefined;
}
// Ví điền sẵn ở các form nhập: có ví mặc định đã tích chọn thì LUÔN là ví đó (mỗi lần nhập mới quay về mặc định);
// chưa tích chọn thì giữ cách cũ: ví vừa chọn gần nhất.
function viDienSan(){
  var dm = viMacDinhDaChon();
  if (dm) return dm;
  return walletById(state.viChon) ? state.viChon : viMacDinhId();
}
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
// Cảnh báo khi lấy tiền ra khỏi ví để dành, hoặc ví sắp ÂM: trả câu cảnh báo nếu một thay đổi (delta: âm = ví mất tiền) làm ví đang >= 0 thành < 0.
// Ví ĐÃ âm từ trước (thẻ tín dụng, nợ) thì không nhắc lại mỗi lần. Chỉ cảnh báo, không chặn.
function viCanhBaoAm(walletId, delta, d){
  d = d || state.data;
  var w = walletById(walletId, d) || walletById(viMacDinhId(d), d);
  if (!w || !(delta < 0)) return '';
  // ví để dành: lấy tiền ra là hỏi lại, kể cả khi ví vẫn đủ tiền
  if (w.deDanh){
    var mt = (d.mucTieu || []).filter(function(g){ return g.walletId === w.id; }).map(function(g){ return g.ten; });
    return 'Ví "' + w.ten + '" là ví để dành' + (mt.length ? ' (mục tiêu: ' + mt.join(', ') + ')' : '') + '. Khoản này lấy ' + fmt(Math.round(-delta)) + ' ra khỏi ví đó.';
  }
  var truoc = soDuTheoVi(w.id, '9999-12-31', d), sau = truoc + delta;
  if (truoc < 0 || sau >= 0) return '';
  return 'Ví "' + w.ten + '" hiện còn ' + fmt(Math.round(truoc)) + ', sau khoản này sẽ âm ' + fmt(Math.round(-sau)) + '.';
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
  (d.mucTieu || []).forEach(function(g){ if (g.walletId === id) n++; });   // mục tiêu đang gắn ví này: xóa ví là làm mục tiêu tụt về 0
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
// tổng các khoản định kỳ ĐANG BẬT của tháng mk mà chưa ghi Sổ tay và chưa bấm "Bỏ qua" — kể cả khoản CHƯA tới ngày
// (dùng cho dự báo cuối tháng). kind/catId bỏ trống = tính tất cả.
function dinhKyChuaGhiThang(mk, kind, catId){
  var s = 0;
  (state.data.dinhKy || []).forEach(function(dk){
    if (!dk.bat || num(dk.soTien) <= 0) return;
    if (kind && dk.kind !== kind) return;
    if (catId && dk.catId !== catId) return;
    if ((dk.bo || []).indexOf(mk) >= 0 || dinhKyDaGhi(dk, mk)) return;
    s += num(dk.soTien);
  });
  return s;
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
  it.gc = note;       // xóa dòng này thì mẩu ghi chú ngày cũng đi theo (entryGoGhiChuCuaItem)
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

