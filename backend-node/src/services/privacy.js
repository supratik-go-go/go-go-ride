// Strip personal contact details from data shown to people who should not see it
// (port of app/services/privacy.py).
//
// Public screens (bus search/details, reviews, shared rides) and a passenger's own
// alarms and bookings embed other people's accounts: the bus owner, reviewers,
// drivers. Their name is fine to show; their personal phone, email and uploaded
// ownership documents are not. The bus's own contactNumber (the booking line the
// owner chose to publish) is unaffected. Admins, and owners looking at their own
// bus, keep the full data.

export function publicPerson(person, { keepPhone = false } = {}) {
  if (!person) return person
  return { ...person, email: null, phone: keepPhone ? person.phone : null }
}

export const publicReview = (review) => ({ ...review, user: publicPerson(review.user) })

export function publicBus(bus) {
  if (!bus) return bus
  const out = { ...bus, owner: publicPerson(bus.owner), documents: [], rejectionReason: null }
  if ('reviews' in out) out.reviews = (out.reviews || []).map(publicReview)
  return out
}

// The driver's phone stays: riders call the driver, as with local cars.
export const publicRide = (ride) => (ride ? { ...ride, driver: publicPerson(ride.driver, { keepPhone: true }) } : ride)
