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
    html += '<div class="cat-list">';
    cats.forEach(function(c){
      html += '<div style="display:flex;flex-direction:column;gap:4px">'
        + '<div style="display:flex;gap:4px;align-items:center">'
        + '<input type="text" data-act="catName" data-kind="'+kind+'" data-id="'+c.id+'" value="'+(c.ten||'').replace(/"/g,'&quot;')+'" style="flex:1;min-width:0">'
        + '<input type="number" data-act="catBase" data-kind="'+kind+'" data-id="'+c.id+'" value="'+(c.chiTieu||'')+'" placeholder="Chỉ tiêu/tháng" style="width:100px" title="Chỉ tiêu/tháng" min="0">'
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
    + '</div><button class="btn sm" data-act="saveSettings">Lưu</button></div>';
  html += '<div class="card"><h3>Khóa sổ</h3>'
    + '<div class="empty" style="padding:0 0 10px">Chốt số dư đến hết tháng chọn bên dưới, dùng làm số dư đầu kỳ mới. Dữ liệu Sổ tay các tháng trước đó vẫn giữ nguyên để xem lại, chỉ không cộng vào số dư/Dòng tiền nữa.</div>'
    + '<div class="form-row">'
    + '<div><label>Khóa đến hết tháng</label><input type="month" id="cfg_khoa" value="'+monthKey(todayStr())+'"></div>'
    + '</div><button class="btn sm" data-act="lockMonth">Khóa sổ </button></div>';
  root.innerHTML = html;
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
