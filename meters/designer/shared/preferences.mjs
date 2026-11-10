// SPDX-License-Identifier: GPL-3.0-or-later
export class EditorPreferences {
  constructor(namespace, storage, onFailure = () => {}) {
    this.key = namespace + "-ui-v1";
    this.storage = storage;
    this.onFailure = onFailure;
    this.value = {
      version: 1,
      detail: 0,
      leftTab: "pages",
      sections: {},
      leftWidth: 256,
      rightWidth: 320,
    };
    try {
      const raw = JSON.parse(storage.getItem(this.key) ?? "null");
      if (raw?.version === 1) {
        if ([0, 1, 2].includes(raw.detail)) this.value.detail = raw.detail;
        if (["pages", "instruments", "layers"].includes(raw.leftTab))
          this.value.leftTab = raw.leftTab;
        if (raw.sections && typeof raw.sections === "object")
          this.value.sections = raw.sections;
        for (const k of ["leftWidth", "rightWidth"])
          if (Number.isFinite(raw[k]) && raw[k] >= 220 && raw[k] <= 420)
            this.value[k] = raw[k];
      }
    } catch {
      onFailure(
        "Workspace preferences could not be loaded; using session defaults.",
      );
    }
  }
  set(patch) {
    Object.assign(this.value, patch);
    try {
      this.storage.setItem(this.key, JSON.stringify(this.value));
    } catch {
      this.onFailure(
        "Workspace preferences are session-only. Your design draft is separate.",
      );
    }
  }
}
