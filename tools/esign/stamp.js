/* =====================================================================
   SigStamp — on-screen preview of the digital-ID style signature block
   that the `esign` edge function draws into the PDF:

     MANKOWSKI.     Digitally signed by
     BEN            MANKOWSKI.BEN
                    Date: 2026.10.15
                    08:27:36 -04'00'

   SigStamp.ident(name)         -> "MANKOWSKI.BEN" (keep in sync with ident()
                                   in supabase/functions/esign/index.ts)
   SigStamp.html(name, when?)   -> preview markup (style it with .sigstamp)
   SigStamp.tzOffset()          -> minutes behind UTC, sent with create/sign so
                                   the server stamps the signer's local time
   ===================================================================== */
(function(){
  function ident(name){
    const w = String(name || '').toUpperCase().replace(/[^A-ZÀ-Þ'\- ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if(w.length < 2) return w[0] || 'SIGNER';
    return [w[w.length - 1], ...w.slice(0, -1)].join('.');
  }
  const p = n => String(n).padStart(2, '0');
  function parts(d){
    const off = d.getTimezoneOffset(), a = Math.abs(off);
    return {
      day: `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`,
      time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${off > 0 ? '-' : '+'}${p(Math.floor(a / 60))}'${p(a % 60)}'`,
    };
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function html(name, when){
    const id = ident(name), t = parts(when || new Date());
    const dot = id.indexOf('.');
    const left = dot > 0 ? `${esc(id.slice(0, dot + 1))}<br>${esc(id.slice(dot + 1))}` : esc(id);
    return `<div class="sigstamp"><div class="ss-l">${left}</div>`
      + `<div class="ss-r">Digitally signed by<br>${esc(id)}<br>Date: ${t.day}<br>${t.time}</div></div>`;
  }
  /* MM/DD/YYYY, zero-padded — matches what the server writes on the date line. */
  const today = (d = new Date()) => `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
  window.SigStamp = { ident, html, today, tzOffset: () => new Date().getTimezoneOffset() };
})();
