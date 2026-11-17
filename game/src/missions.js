// Vera Kline's jobs: a five-mission campaign across Solmarina.
// Steps are data: go to a place, pick something up, steal a car, or escape
// the heat to the safehouse. A 3D beacon, the minimap and the HUD all point
// at the current objective.

import * as THREE from 'three';
import { Car } from './vehicles.js';
import { dist2D, formatCash } from './util.js';

const MISSIONS = [
  {
    id: 'first-run',
    title: 'JOB 1 — FIRST RUN',
    reward: 300,
    intro: [
      { who: 'VERA KLINE', text: 'Rook. You\'re new in Solmarina, and I\'m the only friend you\'ve got. A package is waiting at Pier 9 — grab it.' },
      { who: 'VERA KLINE', text: 'Bring it back to my bar, The Gilded Anchor. Follow the yellow marker. And try not to get arrested on day one.' },
    ],
    steps: [
      { type: 'goto', x: 170, z: 238, label: 'Pick up the package at Pier 9', radius: 5 },
      { type: 'goto', x: 120, z: 180, label: 'Deliver the package to The Gilded Anchor', radius: 6 },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'JOB 2 — HOT WHEELS',
    reward: 500,
    intro: [
      { who: 'VERA KLINE', text: 'A client left a cherry-red Comet GT at the Grand Solmarina valet. He won\'t miss it. You will.' },
      { who: 'VERA KLINE', text: 'Walk up to it, press E, and bring it to Mack\'s Garage. Stealing it will put a star on you — drive like you mean it.' },
    ],
    steps: [
      { type: 'steal', x: 24, z: -138, label: 'Steal the Comet GT at the hotel valet', radius: 6 },
      { type: 'goto', x: -150, z: -120, label: 'Deliver the Comet GT to Mack\'s Garage', radius: 7 },
    ],
  },
  {
    id: 'courier-rush',
    title: 'JOB 3 — COURIER RUSH',
    reward: 700,
    intro: [
      { who: 'VERA KLINE', text: 'Three drops, one timer. The buyers don\'t wait and neither do I. 150 seconds — go, go, go!' },
      { who: 'ROOK', text: 'Three drops in two and a half minutes? Better grab a fast car.' },
    ],
    steps: [
      { type: 'goto', x: 54, z: 0, label: 'Drop 1 of 3 — Coral Plaza', radius: 5, timeLimit: 150 },
      { type: 'goto', x: -54, z: 108, label: 'Drop 2 of 3 — West End', radius: 5 },
      { type: 'goto', x: 108, z: -108, label: 'Drop 3 of 3 — North Docks', radius: 5 },
    ],
  },
  {
    id: 'heat-escape',
    title: 'JOB 4 — HEAT ESCAPE',
    reward: 900,
    intro: [
      { who: 'VERA KLINE', text: 'Tomas is stuck at Coral Plaza with the SPPD on his tail. Pick him up, then lose the heat and get to the safehouse.' },
      { who: 'TOMAS', text: 'Two stars and counting, Rook. Drive like the marina depends on it — because it does.' },
    ],
    steps: [
      { type: 'goto', x: 54, z: 0, label: 'Pick up Tomas at Coral Plaza', radius: 6 },
      { type: 'escape', x: -170, z: 170, label: 'Lose the heat — reach the safehouse', radius: 7, wanted: 2 },
    ],
  },
  {
    id: 'marina-job',
    title: 'JOB 5 — THE MARINA JOB',
    reward: 1500,
    intro: [
      { who: 'VERA KLINE', text: 'The big one. The marina office holds a weekend of cash in a duffel bag. Take it, and the whole SPPD will want a word.' },
      { who: 'VERA KLINE', text: 'Three stars, Rook. Get the bag, shake the tail, and bring it home to the safehouse. Then we\'re legends.' },
    ],
    steps: [
      { type: 'goto', x: 170, z: 185, label: 'Grab the cash at the Marina Office', radius: 6 },
      { type: 'escape', x: -170, z: 170, label: 'Escape with the cash — reach the safehouse', radius: 7, wanted: 3 },
    ],
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.list = MISSIONS;
    this.index = 0; // current mission
    this.stepIndex = 0;
    this.active = false;
    this.storyDone = false;
    this.timer = 0;
    this.targetCar = null;
    this.dialogueQueue = [];
    this._buildBeacon();
  }

  _buildBeacon() {
    const scene = this.game.scene;
    const group = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 34, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd21f, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      }));
    pillar.position.y = 17;
    group.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffd21f, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: 0xffd21f }));
    diamond.position.y = 9;
    group.add(diamond);
    group.visible = false;
    scene.add(group);
    this.beacon = group;
    this.beaconDiamond = diamond;
    this.beaconRing = ring;
  }

  current() { return this.list[this.index] || null; }
  currentStep() {
    const m = this.current();
    return m ? m.steps[this.stepIndex] : null;
  }

  startMission(i, silent = false) {
    this.index = i;
    this.stepIndex = 0;
    this.timer = 0;
    this.active = true;
    const m = this.current();
    if (!m) { this.active = false; return; }
    this.dialogueQueue = [...m.intro];
    if (!silent) {
      this.game.hud.setObjective(m.title, m.steps[0].label, 0);
      this.game.audio.missionDone();
    }
    this._prepareStep();
  }

  _prepareStep() {
    const step = this.currentStep();
    if (!step) return;
    if (step.timeLimit) this.timer = step.timeLimit;
    if (step.type === 'steal' && !this.targetCar) {
      // The red Comet GT waiting at the hotel valet.
      this.targetCar = new Car(this.game.scene, 'sport', step.x, step.z, Math.PI / 2, 0xc23b2e);
      this.targetCar.speed = 0;
      this.targetCar.parked = true;
      this.game.parkedCars.push(this.targetCar);
    }
    if (step.type === 'escape' && step.wanted) {
      this.game.police.setWanted(step.wanted);
    }
    this._placeBeacon();
  }

  _placeBeacon() {
    const step = this.currentStep();
    if (!step || !this.active) { this.beacon.visible = false; return; }
    let bx = step.x, bz = step.z;
    if (step.type === 'steal' && this.targetCar) { bx = this.targetCar.x; bz = this.targetCar.z; }
    this.beacon.position.set(bx, 0, bz);
    this.beacon.visible = true;
  }

  markerPos() {
    const step = this.currentStep();
    if (!step || !this.active) return null;
    if (step.type === 'steal' && this.targetCar) return { x: this.targetCar.x, z: this.targetCar.z };
    return { x: step.x, z: step.z };
  }

  update(dt) {
    if (!this.active) return;
    // Dialogue queue drains one line at a time via the HUD.
    this.game.hud.pumpDialogue(this.dialogueQueue);
    // Timer for timed missions.
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.game.hud.toast('TOO SLOW', 'The buyers walked away — job restarted');
        this.game.audio.denied();
        this.startMission(this.index);
        return;
      }
    }
    const step = this.currentStep();
    if (!step) return;
    const player = this.game.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    let done = false;
    if (step.type === 'steal') {
      done = player.inCar === this.targetCar;
    } else {
      done = dist2D(px, pz, step.x, step.z) < step.radius;
    }
    // Beacon follows a moving target car.
    if (step.type === 'steal') this._placeBeacon();
    this.beaconDiamond.position.y = 9 + Math.sin(this.game.time * 2.4) * 0.8;
    this.beaconDiamond.rotation.y += dt * 2;
    const pulse = 0.6 + Math.sin(this.game.time * 3) * 0.25;
    this.beaconRing.material.opacity = pulse;
    if (done) this._advanceStep();
  }

  _advanceStep() {
    const m = this.current();
    const step = this.currentStep();
    this.game.audio.pickup();
    this.game.effects.poof(step.x, 1.5, step.z);
    this.stepIndex++;
    if (this.stepIndex >= m.steps.length) {
      this._completeMission(m);
    } else {
      const next = this.currentStep();
      this.game.hud.toast('OBJECTIVE DONE', next.label);
      this._prepareStep();
    }
  }

  _completeMission(m) {
    this.game.cash += m.reward;
    this.game.audio.missionDone();
    this.game.hud.toast('JOB COMPLETE — ' + formatCash(m.reward), m.title);
    this.game.saveGame();
    this.index++;
    this.stepIndex = 0;
    this.timer = 0;
    if (this.index >= this.list.length) {
      this.storyDone = true;
      this.active = false;
      this.beacon.visible = false;
      this.dialogueQueue = [
        { who: 'VERA KLINE', text: 'That\'s the whole set, Rook. The marina is ours. Solmarina is yours now — free roam, keep the cash coming.' },
      ];
      this.game.hud.toast('STORY COMPLETE', 'All five jobs done — Solmarina is yours');
      return;
    }
    this.startMission(this.index);
  }

  // HUD-facing summary of the current objective.
  objectiveInfo() {
    if (!this.active) {
      return {
        title: this.storyDone ? 'FREE ROAM' : 'SOLMARINA HEAT',
        text: this.storyDone ? 'All jobs complete — explore, steal, survive' : 'Talk to Vera — start a job',
        dist: 0,
      };
    }
    const m = this.current();
    const step = this.currentStep();
    const player = this.game.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const pz = player.inCar ? player.inCar.z : player.z;
    const tx = step.type === 'steal' && this.targetCar ? this.targetCar.x : step.x;
    const tz = step.type === 'steal' && this.targetCar ? this.targetCar.z : step.z;
    let text = step.label;
    if (this.timer > 0) text += '  —  ' + Math.ceil(this.timer) + 's';
    return { title: m.title, text, dist: dist2D(px, pz, tx, tz) };
  }
}
