/* UNIT-07 · Орбитальный забег — чистая математика крыш-платформ («Цистерны»).
   UMD: window.Platforms в браузере, module.exports в Node (тесты).
   Никакого DOM/BABYLON: приземление на крышу, удержание на крыше,
   удар в бок с защитой покинутой платформы, переходы состояния.
   Спека: docs/superpowers/specs/2026-11-15-reactor-hall-roofs-design.md (этап 2) */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Platforms = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TOP = 1.6;     // высота крыши цистерны, м
  const LEN = 24;      // длина тела, м
  const HALF_D = 12;   // половина длины
  const LAND_X = 1.5;  // допуск по X для приземления/удержания, м

  const createState = () => ({ on: null, fellFrom: null });

  // снижение через крышу: vy < 0, пересечение top сверху, полоса и тело в допуске
  function landCheck(st, prevFeetY, feetY, vy, px, pz, plats, laneX) {
    if (vy >= 0) return null;
    for (const p of plats) {
      if (prevFeetY >= p.top && feetY <= p.top &&
          Math.abs(px - laneX[p.lane]) <= LAND_X &&
          pz >= p.z - p.halfD && pz <= p.z + p.halfD) return p;
    }
    return null;
  }

  // крыша ещё под ногами: полоса и тело в допуске (размер цистерны — константа модуля,
  // снапшот состояния хранит только lane+z)
  function supported(plat, px, pz, laneX) {
    return Math.abs(px - laneX[plat.lane]) <= LAND_X &&
           pz >= plat.z - HALF_D && pz <= plat.z + HALF_D;
  }

  // удар в бок: ниже крыши, в полосе и теле; защита покинутой платформы (lane+z)
  function sideCrash(plat, st, feetY, px, pz, laneX) {
    const protected_ = st.fellFrom && st.fellFrom.lane === plat.lane && st.fellFrom.z === plat.z;
    return feetY < plat.top - 0.05 &&
           Math.abs(px - laneX[plat.lane]) <= 1.78 &&
           Math.abs(pz - plat.z) <= plat.halfD + 0.32 &&
           !protected_;
  }

  const land = (st, plat) => { st.on = { lane: plat.lane, z: plat.z }; st.fellFrom = null; };
  const depart = (st) => { st.fellFrom = st.on; st.on = null; };
  const clear = (st) => { st.on = null; st.fellFrom = null; };

  return { TOP, LEN, HALF_D, LAND_X, createState, landCheck, supported, sideCrash, land, depart, clear };
});