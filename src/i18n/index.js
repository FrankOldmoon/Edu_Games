/* Shared, zero-dependency i18n runtime for the in-repo games.

   * Locale packs are plain nested objects, bundled at build time — no fetch,
     no async init, nothing to await before the first render.
   * English is the default locale *and* the fallback: any key a pack is
     missing falls back to `en`, and if that is missing too the key itself is
     returned, so a missing translation is visible instead of silently empty.
   * The active locale is resolved from `?lang=` first, then localStorage,
     then the default. `?lang=` is persisted, so a deep link sticks.

   Usage:
     const i18n = createI18n({ packs: { en, "zh-CN": zh } })
     i18n.t("ui.start")                      -> "Start"
     i18n.t("ui.stats", { correct: 3 })      -> "Correct 3 ..."
     i18n.mountSwitcher(document.querySelector("#lang"))
     i18n.onChange(() => rerender())
*/

import "./switcher.css";

export const LOCALES = [
  { code: "en", label: "English", short: "EN" },
  { code: "zh-CN", label: "简体中文", short: "中文" },
];

export const DEFAULT_LOCALE = "en";

const STORE_KEY = "gc.locale";

export function isSupported(code) {
  return LOCALES.some(function (l) { return l.code === code; });
}

/* Dot-path lookup: "a.b.0.c" walks plain objects and arrays alike. */
function dig(root, path) {
  const parts = String(path).split(".");
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function fill(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, function (whole, name) {
    return vars[name] === undefined ? whole : String(vars[name]);
  });
}

function storedLocale() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && isSupported(saved)) return saved;
  } catch (e) { /* private mode / storage disabled */ }
  return null;
}

function urlLocale() {
  try {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (fromUrl && isSupported(fromUrl)) return fromUrl;
  } catch (e) { /* no usable location */ }
  return null;
}

export function createI18n(options) {
  const packs = options.packs || {};
  const fallback = options.fallback || DEFAULT_LOCALE;
  const listeners = [];

  let locale = urlLocale() || storedLocale() || fallback;
  if (urlLocale()) persist(locale);

  function persist(code) {
    try { localStorage.setItem(STORE_KEY, code); } catch (e) { /* ignore */ }
  }

  function lookup(key, code) {
    const v = dig(packs[code], key);
    return typeof v === "string" ? v : undefined;
  }

  /* Static markup: <p data-i18n="k">, <a data-i18n-html="k">,
     <span data-i18n-title="k">, <input data-i18n-placeholder="k">. */
  const STATIC_ATTRS = [
    ["data-i18n", function (el, text) { el.textContent = text; }],
    ["data-i18n-html", function (el, text) { el.innerHTML = text; }],
    ["data-i18n-title", function (el, text) { el.title = text; }],
    ["data-i18n-placeholder", function (el, text) { el.placeholder = text; }],
  ];

  function applyStatic(root) {
    const scope = root || (typeof document === "undefined" ? null : document);
    if (!scope) return;
    STATIC_ATTRS.forEach(function (pair) {
      const attr = pair[0];
      const set = pair[1];
      const nodes = scope.querySelectorAll("[" + attr + "]");
      for (let i = 0; i < nodes.length; i++) set(nodes[i], api.t(nodes[i].getAttribute(attr)));
    });
  }

  function applyLangAttr() {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }

  const api = {
    locales: LOCALES,

    getLocale: function () { return locale; },

    setLocale: function (code) {
      if (!isSupported(code) || code === locale) return;
      locale = code;
      persist(code);
      applyLangAttr();
      applyStatic();
      listeners.slice().forEach(function (fn) { fn(locale); });
    },

    /* Translate. Missing keys fall back to `en`, then to the key itself. */
    t: function (key, vars) {
      if (key === undefined || key === null || key === "") return "";
      const hit = lookup(key, locale);
      const str = hit !== undefined ? hit : lookup(key, fallback);
      return str === undefined ? fill(String(key), vars) : fill(str, vars);
    },

    /* Translate if the key exists, otherwise undefined — for labels whose
       fallback is data rather than another key (e.g. deck bin names). */
    opt: function (key) {
      const hit = lookup(key, locale);
      return hit !== undefined ? hit : lookup(key, fallback);
    },

    onChange: function (fn) {
      listeners.push(fn);
      return function () {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    applyStatic: applyStatic,

    /* Renders the language buttons into `host` and keeps them in sync. */
    mountSwitcher: function (host) {
      if (!host) return null;
      const box = document.createElement("div");
      box.className = "i18n-switch";
      box.setAttribute("role", "group");
      box.setAttribute("aria-label", "Language");

      const btns = LOCALES.map(function (l) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "i18n-switch-btn";
        b.dataset.locale = l.code;
        b.textContent = l.short;
        b.title = l.label;
        b.lang = l.code;
        b.addEventListener("click", function () { api.setLocale(l.code); });
        box.appendChild(b);
        return b;
      });

      function sync() {
        btns.forEach(function (b) {
          const on = b.dataset.locale === locale;
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }

      api.onChange(sync);
      sync();
      host.appendChild(box);
      return box;
    },
  };

  applyLangAttr();
  applyStatic();
  return api;
}
