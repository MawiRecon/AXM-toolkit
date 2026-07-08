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
  LocalStore.prototype.upsert = function (row) {
    var rows = this._read();
    if (!row.id) { row.id = uuid(); row.created_at = new Date().toISOString(); }
    row.updated_at = new Date().toISOString();
    var i = rows.findIndex(function (r) { return r.id === row.id; });
    if (i >= 0) rows[i] = Object.assign({}, rows[i], row); else rows.push(row);
    this._write(rows);
    return Promise.resolve(row);
  };
  LocalStore.prototype.remove = function (id) {
    this._write(this._read().filter(function (r) { return r.id !== id; }));
    return Promise.resolve();
  };
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
  LocalStore.prototype.count = function () { return Promise.resolve(this._read().length); };
  LocalStore.prototype.onChange = function (f) { this._subs.push(f); };

  /* ---------------- Supabase backend ---------------- */
  function SupabaseStore(client) {
    this.c = client; this._subs = [];
    var self = this;
    this.c.channel('billing_rows_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_rows' },
          function () { self._subs.forEach(function (f) { try { f(); } catch (e) {} }); })
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
  SupabaseStore.prototype.remove = function (id) {
    return this.c.from('billing_rows').delete().eq('id', id)
      .then(function (r) { if (r.error) throw r.error; });
  };
  SupabaseStore.prototype.bulkInsert = function (list) {
    return this.c.from('billing_rows').insert(list).select()
      .then(function (r) { if (r.error) throw r.error; return (r.data || []).length; });
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
