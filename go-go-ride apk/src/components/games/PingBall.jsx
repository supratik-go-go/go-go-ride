import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import './pingball.css'

// Everything runs in these units and is scaled to the canvas, so every phone plays the same game.
const W = 360
const H = 520
const PADDLE_W = 76
const PADDLE_H = 12
const BALL_R = 7
const ME_Y = H - 30
const CPU_Y = 30
const START_SPEED = 280
const SPEED_STEP = 9
const MAX_SPEED = 820
const CPU_PACE = 0.7
const MAX_ANGLE = Math.PI / 3
// The server refuses anything higher.
const MAX_SCORE = 500
// Small steps so a fast ball cannot jump a paddle between frames.
const SUBSTEP = 1 / 120
// A long pause, such as the app going to the background, must not teleport the ball.
const MAX_FRAME = 1 / 20

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const paddleAt = (x) => clamp(x, PADDLE_W / 2, W - PADDLE_W / 2)

function launch(ball, speed, angle, down) {
  ball.vx = speed * Math.sin(angle)
  ball.vy = (down ? 1 : -1) * speed * Math.cos(angle)
}

function serve(game) {
  game.serves += 1
  game.ball.x = W / 2
  game.ball.y = H / 2
  launch(game.ball, game.speed, game.serves % 2 ? 0.35 : -0.35, true)
}

function newGame() {
  const game = { me: W / 2, cpu: W / 2, ball: { x: 0, y: 0, vx: 0, vy: 0 }, speed: START_SPEED, score: 0, serves: 0 }
  serve(game)
  return game
}

/** Moves the game on by dt seconds. True once the player has missed. */
function step(game, dt) {
  const { ball } = game
  const fromY = ball.y
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  if (ball.x < BALL_R) {
    ball.x = 2 * BALL_R - ball.x
    ball.vx = Math.abs(ball.vx)
  } else if (ball.x > W - BALL_R) {
    ball.x = 2 * (W - BALL_R) - ball.x
    ball.vx = -Math.abs(ball.vx)
  }

  // Limited pace, so the computer can be beaten by a sharp angle.
  const reach = game.speed * CPU_PACE * dt
  const goal = ball.vy < 0 ? ball.x : W / 2
  game.cpu = paddleAt(game.cpu + clamp(goal - game.cpu, -reach, reach))

  const reachMe = ball.vy > 0 && fromY + BALL_R <= ME_Y && ball.y + BALL_R >= ME_Y
  const reachCpu = ball.vy < 0 && fromY - BALL_R >= CPU_Y && ball.y - BALL_R <= CPU_Y
  const span = PADDLE_W / 2 + BALL_R

  if (reachMe && Math.abs(ball.x - game.me) <= span) {
    game.score = Math.min(MAX_SCORE, game.score + 1)
    game.speed = Math.min(MAX_SPEED, START_SPEED + SPEED_STEP * game.score)
    ball.y = ME_Y - BALL_R
    launch(ball, game.speed, MAX_ANGLE * ((ball.x - game.me) / span), false)
  } else if (reachCpu && Math.abs(ball.x - game.cpu) <= span) {
    ball.y = CPU_Y + BALL_R
    // Varies the return without a dice roll.
    launch(ball, game.speed, MAX_ANGLE * 0.8 * Math.sin(game.score * 2.4), true)
  } else if (ball.y + BALL_R < 0) {
    serve(game)
  }
  return ball.y - BALL_R > H
}

function advance(game, dt) {
  for (let left = Math.min(dt, MAX_FRAME); left > 0; left -= SUBSTEP) {
    if (step(game, Math.min(left, SUBSTEP))) return true
  }
  return false
}

function draw(canvas, colors, game) {
  const ctx = canvas.getContext('2d')
  const scale = canvas.width / W
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, W, H)

  ctx.strokeStyle = colors.line
  ctx.lineWidth = 2
  ctx.setLineDash([8, 10])
  ctx.beginPath()
  ctx.moveTo(0, H / 2)
  ctx.lineTo(W, H / 2)
  ctx.stroke()

  ctx.fillStyle = colors.cpu
  ctx.fillRect(game.cpu - PADDLE_W / 2, CPU_Y - PADDLE_H, PADDLE_W, PADDLE_H)
  ctx.fillStyle = colors.me
  ctx.fillRect(game.me - PADDLE_W / 2, ME_Y, PADDLE_W, PADDLE_H)

  ctx.fillStyle = colors.ball
  ctx.beginPath()
  ctx.arc(game.ball.x, game.ball.y, BALL_R, 0, Math.PI * 2)
  ctx.fill()
}

/** Drag anywhere on the court to move the bottom paddle. Score is rallies returned. */
export function PingBall({ onFinish }) {
  const canvas = useRef(null)
  const colors = useRef(null)
  const game = useRef(null)
  const finish = useRef(onFinish)
  const [phase, setPhase] = useState('ready')
  const [score, setScore] = useState(0)
  if (game.current === null) game.current = newGame()

  useEffect(() => {
    finish.current = onFinish
  }, [onFinish])

  const fit = useCallback(() => {
    const el = canvas.current
    const ratio = window.devicePixelRatio || 1
    el.width = Math.round(el.clientWidth * ratio)
    el.height = Math.round(el.clientHeight * ratio)
    const css = getComputedStyle(el)
    const read = (name) => css.getPropertyValue(name).trim()
    colors.current = { line: read('--border'), cpu: read('--muted'), me: read('--primary'), ball: read('--accent') }
    draw(el, colors.current, game.current)
  }, [])

  useEffect(() => {
    const watcher = new ResizeObserver(fit)
    watcher.observe(canvas.current)
    return () => watcher.disconnect()
  }, [fit])

  useEffect(() => {
    if (phase !== 'playing') return undefined
    let frame = 0
    let last = null
    const tick = (now) => {
      const missed = last !== null && advance(game.current, (now - last) / 1000)
      last = now
      draw(canvas.current, colors.current, game.current)
      setScore(game.current.score)
      if (missed) {
        setPhase('over')
        finish.current?.(game.current.score)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase])

  const start = () => {
    game.current = newGame()
    setScore(0)
    setPhase('playing')
  }

  const aim = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    game.current.me = paddleAt(((event.clientX - box.left) / box.width) * W)
  }

  const press = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    aim(event)
  }

  const drag = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) aim(event)
  }

  return (
    <div className="game-pingball">
      <div className="game-pingball-score">
        <span>Score</span>
        <strong>{score}</strong>
      </div>
      <div className="game-pingball-court">
        <canvas ref={canvas} aria-label="Ping Ball court" onPointerDown={press} onPointerMove={drag} />
        {phase !== 'playing' && (
          <div className="game-pingball-cover">
            {phase === 'over' ? <h2>You missed</h2> : <h2>Ping Ball</h2>}
            <p>{phase === 'over' ? `You returned ${score} ${score === 1 ? 'ball' : 'balls'}` : 'Drag to move your paddle'}</p>
            <button type="button" className="game-pingball-button" onClick={start}>
              {phase === 'over' ? <RotateCcw size={18} /> : <Play size={18} />}
              {phase === 'over' ? 'Play again' : 'Start'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
