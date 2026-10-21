const CACHE='sagae-team-design-v4-monthly';
const CORE=["./", "./index.html", "./style.css", "./app.js", "./songs.js", "./team-config.js", "./schedule-store.js", "./schedules.js", "./samples/schedule-2026-08.pdf", "./samples/schedule-2026-09.pdf", "./samples/schedule-2026-10.pdf", "./team-logo.png", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('sagae-team-design-')&&k!==CACHE)||k.startsWith('sagae-integrated-prototype-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>(await c.match(r.url,{ignoreSearch:true}))||fetch(r)))});
