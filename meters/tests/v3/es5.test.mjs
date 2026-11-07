// The car browser (Opera Presto) runs only ES5 and an old canvas. Every meters/js/*.js file must parse as ES5, and the
// code (comments aside) must not use APIs the car lacks.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import * as acorn from "acorn";

const dir = fileURLToPath(new URL("../../js/", import.meta.url));
const files = readdirSync(dir).filter((name) => name.endsWith(".js"));

function withoutComments(source) {
  const comments = [];
  acorn.parse(source, { ecmaVersion: 5, onComment: comments, sourceType: "script" });
  let out = source;
  for (const c of comments.reverse()) out = out.slice(0, c.start) + " ".repeat(c.end - c.start) + out.slice(c.end);
  return out;
}

const FORBIDDEN = [
  [/(?<!\bG)\.roundRect\s*\(/, "ctx.roundRect (G.roundRect is our own helper)"],
  [/\bsetLineDash\b/, "ctx.setLineDash"],
  [/\bactualBoundingBox\w*/, "text bounding-box metrics"],
  [/\bfontBoundingBox\w*/, "text bounding-box metrics"],
  [/\.ellipse\s*\(/, "ctx.ellipse"],
  [/\bctx\.filter\b|\bc\.filter\b/, "ctx.filter"],
  [/\bPath2D\b/, "Path2D"],
  [/\bArray\.from\b/, "Array.from"],
  [/\.(includes|startsWith|padStart|padEnd|repeat|findIndex|flatMap)\s*\(/, "an ES2015+ method"],
  [/\.find\s*\(/, "Array.prototype.find"],
  [/\bNumber\.isFinite\b|\bNumber\.isInteger\b/, "Number.isFinite/isInteger"],
  [/\bMath\.(hypot|log10|log2|trunc|sign|cbrt)\b/, "an ES2015 Math function"],
  [/\bObject\.(assign|entries|values|fromEntries)\b/, "an ES2015+ Object function"],
  [/\bnew\s+(Map|Set|WeakMap|WeakSet|Promise|Symbol)\b/, "an ES2015 collection or Promise"],
  [/\*\*/, "the exponent operator"],
  [/\?\.|\?\?/, "optional chaining or nullish coalescing"],
  [/\.\.\./, "spread or rest"],
];

for (const name of files)
  test(`${name} is ES5 and uses no APIs the car lacks`, () => {
    const source = readFileSync(join(dir, name), "utf8");
    // Throws on let/const/arrows/template strings/classes/for-of/default parameters and the like.
    const code = withoutComments(source);
    const found = [];
    for (const [pattern, what] of FORBIDDEN) if (pattern.test(code)) found.push(what);
    assert.deepEqual(found, [], `${name} uses ${found.join(", ")}`);
  });

test("the checker itself rejects ES2015 syntax", () => {
  for (const bad of ["let a = 1;", "var f = () => 1;", "var s = `x`;", "class A {}", "for (var x of []) {}", "function f(a = 1) {}", "var a = [...b];"])
    assert.throws(() => acorn.parse(bad, { ecmaVersion: 5 }), bad);
});
