// Cars: build a low-poly car mesh, spawn parked and traffic cars, and drive
// the arcade traffic that circulates on Solmar Bay's road grid.
import { makeRng } from './rng.js';
import { BLOCK, GRID, CITY, ROAD, hitsBuilding } from './city.js';

export const CAR_COLORS = [0xc0392b, 0x2471a3, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a1a, 0x7f8c8d, 0x16a085];
export const CAR_NAMES = ['Comet GT', 'Sunrunner', 'Bay Cruiser', 'Palm Runner', 'Street Hawk', 'Coastline LX'];

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a2a44 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 4.4), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }));
  cabin.position.set(0, 1.15, -0.2); g.add(cabin);
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.22, 4.45),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.72; g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.55, -0.2); g.add(bar);
    g.userData.lightBar = bar;
  }
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const [wx, wz] of [[-1.0, 1.4], [1.0, 1.4], [-1.0, -1.4], [1.0, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
  for (const hx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    h.position.set(hx, 0.6, 2.22); g.add(h);
  }
  return g;
}

export class Car {
  constructor(mesh, x, z, heading, name) {
    this.mesh = mesh;
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.name = name || 'Car';
    this.health = 100;
    this.steer = 0;
    this.isPolice = false;
    this.stuck = 0;
    this.updateMesh();
  }
  updateMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }
}

// Traffic cars drive along road centrelines and turn at intersections.
export class Traffic {
  constructor(scene, seed, colliders) {
    this.scene = scene;
    this.rng = makeRng(seed + 77);
    this.colliders = colliders;
    this.cars = [];
    const lanes = [];
    for (let i = 0; i <= GRID; i++) lanes.push(i * BLOCK);
    for (let n = 0; n < 16; n++) {
      const vertical = this.rng.chance(0.5);
      const lane = this.rng.pick(lanes);
      const along = this.rng.range(0, CITY);
      const color = this.rng.pick(CAR_COLORS);
      const mesh = makeCarMesh(color, false);
      scene.add(mesh);
      const car = new Car(mesh, vertical ? lane : along, vertical ? along : lane,
        vertical ? (this.rng.chance(0.5) ? 0 : Math.PI) : (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2),
        this.rng.pick(CAR_NAMES));
      car.speed = this.rng.range(6, 11);
      car.isTraffic = true;
      car.vertical = vertical;
      car.lane = lane;
      this.cars.push(car);
    }
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      // Drive forward; at a road end or intersection, sometimes turn.
      const dx = Math.sin(car.heading), dz = Math.cos(car.heading);
      let nx = car.x + dx * car.speed * dt;
      let nz = car.z + dz * car.speed * dt;
      const nearIntersection = Math.abs(((nx % BLOCK) + BLOCK) % BLOCK) < 3 ||
        Math.abs(((nz % BLOCK) + BLOCK) % BLOCK) < 3;
      if (nx < 4 || nx > CITY - 4 || nz < 4 || nz > CITY - 4) {
        car.heading += Math.PI / 2; // U-turn around the block at the edge
        nx = car.x; nz = car.z;
      } else if (nearIntersection && this.rng.chance(dt * 0.35)) {
        car.heading += this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
        nx = car.x; nz = car.z;
      }
      // Don't pile into the player's car.
      if (playerCar) {
        const ddx = nx - playerCar.x, ddz = nz - playerCar.z;
        if (ddx * ddx + ddz * ddz < 30) { nx = car.x; nz = car.z; car.speed = Math.max(0, car.speed - 20 * dt); }
        else car.speed = Math.min(car.speed + 4 * dt, 10);
      }
      if (!hitsBuilding(this.colliders, nx, nz, 2.2)) { car.x = nx; car.z = nz; }
      else { car.heading += Math.PI / 2; }
      car.updateMesh();
    }
  }
}

export function spawnParkedCars(scene, rng, colliders) {
  const parked = [];
  const lanes = [];
  for (let i = 0; i <= GRID; i++) lanes.push(i * BLOCK);
  for (let n = 0; n < 14; n++) {
    const vertical = rng.chance(0.5);
    const lane = rng.pick(lanes);
    const along = rng.range(10, CITY - 10);
    const off = (vertical ? 1 : -1) * (ROAD / 2 - 2.4);
    const x = vertical ? lane + off : along;
    const z = vertical ? along : lane + off;
    if (hitsBuilding(colliders, x, z, 3)) continue;
    const mesh = makeCarMesh(rng.pick(CAR_COLORS), false);
    scene.add(mesh);
    const car = new Car(mesh, x, z, vertical ? 0 : Math.PI / 2, rng.pick(CAR_NAMES));
    car.isParked = true;
    parked.push(car);
  }
  return parked;
}
