"use strict";
/* ====================================================================
   tools/bump.js — đặt số phiên bản ?v= trong index.html = băm NỘI DUNG của các file nó nạp.

   Chạy:  node tools/bump.js          (sửa index.html nếu số cũ không còn đúng)
          node tools/bump.js --check  (chỉ kiểm tra, thoát mã 1 nếu lệch)

   Vì sao cần: số ?v= vừa để trình duyệt không giữ file cũ, vừa là "dấu vân tay" để app biết
   có bản mới (xem kiemTraBanMoi ở app.js). Tăng tay thì dễ quên -> app không báo bản mới.
   Băm theo nội dung thì file đổi là số tự đổi, file không đổi thì số giữ nguyên.
   Phải chạy lại sau MỖI lần sửa js/*.js hoặc style.css (test sẽ báo lệch nếu quên).
   ==================================================================== */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var GHI = path.join(ROOT, 'ghi.html');
var RE_REF = /((?:src|href)=")((?:js\/[A-Za-z0-9_-]+\.js)|style\.css)\?v=[^"]*(")/g;

function filesInIndex(html){
  var out = [], m;
  RE_REF.lastIndex = 0;
  while ((m = RE_REF.exec(html))) out.push(m[2]);
  return out;
}
// băm nối tên + nội dung các file đã nạp (theo thứ tự trong index.html)
function tinhVer(html){
  var h = crypto.createHash('sha1');
  filesInIndex(html).forEach(function(f){
    h.update(f + '\n');
    h.update(fs.readFileSync(path.join(ROOT, f)));
  });
  return h.digest('hex').slice(0, 8);
}
function capNhat(html){
  var ver = tinhVer(html);
  return { ver: ver, html: html.replace(RE_REF, function(_, a, f, c){ return a + f + '?v=' + ver + c; }) };
}

// ghi.html (app con "Ghi nhanh", biểu tượng riêng trên màn hình chính) = index.html đổi 5 chỗ: chế độ data-ghi, tên, manifest riêng, class body,
// và 2 khối nhỏ (thông báo chưa có dữ liệu, màn "Xong"). Sinh tự động nên không có bản sao thủ công nào để lệch; test kiểm ghi.html = taoGhi(index.html).
function taoGhi(html){
  var doi = function(h, tu, den){
    if (h.split(tu).length !== 2) throw new Error('index.html phải có đúng 1 chỗ: ' + tu);
    return h.replace(tu, function(){ return den; });
  };
  var h = html;
  h = doi(h, '<html lang="vi">', '<html lang="vi" data-ghi>');
  h = doi(h, '<title>Sổ Tiền</title>', '<title>Ghi nhanh</title>');
  h = doi(h, '<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="ghi.webmanifest">');
  h = doi(h, '<meta name="apple-mobile-web-app-title" content="Sổ Tiền">', '<meta name="apple-mobile-web-app-title" content="Ghi nhanh">');
  h = doi(h, '<body>', '<body class="ghi">');
  h = doi(h, '<div id="bannerZone"></div>', '<div id="bannerZone"></div>\n'
    + '  <div id="ghiThongBao" class="ghi-tb" style="display:none"></div>\n'
    + '  <div id="ghiXong" class="ghi-xong"><b>Xong</b><span id="ghiXongTxt"></span><small>Vuốt lên để thoát. Mở lại là bản mới, không giữ dữ liệu cũ.</small><button type="button" class="btn" data-act="qaMo">Ghi tiếp</button></div>');
  return h;
}

module.exports = { tinhVer: tinhVer, capNhat: capNhat, filesInIndex: filesInIndex, taoGhi: taoGhi };

if (require.main === module){
  var html = fs.readFileSync(INDEX, 'utf8');
  var r = capNhat(html);
  var ghiMoi = taoGhi(r.html), ghiCu = fs.existsSync(GHI) ? fs.readFileSync(GHI, 'utf8') : '';
  if (process.argv.indexOf('--check') >= 0){
    if (r.html !== html){ console.error('index.html: số ?v= lệch với nội dung file. Chạy: node tools/bump.js'); process.exit(1); }
    if (ghiMoi !== ghiCu){ console.error('ghi.html không khớp index.html (sinh tự động từ index.html). Chạy: node tools/bump.js'); process.exit(1); }
    console.log('?v= khớp (' + r.ver + '), ghi.html khớp');
  } else {
    if (r.html !== html){ fs.writeFileSync(INDEX, r.html); console.log('Đã đặt ?v=' + r.ver); }
    else console.log('?v= đã đúng (' + r.ver + '), không đổi');
    if (ghiMoi !== ghiCu){ fs.writeFileSync(GHI, ghiMoi); console.log('Đã sinh lại ghi.html'); }
  }
}
