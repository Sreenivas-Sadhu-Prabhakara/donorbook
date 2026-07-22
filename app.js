/* ============================================================
   donorbook — UI wiring. All handlers via addEventListener (CSP forbids
   inline). Reads globals from data/rules.js + data/engine.js.
   ============================================================ */
(function () {
  'use strict';

  var E = window.Engine;
  var COUNTRIES = window.COUNTRIES;
  var DONATION_TYPES = window.DONATION_TYPES;
  var GROUPS = window.GROUPS;
  var MATRIX = window.MATRIX;
  var RULESET = window.RULESET;
  var DEFERRAL_REASONS = window.DEFERRAL_REASONS;
  var LAST_VERIFIED = window.LAST_VERIFIED;

  var LS_LOG = 'donorbook.log.v1';
  var LS_THEME = 'donorbook.theme.v1';
  var LS_CARD = 'donorbook.card.v1';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function option(value, label) {
    var o = document.createElement('option');
    o.value = value; o.textContent = label; return o;
  }

  function typeName(code) {
    for (var i = 0; i < DONATION_TYPES.length; i++) if (DONATION_TYPES[i].code === code) return DONATION_TYPES[i].name;
    return code;
  }
  function countryName(code) {
    for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].code === code) return COUNTRIES[i].name;
    return code;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('is-on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- theme ---------------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(LS_THEME); } catch (e) {}
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
    var btn = $('#themeBtn');
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next;
      if (cur === 'light') next = 'dark';
      else if (cur === 'dark') next = 'light';
      else {
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        next = prefersDark ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', next);
      btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
      try { localStorage.setItem(LS_THEME, next); } catch (e) {}
    });
  }

  /* ---------------- tabs ---------------- */
  function initTabs() {
    var tabs = $$('.tab');
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        panel.hidden = !on;
        panel.classList.toggle('is-hidden', !on);
      });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (ev) {
        var idx = null;
        if (ev.key === 'ArrowRight') idx = (i + 1) % tabs.length;
        else if (ev.key === 'ArrowLeft') idx = (i - 1 + tabs.length) % tabs.length;
        else if (ev.key === 'Home') idx = 0;
        else if (ev.key === 'End') idx = tabs.length - 1;
        if (idx !== null) { ev.preventDefault(); select(tabs[idx]); tabs[idx].focus(); }
      });
    });
  }

  /* ---------------- populate selects ---------------- */
  function fillCountry(sel) { COUNTRIES.forEach(function (c) { sel.appendChild(option(c.code, c.name)); }); }
  function fillType(sel) { DONATION_TYPES.forEach(function (t) { sel.appendChild(option(t.code, t.name)); }); }
  function fillGroups(sel) { GROUPS.forEach(function (g) { sel.appendChild(option(g, g)); }); }

  /* ================= NEXT-DATE CALCULATOR ================= */
  var RING_CIRC = 2 * Math.PI * 82; // r=82

  function drawRingTicks() {
    var g = $('#ringTicks');
    if (!g) return;
    for (var i = 0; i < 24; i++) {
      var a = (i / 24) * 2 * Math.PI - Math.PI / 2;
      var r1 = 66, r2 = 72;
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', (100 + r1 * Math.cos(a)).toFixed(2));
      line.setAttribute('y1', (100 + r1 * Math.sin(a)).toFixed(2));
      line.setAttribute('x2', (100 + r2 * Math.cos(a)).toFixed(2));
      line.setAttribute('y2', (100 + r2 * Math.sin(a)).toFixed(2));
      g.appendChild(line);
    }
  }

  function setNotch(fraction, eligible) {
    var g = $('#ringNotch'); g.innerHTML = '';
    if (fraction === null) return;
    var a = fraction * 2 * Math.PI - Math.PI / 2;
    var r = 82;
    var cx = 100 + r * Math.cos(a), cy = 100 + r * Math.sin(a);
    var drop = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    drop.setAttribute('cx', cx.toFixed(2)); drop.setAttribute('cy', cy.toFixed(2));
    drop.setAttribute('r', '7');
    drop.setAttribute('class', 'ring__notch');
    drop.setAttribute('fill', eligible ? 'var(--ok)' : 'var(--accent)');
    g.appendChild(drop);
  }

  var calcState = { country: 'IN', type: 'whole', sex: 'any', last: '', next: null, ruleName: '', ruleUrl: '' };

  function renderCalc() {
    var f = $('#calcForm');
    var country = f.country.value, type = f.type.value, sex = f.sex.value, last = f.last.value;
    calcState.country = country; calcState.type = type; calcState.sex = sex; calcState.last = last;

    var ring = $('#ringFill'), big = $('#ringBig'), small = $('#ringSmall');
    var verdict = $('#calcVerdict'), ruleBox = $('#calcRule');
    var icsBtn = $('#icsBtn'), logBtn = $('#logFromCalcBtn');

    var iv = E.intervalDays(country, type, sex);
    var ruleRow = iv ? iv.rule : null;
    calcState.ruleName = ruleRow ? ruleRow.authority : '';
    calcState.ruleUrl = ruleRow ? ruleRow.source_url : '';

    // show the governing rule always
    ruleBox.innerHTML = '';
    if (ruleRow) {
      var rt = el('span'); rt.textContent = ruleRow.rule_text + ' ';
      var cite = el('cite'); cite.textContent = '— ' + ruleRow.authority;
      var sp = document.createTextNode('. ');
      var link = el('a'); link.href = ruleRow.source_url; link.textContent = 'source'; link.target = '_blank'; link.rel = 'noopener';
      ruleBox.appendChild(rt); ruleBox.appendChild(cite); ruleBox.appendChild(sp); ruleBox.appendChild(link);
      if (iv.conservative) {
        var note = el('div'); note.style.marginTop = '6px';
        note.textContent = 'This rule splits by sex — with sex unset, donorbook uses the longer (more cautious) interval. Choose your sex above for the exact date.';
        ruleBox.appendChild(note);
      }
    }

    if (!last) {
      ring.style.strokeDashoffset = RING_CIRC;
      ring.classList.remove('is-eligible');
      big.textContent = '—'; small.textContent = 'enter a last-donation date';
      setNotch(null);
      verdict.innerHTML = '';
      icsBtn.disabled = true; logBtn.disabled = false;
      calcState.next = null;
      return;
    }

    var next = E.nextEligible(last, type, country, sex);
    calcState.next = next;
    if (!next) { small.textContent = 'check the date'; return; }
    var t = todayISO();
    var du = E.daysUntil(next, t);
    var totalDays = iv.days;
    var elapsed = E.daysBetween(last, t);
    var frac = Math.max(0, Math.min(1, elapsed / totalDays));

    var eligible = du.status === 'eligible';
    ring.classList.toggle('is-eligible', eligible);
    ring.style.strokeDashoffset = (RING_CIRC * (1 - frac)).toFixed(1);
    setNotch(1, eligible); // notch at the top = the target (12 o'clock)

    if (eligible) {
      big.textContent = '✓';
      small.textContent = 'eligible since ' + next;
    } else {
      big.textContent = du.days;
      small.textContent = du.days === 1 ? 'day to go' : 'days to go';
    }

    verdict.className = 'verdict ' + (eligible ? 'verdict--eligible' : 'verdict--ask');
    verdict.innerHTML = '';
    var pill = el('span', 'verdict__pill', eligible ? 'Likely eligible now' : 'Next eligible ' + next);
    var line = el('div', 'verdict__line');
    line.textContent = eligible
      ? 'By interval alone you have passed the wait for ' + typeName(type).toLowerCase() + ' in ' + countryName(country) + '. Screening still decides.'
      : totalDays + '-day interval from your last donation on ' + last + '.';
    verdict.appendChild(pill); verdict.appendChild(line);

    icsBtn.disabled = false; logBtn.disabled = false;
  }

  function initCalc() {
    var f = $('#calcForm');
    fillCountry(f.country); fillType(f.type);
    drawRingTicks();
    $$('#calcForm select, #calcForm input').forEach(function (inp) {
      inp.addEventListener('input', renderCalc);
      inp.addEventListener('change', renderCalc);
    });
    $('#icsBtn').addEventListener('click', function () {
      if (!calcState.next) return;
      var summary = 'Eligible to donate ' + typeName(calcState.type).toLowerCase() + ' (' + countryName(calcState.country) + ')';
      var desc = 'Per ' + calcState.ruleName + ' interval rules. donorbook is a pre-check; the blood bank\'s screening decides. Source: ' + calcState.ruleUrl;
      var ics = E.buildICS(calcState.next, summary, desc, todayISO() + 'T00:00:00Z');
      download('donorbook-' + calcState.next + '.ics', ics, 'text/calendar');
      toast('Calendar reminder downloaded');
    });
    $('#logFromCalcBtn').addEventListener('click', function () {
      selectTab('tab-log');
      var d = $('#logDate');
      if (calcState.last) d.value = calcState.last;
      $('#logType').value = calcState.type;
      $('#logCentre').focus();
    });
    renderCalc();
  }

  /* ================= ELIGIBILITY PRE-CHECK ================= */
  function buildDeferralGrid() {
    var grid = $('#deferralGrid');
    grid.innerHTML = '';
    DEFERRAL_REASONS.forEach(function (r) {
      var wrap = el('div', 'deferral'); wrap.dataset.key = r.key;
      var cb = el('input', 'deferral__cb'); cb.type = 'checkbox'; cb.id = 'def-' + r.key;
      var lbl = el('label', 'deferral__lbl', r.label); lbl.setAttribute('for', 'def-' + r.key);
      var dateWrap = el('div', 'deferral__date');
      var date = el('input'); date.type = 'date'; date.max = '2100-12-31';
      date.setAttribute('aria-label', 'Date it happened: ' + r.label);
      date.disabled = true;
      dateWrap.appendChild(date);
      wrap.appendChild(cb); wrap.appendChild(lbl); wrap.appendChild(dateWrap);
      cb.addEventListener('change', function () {
        wrap.classList.toggle('is-on', cb.checked);
        date.disabled = !cb.checked;
        if (cb.checked && !date.value) date.value = todayISO();
        renderCheck();
      });
      date.addEventListener('input', renderCheck);
      grid.appendChild(wrap);
    });
  }

  function collectActive() {
    var active = [];
    $$('#deferralGrid .deferral').forEach(function (w) {
      var cb = $('.deferral__cb', w);
      if (cb && cb.checked) {
        var date = $('.deferral__date input', w);
        active.push({ key: w.dataset.key, eventDate: date.value || null });
      }
    });
    return active;
  }

  function renderCheck() {
    var f = $('#checkForm');
    var input = {
      country: f.country.value,
      sex: f.sex.value,
      ageYears: f.age.value === '' ? undefined : Number(f.age.value),
      weightKg: f.weight.value === '' ? undefined : Number(f.weight.value),
      hbGdl: f.hb.value === '' ? undefined : Number(f.hb.value),
      active: collectActive(),
    };
    var v = E.precheck(input, todayISO());
    var box = $('#checkVerdict'), list = $('#checkReasons');

    var map = {
      likely_eligible: { cls: 'verdict--eligible', label: 'Likely eligible' },
      likely_deferred: { cls: 'verdict--deferred', label: v.resumeDate ? 'Likely deferred until ' + v.resumeDate : 'Likely deferred' },
      ask_bank: { cls: 'verdict--ask', label: 'Ask the blood bank' },
    };
    var m = map[v.status];
    box.className = 'verdict verdict--big ' + m.cls;
    box.innerHTML = '';
    var pill = el('span', 'verdict__pill', m.label);
    box.appendChild(pill);
    var line = el('div', 'verdict__line');
    line.textContent = v.status === 'likely_eligible'
      ? 'You appear to meet the published baseline criteria with no active deferral. The blood bank\'s screening still decides.'
      : v.status === 'ask_bank'
        ? 'One or more answers cannot be computed from published general rules — confirm with the blood bank.'
        : 'A published deferral appears to still be in effect.';
    box.appendChild(line);

    list.innerHTML = '';
    if (!v.reasons.length) {
      var li0 = el('li', 'r-ok');
      li0.appendChild(el('div', 'r-text', 'No deferrals ticked and baseline criteria met for ' + countryName(input.country) + '.'));
      list.appendChild(li0);
    }
    v.reasons.forEach(function (r) {
      var cls = r.kind === 'deferral' || r.kind === 'permanent' ? 'r-defer' : (r.kind === 'ask_bank' ? 'r-ask' : 'r-defer');
      var li = el('li', cls);
      var txt = el('div', 'r-text');
      txt.textContent = r.text + (r.resume ? '  → resume on or after ' + r.resume : '');
      li.appendChild(txt);
      if (r.rule && r.rule.source_url) {
        var src = el('div', 'r-src');
        var cite = el('cite', null, r.rule.authority); src.appendChild(cite);
        src.appendChild(document.createTextNode(' · '));
        if (r.rule.source_quote) { src.appendChild(document.createTextNode('“' + r.rule.source_quote + '” ')); }
        var a = el('a', null, 'source'); a.href = r.rule.source_url; a.target = '_blank'; a.rel = 'noopener';
        src.appendChild(a);
        src.appendChild(document.createTextNode(' · verified ' + r.rule.last_verified));
        li.appendChild(src);
      }
      list.appendChild(li);
    });
  }

  function initCheck() {
    var f = $('#checkForm');
    fillCountry(f.country);
    buildDeferralGrid();
    $$('#checkForm select, #checkForm input').forEach(function (inp) {
      inp.addEventListener('input', renderCheck);
      inp.addEventListener('change', renderCheck);
    });
    renderCheck();
  }

  /* ================= LOGBOOK ================= */
  function loadLog() {
    try {
      var raw = localStorage.getItem(LS_LOG);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveLog(arr) {
    try { localStorage.setItem(LS_LOG, JSON.stringify(arr)); } catch (e) { toast('Could not save (storage blocked)'); }
  }
  function loadCard() {
    try { return JSON.parse(localStorage.getItem(LS_CARD) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveCard(c) { try { localStorage.setItem(LS_CARD, JSON.stringify(c)); } catch (e) {} }

  function sortedLog() {
    return loadLog().slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  }

  function renderLog() {
    var log = sortedLog();
    var body = $('#logBody');
    body.innerHTML = '';
    if (!log.length) {
      var tr = el('tr');
      var td = el('td'); td.colSpan = 5; td.className = 'logempty'; td.textContent = 'No donations logged yet. Add one above, or use "Log this donation" from the calculator.';
      tr.appendChild(td); body.appendChild(tr);
    } else {
      log.forEach(function (entry) {
        var tr = el('tr');
        tr.appendChild(el('td', 'tabular', entry.date));
        tr.appendChild(el('td', null, typeName(entry.type)));
        tr.appendChild(el('td', null, entry.centre || '—'));
        tr.appendChild(el('td', null, entry.notes || ''));
        var xtd = el('td');
        var x = el('button', 'rowx', '×'); x.type = 'button';
        x.setAttribute('aria-label', 'Remove donation on ' + entry.date);
        x.addEventListener('click', function () {
          var all = loadLog();
          var idx = all.findIndex(function (e) { return e.id === entry.id; });
          if (idx >= 0) { all.splice(idx, 1); saveLog(all); renderLog(); toast('Entry removed'); }
        });
        xtd.appendChild(x); tr.appendChild(xtd);
        body.appendChild(tr);
      });
    }
    renderLogSummary(log);
  }

  function renderLogSummary(log) {
    var box = $('#logSummary');
    box.innerHTML = '';
    var total = log.length;
    box.appendChild(stat('Donations logged', String(total)));

    // per-type next eligible from the newest entry of each type, using calculator country/sex
    var country = calcState.country || 'IN';
    var sex = calcState.sex || 'any';
    var newestByType = {};
    log.forEach(function (e) {
      if (!newestByType[e.type] || e.date > newestByType[e.type]) newestByType[e.type] = e.date;
    });
    var t = todayISO();
    DONATION_TYPES.forEach(function (dt) {
      if (!newestByType[dt.code]) return;
      var next = E.nextEligible(newestByType[dt.code], dt.code, country, sex);
      if (!next) return;
      var du = E.daysUntil(next, t);
      var s = stat(dt.name + ' next', du.status === 'eligible' ? 'now' : next);
      var v = $('.stat__v', s);
      v.classList.add(du.status === 'eligible' ? 'is-eligible' : 'is-waiting');
      box.appendChild(s);
    });

    // annual cap context (whole blood)
    var cap = E.annualCap(country, 'whole', sex);
    if (cap) {
      var yr = t.slice(0, 4);
      var thisYear = log.filter(function (e) { return e.type === 'whole' && e.date.slice(0, 4) === yr; }).length;
      box.appendChild(stat('Whole blood this year', thisYear + ' / ~' + cap.value));
    }
  }

  function stat(k, v) {
    var s = el('div', 'stat');
    s.appendChild(el('span', 'stat__k', k));
    s.appendChild(el('span', 'stat__v', v));
    return s;
  }

  function initLog() {
    fillType($('#logType'));
    fillGroups($('#cardGroup'));
    var card = loadCard();
    if (card.group) $('#cardGroup').value = card.group;
    if (card.name) $('#cardName').value = card.name;

    $('#logForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = ev.target;
      if (!f.date.value) { toast('Pick a date'); return; }
      var all = loadLog();
      all.push({
        id: 'd' + Date.now() + Math.floor(Math.random() * 1000),
        date: f.date.value,
        type: f.type.value,
        centre: f.centre.value.trim(),
        notes: f.notes.value.trim(),
      });
      saveLog(all);
      f.centre.value = ''; f.notes.value = '';
      renderLog();
      toast('Added to your private logbook');
    });

    $('#csvBtn').addEventListener('click', function () {
      var log = sortedLog();
      if (!log.length) { toast('Nothing to export yet'); return; }
      var csv = E.toCSV(['date', 'type', 'centre', 'notes'], log.map(function (e) {
        return { date: e.date, type: typeName(e.type), centre: e.centre, notes: e.notes };
      }));
      download('donorbook-log.csv', csv, 'text/csv');
      toast('CSV exported');
    });

    $('#cardBtn').addEventListener('click', function () {
      populateCard();
      saveCard({ group: $('#cardGroup').value, name: $('#cardName').value.trim() });
      window.print();
    });

    $('#cardGroup').addEventListener('change', function () { saveCard({ group: $('#cardGroup').value, name: $('#cardName').value.trim() }); });
    $('#cardName').addEventListener('input', function () { saveCard({ group: $('#cardGroup').value, name: $('#cardName').value.trim() }); });

    $('#clearBtn').addEventListener('click', function () {
      if (!window.confirm('Delete ALL donorbook data on this device — logbook, card and theme? This cannot be undone.')) return;
      try {
        localStorage.removeItem(LS_LOG); localStorage.removeItem(LS_CARD); localStorage.removeItem(LS_THEME);
      } catch (e) {}
      $('#cardName').value = '';
      renderLog();
      toast('All local data deleted');
    });

    renderLog();
  }

  function populateCard() {
    var log = sortedLog();
    $('#dcName').textContent = $('#cardName').value.trim() || '—';
    $('#dcGroup').textContent = $('#cardGroup').value || '—';
    $('#dcCount').textContent = String(log.length);
    // next eligible: newest whole-blood entry via calculator country/sex
    var wholeNewest = null;
    log.forEach(function (e) { if (e.type === 'whole' && (!wholeNewest || e.date > wholeNewest)) wholeNewest = e.date; });
    if (wholeNewest) {
      var next = E.nextEligible(wholeNewest, 'whole', calcState.country || 'IN', calcState.sex || 'any');
      var du = E.daysUntil(next, todayISO());
      $('#dcNext').textContent = du && du.status === 'eligible' ? 'Now (' + next + ')' : (next || '—');
    } else {
      $('#dcNext').textContent = '—';
    }
  }

  /* ================= BLOOD GROUPS ================= */
  function currentMode() {
    var r = document.querySelector('input[name="mode"]:checked');
    return r ? r.value : 'rbc';
  }

  function renderGroups() {
    var group = $('#groupSel').value;
    var mode = currentMode();
    var donates = mode === 'rbc' ? E.rbcDonatesTo(group) : E.plasmaDonatesTo(group);
    var receives = mode === 'rbc' ? E.rbcReceivesFrom(group) : E.plasmaReceivesFrom(group);

    fillChips($('#donatesTo'), donates);
    fillChips($('#receivesFrom'), receives);

    renderMatrix(group, mode, donates);
    var row = MATRIX.find(function (m) { return m.group === group; });
    $('#matrixSrc').textContent = row && row.source
      ? 'Source: ' + row.source.source_name + ' — verified ' + row.source.last_verified + '. Re-derived from ABO/Rh antigen–antibody rules in donorbook\'s own tests.'
      : '';
  }

  function fillChips(container, groups) {
    container.innerHTML = '';
    groups.forEach(function (g) { container.appendChild(el('span', 'gchip', g)); });
  }

  function renderMatrix(sel, mode, donatesList) {
    var table = $('#matrix');
    table.innerHTML = '';
    var cap = el('caption');
    cap.textContent = (mode === 'rbc' ? 'Red-cell' : 'Plasma') + ' donation: a filled cell means the row group can donate to the column group.';
    table.appendChild(cap);
    var thead = el('thead'); var htr = el('tr');
    htr.appendChild(headCell('to →'));
    GROUPS.forEach(function (g) { htr.appendChild(headCell(g)); });
    thead.appendChild(htr); table.appendChild(thead);
    var tbody = el('tbody');
    GROUPS.forEach(function (rg) {
      var tr = el('tr');
      tr.appendChild(headCell(rg));
      var rowData = MATRIX.find(function (m) { return m.group === rg; });
      var list = mode === 'rbc' ? rowData.rbc_donates_to : rowData.plasma_donates_to;
      GROUPS.forEach(function (cg) {
        var td = el('td');
        var yes = list.indexOf(cg) >= 0;
        td.className = yes ? 'yes' : 'no';
        if (rg === sel) td.classList.add('self');
        td.setAttribute('aria-label', rg + (yes ? ' can donate to ' : ' cannot donate to ') + cg);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }
  function headCell(txt) { var th = el('th'); th.scope = 'col'; th.textContent = txt; return th; }

  function initGroups() {
    fillGroups($('#groupSel'));
    $('#groupSel').value = 'O-';
    $('#groupSel').addEventListener('change', renderGroups);
    $$('input[name="mode"]').forEach(function (r) { r.addEventListener('change', renderGroups); });
    renderGroups();
  }

  /* ================= SOURCES ================= */
  function initSources() {
    var sel = $('#srcCountry');
    COUNTRIES.forEach(function (c) { sel.appendChild(option(c.code, c.name)); });
    sel.appendChild(option('MATRIX', 'Blood-group matrix'));
    sel.addEventListener('change', renderSources);
    renderSources();
  }

  function renderSources() {
    var filter = $('#srcCountry').value;
    var list = $('#sourcesList');
    list.innerHTML = '';

    var rows = RULESET.slice();
    if (filter !== 'all' && filter !== 'MATRIX') rows = rows.filter(function (r) { return r.country === filter; });
    if (filter === 'MATRIX') rows = [];

    var order = { interval: 0, age: 1, weight: 2, hemoglobin: 3, annual_cap: 4, deferral: 5 };
    rows.sort(function (a, b) {
      if (a.country !== b.country) return a.country < b.country ? -1 : 1;
      return (order[a.category] || 9) - (order[b.category] || 9);
    });

    rows.forEach(function (r) {
      var item = el('div', 'srcitem');
      var top = el('div', 'srcitem__top');
      top.appendChild(chip('tag-authority', r.authority));
      top.appendChild(chip('tag-cat', r.category.replace('_', ' ')));
      top.appendChild(chip(r.confidence === 'verbatim' ? 'tag-verbatim' : 'tag-paraphrased', r.confidence));
      item.appendChild(top);
      item.appendChild(el('div', 'srcitem__text', r.rule_text));
      if (r.source_quote) item.appendChild(el('div', 'srcitem__quote', '“' + r.source_quote + '”'));
      var meta = el('div', 'srcitem__meta');
      var a = el('a', null, 'View source'); a.href = r.source_url; a.target = '_blank'; a.rel = 'noopener';
      meta.appendChild(a);
      meta.appendChild(el('span', null, 'Last verified ' + r.last_verified));
      meta.appendChild(el('span', null, 'ID: ' + r.id));
      item.appendChild(meta);
      list.appendChild(item);
    });

    if (filter === 'all' || filter === 'MATRIX') {
      var m = el('div', 'srcitem');
      var mt = el('div', 'srcitem__top');
      mt.appendChild(chip('tag-authority', 'Immunohematology'));
      mt.appendChild(chip('tag-cat', 'blood group matrix'));
      mt.appendChild(chip('tag-verbatim', 'derived + checked'));
      m.appendChild(mt);
      m.appendChild(el('div', 'srcitem__text', 'The 8×8 ABO/Rh compatibility matrix (red cells and plasma). Re-derived from antigen–antibody first principles in donorbook\'s automated tests and cross-checked against a standard immunohematology reference.'));
      var mm = el('div', 'srcitem__meta');
      var ma = el('a', null, 'View reference'); ma.href = MATRIX[0].source.source_url; ma.target = '_blank'; ma.rel = 'noopener';
      mm.appendChild(ma);
      mm.appendChild(el('span', null, 'Last verified ' + MATRIX[0].source.last_verified));
      m.appendChild(mm);
      list.appendChild(m);
    }
  }
  function chip(cls, txt) { return el('span', 'tagchip ' + cls, txt); }

  /* ---------------- tab select helper ---------------- */
  function selectTab(id) {
    var tab = document.getElementById(id);
    if (tab) tab.click();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    $('#footVerified').textContent = LAST_VERIFIED;
    initTheme();
    initTabs();
    initCalc();
    initCheck();
    initLog();
    initGroups();
    initSources();
    // keep log summary in sync when the calc country/sex changes
    $$('#calcForm select').forEach(function (s) {
      s.addEventListener('change', function () { renderLog(); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
