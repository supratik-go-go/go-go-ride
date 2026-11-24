// Voice search: turns what a passenger said ("Howrah to Esplanade", "হাওড়া থেকে এসপ্ল্যানেড",
// "हावड़ा से एस्प्लेनेड") into a From and a To stop. Bengali and Hindi words are spelled out in
// English letters, then compared with every stop's name (and second name) by how alike they
// sound, so "হাওড়া" (haora) finds "Howrah Station". Names people say differently altogether
// ("ধর্মতলা" for Esplanade) need that stop's second name to be filled in.
import { all } from '../db.js'

// ---------------------------------------------------------------- Bengali / Hindi letters -> Latin

const BN_CONSONANTS = {
  ক: 'k', খ: 'kh', গ: 'g', ঘ: 'gh', ঙ: 'ng', চ: 'ch', ছ: 'chh', জ: 'j', ঝ: 'jh', ঞ: 'n', ট: 't', ঠ: 'th', ড: 'd', ঢ: 'dh', ণ: 'n',
  ত: 't', থ: 'th', দ: 'd', ধ: 'dh', ন: 'n', প: 'p', ফ: 'f', ব: 'b', ভ: 'bh', ম: 'm', য: 'j', র: 'r', ল: 'l', শ: 'sh', ষ: 'sh',
  স: 's', হ: 'h', ড়: 'r', ঢ়: 'rh', য়: 'y', ৎ: 't',
}
const BN_VOWELS = { অ: 'o', আ: 'a', ই: 'i', ঈ: 'i', উ: 'u', ঊ: 'u', ঋ: 'ri', এ: 'e', ঐ: 'oi', ও: 'o', ঔ: 'ou' }
const BN_SIGNS = { 'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou' }
const BN_MARKS = { 'ং': 'ng', 'ঃ': 'h', 'ঁ': '', '়': '' }

const HI_CONSONANTS = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n', ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n', प: 'p', फ: 'f', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'w', श: 'sh',
  ष: 'sh', स: 's', ह: 'h', ड़: 'r', ढ़: 'rh', क़: 'k', ख़: 'kh', ग़: 'g', ज़: 'z', फ़: 'f',
}
const HI_VOWELS = { अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o' }
const HI_SIGNS = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o' }
const HI_MARKS = { 'ं': 'n', 'ः': 'h', 'ँ': 'n', '़': '' }

const SCRIPTS = [
  { test: /[ঀ-৿]/, consonants: BN_CONSONANTS, vowels: BN_VOWELS, signs: BN_SIGNS, marks: BN_MARKS, virama: '্', inherent: 'o' },
  { test: /[ऀ-ॿ]/, consonants: HI_CONSONANTS, vowels: HI_VOWELS, signs: HI_SIGNS, marks: HI_MARKS, virama: '्', inherent: 'a' },
]

/** One word in Bengali or Devanagari letters -> English letters, roughly as it is said. */
function romanizeWord(word, s) {
  // Units: a consonant with its vowel (sign, inherent or none), or a standalone vowel or mark.
  const chars = [...word.normalize('NFC')]
  const units = []
  for (let i = 0; i < chars.length; i++) {
    let c = chars[i]
    if (chars[i + 1] === '়' || chars[i + 1] === '़') c += chars[++i] // nukta forms (ড় written as ড + ়)
    if (s.consonants[c] !== undefined) {
      const next = chars[i + 1]
      // য after ্ is the "ya" glide (এসপ্ল্যানেড), not a full j.
      const cons = c === 'য' && chars[i - 1] === s.virama ? 'y' : s.consonants[c]
      if (next === s.virama) {
        units.push({ cons, vowel: '' })
        i += 1
      } else if (s.signs[next] !== undefined) {
        units.push({ cons, vowel: s.signs[next] })
        i += 1
      } else units.push({ cons, vowel: null }) // inherent vowel, decided below
    } else if (s.vowels[c] !== undefined) units.push({ cons: '', vowel: s.vowels[c] })
    else if (s.marks[c] !== undefined) units.push({ cons: s.marks[c], vowel: '' })
  }
  // The inherent vowel is not said at the end of a word, nor between a vowel and a consonant that
  // carries its own vowel ("हावड़ा" is "haavDaa", not "haavaDaa").
  return units
    .map((u, i) => {
      if (u.vowel !== null) return u.cons + u.vowel
      const last = i === units.length - 1
      const prevVowel = i > 0 && units[i - 1].vowel !== ''
      const nextHasVowel = units[i + 1] && units[i + 1].cons && units[i + 1].vowel !== null && units[i + 1].vowel !== ''
      return u.cons + (last || (prevVowel && nextHasVowel && i > 0) ? '' : s.inherent)
    })
    .join('')
}

/** Text in any of the three scripts -> lowercase English letters and spaces. */
export function romanize(text) {
  return String(text)
    .split(/\s+/)
    .map((word) => {
      const script = SCRIPTS.find((s) => s.test.test(word))
      return script ? romanizeWord(word, script) : word
    })
    .join(' ')
    .toLowerCase()
}

// ---------------------------------------------------------------- comparing by sound

const FILLER = /\b(bus\s*stand|bus\s*stop|bas\s*st[iy]?and|i?st[ae]sh?[ao]n|stand|station|stn|more|mor|road|rd|bazar|bazaar|bajar|junction|jn|stop|bus|bas)\b/g

/** A spelling-independent key: "Howrah" and "haora" come out close. */
export function soundKey(text) {
  return romanize(text)
    .normalize('NFKD')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/chh/g, 'ch')
    .replace(/ph/g, 'f')
    .replace(/([bdgjkrt])h/g, '$1')
    .replace(/sh/g, 's')
    .replace(/w/g, 'o') // Howrah ~ haora
    .replace(/v/g, 'b')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/y/g, 'i')
    .replace(/ou|au/g, 'o')
    .replace(/(.)\1+/g, '$1')
    .replace(/h\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Jaro-Winkler similarity, 0 (different) to 1 (same). */
function similarity(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aHit = new Array(a.length).fill(false)
  const bHit = new Array(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bHit[j] || a[i] !== b[j]) continue
      aHit[i] = bHit[j] = true
      matches += 1
      break
    }
  }
  if (!matches) return 0
  let k = 0
  let swaps = 0
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue
    while (!bHit[k]) k += 1
    if (a[i] !== b[k]) swaps += 1
    k += 1
  }
  const jaro = (matches / a.length + matches / b.length + (matches - swaps / 2) / matches) / 3
  let prefix = 0
  while (prefix < 4 && a[prefix] === b[prefix]) prefix += 1
  return jaro + prefix * 0.1 * (1 - jaro)
}

/** How well a spoken place matches a stop: the best of its full name, its name without "station"
 *  and similar words, and its second name. */
function score(spoken, stop) {
  let best = 0
  // The second name may list several, separated by commas ("Dharmatala, ধর্মতলা").
  const names = [stop.name, ...String(stop.otherName || '').split(/[,;]/)].map((n) => n.trim()).filter(Boolean)
  for (const name of names) {
    const core = soundKey(romanize(name).replace(FILLER, ' '))
    best = Math.max(best, similarity(spoken.key, soundKey(name)), core && spoken.core ? similarity(spoken.core, core) : 0)
  }
  return best
}

// ---------------------------------------------------------------- "X to Y" in three languages

// Words around the places that are not places: "I want to go", "bus", "যাব", "जाना है"...
const NOISE = [
  /^(i\s+want\s+to\s+go|i\s+want\s+to\s+travel|show\s+me|bus(es)?|a\s+bus|the\s+bus)\s+/i,
  /^(to|towards)\s+/i,
  /\s+(bus(es)?|please|jabo|jabe|jete\s+chai|jana\s+hai|jana)$/i,
  /\s*(যাব|যাবো|যেতে চাই|যাওয়ার বাস|যাওয়ার|বাস|পর্যন্ত|অবধি)$/u,
  /\s*(जाना है|जाना|जाने के लिए|की बस|बस|तक)$/u,
]
const SPLITTERS = [
  /^(?:from\s+)?(.+?)\s+(?:to|2|till|towards|upto|up\s+to)\s+(.+)$/i,
  /^(.+?)\s*থেকে\s+(.+)$/u,
  /^(.+?)\s+(?:से)\s+(.+)$/u,
  /^(.+?)\s+(?:theke|se)\s+(.+)$/i,
]

/** "Howrah to Esplanade" -> { from: 'Howrah', to: 'Esplanade' }; one place alone is the destination. */
export function splitTrip(text) {
  let t = String(text).trim().replace(/[।.,!?]+$/u, '')
  for (let i = 0; i < 3; i++) for (const n of NOISE) t = t.replace(n, '').trim()
  for (const re of SPLITTERS) {
    const m = t.match(re)
    if (m) return { from: m[1].trim(), to: m[2].trim() }
  }
  return { from: null, to: t || null }
}

// ---------------------------------------------------------------- the endpoint's work

// Sure enough to fill the field (and search) by itself. On the owner's 707 stops right matches
// scored 0.90-1.00 and wrong ones up to 0.86 (2026-11-25).
const PICK = 0.89

async function activeStops() {
  return all("SELECT id, name, other_name FROM bus_stops WHERE status = 'ACTIVE'")
}

export function bestStops(place, stops, limit = 3) {
  if (!place) return []
  const spoken = { key: soundKey(place), core: soundKey(romanize(place).replace(FILLER, ' ')) }
  return stops
    .map((s) => ({ id: s.id, name: s.name, score: Math.round(score(spoken, s) * 100) / 100 }))
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .slice(0, limit)
}

/**
 * What the phone heard (its best guesses, most likely first) -> the trip. Each guess is split into
 * From and To and matched; the guess whose places match best wins.
 */
export async function understandTrip(guesses) {
  const stops = await activeStops()
  let best = null
  for (const heard of guesses.filter(Boolean).slice(0, 5)) {
    const parts = splitTrip(heard)
    const from = bestStops(parts.from, stops)
    const to = bestStops(parts.to, stops)
    const total = (from[0]?.score ?? (parts.from ? 0 : 1)) + (to[0]?.score ?? 0)
    if (!best || total > best.total) best = { total, heard, parts, from, to }
  }
  if (!best) return { heard: '', from: null, to: null, fromOptions: [], toOptions: [] }
  const pick = (list) => (list[0] && list[0].score >= PICK ? { id: list[0].id, name: list[0].name } : null)
  return {
    heard: best.heard,
    fromText: best.parts.from,
    toText: best.parts.to,
    from: pick(best.from),
    to: pick(best.to),
    fromOptions: best.from.map(({ id, name }) => ({ id, name })),
    toOptions: best.to.map(({ id, name }) => ({ id, name })),
  }
}
