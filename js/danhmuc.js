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
        + '<div style="display:flex;gap:4px;align-items:center">'
        + '<span class="cat-drag" draggable="true" title="Kéo để đổi thứ tự" style="cursor:grab;color:var(--muted);user-select:none;padding:0 2px">⠿</span>'
        + '<input type="text" data-act="catName" data-kind="'+kind+'" data-id="'+c.id+'" value="'+(c.ten||'').replace(/"/g,'&quot;')+'" style="flex:1;min-width:0">'
        + '<input type="number" data-act="catBase" data-kind="'+kind+'" data-id="'+c.id+'" value="'+(c.chiTieu||'')+'" placeholder="Chỉ tiêu/tháng" style="width:100px" title="Chỉ tiêu/tháng" min="0">'
        + '<button class="icon-btn" data-act="catUp" data-kind="'+kind+'" data-id="'+c.id+'" title="Lên trên"'+(idx===0?' disabled style="opacity:.3"':'')+'>▲</button>'
        + '<button class="icon-btn" data-act="catDown" data-kind="'+kind+'" data-id="'+c.id+'" title="Xuống dưới"'+(idx===cats.length-1?' disabled style="opacity:.3"':'')+'>▼</button>'
        + '<button class="icon-btn" data-act="delCat" data-kind="'+kind+'" data-id="'+c.id+'">🗑</button>'
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
    + '<div><label>Số dư</label><input type="number" id="cfg_du" value="'+(state.data.settings.soDuDauKy||0)+'"></div>'
    + '<div><label>Tháng bắt đầu dự trù</label><input type="month" id="cfg_duTru" value="'+(state.data.settings.thangBatDauDuTru||'')+'"></div>'
    + '</div>'
    + '<div class="empty" style="padding:0 0 10px">"Tháng bắt đầu dự trù" là tháng ĐẦY ĐỦ đầu tiên được dùng để tính TB gợi ý ở tab Dòng tiền. Tháng lẻ lúc mới bắt đầu dùng app (ghi từ giữa tháng) nên bỏ qua, nếu không TB sẽ bị kéo xuống sai. Mốc này KHÔNG bị khóa sổ làm đổi.</div>'
    + '<button class="btn sm" data-act="saveSettings">Lưu</button></div>';
  html += '<div class="card"><h3>Khóa sổ</h3>'
    + '<div class="empty" style="padding:0 0 10px">Chốt số dư đến hết tháng chọn bên dưới, dùng làm số dư đầu kỳ mới. Dữ liệu Sổ tay các tháng trước đó vẫn giữ nguyên để xem lại, chỉ không cộng vào số dư/Dòng tiền nữa.</div>'
    + '<div class="form-row">'
    + '<div><label>Khóa đến hết tháng</label><input type="month" id="cfg_khoa" value="'+monthKey(todayStr())+'"></div>'
    + '</div><button class="btn sm" data-act="lockMonth">Khóa sổ </button></div>';
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

/* ---- Danh mục: helper validate trùng tên ---- */
function catNameExists(kind, name, excludeId){
  var n = name.trim().toLowerCase();
  return state.data.categories[kind].some(function(x){ return x.id !== excludeId && x.ten.trim().toLowerCase() === n; });
}

/* ---- Danh mục: handlers ---- */
function handleDanhMucAction(act, el){
  if (act === 'addCat'){
    var kind = el.getAttribute('data-kind') || 'chi';
    var name2 = prompt('Tên danh mục mới:');
    if (name2 && name2.trim()){
      var trimmed = name2.trim();
      if (catNameExists(kind, trimmed, null)){
        alert('Đã có danh mục trùng tên "'+trimmed+'".');
        return true;
      }
      state.data.categories[kind].push({ id: slugify(trimmed)+'_'+Date.now().toString(36), ten: trimmed });
      scheduleSave();
      renderDanhMuc();
    }
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
    if (confirm('Xóa danh mục này? (giao dịch cũ vẫn giữ nguyên số liệu)')){
      state.data.categories[kind2] = state.data.categories[kind2].filter(function(x){return x.id!==cid;});
      scheduleSave();
      renderDanhMuc();
    }
  } else if (act === 'saveSettings'){
    state.data.settings.ngayBatDau = document.getElementById('cfg_ngay').value;
    state.data.settings.soDuDauKy = num(document.getElementById('cfg_du').value);
    var duTruVal = document.getElementById('cfg_duTru').value;
    if (duTruVal) state.data.settings.thangBatDauDuTru = duTruVal;
    scheduleSave();
    renderDanhMuc();
    alert('Đã lưu.');
  } else if (act === 'lockMonth'){
    var mk3 = document.getElementById('cfg_khoa').value;
    if (!mk3){ alert('Chọn tháng cần khóa sổ.'); return true; }
    var newBal = balanceAtEndOfMonth(mk3);
    var p3 = mk3.split('-'); var ny = parseInt(p3[0],10), nm = parseInt(p3[1],10) + 1;
    if (nm > 12){ nm = 1; ny++; }
    var newStart = ny + '-' + pad2(nm) + '-01';
    if (!confirm('Khóa sổ đến hết '+monthLabel(mk3)+'?\nSố dư đầu kỳ mới: '+fmt(newBal)+'\nNgày bắt đầu mới: '+newStart+'\n\nDữ liệu Sổ tay cũ vẫn giữ nguyên, chỉ không tính vào số dư/Dòng tiền nữa.')) return true;
    state.data.settings.ngayBatDau = newStart;
    state.data.settings.soDuDauKy = newBal;
    scheduleSave();
    renderDanhMuc();
    alert('Đã khóa sổ đến hết '+monthLabel(mk3)+'.');
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
      alert('Tên danh mục không được để trống.');
      el.value = c.ten;
      return true;
    }
    if (catNameExists(kindC, newName, c.id)){
      alert('Đã có danh mục trùng tên "'+newName+'".');
      el.value = c.ten;
      return true;
    }
    c.ten = newName;
    scheduleSave();
    return true;
  } else if (el.matches('[data-act=catBase]')){
    var kindB = el.getAttribute('data-kind') || 'chi';
    var cB = state.data.categories[kindB].find(function(x){ return x.id===el.getAttribute('data-id'); });
    if (cB){ cB.chiTieu = numNonNeg(el.value); scheduleSave(); }
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
