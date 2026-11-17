// Shared math helpers and a deterministic random generator for Solmarina Heat.
// The city layout uses a fixed seed so every run (and every screenshot) sees
// the same streets, blocks and skyline.

// Mulberry32 — small fast seeded PRNG.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function lerp(a, b, t) { return a + (b - a) * t; }

// Shortest signed angle difference, result in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Move angle a toward b by at most maxStep radians.
export function angleToward(a, b, maxStep) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

export function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }

// Distance on the XZ plane.
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Circle vs axis-aligned box (2D) push-out. Returns true when a collision happened.
export function resolveCircleAABB(px, pz, radius, box) {
  const cx = clamp(px, box.minX, box.maxX);
  const cz = clamp(pz, box.minZ, box.maxZ);
  const dx = px - cx, dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  if (d2 > 0.000001) {
    const d = Math.sqrt(d2);
    const push = (radius - d) / d;
    return { x: px + dx * push, z: pz + dz * push, nx: dx / d, nz: dz / d, depth: radius - d };
  }
  // Center inside the box: push out along the smallest penetration axis.
  const pl = px - box.minX, pr = box.maxX - px;
  const pt = pz - box.minZ, pb = box.maxZ - pz;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: box.minX - radius, z: pz, nx: -1, nz: 0, depth: pl + radius };
  if (m === pr) return { x: box.maxX + radius, z: pz, nx: 1, nz: 0, depth: pr + radius };
  if (m === pt) return { x: px, z: box.minZ - radius, nx: 0, nz: -1, depth: pt + radius };
  return { x: px, z: box.maxZ + radius, nx: 0, nz: 1, depth: pb + radius };
}

export function formatCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export function formatDist(m) {
  if (m >= 1000) return (m / 1000).toFixed(1) + ' km';
  return Math.round(m) + ' m';
}
