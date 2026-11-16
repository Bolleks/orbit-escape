/* UNIT-07 — low-poly companion robot, built to match the reference:
   chamfered porcelain body, graphite joints, dark visor, backpack + antenna. */
(function (global) {
  "use strict";

  const PALETTES = {
    classic: { label: "Классика", body: "#f2efe8", light: "#c7cad1", mid: "#9ba0aa", dark: "#5d626c", graphite: "#43474f", screen: "#1e222a" },
    polar:   { label: "Полярная", body: "#f6f4ef", light: "#dfe3e8", mid: "#aeb6c2", dark: "#7c8494", graphite: "#5a6170", screen: "#2b3140" },
    sunset:  { label: "Закат",    body: "#f3e2cf", light: "#e4c8ab", mid: "#c2a184", dark: "#8a6f5c", graphite: "#6b5546", screen: "#33261f" },
    mint:    { label: "Мята",     body: "#e6f2ec", light: "#cfe4da", mid: "#a3c2b4", dark: "#5f7a70", graphite: "#465c54", screen: "#1f2b27" },
    midnight:{ label: "Полночь",  body: "#4a5265", light: "#59617a", mid: "#3d4456", dark: "#2b3140", graphite: "#202531", screen: "#10131a" }
  };

  function createMaterials(scene) {
    const mats = {};
    const make = (key, rough, metal) => {
      const m = new BABYLON.PBRMaterial("mat_" + key, scene);
      m.metallic = metal || 0;
      m.roughness = rough;
      m.environmentIntensity = 0.3;
      m.specularIntensity = 0.25;
      mats[key] = m;
      return m;
    };
    make("body", 0.42);
    make("light", 0.5);
    make("mid", 0.5);
    make("dark", 0.55);
    make("graphite", 0.6);
    const screen = make("screen", 0.3, 0.05);
    screen.environmentIntensity = 0.2;
    screen.specularIntensity = 0.8;
    screen.emissiveColor = BABYLON.Color3.FromHexString("#04060a");
    applyPalette(mats, "classic");
    return mats;
  }

  function applyPalette(mats, key) {
    const p = PALETTES[key] || PALETTES.classic;
    for (const k of ["body", "light", "mid", "dark", "graphite", "screen"]) {
      mats[k].albedoColor = BABYLON.Color3.FromHexString(p[k]);
    }
    return p;
  }

  function buildRobot(scene, mats, bevel) {
    const b = bevel;
    const meshes = [];

    const root = new BABYLON.TransformNode("robotRoot", scene);

    const cb = (name, w, h, d, mat, parent, x, y, z, rx, ry, rz) => {
      // scale the chamfer with part size so small parts stay crisp, big parts chunky
      const lb = b * Math.min(1, Math.max(0.4, Math.min(w, h, d) / 1.1));
      const m = Chamfer.createBox(name, w, h, d, lb, lb * 1.9, scene);
      m.material = mat;
      m.parent = parent || root;
      m.position.set(x || 0, y || 0, z || 0);
      if (rx) m.rotation.x = rx;
      if (ry) m.rotation.y = ry;
      if (rz) m.rotation.z = rz;
      meshes.push(m);
      return m;
    };
    const cyl = (name, r, h, mat, parent, x, y, z, rz, rx) => {
      const m = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: r * 2, height: h, tessellation: 24 }, scene);
      m.material = mat;
      m.parent = parent || root;
      m.position.set(x, y, z);
      if (rz) m.rotation.z = rz;
      if (rx) m.rotation.x = rx;
      meshes.push(m);
      return m;
    };
    const sphere = (name, r, mat, parent, x, y, z, flat, sx, sy, sz) => {
      const m = BABYLON.MeshBuilder.CreateSphere(name, { diameter: r * 2, segments: flat ? 6 : 16 }, scene);
      if (flat) m.convertToFlatShadedMesh();
      m.material = mat;
      m.parent = parent || root;
      m.position.set(x, y, z);
      m.scaling.set(sx || 1, sy || 1, sz || 1);
      meshes.push(m);
      return m;
    };
    const pivot = (name, parent, x, y, z) => {
      const n = new BABYLON.TransformNode(name, scene);
      n.parent = parent || root;
      n.position.set(x, y, z);
      return n;
    };

    // ---- legs ----
    for (const s of [-1, 1]) {
      const x = s * 0.46;
      cb("boot", 0.8, 0.45, 1.15, mats.dark, root, x, 0.225, 0.12);
      cb("shin", 0.62, 0.7, 0.62, mats.mid, root, x, 0.8, 0);
      cb("knee", 0.68, 0.42, 0.7, mats.dark, root, x, 1.18, 0.05);
      cb("thigh", 0.7, 0.7, 0.72, mats.light, root, x, 1.53, 0);
    }

    // ---- pelvis / torso ----
    cb("pelvis", 1.5, 0.68, 1.05, mats.body, root, 0, 2.12, 0);
    cb("pelvisDetail", 0.92, 0.26, 0.14, mats.mid, root, 0, 2.16, 0.52);
    cb("belt", 1.56, 0.28, 1.05, mats.graphite, root, 0, 2.56, 0);
    cb("torso", 1.92, 1.42, 1.25, mats.body, root, 0, 3.36, 0);
    cb("chestDetail", 0.36, 0.36, 0.14, mats.mid, root, 0.56, 3.66, 0.62);
    cb("collar", 0.98, 0.24, 0.62, mats.graphite, root, 0, 4.04, 0.24, -0.25);
    cyl("neck", 0.27, 0.34, mats.graphite, root, 0, 4.2, 0);

    // ---- backpack + antenna ----
    cb("backpack", 1.32, 1.62, 0.5, mats.light, root, 0, 3.42, -0.9);
    const antenna = pivot("antenna", root, 0.62, 4.22, -0.9);
    cyl("antennaRod", 0.05, 1.3, mats.mid, antenna, 0, 0.65, 0);
    sphere("antennaBall", 0.17, mats.mid, antenna, 0, 1.4, 0, false);

    // ---- head ----
    const head = pivot("head", root, 0, 4.35, 0);
    cb("head", 1.56, 1.28, 1.36, mats.body, head, 0, 0.66, 0);
    cb("bezel", 1.26, 1.04, 0.12, mats.body, head, 0, 0.68, 0.66);
    cb("screen", 1.12, 0.9, 0.16, mats.screen, head, 0, 0.68, 0.72);
    for (const s of [-1, 1]) {
      cyl("ear", 0.32, 0.24, mats.dark, head, s * 0.82, 0.7, 0, Math.PI / 2);
      cyl("earCap", 0.19, 0.28, mats.mid, head, s * 0.86, 0.7, 0, Math.PI / 2);
    }

    // ---- arms ----
    const arms = {};
    for (const s of [-1, 1]) {
      const side = s > 0 ? "R" : "L";
      const shoulder = pivot("shoulder" + side, root, s * 1.14, 3.82, 0);
      sphere("shoulderDome", 0.46, mats.dark, shoulder, s * 0.06, 0.02, 0, true, 1, 0.92, 1);
      cb("upperArm", 0.56, 0.82, 0.6, mats.body, shoulder, s * 0.14, -0.5, 0, 0, 0, s * 0.1);
      const elbow = pivot("elbow" + side, shoulder, s * 0.22, -0.95, 0);
      cb("forearm", 0.66, 0.78, 0.68, mats.body, elbow, 0, -0.42, 0);
      const hand = pivot("hand" + side, elbow, 0, -0.88, 0);
      cb("palm", 0.5, 0.5, 0.5, mats.dark, hand, 0, -0.14, 0);
      cb("fingers", 0.38, 0.42, 0.24, mats.dark, hand, 0, -0.42, 0.16, 0.7);
      cb("fingerTip", 0.38, 0.26, 0.2, mats.dark, hand, 0, -0.6, 0.32, 1.35);
      cb("thumb", 0.16, 0.34, 0.2, mats.dark, hand, -s * 0.27, -0.32, 0.1, 0.4, 0, -s * 0.6);
      shoulder.rotation.z = s * 0.06;
      elbow.rotation.x = 0.12;
      arms[side] = { shoulder, elbow, hand, restZ: s * 0.06, restX: 0.12 };
    }

    return { root, head, antenna, arms, meshes };
  }

  global.Robot = { PALETTES, createMaterials, applyPalette, buildRobot };
})(window);
