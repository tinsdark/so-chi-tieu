"use strict";
/* ====================================================================
   congcu.js — tab CÔNG CỤ (phím 5): thẻ "Muốn mua" (gộp "Mua được không?" và danh sách món muốn mua), cộng thêm thẻ Giờ công (giocong.js)
   và Lời hứa (loihua.js); 2 file đó phải load SAU file này.
   Cần state.js, ui.js, vayno.js, sotay.js, danhmuc.js, theongay.js load trước (dùng tnLichTien, tieuMoiNgay, mucTieuTienDo, dkCatOptions).

   MUỐN MUA. Hỏi "mua món này được không" TRƯỚC khi tiêu. Nhập tên + giá (+ trả góp) -> app chèn khoản chi đó vào lịch tiền
   60 ngày tới (tnLichTien, tổng các ví) và trả lời:
     - số dư thấp nhất nếu mua (và ngày), có xuống dưới mức muốn giữ lại không;
     - NGÀY SỚM NHẤT mua mà vẫn an toàn (không ngày nào sau đó xuống dưới mức giữ lại);
     - mức tiêu mỗi ngày còn lại nếu tính khoản này vào chi hằng ngày (chỉ để biết, không đổi kết luận);
     - mục tiêu tiết kiệm gắn đúng ví trả bị lùi bao nhiêu;
     - ví trả có đủ tiền hôm nay không.
   Kết luận chỉ dựa vào SỐ DƯ (không dựa vào hạn mức chi hằng ngày: món lớn nào cũng vượt hạn mức tháng).
   Món lưu lại: muonMua[] = [{id, ten, soTien, viId, thang, lai, giu, ngayThem, soNgayCho, tt: 'cho'|'mua'|'bo', ngayXong}].
   Kết luận của món đang chờ được TÍNH LẠI mỗi lần mở tab (tiền thật đổi thì kết luận đổi). "Mua rồi" mới ghi khoản chi vào Sổ tay;
   "Bỏ" không ghi gì, cộng vào "đã nhịn được". Phân tích chỉ đọc dữ liệu, không đổi số dư.
   ==================================================================== */

var MM_SO_NGAY = 60;
var MM_CHO_MAC_DINH = 7;
state.cc = state.cc || { ten: '', gia: '', vi: '', thang: '', lai: '', giu: '', kq: false, xem: '' };
state.ccTrang = state.ccTrang || '';      // '' = màn tổng hợp, còn lại là khóa của trang đang mở (xem CC_TRANG)
state.ccForm = state.ccForm || null;      // bảng đang mở ở tab Công cụ: { loai: 'mm' (Mua rồi) | 'lh' (lời hứa), id }

/* ---- tính toán thuần ---- */
// tiền góp mỗi tháng (lãi dư nợ giảm dần, thang <= 1 = trả đủ một lần)
function mmTienGop(soTien, thang, laiNam){
  if (!(thang > 1)) return soTien;
  var r = num(laiNam) / 100 / 12;
  if (r <= 0) return soTien / thang;
  return soTien * r / (1 - Math.pow(1 + r, -thang));
}
// các lần trả: [{ ngay, soTien }], lần đầu đúng ngày mua, các lần sau cùng ngày của các tháng sau
function mmKeHoachTra(soTien, thang, laiNam, ngayMua){
  var n = thang > 1 ? Math.round(thang) : 1, tra = mmTienGop(soTien, n, laiNam), out = [];
  var mk = monthKey(ngayMua), ngay = parseInt(ngayMua.slice(8, 10), 10);
  for (var k = 0; k < n; k++) out.push({ ngay: ngayTraCuaKy(monthKeyAdd(mk, k), ngay), soTien: tra });
  return out;
}
// mức tiêu mỗi ngày trước / sau khi tính khoản này vào chi hằng ngày của tháng mua; null nếu chưa có hạn mức
function mmMucNgay(gia, ngayMua, homNay){
  var hn = hanMucHangNgay();
  if (!(hn.cap > 0)) return null;
  var mk = monthKey(ngayMua);
  if (mk === monthKey(homNay)){
    var tm = tieuMoiNgay(homNay);
    if (!tm) return null;
    return { truoc: tm.muc, sau: Math.max(0, tm.cap - tm.daTruoc - gia) / tm.soNgay, vuot: Math.max(0, tm.daTruoc + tm.daHomNay + gia - tm.cap),
             cap: tm.cap, da: tm.daTruoc, soNgay: tm.soNgay, thangNay: true };
  }
  var sn = daysInMonth(mk);
  return { truoc: hn.cap / sn, sau: Math.max(0, hn.cap - gia) / sn, vuot: Math.max(0, gia - hn.cap), cap: hn.cap, da: 0, soNgay: sn, thangNay: false };
}
// mục tiêu GẮN VÍ TRẢ bị ảnh hưởng: số còn thiếu tăng, số cần để dành mỗi tháng tăng, lùi khoảng bao nhiêu ngày
function mmMucTieu(tienRaVi, viId, homNay){
  var out = [];
  (state.data.mucTieu || []).forEach(function(g){
    if (!g.walletId || g.walletId !== viId || !walletById(viId)) return;
    var t = mucTieuTienDo(g, homNay), eff = Math.min(tienRaVi, t.da);
    if (eff <= 0.5) return;
    var thieuSau = t.conThieu + eff, canSau = t.soThangCon ? thieuSau / t.soThangCon : null;
    out.push({ ten: g.ten, eff: eff, thieuTruoc: t.conThieu, thieuSau: thieuSau, canTruoc: t.canMoiThang, canSau: canSau,
               luiNgay: (t.canMoiThang > 0) ? Math.round(eff / (t.canMoiThang / 30)) : null, daXong: t.xong });
  });
  return out;
}
/* o = { soTien, viId, thang, lai, giu }. Trả { tra, thapMoi, thieu, antoan, goc } ; thieu/antoan = ngày hoặc null */
function mmPhanTich(o, homNay){
  homNay = homNay || todayStr();
  var gia = num(o.soTien), giu = num(o.giu), viId = (o.viId && walletById(o.viId)) ? o.viId : viMacDinhId();
  var L = tnLichTien(homNay, MM_SO_NGAY);
  var danh = function(ngayMua){
    var tra = mmKeHoachTra(gia, o.thang, o.lai, ngayMua), thap = null, thieu = null;
    L.ngay.forEach(function(r){
      if (r.ngay < ngayMua) return;
      var off = 0; tra.forEach(function(t){ if (t.ngay <= r.ngay) off += t.soTien; });
      var c = r.cuoi - off;
      if (!thap || c < thap.cuoi) thap = { ngay: r.ngay, cuoi: c, goc: r.cuoi, off: off };
      if (!thieu && c < giu - 0.5) thieu = { ngay: r.ngay, cuoi: c };
    });
    return { tra: tra, thap: thap, thieu: thieu };
  };
  var hom = danh(homNay), antoan = null;
  for (var i = 0; i < L.ngay.length; i++){
    if (!danh(L.ngay[i].ngay).thieu){ antoan = L.ngay[i].ngay; break; }
  }
  var tienRa = hom.tra[0].soTien, soDuVi = soDuTheoVi(viId, homNay);
  var r = { gia: gia, giu: giu, viId: viId, tra: hom.tra, thap: hom.thap, thieu: hom.thieu, antoan: antoan, antoanHomNay: antoan === homNay,
            goc: L.thap, dauKy: L.dau, tienRa: tienRa, soDuVi: soDuVi, thieuVi: Math.max(0, tienRa - soDuVi),
            mucNgay: mmMucNgay(gia, homNay, homNay), mucTieu: mmMucTieu(tienRa, viId, homNay), homNay: homNay,
            tong: hom.tra.length * hom.tra[0].soTien };
  r.lai = r.tong - gia;
  r.mau = r.thieu ? 'bad' : (r.thieuVi > 0.5 ? 'warn' : 'ok');
  return r;
}
// món đang chờ: đủ thời gian chờ chưa, kết luận ngắn
function mmDenHanCho(m, homNay){ return m.tt === 'cho' && homNay >= tnNgayCong(m.ngayThem, m.soNgayCho || MM_CHO_MAC_DINH); }
function mmKetLuanNgan(m, homNay){
  var p = mmPhanTich(m, homNay);
  if (p.mau === 'ok') return { mau: 'ok', chu: 'Mua được hôm nay' };
  if (p.mau === 'warn') return { mau: 'warn', chu: 'Ví ' + viTen(p.viId) + ' thiếu ' + fmt(Math.ceil(p.thieuVi)) };
  return p.antoan ? { mau: 'bad', chu: 'Chưa đủ tiền · an toàn từ ' + ngayNganVN(p.antoan) } : { mau: 'bad', chu: 'Chưa an toàn trong ' + MM_SO_NGAY + ' ngày tới' };
}
function mmDaNhin(){
  var tong = 0, n = 0;
  (state.data.muonMua || []).forEach(function(m){ if (m.tt === 'bo'){ tong += num(m.soTien); n++; } });
  return { tong: tong, n: n };
}

/* ---- giao diện ---- */
function mmDongKq(nhan, so, mau){
  return '<div class="cc-r"><span>' + nhan + '</span><b' + (mau ? ' class="' + mau + '"' : '') + '>' + so + '</b></div>';
}
function mmKetQuaHtml(p){
  var h = '<div class="cc-kq ' + p.mau + '" id="ccKetQua">';
  var tieuDe = p.mau === 'ok' ? 'Mua được hôm nay' : (p.mau === 'warn' ? 'Tổng tiền đủ, nhưng ví ' + esc(viTen(p.viId)) + ' chưa đủ' : 'Chưa nên mua hôm nay');
  h += '<div class="cc-v">' + icon(p.mau === 'ok' ? 'check' : 'alert') + '<span>' + tieuDe + '</span></div>';
  if (p.tra.length > 1){
    h += mmDongKq('Trả góp ' + p.tra.length + ' tháng', fmt(Math.round(p.tra[0].soTien)) + '/tháng')
      + mmDongKq('Tổng phải trả (gồm lãi ' + fmt(Math.round(p.lai)) + ')', fmt(Math.round(p.tong)));
  }
  h += mmDongKq('Số dư thấp nhất nếu mua (' + ngayNganVN(p.thap.ngay) + ')', fmt(Math.round(p.thap.cuoi)), p.thap.cuoi < p.giu - 0.5 ? 'chi' : '')
    + mmDongKq('Nếu không mua (' + ngayNganVN(p.goc.ngay) + ')', fmt(Math.round(p.goc.cuoi)));
  if (p.antoanHomNay) h += mmDongKq('Ngày mua an toàn sớm nhất', 'Hôm nay', 'thu');
  else if (p.antoan) h += mmDongKq('Ngày mua an toàn sớm nhất', tnThu(p.antoan) + ' ' + ngayNganVN(p.antoan), 'thu');
  else h += mmDongKq('Ngày mua an toàn sớm nhất', 'Chưa có trong ' + MM_SO_NGAY + ' ngày tới', 'chi');
  if (p.mucNgay){
    var m = p.mucNgay;
    h += mmDongKq('Mức tiêu mỗi ngày' + (m.thangNay ? '' : ' (tháng mua)'), fmt(Math.round(m.truoc)) + ' ' + icon('arrow-right','ic-mui') + ' ' + fmt(Math.round(m.sau)), m.sau < m.truoc * 0.5 ? 'chi' : '')
      + (m.vuot > 0 ? mmDongKq('Vượt hạn mức hằng ngày của tháng', fmt(Math.round(m.vuot)), 'chi') : '');
  }
  p.mucTieu.forEach(function(g){
    h += mmDongKq('Mục tiêu "' + esc(g.ten) + '"', 'thiếu ' + fmt(Math.round(g.thieuTruoc)) + ' ' + icon('arrow-right','ic-mui') + ' ' + fmt(Math.round(g.thieuSau)), 'chi')
      + (g.canTruoc != null && g.canSau != null ? mmDongKq('&nbsp;&nbsp;cần để dành mỗi tháng', fmt(Math.round(g.canTruoc)) + ' ' + icon('arrow-right','ic-mui') + ' ' + fmt(Math.round(g.canSau))) : '')
      + (g.luiNgay ? mmDongKq('&nbsp;&nbsp;lùi khoảng', g.luiNgay + ' ngày', 'chi') : '');
  });
  if (p.thieuVi > 0.5){
    h += '<div class="cc-note">' + icon('alert') + '<span>Ví ' + esc(viTen(p.viId)) + ' hiện có ' + fmt(Math.round(p.soDuVi)) + ', cần chuyển thêm ít nhất ' + fmt(Math.ceil(p.thieuVi)) + ' vào ví này.</span></div>';
  }
  return h + mmGiaiThichHtml(p) + '</div>';
}
function mmGiaiThichHtml(p){
  var ds = [
    { ten: 'Số dư thấp nhất nếu mua', ct: 'Lịch tiền ' + MM_SO_NGAY + ' ngày tới (tổng các ví, giống "Tiền 30 ngày tới" ở Dòng tiền) trừ khoản mua kể từ ngày mua.',
      pt: ptCong([p.thap.goc, -p.thap.off], p.thap.cuoi) },
    { ten: 'Ngày mua an toàn sớm nhất', ct: 'Ngày sớm nhất mà sau khi mua, không ngày nào trong ' + MM_SO_NGAY + ' ngày tới có số dư dưới mức muốn giữ lại ('
      + fmt(Math.round(p.giu)) + '). Mua càng muộn thì khoản lương / thu về trước đó càng nhiều.',
      pt: p.antoan ? 'Ngày ' + ngayNganVN(p.antoan) + ': số dư thấp nhất sau ngày đó khi mua đủ tiền vẫn ≥ ' + soGt(p.giu) : 'Không có ngày nào đủ an toàn trong ' + MM_SO_NGAY + ' ngày tới.' }
  ];
  if (p.mucNgay){
    var m = p.mucNgay;
    ds.push({ ten: 'Mức tiêu mỗi ngày', ct: 'Chỉ để biết, không đổi kết luận: tính khoản này vào chi hằng ngày của tháng thì phần hạn mức còn lại chia cho số ngày còn lại.',
      pt: '(' + soGt(m.cap) + ' − ' + soGt(m.da) + ' − ' + soGt(p.gia) + ', không âm) ÷ ' + m.soNgay + ' ngày = ' + soGt(m.sau) + '/ngày' });
  }
  if (p.mucTieu.length){
    var g = p.mucTieu[0];
    ds.push({ ten: 'Mục tiêu bị lùi', ct: 'Tiền ra khỏi ví gắn mục tiêu làm số còn thiếu tăng; số ngày lùi = tiền đó ÷ (số cần để dành mỗi tháng ÷ 30), tức là nếu bạn tiếp tục để dành đúng mức cần hiện tại.',
      pt: ptCong([g.thieuTruoc, g.eff], g.thieuSau) + (g.luiNgay ? ' · ' + soGt(g.eff) + ' ÷ (' + soGt(g.canTruoc) + ' ÷ 30) ≈ ' + g.luiNgay + ' ngày' : '') });
  }
  return giaiThichSo(ds, 'Cách tính các số này');
}
function mmFormHtml(){
  var c = state.cc, nhieuVi = (state.data.wallets || []).length > 1;
  return '<div class="cc-form">'
    + vnF('Món định mua', '<input type="text" id="cc_ten" value="' + esc(c.ten) + '" placeholder="VD: Điện thoại">')
    + '<div class="vn-2">' + vnF('Giá', dmMoney('cc_gia', c.gia))
    + (nhieuVi ? vnF('Trả từ ví', '<select id="cc_vi">' + viOptionsHtml(c.vi || viMacDinhId()) + '</select>') : '') + '</div>'
    + '<div class="vn-2">' + vnF('Trả góp (tháng)', '<input type="number" id="cc_thang" min="0" inputmode="numeric" value="' + esc(c.thang) + '" placeholder="Trống = trả đủ">')
    + vnF('Lãi %/năm', '<input type="number" id="cc_lai" min="0" step="0.1" inputmode="decimal" value="' + esc(c.lai) + '" placeholder="0 = góp 0%">') + '</div>'
    + vnF('Muốn giữ lại tối thiểu <span class="mp-hint">(không để số dư xuống dưới)</span>', dmMoney('cc_giu', c.giu))
    + '<div class="cc-btns"><button type="button" class="btn" data-act="mmKiemTra">Kiểm tra</button>'
    + (c.kq ? '<button type="button" class="btn secondary" data-act="mmLuu">Lưu vào danh sách</button>' : '') + '</div></div>';
}
function mmDocForm(){
  var c = state.cc;
  return { ten: String(c.ten || '').trim(), soTien: numNonNeg(docSo(c.gia)), viId: c.vi, thang: Math.max(0, Math.round(num(c.thang))),
           lai: numNonNeg(c.lai), giu: numNonNeg(docSo(c.giu)) };
}
function mmDanhSachHtml(hom){
  var ds = (state.data.muonMua || []).filter(function(m){ return m.tt === 'cho'; });
  if (!ds.length) return '<div class="empty" style="margin-top:10px">Chưa có món nào đang chờ.</div>';
  return '<div class="cc-ds">' + ds.map(function(m){
    var kl = mmKetLuanNgan(m, hom), den = mmDenHanCho(m, hom), han = tnNgayCong(m.ngayThem, m.soNgayCho || MM_CHO_MAC_DINH);
    return '<div class="cc-it' + (den ? ' den' : '') + '"><div class="cc-it-h"><b>' + esc(m.ten) + '</b><b class="chi">' + fmt(Math.round(m.soTien)) + (m.thang > 1 ? ' · góp ' + m.thang + ' tháng' : '') + '</b></div>'
      + '<div class="cc-it-s"><span class="cc-tag ' + kl.mau + '">' + esc(kl.chu) + '</span>'
      + '<span class="muted">' + (den ? 'Đã đủ thời gian chờ · còn muốn mua không?' : 'Chờ tới ' + ngayNganVN(han)) + '</span></div>'
      + '<div class="cc-it-b"><button type="button" class="btn sm" data-act="mmMuaRoi" data-id="' + esc(m.id) + '">Mua rồi</button>'
      + '<button type="button" class="btn secondary sm" data-act="mmBo" data-id="' + esc(m.id) + '">Bỏ</button>'
      + '<button type="button" class="btn secondary sm" data-act="mmXem" data-id="' + esc(m.id) + '">Xem lại</button>'
      + '<button type="button" class="icon-btn" data-act="mmXoa" data-id="' + esc(m.id) + '" aria-label="Xóa ' + esc(m.ten) + '">' + icon('trash') + '</button></div></div>';
  }).join('') + '</div>';
}
function mmCardHtml(){
  var hom = todayStr(), c = state.cc, h = '<div class="card dm-card cc-card">' + dmHead('Muốn mua');
  h += '<div class="dm-sub">Hỏi trước khi tiêu: mua được chưa, khi nào mua thì an toàn, mua xong còn tiêu được bao nhiêu mỗi ngày.</div>' + mmFormHtml();
  if (c.kq){
    var f = mmDocForm();
    if (f.soTien > 0) h += mmKetQuaHtml(mmPhanTich(f, hom));
    else h += '<div class="empty" style="margin-top:10px">Nhập giá lớn hơn 0 để kiểm tra.</div>';
  }
  h += '<div class="dm-sub" style="margin-top:16px"><b>Đang chờ</b></div>' + mmDanhSachHtml(hom);
  var nh = mmDaNhin();
  if (nh.n) h += '<div class="cc-nhin">' + icon('check') + ' Đã nhịn được <b>' + fmt(Math.round(nh.tong)) + '</b> (' + nh.n + ' món bỏ không mua)</div>';
  return h + ghiChuGon('Kết luận dựa trên SỐ DƯ: lịch tiền ' + MM_SO_NGAY + ' ngày tới của tổng các ví (lương, trả nợ, khoản cố định, chi hằng ngày theo mức) trừ khoản mua. '
    + 'Món lưu lại sẽ tự tính lại mỗi lần mở tab. App không ghi gì vào Sổ tay cho tới khi bạn bấm "Mua rồi". Dự báo xa hơn 30 ngày kém chắc hơn.', 'Tính thế nào?') + '</div>';
}
/* ---- màn tổng hợp: mỗi công cụ / sổ một ô có dòng trạng thái, bấm vào mở trang riêng ---- */
var CC_TRANG = [
  { key: 'muonmua', nhom: 'Quyết định', ten: 'Muốn mua', icon: 'cart', tomTat: function(){ return mmTomTat(); }, trang: function(){ return mmCardHtml(); } },
  { key: 'giocong', nhom: 'Quyết định', ten: 'Giờ công', icon: 'clock', tomTat: function(){ return gcTomTat(); }, trang: function(){ return gcCardHtml(); } },
  { key: 'loihua', nhom: 'Quyết định', ten: 'Lời hứa', icon: 'flag', tomTat: function(){ return lhTomTat(); }, trang: function(){ return lhCardHtml(); } },
  { key: 'sommung', nhom: 'Sổ', ten: 'Sổ mừng và quà', icon: 'gift', tomTat: function(){ return smTomTat(); }, trang: function(){ return smPageHtml(); } },
  { key: 'dodac', nhom: 'Sổ', ten: 'Sổ đồ đạc', icon: 'package', tomTat: function(){ return ddTomTat(); }, trang: function(){ return ddPageHtml(); } }
];
function ccHubHtml(){
  var h = '<div class="dm-page">', nhom = '';
  var hien = htHien('congcu');                         // thứ tự + bật tắt theo Cài đặt → Hiển thị (ht.js); nhóm Quyết định luôn đứng trước nhóm Sổ
  var ds = CC_TRANG.filter(function(t){ return hien.indexOf(t.key) >= 0; }).sort(function(a, b){
    return (a.nhom === b.nhom ? 0 : (a.nhom === 'Quyết định' ? -1 : 1)) || (hien.indexOf(a.key) - hien.indexOf(b.key));
  });
  if (!ds.length) return h + '<div class="empty">Đã ẩn hết công cụ. Bật lại ở Cài đặt → Hiển thị.</div></div>';
  ds.forEach(function(t){
    if (t.nhom !== nhom){ if (nhom) h += '</div>'; nhom = t.nhom; h += dmSec(nhom) + '<div class="card dm-card cc-hub">'; }
    var s = t.tomTat();
    h += '<button type="button" class="cc-tile" data-act="ccMo" data-trang="' + t.key + '"><span class="cc-tile-i">' + icon(t.icon) + '</span>'
      + '<span class="cc-tile-b"><b>' + t.ten + '</b><small' + (s.canh ? ' class="canh"' : '') + '>' + esc(s.chu) + '</small></span>' + dmGo() + '</button>';
  });
  return h + '</div></div>';
}
function renderCongCu(){
  var root = document.getElementById('tabContent');
  var t = CC_TRANG.filter(function(x){ return x.key === state.ccTrang; })[0];
  if (!t){ state.ccTrang = ''; root.innerHTML = ccHubHtml(); }
  else root.innerHTML = '<div class="dm-page"><button type="button" class="cc-back" data-act="ccVe">' + icon('chev', 'cc-back-i') + ' Công cụ</button><div class="dm-grid">' + t.trang() + '</div></div>';
  ccSheetVe();
}
// dòng trạng thái của ô trên màn tổng hợp: { chu, canh (true = cần chú ý) }
function mmTomTat(){
  var hom = todayStr(), ds = (state.data.muonMua || []).filter(function(m){ return m.tt === 'cho'; });
  if (!ds.length) return { chu: 'Hỏi trước khi tiêu: mua được chưa, khi nào an toàn' };
  var den = ds.filter(function(m){ return mmDenHanCho(m, hom); }).length;
  return { chu: ds.length + ' món đang chờ' + (den ? ' · ' + den + ' món đủ thời gian chờ, hỏi lại' : ''), canh: den > 0 };
}
function gcTomTat(){
  var c = gcCauHinh(todayStr());
  return c.giaGio > 0 ? { chu: '1 giờ làm việc ≈ ' + fmt(Math.round(c.giaGio)) } : { chu: 'Chưa có thu nhập để quy đổi' };
}
function lhTomTat(){
  var hom = todayStr(), ds = state.data.loiHua || [];
  if (!ds.length) return { chu: 'Tự hứa với mình có thời hạn' };
  var t = ds.map(function(h){ return lhTrangThai(h, hom).trang; });
  var dang = t.filter(function(x){ return x === 'dang'; }).length, pha = t.filter(function(x){ return x === 'pha'; }).length;
  return { chu: (dang ? dang + ' đang giữ' : 'Không có lời hứa đang chạy') + (pha ? ' · ' + pha + ' đã phá' : ''), canh: pha > 0 && dang === 0 };
}

/* ---- bảng "Mua rồi" ---- */
function ccSheetHtml(){
  if (state.ccForm.loai === 'lh') return lhSheetHtml(state.ccForm.id);
  if (state.ccForm.loai === 'sm') return smSheetHtml(state.ccForm.id);
  if (state.ccForm.loai === 'dd') return ddSheetHtml(state.ccForm.id);
  var m = (state.data.muonMua || []).filter(function(x){ return x.id === state.ccForm.id; })[0];
  if (!m) return '';
  var tienGhi = mmKeHoachTra(num(m.soTien), m.thang, m.lai, todayStr())[0].soTien;
  var h = vnF('Số tiền ghi lần này', dmMoney('cc_m_tien', Math.round(tienGhi)), '', m.thang > 1 ? 'Trả góp: ghi lần trả đầu tiên. Các lần sau ghi ở Sổ tay khi trả.' : '')
    + vnF('Ngày', '<input type="date" id="cc_m_ngay" value="' + todayStr() + '">')
    + vnF('Danh mục chi', '<select id="cc_m_cat">' + dkCatOptions('chi', '') + '</select>')
    + ((state.data.wallets || []).length > 1 ? vnF('Ví', '<select id="cc_m_vi">' + viOptionsHtml(m.viId || viMacDinhId()) + '</select>') : '')
    + vnF('Ghi chú', '<input type="text" id="cc_m_note" value="' + esc(m.ten) + '">')
    + dmToggle('cc_m_dodac', 'Thêm vào Sổ đồ đạc', 'Theo dõi chi phí mỗi ngày dùng và hạn bảo hành của món này.', false)
    + '<div class="vn-2">' + vnF('Dùng (năm)', '<input type="number" id="cc_m_nam" min="0.1" max="50" step="0.5" inputmode="decimal" placeholder="' + DD_NAM_MAC_DINH + '">')
    + vnF('Bảo hành (tháng)', '<input type="number" id="cc_m_bh" min="0" max="120" inputmode="numeric" placeholder="0">') + '</div>';
  return vnSheetKhung('Mua rồi: ' + esc(m.ten), h, 'Ghi vào Sổ tay', 'mmMuaLuu', 'mmHuy');
}
function ccSheetVe(){
  if (typeof document === 'undefined' || !document.body || !document.createElement) return;
  if (state.tab !== 'congcu' && state.ccForm) state.ccForm = null;
  var root = document.getElementById('ccSheetRoot'), khoa = state.ccForm ? 'cc:' + state.ccForm.loai + ':' + state.ccForm.id : '';
  if (root && root.getAttribute('data-key') === khoa) return;
  if (root && root.parentNode) root.parentNode.removeChild(root);
  if (!khoa){
    if (!vnMoKhoaNen()) document.body.classList.remove('qa-mo');
    return;
  }
  root = document.createElement('div');
  root.id = 'ccSheetRoot';
  root.className = 'qa-back moi';
  root.setAttribute('data-key', khoa);
  root.innerHTML = ccSheetHtml();
  document.body.appendChild(root);
  document.body.classList.add('qa-mo');
  vnKhopKhungNhin();
  setTimeout(function(){ root.classList.remove('moi'); }, 400);
}

/* ---- sự kiện ---- */
function handleCongCuInput(el){
  if (!el || !el.id) return false;
  handleGioCongInput(el); handleSoMungInput(el);       // ô tính nhanh Giờ công (gc_gia), ô tìm Sổ mừng (sm_tim): vẽ lại riêng vùng kết quả
  if (el.id.indexOf('cc_') !== 0) return false;
  var map = { cc_ten: 'ten', cc_gia: 'gia', cc_vi: 'vi', cc_thang: 'thang', cc_lai: 'lai', cc_giu: 'giu' };
  if (map[el.id]){ state.cc[map[el.id]] = el.value; state.cc.kq = false; }
  return false;       // không chặn các handler khác (định dạng ô tiền)
}
function mmGhiNhanTuForm(){
  var f = mmDocForm();
  if (!f.ten){ toast('Nhập tên món.', { loai: 'warn' }); return null; }
  if (f.soTien <= 0){ toast('Giá phải lớn hơn 0.', { loai: 'warn' }); return null; }
  return f;
}
function handleCongCuAction(act, el){
  el = el || {};
  var ds = state.data.muonMua = state.data.muonMua || [];
  var idOf = function(){ return el.getAttribute && el.getAttribute('data-id'); };
  var tim = function(id){ return ds.filter(function(x){ return x.id === id; })[0]; };
  if (act === 'ccMo'){
    state.ccTrang = el.getAttribute('data-trang') || ''; renderCongCu(); window.scrollTo(0, 0);
  } else if (act === 'ccVe'){
    state.ccTrang = ''; state.ccForm = null; renderCongCu(); window.scrollTo(0, 0);
  } else if (act === 'mmKiemTra'){
    var f = mmDocForm();
    if (f.soTien <= 0){ toast('Nhập giá lớn hơn 0.', { loai: 'warn' }); return true; }
    state.cc.kq = true; renderCongCu();
    var o = document.getElementById('ccKetQua'); if (o && o.scrollIntoView) o.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (act === 'mmLuu'){
    var g = mmGhiNhanTuForm(); if (!g) return true;
    var m = { id: 'mm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ten: g.ten, soTien: g.soTien,
              viId: (g.viId && walletById(g.viId)) ? g.viId : viMacDinhId(), thang: g.thang, lai: g.lai, giu: g.giu,
              ngayThem: todayStr(), soNgayCho: MM_CHO_MAC_DINH, tt: 'cho', ngayXong: '' };
    ds.push(m);
    state.cc = { ten: '', gia: '', vi: '', thang: '', lai: '', giu: '', kq: false, xem: '' };
    scheduleSave(); renderCongCu();
    toast('Đã lưu "' + m.ten + '". Sau ' + MM_CHO_MAC_DINH + ' ngày app hỏi còn muốn mua không.');
  } else if (act === 'mmXem'){
    var x = tim(idOf()); if (!x) return true;
    state.cc = { ten: x.ten, gia: veSo(x.soTien), vi: x.viId, thang: x.thang ? String(x.thang) : '', lai: x.lai ? String(x.lai) : '', giu: x.giu ? veSo(x.giu) : '', kq: true, xem: x.id };
    renderCongCu(); window.scrollTo(0, 0);
  } else if (act === 'mmBo'){
    var b = tim(idOf()); if (!b) return true;
    b.tt = 'bo'; b.ngayXong = todayStr();
    scheduleSave(); renderCongCu();
    toast('Đã bỏ "' + b.ten + '": nhịn được ' + fmt(Math.round(b.soTien)) + '.', { hoanTac: function(){ b.tt = 'cho'; b.ngayXong = ''; scheduleSave(); renderCongCu(); } });
  } else if (act === 'mmXoa'){
    var xi = ds.findIndex(function(y){ return y.id === idOf(); });
    if (xi < 0) return true;
    var xoa = ds.splice(xi, 1)[0];
    scheduleSave(); renderCongCu();
    toast('Đã xóa "' + xoa.ten + '".', { hoanTac: function(){ ds.splice(Math.min(xi, ds.length), 0, xoa); scheduleSave(); renderCongCu(); } });
  } else if (act === 'mmMuaRoi'){
    if (!tim(idOf())) return true;
    state.ccForm = { loai: 'mm', id: idOf() }; ccSheetVe();
  } else if (act === 'mmHuy'){
    state.ccForm = null; ccSheetVe();
  } else if (act === 'mmMuaLuu'){
    var mm = tim(state.ccForm && state.ccForm.loai === 'mm' && state.ccForm.id); if (!mm) return true;
    var tien = numNonNeg(docSo((document.getElementById('cc_m_tien') || {}).value));
    var ngay = (document.getElementById('cc_m_ngay') || {}).value || todayStr();
    var cat = ((document.getElementById('cc_m_cat') || {}).value || '').split('|');
    var vi = (document.getElementById('cc_m_vi') || {}).value || mm.viId;
    var note = ((document.getElementById('cc_m_note') || {}).value || '').trim() || mm.ten;
    if (tien <= 0){ toast('Nhập số tiền.', { loai: 'warn' }); return true; }
    if (cat.length !== 2 || !cat[1]){ toast('Chọn danh mục chi.', { loai: 'warn' }); return true; }
    // ví sắp âm / vượt lời hứa thì hỏi xác nhận như Ghi nhanh (luật "bất thường" tắt: món lớn là chuyện bình thường ở đây)
    if (chayNeuDongY(canhBaoKhoan({ kind: 'chi', catId: cat[1], tien: tien, ngay: ngay, ghiChu: note, viId: vi, batThuong: false }), act, el, handleCongCuAction)) return true;
    var it = entryAddItem(ngay, 'chi', cat[1], tien, note, vi);
    if (!it){ toast('Không ghi được khoản này.', { loai: 'err' }); return true; }
    var gc = note + ' ' + fmt(Math.round(tien)), e = state.data.journal[ngay];
    e.ghiChu = e.ghiChu ? e.ghiChu + '; ' + gc : gc;
    it.gc = gc;
    mm.tt = 'mua'; mm.ngayXong = ngay;
    var dd = null;
    if ((document.getElementById('cc_m_dodac') || {}).checked){
      var bhThang = Math.max(0, Math.round(num((document.getElementById('cc_m_bh') || {}).value)));
      dd = ddThem({ ten: mm.ten, gia: mm.soTien, ngayMua: ngay, soNam: num((document.getElementById('cc_m_nam') || {}).value),
                    baoHanhDen: bhThang ? ngayTraCuaKy(monthKeyAdd(monthKey(ngay), bhThang), parseInt(ngay.slice(8, 10), 10)) : '' });
    }
    state.ccForm = null; scheduleSave(); renderCongCu();
    toast('Đã ghi chi ' + catTen('chi', cat[1]) + ' ' + fmt(Math.round(tien)) + ' (' + ngayNganVN(ngay) + ') vào Sổ tay' + (dd ? ' và Sổ đồ đạc.' : '.'), { hoanTac: function(){
      var ee = state.data.journal[ngay];
      if (ee) journalRemoveNote(ee, gc);
      entryDeleteItem(ngay, it.iid);
      mm.tt = 'cho'; mm.ngayXong = '';
      if (dd){ var di = state.data.doDac.indexOf(dd); if (di >= 0) state.data.doDac.splice(di, 1); }
      scheduleSave(); renderCongCu();
    } });
  } else return handleGioCongAction(act, el) || handleLoiHuaAction(act, el) || handleSoMungAction(act, el) || handleDoDacAction(act, el);
  return true;
}
document.addEventListener('keydown', function(ev){
  if (ev.key === 'Escape' && state.ccForm && !_modalDangMo){ ev.preventDefault(); handleAction('mmHuy', null); }
});
