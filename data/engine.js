/* ============================================================
   donorbook — the pure engine. No DOM, no globals mutated.
   Reads constants FROM data/rules.js (never re-types a number).
   Works in the browser and under Node.
   ============================================================ */

(function (root, factory) {
  let rules;
  if (typeof module !== 'undefined' && module.exports) {
    rules = require('./rules.js');
    module.exports = factory(rules);
  } else {
    rules = {
      RULESET: root.RULESET, MATRIX: root.MATRIX, GROUPS: root.GROUPS,
      DEFERRAL_REASONS: root.DEFERRAL_REASONS, ASK_BANK_REASONS: root.ASK_BANK_REASONS,
    };
    root.Engine = factory(rules);
  }
})(typeof self !== 'undefined' ? self : this, function (rules) {
  const { RULESET, MATRIX, GROUPS, ASK_BANK_REASONS } = rules;

  /* ---------- ISO date arithmetic (UTC, leap-safe, month-end clamped) ---------- */
  function parseISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    // reject impossible dates (e.g. 2026-02-30 rolls over)
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }

  function toISO(dt) {
    return dt.toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    const dt = parseISO(iso);
    if (!dt) return null;
    dt.setUTCDate(dt.getUTCDate() + days);
    return toISO(dt);
  }

  // whole-day difference b - a (both ISO); positive if b is after a
  function daysBetween(aISO, bISO) {
    const a = parseISO(aISO), b = parseISO(bISO);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /* ---------- interval lookup + next-eligible date ---------- */
  // Resolve the interval (in days) for a country/type/sex, honouring sex-splits.
  function intervalDays(country, type, sex) {
    const wantSex = sex === 'male' || sex === 'female' ? sex : 'any';
    const candidates = RULESET.filter(r =>
      r.category === 'interval' && r.country === country && r.donation_type === type);
    if (!candidates.length) return null;
    // Exact sex match wins.
    let hit = candidates.find(r => r.sex === wantSex);
    if (hit) return { days: hit.value, rule: hit, conservative: false };
    // A rule explicitly for 'any' sex.
    hit = candidates.find(r => r.sex === 'any');
    if (hit) return { days: hit.value, rule: hit, conservative: false };
    // Sex is unknown but the authority splits by sex: choose the LONGER
    // (conservative) interval so we never say "eligible" too early.
    const sorted = candidates.slice().sort((a, b) => b.value - a.value);
    hit = sorted[0];
    return { days: hit.value, rule: hit, conservative: true };
  }

  // Exact next-eligible date given last donation. Returns ISO or null.
  function nextEligible(lastISO, type, country, sex) {
    const iv = intervalDays(country, type, sex);
    if (!iv) return null;
    return addDays(lastISO, iv.days);
  }

  // Countdown vs a "today" ISO. status: 'eligible' when today >= target.
  function daysUntil(targetISO, todayISO) {
    const diff = daysBetween(todayISO, targetISO);
    if (diff === null) return null;
    return { days: diff, status: diff <= 0 ? 'eligible' : 'waiting' };
  }

  /* ---------- ABO/Rh matrix derived from first principles ---------- */
  function antigens(g) {
    const rh = g.endsWith('+');
    const abo = g.replace(/[+-]/g, '');
    return { A: abo.indexOf('A') >= 0, B: abo.indexOf('B') >= 0, Rh: rh };
  }
  function rbcCompatible(donor, recip) {
    const d = antigens(donor), r = antigens(recip);
    if (d.A && !r.A) return false;
    if (d.B && !r.B) return false;
    if (d.Rh && !r.Rh) return false;
    return true;
  }
  function plasmaCompatible(donor, recip) {
    const d = antigens(donor), r = antigens(recip);
    if (!d.A && r.A) return false;
    if (!d.B && r.B) return false;
    return true;
  }
  // Rebuild the whole 8-row matrix from principles (tests deep-equal vs MATRIX).
  function deriveMatrix() {
    return GROUPS.map(g => ({
      group: g,
      rbc_donates_to:    GROUPS.filter(x => rbcCompatible(g, x)),
      rbc_receives_from: GROUPS.filter(x => rbcCompatible(x, g)),
      plasma_donates_to:    GROUPS.filter(x => plasmaCompatible(g, x)),
      plasma_receives_from: GROUPS.filter(x => plasmaCompatible(x, g)),
    }));
  }
  function matrixRow(group) { return MATRIX.find(m => m.group === group) || null; }
  function rbcDonatesTo(group) { const r = matrixRow(group); return r ? r.rbc_donates_to.slice() : []; }
  function rbcReceivesFrom(group) { const r = matrixRow(group); return r ? r.rbc_receives_from.slice() : []; }
  function plasmaDonatesTo(group) { const r = matrixRow(group); return r ? r.plasma_donates_to.slice() : []; }
  function plasmaReceivesFrom(group) { const r = matrixRow(group); return r ? r.plasma_receives_from.slice() : []; }

  /* ---------- pre-check reducer ---------- */
  // deferralRow: look up a deferral rule for a country + reason key
  function deferralRow(country, key) {
    return RULESET.find(r => r.category === 'deferral' && r.country === country && r.deferral_key === key) || null;
  }

  // Given: {country, sex, ageYears, weightKg, hbGdl (optional), active:[{key, eventDate}], type}
  // and today ISO. Returns a verdict object.
  // verdict.status ∈ 'likely_eligible' | 'likely_deferred' | 'ask_bank'
  function precheck(input, todayISO) {
    const { country, sex, ageYears, weightKg, hbGdl } = input;
    const active = Array.isArray(input.active) ? input.active : [];
    const reasons = [];
    let askBank = false;
    let latestResume = null; // ISO
    const resumeRules = [];

    // baseline criteria
    const ageMin = criterionValue(country, 'age', 'min');
    const ageMax = criterionValue(country, 'age', 'max');
    const wtMin = criterionValue(country, 'weight', 'min');
    const hbMin = criterionValue(country, 'hemoglobin', 'min');

    if (typeof ageYears === 'number' && ageMin !== null && ageYears < ageMin.value) {
      reasons.push({ kind: 'age', text: `Below the minimum donor age of ${ageMin.value} in ${country}.`, rule: ageMin.rule });
      return finalize('likely_deferred');
    }
    if (typeof ageYears === 'number' && ageMax !== null && ageYears > ageMax.value) {
      reasons.push({ kind: 'age', text: `Above the standard maximum first-time donor age of ${ageMax.value} in ${country} — ask the blood bank.`, rule: ageMax.rule });
      askBank = true;
    }
    if (typeof weightKg === 'number' && wtMin !== null && weightKg < wtMin.value) {
      reasons.push({ kind: 'weight', text: `Below the minimum donor weight of ${wtMin.value} kg in ${country}.`, rule: wtMin.rule });
      return finalize('likely_deferred');
    }
    if (typeof hbGdl === 'number' && hbMin !== null && hbMin.rule && hbGdl < hbMin.value) {
      reasons.push({ kind: 'hemoglobin', text: `Below the minimum haemoglobin of ${hbMin.value} g/dl in ${country}.`, rule: hbMin.rule });
      return finalize('likely_deferred');
    }

    // deferral reasons
    for (const a of active) {
      const row = deferralRow(country, a.key);
      if (!row) continue;
      const alwaysAsk = ASK_BANK_REASONS.indexOf(a.key) >= 0;
      if (alwaysAsk || row.duration_days === 'ask_bank') {
        askBank = true;
        reasons.push({ kind: 'ask_bank', text: row.rule_text, rule: row });
        continue;
      }
      if (row.duration_days === 'permanent') {
        reasons.push({ kind: 'permanent', text: row.rule_text, rule: row });
        return finalize('likely_deferred');
      }
      if (typeof row.duration_days === 'number' && a.eventDate) {
        const resume = addDays(a.eventDate, row.duration_days);
        resumeRules.push({ resume, rule: row });
        if (resume && (!latestResume || resume > latestResume)) latestResume = resume;
        reasons.push({ kind: 'deferral', text: row.rule_text, rule: row, resume });
      } else if (typeof row.duration_days === 'number') {
        // no event date supplied → cannot compute, defer to bank
        askBank = true;
        reasons.push({ kind: 'ask_bank', text: row.rule_text + ' (enter the date it happened to get an exact resume date.)', rule: row });
      }
    }

    // If any concrete deferral is still active vs today, we are deferred until the latest resume.
    let activeDeferred = false;
    if (latestResume && todayISO) {
      const d = daysBetween(todayISO, latestResume);
      if (d !== null && d > 0) activeDeferred = true;
    } else if (latestResume && !todayISO) {
      activeDeferred = true;
    }

    if (activeDeferred) return finalize('likely_deferred');
    if (askBank) return finalize('ask_bank');
    return finalize('likely_eligible');

    function finalize(status) {
      return {
        status,
        resumeDate: latestResume,
        askBank,
        reasons,
        resumeRules,
      };
    }
  }

  // criterionValue(country, category, which): returns {value, rule} or null.
  // For 'age', which 'min' picks the smaller value; 'max' picks the larger.
  function criterionValue(country, category, which) {
    const rows = RULESET.filter(r => r.category === category && r.country === country);
    if (!rows.length) return null;
    if (category === 'age') {
      const sorted = rows.slice().sort((a, b) => a.value - b.value);
      if (which === 'max') {
        // Only a genuine upper bound if the corpus carries a distinct max row
        // (id ending in '-age-max'). Countries without one have no upper limit.
        const maxRow = rows.find(r => /-age-max$/.test(r.id));
        return maxRow ? { value: maxRow.value, rule: maxRow } : null;
      }
      // min: the age row that is NOT the explicit max
      const minRow = rows.find(r => !/-age-max$/.test(r.id)) || sorted[0];
      return { value: minRow.value, rule: minRow };
    }
    const pick = rows[0];
    return { value: pick.value, rule: pick };
  }

  /* ---------- annual cap lookup ---------- */
  function annualCap(country, type, sex) {
    const wantSex = sex === 'male' || sex === 'female' ? sex : 'any';
    const rows = RULESET.filter(r => r.category === 'annual_cap' && r.country === country && r.donation_type === type);
    if (!rows.length) return null;
    let hit = rows.find(r => r.sex === wantSex) || rows.find(r => r.sex === 'any') || rows[0];
    return hit ? { value: hit.value, rule: hit } : null;
  }

  /* ---------- RFC-4180 CSV ---------- */
  function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCSV(headers, rows) {
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows) lines.push(headers.map(h => csvCell(row[h])).join(','));
    return lines.join('\r\n') + '\r\n';
  }
  // minimal RFC-4180 parser (for round-trip tests)
  function parseCSV(text) {
    const rows = [];
    let field = '', row = [], i = 0, inQ = false;
    const s = text.replace(/\r\n$/, '');
    while (i < s.length) {
      const c = s[i];
      if (inQ) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r' && s[i + 1] === '\n') { row.push(field); rows.push(row); field = ''; row = []; i += 2; continue; }
      if (c === '\n') { row.push(field); rows.push(row); field = ''; row = []; i++; continue; }
      field += c; i++;
    }
    row.push(field); rows.push(row);
    return rows;
  }

  /* ---------- ICS calendar file (single all-day VEVENT) ---------- */
  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }
  // dateISO = the eligible date (all-day event). stamp = ISO datetime for DTSTAMP.
  function buildICS(dateISO, summary, description, stamp) {
    const d = dateISO.replace(/-/g, '');
    const end = addDays(dateISO, 1).replace(/-/g, '');
    const dtstamp = (stamp || '2026-07-22T00:00:00Z').replace(/[-:]/g, '').replace(/\.\d+/, '');
    const uid = 'donorbook-' + d + '@localhost';
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//donorbook//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + dtstamp,
      'DTSTART;VALUE=DATE:' + d,
      'DTEND;VALUE=DATE:' + end,
      'SUMMARY:' + icsEscape(summary),
      'DESCRIPTION:' + icsEscape(description),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
  }

  return {
    parseISO, toISO, addDays, daysBetween,
    intervalDays, nextEligible, daysUntil,
    deriveMatrix, matrixRow, rbcDonatesTo, rbcReceivesFrom, plasmaDonatesTo, plasmaReceivesFrom,
    deferralRow, precheck, criterionValue, annualCap,
    toCSV, parseCSV, buildICS,
  };
});
