import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const indexSource = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function createTracker(total) {
  const source = readFileSync(new URL("../public/loader-state.js", import.meta.url), "utf8");
  const context = {};
  vm.runInNewContext(source, context, { filename: "loader-state.js" });
  return context.HazeLoaderState.create(total);
}

describe("startup loader progress", () => {
  it("reports completed work monotonically instead of cycling fake percentages", () => {
    const tracker = createTracker(4);
    expect(tracker.snapshot()).toMatchObject({ completed: 0, total: 4, percent: 0 });
    expect(tracker.mark("run")).toMatchObject({ completed: 1, percent: 25, phase: "run" });
    expect(tracker.mark("palette")).toMatchObject({ completed: 2, percent: 50, phase: "palette" });
    expect(tracker.mark("rig")).toMatchObject({ completed: 3, percent: 75, phase: "rig" });
    expect(tracker.mark("clip")).toMatchObject({ completed: 4, percent: 100, phase: "clip" });
    expect(tracker.mark("clip", "late duplicate")).toMatchObject({ completed: 4, percent: 100, phase: "clip" });
  });

  it("keeps a failed load distinguishable from a completed load", () => {
    const tracker = createTracker(2);
    const failure = tracker.fail("network timeout", "rigs unavailable");
    expect(failure).toMatchObject({ completed: 0, total: 2, percent: 0, failed: "network timeout", phase: "rigs unavailable" });
    expect(tracker.snapshot().failed).toBe("network timeout");
  });

  it("binds the visible startup panel to real task state and retry paths", () => {
    expect(indexSource).toContain('STARTUP_LOAD.rigs.mark(key||phase,phase)');
    expect(indexSource).toContain('Promise.all([runPromise,waitForPolyartStarter()])');
    expect(indexSource).toContain('function loadGltf(url,retries=2)');
    expect(indexSource).toContain('startPolyartLoad(true)');
    expect(indexSource).not.toContain('(18+((this.index%4)*9))');
    expect(indexSource).not.toContain('starterReady?"78%"');
  });
});
