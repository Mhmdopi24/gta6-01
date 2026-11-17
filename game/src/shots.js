// Deterministic screenshot scenes (?shot=<name>&seed=1): fixed camera and
// staged game state with no user input, so headless Chrome renders the
// exact scene each shot is meant to show.
import { CITY } from './city.js';

function lookAt(cam, from, to) {
  cam.position.set(from[0], from[1], from[2]);
  cam.lookAt(to[0], to[1], to[2]);
  lastLook = to;
}
let lastLook = [0, 2, 0];

export function applyShot(name, api) {
  const { game, player, camera, hud, missions, parked, policeCars } = api;
  game.cash = 2450;
  game.health = 100;
  game.minutes = 10 * 60 + 24; // late morning sun
  if (name === 'cover') {
    // City vista from a car on an avenue, HUD + minimap visible, marker ahead.
    const car = parked[0];
    api.setInCar(car);
    car.heading = 0; // driving down the avenue (+z)
    car.x = 92; car.z = 200; car.speed = 14;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    api.startMission(0);
    lookAt(camera, [car.x, 18, car.z - 28], [car.x, 1, car.z + 80]);
  } else if (name === 'street') {
    // On foot among pedestrians and traffic, mid-block.
    player.x = 100; player.z = 92; player.yaw = Math.PI * 0.85; player.heading = player.yaw;
    api.syncPlayerMesh();
    api.startMission(0);
    lookAt(camera, [player.x - 9, 4.5, player.z - 9], [player.x + 12, 1.5, player.z + 12]);
  } else if (name === 'chase') {
    // Driving with police behind and three wanted stars showing.
    const car = parked[1] || parked[0];
    api.setInCar(car);
    car.heading = Math.PI / 2; // east along the road
    car.x = 140; car.z = 230; car.speed = 22;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    game.wanted = 3;
    for (let i = 0; i < 3; i++) {
      const pc = api.spawnPoliceCar();
      pc.x = car.x - 12 - i * 6; pc.z = car.z + 8 + i * 4;
      pc.heading = car.heading; pc.speed = 24;
      pc.mesh.position.set(pc.x, 0, pc.z);
      pc.mesh.rotation.y = pc.heading;
    }
    api.startMission(1);
    lookAt(camera, [car.x - 26, 10, car.z - 18], [car.x + 25, 2, car.z + 5]);
  } else if (name === 'mission') {
    // A mission in progress: in a car, the glowing objective marker ahead.
    const car = parked[2] || parked[0];
    api.setInCar(car);
    car.heading = Math.PI * 0.9;
    car.x = 96; car.z = 96; car.speed = 12;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    api.startMission(0);
    const t = missions.active.target;
    lookAt(camera, [car.x - 4, 8, car.z - 15], [t.x, 10, t.z]);
  } else {
    // Unknown shot name: plain vista of the city centre.
    lookAt(camera, [CITY / 2 - 60, 40, CITY / 2 - 60], [CITY / 2, 8, CITY / 2]);
  }
  hud.update({
    health: game.health, cash: game.cash, wanted: game.wanted,
    day: game.day, minutes: game.minutes,
    speedMph: api.game.inCar && api.game.currentCar ? Math.abs(api.game.currentCar.speed) * 2.2 : 0,
    inCar: game.inCar, armed: game.armed,
  });
  // Remember the staged framing relative to the player so the camera
  // follows the subject instead of being left behind as it drives.
  const cam = camera.position;
  game.shotOffset = {
    cam: [cam.x - player.x, cam.y, cam.z - player.z],
    look: [lastLook[0] - player.x, lastLook[1], lastLook[2] - player.z],
  };
  window.__shotReady = true;
}
