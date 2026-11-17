// People: pedestrians strolling the sidewalks who flee danger, and
// on-foot police officers who chase and try to bust the player.
import { makeRng } from './rng.js';
import { BLOCK, CITY, ROAD, hitsBuilding } from './city.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf39c12, 0x2ecc71, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xe67e22];
const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

export function makePersonMesh(shirt, skin, isPolice) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a2a44 : 0x2c3e50 });
  for (const lx of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, 0.32), legMat);
    leg.position.set(lx, 0.4, 0); g.add(leg);
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.45),
    new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a2a44 : shirt }));
  body.position.y = 1.25; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 2.0; g.add(head);
  if (isPolice) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.56),
      new THREE.MeshLambertMaterial({ color: 0x101c2e }));
    cap.position.y = 2.3; g.add(cap);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.52),
      new THREE.MeshLambertMaterial({ color: 0x2a1a0a }));
    hair.position.y = 2.28; g.add(hair);
  }
  const armMat = new THREE.MeshLambertMaterial({ color: skin });
  for (const ax of [-0.55, 0.55]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), armMat);
    arm.position.set(ax, 1.3, 0); g.add(arm);
  }
  return g;
}

export class Ped {
  constructor(mesh, x, z) {
    this.mesh = mesh;
    this.x = x; this.z = z;
    this.heading = 0;
    this.speed = 1.4;
    this.state = 'walk';   // walk | flee | down
    this.fleeT = 0;
    this.health = 100;
    this.updateMesh();
  }
  updateMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

export class Crowd {
  constructor(scene, seed, colliders) {
    this.scene = scene;
    this.rng = makeRng(seed + 31);
    this.colliders = colliders;
    this.peds = [];
    for (let n = 0; n < 26; n++) {
      const bx = this.rng.int(0, 6), bz = this.rng.int(0, 6);
      const x = bx * BLOCK + this.rng.range(ROAD + 2, BLOCK - 2);
      const z = bz * BLOCK + this.rng.range(ROAD + 2, BLOCK - 2);
      if (hitsBuilding(colliders, x, z, 1)) continue;
      const mesh = makePersonMesh(this.rng.pick(SHIRTS), this.rng.pick(SKINS), false);
      scene.add(mesh);
      const ped = new Ped(mesh, x, z);
      ped.heading = this.rng.range(0, Math.PI * 2);
      ped.speed = this.rng.range(1.0, 2.0);
      this.peds.push(ped);
    }
  }

  update(dt, danger) {
    // danger: {x, z, radius} or null — peds inside it run away.
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      let fleeing = false;
      if (danger) {
        const dx = ped.x - danger.x, dz = ped.z - danger.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < danger.radius * danger.radius) {
          ped.state = 'flee'; ped.fleeT = 2.5; fleeing = true;
          ped.heading = Math.atan2(dx, dz);
        }
      }
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        if (ped.fleeT <= 0) ped.state = 'walk';
      }
      const speed = ped.state === 'flee' ? 5.2 : ped.speed;
      const nx = ped.x + Math.sin(ped.heading) * speed * dt;
      const nz = ped.z + Math.cos(ped.heading) * speed * dt;
      if (nx < 3 || nx > CITY - 3 || nz < 3 || nz > CITY + 30 || hitsBuilding(this.colliders, nx, nz, 0.8)) {
        ped.heading += Math.PI / 2 + this.rng.range(-0.5, 0.5);
      } else {
        ped.x = nx; ped.z = nz;
        if (ped.state === 'walk' && this.rng.chance(dt * 0.08)) ped.heading += this.rng.range(-1, 1);
      }
      // Little walk bob.
      ped.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.008 + ped.x)) * 0.08;
      ped.updateMesh();
      ped.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.008 + ped.x)) * 0.08;
    }
  }
}

export class Officers {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }
  spawn(x, z) {
    const mesh = makePersonMesh(0x1a2a44, 0xf1c27d, true);
    this.scene.add(mesh);
    const o = new Ped(mesh, x, z);
    o.speed = 5.6;
    o.isOfficer = true;
    this.list.push(o);
    return o;
  }
  clear() {
    for (const o of this.list) this.scene.remove(o.mesh);
    this.list = [];
  }
  update(dt, px, pz, onBust) {
    for (const o of this.list) {
      if (o.state === 'down') continue;
      const dx = px - o.x, dz = pz - o.z;
      const d = Math.hypot(dx, dz) || 1;
      o.heading = Math.atan2(dx, dz);
      o.x += (dx / d) * o.speed * dt;
      o.z += (dz / d) * o.speed * dt;
      o.updateMesh();
      if (d < 2.2) onBust(dt);
    }
  }
}
