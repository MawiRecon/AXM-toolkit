/* =====================================================================
   SigPad — draw-or-type signature capture, shared by the E-Sign tool
   (Grapeseed signer setup) and the public signing page.

   const pad = SigPad(containerEl, { nameInput })   // nameInput optional
   pad.isEmpty()  -> bool
   pad.toPNG()    -> "data:image/png;base64,..." cropped to the ink, black on transparent
   pad.clear()

   Typed mode renders the text in a script font; the font is loaded from
   Google Fonts by the host page (<link> for "Dancing Script").
   ===================================================================== */
(function(){
  const FONT = '"Dancing Script", "Brush Script MT", cursive';

  function SigPad(root, opts = {}){
    root.classList.add('sigpad');
    root.innerHTML = `
      <div class="sp-tabs" role="tablist">
        <button type="button" data-m="type" class="on">Type</button>
        <button type="button" data-m="draw">Draw</button>
      </div>
      <div class="sp-body">
        <input class="sp-typed" type="text" placeholder="Type your signature" autocomplete="off" spellcheck="false">
        <div class="sp-typed-preview" aria-hidden="true"></div>
        <canvas class="sp-canvas" hidden></canvas>
        <button type="button" class="sp-clear">Clear</button>
      </div>`;
    const tabs = root.querySelectorAll('.sp-tabs button');
    const typed = root.querySelector('.sp-typed');
    const preview = root.querySelector('.sp-typed-preview');
    const canvas = root.querySelector('.sp-canvas');
    const ctx = canvas.getContext('2d');
    let mode = 'type', drawn = false, last = null, typedTouched = false;

    // Pre-fill the typed signature from a name field until the user edits it.
    const name = opts.nameInput;
    const syncFromName = () => { if(name && !typedTouched){ typed.value = name.value; renderPreview(); } };
    if(name) name.addEventListener('input', syncFromName);
    typed.addEventListener('input', () => { typedTouched = true; renderPreview(); });
    function renderPreview(){ preview.textContent = typed.value; preview.style.fontFamily = FONT; }

    function sizeCanvas(){
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      drawn = false;
    }
    const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); last = pt(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, 7); ctx.fillStyle = '#111'; ctx.fill(); drawn = true; });
    canvas.addEventListener('pointermove', e => {
      if(!last) return;
      const p = pt(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; drawn = true;
    });
    const end = () => { last = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

    tabs.forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.m;
      tabs.forEach(x => x.classList.toggle('on', x === b));
      const draw = mode === 'draw';
      canvas.hidden = !draw; typed.hidden = draw; preview.hidden = draw;
      if(draw) sizeCanvas();
    }));
    root.querySelector('.sp-clear').addEventListener('click', clear);

    function clear(){
      if(mode === 'draw') sizeCanvas();
      else { typed.value = ''; typedTouched = true; renderPreview(); }
    }
    function isEmpty(){ return mode === 'draw' ? !drawn : !typed.value.trim(); }

    // Crop a canvas to its non-transparent pixels (+pad) and return PNG.
    function cropped(src){
      const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
        if(d[(y * w + x) * 4 + 3] > 8){ if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
      }
      if(x1 < 0) return null;
      const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
      const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    }

    async function toPNG(){
      if(isEmpty()) return null;
      if(mode === 'draw') return cropped(canvas);
      try { await document.fonts.load(`96px ${FONT}`); } catch(e){}
      const c = document.createElement('canvas'); c.width = 1400; c.height = 220;
      const g = c.getContext('2d');
      g.fillStyle = '#111'; g.textBaseline = 'middle';
      let size = 110; g.font = `${size}px ${FONT}`;
      while(g.measureText(typed.value).width > 1340 && size > 30){ size -= 6; g.font = `${size}px ${FONT}`; }
      g.fillText(typed.value.trim(), 20, 115);
      return cropped(c);
    }

    renderPreview();
    return { isEmpty, toPNG, clear, syncFromName };
  }

  window.SigPad = SigPad;
})();
