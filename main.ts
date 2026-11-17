// Solmar Bay — entry program for the make.fun gta6-01 bounty.
//
// This is a plain Node 22 program using only the standard library. It takes
// the game (game/) and the screenshots (screenshots/) that sit beside this
// file, copies them into the output directory, and writes dossier.json there
// with the kit's buildDossier helper. The output directory comes from the
// MAKEFUN_OUTPUT_DIR environment variable, falling back to /output, which
// is where the grader expects the entry to land.
//
// The copy is deliberately boring: a recursive copy of the two folders,
// nothing generated and nothing fetched, so running it twice over the same
// repository produces byte-identical output every time.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in — the repository root.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// Where the finished entry goes. The grader sets /output; locally we use
// MAKEFUN_OUTPUT_DIR so the same command works in both places.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from a clean slate so a stale file from an earlier run can never
// leak into the entry. rmSync with force:true is safe on a fresh dir too.
mkdirSync(outputDir, { recursive: true });
rmSync(join(outputDir, 'game'), { recursive: true, force: true });
rmSync(join(outputDir, 'screenshots'), { recursive: true, force: true });
rmSync(join(outputDir, 'dossier.json'), { force: true });

// Copy the playable game and the four screenshots of it, as they are.
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier is the summary the judge reads. These caps are the scorer's
// own limits for this bounty: at most 160 KiB of source text, at most four
// screenshots of at most 256 KiB each, and the game folder within 993
// files/directories and 48 MiB with no path over 1,000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
