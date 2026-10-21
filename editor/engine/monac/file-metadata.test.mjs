import assert from "node:assert/strict";
import { resolveFileIcon, setiIconTheme } from "./file-icons.js";
import {
  classifyFile,
  formatAspectRatio,
  formatDuration,
  formatFileSize,
} from "./file-metadata.js";

const file = (type = "") => ({ type });

assert.equal(resolveFileIcon("app.js").icon, setiIconTheme.iconDefinitions[setiIconTheme.languageIds.javascript]);
assert.equal(resolveFileIcon("app.cjs").icon, setiIconTheme.iconDefinitions[setiIconTheme.languageIds.javascript]);
assert.equal(resolveFileIcon("app.mts").icon, setiIconTheme.iconDefinitions[setiIconTheme.languageIds.typescript]);
assert.equal(resolveFileIcon("README.md").extension, "md");
assert.equal(resolveFileIcon("unknown.zzz").icon, setiIconTheme.iconDefinitions[setiIconTheme.file]);
assert.equal(resolveFileIcon("app.zzz", ["zzz"]).custom, true);
assert.equal(resolveFileIcon("app.js", ["js"]).custom, true);
assert.equal(resolveFileIcon("app.d.ts", ["d.ts"]).extension, "d.ts");

assert.equal(classifyFile(file("image/png"), "sprite.png"), "image");
assert.equal(classifyFile(file("audio/mpeg"), "voice.mp3"), "audio");
assert.equal(classifyFile(file("video/mp4"), "clip.mp4"), "video");
assert.equal(classifyFile(file("application/zip"), "archive.zip"), "binary");
assert.equal(classifyFile(file("text/javascript"), "app.js"), "text");
assert.equal(formatFileSize(1536), "1.54 KB");
assert.equal(formatAspectRatio(1920, 1080), "16:9");
assert.equal(formatDuration(3723), "1:02:03");
assert.equal(formatDuration(64), "1:04");

console.log("Monac file metadata tests passed");
