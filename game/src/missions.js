// Missions: a three-job story arc from Marla Quinn. Each mission has a
// title, briefing, target point, reward and a completion test. Missions
// unlock in order; finishing one pays cash and opens the next.
import { CITY } from './city.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'Job 1 — First Wheels',
    brief: 'Marla needs a clean ride. Steal any car (press E near one) and bring it to the yellow marker at Palm Row garage.',
    target: { x: 138, z: 138 },
    targetName: 'Palm Row garage',
    reward: 500,
    completeWhen: (s) => s.inCar,
  },
  {
    id: 2,
    title: 'Job 2 — The Drop',
    brief: 'The package is hot. Drive the car to the pier drop-off at the beach — and shake any cops on your tail first. Wanted level must be 0 when you arrive.',
    target: { x: CITY / 2 + 40, z: CITY + 30 },
    targetName: 'Pier drop-off',
    reward: 1200,
    completeWhen: (s) => s.inCar && s.wanted === 0,
  },
  {
    id: 3,
    title: 'Job 3 — Bay Heist',
    brief: 'The loan shark\'s men are guarding the cash at the north tower. Get there, deal with the guards (click to shoot, F to punch), then stand in the marker to grab the cash.',
    target: { x: 230, z: 46 },
    targetName: 'North tower vault',
    reward: 3000,
    completeWhen: (s) => !s.inCar,
  },
];

export class MissionRunner {
  constructor(scene) {
    this.scene = scene;
    this.index = 0; // 0-based into MISSIONS; 3 = all done
    this.active = null;
    this.marker = null;
    this.beacon = null;
    this.guards = [];
    this.done = false;
    this.buildMarkerMesh();
  }

  buildMarkerMesh() {
    const geo = new THREE.CylinderGeometry(4.5, 4.5, 0.4, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55 });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.visible = false;
    this.scene.add(this.marker);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 70, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    beam.position.y = 35;
    this.beacon = new THREE.Group();
    this.beacon.add(beam);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(2.6),
      new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    gem.position.y = 10;
    this.beacon.add(gem);
    this.beacon.userData.gem = gem;
    this.beacon.visible = false;
    this.scene.add(this.beacon);
  }

  start(index) {
    this.index = index;
    if (index >= MISSIONS.length) { this.active = null; this.hideMarker(); return null; }
    this.active = MISSIONS[index];
    const t = this.active.target;
    this.marker.position.set(t.x, 0.25, t.z);
    this.marker.visible = true;
    this.beacon.position.set(t.x, 0, t.z);
    this.beacon.visible = true;
    return this.active;
  }

  hideMarker() { this.marker.visible = false; this.beacon.visible = false; }

  update(dt, t) {
    if (this.beacon.visible) {
      this.beacon.userData.gem.rotation.y += dt * 2;
      this.beacon.userData.gem.position.y = 10 + Math.sin(t * 2) * 0.8;
      this.marker.material.opacity = 0.4 + Math.sin(t * 3) * 0.15;
    }
  }

  // Returns 'done' when the player stands in the marker and the mission's
  // condition holds, 'arrived' when standing in the marker only.
  check(px, pz, state) {
    if (!this.active) return null;
    const t = this.active.target;
    const d = Math.hypot(px - t.x, pz - t.z);
    if (d < 6) return this.active.completeWhen(state) ? 'done' : 'arrived';
    return null;
  }
}
