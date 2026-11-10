import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const isolatedEnv = {
  ...process.env,
  // Keep the real Pawtrackr project reference so the Supabase browser client
  // derives the same deterministic storage key used by fixture sessions, but
  // use a reserved non-routable TLD and a non-secret test key. No E2E request
  // can reach or mutate the hosted project.
  NEXT_PUBLIC_SUPABASE_URL: 'https://jdauajfcmsaamhgyklng.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_pawtrackr_ci_only',
};

function run(args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: isolatedEnv });
  if (result.error) throw result.error;
  if (result.signal) {
    console.error(`Command terminated by ${result.signal}.`);
    return 1;
  }
  return result.status ?? 1;
}

const buildStatus = run(['run', 'build']);
if (buildStatus !== 0) process.exit(buildStatus);

process.exit(run(['exec', '--', 'playwright', 'test']));
