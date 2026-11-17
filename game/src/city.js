// Procedural Solmarina: a sun-soaked coastal city built from a fixed seed.
// Streets on a grid, tower blocks downtown, a beach and ocean to the south,
// palms, lamps, a plaza, and the story landmarks (bar, hotel, garage,
// safehouse, marina office, pier). One canvas texture paints the whole
// ground — asphalt, lane dashes, crosswalks, sidewalks and sand.

import * as THREE from 'three';
import { makeRng, pick, randRange, clamp } from './util.js';

export const ROADS = [-162, -108, -54, 0, 54, 108, 162];
export const ROAD_HALF = 7;
export const CITY_HALF = 189;
export const BEACH_Z = 205;
export const OCEAN_Z = 252;
export const WORLD_MIN_X = -230;
export const WORLD_MAX_X = 230;
export const WORLD_MIN_Z = -230;
export const WORLD_MAX_Z = 310;

const BUILDING_COLORS = [0xe8dcc3, 0xf2e6d0, 0xe6b48a, 0xd9a08c, 0x9fc4c8, 0xc9d6c5, 0xf0d9a0, 0xd8cfc0];

// Paint the ground: roads, dashes, crosswalks, sidewalks, beach, water edge.
function makeGroundTexture() {
  const S = 2048;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const sx = S / (WORLD_MAX_X - WORLD_MIN_X);
  const sz = S / (WORLD_MAX_Z - WORLD_MIN_Z);
  const wx = (x) => (x - WORLD_MIN_X) * sx;
  const wz = (z) => (z - WORLD_MIN_Z) * sz;

  g.fillStyle = '#8d877b'; g.fillRect(0, 0, S, S); // sidewalk base
  // Sand beach and water at the south edge.
  g.fillStyle = '#dcc48d'; g.fillRect(0, wz(BEACH_Z), S, wz(OCEAN_Z) - wz(BEACH_Z));
  g.fillStyle = '#2a7cb5'; g.fillRect(0, wz(OCEAN_Z), S, S - wz(OCEAN_Z));
  // Sand speckles.
  const srng = makeRng(77);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = srng() > 0.5 ? 'rgba(180,150,95,0.5)' : 'rgba(240,220,170,0.5)';
    g.fillRect(wx(-220 + srng() * 440), wz(BEACH_Z + srng() * 45), 3, 3);
  }
  // Block tint variation.
  const brng = makeRng(31);
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const shade = 138 + Math.floor(brng() * 22);
      g.fillStyle = `rgb(${shade},${shade - 4},${shade - 14})`;
      g.fillRect(wx(ROADS[i] + ROAD_HALF + 1), wz(ROADS[j] + ROAD_HALF + 1),
        wx(ROADS[i + 1] - ROAD_HALF - 1) - wx(ROADS[i] + ROAD_HALF + 1),
        wz(ROADS[j + 1] - ROAD_HALF - 1) - wz(ROADS[j] + ROAD_HALF + 1));
    }
  }
  // Asphalt roads.
  g.fillStyle = '#2f333a';
  for (const c of ROADS) {
    g.fillRect(wx(c - ROAD_HALF), 0, ROAD_HALF * 2 * sx, S);
    g.fillRect(0, wz(c - ROAD_HALF), S, ROAD_HALF * 2 * sz);
  }
  // Road edge lines.
  g.fillStyle = 'rgba(230,230,220,0.75)';
  for (const c of ROADS) {
    g.fillRect(wx(c - ROAD_HALF + 0.4), 0, 2, S);
    g.fillRect(wx(c + ROAD_HALF - 0.6), 0, 2, S);
    g.fillRect(0, wz(c - ROAD_HALF + 0.4), S, 2);
    g.fillRect(0, wz(c + ROAD_HALF - 0.6), S, 2);
  }
  // Yellow center dashes.
  g.fillStyle = '#d8a920';
  for (const c of ROADS) {
    for (let t = WORLD_MIN_Z; t < WORLD_MAX_Z; t += 9) {
      g.fillRect(wx(c - 0.25), wz(t), 2, 4.5 * sz);
      g.fillRect(wx(t), wz(c - 0.25), 4.5 * sx, 2);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(240,240,235,0.9)';
  for (const cx of ROADS) {
    for (const cz of ROADS) {
      for (let k = -2; k <= 2; k++) {
        g.fillRect(wx(cx + k * 2.2 - 0.8), wz(cz - ROAD_HALF - 2.4), 3.5, 4.6 * sz);
        g.fillRect(wx(cx - ROAD_HALF - 2.4), wz(cz + k * 2.2 - 0.8), 4.6 * sx, 3.5);
      }
    }
  }
  // Plaza circle.
  g.fillStyle = '#b3ab97';
  g.beginPath(); g.arc(wx(54), wz(0), 18 * sx, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8f8875'; g.lineWidth = 4;
  g.beginPath(); g.arc(wx(54), wz(0), 18 * sx, 0, Math.PI * 2); g.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A window facade texture: dark glass grid with some lit windows.
function makeFacadeTexture(rng, tint) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = tint; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 246; y += 22) {
    for (let x = 8; x < 120; x += 20) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#22303e' : '#31445a');
      g.fillRect(x, y, 13, 14);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.rng = makeRng(1337);
    this.landmarks = {
      bar: { x: 120, z: 180, name: 'The Gilded Anchor' },
      hotel: { x: 0, z: -135, name: 'Grand Solmarina Hotel' },
      garage: { x: -150, z: -120, name: "Mack's Garage" },
      safehouse: { x: -170, z: 170, name: 'Safehouse' },
      marinaOffice: { x: 170, z: 185, name: 'Marina Office' },
      pier: { x: 170, z: 238, name: 'Pier 9' },
      plaza: { x: 54, z: 0, name: 'Coral Plaza' },
    };
    this._buildGround();
    this._buildOcean();
    this._buildBuildings();
    this._buildLandmarks();
    this._buildPalmsAndLamps();
    this._buildClouds();
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(
      WORLD_MAX_X - WORLD_MIN_X, WORLD_MAX_Z - WORLD_MIN_Z);
    const mat = new THREE.MeshLambertMaterial({ map: makeGroundTexture() });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, (WORLD_MIN_Z + WORLD_MAX_Z) / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildOcean() {
    const geo = new THREE.PlaneGeometry(900, 320);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2a7cb5 });
    const ocean = new THREE.Mesh(geo, mat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.4, OCEAN_Z + 160);
    this.scene.add(ocean);
    this.ocean = ocean;
    // Foam strip where the waves meet the sand.
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 3),
      new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.7 }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.05, OCEAN_Z + 1);
    this.scene.add(foam);
    this.foam = foam;
  }

  _addBuilding(x, z, w, d, h, color, facadeTex) {
    const mat = new THREE.MeshLambertMaterial({
      map: facadeTex || null, color: facadeTex ? 0xffffff : color,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2 + 0.3, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // Roof slab + rooftop box.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
      new THREE.MeshLambertMaterial({ color: 0x5a5348 }));
    roof.position.set(x, h + 0.55, z);
    this.scene.add(roof);
    if (this.rng() < 0.5) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.2, 2.2),
        new THREE.MeshLambertMaterial({ color: 0x8a8f94 }));
      ac.position.set(x + w * 0.2, h + 1.3, z - d * 0.15);
      ac.castShadow = true;
      this.scene.add(ac);
    }
    this.colliders.push({
      minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2,
    });
    return mesh;
  }

  _buildBuildings() {
    const rng = this.rng;
    const facades = [
      makeFacadeTexture(makeRng(11), '#cfc4ae'),
      makeFacadeTexture(makeRng(22), '#c9b8a0'),
      makeFacadeTexture(makeRng(33), '#b8c4c2'),
    ];
    const reserved = new Set();
    const blockOf = (x, z) => `${Math.floor((x + 162) / 54)},${Math.floor((z + 162) / 54)}`;
    for (const lm of Object.values(this.landmarks)) reserved.add(blockOf(lm.x, lm.z));
    reserved.add(blockOf(54, 0)); // plaza stays open

    for (let i = 0; i < ROADS.length - 1; i++) {
      for (let j = 0; j < ROADS.length - 1; j++) {
        if (reserved.has(`${i},${j}`)) continue;
        const bx0 = ROADS[i] + ROAD_HALF + 2;
        const bz0 = ROADS[j] + ROAD_HALF + 2;
        const bx1 = ROADS[i + 1] - ROAD_HALF - 2;
        const bz1 = ROADS[j + 1] - ROAD_HALF - 2;
        const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
        const downtown = 1 - Math.min(1, Math.sqrt(cx * cx + cz * cz) / 260);
        const hBase = 7 + downtown * 46;
        if (rng() < 0.32) {
          // Single tower.
          const w = randRange(rng, 16, 24), d = randRange(rng, 16, 24);
          const h = hBase * randRange(rng, 1.1, 1.9);
          this._addBuilding(cx, cz, w, d, h, pick(rng, BUILDING_COLORS), pick(rng, facades));
        } else {
          // Four smaller blocks.
          const quads = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
          for (const [qx, qz] of quads) {
            if (rng() < 0.14) continue;
            const w = randRange(rng, 10, 15), d = randRange(rng, 10, 15);
            const h = hBase * randRange(rng, 0.35, 0.85);
            this._addBuilding(cx + qx * 9.5, cz + qz * 9.5, w, d, h,
              pick(rng, BUILDING_COLORS), pick(rng, facades));
          }
        }
      }
    }
  }

  _buildLandmarks() {
    const rng = this.rng;
    const facade = makeFacadeTexture(makeRng(44), '#e8d9b0');
    // Grand Solmarina Hotel — the tallest tower in the north.
    this._addBuilding(0, -135, 30, 26, 82, 0xf2e6d0, facade);
    // The Gilded Anchor bar — low, warm, by the marina.
    this._addBuilding(120, 180, 22, 16, 9, 0xd9a05a, null);
    // Mack's Garage — wide shed.
    this._addBuilding(-150, -120, 26, 18, 8, 0x7a8894, null);
    // Safehouse — small house in the south-west.
    this._addBuilding(-170, 170, 14, 12, 7, 0xc9d6c5, null);
    // Marina Office.
    this._addBuilding(170, 185, 20, 14, 12, 0x9fc4c8, null);
    // Pier 9 shack on the sand.
    const shack = new THREE.Mesh(
      new THREE.BoxGeometry(10, 5, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
    shack.position.set(170, 2.8, 238);
    shack.castShadow = true;
    this.scene.add(shack);
    this.colliders.push({ minX: 165, maxX: 175, minZ: 234, maxZ: 242 });
    // Pier boardwalk into the sea.
    const pierWalk = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.8, 40),
      new THREE.MeshLambertMaterial({ color: 0x7a5c3e }));
    pierWalk.position.set(170, 0.4, 262);
    this.scene.add(pierWalk);
    // Plaza fountain.
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 6, 1.6, 20),
      new THREE.MeshLambertMaterial({ color: 0x9aa5ad }));
    fountain.position.set(54, 0.8, 0);
    fountain.castShadow = true;
    this.scene.add(fountain);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.2, 0.4, 20),
      new THREE.MeshLambertMaterial({ color: 0x4fa8d8 }));
    water.position.set(54, 1.7, 0);
    this.scene.add(water);
    this.colliders.push({ minX: 48, maxX: 60, minZ: -6, maxZ: 6 });
    void rng;
  }

  _buildPalmsAndLamps() {
    const rng = this.rng;
    // Palms along the beach and the marina boulevard.
    const palmSpots = [];
    for (let x = -200; x <= 200; x += 16) {
      if (rng() < 0.75) palmSpots.push([x + randRange(rng, -4, 4), BEACH_Z + 6 + rng() * 8]);
    }
    for (let z = -160; z <= 160; z += 26) {
      if (rng() < 0.6) palmSpots.push([108 + 9.5, z]);
      if (rng() < 0.6) palmSpots.push([-108 - 9.5, z]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
    const crownGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    palmSpots.forEach(([x, z], i) => {
      const lean = randRange(rng, -0.08, 0.08);
      e.set(lean, rng() * Math.PI * 2, lean * 0.6);
      q.setFromEuler(e);
      v.set(x, 3.25, z);
      m.compose(v, q, s);
      trunks.setMatrixAt(i, m);
      e.set(0, rng() * Math.PI * 2, 0);
      q.setFromEuler(e);
      v.set(x, 7.4, z);
      s.set(1, 0.62, 1);
      m.compose(v, q, s);
      crowns.setMatrixAt(i, m);
      s.set(1, 1, 1);
    });
    trunks.castShadow = true; crowns.castShadow = true;
    this.scene.add(trunks); this.scene.add(crowns);

    // Street lamps along every road.
    const lampSpots = [];
    for (const c of ROADS) {
      for (let t = -180; t <= 180; t += 36) {
        lampSpots.push([c + ROAD_HALF + 1.2, t]);
        lampSpots.push([c - ROAD_HALF - 1.2, t + 18]);
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 5);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
    const headGeo = new THREE.BoxGeometry(0.9, 0.28, 0.4);
    const headMat = new THREE.MeshLambertMaterial({
      color: 0xffe9b0, emissive: 0xffdf8a, emissiveIntensity: 0.5 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
    lampSpots.forEach(([x, z], i) => {
      e.set(0, 0, 0); q.setFromEuler(e); v.set(x, 3.25, z); s.set(1, 1, 1);
      m.compose(v, q, s); poles.setMatrixAt(i, m);
      v.set(x, 6.6, z); m.compose(v, q, s); heads.setMatrixAt(i, m);
    });
    this.scene.add(poles); this.scene.add(heads);
  }

  _buildClouds() {
    const rng = makeRng(999);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const n = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(randRange(rng, 6, 12), 8, 6), mat);
        puff.position.set(k * 8 - n * 4, randRange(rng, -1, 1), randRange(rng, -4, 4));
        puff.scale.y = 0.45;
        cloud.add(puff);
      }
      cloud.position.set(randRange(rng, -260, 260), randRange(rng, 90, 135), randRange(rng, -260, 260));
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  update(dt, time) {
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 300) c.position.x = -300;
    }
    if (this.foam) this.foam.position.z = OCEAN_Z + 1 + Math.sin(time * 0.7) * 0.8;
  }

  // A random spot on a road, for spawning cars and pedestrians.
  randomRoadPoint(rng) {
    const along = pick(rng, ROADS);
    const across = pick(rng, ROADS);
    const lane = (rng() < 0.5 ? -1 : 1) * 3.5;
    if (rng() < 0.5) return { x: across + lane, z: along, axis: 'x' };
    return { x: along, z: across + lane, axis: 'z' };
  }

  // A random spot on a sidewalk (just off a road).
  randomSidewalkPoint(rng) {
    const c = pick(rng, ROADS);
    const t = randRange(rng, -175, 175);
    const off = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 2.5);
    if (rng() < 0.5) return { x: c + off, z: t };
    return { x: t, z: c + off };
  }

  clampToWorld(x, z) {
    return {
      x: clamp(x, WORLD_MIN_X + 4, WORLD_MAX_X - 4),
      z: clamp(z, WORLD_MIN_Z + 4, WORLD_MAX_Z - 8),
    };
  }
}
