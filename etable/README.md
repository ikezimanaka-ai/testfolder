# ETABLE

`etable/` is a Canvas-only edition of [TABLE 2](../table2/). The lobby, room, table, controls, game boards, and chat are drawn by the Scene Engine on one Canvas. Pointer input operates the table and keyboard input edits focused Canvas fields. Image selection uses a hidden file input to open the browser's native picker.

## Run

From the repository root, start a static HTTP server and open `/etable/`:

```sh
python3 -m http.server 8000
```

SkyWay credentials are intentionally blank in `app.js`. To enable multiplayer, set `TOKEN_ENDPOINT` to a trusted server endpoint that accepts the room/member request and returns JSON in the form `{"token":"<short-lived SkyWay token>"}`. The endpoint must issue the required lobby and room permissions. Never put a SkyWay Secret Key in browser code or publish credentials.

## Reused functionality

- Shared-table state/actions from [`table2/engine.js`](../table2/engine.js)
- Daifugu adapter and game rules from [`table2/game-modes.js`](../table2/game-modes.js)
- Scene lifecycle and Canvas rendering from [`editor/engine/scene-engine/engine.js`](../editor/engine/scene-engine/engine.js)
- Shared table objects, cards/dealing, mahjong tiles, drawing, coins/bets, public rooms, chat, and Daifugu / memory / old-maid games

## Tests

Run the state engine, game-mode, Daifugu rules, and Scene Engine tests from the repository root:

```sh
node --test table2/engine.test.cjs table2/game-modes.test.mjs millionaire/beta/game-engine.test.mjs editor/engine/scene-engine/scene-manager.test.mjs
```
