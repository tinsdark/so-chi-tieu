"use strict";
/* ====================================================================
   ngansach.js — NGÂN SÁCH TỰ LẬP: kéo MỘT thanh trượt "muốn để dành bao nhiêu mỗi tháng", app tự chia hạn mức cho
   từng danh mục chi, thay cho việc ngồi đặt từng hạn mức một.

   Dữ liệu gốc (chỉ đọc): tối đa 3 tháng ĐÃ HOÀN CHỈNH gần nhất (forecastEligibleMonths, cùng nguồn với gợi ý dự kiến):
     - thu nhập thật trung bình (không gồm vay nợ) = bdThang(mk).tongThuThat
     - chi thật trung bình từng danh mục (bdThang(mk).theoCatThat)
   Cách chia:
     tổng hạn mức chi = thu nhập TB − muốn để dành − khoản khác (chi của danh mục "Không tính dự kiến", giữ nguyên)
     cần cắt = tổng chi TB của các danh mục − tổng hạn mức chi
     - Khoản cố định (catChiLaCoDinh) không bị cắt. Danh mục đã có hạn mức mà là khoản cố định thì GIỮ NGUYÊN hạn mức đó.
     - Phần cắt chia cho các danh mục còn lại theo trọng số = mức TB × độ linh hoạt. Độ linh hoạt = độ lệch chuẩn ÷ TB giữa
       các tháng (kẹp 0,1 – 1; mới có 1 tháng thì lấy 0,5): danh mục tháng cao tháng thấp (ăn ngoài, giải trí) bị cắt nhiều hơn
       danh mục đều đặn. Mỗi danh mục bị cắt tối đa 60% mức TB; phần dư không cắt được chia lại cho các danh mục còn chỗ.
     - Làm tròn nghìn.
   Áp dụng = ghi chiTieu của các danh mục (hoàn tác được). Không đụng cờ "Cố định theo Hạn mức" hay "Không tính dự kiến".
   Cần state.js, dongtien.js (forecastEligibleMonths), sotay.js (catChiLaCoDinh), bieudo.js (bdThang), vayno.js (vnSheetKhung),
   danhmuc.js load trước. Mở từ nút "Tự lập hạn mức" ở thẻ Danh mục khoản chi (tab Cài đặt).
   ==================================================================== */

var NS_TOI_DA_CAT = 0.6;     // cắt một danh mục không quá 60% mức TB
var NS_LAM_TRON = 1000;
var NS_BUOC = 10000;         // bước thanh trượt
state.ns = state.ns || { muc: null };

function nsLamTron(x){ return Math.round(x / NS_LAM_TRON) * NS_LAM_TRON; }

/* ---- dữ liệu gốc: null nếu chưa có tháng hoàn chỉnh nào; thieuThu = có tháng nhưng chưa có thu nhập ---- */
function nsDuLieu(){
  var thang = forecastEligibleMonths().slice(-3);
  if (!thang.length) return null;
  var bd = thang.map(function(mk){ return bdThang(mk); }), n = bd.length, thu = 0, chi = 0;
  bd.forEach(function(b){ thu += b.tongThuThat; chi += b.tongChiThat; });
  thu /= n; chi /= n;
  var dong = [], tongTb = 0;
  (state.data.categories.chi || []).forEach(function(c){
    if (CAT_HE_THONG.chi[c.id] || c.khongDuTru) return;
    var vals = bd.map(function(b){ return b.theoCatThat[c.id] || 0; }), tb = 0;
    vals.forEach(function(v){ tb += v; });
    tb /= n;
    if (tb <= 0) return;
    var sd = 0;
    vals.forEach(function(v){ sd += (v - tb) * (v - tb); });
    sd = Math.sqrt(sd / n);
    var flex = n < 2 ? 0.5 : Math.max(0.1, Math.min(1, sd / tb));
    var coDinh = catChiLaCoDinh(c), hmCu = num(c.chiTieu);
    var giu = (coDinh && hmCu > 0) || catHanMucTuKeHoach('chi', c.id);    // khoản cố định đã có hạn mức, hoặc hạn mức lấy từ kế hoạch: giữ nguyên
    dong.push({ id: c.id, ten: c.ten, vals: vals, tb: tb, flex: flex, coDinh: coDinh, hmCu: hmCu, giu: giu, goc: giu ? hmCu : tb });
    tongTb += tb;
  });
  return { thang: thang, n: n, thu: thu, chi: chi, hienTai: thu - chi, thieuThu: thu <= 0, dong: dong,
           khac: Math.max(0, chi - tongTb) };
}

/* ---- chia hạn mức theo số muốn để dành (hàm thuần) ---- */
function nsPhanBo(du, muc){
  var goc = 0, tranTong = 0;
  var rows = du.dong.map(function(d){
    var tran = d.coDinh ? 0 : d.goc * NS_TOI_DA_CAT;
    goc += d.goc; tranTong += tran;
    return { id: d.id, ten: d.ten, tb: d.tb, goc: d.goc, coDinh: d.coDinh, giu: d.giu, flex: d.flex, tran: tran, cat: 0, hmCu: d.hmCu };
  });
  var nganSach = du.thu - muc - du.khac;
  var canCat = Math.max(0, goc - nganSach), conLai = canCat, pass;
  for (pass = 0; pass < 10; pass++){
    var act = rows.filter(function(r){ return r.cat < r.tran - 0.5; });
    if (conLai < 0.5 || !act.length) break;
    var w = 0, da = 0;
    act.forEach(function(r){ w += r.goc * r.flex; });
    act.forEach(function(r){
      var them = Math.min(conLai * (r.goc * r.flex) / w, r.tran - r.cat);
      r.cat += them; da += them;
    });
    conLai -= da;
  }
  var tongDe = 0;
  rows.forEach(function(r){
    r.de = r.giu ? r.hmCu : nsLamTron(r.goc - r.cat);
    if (r.goc > 0 && r.de < NS_LAM_TRON) r.de = NS_LAM_TRON;
    tongDe += r.de;
  });
  return { rows: rows, goc: goc, nganSach: nganSach, canCat: canCat, thieu: conLai > 1, tongDe: tongDe,
           daDanh: du.thu - du.khac - tongDe, toiDa: du.thu - du.khac - (goc - tranTong) };
}
// số để dành lúc mở: đúng mức hiện tại (làm tròn bước), không âm
function nsMucMacDinh(du){ return Math.max(0, Math.round(du.hienTai / NS_BUOC) * NS_BUOC); }
function nsMucToiDa(du){
  var tren = Math.floor(nsPhanBo(du, 0).toiDa / NS_BUOC) * NS_BUOC;
  return Math.max(tren, nsMucMacDinh(du));
}
function nsMucHienTai(du){
  var m = state.ns.muc;
  if (m == null || !isFinite(m)) m = nsMucMacDinh(du);
  return Math.max(0, Math.min(m, nsMucToiDa(du)));
}

/* ---- giao diện ---- */
function nsDongHtml(r){
  var d = r.de - r.goc;
  var ghi = r.giu ? '<small class="ns-g">Cố định, giữ nguyên</small>' : (r.coDinh ? '<small class="ns-g">Cố định, không cắt</small>' : '');
  var dl = (!r.giu && Math.abs(r.de - r.tb) >= NS_LAM_TRON)
    ? '<small class="ns-d ' + (r.de < r.tb ? 'giam' : 'tang') + '">' + (r.de < r.tb ? '−' : '+') + fmt(Math.round(Math.abs(r.de - r.tb))) + '</small>' : '';
  return '<div class="ns-row"><span class="ns-ten"><b>' + esc(r.ten) + '</b>' + ghi + '</span>'
    + '<span class="ns-tb">TB ' + fmt(Math.round(r.tb)) + '</span>'
    + '<span class="ns-de"><b>' + fmt(r.de) + '</b>' + dl + '</span></div>';
}
function nsGiaiThich(du, muc, pb){
  var thuR = Math.round(du.thu), khacR = Math.round(du.khac), nsR = thuR - muc - khacR, gocR = Math.round(pb.goc);
  var tbThu = du.thang.map(function(mk){ return soGt(bdThang(mk).tongThuThat); }).join(' + ');
  var ds = [
    { ten: 'Thu nhập trung bình', ct: 'Thu nhập thật (không gồm vay nợ) của ' + du.n + ' tháng trọn gần nhất (' + du.thang.map(monthLabel).join(', ') + ').',
      pt: '(' + tbThu + ') ÷ ' + du.n + ' = ' + soGt(du.thu) },
    { ten: 'Tổng hạn mức chi', ct: 'Thu nhập − số muốn để dành − khoản chi không đổi' + (khacR > 0 ? ' (danh mục "Không tính dự kiến")' : '') + '.',
      pt: ptCong([thuR, -muc, -khacR], nsR) }
  ];
  if (pb.canCat > 0.5) ds.push({ ten: 'Cần cắt', ct: 'Tổng chi trung bình các danh mục − tổng hạn mức chi.', pt: ptCong([gocR, -nsR], gocR - nsR) });
  ds.push({ ten: 'Cắt ở đâu', ct: 'Khoản cố định không bị cắt. Phần cần cắt chia cho các danh mục còn lại, nhiều hơn ở danh mục tháng cao tháng thấp (linh hoạt), '
    + 'ít hơn ở danh mục đều đặn; mỗi danh mục cắt tối đa ' + Math.round(NS_TOI_DA_CAT * 100) + '%. Số liệu chỉ để tham khảo: bạn vẫn sửa tay từng hạn mức sau khi áp dụng.' });
  return giaiThichSo(ds, 'Cách tính các số này');
}
function nsKetQuaHtml(du, muc){
  var pb = nsPhanBo(du, muc), pct = du.thu > 0 ? Math.round(muc / du.thu * 100) : 0;
  var h = '<div class="ns-big"><span>Để dành mỗi tháng</span><b>' + fmt(muc) + '</b><small>' + pct + '% thu nhập trung bình ' + fmt(Math.round(du.thu)) + '</small></div>';
  if (pb.canCat < 0.5) h += '<div class="vn-tom">Mức này bạn đang làm được rồi (chi trung bình ' + fmt(Math.round(du.chi)) + '). Hạn mức đề xuất giữ đúng mức chi trung bình.</div>';
  else if (pb.thieu) h += '<div class="vn-tom ns-canh">Không đủ chỗ cắt: dù cắt hết cỡ, chi vẫn cao hơn mức này. Kéo thanh trượt về bên trái.</div>';
  else h += '<div class="vn-tom">Cần cắt <b>' + fmt(Math.round(pb.canCat)) + '</b> so với chi trung bình mỗi tháng.</div>';
  h += '<div class="ns-ds">' + pb.rows.map(nsDongHtml).join('') + '</div>'
    + '<div class="ns-tong"><span>Tổng hạn mức chi</span><b>' + fmt(pb.tongDe) + '</b></div>'
    + nsGiaiThich(du, muc, pb);
  return h;
}
function nsSheetHtml(){
  var du = nsDuLieu();
  if (!du) return vnSheetKhung('Tự lập hạn mức', '<div class="vn-sub">Chưa có tháng nào đủ dữ liệu. App cần ít nhất 1 tháng đã trọn (tháng trước tháng này) để biết bạn thường chi bao nhiêu. Ghi thêm một thời gian rồi quay lại.</div>', 'Đã hiểu', 'dmHuy', 'dmHuy');
  if (du.thieuThu) return vnSheetKhung('Tự lập hạn mức', '<div class="vn-sub">Các tháng trước chưa có khoản thu nào nên app chưa biết bạn có thể để dành bao nhiêu. Ghi khoản thu nhập rồi quay lại.</div>', 'Đã hiểu', 'dmHuy', 'dmHuy');
  if (!du.dong.length) return vnSheetKhung('Tự lập hạn mức', '<div class="vn-sub">Các tháng trước chưa có khoản chi nào để tính hạn mức.</div>', 'Đã hiểu', 'dmHuy', 'dmHuy');
  var muc = nsMucHienTai(du), max = nsMucToiDa(du);
  var h = '<div class="vn-sub">Kéo thanh trượt chọn số tiền muốn để dành mỗi tháng. App chia hạn mức cho từng danh mục chi theo thói quen thật của bạn (' + du.thang.map(monthLabel).join(', ') + ').</div>'
    + vnF('Muốn để dành mỗi tháng', '<input type="range" class="ns-range" id="ns_muc" min="0" max="' + max + '" step="' + NS_BUOC + '" value="' + muc + '" aria-label="Số tiền muốn để dành mỗi tháng">'
      + '<div class="ns-mm"><span>0</span><span>' + fmt(max) + '</span></div>')
    + '<div id="ns_kq">' + nsKetQuaHtml(du, muc) + '</div>';
  return vnSheetKhung('Tự lập hạn mức', h, 'Áp dụng hạn mức này', 'nsAp', 'dmHuy');
}
function nsCapNhat(){
  var el = document.getElementById('ns_muc'), kq = document.getElementById('ns_kq');
  if (!el || !kq) return;
  var du = nsDuLieu(); if (!du) return;
  state.ns.muc = Number(el.value) || 0;
  kq.innerHTML = nsKetQuaHtml(du, nsMucHienTai(du));
}

/* ---- áp dụng ---- */
function nsApDung(du, muc){
  var pb = nsPhanBo(du, muc), cu = [];
  pb.rows.forEach(function(r){
    if (r.giu) return;
    var c = (state.data.categories.chi || []).find(function(x){ return x.id === r.id; });
    if (!c) return;
    cu.push({ id: c.id, truoc: c.chiTieu });
    c.chiTieu = r.de;
  });
  return cu;
}
function nsHoanTac(cu){
  cu.forEach(function(x){
    var c = (state.data.categories.chi || []).find(function(y){ return y.id === x.id; });
    if (c) c.chiTieu = x.truoc;
  });
}

function handleNganSachAction(act){
  if (act === 'nsMo'){
    state.ns.muc = null; state.dmForm = { loai: 'nstl' }; renderDanhMuc(); return true;
  }
  if (act !== 'nsAp') return false;
  var f = state.dmForm; if (!f || f.loai !== 'nstl') return true;
  var du = nsDuLieu(); if (!du || du.thieuThu || !du.dong.length) return true;
  var muc = nsMucHienTai(du), pb = nsPhanBo(du, muc);
  if (pb.thieu){ toast('Mức để dành này không đủ chỗ cắt. Kéo thanh trượt về bên trái.', { loai: 'warn' }); return true; }
  var sl = pb.rows.filter(function(r){ return !r.giu; }).length;
  xacNhan('Đặt lại hạn mức?', 'Sẽ ghi lại Hạn mức/tháng của ' + sl + ' danh mục chi theo mức để dành ' + fmt(muc) + '. Bạn hoàn tác được ngay sau đó và vẫn sửa tay từng danh mục.', { chuOk: 'Áp dụng' })
    .then(function(ok){
      if (!ok) return;
      var cu = nsApDung(du, muc);
      state.dmForm = null; scheduleSave(); renderDanhMuc();
      toast('Đã đặt hạn mức cho ' + cu.length + ' danh mục.', { giay: 7, hoanTac: function(){ nsHoanTac(cu); scheduleSave(); renderDanhMuc(); toast('Đã hoàn tác hạn mức.'); } });
    });
  return true;
}
function handleNganSachInput(el){
  if (!el || el.id !== 'ns_muc') return false;
  nsCapNhat();
  return true;
}
