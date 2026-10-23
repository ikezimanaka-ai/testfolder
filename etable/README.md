# ETABLE

`etable/` is a Canvas-only edition of [TABLE 2](../table2/). The lobby, room, table, controls, game boards, and chat are drawn by the Scene Engine on a landscape 5:3 Canvas with a 1000 × 600 logical layout and a 1800 × 1080 backing resolution for sharper rendering. The shared table stays visible on the left while operation, game, card, mahjong, and chat controls occupy tabs in the right-side panel. The hand view shows cards in a scrollable grid; the Daifugu and old-maid game hands are also scrollable. Canvas scroll behavior is provided by `editor/engine/ui-objects.js`. Notifications do not expire; dismiss them with the close button or by clicking outside the notice. Confirmation dialogs can be cancelled with an outside click. Pointer input operates the table and keyboard input edits focused Canvas fields. Image selection uses a hidden file input to open the browser's native picker.

## Run

From the repository root, start a static HTTP server and open `/etable/`:

```sh
python3 -m http.server 8000
```

SkyWay credentials are intentionally unset in the browser. The shared-table UI and local game logic are available, but multiplayer connection requires a trusted server-side token integration. Do not place a SkyWay Secret Key in `app.js` or other browser-delivered files.

## Reused functionality

- Shared-table state/actions from [`table2/engine.js`](../table2/engine.js)
- Daifugu adapter and game rules from [`table2/game-modes.js`](../table2/game-modes.js)
- Scene lifecycle and Canvas rendering from [`editor/engine/scene-engine/engine.js`](../editor/engine/scene-engine/engine.js)
- Shared table objects, cards/dealing, mahjong tiles, drawing, coins/bets, public rooms, chat, and Daifugu / memory / old-maid games

## Mahjong

The Canvas table uses a four-seat riichi layout: each player has a visible discard river and exposed melds, while only your own hand faces up. At 1000 × 600 logical pixels, a 14-tile hand fits across the table. The Mahjong controls let the host start a four-player round; the engine deals 14 tiles to the host/dealer and 13 to each other player, then supports turn-based draws and discards, chi from the previous seat, pon, daiminkan, and replacement draws.

This implements table layout and basic tile flow rather than a complete scoring system: yaku/win validation, riichi, ron, points, call-response priority, and hand/round progression are not automated. Rules vary by group; the general reference used was [Japanese Mahjong rules (Wikipedia)](https://ja.wikipedia.org/wiki/%E9%BA%BB%E9%9B%80%E3%81%AE%E3%83%AB%E3%83%BC%E3%83%AB).

## Tests

Run the state engine, game-mode, Daifugu rules, and Scene Engine tests from the repository root:

```sh
node --test table2/engine.test.cjs table2/game-modes.test.mjs millionaire/beta/game-engine.test.mjs editor/engine/scene-engine/scene-manager.test.mjs
node --experimental-default-type=module --test editor/engine/ui-objects.test.mjs
```
