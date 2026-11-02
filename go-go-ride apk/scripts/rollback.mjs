#!/usr/bin/env node
// Puts the app and server code back to an earlier restore point. Run it with rollback.bat.
//   --no-build  skip the APK build (for testing this script)
//   --no-push   keep the result on this PC
//
// Android refuses to install a lower version over a higher one, so an app rollback is
// released as a NEW, higher version built from the old code. Phones then get it through
// the normal update popup. The database is never touched.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const flags = new Set(process.argv.slice(2))
const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.join(appDir, '..')
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
const stop = (message) => {
  console.log(`\n  ${message}\n`)
  process.exit(1)
}

// Code that goes back. Build numbers, the signing key and published APKs are left alone.
const APP_PATHS = ['go-go-ride apk/src', 'go-go-ride apk/index.html', 'go-go-ride apk/public', 'go-go-ride apk/package.json', 'go-go-ride apk/package-lock.json']
const SERVER_PATHS = ['backend-node/src', 'backend-node/package.json', 'backend-node/package-lock.json', 'backend-node/public/index.html', 'backend-node/public/privacy.html', 'backend-node/public/assets']

const changed = (tag, paths) => git('diff', '--name-only', tag, 'HEAD', '--', ...paths) !== ''

function raiseVersion() {
  const gradleFile = path.join(appDir, 'android', 'app', 'build.gradle')
  const gradle = fs.readFileSync(gradleFile, 'utf8')
  const code = Number(gradle.match(/versionCode\s+(\d+)/)[1]) + 1
  const [major, minor] = gradle.match(/versionName\s+"(\d+)\.(\d+)"/).slice(1).map(Number)
  const name = `${major}.${minor + 1}`
  fs.writeFileSync(gradleFile, gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]+"/, `versionName "${name}"`))

  const xcodeFile = path.join(appDir, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj')
  const xcode = fs.readFileSync(xcodeFile, 'utf8')
  fs.writeFileSync(xcodeFile, xcode.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${name};`).replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${code};`))
  return name
}

function buildApp() {
  const url = fs.readFileSync(path.join(appDir, '.env.production'), 'utf8').match(/VITE_API_URL=(\S+)/)?.[1]
  console.log('\n  Building the app. This can take 20 minutes or more...\n')
  const install = spawnSync('cmd', ['/c', 'npm install --no-audit --no-fund'], { cwd: appDir, stdio: 'inherit' })
  if (install.status !== 0) stop('Installing packages failed. Nothing was published.')
  const build = spawnSync('cmd', ['/c', 'build-apk.bat', url], { cwd: appDir, stdio: 'inherit', env: { ...process.env, GOGO_NO_PAUSE: '1' } })
  if (build.status !== 0) stop('The build failed. Nothing was published. To undo the changes on this PC, run: git restore --staged --worktree .')
}

if (git('status', '--porcelain')) stop('You have changes that are not pushed yet. Run push-to-github.bat first, then try again.')

const points = git('for-each-ref', 'refs/tags/release-*', '--sort=-refname', '--count=11', '--format=%(refname:short)|%(creatordate:format:%d %b %Y %H:%M)|%(contents:subject)')
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split('|'))
const current = git('tag', '--points-at', 'HEAD', '--list', 'release-*')
const choices = points.filter(([tag]) => tag !== current).slice(0, 10)
if (!choices.length) stop('There is no earlier restore point yet.')

console.log('\n  Restore points, newest first:\n')
choices.forEach(([, date, subject], i) => console.log(`   ${String(i + 1).padStart(2)}.  ${date}   ${subject}`))

const ask = createInterface({ input: process.stdin, output: process.stdout })
const picked = choices[Number(await ask.question('\n  Number to go back to (Enter to cancel): ')) - 1]
if (!picked) {
  ask.close()
  stop('Cancelled. Nothing was changed.')
}
const [tag, date, subject] = picked
const appBack = changed(tag, APP_PATHS)
const serverBack = changed(tag, SERVER_PATHS)
if (!appBack && !serverBack) {
  ask.close()
  stop('That restore point has the same code as now. Nothing to do.')
}

console.log(`\n  Going back to: ${date}   ${subject}`)
console.log(`   - Phone app: ${appBack ? 'will go back, as a new version with the update popup' : 'no change'}`)
console.log(`   - Server:    ${serverBack ? 'will go back' : 'no change'}`)
console.log('   - Users, bookings and other data: not touched\n')
const answer = await ask.question('  Type YES to continue: ')
ask.close()
if (answer.trim() !== 'YES') stop('Cancelled. Nothing was changed.')

// Anything added since that restore point has no older copy, so it is removed.
const inRestorePoint = (file) => git('ls-tree', '--name-only', tag, '--', file) !== ''
const paths = [...APP_PATHS, ...SERVER_PATHS]
git('restore', `--source=${tag}`, '--staged', '--worktree', '--', ...paths.filter(inRestorePoint))
for (const file of paths.filter((p) => !inRestorePoint(p) && fs.existsSync(path.join(repo, p)))) git('rm', '-r', '-q', '--', file)

let version = null
if (appBack) {
  version = raiseVersion()
  fs.writeFileSync(path.join(appDir, 'release-notes.txt'), 'This update fixes a problem found in the last version.\n')
  if (!flags.has('--no-build')) buildApp()
}

git('add', '-A', '--', 'go-go-ride apk', 'backend-node')
git('commit', '-m', `Rollback to ${date}${version ? ` as app v${version}` : ''}`)
execFileSync('node', [path.join(appDir, 'scripts', 'tag-release.mjs')], { stdio: 'inherit' })

if (flags.has('--no-push')) {
  console.log('\n  Rolled back on this PC only (not pushed).\n')
  process.exit(0)
}
try {
  execFileSync('git', ['push', 'origin', 'main', '--tags'], { cwd: repo, stdio: 'inherit' })
} catch {
  stop('The rollback is saved on this PC, but pushing failed. Run push-to-github.bat to try again.')
}
console.log('\n  Rollback pushed to both GitHub accounts.')
console.log('  If Hostinger auto-deploy is not connected yet, run deploy-hostinger-cloud\\make-api-package.bat')
console.log('  and upload gogoride-api.zip in hPanel, or phones will not see this version.\n')
