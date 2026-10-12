// Setup check for this repo and its map-assets submodule. Prints what is wrong and the command that fixes it.
// Usage: npm run doctor   (exit code 1 when something must be fixed; warnings alone exit 0)
import { execSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';

const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
let errors = 0, warnings = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const warn = (msg, fix) => { warnings++; console.log(`  ! ${msg}${fix ? `\n      fix: ${fix}` : ''}`); };
const fail = (msg, fix) => { errors++; console.log(`  ✗ ${msg}${fix ? `\n      fix: ${fix}` : ''}`); };

console.log('klec-midvalley-infographic doctor\n');

// Node
const major = +process.versions.node.split('.')[0];
if (major >= 22) ok(`Node ${process.versions.node}`); else fail(`Node ${process.versions.node} is too old (need 22+)`, 'install Node 22 LTS (e.g. `nvm install 22`)');

// submodule present and at the commit this repo records ("git submodule status": state flag, sha, path, (describe))
const status = sh('git submodule status map-assets');
const [, flag = '', sha = ''] = status?.match(/^([-+U]?)([0-9a-f]+)/) ?? [];
const described = status?.match(/\((.*)\)/)?.[1];
const isLink = existsSync('map-assets') && lstatSync('map-assets').isSymbolicLink();
if (isLink) warn('map-assets/ is a symlink, not the submodule (fine for local experiments only)');
else if (!sha) fail('map-assets/ is not registered as a git submodule', 'see README, "Set up"');
else if (flag === '-') fail('map-assets/ is empty: the submodule is not checked out', 'git submodule update --init');
else if (flag === 'U') fail('map-assets has a merge conflict in the submodule pointer', 'pick a map-assets commit: git -C map-assets checkout <tag>, then git add map-assets');
else if (flag === '+') warn(`map-assets is checked out at a different commit than this repo records (${sha.slice(0, 8)}${described ? `, ${described}` : ''})`, 'to match this repo: git submodule update   |   to adopt it: git add map-assets && git commit');
else ok(`map-assets at ${sha.slice(0, 8)}${described ? ` (${described})` : ''}`);
if (sha && flag !== '-' && !existsSync('map-assets/src/index.ts')) fail('map-assets/ has no src/index.ts at this commit (not a map-assets release)', 'git submodule update');

if (existsSync('map-assets/.git')) {
  if (sh('git -C map-assets status --porcelain')) warn('map-assets has uncommitted changes', 'commit them in map-assets and open a PR there (see map-assets/CONTRIBUTING.md), or discard them');
  // only origin (spacingouty09/map-assets) counts: a commit that is only on a fork can't be fetched through the submodule
  const head = sh('git -C map-assets rev-parse HEAD');
  const onOrigin = sh('git -C map-assets branch -r --contains HEAD --list "origin/*"');
  if (head && !onOrigin) warn('the checked-out map-assets commit is not on spacingouty09/map-assets yet', 'get it there first (push, or merge your pull request from a fork) before committing the pointer here; other people cannot fetch it');
}

// one copy of three.js
if (!existsSync('node_modules/three')) fail('dependencies are not installed', 'npm ci');
else {
  const have = JSON.parse(readFileSync('node_modules/three/package.json', 'utf8')).version;
  const want = existsSync('map-assets/package.json') ? JSON.parse(readFileSync('map-assets/package.json', 'utf8')).peerDependencies?.three : null;
  const minor = (v) => String(v).replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.');
  if (want && minor(have) !== minor(want)) fail(`three ${have} installed, map-assets expects ${want}`, `npm install three@${want.replace(/^[^\d]*/, '')} @types/three@${minor(want)}`);
  else ok(`three ${have}${want ? ` (map-assets wants ${want})` : ''}`);
}
if (existsSync('map-assets/node_modules') && !lstatSync('map-assets').isSymbolicLink()) warn('map-assets/node_modules exists: a second copy of three.js can confuse the type checker', 'rm -rf map-assets/node_modules  (install map-assets deps only in a separate map-assets clone)');

// convenience
if (sh('git config --get submodule.recurse') !== 'true') warn('git does not update the submodule on pull / checkout', 'git config submodule.recurse true');

console.log(`\n${errors ? `${errors} problem(s) to fix` : 'setup OK'}${warnings ? `, ${warnings} warning(s)` : ''}`);
process.exit(errors ? 1 : 0);
