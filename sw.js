"use strict";
/* ====================================================================
   sw.js — service worker: cho app MỞ ĐƯỢC khi mất mạng (khung app: HTML/CSS/JS).
   Dữ liệu tiền KHÔNG nằm ở đây (không đụng Drive) — xem "Mở ngoại tuyến" ở drive-sync.js.

   Chiến lược chọn để KHÔNG BAO GIỜ kẹt bản cũ (bẫy kinh điển của service worker):
   - file của chính app: MẠNG TRƯỚC. Có mạng là luôn lấy bản mới nhất rồi ghi đè cache.
     Cache chỉ được dùng khi mất mạng, hoặc mạng treo quá MANG_CHO_MS mà đã có cache.
   - thư viện CDN (SheetJS, cdn.sheetjs.com): CACHE TRƯỚC, vì URL đã gắn phiên bản cố định.
   - mọi thứ khác (đăng nhập Google, Drive API): KHÔNG can thiệp.
   Đổi file này (ví dụ tăng VERSION) thì trình duyệt tự cài bản mới, xóa cache cũ.
   ==================================================================== */
var VERSION = 'v3';
var CACHE = 'sochitieu-' + VERSION;
var CDN_HOSTS = ['cdn.sheetjs.com'];
var MANG_CHO_MS = 6000;

self.addEventListener('install', function(){ self.skipWaiting(); });

self.addEventListener('activate', function(ev){
  ev.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.filter(function(k){ return k.indexOf('sochitieu-') === 0 && k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(ev){
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) ev.respondWith(mangTruoc(req));
  else if (CDN_HOSTS.indexOf(url.hostname) >= 0) ev.respondWith(boNhoTruoc(req));
});

function mangTruoc(req){
  return new Promise(function(resolve){
    var xong = false;
    function tra(r){ if (!xong){ xong = true; resolve(r); } }
    // dùng cache khi không có mạng. Điều hướng (mở trang) mà không có bản đúng URL thì lấy trang gốc của app
    function dungCache(){
      return caches.match(req).then(function(c){
        if (c) return c;
        if (req.mode === 'navigate') return caches.match(new URL('./', self.registration.scope).href);
        return null;
      });
    }
    var hen = setTimeout(function(){
      dungCache().then(function(c){ if (c) tra(c); });      // mạng treo: có cache thì dùng, không thì chờ tiếp
    }, MANG_CHO_MS);
    fetch(req).then(function(res){
      clearTimeout(hen);
      if (res && res.ok){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
      }
      tra(res);
    }).catch(function(){
      clearTimeout(hen);
      dungCache().then(function(c){ tra(c || Response.error()); });
    });
  });
}

function boNhoTruoc(req){
  return caches.match(req).then(function(c){
    if (c) return c;
    return fetch(req).then(function(res){
      // cross-origin không-CORS (thẻ <script> không có crossorigin) trả về 'opaque': vẫn cache được
      if (res && (res.ok || res.type === 'opaque')){
        var copy = res.clone();
        caches.open(CACHE).then(function(cc){ cc.put(req, copy); });
      }
      return res;
    });
  });
}
