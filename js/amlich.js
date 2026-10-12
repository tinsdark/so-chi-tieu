"use strict";
/* ====================================================================
   amlich.js — LỊCH ÂM VIỆT NAM (múi giờ UTC+7), tính hoàn toàn trong trình duyệt, không server, dùng được ngoại tuyến.
   Thuật toán: Hồ Ngọc Đức (tính ngày sóc từ chuyển động Mặt Trăng, kinh độ Mặt Trời để xác định tháng nhuận), đúng cho 1800 – 2199.
   Ngày dương dạng 'YYYY-MM-DD' như phần còn lại của app.

   alCua(d)                    -> { ngay, thang, nam, nhuan } của ngày dương d
   alSangDuong(ngay, thang, nam, nhuan) -> 'YYYY-MM-DD' (rỗng nếu không có ngày đó, vd tháng nhuận không tồn tại)
   alTet(namDuong)             -> ngày dương của Mùng 1 Tết trong năm dương đó
   alCanChi(namAm)             -> "Đinh Mùi"
   alNgayDuong(ngayAm, thangAm, tu, den) -> mọi ngày dương trong [tu, den] rơi đúng ngày âm đó
       thangAm = 0: hằng tháng (mỗi tháng âm); thangAm 1–12: hằng năm (bỏ qua tháng nhuận).
       ngayAm = 30 mà tháng âm đó chỉ có 29 ngày thì tính vào ngày 29 (ngày cuối tháng).
   alNhan(d)                   -> "15/9 âm" (có "nhuận" nếu là tháng nhuận)
   Kết quả được nhớ lại theo ngày (tính 1 lần cho mỗi ngày).
   ==================================================================== */

var AL_TZ = 7;
var _alCache = {};

function alJdTuNgay(dd, mm, yy){
  var a = Math.floor((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
  var jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  return jd;
}
function alJdRaNgay(jd){
  var a, b, c;
  if (jd > 2299160){ a = jd + 32044; b = Math.floor((4 * a + 3) / 146097); c = a - Math.floor(b * 146097 / 4); }
  else { b = 0; c = jd + 32082; }
  var d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
  return [e - Math.floor((153 * m + 2) / 5) + 1, m + 3 - 12 * Math.floor(m / 10), b * 100 + d - 4800 + Math.floor(m / 10)];
}
// ngày sóc (trăng mới) thứ k kể từ 1/1/1900, dạng số ngày Julius
function alNgaySoc(k){
  var T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = Math.PI / 180;
  var Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 = Jd1 + 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  var M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  var Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  var F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  var C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  var deltat = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return Math.floor(Jd1 + C1 - deltat + 0.5 + AL_TZ / 24);
}
// kinh độ Mặt Trời tại thời điểm ngày sóc, chia 30 độ: 0 .. 11
function alKinhDoMatTroi(jdn){
  var T = (jdn - 2451545.5 - AL_TZ / 24) / 36525, T2 = T * T, dr = Math.PI / 180;
  var M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  var L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  var DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  var L = L0 + DL, omega = 125.04 - 1934.136 * T;
  L = L - 0.00569 - 0.00478 * Math.sin(omega * dr);
  L = L * dr;
  L = L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
  return Math.floor(L / Math.PI * 6);
}
// ngày sóc bắt đầu tháng 11 âm lịch của năm yy (tháng chứa đông chí)
function alThang11(yy){
  var off = alJdTuNgay(31, 12, yy) - 2415021, k = Math.floor(off / 29.530588853);
  var nm = alNgaySoc(k);
  if (alKinhDoMatTroi(nm) >= 9) nm = alNgaySoc(k - 1);
  return nm;
}
// vị trí tháng nhuận trong năm âm bắt đầu từ ngày sóc a11 (năm có 13 tháng)
function alViTriNhuan(a11){
  var k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5), last = 0, i = 1, arc = alKinhDoMatTroi(alNgaySoc(k + i));
  do { last = arc; i++; arc = alKinhDoMatTroi(alNgaySoc(k + i)); } while (arc !== last && i < 14);
  return i - 1;
}
function alCua(d){
  if (_alCache[d]) return _alCache[d];
  var yy = parseInt(d.slice(0, 4), 10), mm = parseInt(d.slice(5, 7), 10), dd = parseInt(d.slice(8, 10), 10);
  var dayNumber = alJdTuNgay(dd, mm, yy), k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
  var monthStart = alNgaySoc(k + 1);
  if (monthStart > dayNumber) monthStart = alNgaySoc(k);
  var a11 = alThang11(yy), b11 = a11, lunarYear;
  if (a11 >= monthStart){ lunarYear = yy; a11 = alThang11(yy - 1); }
  else { lunarYear = yy + 1; b11 = alThang11(yy + 1); }
  var lunarDay = dayNumber - monthStart + 1, diff = Math.floor((monthStart - a11) / 29), nhuan = false, lunarMonth = diff + 11;
  if (b11 - a11 > 365){
    var leapDiff = alViTriNhuan(a11);
    if (diff >= leapDiff){ lunarMonth = diff + 10; if (diff === leapDiff) nhuan = true; }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return (_alCache[d] = { ngay: lunarDay, thang: lunarMonth, nam: lunarYear, nhuan: nhuan });
}
function alSangDuong(ngay, thang, nam, nhuan){
  var a11, b11;
  if (thang < 11){ a11 = alThang11(nam - 1); b11 = alThang11(nam); }
  else { a11 = alThang11(nam); b11 = alThang11(nam + 1); }
  var k = Math.floor(0.5 + (a11 - 2415021.076998695) / 29.530588853), off = thang - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365){
    var leapOff = alViTriNhuan(a11), leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (nhuan && thang !== leapMonth) return '';
    if (nhuan || off >= leapOff) off += 1;
  } else if (nhuan) return '';
  var r = alJdRaNgay(alNgaySoc(k + off) + ngay - 1);
  return r[2] + '-' + pad2(r[1]) + '-' + pad2(r[0]);
}
function alTet(namDuong){ return alSangDuong(1, 1, namDuong, false); }
var AL_CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
var AL_CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
function alCanChi(namAm){ return AL_CAN[((namAm + 6) % 10 + 10) % 10] + ' ' + AL_CHI[((namAm + 8) % 12 + 12) % 12]; }

function alNgayKeTiep(d){
  var t = new Date(parseInt(d.slice(0, 4), 10), parseInt(d.slice(5, 7), 10) - 1, parseInt(d.slice(8, 10), 10) + 1);
  return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
}
function alNgayDuong(ngayAm, thangAm, tu, den){
  var out = [], d = tu, guard = 0;
  ngayAm = Math.round(Number(ngayAm) || 0); thangAm = Math.round(Number(thangAm) || 0);
  if (ngayAm < 1 || ngayAm > 30) return out;
  while (d <= den && guard++ < 800){
    var a = alCua(d), hop = false;
    if (a.ngay === ngayAm) hop = true;
    else if (ngayAm === 30 && a.ngay === 29 && alCua(alNgayKeTiep(d)).ngay === 1) hop = true;
    if (hop && (thangAm === 0 || (a.thang === thangAm && !a.nhuan))) out.push(d);
    d = alNgayKeTiep(d);
  }
  return out;
}
function alNhan(d){
  var a = alCua(d);
  return a.ngay + '/' + a.thang + (a.nhuan ? ' nhuận' : '') + ' âm';
}
