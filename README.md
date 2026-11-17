# Solmar Bay

An original 3D open-world crime game built for the make.fun gta6-01 bounty.
No Rockstar / GTA content — the city, characters, vehicles, story and music
are all invented here.

You are **Danny Reyes**, a wheelman in **Solmar Bay**, a sun-soaked coastal
city of palm-lined boulevards, tower blocks, a beach and a pier. Your crew
boss **Marla Quinn** has three jobs for you: steal a clean ride, make a hot
drop at the pier, and hit the north tower vault. Pull them off, stay ahead
of the Solmar Bay Police, and buy your way out of debt.

## How to play

Serve `game/` with any static file server and open `index.html` in desktop
Chrome. Everything runs offline — no network requests, all sound is
synthesized with WebAudio.

- **WASD** — move / drive · **Mouse** — look (click to lock the pointer)
- **SHIFT** — sprint · **SPACE** — jump
- **E** — enter / exit a car (stealing one raises your wanted level)
- **F** — punch · **Click** — shoot
- **P** — pause · **M** — mute

## Features

- Procedurally generated city (seeded, deterministic): street grid, varied
  tower blocks, streetlights, palms, billboards, beach and ocean
- On-foot and arcade driving, with parked cars to steal and live traffic
- Pedestrians who flee danger; police cars and officers who chase, ram and
  try to bust you; wanted level 0–5 stars that decays when you lose them
- Melee and firearm combat with raycast hits, muzzle flash and particles
- Three chained story missions with markers, objectives, cash rewards and
  a story-complete free-roam ending
- HUD with health, cash, wanted stars, clock, speedometer and a live 2D
  minimap (streets, player, traffic, police, mission marker)
- Start / pause / busted / wasted screens, autosave via localStorage
- Synthesized sound: engine hum, sirens, gunshots, pickup blips, music loop
- Deterministic screenshot scenes via `?shot=cover|street|chase|mission&seed=1`

## Tech

three.js (vendored minified build under `game/vendor/`), plain ES modules,
no build step. Source is split by job: `city.js`, `vehicles.js`,
`people.js`, `missions.js`, `hud.js`, `audio.js`, `shots.js`, `main.js`.
