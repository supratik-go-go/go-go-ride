import { useLayoutEffect, useRef, useState } from 'react'
import { Target } from 'lucide-react'
import './carrom.css'

const QUEEN = 18
const STRIKER = 19
const MS_PER_STEP = 6
const MIN_REPLAY_MS = 500
const MAX_REPLAY_MS = 3000
const DEGREES = 180 / Math.PI

/** Every saved frame as a full list of positions. */
function unpack(last) {
  let pieces = last.start
  const frames = [pieces]
  for (const frame of last.frames) {
    pieces = pieces.slice()
    for (let i = 0; i < frame.length; i += 3) {
      pieces[frame[i]] = frame[i + 1] < 0 ? null : [frame[i + 1], frame[i + 2]]
    }
    frames.push(pieces)
  }
  return frames
}

const blend = (from, to, t) =>
  from.map((p, i) => (p && to[i] ? [p[0] + (to[i][0] - p[0]) * t, p[1] + (to[i][1] - p[1]) * t] : to[i]))

/** Plays the last shot once per shot. Returns the pieces to draw, or null when nothing is playing. */
function useReplay(last) {
  const [pieces, setPieces] = useState(null)
  const shot = last?.shot

  useLayoutEffect(() => {
    if (!last) return undefined
    const frames = unpack(last)
    const total = Math.min(MAX_REPLAY_MS, Math.max(MIN_REPLAY_MS, last.steps * MS_PER_STEP))
    let begun = null
    let raf = 0
    const tick = (now) => {
      begun ??= now
      const done = (now - begun) / total
      if (done >= 1) {
        setPieces(null)
        return
      }
      const spot = done * (frames.length - 1)
      const at = Math.floor(spot)
      setPieces(blend(frames[at], frames[at + 1], spot - at))
      raf = requestAnimationFrame(tick)
    }
    setPieces(frames[0])
    raf = requestAnimationFrame(tick)
    // Animation frames can stall; the board must still reach the real position and let the player shoot.
    const stop = setTimeout(() => {
      cancelAnimationFrame(raf)
      setPieces(null)
    }, total + 1000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(stop)
      setPieces(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot])

  return pieces
}

/** Same search the server runs: the closest spot on the line that does not sit on a coin. */
function strikerX({ coin, striker, base, lineFrom, lineTo }, coins, x) {
  const wanted = Math.round(lineFrom + x * (lineTo - lineFrom))
  const clear = (own) => coins.every((c) => !c || Math.hypot(c[0] - own, c[1] - base) >= coin + striker)
  for (let gap = 0; gap <= lineTo - lineFrom; gap += 4) {
    for (const own of [wanted - gap, wanted + gap]) {
      if (own >= lineFrom && own <= lineTo && clear(own)) return own
    }
  }
  return wanted
}

const coinClass = (i) => (i === QUEEN ? 'queen' : i < 9 ? 'white' : 'black')

function Slider({ label, value, shown, min, max, disabled, onChange }) {
  return (
    <label className="game-carrom-control">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} disabled={disabled} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <b>{shown}</b>
    </label>
  )
}

/** Set the striker, aim by dragging on the board or with the slider, set power, then Shoot. */
export function CarromBoard({ view, seat, myTurn, disabled, players, onMove }) {
  const { size, coin, striker, pocket, base, lineFrom, lineTo } = view
  const [x, setX] = useState(50)
  const [aim, setAim] = useState(0)
  const [power, setPower] = useState(60)
  const board = useRef(null)
  const dragging = useRef(false)
  const replay = useReplay(view.last)

  // Each player sees their own line at the bottom, so everything below is drawn from their side.
  const mine = (p) => (seat === 1 ? [size - p[0], size - p[1]] : p)
  const ready = myTurn && !disabled && !replay
  const pieces = (replay ?? view.coins).map((p) => p && mine(p))
  const sx = strikerX(view, view.coins.map((p) => p && mine(p)), x / 100)
  const shooting = replay?.[STRIKER] ? pieces[STRIKER] : null
  const placed = myTurn && !replay ? [sx, base] : null

  const radians = aim / DEGREES
  const reach = 120 + power * 4
  const corners = [pocket, size - pocket]
  const middle = size / 2

  const aimAt = (event) => {
    // Asked of the svg, as its outer box includes the wooden border and would pull the aim off the finger.
    const spot = new DOMPoint(event.clientX, event.clientY).matrixTransform(board.current.getScreenCTM().inverse())
    setAim(Math.round(Math.atan2(spot.x - sx, base - spot.y) * DEGREES))
  }

  const press = (event) => {
    if (!ready) return
    dragging.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    aimAt(event)
  }

  const drag = (event) => {
    if (ready && dragging.current) aimAt(event)
  }

  const release = () => {
    dragging.current = false
  }

  const shoot = () => {
    if (ready) onMove({ x: x / 100, angle: radians, power: power / 100 })
  }

  const note = !replay && view.last?.note
  const queen = view.covered !== null ? `Queen covered by ${view.covered === seat ? 'you' : 'your rival'}` : view.pending ? 'Queen pocketed, cover her now' : ''

  return (
    <div className="game-carrom">
      <div className="game-carrom-tallies">
        {[0, 1].map((s) => (
          <div className="game-carrom-tally" key={s}>
            <span className={`game-carrom-chip ${s === 0 ? 'white' : 'black'}`} />
            <span className="game-carrom-name">{s === seat ? 'You' : (players.find((p) => p.seat === s)?.name ?? 'Rival')}</span>
            <b>{view.score[s]}</b>
          </div>
        ))}
        <span className="game-carrom-shots">
          Shot {view.shots}/{view.maxShots}
        </span>
      </div>

      <svg
        ref={board}
        className={`game-carrom-board ${ready ? 'aiming' : ''}`}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Carrom board"
        onPointerDown={press}
        onPointerMove={drag}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <rect className="game-carrom-wood" width={size} height={size} />
        {[0, 90, 180, 270].map((turn) => (
          <g key={turn} transform={`rotate(${turn} ${middle} ${middle})`}>
            <rect className="game-carrom-line" x={lineFrom} y={base - 36} width={lineTo - lineFrom} height={72} rx={36} />
          </g>
        ))}
        <circle className="game-carrom-line" cx={middle} cy={middle} r={130} />
        <circle className="game-carrom-line" cx={middle} cy={middle} r={30} />
        {corners.flatMap((cx) => corners.map((cy) => <circle key={`${cx}-${cy}`} className="game-carrom-pocket" cx={cx} cy={cy} r={pocket} />))}

        {pieces.slice(0, STRIKER).map(
          (p, i) =>
            p && (
              <g key={i} transform={`translate(${p[0]} ${p[1]})`}>
                <circle className={`game-carrom-coin ${coinClass(i)}`} r={coin} />
                <circle className="game-carrom-ring" r={coin * 0.55} />
              </g>
            ),
        )}

        {placed && (
          <line className="game-carrom-aim" x1={sx} y1={base} x2={sx + Math.sin(radians) * reach} y2={base - Math.cos(radians) * reach} />
        )}
        {(shooting ?? placed) && (
          <g transform={`translate(${(shooting ?? placed)[0]} ${(shooting ?? placed)[1]})`}>
            <circle className="game-carrom-striker" r={striker} />
            <circle className="game-carrom-ring" r={striker * 0.55} />
          </g>
        )}
      </svg>

      {(note || queen) && <p className="game-carrom-note">{[note, queen].filter(Boolean).join(' · ')}</p>}

      <div className="game-carrom-controls">
        <Slider label="Position" value={x} shown={`${x}%`} min={0} max={100} disabled={!ready} onChange={setX} />
        <Slider label="Aim" value={aim} shown={`${aim}°`} min={-180} max={180} disabled={!ready} onChange={setAim} />
        <Slider label="Power" value={power} shown={`${power}%`} min={0} max={100} disabled={!ready} onChange={setPower} />
        <button type="button" className="game-carrom-shoot" disabled={!ready} onClick={shoot}>
          <Target size={18} aria-hidden="true" />
          Shoot
        </button>
      </div>
    </div>
  )
}
