"use strict";
/* ====================================================================
   nguoi.js — "NGƯỜI" trong Vay - Nợ: (1) SỔ NỢ THEO NGƯỜI, (2) CHIA HÓA ĐƠN NHÓM.

   Mỗi khoản cho vay / vay có thêm loan.nguoi (tên người hoặc nơi vay, trống = chưa gán; khoản cũ không cần migration).
   Cùng một người nếu chỉ khác hoa/thường coi là một (so khớp theo nhanKhoa, nhan.js).

   (1) Sổ nợ theo người CHỈ GOM ĐỂ XEM VÀ CỘNG TỔNG: số ròng "mình nợ A bao nhiêu / A nợ mình bao nhiêu". Từng khoản vẫn
       giữ nguyên cách trả riêng (hình thức, lịch, kỳ, tất toán) và vẫn thao tác ở thẻ của khoản đó.
   (2) Chia hóa đơn: MÌNH trả cả hóa đơn, mỗi người khác nợ phần của họ. Phần của mình ghi thành 1 khoản chi ở Sổ tay,
       mỗi người khác thành 1 khoản CHO VAY (cùng đường ghi "Cho vay" như thêm khoản cho vay tay: tiền ra khỏi ví ngay).
       Khoản người khác trả hộ mình (mình nợ họ) chưa có luồng này.
   Cần state.js, nhan.js, ui.js, vayno.js, sotay.js (qaCats) load trước.
   ==================================================================== */

function nguoiCuaKhoan(l){ return nhanChuan(l && l.nguoi); }

// gom theo người: [{ khoa, ten, phaiThu, phaiTra, rong, khoan:[{ loai:'choVay'|'vay', loan, conLai }] }]
// rong > 0: người đó nợ mình; rong < 0: mình nợ người đó. Chỉ khoản còn mở; sắp theo |ròng| giảm dần.
function nguoiTongHop(){
  var m = {};
  var lay = function(l){
    var ten = nguoiCuaKhoan(l), k = nhanKhoa(ten);
    if (!k) return null;
    return m[k] || (m[k] = { khoa: k, ten: ten, phaiThu: 0, phaiTra: 0, rong: 0, khoan: [] });
  };
  (state.data.vayNo.choVay || []).forEach(function(c){
    if (choVayDaXong(c)) return;
    var r = lay(c); if (!r) return;
    var cl = conLaiPhaiThu(c);
    r.phaiThu += cl; r.khoan.push({ loai: 'choVay', loan: c, conLai: cl });
  });
  (state.data.vayNo.vayNoPhaiTra || []).forEach(function(v){
    if (!loanIsActive(v)) return;
    var r = lay(v); if (!r) return;
    var cl = soTienConLaiPhaiTra(v);
    r.phaiTra += cl; r.khoan.push({ loai: 'vay', loan: v, conLai: cl });
  });
  return Object.keys(m).map(function(k){ m[k].rong = m[k].phaiThu - m[k].phaiTra; return m[k]; })
    .sort(function(a, b){ return Math.abs(b.rong) - Math.abs(a.rong) || (a.ten < b.ten ? -1 : 1); });
}
// tên các người đã gán (cả khoản đã xong) cho ô gợi ý
function nguoiDsTen(){
  var seen = {}, out = [];
  (state.data.vayNo.choVay || []).concat(state.data.vayNo.vayNoPhaiTra || []).forEach(function(l){
    var t = nguoiCuaKhoan(l), k = nhanKhoa(t);
    if (k && !seen[k]){ seen[k] = true; out.push(t); }
  });
  return out.sort();
}
// đổi tên người trên mọi khoản (tên mới trùng người khác = gộp). Trả về số khoản đã đổi.
function nguoiDoiTen(khoa, tenMoi){
  var moi = nhanChuan(tenMoi), n = 0;
  if (!moi) return 0;
  (state.data.vayNo.choVay || []).concat(state.data.vayNo.vayNoPhaiTra || []).forEach(function(l){
    if (nhanKhoa(l.nguoi) === khoa){ l.nguoi = moi; n++; }
  });
  return n;
}
// đọc ô nhập tên người (an toàn khi form chưa vẽ)
function nguoiDocO(id){ var e = document.getElementById(id); return nhanChuan(e ? e.value : ''); }
function nguoiDatalistHtml(id){
  return '<datalist id="'+id+'">' + nguoiDsTen().map(function(t){ return '<option value="'+esc(t)+'">'; }).join('') + '</datalist>';
}
function nguoiOHtml(id, loan){
  return vnF('Người <span class="mp-hint">(tùy chọn)</span>',
    '<input type="text" id="'+id+'" list="'+id+'_goiy" autocomplete="off" value="'+esc(nguoiCuaKhoan(loan))+'" placeholder="VD: Minh, hoặc tên ngân hàng">' + nguoiDatalistHtml(id + '_goiy'),
    '', 'Gán cùng một người cho nhiều khoản để xem số ròng ở thẻ "Sổ nợ theo người". Từng khoản vẫn trả riêng.');
}

/* ---- thẻ "Sổ nợ theo người" ---- */
function nguoiCardHtml(){
  var vn = state.data.vayNo;
  if (!(vn.choVay || []).length && !(vn.vayNoPhaiTra || []).length) return '';
  var ds = nguoiTongHop();
  var h = '<div class="card vn-ng"><h3 class="vn-h3">Sổ nợ theo người</h3>';
  if (!ds.length){
    return h + '<div class="vn-sub" style="margin-top:6px">Chưa gán người cho khoản nào. Mở một khoản, điền ô <b>Người</b> (cùng tên cho nhiều khoản) để xem số ròng với từng người.</div></div>';
  }
  ds.forEach(function(r){
    var mo = state.nguoiMo === r.khoa;
    var nhan = Math.abs(r.rong) < 1 ? 'Huề' : (r.rong > 0 ? 'Nợ mình' : 'Mình nợ');
    h += '<div class="vn-ng-i'+(mo ? ' mo' : '')+'"><div class="vn-ng-r" role="button" tabindex="0" aria-expanded="'+mo+'" data-act="nguoiMo" data-k="'+esc(r.khoa)+'">'
      + '<span class="vn-ng-t"><b>'+esc(r.ten)+'</b><small>'+r.khoan.length+' khoản</small></span>'
      + '<span class="vn-ng-s"><small>'+nhan+'</small>' + (Math.abs(r.rong) < 1 ? '' : '<b class="'+(r.rong > 0 ? 'thu' : 'chi')+'">'+fmt(Math.round(Math.abs(r.rong)))+'</b>') + '</span></div>';
    if (mo){
      h += '<div class="vn-ng-ct">'
        + (r.phaiThu > 0 && r.phaiTra > 0 ? '<div class="vn-sub">Họ nợ mình <b>'+fmt(Math.round(r.phaiThu))+'</b> − mình nợ họ <b>'+fmt(Math.round(r.phaiTra))+'</b></div>' : '');
      r.khoan.forEach(function(x){
        h += '<div class="vn-ng-k" role="button" tabindex="0" data-act="vnCuonTo" data-loai="'+(x.loai === 'vay' ? 'vay' : 'choVay')+'" data-id="'+esc(x.loan.id)+'">'
          + '<span><b>'+esc(x.loan.ten)+'</b><small>'+(x.loai === 'vay' ? 'Mình vay' : 'Cho vay')+'</small></span>'
          + '<b class="'+(x.loai === 'vay' ? 'chi' : 'thu')+'">'+(x.loai === 'vay' ? '−' : '+')+fmt(Math.round(x.conLai))+'</b></div>';
      });
      h += '<div class="nh-btn"><button type="button" class="btn secondary sm" data-act="nguoiDoiTen" data-k="'+esc(r.khoa)+'">Đổi tên / gộp</button></div></div>';
    }
    h += '</div>';
  });
  return h + ghiChuGon('Chỉ gom để xem và cộng tổng. Mỗi khoản vẫn có lịch trả, kỳ và tất toán riêng: bấm một khoản để nhảy tới thẻ của nó.', 'Sổ nợ theo người là gì?') + '</div>';
}

/* ---- chia hóa đơn nhóm ---- */
// "Minh\nLan 150k\nHùng" -> [{ten:'Minh',tien:null},{ten:'Lan',tien:150000},{ten:'Hùng',tien:null}]
function chiaParseDs(text){
  var out = [];
  String(text == null ? '' : text).split(/\n/).forEach(function(dong){
    var s = dong.trim();
    if (!s) return;
    var m = /^(.*\S)\s+([0-9][0-9.,]*\s*(?:k|K|tr|TR|nghìn|ngàn|triệu)?)$/.exec(s);
    var ten = nhanChuan(m ? m[1] : s), tien = m ? Math.round(docSo(m[2])) : null;
    if (ten) out.push({ ten: ten, tien: tien });
  });
  return out;
}
// Chia tong cho mình + các người. Người có số riêng lấy đúng số đó; người không ghi số chia đều phần còn lại CÙNG MÌNH
// (số lẻ đồng dồn về phần của mình). Trả { phan:[{ten,tien}], minh } hoặc { loi }.
function chiaTinh(tong, ds){
  tong = Math.round(num(tong));
  if (!(tong > 0)) return { loi: 'Nhập tổng hóa đơn.' };
  if (!ds.length) return { loi: 'Nhập ít nhất một người chia cùng.' };
  var codinh = 0, tu = 0;
  for (var i = 0; i < ds.length; i++){
    if (ds[i].tien == null) tu++;
    else if (!(ds[i].tien > 0)) return { loi: 'Số tiền của "' + ds[i].ten + '" phải lớn hơn 0.' };
    else codinh += ds[i].tien;
  }
  var con = tong - codinh;
  if (con < 0) return { loi: 'Phần của mọi người (' + fmt(codinh) + ') vượt tổng hóa đơn (' + fmt(tong) + ').' };
  var moiNguoi = tu ? Math.floor(con / (tu + 1)) : 0;
  var phan = ds.map(function(x){ return { ten: x.ten, tien: x.tien == null ? moiNguoi : x.tien }; });
  return { phan: phan, minh: con - moiNguoi * tu };
}
function chiaFormHtml(){
  var cats = qaCats('chi');
  var h = vnF('Hóa đơn', '<input type="text" id="vn_chia_ten" placeholder="VD: Ăn lẩu">')
    + vnF('Tổng hóa đơn (mình đã trả)', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_chia_tong" placeholder="0">')
    + '<div class="vn-2">'
    + vnF('Ngày', '<input type="date" id="vn_chia_ngay" value="'+todayStr()+'">')
    + vnF('Phần của mình ghi vào', '<select id="vn_chia_cat">' + cats.map(function(c){ return '<option value="'+esc(c.id)+'"'+(c.id === 'an' ? ' selected' : '')+'>'+esc(c.ten)+'</option>'; }).join('') + '</select>')
    + '</div>'
    + vnViSelect('vn_chia_wallet', 'Ví đã trả', null)
    + vnF('Chia với ai', '<textarea id="vn_chia_ds" rows="4" placeholder="Minh&#10;Lan 150k&#10;Hùng"></textarea>', '',
        'Mỗi dòng một người. Ghi thêm số tiền nếu người đó không chia đều (Lan 150k). Người không ghi số chia đều phần còn lại cùng bạn.')
    + '<div class="vn-tom" id="vn_chia_tom">Nhập tổng và danh sách để xem cách chia.</div>';
  return vnSheetKhung('Chia hóa đơn nhóm', h, 'Ghi và tạo khoản cho vay', 'vnChiaLuu', 'vnCancelForm');
}
function chiaDoc(){
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  return chiaTinh(docSo(g('vn_chia_tong')), chiaParseDs(g('vn_chia_ds')));
}
function chiaCapNhat(){
  var tom = document.getElementById('vn_chia_tom');
  if (!tom) return;
  var kq = chiaDoc();
  if (kq.loi){ tom.textContent = kq.loi; return; }
  tom.innerHTML = 'Phần của mình <b>' + fmt(kq.minh) + '</b>' + kq.phan.map(function(p){ return ' · ' + esc(p.ten) + ' <b>' + fmt(p.tien) + '</b>'; }).join('');
}
// ghi: 1 khoản chi (phần của mình) + 1 khoản cho vay cho mỗi người. Trả { itemRef, loans } để hoàn tác.
function chiaGhi(o){
  var ket = { date: o.ngay, iid: null, note: '', loanIds: [] };
  if (o.minh > 0){
    var tenMinh = o.ten + ' (phần mình)';
    var it = entryAddItem(o.ngay, 'chi', o.cat, o.minh, tenMinh, o.walletId);
    if (it){
      var gc = tenMinh + ' ' + fmt(Math.round(o.minh)), e = state.data.journal[o.ngay];
      e.ghiChu = e.ghiChu ? e.ghiChu + '; ' + gc : gc;
      it.gc = gc; ket.iid = it.iid; ket.note = gc;
    }
  }
  var t = Date.now().toString(36);
  o.phan.forEach(function(p, i){
    var loan = { id: 'cv_' + slugify(o.ten + p.ten) + '_' + t + i, ten: o.ten + ' (' + p.ten + ')', nguoi: p.ten, chiaHd: o.ten,
      walletId: o.walletId, soTien: p.tien, ngayChoVay: o.ngay, ngayDuKienThu: '', daThu: 0, trangThai: 'dang_cho' };
    state.data.vayNo.choVay.push(loan);
    journalUpsertRef(o.ngay, loan.id, 'choVay', p.tien, 'Cho vay: ' + loan.ten);
    ket.loanIds.push(loan.id);
  });
  invalidateBalanceCache();
  return ket;
}
// hoàn tác chiaGhi: chỉ gỡ khoản cho vay nào chưa thu gì
function chiaHoanTac(ket){
  ket.loanIds.forEach(function(id){
    var i = -1;
    state.data.vayNo.choVay.forEach(function(c, k){ if (c.id === id) i = k; });
    if (i < 0 || num(state.data.vayNo.choVay[i].daThu) > 0) return;
    journalRemoveRefs(id, 'choVay', null);
    state.data.vayNo.choVay.splice(i, 1);
  });
  var e = state.data.journal[ket.date];
  if (e && ket.iid){ journalRemoveNote(e, ket.note); entryDeleteItem(ket.date, ket.iid); }
  invalidateBalanceCache();
}

function handleNguoiAction(act, el){
  el = el || {};
  var k = el.getAttribute ? el.getAttribute('data-k') : '';
  if (act === 'nguoiMo'){
    state.nguoiMo = (state.nguoiMo === k) ? null : k;
    renderVayNo();
    return true;
  }
  if (act === 'nguoiDoiTen'){
    var r = nguoiTongHop().filter(function(x){ return x.khoa === k; })[0];
    if (!r) return true;
    hoiChu('Đổi tên người', 'Đổi tên trên mọi khoản của "' + r.ten + '". Nhập tên một người đã có để gộp.', 'Tên', r.ten).then(function(ten){
      if (!ten || !nhanKhoa(ten)) return;
      nguoiDoiTen(k, ten);
      state.nguoiMo = nhanKhoa(ten);
      scheduleSave(); renderVayNo();
      toast('Đã đổi tên thành "' + nhanChuan(ten) + '".');
    });
    return true;
  }
  if (act === 'vnChiaMo'){
    state.vnFormKind = 'chia'; state.vnFormId = null; renderVayNo();
    return true;
  }
  if (act === 'vnChiaLuu'){
    var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
    var ten = g('vn_chia_ten').trim(), ngay = g('vn_chia_ngay') || todayStr(), cat = g('vn_chia_cat');
    var kq = chiaDoc();
    if (!ten){ toast('Nhập tên hóa đơn.', { loai:'warn' }); return true; }
    if (kq.loi){ toast(kq.loi, { loai:'warn' }); return true; }
    if (!cat){ toast('Chưa có danh mục chi cho phần của mình — thêm ở tab "Danh mục".', { loai:'warn' }); return true; }
    var ket = chiaGhi({ ten: ten, ngay: ngay, cat: cat, walletId: vnViTuForm('vn_chia_wallet', null), minh: kq.minh, phan: kq.phan });
    state.vnFormKind = null; state.vnFormId = null;
    scheduleSave(); renderVayNo();
    toast('Đã chia "' + ten + '": phần mình ' + fmt(kq.minh) + ', ' + kq.phan.length + ' khoản cho vay.', { giay: 7, hoanTac: function(){
      chiaHoanTac(ket); scheduleSave(); renderVayNo(); toast('Đã hoàn tác chia hóa đơn.');
    } });
    return true;
  }
  return false;
}
function handleNguoiInput(el){
  if (!el || !el.id || el.id.indexOf('vn_chia_') !== 0) return false;
  chiaCapNhat();
  return true;
}
