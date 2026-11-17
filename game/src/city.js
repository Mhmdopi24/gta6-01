// Procedural Solmar Bay: a seeded street grid, tower blocks, sidewalks,
// streetlights, palm trees, a beach and the ocean. Exports the collision
// boxes and the road network the traffic, pedestrians and missions use.
import { makeRng } from './rng.js';

export const BLOCK = 46;      // block pitch (road + lot)
export const ROAD = 14;       // road width
export const GRID = 7;        // blocks per side (city spans GRID*BLOCK)
export const CITY = GRID * BLOCK;

const PALETTE = [0x8fa3b8, 0xc9a06a, 0x7d8aa0, 0xb8b0a0, 0x6a7f95, 0xd9b380, 0x9aa8c0, 0xc08a6a];
const ROOF = [0x5a6a7a, 0x8a6a4a, 0x4a5a6a, 0x7a7a6a];

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const buildings = [];
  const lampPositions = [];

  // Sky, sun, fog, hemisphere light.
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9cc4e4, 180, 520);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.25);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.75));

  // Ground: grass-ish base, then asphalt roads as dark strips.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY + 260, CITY + 260),
    new THREE.MeshLambertMaterial({ color: 0x7da05c }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(CITY / 2, -0.05, CITY / 2);
  group.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const sideMat = new THREE.MeshLambertMaterial({ color: 0x9a958a });
  for (let i = 0; i <= GRID; i++) {
    const c = i * BLOCK;
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, CITY), roadMat);
    vRoad.rotation.x = -Math.PI / 2; vRoad.position.set(c, 0, CITY / 2); group.add(vRoad);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(CITY, ROAD), roadMat);
    hRoad.rotation.x = -Math.PI / 2; hRoad.position.set(CITY / 2, 0.01, c); group.add(hRoad);
    // Sidewalk strips along each road.
    const vWalk = new THREE.Mesh(new THREE.PlaneGeometry(4, CITY), sideMat);
    vWalk.rotation.x = -Math.PI / 2; vWalk.position.set(c + ROAD / 2 + 2, 0.02, CITY / 2); group.add(vWalk);
    const hWalk = new THREE.Mesh(new THREE.PlaneGeometry(CITY, 4), sideMat);
    hWalk.rotation.x = -Math.PI / 2; hWalk.position.set(CITY / 2, 0.02, c + ROAD / 2 + 2); group.add(hWalk);
  }

  // Road centre dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  for (let i = 0; i <= GRID; i++) {
    for (let d = BLOCK / 2; d < CITY; d += BLOCK) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4), dashMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(i * BLOCK, 0.03, d); group.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), dashMat);
      dash2.rotation.x = -Math.PI / 2; dash2.position.set(d, 0.03, i * BLOCK); group.add(dash2);
    }
  }

  // Buildings: one or two towers per block, varied height and colour,
  // with a glowing window texture generated on a canvas.
  const winTex = makeWindowTexture();
  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const x0 = bx * BLOCK + ROAD + 4, z0 = bz * BLOCK + ROAD + 4;
      const w = BLOCK - ROAD - 8, d = BLOCK - ROAD - 8;
      const towers = rng.chance(0.45) ? 2 : 1;
      for (let t = 0; t < towers; t++) {
        const tw = t === 0 ? w : w * 0.45;
        const td = t === 0 ? d : d * 0.45;
        const ox = t === 0 ? 0 : w * 0.5;
        const oz = t === 0 ? 0 : d * 0.5;
        const h = rng.range(10, 58) * (bx + bz > 8 ? 1.25 : 1);
        const col = rng.pick(PALETTE);
        const mat = new THREE.MeshLambertMaterial({ color: col, map: winTex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(tw, h, td), mat);
        const cx = x0 + ox + tw / 2, cz = z0 + oz + td / 2;
        b.position.set(cx, h / 2, cz);
        group.add(b);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(tw + 1, 1.2, td + 1),
          new THREE.MeshLambertMaterial({ color: rng.pick(ROOF) }));
        roof.position.set(cx, h + 0.6, cz);
        group.add(roof);
        // Rooftop beacon on the tallest towers.
        if (h > 40) {
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff4444 }));
          beacon.position.set(cx, h + 2, cz);
          group.add(beacon);
        }
        colliders.push({ minX: cx - tw / 2, maxX: cx + tw / 2, minZ: cz - td / 2, maxZ: cz + td / 2 });
        buildings.push({ x: cx, z: cz, h, w: tw, d: td });
      }
      // Palm trees on the block corners.
      if (rng.chance(0.7)) {
        const px = x0 + rng.range(2, w - 2), pz = z0 + rng.range(2, d - 2);
        group.add(makePalm(px, pz, rng));
      }
      // Streetlight at each intersection corner.
      lampPositions.push([bx * BLOCK + ROAD / 2 + 5, bz * BLOCK - 2]);
    }
  }

  // Streetlights along the avenues.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const [lx, lz] of lampPositions) {
    if (lx > CITY || lz < 0) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), poleMat);
    pole.position.set(lx, 3.5, lz); group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), bulbMat);
    bulb.position.set(lx, 7.1, lz); group.add(bulb);
  }

  // Beach + ocean on the south edge, plus a pier.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(CITY + 260, 46),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY / 2, 0.02, CITY + 46);
  group.add(sand);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(CITY + 400, 260),
    new THREE.MeshLambertMaterial({ color: 0x1e7fa8 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY / 2, -0.4, CITY + 46 + 130);
  group.add(sea);
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1.5, 60),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
  pier.position.set(CITY / 2 + 40, 0.8, CITY + 46 + 20);
  group.add(pier);

  // City-limit sign plane: a few billboards with the city name baked in.
  group.add(makeBillboard(CITY / 2, 26, 'SOLMAR BAY', 0xffd23f));
  group.add(makeBillboard(30, 80, 'PALM ROW', 0x7dff9a));

  return { group, colliders, buildings, rng, lampPositions };
}

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#223344';
  for (let y = 6; y < 128; y += 14) for (let x = 6; x < 64; x += 14) g.fillRect(x, y, 8, 9);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makePalm(x, z, rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
  trunk.position.y = 3.5; g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9a4a });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.5, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.6, 7.6, Math.sin(a) * 1.6);
    leaf.rotation.z = Math.cos(a) * 0.9;
    leaf.rotation.x = -Math.sin(a) * 0.9;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

function makeBillboard(x, z, text, color) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101c2e'; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 64px Verdana'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  board.position.y = 12; g.add(board);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  for (const dx of [-12, 12]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 9, 6), legMat);
    leg.position.set(dx, 4.5, 0); g.add(leg);
  }
  g.position.set(x, 0, z);
  return g;
}

// Point-in-collider test used by movement and driving.
export function hitsBuilding(colliders, x, z, r) {
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return c;
  }
  return null;
}

export function clampToCity(x, z, margin) {
  const m = margin || 4;
  return [Math.max(m, Math.min(CITY - m, x)), Math.max(m, Math.min(CITY + 40, z))];
}
