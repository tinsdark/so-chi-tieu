"use strict";
/* ====================================================================
   somung.js — SỔ MỪNG VÀ QUÀ (trang trong tab Công cụ): tiền mừng cưới, phúng viếng, sinh nhật, mừng tuổi... để "có đi có lại".
   quaTang[] = [{ id, nguoi, dip (DỊP: chữ tự gõ, tùy chọn, VD "Cưới", "Thôi nôi"), chieu: 'cho' | 'nhan', soTien, ngay, ghiChu, ghiSo }]
   - chieu 'cho' = mình mừng người ta, 'nhan' = người ta mừng mình.
   - Gom theo NGƯỜI bằng tên đã bỏ dấu / hoa thường ("anh minh" = "Anh Minh"). Không có danh bạ riêng: danh sách người là những tên đang dùng.
   - "Có đi có lại": họ mừng mình mà mình chưa mừng lại (nhan > 0, cho = 0), hoặc ngược lại.
   - Dịp là ô TỰ GÕ (không có danh sách cố định); khi gõ chỉ có gợi ý các dịp đã dùng. Hai dịp chỉ khác hoa thường / dấu coi là một ("cuoi" = "Cưới").
   - Gợi ý mức mừng: trung vị các khoản "cho" cùng dịp (bỏ qua khoản không ghi dịp), khi đã có ít nhất 3 khoản.
   - Mặc định sổ này CHỈ ghi nhớ, KHÔNG đụng Sổ tay hay số dư (nhiều khoản mừng bằng tiền mặt). Mỗi khoản có lựa chọn "Ghi vào Sổ tay? Không / Có":
     chọn Có thì tạo thêm 1 dòng thật ở Sổ tay (bạn mừng = khoản chi, họ mừng bạn = khoản thu; ghiSo = 'ngày|iid' để biết đã ghi);
     xóa dòng ở sổ này KHÔNG xóa dòng ở Sổ tay.
   Cần state.js, loihua.js (lhChuanHoa), danhmuc.js (dmSeg, dmMoney, dmToggle, dkCatOptions, dmSec), vayno.js (vnF, vnSheetKhung), congcu.js load trước.
   ==================================================================== */

var SM_DIP_GOI_Y = ['Cưới', 'Hiếu', 'Sinh nhật', 'Tết / mừng tuổi'];      // chỉ để gợi ý lúc gõ ô Dịp, không bắt buộc
var SM_GIOI_HAN = 40;
state.sm = state.sm || { tim: '' };

/* ---- tính toán thuần ---- */
function smTrungVi(arr){
  var a = arr.slice().sort(function(x, y){ return x - y; }), m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
// gom theo người: [{ khoa, ten, cho, nhan, nCho, nNhan, cuoi, ds }], người có giao dịch gần nhất lên đầu
function smNguoi(){
  var m = {};
  (state.data.quaTang || []).forEach(function(q){
    var k = lhChuanHoa(q.nguoi);
    if (!k) return;
    var r = m[k] || (m[k] = { khoa: k, ten: q.nguoi, cho: 0, nhan: 0, nCho: 0, nNhan: 0, cuoi: '', ds: [] });
    if (q.chieu === 'nhan'){ r.nhan += q.soTien; r.nNhan++; } else { r.cho += q.soTien; r.nCho++; }
    if (q.ngay >= r.cuoi){ r.cuoi = q.ngay; r.ten = q.nguoi; }
    r.ds.push(q);
  });
  return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a, b){ return a.cuoi < b.cuoi ? 1 : (a.cuoi > b.cuoi ? -1 : 0); });
}
// 'nhanChuaDap' = họ mừng mình, mình chưa mừng lại; 'choChuaNhan' = mình mừng họ, họ chưa mừng lại; '' = cân hoặc cả hai bên đã có
function smCoDiCoLai(r){
  if (r.nhan > 0 && r.cho === 0) return 'nhanChuaDap';
  if (r.cho > 0 && r.nhan === 0) return 'choChuaNhan';
  return '';
}
// trung vị số tiền MÌNH mừng theo dịp (cần >= 3 khoản, bỏ khoản không ghi dịp): [{ khoa, ten, tien, n }], nhiều khoản nhất lên đầu
function smGoiY(){
  var theo = {};
  (state.data.quaTang || []).forEach(function(q){
    var k = lhChuanHoa(q.dip);
    if (q.chieu !== 'cho' || !k) return;
    var r = theo[k] || (theo[k] = { khoa: k, ten: q.dip, ds: [], cuoi: '' });
    r.ds.push(q.soTien);
    if (q.ngay >= r.cuoi){ r.cuoi = q.ngay; r.ten = q.dip; }
  });
  return Object.keys(theo).map(function(k){ var r = theo[k]; return { khoa: k, ten: r.ten, tien: smTrungVi(r.ds), n: r.ds.length }; })
    .filter(function(r){ return r.n >= 3; }).sort(function(a, b){ return b.n - a.n; });
}
// các dịp đã dùng (mới dùng gần nhất lên đầu) + vài dịp thường gặp, không trùng, cho gợi ý khi gõ
function smDipGoiY(){
  var thay = {}, out = [];
  (state.data.quaTang || []).slice().sort(function(a, b){ return a.ngay < b.ngay ? 1 : (a.ngay > b.ngay ? -1 : 0); }).concat(SM_DIP_GOI_Y.map(function(d){ return { dip: d }; })).forEach(function(q){
    var k = lhChuanHoa(q.dip);
    if (!k || thay[k]) return;
    thay[k] = 1; out.push(q.dip);
  });
  return out;
}
function smTongNam(nam){
  var r = { cho: 0, nCho: 0, nhan: 0, nNhan: 0 };
  (state.data.quaTang || []).forEach(function(q){
    if (q.ngay.slice(0, 4) !== String(nam)) return;
    if (q.chieu === 'nhan'){ r.nhan += q.soTien; r.nNhan++; } else { r.cho += q.soTien; r.nCho++; }
  });
  return r;
}
// các dòng khớp ô tìm (tên người, ghi chú, tên dịp), mới nhất lên đầu
function smLoc(tim){
  var k = lhChuanHoa(tim);
  return (state.data.quaTang || []).filter(function(q){
    return !k || lhChuanHoa(q.nguoi).indexOf(k) >= 0 || lhChuanHoa(q.ghiChu).indexOf(k) >= 0 || lhChuanHoa(q.dip).indexOf(k) >= 0;
  }).sort(function(a, b){ return a.ngay < b.ngay ? 1 : (a.ngay > b.ngay ? -1 : 0); });
}

/* ---- giao diện ---- */
function smTomTat(){
  var ds = state.data.quaTang || [];
  if (!ds.length) return { chu: 'Ai mừng bạn, bạn mừng ai, để có đi có lại' };
  var t = smTongNam(todayStr().slice(0, 4)), chua = smNguoi().filter(function(r){ return smCoDiCoLai(r) === 'nhanChuaDap'; }).length;
  return { chu: ds.length + ' khoản · năm nay cho ' + fmt(t.cho) + ', nhận ' + fmt(t.nhan) + (chua ? ' · ' + chua + ' người chưa mừng lại' : ''), canh: chua > 0 };
}
function smDongHtml(q){
  var nhan = q.chieu === 'nhan';
  return '<div class="dm-row" role="button" tabindex="0" data-act="smSua" data-id="' + esc(q.id) + '" aria-label="Sửa khoản ' + esc(q.nguoi) + '">'
    + '<span class="dm-main"><b class="dm-n">' + esc(q.nguoi) + '</b><span class="dm-s">' + (q.dip ? esc(q.dip) + ' · ' : '') + ngayVN(q.ngay) + (q.ghiChu ? ' · ' + esc(q.ghiChu) : '') + (q.ghiSo ? ' · đã ghi Sổ tay' : '') + '</span></span>'
    + '<span class="dm-v"><b class="' + (nhan ? 'thu' : 'chi') + '">' + (nhan ? '+' : '−') + fmt(Math.round(q.soTien)) + '</b></span>' + dmGo() + '</div>';
}
// vùng danh sách (được vẽ lại riêng khi gõ ô tìm): tóm tắt người nếu ô tìm khớp đúng một người (hoặc chỉ một người chứa chữ đó) + các dòng
function smDsHtml(tim){
  var ds = smLoc(tim), h = '', k = lhChuanHoa(tim);
  if (k){
    var cand = smNguoi().filter(function(r){ return r.khoa === k; });
    if (!cand.length) cand = smNguoi().filter(function(r){ return r.khoa.indexOf(k) >= 0; });      // gõ "lan" mà người tên "Chị Lan": chỉ có một người khớp thì vẫn tóm tắt
    var ng = cand.length === 1 ? cand[0] : null;
    if (ng){
      var tag = smCoDiCoLai(ng);
      h += '<div class="sm-ng"><b>' + esc(ng.ten) + '</b><span>Bạn mừng ' + fmt(Math.round(ng.cho)) + ' (' + ng.nCho + ' lần) · họ mừng bạn ' + fmt(Math.round(ng.nhan)) + ' (' + ng.nNhan + ' lần)</span>'
        + (tag === 'nhanChuaDap' ? '<em class="canh">Họ đã mừng bạn, bạn chưa mừng lại</em>' : (tag === 'choChuaNhan' ? '<em>Bạn đã mừng, họ chưa mừng lại</em>' : '')) + '</div>';
    }
  }
  if (!ds.length) return h + '<div class="empty">' + (k ? 'Không có khoản nào khớp.' : 'Chưa có khoản nào.') + '</div>';
  return h + ds.slice(0, SM_GIOI_HAN).map(smDongHtml).join('') + (ds.length > SM_GIOI_HAN ? '<div class="empty" style="padding:8px 0">Hiện ' + SM_GIOI_HAN + ' khoản mới nhất trong ' + ds.length + '. Gõ tên để tìm các khoản cũ hơn.</div>' : '');
}
function smPageHtml(){
  var ds = state.data.quaTang || [], nam = todayStr().slice(0, 4), t = smTongNam(nam);
  var h = '<div class="card dm-card cc-card">' + dmHead('Sổ mừng và quà', '<button class="btn secondary sm" data-act="smThem">+ Thêm</button>')
    + '<div class="dm-sub">Ghi tiền mừng cưới, phúng viếng, mừng tuổi... để nhớ ai mừng bạn, bạn mừng ai. Mặc định chỉ ghi nhớ, không đụng số dư.</div>';
  if (!ds.length) return h + '<div class="empty">Chưa có khoản nào. Ví dụ: mừng cưới anh Minh 500.000.</div></div>';
  h += '<div class="cc-r"><span>Năm ' + nam + ' · bạn mừng</span><b class="chi">' + fmt(Math.round(t.cho)) + ' (' + t.nCho + ' lần)</b></div>'
    + '<div class="cc-r"><span>Năm ' + nam + ' · họ mừng bạn</span><b class="thu">' + fmt(Math.round(t.nhan)) + ' (' + t.nNhan + ' lần)</b></div>';
  var chua = smNguoi().filter(function(r){ return smCoDiCoLai(r) === 'nhanChuaDap'; });
  if (chua.length){
    h += '<div class="dm-sub" style="margin-top:14px"><b>Họ đã mừng bạn, bạn chưa mừng lại</b></div>'
      + chua.slice(0, 5).map(function(r){ return '<div class="cc-r"><span>' + esc(r.ten) + '</span><b class="thu">' + fmt(Math.round(r.nhan)) + '</b></div>'; }).join('');
  }
  h += '<div class="cc-form" style="margin-top:14px">' + vnF('Tìm theo tên, ghi chú hoặc dịp', '<input type="text" id="sm_tim" autocomplete="off" value="' + esc(state.sm.tim) + '" placeholder="VD: Minh">') + '</div>'
    + '<div id="smDs">' + smDsHtml(state.sm.tim) + '</div>';
  return h + '</div>';
}

/* ---- bảng thêm / sửa ---- */
function smSheetHtml(id){
  var ds = state.data.quaTang || [], ed = id ? ds.filter(function(x){ return x.id === id; })[0] : null;
  var d = ed || { nguoi: '', dip: '', chieu: 'cho', soTien: '', ngay: todayStr(), ghiChu: '' };
  var gy = smGoiY(), gyChu = gy.map(function(r){ return r.ten + ' ' + fmt(Math.round(r.tien)); }).join(' · ');
  var ten = nguoiTen();
  var h = vnF('Người', '<input type="text" id="sm_nguoi" list="sm_nguoi_goiy" autocomplete="off" value="' + esc(d.nguoi) + '" placeholder="VD: Anh Minh"><datalist id="sm_nguoi_goiy">'
      + ten.map(function(n){ return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>')
    + vnF('Chiều', dmSeg('sm_chieu', d.chieu === 'nhan' ? 'nhan' : 'cho', [['cho', 'Bạn mừng'], ['nhan', 'Họ mừng bạn']]))
    + vnF('Dịp <span class="mp-hint">(tự gõ, tùy chọn)</span>', '<input type="text" id="sm_dip" list="sm_dip_goiy" maxlength="30" autocomplete="off" value="' + esc(d.dip || '') + '" placeholder="VD: Cưới, Hiếu, Thôi nôi, Tân gia"><datalist id="sm_dip_goiy">'
      + smDipGoiY().map(function(x){ return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>')
    + vnF('Số tiền', dmMoney('sm_tien', d.soTien), '', gyChu ? 'Mức bạn thường mừng: ' + gyChu : '')
    + vnF('Ngày', '<input type="date" id="sm_ngay" value="' + esc(d.ngay) + '">')
    + vnF('Ghi chú <span class="mp-hint">(tùy chọn)</span>', '<input type="text" id="sm_note" value="' + esc(d.ghiChu || '') + '" placeholder="VD: cưới con anh Minh, Đà Nẵng">');
  if (ed && ed.ghiSo){
    h += '<div class="vn-note">' + icon('check') + ' Khoản này đã ghi vào Sổ tay ngày ' + ngayVN(ed.ghiSo.split('|')[0]) + '. Xóa ở đây không xóa khoản chi bên Sổ tay.</div>';
  } else {
    h += vnF('Ghi vào Sổ tay?', dmSeg('sm_ghi', 'khong', [['khong', 'Không, chỉ nhớ'], ['co', 'Có, ghi vào Sổ tay']]),
        '', 'Bạn mừng thì ghi thành khoản chi, họ mừng bạn thì ghi thành khoản thu. Chọn "Không" nếu là tiền mặt không qua ví: số dư không đổi.')
      + '<div id="sm_ghi_f" hidden>' + vnF('Danh mục', '<select id="sm_cat">' + dkCatOptions(d.chieu === 'nhan' ? 'thu' : 'chi', '') + '</select>')
      + ((state.data.wallets || []).length > 1 ? vnF('Ví', '<select id="sm_vi">' + viOptionsHtml(viMacDinhId()) + '</select>') : '') + '</div>';
  }
  if (ed) h += '<button type="button" class="btn danger dm-xoa" data-act="smXoa" data-id="' + esc(ed.id) + '">' + icon('trash') + ' Xóa khoản này</button>';
  return vnSheetKhung(ed ? 'Sửa khoản mừng' : 'Thêm khoản mừng', h, ed ? 'Cập nhật' : 'Lưu', 'smLuu', 'mmHuy');
}
// các tên người đang có (mới dùng gần nhất lên đầu) cho gợi ý khi gõ
function nguoiTen(){ return smNguoi().map(function(r){ return r.ten; }); }

/* ---- sự kiện ---- */
function handleSoMungInput(el){
  if (!el || el.id !== 'sm_tim') return false;
  state.sm.tim = el.value;
  var o = document.getElementById('smDs');
  if (o) o.innerHTML = smDsHtml(el.value);
  return false;
}
function handleSoMungAction(act, el){
  el = el || {};
  var ds = state.data.quaTang = state.data.quaTang || [];
  var idOf = function(){ return el.getAttribute && el.getAttribute('data-id'); };
  if (act === 'smThem'){ state.ccForm = { loai: 'sm', id: '' }; ccSheetVe(); }
  else if (act === 'smSua'){ state.ccForm = { loai: 'sm', id: idOf() }; ccSheetVe(); }
  else if (act === 'smLuu'){
    var nguoi = ((document.getElementById('sm_nguoi') || {}).value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    var chieu = (document.getElementById('sm_chieu') || {}).value === 'nhan' ? 'nhan' : 'cho';
    var dip = ((document.getElementById('sm_dip') || {}).value || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    var tien = numNonNeg(docSo((document.getElementById('sm_tien') || {}).value));
    var ngay = (document.getElementById('sm_ngay') || {}).value || '';
    var note = ((document.getElementById('sm_note') || {}).value || '').trim().slice(0, 120);
    var ghi = (document.getElementById('sm_ghi') || {}).value === 'co', loaiGhi = chieu === 'nhan' ? 'thu' : 'chi';
    var cat = ((document.getElementById('sm_cat') || {}).value || '').split('|');
    if (!nguoi){ toast('Nhập tên người.', { loai: 'warn' }); return true; }
    if (tien <= 0){ toast('Nhập số tiền.', { loai: 'warn' }); return true; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)){ toast('Chọn ngày.', { loai: 'warn' }); return true; }
    if (ghi && (cat.length !== 2 || !cat[1] || cat[0] !== loaiGhi)){ toast('Chọn danh mục ' + (loaiGhi === 'thu' ? 'thu' : 'chi') + ' để ghi vào Sổ tay.', { loai: 'warn' }); return true; }
    var cu = ds.filter(function(x){ return x.id === (state.ccForm && state.ccForm.id); })[0], ghiSo = '', it = null;
    if (ghi){
      var vi = (document.getElementById('sm_vi') || {}).value || '';
      var gc = (chieu === 'nhan' ? nguoi + ' mừng' : 'Mừng ' + nguoi) + (dip ? ' (' + dip + ')' : '');
      it = entryAddItem(ngay, loaiGhi, cat[1], tien, gc, vi);
      if (!it){ toast('Không ghi được vào Sổ tay.', { loai: 'err' }); return true; }
      var gcN = gc + ' ' + fmt(Math.round(tien)), e = state.data.journal[ngay];
      e.ghiChu = e.ghiChu ? e.ghiChu + '; ' + gcN : gcN; it.gc = gcN;
      ghiSo = ngay + '|' + it.iid;
    }
    var o = { nguoi: nguoi, chieu: chieu, dip: dip, soTien: tien, ngay: ngay, ghiChu: note };
    var moi = null;
    if (cu){ Object.assign(cu, o); if (ghiSo) cu.ghiSo = ghiSo; }
    else { moi = Object.assign({ id: 'qt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ghiSo: ghiSo }, o); ds.push(moi); }
    state.ccForm = null; scheduleSave(); renderCongCu();
    toast((chieu === 'nhan' ? 'Đã ghi: ' + nguoi + ' mừng bạn ' : 'Đã ghi: bạn mừng ' + nguoi + ' ') + fmt(Math.round(tien)) + (it ? ' (cũng ghi vào Sổ tay như khoản ' + (loaiGhi === 'thu' ? 'thu' : 'chi') + ').' : '.'),
      moi ? { hoanTac: function(){
        var i = ds.indexOf(moi); if (i >= 0) ds.splice(i, 1);
        if (it){ var ee = state.data.journal[ngay]; if (ee) journalRemoveNote(ee, it.gc); entryDeleteItem(ngay, it.iid); }
        scheduleSave(); renderCongCu();
      } } : undefined);
  } else if (act === 'smXoa'){
    var xi = ds.findIndex(function(x){ return x.id === idOf(); });
    if (xi < 0) return true;
    var xoa = ds.splice(xi, 1)[0];
    state.ccForm = null; scheduleSave(); renderCongCu();
    toast('Đã xóa khoản mừng.' + (xoa.ghiSo ? ' Khoản chi bên Sổ tay vẫn giữ.' : ''), { hoanTac: function(){ ds.splice(Math.min(xi, ds.length), 0, xoa); scheduleSave(); renderCongCu(); } });
  } else return false;
  return true;
}
