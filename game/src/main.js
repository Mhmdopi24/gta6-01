// Solmar Bay — main game: player on foot and by car, wanted system, police,
// combat, particles, save/load, and the render loop. Entry point for game/.
import { makeRng } from './rng.js';
import { buildCity, hitsBuilding, clampToCity, CITY } from './city.js';
import { makeCarMesh, Traffic, spawnParkedCars, CAR_COLORS } from './vehicles.js';
import { Crowd, Officers, makePersonMesh } from './people.js';
import { MissionRunner, MISSIONS } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { applyShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot') || null;
const SAVE_KEY = 'solmarbay-save-v1';
const SPAWN = { x: 60, z: 60 };

const game = {
  seed: SEED, shot: SHOT,
  cash: 0, wanted: 0, health: 100,
  day: 1, minutes: 9 * 60,
  missionIndex: 0, storyDone: false,
  inCar: false, currentCar: null,
  armed: true, ammo: 120,
  bustedT: 0, hiddenT: 0, dangerT: 0,
  paused: false, started: false, over: false,
};

// ---------- three.js setup ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.domElement.className = 'webgl';
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

const city = buildCity(scene, SEED);
const rng = makeRng(SEED + 5);
const traffic = new Traffic(scene, SEED, city.colliders);
const parked = spawnParkedCars(scene, rng, city.colliders);
const crowd = new Crowd(scene, SEED, city.colliders);
const officers = new Officers(scene);
const missions = new MissionRunner(scene);
const hud = new Hud();
const sound = new SoundBank();

// ---------- player ----------
const playerMesh = makePersonMesh(0xffd23f, 0xe0ac69, false);
playerMesh.userData.entity = { kind: 'player' };
scene.add(playerMesh);
const player = {
  x: SPAWN.x, z: SPAWN.z, y: 0, vy: 0, onGround: true,
  heading: 0, yaw: 0.6, pitch: 0.12, speed: 0,
};
function syncPlayerMesh() {
  playerMesh.position.set(player.x, player.y, player.z);
  playerMesh.rotation.y = player.heading;
}

// ---------- police cars ----------
const policeCars = [];
function policeTargetCount() { return game.wanted > 0 ? Math.min(game.wanted, 4) : 0; }
function spawnPoliceCar() {
  const a = rng.range(0, Math.PI * 2);
  const x = player.x + Math.cos(a) * 55, z = player.z + Math.sin(a) * 55;
  const [cx, cz] = clampToCity(x, z, 6);
  const mesh = makeCarMesh(0x1a2a44, true);
  scene.add(mesh);
  const car = { x: cx, z: cz, heading: Math.atan2(player.x - cx, player.z - cz), speed: 0, mesh, isPolice: true, health: 100 };
  car.mesh.userData.entity = { kind: 'policecar', car };
  mesh.traverse((o) => { o.userData.entity = car.mesh.userData.entity; });
  policeCars.push(car);
  return car;
}
function clearPolice() {
  for (const c of policeCars) scene.remove(c.mesh);
  policeCars.length = 0;
  officers.clear();
}

// ---------- particles ----------
const particles = [];
{
  const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    m.visible = false; scene.add(m);
    particles.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
  }
}
function burst(x, y, z, color, n, speed) {
  let made = 0;
  for (const p of particles) {
    if (p.life > 0) continue;
    p.life = 0.5 + Math.random() * 0.4;
    p.mesh.visible = true;
    p.mesh.material.color.setHex(color);
    p.mesh.position.set(x, y, z);
    p.vx = (Math.random() - 0.5) * speed; p.vy = Math.random() * speed * 0.7; p.vz = (Math.random() - 0.5) * speed;
    if (++made >= n) break;
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
    p.vy -= 6 * dt;
    p.mesh.material.opacity = Math.min(1, p.life * 2);
  }
}

// ---------- muzzle flash ----------
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffe066 }));
flash.visible = false; scene.add(flash);

// ---------- input ----------
const keys = {};
let mouseDX = 0, mouseDY = 0;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyP' && game.started && !game.over) togglePause();
  if (e.code === 'KeyM') sound.toggleMute();
  if (e.code === 'KeyE' && game.started && !game.paused) tryEnterExitCar();
  if (e.code === 'KeyF' && game.started && !game.paused && !game.inCar) punch();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    mouseDX += e.movementX; mouseDY += e.movementY;
  }
});
renderer.domElement.addEventListener('click', () => {
  if (!game.started || game.paused || SHOT) return;
  sound.ensure();
  if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
  else shoot();
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- cars: enter / exit / drive ----------
function nearestCar(maxD) {
  let best = null, bestD = maxD;
  for (const car of [...parked, ...traffic.cars, ...policeCars]) {
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}
function tryEnterExitCar() {
  if (game.inCar) {
    const car = game.currentCar;
    const sx = car.x + Math.cos(car.heading) * 3.5, sz = car.z - Math.sin(car.heading) * 3.5;
    player.x = sx; player.z = sz; player.y = 0;
    game.inCar = false; game.currentCar = null;
    playerMesh.visible = true;
    hud.flash('You left the ' + car.name);
    return;
  }
  const car = nearestCar(5);
  if (!car) { hud.flash('No car nearby — walk up to one and press E'); return; }
  if (car.isPolice) { hud.flash('That is a police car — too hot to steal'); return; }
  game.inCar = true; game.currentCar = car;
  playerMesh.visible = false;
  if (car.isParked) {
    parked.splice(parked.indexOf(car), 1);
    game.cash += 0;
    raiseWanted(1, 'Car stolen! The owner called it in.');
    hud.flash('You stole the ' + car.name + '! ★ Wanted level up');
  } else {
    hud.flash('You jacked the ' + car.name + '!');
    raiseWanted(1, 'Carjacked in broad daylight!');
    const i = traffic.cars.indexOf(car);
    if (i >= 0) traffic.cars.splice(i, 1);
  }
  sound.pickup();
  saveGame();
}

function driveCar(car, dt) {
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const accel = fwd > 0 ? 22 : fwd < 0 ? -14 : 0;
  car.speed += accel * dt;
  car.speed -= car.speed * 0.9 * dt; // drag
  if (Math.abs(car.speed) < 0.2 && fwd === 0) car.speed = 0;
  car.speed = Math.max(-12, Math.min(34, car.speed));
  if (Math.abs(car.speed) > 0.5) car.heading += steer * 1.9 * dt * Math.sign(car.speed);
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = hitsBuilding(city.colliders, nx, nz, 2.4);
  if (hit) {
    if (Math.abs(car.speed) > 8) { burst(nx, 1, nz, 0xffaa00, 10, 8); sound.crash(); game.health = Math.max(0, game.health - 4); }
    car.speed *= -0.25;
  } else {
    car.x = nx; car.z = nz;
  }
  const [cx, cz] = clampToCity(car.x, car.z, 5);
  car.x = cx; car.z = cz;
  // Run over pedestrians.
  for (const ped of crowd.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - car.x, ped.z - car.z) < 2.4 && Math.abs(car.speed) > 3) {
      ped.state = 'down'; ped.mesh.rotation.x = Math.PI / 2; ped.mesh.position.y = 0.3;
      burst(ped.x, 1, ped.z, 0xff3333, 8, 6);
      raiseWanted(1, 'You ran someone over!');
      hud.flash('Pedestrian hit! ★ Wanted level up');
    }
  }
  // Exhaust puffs.
  if (Math.abs(car.speed) > 4 && Math.random() < dt * 8) {
    burst(car.x - Math.sin(car.heading) * 2.2, 0.5, car.z - Math.cos(car.heading) * 2.2, 0x999999, 1, 1.5);
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  player.x = car.x; player.z = car.z;
  sound.setEngine(true, Math.abs(car.speed) / 34);
}

// ---------- on foot ----------
function movePlayer(dt) {
  player.yaw -= mouseDX * 0.0028;
  player.pitch = Math.max(-0.5, Math.min(0.6, player.pitch + mouseDY * 0.0022));
  mouseDX = 0; mouseDY = 0;
  const run = keys.ShiftLeft || keys.ShiftRight;
  const speed = run ? 9.5 : 5.2;
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz += 1;
  if (keys.KeyS || keys.ArrowDown) mz -= 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  const len = Math.hypot(mx, mz) || 1;
  mx /= len; mz /= len;
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const vx = (mx * cos - mz * sin) * speed;
  const vz = (mx * sin + mz * cos) * speed;
  const nx = player.x + vx * dt, nz = player.z + vz * dt;
  if (!hitsBuilding(city.colliders, nx, player.z, 0.9)) player.x = nx;
  if (!hitsBuilding(city.colliders, player.x, nz, 0.9)) player.z = nz;
  const [cx, cz] = clampToCity(player.x, player.z, 3);
  player.x = cx; player.z = cz;
  if (mx !== 0 || mz !== 0) player.heading = Math.atan2(vx, vz);
  // Jump + gravity.
  if (keys.Space && player.onGround) { player.vy = 7.5; player.onGround = false; }
  player.vy -= 22 * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) { player.y = 0; player.vy = 0; player.onGround = true; }
  // Walk bob.
  syncPlayerMesh();
  playerMesh.position.y = player.y + (mx !== 0 || mz !== 0 ? Math.abs(Math.sin(performance.now() * 0.011)) * 0.07 : 0);
  sound.setEngine(false, 0);
}

// ---------- combat ----------
const raycaster = new THREE.Raycaster();
function hittables() {
  const list = [];
  for (const ped of crowd.peds) if (ped.state !== 'down') list.push(ped.mesh);
  for (const o of officers.list) if (o.state !== 'down') list.push(o.mesh);
  for (const c of [...traffic.cars, ...parked, ...policeCars]) list.push(c.mesh);
  return list;
}
function entityOf(obj) {
  let o = obj;
  while (o) { if (o.userData && o.userData.entity) return o.userData.entity; o = o.parent; }
  return null;
}
function shoot() {
  if (!game.armed || game.ammo <= 0) { hud.flash(game.ammo <= 0 ? 'Out of ammo!' : 'No weapon'); return; }
  game.ammo--;
  sound.ensure(); sound.shot();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = 90;
  const hits = raycaster.intersectObjects(hittables(), true);
  const muzzleX = player.x + Math.sin(player.yaw) * 1.2;
  const muzzleZ = player.z + Math.cos(player.yaw) * 1.2;
  flash.position.set(muzzleX, 1.5, muzzleZ);
  flash.visible = true;
  setTimeout(() => { flash.visible = false; }, 60);
  if (hits.length) {
    const ent = entityOf(hits[0].object);
    const p = hits[0].point;
    burst(p.x, p.y, p.z, 0xffdd55, 6, 5);
    const ped = crowd.peds.find((q) => q.mesh === hits[0].object || isDescendant(q.mesh, hits[0].object));
    const off = officers.list.find((q) => isDescendant(q.mesh, hits[0].object));
    if (ped) {
      ped.state = 'down'; ped.mesh.rotation.x = Math.PI / 2; ped.mesh.position.y = 0.3;
      raiseWanted(1, 'Shots fired at a civilian!');
      hud.flash('Civilian down! ★ Wanted level up');
    } else if (off) {
      off.state = 'down'; off.mesh.rotation.x = Math.PI / 2; off.mesh.position.y = 0.3;
      raiseWanted(1, 'You shot an officer!');
      hud.flash('Officer down! ★ Wanted level up');
    } else {
      hud.flash('Hit!');
    }
  }
  // Noise scares nearby peds.
  game.dangerT = 1.5;
}
function isDescendant(root, obj) {
  let o = obj;
  while (o) { if (o === root) return true; o = o.parent; }
  return false;
}
function punch() {
  sound.ensure(); sound.punch();
  for (const ped of [...crowd.peds, ...officers.list]) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - player.x, ped.z - player.z);
    if (d < 2.2) {
      ped.health -= 50;
      burst(ped.x, 1.4, ped.z, 0xffffff, 5, 4);
      if (ped.health <= 0) {
        ped.state = 'down'; ped.mesh.rotation.x = Math.PI / 2; ped.mesh.position.y = 0.3;
        raiseWanted(ped.isOfficer ? 2 : 1, 'Assault!');
        hud.flash(ped.isOfficer ? 'You floored an officer!' : 'You punched a pedestrian!');
      }
      return;
    }
  }
}

// ---------- wanted + police ----------
function raiseWanted(n, why) {
  const before = game.wanted;
  game.wanted = Math.min(5, game.wanted + n);
  if (game.wanted > before) { game.hiddenT = 0; sound.sirenBlip(); }
}
function updatePolice(dt) {
  // Spawn police cars to match wanted level.
  while (policeCars.length < policeTargetCount()) spawnPoliceCar();
  while (policeCars.length > policeTargetCount()) {
    const c = policeCars.pop();
    scene.remove(c.mesh);
  }
  // Officers on foot when wanted and player is on foot.
  if (game.wanted >= 2 && !game.inCar && officers.list.filter((o) => o.state !== 'down').length < Math.min(game.wanted - 1, 3)) {
    const a = rng.range(0, Math.PI * 2);
    officers.spawn(player.x + Math.cos(a) * 30, player.z + Math.sin(a) * 30);
  }
  // Police cars chase and ram.
  for (const car of policeCars) {
    const dx = player.x - car.x, dz = player.z - car.z;
    const d = Math.hypot(dx, dz) || 1;
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
    car.speed = Math.min(car.speed + 16 * dt, d < 12 ? 26 : 30);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    if (!hitsBuilding(city.colliders, nx, nz, 2.4)) { car.x = nx; car.z = nz; }
    else { car.heading += Math.PI / 3; car.speed *= 0.5; }
    const [cx, cz] = clampToCity(car.x, car.z, 5);
    car.x = cx; car.z = cz;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    if (car.mesh.userData.lightBar) {
      car.mesh.userData.lightBar.material.color.setHex(Math.floor(performance.now() / 250) % 2 ? 0xff2222 : 0x2266ff);
    }
    // Ram the player's car or the player.
    if (d < 3.4) {
      if (game.inCar) {
        game.health = Math.max(0, game.health - 6 * dt);
        if (Math.random() < dt * 3) { burst(player.x, 1, player.z, 0xffaa00, 6, 6); sound.crash(); }
        const cur = game.currentCar;
        if (cur) { cur.x += (dx / d) * -2 * dt * 10; cur.z += (dz / d) * -2 * dt * 10; }
      } else {
        game.health = Math.max(0, game.health - 10 * dt);
      }
    }
  }
  officers.update(dt, player.x, player.z, (dt2) => {
    game.bustedT += dt2;
    if (game.bustedT > 2) endGame(true);
  });
  if (game.wanted > 0) {
    const nearest = policeCars.reduce((m, c) => Math.min(m, Math.hypot(c.x - player.x, c.z - player.z)), 999);
    const officerNear = officers.list.some((o) => o.state !== 'down' && Math.hypot(o.x - player.x, o.z - player.z) < 40);
    if (nearest > 70 && !officerNear) {
      // Outrunning them counts double: a fast getaway in a car breaks
      // line of sight sooner than hiding on foot.
      const fleeingFast = game.inCar && game.currentCar && Math.abs(game.currentCar.speed) > 20;
      game.hiddenT += dt * (fleeingFast ? 2 : 1);
      if (game.hiddenT > 6) { game.wanted--; game.hiddenT = 0; hud.flash('You lost them — wanted level down'); }
    } else game.hiddenT = 0;
  }
  sound.setSiren(game.wanted > 0, performance.now() / 1000);
}

// ---------- missions ----------
let guards = [];
function startMission(i) {
  game.missionIndex = i;
  const m = missions.start(i);
  if (!m) {
    game.storyDone = true;
    hud.setObjective('Solmar Bay — Free Roam', 'All three jobs done. The city is yours, Danny. Keep the cash coming.');
    hud.flash('STORY COMPLETE — you own Solmar Bay!');
    return;
  }
  hud.setObjective(m.title, m.brief + ' Reward: $' + m.reward.toLocaleString('en-US') + '.');
  hud.flash(m.title);
  // Mission 3 guards.
  for (const g of guards) { scene.remove(g.mesh); }
  guards = [];
  if (m.id === 3) {
    for (let k = 0; k < 3; k++) {
      const mesh = makePersonMesh(0x1a2a44, 0xc68642, true);
      scene.add(mesh);
      const ped = { mesh, x: m.target.x + (k - 1) * 6, z: m.target.z + 8, heading: 0, speed: 4.5, state: 'walk', health: 100, isOfficer: true,
        updateMesh() { this.mesh.position.set(this.x, 0, this.z); this.mesh.rotation.y = this.heading; } };
      ped.mesh.position.set(ped.x, 0, ped.z);
      officers.list.push(ped);
      guards.push(ped);
    }
  }
  saveGame();
}
function updateMissions(dt, t) {
  missions.update(dt, t);
  const res = missions.check(player.x, player.z, { inCar: game.inCar, wanted: game.wanted });
  if (res === 'done') {
    const m = missions.active;
    game.cash += m.reward;
    sound.missionDone(); sound.pickup();
    hud.flash('MISSION COMPLETE — +$' + m.reward.toLocaleString('en-US'));
    missions.hideMarker();
    startMission(game.missionIndex + 1);
  } else if (res === 'arrived') {
    if (missions.active.id === 1) hud.flash('You need to be IN a car here');
    if (missions.active.id === 2) hud.flash('Lose the cops first — wanted must be 0');
  }
}

// ---------- game over / save ----------
function endGame(busted) {
  if (game.over) return;
  game.over = true;
  document.exitPointerLock && document.exitPointerLock();
  const penalty = Math.min(game.cash, 150);
  game.cash -= penalty;
  const title = document.getElementById('wastedTitle');
  title.textContent = busted ? 'BUSTED' : 'WASTED';
  document.getElementById('endText').textContent = (busted
    ? 'The Solmar Bay Police hauled you in. Bail cost you $' + penalty + '.'
    : 'You got wasted on the streets of Solmar Bay. The clinic took $' + penalty + '.')
    + ' Cash left: $' + Math.floor(game.cash) + '.';
  document.getElementById('endScreen').classList.remove('hidden');
  hud.hide();
}
function respawn() {
  game.over = false;
  game.health = 100; game.wanted = 0; game.bustedT = 0;
  clearPolice();
  if (game.inCar) { game.inCar = false; game.currentCar = null; playerMesh.visible = true; }
  player.x = SPAWN.x; player.z = SPAWN.z; player.y = 0; player.vy = 0;
  document.getElementById('endScreen').classList.add('hidden');
  hud.show();
  saveGame();
}
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: game.cash, missionIndex: game.missionIndex, health: game.health, day: game.day,
    }));
  } catch (e) { /* storage unavailable — play on without saving */ }
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!s) return;
    game.cash = s.cash || 0; game.missionIndex = s.missionIndex || 0;
    game.health = s.health || 100; game.day = s.day || 1;
  } catch (e) { /* ignore corrupt save */ }
}

// ---------- camera ----------
function updateCamera(dt) {
  if (SHOT && game.shotOffset) {
    // Shot scenes: keep the staged framing, following the subject.
    const o = game.shotOffset;
    camera.position.set(player.x + o.cam[0], o.cam[1], player.z + o.cam[2]);
    camera.lookAt(player.x + o.look[0], o.look[1], player.z + o.look[2]);
    return;
  }
  if (SHOT) return; // shots.js positions the camera
  const target = game.inCar && game.currentCar ? game.currentCar : player;
  const heading = game.inCar && game.currentCar ? game.currentCar.heading : player.yaw;
  const dist = game.inCar ? 13 : 8.5;
  const height = game.inCar ? 5.5 : 3.6;
  const cx = target.x - Math.sin(heading) * dist;
  const cz = target.z - Math.cos(heading) * dist;
  const lx = target.x + Math.sin(heading) * 4;
  const lz = target.z + Math.cos(heading) * 4;
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 6);
  camera.position.y += (height - camera.position.y) * Math.min(1, dt * 6);
  camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 6);
  camera.lookAt(lx, (game.inCar ? 1.5 : 1.6) + player.y * 0.5, lz);
}

// ---------- flow ----------
function startGame() {
  loadGame();
  game.started = true;
  document.getElementById('startScreen').classList.add('hidden');
  hud.show();
  startMission(Math.min(game.missionIndex, 2));
  sound.ensure();
  sound.startMusic();
  if (!SHOT) renderer.domElement.requestPointerLock();
}
function togglePause() {
  game.paused = !game.paused;
  document.getElementById('pauseScreen').classList.toggle('hidden', !game.paused);
  if (game.paused) document.exitPointerLock && document.exitPointerLock();
  else if (!SHOT) renderer.domElement.requestPointerLock();
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('restartBtn').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  location.reload();
});
document.getElementById('respawnBtn').addEventListener('click', respawn);

// ---------- main loop ----------
const clock = new THREE.Clock();
let firstFrame = true;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  if (!game.started || game.paused || game.over) {
    if (firstFrame) { renderer.render(scene, camera); firstFrame = false; }
    return;
  }
  game.minutes += dt * 2;
  if (game.minutes >= 24 * 60) { game.minutes -= 24 * 60; game.day++; }
  if (game.inCar && game.currentCar) { if (!SHOT) driveCar(game.currentCar, dt); }
  else if (!SHOT) movePlayer(dt);
  traffic.update(dt, game.inCar ? game.currentCar : null);
  const danger = game.dangerT > 0 ? { x: player.x, z: player.z, radius: 26 } : null;
  if (game.dangerT > 0) game.dangerT -= dt;
  // Cars speeding past also scare peds.
  const nearCar = game.inCar ? { x: player.x, z: player.z, radius: 12 } : danger;
  crowd.update(dt, nearCar);
  updatePolice(dt);
  updateMissions(dt, t);
  updateParticles(dt);
  updateCamera(dt);
  if (game.health <= 0) endGame(false);
  hud.update({
    health: game.health, cash: game.cash, wanted: game.wanted,
    day: game.day, minutes: game.minutes,
    speedMph: game.inCar && game.currentCar ? Math.abs(game.currentCar.speed) * 2.2 : 0,
    inCar: game.inCar, armed: game.armed,
  });
  hud.drawMinimap(player, traffic.cars, policeCars, officers.list,
    missions.active ? missions.active.target : null);
  renderer.render(scene, camera);
  if (firstFrame) { firstFrame = false; window.__gameReady = true; }
}

// Shot mode: skip the start screen, set a fixed scene, and play immediately.
if (SHOT) {
  loadGame();
  game.started = true;
  document.getElementById('startScreen').classList.add('hidden');
  hud.show();
  applyShot(SHOT, {
    game, player, camera, scene, hud, missions, traffic, parked, policeCars,
    spawnPoliceCar, startMission, raiseWanted, syncPlayerMesh, playerMesh,
    setInCar(car) { game.inCar = true; game.currentCar = car; playerMesh.visible = false; player.x = car.x; player.z = car.z; },
  });
  sound.ensure();
}
loop();
