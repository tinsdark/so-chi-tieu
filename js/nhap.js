"use strict";
/* ====================================================================
   nhap.js — NHẬP giao dịch từ file CSV / Excel vào Sổ tay.
   Cần state.js + vayno.js (daysInMonth) + ui.js (docSo/veSo/toast) load trước.

   Nguyên tắc an toàn (nhập hàng loạt là thao tác dễ làm bẩn dữ liệu nhất):
   - LUÔN có bước xem trước: bảng các dòng sẽ nhập, dòng lỗi, dòng trùng. Chưa bấm "Nhập" là chưa ghi gì.
   - Dòng trùng với giao dịch ĐÃ CÓ (cùng ngày + loại + số tiền + nội dung) mặc định bị bỏ qua,
     nên nhập lại cùng 1 file 2 lần không nhân đôi tiền.
   - Mọi dòng nhập đi qua entryAddItem (đúng đường lưu của Sổ tay) và được hoàn tác 1 lần.
   - Phần PHÂN TÍCH (parse, đoán cột, gộp danh mục) là hàm thuần, không đụng DOM -> test được.
   - Phần thập phân của số tiền bị bỏ (VND không có lẻ), "1.500.000" / "1,500,000" / "-50.000đ" đều đọc được.
   ==================================================================== */

function nhapBoDau(s){
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

/* ---- QUY TẮC TỰ PHÂN LOẠI: settings.quyTac = [{ id, tuKhoa, kind, catId }] ----
   Ghi chú chứa từ khóa (không phân biệt hoa thường / dấu) -> danh mục đó. Quy tắc đứng trước thắng.
   Dùng ở Nhập file (dòng không có cột danh mục) và Ghi nhanh (gõ ghi chú tự chọn danh mục). */
function nhapQuyTac(kind, text){
  var t = nhapBoDau(text);
  if (!t) return '';
  var ds = (state.data.settings && state.data.settings.quyTac) || [];
  for (var i = 0; i < ds.length; i++){
    var q = ds[i], k = nhapBoDau(q.tuKhoa);
    if (!k || q.kind !== kind || t.indexOf(k) < 0) continue;
    if ((state.data.categories[kind] || []).some(function(c){ return c.id === q.catId; })) return q.catId;
  }
  return '';
}
// "chữ ký" của 1 file sao kê = dòng tiêu đề đã bỏ dấu. Cùng ngân hàng/ví xuất ra thì giống nhau -> dùng lại cách ghép cột.
function nhapChuKy(rows, coHeader){
  if (!coHeader || !rows.length) return '';
  return rows[0].map(function(c){ return nhapBoDau(c); }).join('|');
}
var NHAP_MAU_GIU = 10;
function nhapLuuMau(imp){
  var ck = nhapChuKy(imp.rows, imp.coHeader);
  if (!ck) return;
  var m = state.data.settings.mauNhap;
  m[ck] = { map: JSON.parse(JSON.stringify(imp.map)), soDuong: imp.soDuong, catMD: JSON.parse(JSON.stringify(imp.catMD || {})), viId: imp.viId, luc: Date.now() };
  var keys = Object.keys(m).sort(function(a, b){ return (m[b].luc || 0) - (m[a].luc || 0); });
  keys.slice(NHAP_MAU_GIU).forEach(function(k){ delete m[k]; });
}

// -> 'YYYY-MM-DD' hoặc ''. Kiểu Việt Nam: ngày/tháng/năm (không đoán kiểu Mỹ). Số = số ngày của Excel.
function nhapParseNgay(v){
  if (v == null || v === '') return '';
  var y, mo, d;
  if (typeof v === 'number'){
    if (v < 20000 || v > 90000) return '';
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  }
  var s = String(v).trim(), m;
  if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/.exec(s))){ y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})(?!\d)/.exec(s))){ d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else return '';
  if (mo < 1 || mo > 12 || d < 1) return '';
  var mk = y + '-' + pad2(mo);
  if (d > daysInMonth(mk)) return '';
  return mk + '-' + pad2(d);
}

// -> số (có thể âm) hoặc NaN. Dấu âm: "-", "−", ngoặc đơn "(50.000)".
function nhapParseTien(v){
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  var s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  var am = /^[-−–]/.test(s) || /^\(.*\)$/.test(s) || /[-−–]$/.test(s);
  s = s.replace(/vnd|vnđ|đ|₫/ig, '').replace(/\s+/g, '');
  s = s.replace(/[.,]\d{1,2}$/, '');          // phần lẻ 1-2 chữ số cuối: bỏ (3 chữ số = hàng nghìn, giữ)
  var digits = s.replace(/[^\d]/g, '');
  if (!digits) return NaN;
  var n = parseInt(digits, 10);
  return am ? -n : n;
}

// 'thu' | 'chi' | '' từ giá trị ô "Loại"
function nhapParseLoai(v){
  var s = nhapBoDau(v);
  if (!s) return '';
  // cố ý KHÔNG đoán "Nợ/Có": trong sổ sách kế toán chiều của chúng tùy tài khoản, đoán sai là đảo thu/chi
  if (/^(thu|thu nhap|income|in|\+|credit)$/.test(s) || /^thu\b/.test(s)) return 'thu';
  if (/^(chi|chi tieu|expense|out|-|debit)$/.test(s) || /^chi\b/.test(s)) return 'chi';
  return '';
}

// CSV tối giản đúng RFC 4180: ngoặc kép, dấu phẩy/chấm phẩy/tab trong ô, xuống dòng trong ô. Tự đoán dấu ngăn cách.
function nhapParseCsv(text){
  text = String(text == null ? '' : text).replace(/^﻿/, '');
  var dau = ',', best = -1;
  [',', ';', '\t'].forEach(function(c){
    var dong1 = text.split(/\r?\n/)[0] || '';
    var n = dong1.split(c).length - 1;
    if (n > best){ best = n; dau = c; }
  });
  var rows = [], row = [], cell = '', inQ = false, i = 0;
  while (i < text.length){
    var ch = text[i];
    if (inQ){
      if (ch === '"'){ if (text[i + 1] === '"'){ cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"'){ inQ = true; }
    else if (ch === dau){ row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r'){
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(function(x){ return String(x).trim() !== ''; })) rows.push(row);
      row = [];
    } else cell += ch;
    i++;
  }
  row.push(cell);
  if (row.some(function(x){ return String(x).trim() !== ''; })) rows.push(row);
  return rows;
}

// dòng đầu có phải tiêu đề: không ô nào đọc được là ngày hay số tiền
function nhapGiongSo(c){
  if (typeof c === 'number') return true;
  return /^[\s\d.,\-−–()]*\d[\s\d.,\-−–()]*(vnd|vnđ|đ|₫)?\s*$/i.test(String(c == null ? '' : c));
}
function nhapCoHeader(rows){
  if (!rows.length) return false;
  return !rows[0].some(function(c){ return nhapParseNgay(c) !== '' || nhapGiongSo(c); });
}

// đoán cột. Có tiêu đề thì theo tên; không có thì theo nội dung các dòng đầu.
function nhapDoanCot(rows, coHeader){
  var nCot = rows.reduce(function(m, r){ return Math.max(m, r.length); }, 0);
  var map = { ngay: -1, tien: -1, loai: -1, cat: -1, note: -1, vi: -1 };
  if (coHeader && rows.length){
    rows[0].forEach(function(h, i){
      var t = nhapBoDau(h);
      if (map.ngay < 0 && /^(ngay|date|thoi gian|time)/.test(t)) map.ngay = i;
      else if (map.loai < 0 && /(^loai\b|^type\b|thu\s*\/?\s*chi)/.test(t)) map.loai = i;
      else if (map.cat < 0 && /(danh muc|category|nhom|hang muc)/.test(t)) map.cat = i;
      else if (map.vi < 0 && /(^vi\b|tai khoan|nguon tien|wallet|account)/.test(t)) map.vi = i;
      else if (map.tien < 0 && /(so tien|amount|gia tri|value|^tien\b|sotien)/.test(t)) map.tien = i;
      else if (map.note < 0 && /(ghi chu|noi dung|mo ta|description|note|dien giai|memo)/.test(t)) map.note = i;
    });
  }
  var mau = rows.slice(coHeader ? 1 : 0, (coHeader ? 1 : 0) + 20);
  var tyLe = function(i, fn){ var n = 0; mau.forEach(function(r){ if (fn(r[i])) n++; }); return mau.length ? n / mau.length : 0; };
  if (map.ngay < 0) for (var i = 0; i < nCot; i++) if (tyLe(i, function(c){ return nhapParseNgay(c) !== ''; }) >= 0.8){ map.ngay = i; break; }
  if (map.tien < 0) for (var j = 0; j < nCot; j++){
    if (j === map.ngay) continue;
    if (tyLe(j, function(c){ return !isNaN(nhapParseTien(c)) && nhapParseNgay(c) === ''; }) >= 0.8){ map.tien = j; break; }
  }
  if (map.note < 0) for (var k = nCot - 1; k >= 0; k--){
    if ([map.ngay, map.tien, map.loai, map.cat, map.vi].indexOf(k) >= 0) continue;
    if (tyLe(k, function(c){ return String(c == null ? '' : c).trim() !== ''; }) >= 0.3){ map.note = k; break; }
  }
  return map;
}

// Phân tích toàn bộ file theo cấu hình imp -> các dòng đã chuẩn hóa + lỗi + trùng.
// imp = { rows, coHeader, map, soDuong:'thu'|'chi', catMacDinh:'kind|id', catMap:{key:'kind|id'|'+'}, boTrung:bool }
function nhapPhanTich(imp){
  var d = state.data;
  var tuHang = imp.coHeader ? 1 : 0;
  var cell = function(r, i){ return (i >= 0 && i < r.length) ? r[i] : ''; };
  // khóa các item đã có để phát hiện trùng
  var daCo = {};
  Object.keys(d.journal).forEach(function(date){
    entryItems(d.journal[date]).forEach(function(it){
      daCo[date + '|' + it.kind + '|' + Math.round(num(it.soTien)) + '|' + nhapBoDau(it.ghiChu)] = true;
    });
  });
  var catDaTim = function(kind, ten){
    var t = nhapBoDau(ten), r = null;
    (d.categories[kind] || []).forEach(function(c){ if (!r && !(kind === 'thu' ? VN_ONLY_THU : VN_ONLY_CHI)[c.id] && nhapBoDau(c.ten) === t) r = c; });
    return r;
  };
  var out = { dong: [], catCanChon: {}, nLoi: 0, nTrung: 0, nOk: 0, tongThu: 0, tongChi: 0 };
  var start = d.settings.ngayBatDau || '';
  for (var i = tuHang; i < imp.rows.length; i++){
    var r = imp.rows[i];
    var x = { stt: i + 1, ngay: nhapParseNgay(cell(r, imp.map.ngay)), kind: '', soTien: 0, catTen: '', note: String(cell(r, imp.map.note) == null ? '' : cell(r, imp.map.note)).trim(),
              catId: '', catMoi: '', loi: '', canhBao: '', trung: false };
    var tien = nhapParseTien(cell(r, imp.map.tien));
    if (!x.ngay) x.loi = 'Ngày không đọc được';
    else if (isNaN(tien) || tien === 0) x.loi = 'Số tiền không đọc được hoặc bằng 0';
    else {
      var loai = nhapParseLoai(cell(r, imp.map.loai));
      // có cột Loại thì tin cột Loại (số âm chỉ là dấu); không có thì số âm = chi, số dương theo soDuong
      x.kind = loai || (tien < 0 ? 'chi' : imp.soDuong);
      x.soTien = Math.abs(tien);
      var tenCat = String(cell(r, imp.map.cat) == null ? '' : cell(r, imp.map.cat)).trim();
      // danh mục mặc định riêng cho thu / chi (imp.catMD); chuỗi 'kind|id' (imp.catMacDinh) là dạng cũ, vẫn đọc được
      var macDinh = (imp.catMD ? (imp.catMD[x.kind] || '') : (imp.catMacDinh || '')).split('|');
      if (tenCat){
        x.catTen = tenCat;
        var key = x.kind + '|' + nhapBoDau(tenCat);
        var chon = imp.catMap[key];
        if (chon && chon !== '+'){ x.catId = chon.split('|')[1]; }
        else if (chon === '+'){ x.catMoi = tenCat; }
        else { var c = catDaTim(x.kind, tenCat); if (c) x.catId = c.id; else x.catMoi = tenCat; }
        out.catCanChon[key] = { kind: x.kind, ten: tenCat, chon: x.catId ? x.kind + '|' + x.catId : '+' };
      } else if (nhapQuyTac(x.kind, x.note)){
        x.catId = nhapQuyTac(x.kind, x.note);
      } else if (macDinh.length === 2 && macDinh[0] === x.kind && macDinh[1]){
        x.catId = macDinh[1];
      } else {
        x.loi = 'Không có danh mục (chọn "Danh mục mặc định" cho khoản ' + (x.kind === 'thu' ? 'thu' : 'chi') + ')';
      }
      if (!x.loi){
        if (start && x.ngay < start) x.canhBao = 'trước mốc chốt số dư ' + start + ' (không tính vào số dư)';
        if (imp.boTrung && daCo[x.ngay + '|' + x.kind + '|' + Math.round(x.soTien) + '|' + nhapBoDau(x.note)]){ x.trung = true; }
      }
    }
    if (x.loi) out.nLoi++; else if (x.trung) out.nTrung++; else { out.nOk++; if (x.kind === 'thu') out.tongThu += x.soTien; else out.tongChi += x.soTien; }
    out.dong.push(x);
  }
  return out;
}

// Ghi các dòng hợp lệ (không lỗi, không trùng) vào Sổ tay. Trả về thông tin để hoàn tác.
function nhapThucHien(imp, kq){
  var tao = {}, moi = [], da = [];
  kq.dong.forEach(function(x){
    if (x.loi || x.trung) return;
    var catId = x.catId;
    if (!catId){
      var k = x.kind + '|' + nhapBoDau(x.catMoi);
      if (!tao[k]){
        var c = { id: slugify(x.catMoi) + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), ten: x.catMoi, chiTieu: 0 };
        state.data.categories[x.kind].push(c); tao[k] = c.id; moi.push({ kind: x.kind, id: c.id });
      }
      catId = tao[k];
    }
    var it = entryAddItem(x.ngay, x.kind, catId, x.soTien, x.note || x.catTen, imp.viId);
    if (!it) return;
    var e = state.data.journal[x.ngay];
    var ghi = (x.note || x.catTen || '') + (x.note || x.catTen ? ' ' : '') + fmt(Math.round(x.soTien));
    e.ghiChu = e.ghiChu ? e.ghiChu + '; ' + ghi : ghi;
    it.gc = ghi;       // xóa dòng này thì mẩu ghi chú ngày cũng đi theo
    da.push({ date: x.ngay, iid: it.iid, note: ghi });
  });
  return { da: da, moi: moi };
}

function nhapHoanTac(r){
  r.da.forEach(function(x){
    var e = state.data.journal[x.date];
    if (e) journalRemoveNote(e, x.note);
    entryDeleteItem(x.date, x.iid);
  });
  r.moi.forEach(function(m){
    var dung = Object.keys(state.data.journal).some(function(date){
      return entryItems(state.data.journal[date]).some(function(it){ return it.kind === m.kind && it.catId === m.id; });
    });
    if (!dung) state.data.categories[m.kind] = state.data.categories[m.kind].filter(function(c){ return c.id !== m.id; });
  });
}

/* ====================================================================
   GIAO DIỆN — thẻ "Nhập từ file" ở Sổ tay. state.imp = null (đóng) | {buoc:'chon'} | cấu hình đã đọc file.
   ==================================================================== */
var NHAP_TOI_DA = 5000;
function nhapTenCot(i){
  var chuoi = ''; var n = i;
  do { chuoi = String.fromCharCode(65 + (n % 26)) + chuoi; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return chuoi;
}
function nhapNhanCot(imp, i){
  var mau = imp.rows[0] ? imp.rows[0][i] : '';
  var t = String(mau == null ? '' : mau).trim();
  if (t.length > 22) t = t.slice(0, 21) + '…';
  return 'Cột ' + nhapTenCot(i) + (t ? ' — ' + t : '');
}
function nhapOptCot(imp, nCot, sel){
  var o = '<option value="-1"'+(sel < 0 ? ' selected' : '')+'>— không có —</option>';
  for (var i = 0; i < nCot; i++) o += '<option value="'+i+'"'+(sel === i ? ' selected' : '')+'>'+esc(nhapNhanCot(imp, i))+'</option>';
  return o;
}
function nhapOptCat(sel, kind){
  var d = state.data;
  function nhom(k, nhan){
    var loai = (k === 'thu') ? VN_ONLY_THU : VN_ONLY_CHI;
    var o = (d.categories[k] || []).filter(function(c){ return !loai[c.id]; }).map(function(c){
      var v = k + '|' + c.id;
      return '<option value="'+esc(v)+'"'+(v === sel ? ' selected' : '')+'>'+esc(c.ten)+'</option>';
    }).join('');
    return o ? '<optgroup label="'+nhan+'">'+o+'</optgroup>' : '';
  }
  return kind ? nhom(kind, kind === 'thu' ? 'Thu' : 'Chi') : nhom('thu', 'Thu') + nhom('chi', 'Chi');
}
function nhapSoDuongTuDong(rows, coHeader, map){
  // có số âm trong cột tiền -> kiểu sao kê ngân hàng (âm = chi, dương = thu); toàn dương -> kiểu liệt kê chi tiêu
  var am = false;
  for (var i = coHeader ? 1 : 0; i < rows.length; i++){ var n = nhapParseTien(rows[i][map.tien]); if (!isNaN(n) && n < 0){ am = true; break; } }
  return am ? 'thu' : 'chi';
}

function nhapCardHtml(){
  var imp = state.imp;
  if (!imp) return '';
  if (imp.buoc === 'chon'){
    return '<div class="card"><h3>Nhập từ CSV / Excel</h3>'
      + '<div class="empty" style="padding:0 0 10px;text-align:left">Chọn file có các cột ngày, số tiền, nội dung (và tùy chọn: loại thu/chi, danh mục). '
      + 'File CSV nên lưu dạng <b>UTF-8</b> để không lỗi tiếng Việt. Sẽ có bước xem trước, chưa ghi gì cho tới khi bạn bấm Nhập.</div>'
      + '<input type="file" id="imp_file" data-act="impFile" accept=".csv,.tsv,.txt,.xlsx,.xls">'
      + '<div style="margin-top:10px"><button class="btn secondary sm" data-act="impHuy">Hủy</button></div></div>';
  }
  var kq = nhapPhanTich(imp);
  var nCot = imp.rows.reduce(function(m, r){ return Math.max(m, r.length); }, 0);
  var h = '<div class="card"><h3>Nhập từ file: '+esc(imp.ten)+'</h3>';
  if (imp.dungMau) h += '<div class="empty" style="padding:0 0 10px;text-align:left">'+icon('check')+' File cùng kiểu với lần nhập trước: đã dùng lại cách ghép cột, danh mục mặc định và ví của lần đó. Kiểm tra lại bên dưới nếu cần.</div>';
  if ((state.data.settings.quyTac || []).length) h += '<div class="empty" style="padding:0 0 10px;text-align:left">Dòng không có danh mục sẽ được xếp theo <b>quy tắc tự phân loại</b> (tab Danh mục) trước khi dùng danh mục mặc định.</div>';
  h += '<label style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><input type="checkbox" data-act="impHeader"'+(imp.coHeader ? ' checked' : '')+'> Dòng đầu là tiêu đề cột</label>';
  h += '<div class="form-row">'
    + '<div><label>Cột Ngày *</label><select data-act="impMap" data-f="ngay">'+nhapOptCot(imp, nCot, imp.map.ngay)+'</select></div>'
    + '<div><label>Cột Số tiền *</label><select data-act="impMap" data-f="tien">'+nhapOptCot(imp, nCot, imp.map.tien)+'</select></div>'
    + '<div><label>Cột Loại thu/chi</label><select data-act="impMap" data-f="loai">'+nhapOptCot(imp, nCot, imp.map.loai)+'</select></div>'
    + '<div><label>Cột Danh mục</label><select data-act="impMap" data-f="cat">'+nhapOptCot(imp, nCot, imp.map.cat)+'</select></div>'
    + '<div><label>Cột Nội dung</label><select data-act="impMap" data-f="note">'+nhapOptCot(imp, nCot, imp.map.note)+'</select></div>'
    + '</div>';
  h += '<div class="form-row">'
    + '<div><label>Số dương là</label><select data-act="impSoDuong"><option value="chi"'+(imp.soDuong === 'chi' ? ' selected' : '')+'>Khoản chi</option><option value="thu"'+(imp.soDuong === 'thu' ? ' selected' : '')+'>Khoản thu</option></select></div>'
    + '<div><label>Danh mục mặc định cho khoản chi (khi ô trống)</label><select data-act="impCatMD" data-k="chi"><option value="">— không có —</option>'+nhapOptCat(imp.catMD.chi, 'chi')+'</select></div>'
    + '<div><label>Danh mục mặc định cho khoản thu (khi ô trống)</label><select data-act="impCatMD" data-k="thu"><option value="">— không có —</option>'+nhapOptCat(imp.catMD.thu, 'thu')+'</select></div>'
    + ((state.data.wallets || []).length > 1 ? '<div><label>Ví</label><select data-act="impVi">'+viOptionsHtml(imp.viId)+'</select></div>' : '')
    + '</div>';
  h += '<label style="display:flex;align-items:center;gap:6px;margin:4px 0 10px"><input type="checkbox" data-act="impTrung"'+(imp.boTrung ? ' checked' : '')+'> Bỏ qua dòng trùng với giao dịch đã có (cùng ngày, loại, số tiền, nội dung)</label>';

  var keys = Object.keys(kq.catCanChon);
  if (keys.length){
    h += '<div class="empty" style="padding:0 0 6px;text-align:left"><b>Ghép danh mục trong file với danh mục của app</b></div>'
      + '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Trong file</th><th>Loại</th><th style="text-align:left">Thành danh mục</th></tr></thead><tbody>';
    keys.forEach(function(k){
      var c = kq.catCanChon[k];
      h += '<tr><td style="text-align:left">'+esc(c.ten)+'</td><td>'+(c.kind === 'thu' ? 'Thu' : 'Chi')+'</td>'
        + '<td style="text-align:left"><select data-act="impCat" data-key="'+esc(k)+'">'
        + '<option value="+"'+(c.chon === '+' ? ' selected' : '')+'>＋ Tạo danh mục mới "'+esc(c.ten)+'"</option>'
        + nhapOptCat(c.chon, c.kind) + '</select></td></tr>';
    });
    h += '</tbody></table></div>';
  }

  h += '<div style="margin:10px 0;font-size:13px">Sẽ nhập <b>'+kq.nOk+'</b> dòng'
    + (kq.nOk ? ' (thu <span style="color:var(--green)">'+fmt(Math.round(kq.tongThu))+'</span>, chi <span style="color:var(--red)">'+fmt(Math.round(kq.tongChi))+'</span>)' : '')
    + (kq.nTrung ? ' · <span style="color:var(--amber)">'+kq.nTrung+' dòng trùng bỏ qua</span>' : '')
    + (kq.nLoi ? ' · <span style="color:var(--red)">'+kq.nLoi+' dòng lỗi bỏ qua</span>' : '') + '</div>';

  var SHOW = 12;
  h += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Ngày</th><th>Loại</th><th>Số tiền</th><th style="text-align:left">Danh mục</th><th style="text-align:left">Nội dung</th><th style="text-align:left">Trạng thái</th></tr></thead><tbody>';
  kq.dong.slice(0, SHOW).forEach(function(x){
    var tt = x.loi ? '<span style="color:var(--red)">'+esc(x.loi)+'</span>'
      : (x.trung ? '<span style="color:var(--amber)">Trùng — bỏ qua</span>'
      : (x.canhBao ? '<span style="color:var(--amber)">'+esc(x.canhBao)+'</span>' : '<span style="color:var(--green)">OK</span>'));
    var cat = x.catId ? catTen(x.kind, x.catId) : (x.catMoi ? '＋ ' + x.catMoi : '');
    h += '<tr><td>'+x.stt+'</td><td>'+(x.ngay ? ngayVN(x.ngay) : '—')+'</td><td>'+(x.kind ? (x.kind === 'thu' ? 'Thu' : 'Chi') : '—')+'</td>'
      + '<td style="color:var(--'+(x.kind === 'thu' ? 'green' : 'red')+')">'+(x.soTien ? fmt(Math.round(x.soTien)) : '—')+'</td>'
      + '<td style="text-align:left">'+esc(cat)+'</td><td style="text-align:left;white-space:normal">'+esc(x.note)+'</td><td style="text-align:left;white-space:normal">'+tt+'</td></tr>';
  });
  h += '</tbody></table></div>';
  if (kq.dong.length > SHOW) h += '<div class="empty" style="padding:6px 0 0;text-align:left">… và '+(kq.dong.length - SHOW)+' dòng nữa (đều được xử lý như trên).</div>';

  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
    + '<button class="btn" data-act="impNhap"'+(kq.nOk ? '' : ' disabled')+'>Nhập '+kq.nOk+' dòng</button>'
    + '<button class="btn secondary" data-act="impMo">Chọn file khác</button>'
    + '<button class="btn secondary" data-act="impHuy">Hủy</button></div></div>';
  return h;
}

// đọc file -> {rows}; CSV tự parse (kiểm soát hoàn toàn định dạng), Excel qua SheetJS
function nhapDocFile(file){
  return new Promise(function(resolve, reject){
    var fr = new FileReader();
    var laText = /\.(csv|tsv|txt)$/i.test(file.name);
    fr.onerror = function(){ reject(new Error('Không đọc được file')); };
    fr.onload = function(){
      try{
        if (laText) return resolve(nhapParseCsv(fr.result));
        var wb = XLSX.read(fr.result, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        resolve(rows.filter(function(r){ return r.some(function(c){ return String(c).trim() !== ''; }); }));
      }catch(e){ reject(e); }
    };
    if (laText) fr.readAsText(file, 'utf-8'); else fr.readAsArrayBuffer(file);
  });
}

function handleNhapAction(act, el){
  if (act === 'impMo'){
    state.imp = { buoc: 'chon' }; renderSoTay();
  } else if (act === 'impHuy'){
    state.imp = null; renderSoTay();
  } else if (act === 'impNhap'){
    var imp = state.imp;
    if (!imp || imp.buoc === 'chon') return true;
    var kq = nhapPhanTich(imp);
    if (!kq.nOk){ toast('Không có dòng nào hợp lệ để nhập.', { loai:'warn' }); return true; }
    var r = nhapThucHien(imp, kq);
    nhapLuuMau(imp);
    state.imp = null;
    scheduleSave();
    renderSoTay();
    toast('Đã nhập '+r.da.length+' dòng vào Sổ tay'+(r.moi.length ? ' và tạo '+r.moi.length+' danh mục mới' : '')+'.', { giay: 10, hoanTac: function(){
      nhapHoanTac(r);
      scheduleSave(); renderSoTay();
    } });
  } else {
    return false;
  }
  return true;
}

function handleNhapChange(el){
  var imp = state.imp;
  if (!imp) return false;
  if (el.matches('[data-act=impFile]')){
    var f = el.files && el.files[0];
    if (!f) return true;
    nhapDocFile(f).then(function(rows){
      if (!rows.length){ toast('File trống hoặc không đọc được dòng nào.', { loai:'err' }); return; }
      if (rows.length > NHAP_TOI_DA){ toast('File có '+rows.length+' dòng, vượt giới hạn '+NHAP_TOI_DA+'. Hãy chia nhỏ file.', { loai:'err' }); return; }
      var coHeader = nhapCoHeader(rows);
      var map = nhapDoanCot(rows, coHeader);
      state.imp = { buoc: 'xem', ten: f.name, rows: rows, coHeader: coHeader, map: map,
        soDuong: nhapSoDuongTuDong(rows, coHeader, map), catMD: { thu: '', chi: '' }, catMap: {},
        viId: viDienSan(), boTrung: true };
      // file cùng kiểu (cùng dòng tiêu đề) đã từng nhập: dùng lại cách ghép cột / danh mục mặc định / ví của lần trước
      var mau = state.data.settings.mauNhap[nhapChuKy(rows, coHeader)];
      if (mau){
        state.imp.map = JSON.parse(JSON.stringify(mau.map)); state.imp.soDuong = mau.soDuong || state.imp.soDuong;
        state.imp.catMD = JSON.parse(JSON.stringify(mau.catMD || { thu: '', chi: '' }));
        if (walletById(mau.viId)) state.imp.viId = mau.viId;
        state.imp.dungMau = true;
      }
      renderSoTay();
    }).catch(function(e){
      console.error('[chitieu] Đọc file nhập lỗi:', e);
      toast('Không đọc được file: ' + (e && e.message ? e.message : 'định dạng lạ'), { loai:'err' });
    });
  } else if (imp.buoc === 'chon'){
    return false;
  } else if (el.matches('[data-act=impHeader]')){
    imp.coHeader = el.checked;
    imp.map = nhapDoanCot(imp.rows, imp.coHeader);
    imp.soDuong = nhapSoDuongTuDong(imp.rows, imp.coHeader, imp.map);
    imp.catMap = {};
    renderSoTay();
  } else if (el.matches('[data-act=impMap]')){
    imp.map[el.getAttribute('data-f')] = parseInt(el.value, 10);
    imp.catMap = {};
    renderSoTay();
  } else if (el.matches('[data-act=impSoDuong]')){ imp.soDuong = el.value === 'thu' ? 'thu' : 'chi'; renderSoTay();
  } else if (el.matches('[data-act=impCatMD]')){ imp.catMD[el.getAttribute('data-k') === 'thu' ? 'thu' : 'chi'] = el.value; renderSoTay();
  } else if (el.matches('[data-act=impVi]')){ imp.viId = el.value; renderSoTay();
  } else if (el.matches('[data-act=impTrung]')){ imp.boTrung = el.checked; renderSoTay();
  } else if (el.matches('[data-act=impCat]')){ imp.catMap[el.getAttribute('data-key')] = el.value; renderSoTay();
  } else {
    return false;
  }
  return true;
}
