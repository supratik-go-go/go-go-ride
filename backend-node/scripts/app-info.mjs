#!/usr/bin/env node
// Writes the app-info.json behind the download page and the app's update popup.
//   node scripts/app-info.mjs <android/app/build.gradle> <GO-GO-Ride.apk> <out/app-info.json>
import fs from 'node:fs'
import path from 'node:path'

const [gradle, apk, out] = process.argv.slice(2)
const source = fs.readFileSync(gradle, 'utf8')
const versionName = (source.match(/versionName\s+"([^"]+)"/) || [])[1] || '1.0'
const versionCode = Number((source.match(/versionCode\s+(\d+)/) || [])[1] || 1)
const notesFile = path.join(path.dirname(gradle), '..', '..', 'release-notes.txt')
const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : ''
const sizeMB = Number((fs.statSync(apk).size / 1048576).toFixed(1))
fs.writeFileSync(out, JSON.stringify({ version: versionName, versionCode, notes, sizeMB, builtAt: new Date().toISOString() }, null, 2))
console.log(`         app-info.json: version ${versionName}, ${sizeMB} MB`)
