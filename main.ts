// Solmarina Heat — entry program for the make.fun "Make GTA 6" bounty.
// Copies game/ and screenshots/ into the output directory and writes
// dossier.json with buildDossier from the kit's vendor/makefun-game.ts.
// Run: MAKEFUN_OUTPUT_DIR=out node main.ts   (defaults to /output)

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// Start from a clean output directory so stale files never leak in.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(repoRoot, "game"), join(outDir, "game"), { recursive: true });
cpSync(join(repoRoot, "screenshots"), join(outDir, "screenshots"), { recursive: true });

const dossier = await buildDossier(repoRoot, {
  text_max_bytes: 163840,
  dossier_max_bytes: 1572864,
  max_images: 4,
});

writeFileSync(join(outDir, "dossier.json"), dossier);
console.log(`Solmarina Heat: wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
