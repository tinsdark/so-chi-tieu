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

var tokenClient = null;
var accessToken = null;

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
      resolve(accessToken);
    };
    tokenClient.error_callback = function(err){ reject(err); };
    tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

async function driveFetch(url, options, retried){
  options = options || {};
  var headers = Object.assign({}, options.headers, { 'Authorization': 'Bearer ' + accessToken });
  var res = await fetch(url, Object.assign({}, options, { headers: headers }));
  if (res.status === 401 && !retried){
    await requestToken(false);
    return driveFetch(url, options, true);
  }
  return res;
}

async function findFileId(){
  var q = encodeURIComponent("name='" + DRIVE_FILE_TITLE + "' and trashed=false");
  var url = API_BASE + '/files?q=' + q + '&fields=files(id,name,modifiedTime)&spaces=drive';
  var res = await driveFetch(url);
  if (!res.ok) throw new Error('search-failed:' + res.status);
  var json = await res.json();
  var files = json.files || [];
  if (!files.length) return null;
  files.sort(function(a,b){ return new Date(b.modifiedTime) - new Date(a.modifiedTime); });
  return files[0].id;
}

async function driveLoad(){
  try{
    var fileId = await findFileId();
    if (!fileId){
      state.data = normalizeData(JSON.parse(JSON.stringify(DEFAULT_DATA)));
      state.driveFileId = null;
      state.errorMsg = null;
      state.lastSync = new Date();
      state.loading = false;
      return;
    }
    var res = await driveFetch(API_BASE + '/files/' + fileId + '?alt=media');
    if (!res.ok) throw new Error('download-failed:' + res.status);
    var text = await res.text();
    var parsed = JSON.parse(text);
    state.data = normalizeData(parsed);
    state.driveFileId = fileId;
    state.errorMsg = null;
    state.lastSync = new Date();
  }catch(e){
    if (!state.data){
      state.data = normalizeData(JSON.parse(JSON.stringify(DEFAULT_DATA)));
      state.errorMsg = 'Không tải được dữ liệu từ Google Drive — đang dùng dữ liệu mặc định. Bấm "Làm mới" để thử lại.';
    } else {
      state.errorMsg = 'Làm mới thất bại, vẫn giữ dữ liệu hiện tại trên máy.';
    }
  }
  state.loading = false;
}

/* ---- bản nháp cục bộ: chống mất dữ liệu nếu mất mạng/đóng tab trước khi Drive lưu xong ---- */
function saveLocalDraft(){
  try{ localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({ data: state.data, savedAt: Date.now() })); }catch(e){}
}
function clearLocalDraft(){
  try{ localStorage.removeItem(LOCAL_DRAFT_KEY); }catch(e){}
}
// gọi 1 lần sau khi đăng nhập + tải xong dữ liệu Drive: nếu phát hiện có nháp cục bộ
// còn sót lại từ lần trước (do mất mạng/đóng tab trước khi lưu Drive xong), hỏi khôi phục.
function checkLocalDraft(){
  var raw = null;
  try{ raw = localStorage.getItem(LOCAL_DRAFT_KEY); }catch(e){ return; }
  if (!raw) return;
  try{
    var draft = JSON.parse(raw);
    if (draft && draft.data){
      var t = new Date(draft.savedAt);
      var msg = 'Phát hiện có thay đổi chưa kịp đồng bộ lên Google Drive từ lần trước (lưu nháp lúc '
        + pad2(t.getHours())+':'+pad2(t.getMinutes())+' '+t.toLocaleDateString('vi-VN')+').\n'
        + 'Khôi phục thay đổi đó không? (Chọn Hủy nếu bỏ qua, giữ dữ liệu hiện tại từ Drive)';
      if (confirm(msg)){
        state.data = normalizeData(draft.data);
        scheduleSave();
      }
    }
  }catch(e){}
  clearLocalDraft();
}

var saveTimer = null;
function scheduleSave(){
  state.dirty = true;
  renderSyncStatus();
  saveLocalDraft();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(driveSave, 1500);
}

async function driveSave(){
  if (state.saving) { saveTimer = setTimeout(driveSave, 1500); return; }
  state.saving = true;
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
    }
    var upRes = await driveFetch(UPLOAD_BASE + '/files/' + state.driveFileId + '?uploadType=media', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: text
    });
    if (!upRes.ok) throw new Error('save-failed:' + upRes.status);
    state.errorMsg = null;
    state.lastSync = new Date();
    clearLocalDraft();
  }catch(e){
    state.errorMsg = 'Lưu lên Google Drive thất bại. Sẽ thử lại.';
    saveTimer = setTimeout(driveSave, 4000);
  }
  state.dirty = false;
  state.saving = false;
  renderSyncStatus();
}

async function pollRefresh(){
  if (!accessToken || state.dirty || state.saving || isTypingNow()) return;
  await driveLoad();
  renderAll();
}

/* ---------------- auth flow ---------------- */
function showApp(){
  document.getElementById('authGate').style.display = 'none';
  document.getElementById('app').style.display = '';
}
function showGate(msg){
  document.getElementById('app').style.display = 'none';
  document.getElementById('authGate').style.display = 'flex';
  document.getElementById('authMsg').textContent = msg || '';
}

var polling = false;
function startPolling(){
  if (polling) return;
  polling = true;
  window.addEventListener('focus', pollRefresh);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) pollRefresh(); });
  setInterval(pollRefresh, 35000);
}

async function signIn(){
  if (!window.google || !google.accounts || !google.accounts.oauth2){
    document.getElementById('authMsg').textContent = 'Đang tải Google Sign-In… thử lại sau 1-2 giây.';
    return;
  }
  if (!tokenClient) initTokenClient();
  document.getElementById('authMsg').textContent = 'Đang đăng nhập…';
  try{
    await requestToken(true);
    showApp();
    await driveLoad();
    checkLocalDraft();
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
  showGate('');
}
