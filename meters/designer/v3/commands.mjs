// SPDX-License-Identifier: GPL-3.0-or-later
import { validate } from "./model.mjs";
import { CommandStore as Store } from "../shared/commands.mjs";
export { snapshot } from "../shared/commands.mjs";
export class CommandStore extends Store {
  constructor(project, view = {}) {
    super(project, view, {
      validate,
      reconcile(p) {
        if (!p.themes.some((t) => t.id === p.initialTheme))
          p.initialTheme = p.themes[0]?.id;
        const t = p.themes.find((t) => t.id === p.initialTheme);
        if (p.initialPage >= t?.pages.length) p.initialPage = 0;
      },
    });
  }
}
