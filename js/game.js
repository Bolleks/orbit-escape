/* UNIT-07 · Орбитальный забег — third-person runner (Subway Surfers style).
   Reuses the viewer's robot (js/robot.js) and chamfer generator (js/chamfer.js).
   World is static; the robot runs toward +Z. Segments/obstacles/cells are pooled. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const canvas = $("game");
  const fatal = msg => { const f = $("fatal"); f.hidden = false; f.textContent = msg; };
  window.addEventListener("error", e => fatal("Ошибка: " + e.message));
  if (!BABYLON.Engine.isSupported()) { fatal("WebGL не поддерживается этим браузером."); return; }

  const V3 = BABYLON.Vector3;
  const C3 = BABYLON.Color3;
  const C4 = BABYLON.Color4;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const ri = n => Math.floor(Math.random() * n);
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* приватный режим */ } }
  };
  const COARSE = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

  // ================= ENGINE / SCENE =================
  const engine = new BABYLON.Engine(canvas, true, { adaptToDeviceRatio: false, antialias: true, powerPreference: "high-performance" });
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = C4.FromHexString("#070910ff");
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.011;
  scene.fogColor = C3.FromHexString("#0a0e17");

  const camera = new BABYLON.UniversalCamera("cam", new V3(6, 3.4, 6), scene);
  camera.minZ = 0.1; camera.maxZ = 160; camera.fov = 0.95;
  camera.setTarget(new V3(0, 2.2, 0));

  scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("assets/environmentSpecular.env", scene);

  // ================= LIGHTS =================
  const hemi = new BABYLON.HemisphericLight("hemi", new V3(0, 1, 0), scene);
  hemi.intensity = 0.26;
  hemi.diffuse = C3.FromHexString("#aebcd8");
  hemi.groundColor = C3.FromHexString("#262c3a");

  const key = new BABYLON.DirectionalLight("key", new V3(-0.45, -1, 0.35), scene);
  key.diffuse = C3.FromHexString("#ffd9b0");
  key.intensity = 2.0;
  key.autoUpdateExtends = false;
  key.orthoLeft = -16; key.orthoRight = 16; key.orthoTop = 20; key.orthoBottom = -4;
  key.shadowMinZ = 1; key.shadowMaxZ = 70;

  const rim = new BABYLON.DirectionalLight("rim", new V3(0.3, -0.4, -1), scene);
  rim.diffuse = C3.FromHexString("#7fb8ff");
  rim.intensity = 1.15;

  const fill = new BABYLON.PointLight("fill", new V3(0, 3.2, -3), scene);
  fill.diffuse = C3.FromHexString("#59c8ff");
  fill.intensity = 0.8; fill.range = 16;

  const shadows = new BABYLON.ShadowGenerator(COARSE ? 512 : 1024, key);
  shadows.useBlurExponentialShadowMap = true;
  shadows.useKernelBlur = true;
  shadows.blurKernel = COARSE ? 16 : 32;
  shadows.setDarkness(0.32);

  // ================= MATERIALS =================
  const mats = Robot.createMaterials(scene);
  const pbr = (name, hex, rough, metal, env) => {
    const m = new BABYLON.PBRMaterial(name, scene);
    m.albedoColor = C3.FromHexString(hex);
    m.roughness = rough; m.metallic = metal;
    m.environmentIntensity = env === undefined ? 0.4 : env;
    return m;
  };
  const neon = (name, hex, gain) => {
    const m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = C3.Black();
    m.emissiveColor = C3.FromHexString(hex).scale(gain || 1.9);
    m.disableLighting = true;
    m._base = C3.FromHexString(hex).scale(gain || 1.9);
    return m;
  };
  const M = {
    floor: pbr("floor", "#171c26", 0.9, 0.15, 0.15),
    wall: pbr("wall", "#161b26", 0.72, 0.2, 0.2),
    rib: pbr("rib", "#363e52", 0.58, 0.3),
    ceil: pbr("ceil", "#161a24", 0.85, 0.1),
    pipe: pbr("pipe", "#4a5266", 0.42, 0.6),
    crate: pbr("crate", "#3a4152", 0.55, 0.25),
    beam: pbr("beamMat", "#2e3547", 0.5, 0.35),
    cyan: neon("neonCyan", "#59c8ff", 1.6),
    amber: neon("neonAmber", "#ffb454", 1.3),
    red: neon("neonRed", "#ff5f56", 1.6),
    laneCyan: neon("laneCyan", "#1d4a63", 1.5),
    laneAmber: neon("laneAmber", "#5c451e", 1.3),
    cell: neon("cellMat", "#86e2ff", 1.5),
    beacon: neon("beacon", "#7fdfff", 1.6),
    core: neon("core", "#ffc470", 1.5)
  };
  M.ceil.emissiveColor = C3.FromHexString("#0b0e15");
  [M.floor, M.wall, M.rib, M.ceil, M.pipe, M.crate, M.beam].forEach(m => m.freeze());

  // материалы реакторного отсека (вторая секция)
  const M_r = {
    floor: pbr("r_floor", "#1c1416", 0.9, 0.15, 0.15),
    wall: pbr("r_wall", "#1a1416", 0.72, 0.2, 0.2),
    rib: pbr("r_rib", "#4a3a34", 0.58, 0.3),
    ceil: pbr("r_ceil", "#1a1214", 0.85, 0.1),
    pipe: pbr("r_pipe", "#5a463c", 0.42, 0.6),
    cyan: neon("r_neonRed", "#ff5f56", 1.6),
    amber: neon("r_neonAmber", "#ff8a3d", 1.4),
    laneCyan: neon("r_laneAmber", "#6b4a1e", 1.4),
    laneAmber: neon("r_laneRed", "#5c231e", 1.4),
    glow: neon("r_glow", "#ff8a3d", 1.8),
    crate: pbr("r_crate", "#3a2c28", 0.55, 0.35),
    beam: pbr("r_beam", "#4a3a34", 0.5, 0.4)
  };
  M_r.ceil.emissiveColor = C3.FromHexString("#120a0b");
  M_r.glow.backFaceCulling = false; // панель ядра видна изнутри, как иллюминаторы (winMat)
  [M_r.floor, M_r.wall, M_r.rib, M_r.ceil, M_r.pipe, M_r.crate, M_r.beam].forEach(m => m.freeze());

  // ================= SKYBOX (stars + nebula + planet) =================
  const starsTex = new BABYLON.DynamicTexture("starsTex", { width: 1024, height: 512 }, scene, false);
  {
    const ctx = starsTex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#04060c"); g.addColorStop(0.5, "#0a1122"); g.addColorStop(1, "#04060c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
    ctx.globalCompositeOperation = "lighter";
    const blobs = [[220, 190, 200, "34,70,140"], [640, 300, 260, "20,95,115"], [880, 130, 170, "130,55,95"], [420, 380, 190, "40,55,120"]];
    for (const [x, y, r, c] of blobs) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, "rgba(" + c + ",.30)"); rg.addColorStop(1, "rgba(" + c + ",0)");
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 520; i++) {
      const x = Math.random() * 1024, y = Math.random() * 512, r = Math.random() * 1.3 + 0.3;
      const tint = rnd(["255,255,255", "200,225,255", "255,225,190", "170,220,255"]);
      ctx.fillStyle = "rgba(" + tint + "," + (0.25 + Math.random() * 0.75) + ")";
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    // planet with ring
    ctx.globalCompositeOperation = "source-over";
    const px = 790, py = 150;
    const pg = ctx.createRadialGradient(px - 22, py - 22, 6, px, py, 62);
    pg.addColorStop(0, "#3d4d74"); pg.addColorStop(0.7, "#232c48"); pg.addColorStop(1, "#101527");
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, 60, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(160,180,230,.28)"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(px, py, 96, 22, -0.32, 0, 7); ctx.stroke();
    starsTex.update();
  }
  const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
  skyMat.emissiveTexture = starsTex;
  skyMat.disableLighting = true;
  skyMat.fogEnabled = false;
  skyMat.backFaceCulling = false;
  const sky = BABYLON.MeshBuilder.CreateSphere("sky", { diameter: 300, segments: 12, sideOrientation: BABYLON.Mesh.BACKSIDE_SIDEORIENTATION }, scene);
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.isPickable = false;

  const winMat = new BABYLON.StandardMaterial("winMat", scene);
  winMat.emissiveTexture = starsTex;
  winMat.diffuseColor = C3.Black();
  winMat.disableLighting = true;
  winMat.backFaceCulling = false;
  winMat.freeze();

  // ================= CORRIDOR SEGMENTS =================
  const LANE_X = [-3.2, 0, 3.2];
  const SEG_LEN = 26, SEG_COUNT = 10, SEG_SPAN = SEG_LEN * SEG_COUNT;

  function buildSegment(variant) {
    const node = new BABYLON.TransformNode("seg", scene);
    const list = [];
    const box = (name, w, h, d, mat, x, y, z, recv) => {
      const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      m.material = mat; m.parent = node; m.position.set(x, y, z);
      m.isPickable = false; if (recv) m.receiveShadows = true;
      list.push(m); return m;
    };
    // floor + lane guides
    box("floor", 13.6, 0.5, SEG_LEN, M.floor, 0, -0.25, 0, true);
    for (const x of [-1.6, 1.6]) box("lane", 0.1, 0.025, SEG_LEN, M.laneCyan, x, 0.013, 0);
    for (const x of [-4.8, 4.8]) box("laneEdge", 0.14, 0.025, SEG_LEN, M.laneAmber, x, 0.013, 0);
    // walls + ribs + baseboards
    for (const s of [-1, 1]) {
      box("wall", 0.6, 7.2, SEG_LEN, M.wall, s * 7.0, 3.6, 0);
      box("base", 0.1, 0.1, SEG_LEN, M.laneAmber, s * 6.68, 0.14, 0);
      for (const z of [-9.75, -3.25, 3.25, 9.75]) {
        box("rib", 0.36, 7.2, 0.55, M.rib, s * 6.72, 3.6, z);
      }
    }
    // ceiling + light strips
    box("ceil", 13.6, 0.5, SEG_LEN, M.ceil, 0, 7.45, 0);
    for (const x of [-2.6, 2.6]) for (const z of [-6.5, 6.5]) box("strip", 0.5, 0.08, 4.2, M.amber, x, 7.16, z);

    if (variant === 0 || variant === 1) {
      // window bay
      const s = variant === 0 ? -1 : 1;
      box("winFrame", 0.22, 3.0, 5.0, M.rib, s * 6.66, 3.7, 0);
      const panel = BABYLON.MeshBuilder.CreatePlane("win", { width: 4.5, height: 2.5 }, scene);
      panel.material = winMat;
      panel.parent = node;
      panel.position.set(s * 6.54, 3.7, 0);
      panel.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      panel.isPickable = false; list.push(panel);
      // pipes on the other side
      for (const y of [5.7, 6.2]) {
        const p = BABYLON.MeshBuilder.CreateCylinder("pipe", { diameter: 0.3, height: SEG_LEN, tessellation: 10 }, scene);
        p.material = M.pipe; p.parent = node; p.rotation.x = Math.PI / 2;
        p.position.set(-s * 6.35, y, 0); p.isPickable = false; list.push(p);
      }
    } else if (variant === 2) {
      // pipe bay both sides + junction boxes
      for (const s of [-1, 1]) {
        for (const y of [5.5, 6.0, 6.5]) {
          const p = BABYLON.MeshBuilder.CreateCylinder("pipe", { diameter: 0.26, height: SEG_LEN, tessellation: 10 }, scene);
          p.material = M.pipe; p.parent = node; p.rotation.x = Math.PI / 2;
          p.position.set(s * 6.35, y, 0); p.isPickable = false; list.push(p);
        }
        box("junction", 0.5, 1.1, 0.9, M.rib, s * 6.5, 4.2, -4);
        box("junctionLamp", 0.52, 0.14, 0.2, M.red, s * 6.5, 4.6, -4);
      }
    } else {
      // gate frame
      for (const s of [-1, 1]) {
        box("gatePost", 0.55, 7.2, 0.55, M.crate, s * 5.3, 3.6, -12.6);
        box("gateNeon", 0.1, 6.6, 0.12, M.cyan, s * 5.0, 3.6, -12.6);
      }
      box("gateTop", 11.2, 0.55, 0.55, M.crate, 0, 6.95, -12.6);
      box("gateTopNeon", 10.4, 0.1, 0.12, M.cyan, 0, 6.65, -12.6);
    }
    return { node, meshes: list, z: 0 };
  }

  // зал реактора: те же полосы и габариты трассы, пространство шире и выше
  function buildReactorSegment(variant) {
    const node = new BABYLON.TransformNode("seg", scene);
    const list = [];
    const box = (name, w, h, d, mat, x, y, z, recv) => {
      const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      m.material = mat; m.parent = node; m.position.set(x, y, z);
      m.isPickable = false; if (recv) m.receiveShadows = true;
      list.push(m); return m;
    };
    const pipe = (name, d, x, y) => {
      const p = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: d, height: SEG_LEN, tessellation: 10 }, scene);
      p.material = M_r.pipe; p.parent = node; p.rotation.x = Math.PI / 2;
      p.position.set(x, y, 0); p.isPickable = false; list.push(p); return p;
    };
    // floor + lane guides (полосы как в коридоре)
    box("floor", 20.6, 0.5, SEG_LEN, M_r.floor, 0, -0.25, 0, true);
    for (const x of [-1.6, 1.6]) box("lane", 0.1, 0.025, SEG_LEN, M_r.laneCyan, x, 0.013, 0);
    for (const x of [-4.8, 4.8]) box("laneEdge", 0.14, 0.025, SEG_LEN, M_r.laneAmber, x, 0.013, 0);
    // hall walls + ribs + warning stripes
    for (const s of [-1, 1]) {
      box("hallWall", 0.6, 9.2, SEG_LEN, M_r.wall, s * 10.0, 4.6, 0);
      box("base", 0.1, 0.1, SEG_LEN, M_r.laneAmber, s * 9.68, 0.14, 0);
      for (const z of [-9.75, -3.25, 3.25, 9.75]) {
        box("hallRib", 0.36, 9.2, 0.55, M_r.rib, s * 9.72, 4.6, z);
        box("ribStripe", 0.38, 0.5, 0.57, M_r.amber, s * 9.72, 1.1, z);
      }
    }
    // ceiling + trusses + light strips
    box("ceil", 20.6, 0.5, SEG_LEN, M_r.ceil, 0, 9.45, 0);
    for (const z of [-6.5, 0, 6.5]) box("truss", 20.0, 0.4, 0.4, M_r.rib, 0, 8.9, z);
    for (const x of [-2.6, 2.6]) for (const z of [-6.5, 6.5]) box("strip", 0.5, 0.08, 4.2, M_r.amber, x, 9.16, z);

    if (variant === 0 || variant === 1) {
      // reactor core bay behind a grille
      const s = variant === 0 ? -1 : 1;
      box("coreFrame", 0.22, 4.6, 6.4, M_r.rib, s * 9.66, 4.2, 0);
      const panel = BABYLON.MeshBuilder.CreatePlane("corePanel", { width: 6.0, height: 4.0 }, scene);
      panel.material = M_r.glow;
      panel.parent = node;
      panel.position.set(s * 9.53, 4.2, 0);
      panel.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      panel.isPickable = false; list.push(panel);
      for (let i = -2; i <= 2; i++) box("grille", 0.12, 4.2, 0.12, M_r.pipe, s * 9.3, 4.2, i * 1.2);
      box("grille", 0.12, 0.12, 6.0, M_r.pipe, s * 9.3, 4.2, 0);
      for (const y of [5.2, 5.7, 6.2, 6.7]) pipe("hallPipe", 0.3, -s * 9.35, y);
    } else if (variant === 2) {
      // pipe gallery both sides + junction boxes + steam vents
      for (const s of [-1, 1]) {
        for (const y of [5.2, 5.6, 6.0, 6.4, 6.8, 7.2]) pipe("hallPipe", 0.26, s * 9.35, y);
        box("junction", 0.5, 1.1, 0.9, M_r.rib, s * 9.5, 4.2, -4);
        box("junctionLamp", 0.52, 0.14, 0.2, M.red, s * 9.5, 4.6, -4);
        const v = BABYLON.MeshBuilder.CreateCylinder("vent", { diameter: 0.5, height: 0.4, tessellation: 10 }, scene);
        v.material = M_r.pipe; v.parent = node; v.rotation.z = Math.PI / 2;
        v.position.set(s * 9.0, 4.9, 4); v.isPickable = false; list.push(v);
      }
    } else {
      // gate frame: red neon + warning stripes
      for (const s of [-1, 1]) {
        box("gatePost", 0.55, 9.2, 0.55, M_r.rib, s * 5.3, 4.6, -12.6);
        box("ribStripe", 0.57, 0.5, 0.57, M_r.amber, s * 5.3, 1.1, -12.6);
        box("gateNeon", 0.1, 8.6, 0.12, M_r.cyan, s * 5.0, 4.3, -12.6);
      }
      box("gateTop", 11.2, 0.55, 0.55, M_r.rib, 0, 8.95, -12.6);
      box("gateTopNeon", 10.4, 0.1, 0.12, M_r.cyan, 0, 8.65, -12.6);
    }
    return { node, meshes: list, z: 0 };
  }

  function freezeSeg(seg, on) {
    for (const m of seg.meshes) { if (on) m.freezeWorldMatrix(); else m.unfreezeWorldMatrix(); }
  }
  function placeSeg(seg, z) {
    freezeSeg(seg, false);
    seg.z = z; seg.node.position.z = z;
    freezeSeg(seg, true);
  }
  const segmentsByTheme = { corridor: [], reactor: [] };
  for (const tn of ["corridor", "reactor"]) {
    for (let i = 0; i < SEG_COUNT; i++) {
      const seg = tn === "reactor" ? buildReactorSegment(i % 4) : buildSegment(i % 4);
      placeSeg(seg, (i - 1) * SEG_LEN);
      if (tn === "reactor") seg.node.setEnabled(false);
      segmentsByTheme[tn].push(seg);
    }
  }
  let segments = segmentsByTheme.corridor;

  // ================= ROBOT =================
  const S = 0.55; // robot scale
  const rig = Robot.buildRobot(scene, mats, 0.13);
  rig.root.scaling.setAll(S);

  // leg joints: re-parent leg meshes under new hip/knee pivots (viewer code untouched)
  const hips = {}, knees = {};
  for (const s of [-1, 1]) {
    const side = s > 0 ? "R" : "L";
    const hip = new BABYLON.TransformNode("hip" + side, scene);
    hip.parent = rig.root; hip.position.set(s * 0.46, 1.88, 0);
    const knee = new BABYLON.TransformNode("knee" + side, scene);
    knee.parent = hip; knee.position.set(0, -0.7, 0.05);
    for (const m of rig.meshes) {
      if (Math.abs(m.position.x - s * 0.46) > 0.01) continue;
      if (m.name === "thigh" || m.name === "knee") {
        m.parent = hip; m.position.x -= s * 0.46; m.position.y -= 1.88;
      } else if (m.name === "shin" || m.name === "boot") {
        m.parent = knee; m.position.x -= s * 0.46; m.position.y -= 1.18; m.position.z -= 0.05;
      }
    }
    hips[side] = hip; knees[side] = knee;
  }

  // glowing bits: antenna beacon + chest core
  for (const m of rig.meshes) {
    if (m.name === "antennaBall") m.material = M.beacon;
    if (m.name === "chestDetail") m.material = M.core;
  }

  // eyes (screen face) — same recipe as the viewer
  const eyesTex = new BABYLON.DynamicTexture("eyesTex", { width: 256, height: 160 }, scene, false);
  eyesTex.hasAlpha = true;
  const eyesMat = new BABYLON.StandardMaterial("eyesMat", scene);
  eyesMat.diffuseTexture = eyesTex; eyesMat.emissiveTexture = eyesTex;
  eyesMat.useAlphaFromDiffuseTexture = true; eyesMat.disableLighting = true;
  eyesMat.backFaceCulling = false;
  const eyesPlane = BABYLON.MeshBuilder.CreatePlane("eyes", { width: 0.95, height: 0.6 }, scene);
  eyesPlane.material = eyesMat; eyesPlane.isPickable = false;
  eyesPlane.parent = rig.head; eyesPlane.position.set(0, 0.68, 0.815);
  let eyesMode = "normal", eyesOpen = 1, nextBlink = 2.5, blinkT = -1;
  function drawEyes(open, mode) {
    const ctx = eyesTex.getContext();
    ctx.clearRect(0, 0, 256, 160);
    ctx.save();
    ctx.shadowColor = mode === "x" ? "rgba(255,107,107,.95)" : "rgba(89,200,255,.95)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = ctx.fillStyle = mode === "x" ? "#ffd9d9" : "#dff4ff";
    ctx.lineWidth = 11; ctx.lineCap = "round";
    if (mode === "x") {
      for (const x of [80, 176]) {
        ctx.beginPath(); ctx.moveTo(x - 17, 62); ctx.lineTo(x + 17, 98);
        ctx.moveTo(x + 17, 62); ctx.lineTo(x - 17, 98); ctx.stroke();
      }
    } else {
      const h = Math.max(4, 62 * open);
      for (const x of [62, 158]) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, 80 - h / 2, 36, h, 12); else ctx.rect(x, 80 - h / 2, 36, h);
        ctx.fill();
      }
    }
    ctx.restore();
    eyesTex.update();
  }
  drawEyes(1, "normal");

  // blob shadow — keeps the robot grounded even between shadow-map texels
  const blob = BABYLON.MeshBuilder.CreateDisc("blob", { radius: 0.95, tessellation: 24 }, scene);
  blob.rotation.x = Math.PI / 2;
  const blobMat = new BABYLON.StandardMaterial("blobMat", scene);
  blobMat.diffuseColor = C3.Black(); blobMat.emissiveColor = C3.Black();
  blobMat.disableLighting = true; blobMat.alpha = 0.36; blobMat.backFaceCulling = false;
  blob.material = blobMat; blob.isPickable = false;

  shadows.getShadowMap().renderList = rig.meshes.slice();
  shadows.getShadowMap().refreshRate = 1;

  // ================= OBSTACLES =================
  // sources (instanced); every obstacle = a few pooled instances
  const src = {};
  const chamferSrc = (name, w, h, d, mat, set = src) => {
    const m = Chamfer.createBox(name, w, h, d, 0.09, 0.17, scene);
    m.material = mat; m.isPickable = false; m.setEnabled(false);
    set[name] = m; return m;
  };
  chamferSrc("hurdleBody", 2.7, 1.35, 0.6, M.crate);
  chamferSrc("hurdleStripe", 2.74, 0.14, 0.64, M.amber);
  chamferSrc("hurdlePlate", 2.1, 0.5, 0.06, M.amber);
  chamferSrc("beamBar", 3.0, 0.8, 0.8, M.beam);
  chamferSrc("beamStrip", 3.02, 0.09, 0.84, M.cyan);
  chamferSrc("blockBody", 2.8, 4.4, 1.5, M.crate);
  chamferSrc("blockCore", 1.7, 2.3, 0.08, M.red);
  chamferSrc("blockBand", 2.84, 0.24, 1.54, M.amber);
  {
    const rod = BABYLON.MeshBuilder.CreateCylinder("beamRod", { diameter: 0.12, height: 4.6, tessellation: 8 }, scene);
    rod.material = M.pipe; rod.isPickable = false; rod.setEnabled(false);
    src.beamRod = rod;
  }
  // shadow casters: sources pull their instances into the shadow map
  ["hurdleBody", "beamBar", "blockBody"].forEach(n => shadows.getShadowMap().renderList.push(src[n]));

  // реакторные заготовки: те же имена и габариты, материалы мира реактора
  const srcR = {};
  chamferSrc("hurdleBody", 2.7, 1.35, 0.6, M_r.rib, srcR);
  chamferSrc("hurdleStripe", 2.74, 0.14, 0.64, M_r.amber, srcR);
  chamferSrc("hurdlePlate", 2.1, 0.5, 0.06, M_r.cyan, srcR);
  chamferSrc("beamBar", 3.0, 0.8, 0.8, M_r.beam, srcR);
  chamferSrc("beamStrip", 3.02, 0.09, 0.84, M_r.cyan, srcR);
  chamferSrc("blockBody", 2.8, 4.4, 1.5, M_r.crate, srcR);
  chamferSrc("blockCore", 1.7, 2.3, 0.08, M_r.glow, srcR);
  chamferSrc("blockBand", 2.84, 0.24, 1.54, M_r.amber, srcR);
  {
    const rod = BABYLON.MeshBuilder.CreateCylinder("beamRod", { diameter: 0.12, height: 6.6, tessellation: 8 }, scene);
    rod.material = M_r.pipe; rod.isPickable = false; rod.setEnabled(false);
    srcR.beamRod = rod;
  }
  const srcByTheme = { corridor: src, reactor: srcR };
  ["hurdleBody", "beamBar", "blockBody"].forEach(n => shadows.getShadowMap().renderList.push(srcR[n]));

  // цистерна: плоская крыша на уровне 1.6 м, тело 24 м (только реактор)
  chamferSrc("platformBody", 2.8, 1.6, 24, M_r.crate, srcR);
  chamferSrc("platformTop", 2.84, 0.08, 24.04, M_r.rib, srcR);
  chamferSrc("platformGlow", 0.06, 0.3, 24, M_r.cyan, srcR);
  {
    const cap = BABYLON.MeshBuilder.CreateCylinder("platformCap", { diameter: 1.5, height: 2.8, tessellation: 10 }, scene);
    cap.bakeTransformIntoVertices(BABYLON.Matrix.RotationZ(Math.PI / 2));
    cap.material = M_r.pipe; cap.isPickable = false; cap.setEnabled(false);
    srcR.platformCap = cap;
  }
  shadows.getShadowMap().renderList.push(srcR.platformBody);

  // part layout per type: [source, x, y, z]
  const PARTS = {
    hurdle: [["hurdleBody", 0, 0.675, 0], ["hurdleStripe", 0, 1.36, 0], ["hurdlePlate", 0, 0.72, 0.32]],
    beam: [["beamBar", 0, 2.35, 0], ["beamStrip", 0, 1.93, 0], ["beamRod", -1.2, 5.0, 0], ["beamRod", 1.2, 5.0, 0]],
    block: [["blockBody", 0, 2.2, 0], ["blockCore", 0, 2.3, 0.78], ["blockBand", 0, 3.95, 0]],
    platform: [["platformBody", 0, 0.76, 0], ["platformTop", 0, 1.56, 0], ["platformCap", 0, 0.76, -12], ["platformCap", 0, 0.76, 12], ["platformGlow", -1.42, 1.2, 0], ["platformGlow", 1.42, 1.2, 0]]
  };
  const HALF_D = { hurdle: 0.3, beam: 0.4, block: 0.75, platform: 12 };
  // реакторные раскладки: подвесы балок у потолка зала (9.2), ядро контейнера на видимой грани
  const PARTS_R = {
    beam: [["beamBar", 0, 2.35, 0], ["beamStrip", 0, 1.93, 0], ["beamRod", -1.2, 6.0, 0], ["beamRod", 1.2, 6.0, 0]],
    block: [["blockBody", 0, 2.2, 0], ["blockCore", 0, 2.3, -0.78], ["blockBand", 0, 3.95, 0]]
  };
  const obstacles = []; // {type, lane, z, parts:[InstancedMesh], active}

  function spawnObstacle(type, lane, z) {
    let o = obstacles.find(q => !q.active && q.type === type);
    if (!o) {
      o = { type, parts: [], active: false };
      const layout = (theme === "reactor" && PARTS_R[type]) || PARTS[type];
      for (let i = 0; i < layout.length; i++) {
        const name = layout[i][0];
        const inst = srcByTheme[theme][name].createInstance(name + "_i");
        inst.isPickable = false;
        // в реакторе def по индексу (у цистерны повторяются cap/glow);
        // коридор — find по имени, как в базе (оба подвеса балки в одной точке)
        o.parts.push({ inst, def: theme === "reactor" ? layout[i] : layout.find(p => p[0] === name) });
      }
      obstacles.push(o);
    }
    o.active = true; o.lane = lane; o.z = z; o.gen = spawnGen;
    for (const p of o.parts) {
      p.inst.unfreezeWorldMatrix();
      p.inst.position.set(LANE_X[lane] + p.def[1], p.def[2], z + p.def[3]);
      p.inst.freezeWorldMatrix();
      p.inst.setEnabled(true);
    }
  }

  // ================= ENERGY CELLS =================
  const cellSrc = BABYLON.MeshBuilder.CreatePolyhedron("cellSrc", { type: 1, size: 0.34 }, scene);
  cellSrc.material = M.cell; cellSrc.isPickable = false; cellSrc.setEnabled(false);
  const cellPool = [];
  for (let i = 0; i < 96; i++) {
    const inst = cellSrc.createInstance("cell" + i);
    inst.isPickable = false; inst.setEnabled(false);
    cellPool.push({ inst, active: false, z: 0, y: 0, spin: Math.random() * 6 });
  }
  function addCell(lane, z, y) {
    const c = cellPool.find(q => !q.active);
    if (!c) return;
    c.active = true; c.z = z; c.y = y; c.gen = spawnGen;
    c.inst.unfreezeWorldMatrix();
    c.inst.position.set(LANE_X[lane], y, z);
    c.inst.freezeWorldMatrix();
    c.inst.setEnabled(true);
  }
  function cellLine(lane, z0, n, y) { for (let i = 0; i < n; i++) addCell(lane, z0 + i * 2.3, y); }
  function cellArc(lane, z) {
    for (let i = -3; i <= 3; i++) addCell(lane, z + i * 1.15, 1.6 + 1.95 * (1 - (i / 3) * (i / 3)));
  }

  // ================= TEMPORARY BOOSTS =================
  // 3 пикапа на забег: светящийся значок типа + вертикальный луч-маяк.
  // Логика (каталог, план, таймеры, эффекты) — в js/boosts.js.
  const Boosts = window.Boosts;
  const Platforms = window.Platforms;
  const boostMats = {}, boostBeamMats = {};
  for (const id of Boosts.IDS) {
    boostMats[id] = neon("boost_" + id, Boosts.BOOSTS[id].color, 1.7);
    boostBeamMats[id] = neon("boostBeam_" + id, Boosts.BOOSTS[id].color, 1.2);
    boostBeamMats[id].alpha = 0.45;
  }
  const boostEntities = [];
  for (let i = 0; i < 3; i++) {
    const gem = BABYLON.MeshBuilder.CreatePolyhedron("boostGem" + i, { type: 1, size: 0.55 }, scene);
    const beam = BABYLON.MeshBuilder.CreateBox("boostBeam" + i, { width: 0.16, height: 6.4, depth: 0.16 }, scene);
    gem.isPickable = false; beam.isPickable = false;
    gem.setEnabled(false); beam.setEnabled(false);
    boostEntities.push({ id: null, z: 0, lane: 1, active: false, collected: false, gem, beam });
  }

  // Аура активного буста: клоны мешей робота с общим аддитивным emissive-материалом
  // (свечение даёт существующий bloom). Клоны созданы после re-parent ног и снимка
  // shadow-списка — тени не трогаем; родители исходников сохраняются, анимация следует.
  // Inverted hull: только задние грани раздутой оболочки — цветной контур вокруг
  // силуэта, тело робота не перекрашивается (аддитив поверх белого тела давал бы
  // выбеленный оттенок вместо цвета буста).
  const auraMat = new BABYLON.StandardMaterial("auraMat", scene);
  auraMat.diffuseColor = C3.Black(); auraMat.emissiveColor = C3.Black();
  auraMat.disableLighting = true;
  auraMat.backFaceCulling = true; auraMat.cullBackFaces = false;
  auraMat.alphaMode = BABYLON.Constants.ALPHA_ADD; auraMat.alpha = 0;
  const auraColors = {};
  for (const id of Boosts.IDS) auraColors[id] = C3.FromHexString(Boosts.BOOSTS[id].color);
  const auraMeshes = rig.meshes.map(m => {
    const c = m.clone("aura_" + m.name, m.parent);
    c.material = auraMat; c.isPickable = false;
    c.scaling.scaleInPlace(1.08);
    c.setEnabled(false);
    return c;
  });
  // Мягкое свечение: аддитивный billboard-спрайт с радиальным спадом за роботом.
  // Яркое ядро выше bloomThreshold 0.72 — bloom даёт ореол; контур (auraMat)
  // остаётся насыщенным (gain 1.0): яркий контур ACES выбеливает в кремовый.
  // В default-шейдере emissiveTexture ПРИБАВЛЯЕТСЯ к emissiveColor, поэтому цвет
  // зашит в текстуру (6 радиальных градиентов), а яркость — в emissiveTexture.level.
  const auraGlowTexs = {};
  for (const id of Boosts.IDS) {
    const hex = Boosts.BOOSTS[id].color;
    const tx = puffTexture("auraGlowTex_" + id, hex + "ff", hex + "80");
    tx.hasAlpha = true;
    auraGlowTexs[id] = tx;
  }
  const auraGlowMat = new BABYLON.StandardMaterial("auraGlowMat", scene);
  auraGlowMat.diffuseTexture = auraGlowTexs.overdrive;
  auraGlowMat.emissiveTexture = auraGlowTexs.overdrive;
  auraGlowMat.emissiveColor = C3.Black();
  auraGlowMat.useAlphaFromDiffuseTexture = true; auraGlowMat.disableLighting = true;
  auraGlowMat.backFaceCulling = false;
  auraGlowMat.alphaMode = BABYLON.Constants.ALPHA_ADD; auraGlowMat.alpha = 0;
  const auraGlow = BABYLON.MeshBuilder.CreatePlane("auraGlow", { size: 5.0 }, scene);
  auraGlow.material = auraGlowMat; auraGlow.isPickable = false;
  auraGlow.parent = rig.root; auraGlow.position.set(0, 2.5, 0);
  auraGlow.billboardMode = BABYLON.AbstractMesh.BILLBOARDMODE_ALL;
  auraGlow.setEnabled(false);

  // ================= PARTICLES =================
  function puffTexture(name, inner, outer) {
    const t = new BABYLON.DynamicTexture(name, 64, scene, false);
    const ctx = t.getContext();
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner); g.addColorStop(0.45, outer); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    t.update(); return t;
  }
  const dust = new BABYLON.ParticleSystem("dust", 180, scene);
  dust.particleTexture = puffTexture("dustTex", "rgba(255,250,240,1)", "rgba(255,244,224,.5)");
  dust.emitter = new V3(0, 3, 0);
  dust.minEmitBox = new V3(-7, -3, -6); dust.maxEmitBox = new V3(7, 4, 14);
  dust.direction1 = new V3(-0.05, 0.02, -0.05); dust.direction2 = new V3(0.05, 0.12, 0.05);
  dust.minLifeTime = 3; dust.maxLifeTime = 6;
  dust.minSize = 0.02; dust.maxSize = 0.06;
  dust.emitRate = 16;
  dust.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
  dust.color1 = new C4(1, 0.93, 0.8, 0.055);
  dust.color2 = new C4(0.8, 0.9, 1, 0.04);
  dust.colorDead = new C4(1, 1, 1, 0);
  dust.gravity = V3.Zero();
  dust.start();

  // декоративный пар реакторного зала; создаётся остановленным, включается в setTheme
  const steam = new BABYLON.ParticleSystem("steam", 140, scene);
  steam.particleTexture = puffTexture("steamTex", "rgba(255,240,225,1)", "rgba(255,220,190,.4)");
  steam.emitter = new V3(0, 0, 0);
  steam.minEmitBox = new V3(-9, -2, -8); steam.maxEmitBox = new V3(9, 3, 10);
  steam.direction1 = new V3(-0.02, 0.25, -0.02); steam.direction2 = new V3(0.02, 0.6, 0.02);
  steam.minLifeTime = 1.6; steam.maxLifeTime = 3.2;
  steam.minSize = 0.25; steam.maxSize = 0.7;
  steam.emitRate = 14;
  steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
  steam.color1 = new C4(1, 0.85, 0.7, 0.05);
  steam.color2 = new C4(1, 0.7, 0.5, 0.035);
  steam.colorDead = new C4(1, 1, 1, 0);
  steam.gravity = V3.Zero();

  const burst = new BABYLON.ParticleSystem("burst", 500, scene);
  burst.particleTexture = puffTexture("burstTex", "rgba(255,255,255,1)", "rgba(255,255,255,.6)");
  burst.emitter = new V3(0, 0, 0);
  burst.minEmitBox = burst.maxEmitBox = V3.Zero();
  burst.minLifeTime = 0.2; burst.maxLifeTime = 0.55;
  burst.minSize = 0.05; burst.maxSize = 0.14;
  burst.minEmitPower = 2; burst.maxEmitPower = 6;
  burst.direction1 = new V3(-1, 0.2, -1); burst.direction2 = new V3(1, 1.6, 1);
  burst.gravity = new V3(0, -12, 0);
  burst.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
  burst.colorDead = new C4(0, 0, 0, 0);
  burst.manualEmitCount = 0;
  burst.start();
  function fireBurst(pos, n, c1, c2, power, life, size, grav) {
    burst.emitter.copyFrom(pos);
    burst.color1 = c1; burst.color2 = c2;
    burst.minEmitPower = power * 0.5; burst.maxEmitPower = power;
    burst.minLifeTime = life * 0.6; burst.maxLifeTime = life;
    burst.minSize = size * 0.5; burst.maxSize = size;
    burst.gravity.y = grav;
    burst.manualEmitCount = n;
  }
  const FX = {
    pickup: p => fireBurst(p, 16, new C4(0.5, 0.9, 1, 1), new C4(0.9, 1, 1, 1), 4, 0.4, 0.1, -3),
    land: p => fireBurst(p, 12, new C4(0.75, 0.7, 0.6, 0.7), new C4(1, 0.85, 0.6, 0.5), 2.4, 0.42, 0.12, -2),
    thruster: p => fireBurst(p, 14, new C4(0.45, 0.85, 1, 1), new C4(0.85, 1, 1, 0.9), 3.4, 0.32, 0.09, -1),
    crash: p => fireBurst(p, 150, new C4(1, 0.72, 0.3, 1), new C4(1, 0.32, 0.22, 1), 10, 0.8, 0.2, -14),
    armor: p => fireBurst(p, 40, new C4(0.5, 0.9, 1, 1), new C4(1, 0.85, 0.5, 1), 6, 0.5, 0.14, -6),
    boost: (p, color) => fireBurst(p, 36, C4.FromHexString(color + "ff"), C4.FromHexString(color + "99"), 6, 0.5, 0.14, -5),
    record: p => fireBurst(p, 90, new C4(0.5, 0.9, 1, 1), new C4(1, 0.8, 0.4, 1), 8, 0.9, 0.16, -8)
  };

  // ================= POST =================
  const pipeline = new BABYLON.DefaultRenderingPipeline("pipeline", true, scene, [camera]);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.72;
  pipeline.bloomWeight = 0.42;
  pipeline.bloomKernel = 64;
  pipeline.fxaaEnabled = true;
  pipeline.samples = COARSE ? 1 : 4;
  pipeline.imageProcessing.contrast = 1.14;
  pipeline.imageProcessing.exposure = 1.06;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.vignetteEnabled = true;
  pipeline.vignetteWeight = 0.3;
  pipeline.vignetteColor = new C4(0.02, 0.03, 0.07, 0);

  function applySize() {
    const dpr = window.devicePixelRatio || 1;
    engine.setHardwareScalingLevel(1 / Math.min(dpr, COARSE ? 1.5 : 2));
    engine.resize();
  }
  applySize();
  window.addEventListener("resize", applySize);
  window.addEventListener("orientationchange", () => setTimeout(applySize, 120));

  // ================= AUDIO (WebAudio synth) =================
  const Sfx = {
    ctx: null, master: null, humGain: null, noiseBuf: null,
    muted: LS.get("u07r_muted", "0") === "1",
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.startHum();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    },
    startHum() {
      const c = this.ctx;
      this.humGain = c.createGain(); this.humGain.gain.value = 0.5;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220; lp.Q.value = 0.6;
      const o1 = c.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 48;
      const g1 = c.createGain(); g1.gain.value = 0.035;
      const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = 96;
      const g2 = c.createGain(); g2.gain.value = 0.022;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
      const lfoG = c.createGain(); lfoG.gain.value = 70;
      lfo.connect(lfoG); lfoG.connect(lp.frequency);
      o1.connect(g1); g1.connect(lp); o2.connect(g2); g2.connect(lp);
      lp.connect(this.humGain); this.humGain.connect(this.master);
      o1.start(); o2.start(); lfo.start();
    },
    tone(f0, f1, dur, type, vol, delay) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, f0, f1, q, vol) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + dur + 0.05);
    },
    jump() { this.tone(260, 540, 0.16, "sine", 0.22); },
    whoosh() { this.noise(0.16, 800, 2400, 1.1, 0.15); },
    slide() { this.noise(0.32, 460, 170, 0.8, 0.14); },
    land() { this.noise(0.07, 300, 120, 0.7, 0.16); this.tone(130, 55, 0.09, "sine", 0.15); },
    pickup(n) {
      const f = 620 * Math.pow(2, Math.min(n, 14) / 12);
      this.tone(f, f * 1.34, 0.1, "triangle", 0.2);
      this.tone(f * 2, f * 2.7, 0.08, "sine", 0.07, 0.02);
    },
    crash() { this.noise(0.5, 800, 90, 0.6, 0.5); this.tone(190, 32, 0.5, "sawtooth", 0.26); this.tone(95, 28, 0.6, "sine", 0.3); },
    ui() { this.tone(760, 760, 0.05, "square", 0.055); },
    milestone() { this.tone(520, 520, 0.09, "triangle", 0.14); this.tone(780, 780, 0.12, "triangle", 0.14, 0.09); },
    boost() { this.tone(523, 784, 0.12, "triangle", 0.16); this.tone(659, 988, 0.12, "triangle", 0.14, 0.06); this.tone(784, 1175, 0.14, "triangle", 0.12, 0.12); },
    start() { [330, 440, 660].forEach((f, i) => this.tone(f, f, 0.1, "triangle", 0.16, i * 0.07)); },
    record() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.15, "triangle", 0.18, i * 0.1)); },
    duck(v) { if (this.humGain && this.ctx) this.humGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15); },
    setMuted(m) {
      this.muted = m; LS.set("u07r_muted", m ? "1" : "0");
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
      $("soundBtn").classList.toggle("muted", m);
      $("soundBtn").title = m ? "Звук выключен — включить" : "Звук включён — выключить";
    }
  };
  $("soundBtn").classList.toggle("muted", Sfx.muted);

  // ================= GAME STATE =================
  const DIFFS = {
    easy: { base: 11, max: 21, react: 1.34, tierScale: 1.45 },
    normal: { base: 13.5, max: 27, react: 1.12, tierScale: 1 },
    hard: { base: 16, max: 32, react: 0.94, tierScale: 0.7 }
  };
  let diff = LS.get("u07r_diff", "normal");
  if (!DIFFS[diff]) diff = "normal";
  let best = parseInt(LS.get("u07r_best", "0"), 10) || 0;
  let bestDist = parseInt(LS.get("u07r_bestDist", "0"), 10) || 0;

  const GS = window.GameState;
  let state = GS.create();
  let savedState = null;
  const storage = {
    get: k => LS.get(k, null),
    set: (k, v) => LS.set(k, v),
    del: k => { try { localStorage.removeItem(k); } catch (e) { /* приватный режим */ } }
  };
  let armorLeft = 0;
  let theme = "corridor";
  let endlessSection = LS.get("u07r_endlessSection", "corridor");
  if (!GS.SECTIONS.some(s => s.id === endlessSection)) endlessSection = "corridor";

  let mode = "menu"; // menu | running | paused | crash | over | shop | airlock | victory
  let t = 0, menuT = 0.6, runT = 0, overT = 0, crashT = 0;
  let pz = 0, px = 0, dist = 0, speed = 0, phase = 0;
  let lane = 1, laneFromX = 0, laneT = 1;
  let feetY = 0, vy = 0, airborne = false, sliding = false, slideT = 0, queuedSlide = false;
  let roof = Platforms.createState(); // {on, fellFrom} — снапшоты {lane, z}
  let shake = 0, camBlend = 1, nextZ = 48, nextMilestone = 250, streak = 0, streakT = 0;
  let boostPlan = [], boostActive = Boosts.createActive(), boostSegment = 0, airJumpUsed = false, spawnGen = 0;
  let boostOrder = [], auraFade = 0, auraColorId = null; // порядок подборов и огибающая ауры
  let crashSpin = { x: 0, y: 0, z: 0 };
  const crashRot = { x: 0, y: 0, z: 0 };

  // в сюжете скорость и тиры считаются от дистанции внутри забега;
  // кривые сюжета растянуты втрое (забег = 3000 м), бесконечный режим
  // сохраняет прежнюю кривую — его рекорды должны оставаться сравнимыми
  const localD = d => state.gameMode === "story" ? Math.max(0, d - GS.runStartZ(state)) : d;
  const curveK = () => state.gameMode === "story" ? 3 : 1;
  const speedFor = d => { const D = DIFFS[diff]; return D.base + (D.max - D.base) * (1 - Math.exp(-localD(d) / (520 * curveK()))); };
  const tierFor = d => { const ts = DIFFS[diff].tierScale; const ld = localD(d); const k = curveK(); return ld < 120 * k * ts ? 0 : ld < 320 * k * ts ? 1 : ld < 650 * k * ts ? 2 : 3; };

  // ================= SPAWNER =================
  const twoLanes = () => { const a = ri(3); let b = ri(3); while (b === a) b = ri(3); return [a, b]; };
  const freeLane = ls => [0, 1, 2].find(l => !ls.includes(l));

  const PATTERNS = [
    { min: 0, w: 10, fn: d => { // single obstacle + cells in a free lane
      const type = rnd(["hurdle", "beam", "block"]), ln = ri(3);
      spawnObstacle(type, ln, d);
      if (Math.random() < 0.7) cellLine(freeLane([ln]), d - 4, 5, type === "beam" ? 1.6 : 1.6);
      return 2;
    } },
    { min: 1, w: 8, fn: d => { // two blocks, one free lane with cells
      const ls = twoLanes();
      ls.forEach(l => spawnObstacle("block", l, d));
      cellLine(freeLane(ls), d - 3, 5, 1.6);
      return 2;
    } },
    { min: 1, w: 8, fn: d => { // hurdle row (jump), arc of cells over one lane
      const full = tierFor(d) >= 2 && Math.random() < 0.5;
      const ls = full ? [0, 1, 2] : twoLanes();
      ls.forEach(l => spawnObstacle("hurdle", l, d));
      cellArc(rnd(ls), d);
      return 2;
    } },
    { min: 1, w: 7, fn: d => { // beam row (slide), low cells through one lane
      const full = tierFor(d) >= 2 && Math.random() < 0.5;
      const ls = full ? [0, 1, 2] : twoLanes();
      ls.forEach(l => spawnObstacle("beam", l, d));
      cellLine(rnd(ls), d - 3.5, 5, 0.95);
      return 2;
    } },
    { min: 1, w: 8, fn: d => { // mix: block + hurdle (+ beam on high tiers)
      const ls = [0, 1, 2].sort(() => Math.random() - 0.5);
      spawnObstacle("block", ls[0], d);
      spawnObstacle("hurdle", ls[1], d);
      if (tierFor(d) >= 2 && Math.random() < 0.6) { spawnObstacle("beam", ls[2], d); cellArc(ls[1], d); }
      else cellLine(ls[2], d - 3, 4, 1.6);
      return 2;
    } },
    { min: 2, w: 7, fn: d => { // gauntlet: hurdle then beam in the same lane
      const ln = ri(3), g = Math.max(13, speedFor(d) * 0.88);
      spawnObstacle("hurdle", ln, d);
      spawnObstacle("beam", ln, d + g);
      if (Math.random() < 0.6) spawnObstacle("block", freeLane([ln]), d);
      cellArc(ln, d);
      cellLine(ln, d + g - 3, 4, 0.95);
      return g + 2;
    } },
    { min: 2, w: 6, fn: d => { // slalom of blocks, cells down the middle
      const g = Math.max(14, speedFor(d) * 0.92), a = ri(2) === 0 ? 0 : 2;
      spawnObstacle("block", a, d);
      spawnObstacle("block", a === 0 ? 2 : 0, d + g);
      spawnObstacle("block", a, d + 2 * g);
      cellLine(1, d - 2, Math.ceil((2 * g + 4) / 2.3), 1.6);
      return 2 * g + 2;
    } }
  ];

  // реакторные паттерны с крышами (аддитивно к коридорным); beam в полосах платформ не ставится
  const REACTOR_PATTERNS = [
    { min: 1, w: 8, fn: d => { // цистерна-бонус: ячейки на крыше, внизу тоже можно бежать
      const ln = ri(3);
      spawnObstacle("platform", ln, d);
      cellLine(ln, d - 8, 8, 2.6);
      cellLine(freeLane([ln]), d - 3, 5, 1.6);
      return 26;
    } },
    { min: 2, w: 6, fn: d => { // две крыши в соседних полосах со сдвигом — по желанию перепрыгнуть
      const a = ri(2);
      const ls = [a, a + 1];
      spawnObstacle("platform", ls[0], d);
      spawnObstacle("platform", ls[1], d + 10);
      cellLine(ls[0], d - 8, 8, 2.6);
      cellLine(ls[1], d + 2, 8, 2.6);
      return 36;
    } },
    { min: 2, w: 6, fn: d => { // крыша + hurdle + block в других полосах
      const ls = [0, 1, 2].sort(() => Math.random() - 0.5);
      spawnObstacle("platform", ls[0], d);
      spawnObstacle("hurdle", ls[1], d);
      spawnObstacle("block", ls[2], d);
      cellLine(ls[0], d - 8, 8, 2.6);
      return 26;
    } },
    { min: 3, w: 7, route: true, fn: d => { // маршрутная цепочка крыш, внизу «мусор»
      const ln = ri(3);
      for (const z of [d, d + 30, d + 60]) {
        spawnObstacle("platform", ln, z);
        cellLine(ln, z - 8, 10, 2.6);
      }
      const other = freeLane([ln]);
      for (const z of [d + 15, d + 45]) {
        spawnObstacle("hurdle", ln, z);
        spawnObstacle("block", other, z);
      }
      return 86;
    } }
  ];

  function spawnAhead() {
    while (nextZ < pz + 170) {
      spawnGen++;
      const tier = tierFor(nextZ);
      const pool = theme === "reactor"
        ? PATTERNS.concat(REACTOR_PATTERNS.filter(p => p.min <= tier && (!p.route || state.gameMode === "endless" || localD(nextZ) >= 2200)))
        : PATTERNS.filter(p => p.min <= tier);
      let total = 0; for (const p of pool) total += p.w + (p.min === tier ? 4 : 0);
      let r = Math.random() * total, pick = pool[0];
      for (const p of pool) { r -= p.w + (p.min === tier ? 4 : 0); if (r <= 0) { pick = p; break; } }
      const len = pick.fn(nextZ);
      // карман буста: паттерн, попавший в [z−12, z+12], откатывается целиком;
      // front учитывает тело цистерны, выступающее на 12 м вперёд от d
      let front = nextZ - 4;
      let tail = nextZ + Math.max(len + 2, 6.5, Boosts.has(boostActive, "scatter") ? 11.5 : 0);
      for (const o of obstacles) if (o.active && o.gen === spawnGen) {
        front = Math.min(front, o.z - HALF_D[o.type]);
        tail = Math.max(tail, o.z + HALF_D[o.type]);
      }
      const pocket = boostPlan.find(p => front < p.z + Boosts.POCKET && tail > p.z - Boosts.POCKET);
      if (pocket) {
        for (const o of obstacles) if (o.active && o.gen === spawnGen) { o.active = false; for (const p of o.parts) p.inst.setEnabled(false); }
        for (const c of cellPool) if (c.active && c.gen === spawnGen) { c.active = false; c.inst.setEnabled(false); }
        nextZ = pocket.z + Boosts.POCKET + 4 + (theme === "reactor" ? Platforms.HALF_D : 0); // строго растёт: front цистерны (−12) не должен снова попасть в карман
        continue;
      }
      // Россыпь: бонусная линия в свободной полосе после уцелевшего паттерна
      if (Boosts.has(boostActive, "scatter")) {
        const busy = l => obstacles.some(o => o.active && o.lane === l && (o.type === "platform"
          ? (o.z - 12 < nextZ + 14 && o.z + 12 > nextZ - 4)
          : (o.z > nextZ - 4 && o.z < nextZ + 14)));
        const free = [0, 1, 2].find(l => !busy(l));
        // fallback: полоса без тела цистерны (линия не должна лежать внутри крыши)
        const fallback = [0, 1, 2].find(l => !obstacles.some(o => o.active && o.type === "platform" && o.lane === l && o.z - 12 < nextZ + 14 && o.z + 12 > nextZ - 4));
        cellLine(free === undefined ? (fallback === undefined ? 1 : fallback) : free, nextZ - 2, 6, 1.6);
      }
      const D = DIFFS[diff];
      const react = D.react * (1 - 0.22 * Math.min(1, nextZ / (1000 * curveK())));
      nextZ += len + speedFor(nextZ) * react + 3.5;
    }
  }

  function recycle() {
    for (const seg of segments) if (seg.z + SEG_LEN / 2 < pz - 34) placeSeg(seg, seg.z + SEG_SPAN);
    for (const o of obstacles) if (o.active && o.z < pz - 28) {
      o.active = false; for (const p of o.parts) p.inst.setEnabled(false);
    }
    for (const c of cellPool) if (c.active && c.z < pz - 12) { c.active = false; c.inst.setEnabled(false); }
    for (const e of boostEntities) if (e.active && e.z < pz - 28) { e.active = false; e.gem.setEnabled(false); e.beam.setEnabled(false); }
  }

  function planRunBoosts(startZ) {
    boostPlan = Boosts.planSegment({
      rng: Math.random, startZ,
      exclude: state.gameMode === "story" && state.upgrades.magnet >= 3 ? ["magnet3"] : []
    });
    boostSegment = Math.floor(startZ / GS.RUN_LEN);
    placeBoostEntities();
  }
  function placeBoostEntities() {
    for (let i = 0; i < 3; i++) {
      const e = boostEntities[i], p = boostPlan[i];
      e.id = p.id; e.z = p.z; e.lane = p.lane; e.active = true; e.collected = false;
      e.gem.material = boostMats[p.id]; e.beam.material = boostBeamMats[p.id];
      e.gem.position.set(LANE_X[p.lane], 1.4, p.z);
      e.beam.position.set(LANE_X[p.lane], 3.2, p.z);
      e.gem.setEnabled(true); e.beam.setEnabled(true);
    }
  }

  // ================= POSE / ANIMATION =================
  const pose = { y: 0, rx: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shL: 0, shR: 0, elL: 0, elR: 0, headRX: 0 };
  const target = Object.assign({}, pose);

  function setPoseTarget() {
    if (mode === "crash" || mode === "over") {
      Object.assign(target, { y: 0, rx: 0, hipL: -1.2, hipR: 0.8, kneeL: 1.2, kneeR: 0.5, shL: -2.7, shR: 2.4, elL: 0.4, elR: 0.3, headRX: 0.2 });
    } else if (sliding) {
      Object.assign(target, { y: -1.15, rx: -0.55, hipL: -1.3, hipR: -1.15, kneeL: 0.4, kneeR: 0.5, shL: 0.75, shR: 0.9, elL: 0.3, elR: 0.3, headRX: 0.35 });
    } else if (airborne) {
      Object.assign(target, { y: 0, rx: 0.06, hipL: -0.9, hipR: -0.7, kneeL: 1.5, kneeR: 1.2, shL: -2.3, shR: -2.0, elL: 0.5, elR: 0.4, headRX: -0.05 });
    } else if (mode === "running") {
      const sn = clamp(speed / DIFFS[diff].max, 0, 1);
      Object.assign(target, { y: 0, rx: 0.1 + sn * 0.07, hipL: 0, hipR: 0, kneeL: 0.06, kneeR: 0.06, shL: 0, shR: 0, elL: 0.55, elR: 0.55, headRX: -0.06 });
    } else {
      Object.assign(target, { y: 0, rx: 0, hipL: 0, hipR: 0, kneeL: 0.04, kneeR: 0.04, shL: 0, shR: 0, elL: 0.12, elR: 0.12, headRX: 0 });
    }
  }

  function animateRobot(dt) {
    setPoseTarget();
    const k = 1 - Math.exp(-14 * dt);
    for (const key2 in pose) pose[key2] = lerp(pose[key2], target[key2], k);

    const groundedRun = mode === "running" && !airborne && !sliding;
    if (groundedRun) phase += dt * (6 + speed * 0.55);
    const swing = groundedRun ? Math.sin(phase) : 0;
    const bob = groundedRun ? Math.abs(Math.cos(phase)) * 0.09 : 0;
    const idle = mode === "menu";
    const idleBob = idle ? Math.sin(menuT * 1.7) * 0.05 : 0;

    let rx = pose.rx, ry = 0, rz = 0;
    if (mode === "crash" || mode === "over") { rx = crashRot.x; ry = crashRot.y; rz = crashRot.z; }
    else {
      rz = clamp((LANE_X[lane] - px) * -0.055, -0.16, 0.16) + (groundedRun ? Math.sin(phase) * 0.03 : 0);
      ry = clamp((LANE_X[lane] - px) * 0.04, -0.12, 0.12);
    }
    rig.root.position.set(px, feetY + pose.y + (bob + idleBob) * S, pz);
    rig.root.rotation.set(rx, ry, rz);

    const flexL = groundedRun ? Math.max(0, -Math.cos(phase)) * 1.35 : 0;
    const flexR = groundedRun ? Math.max(0, Math.cos(phase)) * 1.35 : 0;
    hips.L.rotation.x = pose.hipL - swing * 1.05;
    hips.R.rotation.x = pose.hipR + swing * 1.05;
    knees.L.rotation.x = pose.kneeL + flexL;
    knees.R.rotation.x = pose.kneeR + flexR;
    const armIdle = idle ? Math.sin(menuT * 1.7) * 0.05 : 0;
    rig.arms.L.shoulder.rotation.x = pose.shL + swing * 0.95 + armIdle;
    rig.arms.R.shoulder.rotation.x = pose.shR - swing * 0.95 - armIdle;
    rig.arms.L.elbow.rotation.x = pose.elL + rig.arms.L.restX + (groundedRun ? Math.max(0, -swing) * 0.3 : 0);
    rig.arms.R.elbow.rotation.x = pose.elR + rig.arms.R.restX + (groundedRun ? Math.max(0, swing) * 0.3 : 0);
    rig.head.rotation.x = pose.headRX;
    rig.head.rotation.y = idle ? Math.sin(menuT * 0.6) * 0.09 : clamp((LANE_X[lane] - px) * 0.06, -0.2, 0.2);
    rig.antenna.rotation.z = Math.sin(t * 2.3) * 0.08 + swing * 0.06;
    rig.antenna.rotation.x = Math.cos(t * 1.9) * 0.06 - (groundedRun ? 0.12 : 0);

    // blob shadow
    const supportY = roof.on ? Platforms.TOP : 0;
    const airH = feetY - supportY;
    blob.position.set(px, supportY + 0.015, pz);
    const bs = 1 + airH * 0.14;
    blob.scaling.set(bs * (sliding ? 1.25 : 1), bs, bs * (sliding ? 1.4 : 1));
    blobMat.alpha = clamp(0.38 - airH * 0.09, 0.08, 0.38);

    // eyes
    if (mode === "crash" || mode === "over") {
      if (eyesMode !== "x") { eyesMode = "x"; drawEyes(1, "x"); }
    } else {
      if (eyesMode !== "normal") { eyesMode = "normal"; drawEyes(1, "normal"); eyesOpen = 1; }
      const wantOpen = sliding ? 0.45 : 1;
      let open = wantOpen;
      if (blinkT >= 0) {
        blinkT += dt;
        open = wantOpen * (1 - Math.sin(Math.PI * Math.min(1, blinkT / 0.22)));
        if (blinkT > 0.22) { blinkT = -1; nextBlink = t + 2.5 + Math.random() * 3; }
      } else if (t > nextBlink && !sliding) blinkT = 0;
      if (Math.abs(open - eyesOpen) > 0.03) { drawEyes(open, "normal"); eyesOpen = open; }
    }
  }

  // ================= ACTIONS =================
  function setLane(dir) {
    if (mode !== "running") return;
    const nl = clamp(lane + dir, 0, 2);
    if (nl === lane) return;
    lane = nl; laneFromX = px; laneT = 0;
    Sfx.whoosh();
  }
  function jump() {
    if (mode !== "running") return;
    if (airborne) {
      if (Boosts.canAirJump(boostActive, airJumpUsed)) {
        airJumpUsed = true; vy = 10.5 * GS.effect(state, "springs");
        Sfx.jump();
        FX.thruster(new V3(px, feetY + 1.7 * S, pz - 0.55));
      }
      return;
    }
    if (sliding) { sliding = false; slideT = 0; }
    if (roof.on) Platforms.depart(roof); // сход с крыши вверх — тоже сход (защита от бока своей платформы)
    airborne = true; vy = 10.5 * GS.effect(state, "springs"); airJumpUsed = false;
    Sfx.jump();
    FX.thruster(new V3(px, feetY + 1.7 * S, pz - 0.55));
  }
  const slideDur = () => GS.effect(state, "stabilizers");
  function slide() {
    if (mode !== "running") return;
    if (airborne) { vy = Math.min(vy, -24); queuedSlide = true; return; }
    if (sliding) { slideT = slideDur(); return; }
    sliding = true; slideT = slideDur();
    Sfx.slide();
  }
  function hitObstacle(o) {
    if (Boosts.invincible(boostActive)) return; // Форсаж: удар пропускается, броня не тратится
    if (armorLeft > 0) {
      armorLeft--;
      renderUpgradeHud();
      if (o) { o.active = false; for (const p of o.parts) p.inst.setEnabled(false); }
      shake = Math.max(shake, 0.35);
      FX.armor(new V3(px, feetY + 1.4, pz));
      Sfx.land();
      toast("БРОНЯ ПОГЛОЩАЕТ УДАР", "cyan", 1100);
      return;
    }
    doCrash();
  }
  function doCrash() {
    if (mode !== "running") return;
    mode = "crash"; crashT = 0;
    vy = 6.5; airborne = true;
    crashSpin = { x: -(6 + Math.random() * 4), y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 9 };
    shake = 0.65;
    Sfx.crash(); Sfx.duck(0.12);
    FX.crash(new V3(px, feetY + 1.4, pz));
    $("vignette").classList.add("hit");
    setTimeout(() => $("vignette").classList.remove("hit"), 420);
    $("pauseBtn").disabled = true;
  }

  function resetRun(z = 0) {
    for (const o of obstacles) { o.active = false; for (const p of o.parts) p.inst.setEnabled(false); }
    for (const c of cellPool) { c.active = false; c.inst.setEnabled(false); }
    segments.forEach((seg, i) => placeSeg(seg, z + (i - 1) * SEG_LEN));
    pz = z; px = 0; dist = z; speed = 0; runT = 0; phase = 0;
    lane = 1; laneFromX = 0; laneT = 1;
    feetY = 0; vy = 0; airborne = false; sliding = false; slideT = 0; queuedSlide = false;
    Platforms.clear(roof);
    shake = 0; nextZ = z + 48; nextMilestone = z + 250; streak = 0; streakT = 0;
    crashRot.x = crashRot.y = crashRot.z = 0;
    for (const k2 in pose) pose[k2] = 0;
    eyesMode = "normal"; eyesOpen = 1; drawEyes(1, "normal");
    $("distVal").textContent = String(Math.floor(z)); $("cellVal").textContent = String(state.wallet);
    boostActive = Boosts.createActive(); boostOrder.length = 0; auraFade = 0; airJumpUsed = false; planRunBoosts(z);
    renderBoostHud();
    spawnAhead();
  }

  let hintTimer = 0;
  function showHint() {
    const h = $("hint");
    h.innerHTML = COARSE
      ? "Свайпы: <b>← →</b> полоса · <b>↑</b> прыжок · <b>↓</b> подкат"
      : "<b>A/D</b> — полосы · <b>W</b> — прыжок · <b>S</b> — подкат · <b>P</b> — пауза";
    h.classList.remove("fade");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => h.classList.add("fade"), 6500);
  }
  let toastTimer = 0;
  function toast(msg, cls, dur, color) {
    const el = $("toast");
    el.textContent = msg;
    el.className = cls || "";
    if (color) {
      el.style.color = color;
      el.style.borderColor = color + "66";
      el.style.textShadow = "0 0 24px " + color + "88, 0 2px 10px rgba(0,0,0,.7)";
    } else {
      el.style.color = ""; el.style.borderColor = ""; el.style.textShadow = "";
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, dur || 1600);
  }
  function syncOverlays() {
    $("menu").hidden = mode !== "menu";
    $("pauseOv").hidden = mode !== "paused";
    $("overOv").hidden = mode !== "over";
    $("shopOv").hidden = mode !== "shop";
    $("airlockOv").hidden = mode !== "airlock";
    $("victoryOv").hidden = mode !== "victory";
    $("pauseOv").classList.add("center");
    $("overOv").classList.add("center");
    $("hud").classList.toggle("on", mode !== "menu");
    $("pauseBtn").disabled = mode !== "running";
  }

  // Иконки улучшений: инлайн-SVG 24×24, штрих 1.8, currentColor —
  // общий язык с иконками HUD (ячейка, звук, пауза). Одни и те же
  // иконки в карточках сервисного отсека и в панели улучшений на HUD.
  const UPGRADE_ICONS = {
    springs: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10M7 20h10"/><path d="M12 4v2l4 1.6-8 2.2 8 2.2-8 2.2 8 2.2-4 1.6v2"/></svg>',
    stabilizers: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><ellipse cx="12" cy="12" rx="8.6" ry="3.3" transform="rotate(-18 12 12)"/><path d="M12 3.4v17.2"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/></svg>',
    magnet: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.8 5v7.3a5.2 5.2 0 0 0 10.4 0V5"/><path d="M10.2 5v7.3a1.8 1.8 0 0 0 3.6 0V5"/><path d="M6.8 8.6h3.4M13.8 8.6h3.4"/><path d="M8.4 3.2c2-1.7 5.2-1.7 7.2 0"/></svg>',
    armor: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3.5h11.5V16l-5 5H3.5V8.5Z"/><path d="M12 8.6l3 1.7v3.4l-3 1.7-3-1.7v-3.4Z"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="6.6" cy="17.4" r="1.1" fill="currentColor" stroke="none"/></svg>'
  };
  // Иконки бустов: тот же язык, что UPGRADE_ICONS (24×24, штрих 1.8, currentColor).
  const BOOST_ICONS = {
    overdrive: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2.5 5.5 13h5L9 21.5 18.5 11h-5L13 2.5Z"/></svg>',
    magnet3: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.8 5v7.3a5.2 5.2 0 0 0 10.4 0V5"/><path d="M10.2 5v7.3a1.8 1.8 0 0 0 3.6 0V5"/><path d="M6.8 8.6h3.4M13.8 8.6h3.4"/><path d="M8.4 3.2c2-1.7 5.2-1.7 7.2 0"/></svg>',
    double: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5 12.5 6v6L8 14.5 3.5 12V6Z"/><path d="M16 9.5 20.5 12v6L16 20.5 11.5 18v-6Z"/><circle cx="8" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1.3" fill="currentColor" stroke="none"/></svg>',
    chrono: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8.2"/><path d="M12 8.4V13l3.2 2"/><path d="M10 2.6h4"/></svg>',
    scatter: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none"><circle cx="6" cy="7" r="1.5"/><circle cx="12.5" cy="4.8" r="1.5"/><circle cx="18.5" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/><circle cx="15.5" cy="13.5" r="1.5"/><circle cx="11" cy="19" r="1.5"/><circle cx="19" cy="18.5" r="1.5"/></svg>',
    airjump: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12.5 12 7l6 5.5"/><path d="M6 18.5 12 13l6 5.5"/></svg>'
  };
  const UPGRADE_DESC = {
    springs: "Выше прыжок.",
    stabilizers: "Длиннее подкат.",
    magnet: "Шире захват: соседние полосы → все полосы → сбор на любой высоте прыжка.",
    armor: "Поглощает столкновения — по числу уровней за забег."
  };
  const SHOP_FLAVOR = [
    "Даже убегая, он делает свою работу.",
    "Он знает каждый винт на этой станции.",
    "Детали станции подходят к корпусу UNIT-07."
  ];

  function setTheme(id) {
    theme = id;
    const next = segmentsByTheme[id] || segmentsByTheme.corridor;
    if (segments !== next) {
      for (const seg of segments) seg.node.setEnabled(false);
      segments = next;
    }
    // инстансы препятствий принадлежат теме: при смене уничтожаем пул,
    // spawnObstacle пересоздаст их из заготовок новой темы
    for (const o of obstacles) for (const p of o.parts) p.inst.dispose();
    obstacles.length = 0;
    segments.forEach((seg, i) => { seg.node.setEnabled(true); placeSeg(seg, pz + (i - 1) * SEG_LEN); });
    if (id === "reactor") {
      key.diffuse = C3.FromHexString("#ff9a60");
      hemi.intensity = 0.2;
      scene.fogColor = C3.FromHexString("#170d0d");
      scene.clearColor = C4.FromHexString("#0d0708ff");
      steam.start();
    } else {
      key.diffuse = C3.FromHexString("#ffd9b0");
      hemi.intensity = 0.26;
      scene.fogColor = C3.FromHexString("#0a0e17");
      scene.clearColor = C4.FromHexString("#070910ff");
      steam.stop();
    }
  }

  function beginRun() {
    Sfx.ensure(); Sfx.duck(0.5);
    resetRun(GS.runStartZ(state));
    armorLeft = GS.effect(state, "armor");
    renderUpgradeHud();
    mode = "running"; camBlend = 1;
    syncOverlays(); showHint();
    GS.writeSave(storage, state);
    Sfx.start();
    if (state.gameMode === "story") {
      toast("СЕКЦИЯ " + (state.section + 1) + ": " + GS.SECTIONS[state.section].name.toUpperCase(), "cyan", 1800);
    } else {
      toast("БЕГ!", "", 900);
    }
    $("bestVal").textContent = String(state.gameMode === "story" ? GS.storyRecord(storage).score : GS.endlessRecord(storage, state.endlessSection).score);
  }

  function startStory() { GS.newStory(state); setTheme("corridor"); beginRun(); camBlend = 0; }
  function continueStory() {
    const s = GS.loadSave(storage);
    if (!s) { startStory(); return; }
    state = s;
    setTheme(GS.SECTIONS[state.section].id);
    resetRun(GS.runStartZ(state));
    armorLeft = GS.effect(state, "armor");
    renderUpgradeHud();
    if (state.phase === "shop") {
      mode = "shop";
      $("shopFlavor").textContent = rnd(SHOP_FLAVOR);
      renderShop();
      syncOverlays();
      shadows.getShadowMap().refreshRate = 0;
    } else if (state.phase === "airlock") {
      mode = "airlock";
      $("airlockTitle").textContent = GS.SECTIONS[state.section + 1].name;
      syncOverlays();
      shadows.getShadowMap().refreshRate = 0;
    } else {
      beginRun(); camBlend = 0;
    }
  }
  function startEndless(sectionId) { GS.newEndless(state, sectionId); setTheme(sectionId); beginRun(); camBlend = 0; }
  function start() { if (GS.loadSave(storage)) continueStory(); else startStory(); }
  function retryRun() { beginRun(); toast("ПОВТОР ЗАБЕГА · 3 БУСТА НА ТРАССЕ", "", 1600); }
  function restart() { if (state.gameMode === "story") retryRun(); else startEndless(state.endlessSection); }

  function renderShop(boughtId) {
    $("shopWallet").textContent = String(state.wallet);
    const wrap = $("shopCards");
    wrap.innerHTML = "";
    for (const id in GS.UPGRADES) {
      const u = GS.UPGRADES[id], lvl = state.upgrades[id], p = GS.price(state, id);
      const armor = id === "armor";
      const card = document.createElement("div");
      card.className = "shop-card" + (armor ? " armor" : "") + (id === boughtId ? " bought" : "");
      const head = document.createElement("div"); head.className = "shop-head";
      const ico = document.createElement("span"); ico.className = "shop-ico";
      ico.innerHTML = UPGRADE_ICONS[id];
      const h = document.createElement("h3"); h.textContent = u.name;
      // бронепластина: везде неиспользованный остаток вместо уровня
      const lvlEl = document.createElement("span");
      if (armor) {
        lvlEl.className = "shop-lvl stock" + (lvl > 0 && armorLeft === 0 ? " zero" : "");
        lvlEl.textContent = "Остаток " + armorLeft;
      } else {
        lvlEl.className = "shop-lvl" + (lvl >= u.max ? " max" : lvl > 0 ? " has" : "");
        lvlEl.textContent = "Ур. " + lvl + "/" + u.max;
      }
      head.append(ico, h);
      const desc = document.createElement("p"); desc.textContent = UPGRADE_DESC[id];
      const pips = document.createElement("div"); pips.className = "shop-pips";
      const filled = armor ? armorLeft : lvl;
      for (let i = 0; i < u.max; i++) {
        const pip = document.createElement("span");
        pip.className = "pip" + (i < filled ? " on" : "");
        pips.appendChild(pip);
      }
      pips.appendChild(lvlEl);
      const btn = document.createElement("button");
      btn.className = "shop-buy"; btn.dataset.upgrade = id;
      btn.textContent = p === null ? "Максимум" : "Купить · " + p;
      btn.disabled = p === null || state.wallet < p;
      btn.addEventListener("click", () => {
        if (GS.buy(state, id)) {
          if (id === "armor") armorLeft = GS.effect(state, "armor");
          Sfx.ui();
          renderShop(id);
          renderUpgradeHud();
          $("cellVal").textContent = String(state.wallet);
        }
      });
      card.append(head, desc, pips, btn);
      wrap.appendChild(card);
    }
  }

  function openShop() {
    GS.submitStory(storage, state, dist);
    GS.writeSave(storage, state);
    boostActive = Boosts.createActive(); boostOrder.length = 0; auraFade = 0; renderBoostHud();
    mode = "shop";
    $("shopFlavor").textContent = rnd(SHOP_FLAVOR);
    renderShop();
    syncOverlays();
    Sfx.ui();
    shadows.getShadowMap().refreshRate = 0;
  }
  function closeShop() {
    if (mode !== "shop") return;
    GS.closeShop(state);
    GS.writeSave(storage, state);
    if (state.phase === "running") beginRun();
    else if (state.phase === "airlock") {
      mode = "airlock";
      $("airlockTitle").textContent = GS.SECTIONS[state.section + 1].name;
      syncOverlays(); Sfx.ui();
    } else if (state.phase === "victory") doVictory();
  }
  function passAirlock() {
    if (mode !== "airlock") return;
    GS.passAirlock(state);
    setTheme(GS.SECTIONS[state.section].id);
    beginRun();
  }
  function doVictory() {
    GS.submitStory(storage, state, dist);
    GS.clearSave(storage);
    boostActive = Boosts.createActive(); boostOrder.length = 0; auraFade = 0; renderBoostHud();
    $("victoryScore").textContent = String(GS.score(state, dist));
    $("victoryCells").textContent = String(state.collected);
    mode = "victory";
    syncOverlays();
    Sfx.record();
    FX.record(new V3(px, feetY + 1.6, pz));
    shadows.getShadowMap().refreshRate = 0;
  }

  function pause() {
    if (mode !== "running") return;
    mode = "paused"; Sfx.duck(0.1); Sfx.ui();
    shadows.getShadowMap().refreshRate = 0;
    syncOverlays();
  }
  function resume() {
    if (mode !== "paused") return;
    mode = "running"; Sfx.duck(0.5); Sfx.ui();
    shadows.getShadowMap().refreshRate = 1;
    syncOverlays();
  }
  function refreshMenu() {
    savedState = GS.loadSave(storage);
    $("continueBtn").hidden = !savedState;
    // без сохранения «Новая игра» — главная кнопка; с сохранением — вторичная
    $("startBtn").classList.toggle("btn-primary", !savedState);
    $("startBtn").classList.toggle("btn-ghost", !!savedState);
    $("continueBtn").closest(".btn-col").classList.toggle("has-save", !!savedState);
    if (savedState) {
      $("continueInfo").textContent = "Секция " + (savedState.section + 1) + " · ячейки: " + savedState.wallet;
    }
    const sr = GS.storyRecord(storage);
    best = sr.score; bestDist = sr.dist;
    $("menuBest").textContent = String(best);
    $("menuBestDist").textContent = String(bestDist);
    $("bestVal").textContent = String(best);
    $("menuEndlessBest").textContent = String(GS.endlessRecord(storage, endlessSection).score);
  }
  function toMenu() {
    if (state.gameMode === "story") GS.writeSave(storage, state);
    mode = "menu"; Sfx.duck(0.35);
    clearTimeout(toastTimer); $("toast").hidden = true;
    GS.newStory(state);
    setTheme("corridor");
    resetRun(0);
    speed = 0;
    refreshMenu();
    shadows.getShadowMap().refreshRate = 1;
    syncOverlays();
  }
  function finishOver() {
    mode = "over"; overT = 0;
    boostActive = Boosts.createActive(); boostOrder.length = 0; auraFade = 0; renderBoostHud();
    const score = GS.score(state, dist);
    const secName = GS.SECTIONS.find(s => s.id === state.endlessSection).name;
    const rec = GS.submitEndless(storage, state.endlessSection, state, dist);
    const secRec = GS.endlessRecord(storage, state.endlessSection);
    $("overSection").hidden = false;
    $("overSection").textContent = "Бесконечный режим · " + secName;
    $("overDist").textContent = Math.floor(dist) + " м";
    $("overCells").textContent = String(state.collected);
    $("overScore").textContent = String(score);
    $("overBest").textContent = String(secRec.score);
    $("recordBadge").hidden = !rec.isRecord;
    $("bestVal").textContent = String(secRec.score);
    if (rec.isRecord) {
      Sfx.record();
      FX.record(new V3(px, feetY + 1.6, pz));
      toast("НОВЫЙ РЕКОРД!", "cyan", 2200);
    }
    shadows.getShadowMap().refreshRate = 0;
    syncOverlays();
  }

  // ================= INPUT =================
  window.addEventListener("keydown", e => {
    let code = e.code;
    if (!code) { // некоторые окружения шлют только key
      const k = e.key;
      code = k === " " ? "Space" : (k.length === 1 ? "Key" + k.toUpperCase() : k);
    }
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) e.preventDefault();
    if (e.repeat) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "button" && (code === "Enter" || code === "Space") && (e.target.closest("#diffSeg") || e.target.closest("#endlessSeg"))) return; // native click
    Sfx.ensure();
    if (mode === "menu") {
      if (code === "Space" || code === "Enter") start();
    } else if (mode === "running") {
      if (code === "KeyA" || code === "ArrowLeft") setLane(-1);
      else if (code === "KeyD" || code === "ArrowRight") setLane(1);
      else if (code === "KeyW" || code === "ArrowUp" || code === "Space") jump();
      else if (code === "KeyS" || code === "ArrowDown") slide();
      else if (code === "KeyP" || code === "Escape") pause();
    } else if (mode === "paused") {
      if (code === "KeyP" || code === "Escape" || code === "Space") resume();
      else if (code === "KeyR") restart();
    } else if (mode === "over") {
      if (code === "KeyR" || code === "Space" || code === "Enter") restart();
      else if (code === "Escape") toMenu();
    } else if (mode === "shop") {
      if (code === "Space" || code === "Enter") closeShop();
    } else if (mode === "airlock") {
      if (code === "Space" || code === "Enter") passAirlock();
    } else if (mode === "victory") {
      if (code === "Space" || code === "Enter") startStory();
      else if (code === "Escape") toMenu();
    }
  });

  let touchId = null, touchX = 0, touchY = 0;
  canvas.addEventListener("touchstart", e => {
    Sfx.ensure();
    const tt = e.changedTouches[0];
    touchId = tt.identifier; touchX = tt.clientX; touchY = tt.clientY;
  }, { passive: true });
  canvas.addEventListener("touchmove", e => { e.preventDefault(); }, { passive: false });
  canvas.addEventListener("touchend", e => {
    if (touchId === null) return;
    let tt = null;
    for (const c of e.changedTouches) if (c.identifier === touchId) tt = c;
    if (!tt) return;
    touchId = null;
    const dx = tt.clientX - touchX, dy = tt.clientY - touchY;
    if (mode === "running") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return; // свайпы, не тапы
      if (Math.abs(dx) > Math.abs(dy)) setLane(dx > 0 ? 1 : -1);
      else if (dy < 0) jump(); else slide();
    } else if (mode === "over" && overT > 0.5) {
      restart();
    }
  }, { passive: true });
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  const blurBtn = fn => e => { e.currentTarget.blur(); fn(); };
  $("startBtn").addEventListener("click", blurBtn(startStory));
  $("continueBtn").addEventListener("click", blurBtn(continueStory));
  $("shopContinueBtn").addEventListener("click", blurBtn(closeShop));
  $("airlockBtn").addEventListener("click", blurBtn(passAirlock));
  $("victoryAgainBtn").addEventListener("click", blurBtn(startStory));
  $("victoryMenuBtn").addEventListener("click", blurBtn(toMenu));
  $("resumeBtn").addEventListener("click", blurBtn(resume));
  $("pauseRestartBtn").addEventListener("click", blurBtn(restart));
  $("againBtn").addEventListener("click", blurBtn(restart));
  $("pauseMenuBtn").addEventListener("click", blurBtn(toMenu));
  $("overMenuBtn").addEventListener("click", blurBtn(toMenu));
  $("pauseBtn").addEventListener("click", blurBtn(pause));
  $("soundBtn").addEventListener("click", blurBtn(() => { Sfx.ensure(); Sfx.setMuted(!Sfx.muted); Sfx.ui(); }));

  for (const b of document.querySelectorAll("#diffSeg button")) {
    b.addEventListener("click", () => {
      diff = b.dataset.diff; LS.set("u07r_diff", diff);
      for (const x of document.querySelectorAll("#diffSeg button")) {
        const on = x === b;
        x.classList.toggle("on", on);
        x.setAttribute("aria-checked", on ? "true" : "false");
      }
      Sfx.ensure(); Sfx.ui();
    });
    if (b.dataset.diff === diff) {
      for (const x of document.querySelectorAll("#diffSeg button")) {
        const on = x === b;
        x.classList.toggle("on", on);
        x.setAttribute("aria-checked", on ? "true" : "false");
      }
    }
  }

  for (const b of document.querySelectorAll("#endlessSeg button")) {
    b.addEventListener("click", () => {
      endlessSection = b.dataset.section; LS.set("u07r_endlessSection", endlessSection);
      for (const x of document.querySelectorAll("#endlessSeg button")) {
        const on = x === b;
        x.classList.toggle("on", on);
        x.setAttribute("aria-checked", on ? "true" : "false");
      }
      $("menuEndlessBest").textContent = String(GS.endlessRecord(storage, endlessSection).score);
      Sfx.ensure(); Sfx.ui();
    });
    if (b.dataset.section === endlessSection) {
      for (const x of document.querySelectorAll("#endlessSeg button")) {
        const on = x === b;
        x.classList.toggle("on", on);
        x.setAttribute("aria-checked", on ? "true" : "false");
      }
    }
  }
  $("endlessBtn").addEventListener("click", blurBtn(() => startEndless(endlessSection)));

  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("blur", () => pause());

  // ================= CAMERA =================
  const camPos = new V3(6, 3.4, 6), camTgt = new V3(0, 2.2, 0);
  // раскладка меню зависит от ширины (как CSS-брейкпоинт 700px), а не от типа указателя;
  // консоль меню внизу по всей ширине — робот по центру кадра над ней
  const menuNarrow = () => canvas.clientWidth < 700;
  const menuOffsetX = () => 0;
  const menuTargetY = () => menuNarrow() ? 0.6 : 1.1;
  function updateCamera(dt) {
    const sn = clamp(speed / DIFFS[diff].max, 0, 1);
    if (mode === "menu") {
      menuT += dt;
      const ang = menuT * 0.12 + 2.35;
      camPos.set(Math.sin(ang) * 7.4, 3.3 + Math.sin(menuT * 0.4) * 0.5, -Math.cos(ang) * 7.4);
      // робот по центру, приподнят над нижней консолью меню
      camTgt.set(menuOffsetX(), menuTargetY(), 0);
      camera.fov = lerp(camera.fov, 0.92, 1 - Math.exp(-4 * dt));
    } else {
      const chaseP = new V3(px * 0.55, 4.35 + feetY * 0.3, pz - 8.8);
      const chaseT = new V3(px * 0.72, 2.05 + feetY * 0.45, pz + 8);
      if (camBlend < 1) {
        camBlend = Math.min(1, camBlend + dt / 0.9);
        const ang = menuT * 0.12 + 2.35;
        const orbitP = new V3(Math.sin(ang) * 7.4, 3.3, -Math.cos(ang) * 7.4);
        const k = smooth(camBlend);
        camPos.copyFrom(V3.Lerp(orbitP, chaseP, k));
        camTgt.copyFrom(V3.Lerp(new V3(menuOffsetX(), menuTargetY(), 0), chaseT, k));
      } else {
        camPos.x = lerp(camPos.x, chaseP.x, 1 - Math.exp(-8 * dt));
        camPos.y = lerp(camPos.y, chaseP.y, 1 - Math.exp(-8 * dt));
        camPos.z = chaseP.z;
        camTgt.x = lerp(camTgt.x, chaseT.x, 1 - Math.exp(-10 * dt));
        camTgt.y = lerp(camTgt.y, chaseT.y, 1 - Math.exp(-10 * dt));
        camTgt.z = chaseT.z;
      }
      const targetFov = 0.96 + sn * 0.22 + shake * 0.06;
      camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-6 * dt));
    }
    shake *= Math.exp(-4.2 * dt);
    const sx = (Math.random() - 0.5) * shake * 0.6;
    const sy = (Math.random() - 0.5) * shake * 0.6;
    camera.position.set(camPos.x + sx, camPos.y + sy, camPos.z);
    camera.setTarget(camTgt);
    camera.rotation.z += clamp((LANE_X[lane] - px) * -0.012, -0.05, 0.05) + (Math.random() - 0.5) * shake * 0.03;
  }

  // ================= HUD =================
  function updateHud() {
    $("distVal").textContent = String(Math.floor(dist));
    $("speedFill").style.transform = "scaleX(" + clamp(speed / DIFFS[diff].max, 0, 1).toFixed(3) + ")";
    for (const el of document.querySelectorAll("#hudBoosts .boost-chip")) {
      const id = el.dataset.boost;
      if (boostActive[id] !== undefined) el.querySelector("b").textContent = String(Math.ceil(boostActive[id]));
    }
    const story = state.gameMode === "story";
    $("sectionStat").hidden = !story;
    if (story) {
      $("leftVal").textContent = String(Math.max(0, Math.ceil(GS.runEndZ(state) - dist)));
      $("sectionLabel").textContent = "Секция " + (state.section + 1);
    }
  }
  function collectCell(c) {
    c.active = false; c.inst.setEnabled(false);
    GS.collect(state, Boosts.cellValue(boostActive)); streak++; streakT = 2;
    $("cellVal").textContent = String(state.wallet);
    const el = $("cellVal").parentElement;
    el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
    Sfx.pickup(streak);
    FX.pickup(c.inst.position);
  }
  function collectBoost(e) {
    const refreshed = Boosts.has(boostActive, e.id);
    e.active = false; e.collected = true;
    e.gem.setEnabled(false); e.beam.setEnabled(false);
    Boosts.pickup(boostActive, e.id, boostOrder);
    FX.boost(e.gem.position, Boosts.BOOSTS[e.id].color);
    Sfx.boost();
    toast(Boosts.BOOSTS[e.id].toast, "", 1400, Boosts.BOOSTS[e.id].color);
    renderBoostHud();
    if (refreshed) {
      const chip = document.querySelector('#hudBoosts .boost-chip[data-boost="' + e.id + '"]');
      if (chip) chip.classList.add("pulse");
    }
  }
  // Панель купленных улучшений: только купленные, иконка + число.
  // Число — текущий уровень; у бронепластины — неиспользованный остаток
  // поглощений текущего забега (0, если запас исчерпан). Вызывается в
  // момент каждого изменения: покупка, поглощение удара, старт забега.
  const hudUpPrev = {};
  function renderUpgradeHud() {
    const wrap = $("hudUpgrades");
    const ids = Object.keys(GS.UPGRADES).filter(id => state.upgrades[id] > 0);
    wrap.hidden = ids.length === 0;
    wrap.innerHTML = "";
    for (const id of ids) {
      const u = GS.UPGRADES[id], armor = id === "armor";
      const val = armor ? armorLeft : state.upgrades[id];
      const chip = document.createElement("div");
      chip.className = "up-chip" + (armor ? " armor" : "") + (armor && val === 0 ? " empty" : "");
      chip.dataset.upgrade = id;
      const label = u.name + (armor ? ": остаток " : ": уровень ") + val;
      chip.title = label;
      chip.setAttribute("aria-label", label);
      chip.innerHTML = UPGRADE_ICONS[id];
      const b = document.createElement("b"); b.textContent = String(val);
      chip.appendChild(b);
      const prev = hudUpPrev[id];
      if (prev === undefined) chip.classList.add("pop");
      else if (prev !== val) chip.classList.add("pulse");
      chip.addEventListener("animationend", () => chip.classList.remove("pop", "pulse"));
      wrap.appendChild(chip);
      hudUpPrev[id] = val;
    }
    for (const id of Object.keys(hudUpPrev)) if (!ids.includes(id)) delete hudUpPrev[id];
  }
  // Чипы активных бустов: иконка + обратный отсчёт, цвет типа.
  // DOM пересоздаётся только при смене набора активных id; числа — каждый кадр.
  let boostHudPrev = "";
  function renderBoostHud() {
    const wrap = $("hudBoosts");
    const ids = Object.keys(boostActive);
    const key = ids.join(",");
    wrap.hidden = ids.length === 0;
    if (key === boostHudPrev) return;
    boostHudPrev = key;
    wrap.innerHTML = "";
    for (const id of ids) {
      const chip = document.createElement("div");
      chip.className = "boost-chip pop";
      chip.dataset.boost = id;
      chip.style.color = Boosts.BOOSTS[id].color;
      const label = Boosts.BOOSTS[id].name;
      chip.title = label;
      chip.setAttribute("aria-label", label);
      chip.innerHTML = BOOST_ICONS[id];
      const b = document.createElement("b");
      b.textContent = String(Math.ceil(boostActive[id]));
      chip.appendChild(b);
      chip.addEventListener("animationend", () => chip.classList.remove("pop", "pulse"));
      wrap.appendChild(chip);
    }
  }

  // ================= MAIN LOOP =================
  function update(dt) {
    t += dt;
    // neon pulse
    const pc = 0.82 + 0.18 * Math.sin(t * 2.1);
    M.cyan.emissiveColor.copyFrom(M.cyan._base).scaleInPlace(pc);
    M.amber.emissiveColor.copyFrom(M.amber._base).scaleInPlace(0.86 + 0.14 * Math.sin(t * 1.7 + 1));
    M.beacon.emissiveColor.copyFrom(M.beacon._base).scaleInPlace(0.7 + 0.3 * Math.sin(t * 4));
    M.core.emissiveColor.copyFrom(M.core._base).scaleInPlace(0.8 + 0.2 * Math.sin(t * 2.6));
    M_r.cyan.emissiveColor.copyFrom(M_r.cyan._base).scaleInPlace(pc);
    M_r.amber.emissiveColor.copyFrom(M_r.amber._base).scaleInPlace(0.86 + 0.14 * Math.sin(t * 1.7 + 1));
    M_r.glow.emissiveColor.copyFrom(M_r.glow._base).scaleInPlace(0.8 + 0.2 * Math.sin(t * 2.6));

    if (mode === "running") {
      runT += dt;
      const boostKeys = Object.keys(boostActive).join(",");
      Boosts.tick(boostActive, dt);
      if (Object.keys(boostActive).join(",") !== boostKeys) renderBoostHud();
      const D = DIFFS[diff];
      const targetSpeed = speedFor(dist) * smooth(runT / 0.8) * Boosts.speedMul(boostActive);
      speed = lerp(speed, targetSpeed, 1 - Math.exp(-6 * dt));
      pz += speed * dt;
      dist = pz;

      // граница забега проверяется ДО коллизий: финиш важнее столкновения
      if (state.gameMode === "story" && dist >= GS.runEndZ(state)) {
        GS.completeRun(state);
        if (state.phase === "victory") doVictory(); else openShop();
      }

      // lane motion
      if (laneT < 1) {
        laneT = Math.min(1, laneT + dt / 0.16);
        px = lerp(laneFromX, LANE_X[lane], smooth(laneT));
      } else px = LANE_X[lane];

      // vertical physics
      if (airborne) {
        const prevFeetY = feetY;
        vy -= 30 * dt;
        feetY += vy * dt;
        const plats = obstacles.filter(o => o.active && o.type === "platform")
          .map(o => ({ lane: o.lane, z: o.z, top: Platforms.TOP, halfD: Platforms.HALF_D, ref: o }));
        const p = Platforms.landCheck(roof, prevFeetY, feetY, vy, px, pz, plats, LANE_X);
        if (p) {
          feetY = p.top; vy = 0; airborne = false; airJumpUsed = false;
          Platforms.land(roof, p.ref);
          Sfx.land();
          FX.land(new V3(px, p.top + 0.1, pz));
          shake = Math.max(shake, 0.06);
          if (queuedSlide) { queuedSlide = false; sliding = true; slideT = slideDur(); Sfx.slide(); }
        } else if (feetY <= 0) {
          feetY = 0; vy = 0; airborne = false; airJumpUsed = false;
          Platforms.clear(roof);
          Sfx.land();
          FX.land(new V3(px, 0.1, pz));
          shake = Math.max(shake, 0.06);
          if (queuedSlide) { queuedSlide = false; sliding = true; slideT = slideDur(); Sfx.slide(); }
        }
      }
      // крыша ещё под ногами? иначе — сход (падение не смертельно само по себе)
      if (!airborne && roof.on && !Platforms.supported(roof.on, px, pz, LANE_X)) {
        Platforms.depart(roof); airborne = true; vy = 0;
      }
      if (sliding) { slideT -= dt; if (slideT <= 0) sliding = false; }
      if (streakT > 0) { streakT -= dt; if (streakT <= 0) streak = 0; }

      // бесконечный режим: скользящие сегменты по 3000 м, зазор ≥500 м через границу
      if (state.gameMode === "endless") {
        const seg = Math.floor(pz / GS.RUN_LEN);
        if (seg > boostSegment) {
          const prevLastZ = boostPlan[2].z;
          boostSegment = seg;
          boostPlan = Boosts.planSegment({ rng: Math.random, startZ: seg * GS.RUN_LEN, prevLastZ });
          placeBoostEntities();
        }
      }

      spawnAhead();
      recycle();

      // collisions
      if (mode === "running" && runT > 0.35 && !Boosts.invincible(boostActive)) {
        for (const o of obstacles) {
          if (!o.active) continue;
          const dz = o.z - pz;
          if (Math.abs(dz) > HALF_D[o.type] + 0.32) continue;
          if (Math.abs(LANE_X[o.lane] - px) > 1.78) continue;
          if (o.type === "platform") {
            if (!Platforms.sideCrash({ lane: o.lane, z: o.z, top: Platforms.TOP, halfD: Platforms.HALF_D }, roof, feetY, px, pz, LANE_X)) continue;
            hitObstacle(o);
            break;
          }
          if (o.type === "hurdle" && feetY > 1.22) continue;
          if (o.type === "beam" && sliding) continue;
          hitObstacle(o);
          break;
        }
      }
      if (mode === "running") {
        const win = Boosts.collectWindows(state, boostActive);
        for (const c of cellPool) {
          if (!c.active) continue;
          if (Math.abs(c.z - pz) > win.z) continue;
          if (Math.abs(c.inst.position.x - px) > Boosts.magnetRadius(state, boostActive)) continue;
          if (Math.abs(c.y - (feetY + 1.5)) > win.y) continue;
          collectCell(c);
        }
        for (const e of boostEntities) {
          if (!e.active) continue;
          if (Math.abs(e.z - pz) > 2) continue;
          if (Math.abs(LANE_X[e.lane] - px) > 1.78) continue;
          if (Math.abs(1.4 - (feetY + 1.5)) > 2.5) continue;
          collectBoost(e);
        }
        if (dist >= nextMilestone) {
          toast((nextMilestone - GS.runStartZ(state)) + " М", "cyan", 1300);
          Sfx.milestone();
          nextMilestone += 250;
        }
      }
      updateHud();
    } else if (mode === "crash") {
      crashT += dt;
      speed *= Math.exp(-2.6 * dt);
      pz += speed * dt; dist = pz;
      vy -= 26 * dt;
      feetY += vy * dt;
      if (feetY <= 0) { feetY = 0; vy *= -0.32; crashSpin.x *= 0.55; crashSpin.z *= 0.55; if (Math.abs(vy) < 0.6) vy = 0; }
      crashRot.x += crashSpin.x * dt;
      crashRot.y += crashSpin.y * dt;
      crashRot.z += crashSpin.z * dt;
      updateHud();
      if (crashT > 1.15) { if (state.gameMode === "story") retryRun(); else finishOver(); }
    } else if (mode === "over") {
      overT += dt;
    }

    // cells spin (only near the player for perf)
    for (const c of cellPool) {
      if (!c.active || Math.abs(c.z - pz) > 70) continue;
      c.spin += dt * 2.4;
      c.inst.unfreezeWorldMatrix();
      c.inst.rotation.y = c.spin;
      c.inst.position.y = c.y + Math.sin(t * 2.2 + c.spin) * 0.12;
      c.inst.freezeWorldMatrix();
    }
    // boost gems spin/bob (only near the player for perf)
    for (const e of boostEntities) {
      if (!e.active || Math.abs(e.z - pz) > 70) continue;
      e.gem.unfreezeWorldMatrix();
      e.gem.rotation.y += dt * 1.6;
      e.gem.position.y = 1.4 + Math.sin(t * 2.2) * 0.12;
      e.gem.freezeWorldMatrix();
    }

    animateRobot(dt);

    // аура буста: цвет последнего подобранного, пульсация 2.5 Гц в последние 3 с,
    // вход ~0.2 с, затухание ~0.3 с; таймеры заморожены вне running — остаток не меняется
    const auraId = Boosts.auraTarget(boostActive, boostOrder);
    const want = auraId ? 1 : 0;
    if (auraFade < want) auraFade = Math.min(want, auraFade + dt / 0.2);
    else if (auraFade > want) auraFade = Math.max(want, auraFade - dt / 0.3);
    if (auraId) auraColorId = auraId;
    const auraOn = auraFade > 0.004;
    for (const c of auraMeshes) c.setEnabled(auraOn);
    auraGlow.setEnabled(auraOn);
    if (auraOn) {
      // контур: gain 1.0 × alpha 0.5 — насыщенный цвет буста (ярче ACES выбеливает);
      // пульсация от остатка (без скачка на старте окна, заморожена в паузе)
      const pulse = auraId ? Boosts.auraPulse(boostActive[auraId]) : 1;
      auraMat.emissiveColor.copyFrom(auraColors[auraColorId]).scaleInPlace(pulse);
      auraMat.alpha = 0.5 * auraFade;
      // свечение: ядро level 1.9 × 0.7 alpha = 1.33 × цвет — luminance выше bloomThreshold 0.72
      auraGlowMat.emissiveTexture = auraGlowTexs[auraColorId];
      auraGlowMat.diffuseTexture = auraGlowTexs[auraColorId];
      auraGlowMat.emissiveTexture.level = 1.9 * pulse;
      auraGlowMat.alpha = 0.7 * auraFade;
    }

    updateCamera(dt);

    // lights follow the runner
    key.position.set(px + 9, 15, pz - 9);
    key.setDirectionToTarget(new V3(px, 1.2, pz + 5));
    fill.position.set(px, 3.1, pz - 3.2);
    dust.emitter.copyFrom(camera.position);
    steam.emitter.copyFrom(camera.position);

    const sm = shadows.getShadowMap();
    const wantRefresh = (mode === "running" || mode === "menu" || mode === "crash") ? 1 : 0;
    if (sm.refreshRate !== wantRefresh) sm.refreshRate = wantRefresh;
  }

  let firstFrame = true;
  engine.runRenderLoop(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    update(dt);
    scene.render();
    if (firstFrame) { firstFrame = false; $("loading").classList.add("done"); }
  });

  // ================= INIT =================
  GS.migrateBoosts(storage);
  GS.migrateBoostDuration(storage);
  GS.migrateRoofs(storage);
  refreshMenu();
  $("guideKb").hidden = COARSE;
  $("guideTouch").hidden = !COARSE;
  syncOverlays();
  renderUpgradeHud();
  planRunBoosts(0);
  spawnAhead(); // предзаполнение коридора впереди (в меню не видно из-за тумана)

  // debug / QA handle
  window.__runner = {
    engine, scene, camera,
    get mode() { return mode; }, get dist() { return dist; }, get speed() { return speed; },
    get pz() { return pz; }, get cells() { return state.collected; }, get lane() { return lane; },
    get feetY() { return feetY; }, get sliding() { return sliding; }, get airborne() { return airborne; },
    get roof() { return { on: roof.on, fellFrom: roof.fellFrom }; },
    get gameMode() { return state.gameMode; }, get phase() { return state.phase; },
    get section() { return state.section; },
    get wallet() { return state.wallet; }, get collected() { return state.collected; },
    get upgrades() { return Object.assign({}, state.upgrades); },
    get armorLeft() { return armorLeft; }, get runEndZ() { return GS.runEndZ(state); },
    get theme() { return theme; },
    get boosts() { return boostPlan.map((p, i) => ({ id: p.id, z: p.z, lane: p.lane, collected: boostEntities[i].collected, active: boostEntities[i].active })); },
    get activeBoosts() { return Object.assign({}, boostActive); },
    get aura() { return { id: auraColorId, fade: auraFade, target: Boosts.auraTarget(boostActive, boostOrder) }; },
    actions: {
      start, restart, pause, resume, toMenu, jump, slide, setLane, crash: doCrash,
      collect: () => { const c = cellPool.find(q => q.active); if (c) collectCell(c); },
      newStory: startStory, newEndless: startEndless,
      buy: id => { const ok = GS.buy(state, id); if (ok) { if (id === "armor") armorLeft = GS.effect(state, "armor"); renderUpgradeHud(); if (mode === "shop") renderShop(id); } $("cellVal").textContent = String(state.wallet); return ok; },
      closeShop, passAirlock,
      hit: () => hitObstacle(obstacles.find(o => o.active) || null),
      spawnCell: (lane, z, y) => addCell(lane, z, y),
      spawnObstacle: (type, lane, z) => spawnObstacle(type, lane, z),
      teleport: z => {
        if (mode !== "running") return;
        for (const o of obstacles) { o.active = false; for (const p of o.parts) p.inst.setEnabled(false); }
        for (const c of cellPool) { c.active = false; c.inst.setEnabled(false); }
        pz = dist = z; nextZ = z + 48; nextMilestone = z + 250;
        runT = 0.8; // QA-телепорт пропускает стартовый разгон
        spawnAhead(); updateHud();
      },
      grantCells: n => { GS.collect(state, n); $("cellVal").textContent = String(state.wallet); },
      activateBoost: id => Boosts.pickup(boostActive, id, boostOrder),
      pickupBoost: (i = 0) => { const e = boostEntities[i]; if (e && e.active) collectBoost(e); }
    },
    world: {
      get obstacles() { return obstacles.filter(o => o.active).map(o => ({ type: o.type, lane: o.lane, z: o.z })); },
      get cells() { return cellPool.filter(c => c.active).map(c => ({ lane: LANE_X.indexOf(c.inst.position.x), z: c.z, y: c.y })); }
    },
    Sfx
  };
})();