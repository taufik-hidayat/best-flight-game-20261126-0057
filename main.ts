// Ridgeline Courier — the hand-in program (Node 22, standard library only).
//
// The game lives in this directory's game/ folder: plain static files that a
// desktop browser loads offline — game/index.html, its ES modules, and the
// vendored three.js build under game/vendor/. Running this program hands the
// entry in: it copies game/ and screenshots/ into the output directory and
// writes /output/dossier.json there, the summary the judge reads, built by
// the vendored make.fun library.
//
// Play the game locally first: `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Count every file below a directory, so the run can report what it copied. */
function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? countFiles(path) : 1;
  }
  return total;
}

/** Copy one tree of the entry (game/ or screenshots/) into the output. */
function copyTree(name) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) return 0;
  const to = join(outputDir, name);
  cpSync(from, to, { recursive: true });
  return countFiles(from);
}

// The scorer's own caps, from the kit's reference/gate.json: only
// text_max_bytes shapes the dossier's bytes. The other caps refuse an entry
// the scorer would refuse anyway — more than 4 screenshots, one over
// 256 KiB, more than 993 files in game/, 48 MiB of game files in all, or a
// path under game/ over 1000 bytes. game/ shares /output's own 1000-entry
// cap with screenshots/ and dossier.json, so the entry stays well under it.
const dossierOptions = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outputDir, { recursive: true });
const gameFiles = copyTree('game');
const shotFiles = copyTree('screenshots');
const indexStats = statSync(join(repoRoot, 'game', 'index.html'));
if (!indexStats.isFile() || indexStats.size > 1048576) {
  throw new Error('game/index.html must be a regular file of at most 1 MiB');
}
const dossier = buildDossier(outputDir, dossierOptions);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(
  `ridgeline-courier: copied ${gameFiles} game files and ${shotFiles} screenshots, ` +
    `wrote dossier.json (${dossier.length} bytes) to ${outputDir}`,
);
