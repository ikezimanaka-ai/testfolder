# WARNING! — Object Dodge Score Attack

Canvas-only screen with Engine → Scene → Object structure. The game itself creates and moves GameObjects; it does not draw directly with a canvas context. Scene and object update programs are fetched from the relative `./programs/` folder and advance with `wait()`-capable program runners.

## Run

From this folder, serve its parent directory so the sample can import the sibling `editor/` engine, then open `http://localhost:8000/nengine/`:

```sh
python3 -m http.server 8000 --directory ..
```

## Play

- On the canvas menu, click `+` / `−` to set starting health (default 3) and global speed (35–100%).
- Move with WASD or arrow keys. Press Space to dash through danger. Press P or Escape to pause.
- Colored warning marks identify attacks by both symbol and direction. Survive longer to raise the score.

## Object program flow

1. Create `GameEngine` and register `Scene` objects.
2. Give each Scene a frame program with `scene.setProgram(programURL("./programs/play-scene.js"))`.
3. Add Objects to that Scene. Each `ProgramObject` can have a repeating frame program via `setProgram(...)` and a one-time placement program via `setPlacementProgram(...)`.
4. Scripts are fetched relative to the page, then evaluated one statement per frame. `wait(milliseconds)` and `waitFor("name", value)` suspend and resume without async functions in the game scripts.
5. Start with `engine.start("menu")`.

`programs/` contains short, role-specific update loops. `attacks.js` defines 24 attack primitives and a generator with 300+ distinct single/pair combinations. Combination size grows from one attack to two, three, and four over a run. `game-objects.js` defines the canvas Objects used for UI, player, warning marks, and hazards.

The Engine implementation uses Canvas rendering internally for GameObjects. Game code creates shapes and Objects; it does not access a rendering context. The only visible page element is the Canvas.
