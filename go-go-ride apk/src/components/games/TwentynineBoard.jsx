import './twentynine.css'

// The ending character stops Android from drawing suits as coloured emoji.
const SUITS = {
  S: { glyph: '♠︎', name: 'Spades', red: false },
  H: { glyph: '♥︎', name: 'Hearts', red: true },
  D: { glyph: '♦︎', name: 'Diamonds', red: true },
  C: { glyph: '♣︎', name: 'Clubs', red: false },
}

const rankText = (card) => (card[0] === 'T' ? '10' : card[0])

function Suit({ suit }) {
  return <span className={SUITS[suit].red ? 'game-twentynine-red' : 'game-twentynine-black'}>{SUITS[suit].glyph}</span>
}

function Card({ card, small, faded }) {
  const classes = ['game-twentynine-face', small && 'small', faded && 'faded']
  return (
    <span className={classes.filter(Boolean).join(' ')}>
      <b className={SUITS[card[1]].red ? 'game-twentynine-red' : 'game-twentynine-black'}>{rankText(card)}</b>
      <Suit suit={card[1]} />
    </span>
  )
}

/** Seats sit round the table with this player at the bottom, in playing order. */
function SeatTag({ seat, place, view, finished, players }) {
  const name = players.find((p) => p.seat === seat)?.name ?? `Player ${seat + 1}`
  const said = view.said[seat]
  const note = view.phase === 'bid' ? (said === 'pass' ? 'Pass' : said ? `Bid ${said}` : '') : seat === view.bidder ? `Bid ${view.bid}` : ''
  return (
    <div className={`game-twentynine-seat ${place} ${view.turn === seat && !finished ? 'turn' : ''}`}>
      <span className="game-twentynine-name">{name}</span>
      {note && <small>{note}</small>}
    </div>
  )
}

function roundText(summary, team) {
  const ours = summary.bidder % 2 === team
  const who = ours ? 'Your team' : 'The other team'
  return `${who} bid ${summary.bid} and took ${summary.points}: ${summary.made ? '+1' : '-1'}`
}

/** Bids, trump and tricks for one seat. The room only polls, so the last trick stays on the table. */
export function TwentynineBoard({ view, seat, myTurn, disabled, finished, players, onMove }) {
  const team = seat % 2
  const live = myTurn && !disabled
  const send = (input) => {
    if (live) onMove(input)
  }

  const places = ['bottom', 'left', 'top', 'right']
  const onTable = view.trick.length ? view.trick : view.last?.cards ?? []
  const stale = view.trick.length === 0
  const placeOf = (s) => places[(s - seat + 4) % 4]
  const bids = []
  for (let value = view.minBid; value <= view.maxBid; value += 1) bids.push(value)

  return (
    <div className="game-twentynine">
      <div className="game-twentynine-bar">
        <span>
          Your team <b>{view.scores[team]}</b>
        </span>
        <span>
          Round {view.round} · {view.tricks}/8
        </span>
        <span>
          Others <b>{view.scores[1 - team]}</b>
        </span>
      </div>

      <div className="game-twentynine-bar">
        <span>
          Taken <b>{view.taken[team]}</b> / <b>{view.taken[1 - team]}</b>
        </span>
        <span>
          Trump{' '}
          {view.trump ? (
            <>
              <Suit suit={view.trump} /> {!view.revealed && <small>secret</small>}
            </>
          ) : (
            <b>{view.phase === 'play' ? 'hidden' : '–'}</b>
          )}
        </span>
      </div>

      {view.summary && ((view.tricks === 0 && view.trick.length === 0) || view.phase === 'done') && (
        <p className="game-twentynine-note">
          {roundText(view.summary, team)}. Trump was <Suit suit={view.summary.trump} />
        </p>
      )}

      <div className="game-twentynine-table">
        {[0, 1, 2, 3].map((s) => (
          <SeatTag key={s} seat={s} place={placeOf(s)} view={view} finished={finished} players={players} />
        ))}
        {onTable.map((played) => (
          <div key={played.card} className={`game-twentynine-played ${placeOf(played.seat)}`}>
            <Card card={played.card} small faded={stale} />
          </div>
        ))}
      </div>

      {view.phase === 'bid' && myTurn && (
        <div className="game-twentynine-panel">
          <div className="game-twentynine-bids">
            {bids.map((value) => (
              <button key={value} type="button" className="game-twentynine-choice" disabled={disabled} onClick={() => send({ action: 'bid', value })}>
                {value}
              </button>
            ))}
          </div>
          <button type="button" className="game-twentynine-choice wide" disabled={disabled} onClick={() => send({ action: 'pass' })}>
            Pass
          </button>
        </div>
      )}

      {view.phase === 'trump' && myTurn && (
        <div className="game-twentynine-panel">
          <p className="game-twentynine-note">Choose trump in secret</p>
          <div className="game-twentynine-suits">
            {Object.keys(SUITS).map((suit) => (
              <button
                key={suit}
                type="button"
                className="game-twentynine-choice"
                disabled={disabled}
                aria-label={SUITS[suit].name}
                onClick={() => send({ action: 'trump', suit })}
              >
                <Suit suit={suit} />
              </button>
            ))}
          </div>
        </div>
      )}

      {view.canReveal && myTurn && (
        <button type="button" className="game-twentynine-choice wide" disabled={disabled} onClick={() => send({ action: 'reveal' })}>
          Ask for trump
        </button>
      )}

      <div className="game-twentynine-hand">
        {view.hand.map((card) => {
          const legal = view.legal.includes(card)
          return (
            <button
              key={card}
              type="button"
              className={`game-twentynine-card ${legal ? 'legal' : ''}`}
              disabled={!legal || disabled}
              aria-label={`${rankText(card)} of ${SUITS[card[1]].name}`}
              onClick={() => send({ action: 'play', card })}
            >
              <Card card={card} faded={view.phase === 'play' && myTurn && !legal} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
