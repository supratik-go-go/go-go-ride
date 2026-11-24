// The bigger Excel sheet (Buses and Stops tabs, two trips per bus: out and back) and searching
// those buses in both directions. Runs last; the import writes to the throwaway database, so the
// cases after it see the imported buses. Imported buses and stops get random ids, so ids are left
// out of the comparison (times are fixed by the frozen clock).
const sheet = { path: 'files/bus-trips.xlsx' }
const NEW_IDS = ['id', 'busId', 'stopId', 'fromStopId', 'toStopId', 'tripId', 'boardingStopId', 'arrivalStopId']

// The out-and-back test bus and its two end stops, found through the search.
const outAndBack = async (get) => {
  const bus = (await get('/buses/search?from=Test%20Ghat&to=Test%20Bazar'))?.buses?.[0]
  return { outBackId: bus?.id, testGhatId: bus?.from?.id, testBazarId: bus?.to?.id }
}

const cases = [
  { name: 'one-row sheet still reads', method: 'POST', path: '/admin/buses/import', as: 'admin', file: { path: '../../../docs/bus-import-template.xlsx' } },
  { name: 'two-tab sheet: check', method: 'POST', path: '/admin/buses/import', as: 'admin', file: sheet },
  { name: 'two-tab sheet as a passenger', method: 'POST', path: '/admin/buses/import', as: 'passenger', file: sheet, mode: 'status' },
  { name: 'two-tab sheet: import', method: 'POST', path: '/admin/buses/import?apply=1', as: 'admin', file: { ...sheet, fields: { publish: 'true' } } },
  { name: 'two-tab sheet again: updates, no copies', method: 'POST', path: '/admin/buses/import', as: 'admin', file: sheet },

  { name: 'search out: first trip', path: '/buses/search?from=Test%20Bazar&to=Test%20Ghat', ignore: NEW_IDS },
  { name: 'search back: second trip', path: '/buses/search?from=Test%20Ghat&to=Test%20Bazar', ignore: NEW_IDS },
  { name: 'search by fare: unknown fare last', path: '/buses/search?from=Howrah%20Station&to=Test%20Ghat&sort=fare', ignore: NEW_IDS },
  { name: 'search by bus name', path: '/buses/search?searchType=BUS_NAME&q=Test%20Out', ignore: NEW_IDS },
  { name: 'stops: a bus out and back counts once', path: '/stops?search=Test', ignore: NEW_IDS },
  { name: 'bus details: first trip', path: (ctx) => `/buses/${ctx.outBackId}`, prepare: outAndBack, ignore: NEW_IDS },
  {
    name: 'alarm on the way back uses the second trip',
    method: 'POST',
    path: '/alarms',
    as: 'passenger',
    prepare: outAndBack,
    body: (ctx) => ({ busId: ctx.outBackId, boardingStopId: ctx.testGhatId, arrivalStopId: ctx.testBazarId, date: ctx.today, remindBeforeMin: 15 }),
    ignore: NEW_IDS,
  },
]

export default cases
