#!/usr/bin/env node
// Saves a restore point for rollback.bat on the current commit. Run before pushing.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()

if (git('tag', '--points-at', 'HEAD', '--list', 'release-*')) process.exit(0)

const gradle = fs.readFileSync(path.join(repo, 'go-go-ride apk', 'android', 'app', 'build.gradle'), 'utf8')
const version = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? '?'
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
git('tag', '-a', `release-${stamp}`, '-m', `v${version}: ${git('log', '-1', '--format=%s')}`)
console.log(`  Restore point saved (app v${version}).`)
