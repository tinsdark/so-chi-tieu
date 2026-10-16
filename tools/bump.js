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

module.exports = { tinhVer: tinhVer, capNhat: capNhat, filesInIndex: filesInIndex };

if (require.main === module){
  var html = fs.readFileSync(INDEX, 'utf8');
  var r = capNhat(html);
  if (process.argv.indexOf('--check') >= 0){
    if (r.html !== html){ console.error('index.html: số ?v= lệch với nội dung file. Chạy: node tools/bump.js'); process.exit(1); }
    console.log('?v= khớp (' + r.ver + ')');
  } else if (r.html !== html){
    fs.writeFileSync(INDEX, r.html);
    console.log('Đã đặt ?v=' + r.ver);
  } else {
    console.log('?v= đã đúng (' + r.ver + '), không đổi');
  }
}
