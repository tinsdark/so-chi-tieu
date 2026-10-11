"use strict";
/* ====================================================================
   tim.js — TÌM KIẾM TOÀN CỤC: kính lúp ở header (phím tắt "/"), mở lớp phủ, gõ một lần tìm xuyên mọi thứ rồi bấm kết quả để nhảy tới đúng chỗ.
   Tìm trong: giao dịch (ghi chú, nhãn, tên danh mục, hoặc đúng số tiền nếu gõ số), Sổ mừng, Sổ đồ đạc, Vay - Nợ (tên, đối tượng),
   Muốn mua, Lời hứa, danh mục, ví, mục tiêu, định kỳ, nhãn, và "Đi tới" (tên các tab / trang công cụ). Gõ chữ không dấu cũng khớp ("tra sua" = "Trà sữa").
   Chỉ ĐỌC dữ liệu. timTatCa(q) là hàm thuần (trả các nhóm kết quả) để test; phần còn lại chỉ vẽ lớp phủ và điều hướng.
   Lớp phủ dùng --vv-top / --vv-h (xem quy ước lớp phủ ở README), nằm trong danh sách vnMoKhoaNen / vnKhopKhungNhin của vayno.js.
   Cần state.js, nhan.js (nhanChuoi, nhanThongKe), vayno.js, loihua.js (lhChuanHoa), congcu.js, somung.js, dodac.js load trước; app.js (chuyenTab) lúc chạy.
   ==================================================================== */

var TIM_MOI_NHOM = 4;          // số kết quả hiện cho mỗi nhóm 
var TIM_TOI_DA = 100;       // kết quả giữ lại tối đa cho mỗi nhóm
state.tim = state.tim || { mo: false, q: '', sel: 0, het: {} };

// các nơi có thể "Đi tới" (cũng là lối tắt khi ô tìm còn trống)
var TIM_TRANG = [
  { ten: 'Sổ tay', tab: 'sotay' }, { ten: 'Dòng tiền', tab: 'dongtien' }, { ten: 'Báo cáo', tab: 'baocao' }, { ten: 'Vay - Nợ', tab: 'vayno' },
  { ten: 'Công cụ', tab: 'congcu' }, { ten: 'Cài đặt', tab: 'danhmuc' },
  { ten: 'Muốn mua', tab: 'congcu', trang: 'muonmua', phu: 'Công cụ' }, { ten: 'Giờ công', tab: 'congcu', trang: 'giocong', phu: 'Công cụ' },
  { ten: 'Lời hứa', tab: 'congcu', trang: 'loihua', phu: 'Công cụ' }, { ten: 'Sổ mừng và quà', tab: 'congcu', trang: 'sommung', phu: 'Công cụ' },
  { ten: 'Sổ đồ đạc', tab: 'congcu', trang: 'dodac', phu: 'Công cụ' }
];
var TIM_LENH = [
  { ten: 'Ghi khoản chi', kind: 'chi', phu: 'Mở bảng Ghi nhanh' }, { ten: 'Ghi khoản thu', kind: 'thu', phu: 'Mở bảng Ghi nhanh' }
];

/* ---- tìm (hàm thuần) ---- */
function timSo(q){ var t = String(q || '').trim(); return /^\d[\d.,]*\s?(k|tr|nghìn|ngàn)?$/i.test(t) ? numNonNeg(docSo(t)) : 0; }
function timKhop(k, so, parts){
  var h = lhChuanHoa(parts.join(' '));
  return h.indexOf(k) >= 0;
}
// trả [{ key, ten, tong, ds: [{ loai, id, kind, ngay, tieu, phu, tien }] }], mỗi nhóm đã cắt còn số kết quả sẽ hiện (tong = số khớp thật)
function timTatCa(q){
  var k = lhChuanHoa(q), so = timSo(q), d = state.data, nhom = [];
  var them = function(key, ten, ds, gioiHan){
    // giữ tối đa 100 kết quả mỗi nhóm; gioiHan = số hiện ban đầu (nút "Xem thêm" hiện hết)
    if (ds.length) nhom.push({ key: key, ten: ten, tong: ds.length, ds: ds.slice(0, TIM_TOI_DA), gioiHan: gioiHan || TIM_MOI_NHOM });
  };
  var gom = function(arr, fn){ var out = []; (arr || []).forEach(function(x){ var r = fn(x); if (r) out.push(r); }); return out; };
  if (!k) return nhom;
  // Đi tới
  them('trang', 'Đi tới', gom(TIM_TRANG, function(t){
    return lhChuanHoa(t.ten).indexOf(k) >= 0 ? { loai: 'trang', id: t.tab + (t.trang ? ':' + t.trang : ''), tieu: t.ten, phu: t.phu || 'Tab' } : null;
  }).concat(gom(TIM_LENH, function(t){
    return lhChuanHoa(t.ten + ' them ghi').indexOf(k) >= 0 ? { loai: 'lenh', kind: t.kind, tieu: t.ten, phu: t.phu } : null;
  })));
  // Giao dịch: ngày mới nhất lên đầu
  var gd = [];
  Object.keys(d.journal).sort().reverse().forEach(function(ngay){
    entryItems(d.journal[ngay]).forEach(function(it){
      var cat = catTen(it.kind, it.catId);
      var khop = timKhop(k, so, [it.ghiChu, nhanChuoi(it), cat]) || (so > 0 && Math.round(num(it.soTien)) === Math.round(so));
      if (khop) gd.push({ loai: 'gd', id: it.iid, kind: it.kind, ngay: ngay, tieu: String(it.ghiChu || '').trim() || cat,
                          phu: ngayVN(ngay) + ' · ' + cat + (it.walletId && (d.wallets || []).length > 1 ? ' · ' + viTen(viCuaItem(it)) : ''),
                          tien: (it.kind === 'thu' ? '+' : '−') + fmt(Math.round(num(it.soTien))), sotien: num(it.soTien) });
    });
  });
  them('gd', 'Giao dịch', gd, 1);     // timKetQuaHtml gộp nhóm này thành MỘT dòng đầu mục
  if (gd.length){
    var g0 = nhom[nhom.length - 1], ngs = {}; g0.chi = 0; g0.thu = 0;
    gd.forEach(function(x){ ngs[x.ngay] = 1; if (x.sotien) { if (x.kind === 'chi') g0.chi += x.sotien; else g0.thu += x.sotien; } });
    g0.ngay = Object.keys(ngs).length;
  }
  them('mung', 'Sổ mừng và quà', gom(d.quaTang, function(q){
    return (timKhop(k, so, [q.nguoi, q.dip, q.ghiChu]) || (so > 0 && Math.round(q.soTien) === Math.round(so)))
      ? { loai: 'mung', id: q.id, tieu: q.nguoi, phu: (q.dip ? q.dip + ' · ' : '') + ngayVN(q.ngay), tien: (q.chieu === 'nhan' ? '+' : '−') + fmt(Math.round(q.soTien)) } : null;
  }));
  them('dodac', 'Sổ đồ đạc', gom(d.doDac, function(x){
    return (timKhop(k, so, [x.ten, x.ghiChu]) || (so > 0 && Math.round(x.gia) === Math.round(so)))
      ? { loai: 'dodac', id: x.id, tieu: x.ten, phu: 'Mua ' + ngayVN(x.ngayMua) + (x.tt === 'het' ? ' · không dùng nữa' : ''), tien: fmt(Math.round(x.gia)) } : null;
  }));
  var vay = gom(d.vayNo.choVay, function(c){
    return timKhop(k, so, [c.ten, c.nguoi]) ? { loai: 'vay', sub: 'cv', id: c.id, tieu: c.ten, phu: 'Cho vay' + (c.nguoi ? ' · ' + c.nguoi : '') + ' · còn thu ' + fmt(Math.round(conLaiPhaiThu(c))) } : null;
  }).concat(gom(d.vayNo.vayNoPhaiTra, function(v){
    return timKhop(k, so, [v.ten, v.nguoi]) ? { loai: 'vay', sub: 'vn', id: v.id, tieu: v.ten, phu: 'Vay' + (v.nguoi ? ' · ' + v.nguoi : '') + ' · còn trả ' + fmt(Math.round(soTienConLaiPhaiTra(v))) } : null;
  }));
  them('vay', 'Vay - Nợ', vay);
  them('muon', 'Muốn mua', gom(d.muonMua, function(m){
    return timKhop(k, so, [m.ten]) ? { loai: 'muon', id: m.id, tieu: m.ten, phu: m.tt === 'cho' ? 'Đang chờ' : (m.tt === 'mua' ? 'Đã mua' : 'Đã bỏ'), tien: fmt(Math.round(m.soTien)) } : null;
  }));
  them('hua', 'Lời hứa', gom(d.loiHua, function(h){
    return timKhop(k, so, [h.cau, h.tuKhoa, h.catId ? catTen('chi', h.catId) : '']) ? { loai: 'hua', id: h.id, tieu: lhQuyTac(h), phu: h.cau } : null;
  }));
  var dm = [];
  ['thu', 'chi'].forEach(function(kind){
    (d.categories[kind] || []).forEach(function(c){
      if (timKhop(k, so, [c.ten])) dm.push({ loai: 'dm', id: c.id, kind: kind, tieu: c.ten, phu: 'Danh mục ' + (kind === 'thu' ? 'thu' : 'chi') });
    });
  });
  them('dm', 'Danh mục', dm);
  them('vi', 'Ví', gom(d.wallets, function(w){ return timKhop(k, so, [w.ten]) ? { loai: 'vi', id: w.id, tieu: w.ten, phu: w.the ? 'Thẻ tín dụng / trả sau' : 'Ví' } : null; }));
  them('mt', 'Mục tiêu tiết kiệm', gom(d.mucTieu, function(g){ return timKhop(k, so, [g.ten]) ? { loai: 'mt', id: g.id, tieu: g.ten, phu: 'Mục tiêu ' + fmt(Math.round(g.soTien)) } : null; }));
  them('dk', 'Giao dịch định kỳ', gom(d.dinhKy, function(x){ return timKhop(k, so, [x.ten, x.ghiChu]) ? { loai: 'dk', id: x.id, tieu: x.ten, phu: 'Hằng tháng ngày ' + x.ngay, tien: fmt(Math.round(x.soTien)) } : null; }));
  them('nhan', 'Nhãn', gom(nhanThongKe(), function(n){ return timKhop(k, so, [n.ten]) ? { loai: 'nhan', id: n.khoa, tieu: '#' + n.ten, phu: n.n + ' khoản' } : null; }));
  return nhom;
}

/* ---- giao diện ---- */
// gấp từng ký tự (bỏ dấu, chữ thường) mà GIỮ NGUYÊN độ dài để vị trí khớp trỏ đúng vào chuỗi gốc
function timGap(s){
  var out = '';
  for (var i = 0; i < s.length; i++){
    var c = s.charAt(i).toLowerCase().replace('đ', 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += c.length ? c.charAt(0) : ' ';
  }
  return out;
}
// bôi đậm chỗ khớp từ khóa (không phân biệt hoa thường / dấu); trả HTML đã escape
function timDanhDau(text, q){
  text = String(text == null ? '' : text);
  var k = timGap(String(q || '').trim());
  if (!k) return esc(text);
  var f = timGap(text), out = '', i = 0, vt;
  while ((vt = f.indexOf(k, i)) >= 0){
    out += esc(text.slice(i, vt)) + '<mark>' + esc(text.slice(vt, vt + k.length)) + '</mark>';
    i = vt + k.length;
  }
  return out + esc(text.slice(i));
}
function timDongHtml(r, i){
  var q = state.tim.q;
  return '<button type="button" class="tim-r" data-act="timDen" data-i="' + i + '"><span class="tim-r-b"><b>' + timDanhDau(r.tieu, q) + '</b><small>' + timDanhDau(r.phu || '', q) + '</small></span>'
    + (r.tien ? '<span class="tim-r-t ' + (r.tien.charAt(0) === '+' ? 'thu' : (r.tien.charAt(0) === '−' ? 'chi' : '')) + '">' + esc(r.tien) + '</span>' : '') + '</button>';
}
// danh sách phẳng của các kết quả đang hiện (để chọn bằng phím mũi tên / bấm theo số thứ tự)
function timPhang(nhom){ var out = []; nhom.forEach(function(n){ n.ds.forEach(function(r){ out.push(r); }); }); return out; }
function timKetQuaHtml(q){
  var nhom = timTatCa(q), i = 0;
  if (!String(q).trim()){
    var goi = TIM_LENH.map(function(t){ return { loai: 'lenh', kind: t.kind, tieu: t.ten, phu: t.phu }; }).concat(TIM_TRANG.map(function(t){
      return { loai: 'trang', id: t.tab + (t.trang ? ':' + t.trang : ''), tieu: t.ten, phu: t.phu || 'Tab' };
    }));
    state.tim.ds = goi;
    return '<div class="tim-goiy">Gõ để tìm trong mọi thứ: ghi chú, danh mục, tên người, khoản vay, Sổ mừng, Sổ đồ đạc... Hoặc đi nhanh tới:</div>'
      + '<div class="tim-nhom">' + goi.map(function(r, j){ return timDongHtml(r, j); }).join('') + '</div>';
  }
  // mỗi nhóm hiện gioiHan kết quả đầu; "Xem thêm" mở hết nhóm đó
  var het = state.tim.het || {};
  // Giao dịch hay trùng ở gần như mọi ngày (VD "ăn"): không liệt kê từng khoản, chỉ MỘT dòng đầu mục trỏ vào Chi tiết Sổ tay đã lọc sẵn
  nhom.forEach(function(n){
    if (n.key !== 'gd') return;
    n.ds = [{ loai: 'gdTat', tieu: 'Chi tiết Sổ tay', phu: n.tong + ' khoản khớp trong ' + n.ngay + ' ngày' + (n.chi ? ' · chi ' + fmt(Math.round(n.chi)) : '') + (n.thu ? ' · thu ' + fmt(Math.round(n.thu)) : '') }];
  });
  nhom.forEach(function(n){ n.hien = het[n.key] ? n.ds.length : Math.min(n.gioiHan, n.ds.length); n.dsHien = n.ds.slice(0, n.hien); });
  state.tim.ds = []; nhom.forEach(function(n){ n.dsHien.forEach(function(r){ state.tim.ds.push(r); }); });
  if (!nhom.length) return '<div class="empty">Không tìm thấy "' + esc(String(q).trim()) + '".</div>';
  return nhom.map(function(n){
    var h = '<div class="tim-nhom"><div class="tim-nhom-t"><span>' + n.ten + '</span>'
      + (n.key === 'gd' ? '' : (n.tong > n.hien ? '<span class="muted">' + n.hien + ' / ' + n.tong + '</span>' : '<span class="muted">' + n.tong + '</span>')) + '</div>'
      + n.dsHien.map(function(r){ return timDongHtml(r, i++); }).join('');
    if (n.hien < n.ds.length) h += '<button type="button" class="tim-them" data-act="timThem" data-k="' + n.key + '">Xem thêm ' + (n.ds.length - n.hien) + ' kết quả</button>';
    return h + '</div>';
  }).join('');
}
function timVe(){
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  var root = document.getElementById('timRoot');
  if (!state.tim.mo){
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (!vnMoKhoaNen()) document.body.classList.remove('qa-mo');
    return;
  }
  if (root) return;
  root = document.createElement('div');
  root.id = 'timRoot'; root.className = 'tim-back';
  root.innerHTML = '<div class="tim-scrim" data-act="timDong"></div><div class="tim-panel" role="dialog" aria-modal="true" aria-label="Tìm kiếm">'
    + '<div class="tim-bar">' + icon('search') + '<input type="search" id="tim_q" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="Tìm giao dịch, người, món đồ, khoản vay..." value="' + esc(state.tim.q) + '">'
    + '<button type="button" class="tim-x" data-act="timDong" aria-label="Đóng tìm kiếm">' + icon('x') + '</button></div>'
    + '<div class="tim-kq" id="timKq">' + timKetQuaHtml(state.tim.q) + '</div></div>';
  document.body.appendChild(root);
  document.body.classList.add('qa-mo');
  vnKhopKhungNhin();
  timChon(0);
  // focus NGAY trong lúc xử lý cú bấm: iOS chỉ bật bàn phím khi focus nằm trong cử chỉ của người dùng (setTimeout làm mất cử chỉ)
  var o = document.getElementById('tim_q'); if (o && o.focus) o.focus();
}
function timChon(i){
  var rs = document.querySelectorAll('#timKq .tim-r');
  if (!rs.length) { state.tim.sel = 0; return; }
  state.tim.sel = Math.max(0, Math.min(rs.length - 1, i));
  [].forEach.call(rs, function(b, j){ b.classList.toggle('sel', j === state.tim.sel); });
  if (rs[state.tim.sel].scrollIntoView) rs[state.tim.sel].scrollIntoView({ block: 'nearest' });
}

/* ---- điều hướng tới kết quả ---- */
// tìm đúng dòng trên màn hình (sau khi tab vẽ xong), cuộn tới và nháy sáng; không thấy (dòng bị gập / cắt) thì chạy fallback
function timDong(sel){
  var o = document.querySelector(sel);
  return o ? (o.closest && o.closest('.dl-row, .cc-it, .dm-row, .vn-c') || o) : null;
}
function timDich(sel, fallback, lan){
  lan = lan || 0;
  var o = typeof document !== 'undefined' ? timDong(sel) : null;
  if (o){
    if (o.scrollIntoView) o.scrollIntoView({ block: 'center' });
    o.classList.remove('tim-nhay'); void o.offsetWidth; o.classList.add('tim-nhay');
    setTimeout(function(){ o.classList.remove('tim-nhay'); }, 2600);
    return;
  }
  if (lan < 8) setTimeout(function(){ timDich(sel, fallback, lan + 1); }, 90);
  else if (fallback) fallback();
}
function timDi(r){
  var q = String(state.tim.q || '').trim(), dich = null, fb = null;
  state.tim.mo = false; timVe();
  var tab = null, sau = null, lh = function(a, id){ return '[data-act="' + a + '"][data-id="' + String(id).replace(/"/g, '') + '"]'; };
  if (r.loai === 'trang'){
    var p = r.id.split(':'); tab = p[0];
    if (tab === 'congcu') state.ccTrang = p[1] || '';
  } else if (r.loai === 'lenh'){
    tab = 'sotay'; sau = function(){ state.qa.kind = r.kind; handleAction('qaMo', null); };
  } else if (r.loai === 'gdTat'){
    state.soTaySearch = q; state.soTayFrom = ''; state.soTayTo = ''; state.soTayCat = ''; state.soTayLocMo = true; tab = 'sotay';
  } else if (r.loai === 'dm'){ state.dmForm = { loai: 'cat', kind: r.kind, id: r.id }; tab = 'danhmuc'; }
  else if (r.loai === 'vi'){ state.dmForm = { loai: 'vi', id: r.id }; tab = 'danhmuc'; }
  else if (r.loai === 'mt'){ state.mtForm = { id: r.id }; tab = 'danhmuc'; }
  else if (r.loai === 'dk'){ state.dkForm = { id: r.id }; tab = 'danhmuc'; }
  else if (r.loai === 'vay'){
    tab = 'vayno';
    if (r.sub === 'vn'){ var v = (state.data.vayNo.vayNoPhaiTra || []).filter(function(x){ return x.id === r.id; })[0]; if (v && !loanIsActive(v)) state.vnXong = true; dich = '#vn-vn-' + r.id; }
    else { var c = (state.data.vayNo.choVay || []).filter(function(x){ return x.id === r.id; })[0]; if (c && (c.tatToan || conLaiPhaiThu(c) <= 0.5)) state.vnXongCV = true; dich = '#vn-cv-' + r.id; }
  }
  else if (r.loai === 'nhan'){ tab = 'baocao'; }
  else if (r.loai === 'mung'){ state.ccTrang = 'sommung'; state.sm.tim = q; tab = 'congcu'; dich = lh('smSua', r.id); }
  else if (r.loai === 'dodac'){ state.ccTrang = 'dodac'; tab = 'congcu'; dich = lh('ddSua', r.id); fb = function(){ state.ccForm = { loai: 'dd', id: r.id }; renderAll(); }; }
  else if (r.loai === 'muon'){ state.ccTrang = 'muonmua'; tab = 'congcu'; dich = lh('mmMuaRoi', r.id); }
  else if (r.loai === 'hua'){ state.ccTrang = 'loihua'; tab = 'congcu'; dich = lh('lhSua', r.id); fb = function(){ state.ccForm = { loai: 'lh', id: r.id }; renderAll(); }; }
  if (!tab) return;
  if (tab === 'danhmuc'){ var f = state.dkForm ? { loai: 'dk' } : (state.mtForm ? { loai: 'mt' } : state.dmForm); if (f) state.dmTab = dmTabCua(f.loai); }
  chuyenTab(tab);
  if (sau) setTimeout(sau, 350);       // chờ chuyển tab xong mới mở bảng
  if (dich) setTimeout(function(){ timDich(dich, fb); }, 120);
  else if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
}

/* ---- sự kiện ---- */
function handleTimAction(act, el){
  if (act === 'timBat'){ state.tim.mo = true; state.tim.q = ''; state.tim.het = {}; timVe(); return true; }
  if (act === 'timThem'){
    state.tim.het = state.tim.het || {}; state.tim.het[el.getAttribute('data-k')] = true;
    var kq = document.getElementById('timKq'); if (kq) kq.innerHTML = timKetQuaHtml(state.tim.q);
    return true;
  }
  if (act === 'timDong'){ state.tim.mo = false; timVe(); return true; }
  if (act === 'timDen'){
    var r = (state.tim.ds || [])[parseInt(el.getAttribute('data-i'), 10)];
    if (r) timDi(r);
    return true;
  }
  return false;
}
function handleTimInput(el){
  if (!el || el.id !== 'tim_q') return false;
  state.tim.q = el.value; state.tim.het = {};
  var o = document.getElementById('timKq');
  if (o){ o.innerHTML = timKetQuaHtml(el.value); timChon(0); }
  return false;
}
if (typeof document !== 'undefined' && document.addEventListener){
  document.addEventListener('keydown', function(ev){
    if (!state.tim || !state.tim.mo) return;
    if (ev.key === 'Escape'){ ev.preventDefault(); state.tim.mo = false; timVe(); }
    else if (ev.key === 'ArrowDown'){ ev.preventDefault(); timChon(state.tim.sel + 1); }
    else if (ev.key === 'ArrowUp'){ ev.preventDefault(); timChon(state.tim.sel - 1); }
    else if (ev.key === 'Enter' && ev.target && ev.target.id === 'tim_q'){
      ev.preventDefault();
      var r = (state.tim.ds || [])[state.tim.sel || 0];
      if (r) timDi(r);
    }
  });
}
