"use strict";
/* ====================================================================
   danhmuc.js — tab "Danh mục": quản lý danh mục thu/chi, số dư đầu kỳ,
   khóa sổ. Có validate chặn tên danh mục rỗng/trùng.
   Cần state.js, drive-sync.js load trước.
   ==================================================================== */

function categoryCardHtml(kind, title, cats){
  var html = '<div class="card"><h3>'+title+'</h3>';
  if (!cats.length){
    html += '<div class="empty">Chưa có danh mục nào.</div>';
  } else {
    html += '<div class="cat-list" data-kind="'+kind+'">';
    cats.forEach(function(c, idx){
      html += '<div class="cat-item" data-kind="'+kind+'" data-id="'+c.id+'" style="display:flex;flex-direction:column;gap:4px">'
        /* Dòng 1 chỉ có tay cầm kéo + TÊN để tên không bị bóp còn mấy ký tự;
           chỉ tiêu và các nút ▲▼🗑 xuống dòng 2. */
        + '<div style="display:flex;gap:4px;align-items:center">'
        + '<span class="cat-drag" draggable="true" title="Kéo để đổi thứ tự" style="cursor:grab;color:var(--muted);user-select:none;padding:0 2px">⠿</span>'
        + '<input type="text" data-act="catName" data-kind="'+kind+'" data-id="'+c.id+'" value="'+(c.ten||'').replace(/"/g,'&quot;')+'" style="flex:1;min-width:0">'
        + '</div>'
        + '<div style="display:flex;gap:4px;align-items:center">'
        + '<input type="text" inputmode="numeric" autocomplete="off" class="money" data-act="catBase" data-kind="'+kind+'" data-id="'+c.id+'" value="'+veSo(c.chiTieu)+'" placeholder="Chỉ tiêu/tháng" style="flex:1;min-width:0" title="Chỉ tiêu/tháng">'
        + '<button class="icon-btn" data-act="catUp" data-kind="'+kind+'" data-id="'+c.id+'" title="Lên trên"'+(idx===0?' disabled style="opacity:.3"':'')+'>▲</button>'
        + '<button class="icon-btn" data-act="catDown" data-kind="'+kind+'" data-id="'+c.id+'" title="Xuống dưới"'+(idx===cats.length-1?' disabled style="opacity:.3"':'')+'>▼</button>'
        + '<button class="icon-btn" data-act="delCat" data-kind="'+kind+'" data-id="'+c.id+'" title="Xóa danh mục" aria-label="Xóa danh mục '+esc(c.ten)+'">🗑</button>'
        + '</div>'
        + '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--muted);white-space:nowrap" title="Không đoán/dự trù số liệu cho tháng tương lai (dùng cho khoản không đều đặn, không thể dự đoán)">'
        + '<input type="checkbox" data-act="catNoForecast" data-kind="'+kind+'" data-id="'+c.id+'"'+(c.khongDuTru?' checked':'')+'> Không dự trù</label>'
        + '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--muted);white-space:nowrap" title="Luôn dùng đúng số Chỉ tiêu/tháng cho các tháng tương lai, không lấy trung bình 3 tháng thực tế (dùng khi lương/chỉ tiêu vừa thay đổi)">'
        + '<input type="checkbox" data-act="catFixedTarget" data-kind="'+kind+'" data-id="'+c.id+'"'+(c.coDinhChiTieu?' checked':'')+'> Cố định theo Chỉ tiêu</label>'
        + '</div>';
    });
    html += '</div>';
  }
  html += '<button class="btn sm" data-act="addCat" data-kind="'+kind+'">+ Thêm danh mục</button>';
  html += '</div>';
  return html;
}

function renderDanhMuc(){
  var root = document.getElementById('tabContent');
  var html = '';
  html += categoryCardHtml('thu', 'Danh mục khoản thu', state.data.categories.thu);
  html += categoryCardHtml('chi', 'Danh mục khoản chi', state.data.categories.chi);
  html += '<div class="card"><h3>Số dư đầu kỳ</h3>'
    + '<div class="form-row">'
    + '<div><label>Ngày bắt đầu</label><input type="date" id="cfg_ngay" value="'+(state.data.settings.ngayBatDau||'')+'"></div>'
    + '<div><label>Số dư</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="cfg_du" value="'+veSo(state.data.settings.soDuDauKy)+'" placeholder="0"></div>'
    + '<div><label>Tháng bắt đầu dự trù</label><input type="month" id="cfg_duTru" value="'+(state.data.settings.thangBatDauDuTru||'')+'"></div>'
    + '</div>'
    + '<div class="empty" style="padding:0 0 10px">"Tháng bắt đầu dự trù" là tháng ĐẦY ĐỦ đầu tiên được dùng để tính TB gợi ý ở tab Dòng tiền. Tháng lẻ lúc mới bắt đầu dùng app (ghi từ giữa tháng) nên bỏ qua, nếu không TB sẽ bị kéo xuống sai. Mốc này KHÔNG bị khóa sổ làm đổi.</div>'
    + '<button class="btn sm" data-act="saveSettings">Lưu</button></div>';
  html += '<div class="card"><h3>Khóa sổ</h3>'
    + '<div class="empty" style="padding:0 0 10px">Chốt số dư đến hết tháng chọn bên dưới, dùng làm số dư đầu kỳ mới. Dữ liệu Sổ tay các tháng trước đó vẫn giữ nguyên để xem lại, chỉ không cộng vào số dư/Dòng tiền nữa.</div>'
    + '<div class="form-row">'
    + '<div><label>Khóa đến hết tháng</label><input type="month" id="cfg_khoa" value="'+monthKey(todayStr())+'"></div>'
    + '</div><button class="btn sm" data-act="lockMonth">Khóa sổ </button></div>';
  html += backupCardHtml();
  root.innerHTML = html;
  attachCatDragDrop();
}

/* ---- Kéo thả đổi thứ tự danh mục ----
   Thứ tự mảng categories[kind] CHÍNH LÀ thứ tự hiện ở form Sổ tay / Dòng tiền,
   nên chỉ cần hoán vị mảng rồi lưu. Dùng handle ⠿ thay vì kéo cả dòng để còn
   bôi đen sửa tên trong ô input được. Chỉ cho kéo trong cùng nhóm thu/chi. */
var dragCat = null;
function clearCatDropHint(){
  document.querySelectorAll('.cat-item').forEach(function(x){ x.style.boxShadow = ''; });
}
function attachCatDragDrop(){
  document.querySelectorAll('.cat-item').forEach(function(item){
    var handle = item.querySelector('.cat-drag');
    if (handle){
      handle.addEventListener('dragstart', function(e){
        dragCat = { kind: item.getAttribute('data-kind'), id: item.getAttribute('data-id') };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragCat.id);
        item.style.opacity = '.4';
      });
      handle.addEventListener('dragend', function(){
        item.style.opacity = ''; dragCat = null; clearCatDropHint();
      });
    }
    item.addEventListener('dragover', function(e){
      if (!dragCat || dragCat.kind !== item.getAttribute('data-kind')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearCatDropHint();
      if (item.getAttribute('data-id') !== dragCat.id) item.style.boxShadow = 'inset 0 0 0 2px #4f46e5';
    });
    item.addEventListener('drop', function(e){
      if (!dragCat || dragCat.kind !== item.getAttribute('data-kind')) return;
      e.preventDefault();
      clearCatDropHint();
      var arr = state.data.categories[dragCat.kind] || [];
      var from = arr.findIndex(function(x){ return x.id === dragCat.id; });
      var to   = arr.findIndex(function(x){ return x.id === item.getAttribute('data-id'); });
      dragCat = null;
      if (from < 0 || to < 0 || from === to) return;
      arr.splice(to, 0, arr.splice(from, 1)[0]);
      scheduleSave();
      renderDanhMuc();
    });
  });
}

/* ---- Sao lưu dữ liệu: danh sách + khôi phục (logic Drive nằm ở drive-sync.js) ---- */
var BACKUP_NHAN = {
  'may-nay':         'phần chưa lưu của máy này, bị bỏ khi lấy bản Drive',
  'truoc-ghi-de':    'bản trên Drive trước khi bị ghi đè',
  'truoc-khoi-phuc': 'bản dữ liệu trước khi khôi phục'
};
// 'chitieu-canhan-backup-2026-10-06-may-nay-143015.json' -> 'Ngày 06/10/2026 · ... (14:30:15)'
function backupTenDep(name){
  var m = /^chitieu-canhan-backup-(\d{4})-(\d{2})-(\d{2})(?:-(.+?)(?:-(\d{2})(\d{2})(\d{2}))?)?\.json$/.exec(name);
  if (!m) return name;
  var s = 'Ngày ' + m[3] + '/' + m[2] + '/' + m[1];
  if (m[4]) s += ' · ' + (BACKUP_NHAN[m[4]] || m[4]) + (m[5] ? ' (' + m[5] + ':' + m[6] + ':' + m[7] + ')' : '');
  return s;
}
function backupCardHtml(){
  var h = '<div class="card"><h3>Sao lưu dữ liệu</h3>'
    + '<div class="empty" style="padding:0 0 10px">Mỗi ngày, lần đầu mở app, app tự lưu 1 bản dữ liệu lên Drive và giữ '+BACKUP_GIU+' bản gần nhất. '
    + 'Khôi phục sẽ thay toàn bộ dữ liệu hiện tại bằng bản đã chọn — dữ liệu hiện tại cũng được sao lưu lại trước đó nên vẫn quay lại được.</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    + '<button class="btn sm" data-act="bkXem"'+(state.backupBusy?' disabled':'')+'>'+(state.backupDs ? '⟳ Tải lại danh sách' : 'Xem các bản sao lưu')+'</button>'
    + '<button class="btn secondary sm" data-act="bkTao"'+(state.backupBusy?' disabled':'')+'>Sao lưu ngay</button>'
    + '</div>';
  if (state.backupDs){
    if (!state.backupDs.length){
      h += '<div class="empty">Chưa có bản sao lưu nào.</div>';
    } else {
      h += '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Bản sao lưu</th><th>Dung lượng</th><th class="actions-col"></th></tr></thead><tbody>';
      state.backupDs.forEach(function(f){
        h += '<tr><td style="text-align:left;white-space:normal">'+esc(backupTenDep(f.name))+'</td>'
          + '<td>'+(f.size ? Math.max(1, Math.round(num(f.size) / 1024)) + ' KB' : '—')+'</td>'
          + '<td class="actions-col"><button class="btn sm secondary" data-act="bkKhoiPhuc" data-id="'+esc(f.id)+'" data-name="'+esc(f.name)+'"'
          + (state.backupBusy?' disabled':'')+'>Khôi phục</button></td></tr>';
      });
      h += '</tbody></table></div>';
    }
  }
  return h + '</div>';
}

/* ---- Danh mục: helper validate trùng tên ---- */
function catNameExists(kind, name, excludeId){
  var n = name.trim().toLowerCase();
  return state.data.categories[kind].some(function(x){ return x.id !== excludeId && x.ten.trim().toLowerCase() === n; });
}

/* ---- Danh mục: handlers ---- */
function handleDanhMucAction(act, el){
  if (act === 'bkXem' || act === 'bkTao' || act === 'bkKhoiPhuc'){
    // handler KHÔNG được async (dispatcher đọc giá trị trả về đồng bộ) -> bọc IIFE
    if (state.backupBusy) return true;
    (async function(){
      state.backupBusy = true; renderDanhMuc();
      try{
        if (act === 'bkTao'){
          await saoLuuNgay('thu-cong', JSON.stringify(state.data));
          toast('Đã sao lưu dữ liệu hiện tại lên Drive.');
          state.backupDs = await driveListBackups();
        } else if (act === 'bkXem'){
          state.backupDs = await driveListBackups();
        } else {
          var bkId = el.getAttribute('data-id'), bkTen = el.getAttribute('data-name');
          if (!await xacNhan('Khôi phục "'+backupTenDep(bkTen)+'"?',
                'Toàn bộ dữ liệu hiện tại sẽ được thay bằng bản này. Dữ liệu hiện tại được sao lưu lại trước khi thay.',
                { nguyHiem:true, chuOk:'Khôi phục' })) return;
          var bkText = await driveDocText(bkId);
          var bkData = JSON.parse(bkText);
          if (!bkData || typeof bkData.journal !== 'object') throw new Error('bản sao lưu không đúng định dạng');
          await saoLuuNgay('truoc-khoi-phuc', JSON.stringify(state.data));
          if (state.mp) mpXoaNhap();
          state.data = normalizeData(bkData);
          scheduleSave();
          state.backupDs = await driveListBackups();
          toast('Đã khôi phục dữ liệu từ bản sao lưu.');
        }
      }catch(e){
        console.error('[chitieu] Sao lưu/khôi phục lỗi:', e);
        toast('Không thực hiện được: ' + (e && e.message ? e.message : 'lỗi mạng'), { loai:'err' });
      }finally{
        state.backupBusy = false;
        renderAll();
      }
    })();
  } else if (act === 'addCat'){
    var kind = el.getAttribute('data-kind') || 'chi';
    // hoiChu trả về Promise -> bọc IIFE async. KHÔNG được làm handler thành async:
    // dispatcher trong app.js đọc giá trị trả về đồng bộ, async luôn trả Promise (truthy)
    // nên mọi handler sau nó sẽ bị chặn.
    (async function(){
      var trimmed = await hoiChu('Thêm danh mục ' + (kind === 'thu' ? 'thu' : 'chi'), '', 'Tên danh mục');
      if (!trimmed) return;
      if (catNameExists(kind, trimmed, null)){
        toast('Đã có danh mục trùng tên "'+trimmed+'".', { loai:'err' });
        return;
      }
      state.data.categories[kind].push({ id: slugify(trimmed)+'_'+Date.now().toString(36), ten: trimmed });
      scheduleSave();
      renderDanhMuc();
      toast('Đã thêm danh mục "'+trimmed+'".');
    })();
  } else if (act === 'catUp' || act === 'catDown'){
    // đổi chỗ với dòng liền kề — dùng được trên điện thoại, nơi kéo thả không chạy
    var kindM = el.getAttribute('data-kind') || 'chi';
    var arrM = state.data.categories[kindM] || [];
    var iM = arrM.findIndex(function(x){ return x.id === el.getAttribute('data-id'); });
    var jM = iM + (act === 'catUp' ? -1 : 1);
    if (iM < 0 || jM < 0 || jM >= arrM.length) return true;
    var tmpM = arrM[iM]; arrM[iM] = arrM[jM]; arrM[jM] = tmpM;
    scheduleSave();
    renderDanhMuc();
  } else if (act === 'delCat'){
    var kind2 = el.getAttribute('data-kind') || 'chi';
    var cid = el.getAttribute('data-id');
    /* Xóa ngay + Hoàn tác thay vì hỏi xác nhận: danh mục không mang số tiền
       nào (giao dịch cũ giữ nguyên số liệu), và chỉ cần nhớ object + vị trí cũ
       là khôi phục y nguyên — kể cả đúng thứ tự trong danh sách. */
    var arrC = state.data.categories[kind2] || [];
    var viTri = arrC.findIndex(function(x){ return x.id === cid; });
    if (viTri < 0) return true;
    var banSaoCat = arrC[viTri];
    var ten2 = catTen(kind2, cid);
    arrC.splice(viTri, 1);
    scheduleSave();
    renderDanhMuc();
    toast('Đã xóa danh mục "'+ten2+'".', { giay:6, hoanTac:function(){
      state.data.categories[kind2].splice(viTri, 0, banSaoCat);
      scheduleSave();
      renderDanhMuc();
      toast('Đã hoàn tác danh mục "'+ten2+'".');
    } });
  } else if (act === 'saveSettings'){
    state.data.settings.ngayBatDau = document.getElementById('cfg_ngay').value;
    state.data.settings.soDuDauKy = docSo(document.getElementById('cfg_du').value);
    var duTruVal = document.getElementById('cfg_duTru').value;
    if (duTruVal) state.data.settings.thangBatDauDuTru = duTruVal;
    scheduleSave();
    renderDanhMuc();
    toast('Đã lưu thiết lập.');
  } else if (act === 'lockMonth'){
    var mk3 = document.getElementById('cfg_khoa').value;
    if (!mk3){ toast('Chọn tháng cần khóa sổ.', { loai:'warn' }); return true; }
    var newBal = balanceAtEndOfMonth(mk3);
    var p3 = mk3.split('-'); var ny = parseInt(p3[0],10), nm = parseInt(p3[1],10) + 1;
    if (nm > 12){ nm = 1; ny++; }
    var newStart = ny + '-' + pad2(nm) + '-01';
    (async function(){
      if (!await xacNhan('Khóa sổ đến hết '+monthLabel(mk3)+'?',
            'Số dư đầu kỳ mới: '+fmt(newBal)+'\n'
            + 'Ngày bắt đầu mới: '+newStart+'\n\n'
            + 'Dữ liệu Sổ tay cũ vẫn giữ nguyên, chỉ không tính vào số dư / Dòng tiền nữa.',
            { nguyHiem:true, chuOk:'Khóa sổ' })) return;
      state.data.settings.ngayBatDau = newStart;
      state.data.settings.soDuDauKy = newBal;
      scheduleSave();
      renderDanhMuc();
      toast('Đã khóa sổ đến hết '+monthLabel(mk3)+'.');
    })();
  } else {
    return false;
  }
  return true;
}

function handleDanhMucChange(el){
  if (el.matches('[data-act=catName]')){
    var kindC = el.getAttribute('data-kind') || 'chi';
    var c = state.data.categories[kindC].find(function(x){ return x.id===el.getAttribute('data-id'); });
    if (!c) return true;
    var newName = el.value.trim();
    if (!newName){
      toast('Tên danh mục không được để trống.', { loai:'err' });
      el.value = c.ten;
      return true;
    }
    if (catNameExists(kindC, newName, c.id)){
      toast('Đã có danh mục trùng tên "'+newName+'".', { loai:'err' });
      el.value = c.ten;
      return true;
    }
    c.ten = newName;
    scheduleSave();
    return true;
  } else if (el.matches('[data-act=catBase]')){
    var kindB = el.getAttribute('data-kind') || 'chi';
    var cB = state.data.categories[kindB].find(function(x){ return x.id===el.getAttribute('data-id'); });
    if (cB){ cB.chiTieu = numNonNeg(docSo(el.value)); scheduleSave(); }
    return true;
  } else if (el.matches('[data-act=catNoForecast]')){
    var kindN = el.getAttribute('data-kind') || 'chi';
    var cN = state.data.categories[kindN].find(function(x){ return x.id===el.getAttribute('data-id'); });
    if (cN){ cN.khongDuTru = el.checked; scheduleSave(); }
    return true;
  } else if (el.matches('[data-act=catFixedTarget]')){
    var kindF = el.getAttribute('data-kind') || 'chi';
    var cF = state.data.categories[kindF].find(function(x){ return x.id===el.getAttribute('data-id'); });
    if (cF){ cF.coDinhChiTieu = el.checked; scheduleSave(); }
    return true;
  }
  return false;
}
