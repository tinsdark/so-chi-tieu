"use strict";
/* ====================================================================
   vayno.js — toàn bộ logic + giao diện tab "Vay - Nợ": tính lịch trả nợ,
   render bảng Cho vay / Vay-Nợ phải trả, dòng tiền tích lũy tương lai,
   và xử lý các hành động (thêm/sửa/xóa/tất toán/ghi nhận thu-trả) của tab này.
   Cần state.js, drive-sync.js load trước.
   ==================================================================== */

var LOAI_VAY_LABEL = { ngan_hang:'Ngân hàng', vi:'Ví', ban_be:'Bạn bè', nguoi_than:'Người thân' };
var HINH_THUC_LABEL = { tra_1_lan:'Trả 1 lần', khong_lai:'Không lãi suất', co_lai:'Có lãi suất' };
var chartTichLuy = null;

function monthKeyAdd(mk, n){
  var p = mk.split('-'); var y = parseInt(p[0],10), m = parseInt(p[1],10) + n;
  while (m > 12){ m -= 12; y++; }
  while (m < 1){ m += 12; y--; }
  return y + '-' + pad2(m);
}
function loanIsActive(loan){ return loan.trangThai !== 'da_tra_het'; }
// trả về lịch trả từng tháng: [{mk, goc, lai, tongTra, duNoConLai}]
function tinhLichTraNo(loan){
  var sch = [];
  var startMk = monthKey(loan.ngayVay || todayStr());
  var goc0 = num(loan.soTienGoc);
  if (loan.hinhThuc === 'tra_1_lan'){
    var mkDue = loan.ngayDaoHan ? monthKey(loan.ngayDaoHan) : monthKeyAdd(startMk, num(loan.soThangVay) || 0);
    sch.push({ mk: mkDue, goc: goc0, lai: 0, tongTra: goc0, duNoConLai: 0 });
    return sch;
  }
  var n = Math.max(1, num(loan.soThangVay));
  if (loan.hinhThuc === 'khong_lai'){
    var gocThang = goc0 / n, duNo = goc0;
    for (var i=1;i<=n;i++){
      duNo -= gocThang;
      sch.push({ mk: monthKeyAdd(startMk,i), goc: gocThang, lai: 0, tongTra: gocThang, duNoConLai: Math.max(0,duNo) });
    }
    return sch;
  }
  // co_lai — trả đều (annuity), lãi %/năm quy đổi tháng
  var r = num(loan.laiSuatNam) / 12 / 100;
  var duNo2 = goc0;
  if (r <= 0){
    var gocThang2 = goc0 / n;
    for (var j=1;j<=n;j++){
      duNo2 -= gocThang2;
      sch.push({ mk: monthKeyAdd(startMk,j), goc: gocThang2, lai: 0, tongTra: gocThang2, duNoConLai: Math.max(0,duNo2) });
    }
    return sch;
  }
  var pow = Math.pow(1+r, n);
  var pmt = goc0 * r * pow / (pow - 1);
  for (var k=1;k<=n;k++){
    var laiK = duNo2 * r, gocK = pmt - laiK;
    duNo2 -= gocK;
    sch.push({ mk: monthKeyAdd(startMk,k), goc: gocK, lai: laiK, tongTra: pmt, duNoConLai: Math.max(0,duNo2) });
  }
  return sch;
}
function conLaiPhaiThu(loan){
  return Math.max(0, num(loan.soTien) - num(loan.daThu));
}
// số ngày quá hạn của 1 khoản cho vay (0 nếu chưa tới hạn / đã thu đủ)
function soNgayQuaHan(loan){
  if (!loan.ngayDuKienThu || loan.trangThai === 'da_thu_du') return 0;
  if (conLaiPhaiThu(loan) <= 0) return 0;
  var d = daysBetween(loan.ngayDuKienThu, todayStr());
  return d > 0 ? d : 0;
}
// tháng dự kiến trả hết nợ (mk của dòng cuối lịch trả)
function thangDuKienHetNo(loan){
  var sch = tinhLichTraNo(loan);
  return sch.length ? sch[sch.length-1].mk : null;
}

/* ====================================================================
   TRẢ NỢ THEO TỪNG KỲ
   loan.traNo = [{ ky, mk, soTien, ngay, truocKhiDungApp? }]
   Mỗi kỳ có 2 trạng thái: ĐÃ ghi nhận trả (kỳ coi như xong) / CHƯA trả.
   Trong kỳ đã ghi nhận còn phân biệt trả ĐỦ hay THIẾU so với lịch — số
   thiếu vài nghìn do làm tròn/phí vẫn tính là kỳ đã xong, chỉ hiện ra
   để biết, KHÔNG dồn ngược vào dư nợ (tiền thực tế đã nằm ở Sổ tay).
   ==================================================================== */
function kyRecords(loan, kyIdx){
  return (loan.traNo || []).filter(function(r){ return num(r.ky) === num(kyIdx); });
}
function kyDaGhiNhan(loan, kyIdx){ return kyRecords(loan, kyIdx).length > 0; }
// tổng tiền thực tế đã trả cho kỳ kyIdx
function soTienTraKy(loan, kyIdx){
  var s = 0;
  kyRecords(loan, kyIdx).forEach(function(r){ s += num(r.soTien); });
  return s;
}
// trạng thái 1 kỳ: 'chua' | 'du' | 'thieu'; thieu = số còn thiếu so với lịch
function kyStatus(loan, kyIdx, sch){
  sch = sch || tinhLichTraNo(loan);
  var can = sch[kyIdx] ? num(sch[kyIdx].tongTra) : 0;
  if (!kyDaGhiNhan(loan, kyIdx)) return { trangThai: 'chua', da: 0, can: can, lech: -can };
  var da = soTienTraKy(loan, kyIdx);
  var lech = da - can;
  return { trangThai: (lech >= -1 ? 'du' : 'thieu'), da: da, can: can, lech: lech };
}
// tiến độ trả nợ: tổng số kỳ, số kỳ ĐÃ ghi nhận, kỳ tiếp theo chưa ghi nhận
function tienDoTraNo(loan){
  var sch = tinhLichTraNo(loan);
  var daTraKy = 0, kyTiepTheo = null, kyTiepIdx = -1;
  for (var i=0;i<sch.length;i++){
    if (kyDaGhiNhan(loan, i)) daTraKy++;
    else if (!kyTiepTheo){ kyTiepTheo = sch[i]; kyTiepIdx = i; }
  }
  return { tongKy: sch.length, daTraKy: daTraKy, kyTiepTheo: kyTiepTheo, kyTiepIdx: kyTiepIdx, sch: sch };
}
// tổng số tiền còn phải trả (gồm lãi) = các kỳ CHƯA ghi nhận. Tất toán -> 0.
function soTienConLaiPhaiTra(loan){
  if (loan.tatToan) return 0;
  var sch = tinhLichTraNo(loan);
  var s = 0;
  for (var i = 0; i < sch.length; i++){
    if (!kyDaGhiNhan(loan, i)) s += num(sch[i].tongTra);
  }
  return s;
}
// tổng chênh lệch (âm = trả thiếu so với lịch) của các kỳ đã ghi nhận
function tongLechTraNo(loan){
  var sch = tinhLichTraNo(loan), s = 0;
  for (var i=0;i<sch.length;i++){
    if (!kyDaGhiNhan(loan, i)) continue;
    if (kyRecords(loan, i).every(function(r){ return r.truocKhiDungApp; })) continue;
    s += soTienTraKy(loan, i) - num(sch[i].tongTra);
  }
  return s;
}
// dự trù trả nợ tháng mk: chỉ các kỳ CHƯA ghi nhận (kỳ đã ghi nhận thì số thực
// tế đã nằm trong Sổ tay rồi, cộng thêm lịch nữa là tính 2 lần)
function tongTraNoThang(mk){
  var s = 0;
  (state.data.vayNo.vayNoPhaiTra||[]).forEach(function(loan){
    if (!loanIsActive(loan)) return;
    tinhLichTraNo(loan).forEach(function(row, idx){
      if (row.mk !== mk) return;
      if (kyDaGhiNhan(loan, idx)) return;
      s += num(row.tongTra);
    });
  });
  return s;
}
// dự trù thu hồi cho vay tháng mk. Khoản đã QUÁ HẠN mà chưa thu được thì dồn vào
// tháng hiện tại — để quá hạn ở tháng cũ là coi như khoản tiền đó bốc hơi khỏi dự báo.
function tongThuHoiThang(mk){
  var curMk = monthKey(todayStr());
  var s = 0;
  (state.data.vayNo.choVay||[]).forEach(function(loan){
    if (loan.trangThai === 'da_thu_du') return;
    var cl = conLaiPhaiThu(loan);
    if (cl <= 0) return;
    var duKien = monthKey(loan.ngayDuKienThu || todayStr());
    var eff = (duKien < curMk) ? curMk : duKien;
    if (eff === mk) s += cl;
  });
  return s;
}

/* ---- dòng tiền tích lũy tương lai (thẻ dưới cùng của tab Vay-Nợ) ---- */
function actualCatMonthAll(kind, mk){
  var s = 0;
  Object.keys(state.data.journal).forEach(function(d){
    if (monthKey(d) !== mk) return;
    var e = state.data.journal[d];
    s += (kind==='thu') ? thuTotal(e) : chiTotal(e);
  });
  return s;
}
// tổng thực tế của 1 danh mục trong 1 tháng (dùng để kiểm tra đã ghi Sổ tay chưa)
function actualCatInMonth(kind, cid, mk){
  var s = 0;
  Object.keys(state.data.journal).forEach(function(d){
    if (monthKey(d) !== mk) return;
    var obj = state.data.journal[d][kind] || {};
    s += num(obj[cid]);
  });
  return s;
}
function duTruDanhMucThang(kind, cid, mk){
  var cat0 = state.data.categories[kind].find(function(c){ return c.id===cid; });
  if (cat0 && cat0.khongDuTru) return 0;
  if (kind==='chi' && cid==='traNo') return tongTraNoThang(mk);
  if (kind==='thu' && cid==='thuHoiChoVay') return tongThuHoiThang(mk);
  if (cat0 && cat0.coDinhChiTieu) return num(cat0.chiTieu) > 0 ? num(cat0.chiTieu) : 0;
  var avg = recentAvgActual(kind, cid, 3);
  if (avg != null) return avg;
  var cat = state.data.categories[kind].find(function(c){ return c.id===cid; });
  return (cat && num(cat.chiTieu) > 0) ? num(cat.chiTieu) : 0;
}
function duTruThuThang(mk){
  var s=0; state.data.categories.thu.forEach(function(c){ s += duTruDanhMucThang('thu', c.id, mk); }); return s;
}
function duTruChiThang(mk){
  var s=0; state.data.categories.chi.forEach(function(c){ s += duTruDanhMucThang('chi', c.id, mk); }); return s;
}
// tháng hiện tại: các khoản BIẾT TRƯỚC (Trả nợ/Thu hồi cho vay theo lịch vay, hoặc danh mục có cờ
// "Cố định theo Chỉ tiêu") mà chưa ghi Sổ tay thì cộng thêm số biết trước đó; các danh mục còn lại
// (ước lượng, không cố định) vẫn giữ nguyên thực tế (có thể 0)
function tongThuThangCard(mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return duTruThuThang(mk);
  var s = actualCatMonthAll('thu', mk);
  if (mk === currentMk){
    if (!actualCatInMonth('thu','thuHoiChoVay',mk)) s += (tongThuHoiThang(mk) || 0);
    state.data.categories.thu.forEach(function(c){
      if (c.id === 'thuHoiChoVay') return;
      if (c.coDinhChiTieu && !actualCatInMonth('thu', c.id, mk)){
        var b = num(c.chiTieu);
        if (b > 0) s += b;
      }
    });
  }
  return s;
}
function tongChiThangCard(mk){
  var currentMk = monthKey(todayStr());
  if (mk > currentMk) return duTruChiThang(mk);
  var s = actualCatMonthAll('chi', mk);
  if (mk === currentMk){
    if (!actualCatInMonth('chi','traNo',mk)) s += (tongTraNoThang(mk) || 0);
    state.data.categories.chi.forEach(function(c){
      if (c.id === 'traNo') return;
      if (c.coDinhChiTieu && !actualCatInMonth('chi', c.id, mk)){
        var b = num(c.chiTieu);
        if (b > 0) s += b;
      }
    });
  }
  return s;
}

/* ---- render ---- */
function choVayFormHtml(){
  var editing = state.vnFormId ? state.data.vayNo.choVay.find(function(x){ return x.id===state.vnFormId; }) : null;
  var d = editing || { ten:'', soTien:'', ngayChoVay: todayStr(), ngayDuKienThu:'' };
  return '<div class="form-row" style="margin-top:10px">'
    + '<div><label>Tên / mô tả</label><input type="text" id="vn_cv_ten" value="'+(d.ten||'').replace(/"/g,'&quot;')+'"></div>'
    + '<div><label>Số tiền cho vay</label><input type="number" id="vn_cv_soTien" value="'+(d.soTien||'')+'" min="0"></div>'
    + '<div><label>Ngày cho vay</label><input type="date" id="vn_cv_ngay" value="'+(d.ngayChoVay||todayStr())+'"></div>'
    + '<div><label>Ngày dự kiến thu</label><input type="date" id="vn_cv_ngayThu" value="'+(d.ngayDuKienThu||'')+'"></div>'
    + '</div><div style="display:flex;gap:8px;margin-bottom:12px">'
    + '<button class="btn sm" data-act="vnSaveChoVay">Lưu</button>'
    + '<button class="btn secondary sm" data-act="vnCancelForm">Hủy</button></div>';
}

function vayNoFormHtml(){
  var editing = state.vnFormId ? state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===state.vnFormId; }) : null;
  var d = editing || { ten:'', loaiVay:'ngan_hang', hinhThuc:'khong_lai', soTienGoc:'', ngayVay: todayStr(), soThangVay:'', ngayDaoHan:'', laiSuatNam:'' };
  var loaiOpts = Object.keys(LOAI_VAY_LABEL).map(function(k){ return '<option value="'+k+'"'+(d.loaiVay===k?' selected':'')+'>'+LOAI_VAY_LABEL[k]+'</option>'; }).join('');
  var hinhOpts = Object.keys(HINH_THUC_LABEL).map(function(k){ return '<option value="'+k+'"'+(d.hinhThuc===k?' selected':'')+'>'+HINH_THUC_LABEL[k]+'</option>'; }).join('');
  return '<div class="form-row" style="margin-top:10px">'
    + '<div><label>Tên / mô tả</label><input type="text" id="vn_vn_ten" value="'+(d.ten||'').replace(/"/g,'&quot;')+'"></div>'
    + '<div><label>Loại vay</label><select id="vn_vn_loai">'+loaiOpts+'</select></div>'
    + '<div><label>Hình thức trả</label><select id="vn_vn_hinh">'+hinhOpts+'</select></div>'
    + '<div><label>Số tiền vay (gốc)</label><input type="number" id="vn_vn_soTien" value="'+(d.soTienGoc||'')+'" min="0"></div>'
    + '<div><label>Ngày vay</label><input type="date" id="vn_vn_ngay" value="'+(d.ngayVay||todayStr())+'"></div>'
    + '<div><label>Kỳ hạn (số tháng)</label><input type="number" id="vn_vn_soThang" value="'+(d.soThangVay||'')+'" placeholder="Bỏ trống nếu trả 1 lần" min="0"></div>'
    + '<div><label>Ngày đáo hạn (nếu trả 1 lần)</label><input type="date" id="vn_vn_daoHan" value="'+(d.ngayDaoHan||'')+'"></div>'
    + '<div><label>Lãi suất %/năm</label><input type="number" id="vn_vn_laiSuat" value="'+(d.laiSuatNam||'')+'" placeholder="Chỉ cần nếu có lãi suất" min="0"></div>'
    // "Số kỳ đã trả" CHỈ có khi thêm mới (khoản vay cũ đã trả được mấy kỳ trước khi nhập vào app).
    // Khi SỬA thì không được có ô này: sửa số kỳ ở đây sẽ ghi đè lịch sử trả nợ thực tế
    // mà không sinh/xóa giao dịch tương ứng -> số dư lệch. Sửa lịch sử bằng "Hủy ghi nhận" ở lịch trả.
    + (editing ? '' : '<div><label>Số kỳ đã trả trước khi nhập vào đây</label><input type="number" id="vn_vn_daTraKy" value="" placeholder="0" min="0"></div>')
    + '</div>'
    + (editing ? '<div class="empty" style="padding:0 0 10px">Muốn sửa lịch sử trả nợ thì mở lịch trả của khoản vay (bấm vào tên) rồi dùng "Hủy ghi nhận" / "Ghi nhận đã trả" — sửa ở đó mới đồng bộ được với Sổ tay.</div>' : '')
    + '<div style="display:flex;gap:8px;margin-bottom:12px">'
    + '<button class="btn sm" data-act="vnSaveVayNo">Lưu</button>'
    + '<button class="btn secondary sm" data-act="vnCancelForm">Hủy</button></div>';
}

function vayNoScheduleHtml(loan){
  var tienDo = tienDoTraNo(loan);
  var sch = tienDo.sch;
  // kỳ đã ghi nhận MỚI NHẤT mới được hủy, để lịch sử không bị rỗ giữa
  var lastPaidIdx = -1;
  for (var i=0;i<sch.length;i++){ if (kyDaGhiNhan(loan, i)) lastPaidIdx = i; }
  var html = '<div class="table-wrap" style="margin:8px 0"><table><thead><tr><th>Tháng</th><th>Gốc</th><th>Lãi</th><th>Theo lịch</th><th>Thực trả</th><th>Dư nợ còn lại</th><th>Trạng thái</th><th></th></tr></thead><tbody>';
  sch.forEach(function(row, idx){
    var st = kyStatus(loan, idx, sch);
    var paid = st.trangThai !== 'chua';
    var badge;
    if (st.trangThai === 'du')        badge = '<span style="color:var(--green)">✓ đã trả đủ kỳ</span>';
    else if (st.trangThai === 'thieu')badge = '<span style="color:var(--red)">⚠ chưa trả đủ kỳ (thiếu '+fmt(Math.round(-st.lech))+')</span>';
    else                              badge = '<span style="color:var(--muted)">chưa trả</span>';
    var btn = '';
    if (!paid && idx === tienDo.kyTiepIdx){
      btn = '<button class="btn sm" data-act="vnGhiNhanTra" data-id="'+loan.id+'" data-ky="'+idx+'" data-tong="'+row.tongTra+'" data-mk="'+row.mk+'">Ghi nhận đã trả</button>';
    } else if (paid && idx === lastPaidIdx){
      btn = '<button class="btn sm secondary" data-act="vnHuyGhiNhanTra" data-id="'+loan.id+'" data-ky="'+idx+'" title="Hủy ghi nhận kỳ này, hoàn lại giao dịch ở Sổ tay">Hủy ghi nhận</button>';
    }
    html += '<tr'+(paid?' style="color:var(--muted)"':'')+'>'
      + '<td>'+monthLabel(row.mk)+'</td>'
      + '<td>'+fmt(Math.round(row.goc))+'</td>'
      + '<td>'+fmt(Math.round(row.lai))+'</td>'
      + '<td>'+fmt(Math.round(row.tongTra))+'</td>'
      + '<td>'+(paid ? fmt(Math.round(st.da)) : '—')+'</td>'
      + '<td>'+fmt(Math.round(row.duNoConLai))+'</td>'
      + '<td>'+badge+'</td>'
      + '<td>'+btn+'</td>'
      + '</tr>';
  });
  html += '</tbody></table></div>';
  var lech = tongLechTraNo(loan);
  if (Math.abs(lech) >= 1){
    html += '<div class="empty" style="padding:0 0 8px">Chênh lệch giữa thực trả và lịch: '
      + (lech < 0 ? 'trả thiếu ' : 'trả thừa ') + fmt(Math.round(Math.abs(lech)))
      + '. Không cộng ngược vào dư nợ — số tiền thực tế đã ghi ở Sổ tay.</div>';
  }
  if (loan.tatToan){
    html += '<div class="empty" style="padding:0 0 8px">Đã tất toán ngày '+(loan.tatToan.ngay||'')+' với số tiền '+fmt(loan.tatToan.soTien)+'.</div>';
  }
  return html;
}

function renderVayNo(){
  var root = document.getElementById('tabContent');
  var choVay = state.data.vayNo.choVay;
  var vayNoPhaiTra = state.data.vayNo.vayNoPhaiTra;
  var html = '';

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Cho vay <button class="btn sm" data-act="vnAddChoVay">+ Thêm khoản cho vay</button></h3>';
  if (state.vnFormKind === 'choVay') html += choVayFormHtml();
  if (!choVay.length){
    html += '<div class="empty">Chưa có khoản cho vay nào.</div>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Tên</th><th>Số tiền</th><th>Đã thu</th><th>Còn lại</th><th>Dự kiến thu</th><th>Trạng thái</th><th class="actions-col"></th></tr></thead><tbody>';
    choVay.forEach(function(c){
      var conLai = conLaiPhaiThu(c);
      var qh = soNgayQuaHan(c);
      var tt = (c.trangThai==='da_thu_du')
        ? 'Đã thu đủ'
        : (qh > 0
            ? '<span style="color:var(--red);font-weight:600">Quá hạn '+qh+' ngày</span>'
            : 'Đang chờ');
      html += '<tr>'
        + '<td style="text-align:left">'+c.ten+'</td>'
        + '<td>'+fmt(c.soTien)+'</td>'
        + '<td>'+fmt(c.daThu)+'</td>'
        + '<td>'+fmt(conLai)+'</td>'
        + '<td>'+(c.ngayDuKienThu||'')+'</td>'
        + '<td>'+tt+'</td>'
        + '<td class="actions-col">'
        + (conLai>0 ? '<button class="icon-btn" data-act="vnGhiNhanThu" data-id="'+c.id+'" title="Ghi nhận đã thu">✓</button>' : '')
        + '<button class="icon-btn" data-act="vnEditChoVay" data-id="'+c.id+'">✎</button>'
        + '<button class="icon-btn" data-act="vnDelChoVay" data-id="'+c.id+'">🗑</button>'
        + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Vay - Nợ phải trả <button class="btn sm" data-act="vnAddVayNo">+ Thêm khoản vay</button></h3>';
  if (state.vnFormKind === 'vayNoPhaiTra') html += vayNoFormHtml();
  if (!vayNoPhaiTra.length){
    html += '<div class="empty">Chưa có khoản vay nào.</div>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Tên</th><th>Loại vay</th><th>Hình thức</th><th>Đã trả</th><th>Dư nợ còn lại</th><th>Số tiền trả kỳ tới</th><th>Dự kiến hết nợ</th><th>Trạng thái</th><th class="actions-col"></th></tr></thead><tbody>';
    vayNoPhaiTra.forEach(function(v){
      var duNo = soTienConLaiPhaiTra(v);
      var hetNoMk = thangDuKienHetNo(v);
      var tienDo = tienDoTraNo(v);
      html += '<tr>'
        + '<td style="text-align:left"><a href="#" data-act="vnToggleDetail" data-id="'+v.id+'" style="color:var(--primary-d);text-decoration:none">'+v.ten+'</a></td>'
        + '<td>'+LOAI_VAY_LABEL[v.loaiVay]+'</td>'
        + '<td>'+HINH_THUC_LABEL[v.hinhThuc]+'</td>'
        + '<td>'+tienDo.daTraKy+'/'+tienDo.tongKy+' kỳ</td>'
        + '<td>'+fmt(duNo)+'</td>'
        + '<td>'+(tienDo.kyTiepTheo ? fmt(Math.round(tienDo.kyTiepTheo.tongTra))+' ('+monthLabel(tienDo.kyTiepTheo.mk)+')' : '—')+'</td>'
        + '<td>'+(hetNoMk?monthLabel(hetNoMk):'—')+'</td>'
        + '<td>'+(v.tatToan ? 'Đã tất toán' : (v.trangThai==='da_tra_het'?'Đã trả hết':'Đang vay'))+'</td>'
        + '<td class="actions-col">'
        + (loanIsActive(v) ? '<button class="btn sm secondary" data-act="vnTatToan" data-id="'+v.id+'" title="Tất toán sớm toàn bộ khoản vay">Tất toán</button>' : '')
        + '<button class="icon-btn" data-act="vnEditVayNo" data-id="'+v.id+'">✎</button>'
        + '<button class="icon-btn" data-act="vnDelVayNo" data-id="'+v.id+'">🗑</button>'
        + '</td></tr>';
      if (state.vnDetailId === v.id){
        html += '<tr><td colspan="9">'+vayNoScheduleHtml(v)+'</td></tr>';
      }
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  var horizon = state.vnHorizon || 12;
  var startMk = monthKey(todayStr());
  var months = [];
  for (var i=0;i<horizon;i++) months.push(monthKeyAdd(startMk, i));
  var runningBal = balanceBeforeMonth(startMk);
  var rowsData = months.map(function(mk){
    var thu = tongThuThangCard(mk), chi = tongChiThangCard(mk);
    runningBal += thu - chi;
    return { mk:mk, thu:thu, chi:chi, bal: runningBal };
  });

  html += '<div class="card"><h3 style="display:flex;align-items:center;justify-content:space-between">Dòng tiền tích lũy tương lai'
    + '<select id="vn_horizon" data-act="vnHorizonChange" style="width:auto;font-size:12px;padding:4px 8px">'
    + [6,12,24].map(function(h){ return '<option value="'+h+'"'+(h===horizon?' selected':'')+'>'+h+' tháng tới</option>'; }).join('')
    + '</select></h3>';
  html += '<div class="empty" style="padding:0 0 10px">Tháng hiện tại/quá khứ dùng số thực tế từ Sổ tay; tháng tương lai dùng gợi ý: TB của tối đa 3 tháng ĐÃ HOÀN CHỈNH gần nhất (tính từ "Tháng bắt đầu dự trù" ở tab Danh mục), chưa có tháng hoàn chỉnh nào thì dùng Chỉ tiêu/tháng. Riêng Trả nợ/Thu hồi cho vay lấy thẳng từ lịch vay (kỳ đã ghi nhận trả thì không cộng lại; khoản cho vay quá hạn dồn vào tháng hiện tại), và các danh mục có cờ "Cố định theo Chỉ tiêu": nếu tháng hiện tại chưa ghi Sổ tay thì vẫn hiện số biết trước.</div>';
  html += '<div class="table-wrap"><table><thead><tr><th style="text-align:left">Tháng</th><th>Thu</th><th>Chi</th><th>Số dư lũy kế</th></tr></thead><tbody>';
  rowsData.forEach(function(r){
    html += '<tr><td style="text-align:left">'+monthLabel(r.mk)+'</td><td style="color:var(--green)">'+fmt(Math.round(r.thu))+'</td><td style="color:var(--red)">'+fmt(Math.round(r.chi))+'</td><td>'+fmt(Math.round(r.bal))+'</td></tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="chart-box" style="margin-top:10px"><canvas id="chartTichLuy"></canvas></div>';
  html += '</div>';

  root.innerHTML = html;
  drawTichLuyChart(rowsData);
}

function drawTichLuyChart(rowsData){
  if (chartTichLuy) chartTichLuy.destroy();
  var ctx = document.getElementById('chartTichLuy');
  if (!ctx) return;
  chartTichLuy = new Chart(ctx, { type:'line',
    data:{ labels: rowsData.map(function(r){ return monthLabel(r.mk); }), datasets:[
      { label:'Số dư lũy kế', data: rowsData.map(function(r){ return Math.round(r.bal); }), borderColor:'#4f46e5', backgroundColor:'rgba(79,70,229,.1)', fill:true, tension:.25 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ title:{display:true,text:'Số dư lũy kế dự kiến'}, legend:{display:false} }, scales:{ y:{ ticks:{ callback:function(v){ return v>=1000?(v/1000)+'k':v; } } } } }
  });
}

/* ---- hoàn tác phần ở KHOẢN VAY của 1 ref (phần journal do nơi gọi tự xóa) ----
   Dùng khi xóa 1 ngày ở Sổ tay: tiền mất khỏi journal thì tiến độ trả nợ / đã thu
   của khoản vay cũng phải lùi lại, không thì 2 bên lệch nhau. */
function loanRevertRef(r){
  if (r.loai === 'traNo'){
    var l = (state.data.vayNo.vayNoPhaiTra||[]).find(function(x){ return x.id === r.loanId; });
    if (!l) return;
    l.traNo = (l.traNo||[]).filter(function(x){ return num(x.ky) !== num(r.ky); });
    if (!l.tatToan && soTienConLaiPhaiTra(l) > 0.01) l.trangThai = 'dang_vay';
  } else if (r.loai === 'tatToan'){
    var l2 = (state.data.vayNo.vayNoPhaiTra||[]).find(function(x){ return x.id === r.loanId; });
    if (!l2) return;
    delete l2.tatToan;
    l2.trangThai = soTienConLaiPhaiTra(l2) > 0.01 ? 'dang_vay' : 'da_tra_het';
  } else if (r.loai === 'thuHoiChoVay'){
    var c = (state.data.vayNo.choVay||[]).find(function(x){ return x.id === r.loanId; });
    if (!c) return;
    c.daThu = Math.max(0, num(c.daThu) - num(r.soTien));
    if (c.daThu < num(c.soTien) - 0.01) c.trangThai = 'dang_cho';
  }
  // nhanTienVay / choVay là giao dịch GỐC sinh ra khoản vay -> không hoàn ở đây,
  // phải sửa/xóa chính khoản vay ở tab Vay - Nợ (xem chặn ở delDay của sotay.js)
}

/* ---- xóa khoản vay: báo rõ sẽ xóa những giao dịch nào, số dư đổi thế nào ---- */
var REF_LABEL = {
  nhanTienVay: 'Nhận tiền vay',
  thuHoiChoVay: 'Thu hồi cho vay',
  choVay: 'Cho vay (chi)',
  traNo: 'Trả nợ',
  tatToan: 'Tất toán'
};
function vnLoanRefs(loanId){
  var out = [];
  Object.keys(state.data.journal).forEach(function(date){
    (state.data.journal[date].refs || []).forEach(function(r){
      if (r.loanId === loanId) out.push({ date: date, loai: r.loai, soTien: num(r.soTien) });
    });
  });
  out.sort(function(a,b){ return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return out;
}
function vnConfirmDelete(loanId, nhan){
  var refs = vnLoanRefs(loanId);
  var msg = 'Xóa ' + nhan + ' này?';
  if (!refs.length){
    msg += '\n\nKhông có giao dịch nào ở Sổ tay gắn với khoản này.';
  } else {
    var delta = 0;
    msg += '\n\nSẽ XÓA LUÔN ' + refs.length + ' giao dịch mà khoản này đã sinh ra ở Sổ tay:\n';
    refs.forEach(function(r, i){
      var m = REF_MAP[r.loai];
      var laThu = !!(m && m.kind === 'thu');
      delta += laThu ? -r.soTien : r.soTien;
      if (i < 15) msg += '  ' + r.date + ' · ' + (REF_LABEL[r.loai]||r.loai) + ' · ' + fmt(r.soTien) + (laThu ? ' (thu)' : ' (chi)') + '\n';
    });
    if (refs.length > 15) msg += '  … và ' + (refs.length - 15) + ' giao dịch nữa\n';
    var cur = balanceAt('9999-12-31');
    msg += '\nSố dư hiện tại: ' + fmt(Math.round(cur))
         + '\nSố dư sau khi xóa: ' + fmt(Math.round(cur + delta));
  }
  return confirm(msg);
}

/* ---- xử lý sự kiện của tab Vay-Nợ ---- */
// trả về true nếu đã xử lý (để app.js biết không cần thử module khác)
function handleVayNoAction(act, el){
  if (act === 'vnAddChoVay'){
    state.vnFormKind = 'choVay'; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnAddVayNo'){
    state.vnFormKind = 'vayNoPhaiTra'; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnCancelForm'){
    state.vnFormKind = null; state.vnFormId = null; renderVayNo();
  } else if (act === 'vnEditChoVay'){
    state.vnFormKind = 'choVay'; state.vnFormId = el.getAttribute('data-id'); renderVayNo();
  } else if (act === 'vnEditVayNo'){
    state.vnFormKind = 'vayNoPhaiTra'; state.vnFormId = el.getAttribute('data-id'); renderVayNo();
  } else if (act === 'vnSaveChoVay'){
    var tenCV = document.getElementById('vn_cv_ten').value.trim();
    if (!tenCV){ alert('Nhập tên khoản cho vay.'); return true; }
    var objCV = {
      ten: tenCV,
      soTien: numNonNeg(document.getElementById('vn_cv_soTien').value),
      ngayChoVay: document.getElementById('vn_cv_ngay').value || todayStr(),
      ngayDuKienThu: document.getElementById('vn_cv_ngayThu').value || ''
    };
    // ngày dự kiến thu không được trước ngày cho vay
    if (objCV.ngayDuKienThu && objCV.ngayDuKienThu < objCV.ngayChoVay){
      alert('Ngày dự kiến thu ('+objCV.ngayDuKienThu+') không được trước ngày cho vay ('+objCV.ngayChoVay+').');
      return true;
    }
    var cvId;
    if (state.vnFormId){
      var oldCV = state.data.vayNo.choVay.find(function(x){ return x.id===state.vnFormId; });
      Object.assign(oldCV, objCV);
      cvId = oldCV.id;
    } else {
      objCV.id = 'cv_' + slugify(tenCV) + '_' + Date.now().toString(36);
      objCV.daThu = 0;
      objCV.trangThai = 'dang_cho';
      state.data.vayNo.choVay.push(objCV);
      cvId = objCV.id;
    }
    // Cho vay = tiền RA khỏi ví -> phải ghi chi, đối xứng với "Nhận tiền vay".
    // upsert: sửa số/ngày thì giao dịch cũ bị xóa rồi ghi lại, không cộng dồn.
    if (objCV.soTien > 0){
      journalUpsertRef(objCV.ngayChoVay, cvId, 'choVay', objCV.soTien, 'Cho vay: ' + objCV.ten);
    } else {
      journalRemoveRefs(cvId, 'choVay', null);
    }
    state.vnFormKind = null; state.vnFormId = null;
    scheduleSave(); renderVayNo();
  } else if (act === 'vnSaveVayNo'){
    var tenVN = document.getElementById('vn_vn_ten').value.trim();
    if (!tenVN){ alert('Nhập tên khoản vay.'); return true; }
    var hinh = document.getElementById('vn_vn_hinh').value;
    var objVN = {
      ten: tenVN,
      loaiVay: document.getElementById('vn_vn_loai').value,
      hinhThuc: hinh,
      soTienGoc: numNonNeg(document.getElementById('vn_vn_soTien').value),
      ngayVay: document.getElementById('vn_vn_ngay').value || todayStr(),
      soThangVay: numNonNeg(document.getElementById('vn_vn_soThang').value),
      ngayDaoHan: document.getElementById('vn_vn_daoHan').value || '',
      laiSuatNam: numNonNeg(document.getElementById('vn_vn_laiSuat').value)
    };
    if (hinh === 'tra_1_lan' && !objVN.ngayDaoHan && !objVN.soThangVay){
      alert('Nhập ngày đáo hạn hoặc kỳ hạn (số tháng) cho khoản vay trả 1 lần.'); return true;
    }
    if (hinh !== 'tra_1_lan' && !objVN.soThangVay){
      alert('Nhập kỳ hạn (số tháng) trả.'); return true;
    }
    var vnTarget = state.vnFormId
      ? state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===state.vnFormId; })
      : null;
    var schVN = tinhLichTraNo(objVN);
    if (vnTarget){
      Object.assign(vnTarget, objVN);
      // kỳ hạn bị rút ngắn -> các kỳ đã ghi nhận vượt ngoài lịch mới là vô nghĩa,
      // phải hoàn lại giao dịch Sổ tay của chúng, không được để lại ref mồ côi
      var orphan = (vnTarget.traNo||[]).filter(function(r){ return num(r.ky) >= schVN.length; });
      if (orphan.length){
        if (!confirm('Kỳ hạn mới chỉ còn '+schVN.length+' kỳ, nhưng đang có '+orphan.length
            +' kỳ đã ghi nhận trả nằm ngoài lịch mới.\nTiếp tục sẽ HỦY ghi nhận các kỳ đó và hoàn lại giao dịch tương ứng ở Sổ tay. Đồng ý?')){
          return true;
        }
        orphan.forEach(function(r){ journalRemoveRefs(vnTarget.id, 'traNo', r.ky); });
        vnTarget.traNo = (vnTarget.traNo||[]).filter(function(r){ return num(r.ky) < schVN.length; });
      }
      if (soTienConLaiPhaiTra(vnTarget) <= 0.01 && schVN.length) vnTarget.trangThai = 'da_tra_het';
      else if (!vnTarget.tatToan) vnTarget.trangThai = 'dang_vay';
      // sửa gốc/ngày vay -> cập nhật luôn giao dịch "Nhận tiền vay" đã sinh ra trước đó
      if (vnTarget.soTienGoc > 0){
        journalUpsertRef(vnTarget.ngayVay, vnTarget.id, 'nhanTienVay', vnTarget.soTienGoc, 'Nhận tiền vay: ' + vnTarget.ten);
      } else {
        journalRemoveRefs(vnTarget.id, 'nhanTienVay', null);
      }
    } else {
      objVN.id = 'vn_' + slugify(tenVN) + '_' + Date.now().toString(36);
      objVN.trangThai = 'dang_vay';
      // số kỳ đã trả TRƯỚC khi nhập vào app: dựng sẵn traNo[] theo đúng lịch,
      // gắn truocKhiDungApp để không sinh giao dịch Sổ tay (tiền đã đi từ trước)
      var daTraKyInput = Math.max(0, Math.floor(numNonNeg(document.getElementById('vn_vn_daTraKy').value)));
      daTraKyInput = Math.min(daTraKyInput, schVN.length);
      objVN.traNo = [];
      for (var iDK=0; iDK<daTraKyInput; iDK++){
        objVN.traNo.push({ ky: iDK, mk: schVN[iDK].mk, soTien: schVN[iDK].tongTra, ngay: objVN.ngayVay, truocKhiDungApp: true });
      }
      if (daTraKyInput >= schVN.length && schVN.length) objVN.trangThai = 'da_tra_het';
      state.data.vayNo.vayNoPhaiTra.push(objVN);
      if (objVN.soTienGoc > 0){
        journalUpsertRef(objVN.ngayVay || todayStr(), objVN.id, 'nhanTienVay', objVN.soTienGoc, 'Nhận tiền vay: ' + objVN.ten);
      }
    }
    state.vnFormKind = null; state.vnFormId = null;
    scheduleSave(); renderVayNo();
  } else if (act === 'vnDelChoVay'){
    var idDC = el.getAttribute('data-id');
    if (vnConfirmDelete(idDC, 'khoản cho vay')){
      journalRemoveLoanRefs(idDC);
      state.data.vayNo.choVay = state.data.vayNo.choVay.filter(function(x){ return x.id!==idDC; });
      scheduleSave(); renderVayNo();
    }
  } else if (act === 'vnDelVayNo'){
    var idDV = el.getAttribute('data-id');
    if (vnConfirmDelete(idDV, 'khoản vay')){
      journalRemoveLoanRefs(idDV);
      state.data.vayNo.vayNoPhaiTra = state.data.vayNo.vayNoPhaiTra.filter(function(x){ return x.id!==idDV; });
      scheduleSave(); renderVayNo();
    }
  } else if (act === 'vnToggleDetail'){
    var idTD = el.getAttribute('data-id');
    state.vnDetailId = (state.vnDetailId === idTD) ? null : idTD;
    renderVayNo();
  } else if (act === 'vnGhiNhanThu'){
    var idGT = el.getAttribute('data-id');
    var cvItem = state.data.vayNo.choVay.find(function(x){ return x.id===idGT; });
    if (!cvItem) return true;
    var conLaiGT = conLaiPhaiThu(cvItem);
    var amtStr = prompt('Số tiền đã thu được (còn phải thu: '+fmt(conLaiGT)+'):', conLaiGT);
    if (amtStr === null) return true;
    var amt = numNonNeg(amtStr);
    if (amt <= 0) return true;
    cvItem.daThu = num(cvItem.daThu) + amt;
    if (cvItem.daThu >= cvItem.soTien - 0.01) cvItem.trangThai = 'da_thu_du';
    journalAddRef(todayStr(), cvItem.id, 'thuHoiChoVay', amt, 'Thu hồi: ' + cvItem.ten);
    scheduleSave(); renderVayNo();
  } else if (act === 'vnGhiNhanTra'){
    var idGTr = el.getAttribute('data-id');
    var vnItem = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idGTr; });
    if (!vnItem) return true;
    var kyGTr = parseInt(el.getAttribute('data-ky'), 10);
    var mkGTr = el.getAttribute('data-mk');
    var tongKy = num(el.getAttribute('data-tong'));
    if (isNaN(kyGTr) || kyDaGhiNhan(vnItem, kyGTr)) return true;
    var amtStr2 = prompt('Số tiền trả kỳ '+(kyGTr+1)+' ('+monthLabel(mkGTr)+')\nTheo lịch: '+fmt(Math.round(tongKy))
      + '\n\nNhập đúng số thực trả. Trả thiếu vài nghìn vẫn tính là ĐÃ TRẢ ĐỦ KỲ, chênh lệch được hiện riêng:', Math.round(tongKy));
    if (amtStr2 === null) return true;
    var amt2 = numNonNeg(amtStr2);
    if (amt2 <= 0){ alert('Nhập số tiền thực trả lớn hơn 0.'); return true; }
    vnItem.traNo = vnItem.traNo || [];
    vnItem.traNo.push({ ky: kyGTr, mk: mkGTr, soTien: amt2, ngay: todayStr() });
    journalAddRef(todayStr(), vnItem.id, 'traNo', amt2, 'Trả nợ: '+vnItem.ten+' (kỳ '+(kyGTr+1)+')', { ky: kyGTr });
    if (soTienConLaiPhaiTra(vnItem) <= 0.01) vnItem.trangThai = 'da_tra_het';
    scheduleSave(); renderVayNo();
  } else if (act === 'vnHuyGhiNhanTra'){
    var idHuy = el.getAttribute('data-id');
    var vnHuy = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idHuy; });
    if (!vnHuy) return true;
    var kyHuy = parseInt(el.getAttribute('data-ky'), 10);
    if (isNaN(kyHuy) || !kyDaGhiNhan(vnHuy, kyHuy)) return true;
    var daHuy = soTienTraKy(vnHuy, kyHuy);
    var truoc = kyRecords(vnHuy, kyHuy).every(function(r){ return r.truocKhiDungApp; });
    if (!confirm('Hủy ghi nhận trả kỳ '+(kyHuy+1)+' ('+fmt(Math.round(daHuy))+')?\n'
        + (truoc ? 'Kỳ này được khai là đã trả trước khi dùng app nên không có giao dịch Sổ tay để hoàn.'
                 : 'Giao dịch "Trả nợ" tương ứng ở Sổ tay sẽ bị xóa, số dư hoàn lại.'))) return true;
    journalRemoveRefs(vnHuy.id, 'traNo', kyHuy);
    vnHuy.traNo = (vnHuy.traNo||[]).filter(function(r){ return num(r.ky) !== kyHuy; });
    if (!vnHuy.tatToan && soTienConLaiPhaiTra(vnHuy) > 0.01) vnHuy.trangThai = 'dang_vay';
    scheduleSave(); renderVayNo();
  } else if (act === 'vnTatToan'){
    var idTT = el.getAttribute('data-id');
    var vnTT = state.data.vayNo.vayNoPhaiTra.find(function(x){ return x.id===idTT; });
    if (!vnTT) return true;
    var duNoTT = soTienConLaiPhaiTra(vnTT);
    var amtStrTT = prompt('Số tiền tất toán khoản "'+vnTT.ten+'"\nDư nợ lý thuyết còn lại: '+fmt(Math.round(duNoTT))
      + '\n\nNhập đúng số ngân hàng/bên cho vay báo (có thể khác số lý thuyết):', Math.round(duNoTT) || '');
    if (amtStrTT === null) return true;
    var amtTT = numNonNeg(amtStrTT);
    if (amtTT <= 0){ alert('Nhập số tiền tất toán hợp lệ.'); return true; }
    // ghi nhận tất toán vào DATA (không chỉ là đổi trạng thái): số tiền + ngày,
    // kèm giao dịch chi ở Sổ tay có ref để xóa khoản vay thì hoàn lại được
    var dateTT = todayStr();
    vnTT.tatToan = { soTien: amtTT, ngay: dateTT };
    vnTT.trangThai = 'da_tra_het';
    journalAddRef(dateTT, vnTT.id, 'tatToan', amtTT, 'Tất toán: '+vnTT.ten);
    scheduleSave(); renderVayNo();
  } else {
    return false;
  }
  return true;
}

function handleVayNoChange(el){
  if (el.matches('[data-act=vnHorizonChange]')){
    state.vnHorizon = parseInt(el.value, 10);
    renderVayNo();
    return true;
  }
  return false;
}
