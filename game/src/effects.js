// Particles and skid marks for Solmarina Heat: one THREE.Points pool for
// smoke, sparks and muzzle flashes, plus a ring of fading tyre marks.

import * as THREE from 'three';

const MAX_PARTICLES = 400;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.baseColors = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.size = new Float32Array(MAX_PARTICLES);
    this.head = 0;
    this.positions.fill(0);
    // Park unused particles far below the world.
    for (let i = 0; i < MAX_PARTICLES; i++) this.positions[i * 3 + 1] = -100;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.9, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Skid marks: a pool of dark flat quads laid on the asphalt.
    this.skids = [];
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x141414, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const skidGeo = new THREE.PlaneGeometry(0.45, 1.6);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(skidGeo, skidMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.y = -10;
      m.visible = false;
      scene.add(m);
      this.skids.push({ mesh: m, age: 99 });
    }
    this.skidHead = 0;
  }

  _spawn(x, y, z, vx, vy, vz, r, g, b, life) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_PARTICLES;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.colors[i * 3] = r; this.colors[i * 3 + 1] = g; this.colors[i * 3 + 2] = b;
    this.baseColors[i * 3] = r; this.baseColors[i * 3 + 1] = g; this.baseColors[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
  }

  smoke(x, y, z, n = 6) {
    for (let k = 0; k < n; k++) {
      this._spawn(
        x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5,
        0.55, 0.55, 0.58, 0.7 + Math.random() * 0.5);
    }
  }

  sparks(x, y, z, n = 14) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 7;
      this._spawn(x, y, z,
        Math.cos(a) * sp, 1.5 + Math.random() * 4, Math.sin(a) * sp,
        1.0, 0.75 + Math.random() * 0.2, 0.2, 0.35 + Math.random() * 0.3);
    }
  }

  muzzle(x, y, z, dirX, dirZ) {
    for (let k = 0; k < 8; k++) {
      this._spawn(x, y, z,
        dirX * (6 + Math.random() * 6) + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        dirZ * (6 + Math.random() * 6) + (Math.random() - 0.5) * 2,
        1.0, 0.85, 0.3, 0.12 + Math.random() * 0.1);
    }
  }

  poof(x, y, z) {
    for (let k = 0; k < 10; k++) {
      this._spawn(
        x + (Math.random() - 0.5), y + Math.random() * 1.2, z + (Math.random() - 0.5),
        (Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2,
        0.85, 0.8, 0.75, 0.6 + Math.random() * 0.4);
    }
  }

  addSkid(x, z, heading) {
    const s = this.skids[this.skidHead];
    this.skidHead = (this.skidHead + 1) % this.skids.length;
    s.mesh.position.set(x, 0.06, z);
    s.mesh.rotation.z = -heading;
    s.mesh.visible = true;
    s.mesh.material.opacity = 0.55;
    s.age = 0;
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -100;
        continue;
      }
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 2.5 * dt; // light gravity on sparks
      const f = this.life[i] / this.maxLife[i];
      this.colors[i * 3] = this.baseColors[i * 3] * f;
      this.colors[i * 3 + 1] = this.baseColors[i * 3 + 1] * f;
      this.colors[i * 3 + 2] = this.baseColors[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const s of this.skids) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      if (s.age > 14) { s.mesh.visible = false; s.mesh.position.y = -10; continue; }
      s.mesh.material.opacity = 0.55 * Math.max(0, 1 - s.age / 14);
    }
  }
}
