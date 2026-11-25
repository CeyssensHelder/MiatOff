# 18. Vehicle presets

Source notes for `meters/designer/v3/presets.mjs`, the data behind the first-run "car setup" of the Meters Designer.
Source retrieval dates are **2026-11-11** for the MX-5 and **2026-11-18** for the Mazda3 and CX-5.
Values without a source are marked as assumptions. The figures have yet to be verified in a car.

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

- `rpm.limit`: the manufacturer redline from the table above, taken as the point where the engine stops pulling (the
  limiter). It is the only RPM value a preset carries. The exact fuel-cut rpm is not published; owners of the 1.5 report
  about 7,500, which matches Mazda UK's redline.
- The dashboard thresholds are a display choice, not a specification. The car setup derives them from the limit and a
  warning margin chosen in the dialog (default 500 rpm), so the gauges warn before the cut: `red` = limit - margin,
  `shift` = red + 40% of the margin (rounded to 50), `amber` = red - 500, `max` = the next 1000 at least 500 above the
  limit. For a 7,500 rpm car with the default margin: amber 6,500, red 7,000, shift 7,200, limit 7,500, gauge 8,000,
  the same as the legacy profile.

## Conflicts and gaps

1. 1.5 redline: Mazda UK 7,500 rpm (S11). The legacy profile called 7000 its "redline", but that is its red warning; its limiter is 7,500, which agrees.
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

## Mazda3 and CX-5

These presets cover the exact model year, trim and original sales market shown. See the
[Mazda Connect coverage notes](19-mazda-connect-models.md) for head-unit evidence and how to check the car.
Only forward ratios are used by Meters. Tyre circumference is calculated from the nominal tyre size.
For the German and UK configurations below, 6,500 rpm is an assumed warning reference. The cited materials omit a redline.

| Market and preset | 1st / 2nd / 3rd / 4th / 5th / 6th | Final drive | Tyres |
|---|---|---:|---|
| EU · 2017 CX-5 KF Center-Line (Germany), 2.0 petrol FWD 6MT | 3.700 / 1.947 / 1.300 / 1.029 / 0.837 / 0.680 | 4.388 | 225/65R17 |
| EU · 2016 Mazda3 BM Center-Line hatchback (Germany), 2.0 petrol FWD 6MT | 3.700 / 1.947 / 1.300 / 1.029 / 0.837 / 0.680 | 3.619 | 205/60R16 |
| UK · 2018 Mazda3 BN Sport Black hatchback, 2.0 petrol FWD 6MT | 3.700 / 1.947 / 1.300 / 1.029 / 0.837 / 0.680 | 3.619 | 215/45R18 |
| US · 2018 Mazda3 BN Sport sedan, 2.0 petrol FWD 6MT | 3.363 / 1.947 / 1.300 / 1.029 / 0.837 / 0.680 | 3.850 | 205/60R16 |
| US · 2019 CX-5 KF Sport, 2.5 petrol FWD 6AT | 3.552 / 2.022 / 1.452 / 1.000 / 0.708 / 0.599 | 4.325 | 225/65R17 |
| US · 2019 CX-5 KF Sport, 2.5 petrol AWD 6AT | 3.552 / 2.022 / 1.452 / 1.000 / 0.708 / 0.599 | 4.624 | 225/65R17 |

**Checked on 2026-11-18** against the linked public sources: every value of the UK and US Mazda3, US CX-5 and the
additional market presets below matches its source. The two German presets could **not** be checked: both
Mazda Germany links now redirect to the press-site login. Their values stay, but every field is marked assumed
(the car setup tags them so). Public listings for the German CX-5 G165 give 210 Nm at 4,800 rpm and 1,435–1,486 kg,
which differ from the figures below.

- **German CX-5.** 165 PS at 6,000 rpm, 210 Nm at 4,000 rpm and minimum kerb mass of 1,360 kg without a driver. The 7-inch MZD Connect starts at Center-Line in the German launch press kit. [Mazda Germany CX-5 press kit, pp. 32–36 (press login)](https://de.mazda-press.com/api/assets/download/8bba40e3-8975-4266-9879-4233b31d8c40_Default?isDownload=false)
- **German Mazda3.** 120 PS at 6,000 rpm, 210 Nm at 4,000 rpm and minimum kerb mass of 1,205 kg without a driver. [Mazda Germany technical specifications, pp. 18–19 (press login)](https://de.mazda-press.com/api/assets/download/3599c9d4-bd34-4904-b761-bec8865432ca_Default?isDownload=false)
- **UK Mazda3.** 120 PS at 6,000 rpm and 210 Nm at 4,000 rpm. The release identifies the output in PS. Kerb mass of 1,205 kg is the published 1,280 kg less its 75 kg driver allowance. [Mazda UK Sport Black specifications](https://uk.mazda-press.com/news/2018/mazda3-sport-black-on-sale-from-3rd-april/)
- **US Mazda3.** 155 hp at 6,000 rpm, 150 lb-ft at 4,000 rpm, 2,899 lb kerb mass and a 6,800 rpm redline. Stored as 157.15 PS, 203.37 Nm and 1,315 kg. [Mazda USA 2018 Mazda3 4-door Sport specifications](https://www.mazdausa.com/siteassets/pdf/owners-optimized/2018/mazda3-4door/2018-mazda3-4d-features-specs.pdf)
- **US CX-5.** Both drivetrains use the naturally aspirated 2.5 petrol rated at 187 hp at 6,000 rpm and 186 lb-ft at 4,000 rpm, with a 6,500 rpm redline. Stored as 189.59 PS and 252.18 Nm. Kerb mass is 3,541 lb FWD or 3,679 lb AWD, stored as 1,606 or 1,669 kg. [Mazda USA 2019 CX-5 Sport specifications](https://www.mazdausa.com/siteassets/pdf/owners-optimized/2019/cx-5/2019-mazda-cx-5-features-specs.pdf)

## European Mazda2, Mazda6 and CX-3

Added 2026-11-18 so European owners of these cars find a preset. Mazda publishes no gear ratios or final drives
for them: the price lists give power and torque with their rpm, kerb weight and tyres, and only those are marked
sourced. The gearing is Mazda's figure for the same engine and gearbox in another market (for the Mazda2 manual, a
secondary table for the Mazda-built Toyota Yaris iA) and is marked **assumed**, as is the 6,500 rpm redline. Kerb
mass is the German list's minimum (it includes a 75 kg driver) less 75 kg; the UK guides only give a maximum.
Where two presets share engine size, gearbox and drivetrain, the car setup asks for the **Version** (engine output).

| Market and preset | Power · torque | Kerb mass | Tyres | Gearing taken from (assumed) |
|---|---|---:|---|---|
| EU, UK · 2022 Mazda2 DJ 1.5 75 PS 6MT | 75 PS at 6,000 · 143 Nm at 3,500 | 1,021 kg | 185/65R15 | Yaris iA 6MT (secondary), final 4.105 |
| EU, UK · 2022 Mazda2 DJ 1.5 90 PS M Hybrid 6MT | 90 PS at 6,000 · 151 Nm at 3,500 | 1,035 kg | 185/65R15, 185/60R16 | Yaris iA 6MT (secondary), final 4.105 |
| EU, UK · 2022 Mazda2 DJ 1.5 115 PS M Hybrid 6MT | 115 PS at 6,000 · 151 Nm at 3,500 | 1,042 kg | 185/60R16 | Yaris iA 6MT (secondary), final 4.105 |
| EU, UK · 2022 Mazda2 DJ 1.5 90 PS 6AT | 90 PS at 6,000 · 151 Nm at 3,500 | 1,037 kg | 185/65R15, 185/60R16 | Australian Mazda2 6AT, final 4.060 |
| EU, UK · Mazda6 GL 2.0 145 PS 6MT | 145 PS at 6,000 · 213 Nm at 4,000 | 1,391 kg | 225/55R17, 225/45R19 | US Mazda6 6MT, final 4.105 |
| EU, UK · Mazda6 GL 2.0 165 PS 6MT | 165 PS at 6,000 · 213 Nm at 4,000 | 1,391 kg | 225/55R17, 225/45R19 | US Mazda6 6MT, final 4.105 |
| EU · Mazda6 GL 2.0 165 PS 6AT | 165 PS at 6,000 · 213 Nm at 4,000 | 1,423 kg | 225/55R17, 225/45R19 | Australian Mazda6 2.5 6AT, final 4.325 |
| UK · Mazda6 GL 2.0 145 PS 6AT | 145 PS at 6,000 · 213 Nm at 4,000 | 1,487 kg (UK maximum) | 225/55R17, 225/45R19 | Australian Mazda6 2.5 6AT, final 4.325 |
| EU, UK · Mazda6 GL 2.5 194 PS 6AT | 194 PS at 6,000 · 258 Nm at 4,000 | 1,462 kg | 225/55R17, 225/45R19 | Australian Mazda6 2.5 6AT, final 4.325 |
| EU · 2019 CX-3 DK 2.0 121 PS FWD 6MT | 121 PS at 6,000 · 207 Nm at 2,800 | 1,184 kg | 215/60R16, 215/50R18 | Mazda 2.0 6MT ratios, Portuguese CX-3 FWD final 3.850 |
| EU · 2019 CX-3 DK 2.0 121 PS FWD 6AT | 121 PS at 6,000 · 207 Nm at 2,800 | 1,213 kg | 215/60R16, 215/50R18 | US CX-3 6AT, final 4.325 |
| EU · 2019 CX-3 DK 2.0 150 PS AWD 6MT | 150 PS at 6,000 · 207 Nm at 2,800 | 1,256 kg | 215/60R16, 215/50R18 | Mazda 2.0 6MT ratios, Portuguese CX-3 AWD final 4.105 |
| EU · 2019 CX-3 DK 2.0 150 PS AWD 6AT | 150 PS at 6,000 · 207 Nm at 2,800 | 1,288 kg | 215/60R16, 215/50R18 | US CX-3 6AT, final 4.325 |

- **Mazda2.** [Mazda Germany price list, 1 December 2022 (dealer copy), pp. 12–13](https://www.sueverkruep.de/mazda/wp-content/uploads/sites/5/2023/01/01-12-2022_preisliste_mazda2_0_kl.pdf)
  and [Mazda UK price and specification guide, September 2022](https://media-assets.mazda.eu/raw/upload//mazdauk/globalassets/uk/pdfs/fy157/p2/sept-pricing/mazda2-price--specs.pdf)
  agree on output and torque. Both list Mazda Connect with an 8-inch screen, which on the Mazda2 is still the
  original system. Gearing: [TrueCar, Toyota Yaris iA manual (secondary)](https://www.truecar.com/toyota/yaris-ia/manual/specs/).
- **Mazda6.** [Mazda Germany price list, 3 June 2019 (dealer copy), pp. 10–11](https://www.sueverkruep.de/mazda/wp-content/uploads/sites/5/2019/08/Mazda-6-Preisliste.pdf)
  and [Mazda UK price and specification guide, October 2022](https://s3-eu-west-2.amazonaws.com/2021.mazda.epa.epresspacks.com/epa/2cf9a00fc9c4a9e4/documents/Mazda6-Price-and-Spec-Guide-sept-22.pdf),
  saloon. Both list Mazda Connect with an 8-inch screen.
- **CX-3.** [Mazda Germany price list, 3 June 2019 (dealer copy), pp. 8–9](https://www.sueverkruep.de/mazda/wp-content/uploads/sites/5/2019/08/Mazda-CX-3-Preisliste.pdf):
  Mazda Connect with the 7-inch screen from Center-Line; Prime-Line has none.

## Fiat and Abarth 124 Spider

Added 2026-11-18. All from Fiat's own documents. The Fiat and Abarth share the 1.4 MultiAir turbo, so the car setup
asks for the **Version**. Power is stored in PS (125 kW = 169.95 PS, 160 hp = 162.22 PS, 164 hp = 166.27 PS).

| Market and preset | Power · torque | Limit | Ratios 1st–6th · final | Mass | Tyres |
|---|---|---:|---|---:|---|
| EU, UK · Fiat 124 Spider 1.4 6MT | 140 CV at 5,000 · 240 Nm at 2,250 | 6,500 | 4.363 / 2.348 / 1.647 / 1.262 / 1.000 / 0.844 · 3.454 | 1,050 kg | 195/50R16, 205/45R17 |
| EU, UK · Fiat 124 Spider 1.4 6AT | as the manual | 6,500 | 3.530 / 2.060 / 1.400 / 1.000 / 0.710 / 0.580 · 3.583 (assumed, US) | not found | 195/50R16, 205/45R17 |
| EU, UK, AU · Abarth 124 Spider 6MT | 125 kW at 5,500 · 250 Nm at 2,500 | 6,500 (assumed) | manual ratios · 3.454 (assumed, US) | 1,100 kg (tare) | 205/45R17 |
| EU, UK, AU · Abarth 124 Spider 6AT | as the manual | 6,500 (assumed) | automatic ratios · 3.583 (assumed, US) | 1,110 kg (tare) | 205/45R17 |
| US · Fiat 124 Spider Classica / Lusso 6MT | 160 hp at 5,500 · 184 lb-ft at 3,200 | 6,250 | manual ratios · 3.454 | 2,436 lb | 195/50R16, 205/45R17 |
| US · Fiat 124 Spider Classica / Lusso 6AT | as the manual | 6,250 | automatic ratios · 3.583 | 2,476 lb | 195/50R16, 205/45R17 |
| US · Fiat 124 Spider Abarth 6MT | 164 hp at 5,500 · 184 lb-ft at 2,500 | 6,250 | manual ratios · 3.454 | 2,477 lb | 205/45R17 |
| US · Fiat 124 Spider Abarth 6AT | as the manual | 6,250 | automatic ratios · 3.583 | 2,516 lb | 205/45R17 |

- **Europe.** [Fiat Italy technical sheet, 18 November 2015 (press copy)](https://www.motorinolimits.com/wp-content/uploads/2015/11/151118_Fiat_124-Spider_Scheda-Tecnica.pdf):
  manual only, 6,500 rpm maximum engine speed, 1,050 kg in running order. That is taken as without a driver (the US
  curb weight is 1,105 kg). UK cars are assumed to match.
- **Abarth (Europe and Australia).** [Fiat Australia, Abarth 124 Spider Series 1 buyer's guide, October 2017, p. 6](https://tools.fiat.com.au/assets/ABARTH_124_SPIDER_S1%20v1-06aa34a539f56503988e2ecbfa2e5954.pdf):
  the same 170 PS engine as in Europe; no final drive given. Stellantis' German data sheet exists but refuses
  automated downloads.
- **US.** [FCA US, 2018 Fiat 124 Spider specifications (press copy)](https://www.motorshow.me/uploadImages/GalleryDocs/Doc7209.pdf):
  maximum engine speed 6,250 rpm (electronically limited); the final drive of each gearbox is the same for all trims.

## Additional market configurations

The [regional research and technical specifications](19-mazda-connect-models.md#technical-specifications-for-additional-configurations)
list the manufacturer data for Australian Mazda2, Mazda6, CX-5 and CX-8, Portuguese CX-3, and US Mazda6, CX-3 and CX-9 presets.
The Peruvian CX-3 remains a research record pending sourced drivetrain ratios. Use the displayed market and
configuration labels to match a preset to the vehicle.

The CX-9 and US Mazda6 turbo presets use the 87 AKI power rating. The Portuguese CX-3 diesel uses the upper end of the published
peak-torque band, 2,500 rpm, for the simulator's single torque point. Where Mazda omits a redline, Car Setup marks the
dashboard reference as assumed. Those references are 5,000 rpm for the diesels, 6,300 rpm for the Australian Mazda6
turbo and 6,500 rpm for the remaining newly added petrol presets.
