import { createPointer } from "./filesystem-api.js";

const runButton = document.querySelector("#run-demo");
const status = document.querySelector("#status");

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  status.textContent = "フォルダを選択してください。";

  try {
    const pointer = await createPointer();
    await pointer.createFolder("", "src");
    await pointer.createFolder("src", "components");
    await pointer.createFile("src/components", "Button.js");
    await pointer.editFile("src/components/Button.js", [
      { start: 0, end: 0, text: "export default function Button() {}\n" },
    ]);
    await pointer.renameFile("src/components/Button.js", "ActionButton.js");
    await pointer.deleteFile("src/components/ActionButton.js");
    await pointer.deleteFolder("src/components");
    status.textContent = "デモが完了しました。";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      status.textContent = "フォルダの選択がキャンセルされました。";
    } else {
      status.textContent = `エラー: ${error instanceof Error ? error.message : String(error)}`;
      console.error(error);
    }
  } finally {
    runButton.disabled = false;
  }
});