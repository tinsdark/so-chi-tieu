"use strict";
/* ====================================================================
   nhan.js — NHÃN (tag) cho giao dịch, ngoài danh mục: "Du lịch Đà Lạt", "Đám cưới"...
   Để trả lời "chuyến đi này tổng cộng tốn bao nhiêu".
   Dữ liệu: dòng chi tiết có thêm it.nhan = ['Du lịch Đà Lạt', ...] (không có nhãn thì KHÔNG có trường này,
   nên file cũ không cần migration). Không có danh sách nhãn riêng: danh sách là những nhãn đang được dòng nào đó dùng,
   hai tên chỉ khác hoa/thường coi là một (so khớp theo nhanKhoa). Xóa hết dòng dùng nhãn là nhãn biến mất.
   Nhãn chỉ để xem/gom: KHÔNG đổi số dư, dự trù hay hạn mức.
   Cần state.js (entryItems, num, fmt), ui.js (hoiChu, xacNhan, toast) load trước; thẻ vẽ ở tab Báo cáo (bieudo.js).
   ==================================================================== */

function nhanChuan(s){ return String(s == null ? '' : s).replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
function nhanKhoa(s){ return nhanChuan(s).toLowerCase(); }
// "Du lịch Đà Lạt, #ăn chơi" -> ['Du lịch Đà Lạt', 'ăn chơi']; bỏ trùng (không phân biệt hoa/thường), bỏ rỗng
function nhanParse(str){
  var out = [], seen = {};
  String(str == null ? '' : str).split(/[,;#]/).forEach(function(p){
    var t = nhanChuan(p), k = t.toLowerCase();
    if (!t || seen[k]) return;
    seen[k] = true; out.push(t);
  });
  return out;
}
function itemNhan(it){ return (it && Array.isArray(it.nhan)) ? it.nhan : []; }
function itemDatNhan(it, ds){ if (ds && ds.length) it.nhan = ds.slice(); else delete it.nhan; }
function nhanChuoi(it){ return itemNhan(it).join(', '); }

// mọi nhãn đang dùng: [{ khoa, ten, n, chi, thu, tu, den }], nhãn dùng gần đây nhất lên đầu
function nhanThongKe(){
  var m = {};
  Object.keys(state.data.journal).forEach(function(d){
    entryItems(state.data.journal[d]).forEach(function(it){
      itemNhan(it).forEach(function(t){
        var k = nhanKhoa(t);
        if (!k) return;
        var r = m[k] || (m[k] = { khoa: k, ten: nhanChuan(t), n: 0, chi: 0, thu: 0, tu: d, den: d });
        r.n++;
        if (it.kind === 'chi') r.chi += num(it.soTien); else r.thu += num(it.soTien);
        if (d < r.tu) r.tu = d;
        if (d > r.den) r.den = d;
      });
    });
  });
  return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a, b){
    return a.den < b.den ? 1 : (a.den > b.den ? -1 : (a.ten < b.ten ? -1 : 1));
  });
}
// các dòng mang nhãn: [{ date, it }], mới nhất trước
function nhanDsDong(khoa){
  var out = [];
  Object.keys(state.data.journal).sort().reverse().forEach(function(d){
    entryItems(state.data.journal[d]).forEach(function(it){
      if (itemNhan(it).some(function(t){ return nhanKhoa(t) === khoa; })) out.push({ date: d, it: it });
    });
  });
  return out;
}
// đổi tên nhãn trên mọi dòng (đổi thành tên đã có = gộp hai nhãn). Trả về số dòng đã đổi.
function nhanDoiTen(khoa, tenMoi){
  var moi = nhanChuan(tenMoi), km = nhanKhoa(moi), n = 0;
  if (!km) return 0;
  nhanDsDong(khoa).forEach(function(x){
    var ds = [], thay = false;
    itemNhan(x.it).forEach(function(t){
      var tt = (nhanKhoa(t) === khoa || nhanKhoa(t) === km) ? moi : t;
      if (tt !== t) thay = true;
      if (!ds.some(function(y){ return nhanKhoa(y) === nhanKhoa(tt); })) ds.push(tt);
    });
    if (thay) n++;
    itemDatNhan(x.it, ds);
  });
  return n;
}
// gỡ nhãn khỏi mọi dòng (giao dịch giữ nguyên). Trả về số dòng đã gỡ.
function nhanXoa(khoa){
  var n = 0;
  nhanDsDong(khoa).forEach(function(x){
    itemDatNhan(x.it, itemNhan(x.it).filter(function(t){ return nhanKhoa(t) !== khoa; }));
    n++;
  });
  return n;
}

/* ---- thẻ "Theo nhãn" ở tab Báo cáo ---- */
var NHAN_SO_DONG = 40;      // số dòng tối đa hiện khi mở một nhãn
function nhanKhoangNgay(r){
  return r.tu === r.den ? ngayVN(r.tu) : ngayNganVN(r.tu) + ' – ' + ngayNganVN(r.den) + '/' + r.den.slice(0, 4);
}
function nhanCardHtml(){
  var ds = nhanThongKe();
  var h = '<div class="card bc-card" id="cardNhan"><h3 class="bc-h"><span>Theo nhãn</span></h3>';
  if (!ds.length){
    return h + '<div class="empty" style="padding:0;text-align:left">Chưa có nhãn nào. Gõ nhãn (ví dụ "Du lịch Đà Lạt") ở ô <b>Nhãn</b> khi ghi khoản để biết cả chuyến đi tốn bao nhiêu.</div></div>';
  }
  h += '<div class="nh-list">';
  ds.forEach(function(r){
    var mo = state.nhanMo === r.khoa;
    h += '<div class="nh-item'+(mo ? ' mo' : '')+'"><div class="nh-row" role="button" tabindex="0" aria-expanded="'+mo+'" data-act="nhanMo" data-k="'+esc(r.khoa)+'">'
      + '<span class="nh-main"><b>'+esc(r.ten)+'</b><small>'+r.n+' khoản · '+nhanKhoangNgay(r)+'</small></span>'
      + '<span class="nh-sum">' + (r.chi > 0 || !r.thu ? '<b class="chi">−'+fmt(Math.round(r.chi))+'</b>' : '')
      + (r.thu > 0 ? '<b class="thu">+'+fmt(Math.round(r.thu))+'</b>' : '') + '</span></div>';
    if (mo){
      var dong = nhanDsDong(r.khoa);
      h += '<div class="nh-ct">' + dong.slice(0, NHAN_SO_DONG).map(function(x){
        return '<div class="nh-d"><span class="nh-ng">'+ngayNganVN(x.date)+'</span><span class="nh-tx">'+esc(x.it.ghiChu || catTen(x.it.kind, x.it.catId))+'<small>'+esc(catTen(x.it.kind, x.it.catId))+'</small></span>'
          + '<b class="'+x.it.kind+'">'+(x.it.kind === 'thu' ? '+' : '−')+fmt(Math.round(num(x.it.soTien)))+'</b></div>';
      }).join('')
        + (dong.length > NHAN_SO_DONG ? '<div class="nh-them">và '+(dong.length - NHAN_SO_DONG)+' khoản cũ hơn</div>' : '')
        + '<div class="nh-btn"><button type="button" class="btn secondary sm" data-act="nhanDoiTen" data-k="'+esc(r.khoa)+'">Đổi tên / gộp</button>'
        + '<button type="button" class="btn secondary sm nguy" data-act="nhanXoa" data-k="'+esc(r.khoa)+'">Gỡ nhãn</button></div></div>';
    }
    h += '</div>';
  });
  return h + '</div></div>';
}

function handleNhanAction(act, el){
  el = el || {};
  var k = el.getAttribute ? el.getAttribute('data-k') : '';
  if (act === 'nhanMo'){
    state.nhanMo = (state.nhanMo === k) ? null : k;
    renderBaoCao();
    return true;
  }
  if (act === 'nhanDoiTen'){
    var r = nhanThongKe().filter(function(x){ return x.khoa === k; })[0];
    if (!r) return true;
    hoiChu('Đổi tên nhãn', 'Đổi tên trên '+r.n+' khoản. Nhập tên một nhãn đã có để gộp hai nhãn.', 'Tên nhãn', r.ten).then(function(ten){
      if (!ten) return;
      if (!nhanKhoa(ten)) return;
      nhanDoiTen(k, ten);
      state.nhanMo = nhanKhoa(ten);
      scheduleSave(); renderBaoCao();
      toast('Đã đổi tên nhãn thành "'+nhanChuan(ten)+'".');
    });
    return true;
  }
  if (act === 'nhanXoa'){
    var r2 = nhanThongKe().filter(function(x){ return x.khoa === k; })[0];
    if (!r2) return true;
    xacNhan('Gỡ nhãn "'+r2.ten+'"?', 'Nhãn bị gỡ khỏi '+r2.n+' khoản. Các giao dịch giữ nguyên, số dư không đổi.', { nguyHiem:true, chuOk:'Gỡ nhãn' }).then(function(ok){
      if (!ok) return;
      nhanXoa(k);
      state.nhanMo = null;
      scheduleSave(); renderBaoCao();
      toast('Đã gỡ nhãn "'+r2.ten+'".');
    });
    return true;
  }
  return false;
}
