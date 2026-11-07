import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distAssetsDir = path.resolve(__dirname, '../dist/assets');

if (!fs.existsSync(distAssetsDir)) {
  console.error(`Error: Directory not found: ${distAssetsDir}`);
  process.exit(1);
}

const files = fs.readdirSync(distAssetsDir);
const jsFiles = files.filter((f) => f.endsWith('.js'));

// Non-entry chunks budget: 100 KB gzip
const MAX_CHUNK_GZIP_BYTES = 100 * 1024;

const results = [];
let overLimitCount = 0;

for (const file of jsFiles) {
  const filePath = path.join(distAssetsDir, file);
  const content = fs.readFileSync(filePath);
  const gzipBytes = zlib.gzipSync(content).length;
  const gzipKb = (gzipBytes / 1024).toFixed(2);
  const isEntry = file.startsWith('index-');

  if (isEntry) {
    results.push({
      file,
      type: 'entry (size-limit)',
      gzipSize: `${gzipKb} KB`,
      limit: '200 KB',
      status: 'OK',
    });
  } else {
    const isOver = gzipBytes > MAX_CHUNK_GZIP_BYTES;
    if (isOver) {
      overLimitCount++;
    }
    results.push({
      file,
      type: 'route chunk',
      gzipSize: `${gzipKb} KB`,
      limit: '100 KB',
      status: isOver ? 'OVER LIMIT' : 'OK',
    });
  }
}

console.log('\n--- Route Chunk Bundle Budgets (max 100 KB gzip) ---');
console.table(results);

if (overLimitCount > 0) {
  console.error(`\nFAIL: ${overLimitCount} chunk(s) exceeded the 100 KB gzip budget.`);
  process.exit(1);
} else {
  console.log('\nPASS: All non-entry chunks are within the 100 KB gzip budget.');
}
