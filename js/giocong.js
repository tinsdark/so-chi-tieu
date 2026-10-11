"use strict";
/* ====================================================================
   giocong.js — thẻ GIỜ CÔNG ở tab Công cụ: đổi tiền ra thời gian đi làm.
   Một giờ làm = thu nhập mỗi tháng ÷ số giờ làm mỗi tháng. Thu nhập: bạn tự nhập (settings.gioCong.thuNhapThang), bỏ trống thì
   tự lấy TRUNG BÌNH thu nhập thật (không gồm vay nợ) của tối đa 3 tháng trọn gần nhất có thu (chưa có thì lấy tháng này).
   Số giờ mặc định 176 (22 ngày × 8 giờ). Thẻ có: giá 1 giờ, máy tính (nhập giá -> bao nhiêu giờ làm), và chi tiêu THẬT của tháng này
   quy ra giờ công (tổng + top danh mục). Chỉ đọc dữ liệu, chỉ có cài đặt thu nhập / số giờ là được lưu (settings.gioCong).
   Cần state.js, bieudo.js (bdThang), congcu.js, danhmuc.js (dmHead, dmMoney) load trước.
   ==================================================================== */

var GC_GIO_MAC_DINH = 176;
var GC_GIO_NGAY = 8;
state.gc = state.gc || { gia: '' };

/* ---- tính toán thuần ---- */
// thu nhập thật trung bình của tối đa 3 tháng trọn gần nhất có thu: { ds: [{mk, thu}], tb, dangDo }
function gcThuNhapTuDong(homNay){
  homNay = homNay || todayStr();
  var mk = monthKey(homNay), ds = [], i, t;
  for (i = 1; i <= 3; i++){
    var k = monthKeyAdd(mk, -i);
    t = bdThang(k).tongThuThat;
    if (t > 0) ds.push({ mk: k, thu: t });
  }
  var dangDo = false;
  if (!ds.length){
    t = bdThang(mk).tongThuThat;
    if (t > 0){ ds.push({ mk: mk, thu: t }); dangDo = true; }
  }
  var tong = 0; ds.forEach(function(x){ tong += x.thu; });
  return { ds: ds, tong: tong, tb: ds.length ? tong / ds.length : 0, dangDo: dangDo };
}
function gcCauHinh(homNay){
  var cfg = (state.data.settings || {}).gioCong || {};
  var tay = numNonNeg(cfg.thuNhapThang), cfgGio = numNonNeg(cfg.gioThang), gio = cfgGio > 0 ? cfgGio : GC_GIO_MAC_DINH;
  var td = gcThuNhapTuDong(homNay), thu = tay > 0 ? tay : td.tb;
  return { thuNhap: thu, tuDong: !(tay > 0), tay: tay, cfgGio: cfgGio, gioThang: gio, giaGio: thu > 0 ? thu / gio : 0, td: td };
}
// số giờ làm tương đương với một số tiền; null nếu chưa có thu nhập
function gcDoiGio(tien, cfg){ return cfg.giaGio > 0 ? tien / cfg.giaGio : null; }
function gcSoChu(x){ return (Math.round(x * 10) / 10).toString().replace('.', ','); }
// "25 phút", "2 giờ 30 phút", "1,5 ngày công (12 giờ)"
function gcGioChu(h){
  if (h == null) return '—';
  var phut = Math.round(h * 60);
  if (phut < 1) return 'dưới 1 phút';
  if (phut < 60) return phut + ' phút';
  if (h < GC_GIO_NGAY){ var g = Math.floor(phut / 60), p = phut % 60; return g + ' giờ' + (p ? ' ' + p + ' phút' : ''); }
  return gcSoChu(h / GC_GIO_NGAY) + ' ngày công (' + gcSoChu(h) + ' giờ)';
}
// chi tiêu THẬT của tháng mk (không gồm vay nợ) và các danh mục lớn nhất: { tong, ds: [{ten, v}] }
function gcChiThang(mk){
  var b = bdThang(mk), ds = Object.keys(b.theoCatThat).map(function(id){ return { id: id, ten: catTen('chi', id), v: b.theoCatThat[id] }; })
    .filter(function(x){ return x.v > 0; }).sort(function(a, b2){ return b2.v - a.v; });
  return { tong: b.tongChiThat, ds: ds };
}

/* ---- giao diện ---- */
function gcKetQuaChu(gia, cfg){
  var tien = numNonNeg(docSo(gia));
  if (!(tien > 0)) return 'Nhập một số tiền để xem bằng bao nhiêu thời gian đi làm.';
  var h = gcDoiGio(tien, cfg);
  return h == null ? 'Chưa có thu nhập để quy đổi.' : fmt(Math.round(tien)) + ' ≈ ' + gcGioChu(h) + ' đi làm';
}
function gcGiaiThichHtml(cfg, chi, homNay){
  var ds = [];
  if (cfg.giaGio > 0){
    var nguon = cfg.tuDong
      ? 'Thu nhập tháng lấy trung bình ' + (cfg.td.dangDo ? 'tháng này (chưa có tháng trọn nào)' : cfg.td.ds.length + ' tháng trọn gần nhất có thu') + ', không gồm vay nợ.'
      : 'Thu nhập tháng do bạn nhập.';
    if (cfg.tuDong){
      ds.push({ ten: 'Thu nhập mỗi tháng', ct: nguon,
        pt: ptCong(cfg.td.ds.map(function(x){ return x.thu; }), cfg.td.tong) + ' ÷ ' + cfg.td.ds.length + ' tháng = ' + soGt(cfg.td.tb) });
    }
    ds.push({ ten: 'Giá một giờ làm', ct: (cfg.tuDong ? '' : nguon + ' ') + 'Thu nhập mỗi tháng ÷ số giờ làm mỗi tháng' + (cfg.cfgGio > 0 ? '' : ' (mặc định 22 ngày × 8 giờ)') + '.',
      pt: soGt(cfg.thuNhap) + ' ÷ ' + cfg.gioThang + ' giờ = ' + soGt(cfg.giaGio) + '/giờ' });
    if (chi.tong > 0){
      ds.push({ ten: 'Chi tiêu tháng này theo giờ công', ct: 'Chi tiêu thật của tháng này (không gồm vay nợ) ÷ giá một giờ làm.',
        pt: soGt(chi.tong) + ' ÷ ' + soGt(cfg.giaGio) + ' = ' + gcSoChu(chi.tong / cfg.giaGio) + ' giờ' });
    }
  }
  return giaiThichSo(ds, 'Cách tính các số này');
}
function gcCardHtml(){
  var hom = todayStr(), cfg = gcCauHinh(hom), c = state.gc;
  var h = '<div class="card dm-card cc-card">' + dmHead('Giờ công')
    + '<div class="dm-sub">Đổi tiền ra thời gian bạn phải đi làm để có số tiền đó.</div>';
  if (cfg.giaGio > 0){
    h += '<div class="gc-hero"><span>1 giờ làm việc ≈</span><b>' + fmt(Math.round(cfg.giaGio)) + '</b></div>'
      + '<div class="dm-sub">' + (cfg.tuDong ? 'Thu nhập TB ' + fmt(Math.round(cfg.thuNhap)) + '/tháng (tự tính)' : 'Thu nhập ' + fmt(Math.round(cfg.thuNhap)) + '/tháng (bạn nhập)') + ' ÷ ' + cfg.gioThang + ' giờ</div>';
  } else {
    h += '<div class="empty">Chưa có thu nhập để tính. Ghi khoản thu ở Sổ tay hoặc nhập thu nhập mỗi tháng bên dưới.</div>';
  }
  h += '<div class="cc-form">'
    + vnF('Tính nhanh: nhập giá', dmMoney('gc_gia', c.gia, 'VD: 45.000'))
    + '<div class="gc-kq" id="gcKq" aria-live="polite">' + esc(gcKetQuaChu(c.gia, cfg)) + '</div></div>';
  var chi = gcChiThang(monthKey(hom));
  if (cfg.giaGio > 0 && chi.tong > 0){
    h += '<div class="dm-sub" style="margin-top:14px"><b>Tháng này bạn đã làm ' + gcGioChu(chi.tong / cfg.giaGio) + ' để trả cho chi tiêu</b></div><div class="gc-ds">'
      + chi.ds.slice(0, 5).map(function(x){
        return '<div class="cc-r"><span>' + esc(x.ten) + '</span><b>' + gcGioChu(x.v / cfg.giaGio) + '</b></div>';
      }).join('') + '</div>';
  }
  h += '<details class="gc-cfg"><summary>Thu nhập và số giờ làm</summary>'
    + vnF('Thu nhập mỗi tháng <span class="mp-hint">(bỏ trống = tự tính' + (cfg.td.tb > 0 ? ' ≈ ' + fmt(Math.round(cfg.td.tb)) : '') + ')</span>', dmMoney('gc_thu', cfg.tay))
    + vnF('Số giờ làm mỗi tháng <span class="mp-hint">(bỏ trống = ' + GC_GIO_MAC_DINH + ')</span>', '<input type="number" id="gc_gio" min="1" max="400" inputmode="numeric" value="' + (cfg.cfgGio || '') + '" placeholder="' + GC_GIO_MAC_DINH + '">')
    + '<div class="cc-btns"><button type="button" class="btn secondary sm" data-act="gcLuu">Lưu</button></div></details>';
  return h + gcGiaiThichHtml(cfg, chi, hom) + '</div>';
}

/* ---- sự kiện ---- */
function handleGioCongInput(el){
  if (!el || el.id !== 'gc_gia') return false;
  state.gc.gia = el.value;
  var kq = document.getElementById('gcKq');
  if (kq) kq.textContent = gcKetQuaChu(el.value, gcCauHinh(todayStr()));
  return false;
}
function handleGioCongAction(act){
  if (act !== 'gcLuu') return false;
  var thu = numNonNeg(docSo((document.getElementById('gc_thu') || {}).value));
  var gio = Math.round(numNonNeg((document.getElementById('gc_gio') || {}).value));
  if (gio > 400){ toast('Số giờ làm mỗi tháng tối đa 400.', { loai: 'warn' }); return true; }
  state.data.settings.gioCong = { thuNhapThang: thu, gioThang: gio };
  scheduleSave(); renderCongCu();
  toast('Đã lưu cài đặt giờ công.');
  return true;
}
