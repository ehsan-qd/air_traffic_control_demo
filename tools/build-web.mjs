import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// The hosted demo plays recorded evidence unless a live service is explicitly configured.
const env = {
  ...process.env,
  NAT_HOSTED_BUILD: '1',
  VITE_RECORDED_ONLY: process.env.VITE_NAT_BACKEND_URL ? 'false' : 'true',
};
const result = spawnSync('npm', ['run', 'build', '--prefix', 'web'], {
  cwd: root, env, stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
