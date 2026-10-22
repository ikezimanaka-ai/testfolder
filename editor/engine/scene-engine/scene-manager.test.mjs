import test from "node:test";
import assert from "node:assert/strict";

import { SceneEngine } from "./engine.js";

test("registers and starts the initial scene", () => {
  const engine = new SceneEngine({ width: 640, height: 360, autoStart: false });
  const calls = [];

  engine.registerScene("title", {
    onEnter() {
      calls.push("title-enter");
    },
    onUpdate() {
      calls.push("title-update");
    },
  });

  engine.start("title");
  engine.update(0.016);
  engine.stop();

  assert.deepEqual(calls.slice(0, 2), ["title-enter", "title-update"]);
});

test("switchScene runs exit before the next scene enters", () => {
  const engine = new SceneEngine({ width: 640, height: 360, autoStart: false });
  const trace = [];

  engine.registerScene("title", {
    onEnter() { trace.push("title-enter"); },
    onExit() { trace.push("title-exit"); },
  });
  engine.registerScene("play", {
    onEnter() { trace.push("play-enter"); },
  });

  engine.start("title");
  engine.switchScene("play");
  engine.stop();

  assert.deepEqual(trace, ["title-enter", "title-exit", "play-enter"]);
});

test("throws when switching to an unregistered scene", () => {
  const engine = new SceneEngine({ width: 640, height: 360, autoStart: false });
  engine.registerScene("title", {});

  assert.throws(() => engine.switchScene("missing"), /not registered/i);
});

test("throws when a scene name is duplicated", () => {
  const engine = new SceneEngine({ width: 640, height: 360, autoStart: false });
  engine.registerScene("title", {});

  assert.throws(() => engine.registerScene("title", {}), /already registered/i);
});
