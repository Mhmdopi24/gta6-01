// Solmarina Heat — bootstrap, game loop, cameras, state machine and the
// glue between every system. Original open-world crime game, built fresh
// for the make.fun "Make GTA 6" bounty (competition gta6-01).

import * as THREE from 'three';
import { City } from './city.js';
import { Car } from './vehicles.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { saveGameData, loadGameData, hasSave } from './save.js';
import { makeRng, clamp, angleToward, angleDiff, dist2D } from './util.js';

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | gameover
    this.time = 0;
    this.cash = 0;
    this.shake = 0;
    this.gunfireTimer = 0;
    this.camYaw = Math.PI / 2; // camera looks north (-Z) at start... see below
    this.camPitch = 0.32;
    this.camDistance = 8;
    this.shotMode = null;
    this.pedRng = makeRng(2024);
    this._safehouseToastAt = -999;

    // --- Renderer / scene / camera.
    // If this browser cannot create a WebGL context, say so on screen
    // instead of dying with an uncaught exception on a blank page.
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      const el = document.getElementById('err');
      if (el) el.textContent = 'Solmarina Heat needs WebGL to run — this browser could not create a WebGL context. Please try desktop Chrome with hardware acceleration enabled.';
      window.__solmarinaReady = 'webgl-unavailable';
      window.__gameErrors = window.__gameErrors || [];
      window.__gameErrors.push('WebGL unavailable: ' + (err && err.message ? err.message : err));
      return;
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5d9);
    this.scene.fog = new THREE.Fog(0xa8c8e0, 260, 780);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(90, 55, 90);

    // --- Lights: warm afternoon sun + sky bounce.
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -150;
    this.sun.shadow.camera.right = 150;
    this.sun.shadow.camera.top = 150;
    this.sun.shadow.camera.bottom = -150;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.85);
    this.scene.add(hemi);

    // --- Systems.
    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioEngine();
    this.city = new City(this.scene);
    this.effects = new Effects(this.scene);
    this.player = new Player(this);
    this.traffic = new Traffic(this);
    this.parkedCars = this.traffic.parked;
    this.peds = new Pedestrians(this);
    this.police = new Police(this);
    this.missions = new Missions(this);
    this.hud = new HUD(this);

    // Player start: on the sidewalk by Coral Plaza.
    this.player.place(30, 62, Math.PI / 2);
    this.camYaw = Math.PI / 2;

    window.addEventListener('resize', () => this._onResize());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') this.pauseGame();
      else if (e.code === 'Escape' && this.state === 'paused') this.resumeGame();
    });
    // Any first gesture wakes the audio engine.
    const wake = () => this.audio.ensure();
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);

    this.clock = new THREE.Clock();
    this._applyShotParams();
    this._loop();
    window.__solmarinaReady = true;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Deterministic scene hooks for screenshots: ?shot=start|chase|street|drive
  _applyShotParams() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (!shot) return;
    this.shotMode = shot;
    if (shot === 'start') {
      this.hud.showMenu(hasSave());
      return;
    }
    // All other shots drop straight into the game, menus hidden.
    this.cash = 1250;
    this.player.health = 100;
    this.player.ammo = 48;
    if (shot === 'chase') {
      this.startGame({ silent: true });
      const car = this.traffic.claim(this.traffic.parked[0] || this.traffic.cars[0]);
      car.place(0, 0, 0);
      car.speed = 26;
      this.player.enterCar(car);
      this.player.inCar = car;
      this.police.setWanted(3);
      this.missions.startMission(3, true);
      this.missions.stepIndex = 1;
      this.missions._prepareStep();
      this.camYaw = 0;
      this._spawnPoliceBehind(2);
    } else if (shot === 'street') {
      this.startGame({ silent: true });
      this.player.place(46, 58, Math.PI / 2);
      this.camYaw = Math.PI / 2;
      this.missions.startMission(0, true);
    } else if (shot === 'drive') {
      this.startGame({ silent: true });
      const car = this.traffic.claim(this.traffic.parked[0] || this.traffic.cars[0]);
      car.place(-40, -54, 0);
      car.speed = 28;
      this.player.enterCar(car);
      this.player.inCar = car;
      this.police.setWanted(1);
      this.missions.startMission(2, true);
      this.camYaw = 0;
    }
  }

  _spawnPoliceBehind(n) {
    const car = this.player.inCar;
    for (let i = 0; i < n; i++) {
      const px = car.x - Math.cos(car.heading) * (16 + i * 12);
      const pz = car.z - Math.sin(car.heading) * (16 + i * 12) + (i === 0 ? -3 : 3);
      const cop = new Car(this.scene, 'police', px, pz, car.heading, 0x1c2733);
      cop.speed = 30;
      this.police.cars.push(cop);
    }
  }

  // ---------- State transitions ----------

  startGame(opts = {}) {
    this.state = 'playing';
    this.hud.showGame();
    this.input.enabled = true;
    if (!opts.silent) {
      this.missions.startMission(this.missions.index);
      this.hud.toast('WELCOME TO SOLMARINA', 'Follow the yellow marker — Vera\'s first job');
    }
  }

  newGame() {
    this.cash = 0;
    this.player.health = 100;
    this.player.ammo = 24;
    this.player.weapon = 'fists';
    this.player.dead = false;
    this.player.place(30, 62, Math.PI / 2);
    if (this.player.inCar) { this.player.inCar = null; this.player.mesh.visible = true; }
    this.police.clear();
    this.missions.index = 0;
    this.missions.storyDone = false;
    this.missions.targetCar = null;
    this.camYaw = Math.PI / 2;
    this.startGame();
    this.saveGame();
  }

  continueGame() {
    const data = loadGameData();
    if (!data) { this.newGame(); return; }
    this.cash = data.cash || 0;
    this.player.health = data.health || 100;
    this.player.ammo = data.ammo !== undefined ? data.ammo : 24;
    this.player.dead = false;
    this.player.place(data.pos ? data.pos[0] : 30, data.pos ? data.pos[2] : 62, data.heading || 0);
    if (this.player.inCar) { this.player.inCar = null; this.player.mesh.visible = true; }
    this.police.clear();
    this.missions.storyDone = !!data.storyDone;
    this.missions.index = data.missionIndex || 0;
    this.startGame({ silent: true });
    if (this.missions.storyDone) {
      this.missions.active = false;
    } else {
      this.missions.startMission(this.missions.index, true);
      this.hud.toast('WELCOME BACK', 'Job ' + (this.missions.index + 1) + ' of 5 — ' + this.missions.current().title);
    }
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlock();
    this.input.enabled = false;
    this.hud.showPause();
    this.saveGame();
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.enabled = true;
    this.hud.hidePause();
  }

  quitToMenu() {
    this.saveGame();
    this.state = 'menu';
    this.input.unlock();
    this.input.enabled = false;
    this.police.clear();
    this.hud.showMenu(hasSave());
  }

  onPlayerWasted() {
    this.state = 'gameover';
    this.input.unlock();
    this.input.enabled = false;
    this.hud.showGameOver('The Solmarina PD scraped you off the boulevard. The hospital patched you up — for a fee.');
  }

  respawn() {
    this.cash = Math.max(0, this.cash - 200);
    this.player.health = 100;
    this.player.dead = false;
    this.player.place(-160, 158, Math.PI / 2);
    if (this.player.inCar) { this.player.inCar = null; this.player.mesh.visible = true; }
    this.police.clear();
    this.hud.hideGameOver();
    this.state = 'playing';
    this.input.enabled = true;
    this.hud.showGame();
    this.hud.toast('PATCHED UP', 'Back on the streets — minus $200');
    this.saveGame();
  }

  saveGame() {
    saveGameData({
      cash: this.cash,
      health: Math.round(this.player.health),
      ammo: this.player.ammo,
      missionIndex: this.missions.index,
      storyDone: this.missions.storyDone,
      pos: [this.player.x, 0, this.player.z],
      heading: this.player.heading,
    });
  }

  // ---------- Per-frame ----------

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    window.__gameState = this.state;
    this.gunfireTimer = Math.max(0, this.gunfireTimer - dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else if (this.state === 'menu') {
      // Living backdrop behind the title: traffic and peds keep moving.
      this.traffic.update(dt);
      this.peds.update(dt);
      this.city.update(dt, this.time);
      this.effects.update(dt);
      this._updateMenuCamera(dt);
    }
    // Paused / game-over: freeze the world, keep rendering.

    this._updateSun();
    this.audio.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  _updatePlaying(dt) {
    const input = this.input;
    const player = this.player;

    // Mouse look.
    const mouse = input.consumeMouse();
    this.camYaw -= mouse.dx * 0.0028;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.0022, -0.15, 0.9);

    // Weapon switching.
    if (input.pressed('Digit1')) player.weapon = 'fists';
    if (input.pressed('Digit2') && player.ammo > 0) player.weapon = 'pistol';

    if (player.inCar) {
      this._updateDriving(dt);
    } else {
      player.updateOnFoot(dt, input, this.camYaw);
      this._updateOnFootInteractions(dt);
    }

    // Combat input.
    if (input.mouseClicked || input.pressed('KeyF')) {
      if (player.weapon === 'pistol' && !player.inCar) {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        if (player.tryShoot(dir)) this.gunfireTimer = 2;
      } else if (!player.inCar) {
        player.tryPunch();
      }
    }

    // Safehouse: restock ammo and heal when standing by it.
    const sh = this.city.landmarks.safehouse;
    if (dist2D(player.x, player.z, sh.x, sh.z) < 9 && !player.inCar) {
      if ((player.ammo < 24 || player.health < 100) && this.time - this._safehouseToastAt > 20) {
        this._safehouseToastAt = this.time;
        player.ammo = 24;
        player.heal(100);
        this.hud.toast('SAFEHOUSE', 'Ammo restocked — health patched up');
        this.audio.pickup();
      }
    }

    // World systems.
    this.traffic.update(dt);
    this.peds.update(dt);
    this.police.update(dt);
    this.missions.update(dt);
    this.city.update(dt, this.time);
    this.effects.update(dt);
    this._updateCamera(dt);

    // Slow health regen while the heat is off.
    if (this.police.wanted === 0 && player.health < 100 && !player.dead) {
      player.heal(dt * 2.5);
    }

    // Audio: engine, siren, waves.
    const speedNorm = player.inCar ? Math.abs(player.inCar.speed) / player.inCar.spec.maxSpeed : 0;
    this.audio.setEngine(speedNorm, !!player.inCar);
    let nearestCop = 999;
    for (const c of this.police.cars) {
      nearestCop = Math.min(nearestCop, dist2D(c.x, c.z, player.x, player.z));
    }
    this.audio.setSiren(this.police.wanted > 0, nearestCop);
    const waveAmount = clamp((player.z - 170) / 90, 0, 1);
    this.audio.setWaves(waveAmount);

    this.hud.update(dt);
    // Autosave every 45 seconds.
    this._autoSaveTimer = (this._autoSaveTimer || 0) + dt;
    if (this._autoSaveTimer > 45) { this._autoSaveTimer = 0; this.saveGame(); }
  }

  _updateDriving(dt) {
    const input = this.input;
    const player = this.player;
    const car = player.inCar;
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0)
      - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const steer = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0)
      - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const brake = input.down('Space');
    const others = [...this.traffic.cars, ...this.traffic.parked, ...this.police.cars]
      .filter((c) => c !== car && c.alive);
    const res = car.drive(dt, { throttle, steer, brake }, this.city.colliders, others);
    if (res.crashed && res.impactSpeed > 14) {
      this.police.commitCrime(0.5, 'hit and run');
      this.effects.sparks(car.x, 1, car.z, 10);
      this.audio.crash(1);
      this.shake = Math.max(this.shake, 0.4);
    }
    // Skid marks + smoke while drifting.
    if (car.drifting && Math.abs(car.speed) > 9) {
      const backX = car.x - Math.cos(car.heading) * 1.6;
      const backZ = car.z - Math.sin(car.heading) * 1.6;
      this.effects.addSkid(backX + Math.sin(car.heading) * 0.9, backZ - Math.cos(car.heading) * 0.9, car.heading);
      this.effects.addSkid(backX - Math.sin(car.heading) * 0.9, backZ + Math.cos(car.heading) * 0.9, car.heading);
      this.effects.smoke(backX, 0.4, backZ, 2);
      if (Math.random() < dt * 6) this.audio.skid();
    }
    // Running over pedestrians.
    const hits = this.peds.checkCarHit(car);
    for (const p of hits) {
      void p;
      this.effects.poof(car.x, 1, car.z);
      this.audio.crash(0.8);
      this.shake = Math.max(this.shake, 0.5);
    }
    // Horn.
    if (input.pressed('KeyH')) this.audio.horn();
    // Exit the car.
    if (input.pressed('KeyE')) {
      player.exitCar();
      this.audio.click();
    }
  }

  _updateOnFootInteractions(dt) {
    void dt;
    const input = this.input;
    const player = this.player;
    // Steal / enter the nearest car.
    const near = this.traffic.nearestStealable(player.x, player.z, 3.6);
    // The mission target car is also stealable even though it sits in parkedCars.
    let target = near;
    if (!target && this.missions.targetCar && this.missions.targetCar.alive) {
      const tc = this.missions.targetCar;
      if (dist2D(player.x, player.z, tc.x, tc.z) < 3.6) target = tc;
    }
    if (target) {
      this.hud.showPrompt('<b>E</b> — STEAL ' + target.spec.name.toUpperCase());
      if (input.pressed('KeyE')) {
        this.traffic.claim(target);
        player.enterCar(target);
        this.police.commitCrime(1, 'car theft');
        this.camYaw = target.heading;
      }
    } else {
      this.hud.hidePrompt();
    }
    // Advance dialogue with E when the box is up.
    if (input.pressed('KeyE')) this.hud.advanceDialogue();
  }

  _updateCamera(dt) {
    const player = this.player;
    let tx, tz, ty, lookX, lookZ, lookY;
    if (player.inCar) {
      const car = player.inCar;
      // Chase camera: ease the yaw behind the car's heading.
      const targetYaw = car.heading;
      this.camYaw = angleToward(this.camYaw, targetYaw, dt * 2.2);
      // If the driver looks with the mouse, offset temporarily.
      const dist = 11;
      const backX = Math.cos(this.camYaw), backZ = Math.sin(this.camYaw);
      tx = car.x - backX * dist;
      tz = car.z - backZ * dist;
      ty = 5.0;
      lookX = car.x + Math.cos(car.heading) * 8;
      lookZ = car.z + Math.sin(car.heading) * 8;
      lookY = 1.6;
    } else {
      const dist = this.camDistance;
      const backX = Math.cos(this.camYaw), backZ = Math.sin(this.camYaw);
      tx = player.x - backX * dist;
      tz = player.z - backZ * dist;
      ty = 2.6 + this.camPitch * 4;
      lookX = player.x + backX * 6;
      lookZ = player.z + backZ * 6;
      lookY = 1.5;
    }
    // Speed kick: the field of view widens as the car goes faster,
    // which makes high-speed driving feel faster. Eases back on foot.
    let targetFov = 62;
    if (player.inCar) {
      const speedNorm = Math.min(1, Math.abs(player.inCar.speed) / player.inCar.spec.maxSpeed);
      targetFov = 62 + speedNorm * 9;
    }
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
    // Keep the camera out of buildings.
    for (const b of this.city.colliders) {
      const res = this._cameraResolve(tx, tz, b);
      if (res) { tx = res.x; tz = res.z; ty = Math.max(ty, 8); }
    }
    // Camera shake (crashes, rams).
    const sh = this.shake * this.shake;
    const ox = (Math.random() - 0.5) * sh * 0.9;
    const oy = (Math.random() - 0.5) * sh * 0.6;
    const oz = (Math.random() - 0.5) * sh * 0.9;
    const k = 1 - Math.min(1, dt * 10);
    this.camera.position.x = this.camera.position.x * k + (tx + ox) * (1 - k);
    this.camera.position.y = this.camera.position.y * k + (ty + oy) * (1 - k);
    this.camera.position.z = this.camera.position.z * k + (tz + oz) * (1 - k);
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  _cameraResolve(x, z, b) {
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= 1.44 || d2 < 0.000001) return null;
    const d = Math.sqrt(d2);
    const push = (1.2 - d) / d;
    return { x: x + dx * push, z: z + dz * push };
  }

  _updateMenuCamera(dt) {
    const t = this.time * 0.045;
    const cx = Math.cos(t) * 120;
    const cz = Math.sin(t) * 120;
    this.camera.position.x += (cx - this.camera.position.x) * Math.min(1, dt * 1.2);
    this.camera.position.y += (52 - this.camera.position.y) * Math.min(1, dt * 1.2);
    this.camera.position.z += (cz - this.camera.position.z) * Math.min(1, dt * 1.2);
    this.camera.lookAt(0, 8, 20);
  }

  _updateSun() {
    const px = this.player.inCar ? this.player.inCar.x : this.player.x;
    const pz = this.player.inCar ? this.player.inCar.z : this.player.z;
    this.sun.position.set(px + 130, 190, pz + 70);
    this.sun.target.position.set(px, 0, pz);
  }
}

new Game();
