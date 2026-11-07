import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../../designer/v3/model.mjs";
import {
  allPages,
  addPage,
  pageFromStarter,
  editableStyle,
} from "../../designer/v3/pages.mjs";
import { builderSnapshot } from "../../designer/v3/builder.mjs";

test("all legacy groups appear as Custom pages without changing their documents", () => {
  const project = M.defaults();
  project.themes.push(M.starter("Track"));
  const before = JSON.stringify(project);
  assert.equal(allPages(project).length, 4);
  assert.equal(JSON.stringify(project), before);
  assert.equal(
    builderSnapshot(project).themes.flatMap((t) => t.pages).length,
    4,
  );
});

test("starters add one independently styled page; blank adds no instruments", () => {
  const project = M.defaults(),
    original = JSON.stringify(project.themes[0].pages);
  const page = pageFromStarter("Neon", 1);
  const owner = addPage(project, page);
  assert.equal(allPages(project).length, 3);
  assert.equal(JSON.stringify(project.themes[0].pages.slice(0, 2)), original);
  assert.equal(
    M.pageTheme(owner, page).style.color,
    M.starter("Neon").style.color,
  );
  editableStyle(owner, page, "night").color = "#abcdef";
  assert.equal(
    M.pageTheme(owner, owner.pages[0]).style.color,
    owner.style.color,
  );
  assert.equal(pageFromStarter().widgets.length, 0);
  assert.doesNotThrow(() => M.validate(project));
});
