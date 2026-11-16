/* UNIT-07 · Орбитальный забег — чистая логика прогрессии.
   UMD: window.GameState в браузере, module.exports в Node (тесты).
   Никакого DOM/BABYLON — только состояние, экономика и сохранения. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameState = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SECTIONS = [
    { id: "corridor", name: "Технический коридор" },
    { id: "reactor", name: "Реакторный отсек" }
  ];
  const RUN_LEN = 3000;

  // Баланс 2026-11-15: ×1.25 к исходным базам по итогам 100 симулированных
  // прохождений (docs/superpowers/reports/2026-11-15-upgrade-pricing.md).
  const UPGRADES = {
    springs: { name: "Пружины", base: 75, max: 3 },
    stabilizers: { name: "Стабилизаторы", base: 65, max: 3 },
    magnet: { name: "Магнит", base: 100, max: 3 },
    armor: { name: "Бронепластина", base: 115, max: 3 }
  };

  function create() {
    return {
      gameMode: "story",
      phase: "running", // running | shop | airlock | victory
      section: 0,
      endlessSection: "corridor",
      wallet: 0,
      collected: 0,
      upgrades: { springs: 0, stabilizers: 0, magnet: 0, armor: 0 }
    };
  }

  function newStory(s) {
    s.gameMode = "story";
    s.phase = "running";
    s.section = 0;
    s.wallet = 0;
    s.collected = 0;
    s.upgrades = { springs: 0, stabilizers: 0, magnet: 0, armor: 0 };
    return s;
  }

  function newEndless(s, sectionId) {
    newStory(s);
    s.gameMode = "endless";
    s.endlessSection = sectionId;
    return s;
  }

  function runStartZ(s) {
    return s.gameMode === "story" ? s.section * RUN_LEN : 0;
  }

  function runEndZ(s) {
    return s.gameMode === "story" ? runStartZ(s) + RUN_LEN : Infinity;
  }

  function completeRun(s) {
    if (s.gameMode !== "story") return;
    s.phase = s.section < SECTIONS.length - 1 ? "shop" : "victory";
  }

  function closeShop(s) {
    if (s.gameMode !== "story" || s.phase !== "shop") return;
    s.phase = "airlock";
  }

  function passAirlock(s) {
    if (s.gameMode !== "story" || s.phase !== "airlock") return;
    s.section++;
    s.phase = "running";
  }

  function collect(s, n) {
    if (n === undefined) n = 1;
    s.wallet += n;
    s.collected += n;
  }

  function price(s, id) {
    const u = UPGRADES[id];
    const lvl = s.upgrades[id];
    return lvl >= u.max ? null : u.base * (lvl + 1);
  }

  function buy(s, id) {
    const p = price(s, id);
    if (p === null || s.wallet < p) return false;
    s.wallet -= p;
    s.upgrades[id]++;
    return true;
  }

  function effect(s, id) {
    const lvl = s.upgrades[id];
    if (id === "springs") return 1 + 0.12 * lvl;
    if (id === "stabilizers") return 0.7 * (1 + 0.25 * lvl);
    // шаг полос 3.2: ур.1 — соседние полосы, ур.2 — все три,
    // ур.3 — все три + расширенное окно сбора (collectWindows)
    if (id === "magnet") return [1.5, 3.2, 6.6, 6.6][lvl];
    return lvl; // armor: число поглощений за забег
  }

  // окно сбора ячеек: магнит 3 собирает на любой высоте прыжка и чуть раньше/позже
  function collectWindows(s) {
    return s.upgrades.magnet >= 3 ? { z: 2.4, y: 3.0 } : { z: 1.35, y: 1.75 };
  }

  function score(s, dist) {
    return Math.floor(dist) + s.collected * 25;
  }

  // ================= СОХРАНЕНИЯ И РЕКОРДЫ =================
  // storage-адаптер: { get(k)->string|null, set(k,v), del(k) }

  const SAVE_KEY = "u07r_save";
  const isInt = v => typeof v === "number" && Number.isInteger(v) && v >= 0;

  function serialize(s) {
    return JSON.stringify({ v: 2, phase: s.phase, section: s.section, wallet: s.wallet, collected: s.collected, upgrades: s.upgrades });
  }

  function loadSave(storage) {
    const raw = storage.get(SAVE_KEY);
    if (raw === null) return null;
    let d;
    try { d = JSON.parse(raw); } catch (e) { return null; }
    if (!d || d.v !== 2 || !isInt(d.section) || !isInt(d.wallet) || !isInt(d.collected)) return null;
    if (d.section >= SECTIONS.length) return null;
    const phase = d.phase === undefined ? "running" : d.phase;
    if (!["running", "shop", "airlock"].includes(phase)) return null;
    // отсек и шлюз возможны только между секциями, не после последней
    if ((phase === "shop" || phase === "airlock") && d.section >= SECTIONS.length - 1) return null;
    const u = d.upgrades;
    if (!u || !["springs", "stabilizers", "magnet", "armor"].every(k => isInt(u[k]) && u[k] <= 3)) return null;
    const s = create();
    newStory(s);
    s.phase = phase;
    s.section = d.section;
    s.wallet = d.wallet; s.collected = d.collected;
    s.upgrades = { springs: u.springs, stabilizers: u.stabilizers, magnet: u.magnet, armor: u.armor };
    return s;
  }

  function writeSave(storage, s) {
    // бесконечный режим не трогает сюжетное сохранение
    if (s.gameMode !== "story") return;
    if (s.phase === "victory") storage.del(SAVE_KEY);
    else storage.set(SAVE_KEY, serialize(s));
  }

  function clearSave(storage) {
    storage.del(SAVE_KEY);
  }

  const readInt = (storage, k) => parseInt(storage.get(k), 10) || 0;

  function storyRecord(storage) {
    return { score: readInt(storage, "u07r_best"), dist: readInt(storage, "u07r_bestDist") };
  }

  function submitStory(storage, s, dist) {
    const sc = score(s, dist), d = Math.floor(dist);
    const rec = storyRecord(storage);
    const isRecord = sc > rec.score;
    if (isRecord) storage.set("u07r_best", String(sc));
    if (d > rec.dist) storage.set("u07r_bestDist", String(d));
    return { isRecord };
  }

  function endlessRecord(storage, sectionId) {
    const raw = storage.get("u07r_endless_" + sectionId);
    if (raw === null) return { score: 0, dist: 0 };
    try {
      const d = JSON.parse(raw);
      return { score: isInt(d.score) ? d.score : 0, dist: isInt(d.dist) ? d.dist : 0 };
    } catch (e) { return { score: 0, dist: 0 }; }
  }

  function submitEndless(storage, sectionId, s, dist) {
    const sc = score(s, dist), d = Math.floor(dist);
    const rec = endlessRecord(storage, sectionId);
    const isRecord = sc > rec.score;
    storage.set("u07r_endless_" + sectionId, JSON.stringify({
      score: Math.max(sc, rec.score),
      dist: Math.max(d, rec.dist)
    }));
    return { isRecord };
  }

  // Одноразовая миграция перед выходом бустов: рекорды бесконечного
  // становятся несравнимыми (бусты увеличивают сбор ячеек), сбрасываем
  // оба ровно один раз; сюжетные рекорды и сохранения не трогаем.
  function migrateBoosts(storage) {
    if (storage.get("u07r_boostsRev") === "1") return;
    for (const s of SECTIONS) storage.del("u07r_endless_" + s.id);
    storage.set("u07r_boostsRev", "1");
  }

  // Одноразовая миграция перед выходом крыш (этап 2): механика и экономика
  // реактора меняются, рекорд бесконечного реактора несравним — сбрасываем
  // ровно его один раз; коридорный рекорд и сюжет не трогаем.
  function migrateRoofs(storage) {
    if (storage.get("u07r_roofsRev") === "1") return;
    storage.del("u07r_endless_reactor");
    storage.set("u07r_roofsRev", "1");
  }

  // Длительность бустов 5→10 с: рекорды бесконечного снова несравнимы
  // (окна силы вдвое длиннее), сбрасываем оба ровно один раз;
  // сюжетные рекорды, кошелёк и улучшения не трогаем.
  function migrateBoostDuration(storage) {
    if (storage.get("u07r_boostDurRev") === "1") return;
    for (const s of SECTIONS) storage.del("u07r_endless_" + s.id);
    storage.set("u07r_boostDurRev", "1");
  }

  return { SECTIONS, RUN_LEN, UPGRADES, create, newStory, newEndless, runStartZ, runEndZ, completeRun, closeShop, passAirlock, collect, price, buy, effect, collectWindows, score, loadSave, writeSave, clearSave, storyRecord, submitStory, endlessRecord, submitEndless, migrateBoosts, migrateRoofs, migrateBoostDuration };
});