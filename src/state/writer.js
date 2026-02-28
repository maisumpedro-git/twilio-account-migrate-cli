// src/state/writer.js
import path from 'node:path';

import { ensureDir, writeJson } from 'fs-extra';

export async function writeState(dir, resourceType, resources) {
  const stateDir = path.join(dir, 'state');
  await ensureDir(stateDir);
  await writeJson(
    path.join(stateDir, `${resourceType}.json`),
    { fetchedAt: new Date().toISOString(), resources },
    { spaces: 2 },
  );
}

export async function writeMigrationsTracker(dir, tracker) {
  const stateDir = path.join(dir, 'state');
  await ensureDir(stateDir);
  await writeJson(path.join(stateDir, 'migrations.json'), tracker, { spaces: 2 });
}
