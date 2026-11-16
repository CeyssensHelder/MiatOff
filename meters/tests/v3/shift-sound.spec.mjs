// The car's Meters page (meters/index.html) in Chromium with the shift sound on for some built-in styles (a list in
// the car profile, chosen in the MiatOff app) and some custom pages (their own switch): ticks speeding up from the
// amber line, a steady tone at the shift point that stops at the upshift, quiet on the limiter, each page at its own
// rpm; none where it is off, when stationary or on stale data; and the style menu's sound test. Audio and the HMI's
// beep are stand-ins here: whether Opera Presto on the CMU plays the files is not tested by this.
import { test, expect } from "@playwright/test";
import { carPages, serveMeters, shiftProject } from "./car-fixture.mjs";

const PROFILE = {
  label: "Test car",
  rpm: { max: 8000, amber: 5800, red: 6300, shift: 6500, limit: 6800 },
  units: { speed: "km/h", distance: "km", temperature: "C", power: "PS", torque: "Nm", consumption: "L/100km" },
};
const script = (profile) => `window.MeterCarProfile = ${JSON.stringify(profile)};\n`;

// Records every sound: "tick" and "shift" for the WAVs (by file name), "stop" when the shift tone is paused while
// playing, "beep:..." for the HMI beep through window.framework (the page has no parent here).
async function stubs(page) {
  await page.addInitScript(() => {
    window.__tones = [];
    window.__audios = 0;
    window.Audio = function () {
      window.__audios++;
      const el = {
        src: "",
        playing: false,
        canPlayType: () => "maybe",
        addEventListener() {},
        load() {},
        play() { el.playing = true; window.__tones.push(el.src.split("/").pop().replace(".wav", "")); },
        pause() { if (el.playing) window.__tones.push("stop"); el.playing = false; },
      };
      return el;
    };
    window.framework = { common: { beep: (a, b) => window.__tones.push(`beep:${a},${b}`) } };
  });
}
async function open(page, served, query) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewportSize({ width: 800, height: 480 });
  // A poll source that never answers: nothing but the test writes MeterData.
  await page.goto(`${served.url}/index.html?src=poll:/no-data.json&${query}`);
  await page.waitForTimeout(300);
  return errors;
}
const feed = async (page, rpm, speed = 60) => {
  await page.evaluate(([rpm, speed]) => {
    const D = window.MeterData;
    D.target.rpm = rpm;
    D.target.speed = speed;
    D.lastData = Date.now();
  }, [rpm, speed]);
  await page.waitForTimeout(120);
};
// The same rpm for `ms`, one data update about every 120 ms: no rise, so no early prediction.
const hold = async (page, rpm, ms, speed = 60) => {
  for (let t = 0; t < ms; t += 120) await feed(page, rpm, speed);
};
const tones = (page) => page.evaluate(() => window.__tones.slice());
const clear = (page) => page.evaluate(() => { window.__tones.length = 0; });
// Consecutive repeats counted: ["tick", "tick", "shift"] -> "tick*2 shift".
const pattern = (list) =>
  list
    .reduce((out, x) => {
      const last = out.at(-1);
      if (last && last.name === x) last.n++;
      else out.push({ name: x, n: 1 });
      return out;
    }, [])
    .map((x) => (x.n > 1 ? `${x.name}*${x.n}` : x.name))
    .join(" ");

test("ticks speed up through the amber band, then a steady tone that the upshift stops", async ({ page }) => {
  await stubs(page);
  const served = await serveMeters({ "/js/car-profile.js": script({ ...PROFILE, shiftSound: ["street", "track"] }) });
  try {
    const errors = await open(page, served, "set=street");   // amber 5800, shift 6500
    await hold(page, 5000, 600);
    expect(await tones(page)).toEqual([]);
    // A step up in the test is a fast rise, which the early tone would treat as reaching the shift point: let each
    // level settle while stopped (speed 0, no sound) before driving on at it.
    await hold(page, 5900, 700, 0);
    await hold(page, 5900, 1500);   // just into the band: about 400 ms apart
    const slow = (await tones(page)).length;
    expect(slow).toBeGreaterThanOrEqual(2);
    expect(slow).toBeLessThanOrEqual(5);
    await clear(page);
    await hold(page, 6450, 700, 0);
    await hold(page, 6450, 1500);   // just below the shift point: about 135 ms apart
    const fast = await tones(page);
    expect(fast.length).toBeGreaterThan(slow * 2);
    expect(new Set(fast)).toEqual(new Set(["tick"]));
    await clear(page);
    await hold(page, 6550, 300);    // the shift point
    await hold(page, 4800, 300);    // the upshift
    expect(pattern(await tones(page))).toBe("shift stop");
    await hold(page, 6550, 300);    // the next gear gets its tone again
    expect(pattern(await tones(page))).toBe("shift stop shift");
    expect(errors).toEqual([]);
  } finally {
    await served.close();
  }
});

test("on the limiter: one steady tone of at most 1.5 s, then quiet until the revs come down", async ({ page }) => {
  await stubs(page);
  const served = await serveMeters({ "/js/car-profile.js": script({ ...PROFILE, shiftSound: ["track"] }) });
  try {
    const errors = await open(page, served, "set=track");
    await hold(page, 6700, 2500);
    expect(pattern(await tones(page))).toBe("shift stop");
    await hold(page, 6100, 600);    // back in the amber band: not armed again yet
    expect(pattern(await tones(page))).toBe("shift stop");
    await hold(page, 5500, 300);    // below amber: armed again
    await hold(page, 6700, 300);
    expect(pattern(await tones(page))).toBe("shift stop shift");
    expect(errors).toEqual([]);
  } finally {
    await served.close();
  }
});

test("the shift tone comes early when the revs rise fast", async ({ page }) => {
  await stubs(page);
  const served = await serveMeters({ "/js/car-profile.js": script({ ...PROFILE, shiftSound: ["track"] }) });
  try {
    await open(page, served, "set=track");
    await hold(page, 4500, 600);
    const at = await page.evaluate(async () => {
      // About 4,000 rpm/s from 4,500, one data update every 50 ms: the rpm when the shift tone starts.
      const D = window.MeterData;
      for (let r = 4500; r <= 7000; r += 200) {
        D.target.rpm = r;
        D.target.speed = 60;
        D.lastData = Date.now();
        await new Promise((done) => setTimeout(done, 50));
        if (window.__tones.includes("shift")) return r;
      }
      return null;
    });
    expect(at).toBeGreaterThanOrEqual(5300);   // shift 6500, at most 1,000 rpm early, allowing for timer jitter
    expect(at).toBeLessThan(6500);
  } finally {
    await served.close();
  }
});

test("silent when stationary, on stale data, and without the switch", async ({ page }) => {
  await stubs(page);
  let served = await serveMeters({ "/js/car-profile.js": script({ ...PROFILE, shiftSound: ["street", "track"] }) });
  try {
    await open(page, served, "set=track");
    await feed(page, 5000, 0);
    await feed(page, 7000, 0);       // revving at a standstill
    await feed(page, 5000, 4);
    await feed(page, 7000, 4);       // walking pace
    await page.evaluate(() => {      // the last data is 4 s old
      const D = window.MeterData;
      D.target.rpm = 5000; D.target.speed = 60; D.lastData = Date.now() - 4000;
    });
    await page.waitForTimeout(120);
    await page.evaluate(() => { window.MeterData.target.rpm = 7000; });
    await page.waitForTimeout(120);
    expect(await tones(page)).toEqual([]);
  } finally {
    await served.close();
  }
  for (const profile of [PROFILE, { ...PROFILE, shiftSound: "yes" }, { ...PROFILE, shiftSound: [] }, null]) {
    served = await serveMeters({ "/js/car-profile.js": script(profile) });
    try {
      await open(page, served, "set=street");
      await feed(page, 5000);
      await feed(page, 7000);
      expect(await tones(page), JSON.stringify(profile)).toEqual([]);
      expect(await page.evaluate(() => window.__audios), "no audio element without the switch").toBe(0);
    } finally {
      await served.close();
    }
  }
});

test("only the styles chosen in the app beep", async ({ page }) => {
  await stubs(page);
  const served = await serveMeters({ "/js/car-profile.js": script({ shiftSound: ["track"] }) });   // no car setup
  try {
    for (const [set, want] of [["street", []], ["cyber", []], ["track", ["shift"]]]) {
      const errors = await open(page, served, `set=${set}`);
      await clear(page);
      await feed(page, 5000);
      await feed(page, 7300);   // the ND1 1.5's 7200: this car file has no rpm of its own
      expect(await tones(page), set).toEqual(want);
      expect(errors, set).toEqual([]);
    }
  } finally {
    await served.close();
  }
});

test("&sound= switches the shift sound on for a PC preview without a car file", async ({ page }) => {
  await stubs(page);
  const pages = await carPages([shiftProject(6000, false)]);
  const served = await serveMeters({ "/js/custom-pages.js": pages.script });   // the default car file: sound off
  try {
    for (const [query, want] of [
      ["set=track", []],
      ["set=track&sound=track", ["shift"]],
      ["set=street&sound=track", []],
      ["set=street&sound=all", ["shift"]],
      ["set=custom&sound=track", []],
      ["set=custom&sound=custom", ["shift"]],
      ["set=custom&sound=all", ["shift"]],
    ]) {
      const errors = await open(page, served, query);
      await feed(page, 5000);
      await feed(page, 7300);   // above the custom page's 6000 and the built-in 7200
      expect(await tones(page), query).toEqual(want);
      expect(errors, query).toEqual([]);
    }
  } finally {
    await served.close();
  }
});

test("each custom page has its own switch and shift point", async ({ page }) => {
  await stubs(page);
  const pages = await carPages([shiftProject(6000, true), shiftProject(6000, false)]);
  const served = await serveMeters({ "/js/custom-pages.js": pages.script });   // no style list at all
  try {
    const errors = await open(page, served, "set=custom&page=0");
    await feed(page, 4000);
    await feed(page, 6100);   // above the page's 6000, below the built-in 7200
    expect(await tones(page)).toEqual(["shift"]);
    await page.goto(`${served.url}/index.html?src=poll:/no-data.json&set=custom&page=1`);
    await page.waitForTimeout(300);
    await feed(page, 4000);
    await feed(page, 6100);
    expect(await tones(page), "the page with its switch off").toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await served.close();
  }
});

test("the style menu's sound test plays the demo on the chosen route and switches on a second tap", async ({ page }) => {
  await stubs(page);
  const drawn = [];
  await page.exposeFunction("__text", (s) => drawn.push(s));
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) {
      window.__text(String(s));
      return fill.apply(this, arguments);
    };
  });
  const served = await serveMeters({ "/js/car-profile.js": script({ ...PROFILE, shiftSound: ["street", "track"] }) });
  try {
    const errors = await open(page, served, "menu");
    await expect.poll(() => drawn.includes("SHIFT SOUND: FILE")).toBe(true);
    expect(drawn).not.toContain("MIATA");
    await page.mouse.click(700, 30);   // the demo: four ticks speeding up, then 0.6 s of the shift tone
    await page.waitForTimeout(1900);
    expect(pattern(await tones(page))).toBe("tick*4 shift stop");
    await clear(page);
    await page.mouse.click(700, 30);   // within 4 s: the Mazda beep instead
    await page.waitForTimeout(1900);
    const beeps = await tones(page);
    expect(new Set(beeps)).toEqual(new Set(["beep:Short,Touch"]));
    expect(beeps.length).toBeGreaterThanOrEqual(6);   // four ticks and the 120 ms repeat for the shift tone
    expect(await page.evaluate(() => localStorage.getItem("miatoff.sound"))).toBe("beep");
    await expect.poll(() => drawn.includes("SHIFT SOUND: MAZDA BEEP")).toBe(true);
    // The choice is kept: after a reload the shift tone is the Mazda beep.
    await page.goto(`${served.url}/index.html?src=poll:/no-data.json&set=street`);
    await page.waitForTimeout(300);
    await clear(page);
    await feed(page, 5000);
    await feed(page, 6600);
    expect((await tones(page))[0]).toBe("beep:Short,Touch");
    expect(errors).toEqual([]);
  } finally {
    await served.close();
  }
});

test("the Commander knob reaches the sound test: one stop after the last style, press plays it and stays in the list", async ({ page }) => {
  await stubs(page);
  const drawn = [];
  await page.exposeFunction("__text", (s) => drawn.push(s));
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) {
      window.__text(String(s));
      return fill.apply(this, arguments);
    };
  });
  const served = await serveMeters({ "/js/car-profile.js": script({ ...PROFILE, shiftSound: ["street", "track"] }) });
  try {
    const errors = await open(page, served, "menu");
    await expect.poll(() => drawn.includes("Tap: test")).toBe(true);
    await clear(page);
    // Turn well past the last style: it stops on the sound test, not beyond.
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.MiatoffMeters.next(); });
    await expect.poll(() => drawn.includes("Press: test")).toBe(true);
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.MiatoffMeters.next(); });
    await page.evaluate(() => window.MiatoffMeters.select());   // plays the demo, no page opens
    await page.waitForTimeout(1900);
    expect(pattern(await tones(page))).toBe("tick*4 shift stop");
    await expect.poll(() => drawn.some((s) => s.startsWith("Choose a style"))).toBe(true);
    // Still the style list: turning back one lands on the last style, press opens its page list.
    await page.evaluate(() => { window.MiatoffMeters.prev(); window.MiatoffMeters.select(); });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.MiatoffMeters.back())).toBe(true);   // back to the styles, not out of the app
    expect(errors).toEqual([]);
  } finally {
    await served.close();
  }
});

test("without the shift sound the knob stops on the last style", async ({ page }) => {
  await stubs(page);
  const served = await serveMeters();
  try {
    const errors = await open(page, served, "menu");
    const before = await tones(page);
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.MiatoffMeters.next(); window.MiatoffMeters.select(); });
    await page.waitForTimeout(500);
    expect(await tones(page)).toEqual(before);   // select opened the last style's page list: no sound test
    expect(await page.evaluate(() => window.MiatoffMeters.back())).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await served.close();
  }
});

test("the real tick.wav and shift.wav are served next to the page", async ({ request }) => {
  const served = await serveMeters();
  try {
    for (const name of ["tick", "shift"]) {
      const response = await request.get(`${served.url}/sounds/${name}.wav`);
      expect(response.headers()["content-type"]).toBe("audio/wav");
      expect((await response.body()).subarray(0, 4).toString()).toBe("RIFF");
    }
  } finally {
    await served.close();
  }
});
