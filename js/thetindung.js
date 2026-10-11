"use strict";
/* ====================================================================
   thetindung.js — VÍ LOẠI THẺ TÍN DỤNG / VÍ TRẢ SAU (thẻ tín dụng, SPayLater, Home PayLater...).
   Không có sổ riêng: thẻ là một VÍ có cờ w.the = true, dùng nguyên cách tính số dư ví (state.js).
   - Quẹt thẻ = khoản CHI ghi vào ví thẻ -> ví thẻ ÂM (= dư nợ). Chi vẫn tính vào THÁNG MUA (đúng cho hạn mức,
     báo cáo) và tổng số dư của sổ giảm ngay, vì nợ thẻ là nợ thật.
   - Thanh toán thẻ = CHUYỂN VÍ từ tài khoản sang ví thẻ (chuyenVi nằm ngoài journal): không phải thu / chi nên KHÔNG
     bị tính chi lần thứ hai, tổng số dư không đổi (tiền ra khỏi tài khoản, nợ thẻ giảm đúng bằng đó).
   - Cấu hình của ví thẻ: w.hanMucThe (hạn mức tín dụng, 0 = không cảnh báo), w.ngaySaoKe (1-31), w.ngayTraThe (1-31,
     ngày đến hạn thanh toán). Ngày 29-31 tự co về cuối tháng ngắn (ngayTraCuaKy).
   - Dư nợ, số sao kê, số còn phải trả đều TÍNH LẠI từ giao dịch mỗi lần xem (theTinh), không lưu: không có chỗ thứ hai để lệch.
   Cần state.js (soDuTheoVi, chuyenViThem, viCanhBaoAm...), vayno.js (ngayTraCuaKy, monthKeyAdd, vnF, vnSheetKhung),
   nhachan.js (nhacHanNhan) load trước; danhmuc.js (dmToggle, dmMoney) chỉ cần lúc vẽ.
   ==================================================================== */

var THE_NHAC_NGAY = 7;      // báo "sắp đến hạn thanh toán thẻ" trước bao nhiêu ngày

function viLaThe(w){ return !!(w && w.the); }

// ngày sao kê gần nhất, không sau homNay
function theNgaySaoKe(w, homNay){
  var mk = monthKey(homNay), d = ngayTraCuaKy(mk, w.ngaySaoKe);
  return d <= homNay ? d : ngayTraCuaKy(monthKeyAdd(mk, -1), w.ngaySaoKe);
}
// hạn thanh toán của kỳ sao kê chốt ngày nsk = lần đầu ngày "ngayTraThe" xuất hiện SAU ngày sao kê
// (sao kê 25/9, hạn ngày 15 -> 15/10; sao kê 5/10, hạn ngày 25 -> 25/10)
function theHanTra(w, nsk){
  var mk = monthKey(nsk), h = ngayTraCuaKy(mk, w.ngayTraThe);
  return h > nsk ? h : ngayTraCuaKy(monthKeyAdd(mk, 1), w.ngayTraThe);
}
/* Tình trạng thẻ tại homNay:
   duNo = số đang nợ thẻ · soSaoKe = dư nợ chốt tại ngày sao kê gần nhất · daTra = tiền đã chuyển vào thẻ SAU ngày sao kê
   conPhaiTra = soSaoKe - daTra, không vượt dư nợ hiện tại (hoàn tiền / trả dư thì không đòi quá số đang nợ)
   soNgay = số ngày tới hạn thanh toán (âm = quá hạn) · khaDung = hạn mức - dư nợ (null nếu chưa đặt hạn mức) */
function theTinh(w, homNay){
  homNay = homNay || todayStr();
  var nsk = theNgaySaoKe(w, homNay), han = theHanTra(w, nsk);
  var duNo = Math.max(0, -soDuTheoVi(w.id, homNay));
  var soSaoKe = Math.max(0, -soDuTheoVi(w.id, nsk)), daTra = 0;
  (state.data.chuyenVi || []).forEach(function(t){
    if (t.denVi === w.id && t.ngay > nsk && t.ngay <= homNay) daTra += num(t.soTien);
  });
  var hm = num(w.hanMucThe);
  return { nsk: nsk, han: han, soNgay: daysBetween(homNay, han), duNo: duNo, soSaoKe: soSaoKe, daTra: daTra,
           conPhaiTra: Math.min(duNo, Math.max(0, soSaoKe - daTra)),
           hanMuc: hm, khaDung: hm > 0 ? Math.max(0, hm - duNo) : null };
}
// các thẻ còn phải trả mà hạn trong vòng nNgay ngày (hoặc đã quá hạn), gần hạn nhất trước
function theSapDenHan(homNay, nNgay){
  homNay = homNay || todayStr();
  nNgay = nNgay == null ? THE_NHAC_NGAY : nNgay;
  var out = [];
  (state.data.wallets || []).forEach(function(w){
    if (!viLaThe(w)) return;
    var t = theTinh(w, homNay);
    if (t.conPhaiTra > 0 && t.soNgay <= nNgay) out.push({ w: w, t: t });
  });
  out.sort(function(a, b){ return a.t.soNgay - b.t.soNgay; });
  return out;
}

/* ---- hiển thị ở thẻ Ví (tab Danh mục) ---- */
function theDongHtml(w){
  var t = theTinh(w);
  var h = '<span class="dm-s">Dư nợ '+fmt(Math.round(t.duNo))
    + (t.hanMuc > 0 ? ' / hạn mức '+fmt(Math.round(t.hanMuc))+' · còn dùng '+fmt(Math.round(t.khaDung)) : '')+'</span>';
  var qua = t.conPhaiTra > 0 && t.soNgay < 0;
  h += '<span class="dm-s'+(qua ? ' ds-lech' : '')+'">Sao kê '+ngayNganVN(t.nsk)+': '+fmt(Math.round(t.soSaoKe))
    + (t.conPhaiTra > 0 ? ' · còn phải trả '+fmt(Math.round(t.conPhaiTra))+' ('+nhacHanNhan(t.soNgay).toLowerCase()+', hạn '+ngayNganVN(t.han)+')'
                        : ' · đã trả đủ')+'</span>';
  return h + '<span class="dm-s"><button type="button" class="btn secondary sm" data-act="theTra" data-id="'+esc(w.id)+'">Thanh toán thẻ</button></span>';
}

/* ---- khối cấu hình trong form Thêm / Sửa ví ---- */
function theFormHtml(w){
  var d = w || {};
  var ngayIn = function(id, v){ return '<input type="number" id="'+id+'" min="1" max="31" inputmode="numeric" value="'+(v || '')+'" placeholder="1-31">'; };
  return dmToggle('dm_vi_the', 'Thẻ tín dụng / ví trả sau', 'Quẹt thẻ ghi vào ví này làm số dư ÂM (đang nợ), chưa mất tiền ngay. Khi trả thẻ, dùng "Thanh toán thẻ" để chuyển tiền từ tài khoản sang đây.', !!d.the)
    + '<div id="dm_vi_the_f"'+(d.the ? '' : ' hidden')+'>'
    +   vnF('Hạn mức thẻ <span class="mp-hint">(không bắt buộc)</span>', dmMoney('dm_vi_hm', d.hanMucThe), '', 'Dư nợ vượt hạn mức sẽ được cảnh báo khi ghi chi.')
    +   vnF('Ngày sao kê hằng tháng', ngayIn('dm_vi_sk', d.ngaySaoKe), '', 'Ngày ngân hàng chốt dư nợ để bạn trả.')
    +   vnF('Ngày đến hạn thanh toán', ngayIn('dm_vi_ht', d.ngayTraThe), '', 'Hạn trả sau mỗi kỳ sao kê.')
    +   '<div class="vn-hint">Thẻ đang nợ từ trước khi dùng sổ: nhập số dư đầu kỳ là số ÂM (VD -3.000.000).</div>'
    + '</div>';
}
// đọc khối trên vào ví w; trả câu lỗi (chuỗi) nếu ngày không hợp lệ, '' nếu ổn
function theDocForm(w){
  var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var bat = !!(document.getElementById('dm_vi_the') || {}).checked;
  if (!bat){ delete w.the; delete w.hanMucThe; delete w.ngaySaoKe; delete w.ngayTraThe; return ''; }
  var sk = Math.round(num(g('dm_vi_sk'))), ht = Math.round(num(g('dm_vi_ht')));
  if (!(sk >= 1 && sk <= 31) || !(ht >= 1 && ht <= 31)) return 'Nhập ngày sao kê và ngày đến hạn (từ 1 đến 31).';
  w.the = true; w.deDanh = false;
  w.hanMucThe = numNonNeg(docSo(g('dm_vi_hm'))); w.ngaySaoKe = sk; w.ngayTraThe = ht;
  return '';
}

/* ---- bảng trượt "Thanh toán thẻ" ---- */
function theTraSheetHtml(f){
  var w = walletById(f.id);
  if (!w || !viLaThe(w)) return '';
  var t = theTinh(w);
  var nguon = (state.data.wallets || []).filter(function(x){ return !viLaThe(x); });
  if (!nguon.length) return vnSheetKhung('Thanh toán thẻ ' + esc(w.ten), '<div class="empty">Cần có ít nhất một ví không phải thẻ để trả từ đó.</div>', 'Đóng', 'dmHuy', 'dmHuy');
  var md = viMacDinhId(), tuMd = nguon.some(function(x){ return x.id === md; }) ? md : nguon[0].id;
  var h = '<div class="vn-sub">Dư nợ hiện tại: <b>'+fmt(Math.round(t.duNo))+'</b>'
    + (t.soSaoKe > 0 ? ' · sao kê '+ngayNganVN(t.nsk)+': <b>'+fmt(Math.round(t.soSaoKe))+'</b>, còn phải trả <b>'+fmt(Math.round(t.conPhaiTra))+'</b> (hạn '+ngayNganVN(t.han)+')' : '')+'</div>'
    + vnF('Trả từ ví', '<select id="tt_tu">'+nguon.map(function(x){ return '<option value="'+esc(x.id)+'"'+(x.id === tuMd ? ' selected' : '')+'>'+esc(x.ten)+'</option>'; }).join('')+'</select>')
    + vnF('Số tiền', dmMoney('tt_tien', Math.round(t.conPhaiTra > 0 ? t.conPhaiTra : 0)), '', 'Điền sẵn số còn phải trả của kỳ sao kê. Muốn trả tối thiểu hoặc trả hết dư nợ thì sửa số.')
    + vnF('Ngày', '<input type="date" id="tt_ngay" value="'+todayStr()+'">')
    + '<div class="vn-hint">Thanh toán thẻ là CHUYỂN giữa các ví: không tính là chi (khoản quẹt thẻ đã tính vào chi lúc mua), không đổi tổng số dư.</div>';
  return vnSheetKhung('Thanh toán thẻ ' + esc(w.ten), h, 'Thanh toán', 'theTraLuu', 'dmHuy');
}

function handleTheAction(act, el){
  if (act === 'theTra'){
    state.dmForm = { loai: 'thanhtoanthe', id: el.getAttribute('data-id') }; renderDanhMuc(); return true;
  }
  if (act !== 'theTraLuu') return false;
  var f = state.dmForm, w = f && walletById(f.id);
  if (!w || !viLaThe(w)) return true;
  var tu = (document.getElementById('tt_tu') || {}).value;
  var tien = numNonNeg(docSo((document.getElementById('tt_tien') || {}).value));
  var ngay = (document.getElementById('tt_ngay') || {}).value || todayStr();
  if (!walletById(tu) || viLaThe(walletById(tu))){ toast('Chọn ví để trả (không phải ví thẻ).', { loai: 'warn' }); return true; }
  if (tien <= 0){ toast('Số tiền thanh toán phải lớn hơn 0.', { loai: 'warn' }); return true; }
  var ghi = function(){
    var t = chuyenViThem(ngay, tu, w.id, tien, 'Thanh toán thẻ ' + w.ten);
    if (!t){ toast('Không tạo được lần thanh toán này.', { loai: 'err' }); return; }
    state.dmForm = null; scheduleSave(); renderDanhMuc();
    toast('Đã trả ' + fmt(Math.round(tien)) + ' cho thẻ "' + w.ten + '" từ "' + viTen(tu) + '".', { giay: 7, hoanTac: function(){
      chuyenViXoa(t.id); scheduleSave(); renderDanhMuc();
      if (typeof renderSoTay === 'function' && state.tab === 'sotay') renderSoTay();
      toast('Đã hoàn tác thanh toán thẻ.');
    } });
  };
  var cb = viCanhBaoAm(tu, -tien);       // ví trả bị âm / là ví để dành -> hỏi lại, giống Chuyển ví ở Sổ tay
  if (cb){
    xacNhan('Kiểm tra trước khi ghi', cb + '\n\nVẫn thanh toán?', { chuOk: 'Vẫn thanh toán', chuHuy: 'Quay lại' }).then(function(ok){ if (ok) ghi(); });
  } else ghi();
  return true;
}
// bật / tắt khối cấu hình thẻ ở form ví
function handleTheChange(el){
  if (!el || el.id !== 'dm_vi_the') return false;
  var f = document.getElementById('dm_vi_the_f');
  if (f) f.hidden = !el.checked;
  return true;
}
