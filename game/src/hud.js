// HUD, minimap, dialogue box, toasts and menus for Solmarina Heat.
// The HUD is DOM; the minimap is a canvas painted every frame.

import { ROADS, WORLD_MIN_X, WORLD_MAX_X, WORLD_MIN_Z, WORLD_MAX_Z, BEACH_Z, OCEAN_Z } from './city.js';
import { formatCash, formatDist } from './util.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: document.getElementById('hud'),
      healthfill: document.getElementById('healthfill'),
      cashline: document.getElementById('cashline'),
      ammo: document.getElementById('ammo-line'),
      stars: document.getElementById('stars'),
      wantedLabel: document.getElementById('wanted-label'),
      objTitle: document.getElementById('obj-title'),
      objText: document.getElementById('obj-text'),
      objDist: document.getElementById('obj-dist'),
      minimap: document.getElementById('minimap'),
      speedo: document.getElementById('speedo'),
      speednum: document.getElementById('speednum'),
      carname: document.getElementById('carname'),
      prompt: document.getElementById('prompt'),
      dialogue: document.getElementById('dialogue'),
      dlgWho: document.getElementById('dlg-who'),
      dlgText: document.getElementById('dlg-text'),
      crosshair: document.getElementById('crosshair'),
      toast: document.getElementById('toast'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),
      gameover: document.getElementById('gameover'),
      gameoverText: document.getElementById('gameover-text'),
      btnContinue: document.getElementById('btn-continue'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.dialogueTimer = 0;
    this.dialogueActive = null;
    this._bindButtons();
  }

  _bindButtons() {
    const g = this.game;
    document.getElementById('btn-new').addEventListener('click', () => { g.audio.ensure(); g.audio.click(); g.newGame(); });
    this.el.btnContinue.addEventListener('click', () => { g.audio.ensure(); g.audio.click(); g.continueGame(); });
    document.getElementById('btn-how').addEventListener('click', () => {
      g.audio.ensure(); g.audio.click();
      document.getElementById('how-panel').classList.toggle('hidden');
    });
    document.getElementById('btn-resume').addEventListener('click', () => { g.audio.click(); g.resumeGame(); });
    document.getElementById('btn-save').addEventListener('click', () => { g.audio.click(); g.saveGame(); this.toast('SAVED', 'Progress stored on this machine'); });
    document.getElementById('btn-quit').addEventListener('click', () => { g.audio.click(); g.quitToMenu(); });
    document.getElementById('btn-respawn').addEventListener('click', () => { g.audio.click(); g.respawn(); });
    document.getElementById('btn-menu2').addEventListener('click', () => { g.audio.click(); g.quitToMenu(); });
    // Clicking the dialogue box advances it.
    this.el.dialogue.addEventListener('click', () => { this.dialogueTimer = 0; });
  }

  showMenu(hasSave) {
    this.el.hud.classList.add('hidden');
    this.el.menu.classList.remove('hidden');
    this.el.pause.classList.add('hidden');
    this.el.gameover.classList.add('hidden');
    this.el.btnContinue.disabled = !hasSave;
  }

  showGame() {
    this.el.hud.classList.remove('hidden');
    this.el.menu.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.gameover.classList.add('hidden');
  }

  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }

  showGameOver(reason) {
    this.el.gameoverText.textContent = reason;
    this.el.gameover.classList.remove('hidden');
  }
  hideGameOver() { this.el.gameover.classList.add('hidden'); }

  toast(main, sub) {
    this.el.toast.innerHTML = main + (sub ? '<small>' + sub + '</small>' : '');
    this.el.toast.classList.remove('hidden');
    this.toastTimer = 3.2;
  }

  setObjective(title, text, dist) {
    this.el.objTitle.textContent = title;
    this.el.objText.textContent = text;
    this.el.objDist.textContent = dist > 0 ? formatDist(dist) : '';
  }

  showPrompt(html) {
    this.el.prompt.innerHTML = html;
    this.el.prompt.classList.remove('hidden');
  }
  hidePrompt() { this.el.prompt.classList.add('hidden'); }

  // Show the next queued dialogue line if the box is free.
  pumpDialogue(queue) {
    if (this.dialogueTimer > 0) return;
    if (this.dialogueActive) { this.dialogueActive = null; this.el.dialogue.classList.add('hidden'); }
    if (queue.length === 0) return;
    const line = queue.shift();
    this.dialogueActive = line;
    this.el.dlgWho.textContent = line.who;
    this.el.dlgText.textContent = line.text;
    this.el.dialogue.classList.remove('hidden');
    this.dialogueTimer = 5;
  }

  advanceDialogue() { this.dialogueTimer = 0; }

  update(dt) {
    const g = this.game;
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer === 0) this.el.toast.classList.add('hidden');
    this.dialogueTimer = Math.max(0, this.dialogueTimer - dt);
    if (this.dialogueTimer === 0 && this.dialogueActive) {
      this.dialogueActive = null;
      this.el.dialogue.classList.add('hidden');
    }
    // Health / cash / ammo.
    const hp = Math.max(0, Math.round(g.player.health));
    this.el.healthfill.style.width = hp + '%';
    this.el.cashline.innerHTML = formatCash(g.cash) + ' <small>CASH</small>';
    this.el.ammo.textContent = g.player.weapon === 'pistol'
      ? 'PISTOL — ' + g.player.ammo + ' ROUNDS  (1 for fists)'
      : 'FISTS  (2 for pistol)';
    // Wanted stars.
    const w = g.police.wanted;
    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
      starsHtml += i < w ? '★' : '<span class="off">★</span>';
    }
    this.el.stars.innerHTML = starsHtml;
    this.el.wantedLabel.textContent = w > 0 ? 'WANTED — SPPD ON YOUR TAIL' : '';
    // Objective.
    const obj = g.missions.objectiveInfo();
    this.setObjective(obj.title, obj.text, obj.dist);
    // Speedometer.
    if (g.player.inCar) {
      this.el.speedo.classList.remove('hidden');
      this.el.speednum.textContent = Math.round(Math.abs(g.player.inCar.speed) * 3.6);
      this.el.carname.textContent = g.player.inCar.spec.name;
    } else {
      this.el.speedo.classList.add('hidden');
    }
    this.el.crosshair.classList.toggle('hidden', g.player.weapon !== 'pistol' || !!g.player.inCar);
    this._drawMinimap();
  }

  _drawMinimap() {
    const ctx = this.mapCtx;
    const S = 220;
    const px = (x) => ((x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X)) * S;
    const pz = (z) => ((z - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z)) * S;
    ctx.clearRect(0, 0, S, S);
    // Sea and sand.
    ctx.fillStyle = '#12334a';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#c9b183';
    ctx.fillRect(0, pz(BEACH_Z), S, pz(OCEAN_Z) - pz(BEACH_Z));
    ctx.fillStyle = '#1d6ea8';
    ctx.fillRect(0, pz(OCEAN_Z), S, S - pz(OCEAN_Z));
    // City ground.
    ctx.fillStyle = '#2c3138';
    ctx.fillRect(px(-189), pz(-189), px(189) - px(-189), pz(189) - pz(-189));
    // Roads.
    ctx.strokeStyle = '#565e68';
    ctx.lineWidth = 4;
    for (const c of ROADS) {
      ctx.beginPath(); ctx.moveTo(px(c), pz(-189)); ctx.lineTo(px(c), pz(189)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(-189), pz(c)); ctx.lineTo(px(189), pz(c)); ctx.stroke();
    }
    const g = this.game;
    // Mission marker.
    const marker = g.missions.markerPos();
    if (marker) {
      const pulse = 5 + Math.sin(g.time * 5) * 2;
      ctx.fillStyle = '#ffd21f';
      ctx.beginPath();
      ctx.moveTo(px(marker.x), pz(marker.z) - 8 - pulse);
      ctx.lineTo(px(marker.x) + 6, pz(marker.z) - 1);
      ctx.lineTo(px(marker.x), pz(marker.z) + 6);
      ctx.lineTo(px(marker.x) - 6, pz(marker.z) - 1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    }
    // Traffic cars (white dots) and parked target car.
    ctx.fillStyle = '#ffffff';
    for (const c of g.traffic.cars) {
      ctx.fillRect(px(c.x) - 1.5, pz(c.z) - 1.5, 3, 3);
    }
    // Police cars (flashing red/blue).
    const flash = Math.floor(g.time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff3030' : '#3080ff';
    for (const c of g.police.cars) {
      ctx.beginPath(); ctx.arc(px(c.x), pz(c.z), 4, 0, Math.PI * 2); ctx.fill();
    }
    // Police officers (small red dots).
    ctx.fillStyle = '#ff8080';
    for (const o of g.police.officers) {
      if (o.alive) { ctx.beginPath(); ctx.arc(px(o.x), pz(o.z), 2.5, 0, Math.PI * 2); ctx.fill(); }
    }
    // Player arrow.
    const player = g.player;
    const pxx = player.inCar ? player.inCar.x : player.x;
    const pzz = player.inCar ? player.inCar.z : player.z;
    const heading = player.inCar ? player.inCar.heading : player.heading;
    ctx.save();
    ctx.translate(px(pxx), pz(pzz));
    // Canvas rotation: heading 0 = +X, positive angles turn toward +Z (down
    // the map), matching the world, so the arrow points along the heading.
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.fillText('N', S - 14, 14);
  }
}
