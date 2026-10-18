#!/usr/bin/env node
// Writes the app-info.json shown on the download page (version + size of the APK).
//   node scripts/app-info.mjs <android/app/build.gradle> <GO-GO-Ride.apk> <out/app-info.json>
import fs from 'node:fs'

const [gradle, apk, out] = process.argv.slice(2)
const versionName = (fs.readFileSync(gradle, 'utf8').match(/versionName\s+"([^"]+)"/) || [])[1] || '1.0'
const sizeMB = Number((fs.statSync(apk).size / 1048576).toFixed(1))
fs.writeFileSync(out, JSON.stringify({ version: versionName, sizeMB, builtAt: new Date().toISOString() }, null, 2))
console.log(`         app-info.json: version ${versionName}, ${sizeMB} MB`)
