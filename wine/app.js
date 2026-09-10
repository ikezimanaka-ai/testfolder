const state = { file: null, runtimeAvailable: false };

const elements = {
  dropZone: document.querySelector('#dropZone'),
  browseButton: document.querySelector('#browseButton'),
  fileInput: document.querySelector('#fileInput'),
  emptyState: document.querySelector('#emptyState'),
  fileCard: document.querySelector('#fileCard'),
  fileName: document.querySelector('#fileName'),
  fileSize: document.querySelector('#fileSize'),
  clearButton: document.querySelector('#clearButton'),
  launchButton: document.querySelector('#launchButton'),
  emulatorPanel: document.querySelector('#emulatorPanel'),
  emulatorStage: document.querySelector('#emulatorStage'),
  console: document.querySelector('#console'),
  runtimeIndicator: document.querySelector('#runtimeIndicator'),
  runtimeLabel: document.querySelector('#runtimeLabel'),
  aboutButton: document.querySelector('#aboutButton'),
  aboutDialog: document.querySelector('#aboutDialog'),
  dialogClose: document.querySelector('#dialogClose')
};

function log(message, tone = '') {
  const now = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  const line = document.createElement('p');
  line.innerHTML = `<time>${now}</time><span class="log-mark">›</span><span class="${tone}">${message}</span>`;
  elements.console.append(line);
  elements.console.scrollTop = elements.console.scrollHeight;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.exe')) {
    log('EXE ファイルを選択してください。', 'warn');
    return;
  }
  state.file = file;
  elements.emptyState.classList.add('hidden');
  elements.fileCard.classList.remove('hidden');
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatBytes(file.size);
  elements.launchButton.disabled = false;
  log(`${file.name} を読み込みました。起動準備完了`, 'accent');
}

function clearFile() {
  state.file = null;
  elements.fileInput.value = '';
  elements.fileCard.classList.add('hidden');
  elements.emptyState.classList.remove('hidden');
  elements.launchButton.disabled = true;
  log('選択ファイルを解除しました。');
}

function loadRuntimeStatus() {
  const runtimeUrl = new URL(window.location.href);
  runtimeUrl.searchParams.set('auto', 'false');
  window.history.replaceState({}, '', runtimeUrl);

  const shellScript = document.createElement('script');
  shellScript.src = 'runtime/boxedwine-shell.js';
  shellScript.onload = () => {
    window.Module.locateFile = (path) => path.endsWith('.wasm') ? `runtime/${path}` : path;
    const runtimeScript = document.createElement('script');
    runtimeScript.src = 'runtime/boxedwine.js';
    runtimeScript.onload = () => {
      state.runtimeAvailable = true;
      elements.runtimeIndicator.classList.add('ready');
      elements.runtimeLabel.textContent = 'ランタイム準備中';
      log('Boxedwine WebAssembly runtime detected', 'accent');
    };
    runtimeScript.onerror = () => {
      elements.runtimeLabel.textContent = 'ランタイム読込失敗';
      log('Boxedwine WebAssembly ランタイムを読み込めませんでした。', 'warn');
    };
    document.head.append(runtimeScript);
  };
  shellScript.onerror = () => {
    elements.runtimeLabel.textContent = 'ランタイム未配置';
    log('runtime/boxedwine-shell.js が未配置です。', 'warn');
  };
  document.head.append(shellScript);
}

async function launch() {
  if (!state.file) return;
  if (!state.runtimeAvailable) {
    log('起動できません: Boxedwine WebAssembly ランタイムが未配置です。', 'warn');
    elements.aboutDialog.showModal();
    return;
  }
  log(`${state.file.name} を仮想ファイルシステムへマウント中...`);
  const bytes = new Uint8Array(await state.file.arrayBuffer());
  if (typeof window.createFile !== 'function' || typeof window.startEmulator !== 'function' || typeof window.setBoxedwineProgram !== 'function') {
    log('Boxedwine の初期化がまだ完了していません。少し待ってから再試行してください。', 'warn');
    return;
  }
  window.createFile('/d_drive', state.file.name, bytes);
  window.setBoxedwineProgram(state.file.name, '/home/username/.wine/dosdevices/d:');
  elements.emulatorPanel.classList.remove('hidden');
  elements.emulatorStage.append(document.querySelector('#canvas'));
  window.startEmulator();
  log('Boxedwine を起動しました。', 'accent');
}

elements.browseButton.addEventListener('click', () => elements.fileInput.click());
elements.fileInput.addEventListener('change', (event) => setFile(event.target.files[0]));
elements.clearButton.addEventListener('click', clearFile);
elements.launchButton.addEventListener('click', launch);
elements.dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') elements.fileInput.click(); });
['dragenter', 'dragover'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.add('is-dragging'); }));
['dragleave', 'drop'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropZone.classList.remove('is-dragging'); }));
elements.dropZone.addEventListener('drop', (event) => setFile(event.dataTransfer.files[0]));
elements.aboutButton.addEventListener('click', () => elements.aboutDialog.showModal());
elements.dialogClose.addEventListener('click', () => elements.aboutDialog.close());
window.addEventListener('boxedwine-ready', () => {
  elements.runtimeLabel.textContent = 'ランタイム準備完了';
  log('Wine filesystem ready. EXE を起動できます。', 'accent');
});
loadRuntimeStatus();
