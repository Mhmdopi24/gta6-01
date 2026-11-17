// Keyboard + mouse input for Solmarina Heat, including pointer lock for
// mouse-look and edge-triggered "just pressed" keys.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.locked = false;
    this.enabled = false; // only true while actually playing

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    this.canvas.addEventListener('click', () => {
      if (this.enabled && !this.locked) this.canvas.requestPointerLock();
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }

  // Axis helpers: -1..1
  moveX() { return (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0); }
  moveY() { return (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0); }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  endFrame() {
    this.justPressed.clear();
    this.mouseClicked = false;
    this.mouseDX = 0; this.mouseDY = 0;
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
