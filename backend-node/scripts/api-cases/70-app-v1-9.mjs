// App v1.9: a bus may be sent without its registration number (many are known only by name), but
// then it needs a name; a fare left out is "not known" (null), not 0.
const bus = {
  type: 'NON_AC',
  category: 'NORMAL',
  contactNumber: '9830012345',
  serviceDays: ['MON', 'TUE', 'WED'],
  stopages: [
    { stopName: 'Howrah Station', arrivalTime: '08:00', departureTime: '08:02' },
    { stopName: 'Esplanade', arrivalTime: '08:30', departureTime: '08:32' },
  ],
}

const cases = [
  { name: 'bus with a name and no number', method: 'POST', path: '/buses', as: 'owner', body: { ...bus, busName: 'Test Name Only' }, ignore: ['id', 'stopId', 'busId'] },
  { name: 'bus with neither name nor number', method: 'POST', path: '/buses', as: 'owner', body: bus },
  { name: 'bus with a number and no fare', method: 'POST', path: '/buses', as: 'owner', body: { ...bus, busNumber: 'wb 70 t 1909' }, ignore: ['id', 'stopId', 'busId'] },
  { name: 'bus number too short', method: 'POST', path: '/buses', as: 'owner', body: { ...bus, busNumber: 'WB1', busName: 'Short Number' } },
]

export default cases
