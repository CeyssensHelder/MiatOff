/* Original PC menu-design model. No Mazda code or native event names.
 * SPDX-License-Identifier: GPL-3.0-or-later */
(function (root) {
  "use strict";
  var FACTORY = [
    "applications",
    "entertainment",
    "communication",
    "navigation",
    "settings",
  ];
  var LABELS = [
    "Applications",
    "Entertainment",
    "Communication",
    "Navigation",
    "Settings",
  ];
  // Design destinations only: not asserted to be verified CMU routes.
  var DESTINATIONS = FACTORY.concat([
    "meters",
    "bluetooth",
    "fm",
    "dab",
    "android-auto",
    "carplay",
  ]);
  var NAMES = LABELS.concat([
    "Meters",
    "Bluetooth audio",
    "FM radio",
    "DAB radio",
    "Android Auto",
    "CarPlay",
  ]);
  var MAX_ITEMS = 12,
    MAX_DESIGN = 8 * 1024 * 1024;
  function keys(value, expected) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join(",") === expected.slice().sort().join(",")
    );
  }
  function integer(value, min, max) {
    return (
      typeof value === "number" &&
      value === Math.floor(value) &&
      value >= min &&
      value <= max
    );
  }
  function position(layout, i, count) {
    if (count <= 5) {
      return {
        x: Math.round(340 + (i - (count - 1) / 2) * 160),
        y: layout === "arc" ? [280, 230, 200, 230, 280][i] : 235,
      };
    }
    return { x: 10 + (i % 6) * 132, y: i < 6 ? 150 : 290 };
  }
  function defaults() {
    return {
      version: 2,
      layout: "arc",
      background: "#17191d",
      accent: "#e04b46",
      backgroundImage: null,
      backgroundFit: "cover",
      items: FACTORY.map(function (id, i) {
        return {
          id: id,
          label: LABELS[i],
          opens: id,
          icons: { normal: null, selected: null },
          position: position("arc", i, 5),
        };
      }),
    };
  }
  function label(value) {
    if (
      typeof value !== "string" ||
      !/^[\x20-\x7e]{1,20}$/.test(value) ||
      value.trim() !== value
    ) {
      throw new Error(
        "Names need 1 to 20 printable English characters, without edge spaces.",
      );
    }
    return value;
  }
  function color(value) {
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error("Colours must use six-digit hex values.");
    }
    return value.toLowerCase();
  }
  function png(value, maxWidth, maxHeight, maxBytes) {
    var encoded, bytes, width, height;
    if (value === null) {
      return null;
    }
    if (
      typeof value !== "string" ||
      value.length > 4 * Math.ceil(maxBytes / 3) + 22 ||
      value.indexOf("data:image/png;base64,") !== 0
    ) {
      throw new Error("Artwork must be an embedded PNG within the size limit.");
    }
    encoded = value.slice(22);
    if (encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      throw new Error("Invalid PNG encoding.");
    }
    try {
      bytes = atob(encoded);
    } catch (err) {
      throw new Error("Invalid PNG encoding.");
    }
    function word(offset) {
      return (
        bytes.charCodeAt(offset) * 16777216 +
        bytes.charCodeAt(offset + 1) * 65536 +
        bytes.charCodeAt(offset + 2) * 256 +
        bytes.charCodeAt(offset + 3)
      );
    }
    if (
      bytes.length < 45 ||
      bytes.length > maxBytes ||
      bytes.slice(0, 8) !== "\x89PNG\r\n\x1a\n" ||
      word(8) !== 13 ||
      bytes.slice(12, 16) !== "IHDR" ||
      bytes.slice(-8, -4) !== "IEND" ||
      word(bytes.length - 12) !== 0
    ) {
      throw new Error("Invalid PNG structure.");
    }
    width = word(16);
    height = word(20);
    if (!integer(width, 1, maxWidth) || !integer(height, 1, maxHeight)) {
      throw new Error(
        "Artwork dimensions exceed " + maxWidth + " by " + maxHeight + ".",
      );
    }
    // The browser decoder also checks every imported image before applying it.
    return value;
  }
  function legacy(value) {
    var seen = {},
      theme = defaults();
    if (
      !keys(value, ["version", "layout", "background", "accent", "items"]) ||
      (value.layout !== "arc" && value.layout !== "row") ||
      !Array.isArray(value.items) ||
      value.items.length !== 5
    ) {
      throw new Error("Invalid version 1 design.");
    }
    theme.layout = value.layout;
    theme.background = color(value.background);
    theme.accent = color(value.accent);
    theme.items = value.items.map(function (item, i) {
      if (
        !keys(item, ["id", "label"]) ||
        FACTORY.indexOf(item.id) < 0 ||
        seen[item.id]
      ) {
        throw new Error("Invalid version 1 destination.");
      }
      seen[item.id] = true;
      return {
        id: item.id,
        label: label(item.label),
        opens: item.id,
        icons: { normal: null, selected: null },
        position: position(value.layout, i, 5),
      };
    });
    return theme;
  }
  function validate(value) {
    var seen = {},
      items;
    if (value && value.version === 1) {
      return legacy(value);
    }
    if (
      !keys(value, [
        "version",
        "layout",
        "background",
        "accent",
        "backgroundImage",
        "backgroundFit",
        "items",
      ]) ||
      value.version !== 2
    ) {
      throw new Error(
        "Expected a version 1 or 2 MiatOff design with no extra fields.",
      );
    }
    if (
      ["arc", "row", "free"].indexOf(value.layout) < 0 ||
      ["cover", "contain"].indexOf(value.backgroundFit) < 0
    ) {
      throw new Error("Invalid layout or background fit.");
    }
    if (
      !Array.isArray(value.items) ||
      !integer(value.items.length, 1, MAX_ITEMS)
    ) {
      throw new Error("Use between 1 and " + MAX_ITEMS + " items.");
    }
    items = value.items.map(function (item) {
      if (
        !keys(item, ["id", "label", "opens", "icons", "position"]) ||
        typeof item.id !== "string" ||
        !/^[a-z][a-z0-9-]{0,31}$/.test(item.id) ||
        Object.prototype.hasOwnProperty.call(seen, item.id)
      ) {
        throw new Error("Each item needs a unique design ID.");
      }
      if (DESTINATIONS.indexOf(item.opens) < 0) {
        throw new Error("Choose an available design destination.");
      }
      if (
        !keys(item.icons, ["normal", "selected"]) ||
        !keys(item.position, ["x", "y"]) ||
        !integer(item.position.x, 0, 680) ||
        !integer(item.position.y, 150, 294)
      ) {
        throw new Error("Item positions must stay inside the menu area.");
      }
      seen[item.id] = true;
      return {
        id: item.id,
        label: label(item.label),
        opens: item.opens,
        icons: {
          normal: png(item.icons.normal, 128, 128, 131072),
          selected: png(item.icons.selected, 128, 128, 131072),
        },
        position: { x: item.position.x, y: item.position.y },
      };
    });
    return {
      version: 2,
      layout: value.layout,
      background: color(value.background),
      accent: color(value.accent),
      backgroundImage: png(value.backgroundImage, 800, 480, 2097152),
      backgroundFit: value.backgroundFit,
      items: items,
    };
  }
  function parse(text) {
    if (typeof text !== "string" || text.length > MAX_DESIGN) {
      throw new Error("Design exceeds 8 MB.");
    }
    return validate(JSON.parse(text));
  }
  function indexCheck(theme, index) {
    if (!integer(index, 0, theme.items.length - 1)) {
      throw new Error("Invalid item selection.");
    }
  }
  function move(theme, index, delta) {
    var copy = validate(theme),
      target = index + delta,
      item;
    indexCheck(copy, index);
    if (delta !== -1 && delta !== 1) {
      throw new Error("Invalid move.");
    }
    if (target < 0 || target >= copy.items.length) {
      return copy;
    }
    item = copy.items[index];
    copy.items[index] = copy.items[target];
    copy.items[target] = item;
    return copy;
  }
  function step(theme, index, delta) {
    indexCheck(theme, index);
    if (delta !== -1 && delta !== 1) {
      throw new Error("Invalid selection.");
    }
    return Math.max(0, Math.min(theme.items.length - 1, index + delta));
  }
  function add(theme) {
    var copy = validate(theme),
      n = 1;
    if (copy.items.length >= MAX_ITEMS) {
      throw new Error("Use at most " + MAX_ITEMS + " items.");
    }
    while (
      copy.items.some(function (item) {
        return item.id === "custom-" + n;
      })
    ) {
      n++;
    }
    copy.items.push({
      id: "custom-" + n,
      label: "New shortcut",
      opens: "entertainment",
      icons: { normal: null, selected: null },
      position: position("row", copy.items.length, MAX_ITEMS),
    });
    return copy;
  }
  function remove(theme, index) {
    var copy = validate(theme);
    indexCheck(copy, index);
    if (copy.items.length === 1) {
      throw new Error("Keep at least one item.");
    }
    copy.items.splice(index, 1);
    return copy;
  }
  var api = {
    defaults: defaults,
    validate: validate,
    parse: parse,
    move: move,
    step: step,
    add: add,
    remove: remove,
    position: position,
    maxItems: MAX_ITEMS,
    maxDesign: MAX_DESIGN,
    destinations: DESTINATIONS.map(function (id, i) {
      return { id: id, label: NAMES[i] };
    }),
  };
  root.MiatOffMenu = api;
})(globalThis);
