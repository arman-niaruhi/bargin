// Admin page for the Bargin products sheet.
// Login: the person types their email; if it is allowed, a one-time 6-digit code is emailed to it by the Apps Script web app (SHOP.adminApi).
// The code gives a random session token; the page sends it with every request. The token is kept in
// sessionStorage (survives a reload in this tab, gone when the tab closes), with a memory fallback.
// Sheet data is shown with textContent only.
// Style: ES2017 only, like the rest of the site.
(function () {
  'use strict';

  var TEXT = {
    notSetUp: 'صفحه‌ی مدیریت هنوز راه‌اندازی نشده. لینک Apps Script رو توی products.js بذار.',
    loginIntro: 'برای ورود، ایمیلتو بنویس تا یه کد ۶ رقمی برات بفرستیم.',
    needEmail: 'ایمیلتو بنویس.',
    badEmail: 'این ایمیل درست به نظر نمی‌رسه. دوباره چکش کن.',
    codeSentTo: 'کد به {email} فرستاده شد (اگه این ایمیل مجاز باشه).',
    sendCode: 'ارسال کد به ایمیل',
    sendingCode: 'در حال فرستادن کد…',
    codeSent: 'ایمیلتو چک کن (پوشه‌ی اسپم رو هم نگاه کن). کد ده دقیقه اعتبار داره.',
    codeLabel: 'کد ۶ رقمی',
    codeHint: 'مثلاً ۱۲۳۴۵۶',
    login: 'ورود',
    checking: 'در حال بررسی کد…',
    resend: 'ارسال دوباره',
    resendIn: 'ارسال دوباره ({n})',
    needCode: 'کد ۶ رقمی رو وارد کن.',
    badCode: 'کد درست نیست. {n} بار دیگه می‌تونی امتحان کنی.',
    codeExpired: 'کد منقضی شده. یه کد تازه بخواه.',
    tooMany: 'چند بار اشتباه زدی و این کد باطل شد. یه کد تازه بخواه.',
    cooldown: 'تازه کد فرستادیم. {n} ثانیه دیگه می‌تونی دوباره بخوای.',
    limitHour: 'تو این یه ساعت چند بار کد خواستی. یه ساعت دیگه امتحان کن.',
    limitDay: 'امروز زیاد کد خواستی. فردا دوباره امتحان کن.',
    mailFail: 'نتونستیم ایمیل رو بفرستیم. چند دقیقه دیگه دوباره امتحان کن.',
    busy: 'سرور الان مشغوله. چند لحظه بعد دوباره امتحان کن.',
    expired: 'نشستت تموم شد. دوباره وارد شو. چیزی که نوشته بودی از بین نمی‌ره.',
    loggedOut: 'از حساب اومدی بیرون.',
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
    newCategory: 'دسته‌بندی جدید…',
    newUnit: 'واحد جدید…',
    noUnit: 'بدون واحد',
    newCategoryHint: 'اسم دسته‌بندی جدید رو بنویس',
    newUnitHint: 'واحد جدید رو بنویس، مثلاً ۲۵۰ گرم',
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
  var CHOICE_FIELDS = { category: true, unit: true };
  var NEW_VALUE = '__new__';   // value of the «new…» option (never a real category or unit)
  var SESSION_KEY = 'bargin-admin-session';
  var COOLDOWN_DEFAULT = 60;

  var memSession = '';     // fallback when sessionStorage is not available
  var EMAIL_KEY = 'bargin-admin-email';
  var memEmail = '';       // the typed email (fallback when sessionStorage is not available)
  var challenge = '';      // the id of the code we asked for
  var resendAt = 0;        // time (ms) when «ارسال دوباره» is allowed
  var resendTimer = 0;
  var loaded = false;      // the list was read at least once
  var products = [];       // rows from the sheet
  var editId = '';         // the id of the open product ('' = new)
  var busy = false;

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

  // ---- session (sessionStorage, memory fallback) ----
  function getSession() {
    try { var v = window.sessionStorage.getItem(SESSION_KEY); if (v) return v; } catch (e) { /* use memory */ }
    return memSession;
  }
  function setSession(v) {
    memSession = v || '';
    try {
      if (v) window.sessionStorage.setItem(SESSION_KEY, v); else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* memory only */ }
  }

  // The email typed on the login screen, kept only for this tab so the code screen can show it.
  function getEmail() {
    try { var v = window.sessionStorage.getItem(EMAIL_KEY); if (v) return v; } catch (e) { /* use memory */ }
    return memEmail;
  }
  function setEmail(v) {
    memEmail = v || '';
    try {
      if (v) window.sessionStorage.setItem(EMAIL_KEY, v); else window.sessionStorage.removeItem(EMAIL_KEY);
    } catch (e) { /* memory only */ }
  }
  function showSentTo() {
    var p = $('code-sent');
    var parts = TEXT.codeSentTo.split('{email}');
    p.textContent = '';
    p.appendChild(document.createTextNode(parts[0]));
    var b = document.createElement('bdi');
    b.textContent = getEmail();
    p.appendChild(b);
    p.appendChild(document.createTextNode(parts.slice(1).join('{email}')));
  }

  // ---- screens ----
  var SCREENS = ['s-setup', 's-login', 's-code', 's-app'];
  function show(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
  }
  function setStatus(text, kind) {
    var el = $('status');
    el.textContent = text || '';
    el.className = 'adm-status' + (kind ? ' ' + kind : '');
  }
  function setLoginStatus(id, text, kind) {
    var el = $(id);
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
  // Sends {action, data, session} as text/plain (no CORS preflight). Resolves with the answer's
  // `data`, or rejects with the whole answer plus {code}. Codes: NO_SESSION, BUSY, network, server,
  // bad_request, unknown_action and the login codes (COOLDOWN, LIMIT_HOUR, LIMIT_DAY, MAIL_FAIL,
  // BAD_CODE, CODE_EXPIRED, TOO_MANY).
  function api(action, data, needSession) {
    var session = getSession();
    if (needSession && !session) return Promise.reject({ code: 'NO_SESSION' });
    return fetch(conf('adminApi'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, data: data || {}, session: session }),
      redirect: 'follow'
    }).then(function (res) {
      return res.json();
    }, function () {
      throw { code: 'network' };
    }).then(function (json) {
      if (!json || json.ok !== true) {
        var e = { code: (json && json.error) || 'server' };
        if (json && typeof json.retryAfter === 'number') e.retryAfter = json.retryAfter;
        if (json && typeof json.triesLeft === 'number') e.triesLeft = json.triesLeft;
        throw e;
      }
      return json.data;
    }, function (err) {
      throw err && err.code ? err : { code: 'server' };
    });
  }

  // Handles an API error: back to login (the form stays as it is) or a message.
  function onApiError(err, fallbackText) {
    var code = err && err.code;
    if (code === 'NO_SESSION') { backToLogin(TEXT.expired); return; }
    if (code === 'network') { setStatus(TEXT.network, 'err'); return; }
    if (code === 'BUSY') { setStatus(TEXT.busy, 'err'); return; }
    setStatus(fallbackText || TEXT.serverFail, 'err');
  }

  // The session ended: show the login again but keep the list and the open form.
  function backToLogin(message) {
    setSession('');
    setBusy(false);
    challenge = '';
    stopCountdown();
    $('code').value = '';
    setLoginStatus('login-status', message || '', message ? 'err' : '');
    setLoginStatus('code-status', '');
    show('s-login');
  }

  // ---- login ----
  function stopCountdown() {
    if (resendTimer) { clearInterval(resendTimer); resendTimer = 0; }
  }

  function tickResend() {
    var left = Math.ceil((resendAt - Date.now()) / 1000);
    var btn = $('resend');
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = fill(TEXT.resendIn, { n: toFa(left) });
    } else {
      stopCountdown();
      btn.disabled = false;
      btn.textContent = TEXT.resend;
    }
  }

  function startCountdown(seconds) {
    resendAt = Date.now() + seconds * 1000;
    stopCountdown();
    tickResend();
    resendTimer = setInterval(tickResend, 500);
  }

  function codeError(err) {
    switch (err && err.code) {
      case 'COOLDOWN': return fill(TEXT.cooldown, { n: toFa(err.retryAfter || COOLDOWN_DEFAULT) });
      case 'LIMIT_HOUR': return TEXT.limitHour;
      case 'LIMIT_DAY': return TEXT.limitDay;
      case 'MAIL_FAIL': return TEXT.mailFail;
      case 'BAD_CODE': return err.triesLeft !== undefined ? fill(TEXT.badCode, { n: toFa(err.triesLeft) }) : TEXT.needCode;
      case 'CODE_EXPIRED': return TEXT.codeExpired;
      case 'TOO_MANY': return TEXT.tooMany;
      case 'bad_request': return TEXT.badEmail;
      case 'BUSY': return TEXT.busy;
      case 'network': return TEXT.network;
      default: return TEXT.serverFail;
    }
  }

  // Asks the server to email a code. `fromCodeScreen` = the «ارسال دوباره» button.
  function sendCode(fromCodeScreen) {
    if (busy) return;
    var statusId = fromCodeScreen ? 'code-status' : 'login-status';
    var email = fromCodeScreen ? getEmail() : $('email').value.trim();
    if (!email) { setLoginStatus('login-status', TEXT.needEmail, 'err'); if (fromCodeScreen) { show('s-login'); } $('email').focus(); return; }
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) { setLoginStatus('login-status', TEXT.badEmail, 'err'); $('email').focus(); return; }
    setEmail(email);
    $('email').value = email;
    busy = true;
    $('send').disabled = true;
    setLoginStatus(statusId, TEXT.sendingCode);
    api('requestCode', { email: email }, false).then(function (d) {
      busy = false;
      $('send').disabled = false;
      challenge = String(d && d.challenge || '');
      $('code').value = '';
      show('s-code');
      showSentTo();
      setLoginStatus('code-status', TEXT.codeSent, 'ok');
      setLoginStatus('login-status', '');
      startCountdown(d && typeof d.cooldown === 'number' ? d.cooldown : COOLDOWN_DEFAULT);
      $('code').focus();
    }, function (err) {
      busy = false;
      $('send').disabled = false;
      setLoginStatus(statusId, codeError(err), 'err');
      if (err && err.code === 'COOLDOWN' && fromCodeScreen) startCountdown(err.retryAfter || COOLDOWN_DEFAULT);
    });
  }

  function onLoggedIn() {
    show('s-app');
    if (!loaded) { setStatus(TEXT.loading); load(); } else { setStatus(''); }
  }

  function verify(ev) {
    ev.preventDefault();
    if (busy) return;
    var code = $('code').value.replace(/[\s\u200c\u200f\u200e]/g, '');
    if (!code) { setLoginStatus('code-status', TEXT.needCode, 'err'); return; }
    busy = true;
    $('verify').disabled = true;
    setLoginStatus('code-status', TEXT.checking);
    api('verifyCode', { challenge: challenge, code: code }, false).then(function (d) {
      busy = false;
      $('verify').disabled = false;
      if (!d || typeof d.session !== 'string' || !d.session) { setLoginStatus('code-status', TEXT.serverFail, 'err'); return; }
      setSession(d.session);
      challenge = '';
      stopCountdown();
      $('code').value = '';
      setLoginStatus('code-status', '');
      onLoggedIn();
    }, function (err) {
      busy = false;
      $('verify').disabled = false;
      setLoginStatus('code-status', codeError(err), 'err');
      if (err && (err.code === 'CODE_EXPIRED' || err.code === 'TOO_MANY')) { challenge = ''; }
      $('code').select();
    });
  }

  // Logout goes through the server (the session is deleted there), then everything is cleared.
  function logout() {
    var done = function () {
      setSession('');
      challenge = '';
      loaded = false;
      products = [];
      renderList();
      showIssues([]);
      closeForm();
      setStatus('');
      setBusy(false);
      $('code').value = '';
      stopCountdown();
      setLoginStatus('code-status', '');
      setLoginStatus('login-status', TEXT.loggedOut, 'ok');
      show('s-login');
    };
    api('logout', {}, false).then(done, done);
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
    return api('getProducts', {}, true).then(function (d) {
      products = (d && d.rows) || [];
      loaded = true;
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
      if (CHOICE_FIELDS[h] || h === 'soldOut') {
        var sel = document.createElement('select');
        sel.id = 'f-' + h;
        if (h === 'soldOut') {
          [['no', 'no'], ['yes', 'yes']].forEach(function (o) {
            var op = document.createElement('option');
            op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
          });
          sel.className = 'ltr';
        } else {
          sel.addEventListener('change', function () { syncChoice(h); });
        }
        box.appendChild(label);
        box.appendChild(sel);
        if (CHOICE_FIELDS[h]) {
          var extra = document.createElement('input');
          extra.type = 'text';
          extra.id = 'f-' + h + '-new';
          extra.autocomplete = 'off';
          extra.hidden = true;
          extra.setAttribute('aria-label', h === 'category' ? TEXT.newCategoryHint : TEXT.newUnitHint);
          extra.placeholder = h === 'category' ? TEXT.newCategoryHint : TEXT.newUnitHint;
          box.appendChild(extra);
        }
        return;
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

  function syncChoice(h) {
    var isNew = $('f-' + h).value === NEW_VALUE;
    $('f-' + h + '-new').hidden = !isNew;
    if (isNew) $('f-' + h + '-new').focus();
  }

  // Fill a category/unit dropdown from the loaded products (order of first appearance).
  function fillChoice(h, current) {
    var sel = $('f-' + h);
    var seen = {}, list = [];
    products.forEach(function (r) {
      var v = String(r[h] || '').trim();
      if (v && !seen[v]) { seen[v] = true; list.push(v); }
    });
    current = String(current || '').trim();
    if (current && !seen[current]) list.push(current);
    sel.textContent = '';
    function add(value, text) {
      var op = document.createElement('option');
      op.value = value;
      op.textContent = text;
      sel.appendChild(op);
    }
    if (h === 'unit') add('', TEXT.noUnit);
    list.forEach(function (v) { add(v, v); });
    add(NEW_VALUE, h === 'category' ? TEXT.newCategory : TEXT.newUnit);
    sel.value = current;
    if (sel.value !== current) sel.value = h === 'unit' ? '' : (list[0] !== undefined ? list[0] : NEW_VALUE);
    $('f-' + h + '-new').value = '';
    syncChoice(h);
  }

  function openForm(row) {
    editId = row ? String(row.id || '') : '';
    if (row && !editId) { setStatus(TEXT.noIdEdit, 'err'); return; }
    HEADER.forEach(function (h) {
      if (CHOICE_FIELDS[h]) { fillChoice(h, row ? row[h] : ''); return; }
      $('f-' + h).value = row ? String(row[h] || '') : '';
    });
    if (!row) $('f-soldOut').value = 'no';
    else if (String(row.soldOut || '').toLowerCase() === 'yes') $('f-soldOut').value = 'yes';
    else $('f-soldOut').value = 'no';
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
    HEADER.forEach(function (h) {
      var v = $('f-' + h).value;
      if (CHOICE_FIELDS[h] && v === NEW_VALUE) v = $('f-' + h + '-new').value;
      item[h] = CHOICE_FIELDS[h] ? String(v).trim() : v;
    });
    return item;
  }

  function save(ev) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus(TEXT.saving);
    showIssues([]);
    api('saveProduct', { item: collect(), originalId: editId }, true).then(function (r) {
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
    api('deleteProduct', { id: editId }, true).then(function (r) {
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
    api('publishCsv', {}, true).then(function (r) {
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
    $('email-form').addEventListener('submit', function (ev) { ev.preventDefault(); sendCode(false); });
    $('resend').addEventListener('click', function () { sendCode(true); });
    $('code-form').addEventListener('submit', verify);
    $('form').addEventListener('submit', save);
    $('cancel').addEventListener('click', closeForm);
    $('delete').addEventListener('click', askDelete);
    $('confirm-no').addEventListener('click', function () { $('confirm').hidden = true; });
    $('confirm-yes').addEventListener('click', doDelete);

    if (!conf('adminApi')) { showSetup(TEXT.notSetUp); return; }
    $('email').value = getEmail();
    if (getSession()) { onLoggedIn(); } else { show('s-login'); }
  }

  init();
})();
