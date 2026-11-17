// Cars of Solmarina: factory that builds low-poly cars from boxes and
// cylinders, plus arcade driving physics (accelerate, brake, steer, drift)
// and building / car collision handling.

import * as THREE from 'three';
import { clamp, angleToward, resolveCircleAABB, dist2D } from './util.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3a3f46, 0xd8d8d8, 0x4a9e5c, 0x8a4fb0, 0xe07b28, 0x2fb3a8];

export const CAR_SPECS = {
  sedan:   { maxSpeed: 31, accel: 15, brake: 30, grip: 7.5, name: 'Marlin Sedan' },
  sport:   { maxSpeed: 40, accel: 20, brake: 34, grip: 8.5, name: 'Comet GT' },
  taxi:    { maxSpeed: 30, accel: 14, brake: 30, grip: 7.5, name: 'Harbor Taxi' },
  truck:   { maxSpeed: 24, accel: 11, brake: 26, grip: 6.5, name: 'Dune Hauler' },
  police:  { maxSpeed: 36, accel: 19, brake: 34, grip: 8.5, name: 'SPPD Interceptor' },
};

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    emissive: opts.emissive || 0x000000,
    emissiveIntensity: opts.emissiveIntensity || 0,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// Build a car mesh. Returns a THREE.Group whose forward axis is -Z... no:
// forward is +X in our driving math (heading 0 faces +X). The group is built
// facing +X: length along X, width along Z.
export function buildCarMesh(type, color) {
  const g = new THREE.Group();
  const bodyColor = color !== undefined ? color : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const long = type === 'truck' ? 5.2 : 4.3;
  const wide = 1.95;
  // Main body.
  g.add(box(long, 0.62, wide, bodyColor, 0, 0.62, 0));
  // Hood / trunk shaping.
  g.add(box(long * 0.42, 0.3, wide * 0.94, bodyColor, long * 0.22, 1.05, 0));
  // Cabin.
  const cabinLen = type === 'truck' ? 1.5 : 2.1;
  const cabinX = type === 'truck' ? long * 0.28 : -long * 0.08;
  const cabin = box(cabinLen, 0.62, wide * 0.82, 0x1c2733, cabinX, 1.32, 0);
  cabin.castShadow = true;
  g.add(cabin);
  // Roof.
  g.add(box(cabinLen * 0.92, 0.1, wide * 0.78, bodyColor, cabinX, 1.66, 0));
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
  const wheels = [];
  for (const [wx, wz] of [[long * 0.32, wide / 2], [long * 0.32, -wide / 2], [-long * 0.32, wide / 2], [-long * 0.32, -wide / 2]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(wheel.position);
    g.add(wheel); g.add(hub);
    wheels.push(wheel);
  }
  // Headlights (front = +X) and taillights.
  g.add(box(0.08, 0.18, 0.42, 0xfff6c8, long / 2 + 0.01, 0.72, wide / 2 - 0.32, { emissive: 0xfff2a8, emissiveIntensity: 0.9 }));
  g.add(box(0.08, 0.18, 0.42, 0xfff6c8, long / 2 + 0.01, 0.72, -wide / 2 + 0.32, { emissive: 0xfff2a8, emissiveIntensity: 0.9 }));
  g.add(box(0.08, 0.16, 0.4, 0xff2a1e, -long / 2 - 0.01, 0.72, wide / 2 - 0.32, { emissive: 0xff2a1e, emissiveIntensity: 0.7 }));
  g.add(box(0.08, 0.16, 0.4, 0xff2a1e, -long / 2 - 0.01, 0.72, -wide / 2 + 0.32, { emissive: 0xff2a1e, emissiveIntensity: 0.7 }));
  if (type === 'taxi') {
    g.add(box(0.9, 0.28, 0.7, 0xffe14d, cabinX, 1.86, 0, { emissive: 0xffe14d, emissiveIntensity: 0.4 }));
  }
  if (type === 'police') {
    g.add(box(0.7, 0.22, 0.5, 0xff2020, cabinX, 1.8, 0.45, { emissive: 0xff2020, emissiveIntensity: 1 }));
    g.add(box(0.7, 0.22, 0.5, 0x2040ff, cabinX, 1.8, -0.45, { emissive: 0x2040ff, emissiveIntensity: 1 }));
    // White doors read as a patrol car at a glance.
    g.add(box(long * 0.34, 0.5, wide + 0.02, 0xf0f0f0, -long * 0.05, 0.66, 0));
  }
  g.userData.wheels = wheels;
  return g;
}

export class Car {
  constructor(scene, type, x, z, heading, color) {
    this.scene = scene;
    this.type = type;
    this.spec = CAR_SPECS[type];
    this.mesh = buildCarMesh(type, color);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.radius = 2.4;
    this.alive = true;
    this.drifting = false;
    this.sirenPhase = Math.random() * 2;
  }

  get pos() { return { x: this.x, z: this.z }; }

  // Drive with arcade physics. input: {throttle -1..1, steer -1..1, brake bool}
  drive(dt, input, colliders, otherCars) {
    const spec = this.spec;
    const prevSpeed = this.speed;
    if (input.throttle > 0) this.speed += spec.accel * input.throttle * dt;
    else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= spec.brake * dt;
      else this.speed += spec.accel * 0.55 * input.throttle * dt; // reverse
    } else {
      this.speed -= Math.sign(this.speed) * 6 * dt;
      if (Math.abs(this.speed) < 0.2) this.speed = 0;
    }
    this.speed = clamp(this.speed, -11, spec.maxSpeed);
    if (input.brake) {
      this.speed -= Math.sign(this.speed) * 22 * dt;
      this.drifting = Math.abs(this.speed) > 8;
    } else {
      this.drifting = false;
    }
    // Steering weakens at very low speed, bites harder when drifting.
    const steerTarget = input.steer * (this.drifting ? 1.35 : 1);
    this.steer = angleToward(this.steer, steerTarget, dt * 6);
    const turnRate = this.steer * (this.drifting ? 1.9 : 1.25) * clamp(Math.abs(this.speed) / 9, 0, 1);
    this.heading += turnRate * Math.sign(this.speed) * dt * 1.6;
    const nx = this.x + Math.cos(this.heading) * this.speed * dt;
    const nz = this.z + Math.sin(this.heading) * this.speed * dt;
    this.x = nx; this.z = nz;
    // Building collision: slide along walls, lose speed on impact.
    let hit = false;
    for (const b of colliders) {
      const res = resolveCircleAABB(this.x, this.z, this.radius, b);
      if (res) {
        this.x = res.x; this.z = res.z;
        const impact = Math.abs(this.speed);
        if (impact > 6) hit = true;
        // Kill the velocity component into the wall.
        const vx = Math.cos(this.heading) * this.speed;
        const vz = Math.sin(this.heading) * this.speed;
        const into = vx * res.nx + vz * res.nz;
        if (into < 0) {
          const nx2 = vx - res.nx * into, nz2 = vz - res.nz * into;
          this.speed = Math.sign(this.speed) * Math.sqrt(nx2 * nx2 + nz2 * nz2) * 0.6;
        }
      }
    }
    // Car-car collision: push apart.
    for (const o of otherCars) {
      if (o === this || !o.alive) continue;
      const d = dist2D(this.x, this.z, o.x, o.z);
      const min = this.radius + o.radius - 0.4;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const ux = (this.x - o.x) / d, uz = (this.z - o.z) / d;
        this.x += ux * push; this.z += uz * push;
        o.x -= ux * push; o.z -= uz * push;
        if (Math.abs(this.speed) > 8 || Math.abs(o.speed) > 8) hit = true;
        this.speed *= 0.82; o.speed *= 0.82;
      }
    }
    // Keep inside the world.
    if (this.x < -226) { this.x = -226; this.speed *= 0.5; }
    if (this.x > 226) { this.x = 226; this.speed *= 0.5; }
    if (this.z < -226) { this.z = -226; this.speed *= 0.5; }
    if (this.z > 306) { this.z = 306; this.speed *= 0.5; }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = -this.heading;
    // Wheel spin + front steer visual.
    const spin = this.speed * dt / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.y += spin;
    const crashed = hit && Math.abs(prevSpeed) > 6;
    return { crashed, impactSpeed: Math.abs(prevSpeed) };
  }

  // Teleport without physics (spawning, mission placement).
  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading; this.speed = 0;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = -heading;
  }

  remove() {
    this.alive = false;
    this.scene.remove(this.mesh);
  }
}
