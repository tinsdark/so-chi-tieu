"use strict";
/* ====================================================================
   danhmuc.js — tab "Danh mục": quản lý danh mục thu/chi, số dư đầu kỳ,
   khóa sổ. Có validate chặn tên danh mục rỗng/trùng.
   Cần state.js, drive-sync.js load trước.
   ==================================================================== */

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

/* ---- giao diện tab Danh mục: mỗi mục là 1 hàng gọn, chạm vào mở bảng trượt để sửa ---- */
function dmSec(nhan){ return '<div class="dm-sec">'+nhan+'</div>'; }
function dmGo(){ return icon('chev', 'dm-go'); }
function dmHead(tieuDe, nut){ return '<div class="dm-h"><h3>'+tieuDe+'</h3>'+(nut || '')+'</div>'; }
function dmThangDM(mk){ return mk ? mk.slice(5, 7) + '/' + mk.slice(0, 4) : '—'; }

function categoryCardHtml(kind, title, cats){
  var tong = 0;
  cats.forEach(function(c){ tong += num(c.chiTieu); });
  var h = '<div class="card dm-card '+(kind === 'thu' ? 'k-asset' : 'k-debt')+'">'
    + dmHead(title, '<button class="btn secondary sm" data-act="dmThemCat" data-kind="'+kind+'">+ Thêm</button>');
  if (!cats.length){
    h += '<div class="empty">Chưa có danh mục nào.</div>';
  } else {
    h += '<div class="cat-list" data-kind="'+kind+'">';
    cats.forEach(function(c){
      var chips = (c.coDinhChiTieu ? '<span class="dm-chip">Cố định theo Hạn mức</span>' : '')
                + (c.khongDuTru ? '<span class="dm-chip">Không tính dự kiến</span>' : '');
      h += '<div class="cat-item dm-row dm-tall" role="button" tabindex="0" data-act="dmSuaCat" data-kind="'+kind+'" data-id="'+esc(c.id)+'" aria-label="Sửa danh mục '+esc(c.ten)+'">'
        + '<span class="cat-drag" draggable="true" data-act="dmNop" title="Kéo để đổi thứ tự" aria-hidden="true">⠿</span>'
        + '<span class="cat-dot" style="background:'+catMau(kind, c.id)+'"></span>'
        + '<span class="dm-main"><b class="dm-n">'+esc(c.ten)+'</b>'+(chips ? '<span class="dm-chips">'+chips+'</span>' : '')+'</span>'
        + '<span class="dm-v">'+(num(c.chiTieu) > 0 ? '<b>'+fmt(c.chiTieu)+'</b><small>/tháng</small>' : '<b class="dm-un">Chưa đặt</b><small>hạn mức</small>')+'</span>'
        + dmGo()+'</div>';
    });
    h += '</div><div class="dm-tong"><span>Tổng hạn mức/tháng</span><b class="'+kind+'">'+fmt(tong)+'</b></div>';
  }
  return h + ghiChuGon('Hạn mức là số tiền dự định thu / chi mỗi tháng của danh mục, dùng cho thanh tiến độ ở Báo cáo và dự kiến ở Dòng tiền. '
    + '<b>Không tính dự kiến</b>: không đoán số cho tháng tương lai (khoản không đều đặn). '
    + '<b>Cố định theo Hạn mức</b>: luôn dùng đúng hạn mức cho tháng tương lai, không lấy trung bình 3 tháng thực tế (dùng khi lương / hạn mức vừa đổi). '
    + 'Kéo ⠿ để đổi thứ tự (hoặc mở danh mục rồi bấm Lên / Xuống).', 'Hạn mức và dự kiến hoạt động thế nào?') + '</div>';
}

function cfgCardHtml(){
  var s = state.data.settings;
  var dong = function(nhan, giaTri, ghi){
    return '<div class="dm-row" role="button" tabindex="0" data-act="dmSuaCfg"><span class="dm-main"><b class="dm-n">'+nhan+'</b></span>'
      + '<span class="dm-v"><b>'+giaTri+'</b></span>'+dmGo()+'</div>';
  };
  return '<div class="card dm-card">'+dmHead('Số dư đầu kỳ')
    + dong('Ngày bắt đầu', s.ngayBatDau ? ngayVN(s.ngayBatDau) : '—')
    + dong('Tháng bắt đầu tính dự kiến', dmThangDM(s.thangBatDauDuTru))
    + ghiChuGon('"Tháng bắt đầu tính dự kiến" là tháng ĐẦY ĐỦ đầu tiên được dùng để tính TB gợi ý ở tab Dòng tiền. Tháng lẻ lúc mới bắt đầu dùng app (ghi từ giữa tháng) nên bỏ qua, nếu không TB sẽ bị kéo xuống sai. Mốc này KHÔNG bị chốt số dư làm đổi.', 'Số dư đầu kỳ dùng để làm gì?')
    + '</div>';
}

/* ---- Ví / nguồn tiền ---- */
function viCardHtml(){
  var ws = state.data.wallets || [];
  var h = '<div class="card dm-card k-wal">'+dmHead('Ví / nguồn tiền', '<button class="btn secondary sm" data-act="dmThemVi">+ Thêm ví</button>');
  ws.forEach(function(w){
    var chips = (w.id === viMacDinhId() ? '<span class="dm-chip md">Mặc định</span>' : '') + (w.deDanh ? '<span class="dm-chip md">Để dành</span>' : '');
    h += '<div class="dm-row dm-tall" role="button" tabindex="0" data-act="dmSuaVi" data-id="'+esc(w.id)+'" aria-label="Sửa ví '+esc(w.ten)+'">'
      + '<span class="dm-main"><b class="dm-n">'+esc(w.ten)+'</b>'+(chips ? '<span class="dm-chips">'+chips+'</span>' : '')+'</span>'
      + dmGo()+'</div>';
  });
  return h
    + ghiChuGon('Mỗi ví (tiền mặt, từng tài khoản ngân hàng, ví điện tử...) có số dư đầu kỳ riêng: số tiền có trong ví lúc bắt đầu dùng sổ (tính từ "Ngày bắt đầu" ở trên), KHÔNG phải số tiền ví đang có. Số dư hiện tại của từng ví xem ở tab Sổ tay; mở ví ở đây để sửa số đầu kỳ. '
    + 'Tổng các ví chính là số dư đầu kỳ của cả sổ. Ví đã có giao dịch hoặc đang gắn mục tiêu thì không xóa được, chỉ đổi tên. Tích <b>Để dành</b> cho ví quỹ/tiết kiệm: chi hoặc chuyển tiền ra khỏi ví đó sẽ được hỏi lại.', 'Ví / nguồn tiền hoạt động thế nào?')
    + '</div>';
}
// ví mặc định: chỉ ví được chọn có hiệu lực; không đụng gì tới dòng/khoản đã ghi
function viDatMacDinh(id){
  state.data.settings.viMacDinh = id;
  state.qa.wallet = '';       // thẻ Ghi nhanh quay về ví mặc định mới
}

/* ---- Mục tiêu tiết kiệm: khai báo (tiến độ hiện ở tab Báo cáo, logic ở state.js) ---- */
function mtCardHtml(){
  var gs = state.data.mucTieu || [], hom = todayStr();
  var coVi = (state.data.wallets || []).length > 1;
  var h = '<div class="card dm-card k-goal">'+dmHead('Mục tiêu tiết kiệm', '<button class="btn secondary sm" data-act="mtThem">+ Thêm</button>');
  if (!gs.length) h += '<div class="empty">Chưa có mục tiêu nào.</div>';
  gs.forEach(function(g){
    var t = mucTieuTienDo(g, hom);
    var nguon = (g.walletId && walletById(g.walletId)) ? 'Ví ' + esc(viTen(g.walletId)) : 'Gom tay';
    h += '<div class="dm-row dm-mt" role="button" tabindex="0" data-act="mtSua" data-id="'+esc(g.id)+'" aria-label="Sửa mục tiêu '+esc(g.ten)+'"><div class="dm-mt-b">'
      + '<div class="dm-mt-1"><b class="dm-n">'+esc(g.ten)+'</b><b class="dm-pct">'+Math.round(t.pct * 100)+'%</b>'+dmGo()+'</div>'
      + '<div class="dm-s">'+(g.hanChot ? 'Hạn '+dmThangDM(g.hanChot)+' · ' : '')+nguon+'</div>'
      + '<div class="dt-track sm" style="margin:7px 0 5px"><i style="width:'+Math.min(100, Math.round(t.pct * 100))+'%"></i></div>'
      + '<div class="dm-mt-3"><span><b>'+fmt(Math.round(t.da))+'</b> / '+fmt(Math.round(t.dich))+'</span><span>'+(t.xong ? 'Đã đủ' : 'còn '+fmt(Math.round(t.conThieu)))+'</span></div></div></div>';
  });
  return h + ghiChuGon('Đặt số tiền cần có và hạn chót, tab Báo cáo hiện còn thiếu bao nhiêu và cần để dành mỗi tháng bao nhiêu.'
    + (coVi ? ' <b>Gắn một ví</b> (ví để dành riêng) thì số đã gom tự bằng số dư ví đó, chuyển tiền sang ví bằng "Chuyển ví" ở Sổ tay. Không gắn thì tự bấm "+ Gom thêm" ở tab Báo cáo.' : ' Tạo thêm ví ở mục "Ví / nguồn tiền" để gắn mục tiêu vào một ví.')
    + ' Mục tiêu chỉ để theo dõi, không ghi thu/chi và không đổi số dư.', 'Tiến độ được tính thế nào?') + '</div>';
}

/* ---- Giao dịch định kỳ: khai báo mẫu (nhắc ở Sổ tay, logic ở state.js) ----
   Loại các danh mục của Vay - Nợ: tiền vay/trả nợ đã có lịch riêng, khai ở đây là trùng. */
var DK_CAT_LOAI = { nhanTienVay: 1, thuHoiChoVay: 1, choVay: 1, traNo: 1 };
function dkCatOptions(kind, sel){
  var o = (state.data.categories[kind] || []).filter(function(c){ return !DK_CAT_LOAI[c.id]; }).map(function(c){
    var v = kind + '|' + c.id;
    return '<option value="'+esc(v)+'"'+(v === sel ? ' selected' : '')+'>'+esc(c.ten)+'</option>';
  }).join('');
  return '<option value="">— chọn danh mục —</option>' + o;
}
function dkCardHtml(){
  var ds = state.data.dinhKy || [];
  var h = '<div class="card dm-card">'+dmHead('Giao dịch định kỳ', '<button class="btn secondary sm" data-act="dkThem">+ Thêm</button>')
    + '<div class="dm-sub">Chỉ nhắc đến ngày, không tự ghi.</div>';
  if (!ds.length) h += '<div class="empty">Chưa có khoản định kỳ nào.</div>';
  ds.forEach(function(k){
    var thu = k.kind === 'thu';
    h += '<div class="dm-row" role="button" tabindex="0" data-act="dkSua" data-id="'+esc(k.id)+'" aria-label="Sửa '+esc(k.ten)+'">'
      + '<input type="checkbox" class="dm-swi" data-act="dkBat" data-id="'+esc(k.id)+'"'+(k.bat ? ' checked' : '')+' aria-label="Bật nhắc '+esc(k.ten)+'">'
      + '<span class="dm-main"><b class="dm-n">'+esc(k.ten)+'</b><span class="dm-s">'+(thu ? 'Thu' : 'Chi')+' · '+esc(catTen(k.kind, k.catId))+' · <span style="white-space:nowrap">ngày '+k.ngay+'</span></span></span>'
      + '<span class="dm-v"><b class="'+(thu ? 'thu' : 'chi')+'">'+(thu ? '+' : '−')+fmt(Math.round(k.soTien))+'</b></span>'+dmGo()+'</div>';
  });
  return h + ghiChuGon('Lương, tiền nhà, tiền net... App <b>không tự ghi tiền</b>: tới ngày mà tháng đó chưa ghi thì hiện nhắc ở đầu Sổ tay, bấm "Ghi vào Sổ tay" mới có giao dịch.', 'Giao dịch định kỳ hoạt động thế nào?') + '</div>';
}

/* ---- Chốt số dư ---- */
function chotCardHtml(){
  var mk = monthKeyAdd(monthKey(todayStr()), -1);      // mặc định tháng trước: tháng này còn đang ghi
  var bd = state.data.settings.ngayBatDau;
  return '<div class="card dm-card">'+dmHead('Chốt số dư')
    + (bd ? '<div class="dm-sub">Sổ tính từ '+ngayVN(bd)+'</div>' : '')
    + '<div class="dm-chot"><div class="dm-step"><button type="button" data-act="dmKhoaThang" data-d="-1" aria-label="Tháng trước">‹</button>'
    + '<b id="dm_khoa_l">'+monthLabel(mk)+'</b><button type="button" data-act="dmKhoaThang" data-d="1" aria-label="Tháng sau">›</button>'
    + '<input type="hidden" id="cfg_khoa" value="'+mk+'"></div>'
    + '<button class="btn sm" data-act="lockMonth">Chốt số dư</button></div>'
    + ghiChuGon('Chốt số dư đến hết tháng chọn bên trên, dùng làm số dư đầu kỳ mới. Dữ liệu Sổ tay các tháng trước đó vẫn giữ nguyên để xem lại, chỉ không cộng vào số dư/Dòng tiền nữa.', 'Chốt số dư là gì?')
    + '</div>';
}

/* ---- Cài lên màn hình chính (PWA): hướng dẫn theo thiết bị ---- */
function caiAppCardHtml(){
  var h = '<div class="card dm-card">'+dmHead('Cài lên điện thoại / máy tính');
  if (dangChayNhuApp()){
    return h + '<div class="dm-sub">'+icon('check')+' Đang chạy như một app từ màn hình chính.</div></div>';
  }
  var buoc = function(t){ return '<li>'+t+'</li>'; };
  h += '<div class="dm-sub">Có biểu tượng ở màn hình chính, mở toàn màn hình như app, không cần gõ địa chỉ web.</div>';
  var cai = '<div class="cai-app"><b>iPhone / iPad (dùng Safari)</b><ol>'
    + buoc('Mở trang này bằng <b>Safari</b> (không phải Chrome trong app khác).')
    + buoc('Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên ↑) ở thanh dưới.')
    + buoc('Kéo xuống chọn <b>Thêm vào Màn hình chính</b> → <b>Thêm</b>.')
    + '</ol></div>'
    + '<div class="cai-app"><b>Android (Chrome)</b><ol>'
    + buoc('Bấm menu <b>⋮</b> ở góc trên → <b>Cài đặt ứng dụng</b> (hoặc <b>Thêm vào Màn hình chính</b>).')
    + '</ol></div>'
    + '<div class="cai-app"><b>Máy tính (Chrome / Edge)</b><ol>'
    + buoc('Bấm biểu tượng <b>cài đặt</b> ở cuối thanh địa chỉ → <b>Cài đặt</b>.')
    + '</ol></div>'
    + '<div class="empty" style="padding:8px 0 0;text-align:left">Lưu ý: app trên màn hình chính có bộ nhớ riêng nên <b>lần đầu phải đăng nhập Google lại trong app</b> (dữ liệu vẫn là file trên Drive, không mất). '
    + 'Sau đó mở lại trong vòng khoảng 1 giờ thì vào thẳng; quá 1 giờ bấm đăng nhập 1 lần.</div>';
  return h + ghiChuGon(cai, 'Cách cài (iPhone / Android / máy tính)') + '</div>';
}

/* ---- Khóa app: cấu hình riêng từng máy (localStorage), logic ở lock.js ---- */
function khoaCardHtml(){
  var c = khoaCauHinh();
  var h = '<div class="card dm-card">'+dmHead('Khóa app trên máy này');
  if (!c){
    return h + '<div class="dm-sub">Đặt mã PIN 6 số để người khác cầm máy không xem được số tiền. '
      + 'Mở khóa là tự quét Face ID / vân tay nếu máy hỗ trợ và đã bật. Chỉ áp dụng trên máy này.</div>'
      + '<button class="btn sm" data-act="khoaDatPin">'+icon('lock')+' Đặt mã PIN</button></div>';
  }
  var phut = num(c.phut);
  if (c.len && c.len !== KHOA_DO_DAI) h += '<div class="vn-note">'+icon('alert')+' Mã PIN hiện tại dài '+c.len+' số (đặt từ bản cũ). Nên bấm "Đổi mã PIN" để chuyển sang đúng 6 số.</div>';
  h += '<div class="dm-row dm-static"><span class="dm-main"><b class="dm-n">Mã PIN</b></span><span class="vn-chip ok">Đã đặt</span></div>'
    + '<label class="dm-row"><span class="dm-main"><b class="dm-n">Tự khóa khi rời app</b></span>'
    + '<select data-act="khoaPhut" class="dm-sel">'
    + [[0, 'Ngay'], [1, 'Sau 1 phút'], [5, 'Sau 5 phút'], [15, 'Sau 15 phút']].map(function(o){
        return '<option value="'+o[0]+'"'+(phut === o[0] ? ' selected' : '')+'>'+o[1]+'</option>'; }).join('')
    + '</select></label>';
  if (khoaCoSinhTrac()){
    h += '<div class="dm-row dm-static"><span class="dm-main"><b class="dm-n">Mở bằng vân tay / Face ID</b></span>'
      + '<button type="button" class="dm-sw'+(c.credId ? ' on' : '')+'" role="switch" aria-checked="'+(c.credId ? 'true' : 'false')+'" aria-label="Mở bằng vân tay / Face ID" data-act="'+(c.credId ? 'khoaTatSinhTrac' : 'khoaBatSinhTrac')+'"></button></div>';
  }
  h += '<div class="dm-btns"><button class="btn sm" data-act="khoaNgay">'+icon('lock')+' Khóa ngay</button>'
    + '<button type="button" class="btn secondary sm dm-more" data-act="dmMoKhoa" aria-label="Thêm thao tác">'+icon('dots')+'</button></div>'
    + ghiChuGon('Đây là khóa màn hình: dữ liệu lưu trên máy (bản mở ngoại tuyến) không bị mã hóa. Quên mã PIN thì phải xóa dữ liệu trên máy này rồi đăng nhập Google lại — dữ liệu trên Drive không mất.', 'Lưu ý');
  return h + '</div>';
}
function taiKhoanCardHtml(){
  return '<div class="card dm-card">'+dmHead('Tài khoản')
    + '<div class="dm-sub">Đăng xuất khỏi Google trên máy này.</div>'
    + '<button class="btn danger" data-act="dangXuat">Đăng xuất</button>'
    + ghiChuGon('Dữ liệu trên Google Drive vẫn còn nguyên; chỉ bản lưu để mở ngoại tuyến trên máy này bị xóa.', 'Đăng xuất có mất dữ liệu không?') + '</div>';
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
// giờ lưu của 1 bản: dd/mm/yyyy hh:mm theo giờ máy; thiếu modifiedTime thì lấy ngày trong tên file
function backupGio(f){
  var d = f.modifiedTime ? new Date(f.modifiedTime) : null;
  if (d && !isNaN(d.getTime()))
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  var m = /(\d{4})-(\d{2})-(\d{2})/.exec(f.name);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : f.name;
}
// loại bản: tên không nhãn = tự động hằng ngày
function backupLoai(name){
  var m = /^chitieu-canhan-backup-\d{4}-\d{2}-\d{2}(?:-(.+?)(?:-\d{6})?)?\.json$/.exec(name);
  if (!m || !m[1]) return 'Tự động';
  return m[1] === 'thu-cong' ? 'Thủ công' : (BACKUP_NHAN[m[1]] || m[1]);
}
function backupCardHtml(){
  var ds = state.backupDs, mo = !!(ds && state.backupMo);
  var cuoi = null;
  (ds || []).forEach(function(f){ if (f.modifiedTime && (!cuoi || f.modifiedTime > cuoi.modifiedTime)) cuoi = f; });
  var h = '<div class="card dm-card">'+dmHead('Sao lưu dữ liệu')
    + '<div class="dm-sub">'+(cuoi ? 'Lần cuối: '+esc(backupGio(cuoi))+' · '+esc(backupLoai(cuoi.name).toLowerCase()) : 'Tự lưu mỗi ngày · giữ '+BACKUP_GIU+' bản gần nhất')+'</div>'
    + '<div class="dm-btns">'
    + '<button class="btn sm" data-act="bkTao"'+(state.backupBusy?' disabled':'')+'>Sao lưu ngay</button>'
    + (mo ? '<button class="btn secondary sm" data-act="bkAn">Ẩn các bản sao lưu ('+ds.length+')</button>'
          : '<button class="btn secondary sm" data-act="'+(ds ? 'bkMo' : 'bkXem')+'"'+(state.backupBusy?' disabled':'')+'>Xem các bản sao lưu'+(ds ? ' ('+ds.length+')' : '')+'</button>')
    + '</div>';
  if (mo){
    if (!ds.length){
      h += '<div class="empty">Chưa có bản sao lưu nào.</div>';
    } else {
      ds.forEach(function(f){
        h += '<div class="dm-bk"><div><b>'+esc(backupGio(f))+'</b><small>'+esc(backupLoai(f.name))+' · '+(f.size ? Math.max(1, Math.round(num(f.size) / 1024)) + ' KB' : '—')+'</small></div>'
          + '<button class="btn sm secondary" data-act="bkKhoiPhuc" data-id="'+esc(f.id)+'" data-name="'+esc(f.name)+'"'+(state.backupBusy?' disabled':'')+'>Khôi phục</button></div>';
      });
    }
  }
  return h + ghiChuGon('Mỗi ngày, lần đầu mở app, app tự lưu 1 bản dữ liệu lên Drive và giữ '+BACKUP_GIU+' bản gần nhất. '
    + 'Khôi phục sẽ thay toàn bộ dữ liệu hiện tại bằng bản đã chọn — dữ liệu hiện tại cũng được sao lưu lại trước đó nên vẫn quay lại được.', 'Sao lưu hoạt động thế nào?') + '</div>';
}

function renderDanhMuc(){
  var root = document.getElementById('tabContent');
  var html = '<div class="dm-page">'
    + dmSec('Danh mục') + '<div class="dm-grid dm-cap">'
    + categoryCardHtml('thu', 'Danh mục khoản thu', state.data.categories.thu)
    + categoryCardHtml('chi', 'Danh mục khoản chi', state.data.categories.chi) + '</div>'
    + dmSec('Tiền &amp; kế hoạch') + '<div class="dm-grid">'
    + cfgCardHtml() + viCardHtml() + chotCardHtml() + dkCardHtml() + mtCardHtml() + '</div>'
    + dmSec('Ứng dụng') + '<div class="dm-grid">'
    + caiAppCardHtml() + backupCardHtml() + khoaCardHtml() + taiKhoanCardHtml() + '</div></div>';
  root.innerHTML = html;
  attachCatDragDrop();
  dmSheetVe();
}

/* ====================================================================
   BẢNG TRƯỢT SỬA / THÊM (khung .qa-sheet + .vn-sheet dùng chung với Vay - Nợ)
   Nằm ngoài #tabContent, đã mở thì GIỮ NGUYÊN DOM để vẽ lại trang không làm mất ô đang gõ.
   Trạng thái mở: state.dmForm = { loai:'cat'|'cfg'|'vi', kind?, id? } hoặc state.dkForm / state.mtForm.
   ==================================================================== */
function dmToggle(id, nhan, ghi, bat, tat){
  return '<label class="dm-tg"><span><b>'+nhan+'</b>'+(ghi ? '<small>'+ghi+'</small>' : '')+'</span>'
    + '<input type="checkbox" class="dm-swi" id="'+id+'"'+(bat ? ' checked' : '')+(tat ? ' disabled' : '')+'></label>';
}
function dmMoney(id, v, ph){
  return '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="'+id+'" value="'+veSo(v)+'" placeholder="'+(ph || '0')+'">';
}

function catSheetHtml(f){
  var arr = state.data.categories[f.kind] || [];
  var idx = f.id ? arr.findIndex(function(x){ return x.id === f.id; }) : -1;
  var c = idx >= 0 ? arr[idx] : null;
  var d = c || { ten:'', chiTieu:0, khongDuTru:false, coDinhChiTieu:false };
  var mau = c ? catMau(f.kind, c.id) : CAT_PALETTE[arr.length % CAT_PALETTE.length];
  var h = vnF('Tên', '<input type="text" id="dm_ten" value="'+esc(d.ten)+'" placeholder="VD: Ăn uống">')
    + vnF('Hạn mức/tháng', dmMoney('dm_base', d.chiTieu))
    + vnF('Màu <span class="mp-hint">(dùng ở biểu đồ)</span>',
        '<div class="dm-mau"><input type="color" id="dm_mau" value="'+mau+'" data-cur="'+mau+'" aria-label="Màu danh mục">'
        + '<button type="button" class="btn secondary sm" data-act="dmMauMacDinh">Về màu mặc định</button></div>')
    + dmToggle('dm_nodk', 'Không tính dự kiến', 'Không đoán số cho tháng tương lai (khoản không đều đặn, không thể dự đoán).', d.khongDuTru)
    + dmToggle('dm_codinh', 'Cố định theo Hạn mức', 'Luôn dùng đúng Hạn mức/tháng cho các tháng tương lai, không lấy trung bình 3 tháng thực tế (dùng khi lương / hạn mức vừa thay đổi).', d.coDinhChiTieu);
  if (c){
    h += '<div class="dm-tool"><button type="button" class="btn secondary sm" data-act="catUp" data-kind="'+f.kind+'" data-id="'+esc(c.id)+'"'+(idx === 0 ? ' disabled' : '')+'>'+icon('arrow-up')+' Lên trên</button>'
      + '<button type="button" class="btn secondary sm" data-act="catDown" data-kind="'+f.kind+'" data-id="'+esc(c.id)+'"'+(idx === arr.length - 1 ? ' disabled' : '')+'>'+icon('arrow-down')+' Xuống dưới</button></div>'
      + '<button type="button" class="btn danger dm-xoa" data-act="delCat" data-kind="'+f.kind+'" data-id="'+esc(c.id)+'">'+icon('trash')+' Xóa danh mục</button>';
  }
  return vnSheetKhung((c ? 'Sửa' : 'Thêm') + ' danh mục ' + (f.kind === 'thu' ? 'thu' : 'chi'), h, c ? 'Lưu thay đổi' : 'Lưu danh mục', 'dmLuuCat', 'dmHuy');
}

function cfgSheetHtml(){
  var s = state.data.settings;
  var h = vnF('Ngày bắt đầu', '<input type="date" id="cfg_ngay" value="'+(s.ngayBatDau || '')+'">', '', 'Mốc tính số dư. Chốt số dư sẽ tự đẩy mốc này lên.')
    + vnF('Tháng bắt đầu tính dự kiến', '<input type="month" id="cfg_duTru" value="'+(s.thangBatDauDuTru || '')+'">', '', 'Tháng ĐẦY ĐỦ đầu tiên dùng để tính trung bình gợi ý ở Dòng tiền.');
  return vnSheetKhung('Số dư đầu kỳ', h, 'Lưu', 'saveSettings', 'dmHuy');
}

function viSheetHtml(f){
  var ws = state.data.wallets || [];
  var w = f.id ? walletById(f.id) : null;
  var d = w || { ten:'', soDuDauKy:0, deDanh:false };
  var laMd = !!w && w.id === viMacDinhId();
  var dung = w ? viDangDung(w.id) : 0;
  var khongXoa = !w || ws.length < 2 || dung > 0;
  var h = vnF('Tên ví', '<input type="text" id="dm_vi_ten" value="'+esc(d.ten)+'" placeholder="Tiền mặt, Vietcombank, Momo...">')
    + vnF('Số dư đầu kỳ <span class="mp-hint">(lúc bắt đầu dùng sổ)</span>', dmMoney('dm_vi_du', d.soDuDauKy), '', 'Đây KHÔNG phải số tiền ví đang có. Số dư hiện tại tự tính từ số đầu kỳ cộng các giao dịch, xem ở tab Sổ tay. Được phép âm (thẻ tín dụng, nợ).')
    + dmToggle('dm_vi_md', 'Ví mặc định', 'Điền sẵn khi nhập giao dịch, thêm khoản vay, khoản định kỳ mới.', laMd, laMd)
    + dmToggle('dm_vi_dd', 'Để dành', 'Ví quỹ / tiết kiệm: chi hoặc chuyển tiền ra khỏi ví này sẽ được hỏi lại trước khi ghi.', d.deDanh);
  if (w){
    h += '<button type="button" class="btn danger dm-xoa" data-act="viXoa" data-id="'+esc(w.id)+'"'+(khongXoa ? ' disabled' : '')+'>'+icon('trash')+' Xóa ví</button>'
      + (khongXoa ? '<div class="vn-hint">'+(dung > 0 ? 'Ví đang có '+dung+' giao dịch/khoản liên quan nên không xóa được, chỉ đổi tên.' : 'Phải còn ít nhất 1 ví.')+'</div>' : '');
  }
  return vnSheetKhung(w ? 'Sửa ví' : 'Thêm ví', h, w ? 'Lưu thay đổi' : 'Lưu ví', 'dmLuuVi', 'dmHuy');
}

function dmSeg(id, chon, luaChon){
  return '<input type="hidden" id="'+id+'" value="'+chon+'"><div class="qa-seg">'
    + luaChon.map(function(o){ return '<button type="button" class="'+(o[0] === chon ? 'on' : '')+'" data-act="dmSeg" data-f="'+id+'" data-v="'+o[0]+'">'+o[1]+'</button>'; }).join('')
    + '</div>';
}
function dkSheetHtml(){
  var ds = state.data.dinhKy || [];
  var ed = state.dkForm.id ? ds.find(function(k){ return k.id === state.dkForm.id; }) : null;
  var k0 = ed || { ten:'', kind:'chi', catId:'', soTien:'', ngay:1, walletId: viMacDinhId(), ghiChu:'', bat:true };
  var ngayOpts = ''; for (var n = 1; n <= 31; n++) ngayOpts += '<option value="'+n+'"'+(n === (k0.ngay || 1) ? ' selected' : '')+'>Ngày '+n+'</option>';
  var h = dmToggle('dk_bat', 'Bật nhắc', 'Đến ngày app nhắc, bạn xác nhận mới ghi. App không tự ghi tiền.', k0.bat !== false)
    + vnF('Tên', '<input type="text" id="dk_ten" value="'+esc(k0.ten)+'" placeholder="Ví dụ: Tiền nhà">')
    + dmSeg('dk_kind', k0.kind === 'thu' ? 'thu' : 'chi', [['thu', 'Thu'], ['chi', 'Chi']])
    + vnF('Danh mục', '<select id="dk_cat">'+dkCatOptions(k0.kind === 'thu' ? 'thu' : 'chi', k0.catId ? k0.kind+'|'+k0.catId : '')+'</select>')
    + vnF('Số tiền', dmMoney('dk_tien', k0.soTien))
    + '<div class="vn-2">'
    + vnF('Ngày trong tháng', '<select id="dk_ngay">'+ngayOpts+'</select>')
    + ((state.data.wallets || []).length > 1 ? vnF('Ví', '<select id="dk_vi">'+viOptionsHtml(k0.walletId)+'</select>') : '')
    + '</div>'
    + vnF('Ghi chú <span class="mp-hint">(tùy chọn)</span>', '<input type="text" id="dk_note" value="'+esc(k0.ghiChu || '')+'">');
  if (ed) h += '<button type="button" class="btn danger dm-xoa" data-act="dkXoa" data-id="'+esc(ed.id)+'">'+icon('trash')+' Xóa khoản định kỳ</button>';
  return vnSheetKhung(ed ? 'Sửa giao dịch định kỳ' : 'Thêm giao dịch định kỳ', h, ed ? 'Cập nhật' : 'Lưu', 'dkLuu', 'dkHuy');
}

function mtSheetHtml(){
  var gs = state.data.mucTieu || [];
  var ws = state.data.wallets || [];
  var coVi = ws.length > 1;
  var ed = state.mtForm.id ? gs.find(function(g){ return g.id === state.mtForm.id; }) : null;
  var g0 = ed || { ten:'', soTien:'', hanChot:'', walletId:'', daGom:'' };
  var theoVi = coVi && (ed ? !!(g0.walletId && walletById(g0.walletId)) : true);
  var viMd = g0.walletId || ((ws.filter(function(w){ return w.deDanh; })[0] || {}).id) || '';
  var h = vnF('Tên mục tiêu', '<input type="text" id="mt_ten" value="'+esc(g0.ten)+'" placeholder="Ví dụ: Mua xe">')
    + '<div class="vn-2">'
    + vnF('Số tiền cần có', dmMoney('mt_tien', g0.soTien))
    + vnF('Hạn <span class="mp-hint">(tùy chọn)</span>', '<input type="month" id="mt_han" value="'+esc(g0.hanChot || '')+'">')
    + '</div>';
  if (coVi){
    h += vnF('Nguồn tiền', dmSeg('mt_nguon', theoVi ? 'vi' : 'gom', [['vi', 'Từ ví'], ['gom', 'Tự gom']]))
      + '<div class="vn-f" id="mt_vi_f"'+(theoVi ? '' : ' hidden')+'><div class="qa-lbl">Ví</div><select id="mt_vi">'+viOptionsHtml(viMd)+'</select>'
      + '<div class="vn-hint">Số đã gom tự bằng số dư ví. Chuyển tiền sang ví bằng "Chuyển ví" ở Sổ tay.</div></div>'
      + '<div class="vn-f" id="mt_gom_f"'+(theoVi ? ' hidden' : '')+'><div class="qa-lbl">Đã gom</div>'+dmMoney('mt_gom', g0.daGom)
      + '<div class="vn-hint">Tự bấm "+ Gom thêm" ở tab Báo cáo khi để dành thêm.</div></div>';
  } else {
    h += vnF('Đã gom', dmMoney('mt_gom', g0.daGom), '', 'Tạo thêm ví ở mục "Ví / nguồn tiền" để gắn mục tiêu vào một ví.');
  }
  h += '<div class="vn-hint">Mục tiêu chỉ để theo dõi, không ghi thu/chi và không đổi số dư.</div>';
  if (ed) h += '<button type="button" class="btn danger dm-xoa" data-act="mtXoa" data-id="'+esc(ed.id)+'">'+icon('trash')+' Xóa mục tiêu</button>';
  return vnSheetKhung(ed ? 'Sửa mục tiêu' : 'Thêm mục tiêu tiết kiệm', h, ed ? 'Cập nhật' : 'Lưu', 'mtLuu', 'mtHuy');
}

function khoaMenuSheetHtml(){
  return '<div class="qa-scrim" data-act="dmHuy"></div>'
    + '<div class="qa-sheet vn-sheet" role="dialog" aria-modal="true" aria-label="Khóa app"><div class="qa-grab"></div>'
    + '<div class="qa-head"><h3>Khóa app</h3><button type="button" class="qa-x" data-act="dmHuy" aria-label="Đóng">'+icon('x')+'</button></div>'
    + '<div class="qa-body dm-menu"><button type="button" data-act="khoaDatPin">Đổi mã PIN</button>'
    + '<button type="button" class="dm-nguy" data-act="khoaTat">Tắt khóa</button></div></div>';
}
function dmKhoa(){
  if (state.dkForm) return 'dk:' + (state.dkForm.id || '');
  if (state.mtForm) return 'mt:' + (state.mtForm.id || '');
  var f = state.dmForm;
  return f ? f.loai + ':' + (f.kind || '') + ':' + (f.id || '') : '';
}
function dmSheetVe(){
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  if (state.tab !== 'danhmuc' && (state.dmForm || state.dkForm || state.mtForm)){ state.dmForm = null; state.dkForm = null; state.mtForm = null; }
  var root = document.getElementById('dmSheetRoot');
  var khoa = dmKhoa();
  if (root && root.getAttribute('data-key') === khoa) return;
  if (root && root.parentNode) root.parentNode.removeChild(root);
  if (!khoa){
    if (!vnMoKhoaNen()) document.body.classList.remove('qa-mo');
    return;
  }
  root = document.createElement('div');
  root.id = 'dmSheetRoot';
  root.className = 'qa-back moi';
  root.setAttribute('data-key', khoa);
  root.innerHTML = state.dkForm ? dkSheetHtml() : (state.mtForm ? mtSheetHtml() : (state.dmForm.loai === 'cat' ? catSheetHtml(state.dmForm) : (state.dmForm.loai === 'cfg' ? cfgSheetHtml() : (state.dmForm.loai === 'khoa' ? khoaMenuSheetHtml() : viSheetHtml(state.dmForm)))));
  document.body.appendChild(root);
  document.body.classList.add('qa-mo');
  vnKhopKhungNhin();
  setTimeout(function(){ root.classList.remove('moi'); }, 400);
}
// đổi màu bằng tay thì thôi cờ "về màu mặc định"
function handleDanhMucInput(el){
  if (el && el.id === 'dm_mau'){ el.removeAttribute('data-reset'); return true; }
  return false;
}

/* ---- Danh mục: helper validate trùng tên ---- */
function catNameExists(kind, name, excludeId){
  var n = name.trim().toLowerCase();
  return state.data.categories[kind].some(function(x){ return x.id !== excludeId && x.ten.trim().toLowerCase() === n; });
}

/* ---- Danh mục: handlers ---- */
function handleDanhMucAction(act, el){
  if (act === 'bkMo' || act === 'bkAn'){
    state.backupMo = (act === 'bkMo'); renderDanhMuc();
  } else if (act === 'bkXem' || act === 'bkTao' || act === 'bkKhoiPhuc'){
    // handler KHÔNG được async (dispatcher đọc giá trị trả về đồng bộ) -> bọc IIFE
    if (state.backupBusy) return true;
    (async function(){
      state.backupBusy = true; renderDanhMuc();
      try{
        if (act === 'bkTao'){
          await saoLuuNgay('thu-cong', JSON.stringify(state.data));
          toast('Đã sao lưu dữ liệu hiện tại lên Drive.');
          state.backupDs = await driveListBackups();
          state.backupMo = true;
        } else if (act === 'bkXem'){
          state.backupDs = await driveListBackups();
          state.backupMo = true;
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
  } else if (act === 'dmNop'){
    return true;                                    // tay cầm kéo: chạm vào không mở bảng sửa
  } else if (act === 'dmHuy'){
    state.dmForm = null; state.dkForm = null; state.mtForm = null; renderDanhMuc();
  } else if (act === 'dmThemCat'){
    state.dmForm = { loai:'cat', kind: el.getAttribute('data-kind') || 'chi', id:'' }; renderDanhMuc();
  } else if (act === 'dmSuaCat'){
    state.dmForm = { loai:'cat', kind: el.getAttribute('data-kind') || 'chi', id: el.getAttribute('data-id') }; renderDanhMuc();
  } else if (act === 'dmSuaCfg'){
    state.dmForm = { loai:'cfg' }; renderDanhMuc();
  } else if (act === 'dmThemVi'){
    state.dmForm = { loai:'vi', id:'' }; renderDanhMuc();
  } else if (act === 'dmSuaVi'){
    state.dmForm = { loai:'vi', id: el.getAttribute('data-id') }; renderDanhMuc();
  } else if (act === 'dmSeg'){
    var fS = el.getAttribute('data-f'), vS = el.getAttribute('data-v');
    var iS = document.getElementById(fS); if (iS) iS.value = vS;
    [].forEach.call(el.parentNode.querySelectorAll('button'), function(b){ b.classList.toggle('on', b === el); });
    if (fS === 'dk_kind'){
      var sC = document.getElementById('dk_cat'); if (sC) sC.innerHTML = dkCatOptions(vS, '');   // chỉ hiện danh mục đúng loại Thu / Chi
    } else if (fS === 'mt_nguon'){
      var fV2 = document.getElementById('mt_vi_f'), fG = document.getElementById('mt_gom_f');
      if (fV2) fV2.hidden = vS !== 'vi';
      if (fG) fG.hidden = vS !== 'gom';
    }
  } else if (act === 'dmMauMacDinh'){
    var oM = document.getElementById('dm_mau'), fM = state.dmForm;
    if (oM && fM){
      var aM = state.data.categories[fM.kind] || [], iM2 = fM.id ? aM.findIndex(function(x){ return x.id === fM.id; }) : aM.length;
      oM.value = CAT_PALETTE[(iM2 < 0 ? 0 : iM2) % CAT_PALETTE.length];
      oM.setAttribute('data-reset', '1');
    }
  } else if (act === 'dmKhoaThang'){
    var hK = document.getElementById('cfg_khoa'), lK = document.getElementById('dm_khoa_l');
    if (hK){
      hK.value = monthKeyAdd(hK.value, parseInt(el.getAttribute('data-d'), 10) || 0);
      if (lK) lK.textContent = monthLabel(hK.value);
    }
  } else if (act === 'dmLuuCat'){
    var fC = state.dmForm; if (!fC) return true;
    var arrCat = state.data.categories[fC.kind];
    var cCu = fC.id ? arrCat.find(function(x){ return x.id === fC.id; }) : null;
    var tenCat = (document.getElementById('dm_ten') || {}).value.trim();
    if (!tenCat){ toast('Tên danh mục không được để trống.', { loai:'err' }); return true; }
    if (catNameExists(fC.kind, tenCat, cCu ? cCu.id : null)){ toast('Đã có danh mục trùng tên "'+tenCat+'".', { loai:'err' }); return true; }
    var mauEl = document.getElementById('dm_mau');
    var cDoi = {
      ten: tenCat,
      chiTieu: numNonNeg(docSo(document.getElementById('dm_base').value)),
      khongDuTru: !!document.getElementById('dm_nodk').checked,
      coDinhChiTieu: !!document.getElementById('dm_codinh').checked
    };
    var mauMoi = mauEl && mauEl.getAttribute('data-reset') !== '1' && mauEl.value !== mauEl.getAttribute('data-cur') ? mauEl.value : null;
    if (cCu){
      Object.assign(cCu, cDoi);
      if (mauEl && mauEl.getAttribute('data-reset') === '1') cCu.mau = '';
      else if (mauMoi) cCu.mau = mauMoi;
    } else {
      cDoi.id = slugify(tenCat) + '_' + Date.now().toString(36);
      if (mauMoi) cDoi.mau = mauMoi;
      arrCat.push(cDoi);
    }
    state.dmForm = null;
    scheduleSave();
    renderDanhMuc();
    toast('Đã lưu danh mục "'+tenCat+'".');
  } else if (act === 'dmLuuVi'){
    var fV = state.dmForm; if (!fV) return true;
    var wCu = fV.id ? walletById(fV.id) : null;
    var tenVi = (document.getElementById('dm_vi_ten') || {}).value.trim();
    if (!tenVi){ toast('Tên ví không được để trống.', { loai:'err' }); return true; }
    var trungVi = state.data.wallets.some(function(w){ return (!wCu || w.id !== wCu.id) && w.ten.trim().toLowerCase() === tenVi.toLowerCase(); });
    if (trungVi){ toast('Đã có ví trùng tên "'+tenVi+'".', { loai:'err' }); return true; }
    var duVi = docSo(document.getElementById('dm_vi_du').value);      // số dư đầu kỳ được phép âm
    var ddVi = !!document.getElementById('dm_vi_dd').checked;
    var mdVi = !!document.getElementById('dm_vi_md').checked;
    var wLuu = wCu;
    if (wCu){ wCu.ten = tenVi; wCu.soDuDauKy = duVi; wCu.deDanh = ddVi; }
    else { wLuu = { id: 'w_' + slugify(tenVi) + '_' + Date.now().toString(36), ten: tenVi, soDuDauKy: duVi, deDanh: ddVi }; state.data.wallets.push(wLuu); }
    state.data.settings.soDuDauKy = state.data.wallets.reduce(function(s, w){ return s + num(w.soDuDauKy); }, 0);
    if (mdVi && wLuu.id !== viMacDinhId()){ viDatMacDinh(wLuu.id); toast('Đã đặt "'+tenVi+'" làm tài khoản mặc định.'); }
    else toast('Đã lưu ví "'+tenVi+'".');
    state.dmForm = null;
    scheduleSave();
    renderDanhMuc();
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
    var mtNg = document.getElementById('mt_nguon');
    if (mtNg && mtNg.value === 'gom') mtVi = '';          // chọn "Tự gom" thì không gắn ví
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
    state.mtForm = null;
    scheduleSave();
    renderDanhMuc();
    toast('Đã xóa mục tiêu "'+mtXg.ten+'".', { hoanTac: function(){
      state.data.mucTieu.splice(Math.min(mtXi, state.data.mucTieu.length), 0, mtXg);
      scheduleSave(); renderDanhMuc();
    } });
  } else if (act === 'dmMoKhoa'){
    state.dmForm = { loai:'khoa' }; renderDanhMuc();
  } else if (act === 'khoaDatPin'){ state.dmForm = null; renderDanhMuc(); khoaDatPin().then(function(){ renderDanhMuc(); });
  } else if (act === 'khoaTat'){ state.dmForm = null; renderDanhMuc(); khoaTat().then(function(){ renderDanhMuc(); });
  } else if (act === 'khoaBatSinhTrac'){ khoaBatSinhTrac().then(function(){ renderDanhMuc(); });
  } else if (act === 'khoaTatSinhTrac'){ khoaTatSinhTrac(); renderDanhMuc(); toast('Đã tắt mở khóa bằng vân tay / Face ID.');
  } else if (act === 'khoaNgay'){ khoaHien();
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
    var dkBatEl = document.getElementById('dk_bat');
    if (dkBatEl) dkObj.bat = !!dkBatEl.checked;
    var dkCu = state.dkForm && state.dkForm.id ? state.data.dinhKy.find(function(k){ return k.id === state.dkForm.id; }) : null;
    if (dkCu){ Object.assign(dkCu, dkObj); }
    else { dkObj.id = 'dk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); if (dkObj.bat === undefined) dkObj.bat = true; dkObj.bo = []; state.data.dinhKy.push(dkObj); }
    state.dkForm = null;
    scheduleSave();
    renderDanhMuc();
    toast('Đã lưu khoản định kỳ "'+dkTen+'".');
  } else if (act === 'dkXoa'){
    var dkXi = state.data.dinhKy.findIndex(function(k){ return k.id === el.getAttribute('data-id'); });
    if (dkXi < 0) return true;
    var dkXk = state.data.dinhKy.splice(dkXi, 1)[0];
    state.dkForm = null;
    scheduleSave();
    renderDanhMuc();
    toast('Đã xóa "'+dkXk.ten+'". Các giao dịch đã ghi từ khoản này ở Sổ tay vẫn giữ nguyên.', { hoanTac: function(){
      state.data.dinhKy.splice(Math.min(dkXi, state.data.dinhKy.length), 0, dkXk);
      scheduleSave(); renderDanhMuc();
    } });
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
      state.dmForm = null;
      state.data.wallets = state.data.wallets.filter(function(w){ return w.id !== viX.id; });
      if (state.data.settings.viMacDinh === viX.id) state.data.settings.viMacDinh = '';
      state.data.settings.soDuDauKy = state.data.wallets.reduce(function(s, w){ return s + num(w.soDuDauKy); }, 0);
      scheduleSave();
      renderDanhMuc();
      toast('Đã xóa ví "'+viX.ten+'".');
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
    state.dmForm = null;
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
    state.dmForm = null;
    scheduleSave();
    renderDanhMuc();
    toast('Đã lưu thiết lập.');
  } else if (act === 'lockMonth'){
    var mk3 = document.getElementById('cfg_khoa').value;
    if (!mk3){ toast('Chọn tháng cần chốt số dư.', { loai:'warn' }); return true; }
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
      if (!await xacNhan('Chốt số dư đến hết '+monthLabel(mk3)+'?',
            'Số dư đầu kỳ mới: '+fmt(newBal)+'\n'
            + 'Ngày bắt đầu mới: '+newStart+'\n\n'
            + 'Dữ liệu Sổ tay cũ vẫn giữ nguyên, chỉ không tính vào số dư / Dòng tiền nữa.',
            { nguyHiem:true, chuOk:'Chốt số dư' })) return;
      viChotSoDuDauKy(mk3 + '-31');     // chốt từng ví theo mốc CŨ, trước khi đổi ngayBatDau
      state.data.settings.ngayBatDau = newStart;
      state.data.settings.soDuDauKy = newBal;
      scheduleSave();
      renderDanhMuc();
      toast('Đã chốt số dư đến hết '+monthLabel(mk3)+'.');
    })();
  } else {
    return false;
  }
  return true;
}

function handleDanhMucChange(el){
  if (el.matches('[data-act=khoaPhut]')){ khoaDatPhut(el.value); toast('Đã lưu.'); return true; }
  if (el.matches('[data-act=dkBat]')){
    var dkB = (state.data.dinhKy || []).find(function(k){ return k.id === el.getAttribute('data-id'); });
    if (dkB){ dkB.bat = el.checked; scheduleSave(); }
    return true;
  }
  return false;
}
