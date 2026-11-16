/* Chamfered (beveled) low-poly box generator.
   Builds the convex solid bounded by 6 face planes, 12 edge-chamfer planes
   and 8 corner-chamfer planes, with flat per-face normals — the faceted
   "toy plastic" look of the reference model. */
(function (global) {
  "use strict";

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  function chamferedBoxVertexData(w, h, d, edge, corner) {
    const A = w / 2, B = h / 2, C = d / 2;
    const minHalf = Math.min(A, B, C);
    const te = Math.max(0.004, Math.min(edge, minHalf * 0.5));
    const tc = Math.max(te, Math.min(corner, minHalf * 0.8));
    const S = [-1, 1];

    // 6 vertices per original cube corner (48 total).
    const verts = [];
    for (const i of S) for (const j of S) for (const k of S) {
      verts.push([i * A, j * (B - te), k * (C - tc)]);
      verts.push([i * A, j * (B - tc), k * (C - te)]);
      verts.push([i * (A - te), j * B, k * (C - tc)]);
      verts.push([i * (A - tc), j * B, k * (C - te)]);
      verts.push([i * (A - te), j * (B - tc), k * C]);
      verts.push([i * (A - tc), j * (B - te), k * C]);
    }

    const n2 = Math.SQRT2, n3 = Math.sqrt(3);
    const planes = [];
    for (const i of S) {
      planes.push([[i, 0, 0], A]);
      planes.push([[0, i, 0], B]);
      planes.push([[0, 0, i], C]);
    }
    for (const i of S) for (const j of S) {
      planes.push([[i / n2, j / n2, 0], (A + B - te) / n2]);
      planes.push([[i / n2, 0, j / n2], (A + C - te) / n2]);
      planes.push([[0, i / n2, j / n2], (B + C - te) / n2]);
    }
    for (const i of S) for (const j of S) for (const k of S) {
      planes.push([[i / n3, j / n3, k / n3], (A + B + C - te - tc) / n3]);
    }

    const positions = [], normals = [], indices = [];
    const EPS = 1e-4;

    for (const [n, c] of planes) {
      let face = [];
      for (const v of verts) {
        if (Math.abs(dot(v, n) - c) < EPS) {
          // dedupe (edge == corner chamfer collapses vertex pairs)
          if (!face.some(p => Math.hypot(p[0] - v[0], p[1] - v[1], p[2] - v[2]) < 1e-6)) face.push(v);
        }
      }
      if (face.length < 3) continue;

      const cen = [0, 0, 0];
      for (const p of face) { cen[0] += p[0]; cen[1] += p[1]; cen[2] += p[2]; }
      cen[0] /= face.length; cen[1] /= face.length; cen[2] /= face.length;

      const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = norm(cross(up, n));
      const v = cross(n, u);
      const ang = p => {
        const q = sub(p, cen);
        return Math.atan2(dot(q, v), dot(q, u));
      };
      face.sort((a, b) => ang(a) - ang(b));

      // Babylon is left-handed: front faces wind clockwise seen from outside,
      // i.e. the geometric cross product points AGAINST the outward normal.
      const cr = cross(sub(face[1], face[0]), sub(face[2], face[0]));
      if (dot(cr, n) > 0) face.reverse();

      const base = positions.length / 3;
      for (const p of face) {
        positions.push(p[0], p[1], p[2]);
        normals.push(n[0], n[1], n[2]);
      }
      for (let t = 1; t < face.length - 1; t++) indices.push(base, base + t, base + t + 1);
    }

    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.indices = indices;
    return vd;
  }

  global.Chamfer = {
    createBox(name, w, h, d, edge, corner, scene) {
      const mesh = new BABYLON.Mesh(name, scene);
      chamferedBoxVertexData(w, h, d, edge, corner).applyToMesh(mesh);
      return mesh;
    }
  };
})(window);
