import assert from "node:assert/strict";
import { buildRunnerDocument } from "./game-runner.js";

const documentText = buildRunnerDocument({
  entryPath: "src/main.js",
  files: [
    { path: "src/main.js", value: 'import { Engine } from "../engine.js"; import("./helper.js");' },
    { path: "src/helper.js", value: "export const answer = 42;" },
    { path: "unused.js", value: 'import "./missing-unrelated.js";' },
  ],
  engineSource: "export class Engine {}",
  uiSource: 'import { Engine } from "./engine.js"; export class TextObject {}',
  assets: { logo: "<svg></svg>" },
  token: "test-run",
});

assert.match(documentText, /workspace\/src\/main\.js/);
assert.match(documentText, /game-engine\/engine\.js/);
assert.match(documentText, /workspace\/src\/helper\.js/);
assert.match(documentText, /GameStudio/);
assert.match(documentText, /\\u003csvg/);
assert.throws(() => buildRunnerDocument({
  entryPath: "main.js",
  files: [{ path: "main.js", value: 'import "./missing.js";' }],
  engineSource: "",
  uiSource: "",
  token: "test-run",
}), /解決できません/);
assert.throws(() => buildRunnerDocument({
  entryPath: "../main.js",
  files: [{ path: "main.js", value: "" }],
  engineSource: "",
  uiSource: "",
  token: "test-run",
}), /ワークスペースの外/);

console.log("Monac game runner tests passed");
