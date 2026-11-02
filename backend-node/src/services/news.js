// Local headlines for the app's Daily News tab, read from publishers' public RSS feeds.
// Only the headline, source, time and link are shown; the story opens on the publisher's site.
const FEEDS = [
  { source: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128830821.cms' },
  { source: 'The Hindu', url: 'https://www.thehindu.com/news/national/west-bengal/feeder/default.rss' },
]
const CACHE_MS = 30 * 60 * 1000
const TIMEOUT_MS = 8000
const LIMIT = 40

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function clean(raw) {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/\s+/g, ' ')
    .trim()
}

function tag(item, name) {
  const match = item.match(new RegExp(String.raw`<${name}(?:\s[^>]*)?>([\s\S]*?)</${name}>`, 'i'))
  return match ? clean(match[1]) : ''
}

export function parseFeed(xml, source) {
  const items = []
  for (const [, item] of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const title = tag(item, 'title')
    const url = tag(item, 'link')
    const time = Date.parse(tag(item, 'pubDate'))
    if (!title || !/^https:\/\//i.test(url)) continue
    items.push({ title, url, source, publishedAt: Number.isNaN(time) ? null : new Date(time).toISOString() })
  }
  return items
}

async function readFeed({ source, url }) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'Mozilla/5.0 GO-GO-Ride' } })
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`)
  return parseFeed(await response.text(), source)
}

let cache = { items: [], at: 0 }

/** Newest first across all feeds. A feed that is down never empties the list. */
export async function latestNews() {
  if (cache.items.length && Date.now() - cache.at < CACHE_MS) return cache.items
  const results = await Promise.allSettled(FEEDS.map(readFeed))
  const items = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, LIMIT)
  if (items.length) cache = { items, at: Date.now() }
  return cache.items
}
