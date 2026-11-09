// SPDX-License-Identifier: GPL-3.0-or-later
import { clone, validate } from "./model.mjs";
const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export class DraftConflict extends Error {}
export class Persistence {
  constructor(name = "miatoff-studio") {
    this.name = name;
    this.revision = 0;
    this.original = null;
    this.hashCache = new WeakMap();
  }
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open(this.name, 2);
      r.onupgradeneeded = () => {
        for (const name of ["drafts", "projects", "assets", "originals"])
          if (!r.result.objectStoreNames.contains(name))
            r.result.createObjectStore(name);
        if (!r.result.objectStoreNames.contains("revisions"))
          r.result.createObjectStore("revisions", { autoIncrement: true });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () =>
        reject(Error("Close older editor tabs to upgrade draft storage"));
    });
    this.db.onversionchange = () => this.db.close();
    return this.db;
  }
  async hydrate(doc) {
    const result = clone(doc);
    const db = await this.open();
    for (const [key, a] of Object.entries(result.assets ?? {})) {
      if (a.data) continue;
      const t = db.transaction("assets");
      const stored = await request(t.objectStore("assets").get(a.hash));
      if (!stored) throw Error("A saved image asset is missing");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(stored.data),
      );
      if (
        [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("") !== a.hash
      )
        throw Error("A saved image asset failed its integrity check");
      result.assets[key] = stored;
    }
    return result;
  }
  async load() {
    const db = await this.open();
    const record = await request(
      db.transaction("projects").objectStore("projects").get("current"),
    );
    if (record) {
      this.lastRaw = clone(record.document);
      this.revision = record.revision;
      return {
        raw: await this.hydrate(record.document),
        revision: this.revision,
        savedAt: record.savedAt,
      };
    }
    const old = await request(
      db.transaction("drafts").objectStore("drafts").get("project"),
    );
    if (old) {
      this.lastRaw = clone(old);
      this.original = clone(old);
      return { raw: old, revision: 0, legacy: true };
    }
    const text =
      this.name === "miatoff-studio"
        ? localStorage.getItem("miatoff.designer.v1")
        : null;
    if (text) {
      this.lastRaw = text;
      const raw = JSON.parse(text);
      this.original = clone(raw);
      return { raw, revision: 0, legacy: true };
    }
    return null;
  }
  async prepareReplacement() {
    const db = await this.open(),
      r = await request(
        db.transaction("projects").objectStore("projects").get("current"),
      );
    this.revision = r?.revision ?? 0;
    this.original = this.lastRaw ?? r?.document ?? null;
  }
  async digest(asset) {
    if (!this.hashCache.has(asset))
      this.hashCache.set(
        asset,
        crypto.subtle
          .digest("SHA-256", new TextEncoder().encode(asset.data))
          .then((d) =>
            [...new Uint8Array(d)]
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
          ),
      );
    return this.hashCache.get(asset);
  }
  async pack(doc) {
    const result = clone({ ...doc, assets: {} }),
      assets = [];
    for (const [key, a] of Object.entries(doc.assets)) {
      const hash = await this.digest(a);
      result.assets[key] = { hash, width: a.width, height: a.height };
      assets.push({ hash, asset: a });
    }
    return { document: result, assets };
  }
  async save(
    doc,
    { session, expected = this.revision, checkpoint = null, roots = [] } = {},
  ) {
    validate(doc);
    const packed = await this.pack(doc),
      retained = new Set();
    for (const root of roots) {
      const p = await this.pack(root);
      p.assets.forEach((a) => retained.add(a.hash));
      packed.assets.push(...p.assets);
    }
    const db = await this.open();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(
          ["projects", "assets", "revisions", "originals"],
          "readwrite",
        ),
        projects = tx.objectStore("projects"),
        revisions = tx.objectStore("revisions");
      let conflict = false,
        failure = null,
        next = 0;
      const current = projects.get("current");
      current.onsuccess = () => {
        const previous = current.result;
        if ((previous?.revision ?? 0) !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        next = expected + 1;
        for (const item of new Map(
          packed.assets.map((a) => [a.hash, a]),
        ).values())
          tx.objectStore("assets").put(item.asset, item.hash);
        if (this.original) {
          // The first retained original wins: never replace an existing one.
          const original = this.original,
            existing = tx.objectStore("originals").get("pre-v3");
          existing.onsuccess = () => {
            if (existing.result === undefined)
              tx.objectStore("originals").put(original, "pre-v3");
          };
        }
        if (previous)
          revisions.add({
            document: previous.document,
            revision: previous.revision,
            savedAt: previous.savedAt,
            name: null,
          });
        if (checkpoint)
          revisions.add({
            document: packed.document,
            revision: next,
            savedAt: Date.now(),
            name: checkpoint,
          });
        projects.put(
          {
            document: packed.document,
            revision: next,
            session,
            savedAt: Date.now(),
          },
          "current",
        );
        const records = revisions.getAll(),
          keys = revisions.getAllKeys();
        let pending = 2;
        const prune = () => {
          if (--pending) return;
          const rows = records.result.map((r, i) => ({
            ...r,
            key: keys.result[i],
            bytes: new TextEncoder().encode(JSON.stringify(r.document)).length,
          }));
          let used = rows
            .filter((r) => r.name)
            .reduce((sum, r) => sum + r.bytes, 0);
          if (used > 32 * 1024 * 1024) {
            failure = Error(
              "Named checkpoints exceed 32 MiB. Delete a checkpoint or export a backup.",
            );
            tx.abort();
            return;
          }
          let count = 0;
          for (const row of rows.reverse().filter((r) => !r.name)) {
            if (count >= 10 || used + row.bytes > 32 * 1024 * 1024)
              revisions.delete(row.key);
            else {
              used += row.bytes;
              count++;
            }
          }
        };
        records.onsuccess = keys.onsuccess = prune;
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          conflict
            ? new DraftConflict(
                "Another tab saved a newer revision. Reload it or export your local work.",
              )
            : (failure ?? tx.error ?? Error("Save transaction aborted")),
        );
    });
    this.revision = result;
    this.original = null;
    await this.collect(retained);
    return result;
  }
  async collect(undoRoots = new Set()) {
    const db = await this.open(),
      t = db.transaction(["projects", "revisions", "assets"], "readwrite"),
      keep = new Set(undoRoots);
    let pending = 2;
    const scan = (name) => {
      const c = t.objectStore(name).openCursor();
      c.onsuccess = () => {
        const row = c.result;
        if (row) {
          Object.values(row.value.document.assets ?? {}).forEach((a) =>
            keep.add(a.hash),
          );
          row.continue();
        } else if (--pending === 0) {
          const a = t.objectStore("assets").openCursor();
          a.onsuccess = () => {
            const r = a.result;
            if (r) {
              if (!keep.has(r.key)) r.delete();
              r.continue();
            }
          };
        }
      };
    };
    scan("projects");
    scan("revisions");
    return new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
  async originalSource() {
    const db = await this.open();
    return request(
      db.transaction("originals").objectStore("originals").get("pre-v3"),
    );
  }
  async revisions() {
    const db = await this.open(),
      t = db.transaction("revisions"),
      rows = [];
    await new Promise((resolve, reject) => {
      const r = t.objectStore("revisions").openCursor(null, "prev");
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          rows.push({ key: c.key, ...c.value });
          c.continue();
        } else resolve();
      };
      r.onerror = () => reject(r.error);
    });
    return rows;
  }
  async deleteCheckpoint(key, roots = []) {
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("revisions", "readwrite"),
        store = tx.objectStore("revisions"),
        r = store.get(key);
      r.onsuccess = () => {
        if (!r.result?.name) {
          tx.abort();
          return;
        }
        store.delete(key);
      };
      tx.oncomplete = resolve;
      tx.onabort = () => reject(Error("Only named checkpoints can be deleted"));
      tx.onerror = () => reject(tx.error);
    });
    const retained = new Set();
    for (const root of roots)
      (await this.pack(root)).assets.forEach((a) => retained.add(a.hash));
    await this.collect(retained);
  }
  async restore(key) {
    const db = await this.open();
    const r = await request(
      db.transaction("revisions").objectStore("revisions").get(key),
    );
    if (!r) throw Error("Revision no longer exists");
    return this.hydrate(r.document);
  }
  close() {
    this.db?.close();
    this.db = null;
  }
}
export async function decodeAssets(project) {
  for (const a of Object.values(project.assets ?? {})) {
    const response = await fetch(a.data),
      blob = await response.blob();
    if (blob.size > 1.5 * 1024 * 1024) throw Error("Image exceeds 1.5 MiB");
    const bitmap = await createImageBitmap(blob);
    try {
      if (
        bitmap.width > 800 ||
        bitmap.height > 480 ||
        bitmap.width < 1 ||
        bitmap.height < 1
      )
        throw Error("Image exceeds normalized dimensions");
      if (
        (a.width !== undefined && a.width !== bitmap.width) ||
        (a.height !== undefined && a.height !== bitmap.height)
      )
        throw Error("Image dimensions do not match");
      a.width = bitmap.width;
      a.height = bitmap.height;
    } finally {
      bitmap.close();
    }
  }
  const byData = new Map(),
    remap = new Map();
  for (const [key, a] of Object.entries(project.assets)) {
    if (byData.has(a.data)) {
      remap.set(key, byData.get(a.data));
      delete project.assets[key];
    } else byData.set(a.data, key);
  }
  for (const t of project.themes)
    for (const bg of [
      t.background,
      t.dayBackground,
      ...t.pages.flatMap((p) => [p.background, p.dayBackground]),
    ].filter(Boolean))
      if (remap.has(bg.asset)) bg.asset = remap.get(bg.asset);
  return project;
}
export async function normalizeImage(file) {
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error("Choose PNG/JPEG up to 10 MiB");
  const b = new Uint8Array(await file.arrayBuffer());
  let width = 0,
    height = 0;
  if (file.type === "image/png" && b.length >= 24) {
    const v = new DataView(b.buffer);
    width = v.getUint32(16);
    height = v.getUint32(20);
  } else
    for (let i = 2; i + 8 < b.length; ) {
      if (b[i] !== 255) {
        i++;
        continue;
      }
      const mark = b[i + 1],
        len = b[i + 2] * 256 + b[i + 3];
      if ([192, 193, 194].includes(mark)) {
        height = b[i + 5] * 256 + b[i + 6];
        width = b[i + 7] * 256 + b[i + 8];
        break;
      }
      if (len < 2) break;
      i += len + 2;
    }
  if (!width || !height || width * height > 16000000)
    throw Error("Invalid image or more than 16 megapixels");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 16000000)
      throw Error("More than 16 megapixels");
    const scale = Math.min(1, 800 / bitmap.width, 480 / bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (data.length > 2097152) throw Error("Normalized image exceeds 1.5 MiB");
    return { data, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}
