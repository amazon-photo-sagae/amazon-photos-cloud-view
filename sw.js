const CACHE='sagae-design-noaudio-v1';
const CORE=["./", "./index.html", "./style.css", "./app.js", "./songs.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('sagae-design-noaudio-')&&k!==CACHE)||k.startsWith('sagae-integrated-prototype-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>(await c.match(r.url,{ignoreSearch:true}))||fetch(r)))});
