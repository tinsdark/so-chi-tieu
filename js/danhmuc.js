"use strict";
/* ====================================================================
   danhmuc.js — tab "Danh mục": quản lý danh mục thu/chi, số dư đầu kỳ,
   khóa sổ. Có validate chặn tên danh mục rỗng/trùng.
   Cần state.js, drive-sync.js load trước.
   ==================================================================== */

function categoryCardHtml(kind, title, cats){
  var html = '<div class="card '+(kind === 'thu' ? 'k-asset' : 'k-debt')+'"><h3>'+title+'</h3>';
  if (!cats.length){
    html += '<div class="empty">Chưa có danh mục nào.</div>';
  } else {
    html += '<div class="cat-list" data-kind="'+kind+'">';
    cats.forEach(function(c, idx){
      html += '<div class="cat-item" data-kind="'+kind+'" data-id="'+c.id+'" style="display:flex;flex-direction:column;gap:4px">'
        /* Dòng 1 chỉ có tay cầm kéo + TÊN để tên không bị bóp còn mấy ký tự;
           chỉ tiêu và các nút lên/xuống/xóa xuống dòng 2. */
        + '<div style="display:flex;gap:4px;align-items:center">'
        + '<span class="cat-drag" draggable="true" title="Kéo để đổi thứ tự" style="cursor:grab;color:var(--muted);user-select:none;padding:0 2px">⠿</span>'
        + '<input type="color" class="cat-color" data-act="catMau" data-kind="'+kind+'" data-id="'+c.id+'" value="'+catMau(kind, c.id)+'" title="Màu danh mục (dùng ở biểu đồ)" aria-label="Màu danh mục '+esc(c.ten)+'">'
        + (c.mau ? '<button class="icon-btn" data-act="catMauReset" data-kind="'+kind+'" data-id="'+c.id+'" title="Về màu mặc định" aria-label="Về màu mặc định '+esc(c.ten)+'">'+icon('undo')+'</button>' : '')
        + '<input type="text" data-act="catName" data-kind="'+kind+'" data-id="'+c.id+'" value="'+(c.ten||'').replace(/"/g,'&quot;')+'" style="flex:1;min-width:0">'
        + '</div>'
        + '<div style="display:flex;gap:4px;align-items:center">'
        + '<input type="text" inputmode="numeric" autocomplete="off" class="money" data-act="catBase" data-kind="'+kind+'" data-id="'+c.id+'" value="'+veSo(c.chiTieu)+'" placeholder="Chỉ tiêu/tháng" style="flex:1;min-width:0" title="Chỉ tiêu/tháng">'
        + '<button class="icon-btn" data-act="catUp" data-kind="'+kind+'" data-id="'+c.id+'" title="Lên trên" aria-label="Lên trên"'+(idx===0?' disabled style="opacity:.3"':'')+'>'+icon('arrow-up')+'</button>'
        + '<button class="icon-btn" data-act="catDown" data-kind="'+kind+'" data-id="'+c.id+'" title="Xuống dưới" aria-label="Xuống dưới"'+(idx===cats.length-1?' disabled style="opacity:.3"':'')+'>'+icon('arrow-down')+'</button>'
        + '<button class="icon-btn" data-act="delCat" data-kind="'+kind+'" data-id="'+c.id+'" title="Xóa danh mục" aria-label="Xóa danh mục '+esc(c.ten)+'">'+icon('trash')+'</button>'
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
    + '<div><label>Tháng bắt đầu dự trù</label><input type="month" id="cfg_duTru" value="'+(state.data.settings.thangBatDauDuTru||'')+'"></div>'
    + '</div>'
    + ghiChuGon('"Tháng bắt đầu dự trù" là tháng ĐẦY ĐỦ đầu tiên được dùng để tính TB gợi ý ở tab Dòng tiền. Tháng lẻ lúc mới bắt đầu dùng app (ghi từ giữa tháng) nên bỏ qua, nếu không TB sẽ bị kéo xuống sai. Mốc này KHÔNG bị khóa sổ làm đổi.', 'Tháng bắt đầu dự trù là gì?')
    + '<button class="btn sm" data-act="saveSettings">Lưu</button></div>';
  html += viCardHtml();
  html += dkCardHtml();
  html += mtCardHtml();
  html += '<div class="card"><h3>Khóa sổ</h3>'
    + ghiChuGon('Chốt số dư đến hết tháng chọn bên dưới, dùng làm số dư đầu kỳ mới. Dữ liệu Sổ tay các tháng trước đó vẫn giữ nguyên để xem lại, chỉ không cộng vào số dư/Dòng tiền nữa.', 'Khóa sổ là gì?')
    + '<div class="form-row">'
    + '<div><label>Khóa đến hết tháng</label><input type="month" id="cfg_khoa" value="'+monthKey(todayStr())+'"></div>'
    + '</div><button class="btn sm" data-act="lockMonth">Khóa sổ </button></div>';
  html += caiAppCardHtml();
  html += backupCardHtml();
  html += taiKhoanCardHtml();
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
      if (item.getAttribute('data-id') !== dragCat.id) item.style.boxShadow = 'inset 0 0 0 2px var(--primary)';
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

/* ---- Ví / nguồn tiền: số dư đầu kỳ từng ví. Sửa là lưu ngay (không qua nút Lưu chung) ---- */
function viCardHtml(){
  var ws = state.data.wallets || [];
  var tong = ws.reduce(function(s, w){ return s + num(w.soDuDauKy); }, 0);
  var h = '<div class="card k-wal"><h3>Ví / nguồn tiền</h3>'
    + ghiChuGon('Mỗi ví (tiền mặt, từng tài khoản ngân hàng, ví điện tử...) có số dư đầu kỳ riêng tính từ "Ngày bắt đầu" ở trên. '
    + 'Tổng các ví chính là số dư đầu kỳ của cả sổ. Ví đã có giao dịch thì không xóa được, chỉ đổi tên.', 'Ví / nguồn tiền hoạt động thế nào?');
  ws.forEach(function(w){
    var dung = viDangDung(w.id);
    h += '<div class="form-row vi-row" style="align-items:flex-end">'
      + '<div><label>Tên ví</label><input type="text" data-act="viTen" data-id="'+esc(w.id)+'" value="'+esc(w.ten)+'"></div>'
      + '<div><label>Số dư đầu kỳ</label><input type="text" inputmode="numeric" autocomplete="off" class="money" data-act="viDu" data-id="'+esc(w.id)+'" value="'+veSo(w.soDuDauKy)+'" placeholder="0"></div>'
      + '<div style="flex:0"><label class="vi-md" title="Ví điền sẵn khi nhập giao dịch, thêm khoản vay, khoản định kỳ mới"><input type="radio" name="viMd" data-act="viMd" data-id="'+esc(w.id)+'"'+(w.id === viMacDinhId() ? ' checked' : '')+'> Mặc định</label></div>'
      + '<div style="flex:0"><button class="icon-btn" data-act="viXoa" data-id="'+esc(w.id)+'" title="'+(dung ? 'Ví đang có '+dung+' giao dịch/khoản liên quan nên không xóa được' : 'Xóa ví này')+'" aria-label="Xóa ví '+esc(w.ten)+'"'
      + ((ws.length < 2 || dung) ? ' disabled style="opacity:.35"' : '')+'>'+icon('trash')+'</button></div></div>';
  });
  return h + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:6px">'
    + '<button class="btn secondary sm" data-act="viThem">+ Thêm ví</button>'
    + '<span style="color:var(--muted);font-size:13px">Tổng số dư đầu kỳ: <b style="color:var(--text)">'+fmt(Math.round(tong))+'</b></span></div></div>';
}

/* ---- Mục tiêu tiết kiệm: khai báo (tiến độ hiện ở Sổ tay, logic ở state.js) ---- */
function mtCardHtml(){
  var gs = state.data.mucTieu || [];
  var coVi = (state.data.wallets || []).length > 1;
  var h = '<div class="card k-goal"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:8px">Mục tiêu tiết kiệm'
    + '<button class="btn secondary sm" data-act="mtThem">+ Thêm</button></h3>'
    + '<div class="empty" style="padding:0 0 10px;text-align:left">Đặt số tiền cần có và hạn chót, app tính còn thiếu và cần để dành bao nhiêu mỗi tháng.'
    + (coVi ? ' <b>Gắn một ví</b> (ví để dành riêng) thì số đã gom tự lấy từ số dư ví đó; không gắn thì tự bấm "+ Gom thêm" ở Sổ tay.' : ' Tạo thêm ví ở mục "Ví / nguồn tiền" để gắn mục tiêu vào một ví để dành.')
    + ' Mục tiêu chỉ để theo dõi, không ghi thu/chi và không đổi số dư.</div>';
  if (state.mtForm){
    var ed = state.mtForm.id ? gs.find(function(g){ return g.id === state.mtForm.id; }) : null;
    var g0 = ed || { ten:'', soTien:'', hanChot:'', walletId:'', daGom:'' };
    h += '<div class="form-row">'
      + '<div><label>Tên mục tiêu</label><input type="text" id="mt_ten" value="'+esc(g0.ten)+'" placeholder="Mua xe, Du lịch..."></div>'
      + '<div><label>Số tiền cần có</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="mt_tien" value="'+veSo(g0.soTien)+'" placeholder="0"></div>'
      + '<div><label>Hạn chót (tùy chọn)</label><input type="month" id="mt_han" value="'+esc(g0.hanChot || '')+'"></div>'
      + (coVi ? '<div><label>Gắn ví</label><select id="mt_vi"><option value="">Không gắn — tự gom tay</option>'+viOptionsHtml(g0.walletId)+'</select></div>' : '')
      + '<div><label>Đã gom (khi gom tay)</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="mt_gom" value="'+veSo(g0.daGom)+'" placeholder="0"></div>'
      + '</div><div style="display:flex;gap:8px;margin-bottom:12px">'
      + '<button class="btn sm" data-act="mtLuu">'+(ed ? 'Cập nhật' : 'Lưu')+'</button>'
      + '<button class="btn secondary sm" data-act="mtHuy">Hủy</button></div>';
  }
  if (!gs.length && !state.mtForm){
    h += '<div class="empty">Chưa có mục tiêu nào.</div>';
  } else if (gs.length){
    h += '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Tên</th><th>Cần có</th><th>Hạn chót</th><th style="text-align:left">Nguồn</th><th class="actions-col"></th></tr></thead><tbody>';
    gs.forEach(function(g){
      h += '<tr><td style="text-align:left">'+esc(g.ten)+'</td><td>'+fmt(Math.round(g.soTien))+'</td>'
        + '<td>'+(g.hanChot ? g.hanChot.slice(5)+'/'+g.hanChot.slice(0, 4) : '—')+'</td>'
        + '<td style="text-align:left">'+(g.walletId && walletById(g.walletId) ? 'Ví: '+esc(viTen(g.walletId)) : 'Gom tay: '+fmt(Math.round(num(g.daGom))))+'</td>'
        + '<td class="actions-col"><button class="icon-btn" data-act="mtSua" data-id="'+esc(g.id)+'" title="Sửa" aria-label="Sửa '+esc(g.ten)+'">'+icon('pencil')+'</button>'
        + '<button class="icon-btn" data-act="mtXoa" data-id="'+esc(g.id)+'" title="Xóa" aria-label="Xóa '+esc(g.ten)+'">'+icon('trash')+'</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  return h + '</div>';
}

/* ---- Giao dịch định kỳ: khai báo mẫu (nhắc ở Sổ tay, logic ở state.js) ----
   Loại các danh mục của Vay - Nợ: tiền vay/trả nợ đã có lịch riêng, khai ở đây là trùng. */
var DK_CAT_LOAI = { nhanTienVay: 1, thuHoiChoVay: 1, choVay: 1, traNo: 1 };
function dkCatOptions(sel){
  function nhom(kind, nhan){
    var o = (state.data.categories[kind] || []).filter(function(c){ return !DK_CAT_LOAI[c.id]; }).map(function(c){
      var v = kind + '|' + c.id;
      return '<option value="'+esc(v)+'"'+(v === sel ? ' selected' : '')+'>'+esc(c.ten)+'</option>';
    }).join('');
    return o ? '<optgroup label="'+nhan+'">'+o+'</optgroup>' : '';
  }
  return '<option value="">— chọn danh mục —</option>' + nhom('thu', 'Thu') + nhom('chi', 'Chi');
}
function dkCardHtml(){
  var ds = state.data.dinhKy || [];
  var h = '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between;gap:8px">Giao dịch định kỳ'
    + '<button class="btn secondary sm" data-act="dkThem">+ Thêm</button></h3>'
    + ghiChuGon('Lương, tiền nhà, tiền net... App <b>không tự ghi tiền</b>: tới ngày mà tháng đó chưa ghi thì hiện nhắc ở đầu Sổ tay, bấm "Ghi vào Sổ tay" mới có giao dịch.', 'Giao dịch định kỳ hoạt động thế nào?');
  if (state.dkForm){
    var ed = state.dkForm.id ? ds.find(function(k){ return k.id === state.dkForm.id; }) : null;
    var k0 = ed || { ten:'', kind:'chi', catId:'', soTien:'', ngay:'', walletId: viMacDinhId(), ghiChu:'' };
    h += '<div class="form-row">'
      + '<div><label>Tên</label><input type="text" id="dk_ten" value="'+esc(k0.ten)+'" placeholder="Tiền nhà, Lương..."></div>'
      + '<div><label>Danh mục</label><select id="dk_cat">'+dkCatOptions(k0.catId ? k0.kind+'|'+k0.catId : '')+'</select></div>'
      + '<div><label>Số tiền</label><input type="text" inputmode="numeric" autocomplete="off" class="money" id="dk_tien" value="'+veSo(k0.soTien)+'" placeholder="0"></div>'
      + '<div><label>Ngày trong tháng (1-31)</label><input type="number" id="dk_ngay" min="1" max="31" value="'+(k0.ngay || '')+'" placeholder="5"></div>'
      + ((state.data.wallets || []).length > 1 ? '<div><label>Ví</label><select id="dk_vi">'+viOptionsHtml(k0.walletId)+'</select></div>' : '')
      + '<div><label>Ghi chú (tùy chọn)</label><input type="text" id="dk_note" value="'+esc(k0.ghiChu || '')+'"></div>'
      + '</div><div style="display:flex;gap:8px;margin-bottom:12px">'
      + '<button class="btn sm" data-act="dkLuu">'+(ed ? 'Cập nhật' : 'Lưu')+'</button>'
      + '<button class="btn secondary sm" data-act="dkHuy">Hủy</button></div>';
  }
  if (!ds.length && !state.dkForm){
    h += '<div class="empty">Chưa có khoản định kỳ nào.</div>';
  } else if (ds.length){
    h += '<div class="table-wrap"><table><thead><tr><th>Bật</th><th style="text-align:left">Tên</th><th style="text-align:left">Danh mục</th><th>Số tiền</th><th>Ngày</th><th class="actions-col"></th></tr></thead><tbody>';
    ds.forEach(function(k){
      h += '<tr><td><input type="checkbox" data-act="dkBat" data-id="'+esc(k.id)+'"'+(k.bat ? ' checked' : '')+' aria-label="Bật nhắc '+esc(k.ten)+'"></td>'
        + '<td style="text-align:left">'+esc(k.ten)+'</td>'
        + '<td style="text-align:left">'+(k.kind === 'thu' ? 'Thu' : 'Chi')+' · '+esc(catTen(k.kind, k.catId))+'</td>'
        + '<td style="color:var(--'+(k.kind === 'thu' ? 'green' : 'red')+')">'+fmt(Math.round(k.soTien))+'</td>'
        + '<td>ngày '+k.ngay+'</td>'
        + '<td class="actions-col"><button class="icon-btn" data-act="dkSua" data-id="'+esc(k.id)+'" title="Sửa" aria-label="Sửa '+esc(k.ten)+'">'+icon('pencil')+'</button>'
        + '<button class="icon-btn" data-act="dkXoa" data-id="'+esc(k.id)+'" title="Xóa" aria-label="Xóa '+esc(k.ten)+'">'+icon('trash')+'</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  return h + '</div>';
}

/* ---- Cài lên màn hình chính (PWA): hướng dẫn theo thiết bị ---- */
function caiAppCardHtml(){
  var h = '<div class="card"><h3>Cài lên điện thoại / máy tính</h3>';
  if (dangChayNhuApp()){
    return h + '<div class="empty" style="padding:0;text-align:left">'+icon('check')+' Đang chạy như một app từ màn hình chính.</div></div>';
  }
  var buoc = function(t){ return '<li>'+t+'</li>'; };
  h += '<div class="empty" style="padding:0 0 8px;text-align:left">Có biểu tượng ở màn hình chính, mở toàn màn hình như app, không cần gõ địa chỉ web.</div>';
  h += '<div class="cai-app"><b>iPhone / iPad (dùng Safari)</b><ol>'
    + buoc('Mở trang này bằng <b>Safari</b> (không phải Chrome trong app khác).')
    + buoc('Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên ↑) ở thanh dưới.')
    + buoc('Kéo xuống chọn <b>Thêm vào Màn hình chính</b> → <b>Thêm</b>.')
    + '</ol></div>';
  h += '<div class="cai-app"><b>Android (Chrome)</b><ol>'
    + buoc('Bấm menu <b>⋮</b> ở góc trên → <b>Cài đặt ứng dụng</b> (hoặc <b>Thêm vào Màn hình chính</b>).')
    + '</ol></div>';
  h += '<div class="cai-app"><b>Máy tính (Chrome / Edge)</b><ol>'
    + buoc('Bấm biểu tượng <b>cài đặt</b> ở cuối thanh địa chỉ → <b>Cài đặt</b>.')
    + '</ol></div>';
  h += '<div class="empty" style="padding:8px 0 0;text-align:left">Lưu ý: app trên màn hình chính có bộ nhớ riêng nên <b>lần đầu phải đăng nhập Google lại trong app</b> (dữ liệu vẫn là file trên Drive, không mất). '
    + 'Sau đó mở lại trong vòng khoảng 1 giờ thì vào thẳng; quá 1 giờ bấm đăng nhập 1 lần.</div>';
  return h + '</div>';
}

/* ---- Tài khoản: Đăng xuất để ở đây (không ở thanh đầu trang, bấm nhầm là mất bản lưu ngoại tuyến) ---- */
function taiKhoanCardHtml(){
  return '<div class="card"><h3>Tài khoản</h3>'
    + '<div class="empty" style="padding:0 0 10px;text-align:left">Đăng xuất khỏi Google trên máy này. Dữ liệu trên Google Drive vẫn còn nguyên; chỉ bản lưu để mở ngoại tuyến trên máy này bị xóa.</div>'
    + '<button class="btn danger" data-act="dangXuat">Đăng xuất</button></div>';
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
    + ghiChuGon('Mỗi ngày, lần đầu mở app, app tự lưu 1 bản dữ liệu lên Drive và giữ '+BACKUP_GIU+' bản gần nhất. '
    + 'Khôi phục sẽ thay toàn bộ dữ liệu hiện tại bằng bản đã chọn — dữ liệu hiện tại cũng được sao lưu lại trước đó nên vẫn quay lại được.', 'Sao lưu hoạt động thế nào?')
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
    + '<button class="btn sm" data-act="bkXem"'+(state.backupBusy?' disabled':'')+'>'+(state.backupDs ? icon('refresh')+' Tải lại danh sách' : 'Xem các bản sao lưu')+'</button>'
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
  } else if (act === 'dangXuat'){
    (async function(){
      if (!await xacNhan('Đăng xuất khỏi Google?',
            'Dữ liệu trên Google Drive vẫn còn. Bản lưu để mở ngoại tuyến trên máy này sẽ bị xóa; các thay đổi chưa kịp đồng bộ (nếu có) cũng nằm trong đó.' + (state.dirty ? '\n\nĐang có thay đổi CHƯA đồng bộ lên Drive.' : ''),
            { nguyHiem:true, chuOk:'Đăng xuất' })) return;
      signOut();
    })();
  } else if (act === 'catMauReset'){
    var cR = state.data.categories[el.getAttribute('data-kind') || 'chi'].find(function(x){ return x.id === el.getAttribute('data-id'); });
    if (cR){ cR.mau = ''; scheduleSave(); renderDanhMuc(); }
  } else if (act === 'mtThem'){
    state.mtForm = { id: '' }; renderDanhMuc();
  } else if (act === 'mtSua'){
    state.mtForm = { id: el.getAttribute('data-id') }; renderDanhMuc();
  } else if (act === 'mtHuy'){
    state.mtForm = null; renderDanhMuc();
  } else if (act === 'mtLuu'){
    var mtTen = (document.getElementById('mt_ten') || {}).value.trim();
    var mtTien = numNonNeg(docSo((document.getElementById('mt_tien') || {}).value));
    var mtHan = (document.getElementById('mt_han') || {}).value || '';
    var mtVi = (document.getElementById('mt_vi') || {}).value || '';
    var mtGom = numNonNeg(docSo((document.getElementById('mt_gom') || {}).value));
    if (!mtTen){ toast('Nhập tên mục tiêu.', { loai:'warn' }); return true; }
    if (mtTien <= 0){ toast('Số tiền cần có phải lớn hơn 0.', { loai:'warn' }); return true; }
    var mtObj = { ten: mtTen, soTien: mtTien, hanChot: mtHan, walletId: walletById(mtVi) ? mtVi : '', daGom: mtGom };
    var mtCu = state.mtForm && state.mtForm.id ? state.data.mucTieu.find(function(g){ return g.id === state.mtForm.id; }) : null;
    if (mtCu){ Object.assign(mtCu, mtObj); }
    else { mtObj.id = 'mt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); state.data.mucTieu.push(mtObj); }
    state.mtForm = null;
    scheduleSave();
    renderDanhMuc();
    toast('Đã lưu mục tiêu "'+mtTen+'".');
  } else if (act === 'mtXoa'){
    var mtXi = state.data.mucTieu.findIndex(function(g){ return g.id === el.getAttribute('data-id'); });
    if (mtXi < 0) return true;
    var mtXg = state.data.mucTieu.splice(mtXi, 1)[0];
    scheduleSave();
    renderDanhMuc();
    toast('Đã xóa mục tiêu "'+mtXg.ten+'".', { hoanTac: function(){
      state.data.mucTieu.splice(Math.min(mtXi, state.data.mucTieu.length), 0, mtXg);
      scheduleSave(); renderDanhMuc();
    } });
  } else if (act === 'dkThem'){
    state.dkForm = { id: '' }; renderDanhMuc();
    var dkO = document.getElementById('dk_ten'); if (dkO) dkO.focus();
  } else if (act === 'dkSua'){
    state.dkForm = { id: el.getAttribute('data-id') }; renderDanhMuc();
  } else if (act === 'dkHuy'){
    state.dkForm = null; renderDanhMuc();
  } else if (act === 'dkLuu'){
    var dkTen = (document.getElementById('dk_ten') || {}).value.trim();
    var dkCat = ((document.getElementById('dk_cat') || {}).value || '').split('|');
    var dkTien = numNonNeg(docSo((document.getElementById('dk_tien') || {}).value));
    var dkNgay = Math.round(num((document.getElementById('dk_ngay') || {}).value));
    if (!dkTen){ toast('Nhập tên khoản định kỳ.', { loai:'warn' }); return true; }
    if (dkCat.length !== 2 || !dkCat[1]){ toast('Chọn danh mục.', { loai:'warn' }); return true; }
    if (dkTien <= 0){ toast('Số tiền phải lớn hơn 0.', { loai:'warn' }); return true; }
    if (dkNgay < 1 || dkNgay > 31){ toast('Ngày trong tháng phải từ 1 đến 31.', { loai:'warn' }); return true; }
    var dkVi = (document.getElementById('dk_vi') || {}).value;
    var dkObj = { ten: dkTen, kind: dkCat[0], catId: dkCat[1], soTien: dkTien, ngay: dkNgay,
                  walletId: walletById(dkVi) ? dkVi : viMacDinhId(),
                  ghiChu: (document.getElementById('dk_note') || {}).value.trim() };
    var dkCu = state.dkForm && state.dkForm.id ? state.data.dinhKy.find(function(k){ return k.id === state.dkForm.id; }) : null;
    if (dkCu){ Object.assign(dkCu, dkObj); }
    else { dkObj.id = 'dk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); dkObj.bat = true; dkObj.bo = []; state.data.dinhKy.push(dkObj); }
    state.dkForm = null;
    scheduleSave();
    renderDanhMuc();
    toast('Đã lưu khoản định kỳ "'+dkTen+'".');
  } else if (act === 'dkXoa'){
    var dkXi = state.data.dinhKy.findIndex(function(k){ return k.id === el.getAttribute('data-id'); });
    if (dkXi < 0) return true;
    var dkXk = state.data.dinhKy.splice(dkXi, 1)[0];
    scheduleSave();
    renderDanhMuc();
    toast('Đã xóa "'+dkXk.ten+'". Các giao dịch đã ghi từ khoản này ở Sổ tay vẫn giữ nguyên.', { hoanTac: function(){
      state.data.dinhKy.splice(Math.min(dkXi, state.data.dinhKy.length), 0, dkXk);
      scheduleSave(); renderDanhMuc();
    } });
  } else if (act === 'viThem'){
    (async function(){
      var ten = await hoiChu('Thêm ví / nguồn tiền', 'Ví dụ: Tiền mặt, Vietcombank, Momo.', 'Tên ví');
      if (!ten) return;
      var trung = state.data.wallets.some(function(w){ return w.ten.trim().toLowerCase() === ten.trim().toLowerCase(); });
      if (trung){ toast('Đã có ví trùng tên "'+ten+'".', { loai:'err' }); return; }
      state.data.wallets.push({ id: 'w_' + slugify(ten) + '_' + Date.now().toString(36), ten: ten, soDuDauKy: 0 });
      scheduleSave();
      renderDanhMuc();
      toast('Đã thêm ví "'+ten+'". Nhập số dư đầu kỳ của ví nếu có.');
    })();
  } else if (act === 'viXoa'){
    var viX = walletById(el.getAttribute('data-id'));
    if (!viX) return true;
    var nDung = viDangDung(viX.id);
    if (state.data.wallets.length < 2){ toast('Phải còn ít nhất 1 ví.', { loai:'warn' }); return true; }
    if (nDung > 0){ toast('Ví "'+viX.ten+'" còn '+nDung+' giao dịch/khoản liên quan, không xóa được.', { loai:'warn' }); return true; }
    (async function(){
      if (!await xacNhan('Xóa ví "'+viX.ten+'"?',
            'Số dư đầu kỳ '+fmt(Math.round(num(viX.soDuDauKy)))+' của ví này sẽ bị bỏ khỏi tổng số dư.',
            { nguyHiem:true, chuOk:'Xóa ví' })) return;
      state.data.wallets = state.data.wallets.filter(function(w){ return w.id !== viX.id; });
      if (state.data.settings.viMacDinh === viX.id) state.data.settings.viMacDinh = '';
      state.data.settings.soDuDauKy = state.data.wallets.reduce(function(s, w){ return s + num(w.soDuDauKy); }, 0);
      scheduleSave();
      renderDanhMuc();
      toast('Đã xóa ví "'+viX.ten+'".');
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
    // (comment trên đúng với danh mục TRỐNG; danh mục đã có tiền thì xóa là làm tiền biến khỏi form sửa/Dòng tiền)
    if (CAT_HE_THONG[kind2] && CAT_HE_THONG[kind2][cid]){
      toast('"'+catTen(kind2, cid)+'" là danh mục của tab Vay - Nợ, không xóa được.', { loai:'warn' });
      return true;
    }
    var nNgayCoTien = catDangCoTien(kind2, cid);
    if (nNgayCoTien > 0){
      toast('Danh mục "'+catTen(kind2, cid)+'" còn tiền ở '+nNgayCoTien+' ngày trong Sổ tay, không xóa được. Đổi tên nếu muốn dùng tên khác.', { loai:'warn' });
      return true;
    }
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
    var duTruVal = document.getElementById('cfg_duTru').value;
    if (duTruVal) state.data.settings.thangBatDauDuTru = duTruVal;
    scheduleSave();
    renderDanhMuc();
    toast('Đã lưu thiết lập.');
  } else if (act === 'lockMonth'){
    var mk3 = document.getElementById('cfg_khoa').value;
    if (!mk3){ toast('Chọn tháng cần khóa sổ.', { loai:'warn' }); return true; }
    var p3 = mk3.split('-'); var ny = parseInt(p3[0],10), nm = parseInt(p3[1],10) + 1;
    if (nm > 12){ nm = 1; ny++; }
    var newStart = ny + '-' + pad2(nm) + '-01';
    // mốc chỉ được tiến lên: lùi mốc là tính lại các tháng đã khóa trên một số dư đầu kỳ của thời điểm sau -> số dư sai
    var startHienTai = state.data.settings.ngayBatDau || '';
    if (startHienTai && newStart <= startHienTai){
      toast('Sổ đã khóa đến trước '+ngayVN(startHienTai)+'. Chọn tháng sau mốc này để khóa tiếp.', { loai:'warn' });
      return true;
    }
    var newBal = balanceAtEndOfMonth(mk3);
    (async function(){
      if (!await xacNhan('Khóa sổ đến hết '+monthLabel(mk3)+'?',
            'Số dư đầu kỳ mới: '+fmt(newBal)+'\n'
            + 'Ngày bắt đầu mới: '+newStart+'\n\n'
            + 'Dữ liệu Sổ tay cũ vẫn giữ nguyên, chỉ không tính vào số dư / Dòng tiền nữa.',
            { nguyHiem:true, chuOk:'Khóa sổ' })) return;
      viChotSoDuDauKy(mk3 + '-31');     // chốt từng ví theo mốc CŨ, trước khi đổi ngayBatDau
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
  if (el.matches('[data-act=catMau]')){
    var cM = state.data.categories[el.getAttribute('data-kind') || 'chi'].find(function(x){ return x.id === el.getAttribute('data-id'); });
    if (cM && /^#[0-9a-f]{6}$/i.test(el.value)){ cM.mau = el.value; scheduleSave(); renderDanhMuc(); }
    return true;
  } else if (el.matches('[data-act=dkBat]')){
    var dkB = (state.data.dinhKy || []).find(function(k){ return k.id === el.getAttribute('data-id'); });
    if (dkB){ dkB.bat = el.checked; scheduleSave(); }
    return true;
  } else if (el.matches('[data-act=viTen]')){
    var wT = walletById(el.getAttribute('data-id'));
    if (!wT) return true;
    var tenMoi = el.value.trim();
    var trungT = state.data.wallets.some(function(w){ return w.id !== wT.id && w.ten.trim().toLowerCase() === tenMoi.toLowerCase(); });
    if (!tenMoi || trungT){
      toast(!tenMoi ? 'Tên ví không được để trống.' : 'Đã có ví trùng tên "'+tenMoi+'".', { loai:'err' });
      el.value = wT.ten;
      return true;
    }
    wT.ten = tenMoi;
    scheduleSave();
    return true;
  } else if (el.matches('[data-act=viMd]')){
    // chỉ ví đang tích mới có hiệu lực; ví khác không còn là mặc định. Không đụng gì tới dòng/khoản đã ghi.
    var wM = walletById(el.getAttribute('data-id'));
    if (wM && el.checked){
      state.data.settings.viMacDinh = wM.id;
      state.qa.wallet = '';      // thẻ Ghi nhanh quay về ví mặc định mới
      scheduleSave();
      renderDanhMuc();
      toast('Đã đặt "'+wM.ten+'" làm tài khoản mặc định.');
    }
    return true;
  } else if (el.matches('[data-act=viDu]')){
    var wD = walletById(el.getAttribute('data-id'));
    if (!wD) return true;
    wD.soDuDauKy = docSo(el.value);       // số dư đầu kỳ được phép âm (thẻ tín dụng, nợ), khác ô nhập thu/chi
    state.data.settings.soDuDauKy = state.data.wallets.reduce(function(s, w){ return s + num(w.soDuDauKy); }, 0);
    scheduleSave();
    renderDanhMuc();                      // cập nhật dòng "Tổng số dư đầu kỳ"
    return true;
  } else if (el.matches('[data-act=catName]')){
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
