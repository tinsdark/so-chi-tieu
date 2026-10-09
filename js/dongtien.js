"use strict";
/* ====================================================================
   dongtien.js — tab "Dòng tiền" (chế độ "Thực tế & dự kiến"): thẻ cân đối của 1 tháng,
   thu / chi theo từng danh mục, dự kiến 24 tháng tới; bảng cả năm cũ nằm sau nút "Xem bảng cả năm".
   Cần state.js, vayno.js (tongTraNoThang, tongThuHoiThang) load trước.
   ==================================================================== */

/* ====================================================================
   DỰ TRÙ = TB CÁC THÁNG ĐÃ HOÀN CHỈNH
   Chỉ lấy tháng ĐÃ KẾT THÚC và từ settings.thangBatDauDuTru trở đi:
   - tháng đang chạy chưa đủ số liệu -> lấy vào là kéo TB xuống sai
   - tháng lẻ đầu tiên (bắt đầu dùng app từ giữa tháng) cũng không phản ánh cả tháng
   Cửa sổ trượt tối đa 3 tháng hoàn chỉnh gần nhất. Chưa có tháng nào -> null
   để nơi gọi fallback về Chỉ tiêu/tháng ở tab Danh mục.
   Ví dụ (bắt đầu dự trù T10/2026): dự trù T11 = thực tế T10; T12 = TB(T10,T11);
   T1/2027 = TB(T10,T11,T12); T2/2027 = TB(T11,T12,T1).
   Tháng không phát sinh TÍNH LÀ 0 vào TB — mua 1 lần rồi thôi thì gợi ý phải
   giảm dần, không được giữ mãi mức của tháng duy nhất có mua.
   ==================================================================== */
function forecastEligibleMonths(){
  var startMk = state.data.settings.thangBatDauDuTru
    || monthKey(state.data.settings.ngayBatDau || todayStr());
  var curMk = monthKey(todayStr());
  var out = [], mk = startMk, guard = 0;
  while (mk < curMk && guard++ < 600){ out.push(mk); mk = monthKeyAdd(mk, 1); }
  return out;
}
function recentAvgActual(kind, catId, n){
  var months = forecastEligibleMonths();
  if (!months.length) return null;
  var win = months.slice(-n);
  var sum = 0;
  win.forEach(function(mk){ sum += actualCatInMonth(kind, catId, mk); });
  return sum / win.length;
}

// tab Dòng tiền có 2 chế độ: số liệu thật (+ dự kiến) và vùng nháp Mô phỏng (mophong.js) — gộp chung 1 tab
// để thanh tab dưới chỉ còn 5 mục. state.dtMoPhong quyết định vẽ cái nào (app.js renderAll).
function dtCheDoHtml(){
  var mp = !!state.dtMoPhong;
  return '<div class="dt-mode" role="tablist" aria-label="Chế độ xem dòng tiền">'
    + '<button type="button" role="tab" data-act="dtCheDo" data-v="tt" class="'+(mp ? '' : 'on')+'" aria-selected="'+!mp+'">Thực tế &amp; dự kiến</button>'
    + '<button type="button" role="tab" data-act="dtCheDo" data-v="mp" class="'+(mp ? 'on' : '')+'" aria-selected="'+mp+'">'+icon('sliders')+' Mô phỏng</button>'
    + '</div>';
}


var DONGTIEN_GROUPS = [ { kind:'thu', title:'Thu nhập' }, { kind:'chi', title:'Chi' } ];

/* Màu ở tab này: THU = xanh, CHI = đỏ (trầm). Vượt hạn mức = đỏ đậm + vằn + chip "Vượt X";
   thu thiếu so với kế hoạch = hổ phách. Chữ phần trăm để màu trung tính — không dùng màu để "chấm điểm". */

/* ---- số liệu 1 danh mục / 1 tháng (dùng chung màn mới và bảng cả năm) ---- */
function dtBase(kind, cid){
  var cat = state.data.categories[kind].find(function(c){ return c.id === cid; });
  return cat ? num(cat.chiTieu) : 0;
}
// gợi ý: riêng "Trả nợ"/"Thu hồi cho vay" lấy thẳng từ lịch Vay-Nợ; danh mục "Không dự trù" (khongDuTru) thì để trống;
// danh mục "Cố định theo hạn mức" lấy đúng hạn mức; còn lại TB thực tế tối đa 3 tháng hoàn chỉnh gần nhất (chưa có thì hạn mức)
function dtSuggest(kind, cid, mk){
  var cat0 = state.data.categories[kind].find(function(c){ return c.id === cid; });
  if (cat0 && cat0.khongDuTru) return null;
  if (kind === 'chi' && cid === 'traNo') return tongTraNoThang(mk) || null;
  if (kind === 'thu' && cid === 'thuHoiChoVay') return tongThuHoiThang(mk) || null;
  if (cat0 && cat0.coDinhChiTieu){
    var bF = dtBase(kind, cid);
    return bF > 0 ? bF : null;
  }
  var avg = recentAvgActual(kind, cid, 3);
  if (avg != null) return avg;
  var b = dtBase(kind, cid);
  return b > 0 ? b : null;
}
// ô hiển thị: tháng đã qua / đang chạy -> thực tế (tháng đang chạy cộng khoản biết trước chưa ghi), tương lai -> gợi ý
function dtCell(kind, cid, mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return dtSuggest(kind, cid, mk);
  var av = actualCatInMonth(kind, cid, mk);
  if (mk === currentMk){
    if ((kind === 'chi' && cid === 'traNo') || (kind === 'thu' && cid === 'thuHoiChoVay')) return av + bietTruocChuaGhi(kind, cid, mk);
    var dkChua = dinhKyChuaGhiThang(mk, kind, cid);
    if (dkChua > 0) return av + dkChua;
    if (!av){
      var cat0 = state.data.categories[kind].find(function(c){ return c.id === cid; });
      if (cat0 && cat0.coDinhChiTieu){
        var bF = dtBase(kind, cid);
        if (bF > 0) return bF;
      }
    }
  }
  return av;
}
function dtNgay(d){ return d ? d.slice(8, 10) + '/' + d.slice(5, 7) : ''; }
function dtNhanThang(mk){ return 'T' + parseInt(mk.slice(5, 7), 10) + '/' + mk.slice(2, 4); }
// các kỳ trả nợ còn phải trả rơi vào tháng mk (kỳ quá hạn dồn vào tháng hiện tại, giống tongTraNoThang)
function dtTraNoKy(mk){
  var cur = monthKey(todayStr()), r = { n: 0, gan: null, cuoi: null };
  (state.data.vayNo.vayNoPhaiTra || []).forEach(function(loan){
    if (!loanIsActive(loan)) return;
    var sch = tinhLichTraNo(loan);
    sch.forEach(function(row, idx){
      if (kyDaDong(loan, idx)) return;
      if ((row.mk < cur ? cur : row.mk) !== mk) return;
      if (conThieuKy(loan, idx, sch) <= 0) return;
      r.n++;
      if (!r.gan || row.ngayTra < r.gan) r.gan = row.ngayTra;
      if (!r.cuoi || row.ngayTra > r.cuoi) r.cuoi = row.ngayTra;
    });
  });
  return r;
}

/* ---- dữ liệu cả 1 tháng cho màn Dòng tiền ----
   act = thực tế (tháng tương lai: số gợi ý) · plan = kế hoạch (thu) / hạn mức (chi) · proj = dự kiến cả tháng.
   "Trả nợ" tách riêng ra d.traNo (có thanh riêng ở thẻ đầu), không nằm trong d.chi. */
function dtThangDuLieu(mk){
  var cur = monthKey(todayStr()), tuong = mk > cur, qua = mk < cur, nhip = bcNhip(mk);
  var d = { mk: mk, tuong: tuong, qua: qua, nay: mk === cur, nhip: nhip, thu: [], chi: [], traNo: null };
  ['thu', 'chi'].forEach(function(kind){
    state.data.categories[kind].forEach(function(c){
      var base = c.khongDuTru ? 0 : num(c.chiTieu);
      var lich = (kind === 'chi' && c.id === 'traNo') || (kind === 'thu' && c.id === 'thuHoiChoVay');
      var act = tuong ? num(dtSuggest(kind, c.id, mk)) : actualCatInMonth(kind, c.id, mk);
      var plan = base;
      if (lich) plan = tuong ? (kind === 'chi' ? tongTraNoThang(mk) : tongThuHoiThang(mk)) : (qua ? act : num(dtCell(kind, c.id, mk)));
      var proj = act;
      if (!tuong && !qua){
        if (lich) proj = plan;
        else if (c.coDinhChiTieu) proj = Math.max(act, base);
        else proj = nhip.tyLe >= 0.2 ? act / nhip.tyLe : Math.max(act, base);
      }
      var r = { kind: kind, id: c.id, ten: c.ten, act: act, plan: plan, proj: proj, base: base, lich: lich };
      if (kind === 'chi' && c.id === 'traNo') d.traNo = r; else d[kind].push(r);
    });
  });
  var tong = function(arr, f){ var s = 0; arr.forEach(function(r){ s += r[f]; }); return s; };
  d.thuAct = tong(d.thu, 'act'); d.thuPlan = tong(d.thu, 'plan');
  d.chiAct = tong(d.chi, 'act'); d.chiPlan = tong(d.chi, 'plan');
  d.cb = tongThuThangCard(mk) - tongChiThangCard(mk);
  d.tn = dtTraNoKy(mk);
  return d;
}
// cân đối + số dư lũy kế từng tháng, bắt đầu từ tháng hiện tại
function dtDuKienRows(n){
  var cur = monthKey(todayStr()), run = balanceBeforeMonth(cur), out = [];
  for (var i = 0; i < n; i++){
    var mk = monthKeyAdd(cur, i), cb = tongThuThangCard(mk) - tongChiThangCard(mk);
    run += cb;
    out.push({ mk: mk, cb: cb, bal: run });
  }
  return out;
}
var DT_SO_THANG = 24;
function dtLuyKe(mk, rows){
  if (mk < monthKey(todayStr())) return balanceAtEndOfMonth(mk);
  for (var i = 0; i < rows.length; i++) if (rows[i].mk === mk) return rows[i].bal;
  return null;
}

/* ---- thẻ đầu ---- */
function dtThangNavHtml(mk, startMk, maxMk){
  var o = '', m = startMk, g = 0;
  while (m <= maxMk && g++ < 600){ o += '<option value="'+m+'"'+(m === mk ? ' selected' : '')+'>'+monthLabel(m)+'</option>'; m = monthKeyAdd(m, 1); }
  return '<div class="month-nav">'
    + '<button data-act="dtPrev" aria-label="Tháng trước"'+(mk <= startMk ? ' disabled' : '')+'>‹</button>'
    + '<select data-act="dtJump" aria-label="Chọn tháng">'+o+'</select>'
    + '<button data-act="dtNext" aria-label="Tháng sau"'+(mk >= maxMk ? ' disabled' : '')+'>›</button></div>';
}
// 1 thanh: nhãn trái + "đã / kế hoạch" phải, thanh, dòng phụ + phần trăm
function dtThanhHtml(o){
  var pct = o.plan > 0 ? o.act / o.plan : 0, rong = Math.min(100, Math.round(pct * 100));
  var h = '<div class="dt-b"><div class="dt-b-h"><span>'+o.ten+'</span><span><b>'+fmt(o.act)+'</b>'
    + (o.plan > 0 ? ' / '+fmt(o.plan)+' '+o.nhanPlan : '') + '</span></div>';
  h += '<div class="dt-track '+o.kind+(pct > 1 && o.kind === 'chi' ? ' over' : '')+'" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rong+'" aria-label="'+o.ten+'">'
    + '<i style="width:'+rong+'%"></i>'
    + (o.tick != null ? '<b class="tk" style="left:'+Math.round(o.tick * 1000) / 10+'%"></b>' : '') + '</div>';
  h += '<div class="dt-b-f"><span>'+o.phu+'</span>'+(o.plan > 0 ? '<span>'+Math.round(pct * 100)+'%</span>' : '')+'</div></div>';
  return h;
}
// câu giải thích theo luật (không đoán): nhịp chi, vì sao âm / dư
function dtGiaiThichHtml(d){
  var cau = [], am = d.cb < 0;
  if (d.tuong){
    cau.push('Tháng chưa tới: số liệu là gợi ý theo hạn mức, lịch trả nợ và trung bình các tháng đã hoàn chỉnh.');
  } else if (d.qua){
    cau.push('Tháng đã qua: thu '+fmt(d.thuAct)+', chi '+fmt(d.chiAct + (d.traNo ? d.traNo.act : 0))+'.');
  } else if (d.chiPlan > 0){
    var p = d.chiAct / d.chiPlan, t = d.nhip.tyLe, vs = p < t - 0.05 ? 'dưới nhịp' : (p > t + 0.05 ? 'vượt nhịp' : 'đúng nhịp');
    cau.push('Chi đang '+vs+' ('+Math.round(p * 100)+'% hạn mức sau '+Math.round(t * 100)+'% số ngày).');
  }
  var conNo = d.traNo ? Math.max(0, d.traNo.plan - d.traNo.act) : 0;
  if (am && conNo > 0 && !d.qua){
    cau.push('Tháng '+(d.tuong ? 'dự kiến' : 'vẫn')+' âm vì '+fmt(conNo)+' trả nợ '+(d.tn.cuoi && d.tn.cuoi >= todayStr() ? 'đến hạn trước '+dtNgay(d.tn.cuoi) : 'đã đến hạn')+'.');
  } else if (am && !d.qua){
    cau.push('Tháng '+(d.tuong ? 'dự kiến' : 'đang')+' âm '+fmt(-d.cb)+': chi cao hơn thu.');
  } else if (!am && !d.qua){
    cau.push('Tháng '+(d.tuong ? 'dự kiến' : 'đang')+' dư '+fmt(d.cb)+'.');
  }
  return '<div class="dt-gt '+(am ? 'am' : 'du')+'">'+cau.join(' ')+'</div>';
}
function dtDauHtml(d, bal, startMk, maxMk){
  var cb = Math.round(d.cb), mk = d.mk, tn = d.traNo;
  var h = '<div class="card hero bc-hero dt-hero" id="dtDau"><div class="hero-top"><div class="hero-lbl">Cân đối '+(d.nay ? 'tháng này' : monthLabel(mk).toLowerCase())+(d.tuong ? ' (dự kiến)' : '')+'</div>'
    + dtThangNavHtml(mk, startMk, maxMk) + '</div>'
    + '<div class="bc-val"><span class="bc-v dt-cb '+(cb < 0 ? 'am' : 'du')+'">'+fmt(cb)+'</span>'
    + (cb !== 0 ? '<span class="dt-tag '+(cb < 0 ? 'am' : 'du')+'">'+(cb < 0 ? 'Thiếu' : 'Dư')+'</span>' : '') + '</div>'
    + '<div class="bc-pace-n dt-sub">'+(d.tuong ? 'dự kiến' : (d.qua ? 'cả tháng' : 'dự kiến cuối tháng'))+(bal != null ? ' · số dư lũy kế '+fmt(Math.round(bal)) : '')+'</div>';
  var nhanThu = d.tuong ? 'gợi ý' : 'kế hoạch';
  h += dtThanhHtml({ kind:'thu', ten:'Thu', act:d.thuAct, plan:d.thuPlan, nhanPlan:nhanThu,
    phu: d.thuPlan > 0 ? (d.thuAct >= d.thuPlan ? 'Vượt kế hoạch '+fmt(d.thuAct - d.thuPlan) : 'Còn thiếu '+fmt(d.thuPlan - d.thuAct)+' so với kế hoạch') : 'Chưa đặt kế hoạch thu' });
  h += dtThanhHtml({ kind:'chi', ten:'Chi', act:d.chiAct, plan:d.chiPlan, nhanPlan:'hạn mức', tick: d.nay ? d.nhip.tyLe : null,
    phu: d.nay ? 'Đã qua '+d.nhip.ngayQua+'/'+d.nhip.soNgay+' ngày' : (d.tuong ? 'Gợi ý cả tháng' : 'Cả tháng') });
  if (tn && (tn.plan > 0 || tn.act > 0)){
    h += dtThanhHtml({ kind:'no', ten:'Trả nợ', act:tn.act, plan:tn.plan, nhanPlan:'',
      phu: d.tn.n ? 'Đến hạn '+d.tn.n+' khoản · gần nhất '+dtNgay(d.tn.gan) : 'Theo lịch Vay - Nợ' });
  }
  return h + dtGiaiThichHtml(d) + '</div>';
}

/* ---- thu nhập / chi theo danh mục ---- */
function dtThuCardHtml(d){
  var rows = d.thu.filter(function(r){ return r.act > 0 || r.plan > 0; });
  var trong = d.thu.filter(function(r){ return !(r.act > 0 || r.plan > 0); });
  var h = '<div class="card bc-card" id="dtThu"><h3 class="bc-h"><span>Thu nhập '+(d.nay || d.qua ? 'tháng '+parseInt(d.mk.slice(5, 7), 10) : monthLabel(d.mk).toLowerCase())+'</span><span class="bc-h-s">'+fmt(d.thuAct)+'</span></h3>';
  if (!rows.length) h += '<div class="empty" style="padding:6px 0;text-align:left">'+(d.tuong ? 'Chưa có gợi ý cho khoản thu nào.' : 'Chưa có khoản thu nào trong tháng.')+'</div>';
  rows.forEach(function(r){
    var pct = r.plan > 0 ? r.act / r.plan : 0, rong = Math.min(100, Math.round(pct * 100)), phu;
    if (d.tuong) phu = 'gợi ý';
    else if (r.plan <= 0) phu = 'ngoài kế hoạch';
    else if (pct >= 1) phu = pct > 1 ? 'vượt kế hoạch '+fmt(r.act - r.plan) : 'đã nhận đủ';
    else phu = 'còn '+fmt(r.plan - r.act)+' nữa';
    h += '<div class="dt-r"><div class="dt-r1"><span class="dt-n">'+catDot('thu', r.id)+esc(r.ten)+(r.lich ? ' <span class="dt-lich" title="Theo lịch Vay - Nợ">'+icon('calendar')+'</span>' : '')+'</span><span class="dt-a thu">'+fmt(r.act)+'</span></div>'
      + (r.plan > 0 && !d.tuong ? '<div class="dt-r2"><div class="dt-track thu sm"><i style="width:'+rong+'%"></i></div><span class="dt-p">'+Math.round(pct * 100)+'%</span></div>' : '')
      + '<div class="dt-s">'+phu+'</div></div>';
  });
  if (trong.length) h += '<div class="dt-ghichu">'+(d.tuong ? 'Chưa có gợi ý: ' : 'Chưa phát sinh: ')+trong.map(function(r){ return esc(r.ten); }).join(', ')+'</div>';
  return h + '</div>';
}
// mức của 1 dòng chi: over (vượt) / warn (từ 80% hoặc theo nhịp sẽ vượt) / ok
function dtChiMuc(r, d){
  if (r.plan <= 0) return 'khong';
  var pct = r.act / r.plan;
  if (pct > 1) return 'over';
  if (pct >= 0.8) return 'warn';
  if (!d.tuong && !d.qua && d.nhip.ngayQua >= 3 && r.proj > r.plan) return 'warn';
  return 'ok';
}
function dtChiRowHtml(r, d){
  var muc = dtChiMuc(r, d), pct = r.plan > 0 ? r.act / r.plan : 0, rong = Math.min(100, Math.round(pct * 100));
  var mo = state.dtMoDong === r.id, phu;
  if (muc === 'khong') phu = d.tuong ? 'gợi ý' : 'chưa đặt hạn mức';
  else if (muc === 'over') phu = '<span class="dt-vuot">Vượt '+fmt(r.act - r.plan)+'</span>';
  else phu = (d.tuong ? 'gợi ý · ' : '')+'còn '+fmt(r.plan - r.act);
  var h = '<div class="dt-r chi '+muc+(mo ? ' mo' : '')+'" data-act="dtMoDong" data-id="'+esc(r.id)+'" role="button" tabindex="0" aria-expanded="'+mo+'">'
    + '<div class="dt-r1"><span class="dt-n">'+catDot('chi', r.id)+esc(r.ten)+'</span><span class="dt-a chi">'+fmt(r.act)+'</span></div>';
  if (r.plan > 0) h += '<div class="dt-r2"><div class="dt-track chi sm'+(muc === 'over' ? ' over' : '')+'"><i style="width:'+rong+'%"></i></div><span class="dt-p">'+Math.round(pct * 100)+'%</span></div>';
  h += '<div class="dt-s">'+phu+'</div>';
  if (mo){
    var chenh = r.proj - r.plan, nextMk = monthKeyAdd(d.mk, 1), gy = dtSuggest('chi', r.id, nextMk);
    h += '<div class="dt-ct">'
      + '<div><small>Hạn mức/tháng</small><b>'+(r.plan > 0 ? fmt(r.plan) : '—')+'</b></div>'
      + '<div><small>'+(d.nay ? 'Nhịp hiện tại → cả tháng' : (d.tuong ? 'Gợi ý cả tháng' : 'Thực tế cả tháng'))+'</small><b>'+fmt(r.proj)+'</b></div>'
      + '<div><small>Chênh lệch dự kiến</small><b class="'+(r.plan > 0 && chenh > 0 ? 'xau' : '')+'">'+(r.plan > 0 ? (chenh > 0 ? '+' : '')+fmt(chenh) : '—')+'</b></div>'
      + '<div><small>Gợi ý tháng '+parseInt(nextMk.slice(5, 7), 10)+'</small><b>'+(gy != null ? fmt(gy) : '—')+'</b></div>'
      + '</div>';
  }
  return h + '</div>';
}
function dtChiCardHtml(d){
  var co = d.chi.filter(function(r){ return r.act > 0 || r.plan > 0; });
  var trong = d.chi.filter(function(r){ return !(r.act > 0 || r.plan > 0); });
  var chuY = [], on = [];
  co.forEach(function(r){ var m = dtChiMuc(r, d); (m === 'over' || m === 'warn' ? chuY : on).push(r); });
  var pc = function(r){ return r.plan > 0 ? r.act / r.plan : 0; };
  chuY.sort(function(a, b){ return pc(b) - pc(a); });
  on.sort(function(a, b){ return pc(b) - pc(a) || b.act - a.act; });
  var h = '<div class="card bc-card" id="dtChi"><h3 class="bc-h"><span>Chi theo hạn mức</span><span class="bc-h-s">'+fmt(d.chiAct)+(d.chiPlan > 0 ? ' / '+fmt(d.chiPlan) : '')+'</span></h3>';
  if (!co.length) h += '<div class="empty" style="padding:6px 0;text-align:left">'+(d.tuong ? 'Chưa có gợi ý cho khoản chi nào.' : 'Chưa có khoản chi nào trong tháng.')+'</div>';
  if (chuY.length){
    h += '<div class="dt-sec chuy"><i></i>Cần chú ý · '+chuY.length+'</div>' + chuY.map(function(r){ return dtChiRowHtml(r, d); }).join('');
  }
  if (on.length){
    var hienHet = !!state.dtChiHet, gioiHan = 3, ds = hienHet ? on : on.slice(0, gioiHan);
    h += '<div class="dt-sec on"><i></i>Ổn · '+on.length+'</div>' + ds.map(function(r){ return dtChiRowHtml(r, d); }).join('');
    if (on.length > gioiHan) h += '<button type="button" class="dt-more" data-act="dtChiHet">'+(hienHet ? 'Thu gọn' : 'Xem thêm '+(on.length - gioiHan))+'</button>';
  }
  if (trong.length) h += '<div class="dt-ghichu">'+(d.tuong ? 'Chưa có gợi ý: ' : 'Chưa phát sinh: ')+trong.map(function(r){ return esc(r.ten); }).join(', ')+'</div>';
  return h + '</div>';
}

/* ---- dự kiến các tháng tới ---- */
function dtDuKienHtml(rows, selMk){
  var n = rows.length, cur = rows[0].mk;
  var iAm = -1, iDay = 0, i;
  for (i = 0; i < n; i++){ if (iAm < 0 && rows[i].bal < 0) iAm = i; if (rows[i].bal < rows[iDay].bal) iDay = i; }
  var iDuong = -1;
  if (iAm >= 0){ for (i = iAm + 1; i < n; i++){ if (rows[i].bal >= 0){ iDuong = i; break; } } }
  var o = function(l, big, sub, cls){ return '<div class="dt-ti '+(cls || '')+'"><small>'+l+'</small><b>'+big+'</b><span>'+sub+'</span></div>'; };
  var tiles = '<div class="dt-tiles">';
  if (iAm < 0){
    tiles += o('Số dư', 'Không âm', 'trong '+n+' tháng tới', 'tot')
      + o('Thấp nhất', dtNhanThang(rows[iDay].mk), fmt(Math.round(rows[iDay].bal)))
      + o('Cuối kỳ', dtNhanThang(rows[n - 1].mk), fmt(Math.round(rows[n - 1].bal)));
  } else {
    tiles += o('Âm từ', dtNhanThang(rows[iAm].mk), iAm === 0 ? 'tháng này' : 'sau '+iAm+' tháng', 'xau')
      + o('Đáy', dtNhanThang(rows[iDay].mk), fmt(Math.round(rows[iDay].bal)), 'xau')
      + (iDuong >= 0 ? o('Dương lại', dtNhanThang(rows[iDuong].mk), 'sau '+iDuong+' tháng', 'tot') : o('Dương lại', 'Chưa', 'trong '+n+' tháng', 'xau'));
  }
  tiles += '</div>';
  var chart = '<div class="bd-box">' + bdLine({ W: 350, H: 190, labels: rows.map(function(r){ return dtNhanThang(r.mk); }),
    series: [{ ten: 'Số dư', vals: rows.map(function(r){ return Math.round(r.bal); }), cls: 'chi', fill: true }],
    sel: Math.max(0, rows.map(function(r){ return r.mk; }).indexOf(selMk)),
    tipTitle: function(k){ return monthLabel(rows[k].mk); }, money: function(v){ return fmt(v); }, aria: 'Số dư lũy kế các tháng tới' }) + '</div>';
  var hien = state.dtDuKienHet ? rows : rows.slice(0, 6);
  var list = '<div class="dt-ml"><div class="dt-ml-h"><span>Tháng</span><span>Cân đối</span><span>Lũy kế</span></div>';
  hien.forEach(function(r){
    list += '<div class="dt-ml-r'+(r.mk === selMk ? ' sel' : '')+'" data-act="dtChonThang" data-mk="'+r.mk+'" role="button" tabindex="0">'
      + '<span class="m">'+dtNhanThang(r.mk)+(r.mk > cur ? '*' : '')+'</span>'
      + '<span class="c '+(r.cb < 0 ? 'xau' : 'tot')+'">'+Math.round(r.cb).toLocaleString('vi-VN')+'</span>'
      + '<span class="l'+(r.bal < 0 ? ' xau' : '')+'">'+Math.round(r.bal).toLocaleString('vi-VN')+'</span></div>';
  });
  list += '</div>';
  var fcM = forecastEligibleMonths(), startMk = (state.data.settings.ngayBatDau || todayStr()).slice(0, 7);
  return '<div class="card bc-card" id="dtDuKien"><h3 class="bc-h"><span>Dự kiến các tháng tới</span><span class="bc-h-s">'+n+' tháng</span></h3>'
    + tiles + chart + list
    + '<div class="dt-foot"><span>* gợi ý theo hạn mức và lịch trả nợ · số dư tính bằng ₫</span>'
    + '<button type="button" class="dt-more in" data-act="dtDuKienHet">'+(state.dtDuKienHet ? 'Thu gọn' : 'Xem cả '+n+' tháng')+'</button></div>'
    + ghiChuGon('Tháng chưa tới: số liệu là gợi ý — TB của tối đa 3 tháng ĐÃ HOÀN CHỈNH gần nhất tính từ '
      + monthLabel(state.data.settings.thangBatDauDuTru || startMk) + ' ('
      + (fcM.length ? 'đang dùng: ' + fcM.slice(-3).map(monthLabel).join(', ') : 'chưa có tháng nào hoàn chỉnh → dùng hạn mức ở tab Danh mục')
      + '). Tháng không phát sinh được tính là 0 vào TB. Các khoản biết trước — "Trả nợ"/"Thu hồi cho vay" (lấy từ lịch vay) hoặc danh mục có cờ "Cố định theo hạn mức" — hiện số biết trước luôn kể cả tháng hiện tại nếu chưa ghi Sổ tay. Số dư lũy kế từ tháng hiện tại trở đi đã cộng cả số dự báo.', 'Số gợi ý tính thế nào?')
    + '</div>';
}

/* ---- bảng cả năm (bản cũ, sau nút "Xem bảng cả năm") ---- */
function dtBangNamHtml(){
  var year = state.dongTienYear;
  var startMk = (state.data.settings.ngayBatDau || todayStr()).slice(0, 7);
  var currentMk = monthKey(todayStr());
  var months = [];
  for (var m = 1; m <= 12; m++){
    var mk0 = year + '-' + pad2(m);
    if (mk0 >= startMk) months.push(mk0);
  }
  var nav = '<div class="year-nav">'
    + '<button data-act="prevYear" class="icon-btn" title="Năm trước" aria-label="Năm trước">‹</button>'
    + '<div class="lbl">'+year+'</div>'
    + '<button data-act="nextYear" class="icon-btn" title="Năm sau" aria-label="Năm sau">›</button>'
    + '</div>';
  if (!months.length){
    return nav + '<div class="card"><div class="empty">Năm '+year+' không có tháng nào từ mốc chốt số dư ('+startMk+'). Bấm › để xem năm khác.</div></div>';
  }
  var groupCell = function(kind, mk){
    var s = 0;
    state.data.categories[kind].forEach(function(c){ s += (dtCell(kind, c.id, mk) || 0); });
    return s;
  };
  // Điện thoại: bảng 12 cột tràn ngang -> mỗi lần xem MỘT tháng (chọn bằng hàng nút tháng)
  var laDienThoai = !!(window.matchMedia && window.matchMedia('(max-width:700px)').matches);
  var vm = months, chipThang = '';
  if (laDienThoai){
    var chon = (months.indexOf(state.dtThang) >= 0) ? state.dtThang : (months.indexOf(currentMk) >= 0 ? currentMk : months[0]);
    vm = [chon];
    chipThang = '<div class="dt-chips" role="group" aria-label="Chọn tháng">'
      + months.map(function(mk){
          return '<button type="button" class="dt-chip'+(mk === chon ? ' on' : '')+'" data-act="dtThang" data-mk="'+mk+'" aria-pressed="'+(mk === chon)+'">T'+parseInt(mk.slice(5,7),10)+(mk > currentMk ? '*' : '')+'</button>';
        }).join('') + '</div>';
  }
  var html = nav + chipThang;
  html += '<div class="card"><div class="table-wrap table-wrap-year"><table><thead><tr><th class="sticky-col" style="min-width:170px">Khoản mục</th>';
  vm.forEach(function(mk){ html += '<th class="dt-input th-month">Tháng '+parseInt(mk.slice(5,7),10)+(mk>currentMk?' *':'')+'</th>'; });
  html += '</tr></thead><tbody>';
  DONGTIEN_GROUPS.forEach(function(g){
    var cats = state.data.categories[g.kind];
    html += '<tr><td colspan="'+(vm.length+1)+'" class="group-title">'+g.title+'</td></tr>';
    if (!cats.length) html += '<tr><td colspan="'+(vm.length+1)+'" class="empty">Chưa có danh mục — thêm ở tab "Danh mục".</td></tr>';
    cats.forEach(function(c){
      var base = dtBase(g.kind, c.id);
      var tagHtml = base>0 ? ' <span class="cat-tag" title="Hạn mức/tháng">'+fmt(base)+'</span>' : '';
      html += '<tr><td class="sticky-col"><span class="cat-label">'+esc(c.ten)+tagHtml+'</span></td>';
      vm.forEach(function(mk){
        var future = mk > currentMk;
        var val = dtCell(g.kind, c.id, mk);
        var showNum = future ? (val != null) : (!!val);
        var text = showNum ? fmt(Math.round(val)) : (future ? '—' : '');
        var style = '';
        if (showNum && base > 0){
          var bad = g.kind === 'chi' ? (val > base) : (val < base);
          style = ' style="color:'+(bad ? 'var(--red)' : 'var(--green)')+'"';
        }
        html += '<td class="dt-input'+(future ? ' dt-suggest' : '')+'"'+style+'>'+text+'</td>';
      });
      html += '</tr>';
    });
    html += '<tr class="total-row"><td class="sticky-col">Tổng '+g.title.toLowerCase()+'</td>';
    vm.forEach(function(mk){ html += '<td>'+fmt(groupCell(g.kind,mk))+'</td>'; });
    html += '</tr>';
  });
  html += '<tr class="balance-row"><td class="sticky-col">Cân đối tháng</td>';
  vm.forEach(function(mk){ html += '<td>'+fmt(groupCell('thu',mk) - groupCell('chi',mk))+'</td>'; });
  html += '</tr>';
  // Lũy kế: tháng đã qua = số dư thực; từ tháng hiện tại trở đi CỘNG DỒN dự báo
  var luyKe = {}, lastMk = vm[vm.length-1];
  if (lastMk >= currentMk){
    var run = balanceBeforeMonth(currentMk), mc = currentMk, guard2 = 0;
    while (mc <= lastMk && guard2++ < 600){
      run += tongThuThangCard(mc) - tongChiThangCard(mc);
      luyKe[mc] = run;
      mc = monthKeyAdd(mc, 1);
    }
  }
  html += '<tr class="balance-row"><td class="sticky-col">Lũy kế số dư</td>';
  vm.forEach(function(mk){
    html += (mk < startMk) ? '<td>—</td>' : '<td>'+fmt(luyKe[mk] != null ? luyKe[mk] : balanceAtEndOfMonth(mk))+'</td>';
  });
  html += '</tr></tbody></table></div></div>';
  return html;
}

function renderDongTien(){
  var root = document.getElementById('tabContent');
  var startMk = (state.data.settings.ngayBatDau || todayStr()).slice(0, 7);
  var cur = monthKey(todayStr());
  var minMk = startMk, maxMk = monthKeyAdd(cur, DT_SO_THANG - 1);
  if (maxMk < minMk) maxMk = minMk;
  var mk = state.dtMk || cur;
  if (mk < minMk) mk = minMk;
  if (mk > maxMk) mk = maxMk;
  state.dtMk = mk;
  var d = dtThangDuLieu(mk);
  var rows = dtDuKienRows(Math.max(DT_SO_THANG, 1));
  var html = dtCheDoHtml() + '<div class="cot2"><div class="cot-trai">'
    + dtDauHtml(d, dtLuyKe(mk, rows), minMk, maxMk) + dtThuCardHtml(d) + dtChiCardHtml(d)
    + '</div><div class="cot-phai">' + dtDuKienHtml(rows, mk)
    + '<button type="button" class="btn secondary dt-bangnam" data-act="dtBangNam" aria-expanded="'+!!state.dtBangNam+'">'
    + (state.dtBangNam ? 'Ẩn bảng cả năm' : 'Xem bảng cả năm') + '</button></div></div>';
  if (state.dtBangNam){
    if (!state.dongTienYear) state.dongTienYear = parseInt(mk.slice(0, 4), 10);
    html += dtBangNamHtml();
  }
  root.innerHTML = html;
  if (typeof mpSheetVe === 'function') mpSheetVe();     // chuyển từ Mô phỏng sang đây thì đóng bảng thêm điều chỉnh
}

/* ---- Dòng tiền: handlers ---- */
function dtDatThang(mk){ state.dtMk = mk; renderDongTien(); }
function handleDongTienAction(act, el){
  if (act === 'prevYear' || act === 'nextYear'){
    state.dongTienYear += (act==='nextYear'?1:-1);
    renderDongTien();
  } else if (act === 'dtCheDo'){
    state.dtMoPhong = el.getAttribute('data-v') === 'mp';
    if (state.dtMoPhong) renderMoPhong(); else renderDongTien();
  } else if (act === 'dtThang'){
    state.dtThang = el.getAttribute('data-mk');
    renderDongTien();
  } else if (act === 'dtPrev' || act === 'dtNext'){
    dtDatThang(monthKeyAdd(state.dtMk || monthKey(todayStr()), act === 'dtNext' ? 1 : -1));
  } else if (act === 'dtChonThang'){
    dtDatThang(el.getAttribute('data-mk'));
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (act === 'dtMoDong'){
    var id = el.getAttribute('data-id');
    state.dtMoDong = (state.dtMoDong === id) ? null : id;
    renderDongTien();
  } else if (act === 'dtChiHet'){
    state.dtChiHet = !state.dtChiHet; renderDongTien();
  } else if (act === 'dtDuKienHet'){
    state.dtDuKienHet = !state.dtDuKienHet; renderDongTien();
  } else if (act === 'dtBangNam'){
    state.dtBangNam = !state.dtBangNam;
    if (state.dtBangNam) state.dongTienYear = parseInt((state.dtMk || monthKey(todayStr())).slice(0, 4), 10);
    renderDongTien();
  } else {
    return false;
  }
  return true;
}
function handleDongTienChange(el){
  if (el.matches && el.matches('[data-act=dtJump]')){ dtDatThang(el.value); return true; }
  return false;
}
