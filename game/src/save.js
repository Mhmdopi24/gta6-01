// Save / load for Solmarina Heat via localStorage. Stores cash, health,
// ammo, mission progress and the player's position so Continue on the
// start screen drops the player back into the city.

const SAVE_KEY = 'solmarina-heat-save-v1';

export function saveGameData(data) {
  try {
    const payload = { v: 1, savedAt: Date.now(), ...data };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGameData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGameData() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
}
