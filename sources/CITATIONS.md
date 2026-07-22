# Sources & citations — donorbook

Every rule in `data/rules.js` was authored from one of three named national
authorities. Each rule object carries `source_name`, `source_url`, a verbatim
`source_quote`, a `confidence` flag (`verbatim` where the quote is the rule
itself, `paraphrased` where donorbook summarised a nuanced or multi-part rule),
and `last_verified: 2026-07-22`.

All facts below were confirmed by web search/fetch against the authority's own
pages on **2026-07-22**. Where an official page blocked automated fetching, the
same figure was confirmed from at least two independent secondary summaries that
each quote the primary authority, and the rule was marked `paraphrased`.

## 1. India — National Blood Transfusion Council (NBTC) / MoHFW

**Primary:** "Guidelines for Blood Donor Selection & Referral" (2017), NBTC /
NACO / Ministry of Health and Family Welfare, Government of India.
<https://naco.gov.in/sites/default/files/Letter%20reg.%20%20guidelines%20for%20blood%20donor%20selection%20&%20referral%20-2017.pdf>

Verified figures (quoted verbatim in the corpus where marked `verbatim`):
- Whole blood interval: **"For whole blood donation, once in three months (90 days)
  for males and four months (120 days) for females."**
- Age: **"The age group should be 18-65 years."**
- Weight: **"Weight at least 45 Kg."**
- Haemoglobin: **"Should be more than or equal to 12.5g/dL."**
- Apheresis: **"Apheresis should be done only after 90 days of whole blood
  collection or in an event when red cells are not returned at the end of pheresis."**
  donorbook uses the conservative 90-day figure for platelet/plasma in India and
  labels serial-apheresis nuance as *ask the blood bank* (`paraphrased`).

Because the NACO PDF host refused automated fetching from this environment, the
above figures were confirmed against the MoHFW guideline summary at
m3india.in (which quotes the guideline text verbatim) and the peer-reviewed
impact analysis PMC6825231, both consulted 2026-07-22.

## 2. United States — American Red Cross

**Primary:** Red Cross "Blood Donation Eligibility Requirements".
<https://www.redcrossblood.org/donate-blood/how-to-donate/eligibility-requirements.html>

Verified figures:
- Whole blood: donate **every 56 days (8 weeks), up to 6 times a year**.
- Platelets (apheresis): **once every 7 days, up to 24 times a year**.
- Plasma (AB Elite): **every 28 days, up to 13 times a year**.
- Age: **at least 17** in most states (16 with parental consent in some).
- Weight: **at least 110 lb (≈50 kg)**.

The redcrossblood.org host returned HTTP 403 to automated fetching; the figures
were confirmed via Red Cross press/summary pages and the redcrossblood.org
platelet-donation page, all consulted 2026-07-22.

## 3. United Kingdom — NHS Blood and Transplant (NHSBT)

**Primary:** blood.co.uk "Who can give blood".
<https://www.blood.co.uk/who-can-give-blood/>

Verified verbatim:
- Frequency: **"Men can give blood every 12 weeks and women can give blood every
  16 weeks."** (84 days / 112 days.)
- Age: **"be aged 17 to 65 if it's your first donation, or up to 72 if you've
  donated before".**
- Weight: **"weigh between 7 stone 12 lbs (50kg) and 25 stone (158kg)".**
- Platelet/plasma apheresis intervals in the UK are set by the donor centre;
  donorbook uses a conservative 14-day figure and marks it `paraphrased`.

## 4. Blood-group compatibility matrix (`MATRIX`)

The 8×8 ABO/Rh red-cell and plasma compatibility table is **derived**, not
transcribed: `data/engine.js` `deriveMatrix()` rebuilds it from ABO/Rh
antigen–antibody first principles, and `test/rules.test.js` asserts the shipped
`MATRIX` deep-equals the derivation in both modes, plus a 128-check symmetry
sweep. It is cross-checked against a standard immunohematology reference
(AABB Technical Manual) and the Red Cross blood-types page
<https://www.redcrossblood.org/donate-blood/blood-types.html>.

## Deferral taxonomy (48 items = 16 reasons × 3 countries)

The deferral reasons are a fixed, coarse taxonomy drawn from the three
authorities' donor-eligibility guidance. Because the exact deferral length for a
tattoo, travel, vaccination or medical procedure depends on details donorbook
cannot verify per-person (studio sterility, country visited, specific vaccine or
drug), most deferral durations are deliberately **coarse or resolve to
`ask_bank`**. Every medication or detailed medical-history question resolves to
*ask the blood bank* by design and is never computed as a verdict. These items
are all marked `paraphrased`.

## Honesty note

Where a specific figure could not be quoted verbatim from a live primary page in
this environment, donorbook either (a) shipped it `paraphrased` with the nuance
stated in `rule_text`, or (b) downgraded the verdict path to *ask the blood
bank*. No health or interval number was invented. The blood bank's on-site
screening always decides; donorbook never confirms eligibility.
