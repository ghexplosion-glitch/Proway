const VERSION='proway-v1.0.0';
const ASSETS=['./','index.html','app.css','app.js','platform.js','logo.png','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','vendor/lucide.min.js','vendor/jspdf.umd.min.js','vendor/jspdf.plugin.autotable.min.js','vendor/exceljs.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('proway-')&&key!==VERSION).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(caches.open(VERSION).then(async cache=>{
    const cached=await cache.match(event.request,{ignoreSearch:event.request.mode==='navigate'});
    if(cached)return cached;
    if(event.request.mode==='navigate')return cache.match('index.html');
    return fetch(event.request);
  }));
});
