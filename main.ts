// Tidebound Duel — the hand-in program (Node 22, standard library only).
//
// What it does, in three moves:
//   1. Takes the static game in game/ beside this file and copies it whole
//      into the output directory.
//   2. Takes the screenshots/ folder beside this file and copies it too.
//   3. Writes dossier.json there, the summary the judge reads, built by
//      the vendored make.fun library from the copied files.
//
// Where it writes: /output on the grader, or wherever MAKEFUN_OUTPUT_DIR
// points when you run it yourself:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The run must be byte-identical every time: no timestamps, no random
// values, nothing but the files on disk.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameSource = join(repoRoot, 'game');
const shotsSource = join(repoRoot, 'screenshots');
const gameTarget = join(outputDir, 'game');
const shotsTarget = join(outputDir, 'screenshots');

mkdirSync(outputDir, { recursive: true });
cpSync(gameSource, gameTarget, { recursive: true });
mkdirSync(shotsTarget, { recursive: true });
if (existsSync(shotsSource)) {
  cpSync(shotsSource, shotsTarget, { recursive: true });
}

// The caps match the scorer's own gate: four screenshots at most, each
// under 256 KiB; game/ under 993 files and 48 MiB, paths under 1000 bytes;
// the dossier text capped at 160 KiB.
const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outputDir, 'dossier.json'), dossierText);
