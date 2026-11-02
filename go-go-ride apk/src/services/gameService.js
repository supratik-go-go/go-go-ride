import { http } from '../api/client'

export const gameService = {
  leaderboard: () => http.get('/games/leaderboard'),
  quickMatch: (game) => http.post(`/games/${game}/quick`),
  privateRoom: (game) => http.post(`/games/${game}/private`),
  join: (code) => http.post('/games/rooms/join', { code }),
  /** Pass the last seen version; an unchanged room answers { unchanged: true }. */
  room: (id, version) => http.get(`/games/rooms/${id}`, version ? { version } : undefined),
  move: (id, input) => http.post(`/games/rooms/${id}/move`, input),
  leave: (id) => http.post(`/games/rooms/${id}/leave`),
  pingballBest: () => http.get('/games/pingball/best'),
  pingballScore: (score) => http.post('/games/pingball/score', { score }),
}
