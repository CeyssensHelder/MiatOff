// SPDX-License-Identifier: GPL-3.0-or-later
const clone = (value) => structuredClone(value);
export function snapshot(project) {
  for (const a of Object.values(project.assets)) Object.freeze(a);
  return {
    ...clone({ ...project, assets: {} }),
    assets: { ...project.assets },
  };
}
function sameDocument(a, b) {
  return (
    JSON.stringify({ ...a, assets: Object.keys(a.assets) }) ===
      JSON.stringify({ ...b, assets: Object.keys(b.assets) }) &&
    Object.keys(a.assets).every((k) => a.assets[k] === b.assets[k])
  );
}
export class CommandStore {
  constructor(project, view = {}, { validate, reconcile = () => {} }) {
    this.validate = validate;
    this.reconcile = reconcile;
    this.project = project;
    this.view = clone(view);
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.gesture = null;
  }
  reconcileInitial() {
    this.reconcile(this.project);
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(changed = true) {
    for (const fn of this.listeners) fn(this, { changed });
  }
  capture() {
    return { project: snapshot(this.project), view: clone(this.view) };
  }
  restore(s) {
    this.project = snapshot(s.project);
    this.view = clone(s.view);
  }
  historyBytes() {
    const assets = new Set(
      Object.values(this.project.assets).map((a) => a.data),
    );
    let bytes = 0;
    for (const entry of [...this.undoStack, ...this.redoStack]) {
      bytes += new TextEncoder().encode(
        JSON.stringify({
          ...entry,
          project: {
            ...entry.project,
            assets: Object.keys(entry.project.assets),
          },
        }),
      ).length;
      for (const a of Object.values(entry.project.assets))
        if (!assets.has(a.data)) {
          assets.add(a.data);
          bytes += a.data.length * 2;
        }
    }
    return bytes;
  }
  trim() {
    while (
      this.undoStack.length + this.redoStack.length > 100 ||
      this.historyBytes() > 16 * 1024 * 1024
    ) {
      if (this.undoStack.length) this.undoStack.shift();
      else if (this.redoStack.length) this.redoStack.shift();
      else break;
    }
  }
  command(name, fn) {
    const before = this.capture();
    try {
      fn(this.project, this.view);
      this.reconcileInitial();
      this.validate(this.project);
      for (const a of Object.values(this.project.assets)) Object.freeze(a);
      if (sameDocument(before.project, this.project)) {
        this.emit(false);
        return false;
      }
      this.undoStack.push({ ...before, name });
      this.redoStack = [];
      this.trim();
      this.emit();
      return true;
    } catch (error) {
      this.restore(before);
      this.emit(false);
      throw error;
    }
  }
  begin() {
    if (!this.gesture) this.gesture = this.capture();
  }
  commit(name = "Transform") {
    if (!this.gesture) return false;
    const before = this.gesture;
    this.gesture = null;
    try {
      this.reconcileInitial();
      this.validate(this.project);
      for (const a of Object.values(this.project.assets)) Object.freeze(a);
      if (sameDocument(before.project, this.project)) {
        this.emit(false);
        return false;
      }
      this.undoStack.push({ ...before, name });
      this.redoStack = [];
      this.trim();
      this.emit();
      return true;
    } catch (error) {
      this.restore(before);
      this.emit(false);
      throw error;
    }
  }
  cancel() {
    if (this.gesture) {
      this.restore(this.gesture);
      this.gesture = null;
      this.emit(false);
    }
  }
  undo() {
    const old = this.undoStack.pop();
    if (!old) return false;
    this.redoStack.push(this.capture());
    this.restore(old);
    this.trim();
    this.emit();
    return true;
  }
  redo() {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.capture());
    this.restore(next);
    this.trim();
    this.emit();
    return true;
  }
  assetRoots() {
    return [
      this.project,
      ...this.undoStack.map((x) => x.project),
      ...this.redoStack.map((x) => x.project),
    ];
  }
}
