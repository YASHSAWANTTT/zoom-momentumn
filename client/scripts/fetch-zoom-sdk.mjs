/**
 * Download Zoom Apps SDK bootstrap to same-origin /zoom-sdk.js so ad blockers
 * that block third-party scripts (appssdk.zoom.us) do not break the in-meeting app.
 *
 * Run automatically before `vite` / `vite build`. Set FORCE_ZOOM_SDK_FETCH=1 to refresh.
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public');
const outFile = join(outDir, 'zoom-sdk.js');
const url = 'https://appssdk.zoom.us/sdk.js';

function fetchUrl(target) {
  return new Promise((resolve, reject) => {
    https
      .get(target, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (!loc) {
            reject(new Error('Redirect without location'));
            return;
          }
          fetchUrl(loc).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  if (existsSync(outFile) && process.env.FORCE_ZOOM_SDK_FETCH !== '1') {
    console.log('[fetch-zoom-sdk] Using existing public/zoom-sdk.js (set FORCE_ZOOM_SDK_FETCH=1 to re-download)');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  console.log('[fetch-zoom-sdk] Downloading', url, '...');
  const buf = await fetchUrl(url);
  writeFileSync(outFile, buf);
  console.log('[fetch-zoom-sdk] Wrote', outFile, `(${buf.length} bytes)`);
}

main().catch((err) => {
  console.error('[fetch-zoom-sdk] Failed:', err.message);
  process.exit(1);
});
