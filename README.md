# Solmarina Heat — an open-world crime game

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Mhmdopi24/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Mhmdopi24/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

**Solmarina Heat** is an original 3D open-world crime game built for make.fun's
["Make GTA 6" bounty](https://make.fun/bounty/gta6-01) ($1,666 in USDC).
Sun, sea and bad decisions: explore a procedurally built coastal city on foot
and by car, steal cars, outrun the Solmarina PD, and run five story jobs for
fixer Vera Kline — from pier rat to king of the marina.

Everything is original: the city of Solmarina, its characters, vehicles,
story, art and sounds were invented for this game. No Rockstar / GTA names,
characters, maps or assets appear anywhere.

## What is in the game

- **Open world** — a procedurally built coastal city: a street grid with
  tower blocks downtown, a beach, an ocean, palms, a plaza with a fountain,
  and landmarks (The Gilded Anchor bar, Grand Solmarina Hotel, Mack's Garage,
  the safehouse, the Marina Office, Pier 9).
- **On foot and by car** — third-person character (WASD + mouse camera,
  sprint, jump) and arcade driving with a chase camera, handbrake drifts,
  skid marks and smoke.
- **Traffic and pedestrians** — cars cruise the roads and turn at
  intersections; pedestrians stroll the sidewalks and flee from speeding cars
  and gunfire.
- **Cars to steal** — walk up to any parked or traffic car, press **E** to
  take it; **E** again to step out.
- **Wanted level** — 5 stars. Stealing cars, hitting pedestrians and cars,
  and shooting raise the heat; the SPPD sends patrol cars that ram you and
  officers who chase you on foot. Lay low and the stars decay.
- **Missions and story** — a 5-job campaign for Vera Kline with dialogue,
  a mission tracker, a 3D beacon, minimap marker and cash rewards:
  First Run, Hot Wheels, Courier Rush (timed), Heat Escape, The Marina Job.
- **Combat** — fists (click / F) and a pistol (press 2, click to shoot)
  with muzzle flashes, sparks and ammo restocks at the safehouse.
- **HUD** — health, cash, wanted stars, mission objective with distance,
  speedometer, a live canvas minimap (player, traffic, police, mission
  marker), dialogue box and interaction prompts.
- **Menus and save** — start screen (New Game / Continue / How to Play),
  pause menu (Esc), game-over screen, and save/load via localStorage.
- **Sound** — 100% synthesized WebAudio: engine hum, two-tone sirens,
  ocean waves, gunshots, pickups and mission jingles. No audio files.
- **Polish** — afternoon sun with shadows, drifting clouds, animated foam
  at the shoreline, camera shake on crashes.

## How to run it

Serve `game/` with any static HTTP server and open `index.html` in desktop
Chrome. No network is needed — the game loads only local files.

```sh
# from the repository root
python3 -m http.server 8080 --directory game
# then open http://localhost:8080/ in Chrome
```

Or with Node:

```sh
npx serve game
```

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Sprint |
| Space | Jump (on foot) / handbrake (driving) |
| E | Steal / enter a car, exit a car |
| Left click / F | Punch, or shoot with the pistol |
| 1 / 2 | Fists / pistol |
| H | Horn |
| Esc | Pause |

## Layout

- `game/index.html` — page shell, HUD DOM, import map for three.js
- `game/vendor/three.min.js` — vendored three.js (r160, minified)
- `game/src/` — the game's own source, one job per file:
  `main.js` (bootstrap + loop + cameras), `city.js`, `vehicles.js`,
  `traffic.js`, `pedestrians.js`, `police.js`, `missions.js`,
  `player.js`, `hud.js`, `audio.js`, `effects.js`, `input.js`,
  `save.js`, `util.js`
- `main.ts` — entry program: copies `game/` + `screenshots/` to the output
  directory and writes `dossier.json`
- `screenshots/` — real renders of the game taken in headless Chrome

Built by an AI agent for make.fun's "Make GTA 6" bounty.
