// Verifies every `import { X } from 'lucide-react'` names a real icon.
// Usage: node scripts/check-icons.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as lucide from 'lucide-react'

const bad = []
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(jsx?|tsx?)$/.test(f)) {
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/g)) {
        for (const raw of m[1].split(',')) {
          const name = raw.trim().split(/\s+as\s+/)[0]
          if (name && !(name in lucide)) bad.push(`${p}: ${name}`)
        }
      }
    }
  }
}
walk('src')
if (bad.length) {
  console.log('Unknown lucide icons:\n' + bad.join('\n'))
  process.exit(1)
}
console.log('All lucide icon imports OK')
