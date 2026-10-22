# Scene Engine

This folder adds a scene-based engine without changing the existing engine files in the parent folder.

## Features

- Register scenes by name.
- Hook functions for `onEnter`, `onUpdate`, and `onExit`.
- Optional `onRender` for scene-specific drawing.
- Scene switching with lifecycle guarantees.

## Usage

```js
import { SceneEngine, INPUT } from "./engine.js";

const engine = new SceneEngine({ canvas: document.getElementById("game") });

engine.registerScene("title", {
  onEnter() {
    console.log("Title scene started");
  },
  onUpdate(dt) {
    if (INPUT.pressed("Enter")) {
      engine.switchScene("play");
    }
  },
});

engine.registerScene("play", {
  onEnter() {
    console.log("Play scene started");
  },
  onUpdate(dt) {
    if (INPUT.pressed("Escape")) {
      engine.switchScene("title");
    }
  },
});

engine.start("title");
```

## Scene lifecycle

When a scene becomes active, its `onEnter` function runs. For each frame, `onUpdate` runs on the active scene. When switching away, `onExit` runs before the next scene is entered.

## Example pages

- `example.html`: title / settings / play / map sample.
