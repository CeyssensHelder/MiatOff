export async function contactFixture(name) {
  const M = await import("./v3/model.mjs"),
    R = await import("./v3/renderer.mjs");
  await Promise.all(
    ["MO Chakra", "MO Mono"].map((font) =>
      document.fonts.load(`18px "${font}"`),
    ),
  );
  await document.fonts.ready;
  const t = M.starter(name),
    c = document.createElement("canvas");
  c.id = "visual-fixture";
  c.width = 1600;
  c.height = 1040;
  c.style.cssText = "width:1600px;height:1040px;max-width:none";
  const ctx = c.getContext("2d"),
    state = {
      ...__studio.sim.state,
      speed: 123,
      rpm: 4500,
      coolant: 90,
      fuel: 70,
      gLat: 0.4,
      gLong: -0.2,
      maxSpeed: 156,
      maxRpm: 7200,
      maxG: 0.5,
      laps: 3,
      lap: "1:24.5",
      lastLap: "1:38.2",
      bestLap: "1:35.0",
      delta: "+3.2",
    };
  state.history = Array.from({ length: 300 }, (_, i) => ({
    time: i / 10 - 30,
    rpm: 3500 + Math.sin(i / 20) * 2000,
    gLat: Math.sin(i / 20) * 0.5,
    gLong: Math.cos(i / 20) * 0.3,
    power: 90 + Math.sin(i / 20) * 40,
    torque: 125 + Math.sin(i / 30) * 20,
  }));
  for (const [i, mode] of ["night", "day"].entries())
    for (const [j, p] of t.pages.entries()) {
      ctx.save();
      ctx.translate(i * 800, j * 520);
      ctx.fillStyle = "#192434";
      ctx.fillRect(0, 0, 800, 40);
      ctx.font = "18px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${name} · ${p.name} · ${mode}`, 16, 27);
      ctx.translate(0, 40);
      R.render(ctx, t, p, {}, state, { mode });
      ctx.restore();
    }
  document.body.replaceChildren(c);
  return c.id;
}
