/* ============================================================
   Rental House Manager — application logic
   Plain JS, no dependencies. Data is stored in localStorage.
   ============================================================ */
(function () {
  'use strict';

  var APP_VERSION = '2.0.0';
  var KEY = 'rentalManagerV2';
  var LEGACY_KEY = 'rentalManagerV1';
  var MAX_HISTORY_MONTHS = 24;

  var DEFAULT_SETTINGS = {
    landlordPhone: '',
    countryCode: '256',
    currency: 'UGX',
    deadline: '',
    theme: 'auto'
  };

  /* =========================================================
     1. Helpers
     ========================================================= */

  function byId(id) { return document.getElementById(id); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function num(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(n) {
    return round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function money(n) {
    var cur = (db.settings.currency || '').trim();
    return (cur ? cur + ' ' : '') + fmt(n);
  }

  function currentMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function isMonth(m) { return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m); }

  function monthIndex(m) {
    var p = m.split('-');
    return parseInt(p[0], 10) * 12 + (parseInt(p[1], 10) - 1);
  }

  function addMonths(m, delta) {
    var idx = monthIndex(m) + delta;
    var y = Math.floor(idx / 12);
    var mo = idx % 12;
    return y + '-' + String(mo + 1).padStart(2, '0');
  }

  function monthLabel(m) {
    var p = m.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, 1)
      .toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  function formatDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function monthsBetween(from, to) {
    var out = [];
    if (!isMonth(from) || !isMonth(to)) return out;
    var guard = 0;
    var cur = from;
    while (monthIndex(cur) <= monthIndex(to) && guard < 600) {
      out.push(cur);
      cur = addMonths(cur, 1);
      guard++;
    }
    return out;
  }

  function sortHouses(list) {
    return list.slice().sort(function (a, b) {
      return String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
        || String(a.tenant).localeCompare(String(b.tenant));
    });
  }

  /* =========================================================
     2. State + storage
     ========================================================= */

  function emptyDb() {
    return { houses: [], payments: [], readings: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
  }

  function normalizeHouse(h) {
    return {
      id: h && h.id ? String(h.id) : uid(),
      number: String(h && h.number !== undefined ? h.number : '').trim(),
      tenant: String((h && h.tenant) || '').trim(),
      phone: String((h && h.phone) || '').trim(),
      rent: num(h && h.rent),
      rate: num(h && h.rate),
      since: isMonth(h && h.since) ? h.since : '',
      until: isMonth(h && h.until) ? h.until : '',
      createdAt: (h && h.createdAt) || new Date().toISOString()
    };
  }

  function normalizePayment(p) {
    return {
      id: p && p.id ? String(p.id) : uid(),
      type: p && p.type === 'water' ? 'water' : 'rent',
      houseId: String((p && p.houseId) || ''),
      month: isMonth(p && p.month) ? p.month : currentMonth(),
      amount: num(p && p.amount),
      date: (p && p.date) || '',
      note: String((p && p.note) || '')
    };
  }

  function normalizeReading(r) {
    var prev = num(r && r.prev);
    var curr = num(r && r.curr);
    var units = r && r.units !== undefined ? num(r.units) : round2(curr - prev);
    var rate = num(r && r.rate);
    var charge = r && r.charge !== undefined ? num(r.charge) : round2(units * rate);
    return {
      id: r && r.id ? String(r.id) : uid(),
      houseId: String((r && r.houseId) || ''),
      month: isMonth(r && r.month) ? r.month : currentMonth(),
      prev: prev,
      curr: curr,
      units: round2(units),
      rate: rate,
      charge: round2(charge)
    };
  }

  function migrate(raw) {
    var src = raw || {};
    var settings = Object.assign({}, DEFAULT_SETTINGS, src.settings || {});
    if (!src.settings) {
      if (src.landlordPhone) settings.landlordPhone = String(src.landlordPhone);
      if (src.deadline) settings.deadline = String(src.deadline);
    }
    var houses = (Array.isArray(src.houses) ? src.houses : []).map(normalizeHouse);
    var payments = (Array.isArray(src.payments) ? src.payments : []).map(normalizePayment);
    var readings = (Array.isArray(src.readings) ? src.readings : []).map(normalizeReading);

    // Give legacy houses a start month so arrears are not invented.
    houses.forEach(function (h) {
      if (h.since) return;
      var months = [];
      payments.forEach(function (p) { if (p.houseId === h.id && isMonth(p.month)) months.push(p.month); });
      readings.forEach(function (r) { if (r.houseId === h.id && isMonth(r.month)) months.push(r.month); });
      months.sort();
      h.since = months.length ? months[0] : currentMonth();
    });

    return { houses: houses, payments: payments, readings: readings, settings: settings };
  }

  function load() {
    try {
      var v2 = localStorage.getItem(KEY);
      if (v2) return migrate(JSON.parse(v2));
      var v1 = localStorage.getItem(LEGACY_KEY);
      if (v1) return migrate(JSON.parse(v1));
    } catch (err) {
      if (window.console) console.warn('[RHM] Could not read saved data:', err);
    }
    return emptyDb();
  }

  var db = load();

  var ui = {
    tab: 'houses',
    month: currentMonth(),
    editingHouseId: null
  };

  var storageWarned = false;

  function save(silentToast) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (err) {
      if (window.console) console.warn('[RHM] Save failed:', err);
      if (!storageWarned) {
        storageWarned = true;
        toast('Could not save on this device. Private browsing may block storage — download a backup.', 'bad', 6000);
      }
      return false;
    }
  }

  var toastTimer = null;

  function toast(text, kind, ms) {
    var el = byId('toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'toast ' + (kind || 'ok');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, ms || (kind === 'bad' ? 5000 : 2200));
  }

  /* =========================================================
     3. Domain helpers
     ========================================================= */

  function houseById(id) {
    for (var i = 0; i < db.houses.length; i++) {
      if (db.houses[i].id === id) return db.houses[i];
    }
    return null;
  }

  function existsInMonth(h, m) {
    if (!isMonth(m)) return false;
    if (h.since && m < h.since) return false;
    if (h.until && m > h.until) return false;
    return true;
  }

  function housesInMonth(m) {
    return sortHouses(db.houses.filter(function (h) { return existsInMonth(h, m); }));
  }

  function activeHouses() {
    return sortHouses(db.houses.filter(function (h) { return !h.until; }));
  }

  /** Houses that should appear in a month's table: existing then, or with any money movement then. */
  function housesForTable(m) {
    var ids = {};
    housesInMonth(m).forEach(function (h) { ids[h.id] = true; });
    db.payments.forEach(function (p) { if (p.month === m) ids[p.houseId] = true; });
    db.readings.forEach(function (r) { if (r.month === m) ids[r.houseId] = true; });
    return sortHouses(db.houses.filter(function (h) { return ids[h.id]; }));
  }

  function sumPayments(houseId, type, month) {
    var total = 0;
    db.payments.forEach(function (p) {
      if (p.houseId === houseId && p.type === type && p.month === month) total += num(p.amount);
    });
    return round2(total);
  }

  function readingFor(houseId, month) {
    for (var i = 0; i < db.readings.length; i++) {
      if (db.readings[i].houseId === houseId && db.readings[i].month === month) return db.readings[i];
    }
    return null;
  }

  function rentFigures(h, m) {
    var due = existsInMonth(h, m) ? num(h.rent) : 0;
    var paid = sumPayments(h.id, 'rent', m);
    return { due: round2(due), paid: paid, balance: round2(due - paid) };
  }

  function waterFigures(h, m) {
    var r = readingFor(h.id, m);
    var billed = r ? num(r.charge) : 0;
    var paid = sumPayments(h.id, 'water', m);
    return { reading: r, billed: round2(billed), paid: paid, balance: round2(billed - paid) };
  }

  function rentStatus(f) {
    if (f.paid <= 0) return f.due <= 0 ? 'none' : 'unpaid';
    if (f.balance > 0) return 'partial';
    return 'paid';
  }

  function waterStatus(f) {
    if (!f.reading) return 'unread';
    if (f.billed <= 0) return 'paid';
    if (f.paid <= 0) return 'unpaid';
    if (f.balance > 0) return 'partial';
    return 'paid';
  }

  function statusPill(kind) {
    var map = {
      paid: ['ok', 'Paid'],
      partial: ['warn', 'Partial'],
      unpaid: ['bad', 'Unpaid'],
      unread: ['neutral', 'No reading'],
      none: ['neutral', '—']
    };
    var v = map[kind] || map.none;
    return '<span class="pill ' + v[0] + '">' + v[1] + '</span>';
  }

  /** Latest reading before month `m` (fallback: latest reading overall). */
  function previousReading(houseId, m) {
    var before = null;
    var latest = null;
    db.readings.forEach(function (r) {
      if (r.houseId !== houseId) return;
      if (!latest || monthIndex(r.month) > monthIndex(latest.month)) latest = r;
      if (monthIndex(r.month) < monthIndex(m)) {
        if (!before || monthIndex(r.month) > monthIndex(before.month)) before = r;
      }
    });
    return before || latest;
  }

  /** Unpaid rent + water from months earlier than `m`, for one house. */
  function arrearsFor(h, m) {
    var from = h.since || m;
    var months = monthsBetween(from, addMonths(m, -1));
    var rent = 0;
    var water = 0;
    months.forEach(function (mm) {
      if (h.until && mm > h.until) return;
      var r = rentFigures(h, mm);
      var w = waterFigures(h, mm);
      if (r.balance > 0) rent += r.balance;
      if (w.balance > 0) water += w.balance;
    });
    return { rent: round2(rent), water: round2(water), total: round2(rent + water) };
  }

  function arrearsRows(m) {
    return db.houses.map(function (h) { return { h: h, a: arrearsFor(h, m) }; })
      .filter(function (x) { return x.a.total > 0; })
      .sort(function (a, b) { return b.a.total - a.a.total; });
  }

  function monthTotals(m) {
    var t = { rentDue: 0, rentPaid: 0, rentOut: 0, waterBilled: 0, waterPaid: 0, waterOut: 0 };
    housesInMonth(m).forEach(function (h) { t.rentDue += num(h.rent); });
    db.payments.forEach(function (p) {
      if (p.month !== m) return;
      if (p.type === 'rent') t.rentPaid += num(p.amount);
      else t.waterPaid += num(p.amount);
    });
    db.readings.forEach(function (r) { if (r.month === m) t.waterBilled += num(r.charge); });
    t.rentOut = Math.max(0, round2(t.rentDue - t.rentPaid));
    t.waterOut = Math.max(0, round2(t.waterBilled - t.waterPaid));
    return {
      rentDue: round2(t.rentDue), rentPaid: round2(t.rentPaid), rentOut: t.rentOut,
      waterBilled: round2(t.waterBilled), waterPaid: round2(t.waterPaid), waterOut: t.waterOut,
      totalOut: round2(t.rentOut + t.waterOut)
    };
  }

  /* =========================================================
     4. Phones, WhatsApp, SMS
     ========================================================= */

  function digitsOnly(s) { return String(s || '').replace(/[^\d]/g, ''); }

  function normalizePhone(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var plus = s.charAt(0) === '+';
    var d = digitsOnly(s);
    if (!d) return '';
    var cc = digitsOnly(db.settings.countryCode) || '';
    if (plus) return d;
    if (d.indexOf('00') === 0) return d.slice(2);
    if (!cc) return d;
    if (d.charAt(0) === '0') return cc + d.slice(1);
    if (d.indexOf(cc) === 0) return d;
    if (d.length <= 9) return cc + d;
    return d;
  }

  function waLink(phone, text) {
    var p = normalizePhone(phone);
    var base = p ? 'https://wa.me/' + p : 'https://wa.me/';
    return base + '?text=' + encodeURIComponent(text);
  }

  function smsLink(phone, text) {
    var p = String(phone || '').replace(/[^\d+]/g, '');
    return 'sms:' + p + '?body=' + encodeURIComponent(text);
  }

  function tenantMessage(h, m) {
    var r = rentFigures(h, m);
    var w = waterFigures(h, m);
    var lines = ['Hello ' + (h.tenant || 'tenant') + ',', '',
      'Statement for House ' + h.number + ' — ' + monthLabel(m) + ':'];
    if (r.due > 0 || r.paid > 0) {
      lines.push('• Rent: ' + money(r.due) + ' due, ' + money(r.paid) + ' paid, balance ' + money(r.balance) + '.');
    }
    if (w.reading) {
      lines.push('• Water: ' + fmt(w.reading.units) + ' units = ' + money(w.billed) + ', paid ' + money(w.paid) + ', balance ' + money(w.balance) + '.');
    }
    var out = Math.max(0, r.balance) + Math.max(0, w.balance);
    lines.push('');
    lines.push(out > 0 ? 'Total outstanding: ' + money(out) + '.' : 'Your account is fully settled. Thank you.');
    if (out > 0 && db.settings.deadline) {
      lines.push('Please clear the balance by ' + formatDate(db.settings.deadline) + '.');
    }
    lines.push('', 'Thank you.');
    return lines.join('\n');
  }

  function landlordMessage(h, m) {
    var r = rentFigures(h, m);
    var w = waterFigures(h, m);
    return 'House ' + h.number + ' (' + h.tenant + ') — ' + monthLabel(m) + '\n' +
      'Rent: ' + money(r.due) + ' due, ' + money(r.paid) + ' paid, balance ' + money(r.balance) + '\n' +
      (w.reading
        ? 'Water: ' + fmt(w.reading.units) + ' units, ' + money(w.billed) + ' billed, ' + money(w.paid) + ' paid, balance ' + money(w.balance)
        : 'Water: no reading this month') +
      (r.balance > 0 && db.settings.deadline ? '\nClear by ' + formatDate(db.settings.deadline) : '');
  }

  function landlordSummaryMessage(m) {
    var rows = housesInMonth(m);
    var lines = ['Rent & water summary — ' + monthLabel(m), ''];
    var t = { due: 0, paid: 0, out: 0 };
    rows.forEach(function (h) {
      var r = rentFigures(h, m);
      var w = waterFigures(h, m);
      var out = Math.max(0, r.balance) + Math.max(0, w.balance);
      t.due += r.due; t.paid += r.paid + w.paid; t.out += out;
      lines.push('House ' + h.number + ' — ' + h.tenant + ': rent ' + fmt(r.paid) + '/' + fmt(r.due) +
        (w.reading ? ', water ' + fmt(w.billed) : '') + (out > 0 ? ', OUT ' + fmt(out) : ', clear'));
    });
    lines.push('');
    lines.push('Rent due: ' + money(t.due));
    lines.push('Collected: ' + money(t.paid));
    lines.push('Still owed: ' + money(t.out));
    return lines.join('\n');
  }

  /* =========================================================
     5. Rendering — houses
     ========================================================= */

  var monthInputSupported = (function () {
    var probe = document.createElement('input');
    probe.type = 'month';
    return probe.type === 'month';
  })();
  var useMonthFallback = !monthInputSupported;

  function monthChoices() {
    var set = {};
    var now = currentMonth();
    for (var i = -36; i <= 12; i++) set[addMonths(now, i)] = true;
    db.payments.forEach(function (p) { if (isMonth(p.month)) set[p.month] = true; });
    db.readings.forEach(function (r) { if (isMonth(r.month)) set[r.month] = true; });
    db.houses.forEach(function (h) {
      if (isMonth(h.since)) set[h.since] = true;
      if (isMonth(h.until)) set[h.until] = true;
    });
    return Object.keys(set).sort().reverse();
  }

  /** Some browsers (notably iOS Safari) have no month picker — offer a select instead. */
  function syncMonthControls() {
    var input = byId('month');
    var sel = byId('monthFallback');
    if (!input) return;
    if (!useMonthFallback) {
      input.hidden = false;
      if (sel) sel.hidden = true;
      var lbl2 = document.querySelector('.month-label');
      if (lbl2) lbl2.setAttribute('for', 'month');
      return;
    }
    input.hidden = true;
    if (!sel) return;
    sel.hidden = false;
    var lbl = document.querySelector('.month-label');
    if (lbl) lbl.setAttribute('for', 'monthFallback');
    var months = monthChoices();
    if (months.indexOf(ui.month) === -1) months.unshift(ui.month);
    var sig = months.join(',');
    if (sel.getAttribute('data-sig') !== sig) {
      sel.innerHTML = months.map(function (m) {
        return '<option value="' + esc(m) + '">' + esc(monthLabel(m)) + '</option>';
      }).join('');
      sel.setAttribute('data-sig', sig);
    }
    sel.value = ui.month;
  }

  function fillHouseSelects() {
    var opts = activeHouses().map(function (h) {
      return '<option value="' + esc(h.id) + '">House ' + esc(h.number) + ' – ' + esc(h.tenant) + '</option>';
    }).join('');
    if (!opts) opts = '<option value="">Add a house first</option>';

    ['rHouse', 'wHouse', 'wpHouse'].forEach(function (id) {
      var sel = byId(id);
      if (!sel) return;
      var prev = sel.value;
      sel.innerHTML = opts;
      if (prev && houseById(prev) && !houseById(prev).until) sel.value = prev;
    });
    updateWaterPreview();
    updateRentHint();
  }

  function renderHouses() {
    var m = ui.month;
    var list = sortHouses(db.houses);
    var body = byId('housesBody');
    var empty = byId('housesEmpty');
    if (!body) return;

    byId('houseCount').textContent = list.length
      ? list.length + ' house' + (list.length === 1 ? '' : 's')
      : '';

    empty.hidden = list.length > 0;
    body.innerHTML = list.map(function (h) {
      var f = rentFigures(h, m);
      var status = h.until ? '<span class="pill neutral">Vacated</span>' : statusPill(rentStatus(f));
      var toggle = h.until
        ? '<button class="btn small alt" type="button" data-act="reinstate-house" data-id="' + esc(h.id) + '">Reinstate</button>'
        : '<button class="btn small alt" type="button" data-act="vacate-house" data-id="' + esc(h.id) + '">Vacate</button>';
      return '<tr>' +
        '<td data-label="House">House ' + esc(h.number) + '</td>' +
        '<td data-label="Tenant">' + esc(h.tenant) + '</td>' +
        '<td data-label="Phone">' + (h.phone ? '<a href="tel:' + esc(normalizePhone(h.phone) ? '+' + normalizePhone(h.phone) : '') + '">' + esc(h.phone) + '</a>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="num" data-label="Rent / month">' + fmt(h.rent) + '</td>' +
        '<td class="num" data-label="Water / unit">' + fmt(h.rate) + '</td>' +
        '<td data-label="This month">' + status + '</td>' +
        '<td data-label="Actions"><div class="house-row-actions">' +
          '<button class="btn small alt" type="button" data-act="edit-house" data-id="' + esc(h.id) + '">Edit</button>' +
          toggle +
          '<button class="btn small danger" type="button" data-act="delete-house" data-id="' + esc(h.id) + '">Delete</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  function resetHouseForm() {
    ui.editingHouseId = null;
    byId('houseForm').reset();
    byId('houseFormTitle').textContent = 'Add a house';
    byId('houseFormBadge').hidden = true;
    byId('hCancel').hidden = true;
    byId('houseSubmit').textContent = 'Save house';
  }

  function editHouse(id) {
    var h = houseById(id);
    if (!h) return;
    ui.editingHouseId = id;
    byId('hNumber').value = h.number;
    byId('hTenant').value = h.tenant;
    byId('hPhone').value = h.phone;
    byId('hRent').value = h.rent;
    byId('hRate').value = h.rate;
    byId('houseFormTitle').textContent = 'Edit house ' + h.number;
    byId('houseFormBadge').hidden = false;
    byId('hCancel').hidden = false;
    byId('houseSubmit').textContent = 'Save changes';
    showTab('houses');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    byId('hNumber').focus();
  }

  function saveHouse(ev) {
    ev.preventDefault();
    var number = byId('hNumber').value.trim();
    var tenant = byId('hTenant').value.trim();
    var phone = byId('hPhone').value.trim();
    var rent = num(byId('hRent').value);
    var rate = num(byId('hRate').value);

    if (!number) return toast('Enter a house number.', 'bad');
    if (!tenant) return toast('Enter the tenant name.', 'bad');

    var dup = db.houses.filter(function (h) {
      return h.id !== ui.editingHouseId &&
        String(h.number).toLowerCase() === number.toLowerCase();
    })[0];
    if (dup) return toast('House ' + number + ' already exists.', 'bad');

    if (ui.editingHouseId) {
      var h = houseById(ui.editingHouseId);
      if (!h) return toast('That house no longer exists.', 'bad');
      h.number = number;
      h.tenant = tenant;
      h.phone = phone;
      h.rent = rent;
      h.rate = rate;
      save();
      toast('House ' + number + ' updated', 'ok');
    } else {
      db.houses.push(normalizeHouse({
        number: number, tenant: tenant, phone: phone, rent: rent, rate: rate,
        since: ui.month, until: ''
      }));
      save();
      toast('House ' + number + ' saved', 'ok');
    }
    resetHouseForm();
    fillHouseSelects();
    render();
  }

  function deleteHouse(id) {
    var h = houseById(id);
    if (!h) return;
    var ok = window.confirm('Delete House ' + h.number + ' (' + h.tenant + ')?\n\n' +
      'Payments and water readings for this house will be deleted too. This cannot be undone.');
    if (!ok) return;
    db.houses = db.houses.filter(function (x) { return x.id !== id; });
    db.payments = db.payments.filter(function (p) { return p.houseId !== id; });
    db.readings = db.readings.filter(function (r) { return r.houseId !== id; });
    save();
    fillHouseSelects();
    render();
    toast('House removed', 'ok');
  }

  function vacateHouse(id) {
    var h = houseById(id);
    if (!h) return;
    if (!window.confirm('Mark House ' + h.number + ' as vacated at the end of ' + monthLabel(ui.month) + '?\n\n' +
      'All history stays. Rent is still charged for ' + monthLabel(ui.month) + ', then stops.')) return;
    h.until = ui.month;
    save();
    fillHouseSelects();
    render();
    toast('House ' + h.number + ' marked vacated', 'ok');
  }

  function reinstateHouse(id) {
    var h = houseById(id);
    if (!h) return;
    h.until = '';
    save();
    fillHouseSelects();
    render();
    toast('House ' + h.number + ' is active again', 'ok');
  }

  /* =========================================================
     6. Rendering — rent
     ========================================================= */

  function updateRentHint() {
    var el = byId('rentHint');
    if (!el) return;
    var h = houseById(byId('rHouse').value);
    if (!h) { el.textContent = 'Add a house first.'; return; }
    var f = rentFigures(h, ui.month);
    el.textContent = monthLabel(ui.month) + ': rent ' + money(f.due) + ', paid ' + money(f.paid) +
      ', balance ' + money(f.balance) + '.';
    byId('rAmount').placeholder = f.balance > 0 ? fmt(f.balance) : fmt(h.rent);
  }

  function renderRent() {
    var m = ui.month;
    var list = housesForTable(m);
    var box = byId('rentMessages');
    if (!list.length) {
      box.innerHTML = '<div class="empty">Add a house first — then its rent shows up here.</div>';
    } else {
      box.innerHTML = list.map(function (h) {
        var f = rentFigures(h, m);
        var kind = rentStatus(f);
        var cls = { paid: 'ok', partial: 'warn', unpaid: 'bad', none: '' }[kind] || '';
        var ar = arrearsFor(h, m);
        var line;
        if (kind === 'unpaid') line = 'No rent received for ' + monthLabel(m) + '. Due ' + money(f.due) + '.';
        else if (kind === 'paid') line = 'Rent settled — ' + money(f.paid) + ' received.';
        else if (kind === 'partial') line = money(f.paid) + ' received. Still owed ' + money(f.balance) + '.';
        else line = 'No rent expected this month.';

        var actions = '';
        if (f.balance > 0) {
          if (!h.phone) {
            actions += '<span class="hint" style="margin:0">Add a phone number in Houses to message this tenant.</span>';
          } else {
            actions += '<a class="btn" href="' + esc(waLink(h.phone, tenantMessage(h, m))) + '" target="_blank" rel="noopener">WhatsApp</a>';
            actions += '<a class="btn alt" href="' + esc(smsLink(h.phone, tenantMessage(h, m))) + '">SMS</a>';
          }
          actions += '<button class="btn alt" type="button" data-act="pay-balance" data-type="rent" data-id="' + esc(h.id) + '">Mark balance paid</button>';
        }
        if (db.settings.landlordPhone) {
          actions += '<a class="btn alt" href="' + esc(waLink(db.settings.landlordPhone, landlordMessage(h, m))) + '" target="_blank" rel="noopener">Send to me</a>';
        }

        return '<div class="msg ' + cls + '">' +
          '<span class="msg-title">House ' + esc(h.number) + ' — ' + esc(h.tenant) + '</span> ' +
          statusPill(kind) +
          '<small>' + esc(line) + (ar.total > 0 ? ' Earlier unpaid: ' + esc(money(ar.total)) + '.' : '') + '</small>' +
          (actions ? '<div class="actions">' + actions + '</div>' : '') +
          '</div>';
      }).join('');
    }
    renderPaymentList('rent', m, 'rentPayments');
  }

  function recordPayment(type, houseId, amount, date, note) {
    db.payments.push(normalizePayment({
      type: type, houseId: houseId, amount: amount, date: date, month: ui.month, note: note
    }));
    save();
  }

  function payBalance(houseId, type) {
    var h = houseById(houseId);
    if (!h) return;
    var f = type === 'rent' ? rentFigures(h, ui.month) : waterFigures(h, ui.month);
    if (!(f.balance > 0)) return toast('Nothing left to pay for this month.', 'info');
    recordPayment(type, houseId, f.balance, today(), 'Balance paid');
    render();
    toast((type === 'rent' ? 'Rent' : 'Water') + ' balance recorded as paid', 'ok');
  }

  /* =========================================================
     7. Rendering — water
     ========================================================= */

  function updateWaterPreview() {
    var el = byId('waterPreview');
    if (!el) return;
    var h = houseById(byId('wHouse').value);
    var prev = parseFloat(byId('wPrev').value);
    var curr = parseFloat(byId('wCurr').value);
    if (!h || !isFinite(prev) || !isFinite(curr) || curr < prev) {
      el.textContent = 'Units used — · Charge —';
      return;
    }
    var units = round2(curr - prev);
    el.textContent = 'Units used ' + fmt(units) + ' × ' + fmt(h.rate) + ' = ' + money(units * h.rate);
  }

  function syncPrevReading() {
    var id = byId('wHouse').value;
    var last = previousReading(id, ui.month);
    byId('wPrev').value = last ? last.curr : '';
    byId('wCurr').value = '';
    updateWaterPreview();
  }

  function saveReading(ev) {
    ev.preventDefault();
    var h = houseById(byId('wHouse').value);
    if (!h) return toast('Add a house first.', 'bad');
    var prev = parseFloat(byId('wPrev').value);
    var curr = parseFloat(byId('wCurr').value);
    if (!isFinite(prev) || !isFinite(curr)) return toast('Enter both meter readings.', 'bad');
    if (prev < 0 || curr < 0) return toast('Readings cannot be negative.', 'bad');
    if (curr < prev) return toast('Current reading cannot be lower than the previous one.', 'bad');
    if (!isMonth(ui.month)) return toast('Choose a valid month first.', 'bad');

    var units = round2(curr - prev);
    var charge = round2(units * num(h.rate));
    var existing = readingFor(h.id, ui.month);
    var record = {
      id: existing ? existing.id : uid(),
      houseId: h.id, month: ui.month,
      prev: prev, curr: curr, units: units, rate: num(h.rate), charge: charge
    };
    if (existing) {
      Object.assign(existing, record);
    } else {
      db.readings.push(normalizeReading(record));
    }
    save();
    byId('wPrev').value = curr;
    byId('wCurr').value = '';
    updateWaterPreview();
    render();
    toast('Reading saved — ' + money(charge), 'ok');
  }

  function saveWaterPayment(ev) {
    ev.preventDefault();
    var h = houseById(byId('wpHouse').value);
    if (!h) return toast('Add a house first.', 'bad');
    var amount = num(byId('wpAmount').value);
    if (!(amount > 0)) return toast('Enter an amount greater than zero.', 'bad');
    var date = byId('wpDate').value || today();
    recordPayment('water', h.id, amount, date, byId('wpNote').value.trim());
    byId('wpAmount').value = '';
    byId('wpNote').value = '';
    render();
    toast('Water payment recorded', 'ok');
  }

  function deleteReading(id) {
    var r = db.readings.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    if (!window.confirm('Delete the water reading for ' + monthLabel(r.month) + '?')) return;
    db.readings = db.readings.filter(function (x) { return x.id !== id; });
    save();
    render();
    toast('Reading deleted', 'ok');
  }

  function deletePayment(id) {
    var p = db.payments.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!window.confirm('Delete this ' + p.type + ' payment of ' + money(p.amount) + '?')) return;
    db.payments = db.payments.filter(function (x) { return x.id !== id; });
    save();
    render();
    toast('Payment deleted', 'ok');
  }

  function renderWater() {
    var m = ui.month;
    var list = housesForTable(m);
    var box = byId('waterMessages');
    if (!list.length) {
      box.innerHTML = '<div class="empty">Add a house first — then you can log its meter.</div>';
    } else {
      box.innerHTML = list.map(function (h) {
        var f = waterFigures(h, m);
        if (!f.reading) {
          return '<div class="msg warn">' +
            '<span class="msg-title">House ' + esc(h.number) + ' — ' + esc(h.tenant) + '</span> ' + statusPill('unread') +
            '<small>No meter reading for ' + esc(monthLabel(m)) + '. Read the meter and enter it above.</small>' +
            '</div>';
        }
        var kind = waterStatus(f);
        var cls = { paid: 'ok', partial: 'warn', unpaid: 'bad', unread: 'warn' }[kind] || '';
        var txt;
        if (kind === 'paid') txt = 'Settled — ' + money(f.paid) + ' received.';
        else if (kind === 'partial') txt = money(f.paid) + ' received, ' + money(f.balance) + ' still owed.';
        else txt = 'Bill not paid yet.';

        var actions = '';
        if (f.balance > 0) {
          if (h.phone) {
            actions += '<a class="btn" href="' + esc(waLink(h.phone, tenantMessage(h, m))) + '" target="_blank" rel="noopener">WhatsApp</a>';
          }
          actions += '<button class="btn alt" type="button" data-act="pay-balance" data-type="water" data-id="' + esc(h.id) + '">Mark balance paid</button>';
        }
        actions += '<button class="btn link" type="button" data-act="delete-reading" data-id="' + esc(f.reading.id) + '">Delete reading</button>';

        return '<div class="msg ' + cls + '">' +
          '<span class="msg-title">House ' + esc(h.number) + ' — ' + esc(h.tenant) + '</span> ' + statusPill(kind) +
          '<small>' + fmt(f.reading.units) + ' units (' + fmt(f.reading.prev) + ' → ' + fmt(f.reading.curr) + ') × ' +
          fmt(f.reading.rate) + ' = <strong>' + money(f.billed) + '</strong>. ' + esc(txt) + '</small>' +
          '<div class="actions">' + actions + '</div>' +
          '</div>';
      }).join('');
    }
    renderPaymentList('water', m, 'waterPayments');
  }

  function renderPaymentList(type, m, containerId) {
    var el = byId(containerId);
    if (!el) return;
    var rows = db.payments.filter(function (p) { return p.type === type && p.month === m; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    if (!rows.length) {
      el.innerHTML = '<div class="empty">No ' + (type === 'rent' ? 'rent' : 'water') + ' payments recorded in ' + esc(monthLabel(m)) + '.</div>';
      return;
    }
    var total = 0;
    el.innerHTML = '<div class="table-wrap"><table>' +
      '<thead><tr><th>Date</th><th>House</th><th>Tenant</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
      rows.map(function (p) {
        var h = houseById(p.houseId);
        total += num(p.amount);
        return '<tr>' +
          '<td>' + esc(formatDate(p.date) || '—') + '</td>' +
          '<td>' + (h ? esc(h.number) : '—') + '</td>' +
          '<td>' + (h ? esc(h.tenant) : 'deleted house') + '</td>' +
          '<td>' + (p.note ? esc(p.note) : '<span class="muted">—</span>') + '</td>' +
          '<td class="num">' + fmt(p.amount) + '</td>' +
          '<td><button class="btn link" type="button" data-act="delete-payment" data-id="' + esc(p.id) + '">Delete</button></td>' +
          '</tr>';
      }).join('') +
      '</tbody><tfoot><tr><td colspan="4">Total</td><td class="num">' + fmt(total) + '</td><td></td></tr></tfoot></table></div>';
  }

  /* =========================================================
     8. Rendering — history + summary
     ========================================================= */

  function historyMonths() {
    var set = {};
    db.payments.forEach(function (p) { if (isMonth(p.month)) set[p.month] = true; });
    db.readings.forEach(function (r) { if (isMonth(r.month)) set[r.month] = true; });
    db.houses.forEach(function (h) { if (isMonth(h.since)) set[h.since] = true; });
    var m = currentMonth();
    for (var i = 0; i < 12; i++) set[addMonths(m, -i)] = true;
    var list = Object.keys(set).sort().reverse();
    return list.slice(0, MAX_HISTORY_MONTHS);
  }

  function renderHistory() {
    var months = historyMonths();
    var body = byId('historyBody');
    var foot = byId('historyFoot');
    if (!body) return;
    var any = db.houses.length > 0;
    byId('historyEmpty').hidden = any || months.length > 0;

    var t = { rentDue: 0, rentPaid: 0, rentOut: 0, waterBilled: 0, waterPaid: 0, waterOut: 0, totalOut: 0 };
    body.innerHTML = months.map(function (m) {
      var x = monthTotals(m);
      ['rentDue', 'rentPaid', 'rentOut', 'waterBilled', 'waterPaid', 'waterOut', 'totalOut'].forEach(function (k) { t[k] += x[k]; });
      return '<tr class="history-row' + (m === ui.month ? ' is-current' : '') + '" data-act="goto-month" data-month="' + esc(m) + '">' +
        '<td>' + esc(monthLabel(m)) + '</td>' +
        '<td class="num">' + fmt(x.rentDue) + '</td>' +
        '<td class="num">' + fmt(x.rentPaid) + '</td>' +
        '<td class="num' + (x.rentOut > 0 ? ' neg' : '') + '">' + fmt(x.rentOut) + '</td>' +
        '<td class="num">' + fmt(x.waterBilled) + '</td>' +
        '<td class="num">' + fmt(x.waterPaid) + '</td>' +
        '<td class="num' + (x.waterOut > 0 ? ' neg' : '') + '">' + fmt(x.waterOut) + '</td>' +
        '<td class="num' + (x.totalOut > 0 ? ' neg' : '') + '">' + fmt(x.totalOut) + '</td>' +
        '</tr>';
    }).join('');

    foot.innerHTML = months.length ? '<tr>' +
      '<td>Total</td>' +
      '<td class="num">' + fmt(t.rentDue) + '</td>' +
      '<td class="num">' + fmt(t.rentPaid) + '</td>' +
      '<td class="num">' + fmt(t.rentOut) + '</td>' +
      '<td class="num">' + fmt(t.waterBilled) + '</td>' +
      '<td class="num">' + fmt(t.waterPaid) + '</td>' +
      '<td class="num">' + fmt(t.waterOut) + '</td>' +
      '<td class="num">' + fmt(t.totalOut) + '</td>' +
      '</tr>' : '';
  }

  function renderSummary() {
    var m = ui.month;
    var list = housesForTable(m);
    var t = { due: 0, paid: 0, bal: 0, wb: 0, wp: 0, wbal: 0 };

    byId('summaryBody').innerHTML = list.map(function (h) {
      var r = rentFigures(h, m);
      var w = waterFigures(h, m);
      t.due += r.due; t.paid += r.paid; t.bal += r.balance;
      t.wb += w.billed; t.wp += w.paid; t.wbal += w.balance;
      return '<tr>' +
        '<td>' + esc(h.number) + '</td>' +
        '<td>' + esc(h.tenant) + '</td>' +
        '<td class="num">' + fmt(r.due) + '</td>' +
        '<td class="num">' + fmt(r.paid) + '</td>' +
        '<td class="num' + (r.balance > 0 ? ' neg' : '') + '">' + fmt(r.balance) + '</td>' +
        '<td class="num">' + (w.reading ? fmt(w.billed) : '—') + '</td>' +
        '<td class="num">' + fmt(w.paid) + '</td>' +
        '<td class="num' + (w.balance > 0 ? ' neg' : '') + '">' + (w.reading ? fmt(w.balance) : '—') + '</td>' +
        '</tr>';
    }).join('');

    byId('summaryTotals').innerHTML = list.length ? '<tr>' +
      '<td>Total</td><td></td>' +
      '<td class="num">' + fmt(t.due) + '</td>' +
      '<td class="num">' + fmt(t.paid) + '</td>' +
      '<td class="num">' + fmt(t.bal) + '</td>' +
      '<td class="num">' + fmt(t.wb) + '</td>' +
      '<td class="num">' + fmt(t.wp) + '</td>' +
      '<td class="num">' + fmt(t.wbal) + '</td>' +
      '</tr>' : '';

    byId('summaryEmpty').hidden = list.length > 0;

    var collected = t.paid + t.wp;
    var owed = Math.max(0, t.bal) + Math.max(0, t.wbal);
    byId('summaryKpis').innerHTML = [
      kpi('Rent due', money(t.due), monthLabel(m), ''),
      kpi('Collected', money(collected), 'rent + water', 'ok'),
      kpi('Still owed', money(owed), 'this month', owed > 0 ? 'bad' : ''),
      kpi('Water billed', money(t.wb), t.wp > 0 ? money(t.wp) + ' paid' : 'no payments yet', '')
    ].join('');

    // arrears card — every house, including tenants who have already vacated
    var rows = arrearsRows(m);
    var card = byId('arrearsCard');
    card.hidden = rows.length === 0;
    if (rows.length) {
      var total = rows.reduce(function (s, x) { return s + x.a.total; }, 0);
      byId('arrearsBody').innerHTML = rows.map(function (x) {
        return '<div class="msg bad">' +
          '<span class="msg-title">House ' + esc(x.h.number) + ' — ' + esc(x.h.tenant) + '</span>' +
          (existsInMonth(x.h, m) ? '' : ' <span class="pill neutral">Vacated</span>') +
          '<small>Rent ' + esc(money(x.a.rent)) + ' + water ' + esc(money(x.a.water)) + ' = <strong>' +
          esc(money(x.a.total)) + '</strong> unpaid from earlier months.</small>' +
          '</div>';
      }).join('') + '<p class="hint"><strong>Total arrears: ' + esc(money(total)) + '</strong></p>';
    }
  }

  function kpi(label, value, sub, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="kpi-label">' + esc(label) + '</div>' +
      '<div class="kpi-value">' + esc(value) + '</div>' +
      (sub ? '<div class="kpi-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* =========================================================
     9. Settings + render orchestrator
     ========================================================= */

  function applyTheme(theme) {
    var t = theme || 'auto';
    if (t === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
  }

  function renderSettings() {
    byId('setLandlordPhone').value = db.settings.landlordPhone || '';
    byId('setCountry').value = db.settings.countryCode || '';
    byId('setCurrency').value = db.settings.currency || '';
    byId('setDeadline').value = db.settings.deadline || '';
    byId('setTheme').value = db.settings.theme || 'auto';
    byId('versionLine').textContent = 'Rental House Manager v' + APP_VERSION + ' · data stored on this device';
  }

  function render() {
    var m = isMonth(ui.month) ? ui.month : currentMonth();
    ui.month = m;
    if (byId('month').value !== m) byId('month').value = m;
    syncMonthControls();
    document.querySelectorAll('.monthLabel').forEach(function (el) { el.textContent = monthLabel(m); });
    byId('brandSub').textContent = monthLabel(m);
    renderHouses();
    renderRent();
    renderWater();
    renderHistory();
    renderSummary();
    fillHouseSelects();
  }

  function setMonth(m) {
    if (!isMonth(m)) return;
    ui.month = m;
    render();
  }

  function showTab(name) {
    ui.tab = name;
    document.querySelectorAll('.tab').forEach(function (b) {
      var on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('section.panel').forEach(function (s) {
      s.hidden = s.id !== 'tab-' + name;
    });
    var activeBtn = document.querySelector('.tab.active');
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* =========================================================
     10. Export: CSV / JSON / print
     ========================================================= */

  function csvCell(v) {
    var s = String(v === undefined || v === null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows) {
    return '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  function download(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 1500);
      return true;
    } catch (err) {
      if (window.console) console.warn('[RHM] Download failed:', err);
      toast('Could not create the file on this device.', 'bad');
      return false;
    }
  }

  function fileStamp() {
    return currentMonth() + '-' + String(new Date().getDate()).padStart(2, '0');
  }

  function monthCsv(m) {
    var list = housesForTable(m);
    var rows = [
      ['Rental House Manager — monthly statement'],
      ['Month', monthLabel(m)],
      ['Currency', db.settings.currency || ''],
      ['Generated', formatDate(today())],
      [],
      ['House', 'Tenant', 'Phone', 'Rent due', 'Rent paid', 'Rent balance',
        'Water prev', 'Water curr', 'Water units', 'Water rate', 'Water billed',
        'Water paid', 'Water balance', 'Arrears', 'Total owed']
    ];
    var tot = { due: 0, paid: 0, bal: 0, wb: 0, wp: 0, wbal: 0, arr: 0 };
    list.forEach(function (h) {
      var r = rentFigures(h, m);
      var w = waterFigures(h, m);
      var a = arrearsFor(h, m);
      tot.due += r.due; tot.paid += r.paid; tot.bal += r.balance;
      tot.wb += w.billed; tot.wp += w.paid; tot.wbal += w.balance; tot.arr += a.total;
      rows.push([
        h.number, h.tenant, h.phone,
        r.due, r.paid, r.balance,
        w.reading ? w.reading.prev : '', w.reading ? w.reading.curr : '',
        w.reading ? w.reading.units : '', w.reading ? w.reading.rate : '',
        w.reading ? w.billed : '', w.paid, w.reading ? w.balance : '',
        a.total, round2(Math.max(0, r.balance) + Math.max(0, w.balance) + a.total)
      ]);
    });
    rows.push(['TOTAL', '', '', tot.due, tot.paid, tot.bal, '', '', '', '', tot.wb, tot.wp, tot.wbal, tot.arr, '']);

    var payments = db.payments.filter(function (p) { return p.month === m; });
    rows.push([]);
    rows.push(['Payments in ' + monthLabel(m)]);
    rows.push(['Date', 'Type', 'House', 'Tenant', 'Note', 'Amount']);
    payments.forEach(function (p) {
      var h = houseById(p.houseId);
      rows.push([formatDate(p.date), p.type, h ? h.number : '', h ? h.tenant : '', p.note, p.amount]);
    });
    return toCsv(rows);
  }

  function exportMonthCsv(m) {
    var name = 'rent-statement-' + m + '.csv';
    if (download(name, monthCsv(m), 'text/csv;charset=utf-8')) toast('Statement downloaded', 'ok');
  }

  function allPaymentsCsv() {
    var rows = [['Month', 'Date', 'Type', 'House', 'Tenant', 'Note', 'Amount']];
    db.payments.slice()
      .sort(function (a, b) { return (a.month + a.date).localeCompare(b.month + b.date); })
      .forEach(function (p) {
        var h = houseById(p.houseId);
        rows.push([p.month, formatDate(p.date), p.type, h ? h.number : '', h ? h.tenant : '', p.note, p.amount]);
      });
    return toCsv(rows);
  }

  function historyCsv() {
    var rows = [['Month', 'Rent due', 'Rent paid', 'Rent outstanding', 'Water billed', 'Water paid', 'Water outstanding', 'Total outstanding']];
    historyMonths().forEach(function (m) {
      var x = monthTotals(m);
      rows.push([monthLabel(m), x.rentDue, x.rentPaid, x.rentOut, x.waterBilled, x.waterPaid, x.waterOut, x.totalOut]);
    });
    return toCsv(rows);
  }

  function backupJson() {
    return JSON.stringify({
      app: 'rental-house-manager',
      version: 2,
      exportedAt: new Date().toISOString(),
      data: db
    }, null, 2);
  }

  function printMonth() {
    var m = ui.month;
    var list = housesForTable(m);
    var t = { due: 0, paid: 0, bal: 0, wb: 0, wp: 0, wbal: 0, arr: 0 };

    var rowsHtml = list.map(function (h) {
      var r = rentFigures(h, m);
      var w = waterFigures(h, m);
      var a = arrearsFor(h, m);
      t.due += r.due; t.paid += r.paid; t.bal += r.balance;
      t.wb += w.billed; t.wp += w.paid; t.wbal += w.balance; t.arr += a.total;
      return '<tr>' +
        '<td>' + esc(h.number) + '</td><td>' + esc(h.tenant) + '</td>' +
        '<td class="num">' + fmt(r.due) + '</td><td class="num">' + fmt(r.paid) + '</td><td class="num">' + fmt(r.balance) + '</td>' +
        '<td class="num">' + (w.reading ? fmt(w.reading.units) : '—') + '</td>' +
        '<td class="num">' + (w.reading ? fmt(w.billed) : '—') + '</td>' +
        '<td class="num">' + fmt(w.paid) + '</td><td class="num">' + (w.reading ? fmt(w.balance) : '—') + '</td>' +
        '<td class="num">' + fmt(a.total) + '</td>' +
        '</tr>';
    }).join('');

    var payments = db.payments.filter(function (p) { return p.month === m; });
    var payHtml = payments.length ? payments.map(function (p) {
      var h = houseById(p.houseId);
      return '<tr><td>' + esc(formatDate(p.date)) + '</td><td>' + esc(p.type) + '</td><td>' +
        esc(h ? h.number : '') + '</td><td>' + esc(h ? h.tenant : '') + '</td><td>' +
        esc(p.note || '') + '</td><td class="num">' + fmt(p.amount) + '</td></tr>';
    }).join('') : '<tr><td colspan="6">No payments recorded.</td></tr>';

    byId('printArea').innerHTML =
      '<h1>Rental House Manager</h1>' +
      '<p class="p-sub">Statement for ' + esc(monthLabel(m)) + ' · printed ' + esc(formatDate(today())) +
      (db.settings.currency ? ' · amounts in ' + esc(db.settings.currency) : '') + '</p>' +
      '<h2>Houses and balances</h2>' +
      '<table><thead><tr><th>House</th><th>Tenant</th><th class="num">Rent due</th><th class="num">Rent paid</th>' +
      '<th class="num">Rent bal.</th><th class="num">Units</th><th class="num">Water bill</th><th class="num">Water paid</th>' +
      '<th class="num">Water bal.</th><th class="num">Arrears</th></tr></thead><tbody>' + rowsHtml + '</tbody>' +
      '<tfoot><tr><td colspan="2">Total</td><td class="num">' + fmt(t.due) + '</td><td class="num">' + fmt(t.paid) +
      '</td><td class="num">' + fmt(t.bal) + '</td><td></td><td class="num">' + fmt(t.wb) + '</td><td class="num">' + fmt(t.wp) +
      '</td><td class="num">' + fmt(t.wbal) + '</td><td class="num">' + fmt(t.arr) + '</td></tr></tfoot></table>' +
      (function () {
        var ar = arrearsRows(m);
        if (!ar.length) return '';
        var sum = ar.reduce(function (s2, x) { return s2 + x.a.total; }, 0);
        return '<h2>Unpaid from earlier months</h2><table><thead><tr><th>House</th><th>Tenant</th>' +
          '<th class="num">Rent</th><th class="num">Water</th><th class="num">Total</th></tr></thead><tbody>' +
          ar.map(function (x) {
            return '<tr><td>' + esc(x.h.number) + '</td><td>' + esc(x.h.tenant) +
              (existsInMonth(x.h, m) ? '' : ' (vacated)') + '</td><td class="num">' + fmt(x.a.rent) +
              '</td><td class="num">' + fmt(x.a.water) + '</td><td class="num">' + fmt(x.a.total) + '</td></tr>';
          }).join('') +
          '</tbody><tfoot><tr><td colspan="4">Total</td><td class="num">' + fmt(sum) + '</td></tr></tfoot></table>';
      })() +
      '<h2>Payments received</h2>' +
      '<table><thead><tr><th>Date</th><th>Type</th><th>House</th><th>Tenant</th><th>Note</th><th class="num">Amount</th></tr></thead>' +
      '<tbody>' + payHtml + '</tbody></table>' +
      (db.settings.deadline ? '<p class="p-note">Balances should be cleared by ' + esc(formatDate(db.settings.deadline)) + '.</p>' : '') +
      '<p class="p-note">Printed from Rental House Manager. Figures reflect records entered on the device.</p>';

    try {
      window.print();
    } catch (err) {
      toast('Printing is not available here.', 'bad');
    }
  }

  /* =========================================================
     11. Events
     ========================================================= */

  function onHouseFormSubmit(ev) { saveHouse(ev); }

  function onRentSubmit(ev) {
    ev.preventDefault();
    var h = houseById(byId('rHouse').value);
    if (!h) return toast('Add a house first.', 'bad');
    var amount = num(byId('rAmount').value);
    if (!(amount > 0)) return toast('Enter an amount greater than zero.', 'bad');
    var date = byId('rDate').value || today();
    recordPayment('rent', h.id, amount, date, byId('rNote').value.trim());
    byId('rAmount').value = '';
    byId('rNote').value = '';
    render();
    toast('Rent payment recorded', 'ok');
  }

  function saveSettings(ev) {
    ev.preventDefault();
    db.settings.landlordPhone = byId('setLandlordPhone').value.trim();
    db.settings.countryCode = digitsOnly(byId('setCountry').value);
    db.settings.currency = byId('setCurrency').value.trim();
    db.settings.deadline = byId('setDeadline').value;
    save();
    render();
    toast('Settings saved', 'ok');
  }

  function setTheme(theme) {
    db.settings.theme = theme;
    save();
    applyTheme(theme);
    byId('setTheme').value = theme;
    toast('Theme: ' + (theme === 'auto' ? 'follow phone' : theme), 'info');
  }

  function handleAction(act, el) {
    var id = el.getAttribute('data-id');
    switch (act) {
      case 'edit-house': editHouse(id); break;
      case 'delete-house': deleteHouse(id); break;
      case 'vacate-house': vacateHouse(id); break;
      case 'reinstate-house': reinstateHouse(id); break;
      case 'delete-payment': deletePayment(id); break;
      case 'delete-reading': deleteReading(id); break;
      case 'pay-balance': payBalance(id, el.getAttribute('data-type')); break;
      case 'goto-month':
        setMonth(el.getAttribute('data-month'));
        showTab('summary');
        break;
      default: break;
    }
  }

  function restoreFromFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (err) {
        return toast('That file is not a valid backup.', 'bad');
      }
      var payload = parsed && parsed.data ? parsed.data : parsed;
      if (!payload || !Array.isArray(payload.houses)) {
        return toast('That backup does not contain house records.', 'bad');
      }
      var count = payload.houses.length;
      var ok = window.confirm('Replace the data on this device with the backup?\n\n' +
        count + ' house' + (count === 1 ? '' : 's') + ' in the file. Current data will be overwritten.');
      if (!ok) return;
      db = migrate(payload);
      save();
      applyTheme(db.settings.theme);
      render();
      toast('Backup restored', 'ok');
    };
    reader.onerror = function () { toast('Could not read that file.', 'bad'); };
    reader.readAsText(file);
  }

  function bindEvents() {
    byId('houseForm').addEventListener('submit', onHouseFormSubmit);
    byId('hCancel').addEventListener('click', resetHouseForm);

    byId('rentForm').addEventListener('submit', onRentSubmit);
    byId('rHouse').addEventListener('change', updateRentHint);

    byId('waterForm').addEventListener('submit', saveReading);
    byId('waterPayForm').addEventListener('submit', saveWaterPayment);
    byId('wHouse').addEventListener('change', syncPrevReading);
    byId('wPrev').addEventListener('input', updateWaterPreview);
    byId('wCurr').addEventListener('input', updateWaterPreview);

    byId('settingsForm').addEventListener('submit', saveSettings);
    byId('setTheme').addEventListener('change', function (e) { setTheme(e.target.value); });

    byId('themeBtn').addEventListener('click', function () {
      var order = ['auto', 'light', 'dark'];
      var cur = db.settings.theme || 'auto';
      setTheme(order[(order.indexOf(cur) + 1) % order.length]);
    });

    byId('month').addEventListener('change', function (e) {
      setMonth(e.target.value);
      syncPrevReading();
    });

    var fallback = byId('monthFallback');
    if (fallback) {
      fallback.addEventListener('change', function (e) {
        if (!e.target.value) return;
        setMonth(e.target.value);
        syncPrevReading();
      });
    }

    document.querySelectorAll('[data-month-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        setMonth(addMonths(ui.month, parseInt(b.getAttribute('data-month-step'), 10) || 0));
        syncPrevReading();
      });
    });

    byId('rentBulkBtn').addEventListener('click', function () {
      if (!db.settings.landlordPhone) {
        return toast('Add your own phone in Settings first.', 'bad');
      }
      window.open(waLink(db.settings.landlordPhone, landlordSummaryMessage(ui.month)), '_blank', 'noopener');
    });

    byId('printBtn').addEventListener('click', printMonth);
    byId('monthCsvBtn').addEventListener('click', function () { exportMonthCsv(ui.month); });
    byId('settingsMonthCsvBtn').addEventListener('click', function () { exportMonthCsv(ui.month); });
    byId('historyCsvBtn').addEventListener('click', function () {
      if (download('rent-history.csv', historyCsv(), 'text/csv;charset=utf-8')) toast('History downloaded', 'ok');
    });
    byId('settingsAllCsvBtn').addEventListener('click', function () {
      if (download('rent-payments-all.csv', allPaymentsCsv(), 'text/csv;charset=utf-8')) toast('Payments downloaded', 'ok');
    });

    byId('backupBtn').addEventListener('click', function () {
      if (download('rental-manager-backup-' + fileStamp() + '.json', backupJson(), 'application/json')) {
        toast('Backup downloaded — keep it somewhere safe', 'ok', 3500);
      }
    });
    byId('restoreBtn').addEventListener('click', function () { byId('restoreFile').click(); });
    byId('restoreFile').addEventListener('change', function (e) {
      restoreFromFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });

    byId('clearAllBtn').addEventListener('click', function () {
      if (!db.houses.length && !db.payments.length && !db.readings.length) {
        return toast('There is nothing to erase.', 'info');
      }
      if (!window.confirm('Erase every house, payment and reading on this device?\n\nThis cannot be undone. Download a backup first if unsure.')) return;
      db.houses = [];
      db.payments = [];
      db.readings = [];
      save();
      resetHouseForm();
      render();
      toast('All records erased', 'ok');
    });

    // one delegated handler for every dynamic button/row
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!el) return;
      if (el.tagName === 'A') return;
      e.preventDefault();
      handleAction(el.getAttribute('data-act'), el);
    });

    document.querySelector('.tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (btn) showTab(btn.dataset.tab);
    });
  }

  /* =========================================================
     12. PWA + offline
     ========================================================= */

  var deferredPrompt = null;

  function wirePwa() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      var btn = byId('installBtn');
      if (btn) btn.hidden = false;
    });

    var installBtn = byId('installBtn');
    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (!deferredPrompt) return toast('Use your browser menu → "Add to Home screen".', 'info', 4000);
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
          deferredPrompt = null;
          installBtn.hidden = true;
        });
      });
    }

    window.addEventListener('appinstalled', function () {
      var btn = byId('installBtn');
      if (btn) btn.hidden = true;
      toast('App installed', 'ok');
    });

    var canRegister = 'serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

    if (canRegister) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').then(function () {
          var pill = byId('offlinePill');
          if (pill) pill.hidden = false;
        }).catch(function (err) {
          if (window.console) console.warn('[RHM] Service worker not registered:', err);
        });
      });
    }

    window.addEventListener('offline', function () { toast('You are offline — the app still works.', 'info', 3500); });
    window.addEventListener('online', function () { toast('Back online', 'ok'); });
  }

  /* =========================================================
     13. Boot
     ========================================================= */

  function init() {
    applyTheme(db.settings.theme);
    byId('month').value = ui.month;
    byId('rDate').value = today();
    byId('wpDate').value = today();
    renderSettings();
    bindEvents();
    render();
    showTab('houses');
    wirePwa();
  }

  // Public hooks (used by automated tests and for debugging in the console)
  window.__RHM = {
    version: APP_VERSION,
    getDb: function () { return db; },
    load: load,
    migrate: migrate,
    rentFigures: rentFigures,
    waterFigures: waterFigures,
    monthTotals: monthTotals,
    arrearsFor: arrearsFor,
    normalizePhone: normalizePhone,
    waLink: waLink,
    monthLabel: monthLabel,
    addMonths: addMonths,
    monthCsv: monthCsv,
    allPaymentsCsv: allPaymentsCsv,
    historyCsv: historyCsv,
    tenantMessage: tenantMessage,
    landlordMessage: landlordMessage,
    render: render,
    setMonth: setMonth,
    showTab: showTab,
    syncMonthControls: syncMonthControls,
    forceMonthFallback: function () { useMonthFallback = true; syncMonthControls(); },
    save: save
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
