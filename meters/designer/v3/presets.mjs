// Sourced vehicle presets for the first-run car setup. Sources: docs/18-vehicle-presets.md.
// Only fields listed in `verified` are backed by a source in that document; everything else is an assumption.
// rpm.limit is Mazda's published redline, where the engine stops pulling. The dashboard warnings (amber, red,
// shift, gauge maximum) are not specifications: the car setup works them out from the limit and the warning margin.
// mass is in kg without a driver (US curb weight converted; see notes where the source differs).
const SRC = {
  itFiat124: { title: "Fiat Italy, 124 Spider technical sheet, 18 November 2015 (press copy)", url: "https://www.motorinolimits.com/wp-content/uploads/2015/11/151118_Fiat_124-Spider_Scheda-Tecnica.pdf" },
  usFiat124: { title: "FCA US, 2018 Fiat 124 Spider specifications (press copy)", url: "https://www.motorshow.me/uploadImages/GalleryDocs/Doc7209.pdf" },
  auAbarth124: { title: "Fiat Australia, Abarth 124 Spider Series 1 buyer's guide, October 2017", url: "https://tools.fiat.com.au/assets/ABARTH_124_SPIDER_S1%20v1-06aa34a539f56503988e2ecbfa2e5954.pdf" },
  ukMazda2: { title: "Mazda UK, Mazda2 price and specification guide, September 2022", url: "https://media-assets.mazda.eu/raw/upload//mazdauk/globalassets/uk/pdfs/fy157/p2/sept-pricing/mazda2-price--specs.pdf" },
  deMazda2: { title: "Mazda Germany, Mazda2 price list, 1 December 2022 (dealer copy)", url: "https://www.sueverkruep.de/mazda/wp-content/uploads/sites/5/2023/01/01-12-2022_preisliste_mazda2_0_kl.pdf" },
  ukMazda6: { title: "Mazda UK, Mazda6 price and specification guide, October 2022", url: "https://s3-eu-west-2.amazonaws.com/2021.mazda.epa.epresspacks.com/epa/2cf9a00fc9c4a9e4/documents/Mazda6-Price-and-Spec-Guide-sept-22.pdf" },
  deMazda6: { title: "Mazda Germany, Mazda6 price list, 3 June 2019 (dealer copy)", url: "https://www.sueverkruep.de/mazda/wp-content/uploads/sites/5/2019/08/Mazda-6-Preisliste.pdf" },
  deCx3: { title: "Mazda Germany, CX-3 price list, 3 June 2019 (dealer copy)", url: "https://www.sueverkruep.de/mazda/wp-content/uploads/sites/5/2019/08/Mazda-CX-3-Preisliste.pdf" },
  yarisIa: { title: "SECONDARY: TrueCar, Toyota Yaris iA manual specifications (Mazda-built, same 1.5 and 6MT)", url: "https://www.truecar.com/toyota/yaris-ia/manual/specs/" },
  auMazda2: { title: "Mazda Australia, October 2026 Mazda2 brochure", url: "https://www.mazda.com.au/4aaf8f/globalassets/brochures/mazda2-digital-brochure.pdf" },
  auMazda6: { title: "Mazda Australia, 2022 Mazda6 brochure", url: "https://www.mazda.com.au/49de26/globalassets/brochures/owners-brochures/archived/mazda6_2022.pdf" },
  ptCx3: { title: "Mazda Portugal, 2015 CX-3 press kit", url: "https://pt.mazda-press.com/api/assets/download/fe6bff4a-268c-48cd-852f-94ccee59846d_Pdf?isDownload=false" },
  usCx3: { title: "Mazda USA, 2019 CX-3 press kit", url: "https://news.mazdausa.com/download/2019-Mazda-CX-3-Press-Kit_Version-1.pdf" },
  auCx5: { title: "Mazda Australia, 2022 CX-5 brochure", url: "https://www.mazda.com.au/4aa9fb/globalassets/brochures/owners-brochures/cx-5-digital-brochure.pdf" },
  usMazda6: { title: "Mazda USA, 2018 Mazda6 specifications", url: "https://www.mazdausa.com/siteassets/pdf/features--specs/2018/mzd6/2018_mazda6_features_specs.pdf" },
  auCx8: { title: "Mazda Australia, 2022 CX-8 brochure", url: "https://www.mazda.com.au/4a2887/globalassets/brochures/owners-brochures/mazda_cx-8_digital_brochure_2022.pdf" },
  usCx9: { title: "Mazda USA, 2018 CX-9 specifications", url: "https://www.mazdausa.com/siteassets/pdf/features--specs/2018/cx-9/2018-mazda-cx-9-features-specs.pdf" },
  deCx5: { title: "Mazda Germany, 2017 CX-5 press kit", url: "https://de.mazda-press.com/api/assets/download/8bba40e3-8975-4266-9879-4233b31d8c40_Default?isDownload=false" },
  deMazda3: { title: "Mazda Germany, April 2016 Mazda3 technical specifications", url: "https://de.mazda-press.com/api/assets/download/3599c9d4-bd34-4904-b761-bec8865432ca_Default?isDownload=false" },
  ukMazda3: { title: "Mazda UK, 2018 Mazda3 Sport Black", url: "https://uk.mazda-press.com/news/2018/mazda3-sport-black-on-sale-from-3rd-april/" },
  usMazda3: { title: "Mazda USA, 2018 Mazda3 4-door specifications", url: "https://www.mazdausa.com/siteassets/pdf/owners-optimized/2018/mazda3-4door/2018-mazda3-4d-features-specs.pdf" },
  usCx5: { title: "Mazda USA, 2019 CX-5 specifications", url: "https://www.mazdausa.com/siteassets/pdf/owners-optimized/2019/cx-5/2019-mazda-cx-5-features-specs.pdf" },
  us16: { title: "Mazda USA, 2016 MX-5 Miata specifications", url: "https://portal.mazdausa.com/m176/MusaWeb/musa2/pdf/specs/2016_MX-5_Features_Specs.pdf" },
  us19: { title: "Mazda USA, 2019 MX-5 Miata features and specifications", url: "https://www.mazdausa.com/siteassets/pdf/owners-optimized/2019/mx-5-miata-st/2019_mazda_mx5_features_specs.pdf" },
  jp18: { title: "Mazda Japan, Roadster RF 2.0 Specifications (as of 2018-05)", url: "https://autoprove.net/wp-content/uploads/2018/09/a893f0469f176a8b3d23686a7d720840.pdf" },
  uk22: { title: "Mazda UK, MX-5 price and specification guide, Sept 2022", url: "https://media-assets.mazda.eu/raw/upload//mazdauk/globalassets/uk/pdfs/fy157/p2/sept-pricing/mazda-mx-5-price-and-spec-guide-sept-22.pdf?rnd=4a6313" },
  ukPress: { title: "Mazda UK Press Packs, MX-5 Engines & Transmission", url: "https://mazdamediapacks.com/en/archive-mazda-mx-5-rf-2024/details/engines-and-transmission.html" },
  uk15: { title: "Inside Mazda UK, All-new MX-5 pricing and specification (2015-04-24)", url: "https://www.insidemazda.co.uk/2015/04/24/all-new-mazda-mx-5-pricing-and-specification/" },
  jpNews: { title: "Mazda Japan newsroom, Roadster launch release (2015-05-20)", url: "https://newsroom.mazda.com/en/publicity/release/2015/201505/150520a.html" },
  blog: { title: "SECONDARY: roadster.blog, ND technical specification and gear ratio tables", url: "https://www.roadster.blog/2015/11/mx-5-roadster-nd-technical-specification.html" },
};
const RETRIEVED = "2026-11-11";
const src = (key, fields) => ({ fields, ...SRC[key], retrieved: RETRIEVED });

export const VEHICLE_MODELS = {
  "MX-5": ["ND1", "ND2"],
  Mazda2: ["DJ"],
  Mazda3: ["BM", "BN"],
  Mazda6: ["GL"],
  "CX-3": ["DK"],
  "CX-5": ["KF"],
  "CX-8": ["KG"],
  "CX-9": ["TC"],
  "124 Spider": ["348"],
};
export const ENGINE_NAMES = {
  "1.5": "1.5 L",
  "1.5D": "1.5 L diesel",
  "2.0": "2.0 L",
  "2.2D": "2.2 L diesel",
  "2.5": "2.5 L",
  "2.5T": "2.5 L turbo petrol",
  "1.4T": "1.4 L turbo petrol (MultiAir)",
};
export const VEHICLE_ENGINES = Object.keys(ENGINE_NAMES);
export const VEHICLE_BODIES = ["roadster", "RF", "sedan", "hatchback", "suv"];

const sourcedSpecs = [
  "ratios", "finalDrive", "tyres", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "mass",
];
const withRedline = [...sourcedSpecs, "rpm.limit"];
const mazdaSource = (key, fields) => [{ ...src(key, fields), retrieved: "2026-11-18" }];
const petrolManual = [3.700, 1.947, 1.300, 1.029, 0.837, 0.680];
const petrolAutomatic = [3.552, 2.022, 1.452, 1.000, 0.708, 0.599];
const highTorqueAutomatic = [3.487, 1.992, 1.449, 1.000, 0.707, 0.600];
const usCx3 = {
  generation: "DK", engine: "2.0", transmission: "automatic",
  bodies: ["suv"], years: [2019, 2019], markets: ["US"],
  rpm: { limit: 6500 },
  ratios: petrolAutomatic, finalDrive: 4.325,
  tyres: ["215/60R16"],
  ratedPower: 150.05, powerRpm: 6000,
  ratedTorque: 197.95, torqueRpm: 2800,
  verified: sourcedSpecs,
  sources: mazdaSource("usCx3", sourcedSpecs),
};
const ptCx3 = {
  generation: "DK", engine: "1.5D",
  bodies: ["suv"], years: [2015, 2015], markets: ["EU"],
  rpm: { limit: 5000 },
  tyres: ["215/60R16", "215/50R18"],
  ratedPower: 105, powerRpm: 4000,
  ratedTorque: 270, torqueRpm: 2500,
  verified: sourcedSpecs,
  sources: mazdaSource("ptCx3", sourcedSpecs),
  notes: "For Portuguese trims with MZD Connect. Peak torque is sustained from 1,600 to 2,500 rpm.",
};
const cx3DieselManual = [3.700, 1.947, 1.300, 0.916, 0.717, 0.580];
const usCx5 = {
  generation: "KF", engine: "2.5", transmission: "automatic",
  bodies: ["suv"], years: [2019, 2019], markets: ["US"],
  rpm: { limit: 6500 },
  ratios: petrolAutomatic,
  tyres: ["225/65R17"],
  ratedPower: 189.59, powerRpm: 6000,
  ratedTorque: 252.18, torqueRpm: 4000,
  verified: withRedline,
  sources: mazdaSource("usCx5", withRedline),
};

const auCx5 = {
  generation: "KF",
  bodies: ["suv"], years: [2022, 2022], markets: ["AU"],
  tyres: ["225/65R17"],
  verified: sourcedSpecs, sources: mazdaSource("auCx5", sourcedSpecs),
};
const auCx5Maxx = {
  ...auCx5,
  engine: "2.0", drive: "FWD",
  rpm: { limit: 6500 },
  ratedPower: 156.36, powerRpm: 6000, ratedTorque: 200, torqueRpm: 4000,
};
const auCx5Petrol = {
  ...auCx5,
  engine: "2.5", transmission: "automatic",
  rpm: { limit: 6500 },
  ratios: petrolAutomatic, finalDrive: 4.624,
  ratedPower: 190.35, powerRpm: 6000, ratedTorque: 252, torqueRpm: 4000,
};
const usMazda6Sport = {
  generation: "GL", engine: "2.5", drive: "FWD",
  bodies: ["sedan"], years: [2018, 2018], markets: ["US"],
  rpm: { limit: 6500 },
  tyres: ["225/55R17"],
  ratedPower: 189.59, powerRpm: 6000, ratedTorque: 252.18, torqueRpm: 4000,
  verified: withRedline, sources: mazdaSource("usMazda6", withRedline),
};
const usCx9 = {
  generation: "TC", engine: "2.5T", transmission: "automatic",
  bodies: ["suv"], years: [2018, 2018], markets: ["US"],
  rpm: { limit: 6300 },
  ratios: highTorqueAutomatic, finalDrive: 4.411,
  tyres: ["255/60R18"],
  ratedPower: 230.15, powerRpm: 5000,
  ratedTorque: 420.30, torqueRpm: 2000,
  verified: withRedline,
  sources: mazdaSource("usCx9", withRedline),
  notes: "Power is rated on 87 AKI. Mazda quotes 250 hp on 93 AKI.",
};

// Europe (EU and UK). Mazda publishes no gear ratios or final drives for these European cars: the price lists give
// power, torque, kerb weight and tyres. Gearing comes from Mazda's figures for the same engine and gearbox in another
// market (Mazda2 manual: a secondary Yaris iA table) and is marked assumed. Kerb mass is the German minimum
// (incl. 75 kg driver) less the driver; the UK guides only give the maximum. `version` tells apart presets that
// share engine size, gearbox and drivetrain.
const euSpecs = ["ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "mass", "tyres"];
const ukSpecs = ["ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres"];
const on = (key, fields) => ({ ...src(key, fields), retrieved: "2026-11-18" });
const mazda2Manual = [3.583, 1.904, 1.290, 0.972, 0.795, 0.645];
const mazda2Eu = {
  generation: "DJ", engine: "1.5", drive: "FWD",
  bodies: ["hatchback"], years: [2022, 2022], markets: ["EU", "UK"],
  rpm: { limit: 6500 },
  powerRpm: 6000, torqueRpm: 3500,
  verified: euSpecs,
  sources: [on("deMazda2", euSpecs), on("ukMazda2", ukSpecs)],
};
const mazda2EuManual = {
  ...mazda2Eu, transmission: "manual", ratios: mazda2Manual, finalDrive: 4.105,
  sources: [...mazda2Eu.sources, on("yarisIa", ["ratios", "finalDrive"])],
  notes: "Mazda publishes no European gearing: the ratios and final drive are a secondary table for the Mazda-built Toyota Yaris iA (same 1.5 and 6-speed manual), so assumed. Redline assumed.",
};
const mazda6Eu = {
  generation: "GL", drive: "FWD",
  bodies: ["sedan"], years: [2019, 2022], markets: ["EU", "UK"],
  rpm: { limit: 6500 },
  tyres: ["225/55R17", "225/45R19"],
  powerRpm: 6000, torqueRpm: 4000,
  verified: euSpecs,
  sources: [on("deMazda6", euSpecs), on("ukMazda6", ukSpecs)],
};
const mazda6EuManual = {
  ...mazda6Eu, engine: "2.0", transmission: "manual", ratios: petrolManual, finalDrive: 4.105, ratedTorque: 213,
  notes: "Ratios and final drive are Mazda USA's for the 2018 Mazda6 2.5 manual (no European figures published), so assumed. Redline assumed.",
};
const mazda6EuAuto = {
  ...mazda6Eu, transmission: "automatic", ratios: petrolAutomatic, finalDrive: 4.325,
  notes: "Ratios and final drive are Mazda Australia's for the 2022 Mazda6 2.5 automatic (no European figures published), so assumed. Redline assumed.",
};
const cx3Eu = {
  generation: "DK", engine: "2.0",
  bodies: ["suv"], years: [2018, 2019], markets: ["EU"],
  rpm: { limit: 6500 },
  tyres: ["215/60R16", "215/50R18"],
  powerRpm: 6000, ratedTorque: 207, torqueRpm: 2800,
  verified: euSpecs,
  sources: [on("deCx3", euSpecs)],
};
const cx3EuManual = {
  ...cx3Eu, transmission: "manual", ratios: petrolManual, finalDrive: 3.850,
  notes: "Facelift (2018), Germany; Mazda Connect from Center-Line. Ratios are the 2.0 petrol 6MT's in other Mazda sheets and the final drive is the Portuguese CX-3 FWD manual's, so both assumed. Redline assumed.",
};
const cx3EuAuto = {
  ...cx3Eu, transmission: "automatic", ratios: petrolAutomatic, finalDrive: 4.325,
  notes: "Facelift (2018), Germany; Mazda Connect from Center-Line. Ratios and final drive are Mazda USA's for the 2019 CX-3 2.0 automatic, so assumed. Redline assumed.",
};
const europe = [
  {
    ...mazda2EuManual, id: "mazda2-dj-2022-eu-g75-mt", label: "2022 Mazda2 1.5 75 PS manual", version: "75 PS",
    tyres: ["185/65R15"], ratedPower: 75, ratedTorque: 143, mass: 1021,
  },
  {
    ...mazda2EuManual, id: "mazda2-dj-2022-eu-g90-mt", label: "2022 Mazda2 1.5 90 PS M Hybrid manual",
    version: "90 PS M Hybrid", tyres: ["185/65R15", "185/60R16"], ratedPower: 90, ratedTorque: 151, mass: 1035,
  },
  {
    ...mazda2EuManual, id: "mazda2-dj-2022-eu-g115-mt", label: "2022 Mazda2 1.5 115 PS M Hybrid manual",
    version: "115 PS M Hybrid", tyres: ["185/60R16"], ratedPower: 115, ratedTorque: 151, mass: 1042,
  },
  {
    ...mazda2Eu, id: "mazda2-dj-2022-eu-g90-at", label: "2022 Mazda2 1.5 90 PS automatic",
    transmission: "automatic", ratios: [3.529, 2.025, 1.348, 1.000, 0.742, 0.594], finalDrive: 4.060,
    tyres: ["185/65R15", "185/60R16"], ratedPower: 90, ratedTorque: 151, mass: 1037,
    notes: "Ratios and final drive are Mazda Australia's for the Mazda2 1.5 automatic (no European figures published), so assumed. Redline assumed.",
  },
  {
    ...mazda6EuManual, id: "mazda6-gl-2019-eu-g145-mt", label: "Mazda6 2.0 145 PS manual", version: "145 PS",
    ratedPower: 145, mass: 1391,
  },
  {
    ...mazda6EuManual, id: "mazda6-gl-2019-eu-g165-mt", label: "Mazda6 2.0 165 PS manual", version: "165 PS",
    ratedPower: 165, mass: 1391,
  },
  {
    ...mazda6EuAuto, id: "mazda6-gl-2019-de-g165-at", label: "Mazda6 2.0 165 PS automatic", markets: ["EU"],
    engine: "2.0", ratedPower: 165, ratedTorque: 213, mass: 1423,
  },
  {
    ...mazda6EuAuto, id: "mazda6-gl-2022-uk-g145-at", label: "Mazda6 2.0 145 PS automatic", markets: ["UK"],
    engine: "2.0", ratedPower: 145, ratedTorque: 213, mass: 1487,
    sources: [on("ukMazda6", euSpecs)],
    notes: "UK only (the German list has a 165 PS automatic instead). Mass is the UK maximum 1,562 kg less the 75 kg driver, so an upper bound. Ratios and final drive are Mazda Australia's 2.5 automatic figures, so assumed. Redline assumed.",
  },
  {
    ...mazda6EuAuto, id: "mazda6-gl-2019-eu-g194-at", label: "Mazda6 2.5 194 PS automatic",
    engine: "2.5", ratedPower: 194, ratedTorque: 258, mass: 1462,
  },
  {
    ...cx3EuManual, id: "cx3-dk-2019-de-g121-fwd-mt", label: "2019 CX-3 2.0 121 PS FWD manual",
    drive: "FWD", ratedPower: 121, mass: 1184,
  },
  {
    ...cx3EuAuto, id: "cx3-dk-2019-de-g121-fwd-at", label: "2019 CX-3 2.0 121 PS FWD automatic",
    drive: "FWD", ratedPower: 121, mass: 1213,
  },
  {
    ...cx3EuManual, id: "cx3-dk-2019-de-g150-awd-mt", label: "2019 CX-3 2.0 150 PS AWD manual",
    drive: "AWD", ratedPower: 150, mass: 1256, finalDrive: 4.105,
    notes: "Facelift (2018), Germany; Mazda Connect from Center-Line. Ratios are the 2.0 petrol 6MT's in other Mazda sheets and the final drive is the Portuguese CX-3 AWD manual's, so both assumed. Redline assumed.",
  },
  {
    ...cx3EuAuto, id: "cx3-dk-2019-de-g150-awd-at", label: "2019 CX-3 2.0 150 PS AWD automatic",
    drive: "AWD", ratedPower: 150, mass: 1288,
  },
];

// Fiat 124 Spider and Abarth 124 Spider (type 348, 2016-2020): built by Mazda on the ND, with the same head unit
// running Fiat software. 1.4 MultiAir turbo, Fiat C635 manual or Aisin automatic. Sources are Fiat's own sheets.
const fiat124 = { generation: "348", engine: "1.4T", bodies: ["roadster"], years: [2016, 2020] };
const fiat124Manual = [4.363, 2.348, 1.647, 1.262, 1.000, 0.844];
const fiat124Auto = [3.530, 2.060, 1.400, 1.000, 0.710, 0.580];
const usFiatSpecs = [...withRedline];
const fiat = [
  {
    ...fiat124, id: "fiat124-348-eu-mt", label: "Fiat 124 Spider 1.4 MultiAir manual", version: "Fiat 124 Spider, 140 CV",
    transmission: "manual", markets: ["EU", "UK"],
    rpm: { limit: 6500 }, ratios: fiat124Manual, finalDrive: 3.454,
    tyres: ["195/50R16", "205/45R17"],
    ratedPower: 140, powerRpm: 5000, ratedTorque: 240, torqueRpm: 2250, mass: 1050,
    verified: withRedline, sources: [on("itFiat124", withRedline)],
    notes: "Fiat Italy's sheet: 6,500 rpm maximum engine speed, mass 1,050 kg in running order (taken as without driver: the US curb weight is 1,105 kg). UK cars are assumed to match.",
  },
  {
    ...fiat124, id: "fiat124-348-eu-at", label: "Fiat 124 Spider 1.4 MultiAir automatic", version: "Fiat 124 Spider, 140 CV",
    transmission: "automatic", markets: ["EU", "UK"],
    rpm: { limit: 6500 }, ratios: fiat124Auto, finalDrive: 3.583,
    tyres: ["195/50R16", "205/45R17"],
    ratedPower: 140, powerRpm: 5000, ratedTorque: 240, torqueRpm: 2250,
    verified: ["rpm.limit", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres"],
    sources: [
      on("itFiat124", ["rpm.limit", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres"]),
      on("usFiat124", ["ratios", "finalDrive"]),
    ],
    notes: "Engine figures from Fiat Italy's sheet (manual version, same engine). Ratios and final drive are FCA US's for the Aisin automatic, so assumed for Europe; no European kerb mass found, so the mass is left as it was.",
  },
  {
    ...fiat124, id: "abarth124-348-mt", label: "Abarth 124 Spider manual", version: "Abarth 124 Spider, 170 PS",
    transmission: "manual", markets: ["EU", "UK", "AU"],
    rpm: { limit: 6500 }, ratios: fiat124Manual, finalDrive: 3.454,
    tyres: ["205/45R17"],
    ratedPower: 169.95, powerRpm: 5500, ratedTorque: 250, torqueRpm: 2500, mass: 1100,
    verified: ["ratios", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "mass", "tyres"],
    sources: [
      on("auAbarth124", ["ratios", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "mass", "tyres"]),
      on("usFiat124", ["finalDrive"]),
    ],
    notes: "Fiat Australia's sheet: 125 kW (stored as 169.95 PS), tare mass 1,100 kg; the European cars have the same 170 PS engine. Final drive is FCA US's for the manual (all trims), so assumed here. Redline assumed equal to the Fiat's 6,500 rpm.",
  },
  {
    ...fiat124, id: "abarth124-348-at", label: "Abarth 124 Spider automatic", version: "Abarth 124 Spider, 170 PS",
    transmission: "automatic", markets: ["EU", "UK", "AU"],
    rpm: { limit: 6500 }, ratios: fiat124Auto, finalDrive: 3.583,
    tyres: ["205/45R17"],
    ratedPower: 169.95, powerRpm: 5500, ratedTorque: 250, torqueRpm: 2500, mass: 1110,
    verified: ["ratios", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "mass", "tyres"],
    sources: [
      on("auAbarth124", ["ratios", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "mass", "tyres"]),
      on("usFiat124", ["finalDrive"]),
    ],
    notes: "Fiat Australia's sheet: 125 kW (stored as 169.95 PS), tare mass 1,110 kg. Final drive is FCA US's for the automatic, so assumed here. Redline assumed equal to the Fiat's 6,500 rpm.",
  },
  {
    ...fiat124, id: "fiat124-348-us-mt", label: "Fiat 124 Spider Classica / Lusso manual", version: "Fiat 124 Spider, 160 hp",
    transmission: "manual", markets: ["US"],
    rpm: { limit: 6250 }, ratios: fiat124Manual, finalDrive: 3.454,
    tyres: ["195/50R16", "205/45R17"],
    ratedPower: 162.22, powerRpm: 5500, ratedTorque: 250, torqueRpm: 3200, mass: 1105,
    verified: usFiatSpecs, sources: [on("usFiat124", usFiatSpecs)],
    notes: "FCA US: 160 hp (stored as 162.22 PS), 184 lb-ft at 3,200 rpm, maximum engine speed 6,250 rpm (electronically limited), curb weight 2,436 lb.",
  },
  {
    ...fiat124, id: "fiat124-348-us-at", label: "Fiat 124 Spider Classica / Lusso automatic", version: "Fiat 124 Spider, 160 hp",
    transmission: "automatic", markets: ["US"],
    rpm: { limit: 6250 }, ratios: fiat124Auto, finalDrive: 3.583,
    tyres: ["195/50R16", "205/45R17"],
    ratedPower: 162.22, powerRpm: 5500, ratedTorque: 250, torqueRpm: 3200, mass: 1123,
    verified: usFiatSpecs, sources: [on("usFiat124", usFiatSpecs)],
    notes: "FCA US: 160 hp (stored as 162.22 PS), curb weight 2,476 lb.",
  },
  {
    ...fiat124, id: "abarth124-348-us-mt", label: "Fiat 124 Spider Abarth manual", version: "Abarth, 164 hp",
    transmission: "manual", markets: ["US"],
    rpm: { limit: 6250 }, ratios: fiat124Manual, finalDrive: 3.454,
    tyres: ["205/45R17"],
    ratedPower: 166.27, powerRpm: 5500, ratedTorque: 250, torqueRpm: 2500, mass: 1124,
    verified: usFiatSpecs, sources: [on("usFiat124", usFiatSpecs)],
    notes: "FCA US: 164 hp (stored as 166.27 PS), 184 lb-ft at 2,500 rpm in Sport mode, curb weight 2,477 lb.",
  },
  {
    ...fiat124, id: "abarth124-348-us-at", label: "Fiat 124 Spider Abarth automatic", version: "Abarth, 164 hp",
    transmission: "automatic", markets: ["US"],
    rpm: { limit: 6250 }, ratios: fiat124Auto, finalDrive: 3.583,
    tyres: ["205/45R17"],
    ratedPower: 166.27, powerRpm: 5500, ratedTorque: 250, torqueRpm: 2500, mass: 1141,
    verified: usFiatSpecs, sources: [on("usFiat124", usFiatSpecs)],
    notes: "FCA US: 164 hp (stored as 166.27 PS), curb weight 2,516 lb.",
  },
];

export const PRESETS = [
  {
    id: "nd1-15-mt",
    label: "ND1 1.5 manual",
    generation: "ND1", engine: "1.5", transmission: "manual",
    bodies: ["roadster", "RF"],
    years: [2015, 2018],
    markets: ["EU", "UK", "JP"],
    rpm: { limit: 7500 },
    ratios: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0],
    finalDrive: 2.866,
    tyres: ["195/50R16"],
    ratedPower: 131, powerRpm: 7000,
    ratedTorque: 150, torqueRpm: 4800,
    mass: 990,
    verified: ["ratedPower", "ratedTorque", "tyres", "rpm.limit"],
    sources: [
      src("uk15", ["ratedPower", "tyres"]),
      src("ukPress", ["ratedTorque", "rpm.limit"]),
      src("us16", ["tyres"]),
      src("jpNews", ["mass"]),
      src("blog", ["ratios", "finalDrive", "powerRpm", "torqueRpm"]),
    ],
    notes: "Ratios and final drive are the 6MT figures from a secondary table (Mazda USA and Japan sheets give them for the 2.0 only). Mass 990 kg is the lower end of Mazda Japan's 990-1,060 kg range for the 1.5 Roadster (no driver). Mazda UK gives a 7,500 rpm redline for the 1.5, the same as the legacy profile's limiter (owner reports of the cut).",
  },
  {
    id: "nd1-20-mt",
    label: "ND1 2.0 manual",
    generation: "ND1", engine: "2.0", transmission: "manual",
    bodies: ["roadster", "RF"],
    years: [2015, 2018],
    markets: ["EU", "UK", "US", "JP"],
    rpm: { limit: 6800 },
    ratios: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0],
    finalDrive: 2.866,
    tyres: ["205/45R17", "195/50R16"],
    ratedPower: 160, powerRpm: 6000,
    ratedTorque: 200, torqueRpm: 4600,
    mass: 1058,
    verified: ["ratios", "finalDrive", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres", "mass", "rpm.limit"],
    sources: [
      src("us16", ["ratios", "finalDrive", "powerRpm", "torqueRpm", "tyres", "mass", "rpm.limit"]),
      src("uk15", ["ratedPower"]),
      src("ukPress", ["ratedTorque"]),
    ],
    notes: "The US sheet rates this engine 155 hp SAE net at 6000 rpm; EU/UK say 160 PS. Mass is the US curb weight 2,332 lb (no driver); the EU secondary figure is 1,075 kg with a 75 kg driver. Fuel cut is unsourced.",
  },
  {
    id: "nd1-20-at",
    label: "ND1 2.0 automatic",
    generation: "ND1", engine: "2.0", transmission: "automatic",
    bodies: ["roadster", "RF"],
    years: [2016, 2018],
    markets: ["US"],
    rpm: { limit: 6800 },
    ratios: [3.538, 2.06, 1.404, 1.0, 0.713, 0.582],
    finalDrive: 3.454,
    tyres: ["205/45R17", "195/50R16"],
    ratedPower: 160, powerRpm: 6000,
    ratedTorque: 200, torqueRpm: 4600,
    mass: 1080,
    verified: ["ratios", "finalDrive", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres", "mass", "rpm.limit"],
    sources: [
      src("us16", ["ratios", "finalDrive", "powerRpm", "torqueRpm", "tyres", "mass", "rpm.limit"]),
      src("uk15", ["ratedPower"]),
      src("ukPress", ["ratedTorque"]),
    ],
    notes: "US data. The UK ND1 range was manual only; a Japan RF automatic existed but its ND1 final drive is unsourced. The US sheet rates the engine 155 hp SAE net. RF fitment and the start year are unsourced. Fuel cut is unsourced.",
  },
  {
    id: "nd2-15-mt",
    label: "ND2 1.5 manual",
    generation: "ND2", engine: "1.5", transmission: "manual",
    bodies: ["roadster", "RF"],
    years: [2018, 2023],
    markets: ["EU", "UK", "JP"],
    rpm: { limit: 7500 },
    ratios: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0],
    finalDrive: 2.866,
    tyres: ["195/50R16"],
    ratedPower: 132, powerRpm: 7000,
    ratedTorque: 152, torqueRpm: 4500,
    mass: 1032,
    verified: ["ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres", "rpm.limit"],
    sources: [
      src("uk22", ["ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres"]),
      src("ukPress", ["rpm.limit"]),
    ],
    notes: "Ratios and final drive are assumed equal to the 2.0 manual (no 1.5 source found). Mass 1,032 kg is the UK maximum kerb weight 1,107 kg minus the 75 kg driver, so an upper bound for the heaviest trim. Tyres: the UK guide lists 16-inch 195/50R16; 1.5 trims are assumed to use them. Fuel cut is unsourced.",
  },
  {
    id: "nd2-20-mt",
    label: "ND2 2.0 manual",
    generation: "ND2", engine: "2.0", transmission: "manual",
    bodies: ["roadster", "RF"],
    years: [2018, 2023],
    markets: ["EU", "UK", "US", "JP"],
    rpm: { limit: 7500 },
    ratios: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0],
    finalDrive: 2.866,
    tyres: ["205/45R17", "195/50R16"],
    ratedPower: 184, powerRpm: 7000,
    ratedTorque: 205, torqueRpm: 4000,
    mass: 1061,
    verified: ["ratios", "finalDrive", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres", "mass", "rpm.limit"],
    sources: [
      src("us19", ["ratios", "finalDrive", "tyres", "mass", "rpm.limit"]),
      src("jp18", ["ratios", "finalDrive", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm"]),
      src("uk22", ["ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres"]),
    ],
    notes: "Mass is the US curb weight 2,339 lb (soft top, no driver); the UK guide gives 1,127 kg with a 75 kg driver. The RF is about 35-50 kg heavier and otherwise the same. Fuel cut is unsourced.",
  },
  {
    id: "nd2-20-at",
    label: "ND2 2.0 automatic",
    generation: "ND2", engine: "2.0", transmission: "automatic",
    bodies: ["roadster", "RF"],
    years: [2018, 2023],
    markets: ["EU", "UK", "US", "JP"],
    rpm: { limit: 7500 },
    ratios: [3.538, 2.06, 1.404, 1.0, 0.713, 0.582],
    finalDrive: 3.583,
    tyres: ["205/45R17", "195/50R16"],
    ratedPower: 184, powerRpm: 7000,
    ratedTorque: 205, torqueRpm: 4000,
    mass: 1083,
    verified: ["ratios", "finalDrive", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres", "mass", "rpm.limit"],
    sources: [
      src("us19", ["ratios", "finalDrive", "tyres", "mass", "rpm.limit"]),
      src("jp18", ["ratios", "finalDrive", "ratedPower", "powerRpm", "ratedTorque", "torqueRpm"]),
      src("uk22", ["ratedPower", "powerRpm", "ratedTorque", "torqueRpm", "tyres"]),
    ],
    notes: "Ratios and final drive are from the US and Japan sheets; the UK/EU automatic (RF only in the UK guide) is assumed to match. Mass is the US soft-top curb weight 2,388 lb (no driver); the UK RF automatic is 1,194 kg with a 75 kg driver. Fuel cut is unsourced.",
  },
  {
    id: "cx5-kf-2017-de-g165-mt",
    label: "2017 CX-5 Center-Line (Germany)",
    generation: "KF", engine: "2.0", transmission: "manual", drive: "FWD",
    bodies: ["suv"], years: [2017, 2017], markets: ["EU"],
    rpm: { limit: 6500 },
    ratios: [3.700, 1.947, 1.300, 1.029, 0.837, 0.680], finalDrive: 4.388,
    tyres: ["225/65R17"],
    ratedPower: 165, powerRpm: 6000,
    ratedTorque: 210, torqueRpm: 4000,
    mass: 1360,
    // The Mazda Germany press kit is behind the press-site login, so these values could not be checked
    // (2026-11-18). Public listings give 210 Nm at 4,800 rpm and 1,435-1,486 kg for this engine. All assumed.
    verified: [],
    sources: mazdaSource("deCx5", sourcedSpecs),
    notes: "German trim. Not checked: the Mazda Germany press kit needs a press login, and public listings disagree on the torque peak (4,000 or 4,800 rpm) and the kerb mass. Every value is marked assumed.",
  },
  {
    id: "mazda3-bm-2016-de-g120-mt",
    label: "2016 Mazda3 Center-Line (Germany)",
    generation: "BM", engine: "2.0", transmission: "manual", drive: "FWD",
    bodies: ["hatchback"], years: [2016, 2016], markets: ["EU"],
    rpm: { limit: 6500 },
    ratios: [3.700, 1.947, 1.300, 1.029, 0.837, 0.680], finalDrive: 3.619,
    tyres: ["205/60R16"],
    ratedPower: 120, powerRpm: 6000,
    ratedTorque: 210, torqueRpm: 4000,
    mass: 1205,
    // Behind the Mazda Germany press-site login, so not checked (2026-11-18). Power, torque, ratios and final drive
    // equal the public UK BN G120 figures (same engine and gearbox); the mass equals the UK 18-inch car's. All assumed.
    verified: [],
    sources: mazdaSource("deMazda3", sourcedSpecs),
    notes: "German G120 hatchback. Not checked: the Mazda Germany sheet needs a press login. The powertrain figures match the public UK Mazda3 G120 data, but every value is marked assumed.",
  },
  {
    id: "mazda3-bn-2018-uk-sport-black",
    label: "2018 Mazda3 Sport Black",
    generation: "BN", engine: "2.0", transmission: "manual", drive: "FWD",
    bodies: ["hatchback"], years: [2018, 2018], markets: ["UK"],
    rpm: { limit: 6500 },
    ratios: [3.700, 1.947, 1.300, 1.029, 0.837, 0.680], finalDrive: 3.619,
    tyres: ["215/45R18"],
    ratedPower: 120, powerRpm: 6000,
    ratedTorque: 210, torqueRpm: 4000,
    mass: 1205,
    verified: sourcedSpecs,
    sources: mazdaSource("ukMazda3", sourcedSpecs),
    notes: "Mazda's press release rates it at 120 PS. Curb mass excludes the published 75 kg driver allowance. Dashboard redline is assumed.",
  },
  {
    id: "mazda3-bn-2018-us-sport-mt",
    label: "2018 Mazda3 Sport sedan",
    generation: "BN", engine: "2.0", transmission: "manual", drive: "FWD",
    bodies: ["sedan"], years: [2018, 2018], markets: ["US"],
    rpm: { limit: 6800 },
    ratios: [3.363, 1.947, 1.300, 1.029, 0.837, 0.680], finalDrive: 3.850,
    tyres: ["205/60R16"],
    ratedPower: 157.15, powerRpm: 6000,
    ratedTorque: 203.37, torqueRpm: 4000,
    mass: 1315,
    verified: withRedline,
    sources: mazdaSource("usMazda3", withRedline),
  },
  {
    ...usCx5,
    id: "cx5-kf-2019-us-sport-fwd",
    label: "2019 CX-5 Sport FWD",
    drive: "FWD", finalDrive: 4.325, mass: 1606,
  },
  {
    ...usCx5,
    id: "cx5-kf-2019-us-sport-awd",
    label: "2019 CX-5 Sport AWD",
    drive: "AWD", finalDrive: 4.624, mass: 1669,
  },
  {
    ...auCx5Maxx,
    id: "cx5-kf-2022-au-maxx-mt",
    label: "2022 CX-5 Maxx 2.0 manual",
    transmission: "manual", ratios: petrolManual, finalDrive: 4.705, mass: 1521,
  },
  {
    ...auCx5Maxx,
    id: "cx5-kf-2022-au-maxx-at",
    label: "2022 CX-5 Maxx 2.0 automatic",
    transmission: "automatic", ratios: petrolAutomatic, finalDrive: 4.624, mass: 1576,
  },
  {
    ...auCx5Petrol,
    id: "cx5-kf-2022-au-25-fwd",
    label: "2022 CX-5 Maxx Sport 2.5 FWD",
    drive: "FWD", mass: 1607,
  },
  {
    ...auCx5Petrol,
    id: "cx5-kf-2022-au-25-awd",
    label: "2022 CX-5 Maxx Sport / Touring 2.5 AWD",
    drive: "AWD", mass: 1659,
  },
  {
    ...auCx5,
    id: "cx5-kf-2022-au-22d-awd",
    label: "2022 CX-5 Touring Active diesel AWD",
    engine: "2.2D", transmission: "automatic", drive: "AWD",
    rpm: { limit: 5000 },
    ratios: highTorqueAutomatic, finalDrive: 4.090, mass: 1732,
    ratedPower: 190.35, powerRpm: 4500, ratedTorque: 450, torqueRpm: 2000,
  },
  {
    ...usMazda6Sport,
    id: "mazda6-gl-2018-us-sport-mt",
    label: "2018 Mazda6 Sport manual",
    transmission: "manual", ratios: petrolManual, finalDrive: 4.105, mass: 1509,
  },
  {
    ...usMazda6Sport,
    id: "mazda6-gl-2018-us-sport-at",
    label: "2018 Mazda6 Sport automatic",
    transmission: "automatic", ratios: petrolAutomatic, finalDrive: 3.812, mass: 1554,
  },
  {
    ...usMazda6Sport,
    id: "mazda6-gl-2018-us-grand-touring",
    label: "2018 Mazda6 Grand Touring",
    engine: "2.5T", transmission: "automatic",
    rpm: { limit: 6300 },
    ratios: highTorqueAutomatic, finalDrive: 4.090, mass: 1615,
    tyres: ["225/45R19"],
    ratedPower: 230.15, powerRpm: 5000, ratedTorque: 420.30, torqueRpm: 2000,
    notes: "Power is rated on 87 AKI. Mazda quotes 250 hp on 93 AKI.",
  },
  {
    id: "mazda2-dj-2026-au-g15-at",
    label: "2026 Mazda2 G15 Evolve / GT hatch",
    generation: "DJ", engine: "1.5", transmission: "automatic", drive: "FWD",
    bodies: ["hatchback"], years: [2026, 2026], markets: ["AU"],
    rpm: { limit: 6500 },
    ratios: [3.529, 2.025, 1.348, 1.000, 0.742, 0.594], finalDrive: 4.060,
    tyres: ["185/60R16"], mass: 1109,
    ratedPower: 110.13, powerRpm: 6000, ratedTorque: 142, torqueRpm: 3500,
    verified: sourcedSpecs, sources: mazdaSource("auMazda2", sourcedSpecs),
  },
  {
    id: "mazda6-gl-2022-au-sport-at",
    label: "2022 Mazda6 Sport / Touring sedan",
    generation: "GL", engine: "2.5", transmission: "automatic", drive: "FWD",
    bodies: ["sedan"], years: [2022, 2022], markets: ["AU"],
    rpm: { limit: 6500 },
    ratios: petrolAutomatic, finalDrive: 4.325,
    tyres: ["225/55R17"], mass: 1538,
    ratedPower: 190.35, powerRpm: 6000, ratedTorque: 252, torqueRpm: 4000,
    verified: sourcedSpecs, sources: mazdaSource("auMazda6", sourcedSpecs),
  },
  {
    id: "mazda6-gl-2022-au-gt-sp-at",
    label: "2022 Mazda6 GT SP sedan",
    generation: "GL", engine: "2.5T", transmission: "automatic", drive: "FWD",
    bodies: ["sedan"], years: [2022, 2022], markets: ["AU"],
    rpm: { limit: 6300 },
    ratios: highTorqueAutomatic, finalDrive: 4.090,
    tyres: ["225/45R19"], mass: 1609,
    ratedPower: 231.14, powerRpm: 5000, ratedTorque: 420, torqueRpm: 2000,
    verified: sourcedSpecs, sources: mazdaSource("auMazda6", sourcedSpecs),
  },
  {
    ...ptCx3,
    id: "cx3-dk-2015-pt-d105-fwd-mt",
    label: "2015 CX-3 D105 FWD manual (Portugal)",
    transmission: "manual", drive: "FWD",
    ratios: cx3DieselManual, finalDrive: 3.850, mass: 1200,
  },
  {
    ...ptCx3,
    id: "cx3-dk-2015-pt-d105-awd-mt",
    label: "2015 CX-3 D105 AWD manual (Portugal)",
    transmission: "manual", drive: "AWD",
    ratios: cx3DieselManual, finalDrive: 4.105, mass: 1275,
  },
  {
    ...ptCx3,
    id: "cx3-dk-2015-pt-d105-awd-at",
    label: "2015 CX-3 D105 AWD automatic (Portugal)",
    transmission: "automatic", drive: "AWD",
    ratios: petrolAutomatic, finalDrive: 4.056, mass: 1295,
  },
  {
    ...usCx3,
    id: "cx3-dk-2019-us-sport-fwd",
    label: "2019 CX-3 Sport FWD",
    drive: "FWD", mass: 1274,
  },
  {
    ...usCx3,
    id: "cx3-dk-2019-us-sport-awd",
    label: "2019 CX-3 Sport AWD",
    drive: "AWD", mass: 1339,
  },
  {
    id: "cx8-kg-2022-au-sport-petrol",
    label: "2022 CX-8 Sport petrol FWD",
    generation: "KG", engine: "2.5", transmission: "automatic", drive: "FWD",
    bodies: ["suv"], years: [2022, 2022], markets: ["AU"],
    rpm: { limit: 6500 },
    ratios: petrolAutomatic, finalDrive: 4.957,
    tyres: ["225/65R17"], mass: 1799,
    ratedPower: 190.35, powerRpm: 6000, ratedTorque: 252, torqueRpm: 4000,
    verified: sourcedSpecs, sources: mazdaSource("auCx8", sourcedSpecs),
  },
  {
    id: "cx8-kg-2022-au-sport-diesel",
    label: "2022 CX-8 Sport diesel AWD",
    generation: "KG", engine: "2.2D", transmission: "automatic", drive: "AWD",
    bodies: ["suv"], years: [2022, 2022], markets: ["AU"],
    rpm: { limit: 5000 },
    ratios: highTorqueAutomatic, finalDrive: 4.111,
    tyres: ["225/65R17"], mass: 1949,
    ratedPower: 190.35, powerRpm: 4500, ratedTorque: 450, torqueRpm: 2000,
    verified: sourcedSpecs, sources: mazdaSource("auCx8", sourcedSpecs),
  },
  {
    ...usCx9,
    id: "cx9-tc-2018-us-sport-fwd",
    label: "2018 CX-9 Sport FWD",
    drive: "FWD", mass: 1890,
  },
  {
    ...usCx9,
    id: "cx9-tc-2018-us-sport-awd",
    label: "2018 CX-9 Sport AWD",
    drive: "AWD", mass: 1978,
  },
  ...europe,
  ...fiat,
];

// Default display units per region.
export const MARKET_UNITS = {
  EU: { speed: "km/h", distance: "km", temperature: "C", power: "PS", torque: "Nm", consumption: "L/100km" },
  UK: { speed: "mph", distance: "mi", temperature: "C", power: "PS", torque: "Nm", consumption: "mpg UK" },
  US: { speed: "mph", distance: "mi", temperature: "F", power: "hp", torque: "lb-ft", consumption: "mpg US" },
  JP: { speed: "km/h", distance: "km", temperature: "C", power: "PS", torque: "Nm", consumption: "L/100km" },
  AU: { speed: "km/h", distance: "km", temperature: "C", power: "kW", torque: "Nm", consumption: "L/100km" },
};
export const MARKETS = Object.keys(MARKET_UNITS);
