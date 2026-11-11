# 18. Vehicle presets (MX-5 ND1 / ND2)

Source notes for `meters/designer/v3/presets.mjs`, the data behind the first-run "car setup" of the Meters Designer.
Everything here was fetched from the public web on **2026-11-11** ("retrieved 2026-11-11"). A number without a source
is written **unsourced (assumption)**. Nothing here was measured in a car.

## ND1 and ND2 in this project

- The README calls our own analysed car an "EU MX-5 ND1" (2017) and a contributor's car an "EU MX-5 ND2 (RF, 2.0, 2022)".
- This matches Mazda's own timeline: the first ND ran 2015-2018, and the update for **model year 2019** (UK sales from
  August/September 2018, US model year 2019) is the "ND2". Sources: S9, S4, S12 below. Mazda's press text calls it the
  "2019 MX-5" and "fourth-generation"; the labels "ND1" and "ND2" are community/enthusiast terms (the code is ND for both).
- What changed for the data we use: the 2.0 went from **160 PS to 184 PS**, the redline from **6,800 to 7,500 rpm**, peak
  torque from 200 to 205 Nm, and the automatic's final drive from 3.454 to 3.583 (S3, S4, S9, S11). The 1.5 went from
  131 to **132 PS** and from 150 to **152 Nm** (S11).
- A further update for 2024 exists (the Oct 2025 UK guide, S8, still lists 132 PS and 184 PS and a 7,500 rpm redline). We
  have not analysed it, so the presets stop at the ND2 as defined above.

## Variants

All gear ratios are `1st / 2nd / 3rd / 4th / 5th / 6th (reverse)`.

### ND1 1.5 manual (`nd1-15-mt`)

| Item | Value | Source |
|---|---|---|
| Years / bodies | 2015-2018; roadster, RF (RF 1.5 not checked per market: unsourced (assumption)) | S12 (years) |
| Markets | EU, UK, JP. **No 1.5 in the US**: the Mazda USA 2016 and 2019 sheets list only the 2.0 | S1, S2 |
| Power | 131 PS (UK launch figure). Rpm: 7000 (secondary, S14) | S10 (PS), S14 (rpm, secondary) |
| Torque | 150 Nm (Mazda UK states "150 to 152Nm" for the update). Rpm: 4800 (secondary, S14) | S11, S14 (rpm, secondary) |
| Redline | 7,500 rpm (Mazda UK: the 1.5 redline "remains" 7,500 in the update). Fuel cut: unsourced (assumption) | S11 |
| Ratios, final drive | 5.087 / 2.991 / 2.035 / 1.594 / 1.286 / 1.000 (4.696), final 2.866: secondary only (JDM/UK 6MT column). The Mazda USA and Japan sheets give the same figures for the **2.0** MT, not for the 1.5 | S14 (secondary), S1, S6 (2.0) |
| Tyres | 195/50R16 (Mazda lists 16-inch wheels for the 1.5; 195/50R16 is Mazda's 16-inch size) | S10, S1, S7 |
| Kerb mass | Mazda Japan gives 990 to 1,060 kg across the 1.5 Roadster; the lower end is the likely 1.5 manual (inference). EU secondary: 1,050 kg "kerb + 75 kg driver" | S13, S14 |

### ND1 2.0 manual (`nd1-20-mt`)

| Item | Value | Source |
|---|---|---|
| Years / bodies | 2015-2018 (S12); roadster, RF (RF start year: unsourced (assumption)) | S12 |
| Markets | EU, UK, US, JP (JP: RF only) | S1, S6 |
| Power | 160 PS at 6000 rpm (EU/UK). The US rates the same engine **155 hp SAE net at 6000 rpm** | S10 (160 ps), S1 (US rating and rpm) |
| Torque | 200 Nm (UK press: 200 became 205) at 4600 rpm (US: 148 lb-ft at 4600) | S11, S1 |
| Redline | 6,800 rpm. Fuel cut: unsourced (assumption) | S1, S5, S11 |
| Ratios | 5.087 / 2.991 / 2.035 / 1.594 / 1.286 / 1.000 (4.696) | S1 |
| Final drive | 2.866 (US sheet). EU/UK: secondary only, same value | S1, S14 |
| Tyres | 205/45R17 (US Club/GT; EU 17-inch models) and 195/50R16 (US Sport) | S1, S10 |
| Kerb mass | US curb weight 2,332 lb = 1,058 kg (soft top, no driver, Sport/Club/GT same). EU secondary: 1,075 kg "kerb + 75 kg driver" (so about 1,000 kg without driver) | S1, S14 (secondary) |

### ND1 2.0 automatic (`nd1-20-at`)

| Item | Value | Source |
|---|---|---|
| Years / bodies | 2016 (S1 is the 2016 sheet) to 2018; roadster (US); RF unsourced (assumption) | S1 |
| Markets | **US** (Mazda USA 2016 sheet). The UK ND1 range was manual only ("all models feature a six-speed manual gearbox"). A JP RF 6AT existed; its ND1 final drive is unsourced (assumption) | S1, S12 |
| Power, torque, redline | As the ND1 2.0 manual (US sheet: 155 hp / 148 lb-ft, redline 6800 for MT and AT) | S1, S5 |
| Ratios | 3.538 / 2.060 / 1.404 / 1.000 / 0.713 / 0.582 (3.168) | S1 |
| Final drive | **3.454** (the ND2 changed it to 3.583) | S1, S4 |
| Tyres | 205/45R17 (Club/GT), 195/50R16 (Sport) | S1 |
| Kerb mass | US curb weight 2,381 lb = 1,080 kg | S1 |

### ND2 1.5 manual (`nd2-15-mt`)

| Item | Value | Source |
|---|---|---|
| Years / bodies | 2018-2023 (UK sales from Sept 2018); roadster and RF both listed for the 132 PS | S7, S9 |
| Markets | EU, UK, JP. No 1.5 in the US | S2, S7 |
| Power / torque | 132 PS at 7000 rpm; 152 Nm at 4500 rpm | S7, S9 |
| Redline | 7,500 rpm. Fuel cut: unsourced (assumption) | S11 |
| Ratios, final drive | Not found for the 1.5. Assumed equal to the 2.0 manual (5.087 ... 1.000, final 2.866): **unsourced (assumption)** | |
| Tyres | 195/50R16 (Mazda UK guide lists 16-inch 195/50R16 and 17-inch 205/45R17; the 1.5 trims are the 16-inch ones in ND1, so 16-inch is assumed here) | S7, S10 |
| Kerb mass | UK guide: "maximum kerb weight incl. driver (75 kg)" 1,107 kg (soft top) and 1,141 kg (RF) = **1,032 kg** without driver, but "maximum" means the heaviest trim with options, so this is an upper bound | S7 (S8 says 1,106 kg) |

### ND2 2.0 manual (`nd2-20-mt`)

| Item | Value | Source |
|---|---|---|
| Years / bodies | 2018-2023; roadster, RF | S9, S2 |
| Markets | EU, UK, US, JP | S2, S6, S7 |
| Power | 184 PS (135 kW) at 7000 rpm; US 181 hp at 7000 rpm | S6, S7, S2 |
| Torque | 205 Nm at 4000 rpm; US 151 lb-ft at 4000 rpm | S6, S7, S2 |
| Redline | 7,500 rpm. Fuel cut: unsourced (assumption) | S2, S4, S6 |
| Ratios | 5.087 / 2.991 / 2.035 / 1.594 / 1.286 / 1.000 (4.696) | S2, S6 |
| Final drive | 2.866 (US and JP agree) | S2, S6 |
| Tyres | 205/45R17 (EU 17-inch; US Club/GT) and 195/50R16 (US Sport) | S2, S7 |
| Kerb mass | US curb weight 2,339 lb = 1,061 kg (soft top, no driver). UK: 1,127 kg incl. 75 kg driver (about 1,052 kg), RF 1,170 kg | S2, S7 |

### ND2 2.0 automatic (`nd2-20-at`)

| Item | Value | Source |
|---|---|---|
| Years / bodies | 2018-2023; roadster (US, JP), RF (UK/EU: the 184 PS automatic is RF only in the UK guide) | S2, S7 |
| Markets | EU/UK (RF), US, JP | S2, S6, S7 |
| Power, torque, redline | As the ND2 2.0 manual | S2, S6, S7 |
| Ratios | 3.538 / 2.060 / 1.404 / 1.000 / 0.713 / 0.582 (3.168) (US and JP). EU/UK ratios not fetched: assumed the same (unsourced (assumption)) | S2, S6 |
| Final drive | **3.583** (US and JP) | S2, S3, S6 |
| Tyres | As the 2.0 manual | S2, S7 |
| Kerb mass | US curb weight 2,388 lb = 1,083 kg. UK RF automatic: 1,194 kg incl. driver | S2, S7 |

## RF versus roadster

- Mazda USA 2019: RF curb weight 2,453 lb (MT) / 2,499 lb (AT) against 2,339 / 2,388 lb for the soft top, about +52 kg
  (S3). UK guide: RF +34 kg (1.5) and +43 kg (2.0 MT) (S7). Mazda Japan RF 2.0 sheet: 1,100 kg (MT) / 1,130 kg (AT) (S6).
- Power, torque, redline, ratios, final drive and tyre options are the same figures for the RF in every sheet we read
  (the JP sheet is an RF sheet and equals the US soft-top figures). So the RF changes only the mass for this data.

## 1.5 automatic

A 1.5 automatic exists in **Japan** only (Mazda Japan: 1.5 with the 6-speed EC-AT, 18.6 km/L JC08, S13). It is not one of
the six presets. Its gear ratios and final drive are unsourced here (a secondary table shows a JDM 6AT final drive of
4.100, which disagrees with the official JP 2.0 automatic's 3.583, so it is probably a 1.5-specific value).

## Per-market differences found

- US 2.0 power is quoted as hp SAE net: ND1 155 hp (EU 160 PS), ND2 181 hp (= 184 PS).
- ND1 automatic final drive 3.454 (US) versus ND2 3.583 (US and JP). Manual final drive 2.866 everywhere we looked.
- Kerb mass is quoted differently: US/JP without driver, UK/EU with a 75 kg driver and as a **maximum** across trims.
  `presets.mjs` stores a value without driver (see the file notes).

## RPM fields in `presets.mjs`

- `red`: the manufacturer redline from the table above.
- `limit` and `shift`: **unsourced (assumption)**, both set equal to `red` (no source gives the fuel cut). `amber` is
  `red - 500`. `max` is the next 1000 at least 500 above `limit` (8000 for every preset).
- The legacy profile in `signals.mjs` uses 7000 as the 1.5 redline with a ~7500 fuel cut ("owner reports"). Mazda UK says
  the 1.5 redline is 7,500 rpm, which matches the owner-reported cut; keep this in mind when reconciling.

## Conflicts and gaps

1. 1.5 redline: Mazda UK 7,500 rpm (S11) against 7000 in the legacy profile.
2. 1.5 mass: 990 kg (Mazda Japan lower bound), 975 kg (secondary, 1,050 minus driver), 1,032 kg (UK ND2 maximum).
3. 1.5 gear ratios and final drive (both generations): no manufacturer source found; the secondary table shows the
   manual 6MT figures.
4. ND1 power rpm and torque rpm for the 1.5 (7000, 4800) only come from a secondary table (S14); ND2 values are official.
5. The Mazda UK media pack technical-specification page (which lists ratios and final drive for the UK ND1) could not be
   fetched (expired certificate and a script-only site), so no UK/EU ND1 ratio table was read.
6. Mazda USA's 2016 spec sheet lists the soft-top only; ND1 RF data for the US is not in these sheets.

## Sources

Retrieved 2026-11-11 unless noted. "Secondary" means not from the manufacturer.

| Id | Source | URL |
|---|---|---|
| S1 | Mazda USA, 2016 MX-5 Miata specifications (PDF) | https://portal.mazdausa.com/m176/MusaWeb/musa2/pdf/specs/2016_MX-5_Features_Specs.pdf |
| S2 | Mazda USA, 2019 MX-5 Miata features and specifications (PDF) | https://www.mazdausa.com/siteassets/pdf/owners-optimized/2019/mx-5-miata-st/2019_mazda_mx5_features_specs.pdf |
| S3 | Mazda USA, 2019 MX-5 press kit (PDF) | https://news.mazdausa.com/download/2019-Mazda-MX-5-Press-Kit_Version-21.pdf |
| S4 | Mazda USA press release, 2019 MX-5 Miata packs more punch (2018-06-20) | https://news.mazdausa.com/2018-06-20-2019-mazda-mx-5-miata-packs-more-punch-features |
| S5 | Mazda USA, 2016 MX-5 press kit (PDF) | https://news.mazdausa.com/download/2016_Mazda_MX-5_Press_Kit.pdf |
| S6 | Mazda Japan, Roadster RF 2.0 "Specifications", as of 2018-05 (Mazda sheet hosted by autoprove.net) | https://autoprove.net/wp-content/uploads/2018/09/a893f0469f176a8b3d23686a7d720840.pdf |
| S7 | Mazda UK, MX-5 price and specification guide, Sept 2022 (PDF) | https://media-assets.mazda.eu/raw/upload//mazdauk/globalassets/uk/pdfs/fy157/p2/sept-pricing/mazda-mx-5-price-and-spec-guide-sept-22.pdf?rnd=4a6313 |
| S8 | Mazda UK, MX-5 prices and specifications, 2025-10-22 (PDF) | https://media-assets.mazda.eu/raw/upload//mazdauk/globalassets/uk/pdfs/fy160/p3/mx5/mx-5-ps-guide-oct-22.10.25.pdf?rnd=4aa270 |
| S9 | Inside Mazda UK, 2019 MX-5 press release (2018-08-06) | https://www.insidemazda.co.uk/?p=10465 |
| S10 | Inside Mazda UK, All-new MX-5 pricing and specification (2015-04-24) | https://www.insidemazda.co.uk/2015/04/24/all-new-mazda-mx-5-pricing-and-specification/ |
| S11 | Mazda UK Press Packs, MX-5 "Engines & Transmission" (2024 archive) | https://mazdamediapacks.com/en/archive-mazda-mx-5-rf-2024/details/engines-and-transmission.html |
| S12 | Mazda UK Press Packs, MX-5 2015-2018 archive | https://mazdamediapacks.com/en/archive/mazda-mx-5-2015-2018.html |
| S13 | Mazda Japan newsroom, Roadster launch release (2015-05-20) | https://newsroom.mazda.com/en/publicity/release/2015/201505/150520a.html |
| S14 | roadster.blog, ND technical specification and gear ratio tables (**secondary**, no source cited for the ratio table) | https://www.roadster.blog/2015/11/mx-5-roadster-nd-technical-specification.html and https://www.roadster.blog/2015/03/mx-5-skyactiv-transmission.html |
