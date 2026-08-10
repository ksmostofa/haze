CREATE TABLE IF NOT EXISTS leaderboard (
  player_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL CHECK(time_ms > 0),
  score INTEGER NOT NULL CHECK(score >= 0),
  kills INTEGER NOT NULL CHECK(kills >= 0),
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS leaderboard_rank
ON leaderboard (time_ms ASC, score DESC, kills DESC);
