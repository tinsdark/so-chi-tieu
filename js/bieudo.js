/* ====================================================================
   bieudo.js — biểu đồ tự vẽ bằng SVG/HTML (không dùng thư viện): hiện được cả khi offline,
   đổi màu theo giao diện sáng/tối qua biến CSS --bd-*, chạm vào để xem từng điểm.
   Gồm 2 phần:
   1) Hàm vẽ thuần (nhận số liệu -> trả chuỗi HTML): bdLine, bdCombo, bdDonut, bdHBars, bdHeat.
      Dùng ở Sổ tay, Vay - Nợ, Mô phỏng.
   2) Thẻ "Biểu đồ chi tiêu" của Sổ tay: 3 tab Tổng quan / Danh mục / Xu hướng.
   Cần state.js (+ sotay.js cho balanceSeries) nạp trước; chỉ ĐỌC dữ liệu, không ghi gì.
   ==================================================================== */

/* ---------- tiện ích ---------- */
var _bdReg = {};      // id -> cấu hình biểu đồ (để vẽ lại khi chạm)
var _bdSeq = 0;

// số ngắn cho trục: 1,2tr / 350k / -2tr
function bdRut(n){
  var a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(1).replace(/\.0$/, '').replace('.', ',') + ' tỷ';
  if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace(/\.0$/, '').replace('.', ',') + 'tr';
  if (a >= 1e3) return s + Math.round(a / 1e3) + 'k';
  return s + Math.round(a);
}
// buoc chia trục "đẹp" (1, 2, 2.5, 5 × 10^k)
function bdBuoc(range){
  if (!(range > 0)) return 1;
  var p = Math.pow(10, Math.floor(Math.log(range) / Math.LN10));
  var c = [1, 2, 2.5, 5, 10];
  for (var i = 0; i < c.length; i++){ if (c[i] * p >= range) return c[i] * p; }
  return 10 * p;
}
// khoảng trục: ticks từ mn đến mx, tối đa ~4 vạch
function bdTruc(lo, hi){
  if (lo > 0) lo = 0;
  if (hi < 0) hi = 0;
  if (hi === lo) hi = lo + 1;
  var step = bdBuoc((hi - lo) / 3);
  var mn = Math.floor(lo / step) * step, mx = Math.ceil(hi / step) * step;
  var t = [];
  for (var v = mn; v <= mx + step / 1000; v += step) t.push(v);
  return { mn: mn, mx: mx, ticks: t };
}
function bdMuot(pts){
  if (!pts.length) return '';
  var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (var i = 1; i < pts.length; i++){
    var a = pts[i - 1], b = pts[i], cx = (a[0] + b[0]) / 2;
    d += ' C' + cx.toFixed(1) + ',' + a[1].toFixed(1) + ' ' + cx.toFixed(1) + ',' + b[1].toFixed(1) + ' ' + b[0].toFixed(1) + ',' + b[1].toFixed(1);
  }
  return d;
}
function bdGrad(id, cls, a0, a1){
  return '<linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bd-st-'+cls+'" stop-opacity="'+a0+'"/>'
    + '<stop offset="1" class="bd-st-'+cls+'" stop-opacity="'+a1+'"/></linearGradient>';
}
// các nhãn trục X: tối đa ~6, luôn có điểm đầu và cuối
function bdNhanX(n){
  if (n <= 6){ var r = []; for (var i = 0; i < n; i++) r.push(i); return r; }
  var buoc = Math.ceil((n - 1) / 5), out = [];
  for (var k = 0; k < n; k += buoc) out.push(k);
  if (out[out.length - 1] !== n - 1){
    if (n - 1 - out[out.length - 1] < buoc * 0.8) out.pop();
    out.push(n - 1);
  }
  return out;
}

/* ---------- đường (1 hoặc nhiều đường), chạm để xem từng điểm ----------
   o = { id, W, H, labels:[], series:[{ ten, vals:[], cls:'chi|thu|blue|gray', dash, fill }],
         sel, base, baseLabel, tipTitle(i), money(v) } */
var BD_P = { l: 38, r: 10, t: 14, b: 22 };

function bdLineInner(o, ve){
  var P = BD_P, W = o.W, H = o.H, n = o.labels.length;
  var all = [];
  o.series.forEach(function(s){ s.vals.forEach(function(v){ all.push(v); }); });
  if (o.base != null) all.push(o.base);
  var ax = bdTruc(Math.min.apply(null, all), Math.max.apply(null, all));
  var x = function(i){ return n < 2 ? (P.l + W - P.r) / 2 : P.l + (W - P.l - P.r) * i / (n - 1); };
  var y = function(v){ return P.t + (H - P.t - P.b) * (1 - (v - ax.mn) / (ax.mx - ax.mn)); };
  var s = '<defs>', k;
  o.series.forEach(function(se, si){ if (se.fill) s += bdGrad(o.id + 'g' + si, se.cls, .28, 0); });
  s += '</defs>';
  ax.ticks.forEach(function(t){
    s += '<line x1="'+P.l+'" x2="'+(W - P.r)+'" y1="'+y(t).toFixed(1)+'" y2="'+y(t).toFixed(1)+'" class="bd-grid'+(t === 0 ? ' zero' : '')+'"/>'
      + '<text x="'+(P.l - 6)+'" y="'+(y(t) + 3).toFixed(1)+'" text-anchor="end">'+bdRut(t)+'</text>';
  });
  bdNhanX(n).forEach(function(i){
    s += '<text x="'+x(i).toFixed(1)+'" y="'+(H - 5)+'" text-anchor="'+(i === 0 && n > 1 ? 'start' : (i === n - 1 && n > 1 ? 'end' : 'middle'))+'">'+o.labels[i]+'</text>';
  });
  if (o.base != null){
    s += '<line x1="'+P.l+'" x2="'+(W - P.r)+'" y1="'+y(o.base).toFixed(1)+'" y2="'+y(o.base).toFixed(1)+'" class="bd-base"/>'
      + '<text x="'+(W - P.r)+'" y="'+(y(o.base) - 4).toFixed(1)+'" text-anchor="end" class="bd-base-t">'+(o.baseLabel || '')+'</text>';
  }
  var sel = o.sel == null ? n - 1 : Math.max(0, Math.min(n - 1, o.sel));
  o.series.forEach(function(se, si){
    var pts = se.vals.map(function(v, i){ return [x(i), y(v)]; });
    if (n < 2) return;
    if (se.fill){
      s += '<path d="'+bdMuot(pts)+' L'+pts[n - 1][0].toFixed(1)+','+y(Math.max(ax.mn, 0)).toFixed(1)+' L'+pts[0][0].toFixed(1)+','+y(Math.max(ax.mn, 0)).toFixed(1)+'Z" fill="url(#'+o.id+'g'+si+')"/>';
    }
    s += '<path d="'+bdMuot(pts)+'" pathLength="1" class="bd-ln bd-s-'+se.cls+(se.dash ? ' dash' : '')+(ve && !se.dash ? ' bd-draw' : '')+'"/>';
  });
  if (o.dots) o.series.forEach(function(se){
    se.vals.forEach(function(v, i){ s += '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="3" class="bd-dot sm bd-s-'+se.cls+'"/>'; });
  });
  var sx = x(sel);
  s += '<line x1="'+sx.toFixed(1)+'" x2="'+sx.toFixed(1)+'" y1="'+P.t+'" y2="'+(H - P.b)+'" class="bd-cursor"/>';
  var ymin = H;
  o.series.forEach(function(se){
    var yy = y(se.vals[sel]);
    if (yy < ymin) ymin = yy;
    s += '<circle cx="'+sx.toFixed(1)+'" cy="'+yy.toFixed(1)+'" r="5" class="bd-dot bd-s-'+se.cls+'"/>';
  });
  // thẻ giá trị: đặt trên điểm cao nhất; sát mép trên thì đặt dưới
  var money = o.money || function(v){ return fmt(v); };
  var rows = o.series.length > 1 ? o.series.map(function(se){ return se.ten + ': ' + money(se.vals[sel]); }) : [money(o.series[0].vals[sel])];
  var title = o.tipTitle ? o.tipTitle(sel) : '';
  var maxLen = Math.max(title.length, Math.max.apply(null, rows.map(function(r){ return r.length; })));
  var tw = Math.max(92, Math.round(maxLen * (o.series.length > 1 ? 6.6 : 7.4)) + 18), th = 20 + rows.length * 15;
  var tx = Math.min(Math.max(sx - tw / 2, P.l), W - P.r - tw);
  var ty = ymin - th - 10 < 2 ? ymin + 14 : ymin - th - 10;
  s += '<g class="bd-tip"><rect x="'+tx.toFixed(1)+'" y="'+ty.toFixed(1)+'" width="'+tw+'" height="'+th+'" rx="9"/>'
    + '<text x="'+(tx + tw / 2).toFixed(1)+'" y="'+(ty + 14).toFixed(1)+'" text-anchor="middle" class="t1">'+title+'</text>';
  rows.forEach(function(r, i){
    s += '<text x="'+(tx + tw / 2).toFixed(1)+'" y="'+(ty + 29 + i * 15).toFixed(1)+'" text-anchor="middle" class="t2">'+r+'</text>';
  });
  s += '</g>';
  s += '<rect class="bd-hit" x="'+P.l+'" y="0" width="'+(W - P.l - P.r)+'" height="'+H+'" fill="transparent"/>';
  return s;
}
function bdLine(o){
  o.id = o.id || ('bd' + (++_bdSeq));
  o.kind = 'line';
  _bdReg[o.id] = o;
  return '<svg class="bd-lc" data-bd="'+o.id+'" viewBox="0 0 '+o.W+' '+o.H+'" role="img" aria-label="'+(o.aria || 'Biểu đồ đường')+'">'
    + bdLineInner(o, true) + '</svg>';
}

/* ---------- cột (chi) + đường (thu) theo tháng ----------
   o = { id, W, H, labels:[], thu:[], chi:[], sel, avg } */
function bdComboInner(o, ve){
  var P = { l: 38, r: 8, t: 46, b: 22 }, W = o.W, H = o.H, n = o.labels.length;
  var ax = bdTruc(0, Math.max.apply(null, o.thu.concat(o.chi).concat([o.avg || 0])) * 1.08);
  var bw = (W - P.l - P.r) / n;
  var y = function(v){ return P.t + (H - P.t - P.b) * (1 - (v - ax.mn) / (ax.mx - ax.mn)); };
  var sel = o.sel == null ? n - 1 : o.sel;
  var hienNhan = o.thuaNhan ? bdNhanX(n) : null;      // nhiều tháng: chỉ in vài nhãn trục x cho khỏi chồng chữ
  var s = '<defs>' + bdGrad(o.id + 'b', 'chi', 1, .5) + bdGrad(o.id + 't', 'thu', 1, .5) + '</defs>';
  ax.ticks.forEach(function(t){
    s += '<line x1="'+P.l+'" x2="'+(W - P.r)+'" y1="'+y(t).toFixed(1)+'" y2="'+y(t).toFixed(1)+'" class="bd-grid'+(t === 0 ? ' zero' : '')+'"/>'
      + '<text x="'+(P.l - 6)+'" y="'+(y(t) + 3).toFixed(1)+'" text-anchor="end">'+bdRut(t)+'</text>';
  });
  // 1 cột bo góc trên: x giữa cột, rộng w, cao từ v tới đáy
  var cot = function(cx, w, v, grad, i, k){
    if (!(v > 0)) return '';
    var yv = y(v), r = Math.min(5, w / 2, Math.max(0, H - P.b - yv));
    return '<path class="bd-bar'+(ve ? ' bd-grow' : '')+'" style="transform-origin:'+cx.toFixed(1)+'px '+(H - P.b)+'px;animation-delay:'+(i * 25 + k * 40)+'ms" opacity="'+(i === sel ? 1 : .6)+'" d="M'+(cx - w / 2).toFixed(1)+','+(H - P.b)
      + ' V'+(yv + r).toFixed(1)+' Q'+(cx - w / 2).toFixed(1)+','+yv.toFixed(1)+' '+(cx - w / 2 + r).toFixed(1)+','+yv.toFixed(1)
      + ' H'+(cx + w / 2 - r).toFixed(1)+' Q'+(cx + w / 2).toFixed(1)+','+yv.toFixed(1)+' '+(cx + w / 2).toFixed(1)+','+(yv + r).toFixed(1)
      + ' V'+(H - P.b)+'Z" fill="url(#'+o.id+grad+')"/>';
  };
  for (var i = 0; i < n; i++){
    var cx = P.l + bw * i + bw / 2, w = Math.min(bw * .34, 13);
    s += cot(cx - w / 2 - 1, w, o.thu[i], 't', i, 0) + cot(cx + w / 2 + 1, w, o.chi[i], 'b', i, 1);
    if (!hienNhan || hienNhan.indexOf(i) >= 0 || i === sel) s += '<text x="'+cx.toFixed(1)+'" y="'+(H - 5)+'" text-anchor="middle"'+(i === sel ? ' class="bd-sel-t"' : '')+'>'+o.labels[i]+'</text>';
    s += '<rect class="bd-hit" data-i="'+i+'" x="'+(cx - bw / 2).toFixed(1)+'" y="0" width="'+bw.toFixed(1)+'" height="'+H+'" fill="transparent"/>';
  }
  if (o.avg > 0){
    s += '<line x1="'+P.l+'" x2="'+(W - P.r)+'" y1="'+y(o.avg).toFixed(1)+'" y2="'+y(o.avg).toFixed(1)+'" class="bd-base"/>'
      + '<text x="'+(W - P.r)+'" y="'+(y(o.avg) - 4).toFixed(1)+'" text-anchor="end" class="bd-base-t">TB chi '+bdRut(o.avg)+'</text>';
  }
  // thẻ giá trị của tháng đang chọn, nằm phía trên vùng vẽ
  if (o.thu[sel] > 0 || o.chi[sel] > 0){
    var money = o.money || bdTien, row = (o.nhanThu || 'Thu') + ' ' + money(o.thu[sel]) + '  ·  ' + (o.nhanChi || 'Chi') + ' ' + money(o.chi[sel]);
    var tw = Math.min(W - P.l - P.r, Math.max(120, Math.round(row.length * 6.1) + 20)), th = 34;
    var cxs = P.l + bw * sel + bw / 2, tx = Math.min(Math.max(cxs - tw / 2, P.l), W - P.r - tw);
    s += '<g class="bd-tip"><rect x="'+tx.toFixed(1)+'" y="3" width="'+tw+'" height="'+th+'" rx="9"/>'
      + '<text x="'+(tx + tw / 2).toFixed(1)+'" y="16" text-anchor="middle" class="t1">'+o.labels[sel]+'</text>'
      + '<text x="'+(tx + tw / 2).toFixed(1)+'" y="30" text-anchor="middle" class="t2">'+row+'</text></g>';
  }
  return s;
}
function bdCombo(o){
  o.id = o.id || ('bd' + (++_bdSeq));
  o.kind = 'combo';
  _bdReg[o.id] = o;
  return '<svg class="bd-lc" data-bd="'+o.id+'" viewBox="0 0 '+o.W+' '+o.H+'" role="img" aria-label="'+(o.aria || 'Biểu đồ thu chi theo tháng')+'">'
    + bdComboInner(o, true) + '</svg>';
}

// chạm / rê / kéo ngang trên biểu đồ -> đổi điểm đang chọn (chỉ vẽ lại phần ruột SVG)
function bdChon(ev){
  var svg = ev.target && ev.target.closest ? ev.target.closest('svg.bd-lc') : null;
  if (!svg) return;
  var o = _bdReg[svg.getAttribute('data-bd')];
  if (!o) return;
  var r = svg.getBoundingClientRect();
  if (!r.width) return;
  var i, n = o.labels.length;
  if (o.kind === 'combo'){
    var P = { l: 38, r: 8 };
    i = Math.floor(((ev.clientX - r.left) / r.width * o.W - P.l) / ((o.W - P.l - P.r) / n));
  } else {
    var Q = BD_P;
    i = Math.round(((ev.clientX - r.left) / r.width * o.W - Q.l) / ((o.W - Q.l - Q.r) / Math.max(1, n - 1)));
  }
  i = Math.max(0, Math.min(n - 1, i));
  if (i === o.sel) return;
  o.sel = i;
  svg.innerHTML = o.kind === 'combo' ? bdComboInner(o, false) : bdLineInner(o, false);
}
if (typeof document !== 'undefined' && document.addEventListener){
  var _bdKeo = false;
  document.addEventListener('pointerdown', function(ev){ if (ev.target.closest && ev.target.closest('svg.bd-lc')){ _bdKeo = true; bdChon(ev); } });
  document.addEventListener('pointermove', function(ev){ if (_bdKeo) bdChon(ev); });
  document.addEventListener('pointerup', function(){ _bdKeo = false; });
  document.addEventListener('pointercancel', function(){ _bdKeo = false; });
}

/* ---------- donut: tổng ở giữa, lát cắt bấm được ----------
   items = [{ ten, v, mau }], sel = chỉ số đang chọn (hoặc null), tong = tổng, nhan = chữ giữa */
function bdDonut(items, sel, tong){
  var cx = 90, cy = 90, a = -Math.PI / 2;
  var s = '<svg class="bd-donut" viewBox="0 0 180 180" role="img" aria-label="Biểu đồ vòng theo danh mục"><circle cx="90" cy="90" r="54" class="bd-ring"/>';
  items.forEach(function(it, i){
    var f = tong > 0 ? it.v / tong : 0;
    if (f <= 0) return;
    var rr = sel === i ? 65 : 62, r0 = sel === i ? 44 : 46;
    var full = f > .9995;
    var a1 = a + .02, a2 = a + f * 2 * Math.PI - (items.length > 1 ? .02 : 0), big = (a2 - a1) > Math.PI ? 1 : 0;
    var p = function(g, rad){ return (cx + rad * Math.cos(g)).toFixed(1) + ',' + (cy + rad * Math.sin(g)).toFixed(1); };
    var d = full
      ? 'M' + p(a, rr) + ' A' + rr + ',' + rr + ' 0 1 1 ' + p(a + Math.PI, rr) + ' A' + rr + ',' + rr + ' 0 1 1 ' + p(a, rr) + ' L' + p(a, r0) + ' A' + r0 + ',' + r0 + ' 0 1 0 ' + p(a + Math.PI, r0) + ' A' + r0
      : 'M' + p(a1, rr) + ' A' + rr + ',' + rr + ' 0 ' + big + ' 1 ' + p(a2, rr) + ' L' + p(a2, r0) + ' A' + r0 + ',' + r0 + ' 0 ' + big + ' 0 ' + p(a1, r0) + 'Z';
    s += '<path data-act="bdPick" data-i="'+i+'" d="'+d+'" fill="'+it.mau+'" fill-rule="evenodd" opacity="'+(sel == null || sel === i ? 1 : .32)+'"><title>'+esc(it.ten)+'</title></path>';
    a += f * 2 * Math.PI;
  });
  var c = sel != null ? items[sel] : null;
  var so = fmt(c ? c.v : tong).replace(/\s*₫$/, '');
  var coChu = so.length > 11 ? 11.5 : (so.length > 9 ? 12.5 : 14.5);
  s += '<text x="90" y="80" text-anchor="middle" class="bd-c1">'+(c ? esc(c.ten.length > 14 ? c.ten.slice(0, 13) + '…' : c.ten) : 'Tổng chi')+'</text>'
    + '<text x="90" y="99" text-anchor="middle" class="bd-c2" style="font-size:'+coChu+'px">'+so+'<tspan class="bd-c3" dx="3">₫</tspan></text>'
    + '<text x="90" y="114" text-anchor="middle" class="bd-c1">'+(c ? Math.round(c.v / tong * 100) + '% tổng chi' : items.length + ' danh mục')+'</text></svg>';
  return s;
}

/* ---------- thanh ngang xếp hạng ----------
   items = [{ ten, v, mau, truoc }]  (truoc = số tháng trước, null nếu không có để so) */
function bdHBars(items, tong, opt){
  opt = opt || {};
  var mx = items.length ? items[0].v : 1;
  var h = '<div class="bd-hb">';
  items.forEach(function(it, i){
    var trai = opt.phanTram ? Math.round(it.v / tong * 100) + '% ' + (opt.nhanTong || 'tổng chi') : '', chip = '';
    if (opt.soSanh && it.truoc != null && it.truoc > 0){
      var d = Math.round((it.v - it.truoc) / it.truoc * 100);
      chip = '<span class="cm '+(d > 0 ? 'up' : 'dn')+'">'+(d > 0 ? '↑ ' : (d < 0 ? '↓ ' : '= '))+Math.abs(d)+'% so với '+(opt.nhanTruoc || 'tháng trước')+'</span>';
    } else if (opt.soSanh && it.truoc === 0){
      chip = '<span class="cm up">mới so với '+(opt.nhanTruoc || 'tháng trước')+'</span>';
    }
    var mau = opt.mauChung || it.mau;
    h += '<div class="bd-hb-r'+(opt.pick && opt.sel === i ? ' sel' : '')+'"'+(opt.pick ? ' data-act="bdPick" data-i="'+i+'"' : '')+'>'
      + '<div class="top"><span><i style="background:'+it.mau+'"></i>'+esc(it.ten)+'</span><b>'+fmt(Math.round(it.v))+'</b></div>'
      + '<div class="bar"><i style="width:'+Math.max(2, Math.round(it.v / mx * 100))+'%;background:'+mau+'"></i></div>'
      + ((trai || chip) ? '<div class="vs"><span>'+trai+'</span>'+chip+'</div>' : '') + '</div>';
  });
  return h + '</div>';
}

/* ---------- lịch nhiệt chi tiêu ----------
   chi[d-1], thu[d-1] cho d = 1..soNgay; denNgay = ngày cuối đã tới (ngày sau đó viền nét đứt);
   dau = thứ của ngày 1 (0 = T2 ... 6 = CN); sel = ngày đang chọn; mk = 'YYYY-MM' */
function bdHeat(mk, chi, thu, soNgay, denNgay, dau, sel){
  var mx = Math.max.apply(null, chi.concat([0]));
  var h = '<div class="bd-cal">' + ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(function(d){ return '<div class="dw">'+d+'</div>'; }).join('');
  for (var i = 0; i < dau; i++) h += '<div></div>';
  for (var d = 1; d <= soNgay; d++){
    var v = chi[d - 1] || 0, date = kyNgay(mk, d), sn = parseInt(date.slice(8), 10);
    if (d > denNgay){ h += '<div class="c fut">'+sn+'</div>'; continue; }
    var t = mx > 0 ? v / mx : 0, pct = v > 0 ? Math.round((.16 + .84 * Math.pow(t, .8)) * 100) : 0;
    h += '<div class="c'+(v > 0 ? '' : ' emp')+(d === sel ? ' sel' : '')+(date === todayStr() ? ' today' : '')+(t > .5 ? ' hot' : '')+'" data-act="bdDay" data-date="'+date+'"'
      + (v > 0 ? ' style="background:color-mix(in srgb,var(--bd-chi) '+pct+'%,var(--card))"' : '')
      + ' role="button" aria-label="Ngày '+sn+': chi '+fmt(Math.round(v))+'">'+sn
      + (thu[d - 1] > 0 ? '<span class="g"></span>' : '')
      + (v >= 500000 ? '<span class="a">'+bdRut(v)+'</span>' : '') + '</div>';
  }
  return h + '</div>';
}

/* ====================================================================
   THẺ "BIỂU ĐỒ CHI TIÊU" CỦA SỔ TAY
   state.bdTab: 'tq' | 'dm' | 'xh'; state.bdMode: 'vong' | 'thanh'; state.bdCat: chỉ số lát đang chọn;
   state.bdDay: ngày đang chọn ở lịch nhiệt (null = ngày chi nhiều nhất).
   ==================================================================== */
var BD_DAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function bdThangTruoc(mk){
  var p = mk.split('-'), y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1;
  if (m < 1){ m = 12; y--; }
  return y + '-' + pad2(m);
}
// gom số liệu 1 tháng: tổng thu/chi, theo ngày, theo danh mục.
// denNgay (tùy chọn): chỉ cộng tới hết ngày đó — dùng để so CÙNG KỲ với tháng đang chạy dở.
function bdThang(mk, denNgay){
  var soNgay = kySoNgay(mk), chi = [], thu = [], theoCat = {}, theoCatThu = {}, topCatNgay = [], coDl = false;
  var het = denNgay ? Math.min(soNgay, denNgay) : soNgay;
  for (var d = 1; d <= het; d++){
    var e = state.data.journal[kyNgay(mk, d)], c = 0, t = 0, best = null, bv = 0;
    if (e){
      coDl = true;
      c = chiTotal(e); t = thuTotal(e);
      Object.keys(e.chi || {}).forEach(function(k){
        var v = num(e.chi[k]);
        theoCat[k] = (theoCat[k] || 0) + v;
        if (v > bv){ bv = v; best = k; }
      });
      if (e.thu && typeof e.thu === 'object') Object.keys(e.thu).forEach(function(k){ theoCatThu[k] = (theoCatThu[k] || 0) + num(e.thu[k]); });
    }
    chi.push(c); thu.push(t); topCatNgay.push(best);
  }
  var tc = 0, tt = 0;
  chi.forEach(function(v){ tc += v; }); thu.forEach(function(v){ tt += v; });
  return { mk: mk, soNgay: soNgay, chi: chi, thu: thu, tongChi: tc, tongThu: tt, theoCat: theoCat, theoCatThu: theoCatThu, topCatNgay: topCatNgay, coDl: coDl };
}
// danh mục xếp từ lớn tới nhỏ; quá 6 mục thì gộp phần còn lại thành "Khác"
function bdXepCat(kind, theo, truocTheo, gop){
  var arr = [];
  (state.data.categories[kind] || []).forEach(function(c){
    if (theo[c.id] > 0) arr.push({ id: c.id, ten: c.ten, v: theo[c.id], mau: catMau(kind, c.id), truoc: truocTheo ? (truocTheo[c.id] || 0) : null });
  });
  Object.keys(theo).forEach(function(k){   // danh mục đã xóa nhưng còn số liệu
    if (theo[k] > 0 && !arr.some(function(a){ return a.id === k; })) arr.push({ id: k, ten: catTen(kind, k), v: theo[k], mau: '#9ca3af', truoc: truocTheo ? (truocTheo[k] || 0) : null });
  });
  arr.sort(function(a, b){ return b.v - a.v; });
  if (gop && arr.length > gop){
    var dau = arr.slice(0, gop - 1), rest = arr.slice(gop - 1), v = 0, tr = 0, coTr = true;
    rest.forEach(function(r){ v += r.v; if (r.truoc == null) coTr = false; else tr += r.truoc; });
    dau.push({ id: '_khac', ten: 'Khác', v: v, mau: '#9ca3af', truoc: coTr ? tr : null });
    arr = dau;
  }
  return arr;
}
function bdPhanTram(a, b){ return b > 0 ? Math.round((a - b) / b * 100) : null; }
function bdTien(v){ return fmt(Math.round(v)); }

// tháng trước để so sánh. Tháng đang chạy dở: chỉ lấy CÙNG KỲ (ngày 1 -> cùng ngày của hôm nay),
// so với cả tháng trước thì đầu tháng nào cũng ra "chi giảm 75%" dù nhịp chi không đổi.
// Trả thêm nhan ("tháng 9" / "1–7/9") và nhanNgan ("T9" / "1–7/9") để ghi đúng đang so với cái gì.
function bdThangSoSanh(mk){
  var prevMk = bdThangTruoc(mk), hom = todayStr();
  var den = mk === monthKey(hom) ? kyThuNgay(mk, hom) : 0;
  var cungKy = den > 0 && den < kySoNgay(prevMk);
  var prev = bdThang(prevMk, cungKy ? den : 0), th = parseInt(prevMk.slice(5), 10);
  prev.nhan = cungKy ? (ngayKy() === 1 ? '1–' + den + '/' + th : ngayNganVN(kyTu(prevMk)) + '–' + ngayNganVN(kyNgay(prevMk, den))) : 'tháng ' + th;
  prev.nhanNgan = cungKy ? prev.nhan : 'T' + th;
  return prev;
}

// ước tính chi hết tháng đang chạy: đã chi + nhịp chi ngày thường × số ngày còn lại + các khoản biết trước chưa ghi.
// "Ngày thường": mỗi ngày bị chặn trần ở 3 lần trung vị các ngày có chi — 1 lần mua lớn không bị nhân lên cả tháng.
// Trả nợ / Cho vay không tính vào nhịp (đi theo lịch vay, phần còn lại của tháng lấy từ lịch qua bietTruocChuaGhi).
function bdUocTinhChiThang(mk, denNgay){
  var soNgay = kySoNgay(mk), daChi = 0, ngay = [];
  for (var d = 1; d <= denNgay; d++){
    var e = state.data.journal[kyNgay(mk, d)], v = 0;
    if (e){
      daChi += chiTotal(e);
      Object.keys(e.chi || {}).forEach(function(k){ if (!CAT_HE_THONG.chi[k]) v += num(e.chi[k]); });
    }
    ngay.push(v);
  }
  var coChi = ngay.filter(function(v){ return v > 0; }).sort(function(a, b){ return a - b; });
  var trungVi = coChi.length ? (coChi.length % 2 ? coChi[(coChi.length - 1) / 2] : (coChi[coChi.length / 2 - 1] + coChi[coChi.length / 2]) / 2) : 0;
  var tran = trungVi * 3, tong = 0;
  ngay.forEach(function(v){ tong += Math.min(v, tran); });
  var nhip = denNgay > 0 ? tong / denNgay : 0;
  var bietTruoc = dinhKyChuaGhiThang(mk, 'chi') + bietTruocChuaGhi('chi', 'traNo', mk);
  var them = nhip * (soNgay - denNgay) + bietTruoc;
  return { tong: daChi + them, daChi: daChi, them: them, bietTruoc: bietTruoc };
}

function bdTongQuanHtml(mk){
  var cur = bdThang(mk), prev = bdThangSoSanh(mk);
  var hom = todayStr(), laNay = mk === monthKey(hom), tuongLai = mk > monthKey(hom);
  var denNgay = tuongLai ? 0 : (laNay ? kyThuNgay(mk, hom) : cur.soNgay);
  var h = '';
  if (!cur.coDl){
    return '<div class="empty">Tháng này chưa có giao dịch nên chưa có gì để phân tích.</div>';
  }
  // --- phân tích bằng chữ ---
  var dong = [];
  var pc = bdPhanTram(cur.tongChi, prev.tongChi);
  if (pc != null && prev.coDl){
    dong.push({ ic: pc > 0 ? 'up' : 'dn', ky: pc > 0 ? '↑' : '↓',
      t: 'Chi <b>' + (pc > 0 ? 'tăng ' : (pc < 0 ? 'giảm ' : 'không đổi ')) + (pc === 0 ? '' : Math.abs(pc) + '%') + '</b> so với ' + prev.nhan,
      s: bdTien(cur.tongChi) + ' so với ' + bdTien(prev.tongChi) });
  }
  var cats = bdXepCat('chi', cur.theoCat, prev.theoCat, 0);
  if (prev.coDl){
    var tang = null;
    cats.forEach(function(c){ var d = c.v - (c.truoc || 0); if (d > 0 && (!tang || d > tang.d)) tang = { c: c, d: d }; });
    if (tang) dong.push({ ic: 'in', ky: '!', t: '<b>' + esc(tang.c.ten) + '</b> tăng mạnh nhất: +' + bdTien(tang.d),
      s: 'Chiếm ' + Math.round(tang.c.v / cur.tongChi * 100) + '% tổng chi tháng này' });
  } else if (cats.length){
    dong.push({ ic: 'in', ky: '!', t: '<b>' + esc(cats[0].ten) + '</b> chi nhiều nhất: ' + bdTien(cats[0].v), s: 'Chiếm ' + Math.round(cats[0].v / cur.tongChi * 100) + '% tổng chi tháng này' });
  }
  var soNgayTinh = Math.max(1, denNgay);
  var maxD = 0, maxV = 0;
  cur.chi.forEach(function(v, i){ if (v > maxV){ maxV = v; maxD = i + 1; } });
  if (cur.tongChi > 0){
    dong.push({ ic: 'go', ky: '~', t: 'Trung bình <b>' + bdTien(cur.tongChi / soNgayTinh) + '/ngày</b> · ngày chi nhiều nhất ' + ngayNganVN(kyNgay(mk, maxD)),
      s: 'Cao nhất: ' + bdTien(maxV) + (cur.topCatNgay[maxD - 1] ? ' (' + esc(catTen('chi', cur.topCatNgay[maxD - 1])) + ')' : '') });
  }
  if (laNay && denNgay >= 3 && cur.tongChi > 0){
    var ut = bdUocTinhChiThang(mk, denNgay), du = ut.tong, cap = 0;
    hanMucThangRows(mk).forEach(function(r){ cap += r.cap; });
    dong.push({ ic: cap > 0 && du > cap ? 'up' : 'dn', ky: cap > 0 && du > cap ? '!' : icon('check'),
      t: 'Ước tính chi hết tháng <b>≈ ' + bdTien(du) + '</b>',
      s: 'Đã chi ' + bdTien(ut.daChi) + ' + dự kiến thêm ' + bdTien(ut.them)
        + (ut.bietTruoc > 0 ? ' (gồm ' + bdTien(ut.bietTruoc) + ' định kỳ/trả nợ chưa ghi)' : '')
        + (cap > 0 ? ' · hạn mức ' + bdTien(cap) : '') });
  }
  if (dong.length){
    h += '<div class="bd-ins"><h3>Phân tích '+monthLabel(mk).toLowerCase()+'</h3>'
      + dong.map(function(d){ return '<div class="ins-row"><div class="ins-ic '+d.ic+'">'+d.ky+'</div><div><div class="ins-t">'+d.t+'</div><div class="ins-s">'+d.s+'</div></div></div>'; }).join('')
      + '</div>';
  }
  // --- 2 ô thu / chi ---
  var pt = prev.coDl ? bdPhanTram(cur.tongThu, prev.tongThu) : null;
  var so = function(p, tot){ return p == null ? '<em class="muted">—</em>' : '<em class="'+tot+'">'+(p > 0 ? '↑ ' : (p < 0 ? '↓ ' : '= '))+Math.abs(p)+'% so với '+prev.nhanNgan+'</em>'; };
  h += '<div class="bd-kpi"><div><small>Tổng thu</small><b class="thu">'+bdTien(cur.tongThu)+'</b>'+so(pt, 'thu')+'</div>'
    + '<div><small>Tổng chi</small><b class="chi">'+bdTien(cur.tongChi)+'</b>'+so(prev.coDl ? pc : null, 'chi')+'</div></div>';
  // --- số dư cuối ngày ---
  var bs = balanceSeries(mk);
  if (bs.vals.length >= 2){
    h += '<div class="bd-h">Số dư cuối ngày <span>chạm / kéo để xem từng ngày</span></div><div class="bd-box">'
      + bdLine({ W: 350, H: 190, labels: bs.labels, series: [{ ten: 'Số dư', vals: bs.vals, cls: 'chi', fill: true }],
        base: balanceBeforeMonth(mk), baseLabel: 'đầu tháng',
        tipTitle: function(i){ return 'Ngày ' + ngayNganVN(kyNgay(mk, i + 1)); }, money: bdTien, aria: 'Số dư cuối ngày ' + monthLabel(mk) }) + '</div>';
  }
  // --- lịch nhiệt ---
  var dau = (new Date(kyTu(mk) + 'T00:00:00').getDay() + 6) % 7;
  var sel = state.bdDay && monthKey(state.bdDay) === mk ? kyThuNgay(mk, state.bdDay) : (maxD || 1);
  var selDate = kyNgay(mk, sel), dow = new Date(selDate + 'T00:00:00').getDay();
  h += '<div class="bd-h" style="margin-top:18px">Lịch chi tiêu '+monthLabel(mk).toLowerCase()+'<span class="bd-leg1"><i></i> có thu</span></div>'
    + bdHeat(mk, cur.chi, cur.thu, cur.soNgay, denNgay, dau, sel)
    + '<div class="bd-dtl"><span>'+BD_DAYS[dow]+' '+ngayNganVN(selDate)+(selDate === hom ? ' · hôm nay' : '')+'</span><span>'
    + (sel <= denNgay ? 'Chi <b class="chi">'+bdTien(cur.chi[sel - 1])+'</b>' + (cur.thu[sel - 1] > 0 ? ' · Thu <b class="thu">'+bdTien(cur.thu[sel - 1])+'</b>' : '') : 'Chưa tới') + '</span></div>'
    + '<div class="bd-scale"><span>Ít</span><span class="sc">'+[16, 35, 55, 78, 100].map(function(p){ return '<i style="background:color-mix(in srgb,var(--bd-chi) '+p+'%,var(--card))"></i>'; }).join('')+'</span><span>Nhiều</span></div>';
  // --- top 3 ngày ---
  var top = [];
  cur.chi.forEach(function(v, i){ if (v > 0) top.push({ d: i + 1, v: v }); });
  top.sort(function(a, b){ return b.v - a.v; });
  if (top.length){
    h += '<div class="bd-top"><div class="t">Top ngày chi nhiều</div>' + top.slice(0, 3).map(function(t){
      var ck = cur.topCatNgay[t.d - 1];
      return '<div data-act="bdDay" data-date="'+kyNgay(mk, t.d)+'"><span>'+ngayNganVN(kyNgay(mk, t.d))+(ck ? ' · '+esc(catTen('chi', ck)) : '')+'</span><b>'+bdTien(t.v)+'</b></div>';
    }).join('') + '</div>';
  }
  return h;
}

function bdDanhMucHtml(mk){
  var cur = bdThang(mk), prev = bdThangSoSanh(mk);
  var h = '';
  var cats = bdXepCat('chi', cur.theoCat, prev.coDl ? prev.theoCat : null, 6);
  var tong = cur.tongChi;
  var vong = state.bdMode !== 'thanh';
  h += '<div class="bd-h">Chi theo danh mục<span class="bd-tg" role="group" aria-label="Kiểu hiển thị">'
    + '<button type="button" data-act="bdMode" data-mode="vong" class="'+(vong ? 'on' : '')+'" aria-pressed="'+vong+'">Vòng</button>'
    + '<button type="button" data-act="bdMode" data-mode="thanh" class="'+(vong ? '' : 'on')+'" aria-pressed="'+!vong+'">Thanh</button></span></div>';
  if (!cats.length){
    h += '<div class="empty">Chưa có khoản chi nào trong tháng này.</div>';
  } else if (vong){
    var sel = state.bdCat != null && state.bdCat < cats.length ? state.bdCat : null;
    h += '<div class="bd-donut-wrap">' + bdDonut(cats, sel, tong) + '</div><div class="bd-leg">'
      + cats.map(function(c, i){
          return '<div class="bd-leg-r'+(sel === i ? ' sel' : '')+'" data-act="bdPick" data-i="'+i+'"><i style="background:'+c.mau+'"></i><span>'+esc(c.ten)+'</span><b>'+bdTien(c.v)+'</b><span class="p">'+Math.round(c.v / tong * 100)+'%</span></div>';
        }).join('') + '</div>';
  } else {
    h += bdHBars(cats, tong, { phanTram: true, soSanh: prev.coDl, nhanTruoc: prev.nhan });
  }
  var thu = bdXepCat('thu', cur.theoCatThu, null, 6);
  h += '<div class="bd-h" style="margin-top:22px">Thu theo danh mục'+(cur.tongThu > 0 ? '<b class="bd-tot">'+bdTien(cur.tongThu)+'</b>' : '')+'</div>';
  h += thu.length ? bdHBars(thu, cur.tongThu, { phanTram: true, nhanTong: 'tổng thu', mauChung: 'var(--bd-thu)' }) : '<div class="empty">Chưa có khoản thu nào trong tháng này.</div>';
  return h;
}

function bdXuHuongHtml(mk){
  var year = mk.slice(0, 4), labs = [], thu = [], chi = [], lastM = 0, i;
  for (var m = 1; m <= 12; m++){
    var k = year + '-' + pad2(m), t = bdThang(k);
    labs.push('T' + m); thu.push(t.tongThu); chi.push(t.tongChi);
    if (t.coDl){ lastM = m; }
  }
  var hom = todayStr();
  var hetM = year < hom.slice(0, 4) ? 12 : (year === hom.slice(0, 4) ? parseInt(hom.slice(5, 7), 10) : 0);
  var hien = Math.max(lastM, hetM, parseInt(mk.slice(5), 10));
  if (hien < 2) hien = Math.min(12, Math.max(2, hien));
  // trung bình / tiết kiệm chỉ tính các tháng ĐÃ TRỌN (bỏ tháng đang chạy dở: mới có vài ngày nên kéo số xuống).
  // Chỉ có mỗi tháng đang chạy dở thì đành tính nó.
  var dangDo = year === hom.slice(0, 4) ? parseInt(hom.slice(5, 7), 10) : 0;
  var coSo = [];
  for (i = 0; i < hien; i++){ if (thu[i] > 0 || chi[i] > 0) coSo.push(i + 1); }
  var tron = coSo.filter(function(mm){ return mm !== dangDo; });
  var dung = tron.length ? tron : coSo;
  var coChi = dung.filter(function(mm){ return chi[mm - 1] > 0; });
  var avg = coChi.length ? coChi.reduce(function(a, mm){ return a + chi[mm - 1]; }, 0) / coChi.length : 0;
  var tongTK = 0, tongThuNam = 0;
  dung.forEach(function(mm){ tongTK += thu[mm - 1] - chi[mm - 1]; tongThuNam += thu[mm - 1]; });
  var khoang = dung.length ? (dung.length > 1 ? 'T' + dung[0] + '–T' + dung[dung.length - 1] : 'T' + dung[0]) : '';
  var dangTrong = dangDo && dangDo <= hien && chi[dangDo - 1] + thu[dangDo - 1] > 0;
  var h = '<div class="bd-h">Thu / Chi theo tháng — '+year+'<span class="bd-key"><i class="sq thu"></i> Thu <i class="sq chi"></i> Chi</span></div><div class="bd-box">'
    + bdCombo({ W: 350, H: 210, labels: labs.slice(0, hien), thu: thu.slice(0, hien), chi: chi.slice(0, hien), sel: Math.min(hien, parseInt(mk.slice(5), 10)) - 1, avg: avg, aria: 'Thu chi theo tháng năm ' + year })
    + '</div><div class="bd-note">'+(dangTrong && tron.length ? 'T'+dangDo+' tính đến '+pad2(parseInt(hom.slice(8, 10), 10))+'/'+hom.slice(5, 7)+' · ' : '')+'chạm cột để xem từng tháng</div>';
  if (dung.length){
    var tl = tongThuNam > 0 ? Math.round(tongTK / tongThuNam * 100) : null;
    h += '<div class="bd-kpi" style="margin-top:12px"><div><small>Tiết kiệm TB/tháng</small><b>'+bdTien(tongTK / dung.length)+'</b><em class="muted">'+khoang+' · thu trừ chi</em></div>'
      + '<div><small>Tỉ lệ tiết kiệm</small><b>'+(tl != null ? tl + '%' : '—')+'</b>'
      + (tl != null ? '<span class="kbar"><i style="width:'+Math.max(0, Math.min(100, tl))+'%"></i></span>' : '<em class="muted">chưa có thu</em>')+'</div></div>';
  }
  // số dư cuối tháng, tối đa 10 tháng gần nhất tính tới tháng đang xem
  var ml = [], mv = [], mm2 = mk;
  var startLock = state.data.settings.ngayBatDau ? monthKey(state.data.settings.ngayBatDau) : '';
  for (i = 0; i < 10; i++){
    if (startLock && mm2 < startLock) break;
    ml.unshift('T' + parseInt(mm2.slice(5), 10) + (mm2.slice(0, 4) !== mk.slice(0, 4) ? '/' + mm2.slice(2, 4) : ''));
    mv.unshift(balanceAtEndOfMonth(mm2));
    mm2 = bdThangTruoc(mm2);
  }
  if (mv.length >= 2){
    h += '<div class="bd-h" style="margin-top:18px">Số dư cuối tháng<span>'+mv.length+' tháng gần nhất</span></div><div class="bd-box">'
      + bdLine({ W: 350, H: 170, labels: ml, series: [{ ten: 'Số dư', vals: mv, cls: 'blue', fill: true }], dots: true,
        tipTitle: function(ix){ return ml[ix]; }, money: bdTien, aria: 'Số dư cuối tháng' }) + '</div>';
  }
  return h;
}
function bieuDoInnerHtml(mk){
  var tab = state.bdTab || 'tq';
  var h = '<h3>Biểu đồ chi tiêu</h3><div class="bd-sub" role="tablist">'
    + [['tq', 'Tổng quan'], ['dm', 'Danh mục'], ['xh', 'Xu hướng']].map(function(t){
        return '<button type="button" role="tab" data-act="bdTab" data-tab="'+t[0]+'" class="'+(tab === t[0] ? 'on' : '')+'" aria-selected="'+(tab === t[0])+'">'+t[1]+'</button>';
      }).join('') + '</div>';
  h += tab === 'dm' ? bdDanhMucHtml(mk) : (tab === 'xh' ? bdXuHuongHtml(mk) : bdTongQuanHtml(mk));
  return h;
}
function bieuDoCardHtml(mk){
  return '<div class="card bd" id="bieuDoCard">' + bieuDoInnerHtml(mk) + '</div>';
}
// chỉ vẽ lại riêng thẻ biểu đồ (giữ nguyên vị trí cuộn của cả trang)
function veLaiBieuDo(){
  var el = document.getElementById('bieuDoCard');
  if (el) el.innerHTML = bieuDoInnerHtml(state.soTayMonth || monthKey(todayStr()));
}
function handleBieuDoAction(act, el){
  if (act === 'bdTab'){ state.bdTab = el.getAttribute('data-tab'); state.bdCat = null; veLaiBieuDo(); return true; }
  if (act === 'bdMode'){ state.bdMode = el.getAttribute('data-mode'); state.bdCat = null; veLaiBieuDo(); return true; }
  if (act === 'bdPick'){
    var i = parseInt(el.getAttribute('data-i'), 10);
    state.bdCat = (state.bdCat === i) ? null : i;
    veLaiBieuDo();
    return true;
  }
  if (act === 'hmXem'){ state.hmMoHet = !state.hmMoHet; renderBaoCao(); return true; }
  if (act === 'bdDay'){ state.bdDay = el.getAttribute('data-date'); veLaiBieuDo(); return true; }
  return false;
}

/* ====================================================================
   TAB BÁO CÁO — các khối trên đầu: thẻ đầu, Hạn mức (sotay.js), Tài sản ròng, Mục tiêu (sotay.js).
   "Nhịp" = phần tháng đã qua (ngày hôm nay / số ngày của tháng): vạch "Hôm nay" trên thanh hạn mức cho biết
   mức chi lẽ ra đã tới đâu. Chỉ tháng đang chạy mới có nhịp; tháng đã qua thì hết, tháng chưa tới thì chưa tính.
   Chỉ ĐỌC dữ liệu, không ghi gì.
   ==================================================================== */
function bcNhip(mk){
  var hom = todayStr(), cur = monthKey(hom), n = kySoNgay(mk);
  if (mk !== cur) return { dangChay: false, ngayQua: mk < cur ? n : 0, soNgay: n, tyLe: mk < cur ? 1 : 0 };
  var q = kyThuNgay(mk, hom);
  return { dangChay: true, ngayQua: q, soNgay: n, tyLe: q / n };
}
// vòng tròn tiến độ: pct 0..1, mau = lớp màu (ok / warn / over / mt / done), giua = chữ lớn, nho = chữ nhỏ dưới
function bcVong(pct, mau, giua, nho){
  var c = 2 * Math.PI * 26, p = Math.max(0, Math.min(1, pct));
  return '<div class="bc-vong"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" class="n"/>'
    + '<circle cx="32" cy="32" r="26" class="t '+mau+'" stroke-dasharray="'+(c * p).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 32 32)"/></svg>'
    + '<span class="g"><b>'+giua+'</b>'+(nho ? '<small>'+nho+'</small>' : '')+'</span></div>';
}
// biểu đồ cột nhỏ "chi mỗi ngày": tới hết denNgay; ngày chi nhiều nhất tô đậm
function bcSpark(chi, denNgay, soNgay){
  var W = 300, H = 40, bw = W / soNgay, mx = Math.max.apply(null, chi.slice(0, denNgay).concat([1])), s = '';
  for (var i = 0; i < soNgay; i++){
    if (i >= denNgay){ s += '<circle cx="'+(bw * i + bw / 2).toFixed(1)+'" cy="'+(H - 2)+'" r="1.2" class="f"/>'; continue; }
    var v = chi[i] || 0, h = v > 0 ? Math.max(3, v / mx * (H - 6)) : 1.5;
    s += '<rect x="'+(bw * i + bw * .17).toFixed(1)+'" y="'+(H - h).toFixed(1)+'" width="'+(bw * .66).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="1.5" class="'+(v > 0 && v === mx ? 'mx' : (v > 0 ? 'b' : 'z'))+'"/>';
  }
  return '<svg class="bc-spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="img" aria-label="Chi mỗi ngày">'+s+'</svg>';
}
// thẻ đầu: tổng đã chi, thanh dùng hạn mức (có vạch Hôm nay), dòng ước tính, chi mỗi ngày, chip cảnh báo
function baoCaoDauHtml(mk){
  var cur = bdThang(mk), nhip = bcNhip(mk), hom = todayStr(), dang = nhip.dangChay;
  var rows = hanMucThangRows(mk), cap = 0, daHM = 0;
  rows.forEach(function(r){ cap += r.cap; daHM += r.da; });
  var pct = cap > 0 ? daHM / cap : 0, muc = hanMucMuc(pct), rong = Math.min(100, Math.round(pct * 100));
  var nVuot = rows.filter(function(r){ return r.pct > 1; }).length;
  var nQuaHan = (state.data.mucTieu || []).filter(function(g){ return mucTieuTienDo(g, hom).quaHan; }).length;
  var h = '<div class="card hero bc-hero" id="bcDau"><div class="hero-top"><div class="hero-lbl">Đã chi '+(mk === monthKey(hom) ? 'tháng này' : monthLabel(mk).toLowerCase())+'</div>'+thangNavHtml(mk)+'</div>'
    + '<div class="bc-val"><span class="bc-v">'+bdTien(cur.tongChi)+'</span>'+(cap > 0 ? '<small class="bc-cap">/ '+bdTien(cap)+'</small>' : '')+'</div>';
  if (cap > 0){
    // vạch "Hôm nay": nhãn bám mép khi vạch sát hai đầu để không tràn khỏi thẻ
    var vi = Math.round(nhip.tyLe * 1000) / 10, canh = vi < 14 ? ' l' : (vi > 86 ? ' r' : '');
    h += '<div class="bc-pace '+muc+'" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rong+'" aria-label="Đã dùng hạn mức tháng">'
      + '<div class="hm-fill" style="width:'+rong+'%"></div>'
      + (dang ? '<i class="mk" style="left:'+vi+'%"></i><span class="mkl'+canh+'" style="left:'+vi+'%">Hôm nay</span>' : '') + '</div>'
      + '<div class="bc-pace-s"><span><b>'+Math.round(pct * 100)+'%</b> đã dùng</span>'
      + '<span>'+(daHM > cap ? 'vượt '+bdTien(daHM - cap) : 'còn '+bdTien(cap - daHM))+'</span></div>';
    if (dang) h += '<div class="bc-pace-n">Đã qua '+nhip.ngayQua+'/'+nhip.soNgay+' ngày</div>';
    if (Math.abs(daHM - cur.tongChi) > 0.5) h += '<div class="bc-pace-n">Hạn mức tính trên các danh mục đã đặt hạn mức: '+bdTien(daHM)+'</div>';
    if (dang && nhip.ngayQua >= 3 && cur.tongChi > 0){
      var du = bdUocTinhChiThang(mk, nhip.ngayQua).tong;
      h += '<div class="bc-ut">Giữ nhịp này, cuối tháng bạn chi khoảng <b>'+bdTien(du)+'</b> '
        + (du <= cap ? 'và còn dư ~<b>'+bdTien(cap - du)+'</b> hạn mức.' : 'và vượt ~<b>'+bdTien(du - cap)+'</b> hạn mức.') + '</div>';
    }
  } else {
    h += '<div class="bc-pace-n">Chưa đặt hạn mức cho danh mục chi nào. Đặt "Hạn mức/tháng" ở tab Danh mục để theo dõi ở đây.</div>';
  }
  if (cur.tongChi > 0){
    var den = dang ? nhip.ngayQua : cur.soNgay, mxD = 0, mxV = 0;
    cur.chi.forEach(function(v, i){ if (v > mxV){ mxV = v; mxD = i + 1; } });
    h += '<div class="bc-sp-h"><span>Chi mỗi ngày</span><span>TB '+bdTien(cur.tongChi / Math.max(1, den))+' · cao nhất '+ngayNganVN(kyNgay(mk, mxD))+'</span></div>'
      + bcSpark(cur.chi, den, cur.soNgay);
  }
  var chips = '';
  if (nVuot) chips += '<button type="button" class="bc-chip red" data-act="tqCuon" data-to="cardHanMuc"><i></i>'+nVuot+' danh mục vượt <span aria-hidden="true">›</span></button>';
  if (nQuaHan) chips += '<button type="button" class="bc-chip amber" data-act="tqCuon" data-to="cardMucTieu"><i></i>'+nQuaHan+' mục tiêu quá hạn <span aria-hidden="true">›</span></button>';
  return h + (chips ? '<div class="bc-chips">'+chips+'</div>' : '') + '</div>';
}

// thẻ Tài sản ròng: số cuối tháng đang xem, chênh lệch so với 12 tháng trước, bảng thành phần, đường tối đa 12 tháng
// (không vẽ tháng trước mốc chốt số dư)
function taiSanRongCardHtml(mk){
  var startLock = state.data.settings.ngayBatDau ? monthKey(state.data.settings.ngayBatDau) : '';
  if (startLock && mk < startLock) return '';
  var th = _thuHoiTheoKhoan(), cur = taiSanRongThang(mk, th);
  var tien = bdTien(cur.rong);
  var h = '<div class="card bc-card" id="cardTaiSanRong"><h3 class="bc-h"><span>Tài sản ròng cuối '+monthLabel(mk).toLowerCase()+'</span></h3>'
    + '<div class="tsr-val'+(cur.rong < 0 ? ' am' : '')+'" style="font-size:'+(tien.length > 13 ? 26 : 30)+'px">'+tien+'</div>';
  // so với 12 tháng trước; chưa đủ 12 tháng dữ liệu thì so với tháng xa nhất có thể và ghi đúng số tháng
  var xa = 12, mkXa = monthKeyAdd(mk, -12);
  while (xa > 0 && startLock && mkXa < startLock){ xa--; mkXa = monthKeyAdd(mk, -xa); }
  if (xa > 0){
    var dl = cur.rong - taiSanRongThang(mkXa, th).rong;
    if (Math.abs(dl) >= 1) h += '<div class="tsr-chip '+(dl > 0 ? 'up' : 'dn')+'">'+(dl > 0 ? '↑' : '↓')+' '+bdTien(Math.abs(dl))+' so với '+xa+' tháng trước</div>';
  }
  h += '<div class="tsr-tbl"><div><span>Tiền các ví</span><b>'+bdTien(cur.tien)+'</b></div>'
    + (cur.phaiThu > 0 ? '<div><span>+ Cho vay chưa thu</span><b class="thu">'+bdTien(cur.phaiThu)+'</b></div>' : '')
    + (cur.no > 0 ? '<div><span>− Nợ gốc còn lại</span><b class="chi">'+bdTien(cur.no)+'</b></div>' : '') + '</div>';
  var ml = [], mv = [], m = mk;
  for (var i = 0; i < 12; i++){
    if (startLock && m < startLock) break;
    ml.unshift('T' + parseInt(m.slice(5), 10) + (m.slice(0, 4) !== mk.slice(0, 4) ? '/' + m.slice(2, 4) : ''));
    mv.unshift(taiSanRongThang(m, th).rong);
    m = bdThangTruoc(m);
  }
  if (mv.length >= 2){
    h += '<div class="bd-box" style="margin-top:12px">' + bdLine({ W: 350, H: 170, labels: ml, series: [{ ten: 'Tài sản ròng', vals: mv, cls: cur.rong < 0 ? 'chi' : 'thu', fill: true }],
      tipTitle: function(ix){ return ml[ix]; }, money: bdTien, aria: 'Tài sản ròng cuối tháng' }) + '</div>';
  }
  h += ghiChuGon('Tài sản ròng = tiền trong các ví + tiền cho vay chưa thu về − nợ gốc còn phải trả (không tính lãi tương lai). '
    + 'Khoản đã tất toán không còn tính từ ngày tất toán.', 'Tính thế nào?');
  return h + '</div>';
}

/* ====================================================================
   TAB BÁO CÁO — gom các thẻ "xem lại" ra khỏi Sổ tay (Sổ tay chỉ còn việc hằng ngày):
   hạn mức tháng, mục tiêu tiết kiệm, biểu đồ. Dùng chung tháng đang xem với Sổ tay (state.soTayMonth).
   Chỉ ĐỌC dữ liệu (trừ nút "Gom thêm" của mục tiêu, xử lý ở sotay.js).
   ==================================================================== */
function renderBaoCao(){
  var root = document.getElementById('tabContent');
  if (!state.soTayMonth) state.soTayMonth = monthKey(todayStr());
  var mk = state.soTayMonth;
  // thứ tự: thẻ đầu (có thanh tháng) -> hạn mức -> tài sản ròng -> mục tiêu | biểu đồ (màn rộng: 2 cột)
  var html = '<div class="cot2"><div class="cot-trai">' + baoCaoDauHtml(mk);
  var hm = hanMucThangHtml(mk);
  html += hm || '<div class="card bc-card" id="cardHanMuc"><h3 class="bc-h">Hạn mức '+monthLabel(mk).toLowerCase()+'</h3><div class="empty" style="padding:0;text-align:left">'
    + 'Chưa đặt hạn mức cho danh mục chi nào. Đặt "Hạn mức/tháng" ở tab Danh mục để theo dõi ở đây.</div></div>';
  html += taiSanRongCardHtml(mk);
  html += mucTieuCardHtml();
  html += '</div><div class="cot-phai">' + bieuDoCardHtml(mk) + '</div></div>';
  root.innerHTML = html;
}
