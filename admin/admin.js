// Admin page for the Bargin products sheet.
// Sign-in: Google Identity Services gives an ID token; every request sends it to the
// Apps Script web app (SHOP.adminApi), which checks it and that it is the owner's account.
// The token is kept in memory only (never in storage). Sheet data is shown with textContent only.
// Style: ES2017 only, like the rest of the site.
(function () {
  'use strict';

  var TEXT = {
    notSetUp: 'صفحه‌ی مدیریت هنوز راه‌اندازی نشده. شناسه‌ی گوگل و لینک Apps Script رو توی products.js بذار.',
    gsiBlocked: 'نتونستیم ورود با گوگل رو بالا بیاریم. شاید یه افزونه (مثل مسدودکننده‌ی تبلیغ) جلوشو گرفته. اون رو خاموش کن و صفحه رو دوباره بارگذاری کن.',
    expired: 'نشستت تموم شد. دوباره وارد شو.',
    signinFail: 'ورود انجام نشد. دوباره امتحان کن.',
    loading: 'در حال خوندن شیت…',
    saving: 'در حال ذخیره…',
    deleting: 'در حال حذف…',
    working: 'یه لحظه صبر کن…',
    count: 'تعداد محصول: {n}',
    empty: 'هنوز محصولی توی شیت نیست.',
    issuesTitle: 'این موارد باید درست بشن:',
    rowLabel: 'سطر {n}',
    noId: '(بدون شناسه)',
    inStock: 'موجود',
    soldOut: 'ناموجود',
    edit: 'ویرایش',
    editTitle: 'ویرایش: {name}',
    newTitle: 'محصول جدید',
    confirmDelete: 'مطمئنی می‌خوای «{name}» رو از شیت پاک کنی؟ این کار برگشت نداره.',
    saved: 'ذخیره شد. لیست به‌روز شد.',
    deleted: 'محصول پاک شد. لیست به‌روز شد.',
    saveBlocked: 'ذخیره نشد. اول مشکل‌ها رو درست کن.',
    deleteFail: 'پاک نشد.',
    loadFail: 'نتونستیم شیت رو بخونیم. دوباره امتحان کن.',
    network: 'به سرور وصل نشدیم. اینترنتت رو چک کن و دوباره امتحان کن.',
    serverFail: 'یه مشکلی پیش اومد. دوباره امتحان کن.',
    csvReady: 'فایل CSV آماده شد ({n} محصول).',
    csvBlocked: 'فایل ساخته نشد. اول مشکل‌ها رو درست کن.',
    noIdEdit: 'این ردیف شناسه نداره. اول توی شیت شناسه بذار، بعد بارگذاری دوباره رو بزن.',
    fieldLabel: {
      id: 'شناسه (id)', name: 'اسم (name)', category: 'دسته‌بندی (category)', price: 'قیمت (price)',
      unit: 'واحد (unit)', serves: 'چقدر برای هر نفر؟ (serves)', short: 'متن کوتاه (short)',
      details: 'توضیحات (details)', recipe: 'دستور پخت (recipe)', images: 'عکس‌ها (images)', soldOut: 'ناموجود (soldOut)'
    },
    fieldHint: {
      id: 'انگلیسی و بدون فاصله. اگه عوضش کنی، ردیف همین‌جا تغییر می‌کنه.',
      price: 'فقط عدد. «,» و رقم فارسی اشکالی نداره. مثلاً ۴۲۰,۰۰۰',
      unit: 'مثلاً کیلو یا ۴۰۰ گرم',
      serves: 'مثلاً: هر نفر حدود ۱۰۰ گرم. یه پک برای ۴ نفر کافیه.',
      images: 'مسیر عکس‌ها رو با | از هم جدا کن. اولی روی کارت می‌آد.',
      recipe: 'خط اول: اسم غذا. خط‌های «- » مواد. خط‌های شماره‌دار: مراحل. بقیه: نکته.',
      soldOut: 'yes یا no. خالی یعنی no.'
    }
  };

  var HEADER = ['id', 'name', 'category', 'price', 'unit', 'serves', 'short', 'details', 'recipe', 'images', 'soldOut'];
  var TEXTAREA_ROWS = { serves: 2, short: 2, details: 4, recipe: 7, images: 2 };
  var LTR_FIELDS = { id: true, price: true, images: true, soldOut: true };
  var GSI_WAIT_MS = 6000;

  var token = '';          // the ID token: memory only
  var products = [];       // rows from the sheet
  var editId = '';         // the id of the open product ('' = new)
  var busy = false;
  var gsiReady = false;

  function $(id) { return document.getElementById(id); }
  function fill(t, v) {
    return t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? String(v[k]) : m; });
  }
  function conf(name) {
    return (typeof SHOP !== 'undefined' && SHOP && SHOP[name]) ? String(SHOP[name]) : '';
  }
  function toFa(n) {
    return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(d); });
  }

  // ---- screens ----
  var SCREENS = ['s-setup', 's-signin', 's-denied', 's-app'];
  function show(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
  }
  function setStatus(text, kind) {
    var el = $('status');
    el.textContent = text || '';
    el.className = 'adm-status' + (kind ? ' ' + kind : '');
  }
  function setSigninStatus(text, kind) {
    var el = $('signin-status');
    el.textContent = text || '';
    el.className = 'adm-status' + (kind ? ' ' + kind : '');
  }
  function setBusy(on) {
    busy = on;
    ['reload', 'add-new', 'download', 'save', 'delete', 'confirm-yes'].forEach(function (id) { $(id).disabled = on; });
  }
  function showSetup(text) {
    $('setup-msg').textContent = text;
    show('s-setup');
  }

  // ---- API ----
  // Sends {token, action, data} as text/plain (no CORS preflight). Resolves with the answer's
  // `data`, or rejects with {code}. Codes: auth, forbidden, network, server, bad_request, unknown_action.
  function api(action, data) {
    if (!token) return Promise.reject({ code: 'auth' });
    return fetch(conf('adminApi'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: token, action: action, data: data || {} }),
      redirect: 'follow'
    }).then(function (res) {
      return res.json();
    }, function () {
      throw { code: 'network' };
    }).then(function (json) {
      if (!json || json.ok !== true) throw { code: (json && json.error) || 'server' };
      return json.data;
    }, function (err) {
      throw err && err.code ? err : { code: 'server' };
    });
  }

  // Handles an API error: back to sign-in or the wrong-account screen, or a message.
  function onApiError(err, fallbackText) {
    var code = err && err.code;
    if (code === 'forbidden') { dropToken(); show('s-denied'); return; }
    if (code === 'auth') { dropToken(); show('s-signin'); setSigninStatus(TEXT.expired, 'err'); return; }
    setStatus(code === 'network' ? TEXT.network : (fallbackText || TEXT.serverFail), 'err');
  }

  function dropToken() {
    token = '';
    products = [];
    renderList();
    showIssues([]);
    setStatus('');
    closeForm();
    setBusy(false);
  }

  // ---- sign-in ----
  function onCredential(resp) {
    if (!resp || !resp.credential) { show('s-signin'); setSigninStatus(TEXT.signinFail, 'err'); return; }
    token = resp.credential;
    show('s-app');
    setStatus(TEXT.loading);
    load();
  }

  function startSignin() {
    if (!window.google || !google.accounts || !google.accounts.id) { showSetup(TEXT.gsiBlocked); return; }
    if (!gsiReady) {
      google.accounts.id.initialize({ client_id: conf('adminClientId'), callback: onCredential, auto_select: false });
      google.accounts.id.renderButton($('gsi-button'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'fa' });
      gsiReady = true;
    }
    show('s-signin');
  }

  function waitForGsi() {
    var waited = 0;
    (function tick() {
      if (window.google && google.accounts && google.accounts.id) { startSignin(); return; }
      if (window.__gsiFailed || waited >= GSI_WAIT_MS) { showSetup(TEXT.gsiBlocked); return; }
      waited += 100;
      setTimeout(tick, 100);
    })();
  }

  function logout() {
    dropToken();
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    setStatus('');
    setSigninStatus('');
    show('s-signin');
  }

  // ---- list ----
  function showIssues(issues) {
    var box = $('issues');
    var ul = $('issues-list');
    ul.textContent = '';
    if (!issues || !issues.length) { box.hidden = true; return; }
    $('issues-title').textContent = TEXT.issuesTitle;
    issues.forEach(function (it) {
      var li = document.createElement('li');
      if (it.row) {
        var no = document.createElement('span');
        no.className = 'row-no';
        no.textContent = fill(TEXT.rowLabel, { n: toFa(it.row) }) + ':';
        li.appendChild(no);
        li.appendChild(document.createTextNode(' '));
      }
      li.appendChild(document.createTextNode(String(it.message)));
      ul.appendChild(li);
    });
    box.hidden = false;
  }

  function renderList() {
    var ul = $('list');
    ul.textContent = '';
    var rows = products.filter(function (r) {
      return HEADER.some(function (h) { return String(r[h] || '').trim() !== ''; });
    });
    $('count').textContent = rows.length ? fill(TEXT.count, { n: toFa(rows.length) }) : TEXT.empty;
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.appendChild(document.createTextNode(String(r.name || '') || TEXT.noId));
      var small = document.createElement('small');
      small.textContent = [r.id || TEXT.noId, r.category, r.price].filter(function (x) { return x; }).join(' · ');
      nm.appendChild(small);
      var tag = document.createElement('span');
      var out = String(r.soldOut || '').toLowerCase() === 'yes';
      tag.className = 'tag' + (out ? ' out' : '');
      tag.textContent = out ? TEXT.soldOut : TEXT.inStock;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost';
      btn.textContent = TEXT.edit;
      btn.addEventListener('click', function () { openForm(r); });
      li.appendChild(nm);
      li.appendChild(tag);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function load(keepMessage) {
    setBusy(true);
    if (!keepMessage) setStatus(TEXT.loading);
    return api('getProducts').then(function (d) {
      products = (d && d.rows) || [];
      renderList();
      showIssues((d && d.issues) || []);
      if (!keepMessage) setStatus('');
      setBusy(false);
    }, function (err) {
      setBusy(false);
      onApiError(err, TEXT.loadFail);
    });
  }

  // ---- form ----
  function buildFields() {
    var box = $('fields');
    box.textContent = '';
    HEADER.forEach(function (h) {
      var label = document.createElement('label');
      label.setAttribute('for', 'f-' + h);
      label.appendChild(document.createTextNode(TEXT.fieldLabel[h]));
      if (TEXT.fieldHint[h]) {
        var hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = TEXT.fieldHint[h];
        label.appendChild(hint);
      }
      var input = TEXTAREA_ROWS[h] ? document.createElement('textarea') : document.createElement('input');
      if (TEXTAREA_ROWS[h]) input.rows = TEXTAREA_ROWS[h]; else input.type = 'text';
      input.id = 'f-' + h;
      input.autocomplete = 'off';
      if (LTR_FIELDS[h]) input.className = 'ltr';
      box.appendChild(label);
      box.appendChild(input);
    });
  }

  function openForm(row) {
    editId = row ? String(row.id || '') : '';
    if (row && !editId) { setStatus(TEXT.noIdEdit, 'err'); return; }
    HEADER.forEach(function (h) { $('f-' + h).value = row ? String(row[h] || '') : ''; });
    if (!row) $('f-soldOut').value = 'no';
    $('form-title').textContent = row ? fill(TEXT.editTitle, { name: row.name || row.id }) : TEXT.newTitle;
    $('delete').hidden = !row;
    $('confirm').hidden = true;
    $('form').hidden = false;
    $('list-card').hidden = true;
    setStatus('');
    $('f-' + (row ? 'name' : 'id')).focus();
    $('form').scrollIntoView();
  }

  function closeForm() {
    editId = '';
    $('form').hidden = true;
    $('confirm').hidden = true;
    $('list-card').hidden = false;
  }

  function collect() {
    var item = {};
    HEADER.forEach(function (h) { item[h] = $('f-' + h).value; });
    return item;
  }

  function save(ev) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.saving);
    showIssues([]);
    api('saveProduct', { item: collect(), originalId: editId }).then(function (r) {
      if (r && r.ok) {
        closeForm();
        setStatus(TEXT.saved, 'ok');
        return load(true);
      }
      setBusy(false);
      setStatus(TEXT.saveBlocked, 'err');
      showIssues((r && r.issues) || (r && r.message ? [{ row: null, message: r.message }] : []));
    }, function (err) {
      setBusy(false);
      onApiError(err);
    });
  }

  function askDelete() {
    var name = $('f-name').value || editId;
    $('confirm-text').textContent = fill(TEXT.confirmDelete, { name: name });
    $('confirm').hidden = false;
  }

  function doDelete() {
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.deleting);
    api('deleteProduct', { id: editId }).then(function (r) {
      if (r && r.ok) {
        closeForm();
        setStatus(TEXT.deleted, 'ok');
        return load(true);
      }
      setBusy(false);
      $('confirm').hidden = true;
      setStatus((r && r.message) || TEXT.deleteFail, 'err');
    }, function (err) {
      setBusy(false);
      onApiError(err, TEXT.deleteFail);
    });
  }

  // ---- CSV backup ----
  function download() {
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.working);
    api('publishCsv').then(function (r) {
      setBusy(false);
      if (!r || !r.ok) {
        setStatus(TEXT.csvBlocked, 'err');
        showIssues((r && r.issues) || []);
        return;
      }
      showIssues([]);
      var blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'products.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      setStatus(fill(TEXT.csvReady, { n: toFa(r.count) }), 'ok');
    }, function (err) {
      setBusy(false);
      onApiError(err);
    });
  }

  // ---- start ----
  function init() {
    buildFields();
    $('reload').addEventListener('click', function () { if (!busy) { closeForm(); showIssues([]); load(); } });
    $('add-new').addEventListener('click', function () { openForm(null); });
    $('download').addEventListener('click', download);
    $('logout').addEventListener('click', logout);
    $('other-account').addEventListener('click', logout);
    $('form').addEventListener('submit', save);
    $('cancel').addEventListener('click', closeForm);
    $('delete').addEventListener('click', askDelete);
    $('confirm-no').addEventListener('click', function () { $('confirm').hidden = true; });
    $('confirm-yes').addEventListener('click', doDelete);

    if (!conf('adminClientId') || !conf('adminApi')) { showSetup(TEXT.notSetUp); return; }
    // Google's sign-in script is added here so a block (ad blocker, offline) is noticed.
    var gs = document.createElement('script');
    gs.src = 'https://accounts.google.com/gsi/client';
    gs.async = true;
    gs.addEventListener('error', function () { window.__gsiFailed = true; });
    document.head.appendChild(gs);
    waitForGsi();
  }

  init();
})();
