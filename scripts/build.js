import path from 'path';

import fs from 'fs-extra';

// Simple build step: copy src to dist (since we're using plain JS ESM for now)
const srcDir = path.resolve('src');
const distDir = path.resolve('dist');
await fs.remove(distDir);
await fs.copy(srcDir, distDir);
console.log('Built to dist/');
