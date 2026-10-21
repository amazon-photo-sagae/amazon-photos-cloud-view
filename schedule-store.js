/* Shared, browser-only schedule storage. No server uploads or production connections. */
window.ScheduleStore=(()=>{
 const DB_NAME='sagae-monthly-sample-demo-v1',MAX_BYTES=10*1024*1024;
 let dbPromise,readyPromise;
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('sagae-monthly-sample-demo-v1'):null;
 function open(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{r.result.createObjectStore('schedules',{keyPath:'month'});r.result.createObjectStore('meta')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('他の画面を閉じて開き直してください。'))});return dbPromise}
 async function readAll(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('schedules','readonly'),r=tx.objectStore('schedules').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.month.localeCompare(a.month)));r.onerror=()=>reject(r.error)})}
 async function init(){if(!readyPromise)readyPromise=(async()=>{const db=await open();const initialized=await new Promise((resolve,reject)=>{const r=db.transaction('meta').objectStore('meta').get('seeded');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(initialized)return;
 const records=await Promise.all(['2026-09','2026-10'].map(async month=>{const url=new URL(`samples/schedule-${month}.pdf`,new URL('.',document.querySelector('script[data-schedule-store]').src));const res=await fetch(url);if(!res.ok)throw Error('サンプルPDFを読み込めません。');return {month,name:`sample-${month}.pdf`,blob:await res.blob(),updated:Date.now()}}));
 await new Promise((resolve,reject)=>{const tx=db.transaction(['schedules','meta'],'readwrite'),meta=tx.objectStore('meta'),r=meta.get('seeded');r.onsuccess=()=>{if(!r.result){for(const record of records)tx.objectStore('schedules').put(record);meta.put(true,'seeded')}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
 })();return readyPromise}
 async function list(){await init();return readAll()}
 async function save(month,file){await init();if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1900||Number(month.slice(0,4))>2199)throw Error('年月を1900年〜2199年の範囲で指定してください。');if(!file||!file.size)throw Error('PDFファイルを選択してください。');if(file.size>MAX_BYTES)throw Error('PDFは10MB以下にしてください。');if(!file.name.toLowerCase().endsWith('.pdf')||new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')throw Error('PDF形式のファイルを選択してください。');
 const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('schedules','readwrite');tx.objectStore('schedules').put({month,name:file.name,blob:file,updated:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});channel?.postMessage('updated');window.dispatchEvent(new Event('sagae-schedules-changed'))}
 function listen(fn){window.addEventListener('sagae-schedules-changed',fn);if(channel)channel.addEventListener('message',fn);document.addEventListener('visibilitychange',()=>{if(!document.hidden)fn()});window.addEventListener('focus',fn)}
 function label(month){return `${Number(month.slice(0,4))}年${Number(month.slice(5))}月`}
 return {list,save,listen,label};
})();
