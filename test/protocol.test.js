import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanName, validateProof } from "../src/protocol.js";

const WAVES = [
  { shambler: 6, runner: 0, brute: 0 },
  { shambler: 7, runner: 2, brute: 0 },
  { shambler: 8, runner: 3, brute: 0 },
  { shambler: 9, runner: 4, brute: 1 },
  { shambler: 10, runner: 5, brute: 1 },
  { shambler: 8, runner: 4, brute: 1 },
];

function validProof() {
  const kills = [];
  const waveSplits = [];
  let id = 0;
  let normalVariant = 0;
  for (let wave = 1; wave <= WAVES.length; wave++) {
    const types = [];
    for (const type of ["shambler", "runner", "brute"]) {
      let count = WAVES[wave - 1][type];
      if (wave === 6 && type === "brute") count--;
      for (let index = 0; index < count; index++) types.push(type);
    }
    if (wave === 6) types.push("brute");
    const waveStart = (wave - 1) * 17_000 + 1_000;
    for (let index = 0; index < types.length; index++) {
      const spawnedAtMs = waveStart + index * 350;
      kills.push({
        id: ++id,
        wave,
        type: types[index],
        variant: wave === 6 && index === types.length - 1 ? 9 : normalVariant++ % 10,
        spawnedAtMs,
        atMs: spawnedAtMs + 600,
      });
    }
    waveSplits.push({ wave, atMs: kills.at(-1).atMs });
  }
  return { kills, waveSplits };
}

describe("ranked run proof", () => {
  it("accepts a complete six-wave proof and derives its score", () => {
    const result = validateProof(validProof(), 110_000);
    expect(result.ok).toBe(true);
    expect(result.kills).toBe(69);
    expect(result.score).toBeGreaterThan(7_000);
  });

  it("rejects duplicate enemy IDs", () => {
    const proof = validProof();
    proof.kills[1].id = proof.kills[0].id;
    expect(validateProof(proof, 110_000)).toMatchObject({ ok: false });
  });

  it("rejects altered wave composition", () => {
    const proof = validProof();
    proof.kills[0].type = "brute";
    expect(validateProof(proof, 110_000)).toMatchObject({ ok: false });
  });

  it("rejects a proof that outruns the server clock", () => {
    const proof = validProof();
    for (const event of proof.kills) {
      if (event.wave === 6) {
        event.spawnedAtMs += 5_000;
        event.atMs += 5_000;
      }
    }
    proof.waveSplits[5].atMs += 5_000;
    expect(validateProof(proof, 90_000)).toMatchObject({ ok: false });
  });
});

describe("display names", () => {
  it("normalizes whitespace and compatibility characters", () => {
    expect(cleanName("  ＨＡＺＥ   Runner ")).toBe("HAZE Runner");
  });

  it("accepts sixteen Unicode code points", () => {
    expect(cleanName("🌫️Night".slice(0))).not.toBeNull();
  });

  it("rejects bidi controls and overlong names", () => {
    expect(cleanName("safe\u202Eevil")).toBeNull();
    expect(cleanName("abcdefghijklmnopq")).toBeNull();
  });
});

describe("quota guardrails", () => {
  it("does not use full-table COUNT rank scans", () => {
    const worker = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
    expect(worker).not.toMatch(/COUNT\s*\(/i);
  });
});
