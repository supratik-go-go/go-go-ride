// App v1.10: voice search (what the phone heard, in English, Bengali or Hindi -> From and To stops)
// and local police numbers on the Emergency Call List (sent by users, shown after an admin approves).
// Suggestions may include stops made by earlier cases (random ids), so ids are left out.
const voice = (name, heard) => ({ name: `voice: ${name}`, method: 'POST', path: '/stops/voice-trip', body: { heard }, ignore: ['id'] })
const police = { stationName: 'Howrah Police Station', area: 'Howrah', phone: '033-2638 4500' }
const firstPending = async (get) => ({ policeId: (await get('/admin/police-numbers?status=PENDING', 'admin'))?.[0]?.id })

const cases = [
  voice('English', ['Howrah Station to Esplanade']),
  voice('Bengali', ['হাওড়া থেকে এসপ্ল্যানেড যাব']),
  voice('Hindi', ['हावड़ा से एस्प्लेनेड जाना है']),
  voice('only a destination', ['I want to go to Sealdah']),
  voice('best of several guesses', ['how are station to esplanade', 'Howrah station to Esplanade']),
  voice('nothing like a stop', ['xyz qwerty']),
  { name: 'voice: nothing heard', method: 'POST', path: '/stops/voice-trip', body: { heard: [] } },

  { name: 'police: list (empty)', path: '/police-numbers' },
  { name: 'police: send signed out', method: 'POST', path: '/police-numbers', body: police },
  { name: 'police: send', method: 'POST', path: '/police-numbers', as: 'passenger', body: police, ignore: ['id'] },
  { name: 'police: same number again', method: 'POST', path: '/police-numbers', as: 'passenger', body: police },
  { name: 'police: bad phone', method: 'POST', path: '/police-numbers', as: 'passenger', body: { ...police, phone: 'call me' } },
  { name: 'police: not shown before approval', path: '/police-numbers' },
  { name: 'police: admin list as passenger', path: '/admin/police-numbers', as: 'passenger', mode: 'status' },
  { name: 'police: admin list', path: '/admin/police-numbers?status=PENDING', as: 'admin', ignore: ['id'] },
  {
    name: 'police: approve with a corrected area',
    method: 'PATCH',
    path: (ctx) => `/admin/police-numbers/${ctx.policeId}`,
    as: 'admin',
    prepare: firstPending,
    body: { status: 'APPROVED', area: 'Howrah Maidan' },
    ignore: ['id'],
  },
  { name: 'police: shown after approval', path: '/police-numbers', ignore: ['id'] },
  { name: 'police: search by area', path: '/police-numbers?search=maidan', ignore: ['id'] },
  { name: 'police: unknown id', method: 'PATCH', path: '/admin/police-numbers/nope', as: 'admin', body: { status: 'REJECTED' } },
]

export default cases
