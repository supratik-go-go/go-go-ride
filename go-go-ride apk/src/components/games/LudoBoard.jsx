import './ludo.css'

const SIZE = 15
const BASE = -1
const HOME = 56
// Which of the nine die positions hold a pip.
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
const BASE_SLOTS = [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]]
const SAFE = ['13,6', '8,2', '6,1', '2,6', '1,8', '6,12', '8,13', '12,8']
const START = { '13,6': 0, '1,8': 1 }

const flip = ([row, col]) => [SIZE - 1 - row, SIZE - 1 - col]

function cellClass(row, col) {
  const key = `${row},${col}`
  const classes = ['game-ludo-cell']
  if (col === 7 && row >= 9 && row <= 13) classes.push('p0')
  else if (col === 7 && row >= 1 && row <= 5) classes.push('p1')
  else if (key in START) classes.push(`p${START[key]}`)
  else if (row === 7 && col > 0 && col < SIZE - 1) classes.push('idle')
  if (SAFE.includes(key)) classes.push('safe')
  return classes.join(' ')
}

// The cross of 72 squares; the corners and the middle are drawn as single blocks.
const CELLS = []
for (let row = 0; row < SIZE; row += 1) {
  for (let col = 0; col < SIZE; col += 1) {
    const inRow = row >= 6 && row <= 8
    const inCol = col >= 6 && col <= 8
    if (inRow !== inCol) CELLS.push({ row, col, className: cellClass(row, col) })
  }
}

/** Where a token sits before the viewer's rotation, as [row, col], fractions allowed. */
function spotOf(token) {
  if (token.cell) return token.cell
  const spot = token.pos === BASE ? BASE_SLOTS[token.id] : [8, 6.25 + token.id * 0.5]
  return token.seat === 1 ? flip(spot) : spot
}

/** Tokens sharing a square are spread out a little so each stays visible. */
function layOut(tokens) {
  const groups = {}
  for (const token of tokens) {
    if (token.cell) (groups[token.cell.join()] ??= []).push(token)
  }
  return tokens.map((token) => {
    const group = token.cell ? groups[token.cell.join()] : []
    const shift = group.length > 1 ? (group.indexOf(token) - (group.length - 1) / 2) * 0.3 : 0
    return { token, spot: spotOf(token), shift, small: group.length > 1 || token.pos === HOME }
  })
}

function Die({ value, live, onRoll }) {
  return (
    <button type="button" className={`game-ludo-die ${live ? 'live' : ''}`} disabled={!live} onClick={onRoll} aria-label={live ? 'Roll the die' : `Die shows ${value ?? 'nothing'}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[value]?.includes(i) ? 'pip' : ''} />
      ))}
    </button>
  )
}

/** Each player sees the board turned so their own corner is bottom left. */
export function LudoBoard({ view, seat, myTurn, disabled, players, onMove }) {
  const active = myTurn && !disabled
  const turned = seat === 1
  const shown = (spot) => (turned ? flip(spot) : spot)
  const legal = active && view.phase === 'move' ? view.legal : []
  const homeCount = (s) => view.tokens.filter((t) => t.seat === s && t.pos === HOME).length

  const tap = (token) => {
    if (token.seat !== seat || !legal.includes(token.id)) return
    onMove({ action: 'move', token: token.id })
  }

  const roll = () => {
    if (active && view.phase === 'roll') onMove({ action: 'roll' })
  }

  return (
    <div className="game-ludo">
      <div className="game-ludo-board" role="group" aria-label="Ludo board">
        {[0, 1].map((owner) => (
          <div key={owner} className={`game-ludo-yard p${owner} ${(owner === 1) === turned ? 'near' : 'far'}`} />
        ))}
        {CELLS.map(({ row, col, className }) => {
          const [r, c] = shown([row, col])
          return <div key={`${row},${col}`} className={className} style={{ gridRow: r + 1, gridColumn: c + 1 }} />
        })}
        <div className={`game-ludo-centre ${turned ? 'turned' : ''}`} />
        {layOut(view.tokens).map(({ token, spot, shift, small }) => {
          const [r, c] = shown(spot)
          const canTap = token.seat === seat && legal.includes(token.id)
          const classes = ['game-ludo-token', `p${token.seat}`, small && 'small', canTap && 'legal']
          return (
            <button
              key={`${token.seat}-${token.id}`}
              type="button"
              className={classes.filter(Boolean).join(' ')}
              style={{ top: `${(r / SIZE) * 100}%`, left: `${((c + shift) / SIZE) * 100}%` }}
              disabled={!canTap}
              onClick={() => tap(token)}
              aria-label={`${token.seat === seat ? 'Your' : 'Rival'} token ${token.id + 1}`}
            />
          )
        })}
      </div>

      <div className="game-ludo-bar">
        <Die value={view.die} live={active && view.phase === 'roll'} onRoll={roll} />
        <div className="game-ludo-info">
          <p className="game-ludo-note">{view.note}</p>
          {active && view.phase === 'roll' && <p className="game-ludo-hint">Tap the die to roll</p>}
          <div className="game-ludo-scores">
            {players.map((p) => (
              <span key={p.seat} className={`game-ludo-score p${p.seat}`}>
                {p.name} {homeCount(p.seat)}/4
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
