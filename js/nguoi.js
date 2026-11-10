"use strict";
/* ====================================================================
   nguoi.js — "NGƯỜI" trong Vay - Nợ: (1) SỔ NỢ THEO NGƯỜI, (2) CHIA HÓA ĐƠN NHÓM.

   Mỗi khoản cho vay / vay có thêm loan.nguoi (tên người hoặc nơi vay, trống = chưa gán; khoản cũ không cần migration).
   Cùng một người nếu chỉ khác hoa/thường coi là một (so khớp theo nhanKhoa, nhan.js).

   (1) Sổ nợ theo đối tượng (người hoặc nơi vay) CHỈ GOM ĐỂ XEM VÀ CỘNG TỔNG: số ròng "mình nợ A bao nhiêu / A nợ mình bao nhiêu". Từng khoản vẫn
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
  return vnF('Đối tượng <span class="mp-hint">(tùy chọn)</span>',
    '<input type="text" id="'+id+'" list="'+id+'_goiy" autocomplete="off" value="'+esc(nguoiCuaKhoan(loan))+'" placeholder="VD: Minh, hoặc tên ngân hàng">' + nguoiDatalistHtml(id + '_goiy'),
    '', 'Gán cùng một đối tượng cho nhiều khoản để xem số ròng ở thẻ "Sổ nợ theo đối tượng". Từng khoản vẫn trả riêng.');
}

/* ---- thẻ "Sổ nợ theo đối tượng" ---- */
function nguoiCardHtml(){
  var vn = state.data.vayNo;
  if (!(vn.choVay || []).length && !(vn.vayNoPhaiTra || []).length) return '';
  var ds = nguoiTongHop();
  var h = '<div class="card vn-ng"><h3 class="vn-h3">Sổ nợ theo đối tượng</h3>';
  if (!ds.length){
    return h + '<div class="vn-sub" style="margin-top:6px">Chưa gán đối tượng cho khoản nào. Mở một khoản, điền ô <b>Đối tượng</b> (cùng tên cho nhiều khoản) để xem số ròng với từng người.</div></div>';
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
      var coThu = r.khoan.some(function(x){ return x.loai === 'choVay' && x.conLai > 0.01; });
      h += '<div class="nh-btn">'
        + (coThu ? '<button type="button" class="btn sm" data-act="nguoiThuHet" data-k="'+esc(r.khoa)+'" title="Ghi thu tất cả khoản cho vay còn mở của người này trong một lượt">Thanh toán hết</button>'
          + '<button type="button" class="btn secondary sm" data-act="nguoiThuChon" data-k="'+esc(r.khoa)+'" title="Tích chọn khoản nào được thanh toán">Chọn khoản thanh toán</button>' : '')
        + '<button type="button" class="btn secondary sm" data-act="nguoiDoiTen" data-k="'+esc(r.khoa)+'">Đổi tên / gộp</button></div></div>';
    }
    h += '</div>';
  });
  var r0 = ds[0], vd = '';
  if (r0) vd = gtViDu([{ ten: esc(r0.ten) + (r0.khoan.length > 1 ? ' (' + r0.khoan.length + ' khoản)' : ''), ct: 'Số ròng = phải thu − phải trả, cộng từ các khoản còn mở của cùng một đối tượng.',
    pt: r0.khoan.map(function(k){ return (k.loai === 'vay' ? '−' : '+') + soGt(k.conLai); }).join(' ') + ' → phải thu ' + soGt(r0.phaiThu) + ' − phải trả ' + soGt(r0.phaiTra) + ' = ' + (r0.rong >= 0 ? 'họ nợ mình ' : 'mình nợ họ ') + soGt(Math.abs(r0.rong)) }]);
  return h + ghiChuGon('Chỉ gom để xem và cộng tổng. Mỗi khoản vẫn có lịch trả, kỳ và tất toán riêng: bấm một khoản để nhảy tới thẻ của nó.' + vd, 'Sổ nợ theo đối tượng là gì?') + '</div>';
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

/* ---- THU NHIỀU KHOẢN CHO VAY CỦA MỘT NGƯỜI TRONG MỘT LƯỢT ("Thanh toán hết" / "Chọn khoản thanh toán") ----
   Mỗi khoản vẫn có dòng "Thu hồi cho vay" riêng ở Sổ tay (choVayGhiThu): chỉ gom thao tác, không đổi cách lưu. */
// khoản cho vay còn mở của người, cũ trước (ngày cho vay, rồi theo thứ tự tạo)
function nguoiKhoanConThu(khoa){
  var r = nguoiTongHop().filter(function(x){ return x.khoa === khoa; })[0];
  if (!r) return [];
  return r.khoan.filter(function(x){ return x.loai === 'choVay' && x.conLai > 0.01; }).map(function(x){ return x.loan; })
    .sort(function(a, b){ return (a.ngayChoVay || '') < (b.ngayChoVay || '') ? -1 : ((a.ngayChoVay || '') > (b.ngayChoVay || '') ? 1 : 0); });
}
// ghi thu "so" cho các khoản theo thứ tự đã cho: khoản nào nhận tối đa phần còn lại của nó, hết tiền thì dừng.
// dongKhoan: khoản nào còn thiếu thì xóa nợ phần thiếu (đóng khoản). Trả ket để hoàn tác.
function nguoiThuGhi(loans, so, ngay, viId, dongKhoan){
  var e0 = state.data.journal[ngay], truoc = e0 && e0.refs ? e0.refs.slice() : [];
  var ket = { ngay: ngay, snap: loans.map(function(c){ return { c: c, daThu: c.daThu, tatToan: c.tatToan, trangThai: c.trangThai }; }), tong: 0, refs: [] };
  var con = so;
  loans.forEach(function(c){
    var tra = Math.min(con, conLaiPhaiThu(c));
    if (tra > 0.01){ choVayGhiThu(c, tra, ngay, viId, false); con -= tra; ket.tong += tra; }
  });
  if (dongKhoan) loans.forEach(function(c){
    var thieu = conLaiPhaiThu(c);
    if (thieu > 0.01){ c.tatToan = { soTien: thieu, ngay: ngay }; choVayCapNhatTrangThai(c); }
  });
  var e = state.data.journal[ngay];
  ket.refs = e && e.refs ? e.refs.filter(function(r){ return truoc.indexOf(r) < 0; }) : [];
  invalidateBalanceCache();
  return ket;
}
function nguoiThuHoanTac(ket){
  var e = state.data.journal[ket.ngay];
  if (e){
    e.refs = (e.refs || []).filter(function(r){ return ket.refs.indexOf(r) < 0; });
    ket.refs.forEach(function(r){ journalRemoveNote(e, r.note); });
    entryTinhLai(e);
    if (entryIsEmpty(e)) delete state.data.journal[ket.ngay];
  }
  ket.snap.forEach(function(x){ x.c.daThu = x.daThu; x.c.tatToan = x.tatToan; x.c.trangThai = x.trangThai; });
  invalidateBalanceCache();
}
// hộp thoại: chon = true thì có bảng tích chọn khoản; false = thu hết mọi khoản còn mở
async function nguoiThuMo(khoa, chon){
  var all = nguoiKhoanConThu(khoa);
  if (!all.length) return;
  var ten = nguoiCuaKhoan(all[0]);
  var tongCua = function(ds){ var t = 0; ds.forEach(function(c){ t += conLaiPhaiThu(c); }); return t; };
  var chonDuoc = function(root){
    if (!chon) return all;
    var ids = {};
    [].slice.call(root.querySelectorAll('.vn_thu_ck')).forEach(function(i){ if (i.checked) ids[i.value] = 1; });
    return all.filter(function(c){ return ids[c.id]; });
  };
  var lastTong = null;
  var dsHtml = chon ? '<div class="vn-f"><div class="qa-lbl">Chọn khoản thanh toán</div>'
    + all.map(function(c){
        return '<label class="vn-opt"><input type="checkbox" class="vn_thu_ck" value="'+esc(c.id)+'" checked><span><b>'+esc(c.ten)+'</b><br><small>'
          + (c.ngayChoVay ? ngayVN(c.ngayChoVay) + ' · ' : '') + 'còn ' + fmt(Math.round(conLaiPhaiThu(c))) + '</small></span></label>';
      }).join('') + '</div>' : '';
  var kq = await vnDlMo({
    tieuDe: (chon ? 'Chọn khoản thanh toán · ' : 'Thanh toán hết · ') + ten,
    phu: all.length + ' khoản cho vay còn mở',
    nutOk: 'Ghi thu tiền',
    body: vnDlTile('Còn phải thu', '<span id="vn_thu_tong">' + fmt(Math.round(tongCua(all))) + '</span>')
      + dsHtml
      + vnF('Số tiền thực thu', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="vn_dl_so" value="' + veSo(Math.round(tongCua(all))) + '" placeholder="0">')
      + '<div id="vn_dl_kieu" hidden><div class="vn-hint" id="vn_dl_thieu"></div>'
      + '<label class="vn-opt"><input type="radio" name="vn_dl_k" value="no" checked><span><b>Thu một phần, sẽ thu tiếp</b><br><small>Tiền chia vào khoản cũ nhất trước; khoản chưa đủ vẫn mở.</small></span></label>'
      + '<label class="vn-opt"><input type="radio" name="vn_dl_k" value="xong"><span><b>Tất toán, phần thiếu xóa nợ</b><br><small>Các khoản còn thiếu đóng lại; phần thiếu coi như không đòi được (không ghi giao dịch).</small></span></label></div>'
      + vnDlNgayVi(all[0])
      + '<div class="vn-tom">Mỗi khoản ghi một giao dịch thu "Thu hồi cho vay" riêng vào Sổ tay, cùng ngày và ví đã chọn.</div>',
    khiNhap: function(root){
      var ds = chonDuoc(root), tong = tongCua(ds), o = root.querySelector('#vn_dl_so');
      var t = root.querySelector('#vn_thu_tong'); if (t) t.textContent = fmt(Math.round(tong));
      if (lastTong !== tong){ lastTong = tong; if (o) o.value = veSo(Math.round(tong)); }   // đổi tích chọn thì số thu tự theo
      var so = numNonNeg(docSo(o ? o.value : ''));
      var thieu = ds.length > 0 && so > 0 && so < tong - 1;
      var kn = root.querySelector('#vn_dl_kieu'); if (kn) kn.hidden = !thieu;
      var tx = root.querySelector('#vn_dl_thieu');
      if (tx) tx.textContent = 'Ít hơn số còn phải thu ' + fmt(Math.round(tong)) + '. Phần thiếu ' + fmt(Math.round(Math.max(0, tong - so))) + ' sẽ:';
    },
    lay: function(root){
      var ds = chonDuoc(root), tong = tongCua(ds);
      if (!ds.length) return { loi: 'Chọn ít nhất một khoản.' };
      var so = numNonNeg(docSo(root.querySelector('#vn_dl_so').value));
      if (!(so > 0)) return { loi: 'Nhập số lớn hơn 0.' };
      if (so > tong + 0.01) return { loi: 'Không được lớn hơn số còn phải thu (' + fmt(Math.round(tong)) + ').' };
      var ngay = root.querySelector('#vn_dl_ngay').value;
      if (!ngay) return { loi: 'Chọn ngày thu.' };
      var som = ds.filter(function(c){ return c.ngayChoVay && ngay < c.ngayChoVay; })[0];
      if (som) return { loi: 'Ngày thu không được trước ngày cho vay của "' + som.ten + '" (' + ngayVN(som.ngayChoVay) + ').' };
      var xong = root.querySelector('input[name=vn_dl_k]:checked');
      return { ds: ds, tong: tong, so: so, ngay: ngay, viId: vnDlViDoc(all[0]), tatToan: so < tong - 1 && !!xong && xong.value === 'xong' };
    }
  });
  if (!kq) return;
  if (kq.tatToan && !await xacNhan('Tất toán, bỏ phần thiếu ' + fmt(Math.round(kq.tong - kq.so)) + '?',
        'Ghi thu ' + fmt(Math.round(kq.so)) + ' vào Sổ tay. Phần thiếu ' + fmt(Math.round(kq.tong - kq.so)) + ' coi như KHÔNG ĐÒI ĐƯỢC: các khoản còn thiếu đóng lại, không ghi giao dịch cho phần thiếu.\n\nNếu còn muốn thu tiếp thì bấm Hủy rồi chọn "Thu một phần".',
        { nguyHiem: true, chuOk: 'Tất toán' })) return;
  if (kq.ngay > todayStr() && !await xacNhan('Ngày thu ở tương lai',
        'Giao dịch thu được ghi vào ngày ' + ngayVN(kq.ngay) + ', nên số dư hiện tại chưa tính tiền này cho tới ngày đó, trong khi các khoản cho vay đã tính là đã thu.',
        { chuOk: 'Vẫn ghi', chuHuy: 'Quay lại' })) return;
  var ket = nguoiThuGhi(kq.ds, kq.so, kq.ngay, kq.viId, kq.tatToan);
  scheduleSave(); renderVayNo();
  toast('Đã ghi thu ' + fmt(Math.round(ket.tong)) + ' của "' + ten + '" (' + ket.refs.length + ' khoản).', { giay: 7, hoanTac: function(){
    nguoiThuHoanTac(ket); scheduleSave(); renderVayNo(); toast('Đã hoàn tác lượt thu.');
  } });
}

function handleNguoiAction(act, el){
  el = el || {};
  var k = el.getAttribute ? el.getAttribute('data-k') : '';
  if (act === 'nguoiMo'){
    state.nguoiMo = (state.nguoiMo === k) ? null : k;
    renderVayNo();
    return true;
  }
  if (act === 'nguoiThuHet' || act === 'nguoiThuChon'){
    nguoiThuMo(k, act === 'nguoiThuChon');
    return true;
  }
  if (act === 'nguoiDoiTen'){
    var r = nguoiTongHop().filter(function(x){ return x.khoa === k; })[0];
    if (!r) return true;
    hoiChu('Đổi tên đối tượng', 'Đổi tên trên mọi khoản của "' + r.ten + '". Nhập tên một đối tượng đã có để gộp.', 'Tên', r.ten).then(function(ten){
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
    if (!cat){ toast('Chưa có danh mục chi cho phần của mình — thêm ở tab "Cài đặt".', { loai:'warn' }); return true; }
    var viChia = vnViTuForm('vn_chia_wallet', null), tongChia = kq.minh; kq.phan.forEach(function(p){ tongChia += p.tien; });
    var cbChia = canhBaoKhoan({ kind: 'chi', catId: cat, tien: kq.minh, ngay: ngay, ghiChu: ten + ' (phần mình)', viId: viChia, boViAm: true });
    var viAmChia = viCanhBaoAm(viChia, -tongChia);          // cả hóa đơn ra khỏi ví (phần của mình + các khoản cho vay)
    if (viAmChia) cbChia.unshift(viAmChia);
    if (chayNeuDongY(cbChia, act, el, handleNguoiAction)) return true;
    var ket = chiaGhi({ ten: ten, ngay: ngay, cat: cat, walletId: viChia, minh: kq.minh, phan: kq.phan });
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
