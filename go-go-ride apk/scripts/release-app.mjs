#!/usr/bin/env node
// The steps of release-app.bat that need typed answers (a .bat file mangles quotes and & in text).
//   node release-app.mjs prepare   asks for the new version and the update note, writes the version files
//   node release-app.mjs publish   asks for YES, refuses secret files, commits, saves a restore point, pushes
// Exit codes: 0 done, 1 problem, 2 the owner chose not to publish yet.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const app = path.join(repo, 'go-go-ride apk')
const FILES = {
  gradle: path.join(app, 'android', 'app', 'build.gradle'),
  ios: path.join(app, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'),
  notes: path.join(app, 'release-notes.txt'),
  claude: path.join(repo, 'CLAUDE.md'),
}
// Never published: signing key, passwords, live data backups, local databases.
const SECRET = [/keystore/i, /\.jks$/i, /production-secrets/i, /(^|\/)\.env(\.local)?$/i, /\.env\..*\.local$/i, /gogoride-data.*\.zip$/i, /\.(db|sqlite)(-wal|-shm)?$/i]

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
const read = (file) => fs.readFileSync(file, 'utf8')
const versionOf = (gradle) => ({ code: Number(gradle.match(/versionCode\s+(\d+)/)?.[1]), name: gradle.match(/versionName\s+"([^"]+)"/)?.[1] })

function stop(message, code = 1) {
  console.log(`\n  ${message}`)
  process.exit(code)
}

/** Replace exactly what the pattern matches, and fail loudly if the file no longer looks as expected. */
function swap(file, pattern, replacement) {
  const text = read(file)
  if (!pattern.test(text)) stop(`Could not find ${pattern} in ${path.relative(repo, file)}. Ask Claude to look at it.`)
  fs.writeFileSync(file, text.replace(pattern, replacement))
}

function lastPublished() {
  try {
    return versionOf(git('show', 'HEAD:go-go-ride apk/android/app/build.gradle'))
  } catch {
    return null
  }
}

const nextName = (name) => name.replace(/(\d+)$/, (n) => String(Number(n) + 1))

async function prepare(ask) {
  const now = versionOf(read(FILES.gradle))
  if (!now.code || !now.name) stop('Could not read the version from build.gradle. Ask Claude to look at it.')
  const published = lastPublished()
  const oldNote = read(FILES.notes).trim()
  let target
  let pending = false

  if (published && now.code > published.code) {
    // Prepared on an earlier run that never got published (for example the build failed): build it again.
    pending = true
    target = now
    console.log(`  Version ${now.name} is already prepared but not published yet, so it is built again.`)
  } else {
    console.log(`  The app is now version ${now.name}.`)
    const typed = await ask(`  New version number (press Enter for ${nextName(now.name)}): `)
    const name = typed || nextName(now.name)
    if (!/^\d+\.\d+(\.\d+)?$/.test(name)) stop('Write the version as numbers, like 1.8 or 1.8.1.')
    if (name === now.name) stop(`The new version must be different from ${now.name}.`)
    target = { code: now.code + 1, name }
  }

  console.log(`\n  Update note now: ${oldNote || '(empty)'}`)
  let note = ''
  while (!note) {
    note = (await ask(pending ? '  New one-line note for users, or Enter to keep it: ' : '  One line for users, shown in the update popup: '))
      .replace(/\s+/g, ' ')
      .trim()
    if (!note && pending && oldNote) note = oldNote
    if (!note) console.log('  Please write a short line, for example: Faster bus search.')
  }
  if (note.length > 200) stop('Keep the note under 200 letters.')

  swap(FILES.gradle, /versionCode\s+\d+/, `versionCode ${target.code}`)
  swap(FILES.gradle, /versionName\s+"[^"]+"/, `versionName "${target.name}"`)
  swap(FILES.ios, /MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${target.name};`)
  swap(FILES.ios, /CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${target.code};`)
  fs.writeFileSync(FILES.notes, `${note}\n`)
  // Keeps the project summary right for the next Claude session.
  if (fs.existsSync(FILES.claude)) {
    const today = new Date().toISOString().slice(0, 10)
    const text = read(FILES.claude)
      .replace(/## Current state \(\d{4}-\d{2}-\d{2}\)/, `## Current state (${today})`)
      .replace(/- Live app: \*\*v[^*]+\*\* \(versionCode \d+\)\./, `- Live app: **v${target.name}** (versionCode ${target.code}).`)
    fs.writeFileSync(FILES.claude, text)
  }
  console.log(`\n  [ok]    Version ${target.name} (code ${target.code}) is ready to build.`)
  console.log(`  [ok]    Update note: ${note}`)
}

async function publish(ask) {
  const { name } = versionOf(read(FILES.gradle))
  const note = read(FILES.notes).trim()
  console.log('\n  ===============================================')
  console.log(`  Ready to publish app v${name}`)
  console.log(`  Note: ${note}`)
  console.log('  Everyone using the app will see "Update available".')
  console.log('  Any server changes in this folder go live at the same time.')
  console.log('  ===============================================')
  const answer = await ask('  Type YES to publish now (anything else stops here): ')
  if (answer !== 'YES') {
    stop('Not published. The new APK is in "go-go-ride apk\\GO-GO-Ride.apk" to try on your phone.\n  Run release-app.bat again when you are ready: it reuses this version.', 2)
  }

  git('add', '-A')
  const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean)
  const secret = staged.filter((f) => SECRET.some((re) => re.test(f)))
  if (secret.length) {
    git('reset', '-q')
    stop(`STOPPED: these private files would have been uploaded:\n    ${secret.join('\n    ')}\n  Nothing was published. Ask Claude to look at it.`)
  }

  if (staged.length) {
    console.log('\n  Saving the changes (this can take a few minutes on this PC)...')
    const commit = spawnSync('git', ['commit', '-q', '-m', `App v${name}: ${note}`], { cwd: repo, stdio: 'inherit' })
    if (commit.status !== 0) stop('Saving the changes failed - see the message above. Nothing was published.')
  } else {
    console.log('\n  No new changes to save - publishing the last saved version.')
  }

  const tag = spawnSync(process.execPath, [path.join(app, 'scripts', 'tag-release.mjs')], { cwd: repo, stdio: 'inherit' })
  if (tag.status !== 0) stop('Saving the restore point failed - see the message above. Nothing was published.')

  console.log('  Pushing to GitHub (a sign-in window may appear)...')
  const push = spawnSync('git', ['push', 'origin', 'main', '--tags'], { cwd: repo, stdio: 'inherit' })
  if (push.status !== 0) stop('The push failed - see the message above. Your changes are saved; run push-to-github.bat to try again.')

  console.log(`\n  Done! App v${name} goes live in about a minute.`)
  console.log('  Check in your browser:')
  console.log(`    https://go-goride.com/api/app-version   should show "${name}"`)
  console.log('    https://go-goride.com/api/stats         should still show your users')
}

const step = process.argv[2]
if (step !== 'prepare' && step !== 'publish') stop('Usage: node release-app.mjs prepare|publish')
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = async (question) => (await rl.question(question)).trim()
try {
  await (step === 'prepare' ? prepare(ask) : publish(ask))
} finally {
  rl.close()
}
