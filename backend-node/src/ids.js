import crypto from 'node:crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
let counter = 0

function base36(value, width) {
  let out = ''
  let v = value
  while (v > 0) {
    out = ALPHABET[v % 36] + out
    v = Math.floor(v / 36)
  }
  return out.padStart(width, '0').slice(-width)
}

function randomChars(n, alphabet) {
  const bytes = crypto.randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i += 1) out += alphabet[bytes[i] % alphabet.length]
  return out
}

/** cuid-shaped id, identical in form to the Prisma and Python services. */
export function newId() {
  counter = (counter + 1) % 1679616 // 36 ** 4
  return `c${base36(Date.now(), 8)}${base36(counter, 4)}${randomChars(12, ALPHABET)}`
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Human-friendly reference, e.g. GGR7K2M9QX. */
export const randomRef = (prefix, length = 8) => prefix + randomChars(length, REF_ALPHABET)

export const generateOtp = (length = 6) => {
  let out = ''
  for (let i = 0; i < length; i += 1) out += crypto.randomInt(0, 10)
  return out
}
