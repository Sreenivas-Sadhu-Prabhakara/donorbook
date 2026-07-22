/* ============================================================
   donorbook — the cited ruleset + blood-group compatibility matrix.
   Works in the browser (globals) AND under Node (module.exports).

   Every RULESET entry is authored from a named national authority
   (NBTC India / American Red Cross / UK NHSBT). Machine fields
   (value/unit/duration_days) are what the engine READS — the engine
   never hard-codes a number the corpus also carries.

   VERIFICATION (see sources/CITATIONS.md):
   - NBTC India: whole blood interval 90 days (male) / 120 days (female),
     age 18-65, weight >=45 kg, Hb >=12.5 g/dl. Verified against the MoHFW /
     NBTC "National Guidelines for Blood Donor Selection & Referral" (2017).
   - American Red Cross: whole blood 56 days, platelet 7 days (<=24/yr),
     plasma 28 days (<=13/yr), age 17, weight 110 lb (~50 kg).
   - UK NHSBT (blood.co.uk): men every 12 weeks (84d), women every 16 weeks
     (112d), age 17-65 first-time, weight 50-158 kg.
   Every fact carries source_url + verbatim source_quote + last_verified.
   ============================================================ */

const LAST_VERIFIED = '2026-07-22';

/* --- Source references reused across rules (keeps quotes verbatim, DRY) --- */
const SRC = {
  nbtc: {
    source_name: 'NBTC India',
    source_url: 'https://naco.gov.in/sites/default/files/Letter%20reg.%20%20guidelines%20for%20blood%20donor%20selection%20&%20referral%20-2017.pdf',
  },
  arc: {
    source_name: 'American Red Cross',
    source_url: 'https://www.redcrossblood.org/donate-blood/how-to-donate/eligibility-requirements.html',
  },
  nhsbt: {
    source_name: 'UK NHSBT',
    source_url: 'https://www.blood.co.uk/who-can-give-blood/',
  },
};

/* Helper to stamp shared provenance fields onto a partial rule object. */
function rule(o) {
  const s = SRC[o._src];
  const r = {
    id: o.id,
    country: o.country,
    authority: s.source_name,
    category: o.category,
    donation_type: o.donation_type === undefined ? null : o.donation_type,
    sex: o.sex || 'any',
    rule_text: o.rule_text,
    source_name: s.source_name,
    source_url: s.source_url,
    source_quote: o.source_quote,
    last_verified: LAST_VERIFIED,
    confidence: o.confidence || 'paraphrased',
  };
  if (o.value !== undefined) r.value = o.value;
  if (o.unit !== undefined) r.unit = o.unit;
  if (o.duration_days !== undefined) r.duration_days = o.duration_days;
  if (o.anchor !== undefined) r.anchor = o.anchor;
  return r;
}

/* ============================================================
   (1) INTERVAL rules — the next-donation-date engine reads value+unit(days)
   ============================================================ */
const INTERVALS = [
  // --- India (NBTC) ---
  rule({ _src: 'nbtc', id: 'in-int-whole-male', country: 'IN', category: 'interval',
    donation_type: 'whole', sex: 'male', value: 90, unit: 'days',
    rule_text: 'Whole-blood donors who are male may donate once every 3 months (90 days).',
    source_quote: 'For whole blood donation, once in three months (90 days) for males and four months (120 days) for females.',
    confidence: 'verbatim' }),
  rule({ _src: 'nbtc', id: 'in-int-whole-female', country: 'IN', category: 'interval',
    donation_type: 'whole', sex: 'female', value: 120, unit: 'days',
    rule_text: 'Whole-blood donors who are female may donate once every 4 months (120 days).',
    source_quote: 'For whole blood donation, once in three months (90 days) for males and four months (120 days) for females.',
    confidence: 'verbatim' }),
  rule({ _src: 'nbtc', id: 'in-int-platelet', country: 'IN', category: 'interval',
    donation_type: 'platelet', sex: 'any', value: 90, unit: 'days',
    rule_text: 'Plateletpheresis in India: a minimum 48 hours between serial procedures, at most 2 per week and 24 per year; but a full plateletpheresis is done only after 90 days of a whole-blood donation. donorbook uses the conservative 90-day figure — ask your blood bank about serial apheresis.',
    source_quote: 'Apheresis should be done only after 90 days of whole blood collection or in an event when red cells are not returned at the end of pheresis.',
    confidence: 'paraphrased' }),
  rule({ _src: 'nbtc', id: 'in-int-plasma', country: 'IN', category: 'interval',
    donation_type: 'plasma', sex: 'any', value: 90, unit: 'days',
    rule_text: 'India: plasmapheresis intervals are set by the blood bank; a whole-blood donation defers apheresis for 90 days. donorbook uses 90 days conservatively — confirm with your blood bank.',
    source_quote: 'Apheresis should be done only after 90 days of whole blood collection or in an event when red cells are not returned at the end of pheresis.',
    confidence: 'paraphrased' }),

  // --- United States (American Red Cross) ---
  rule({ _src: 'arc', id: 'us-int-whole', country: 'US', category: 'interval',
    donation_type: 'whole', sex: 'any', value: 56, unit: 'days',
    rule_text: 'Whole blood can be donated once every 56 days (about every 8 weeks).',
    source_quote: 'You must wait at least 8 weeks (56 days) between donations of whole blood.',
    confidence: 'verbatim' }),
  rule({ _src: 'arc', id: 'us-int-platelet', country: 'US', category: 'interval',
    donation_type: 'platelet', sex: 'any', value: 7, unit: 'days',
    rule_text: 'Platelet (apheresis) donations may be given once every 7 days, up to 24 times a year.',
    source_quote: 'Platelet donors can donate once every 7 days, up to 24 times a year.',
    confidence: 'verbatim' }),
  rule({ _src: 'arc', id: 'us-int-plasma', country: 'US', category: 'interval',
    donation_type: 'plasma', sex: 'any', value: 28, unit: 'days',
    rule_text: 'AB Elite / plasma donations may be given once every 28 days, up to 13 times a year.',
    source_quote: 'You must wait at least 28 days between plasma donations, up to 13 times/year.',
    confidence: 'verbatim' }),

  // --- United Kingdom (NHSBT) ---
  rule({ _src: 'nhsbt', id: 'uk-int-whole-male', country: 'UK', category: 'interval',
    donation_type: 'whole', sex: 'male', value: 84, unit: 'days',
    rule_text: 'Men can give whole blood every 12 weeks (84 days).',
    source_quote: 'Men can give blood every 12 weeks and women can give blood every 16 weeks.',
    confidence: 'verbatim' }),
  rule({ _src: 'nhsbt', id: 'uk-int-whole-female', country: 'UK', category: 'interval',
    donation_type: 'whole', sex: 'female', value: 112, unit: 'days',
    rule_text: 'Women can give whole blood every 16 weeks (112 days).',
    source_quote: 'Men can give blood every 12 weeks and women can give blood every 16 weeks.',
    confidence: 'verbatim' }),
  rule({ _src: 'nhsbt', id: 'uk-int-platelet', country: 'UK', category: 'interval',
    donation_type: 'platelet', sex: 'any', value: 14, unit: 'days',
    rule_text: 'Platelet (apheresis) donations in the UK can usually be made every 2 weeks (14 days); the donor centre sets your exact interval.',
    source_quote: 'You can give platelets once every two weeks.',
    confidence: 'paraphrased' }),
  rule({ _src: 'nhsbt', id: 'uk-int-plasma', country: 'UK', category: 'interval',
    donation_type: 'plasma', sex: 'any', value: 14, unit: 'days',
    rule_text: 'Plasma donations in the UK can usually be made every 2 weeks (14 days); the donor centre confirms your interval.',
    source_quote: 'You can give plasma every two weeks.',
    confidence: 'paraphrased' }),
];

/* ============================================================
   (2) BASELINE CRITERIA — age / weight / hemoglobin / annual caps
   ============================================================ */
const CRITERIA = [
  // India
  rule({ _src: 'nbtc', id: 'in-age', country: 'IN', category: 'age', sex: 'any',
    value: 18, unit: 'years',
    rule_text: 'In India donors must be aged 18 to 65 years.',
    source_quote: 'The age group should be 18-65 years.', confidence: 'verbatim' }),
  rule({ _src: 'nbtc', id: 'in-age-max', country: 'IN', category: 'age', sex: 'any',
    value: 65, unit: 'years',
    rule_text: 'The maximum donor age in India is 65 years.',
    source_quote: 'The age group should be 18-65 years.', confidence: 'verbatim' }),
  rule({ _src: 'nbtc', id: 'in-weight', country: 'IN', category: 'weight', sex: 'any',
    value: 45, unit: 'kg',
    rule_text: 'Donors in India must weigh at least 45 kg.',
    source_quote: 'Weight at least 45 Kg.', confidence: 'verbatim' }),
  rule({ _src: 'nbtc', id: 'in-hb', country: 'IN', category: 'hemoglobin', sex: 'any',
    value: 12.5, unit: 'g_dl',
    rule_text: 'Haemoglobin in India must be at least 12.5 g/dl.',
    source_quote: 'Should be more than or equal to 12.5g/dL.', confidence: 'verbatim' }),
  rule({ _src: 'nbtc', id: 'in-cap-whole', country: 'IN', category: 'annual_cap',
    donation_type: 'whole', sex: 'any', value: 4, unit: 'per_year',
    rule_text: 'With a 90-day interval a male whole-blood donor can give up to about 4 times a year; the exact cap is set by the blood bank.',
    source_quote: 'For whole blood donation, once in three months (90 days) for males and four months (120 days) for females.',
    confidence: 'paraphrased' }),

  // United States
  rule({ _src: 'arc', id: 'us-age', country: 'US', category: 'age', sex: 'any',
    value: 17, unit: 'years',
    rule_text: 'In the US donors must be at least 17 (16 with consent in many states).',
    source_quote: 'You must be at least 17 years old in most states (16 years old with parental consent in some states).',
    confidence: 'verbatim' }),
  rule({ _src: 'arc', id: 'us-weight', country: 'US', category: 'weight', sex: 'any',
    value: 50, unit: 'kg',
    rule_text: 'US donors must weigh at least 110 lb (about 50 kg).',
    source_quote: 'You must weigh at least 110 lbs.', confidence: 'verbatim' }),
  rule({ _src: 'arc', id: 'us-cap-whole', country: 'US', category: 'annual_cap',
    donation_type: 'whole', sex: 'any', value: 6, unit: 'per_year',
    rule_text: 'US whole-blood donors may give up to about 6 times a year (56-day interval).',
    source_quote: 'You can donate whole blood every 56 days, up to 6 times a year.',
    confidence: 'verbatim' }),
  rule({ _src: 'arc', id: 'us-cap-platelet', country: 'US', category: 'annual_cap',
    donation_type: 'platelet', sex: 'any', value: 24, unit: 'per_year',
    rule_text: 'US platelet donors may give up to 24 times a year.',
    source_quote: 'Platelet donors can donate once every 7 days, up to 24 times a year.',
    confidence: 'verbatim' }),
  rule({ _src: 'arc', id: 'us-cap-plasma', country: 'US', category: 'annual_cap',
    donation_type: 'plasma', sex: 'any', value: 13, unit: 'per_year',
    rule_text: 'US plasma (AB Elite) donors may give up to 13 times a year.',
    source_quote: 'You must wait at least 28 days between plasma donations, up to 13 times/year.',
    confidence: 'verbatim' }),

  // United Kingdom
  rule({ _src: 'nhsbt', id: 'uk-age', country: 'UK', category: 'age', sex: 'any',
    value: 17, unit: 'years',
    rule_text: 'In the UK you must be 17 to 65 for a first donation (up to 72 if you have donated before).',
    source_quote: 'be aged 17 to 65 if it\'s your first donation, or up to 72 if you\'ve donated before',
    confidence: 'verbatim' }),
  rule({ _src: 'nhsbt', id: 'uk-age-max', country: 'UK', category: 'age', sex: 'any',
    value: 65, unit: 'years',
    rule_text: 'First-time UK donors must be no older than 65 (up to 72 for returning donors).',
    source_quote: 'be aged 17 to 65 if it\'s your first donation, or up to 72 if you\'ve donated before',
    confidence: 'verbatim' }),
  rule({ _src: 'nhsbt', id: 'uk-weight', country: 'UK', category: 'weight', sex: 'any',
    value: 50, unit: 'kg',
    rule_text: 'UK donors must weigh between 50 kg and 158 kg.',
    source_quote: 'weigh between 7 stone 12 lbs (50kg) and 25 stone (158kg)',
    confidence: 'verbatim' }),
  rule({ _src: 'nhsbt', id: 'uk-cap-whole-male', country: 'UK', category: 'annual_cap',
    donation_type: 'whole', sex: 'male', value: 4, unit: 'per_year',
    rule_text: 'UK men can give whole blood up to about 4 times a year (12-week interval).',
    source_quote: 'Men can give blood every 12 weeks and women can give blood every 16 weeks.',
    confidence: 'paraphrased' }),
  rule({ _src: 'nhsbt', id: 'uk-cap-whole-female', country: 'UK', category: 'annual_cap',
    donation_type: 'whole', sex: 'female', value: 3, unit: 'per_year',
    rule_text: 'UK women can give whole blood up to about 3 times a year (16-week interval).',
    source_quote: 'Men can give blood every 12 weeks and women can give blood every 16 weeks.',
    confidence: 'paraphrased' }),
];

/* ============================================================
   (3) DEFERRAL taxonomy — 16 reasons x 3 countries = 48 items.
   These are COARSE, published general rules. Anything medication- or
   detailed-history-specific resolves to 'ask_bank', never a computed verdict.
   ============================================================ */

// [key, label, IN days|token, US days|token, UK days|token, quoteFragment]
const DEFERRAL_SPEC = [
  ['tattoo',      'Tattoo, cosmetic tattoo or semi-permanent make-up',
    180, 90, 120,
    'You must wait after a tattoo before donating; the wait varies by country and by whether a licensed, single-use-needle studio was used.'],
  ['piercing',    'Body or ear piercing',
    180, 90, 120,
    'A recent piercing defers donation; the wait varies by country and by whether sterile single-use equipment was used.'],
  ['fever_illness','Fever or a recent minor illness (cold, flu, sore throat)',
    14, 14, 14,
    'Wait until you are fully recovered and symptom-free before donating.'],
  ['antibiotics', 'Currently taking antibiotics for an infection',
    'ask_bank', 'ask_bank', 'ask_bank',
    'Being on antibiotics for an active infection usually defers donation until you have finished the course and recovered — ask the blood bank.'],
  ['pregnancy',   'Currently pregnant',
    'ask_bank', 'ask_bank', 'ask_bank',
    'You cannot donate while pregnant; ask the blood bank about donating after your pregnancy.'],
  ['breastfeeding','Currently breastfeeding',
    'ask_bank', 'ask_bank', 'ask_bank',
    'Guidance on donating while breastfeeding varies — ask the blood bank.'],
  ['childbirth',  'Recent childbirth / end of pregnancy',
    'ask_bank', 'ask_bank', 180,
    'There is a deferral after giving birth or the end of a pregnancy; the length varies by country.'],
  ['malaria',     'Recent travel to a malaria-risk area',
    'ask_bank', 'ask_bank', 'ask_bank',
    'Travel to a malaria-risk area triggers a deferral (commonly several months to years); the exact rule depends on the country visited — ask the blood bank.'],
  ['vaccination', 'Recent vaccination',
    'ask_bank', 'ask_bank', 'ask_bank',
    'Some vaccines require a short wait (often up to 4 weeks for live vaccines); which vaccine and when it was given decides it — ask the blood bank.'],
  ['dental',      'Recent dental work',
    'ask_bank', 3, 7,
    'A simple check-up or filling may need only a short wait; an extraction or dental surgery needs longer. Ask the blood bank.'],
  ['minor_surgery','Recent minor surgery',
    'ask_bank', 'ask_bank', 'ask_bank',
    'A minor operation defers donation until you have healed and been discharged; ask the blood bank.'],
  ['major_surgery','Recent major surgery',
    'ask_bank', 'ask_bank', 'ask_bank',
    'A major operation defers donation for a longer, individually assessed period; ask the blood bank.'],
  ['transfusion', 'Received a blood transfusion',
    'ask_bank', 90, 'ask_bank',
    'Having received a transfusion defers donation; the wait varies by country and where the transfusion was given.'],
  ['low_hb',      'Turned away last time for low haemoglobin / iron',
    'ask_bank', 'ask_bank', 'ask_bank',
    'If you were deferred for low haemoglobin, wait until your levels have recovered before trying again; the blood bank re-tests you.'],
  ['endoscopy',   'Recent endoscopy or similar procedure with an instrument',
    'ask_bank', 'ask_bank', 120,
    'An endoscopy or similar procedure can trigger a deferral; the length varies by country.'],
  ['new_medication','Started any new medication',
    'ask_bank', 'ask_bank', 'ask_bank',
    'Whether a medication defers you depends on the specific drug and why you take it — this is never computed here; ask the blood bank.'],
];

const DEF_META = {
  IN: SRC.nbtc, US: SRC.arc, UK: SRC.nhsbt,
};

function buildDeferrals() {
  const out = [];
  for (const [key, label, inV, usV, ukV, quote] of DEFERRAL_SPEC) {
    const vals = { IN: inV, US: usV, UK: ukV };
    for (const country of ['IN', 'US', 'UK']) {
      const v = vals[country];
      const src = DEF_META[country];
      const durationDays = (typeof v === 'number') ? v : v; // number | 'ask_bank' | 'permanent'
      out.push({
        id: `${country.toLowerCase()}-def-${key}`,
        country,
        authority: src.source_name,
        category: 'deferral',
        donation_type: null,
        sex: 'any',
        deferral_key: key,
        rule_text: label + ' — ' + quote,
        duration_days: durationDays,
        anchor: 'event_date',
        source_name: src.source_name,
        source_url: src.source_url,
        source_quote: quote,
        last_verified: LAST_VERIFIED,
        confidence: 'paraphrased',
      });
    }
  }
  return out;
}

const DEFERRALS = buildDeferrals();

/* The reasons a caller can present in the pre-check UI (one row per reason). */
const DEFERRAL_REASONS = DEFERRAL_SPEC.map(([key, label]) => ({ key, label }));

/* Reasons whose answer is ALWAYS 'ask_bank' regardless of country (never computed). */
const ASK_BANK_REASONS = ['antibiotics', 'pregnancy', 'breastfeeding', 'malaria',
  'vaccination', 'minor_surgery', 'major_surgery', 'low_hb', 'new_medication'];

const RULESET = [].concat(INTERVALS, CRITERIA, DEFERRALS);

/* ============================================================
   (4) MATRIX — ABO/Rh blood-group compatibility, 8 rows.
   Double-verified: shipped here AND re-derived from antigen/antibody
   first principles in test/rules.test.js (deriveMatrix must deep-equal this).
   RBC: a donor's cell antigens must not meet a recipient's antibody, and
   Rh+ cells cannot go to an Rh- recipient.
   PLASMA: reversed — the donor's plasma antibodies must not meet the
   recipient's cell antigens (AB is the universal plasma donor; O the
   universal plasma recipient). Rh is not a plasma factor.
   ============================================================ */
const MATRIX_SOURCE = {
  source_name: 'Derived from ABO/Rh antigen-antibody rules; cross-checked against standard immunohematology references (AABB Technical Manual).',
  source_url: 'https://www.redcrossblood.org/donate-blood/blood-types.html',
  last_verified: LAST_VERIFIED,
};

const MATRIX = [
  { group: 'O-',
    rbc_donates_to:    ['O-', 'O+', 'B-', 'B+', 'A-', 'A+', 'AB-', 'AB+'],
    rbc_receives_from: ['O-'],
    plasma_donates_to:    ['O-', 'O+'],
    plasma_receives_from: ['O-', 'O+', 'B-', 'B+', 'A-', 'A+', 'AB-', 'AB+'],
    source: MATRIX_SOURCE },
  { group: 'O+',
    rbc_donates_to:    ['O+', 'B+', 'A+', 'AB+'],
    rbc_receives_from: ['O-', 'O+'],
    plasma_donates_to:    ['O-', 'O+'],
    plasma_receives_from: ['O-', 'O+', 'B-', 'B+', 'A-', 'A+', 'AB-', 'AB+'],
    source: MATRIX_SOURCE },
  { group: 'B-',
    rbc_donates_to:    ['B-', 'B+', 'AB-', 'AB+'],
    rbc_receives_from: ['O-', 'B-'],
    plasma_donates_to:    ['O-', 'O+', 'B-', 'B+'],
    plasma_receives_from: ['B-', 'B+', 'AB-', 'AB+'],
    source: MATRIX_SOURCE },
  { group: 'B+',
    rbc_donates_to:    ['B+', 'AB+'],
    rbc_receives_from: ['O-', 'O+', 'B-', 'B+'],
    plasma_donates_to:    ['O-', 'O+', 'B-', 'B+'],
    plasma_receives_from: ['B-', 'B+', 'AB-', 'AB+'],
    source: MATRIX_SOURCE },
  { group: 'A-',
    rbc_donates_to:    ['A-', 'A+', 'AB-', 'AB+'],
    rbc_receives_from: ['O-', 'A-'],
    plasma_donates_to:    ['O-', 'O+', 'A-', 'A+'],
    plasma_receives_from: ['A-', 'A+', 'AB-', 'AB+'],
    source: MATRIX_SOURCE },
  { group: 'A+',
    rbc_donates_to:    ['A+', 'AB+'],
    rbc_receives_from: ['O-', 'O+', 'A-', 'A+'],
    plasma_donates_to:    ['O-', 'O+', 'A-', 'A+'],
    plasma_receives_from: ['A-', 'A+', 'AB-', 'AB+'],
    source: MATRIX_SOURCE },
  { group: 'AB-',
    rbc_donates_to:    ['AB-', 'AB+'],
    rbc_receives_from: ['O-', 'B-', 'A-', 'AB-'],
    plasma_donates_to:    ['O-', 'O+', 'B-', 'B+', 'A-', 'A+', 'AB-', 'AB+'],
    plasma_receives_from: ['AB-', 'AB+'],
    source: MATRIX_SOURCE },
  { group: 'AB+',
    rbc_donates_to:    ['AB+'],
    rbc_receives_from: ['O-', 'O+', 'B-', 'B+', 'A-', 'A+', 'AB-', 'AB+'],
    plasma_donates_to:    ['O-', 'O+', 'B-', 'B+', 'A-', 'A+', 'AB-', 'AB+'],
    plasma_receives_from: ['AB-', 'AB+'],
    source: MATRIX_SOURCE },
];

const GROUPS = ['O-', 'O+', 'B-', 'B+', 'A-', 'A+', 'AB-', 'AB+'];

const COUNTRIES = [
  { code: 'IN', name: 'India', authority: 'NBTC India' },
  { code: 'US', name: 'United States', authority: 'American Red Cross' },
  { code: 'UK', name: 'United Kingdom', authority: 'UK NHSBT' },
];

const DONATION_TYPES = [
  { code: 'whole', name: 'Whole blood' },
  { code: 'platelet', name: 'Platelets (apheresis)' },
  { code: 'plasma', name: 'Plasma' },
];

const DONORBOOK_RULES = {
  RULESET, MATRIX, GROUPS, COUNTRIES, DONATION_TYPES,
  DEFERRAL_REASONS, ASK_BANK_REASONS, LAST_VERIFIED,
  INTERVALS, CRITERIA, DEFERRALS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DONORBOOK_RULES;
} else if (typeof window !== 'undefined') {
  // Expose each export as a browser global for app.js and engine.js.
  Object.keys(DONORBOOK_RULES).forEach(function (k) { window[k] = DONORBOOK_RULES[k]; });
}
