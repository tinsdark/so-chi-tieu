"use strict";
/* ====================================================================
   ht.js — TUỲ CHỌN HIỂN THỊ theo TỪNG MÁY (localStorage 'sct_hien_thi_v1', như chế độ tối, KHÔNG lên Drive): thẻ nào hiện / ẩn, thứ tự thẻ,
   loại thông báo nào bị tắt ở chuông. Điện thoại và máy tính có thể bày khác nhau.
   Chỉ đổi cách VẼ: ẩn một thẻ không đổi số liệu nào, không đổi chuông (trừ loại thông báo bị tắt, xem chuong.js).
   Dữ liệu: { an: { nhom: [id...] }, thuTu: { nhom: [id...] }, tbTat: [loai...] }
   Mỗi nhóm có danh sách thẻ gốc (HT_THE) với thứ tự mặc định; thẻ mới thêm sau này tự rơi vào cuối thứ tự đã lưu.
   Thẻ có khoa:true thì không ẩn được (bỏ đi là tab mất tác dụng); khongThuTu:true thì không đổi được vị trí (nằm cố định trong thẻ đầu / cột phải).
   localStorage hỏng / bị chặn thì dùng mặc định, không báo lỗi.
   ==================================================================== */

var HT_KHOA = 'sct_hien_thi_v1';
var HT_THE = {
  sotay: [
    { id: 'vi', ten: 'Số dư từng ví', mota: 'Dưới số dư tổng ở thẻ đầu', khongThuTu: true },
    { id: 'tieu', ten: 'Hôm nay còn tiêu được', mota: 'Mức tiêu mỗi ngày', khongThuTu: true },
    { id: 'hanmuc', ten: 'Chi hằng ngày theo hạn mức', mota: 'Thanh hạn mức tháng', khongThuTu: true },
    { id: 'sosanh', ten: 'So sánh cùng kỳ', mota: 'Chi so với tháng trước', khongThuTu: true }
  ],
  baocao: [
    { id: 'ngaytudo', ten: 'Ngày tự do', mota: 'Tiền đang có đủ sống bao nhiêu ngày' },
    { id: 'diemnhan', ten: 'Điều đáng chú ý', mota: 'Vài câu tự rút ra từ dữ liệu' },
    { id: 'tongket', ten: 'Tổng kết tháng', mota: 'Chỉ hiện với tháng đã kết thúc' },
    { id: 'hanmuc', ten: 'Hạn mức' },
    { id: 'taisan', ten: 'Tài sản ròng' },
    { id: 'muctieu', ten: 'Mục tiêu tiết kiệm' },
    { id: 'tet', ten: 'Tết đếm ngược', mota: 'Hiện khi còn dưới 150 ngày tới Tết: số Tết năm ngoái và Quỹ Tết' },
    { id: 'nhan', ten: 'Theo nhãn' },
    { id: 'bieudo', ten: 'Biểu đồ chi tiêu', mota: 'Cột bên phải ở màn rộng', khongThuTu: true }
  ],
  congcu: [
    { id: 'muonmua', ten: 'Muốn mua', nhomCon: 'qd' }, { id: 'giocong', ten: 'Giờ công', nhomCon: 'qd' }, { id: 'loihua', ten: 'Lời hứa', nhomCon: 'qd' },
    { id: 'sommung', ten: 'Sổ mừng và quà', nhomCon: 'so' }, { id: 'dodac', ten: 'Sổ đồ đạc', nhomCon: 'so' }
  ]
};
var HT_NHOM_TEN = { sotay: 'Sổ tay', baocao: 'Báo cáo', congcu: 'Công cụ' };

function htDoc(){
  try{
    var s = localStorage.getItem(HT_KHOA), o = s ? JSON.parse(s) : {};
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  }catch(e){ return {}; }
}
function htLuu(o){ try{ localStorage.setItem(HT_KHOA, JSON.stringify(o)); }catch(e){} }
function htThe(nhom, id){ return (HT_THE[nhom] || []).filter(function(t){ return t.id === id; })[0] || null; }

// thẻ id ở nhóm này đang bị ẩn? (thẻ khóa không bao giờ ẩn)
function htAn(nhom, id){
  var t = htThe(nhom, id);
  if (!t || t.khoa) return false;
  var an = (htDoc().an || {})[nhom];
  return Array.isArray(an) && an.indexOf(id) >= 0;
}
function htDatAn(nhom, id, an){
  var t = htThe(nhom, id);
  if (!t || t.khoa) return false;
  var o = htDoc(); o.an = o.an || {};
  var ds = Array.isArray(o.an[nhom]) ? o.an[nhom].filter(function(x){ return x !== id; }) : [];
  if (an) ds.push(id);
  o.an[nhom] = ds; htLuu(o);
  return true;
}
// id các thẻ của nhóm theo thứ tự đã lưu (thẻ chưa có trong thứ tự lưu giữ vị trí mặc định, đẩy về cuối phần còn lại)
function htThuTu(nhom){
  var goc = (HT_THE[nhom] || []).map(function(t){ return t.id; });
  var luu = ((htDoc().thuTu || {})[nhom]);
  if (!Array.isArray(luu)) return goc;
  var out = luu.filter(function(id){ return goc.indexOf(id) >= 0; });
  goc.forEach(function(id){ if (out.indexOf(id) < 0) out.push(id); });
  // thẻ khongThuTu giữ đúng vị trí gốc của nó, không bị đẩy đi
  goc.forEach(function(id, i){
    if (!htThe(nhom, id).khongThuTu) return;
    var j = out.indexOf(id); out.splice(j, 1); out.splice(Math.min(i, out.length), 0, id);
  });
  return out;
}
// các id đang HIỆN theo đúng thứ tự
function htHien(nhom){ return htThuTu(nhom).filter(function(id){ return !htAn(nhom, id); }); }
// đổi vị trí một thẻ lên (-1) / xuống (+1) trong số các thẻ ĐƯỢC PHÉP đổi vị trí; trả true nếu có đổi
function htDoiViTri(nhom, id, huong){
  var t = htThe(nhom, id);
  if (!t || t.khongThuTu) return false;
  var all = htThuTu(nhom), dsDoi = all.filter(function(x){ return !htThe(nhom, x).khongThuTu; });
  var tong = dsDoi.slice();                                   // đổi vị trí với láng giềng CÙNG nhomCon (nếu có), bỏ qua thẻ nhóm khác
  dsDoi = tong.filter(function(x){ return htThe(nhom, x).nhomCon === t.nhomCon; });
  var i = dsDoi.indexOf(id), j = i + (huong < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= dsDoi.length) return false;
  var a = tong.indexOf(dsDoi[i]), b = tong.indexOf(dsDoi[j]), tmp = tong[a]; tong[a] = tong[b]; tong[b] = tmp;
  var k = 0, moi = all.map(function(x){ return htThe(nhom, x).khongThuTu ? x : tong[k++]; });
  var o = htDoc(); o.thuTu = o.thuTu || {}; o.thuTu[nhom] = moi; htLuu(o);
  return true;
}
function htDatLai(){ htLuu({}); }

// loại thông báo bị tắt ở chuông
function htTbTat(loai){ var d = htDoc().tbTat; return Array.isArray(d) && d.indexOf(loai) >= 0; }
function htDatTbTat(loai, tat){
  var o = htDoc(), ds = Array.isArray(o.tbTat) ? o.tbTat.filter(function(x){ return x !== loai; }) : [];
  if (tat) ds.push(loai);
  o.tbTat = ds; htLuu(o);
}
