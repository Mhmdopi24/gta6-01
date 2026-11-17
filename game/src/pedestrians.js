// Pedestrians of Solmarina: shoppers and strollers who walk the sidewalks,
// turn at intersections, and run screaming (well, fleeing) from speeding
// cars, gunfire and punches.

import { buildPersonMesh } from './player.js';
import { makeRng, pick, randRange, clamp, angleToward, dist2D } from './util.js';
import { ROADS, ROAD_HALF } from './city.js';

const PED_SHIRTS = [0xc25a4a, 0x4a7fc2, 0x7fb04a, 0xd8c23a, 0x9a5fb0, 0x5fb0a8, 0xe0e0e0, 0x3a3f46];
const PED_SKINS = [0xc98d64, 0x8a5a3b, 0xe8b88a, 0x6e4530];

class Ped {
  constructor(game, x, z) {
    this.game = game;
    const rng = game.pedRng;
    this.mesh = buildPersonMesh({
      shirt: pick(rng, PED_SHIRTS),
      skin: pick(rng, PED_SKINS),
      hair: pick(rng, [0x1c1410, 0x3a2a18, 0x777777, 0x8a5a20, 0x222222]),
    });
    game.scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.speed = randRange(rng, 1.2, 2.0);
    this.alive = true;
    this.down = false;
    this.downTimer = 0;
    this.health = 40;
    this.fleeing = false;
    this.fleeTimer = 0;
    this.walkPhase = rng() * 10;
    this.axis = rng() < 0.5 ? 'x' : 'z';
    this.dir = rng() < 0.5 ? 1 : -1;
    this.mesh.position.set(x, 0, z);
  }

  hitByPlayer(dmg, fromHeading) {
    if (this.down) return;
    this.health -= dmg;
    this.game.effects.poof(this.x, 1.2, this.z);
    if (this.health <= 0) {
      this.down = true;
      this.downTimer = 4;
      this.mesh.rotation.x = -Math.PI / 2; // fall flat
      this.mesh.position.y = 0.35;
      this.game.police.commitCrime(1, 'pedestrian down');
    } else {
      this.fleeing = true;
      this.fleeTimer = 5;
    }
  }

  update(dt) {
    if (!this.alive) return;
    if (this.down) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        // Get up elsewhere in the city.
        const p = this.game.city.randomSidewalkPoint(this.game.pedRng);
        this.x = p.x; this.z = p.z;
        this.health = 40;
        this.down = false;
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
      }
      return;
    }
    const player = this.game.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    const playerSpeed = player.inCar ? Math.abs(player.inCar.speed) : 0;
    const dPlayer = dist2D(this.x, this.z, px, pz);
    // Flee from a fast car nearby, or from gunfire.
    if ((player.inCar && dPlayer < 14 && playerSpeed > 8) || this.game.gunfireTimer > 0 && dPlayer < 25) {
      this.fleeing = true;
      this.fleeTimer = 3;
    }
    this.fleeTimer = Math.max(0, this.fleeTimer - dt);
    if (this.fleeTimer <= 0) this.fleeing = false;

    let speed = this.fleeing ? 5.5 : this.speed;
    let hx, hz;
    if (this.fleeing) {
      // Run away from the player.
      const dx = this.x - px, dz = this.z - pz;
      const d = Math.hypot(dx, dz) || 1;
      hx = dx / d; hz = dz / d;
    } else {
      // Stroll along the current axis.
      if (this.axis === 'x') { hx = this.dir; hz = 0; }
      else { hx = 0; hz = this.dir; }
      // Turn at intersections.
      const nearX = ROADS.find((r) => Math.abs(this.x - r) < 1.2);
      const nearZ = ROADS.find((r) => Math.abs(this.z - r) < 1.2);
      if (nearX !== undefined && nearZ !== undefined && !this.turnedAt) {
        this.turnedAt = `${nearX},${nearZ}`;
        if (this.game.pedRng() < 0.35) {
          this.axis = this.axis === 'x' ? 'z' : 'x';
          this.dir = this.game.pedRng() < 0.5 ? 1 : -1;
        } else if (this.game.pedRng() < 0.12) {
          this.dir *= -1;
        }
      } else if (nearX === undefined || nearZ === undefined) {
        this.turnedAt = null;
      }
    }
    const targetHeading = Math.atan2(hz, hx);
    this.heading = angleToward(this.heading, targetHeading, dt * 8);
    this.x += Math.cos(this.heading) * speed * dt;
    this.z += Math.sin(this.heading) * speed * dt;
    // Stay on sidewalks: clamp back into the city and away from buildings.
    const c = this.game.city.clampToWorld(this.x, this.z);
    this.x = c.x; this.z = c.z;
    for (const b of this.game.city.colliders) {
      const cx = clamp(this.x, b.minX, b.maxX);
      const cz = clamp(this.z, b.minZ, b.maxZ);
      const dx = this.x - cx, dz = this.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.36 && d2 > 0.000001) {
        const d = Math.sqrt(d2);
        this.x = cx + (dx / d) * 0.6;
        this.z = cz + (dz / d) * 0.6;
      }
    }
    this.walkPhase += dt * (this.fleeing ? 13 : 7);
    const swing = Math.sin(this.walkPhase) * 0.6;
    const u = this.mesh.userData;
    u.legL.rotation.z = swing;
    u.legR.rotation.z = -swing;
    u.armL.rotation.z = -swing * 0.7;
    u.armR.rotation.z = swing * 0.7;
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.walkPhase)) * 0.04, this.z);
    this.mesh.rotation.y = -this.heading;
  }
}

export class Pedestrians {
  constructor(game) {
    this.game = game;
    this.list = [];
    for (let i = 0; i < 26; i++) {
      const p = game.city.randomSidewalkPoint(game.pedRng);
      this.list.push(new Ped(game, p.x, p.z));
    }
  }

  update(dt) {
    for (const p of this.list) p.update(dt);
  }

  // Hit test for cars: returns peds hit this frame (for wanted/cash logic).
  checkCarHit(car) {
    const hits = [];
    for (const p of this.list) {
      if (!p.alive || p.down) continue;
      if (dist2D(p.x, p.z, car.x, car.z) < 2.0 && Math.abs(car.speed) > 3) {
        p.hitByPlayer(100, car.heading);
        hits.push(p);
      }
    }
    return hits;
  }
}
