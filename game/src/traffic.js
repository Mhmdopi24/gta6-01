// City traffic: cars that cruise the road grid, turn at intersections and
// brake for the car ahead, plus parked cars the player can steal.

import { Car, CAR_SPECS } from './vehicles.js';
import { ROADS, ROAD_HALF } from './city.js';
import { makeRng, pick, randRange, clamp, angleToward } from './util.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sport'];

export class Traffic {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(4242);
    this.cars = [];
    this.parked = [];
    this.spawnCount = 16;
    this._spawnInitial();
    this._spawnParked();
  }

  _spawnInitial() {
    for (let i = 0; i < this.spawnCount; i++) {
      const car = this._makeTrafficCar(true);
      if (car) this.cars.push(car);
    }
  }

  _makeTrafficCar(anywhere) {
    const rng = this.rng;
    const type = pick(rng, TRAFFIC_TYPES);
    const road = pick(rng, ROADS);
    const along = randRange(rng, -175, 175);
    const lane = (rng() < 0.5 ? -1 : 1) * 3.5;
    let x, z, heading;
    if (rng() < 0.5) {
      x = along; z = road + lane;
      heading = lane > 0 ? 0 : Math.PI; // right-hand traffic: +X lane sits at +3.5
    } else {
      x = road + lane;
      z = along;
      heading = lane > 0 ? -Math.PI / 2 : Math.PI / 2; // +Z lane sits at -3.5
    }
    // Keep away from the player spawn so the opening view is clean.
    if (!anywhere && Math.hypot(x - this.game.player.x, z - this.game.player.z) < 30) return null;
    const car = new Car(this.game.scene, type, x, z, heading, undefined);
    car.speed = randRange(rng, 7, 12);
    car.cruise = car.speed;
    car.axis = Math.abs(Math.cos(heading)) > 0.5 ? 'x' : 'z';
    car.lane = lane;
    return car;
  }

  _spawnParked() {
    const rng = this.rng;
    const spots = [];
    for (let i = 0; i < 26; i++) {
      const road = pick(rng, ROADS);
      const along = randRange(rng, -170, 170);
      const side = (rng() < 0.5 ? -1 : 1) * (ROAD_HALF + 1.6);
      if (rng() < 0.5) spots.push({ x: along, z: road + side, heading: rng() < 0.5 ? 0 : Math.PI });
      else spots.push({ x: road + side, z: along, heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 });
    }
    for (const s of spots) {
      // Do not park inside a building or on the plaza.
      let blocked = false;
      for (const b of this.game.city.colliders) {
        if (s.x > b.minX - 2 && s.x < b.maxX + 2 && s.z > b.minZ - 2 && s.z < b.maxZ + 2) { blocked = true; break; }
      }
      if (blocked) continue;
      const type = pick(rng, ['sedan', 'sedan', 'sport', 'taxi', 'truck']);
      const car = new Car(this.game.scene, type, s.x, s.z, s.heading, undefined);
      car.speed = 0;
      car.parked = true;
      this.parked.push(car);
    }
  }

  update(dt) {
    const player = this.game.player;
    const colliders = this.game.city.colliders;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (!car.alive) { this.cars.splice(i, 1); continue; }
      // Recycle cars that wandered far from the player.
      const dp = Math.hypot(car.x - player.x, car.z - player.z);
      if (dp > 320) {
        const fresh = this._makeTrafficCar(false);
        if (fresh) {
          car.remove();
          this.cars[i] = fresh;
          continue;
        }
      }
      this._driveTraffic(car, dt, colliders);
    }
    // Parked cars stay put; they are only removed when stolen (become player car).
  }

  _driveTraffic(car, dt, colliders) {
    // Slow for the car directly ahead in the same lane.
    let targetSpeed = car.cruise;
    const fx = Math.cos(car.heading), fz = Math.sin(car.heading);
    for (const o of this.cars) {
      if (o === car || !o.alive) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(-dx * fz + dz * fx);
      if (ahead > 0 && ahead < 12 && side < 2.4) { targetSpeed = Math.min(targetSpeed, o.speed * 0.9); break; }
    }
    // Brake for the player car ahead.
    const pc = this.game.player.inCar;
    if (pc) {
      const dx = pc.x - car.x, dz = pc.z - car.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(-dx * fz + dz * fx);
      if (ahead > 0 && ahead < 11 && side < 2.6) targetSpeed = 0;
    }
    car.speed += clamp(targetSpeed - car.speed, -14 * dt, 8 * dt);
    car.speed = clamp(car.speed, 0, CAR_SPECS[car.type].maxSpeed * 0.55);
    // Move.
    const nx = car.x + Math.cos(car.heading) * car.speed * dt;
    const nz = car.z + Math.sin(car.heading) * car.speed * dt;
    car.x = nx; car.z = nz;
    // At an intersection, sometimes turn onto the cross street.
    const nearX = ROADS.find((r) => Math.abs(car.x - r) < 1.6);
    const nearZ = ROADS.find((r) => Math.abs(car.z - r) < 1.6);
    if (nearX !== undefined && nearZ !== undefined && !car.turnedAt) {
      car.turnedAt = `${nearX},${nearZ}`;
      if (this.rng() < 0.3) {
        const turnLeft = this.rng() < 0.5;
        car.heading += turnLeft ? Math.PI / 2 : -Math.PI / 2;
        // Snap onto the new road with the correct right-hand lane offset.
        const lane = 3.5;
        if (Math.abs(Math.cos(car.heading)) > 0.5) {
          // Now travelling along X: lane offset sits in Z.
          car.z = nearZ + (Math.cos(car.heading) > 0 ? lane : -lane);
        } else {
          // Now travelling along Z: lane offset sits in X.
          car.x = nearX + (Math.sin(car.heading) > 0 ? -lane : lane);
        }
      }
    } else if (nearX === undefined || nearZ === undefined) {
      car.turnedAt = null;
    }
    // Stay on the road: if pushed off, steer back is handled by collisions.
    for (const b of colliders) {
      const res = this._resolve(car, b);
      if (res) { car.x = res.x; car.z = res.z; car.speed *= 0.6; }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = -car.heading;
    const spin = car.speed * dt / 0.36;
    for (const w of car.mesh.userData.wheels) w.rotation.y += spin;
  }

  _resolve(car, b) {
    const cx = clamp(car.x, b.minX, b.maxX);
    const cz = clamp(car.z, b.minZ, b.maxZ);
    const dx = car.x - cx, dz = car.z - cz;
    const d2 = dx * dx + dz * dz;
    const r = car.radius;
    if (d2 >= r * r || d2 < 0.000001) return null;
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    return { x: car.x + dx * push, z: car.z + dz * push };
  }

  // The nearest stealable car to (x,z) within range, or null.
  nearestStealable(x, z, range) {
    let best = null, bestD = range;
    const all = [...this.parked, ...this.cars];
    for (const c of all) {
      if (!c.alive || c === this.game.player.inCar) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  // Take a car out of traffic/parking: it becomes the player's car.
  claim(car) {
    const ti = this.cars.indexOf(car);
    if (ti >= 0) {
      this.cars.splice(ti, 1);
      const fresh = this._makeTrafficCar(false);
      if (fresh) this.cars.push(fresh);
    }
    const pi = this.parked.indexOf(car);
    if (pi >= 0) this.parked.splice(pi, 1);
    car.parked = false;
    return car;
  }
}
