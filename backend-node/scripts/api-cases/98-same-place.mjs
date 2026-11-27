// "Same place": an admin joins a stop to the one it really is (Chandrakona into Chandrakona Town). Its
// buses move over and its name stays as another name, so typing it still finds the kept stop.
// Runs last: Howrah Bridge is gone afterwards.
const stopId = async (get, name) => (await get(`/stops?search=${encodeURIComponent(name)}&limit=50`))?.find((s) => s.name === name)?.id
const pair = async (get) => ({ bridge: await stopId(get, 'Howrah Bridge'), station: await stopId(get, 'Howrah Station') })

const cases = [
  { name: 'same place: not for a bus owner', method: 'POST', path: (ctx) => `/stops/${ctx.bridge}/merge`, as: 'owner', prepare: pair, body: (ctx) => ({ intoStopId: ctx.station }), mode: 'status' },
  { name: 'same place: into itself', method: 'POST', path: (ctx) => `/stops/${ctx.bridge}/merge`, as: 'admin', body: (ctx) => ({ intoStopId: ctx.bridge }) },
  { name: 'same place: unknown stop', method: 'POST', path: '/stops/no-such-stop/merge', as: 'admin', body: (ctx) => ({ intoStopId: ctx.station }) },
  { name: 'same place: no stop chosen', method: 'POST', path: (ctx) => `/stops/${ctx.bridge}/merge`, as: 'admin', body: {}, mode: 'status' },
  { name: 'same place: buses at Howrah Bridge before', path: '/buses/search?from=Howrah%20Bridge', mode: 'status' },
  { name: 'same place: join Howrah Bridge to Howrah Station', method: 'POST', path: (ctx) => `/stops/${ctx.bridge}/merge`, as: 'admin', body: (ctx) => ({ intoStopId: ctx.station }) },
  { name: 'same place: the joined stop is gone', path: (ctx) => `/stops/${ctx.bridge}` },
  { name: 'same place: its name finds the kept stop', path: '/stops?search=Howrah%20Bridge' },
  // Some of these buses are made by earlier cases, with new ids each run.
  { name: 'same place: search by the old name', path: '/buses/search?from=Howrah%20Bridge&to=Esplanade', ignore: ['id'] },
]

export default cases
