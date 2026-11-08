import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, ArrowRight, CarFront, CirclePlus, Clock, ExternalLink, Gamepad2, MapPin, Navigation, Newspaper, Play, Search, Siren } from 'lucide-react'
import { PageHeader } from '../../components/ui'
import './passenger.css'
import './extras.css'

/** Link to the video guide (YouTube or similar). Leave empty until the video is ready. */
export const VIDEO_URL = ''

const STEPS = [
  {
    icon: Search,
    tone: '',
    title: 'Find a bus',
    text: 'On Home, type where you start in From and where you are going in To. Tap + Via if the bus must pass a place on the way. Tap the orange date badge to travel on another day, then tap Search Buses. You can also search by Bus Number or Bus Name.',
    sketch: true,
    links: [{ to: '/home', label: 'Search buses' }],
  },
  {
    icon: AlarmClock,
    tone: 'accent',
    title: 'Set an arrival alarm',
    text: 'Sign in, open a bus and tap Add Alarm. Pick your boarding stop and when to be reminded: 30, 15 or 5 minutes before, or when the bus is arriving. Your phone reminds you, so you can relax until then.',
    links: [{ to: '/alarms', label: 'My alarms' }],
  },
  {
    icon: Navigation,
    tone: 'success',
    title: 'Track a bus',
    text: 'Open a bus and tap Track Live to see on the map where it should be now and when it reaches each stop. Positions are worked out from the timetable, so allow a few minutes either way.',
  },
  {
    icon: CarFront,
    tone: 'warning',
    title: 'Call a local car',
    text: 'Open Local Cars, choose a verified driver near you and tap Call Driver to talk to them directly.',
    links: [{ to: '/local-cars', label: 'Local cars' }],
  },
  {
    icon: Newspaper,
    tone: '',
    title: 'Read Daily News in English or Bengali',
    text: 'Open Daily News and choose English or বাংলা. Switch between National, International and West Bengal news, then tap a headline to read the full story.',
    links: [{ to: '/news', label: 'Daily News' }],
  },
  {
    icon: Gamepad2,
    tone: 'accent',
    title: 'Play games and climb the leaderboard',
    text: 'Open Game and sign in to play Chess, Ludo, Call Break, 29 or Carrom online with other people, or Ping Ball for a high score. Online games earn points: 10 for a win, 3 for a draw and 1 for a loss. See your rank on the Leaderboard tab.',
    links: [{ to: '/game', label: 'Play now' }],
  },
  {
    icon: CirclePlus,
    tone: 'success',
    title: 'Add Bus or Route Information',
    text: 'Know a bus or route that is missing? On Home, tap + Add Bus Info or + Add Route Info and fill in what you know. Our team checks every entry before it goes live.',
    links: [
      { to: '/owner/buses/new', label: 'Add Bus Info' },
      { to: '/add-route', label: 'Add Route Info' },
    ],
  },
  {
    icon: Siren,
    tone: 'danger',
    title: 'SOS and Emergency numbers',
    text: 'Save up to 5 family members or friends in 1 Click Help. In trouble, tap the red SOS button: your SMS app opens with your location filled in, and you tap Send. The Emergency Call List has 112, police, fire, ambulance and helplines, one tap to call.',
    links: [
      { to: '/sos', label: 'Set up SOS' },
      { to: '/emergency', label: 'Emergency numbers' },
    ],
  },
]

function VideoCard() {
  const body = (
    <>
      <span className="px-x-play" aria-hidden="true">
        <Play size={26} fill="currentColor" />
      </span>
      <span className="px-x-video-text">
        <span className="px-x-video-title">{VIDEO_URL ? 'Watch the video guide' : 'Video guide coming soon'}</span>
        <span className="px-x-video-sub">{VIDEO_URL ? 'See GO-GO Ride in action, step by step.' : 'Until then, the steps below show you everything.'}</span>
      </span>
      {VIDEO_URL ? (
        <ExternalLink size={18} className="text-muted" aria-hidden="true" />
      ) : (
        <span className="badge badge-warning">
          <Clock size={12} /> Soon
        </span>
      )}
    </>
  )
  return VIDEO_URL ? (
    <a href={VIDEO_URL} target="_blank" rel="noopener noreferrer" className="card px-x-video">
      {body}
    </a>
  ) : (
    <div className="card px-x-video is-soon">{body}</div>
  )
}

/** A tiny drawing of the Home search card, so the words above have a picture. */
function SearchSketch() {
  const [today] = useState(() => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }))
  return (
    <div className="px-x-sketch" aria-hidden="true">
      <div className="px-x-sketch-row">
        <MapPin size={18} className="px-pin-from" />
        <span className="px-x-sketch-label">From</span>
        <span className="truncate">Howrah Station</span>
      </div>
      <div className="px-x-sketch-row">
        <MapPin size={18} className="px-pin-via" />
        <span className="px-x-sketch-label">Via</span>
        <span className="truncate">Esplanade</span>
      </div>
      <div className="px-x-sketch-row">
        <MapPin size={18} className="px-pin-to" />
        <span className="px-x-sketch-label">To</span>
        <span className="truncate">Salt Lake Sector V</span>
      </div>
      <div className="px-x-sketch-foot">
        <span className="px-date-badge">{today}</span>
        <span className="btn btn-accent btn-sm">
          <Search size={14} /> Search Buses
        </span>
      </div>
    </div>
  )
}

export default function HowToUse() {
  return (
    <div className="px-page px-narrow">
      <PageHeader title="How to Use GO-GO Ride" subtitle="A quick guide, step by step" />

      <div className="stack" style={{ '--gap': '16px' }}>
        <VideoCard />

        <ol className="px-x-guide">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card px-x-guide-step">
              <span className={`icon-tile ${step.tone}`} aria-hidden="true">
                <step.icon size={22} />
                <span className="px-x-guide-no">{i + 1}</span>
              </span>
              <div className="px-x-guide-body">
                <h2 className="px-x-guide-title">{step.title}</h2>
                <p className="px-x-guide-text">{step.text}</p>
                {step.sketch && <SearchSketch />}
                {step.links && (
                  <div className="px-x-guide-links">
                    {step.links.map((l) => (
                      <Link key={l.to} to={l.to} className="link-btn">
                        {l.label} <ArrowRight size={14} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
