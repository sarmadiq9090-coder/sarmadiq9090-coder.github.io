// Loads Playwright: the project's own copy (npm ci, as in CI) or, locally, the globally installed one.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

export function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  const globalRoot = execSync('npm root -g').toString().trim();
  return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
}
