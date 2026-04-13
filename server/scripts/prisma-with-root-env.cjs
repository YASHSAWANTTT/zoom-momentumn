/**
 * Loads repo-root .env before Prisma CLI so DATABASE_URL is set when cwd is server/.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const serverDir = path.join(__dirname, '..');
const rootEnv = path.join(serverDir, '..', '.env');

require('dotenv').config({ path: rootEnv });

const args = process.argv.slice(2);
const result = spawnSync('npx', ['prisma', ...args], {
  stdio: 'inherit',
  env: process.env,
  cwd: serverDir,
  shell: false,
});

process.exit(result.status === null ? 1 : result.status);
