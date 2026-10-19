"use strict";
/* ====================================================================
   qr.js — QR NHẬN TIỀN (VietQR): gõ số tiền thì ra mã QR đúng số tiền đó, quét bằng app ngân hàng là chuyển.

   3 phần, đều chạy trên máy, KHÔNG gọi dịch vụ nào (số tài khoản + số tiền không rời khỏi thiết bị):
   1) qrMaTran(text): bộ mã hóa QR (chế độ byte, mức sửa lỗi M, phiên bản 1 -> 10 = tối đa 213 byte, dư cho VietQR ~120 byte).
   2) vqPayload(bin, stk, soTien, noiDung): chuỗi theo chuẩn VietQR / NAPAS 247 (EMVCo): tag 38 = tài khoản nhận,
      54 = số tiền, 62.08 = nội dung, 63 = CRC16-CCITT. Có số tiền thì là mã "động" (tag 01 = 12), không thì "tĩnh" (11).
   3) qrNhanTienHtml / qrMoDialog: nút "Tạo QR" ở Sổ tay, nhập số tiền là ra QR. Tài khoản nhận cố định ở VQ_TK_NHAN.
   App KHÔNG biết tiền đã vào hay chưa (không có API ngân hàng): QR chỉ đỡ phải gõ tay cho người chuyển.
   ==================================================================== */

/* ---------- 1) bộ mã hóa QR ---------- */
// mức sửa lỗi M, theo phiên bản 1..10: [tổng từ mã, byte sửa lỗi/khối, [số khối, byte dữ liệu/khối], ...]
var QR_M = [null,
  [26, 10, [1, 16]], [44, 16, [1, 28]], [70, 26, [1, 44]], [100, 18, [2, 32]], [134, 24, [2, 43]],
  [172, 16, [4, 27]], [196, 18, [4, 31]], [242, 22, [2, 38], [2, 39]], [292, 22, [3, 36], [2, 37]], [346, 26, [4, 43], [1, 44]]];
var QR_CAN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];  // tọa độ mẫu căn chỉnh

var _qrExp = null, _qrLog = null;
function qrGf(){
  if (_qrExp) return;
  _qrExp = []; _qrLog = [];
  var x = 1, i;
  for (i = 0; i < 255; i++){ _qrExp[i] = x; _qrLog[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; }
  for (i = 255; i < 512; i++) _qrExp[i] = _qrExp[i - 255];
}
function qrNhan(a, b){ return (a && b) ? _qrExp[_qrLog[a] + _qrLog[b]] : 0; }
// byte sửa lỗi Reed-Solomon của 1 khối dữ liệu
function qrRs(data, n){
  qrGf();
  var gen = [1], i, j;
  for (i = 0; i < n; i++){
    var ng = [];
    for (j = 0; j <= gen.length; j++) ng[j] = (j < gen.length ? gen[j] : 0) ^ (j > 0 ? qrNhan(gen[j - 1], _qrExp[i]) : 0);
    gen = ng;
  }
  var r = []; for (i = 0; i < n; i++) r[i] = 0;
  data.forEach(function(b){
    var f = b ^ r[0];
    r.shift(); r.push(0);
    for (i = 0; i < n; i++) r[i] ^= qrNhan(gen[i + 1], f);
  });
  return r;
}
function qrUtf8(s){
  var out = [], i, c;
  s = unescape(encodeURIComponent(s));
  for (i = 0; i < s.length; i++){ c = s.charCodeAt(i); out.push(c); }
  return out;
}
// chuỗi bit dữ liệu (đã chèn đệm) cho phiên bản v, rồi xen kẽ khối + byte sửa lỗi -> dãy bit cuối
function qrTuMa(bytes, v){
  var info = QR_M[v], bits = [], i;
  var put = function(val, len){ for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1); };
  var cap = 0; for (i = 2; i < info.length; i++) cap += info[i][0] * info[i][1];
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach(function(b){ put(b, 8); });
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  for (i = 0; bits.length < cap * 8; i++) put(i % 2 ? 0x11 : 0xEC, 8);
  var cw = []; for (i = 0; i < bits.length; i += 8){ var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; cw.push(b); }
  var khoi = [], p = 0;
  for (i = 2; i < info.length; i++) for (var j = 0; j < info[i][0]; j++){ khoi.push(cw.slice(p, p + info[i][1])); p += info[i][1]; }
  var ec = khoi.map(function(d){ return qrRs(d, info[1]); });
  var out = [], maxD = Math.max.apply(null, khoi.map(function(d){ return d.length; }));
  for (i = 0; i < maxD; i++) khoi.forEach(function(d){ if (i < d.length) out.push(d[i]); });
  for (i = 0; i < info[1]; i++) ec.forEach(function(e){ out.push(e[i]); });
  var res = []; out.forEach(function(b){ for (var k = 7; k >= 0; k--) res.push((b >>> k) & 1); });
  return res;
}
// mã BCH: thêm deg bit kiểm tra vào val (gen là đa thức sinh)
function qrBch(val, gen, deg){
  var rem = val;
  for (var i = 0; i < deg; i++) rem = (rem << 1) ^ ((rem >>> (deg - 1)) * gen);
  return (val << deg) | rem;
}
// dựng ma trận với mặt nạ m; trả { mod, laChucNang }
function qrDung(v, bits, m){
  var n = 17 + 4 * v, mod = [], fn = [], x, y, i, j;
  for (y = 0; y < n; y++){ mod.push([]); fn.push([]); for (x = 0; x < n; x++){ mod[y].push(false); fn[y].push(false); } }
  var set = function(px, py, d){ if (px >= 0 && py >= 0 && px < n && py < n){ mod[py][px] = !!d; fn[py][px] = true; } };
  // mẫu dò 3 góc + vùng trắng quanh
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function(o){
    for (j = -1; j <= 7; j++) for (i = -1; i <= 7; i++){
      var d = Math.max(Math.abs(i - 3), Math.abs(j - 3));
      set(o[0] + i, o[1] + j, d !== 2 && d !== 4);
    }
  });
  // đường canh thời gian
  for (i = 8; i < n - 8; i++){ set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
  // mẫu căn chỉnh
  var c = QR_CAN[v];
  c.forEach(function(cy, a){ c.forEach(function(cx, b){
    if ((a === 0 && b === 0) || (a === 0 && b === c.length - 1) || (a === c.length - 1 && b === 0)) return;
    for (j = -2; j <= 2; j++) for (i = -2; i <= 2; i++) set(cx + i, cy + j, Math.max(Math.abs(i), Math.abs(j)) !== 1);
  }); });
  // ô tối cố định
  set(8, n - 8, true);
  // giữ chỗ vùng thông tin định dạng (ghi sau)
  for (i = 0; i < 9; i++){ if (!fn[8][i]) set(i, 8, false); if (!fn[i][8]) set(8, i, false); }
  for (i = 0; i < 8; i++){ set(n - 1 - i, 8, false); set(8, n - 1 - i, false); }
  set(8, n - 8, true);
  // thông tin phiên bản (từ v7)
  if (v >= 7){
    var vi = qrBch(v, 0x1F25, 12);
    for (i = 0; i < 18; i++){
      var bit = (vi >>> i) & 1, a = n - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, bit); set(b, a, bit);
    }
  }
  // đặt dữ liệu theo đường zig-zag, áp mặt nạ
  var k = 0, up = true;
  for (x = n - 1; x > 0; x -= 2){
    if (x === 6) x--;
    for (j = 0; j < n; j++){
      y = up ? n - 1 - j : j;
      for (i = 0; i < 2; i++){
        var cx2 = x - i;
        if (fn[y][cx2]) continue;
        var d2 = k < bits.length ? bits[k] === 1 : false; k++;
        var inv;
        switch (m){
          case 0: inv = (cx2 + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = cx2 % 3 === 0; break;
          case 3: inv = (cx2 + y) % 3 === 0; break;
          case 4: inv = (Math.floor(cx2 / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (cx2 * y) % 2 + (cx2 * y) % 3 === 0; break;
          case 6: inv = ((cx2 * y) % 2 + (cx2 * y) % 3) % 2 === 0; break;
          default: inv = ((cx2 + y) % 2 + (cx2 * y) % 3) % 2 === 0;
        }
        mod[y][cx2] = d2 !== inv;
      }
    }
    up = !up;
  }
  // thông tin định dạng: mức M = 00, mặt nạ m, BCH(15,5) xor 0x5412
  var f = qrBch(m, 0x537, 10) ^ 0x5412;
  for (i = 0; i <= 5; i++) mod[i][8] = ((f >>> i) & 1) === 1;
  mod[7][8] = ((f >>> 6) & 1) === 1; mod[8][8] = ((f >>> 7) & 1) === 1; mod[8][7] = ((f >>> 8) & 1) === 1;
  for (i = 9; i < 15; i++) mod[8][14 - i] = ((f >>> i) & 1) === 1;
  for (i = 0; i < 8; i++) mod[8][n - 1 - i] = ((f >>> i) & 1) === 1;
  for (i = 8; i < 15; i++) mod[n - 15 + i][8] = ((f >>> i) & 1) === 1;
  mod[n - 8][8] = true;
  return mod;
}
// điểm phạt theo 4 luật của chuẩn QR: càng thấp càng dễ quét
function qrPhat(mod){
  var n = mod.length, p = 0, x, y, i, dem = 0;
  var chay = function(get){
    var run = 1, s = 0;
    for (var t = 1; t < n; t++){
      if (get(t) === get(t - 1)){ run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1;
    }
    return s;
  };
  for (y = 0; y < n; y++){ p += chay(function(t){ return mod[y][t]; }); p += chay(function(t){ return mod[t][y]; }); }
  for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++){
    var c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
  }
  var mau = [1, 0, 1, 1, 1, 0, 1];
  var kt = function(get){
    for (var s = 0; s + 11 <= n; s++){
      var a = true, b = true;
      for (i = 0; i < 7; i++){ if (get(s + i) !== (mau[i] === 1)) a = false; if (get(s + 4 + i) !== (mau[i] === 1)) b = false; }
      if (a) for (i = 7; i < 11; i++) if (get(s + i)) a = false;
      if (b) for (i = 0; i < 4; i++) if (get(s + i)) b = false;
      if (a) p += 40; if (b) p += 40;
    }
  };
  for (y = 0; y < n; y++){ kt(function(t){ return mod[y][t]; }); kt(function(t){ return mod[t][y]; }); }
  for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (mod[y][x]) dem++;
  p += Math.floor(Math.abs(dem * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}
// text -> ma trận (mảng các hàng, true = ô tối). Trả null nếu quá dài (> 213 byte)
function qrMaTran(text){
  var bytes = qrUtf8(String(text)), v;
  for (v = 1; v <= 10; v++){
    var cap = 0; for (var i = 2; i < QR_M[v].length; i++) cap += QR_M[v][i][0] * QR_M[v][i][1];
    if (bytes.length + (v < 10 ? 2 : 3) <= cap) break;
  }
  if (v > 10) return null;
  var bits = qrTuMa(bytes, v), best = null, bestP = 1e9;
  for (var m = 0; m < 8; m++){
    var mod = qrDung(v, bits, m), p = qrPhat(mod);
    if (p < bestP){ bestP = p; best = mod; }
  }
  return best;
}
// ma trận -> chuỗi <svg> (nền trắng + lề 4 ô theo chuẩn, để quét được cả khi giao diện tối)
function qrSvg(mod, nhan){
  var n = mod.length, d = '', x, y;
  for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (mod[y][x]) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z';
  return '<svg class="qr-svg" viewBox="0 0 ' + (n + 8) + ' ' + (n + 8) + '" role="img" aria-label="' + (nhan || 'Mã QR') + '" shape-rendering="crispEdges">'
    + '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}

/* ---------- 2) payload VietQR ---------- */
// ngân hàng hay gặp (mã BIN do NAPAS cấp). Ngân hàng khác: chọn "Khác" rồi nhập mã BIN 6 số.
var VQ_NGAN_HANG = [
  ['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'], ['970407', 'Techcombank'],
  ['970422', 'MB Bank'], ['970416', 'ACB'], ['970432', 'VPBank'], ['970423', 'TPBank'], ['970403', 'Sacombank'],
  ['970437', 'HDBank'], ['970441', 'VIB'], ['970443', 'SHB'], ['970448', 'OCB'], ['970426', 'MSB'],
  ['970440', 'SeABank'], ['970449', 'LPBank'], ['970431', 'Eximbank'], ['970428', 'Nam A Bank'], ['970409', 'Bac A Bank'],
  ['970454', 'VietCapitalBank'], ['970429', 'SCB'], ['970452', 'KienlongBank'], ['970419', 'NCB'], ['970412', 'PVcomBank'],
  ['970433', 'VietBank'], ['970425', 'ABBANK'], ['970430', 'PG Bank']];
function vqTenNganHang(bin){
  for (var i = 0; i < VQ_NGAN_HANG.length; i++) if (VQ_NGAN_HANG[i][0] === bin) return VQ_NGAN_HANG[i][1];
  return 'Ngân hàng ' + bin;
}
// CRC16-CCITT (đa thức 0x1021, khởi tạo 0xFFFF) -> 4 ký tự hex hoa
function vqCrc16(s){
  var crc = 0xFFFF;
  for (var i = 0; i < s.length; i++){
    crc ^= s.charCodeAt(i) << 8;
    for (var k = 0; k < 8; k++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  var h = crc.toString(16).toUpperCase();
  return ('0000' + h).slice(-4);
}
// nội dung chuyển khoản phải là ASCII không dấu (nhiều ngân hàng từ chối dấu); chỉ giữ chữ, số, dấu cách
function vqBoDau(s, toiDa){
  s = String(s || '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, toiDa || 25).trim();
}
function vqTlv(tag, val){ return tag + ('0' + val.length).slice(-2) + val; }
// bin: 6 số; stk: số tài khoản (chữ số); soTien: > 0 thì thành mã có sẵn số tiền; noiDung: tùy chọn. Dữ liệu sai -> ''
function vqPayload(bin, stk, soTien, noiDung){
  bin = String(bin || '').replace(/\D/g, ''); stk = String(stk || '').replace(/\s/g, '');
  if (bin.length !== 6 || !/^[0-9A-Za-z]{1,19}$/.test(stk)) return '';
  var tien = Math.round(Number(soTien) || 0), nd = vqBoDau(noiDung);
  var nhan = vqTlv('00', bin) + vqTlv('01', stk);
  var s = vqTlv('00', '01') + vqTlv('01', tien > 0 ? '12' : '11')
    + vqTlv('38', vqTlv('00', 'A000000727') + vqTlv('01', nhan) + vqTlv('02', 'QRIBFTTA'))
    + vqTlv('53', '704') + (tien > 0 ? vqTlv('54', String(tien)) : '') + vqTlv('58', 'VN')
    + (nd ? vqTlv('62', vqTlv('08', nd)) : '') + '6304';
  return s + vqCrc16(s);
}

/* ---------- 3) hiển thị ---------- */
// tài khoản nhận tiền (Techcombank). Muốn đổi thì sửa 2 dòng này.
var VQ_TK_NHAN = { bin: '970407', stk: '1711052003' };
// khối QR cho số tiền tien + nội dung noiDung
function qrNhanTienHtml(tien, noiDung){
  tien = Math.round(Number(tien) || 0);
  if (!(tien > 0)) return '<div class="qr-hint">Nhập số tiền để tạo mã QR.</div>';
  var mt = qrMaTran(vqPayload(VQ_TK_NHAN.bin, VQ_TK_NHAN.stk, tien, noiDung));
  if (!mt) return '<div class="qr-hint">Không tạo được mã QR.</div>';
  var nd = vqBoDau(noiDung);
  return '<div class="qr-box">' + qrSvg(mt, 'Mã QR nhận ' + fmt(tien) + ' đồng')
    + '<div class="qr-info"><b>' + esc(vqTenNganHang(VQ_TK_NHAN.bin)) + ' · ' + esc(VQ_TK_NHAN.stk) + '</b>'
    + '<span>Nhận <b>' + fmt(tien) + '</b></span>' + (nd ? '<span>Nội dung: ' + esc(nd) + '</span>' : '') + '</div></div>';
}
// hộp thoại "Tạo QR": gõ số tiền (và nội dung nếu muốn) là QR đổi theo ngay. Dùng khung vnDlMo của Vay - Nợ.
function qrMoDialog(){
  return vnDlMo({
    tieuDe: 'Tạo QR nhận tiền',
    nutOk: 'Xong',
    body: vnF('Số tiền', '<input type="text" inputmode="numeric" autocomplete="off" class="money" id="qr_so" placeholder="0">')
      + vnF('Nội dung <span class="mp-hint">(tùy chọn)</span>', '<input type="text" id="qr_nd" maxlength="25" autocomplete="off" placeholder="VD: Tra tien an">')
      + '<div id="qr_out">' + qrNhanTienHtml(0, '') + '</div>',
    khiNhap: function(root){
      var so = numNonNeg(docSo(root.querySelector('#qr_so').value));
      root.querySelector('#qr_out').innerHTML = qrNhanTienHtml(so, root.querySelector('#qr_nd').value);
    },
    lay: function(){ return {}; }
  });
}
