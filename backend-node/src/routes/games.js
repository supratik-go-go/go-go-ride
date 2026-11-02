// Online games and the points leaderboard.
import { Router } from 'express'
import { optionalUser, requireUser } from '../auth.js'
import { ok } from '../http.js'
import * as games from '../services/games.js'

const router = Router()

const roomReply = (res, room, userId, status = 200) => ok(res, games.roomOut(room, userId), 'OK', status)

router.get('/games/leaderboard', optionalUser, (req, res) => {
  ok(res, games.leaderboard(req.user?.id ?? null))
})

router.post('/games/rooms/join', requireUser, (req, res) => {
  roomReply(res, games.joinByCode(req.body?.code, req.user), req.user.id)
})

// Phones ask every few seconds, so an unchanged room gets a short answer.
router.get('/games/rooms/:id', requireUser, (req, res) => {
  const room = games.pollRoom(req.params.id, req.user.id)
  if (String(room.version) === req.query.version) return ok(res, { unchanged: true, status: room.status })
  roomReply(res, room, req.user.id)
})

router.post('/games/rooms/:id/move', requireUser, (req, res) => {
  roomReply(res, games.playMove(req.params.id, req.user, req.body), req.user.id)
})

router.post('/games/rooms/:id/leave', requireUser, (req, res) => {
  roomReply(res, games.leaveRoom(req.params.id, req.user), req.user.id)
})

router.post('/games/:game/quick', requireUser, (req, res) => {
  roomReply(res, games.quickMatch(req.params.game, req.user), req.user.id)
})

router.post('/games/:game/private', requireUser, (req, res) => {
  roomReply(res, games.createPrivateRoom(req.params.game, req.user), req.user.id)
})

export default router
