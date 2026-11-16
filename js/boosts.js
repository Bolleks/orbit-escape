/* UNIT-07 · Орбитальный забег — чистая логика временных бустов.
   UMD: window.Boosts в браузере, module.exports в Node (тесты, симуляция).
   Зависит от GameState (эффекты магнита). Никакого DOM/BABYLON —
   только каталог, размещение, таймеры и композиция эффектов.
   Спека: docs/superpowers/specs/2026-11-15-temporary-boosts-design.md */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./game-state.js"));
  else root.Boosts = factory(root.GameState);
})(typeof self !== "undefined" ? self : this, function (GS) {
  "use strict";

  const DURATION = 10;  // секунд, у всех типов
  const BLINK_WINDOW = 3; // секунд до конца, когда аура мигает
  const MIN_GAP = 500;  // метров вдоль трассы между бустами
  const POCKET = 12;    // метров кармана без препятствий вокруг буста

  // Каталог: порядок вставки фиксирован (используется симуляцией).
  const BOOSTS = {
    overdrive: { id: "overdrive", name: "Форсаж", toast: "ФОРСАЖ ×2 · НЕУЯЗВИМОСТЬ", color: "#ff9a3d", duration: DURATION },
    magnet3: { id: "magnet3", name: "Магнит-3", toast: "МАГНИТ: ВСЕ ПОЛОСЫ · ЛЮБАЯ ВЫСОТА", color: "#59c8ff", duration: DURATION },
    double: { id: "double", name: "Удвоитель", toast: "ЯЧЕЙКИ ×2", color: "#7dff9e", duration: DURATION },
    chrono: { id: "chrono", name: "Хронодемпфер", toast: "ХРОНОДЕМПФЕР: ВРЕМЯ ×0.5", color: "#b48aff", duration: DURATION },
    scatter: { id: "scatter", name: "Россыпь", toast: "РОССЫПЬ ЯЧЕЕК", color: "#ffe066", duration: DURATION },
    airjump: { id: "airjump", name: "Импульсный прыжок", toast: "ИМПУЛЬСНЫЙ ПРЫЖОК", color: "#ff7ad9", duration: DURATION }
  };
  const IDS = Object.keys(BOOSTS);

  // План из 3 разных бустов на сегмент (забег 3000 м).
  // Без rejection sampling: случайные зазоры гарантируют ≥MIN_GAP.
  // Порядок вызовов rng зафиксирован: shuffle (len−1), 3 отсечки, 3 полосы.
  function planSegment({ rng, startZ, exclude = [], prevLastZ = null }) {
    const pool = IDS.filter(id => !exclude.includes(id));
    for (let i = pool.length - 1; i > 0; i--) { // Fisher–Yates
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const ids = pool.slice(0, 3);
    let lo = startZ + 250;
    if (prevLastZ !== null) lo = Math.max(lo, prevLastZ + MIN_GAP);
    const hi = startZ + 2800;
    const span = hi - lo - 2 * MIN_GAP; // ≥ 1500 даже в worst case
    const cuts = [rng(), rng(), rng()].sort((a, b) => a - b);
    const g0 = span * cuts[0], g1 = span * (cuts[1] - cuts[0]), g2 = span * (cuts[2] - cuts[1]);
    const z1 = lo + g0, z2 = z1 + MIN_GAP + g1, z3 = z2 + MIN_GAP + g2;
    return [
      { id: ids[0], z: z1, lane: Math.floor(rng() * 3) },
      { id: ids[1], z: z2, lane: Math.floor(rng() * 3) },
      { id: ids[2], z: z3, lane: Math.floor(rng() * 3) }
    ];
  }

  // Активные эффекты: id → оставшиеся секунды. Таймеры независимые.
  const createActive = () => ({});
  const pickup = (active, id, order) => {
    active[id] = DURATION; // обновление, не суммирование
    if (order) { const i = order.indexOf(id); if (i >= 0) order.splice(i, 1); order.push(id); }
  };
  function tick(active, dt) {
    for (const id in active) {
      active[id] -= dt;
      if (active[id] <= 0) delete active[id];
    }
  }
  const has = (active, id) => active[id] > 0;

  // Аура: цвет последнего подобранного из ещё активных бустов (порядок подборов).
  function auraTarget(active, order) {
    for (let i = order.length - 1; i >= 0; i--) if (active[order[i]] > 0) return order[i];
    return null;
  }
  // Огибающая мигания: 1 вне окна и на его старте (без скачка яркости),
  // далее косинус 2.5 Гц от остатка — в паузе остаток заморожен, пульсация тоже.
  function auraPulse(remaining) {
    if (remaining > BLINK_WINDOW) return 1;
    return 0.5 + 0.5 * Math.cos(2 * Math.PI * 2.5 * (BLINK_WINDOW - remaining));
  }

  // Композиция эффектов (используются игрой и симуляцией).
  const speedMul = active => (has(active, "overdrive") ? 2 : 1) * (has(active, "chrono") ? 0.5 : 1);
  const invincible = active => has(active, "overdrive");
  const cellValue = active => (has(active, "double") ? 2 : 1);
  const magnetRadius = (state, active) => (has(active, "magnet3") ? 6.6 : GS.effect(state, "magnet"));
  const collectWindows = (state, active) => (has(active, "magnet3") ? { z: 2.4, y: 3.0 } : GS.collectWindows(state));
  const canAirJump = (active, used) => has(active, "airjump") && !used;

  return { BOOSTS, IDS, DURATION, BLINK_WINDOW, MIN_GAP, POCKET, planSegment, createActive, pickup, tick, has, auraTarget, auraPulse, speedMul, invincible, cellValue, magnetRadius, collectWindows, canAirJump };
});
