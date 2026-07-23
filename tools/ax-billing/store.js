/* =====================================================================
   Ax Billing Tracker — data-access layer
   ---------------------------------------------------------------------
   One async CRUD interface, two backends:
     LocalStore    — localStorage, for local testing (no auth, no cloud)
     SupabaseStore — the shared source of truth behind the shared login
   The rest of the app only ever calls Store.list/upsert/remove/onChange
   and never knows which backend is live.
   ===================================================================== */
(function () {
  "use strict";
  var CFG = window.AX_BILLING_CONFIG || { BACKEND: 'local' };
  var LS_KEY = 'ax_billing_rows_v1';
  var LS_HIST = 'ax_billing_history_v1';   // local-mode mirror of billing_rows_history
  var LS_COMMENTS = 'ax_billing_comments_v1';   // local-mode mirror of billing_comments

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /* ---------------- Local (browser) backend ---------------- */
  function LocalStore() {
    this._subs = [];
  }
  LocalStore.prototype.mode = 'local';
  LocalStore.prototype.needsAuth = function () { return false; };
  LocalStore.prototype.signIn = function () { return Promise.resolve(true); };
  LocalStore.prototype.signOut = function () { return Promise.resolve(); };
  LocalStore.prototype._read = function () {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  };
  LocalStore.prototype._write = function (rows) {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
    this._subs.forEach(function (f) { try { f(); } catch (e) {} });
  };
  LocalStore.prototype.list = function () {
    var rows = this._read();
    rows.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    return Promise.resolve(rows);
  };
  /* ---- local-mode history mirror ----
     In Supabase a trigger writes billing_rows_history; local mode has no trigger,
     so the store logs the same shape here. Keeps the history panel functional for
     local testing and for anyone running the tool offline. */
  LocalStore.prototype._logHist = function (action, oldRow, newRow) {
    try {
      var hist = JSON.parse(localStorage.getItem(LS_HIST) || '[]');
      var ref = newRow || oldRow || {};
      hist.push({
        id: hist.length ? hist[hist.length - 1].id + 1 : 1,
        row_id: ref.id, action: action,
        actor: ref.updated_by || null, campaign: ref.campaign_name || null,
        changed_at: new Date().toISOString(),
        old_data: oldRow ? Object.assign({}, oldRow) : null,
        new_data: newRow ? Object.assign({}, newRow) : null
      });
      localStorage.setItem(LS_HIST, JSON.stringify(hist));
    } catch (e) {}
  };
  // did anything change beyond the updated_at/updated_by bookkeeping? (mirrors the
  // trigger's guard against logging pure churn)
  LocalStore.prototype._changedBeyondMeta = function (a, b) {
    var skip = { updated_at: 1, updated_by: 1 }, keys = {};
    Object.keys(a || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(b || {}).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).some(function (k) {
      if (skip[k]) return false;
      return JSON.stringify(a ? a[k] : undefined) !== JSON.stringify(b ? b[k] : undefined);
    });
  };
  LocalStore.prototype.history = function (rowId) {
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem(LS_HIST) || '[]'); } catch (e) {}
    hist = hist.filter(function (h) { return h.row_id === rowId; })
               .sort(function (a, b) { return a.changed_at < b.changed_at ? 1 : -1; });
    return Promise.resolve(hist);
  };
  LocalStore.prototype.upsert = function (row) {
    var rows = this._read();
    if (!row.id) { row.id = uuid(); row.created_at = new Date().toISOString(); }
    row.updated_at = new Date().toISOString();
    var i = rows.findIndex(function (r) { return r.id === row.id; });
    var isNew = i < 0, oldRow = isNew ? null : rows[i];
    var merged = isNew ? row : Object.assign({}, rows[i], row);
    if (isNew) rows.push(row); else rows[i] = merged;
    this._write(rows);
    this._logHist(isNew ? 'insert' : 'update', oldRow, merged);
    return Promise.resolve(row);
  };
  /* Patch ONLY the given fields on an existing row. Unlike upsert, a patch to a
     row that was deleted out from under us is a no-op (0 rows) rather than a
     resurrection from column defaults. */
  LocalStore.prototype.update = function (id, patch) {
    var rows = this._read();
    var i = rows.findIndex(function (r) { return r.id === id; });
    if (i >= 0) {
      var oldRow = rows[i];
      patch.updated_at = new Date().toISOString();
      var merged = Object.assign({}, rows[i], patch);
      rows[i] = merged;
      this._write(rows);
      if (this._changedBeyondMeta(oldRow, merged)) this._logHist('update', oldRow, merged);
    }
    return Promise.resolve();
  };
  LocalStore.prototype.remove = function (id) {
    var rows = this._read();
    var victim = rows.find(function (r) { return r.id === id; });
    this._write(rows.filter(function (r) { return r.id !== id; }));
    if (victim) this._logHist('delete', victim, null);
    return Promise.resolve();
  };
  // Soft delete / restore — flip deleted_at, log the matching history action. Mirrors
  // the Supabase trigger so local mode and offline use behave identically.
  LocalStore.prototype._setDeleted = function (id, actor, when, action) {
    var rows = this._read();
    var i = rows.findIndex(function (r) { return r.id === id; });
    if (i >= 0) {
      var oldRow = rows[i];
      var merged = Object.assign({}, rows[i],
        { deleted_at: when, updated_by: actor, updated_at: new Date().toISOString() });
      rows[i] = merged; this._write(rows);
      this._logHist(action, oldRow, merged);
    }
    return Promise.resolve();
  };
  LocalStore.prototype.softDelete = function (id, actor) { return this._setDeleted(id, actor, new Date().toISOString(), 'delete'); };
  LocalStore.prototype.restore    = function (id, actor) { return this._setDeleted(id, actor, null, 'restore'); };
  LocalStore.prototype.bulkInsert = function (list) {
    var rows = this._read();
    list.forEach(function (row, i) {
      row.id = row.id || uuid();
      row.created_at = row.created_at || new Date().toISOString();
      row.updated_at = new Date().toISOString();
      if (row.sort_order == null) row.sort_order = rows.length + i;
      rows.push(row);
    });
    this._write(rows);
    return Promise.resolve(list.length);
  };
  /* Like bulkInsert, but keyed on id — re-running it with the same rows converges
     instead of duplicating. Used by the IO Tool inbox drain, which may legitimately
     retry a batch after a failed write. */
  LocalStore.prototype.bulkUpsert = function (list) {
    var rows = this._read();
    list.forEach(function (row, i) {
      row.id = row.id || uuid();
      row.updated_at = new Date().toISOString();
      var j = rows.findIndex(function (r) { return r.id === row.id; });
      if (j >= 0) { rows[j] = Object.assign({}, rows[j], row); }
      else {
        row.created_at = row.created_at || new Date().toISOString();
        if (row.sort_order == null) row.sort_order = rows.length + i;
        rows.push(row);
      }
    });
    this._write(rows);
    return Promise.resolve(list.length);
  };
  LocalStore.prototype.count = function () { return Promise.resolve(this._read().length); };
  LocalStore.prototype.onChange = function (f) { this._subs.push(f); };

  /* ---- comments (flags & notes) — local mirror of billing_comments ---- */
  LocalStore.prototype._readComments = function () {
    try { var v = JSON.parse(localStorage.getItem(LS_COMMENTS) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  };
  LocalStore.prototype._writeComments = function (list) {
    localStorage.setItem(LS_COMMENTS, JSON.stringify(list));
    this._subs.forEach(function (f) { try { f(); } catch (e) {} });
  };
  LocalStore.prototype.listComments = function () { return Promise.resolve(this._readComments()); };
  LocalStore.prototype.addComment = function (c) {
    var list = this._readComments();
    c.id = c.id || uuid(); c.created_at = c.created_at || new Date().toISOString();
    list.push(c); this._writeComments(list);
    return Promise.resolve(c);
  };
  LocalStore.prototype.updateComment = function (id, patch) {
    var list = this._readComments();
    var i = list.findIndex(function (c) { return c.id === id; });
    if (i >= 0) { list[i] = Object.assign({}, list[i], patch); this._writeComments(list); }
    return Promise.resolve();
  };

  /* ---------------- Supabase backend ---------------- */
  function SupabaseStore(client) {
    this.c = client; this._subs = [];
    var self = this;
    var fire = function () { self._subs.forEach(function (f) { try { f(); } catch (e) {} }); };
    this.c.channel('billing_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_rows' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_comments' }, fire)
      .subscribe();
  }
  SupabaseStore.prototype.mode = 'supabase';
  SupabaseStore.prototype.needsAuth = function () {
    var self = this;
    return this.c.auth.getSession().then(function (r) { return !(r.data && r.data.session); });
  };
  SupabaseStore.prototype.signIn = function (password) {
    return this.c.auth.signInWithPassword({ email: CFG.SHARED_EMAIL, password: password })
      .then(function (r) { if (r.error) throw r.error; return true; });
  };
  SupabaseStore.prototype.signOut = function () { return this.c.auth.signOut(); };
  SupabaseStore.prototype.list = function () {
    return this.c.from('billing_rows').select('*').order('sort_order', { ascending: true })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  };
  SupabaseStore.prototype.upsert = function (row) {
    row.updated_at = new Date().toISOString();
    return this.c.from('billing_rows').upsert(row).select().single()
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  };
  /* Partial UPDATE by id — touches only the columns in `patch`, so a field another
     user changed concurrently is never overwritten by our stale copy of it. */
  SupabaseStore.prototype.update = function (id, patch) {
    patch.updated_at = new Date().toISOString();
    return this.c.from('billing_rows').update(patch).eq('id', id)
      .then(function (r) { if (r.error) throw r.error; });
  };
  SupabaseStore.prototype.remove = function (id) {
    return this.c.from('billing_rows').delete().eq('id', id)
      .then(function (r) { if (r.error) throw r.error; });
  };
  // Soft delete / restore are just partial updates; the trigger reads the deleted_at
  // transition and logs 'delete' / 'restore' accordingly.
  SupabaseStore.prototype.softDelete = function (id, actor) {
    return this.update(id, { deleted_at: new Date().toISOString(), updated_by: actor });
  };
  SupabaseStore.prototype.restore = function (id, actor) {
    return this.update(id, { deleted_at: null, updated_by: actor });
  };
  /* ---- comments (flags & notes) ---- */
  SupabaseStore.prototype.listComments = function () {
    return this.c.from('billing_comments').select('*').order('created_at', { ascending: true })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; })
      .catch(function (e) { console.warn('comments load failed (table may not exist yet)', e); return []; });
  };
  SupabaseStore.prototype.addComment = function (c) {
    return this.c.from('billing_comments').insert(c).select().single()
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  };
  SupabaseStore.prototype.updateComment = function (id, patch) {
    return this.c.from('billing_comments').update(patch).eq('id', id)
      .then(function (r) { if (r.error) throw r.error; });
  };
  SupabaseStore.prototype.bulkInsert = function (list) {
    return this.c.from('billing_rows').insert(list).select()
      .then(function (r) { if (r.error) throw r.error; return (r.data || []).length; });
  };
  SupabaseStore.prototype.bulkUpsert = function (list) {
    return this.c.from('billing_rows').upsert(list, { onConflict: 'id' }).select()
      .then(function (r) { if (r.error) throw r.error; return (r.data || []).length; });
  };
  // Full change log for one row, newest first (written by the billing_rows_audit trigger).
  SupabaseStore.prototype.history = function (rowId) {
    return this.c.from('billing_rows_history').select('*').eq('row_id', rowId)
      .order('changed_at', { ascending: false })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  };
  SupabaseStore.prototype.count = function () {
    return this.c.from('billing_rows').select('id', { count: 'exact', head: true })
      .then(function (r) { return r.count || 0; });
  };
  SupabaseStore.prototype.onChange = function (f) { this._subs.push(f); };

  /* ---------------- factory ---------------- */
  window.makeStore = function () {
    if (CFG.BACKEND === 'supabase') {
      if (!window.supabase) throw new Error('supabase-js not loaded');
      var client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON);
      return new SupabaseStore(client);
    }
    return new LocalStore();
  };
})();
