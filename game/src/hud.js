// HUD: DOM readouts (health, cash, wanted stars, objective, speed, clock)
// plus the 2D canvas minimap with streets, the player arrow, traffic,
// police and the mission marker.
import { CITY, BLOCK, GRID } from './city.js';

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      stars: document.getElementById('stars'),
      cash: document.getElementById('cash'),
      clock: document.getElementById('clock'),
      healthNum: document.getElementById('healthnum'),
      healthFill: document.getElementById('healthfill'),
      objTitle: document.getElementById('objTitle'),
      objText: document.getElementById('objText'),
      speedo: document.getElementById('speedo'),
      msg: document.getElementById('msg'),
      crosshair: document.getElementById('crosshair'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.msgTimer = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setObjective(title, text) {
    this.el.objTitle.textContent = title;
    this.el.objText.textContent = text;
  }

  flash(msg, ms) {
    this.el.msg.textContent = msg;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { this.el.msg.textContent = ''; }, ms || 2600);
  }

  update(state) {
    const { health, cash, wanted, day, minutes, speedMph, inCar, armed } = state;
    this.el.healthNum.textContent = Math.max(0, Math.round(health));
    this.el.healthFill.style.width = Math.max(0, health) + '%';
    this.el.healthFill.style.background = health > 50 ? '#37d67a' : health > 25 ? '#f5a623' : '#e74c3c';
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '<span class="off">★</span>';
    this.el.stars.innerHTML = stars;
    this.el.cash.textContent = '$' + Math.floor(cash).toLocaleString('en-US');
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(Math.floor(minutes % 60)).padStart(2, '0');
    this.el.clock.textContent = 'Day ' + day + ' · ' + hh + ':' + mm;
    if (inCar) {
      this.el.speedo.classList.remove('hidden');
      this.el.speedo.innerHTML = Math.round(speedMph) + ' <small>mph</small>';
    } else {
      this.el.speedo.classList.add('hidden');
    }
    this.el.crosshair.classList.toggle('hidden', !(armed && !inCar));
  }

  drawMinimap(player, trafficCars, policeCars, officers, missionTarget) {
    const ctx = this.mapCtx;
    const S = 190;
    const scale = S / (CITY + 60);
    const px = (x) => (x + 10) * scale;
    const pz = (z) => (z + 10) * scale;
    ctx.fillStyle = '#12203a';
    ctx.fillRect(0, 0, S, S);
    // Streets.
    ctx.strokeStyle = '#5a6a80';
    ctx.lineWidth = 2;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(px(i * BLOCK), 0); ctx.lineTo(px(i * BLOCK), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pz(i * BLOCK)); ctx.lineTo(S, pz(i * BLOCK)); ctx.stroke();
    }
    // Beach / sea strip at the bottom.
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(0, pz(CITY + 20), S, S - pz(CITY + 20));
    // Mission marker.
    if (missionTarget) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(px(missionTarget.x), pz(missionTarget.z), 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // Traffic (white), police cars (red/blue), officers (red).
    ctx.fillStyle = '#ffffff';
    for (const c of trafficCars) { ctx.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3); }
    for (const c of policeCars) {
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(px(c.x) - 2.5, pz(c.z) - 2.5, 5, 5);
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillStyle = '#ff2222';
    for (const o of officers) { ctx.beginPath(); ctx.arc(px(o.x), pz(o.z), 2.5, 0, Math.PI * 2); ctx.fill(); }
    // Player arrow.
    ctx.save();
    ctx.translate(px(player.x), pz(player.z));
    ctx.rotate(Math.atan2(Math.sin(player.heading), Math.cos(player.heading)));
    ctx.fillStyle = '#7dff9a';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
