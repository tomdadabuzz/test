import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const harmonyWebDir = path.join(rootDir, 'harmonyos', 'entry', 'src', 'main', 'resources', 'rawfile', 'web');

if (!fs.existsSync(distDir)) {
  console.error('Missing dist/ directory. Run `npm run build` first.');
  process.exit(1);
}

fs.rmSync(harmonyWebDir, { recursive: true, force: true });
fs.mkdirSync(harmonyWebDir, { recursive: true });
fs.cpSync(distDir, harmonyWebDir, { recursive: true, force: true });

console.log(`Synced dist/ -> ${path.relative(rootDir, harmonyWebDir)}`);
