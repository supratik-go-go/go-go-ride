// Recent searches of guests (not signed in), kept only on this phone. Signed-in users' searches
// are kept by the server (/users/me/recent-searches) and need nothing here.
const KEY = 'gogo.recentSearches'
const KEEP = 10

export function localSearches() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** { searchType, fromText?, toText?, query? }; the same search again moves to the top. */
export function saveLocalSearch(s) {
  const same = (x) => x.searchType === s.searchType && (x.fromText || '') === (s.fromText || '') && (x.toText || '') === (s.toText || '') && (x.query || '') === (s.query || '')
  const entry = { ...s, id: `local-${Date.now()}`, searchedAt: new Date().toISOString() }
  const list = [entry, ...localSearches().filter((x) => !same(x))].slice(0, KEEP)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage full or blocked: the search still runs, it just isn't remembered.
  }
}

export function removeLocalSearch(id) {
  try {
    localStorage.setItem(KEY, JSON.stringify(localSearches().filter((x) => x.id !== id)))
  } catch {
    // ignore
  }
}
