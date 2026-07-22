'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../data/engine.js');
const {
  RULESET, MATRIX, GROUPS, COUNTRIES, DONATION_TYPES,
  DEFERRAL_REASONS, ASK_BANK_REASONS, LAST_VERIFIED,
} = require('../data/rules.js');

/* ---------------- next-eligible date fixtures (to the day) ---------------- */
test('NBTC India sex split: whole blood +90 male / +120 female', () => {
  assert.equal(E.nextEligible('2026-01-01', 'whole', 'IN', 'male'), '2026-04-01');
  assert.equal(E.nextEligible('2026-01-01', 'whole', 'IN', 'female'), '2026-05-01');
});

test('UK NHSBT +84 male / +112 female; US +56', () => {
  assert.equal(E.nextEligible('2026-01-01', 'whole', 'UK', 'male'), '2026-03-26');
  assert.equal(E.nextEligible('2026-01-01', 'whole', 'UK', 'female'), '2026-04-23');
  assert.equal(E.nextEligible('2026-01-01', 'whole', 'US', 'male'), '2026-02-26');
  assert.equal(E.nextEligible('2026-01-01', 'whole', 'US', 'female'), '2026-02-26');
});

test('sex-unknown on a sex-split rule picks the LONGER (conservative) interval', () => {
  // IN whole blood splits 90 (male) / 120 (female); with sex unknown, use 120.
  const inAny = E.intervalDays('IN', 'whole', 'any');
  assert.equal(inAny.days, 120);
  assert.equal(inAny.conservative, true);
  assert.equal(E.nextEligible('2026-01-01', 'whole', 'IN', 'any'), '2026-05-01');
  // UK splits 84/112 → conservative 112.
  const ukAny = E.intervalDays('UK', 'whole', 'any');
  assert.equal(ukAny.days, 112);
  assert.equal(ukAny.conservative, true);
  // US has an explicit 'any' rule → not conservative, 56 days.
  const usAny = E.intervalDays('US', 'whole', 'any');
  assert.equal(usAny.days, 56);
  assert.equal(usAny.conservative, false);
});

test('leap-year boundary and year-cross arithmetic', () => {
  assert.equal(E.nextEligible('2028-01-31', 'whole', 'US'), '2028-03-27');
  assert.equal(E.addDays('2025-12-05', 90), '2026-03-05');
});

test('addDays clamps across leap Feb correctly', () => {
  assert.equal(E.addDays('2024-02-28', 1), '2024-02-29'); // leap year
  assert.equal(E.addDays('2025-02-28', 1), '2025-03-01'); // non-leap
  assert.equal(E.addDays('2026-12-31', 1), '2027-01-01'); // year wrap
});

test('parseISO rejects impossible dates', () => {
  assert.equal(E.parseISO('2026-02-30'), null);
  assert.equal(E.parseISO('2026-13-01'), null);
  assert.equal(E.parseISO('not-a-date'), null);
});

/* ---------------- daysUntil with mocked today ---------------- */
test('daysUntil: positive before, 0/eligible on the day, eligible after', () => {
  assert.deepEqual(E.daysUntil('2026-04-01', '2026-03-30'), { days: 2, status: 'waiting' });
  assert.deepEqual(E.daysUntil('2026-04-01', '2026-04-01'), { days: 0, status: 'eligible' });
  const after = E.daysUntil('2026-04-01', '2026-04-05');
  assert.equal(after.status, 'eligible');
  assert.ok(after.days < 0);
});

/* ---------------- MATRIX derived from first principles ---------------- */
test('deriveMatrix deep-equals the shipped MATRIX in both rbc and plasma modes', () => {
  const derived = E.deriveMatrix();
  assert.equal(derived.length, MATRIX.length);
  for (const d of derived) {
    const shipped = MATRIX.find(m => m.group === d.group);
    assert.ok(shipped, 'group present: ' + d.group);
    assert.deepEqual(d.rbc_donates_to, shipped.rbc_donates_to, 'rbc_donates_to ' + d.group);
    assert.deepEqual(d.rbc_receives_from, shipped.rbc_receives_from, 'rbc_receives_from ' + d.group);
    assert.deepEqual(d.plasma_donates_to, shipped.plasma_donates_to, 'plasma_donates_to ' + d.group);
    assert.deepEqual(d.plasma_receives_from, shipped.plasma_receives_from, 'plasma_receives_from ' + d.group);
  }
});

test('spot facts: universal donors/recipients', () => {
  assert.deepEqual(E.rbcDonatesTo('O-').sort(), GROUPS.slice().sort());   // O- gives RBC to all
  assert.deepEqual(E.rbcReceivesFrom('AB+').sort(), GROUPS.slice().sort()); // AB+ receives RBC from all
  assert.deepEqual(E.rbcDonatesTo('AB+'), ['AB+']);                        // AB+ gives RBC to AB+ only
  assert.deepEqual(E.plasmaDonatesTo('AB+').sort(), GROUPS.slice().sort()); // AB universal plasma donor
  assert.deepEqual(E.plasmaDonatesTo('AB-').sort(), GROUPS.slice().sort());
});

test('symmetry sweep: b in donatesTo(a) iff a in receivesFrom(b), 128 checks', () => {
  let checks = 0;
  for (const mode of ['rbc', 'plasma']) {
    const donatesTo = mode === 'rbc' ? E.rbcDonatesTo : E.plasmaDonatesTo;
    const receivesFrom = mode === 'rbc' ? E.rbcReceivesFrom : E.plasmaReceivesFrom;
    for (const a of GROUPS) {
      for (const b of GROUPS) {
        const forward = donatesTo(a).indexOf(b) >= 0;
        const backward = receivesFrom(b).indexOf(a) >= 0;
        assert.equal(forward, backward, `${mode}: ${a}->${b}`);
        checks++;
      }
    }
  }
  assert.equal(checks, 128);
});

/* ---------------- pre-check reducer ---------------- */
test('two active deferrals resolve to the LATER resume date', () => {
  // dental (US 3d) from 2026-01-10 → 2026-01-13; transfusion (US 90d) from 2026-01-01 → 2026-04-01
  const v = E.precheck({
    country: 'US', sex: 'male', ageYears: 30, weightKg: 80,
    active: [
      { key: 'dental', eventDate: '2026-01-10' },
      { key: 'transfusion', eventDate: '2026-01-01' },
    ],
  }, '2026-01-15');
  assert.equal(v.status, 'likely_deferred');
  assert.equal(v.resumeDate, '2026-04-01'); // the later of the two
});

test('any medication / ask_bank reason never returns likely_eligible', () => {
  const v = E.precheck({
    country: 'IN', sex: 'male', ageYears: 30, weightKg: 70,
    active: [{ key: 'new_medication', eventDate: '2026-07-01' }],
  }, '2026-07-22');
  assert.equal(v.status, 'ask_bank');
  assert.notEqual(v.status, 'likely_eligible');
  for (const key of ASK_BANK_REASONS) {
    const r = E.precheck({ country: 'US', sex: 'male', ageYears: 30, weightKg: 80,
      active: [{ key, eventDate: '2026-07-01' }] }, '2026-07-22');
    assert.notEqual(r.status, 'likely_eligible', key + ' must not be eligible');
  }
});

test('all criteria met + no deferrals → likely_eligible', () => {
  const v = E.precheck({
    country: 'IN', sex: 'female', ageYears: 28, weightKg: 55, hbGdl: 13.0, active: [],
  }, '2026-07-22');
  assert.equal(v.status, 'likely_eligible');
});

test('underweight and underage hard-defer', () => {
  const under = E.precheck({ country: 'IN', sex: 'male', ageYears: 30, weightKg: 40, active: [] }, '2026-07-22');
  assert.equal(under.status, 'likely_deferred');
  const young = E.precheck({ country: 'IN', sex: 'male', ageYears: 16, weightKg: 70, active: [] }, '2026-07-22');
  assert.equal(young.status, 'likely_deferred');
});

test('expired deferral no longer blocks (today past resume)', () => {
  const v = E.precheck({
    country: 'US', sex: 'male', ageYears: 30, weightKg: 80,
    active: [{ key: 'fever_illness', eventDate: '2026-01-01' }], // 14d → 2026-01-15
  }, '2026-07-22');
  assert.equal(v.status, 'likely_eligible');
});

/* ---------------- ruleset integrity ---------------- */
test('ruleset counts: intervals, criteria, deferrals, total ~85', () => {
  const intervals = RULESET.filter(r => r.category === 'interval');
  const deferrals = RULESET.filter(r => r.category === 'deferral');
  assert.equal(deferrals.length, 48, '16 reasons x 3 countries');
  assert.ok(intervals.length >= 11, 'at least 11 interval rules');
  assert.equal(MATRIX.length, 8);
  const total = RULESET.length + MATRIX.length;
  assert.ok(total >= 80 && total <= 95, 'total ~85, got ' + total);
});

test('every ruleset item has provenance and a parseable last_verified <= build date', () => {
  const build = E.parseISO(LAST_VERIFIED);
  assert.ok(build);
  for (const r of RULESET) {
    assert.ok(r.id && r.id.length, 'id: ' + JSON.stringify(r));
    assert.ok(r.source_url && r.source_url.indexOf('http') === 0, 'source_url: ' + r.id);
    assert.ok(r.source_quote && r.source_quote.length > 0, 'source_quote: ' + r.id);
    const lv = E.parseISO(r.last_verified);
    assert.ok(lv, 'last_verified parses: ' + r.id);
    assert.ok(lv.getTime() <= build.getTime(), 'last_verified <= build: ' + r.id);
    assert.ok(['verbatim', 'paraphrased'].indexOf(r.confidence) >= 0, 'confidence: ' + r.id);
  }
});

test('unique ids across the whole ruleset', () => {
  const ids = RULESET.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every (country x type x sex) interval lookup resolves with no holes', () => {
  for (const c of COUNTRIES) {
    for (const t of DONATION_TYPES) {
      for (const sex of ['male', 'female', 'any']) {
        const iv = E.intervalDays(c.code, t.code, sex);
        assert.ok(iv && typeof iv.days === 'number' && iv.days > 0,
          `interval hole at ${c.code}/${t.code}/${sex}`);
      }
    }
  }
});

test('deferral durations are positive ints or ask_bank/permanent', () => {
  for (const r of RULESET.filter(x => x.category === 'deferral')) {
    const d = r.duration_days;
    const ok = (typeof d === 'number' && Number.isInteger(d) && d > 0) || d === 'ask_bank' || d === 'permanent';
    assert.ok(ok, 'bad duration for ' + r.id + ': ' + d);
  }
});

test('deferral reasons taxonomy has 16 entries mirrored across 3 countries', () => {
  assert.equal(DEFERRAL_REASONS.length, 16);
  for (const reason of DEFERRAL_REASONS) {
    for (const c of ['IN', 'US', 'UK']) {
      assert.ok(E.deferralRow(c, reason.key), 'missing ' + c + '/' + reason.key);
    }
  }
});

test('interval engine reads its numbers FROM the corpus (no duplication)', () => {
  // The engine must not know 90/120/56/84/112 except via RULESET.
  const inMale = RULESET.find(r => r.id === 'in-int-whole-male');
  assert.equal(E.intervalDays('IN', 'whole', 'male').days, inMale.value);
  assert.equal(inMale.value, 90);
});

/* ---------------- annual caps ---------------- */
test('annual caps resolve per country/type', () => {
  assert.equal(E.annualCap('US', 'whole', 'male').value, 6);
  assert.equal(E.annualCap('US', 'platelet', 'any').value, 24);
  assert.equal(E.annualCap('UK', 'whole', 'female').value, 3);
});

/* ---------------- CSV round-trip ---------------- */
test('CSV round-trips RFC-4180 with commas, quotes and newlines in notes', () => {
  const headers = ['date', 'type', 'centre', 'notes'];
  const rows = [
    { date: '2026-01-01', type: 'whole', centre: 'Red Cross, Bengaluru', notes: 'Felt fine.\nBring ID.' },
    { date: '2026-04-05', type: 'platelet', centre: 'City "Main" Bank', notes: 'quick, ~90 min' },
  ];
  const csv = E.toCSV(headers, rows);
  const parsed = E.parseCSV(csv);
  assert.deepEqual(parsed[0], headers);
  assert.equal(parsed.length, rows.length + 1);
  assert.deepEqual(parsed[1], ['2026-01-01', 'whole', 'Red Cross, Bengaluru', 'Felt fine.\nBring ID.']);
  assert.deepEqual(parsed[2], ['2026-04-05', 'platelet', 'City "Main" Bank', 'quick, ~90 min']);
});

/* ---------------- ICS ---------------- */
test('ICS builds a valid all-day VEVENT on the eligible date', () => {
  const ics = E.buildICS('2026-04-01', 'Eligible to donate blood', 'Per NBTC India whole-blood interval.', '2026-07-22T00:00:00Z');
  assert.ok(ics.indexOf('BEGIN:VCALENDAR') === 0);
  assert.ok(ics.indexOf('DTSTART;VALUE=DATE:20260401') >= 0);
  assert.ok(ics.indexOf('DTEND;VALUE=DATE:20260402') >= 0);
  assert.ok(ics.indexOf('SUMMARY:Eligible to donate blood') >= 0);
  assert.ok(ics.trim().endsWith('END:VCALENDAR'));
});

/* ---------------- property / fuzz ---------------- */
test('property: nextEligible == last + interval, always valid, monotone', () => {
  // seeded LCG for determinism
  let s = 123456789;
  const rnd = () => { s = (1103515245 * s + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  for (let i = 0; i < 2000; i++) {
    const c = pick(COUNTRIES).code;
    const t = pick(DONATION_TYPES).code;
    const sex = pick(['male', 'female', 'any']);
    const y = 2000 + Math.floor(rnd() * 60);
    const m = 1 + Math.floor(rnd() * 12);
    const day = 1 + Math.floor(rnd() * 28);
    const last = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const iv = E.intervalDays(c, t, sex);
    const next = E.nextEligible(last, t, c, sex);
    assert.ok(next, 'next computed');
    assert.equal(E.daysBetween(last, next), iv.days, 'exact interval');
    assert.ok(next > last, 'strictly later'); // ISO string compare valid for same format
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(next));
  }
});

test('property: matrix symmetry holds under the shipped table for all pairs', () => {
  for (const mode of ['rbc', 'plasma']) {
    const dto = mode === 'rbc' ? 'rbc_donates_to' : 'plasma_donates_to';
    const rfrom = mode === 'rbc' ? 'rbc_receives_from' : 'plasma_receives_from';
    for (const a of MATRIX) {
      for (const b of a[dto]) {
        const bRow = MATRIX.find(m => m.group === b);
        assert.ok(bRow[rfrom].indexOf(a.group) >= 0, `${mode} ${a.group}->${b} not symmetric`);
      }
    }
  }
});
