// Rook, the player character: a low-poly third-person figure built from
// boxes, with walk/run animation, jumping, punching and pistol combat.

import * as THREE from 'three';
import { clamp, angleToward, resolveCircleAABB, dist2D } from './util.js';

const SHIRT = 0x2e6f8e;
const PANTS = 0x333a44;
const SKIN = 0xc98d64;

function limb(w, h, d, color, px, py, pz) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0); // pivot at the joint
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(px, py, pz);
  mesh.castShadow = true;
  return mesh;
}

// Build a simple humanoid. The returned group faces +X when rotation.y = -heading.
export function buildPersonMesh(opts = {}) {
  const shirt = opts.shirt !== undefined ? opts.shirt : SHIRT;
  const pants = opts.pants !== undefined ? opts.pants : PANTS;
  const skin = opts.skin !== undefined ? opts.skin : SKIN;
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34),
    new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.22;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  // Hair cap.
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.34),
    new THREE.MeshLambertMaterial({ color: opts.hair || 0x1c1410 }));
  hair.position.y = 1.92;
  g.add(hair);
  const armL = limb(0.16, 0.58, 0.16, shirt, 0, 1.5, 0.26);
  const armR = limb(0.16, 0.58, 0.16, shirt, 0, 1.5, -0.26);
  const legL = limb(0.19, 0.62, 0.19, pants, 0, 0.92, 0.12);
  const legR = limb(0.19, 0.62, 0.19, pants, 0, 0.92, -0.12);
  g.add(armL, armR, legL, legR);
  g.userData = { armL, armR, legL, legR, torso, head };
  return g;
}

export class Player {
  constructor(game) {
    this.game = game;
    this.mesh = buildPersonMesh();
    game.scene.add(this.mesh);
    this.x = 0; this.z = 0;
    this.y = 0; // jump height
    this.vy = 0;
    this.heading = 0; // facing, radians; 0 = +X
    this.walkPhase = 0;
    this.moving = false;
    this.inCar = null; // Car instance when driving
    this.health = 100;
    this.weapon = 'fists'; // or 'pistol'
    this.ammo = 24;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.punchAnim = 0;
    this.hurtFlash = 0;
    this.dead = false;
  }

  get pos() { return { x: this.x, z: this.z }; }

  place(x, z, heading = 0) {
    this.x = x; this.z = z; this.heading = heading; this.y = 0; this.vy = 0;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = -heading;
    this.mesh.visible = true;
  }

  // On-foot movement, camera-relative. camYaw is the camera yaw in radians.
  updateOnFoot(dt, input, camYaw) {
    if (this.dead || this.inCar) return;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 9.5 : 5.2;
    const mx = input.moveX();
    const my = input.moveY();
    this.moving = (mx !== 0 || my !== 0);
    if (this.moving) {
      // Camera-relative: W moves away from the camera.
      const fwdX = Math.cos(camYaw), fwdZ = Math.sin(camYaw);
      const rightX = -Math.sin(camYaw), rightZ = Math.cos(camYaw);
      let dx = fwdX * my + rightX * mx;
      let dz = fwdZ * my + rightZ * mx;
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
      const targetHeading = Math.atan2(dz, dx);
      this.heading = angleToward(this.heading, targetHeading, dt * 12);
      const nx = this.x + dx * speed * dt;
      const nz = this.z + dz * speed * dt;
      this.x = nx; this.z = nz;
      this.walkPhase += dt * (sprint ? 13 : 9);
    }
    // Jump.
    if (input.pressed('Space') && this.y <= 0.01) {
      this.vy = 6.5;
      this.y = 0.01;
    }
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
    }
    // Building collision.
    for (const b of this.game.city.colliders) {
      const res = resolveCircleAABB(this.x, this.z, 0.55, b);
      if (res) { this.x = res.x; this.z = res.z; }
    }
    const c = this.game.city.clampToWorld(this.x, this.z);
    this.x = c.x; this.z = c.z;
    // Animate limbs.
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.75 : 0;
    const u = this.mesh.userData;
    u.legL.rotation.z = swing;
    u.legR.rotation.z = -swing;
    u.armL.rotation.z = -swing * 0.8 + this.punchAnim * 1.4;
    u.armR.rotation.z = swing * 0.8;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = -this.heading;
    // Bob while running.
    this.mesh.position.y = this.y + (this.moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.punchAnim = Math.max(0, this.punchAnim - dt * 4);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
  }

  // Punch: hits the nearest ped / officer / cop car in front within range.
  tryPunch() {
    if (this.punchCooldown > 0 || this.inCar || this.dead) return false;
    this.punchCooldown = 0.45;
    this.punchAnim = 1;
    this.game.audio.punch();
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading);
    const hit = (tx, tz, range) => {
      const dx = tx - this.x, dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > range) return false;
      return (dx * fx + dz * fz) / (d || 1) > 0.35;
    };
    // Peds and officers.
    for (const p of this.game.peds.list) {
      if (!p.alive || p.down) continue;
      if (hit(p.x, p.z, 2.2)) {
        p.hitByPlayer(30, this.heading);
        this.game.police.commitCrime(1, 'assault');
        return true;
      }
    }
    for (const o of this.game.police.officers) {
      if (!o.alive) continue;
      if (hit(o.x, o.z, 2.2)) {
        o.damage(30);
        this.game.police.commitCrime(1, 'assault');
        return true;
      }
    }
    return false;
  }

  // Shoot the pistol: raycast against peds, officers and cars.
  tryShoot(camDir) {
    if (this.weapon !== 'pistol' || this.shootCooldown > 0 || this.inCar || this.dead) return false;
    if (this.ammo <= 0) { this.game.audio.denied(); this.game.hud.toast('OUT OF AMMO', 'Find ammo at the safehouse'); return false; }
    this.shootCooldown = 0.28;
    this.ammo--;
    this.game.audio.gunshot();
    const ox = this.x, oy = 1.45, oz = this.z;
    const dx = camDir.x, dy = camDir.y, dz = camDir.z;
    const mx = ox + dx * 1.2, my = oy + dy * 1.2, mz = oz + dz * 1.2;
    this.game.effects.muzzle(mx, my, mz, dx, dz);
    let best = 60, bestTarget = null, bestKind = null;
    const testPoint = (tx, ty, tz, radius) => {
      const px = tx - ox, py = ty - oy, pz = tz - oz;
      const t = px * dx + py * dy + pz * dz;
      if (t < 0 || t > best) return;
      const cx = ox + dx * t, cy = oy + dy * t, cz = oz + dz * t;
      const dd = Math.hypot(tx - cx, ty - cy, tz - cz);
      if (dd < radius) { best = t; bestTarget = { x: tx, y: ty, z: tz }; bestKind = 'point'; }
    };
    for (const p of this.game.peds.list) {
      if (p.alive && !p.down) testPoint(p.x, 1.1, p.z, 1.1);
    }
    for (const o of this.game.police.officers) {
      if (o.alive) testPoint(o.x, 1.1, o.z, 1.1);
    }
    // Cars: test their center.
    const allCars = [...this.game.traffic.cars, ...this.game.police.cars, ...this.game.parkedCars];
    for (const c of allCars) {
      if (c.alive) testPoint(c.x, 0.9, c.z, 2.2);
    }
    this.game.police.commitCrime(1, 'shooting');
    if (bestTarget) {
      this.game.effects.sparks(bestTarget.x, bestTarget.y, bestTarget.z, 10);
      // Apply damage to whatever was hit.
      for (const p of this.game.peds.list) {
        if (p.alive && !p.down && dist2D(p.x, p.z, bestTarget.x, bestTarget.z) < 1.2) p.hitByPlayer(50, this.heading);
      }
      for (const o of this.game.police.officers) {
        if (o.alive && dist2D(o.x, o.z, bestTarget.x, bestTarget.z) < 1.2) o.damage(50);
      }
      void bestKind;
    }
    return true;
  }

  damage(amount, fromX, fromZ) {
    if (this.dead) return;
    this.health -= amount;
    this.hurtFlash = 0.5;
    this.game.audio.crash(0.6);
    if (fromX !== undefined) {
      // Small knockback away from the source.
      const dx = this.x - fromX, dz = this.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      this.x += (dx / d) * 0.6;
      this.z += (dz / d) * 0.6;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }

  die() {
    this.dead = true;
    this.game.onPlayerWasted();
  }

  enterCar(car) {
    this.inCar = car;
    this.mesh.visible = false;
    this.game.audio.pickup();
  }

  exitCar() {
    const car = this.inCar;
    if (!car) return;
    this.inCar = null;
    // Step out to the driver's side (left of the car, -Z local).
    const sideX = -Math.sin(car.heading), sideZ = Math.cos(car.heading);
    this.place(car.x + sideX * 2.2, car.z + sideZ * 2.2, car.heading);
    this.mesh.visible = true;
  }

  heal(amount) { this.health = clamp(this.health + amount, 0, 100); }
}
