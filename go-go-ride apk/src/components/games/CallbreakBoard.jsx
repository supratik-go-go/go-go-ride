import './callbreak.css'

// The ending character stops Android from drawing the suits as coloured emoji.
const SUITS = { S: '♠︎', H: '♥︎', C: '♣︎', D: '♦︎' }
const SUIT_NAMES = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' }
const RANK_NAMES = { T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' }
const BIDS = [1, 2, 3, 4, 5, 6, 7, 8]
const SPOTS = ['bottom', 'left', 'top', 'right']

const rankText = (card) => (card[0] === 'T' ? '10' : card[0])
const cardName = (card) => `${RANK_NAMES[card[0]] ?? card[0]} of ${SUIT_NAMES[card[1]]}`
const red = (card) => card[1] === 'H' || card[1] === 'D'
const score = (n) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1))

function Face({ card }) {
  return (
    <>
      <b>{rankText(card)}</b>
      <i>{SUITS[card[1]]}</i>
    </>
  )
}

function TableCard({ card }) {
  if (!card) return <span className="game-callbreak-slot" />
  return (
    <span className={`game-callbreak-card ${red(card) ? 'red' : ''}`} aria-label={cardName(card)}>
      <Face card={card} />
    </span>
  )
}

/** Bid from your hand, then tap a card to play it. You always sit at the bottom of the table. */
export function CallbreakBoard({ view, seat, myTurn, disabled, finished, players, onMove }) {
  const name = (s) => (s === seat ? 'You' : players.find((p) => p.seat === s)?.name ?? 'Player')
  const blocked = disabled || !myTurn
  const inTrick = (s) => view.trick.find((p) => p.seat === s)?.card
  const trickNo = Math.min(view.won.reduce((sum, w) => sum + w, 0) + 1, 13)

  const status = () => {
    if (view.phase === 'over') return 'Final scores'
    // Someone left or timed out, so the view still shows a turn nobody will take.
    if (finished) return 'Game over'
    if (view.phase === 'bid') return myTurn ? 'Your bid: how many tricks will you win?' : `${name(view.turn)} is bidding…`
    return myTurn ? 'Your turn: tap a card' : `${name(view.turn)} is playing…`
  }

  const bid = (value) => {
    if (!blocked) onMove({ action: 'bid', value })
  }

  const play = (card) => {
    if (!blocked && view.legal.includes(card)) onMove({ action: 'play', card })
  }

  return (
    <div className="game-callbreak">
      <p className="game-callbreak-round">
        Round {view.round} of {view.rounds}
        {view.phase === 'play' && ` · Trick ${trickNo} of 13`}
      </p>

      <div className="game-callbreak-table">
        {SPOTS.map((spot, i) => {
          const s = (seat + i) % 4
          return (
            <div key={spot} className={`game-callbreak-seat ${spot}`}>
              <div className={`game-callbreak-tag ${view.turn === s && !finished ? 'turn' : ''}`}>
                <span className="game-callbreak-name">
                  <b>{name(s)}</b>
                  <em>{view.totals[s].toFixed(1)}</em>
                </span>
                <small>
                  Bid {view.bids[s] ?? '–'} · Won {view.won[s]}
                </small>
              </div>
              <TableCard card={inTrick(s)} />
            </div>
          )
        })}
      </div>

      {view.last && (
        <div className="game-callbreak-note">
          <span>Last trick</span>
          {view.last.plays.map((p) => (
            <span key={p.seat} className={`game-callbreak-mini ${red(p.card) ? 'red' : ''}`} aria-label={`${name(p.seat)}: ${cardName(p.card)}`}>
              <Face card={p.card} />
            </span>
          ))}
          <strong>{name(view.last.winner)}</strong>
        </div>
      )}

      {view.lastRound && view.phase !== 'play' && (
        <div className="game-callbreak-note">
          <span>Round {view.lastRound.round}</span>
          {view.lastRound.points.map((p, s) => (
            <span key={s}>
              {name(s)} {score(p)}
            </span>
          ))}
        </div>
      )}

      <p className="game-callbreak-status">{status()}</p>

      {view.phase === 'bid' && myTurn && (
        <div className="game-callbreak-bids">
          {BIDS.map((value) => (
            <button key={value} type="button" disabled={disabled} onClick={() => bid(value)}>
              {value}
            </button>
          ))}
        </div>
      )}

      <div className="game-callbreak-hand" aria-label="Your cards">
        {view.hand.map((card) => {
          const live = !blocked && view.legal.includes(card)
          const dim = view.phase === 'play' && myTurn && !view.legal.includes(card)
          return (
            <button
              key={card}
              type="button"
              className={`game-callbreak-card ${red(card) ? 'red' : ''} ${live ? 'live' : ''} ${dim ? 'dim' : ''}`}
              disabled={!live}
              onClick={() => play(card)}
              aria-label={cardName(card)}
            >
              <Face card={card} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
