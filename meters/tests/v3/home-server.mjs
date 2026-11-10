// The server and library belong only to this browser test run.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "miatoff-home-ci-"));
const child = spawn(process.env.PYTHON || "python", [
  "../../../tools/meters_designer.py", "--port", "8898", "--no-browser",
  "--library-db", join(directory, "library.sqlite3"),
], { stdio: "inherit" });
child.on("error", (error) => { console.error(error); process.exit(1); });
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill());
