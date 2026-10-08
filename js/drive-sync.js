"use strict";
/* ====================================================================
   drive-sync.js — đăng nhập Google, đọc/ghi file dữ liệu trên Drive,
   và bản nháp cục bộ (localStorage) để tránh mất dữ liệu khi mất mạng.
   Cần state.js load trước.
   ==================================================================== */

var CLIENT_ID = '661285810864-b7pkfvt13fsnvu87g56e5f4qmoc74v22.apps.googleusercontent.com';
var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
var DRIVE_FILE_TITLE = 'chitieu-canhan-data.json';
var API_BASE = 'https://www.googleapis.com/drive/v3';
var UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
var LOCAL_DRAFT_KEY = 'chitieu_draft_v1';
var SYNCED_KEY = 'chitieu_synced_v1';   // bản dữ liệu ĐÃ khớp Drive gần nhất, để mở ngoại tuyến

var tokenClient = null;
var accessToken = null;
var _textDriveLanTai = null;   // nội dung thô của file Drive ở lần tải gần nhất (dùng làm bản sao lưu ngày)

/* ====================================================================
   GIỮ PHIÊN ĐĂNG NHẬP: mở app từ biểu tượng màn hình chính mà lần nào cũng phải bấm đăng nhập
   Google thì không khác gì mở web. Token Google chỉ sống ~1 giờ (không có refresh token vì app
   không có server), nên lưu token + giờ hết hạn vào localStorage: mở lại trong vòng ~1 giờ thì vào
   thẳng, quá hạn mới hiện màn đăng nhập.
   Đánh đổi bảo mật: token này chỉ có quyền drive.file (chỉ file do app tạo), sống ≤ 1 giờ, và cùng
   chỗ với bản dữ liệu lưu cho chế độ ngoại tuyến (nhạy cảm hơn nhiều). Đăng xuất là xóa cả hai.
   ==================================================================== */
var TOKEN_KEY = 'chitieu_tok_v1';
var DA_DN_KEY = 'chitieu_da_dn_v1';   // từng đăng nhập thành công trên máy này -> mở app thử xin token lại âm thầm
var TOKEN_DE_HAN_S = 120;       // coi như hết hạn sớm 2 phút để không dính token chết giữa chừng
function saveToken(resp){
  try{
    var giay = parseInt(resp.expires_in, 10) || 3600;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ t: resp.access_token, exp: Date.now() + (giay - TOKEN_DE_HAN_S) * 1000 }));
  }catch(e){}
}
function readSavedToken(){
  try{
    var o = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    return (o && o.t && o.exp > Date.now()) ? o.t : null;
  }catch(e){ return null; }
}
function clearSavedToken(){ try{ localStorage.removeItem(TOKEN_KEY); }catch(e){} }

function initTokenClient(){
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: function(){}
  });
}

function requestToken(interactive){
  return new Promise(function(resolve, reject){
    tokenClient.callback = function(resp){
      if (resp && resp.error){ reject(resp); return; }
      accessToken = resp.access_token;
      saveToken(resp);
      try{ localStorage.setItem(DA_DN_KEY, '1'); }catch(e){}
      resolve(accessToken);
    };
    tokenClient.error_callback = function(err){ reject(err); };
    // prompt '' (không ép 'consent'): Google tự hiện màn cấp quyền khi chưa cấp lần nào,
    // còn lần sau chỉ chọn tài khoản / vào thẳng thay vì bắt đồng ý lại mỗi lần
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

async function driveFetch(url, options, retried){
  options = options || {};
  var headers = Object.assign({}, options.headers, { 'Authorization': 'Bearer ' + accessToken });
  var res = await fetch(url, Object.assign({}, options, { headers: headers }));
  if (res.status === 401 && !retried){
    // token hết hạn/bị thu hồi. Xin lại âm thầm chỉ làm được khi Google Sign-In đã nạp (tokenClient);
    // vào bằng token lưu sẵn thì chưa có -> báo hết phiên thay vì ném lỗi khó hiểu.
    clearSavedToken();
    if (!tokenClient){
      if (window.google && google.accounts && google.accounts.oauth2) initTokenClient();
      else throw new Error('token-expired');
    }
    await requestToken(false);
    return driveFetch(url, options, true);
  }
  return res;
}

// trả về {id, modifiedTime} của file dữ liệu (bản mới nhất nếu có nhiều bản trùng tên)
async function findFile(){
  var q = encodeURIComponent("name='" + DRIVE_FILE_TITLE + "' and trashed=false");
  var url = API_BASE + '/files?q=' + q + '&fields=files(id,name,modifiedTime)&spaces=drive';
  var res = await driveFetch(url);
  if (!res.ok) throw new Error('search-failed:' + res.status);
  var json = await res.json();
  var files = json.files || [];
  if (!files.length) return null;
  files.sort(function(a,b){ return new Date(b.modifiedTime) - new Date(a.modifiedTime); });
  return files[0];
}
async function findFileId(){
  var f = await findFile();
  return f ? f.id : null;
}

/* ====================================================================
   CHỐNG GHI ĐÈ KHI DÙNG 2 MÁY
   state.driveModified = modifiedTime của file Drive tại lúc tải về (hoặc lúc
   mình vừa ghi xong). Trước mỗi lần ghi, hỏi lại modifiedTime hiện tại: khác
   nghĩa là máy khác đã ghi chen vào -> KHÔNG ghi đè âm thầm, hỏi người dùng.
   Cố ý lấy modifiedTime TRƯỚC khi tải nội dung: nếu file đổi giữa 2 request thì
   mốc cũ hơn nội dung, cùng lắm báo xung đột thừa (an toàn), không bao giờ bỏ sót.
   ==================================================================== */
async function layModifiedTime(){
  var res = await driveFetch(API_BASE + '/files/' + state.driveFileId + '?fields=modifiedTime');
  if (!res.ok) throw new Error('meta-failed:' + res.status);
  var j = await res.json();
  return j.modifiedTime || null;
}
async function driveDocText(fileId){
  var res = await driveFetch(API_BASE + '/files/' + fileId + '?alt=media');
  if (!res.ok) throw new Error('download-failed:' + res.status);
  return res.text();
}

async function driveLoad(){
  // Nạp lại từ Drive = dữ liệu gốc đã khác -> bản nháp mô phỏng (clone của bản cũ)
  // trở thành lạc hậu. Xóa luôn thay vì để Đạt ngồi so số với một bản gốc không còn tồn tại.
  if (state.mp) mpXoaNhap();
  try{
    var file = await findFile();
    if (!file){
      state.data = normalizeData(JSON.parse(JSON.stringify(DEFAULT_DATA)));
      state.driveFileId = null;
      state.driveModified = null;
      state.taiLoi = false;          // chưa có file thật sự = lần dùng đầu, được phép tạo file
      _textDriveLanTai = null;
      state.errorMsg = null;
      state.lastSync = new Date();
      state.loading = false;
      return true;
    }
    var text = await driveDocText(file.id);
    var parsed = JSON.parse(text);
    state.data = normalizeData(parsed);
    state.driveFileId = file.id;
    state.driveModified = file.modifiedTime || null;   // mốc lấy từ lúc liệt kê, TRƯỚC khi tải nội dung
    state.taiLoi = false;
    _textDriveLanTai = text;
    state.errorMsg = null;
    state.lastSync = new Date();
    state.loading = false;
    saveSyncedSnapshot();
    return true;
  }catch(e){
    if (!state.data){
      state.data = normalizeData(JSON.parse(JSON.stringify(DEFAULT_DATA)));
      // KHÔNG tải được != chưa có file. Đánh dấu để driveSave không tạo file mới đè lên file thật
      // (findFile chọn file sửa gần nhất, file trống mới tạo sẽ "thắng" file dữ liệu thật).
      state.taiLoi = true;
      state.errorMsg = 'Không tải được dữ liệu từ Google Drive — đang dùng dữ liệu mặc định. Kéo xuống ở đầu trang (hoặc bấm "Làm mới") để thử lại.';
    } else {
      state.errorMsg = 'Làm mới thất bại, vẫn giữ dữ liệu hiện tại trên máy.';
    }
    state.loading = false;
    return false;
  }
}

/* ---- bản nháp cục bộ: chống mất dữ liệu nếu mất mạng/đóng tab trước khi Drive lưu xong ---- */
function saveLocalDraft(){
  // baseModified = mốc Drive mà bản nháp này dựa trên: sau này khôi phục nháp mới biết Drive đã đổi chưa
  try{ localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ data: state.data, savedAt: Date.now(), baseModified: state.driveModified || null })); }catch(e){}
}
function saveSyncedSnapshot(){
  try{ localStorage.setItem(SYNCED_KEY, JSON.stringify({ data: state.data, savedAt: Date.now(), baseModified: state.driveModified || null })); }catch(e){}
}
function readSyncedSnapshot(){
  try{
    var raw = localStorage.getItem(SYNCED_KEY);
    var s = raw ? JSON.parse(raw) : null;
    return (s && s.data && typeof s.data.journal === 'object') ? s : null;
  }catch(e){ return null; }
}
function readLocalDraft(){
  try{
    var raw = localStorage.getItem(LOCAL_DRAFT_KEY);
    var dr = raw ? JSON.parse(raw) : null;
    return (dr && dr.data && typeof dr.data.journal === 'object') ? dr : null;
  }catch(e){ return null; }
}

/* ====================================================================
   MỞ NGOẠI TUYẾN — không có mạng thì không đăng nhập Google được, nên không lấy được Drive.
   Mở bằng bản dữ liệu đã lưu trên máy lần đồng bộ gần nhất (+ nháp nếu có thay đổi chưa lưu).
   Sửa được: thay đổi vào nháp trên máy, KHÔNG gửi lên Drive. Khi có mạng, bấm "Đăng nhập để
   đồng bộ": app tải bản Drive rồi hỏi khôi phục nháp (kèm cảnh báo nếu Drive đã đổi từ lúc đó).
   ==================================================================== */
function coTheMoNgoaiTuyen(){ return !!readSyncedSnapshot(); }
function moNgoaiTuyen(){
  var snap = readSyncedSnapshot();
  if (!snap) return;
  var dr = readLocalDraft();
  var dungNhap = !!(dr && dr.savedAt >= snap.savedAt);    // nháp mới hơn bản đồng bộ = các sửa ngoại tuyến trước đó
  state.data = normalizeData(JSON.parse(JSON.stringify(dungNhap ? dr.data : snap.data)));
  state.driveModified = (dungNhap ? dr.baseModified : snap.baseModified) || null;
  state.driveFileId = null;
  state.dirty = dungNhap;
  state.offline = true;
  state.offlineTu = dungNhap ? dr.savedAt : snap.savedAt;
  state.errorMsg = null;
  state.loading = false;
  accessToken = null;
  showApp();
  renderAll();
}
function clearLocalDraft(){
  try{ localStorage.removeItem(LOCAL_DRAFT_KEY); }catch(e){}
}
// gọi 1 lần sau khi đăng nhập + tải xong dữ liệu Drive: nếu phát hiện có nháp cục bộ
// còn sót lại từ lần trước (do mất mạng/đóng tab trước khi lưu Drive xong), hỏi khôi phục.
// mô tả ngắn gọn 1 bộ dữ liệu để người dùng biết nháp chứa gì trước khi quyết định khôi phục
function describeData(d){
  if (!d) return '(trống)';
  var soNgay = Object.keys(d.journal || {}).length;
  var vn = (d.vayNo && d.vayNo.vayNoPhaiTra) ? d.vayNo.vayNoPhaiTra.length : 0;
  var cv = (d.vayNo && d.vayNo.choVay) ? d.vayNo.choVay.length : 0;
  var lastDay = Object.keys(d.journal || {}).sort().pop() || '—';
  return soNgay + ' ngày có giao dịch (mới nhất: ' + lastDay + '), '
    + vn + ' khoản vay phải trả, ' + cv + ' khoản cho vay';
}

// async: hộp thoại trả Promise. signIn() PHẢI await trước khi renderAll(),
// nếu không màn hình vẽ xong bằng dữ liệu Drive rồi mới hỏi -> hỏi xong không vẽ lại.
async function checkLocalDraft(){
  var raw = null;
  try{ raw = localStorage.getItem(LOCAL_DRAFT_KEY); }catch(e){ return; }
  if (!raw) return;
  var draft = null;
  try{
    draft = JSON.parse(raw);
  }catch(e){
    // KHÔNG xóa nháp khi parse lỗi — dữ liệu còn đó, chỉ là hỏng cấu trúc; báo để còn cứu bằng tay
    console.error('[chitieu] Bản nháp cục bộ bị lỗi, KHÔNG xóa. Nội dung thô nằm ở localStorage key "'
      + LOCAL_DRAFT_KEY + '".', e);
    state.errorMsg = 'Có bản nháp cục bộ bị lỗi định dạng, chưa xóa. Mở Console (F12) để xem chi tiết.';
    return;
  }
  if (!draft || !draft.data) return;
  var t = new Date(draft.savedAt);
  // nháp dựa trên 1 bản Drive cũ hơn bản đang có: khôi phục nháp sẽ đè mất thay đổi của máy khác
  var driveDaDoi = !!(draft.baseModified && state.driveModified && draft.baseModified !== state.driveModified);
  var msg = (driveDaDoi ? 'Lưu ý: File trên Drive đã được sửa SAU lúc nháp này được lưu (có thể từ máy khác). '
      + 'Khôi phục nháp sẽ đè lên thay đổi đó — bản Drive hiện tại vẫn được sao lưu lại trước khi đè.\n\n' : '')
    + 'Nháp cục bộ (lưu lúc ' + pad2(t.getHours())+':'+pad2(t.getMinutes())+' '+t.toLocaleDateString('vi-VN') + '):\n'
    + '  ' + describeData(draft.data) + '\n\n'
    + 'Dữ liệu hiện tại trên Drive:\n'
    + '  ' + describeData(state.data) + '\n\n'
    + 'Chọn "Dùng dữ liệu Drive" thì nháp VẪN ĐƯỢC GIỮ LẠI để còn khôi phục sau.';
  var ok = await xacNhan('Có thay đổi chưa kịp đồng bộ lên Google Drive', msg, {
    chuOk: 'Khôi phục nháp',
    chuHuy: 'Dùng dữ liệu Drive'
  });
  if (ok){
    if (driveDaDoi && _textDriveLanTai){
      try{ await saoLuuNgay('truoc-khoi-phuc-nhap', _textDriveLanTai); }
      catch(e){
        console.error('[chitieu] Không sao lưu được bản Drive trước khi khôi phục nháp:', e);
        toast('Không sao lưu được bản Drive nên chưa khôi phục nháp (nháp vẫn được giữ). Thử lại sau.', { loai:'err' });
        return;
      }
    }
    state.data = normalizeData(draft.data);
    scheduleSave();           // scheduleSave sẽ ghi lại nháp, clearLocalDraft chỉ chạy khi Drive lưu xong
    toast('Đã khôi phục bản nháp cục bộ, đang lưu lên Drive.');
  }
  // Chọn "Dùng dữ liệu Drive": cố tình KHÔNG clearLocalDraft() — nháp là bản sao cuối cùng, xóa là mất luôn.
}

var saveTimer = null;
var changeSeq = 0;      // tăng mỗi lần dữ liệu đổi, để biết có thay đổi mới chen vào giữa lúc đang upload
function scheduleSave(){
  state.dirty = true;
  changeSeq++;
  invalidateBalanceCache();   // dữ liệu vừa đổi -> cache số dư không còn đúng
  renderSyncStatus();
  saveLocalDraft();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(driveSave, 1500);
}

async function driveSave(){
  // ngoại tuyến (chưa đăng nhập): thay đổi đã nằm trong nháp trên máy, không có gì để gửi
  if (!accessToken){ renderSyncStatus(); return; }
  if (state.taiLoi){
    state.errorMsg = 'Chưa tải được dữ liệu từ Drive nên CHƯA lưu lên Drive (để khỏi tạo file mới đè lên file thật). Thay đổi vẫn được giữ trên máy — kéo xuống để làm mới (hoặc bấm "Làm mới") khi có mạng.';
    renderSyncStatus();
    return;
  }
  if (state.saving) { saveTimer = setTimeout(driveSave, 1500); return; }
  state.saving = true;
  var seqAtStart = changeSeq;
  renderSyncStatus();
  try{
    var text = JSON.stringify(state.data);
    if (!state.driveFileId){
      var createRes = await driveFetch(API_BASE + '/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: DRIVE_FILE_TITLE, mimeType: 'application/json' })
      });
      if (!createRes.ok) throw new Error('create-failed:' + createRes.status);
      var created = await createRes.json();
      state.driveFileId = created.id;
      state.driveModified = null;   // file vừa tạo: chưa có mốc để so
    } else if (state.driveModified){
      var remoteMt = await layModifiedTime();
      if (remoteMt && remoteMt !== state.driveModified){
        // máy khác đã ghi chen vào -> dừng, KHÔNG tự thử lại (thử lại cũng chỉ lại xung đột)
        state.xungDot = true;
        state.saving = false;
        state.errorMsg = 'Dữ liệu trên Drive đã được thiết bị khác sửa — chưa lưu thay đổi của máy này.';
        renderSyncStatus();
        giaiQuyetXungDot();
        return;
      }
    }
    var upRes = await driveFetch(UPLOAD_BASE + '/files/' + state.driveFileId + '?uploadType=media&fields=modifiedTime', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: text
    });
    if (!upRes.ok) throw new Error('save-failed:' + upRes.status);
    var upJson = null;
    try{ upJson = await upRes.json(); }catch(e){}
    state.driveModified = (upJson && upJson.modifiedTime) ? upJson.modifiedTime : await layModifiedTime();
    state.xungDot = false;
    state.errorMsg = null;
    state.lastSync = new Date();
    // CHỈ hạ cờ dirty + xóa nháp khi Drive đã nhận xong VÀ không có thay đổi mới chen vào giữa lúc upload
    if (changeSeq === seqAtStart){
      state.dirty = false;
      clearLocalDraft();
      saveSyncedSnapshot();
    }
  }catch(e){
    // Giữ state.dirty = true: pollRefresh sẽ không nạp đè dữ liệu Drive lên thay đổi chưa lưu,
    // và nháp cục bộ được giữ nguyên làm bản sao cuối cùng.
    console.error('[chitieu] Lưu Drive thất bại:', e);
    state.errorMsg = 'Lưu lên Google Drive thất bại (' + (e && e.message ? e.message : 'lỗi mạng') + '). Sẽ thử lại.';
    saveTimer = setTimeout(driveSave, 4000);
  }
  state.saving = false;
  renderSyncStatus();
}

/* ====================================================================
   SAO LƯU NHIỀU BẢN trên Drive (drive.file chỉ thấy file do chính app tạo,
   nên bản sao lưu cũng phải do app tạo — không phụ thuộc revision của Drive).
   - Mỗi ngày, lần đầu mở app: lưu nguyên văn bản vừa tải về (= trạng thái cuối
     ngày hôm trước) thành chitieu-canhan-backup-YYYY-MM-DD.json.
   - Trước mọi thao tác sẽ bỏ dữ liệu của 1 bên (gỡ xung đột, khôi phục) cũng
     lưu bên bị bỏ thành 1 bản có nhãn.
   - Chỉ giữ BACKUP_GIU bản mới nhất theo tên.
   Liệt kê KHÔNG dùng "name contains": Drive chỉ khớp theo tiền tố của từng từ,
   tên có dấu gạch ngang dễ trượt. drive.file vốn chỉ trả file của app nên lọc
   tiền tố ở phía client là đủ.
   ==================================================================== */
var BACKUP_PREFIX = 'chitieu-canhan-backup-';
var BACKUP_GIU = 10;

async function driveTaoFile(ten, text){
  var cr = await driveFetch(API_BASE + '/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ten, mimeType: 'application/json' })
  });
  if (!cr.ok) throw new Error('create-failed:' + cr.status);
  var f = await cr.json();
  var up = await driveFetch(UPLOAD_BASE + '/files/' + f.id + '?uploadType=media', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: text
  });
  if (!up.ok){
    // đừng để lại file rỗng trông như một bản sao lưu hợp lệ
    try{ await driveFetch(API_BASE + '/files/' + f.id, { method: 'DELETE' }); }catch(e){}
    throw new Error('backup-upload-failed:' + up.status);
  }
  return { id: f.id, name: ten };
}

async function driveListBackups(){
  var q = encodeURIComponent("trashed=false and mimeType='application/json'");
  var res = await driveFetch(API_BASE + '/files?q=' + q + '&fields=files(id,name,modifiedTime,size)&pageSize=200&spaces=drive');
  if (!res.ok) throw new Error('list-failed:' + res.status);
  var j = await res.json();
  return (j.files || []).filter(function(f){ return f.name.indexOf(BACKUP_PREFIX) === 0; })
    .sort(function(a, b){ return a.name < b.name ? 1 : (a.name > b.name ? -1 : 0); });   // mới nhất lên đầu
}

// xóa bản vượt quá BACKUP_GIU (danh sách đã sắp mới -> cũ)
async function pruneBackups(ds){
  for (var i = BACKUP_GIU; i < ds.length; i++){
    try{ await driveFetch(API_BASE + '/files/' + ds[i].id, { method: 'DELETE' }); }catch(e){ console.error('[chitieu] Xóa bản sao lưu cũ lỗi:', e); }
  }
}

function tenBackup(nhan){
  if (!nhan) return BACKUP_PREFIX + todayStr() + '.json';
  var t = new Date();
  return BACKUP_PREFIX + todayStr() + '-' + nhan + '-' + pad2(t.getHours()) + pad2(t.getMinutes()) + pad2(t.getSeconds()) + '.json';
}

// lưu 1 bản có nhãn rồi dọn bản cũ. text = nội dung JSON thô cần giữ.
async function saoLuuNgay(nhan, text){
  await driveTaoFile(tenBackup(nhan), text);
  await pruneBackups(await driveListBackups());
}

// mỗi ngày 1 bản, lần đầu mở app. Lỗi ở đây KHÔNG được làm hỏng việc đăng nhập.
async function backupHangNgay(){
  if (!state.driveFileId || !_textDriveLanTai) return;
  try{
    var ds = await driveListBackups();
    var hnay = tenBackup('');
    if (!ds.some(function(f){ return f.name === hnay; })){
      await driveTaoFile(hnay, _textDriveLanTai);
      ds = await driveListBackups();
    }
    await pruneBackups(ds);
  }catch(e){
    console.error('[chitieu] Sao lưu hằng ngày thất bại:', e);
  }
}

/* ---- gỡ xung đột khi máy khác đã ghi chen vào ---- */
var _dangHoiXungDot = false;
async function giaiQuyetXungDot(){
  if (_dangHoiXungDot) return;
  _dangHoiXungDot = true;
  try{
    var ma = await chonMot('Dữ liệu trên Drive đã đổi từ thiết bị khác',
      'Máy này có thay đổi chưa lưu, nhưng file trên Drive đã được thiết bị khác sửa sau lần bạn tải gần nhất.\n\n'
      + 'Chọn bên nào thì bên còn lại vẫn được giữ thành 1 file sao lưu trên Drive (tab Danh mục → Sao lưu dữ liệu), không mất dữ liệu.',
      [ { ma:'taiVe', chu:'Lấy bản trên Drive' }, { ma:'ghiDe', chu:'Ghi đè bằng bản máy này' } ]);
    if (ma === 'taiVe'){
      await saoLuuNgay('may-nay', JSON.stringify(state.data));      // giữ phần chưa lưu của máy này
      var daTai = await driveLoad();
      if (daTai){
        if (saveTimer) clearTimeout(saveTimer);
        state.dirty = false; state.xungDot = false;
        clearLocalDraft();            // phần chưa lưu đã nằm an toàn trong file sao lưu
        renderAll();
        toast('Đã lấy bản mới từ Drive. Thay đổi của máy này nằm trong file sao lưu.');
      }
    } else if (ma === 'ghiDe'){
      var tuDrive = await driveDocText(state.driveFileId);
      await saoLuuNgay('truoc-ghi-de', tuDrive);                    // giữ bản của máy kia
      // nhận mốc hiện tại của Drive làm mốc mới: ghi lần này là CHỦ ĐÍCH đè lên bản đó. Làm thế
      // (thay vì cờ bỏ qua kiểm tra) để lần tự thử lại khi mất mạng không hỏi xung đột thêm lần nữa;
      // còn nếu máy kia lại ghi chen sau đây thì lần ghi kế vẫn bị phát hiện đúng.
      state.driveModified = await layModifiedTime();
      state.xungDot = false;
      state.errorMsg = null;
      await driveSave();
      renderAll();
      toast('Đã ghi đè Drive bằng bản máy này. Bản cũ trên Drive nằm trong file sao lưu.');
    } else {
      renderSyncStatus();   // người dùng đóng hộp thoại: giữ nguyên trạng thái chưa lưu, sửa gì tiếp sẽ hỏi lại
    }
  }catch(e){
    console.error('[chitieu] Gỡ xung đột thất bại:', e);
    state.errorMsg = 'Xử lý xung đột với Drive thất bại (' + (e && e.message ? e.message : 'lỗi mạng') + '). Chưa mất gì, thử lưu lại sau.';
    renderSyncStatus();
  }
  _dangHoiXungDot = false;
}

async function pollRefresh(){
  if (!accessToken || state.dirty || state.saving || isTypingNow() || isFormOpen()) return;
  // nháp mô phỏng đã có điều chỉnh: driveLoad() sẽ xóa nháp, mà poll chạy ngầm 35s/lần
  // -> đang ngồi thử số thì nháp bốc hơi không rõ lý do. Chỉ xóa khi Đạt tự bấm "Làm mới".
  if (typeof mpCoThayDoi === 'function' && mpCoThayDoi()) return;
  await driveLoad();
  renderAll();
}

// Cảnh báo khi đóng tab/refresh mà còn thay đổi chưa đồng bộ lên Drive
window.addEventListener('beforeunload', function(e){
  if (!state.dirty && !state.saving) return;
  e.preventDefault();
  e.returnValue = '';   // Chrome yêu cầu set returnValue để hiện hộp xác nhận
  return '';
});

/* ---------------- auth flow ---------------- */
function showApp(){
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('app').style.display = '';
}
/* ---- cài lên màn hình chính ---- */
function laIos(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function dangChayNhuApp(){
  return navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
}
// iOS không có nút "Cài đặt" như Android/Chrome: người dùng phải tự biết vào menu Chia sẻ -> nên nhắc 1 lần
function iosNenGoiYCai(){
  if (!laIos() || dangChayNhuApp()) return false;
  try{ return localStorage.getItem('chitieu_ios_hint') !== '1'; }catch(e){ return true; }
}
// dòng thông báo ở màn đăng nhập: "Đang ..." là trạng thái (màu trung tính), còn lại là lỗi (màu đỏ)
function gateMsg(t){
  var el = document.getElementById('authMsg');
  if (!el) return;
  el.textContent = t || '';
  el.classList.toggle('dang', /^Đang/.test(t || ''));
}
function showGate(msg){
  document.getElementById('app').style.display = 'none';
  document.getElementById('authGate').style.display = 'flex';
  gateMsg(msg);
  var gy = document.getElementById('iosHint');
  if (gy) gy.style.display = iosNenGoiYCai() ? '' : 'none';
  var bo = document.getElementById('btnOffline');
  if (bo){
    var snap = readSyncedSnapshot();
    bo.style.display = snap ? '' : 'none';
    if (snap){
      var t = new Date(snap.savedAt);
      bo.innerHTML = '<b>Mở ngoại tuyến</b><small>Dữ liệu trên máy lúc ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes()) + ' ' + t.toLocaleDateString('vi-VN') + '</small>';
    }
  }
}

var polling = false;
function startPolling(){
  if (polling) return;
  polling = true;
  window.addEventListener('focus', pollRefresh);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) pollRefresh(); });
  setInterval(pollRefresh, 35000);
}

// mở app: còn token lưu sẵn thì vào thẳng, không qua màn đăng nhập. Trả true nếu đã vào.
// Token lưu hết hạn nhưng máy này từng đăng nhập: thử xin token mới KHÔNG cần bấm gì.
// Chạy được hay không tùy trình duyệt (iOS chạy app từ màn hình chính hay chặn popup không do bấm) —
// thất bại/treo quá 8 giây thì thôi, rơi về màn đăng nhập như cũ.
async function thuXinTokenAmTham(){
  try{ if (localStorage.getItem(DA_DN_KEY) !== '1') return null; }catch(e){ return null; }
  for (var i = 0; i < 25 && !(window.google && google.accounts && google.accounts.oauth2); i++){
    await new Promise(function(r){ setTimeout(r, 200); });   // đợi thư viện Google nạp (script async)
  }
  if (!(window.google && google.accounts && google.accounts.oauth2)) return null;
  if (!tokenClient) initTokenClient();
  gateMsg('Đang gia hạn phiên đăng nhập…');
  try{
    return await Promise.race([
      requestToken(false),
      new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('het-gio')); }, 8000); })
    ]);
  }catch(e){ return null; }
}

async function tiepTucPhienDangNhap(){
  var tok = readSavedToken() || await thuXinTokenAmTham();
  if (!tok) return false;
  accessToken = tok;
  gateMsg('Đang vào bằng phiên đăng nhập gần nhất…');
  var ok = false;
  try{ ok = await driveLoad(); }catch(e){ ok = false; }
  if (!ok){
    // token đã chết / không có mạng: bỏ dữ liệu mặc định driveLoad vừa dựng tạm, quay về màn đăng nhập
    accessToken = null; state.data = null; state.taiLoi = false;
    clearSavedToken();
    showGate('Phiên đăng nhập đã hết hạn hoặc không có mạng. Bấm đăng nhập để vào lại.');
    return false;
  }
  state.offline = false; state.dirty = false;
  showApp();
  backupHangNgay();
  renderAll();
  await checkLocalDraft();
  renderAll();
  startPolling();
  return true;
}

async function signIn(){
  if (!window.google || !google.accounts || !google.accounts.oauth2){
    gateMsg('Đang tải Google Sign-In… thử lại sau 1-2 giây.');
    return;
  }
  if (!tokenClient) initTokenClient();
  gateMsg('Đang đăng nhập…');
  try{
    await requestToken(true);
    // từ ngoại tuyến đăng nhập lại: các sửa ngoại tuyến nằm trong nháp, checkLocalDraft sẽ hỏi khôi phục
    state.offline = false; state.dirty = false;
    showApp();
    await driveLoad();
    backupHangNgay();       // không await: sao lưu chậm không được làm chậm màn hình đầu tiên
    renderAll();            // vẽ ngay bằng dữ liệu Drive để không phải ngồi nhìn màn hình trắng
    await checkLocalDraft();
    renderAll();
    startPolling();
  }catch(e){
    showGate('Đăng nhập thất bại hoặc bị hủy. Thử lại.');
  }
}

function signOut(){
  if (accessToken && window.google && google.accounts && google.accounts.oauth2){
    google.accounts.oauth2.revoke(accessToken, function(){});
  }
  accessToken = null;
  state.data = null;
  state.offline = false;
  clearSavedToken();
  try{ localStorage.removeItem(DA_DN_KEY); }catch(e){}
  try{ localStorage.removeItem(SYNCED_KEY); }catch(e){}   // đăng xuất tường minh = không để dữ liệu tiền lại để mở ngoại tuyến
  if (state.mp) mpXoaNhap();   // nháp là bản sao dữ liệu thật, không để lại sau khi đăng xuất
  showGate('');
}
