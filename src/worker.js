import { DurableObject } from "cloudflare:workers";

const BUILD_ID = "haze-20260811-global-v1";
const EXPECTED_KILLS = 69;
const MIN_RUN_MS = 60_000;
const MAX_RUN_MS = 7_200_000;
const COMPLETION_TTL_MS = 86_400_000;
const TOP_N = 10;
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function validPlayerId(v) {
  return typeof v === "string" && v.length >= 16 && v.length <= 80 && /^[A-Za-z0-9_-]+$/.test(v);
}
function cleanName(v) {
  if (typeof v !== "string") return null;
  v = v.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (v.length < 1 || v.length > 16 || /[\u0000-\u001F\u007F]/.test(v)) return null;
  return v;
}
function validScore(v) {
  return Number.isInteger(v) && v >= 5_000 && v <= 20_000;
}
function first(cursor) {
  const rows = cursor.toArray();
  return rows.length ? rows[0] : null;
}
function better(a, b) {
  if (!b) return true;
  return a.time_ms < b.time_ms ||
    (a.time_ms === b.time_ms && a.score > b.score) ||
    (a.time_ms === b.time_ms && a.score === b.score && a.kills > b.kills);
}
async function ipKey(request) {
  const raw = request.headers.get("CF-Connecting-IP") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`haze:${day}:${raw}`));
  return Array.from(new Uint8Array(digest).slice(0, 12), b => b.toString(16).padStart(2, "0")).join("");
}

export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        player_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        time_ms INTEGER NOT NULL,
        score INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS leaderboard_rank
        ON leaderboard(time_ms ASC, score DESC, kills DESC);
      CREATE TABLE IF NOT EXISTS runs (
        run_token TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        build TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        time_ms INTEGER,
        score INTEGER,
        kills INTEGER,
        completion_token TEXT UNIQUE,
        submitted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS runs_player ON runs(player_id, started_at DESC);
      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
    `);
  }

  cleanup() {
    const now = Date.now();
    const last = first(this.sql.exec("SELECT value FROM meta WHERE key='last_cleanup'"));
    if (last && now - Number(last.value) < 21_600_000) return;
    this.sql.exec("DELETE FROM runs WHERE started_at < ?", now - 86_400_000);
    this.sql.exec("DELETE FROM rate_limits WHERE window_start < ?", now - 7_200_000);
    this.sql.exec(
      "INSERT INTO meta(key,value) VALUES('last_cleanup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      now,
    );
  }

  rate(bucket, limit, windowMs) {
    const now = Date.now();
    const row = first(this.sql.exec("SELECT window_start,count FROM rate_limits WHERE bucket=?", bucket));
    if (!row || now - Number(row.window_start) >= windowMs) {
      this.sql.exec(
        "INSERT INTO rate_limits(bucket,window_start,count) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET window_start=excluded.window_start,count=1",
        bucket, now,
      );
      return true;
    }
    if (Number(row.count) >= limit) return false;
    this.sql.exec("UPDATE rate_limits SET count=count+1 WHERE bucket=?", bucket);
    return true;
  }

  rankFor(row) {
    const r = first(this.sql.exec(
      `SELECT COUNT(*) AS n FROM leaderboard
       WHERE time_ms < ? OR (time_ms = ? AND score > ?) OR (time_ms = ? AND score = ? AND kills > ?)`,
      row.time_ms, row.time_ms, row.score, row.time_ms, row.score, row.kills,
    ));
    return Number(r?.n || 0) + 1;
  }

  currentPlayer(playerId) {
    const row = first(this.sql.exec(
      "SELECT player_id,name,time_ms,score,kills,updated_at FROM leaderboard WHERE player_id=?",
      playerId,
    ));
    if (!row) return null;
    return {
      rank: this.rankFor(row),
      name: row.name,
      timeMs: Number(row.time_ms),
      score: Number(row.score),
      kills: Number(row.kills),
    };
  }

  leaderboard(playerId) {
    const rows = this.sql.exec(
      `SELECT player_id,name,time_ms,score,kills FROM leaderboard
       ORDER BY time_ms ASC, score DESC, kills DESC LIMIT ?`,
      TOP_N,
    ).toArray();
    const leaders = rows.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      timeMs: Number(r.time_ms),
      score: Number(r.score),
      kills: Number(r.kills),
      isYou: r.player_id === playerId,
    }));
    return { leaders, player: validPlayerId(playerId) ? this.currentPlayer(playerId) : null };
  }

  async start(body, request) {
    this.cleanup();
    if (!validPlayerId(body.playerId)) return json({ error: "Invalid player ID" }, 400);
    if (body.build !== BUILD_ID) return json({ error: "Game build is not eligible for ranked play" }, 409);
    const ip = await ipKey(request);
    if (!this.rate(`start:p:${body.playerId}`, 24, 3_600_000) || !this.rate(`start:i:${ip}`, 80, 3_600_000)) {
      return json({ error: "Too many ranked runs. Try again later." }, 429);
    }
    const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
    const now = Date.now();
    this.sql.exec(
      "INSERT INTO runs(run_token,player_id,build,started_at) VALUES(?,?,?,?)",
      token, body.playerId, BUILD_ID, now,
    );
    return json({ runToken: token, startedAt: now });
  }

  complete(body) {
    if (!validPlayerId(body.playerId)) return json({ error: "Invalid player ID" }, 400);
    if (body.build !== BUILD_ID) return json({ error: "Game build is not eligible for ranked play" }, 409);
    const score = Number(body.score), kills = Number(body.kills);
    if (!validScore(score)) return json({ error: "Score failed validation" }, 400);
    if (kills !== EXPECTED_KILLS) return json({ error: "Run did not contain the expected number of kills" }, 400);
    if (typeof body.runToken !== "string" || body.runToken.length < 50 || body.runToken.length > 100) return json({ error: "Run token is invalid" }, 403);
    const run = first(this.sql.exec("SELECT * FROM runs WHERE run_token=?", body.runToken));
    if (!run || run.player_id !== body.playerId || run.build !== BUILD_ID) return json({ error: "Run token is invalid" }, 403);
    if (run.completion_token) return json({ completionToken: run.completion_token, officialTimeMs: Number(run.time_ms) });
    const now = Date.now(), elapsed = now - Number(run.started_at);
    if (!Number.isFinite(elapsed) || elapsed < MIN_RUN_MS || elapsed > MAX_RUN_MS) return json({ error: "Run time failed validation" }, 400);
    const completion = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
    this.sql.exec(
      "UPDATE runs SET completed_at=?,time_ms=?,score=?,kills=?,completion_token=? WHERE run_token=?",
      now, Math.round(elapsed), score, kills, completion, body.runToken,
    );
    return json({ completionToken: completion, officialTimeMs: Math.round(elapsed) });
  }

  async finish(body, request) {
    if (!validPlayerId(body.playerId)) return json({ error: "Invalid player ID" }, 400);
    if (body.build !== BUILD_ID) return json({ error: "Game build is not eligible for ranked play" }, 409);
    const name = cleanName(body.name);
    if (!name) return json({ error: "Name must be 1–16 visible characters" }, 400);
    if (typeof body.completionToken !== "string" || body.completionToken.length < 50 || body.completionToken.length > 100) return json({ error: "Completion proof is invalid" }, 403);
    const ip = await ipKey(request);
    if (!this.rate(`finish:p:${body.playerId}`, 20, 3_600_000) || !this.rate(`finish:i:${ip}`, 60, 3_600_000)) {
      return json({ error: "Too many submissions. Try again later." }, 429);
    }
    const run = first(this.sql.exec("SELECT * FROM runs WHERE completion_token=?", body.completionToken));
    if (!run || run.player_id !== body.playerId || run.build !== BUILD_ID || !run.completed_at) return json({ error: "Completion proof is invalid" }, 403);
    const age = Date.now() - Number(run.completed_at);
    if (!Number.isFinite(age) || age < 0 || age > COMPLETION_TTL_MS) return json({ error: "Completion proof expired" }, 403);
    const candidate = { time_ms: Number(run.time_ms), score: Number(run.score), kills: Number(run.kills) };
    if (!validScore(candidate.score) || candidate.kills !== EXPECTED_KILLS || candidate.time_ms < MIN_RUN_MS || candidate.time_ms > MAX_RUN_MS) return json({ error: "Completion proof failed validation" }, 400);
    const before = first(this.sql.exec("SELECT time_ms,score,kills FROM leaderboard WHERE player_id=?", body.playerId));
    const isBetter = better(candidate, before);
    const now = Date.now();
    if (!before) {
      this.sql.exec("INSERT INTO leaderboard(player_id,name,time_ms,score,kills,updated_at) VALUES(?,?,?,?,?,?)", body.playerId, name, candidate.time_ms, candidate.score, candidate.kills, now);
    } else if (isBetter) {
      this.sql.exec("UPDATE leaderboard SET name=?,time_ms=?,score=?,kills=?,updated_at=? WHERE player_id=?", name, candidate.time_ms, candidate.score, candidate.kills, now, body.playerId);
    } else {
      this.sql.exec("UPDATE leaderboard SET name=?,updated_at=? WHERE player_id=?", name, now, body.playerId);
    }
    this.sql.exec("UPDATE runs SET submitted_at=? WHERE completion_token=?", now, body.completionToken);
    const best = first(this.sql.exec("SELECT name,time_ms,score,kills FROM leaderboard WHERE player_id=?", body.playerId));
    const rank = this.rankFor(best);
    return json({
      accepted: true,
      personalBest: !before || isBetter,
      rank,
      officialTimeMs: candidate.time_ms,
      best: { name: best.name, timeMs: Number(best.time_ms), score: Number(best.score), kills: Number(best.kills) },
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/api/config") {
        return json({ turnstileSiteKey: null, protection: "server-validation+rate-limit" });
      }
      if (request.method === "GET" && url.pathname === "/api/leaderboard") {
        return json(this.leaderboard(url.searchParams.get("playerId") || ""));
      }
      if (request.method === "POST") {
        let body;
        try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
        if (url.pathname === "/api/run/start") return this.start(body, request);
        if (url.pathname === "/api/run/complete") return this.complete(body);
        if (url.pathname === "/api/run/finish") return this.finish(body, request);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("HAZE API error", error);
      return json({ error: "Leaderboard temporarily unavailable" }, 503);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.LEADERBOARD.idFromName("global-v1");
      const stub = env.LEADERBOARD.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
