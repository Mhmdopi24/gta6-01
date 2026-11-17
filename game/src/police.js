// The Solmarina Police Department: wanted stars, pursuing patrol cars
// that ram the player, and officers on foot who chase and punch. Heat
// decays when the player lays low.

import { Car } from './vehicles.js';
import { buildPersonMesh } from './player.js';
import { makeRng, clamp, angleToward, dist2D } from './util.js';

const MAX_STARS = 5;

class Officer {
  constructor(game, x, z) {
    this.game = game;
    this.mesh = buildPersonMesh({
      shirt: 0x1e3a5f, pants: 0x1e2a38, skin: 0xc98d64, hair: 0x111111,
    });
    game.scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = 0;
    this.speed = 5.6;
    this.alive = true;
    this.health = 50;
    this.punchCooldown = 0;
    this.walkPhase = Math.random() * 10;
  }

  damage(amount) {
    this.health -= amount;
    this.game.effects.poof(this.x, 1.2, this.z);
    if (this.health <= 0) {
      this.alive = false;
      this.game.scene.remove(this.mesh);
      this.game.police.commitCrime(1, 'officer down');
    }
  }

  update(dt) {
    if (!this.alive) return;
    const player = this.game.player;
    const tx = player.inCar ? player.inCar.x : player.x;
    const tz = player.inCar ? player.inCar.z : player.z;
    const d = dist2D(this.x, this.z, tx, tz);
    if (player.inCar) {
      // On foot officers cannot catch a car: run to the roadside and hold.
      this.punchCooldown = Math.max(0, this.punchCooldown - dt);
      return;
    }
    if (d > 90) { this.alive = false; this.game.scene.remove(this.mesh); return; }
    const targetHeading = Math.atan2(tz - this.z, tx - this.x);
    this.heading = angleToward(this.heading, targetHeading, dt * 9);
    if (d > 1.7) {
      this.x += Math.cos(this.heading) * this.speed * dt;
      this.z += Math.sin(this.heading) * this.speed * dt;
      this.walkPhase += dt * 11;
    } else if (this.punchCooldown <= 0) {
      // Punch the player.
      this.punchCooldown = 1.1;
      this.game.audio.punch();
      player.damage(8, this.x, this.z);
    }
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    for (const b of this.game.city.colliders) {
      const cx = clamp(this.x, b.minX, b.maxX);
      const cz = clamp(this.z, b.minZ, b.maxZ);
      const dx = this.x - cx, dz = this.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.36 && d2 > 0.000001) {
        const dd = Math.sqrt(d2);
        this.x = cx + (dx / dd) * 0.6;
        this.z = cz + (dz / dd) * 0.6;
      }
    }
    const swing = Math.sin(this.walkPhase) * 0.65;
    const u = this.mesh.userData;
    u.legL.rotation.z = swing;
    u.legR.rotation.z = -swing;
    u.armL.rotation.z = -swing * 0.7;
    u.armR.rotation.z = swing * 0.7;
    this.mesh.position.set(this.x, Math.abs(Math.sin(this.walkPhase)) * 0.04, this.z);
    this.mesh.rotation.y = -this.heading;
  }
}

export class Police {
  constructor(game) {
    this.game = game;
    this.rng = makeRng(777);
    this.stars = 0; // float; displayed as ceil
    this.cars = [];
    this.officers = [];
    this.lastCrimeTime = -999;
    this.decayTimer = 0;
    this.spawnTimer = 0;
    this.officerTimer = 0;
    this.ramCooldown = 0;
  }

  get wanted() { return Math.min(MAX_STARS, Math.ceil(this.stars)); }

  commitCrime(amount, kind) {
    if (this.game.state !== 'playing') return;
    this.stars = clamp(this.stars + amount, 0, MAX_STARS);
    this.lastCrimeTime = this.game.time;
    this.decayTimer = 0;
    if (this.stars >= 1 && this.game.hud) {
      this.game.hud.toast('WANTED — ' + kind.toUpperCase(), this.wanted + ' star' + (this.wanted > 1 ? 's' : ''));
    }
  }

  setWanted(n) {
    this.stars = clamp(n, 0, MAX_STARS);
    this.lastCrimeTime = this.game.time;
  }

  clear() {
    this.stars = 0;
    for (const c of this.cars) c.remove();
    this.cars = [];
    for (const o of this.officers) {
      o.alive = false;
      this.game.scene.remove(o.mesh);
    }
    this.officers = [];
  }

  _spawnCar() {
    const player = this.game.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    // Spawn on a road 60-90 units away from the player.
    const a = this.rng() * Math.PI * 2;
    const d = 65 + this.rng() * 25;
    let x = px + Math.cos(a) * d;
    let z = pz + Math.sin(a) * d;
    const c = this.game.city.clampToWorld(x, z);
    x = c.x; z = c.z;
    const heading = Math.atan2(pz - z, px - x);
    const car = new Car(this.game.scene, 'police', x, z, heading, 0x1c2733);
    car.speed = 12;
    this.cars.push(car);
    this.game.audio.horn();
  }

  _spawnOfficer() {
    const player = this.game.player;
    if (player.inCar) return;
    const a = this.rng() * Math.PI * 2;
    const d = 22 + this.rng() * 12;
    const x = player.x + Math.cos(a) * d;
    const z = player.z + Math.sin(a) * d;
    const c = this.game.city.clampToWorld(x, z);
    this.officers.push(new Officer(this.game, c.x, c.z));
  }

  update(dt) {
    const player = this.game.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);

    // Wanted decay: after 20 quiet seconds, lose a star every 9 seconds.
    if (this.stars > 0 && this.game.time - this.lastCrimeTime > 20) {
      this.decayTimer += dt;
      if (this.decayTimer > 9) {
        this.decayTimer = 0;
        this.stars = Math.max(0, this.stars - 1);
        if (this.stars === 0) this.game.hud.toast('HEAT OFF', 'You laid low — the SPPD lost you');
      }
    }

    const wantCars = this.wanted > 0 ? Math.min(this.wanted, 3) : 0;
    const wantOfficers = !player.inCar && this.wanted > 0 ? Math.min(this.wanted * 2, 6) : 0;
    this.spawnTimer -= dt;
    if (this.cars.length < wantCars && this.spawnTimer <= 0) {
      this._spawnCar();
      this.spawnTimer = 2.5;
    }
    this.officerTimer -= dt;
    if (this.officers.filter((o) => o.alive).length < wantOfficers && this.officerTimer <= 0) {
      this._spawnOfficer();
      this.officerTimer = 1.8;
    }
    // Police cars give up when the heat is off.
    if (this.wanted === 0) {
      for (const car of this.cars) {
        const d = dist2D(car.x, car.z, px, pz);
        if (d > 120) { car.remove(); }
      }
      this.cars = this.cars.filter((c) => c.alive);
      for (const o of this.officers) {
        if (o.alive) { o.alive = false; this.game.scene.remove(o.mesh); }
      }
      this.officers = this.officers.filter((o) => o.alive);
      return;
    }

    // Pursue.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (!car.alive) { this.cars.splice(i, 1); continue; }
      const d = dist2D(car.x, car.z, px, pz);
      if (d > 260) { car.remove(); this.cars.splice(i, 1); continue; }
      const targetHeading = Math.atan2(pz - car.z, px - car.x);
      car.heading = angleToward(car.heading, targetHeading, dt * 2.2);
      const targetSpeed = d > 25 ? 34 : 30;
      car.speed += clamp(targetSpeed - car.speed, -18 * dt, 16 * dt);
      const nx = car.x + Math.cos(car.heading) * car.speed * dt;
      const nz = car.z + Math.sin(car.heading) * car.speed * dt;
      car.x = nx; car.z = nz;
      for (const b of this.game.city.colliders) {
        const cx = clamp(car.x, b.minX, b.maxX);
        const cz = clamp(car.z, b.minZ, b.maxZ);
        const dx = car.x - cx, dz = car.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < car.radius * car.radius && d2 > 0.000001) {
          const dd = Math.sqrt(d2);
          car.x = cx + (dx / dd) * car.radius;
          car.z = cz + (dz / dd) * car.radius;
          car.speed *= 0.7;
        }
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = -car.heading;
      const spin = car.speed * dt / 0.36;
      for (const w of car.mesh.userData.wheels) w.rotation.y += spin;
      // Ram the player's car.
      if (player.inCar && d < 4.6 && this.ramCooldown <= 0) {
        this.ramCooldown = 1.2;
        const push = 6;
        player.inCar.x += Math.cos(car.heading) * push * 0.4;
        player.inCar.z += Math.sin(car.heading) * push * 0.4;
        player.inCar.speed *= 0.75;
        player.damage(6, car.x, car.z);
        this.game.effects.sparks(player.inCar.x, 1, player.inCar.z, 12);
        this.game.audio.crash(1);
        this.game.shake = 0.5;
      }
      // Ram a player on foot (knock them down).
      if (!player.inCar && d < 2.2 && this.ramCooldown <= 0) {
        this.ramCooldown = 1.4;
        player.damage(14, car.x, car.z);
        this.game.effects.poof(player.x, 1, player.z);
        this.game.shake = 0.7;
      }
    }
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      if (!o.alive) { this.officers.splice(i, 1); continue; }
      o.update(dt);
    }
  }
}
