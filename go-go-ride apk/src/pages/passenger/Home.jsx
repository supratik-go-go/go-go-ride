import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpDown,
  Bell,
  BusFront,
  CarFront,
  CaseSensitive,
  ChevronRight,
  FileText,
  Hash,
  MapPin,
  Mic,
  Route,
  Search,
} from 'lucide-react'
import { AddViaButton, StopInput, ViaInput } from '../../components/navigation/SearchBar'
import { Avatar, Badge, Button, Logo, Spinner, useToast } from '../../components/ui'
import { LocalVehicleTypes, RecentSearchStrip, firstName, openPicker } from '../../components/passenger'
import { locationService, stopService } from '../../services'
import { useAuth } from '../../context/AuthContext'
import { useUnreadCount } from '../../hooks/useUnreadCount'
import { formatDate, todayISO } from '../../utils/format'
import { saveLocalSearch } from '../../utils/localSearches'
import { listenOnce } from '../../native/device'
import './passenger.css'

const MODES = [
  { value: 'BUS_NUMBER', label: 'Bus Number', icon: BusFront },
  { value: 'BUS_NAME', label: 'Bus Name', icon: FileText },
  { value: 'ROUTE', label: 'Route', icon: Route },
]

// Voice search languages; the choice is remembered on the phone.
const VOICE_LANGS = {
  'en-IN': { name: 'English', short: 'EN', prompt: 'Say: Howrah to Esplanade' },
  'hi-IN': { name: 'हिन्दी', short: 'हि', prompt: 'बोलिए: हावड़ा से एस्प्लेनेड' },
  'bn-IN': { name: 'বাংলা', short: 'বা', prompt: 'বলুন: হাওড়া থেকে এসপ্ল্যানেড' },
}
const VOICE_KEY = 'gogo.voiceLang'

/** "2026-11-07" -> "7 Nov 26" */
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function Home() {
  const { user, ready, isAuthenticated } = useAuth()
  const unread = useUnreadCount()
  const toast = useToast()
  const navigate = useNavigate()

  const [mode, setMode] = useState('ROUTE')
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [via, setVia] = useState(null)
  const [viaOpen, setViaOpen] = useState(false)
  const [q, setQ] = useState('')
  const [date, setDate] = useState(todayISO())
  const [locating, setLocating] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceLang, setVoiceLang] = useState(() => (VOICE_LANGS[localStorage.getItem(VOICE_KEY)] ? localStorage.getItem(VOICE_KEY) : 'en-IN'))
  const [langOpen, setLangOpen] = useState(false)
  const searchRef = useRef(null)
  const qRef = useRef(null)
  const focusQ = useRef(false)

  useEffect(() => {
    if (mode !== 'ROUTE' && focusQ.current) {
      focusQ.current = false
      qRef.current?.focus()
    }
  }, [mode])

  const pickMode = (value, { focus } = {}) => {
    setMode(value)
    if (value !== 'ROUTE' && focus) {
      focusQ.current = true
      searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (value === mode) qRef.current?.focus()
    }
  }

  const locate = async () => {
    if (locating) return
    setLocating(true)
    try {
      const pos = await locationService.getCurrentPosition()
      const stops = await stopService.nearby(pos.lat, pos.lng, 3, 1)
      const nearest = stops?.[0]
      if (nearest) {
        setFrom({ id: nearest.id, name: nearest.name, area: nearest.area })
        toast.success(`Nearest stop: ${nearest.name}${nearest.distanceKm != null ? ` (${nearest.distanceKm} km away)` : ''}`)
      } else {
        toast.info('No bus stop found within 3 km of you. Type your stop instead.')
      }
    } catch (err) {
      toast.error(err)
    } finally {
      setLocating(false)
    }
  }

  const swap = () => {
    setFrom(to)
    setTo(from)
  }

  // Voice: "Howrah to Esplanade" / "হাওড়া থেকে এসপ্ল্যানেড" / "हावड़ा से एस्प्लेनेड" fills From and To;
  // when both stops are certain the search runs straight away.
  const listen = async () => {
    if (listening) return
    setLangOpen(false)
    setListening(true)
    try {
      const heard = await listenOnce(voiceLang, VOICE_LANGS[voiceLang].prompt)
      if (!heard.length) {
        toast.info('Didn\'t catch that. Tap the microphone and say, for example, "Howrah to Esplanade".')
        return
      }
      const r = await stopService.voiceTrip(heard)
      const pick = (sure, options, text) => sure || options?.[0] || (text ? { name: text } : null)
      const nextFrom = r.fromText ? pick(r.from, r.fromOptions, r.fromText) : from
      const nextTo = pick(r.to, r.toOptions, r.toText)
      if (!nextTo) {
        toast.info(`Heard "${r.heard}", but no stop matched. Try again or type it.`)
        return
      }
      setMode('ROUTE')
      setFrom(nextFrom)
      setTo(nextTo)
      const sure = r.to && (r.from || (!r.fromText && from?.id))
      if (sure && nextFrom?.id !== nextTo.id) {
        if (!isAuthenticated) saveLocalSearch({ searchType: 'ROUTE', fromText: nextFrom.name, toText: nextTo.name })
        navigate(`/search?${new URLSearchParams({ searchType: 'ROUTE', date, from: nextFrom.name, to: nextTo.name, fromId: nextFrom.id, toId: nextTo.id })}`)
      } else if (!nextFrom) toast.info(`Heard "${r.heard}". Now choose where you are starting from.`)
      else toast.warning(`Heard "${r.heard}". Check the stops, then tap Search Buses.`)
    } catch (err) {
      toast.error(err)
    } finally {
      setListening(false)
    }
  }

  const chooseVoiceLang = (code) => {
    setVoiceLang(code)
    setLangOpen(false)
    try {
      localStorage.setItem(VOICE_KEY, code)
    } catch {
      // not remembered; still used this time
    }
  }

  const submit = (e) => {
    e.preventDefault()
    const params = new URLSearchParams({ searchType: mode, date })
    if (mode === 'ROUTE') {
      if (!from?.name?.trim() || !to?.name?.trim()) {
        toast.warning('Enter both a starting point and a destination.')
        return
      }
      if (from.id && from.id === to.id) {
        toast.warning('Starting point and destination must be different.')
        return
      }
      params.set('from', from.name.trim())
      params.set('to', to.name.trim())
      if (from.id) params.set('fromId', from.id)
      if (to.id) params.set('toId', to.id)
      if (viaOpen && via?.name?.trim()) {
        params.set('via', via.name.trim())
        if (via.id) params.set('viaId', via.id)
      }
    } else {
      const text = q.trim()
      if (!text) {
        toast.warning(mode === 'BUS_NUMBER' ? 'Enter a bus number, e.g. WB 01 AB 1234.' : 'Enter a bus name to search.')
        qRef.current?.focus()
        return
      }
      params.set('q', text)
    }
    // Signed-in searches are remembered by the server; a guest's stay on this phone.
    if (!isAuthenticated) {
      saveLocalSearch(mode === 'ROUTE' ? { searchType: mode, fromText: from.name.trim(), toText: to.name.trim() } : { searchType: mode, query: q.trim() })
    }
    navigate(`/search?${params}`)
  }

  const greetingName = ready ? (isAuthenticated ? firstName(user?.name) || 'there' : 'Traveller') : ''

  return (
    <div className="px-page px-home">
      {/* phone header (website navbar takes over from 768px) */}
      <header className="px-home-top">
        {isAuthenticated ? (
          <Link to="/profile" className="px-home-avatar" aria-label="Your profile">
            <Avatar src={user?.avatarUrl} name={user?.name} size={40} />
          </Link>
        ) : (
          <Button to="/login" size="sm" variant="soft">
            Login
          </Button>
        )}
        <Link to="/home" aria-label="GO-GO Ride home" className="px-home-logo">
          <Logo height={46} />
        </Link>
        <Link to="/notifications" className="icon-btn" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}>
          <Bell size={24} />
          {unread > 0 && <span className="icon-btn-badge">{unread > 99 ? '99+' : unread}</span>}
        </Link>
      </header>

      <section className="px-hello">
        <div>
          <h1>
            Hello{greetingName ? `, ${greetingName}` : ''} <span aria-hidden="true">👋</span>
          </h1>
          <p>Where do you want to go today?</p>
        </div>
        <label className="px-date-badge">
          {shortDate(date)}
          <input
            type="date"
            className="px-overlay-input"
            value={date}
            min={todayISO()}
            onChange={(e) => setDate(e.target.value || todayISO())}
            onClick={(e) => openPicker(e.currentTarget)}
            aria-label={`Travel date, ${formatDate(date)}. Tap to change.`}
          />
        </label>
      </section>

      <div className="px-home-grid">
        <div className="px-home-col">
          {/* ---------------- search card ---------------- */}
          <form className="card px-search" onSubmit={submit} ref={searchRef} aria-label="Search buses" style={{ order: 1 }}>
            {mode === 'ROUTE' ? (
              <div className="px-search-stops">
                <StopInput
                  label="From"
                  value={from}
                  onChange={setFrom}
                  placeholder="Enter starting point"
                  icon={<MapPin size={22} className="px-pin-from" fill="currentColor" stroke="#fff" strokeWidth={1.6} />}
                  onLocate={locate}
                />
                {locating && (
                  <span className="px-locating" role="status">
                    <Spinner size={13} /> Finding the nearest stop…
                  </span>
                )}
                <div className="search-bar-sep px-search-sep">
                  {!viaOpen && <AddViaButton onClick={() => setViaOpen(true)} />}
                  <button type="button" className="swap-btn" onClick={swap} aria-label="Swap from and to">
                    <ArrowUpDown size={18} />
                  </button>
                </div>
                {viaOpen && (
                  <ViaInput
                    value={via}
                    onChange={setVia}
                    onRemove={() => {
                      setVia(null)
                      setViaOpen(false)
                    }}
                  />
                )}
                <StopInput
                  label="To"
                  value={to}
                  onChange={setTo}
                  placeholder="Enter destination"
                  icon={<MapPin size={22} className="px-pin-to" fill="currentColor" stroke="#fff" strokeWidth={1.6} />}
                />
              </div>
            ) : (
              <div className="field">
                <label className="field-label" htmlFor="px-home-q">
                  {mode === 'BUS_NUMBER' ? 'Bus number' : 'Bus name'}
                </label>
                <div className="input-wrap has-icon">
                  <span className="input-icon">{mode === 'BUS_NUMBER' ? <Hash size={18} /> : <CaseSensitive size={18} />}</span>
                  <input
                    id="px-home-q"
                    ref={qRef}
                    className="input"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={mode === 'BUS_NUMBER' ? 'e.g. WB 01 AB 1234' : 'e.g. Howrah Express'}
                    autoCapitalize={mode === 'BUS_NUMBER' ? 'characters' : 'words'}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                </div>
              </div>
            )}

            <div className="px-search-by">
              <span className="px-label" id="px-search-by">
                Search By
              </span>
              <div className="px-mode-grid" role="radiogroup" aria-labelledby="px-search-by">
                {MODES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    className={`px-mode ${mode === value ? 'active' : ''}`}
                    onClick={() => pickMode(value, { focus: true })}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* microphone inside the orange button (owner's design): voice on the left, search on the right */}
            <div className={`px-search-go ${listening ? 'is-listening' : ''}`}>
              <span className="px-voice-waves" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <button
                type="button"
                className="px-voice-btn"
                onClick={listen}
                aria-label={listening ? 'Listening' : `Search by voice in ${VOICE_LANGS[voiceLang].name}`}
              >
                {listening ? <Spinner size={22} /> : <Mic size={24} />}
              </button>
              <button
                type="button"
                className="px-voice-lang"
                onClick={() => setLangOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={langOpen}
                aria-label={`Voice language: ${VOICE_LANGS[voiceLang].name}. Tap to change.`}
              >
                {VOICE_LANGS[voiceLang].short}
              </button>
              <span className="px-search-go-sep" aria-hidden="true" />
              <button type="submit" className="px-search-go-main">
                <Search size={22} /> Search Buses
              </button>
              {langOpen && (
                <div className="px-voice-menu" role="menu" aria-label="Voice language">
                  {Object.entries(VOICE_LANGS).map(([code, l]) => (
                    <button key={code} type="button" role="menuitemradio" aria-checked={code === voiceLang} onClick={() => chooseVoiceLang(code)}>
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </form>

          {/* ---------------- quick actions ---------------- */}
          <nav className="px-quick" aria-label="Quick actions" style={{ order: 2 }}>
            <Link to="/emergency" className="px-quick-tile">
              <span className="px-quick-emoji" aria-hidden="true">☎️</span>
              <span>Emergency Call List</span>
            </Link>
            <Link to="/sos" className="px-quick-tile" aria-label="SOS, one click help">
              <span className="px-quick-emoji" aria-hidden="true">🆘</span>
              <span>1 Click Help</span>
            </Link>
            <Link to="/my-location" className="px-quick-tile">
              <span className="px-quick-live" aria-hidden="true">
                <Badge tone="success" square>
                  <span className="dot dot-pulse" /> Live
                </Badge>
              </span>
              <span>Live Location Track</span>
            </Link>
            <Link to="/my-bus" className="px-quick-tile">
              <span className="px-quick-emoji" aria-hidden="true">🚍</span>
              <span>My Bus</span>
            </Link>
            <Link to="/how-to-use" className="px-quick-tile">
              <span className="px-quick-emoji" aria-hidden="true">🎬</span>
              <span>Watch How to Use GO-GO Ride</span>
            </Link>
          </nav>
        </div>

        <div className="px-home-col">
          {/* ---------------- running car ---------------- */}
          <nav className="px-contrib-links" aria-label="Add information" style={{ order: 3 }}>
            <Link to="/add-bus" className="card px-contrib-link">
              <span className="icon-tile sm">
                <BusFront size={20} />
              </span>
              <span className="grow px-contrib-text">
                <span className="px-contrib-tag">+ Add Bus Info...</span>
                <span className="px-contrib-sub" lang="bn">
                  আপনিও পারবেন বাসের নাম নথিভুক্ত করতে
                </span>
              </span>
              <ArrowRight size={18} />
            </Link>
            <Link to="/add-route" className="card px-contrib-link">
              <span className="icon-tile sm">
                <Route size={20} />
              </span>
              <span className="grow px-contrib-text">
                <span className="px-contrib-tag">+ Add Route Info...</span>
                <span className="px-contrib-sub" lang="bn">
                  আপনিও পারবেন রুটের তথ্য যোগ করতে
                </span>
              </span>
              <ArrowRight size={18} />
            </Link>
          </nav>

          {/* ---------------- recent search ---------------- */}
          {ready && <RecentSearchStrip signedIn={isAuthenticated} style={{ order: 5 }} />}
        </div>

        {/* ---------------- local vehicle ---------------- */}
        <section className="card px-cars-panel" aria-labelledby="px-cars-title" style={{ order: 4 }}>
          <div className="px-section-head">
            <div className="row" style={{ '--gap': '12px', minWidth: 0 }}>
              <span className="icon-tile">
                <CarFront size={24} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h2 id="px-cars-title" className="px-section-title">
                  Local Vehicle
                </h2>
                <p className="text-sm text-muted">Pick a type and call local drivers directly.</p>
              </div>
            </div>
            <Link to="/local-cars" className="link-btn nowrap">
              View All <ChevronRight size={16} />
            </Link>
          </div>
          <LocalVehicleTypes />
        </section>
      </div>

    </div>
  )
}
