import { DurableObject } from "cloudflare:workers";
import { ACTIVE_SEASON, BUILD_ID, EXPECTED_KILLS, MAX_RUN_MS, MIN_RUN_MS, cleanName, validateProof } from "./protocol.js";

const COMPLETION_TTL_MS = 86_400_000;
const TOP_N = 10;
const RANK_WINDOW = 100;
const MAX_BODY_BYTES = 24 * 1024;
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function first(cursor) {
  const rows = cursor.toArray();
  return rows.length ? rows[0] : null;
}

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validOpaqueId(value, min = 16, max = 80) {
  return typeof value === "string" && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

function better(candidate, current) {
  if (!current) return true;
  return candidate.time_ms < Number(current.time_ms) ||
    (candidate.time_ms === Number(current.time_ms) && candidate.score > Number(current.score));
}

function publicEntry(row, rank, playerId) {
  return {
    rank,
    name: String(row.name),
    timeMs: Number(row.time_ms),
    score: Number(row.score),
    kills: Number(row.kills),
    isYou: row.player_id === playerId,
  };
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function ipKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return (await sha256Hex(`haze:${day}:${ip}`)).slice(0, 24);
}

async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw Object.assign(new Error("Content-Type must be application/json"), { status: 415 });
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large"), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large"), { status: 413 });
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Request body is not valid JSON"), { status: 400 });
  }
}

function validOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function verifyTurnstile(secret, token, request, expectedCdata) {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  form.append("idempotency_key", crypto.randomUUID());
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true &&
      result.action === "haze_score" &&
      result.hostname === new URL(request.url).hostname &&
      result.cdata === expectedCdata;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.rateBuckets = new Map();
    this.topCache = null;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS runs_v2 (
          run_id TEXT PRIMARY KEY,
          season_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          build TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          time_ms INTEGER,
          score INTEGER,
          proof_hash TEXT,
          submitted_at INTEGER
        ) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS leaderboard_v2 (
          season_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          name TEXT NOT NULL,
          time_ms INTEGER NOT NULL,
          score INTEGER NOT NULL,
          kills INTEGER NOT NULL,
          achieved_at INTEGER NOT NULL,
          PRIMARY KEY (season_id, player_id)
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS leaderboard_v2_rank
          ON leaderboard_v2(season_id, time_ms ASC, score DESC, achieved_at ASC, player_id ASC);
        CREATE TABLE IF NOT EXISTS meta_v2 (
          key TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        ) WITHOUT ROWID;
      `);
    });
  }

  turnstileEnabled() {
    return Boolean(this.env.TURNSTILE_SITE_KEY && this.env.TURNSTILE_SECRET);
  }

  cleanup() {
    const now = Date.now();
    const last = first(this.sql.exec("SELECT value FROM meta_v2 WHERE key='last_cleanup'"));
    if (last && now - Number(last.value) < 21_600_000) return;
    this.sql.exec("DELETE FROM runs_v2 WHERE started_at < ?", now - COMPLETION_TTL_MS);
    this.sql.exec(
      "INSERT INTO meta_v2(key,value) VALUES('last_cleanup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      now,
    );
  }

  rate(bucket, limit, windowMs) {
    const now = Date.now();
    const current = this.rateBuckets.get(bucket);
    if (!current || now - current.startedAt >= windowMs) {
      this.rateBuckets.set(bucket, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= limit) return false;
    current.count++;
    if (this.rateBuckets.size > 10_000) {
      for (const [key, value] of this.rateBuckets) if (now - value.startedAt >= windowMs) this.rateBuckets.delete(key);
    }
    return true;
  }

  rankedRows() {
    if (!this.topCache) {
      this.topCache = this.sql.exec(
        `SELECT player_id,name,time_ms,score,kills,achieved_at FROM leaderboard_v2
         WHERE season_id=? ORDER BY time_ms ASC,score DESC,achieved_at ASC,player_id ASC LIMIT ?`,
        ACTIVE_SEASON, RANK_WINDOW,
      ).toArray();
    }
    return this.topCache;
  }

  currentPlayer(playerId) {
    if (!validOpaqueId(playerId)) return null;
    const row = first(this.sql.exec(
      "SELECT player_id,name,time_ms,score,kills FROM leaderboard_v2 WHERE season_id=? AND player_id=?",
      ACTIVE_SEASON, playerId,
    ));
    if (!row) return null;
    const rankIndex = this.rankedRows().findIndex(item => item.player_id === playerId);
    return {
      ...(rankIndex >= 0 ? { rank: rankIndex + 1, rankLabel: `#${rankIndex + 1}` } : { rank: null, rankLabel: "100+" }),
      name: String(row.name),
      timeMs: Number(row.time_ms),
      score: Number(row.score),
      kills: Number(row.kills),
    };
  }

  leaderboard(playerId) {
    return {
      season: ACTIVE_SEASON,
      leaders: this.rankedRows().slice(0, TOP_N).map((row, index) => publicEntry(row, index + 1, playerId)),
      player: this.currentPlayer(playerId),
    };
  }

  async start(body, request) {
    this.cleanup();
    if (!validOpaqueId(body?.playerId)) return json({ error: "Invalid player ID" }, 400);
    if (body.build !== BUILD_ID) return json({ error: "Game build is not eligible for ranked play" }, 409);
    const ip = await ipKey(request);
    if (!this.rate(`start:p:${body.playerId}`, 24, 3_600_000) || !this.rate(`start:i:${ip}`, 80, 3_600_000)) {
      return json({ error: "Too many ranked runs. Try again later." }, 429);
    }
    const runId = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
    const startedAt = Date.now();
    this.sql.exec(
      "INSERT INTO runs_v2(run_id,season_id,player_id,build,started_at) VALUES(?,?,?,?,?)",
      runId, ACTIVE_SEASON, body.playerId, BUILD_ID, startedAt,
    );
    return json({ runToken: runId, startedAt, season: ACTIVE_SEASON });
  }

  async complete(body) {
    if (!validOpaqueId(body?.playerId) || !validOpaqueId(body?.runToken, 64, 64)) return json({ error: "Run token is invalid" }, 403);
    if (body.build !== BUILD_ID) return json({ error: "Game build is not eligible for ranked play" }, 409);
    const run = first(this.sql.exec("SELECT * FROM runs_v2 WHERE run_id=?", body.runToken));
    if (!run || run.season_id !== ACTIVE_SEASON || run.player_id !== body.playerId || run.build !== BUILD_ID) return json({ error: "Run token is invalid" }, 403);
    if (run.completed_at) {
      return json({ completionToken: run.run_id, officialTimeMs: Number(run.time_ms), score: Number(run.score), kills: EXPECTED_KILLS });
    }
    const completedAt = Date.now();
    const elapsed = completedAt - Number(run.started_at);
    const result = validateProof(body.proof, elapsed);
    if (!result.ok) return json({ error: result.error }, 400);
    const proofHash = await sha256Hex(JSON.stringify(body.proof));
    this.sql.exec(
      "UPDATE runs_v2 SET completed_at=?,time_ms=?,score=?,proof_hash=? WHERE run_id=? AND completed_at IS NULL",
      completedAt, Math.round(elapsed), result.score, proofHash, body.runToken,
    );
    return json({ completionToken: body.runToken, officialTimeMs: Math.round(elapsed), score: result.score, kills: result.kills });
  }

  async finish(body, request) {
    if (!validOpaqueId(body?.playerId) || !validOpaqueId(body?.completionToken, 64, 64)) return json({ error: "Completion proof is invalid" }, 403);
    if (body.build !== BUILD_ID) return json({ error: "Game build is not eligible for ranked play" }, 409);
    const name = cleanName(body.name);
    if (!name) return json({ error: "Name must be 1–16 visible characters" }, 400);
    const ip = await ipKey(request);
    if (!this.rate(`finish:p:${body.playerId}`, 20, 3_600_000) || !this.rate(`finish:i:${ip}`, 60, 3_600_000)) {
      return json({ error: "Too many submissions. Try again later." }, 429);
    }
    let run = first(this.sql.exec("SELECT * FROM runs_v2 WHERE run_id=?", body.completionToken));
    if (!run || run.season_id !== ACTIVE_SEASON || run.player_id !== body.playerId || run.build !== BUILD_ID || !run.completed_at || run.submitted_at) {
      return json({ error: "Completion proof is invalid or already used" }, 403);
    }
    const age = Date.now() - Number(run.completed_at);
    if (!Number.isFinite(age) || age < 0 || age > COMPLETION_TTL_MS) return json({ error: "Completion proof expired" }, 403);
    if (this.turnstileEnabled()) {
      const ok = await verifyTurnstile(this.env.TURNSTILE_SECRET, body.turnstileToken, request, body.completionToken);
      if (!ok) return json({ error: "Verification failed or expired" }, 403);
    }

    let personalBest = false;
    let officialTimeMs = 0;
    try {
      this.ctx.storage.transactionSync(() => {
        run = first(this.sql.exec("SELECT * FROM runs_v2 WHERE run_id=?", body.completionToken));
        if (!run || run.submitted_at) throw new Error("USED_RUN");
        const candidate = { time_ms: Number(run.time_ms), score: Number(run.score) };
        if (!integer(candidate.time_ms, MIN_RUN_MS, MAX_RUN_MS) || !integer(candidate.score, 1, 100_000)) throw new Error("INVALID_RUN");
        const current = first(this.sql.exec(
          "SELECT time_ms,score FROM leaderboard_v2 WHERE season_id=? AND player_id=?",
          ACTIVE_SEASON, body.playerId,
        ));
        personalBest = better(candidate, current);
        if (!current) {
          this.sql.exec(
            "INSERT INTO leaderboard_v2(season_id,player_id,name,time_ms,score,kills,achieved_at) VALUES(?,?,?,?,?,?,?)",
            ACTIVE_SEASON, body.playerId, name, candidate.time_ms, candidate.score, EXPECTED_KILLS, Date.now(),
          );
        } else if (personalBest) {
          this.sql.exec(
            "UPDATE leaderboard_v2 SET name=?,time_ms=?,score=?,kills=?,achieved_at=? WHERE season_id=? AND player_id=?",
            name, candidate.time_ms, candidate.score, EXPECTED_KILLS, Date.now(), ACTIVE_SEASON, body.playerId,
          );
        }
        this.sql.exec("UPDATE runs_v2 SET submitted_at=? WHERE run_id=? AND submitted_at IS NULL", Date.now(), body.completionToken);
        officialTimeMs = candidate.time_ms;
      });
    } catch (error) {
      if (error?.message === "USED_RUN") return json({ error: "Completion proof was already used" }, 409);
      if (error?.message === "INVALID_RUN") return json({ error: "Completion proof failed validation" }, 400);
      throw error;
    }
    this.topCache = null;
    const best = this.currentPlayer(body.playerId);
    return json({
      accepted: true,
      personalBest,
      rank: best?.rank ?? null,
      rankLabel: best?.rankLabel ?? "100+",
      officialTimeMs,
      best,
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (!validOrigin(request)) return json({ error: "Origin is not allowed" }, 403);
      if (request.method === "GET" && url.pathname === "/api/config") {
        return json({
          build: BUILD_ID,
          season: ACTIVE_SEASON,
          turnstileSiteKey: this.turnstileEnabled() ? this.env.TURNSTILE_SITE_KEY : null,
          protection: this.turnstileEnabled() ? "turnstile+verified-run" : "verified-run",
        });
      }
      if (request.method === "GET" && url.pathname === "/api/leaderboard") {
        return json(this.leaderboard(request.headers.get("X-Haze-Player") || ""));
      }
      if (request.method !== "POST") return json({ error: "Not found" }, 404);
      const body = await readJson(request);
      if (url.pathname === "/api/run/start") return await this.start(body, request);
      if (url.pathname === "/api/run/complete") return await this.complete(body);
      if (url.pathname === "/api/run/finish") return await this.finish(body, request);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      const status = integer(error?.status, 400, 599) ? error.status : 500;
      if (status === 500) console.error(JSON.stringify({ event: "api_error", path: url.pathname, message: String(error?.message || error) }));
      return json({ error: status === 500 ? "Internal server error" : error.message }, status);
    }
  }
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("x-frame-options", "DENY");
  headers.set("content-security-policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; img-src 'self' data: blob:; media-src 'self'; worker-src 'self' blob:; manifest-src 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.LEADERBOARD.idFromName("global-v2");
      return withSecurityHeaders(await env.LEADERBOARD.get(id).fetch(request));
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
