/* =====================================================================
   E-Sign handoff — the IO Autofiller passes a freshly generated IO PDF to
   the E-Sign tool through IndexedDB (same origin; too big for localStorage).
   EsignHandoff.put({ blob, fileName, title, mondayItemId, fields })
   EsignHandoff.take() -> that object (and clears it), or null
   ===================================================================== */
(function(){
  const DB = 'axm-esign', STORE = 'handoff', KEY = 'pending';
  function open(){
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function tx(mode, fn){
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
      const out = fn(s);
      t.oncomplete = () => { db.close(); res(out && 'result' in out ? out.result : undefined); };
      t.onerror = () => { db.close(); rej(t.error); };
    });
  }
  window.EsignHandoff = {
    put: obj => tx('readwrite', s => s.put(Object.assign({ at: Date.now() }, obj), KEY)),
    async take(){
      const v = await tx('readonly', s => s.get(KEY));
      if(v) await tx('readwrite', s => s.delete(KEY));
      // ignore stale handoffs (e.g. a tab that never opened E-Sign)
      return v && Date.now() - v.at < 30 * 60 * 1000 ? v : null;
    }
  };
})();
