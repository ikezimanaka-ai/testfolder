(() => {
const { Engine, GameObject } = window.GameEngine;
const canvas = document.getElementById('editor-canvas');

function initializeCanvas() {
  const maxWidth = 800;
  const maxHeight = 600;
  const ratio = maxWidth / maxHeight;
  const canvasWrap = document.querySelector('.canvas-wrap');
  let width = Math.min(canvasWrap.clientWidth, maxWidth);
  let height = Math.min(canvasWrap.clientHeight, maxHeight);

  if (width / height > ratio) width = height * ratio;
  else height = width / ratio;

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

initializeCanvas();

window.addEventListener('resize', initializeCanvas);
const engine = new Engine({ fps: 30, canvas });
const templates = [];
let selected = null;
let contextTarget = null;
let imageUrl = null;
let debugEnabled = false;
let startupExecuted = false;
let pointerPosition = null;
let programEditor = null;
let initialProgramEditor = null;
let engineInitialEditor = null;
let engineFrameEditor = null;
const programModels = new Map();
const initialProgramModels = new Map();
const $ = selector => document.querySelector(selector);
const form = $('#object-form');
const objectList = $('#object-list');
const programFallback = $('#program');
const initialProgramFallback = $('#initial-program');
const engineInitialFallback = $('#engine-initial-program');
const engineFrameFallback = $('#engine-frame-program');

function getProgram() { return selected && programEditor ? programEditor.getValue() : programFallback.value; }
function setProgram(value) { if (programEditor && selected) { const model = programModels.get(selected.id) || window.monaco.editor.createModel(value || '', 'javascript'); programModels.set(selected.id, model); programEditor.setModel(model); if (model.getValue() !== (value || '')) model.setValue(value || ''); } else programFallback.value = value || ''; }
function getInitialProgram() { return selected && initialProgramEditor ? initialProgramEditor.getValue() : initialProgramFallback.value; }
function setInitialProgram(value) { if (initialProgramEditor && selected) { const model = initialProgramModels.get(selected.id) || window.monaco.editor.createModel(value || '', 'javascript'); initialProgramModels.set(selected.id, model); initialProgramEditor.setModel(model); if (model.getValue() !== (value || '')) model.setValue(value || ''); } else initialProgramFallback.value = value || ''; }
function getEngineInitialProgram() { return engineInitialEditor ? engineInitialEditor.getValue() : engineInitialFallback.value; }
function getEngineFrameProgram() { return engineFrameEditor ? engineFrameEditor.getValue() : engineFrameFallback.value; }
function setEngineInitialProgram(value) { if (engineInitialEditor) engineInitialEditor.setValue(value || ''); else engineInitialFallback.value = value || ''; }
function setEngineFrameProgram(value) { if (engineFrameEditor) engineFrameEditor.setValue(value || ''); else engineFrameFallback.value = value || ''; }
function setupMonaco() {
  const loader = document.createElement('script');
  loader.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
  loader.onload = () => {
    window.require.config({ paths:{ vs:'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
    window.require(['vs/editor/editor.main'], () => {
      const options = { language:'javascript', theme:'vs-dark', automaticLayout:true, minimap:{enabled:false}, fontSize:13, lineNumbers:'on', padding:{top:10,bottom:10}, scrollBeyondLastLine:false, overflowWidgetsDomNode:document.body };
      programEditor = window.monaco.editor.create($('#program-editor'), Object.assign({}, options, { value:programFallback.value }));
      initialProgramEditor = window.monaco.editor.create($('#initial-program-editor'), Object.assign({}, options, { value:initialProgramFallback.value }));
      engineInitialEditor = window.monaco.editor.create($('#engine-initial-editor'), Object.assign({}, options, { value:engineInitialFallback.value }));
      engineFrameEditor = window.monaco.editor.create($('#engine-frame-editor'), Object.assign({}, options, { value:engineFrameFallback.value }));
      programEditor.onDidChangeModelContent(updateSelected);
      initialProgramEditor.onDidChangeModelContent(updateSelected);
      engineInitialEditor.onDidChangeModelContent(syncEnginePrograms);
      engineFrameEditor.onDidChangeModelContent(syncEnginePrograms);
      if (selected) { setProgram(selected.programs[0] || ''); setInitialProgram(selected.initialPrograms[0] || ''); }
    });
  };
  loader.onerror = () => document.body.classList.add('monaco-fallback');
  document.head.append(loader);
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[character])); }
function uniqueId(candidate) { const base = String(candidate || 'object').trim() || 'object'; let id = base; let count = 2; while (templates.some(object => object.id === id)) id = `${base}_${count++}`; return id; }
function makeTemplate(source = null) {
  const spec = source ? source.getInfo() : { tag:['object'], x:120, y:100, width:80, height:50, color:'#ef8354', colliders:[{type:'rect',width:80,height:50}] };
  spec.id = uniqueId(source ? `${source.id}_copy` : 'object');
  const template = new GameObject(spec); template._imageElement = source?._imageElement || null; template._csvPoints = source?._csvPoints ? source._csvPoints.map(point => ({...point})) : null; templates.push(template); engine.registerTemplate(template); selectTemplate(template); renderObjectList();
}
function selectTemplate(template) {
  selected = template; $('.engine-settings').hidden = true; $('#empty-state').hidden = !!template; form.hidden = !template; if (!template) return;
  if (programEditor) { if (!programModels.has(template.id)) programModels.set(template.id, window.monaco.editor.createModel(template.programs[0] || '', 'javascript')); if (!initialProgramModels.has(template.id)) initialProgramModels.set(template.id, window.monaco.editor.createModel(template.initialPrograms[0] || '', 'javascript')); }
  $('#object-id').value = template.id; $('#tag').value = template.tag.join(', '); $('#x').value = template.x; $('#y').value = template.y; $('#width').value = template.width; $('#height').value = template.height; $('#color').value = template.color.startsWith('#') ? template.color : '#ef8354'; $('#image-kind').value = template.image?.kind || 'rectangle'; setInitialProgram(template.initialPrograms[0] || ''); setProgram(template.programs[0] || ''); renderObjectList();
}
function selectEngine() {
  selected = null; form.hidden = true; $('#empty-state').hidden = true; $('.engine-settings').hidden = false; renderObjectList();
}
function syncEnginePrograms() {
  const initial = getEngineInitialProgram();
  const frame = getEngineFrameProgram();
  engineInitialFallback.value = initial; engineFrameFallback.value = frame;
  engine.startupPrograms = initial.trim() ? [initial] : [];
  engine.framePrograms = frame.trim() ? [frame] : [];
}
function renderObjectList() {
  objectList.replaceChildren();
  const engineRow = document.createElement('button'); engineRow.type = 'button'; engineRow.className = selected === null ? 'object-row engine-row selected' : 'object-row engine-row'; engineRow.innerHTML = '<strong>Engine</strong><span>Initial / Frame Programs</span>'; engineRow.addEventListener('click', selectEngine); engineRow.addEventListener('contextmenu', event => event.preventDefault()); objectList.append(engineRow);
  for (const template of templates) {
    const button = document.createElement('button'); button.type = 'button'; button.className = template === selected ? 'object-row selected' : 'object-row'; button.innerHTML = `<strong>${escapeHtml(template.tag[0] || 'Object')}</strong><span>ID: ${escapeHtml(template.id)}</span>`;
    button.addEventListener('click', () => selectTemplate(template));
    button.addEventListener('contextmenu', event => { event.preventDefault(); contextTarget = template; $('#context-menu').hidden = false; $('#context-menu').style.left = `${event.clientX}px`; $('#context-menu').style.top = `${event.clientY}px`; }); objectList.append(button);
  }
}
function updateSelected() {
  if (!selected) return;
  const nextId = $('#object-id').value.trim();
  if (!nextId || (nextId !== selected.id && templates.some(object => object.id === nextId))) { $('#program-error').textContent = 'IDは空欄にできず、重複もできません。'; $('#object-id').value = selected.id; return; }
  if (nextId !== selected.id) { const oldId = selected.id; engine.unregisterTemplate(oldId); selected.setId(nextId); engine.registerTemplate(selected); if (programModels.has(oldId)) { programModels.set(nextId, programModels.get(oldId)); programModels.delete(oldId); } if (initialProgramModels.has(oldId)) { initialProgramModels.set(nextId, initialProgramModels.get(oldId)); initialProgramModels.delete(oldId); } }
  selected.tag = $('#tag').value.split(',').map(value => value.trim()).filter(Boolean); selected.x = Number($('#x').value) || 0; selected.y = Number($('#y').value) || 0; selected.width = Number($('#width').value) || 10; selected.height = Number($('#height').value) || 10; selected.color = $('#color').value; selected.initialPrograms = getInitialProgram() ? [getInitialProgram()] : []; selected.programs = getProgram() ? [getProgram()] : [];
  const kind = $('#image-kind').value; if (kind === 'circle') selected.colliders = [{type:'circle',radius:Math.min(selected.width, selected.height) / 2}]; else if (kind === 'csv' && selected._csvPoints?.length) selected.colliders = [{type:'polygon',points:selected._csvPoints}]; else selected.colliders = [{type:'rect',width:selected.width,height:selected.height}]; selected.image = kind === 'rectangle' || kind === 'circle' ? null : {kind}; renderObjectList();
}
function deleteTemplate(template) { const index = templates.indexOf(template); if (index < 0) return; templates.splice(index, 1); engine.unregisterTemplate(template.id); programModels.get(template.id)?.dispose(); initialProgramModels.get(template.id)?.dispose(); programModels.delete(template.id); initialProgramModels.delete(template.id); template.destroy(); if (selected === template) selectTemplate(templates[index] || templates[index - 1] || null); renderObjectList(); }
function clearRuntime() { for (const display of engine.displays.slice()) { for (const object of display.listObjects()) object.destroy(); display.delete(); } }
function runEngineCode() { clearRuntime(); syncEnginePrograms(); try { engine.runStartupPrograms(); startupExecuted = true; $('#engine-settings-error').textContent = ''; } catch (error) { startupExecuted = false; $('#engine-settings-error').textContent = error.message; } }
function runPrograms(dt) { if (!startupExecuted) return; const scope = Object.fromEntries(engine.displays.map(layer => [layer.name, layer])); scope.INPUT = engine.public.INPUT; for (const source of engine.framePrograms || []) { try { const program = String(source || '').replace(/\bthis\./g, 'engine.'); new Function('engine','dt','INPUT','scope',`return (function () { with (scope) { ${program}\n } }).call(engine);`)(engine, dt, engine.public.INPUT, scope); } catch (error) { $('#engine-settings-error').textContent = error.message; } } for (const display of engine.displays) for (const object of display.listObjects()) for (const source of object.programs) { try { const program = String(source || '').replace(/\bthis\./g, 'self.'); new Function('self','display','engine','dt','INPUT','scope',`return (function () { with (scope) { ${program}\n } }).call(self);`)(object, display, engine, dt, engine.public.INPUT, scope); } catch (error) { $('#program-error').textContent = error.message; } } }
function findObjectAt(event) { const rect = canvas.getBoundingClientRect(); const x = (event.clientX - rect.left) * canvas.width / rect.width; const y = (event.clientY - rect.top) * canvas.height / rect.height; for (let i=engine.displays.length - 1; i>=0; i--) for (const object of engine.displays[i].listObjects().reverse()) if (object.containsPoint(x,y)) return {object,x:event.clientX,y:event.clientY}; return null; }
function showDebug(event) { pointerPosition = {clientX:event.clientX, clientY:event.clientY}; updateDebug(); }
function updateDebug() { const tooltip = $('#tooltip'); if (!debugEnabled || !pointerPosition) return; const found = findObjectAt(pointerPosition); if (!found) { tooltip.hidden = true; return; } const hiddenKeys = new Set(['programs', 'initialPrograms']); const values = Object.entries(found.object).filter(([key]) => !key.startsWith('_') && !hiddenKeys.has(key) && typeof key !== 'function'); const privateValues = Object.entries(found.object._debugPrivateSnapshot()); const lines = values.concat(privateValues.map(([key,value]) => [`private.${key}`, value])); tooltip.innerHTML = `<strong>ID: ${escapeHtml(found.object.id)}</strong><br>${lines.map(([key,value]) => `${escapeHtml(key)}: ${escapeHtml(Array.isArray(value) ? JSON.stringify(value) : value)}`).join('<br>')}`; tooltip.hidden = false; tooltip.style.left = `${found.x + 12}px`; tooltip.style.top = `${found.y + 12}px`; }

function saveProject() {
  const projectData = {
    engine: {
      initial: getEngineInitialProgram(),
      frame: getEngineFrameProgram(),
    },
    templates: templates.map(t => ({
      info: t.getInfo(),
      initialPrograms: t.initialPrograms,
      programs: t.programs,
    })),
  };
  const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'project.json';
  a.click();
  URL.revokeObjectURL(url);
}

function loadProject() {
  const file = $('#project-file').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      // Clear existing
      templates.slice().forEach(deleteTemplate);
      
      // Restore engine programs
      setEngineInitialProgram(data.engine?.initial || '');
      setEngineFrameProgram(data.engine?.frame || '');
      syncEnginePrograms();

      // Restore templates
      for (const tData of (data.templates || [])) {
        const template = new GameObject(tData.info);
        template.initialPrograms = tData.initialPrograms || [];
        template.programs = tData.programs || [];
        templates.push(template);
        engine.registerTemplate(template);
      }
      selectEngine();
      renderObjectList();
    } catch (e) {
      alert('プロジェクトファイルの読み込みに失敗しました: ' + e.message);
    }
  };
  reader.readAsText(file);
}

$('#new-object').addEventListener('click', () => makeTemplate()); $('#delete-object').addEventListener('click', () => { if (selected) deleteTemplate(selected); }); $('#duplicate-object').addEventListener('click', () => { if (contextTarget) { makeTemplate(contextTarget); $('#context-menu').hidden = true; } }); $('#context-delete').addEventListener('click', () => { if (contextTarget) deleteTemplate(contextTarget); $('#context-menu').hidden = true; }); document.addEventListener('click', () => { $('#context-menu').hidden = true; }); form.addEventListener('input', updateSelected);
$('#image-file').addEventListener('change', event => { if (!selected || !event.target.files[0]) return; if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = URL.createObjectURL(event.target.files[0]); const image = new Image(); image.onload = () => { selected._imageElement = image; }; image.src = imageUrl; $('#image-kind').value = 'image'; updateSelected(); });
$('#csv-file').addEventListener('change', event => { if (!selected || !event.target.files[0]) return; const reader = new FileReader(); reader.onload = () => { const points = String(reader.result).split(/\r?\n/).map(line => line.split(',').map(Number)).filter(row => row.length >= 2 && row.every(Number.isFinite)).map(([x,y]) => ({x,y})); if (points.length >= 3) { selected._csvPoints = points; $('#image-kind').value = 'csv'; updateSelected(); } }; reader.readAsText(event.target.files[0]); });
$('#start').addEventListener('click', () => { if (!startupExecuted) runEngineCode(); engine.start(); }); $('#stop').addEventListener('click', () => engine.stop()); $('#reset').addEventListener('click', () => { engine.stop(); clearRuntime(); startupExecuted = false; $('#tooltip').hidden = true; }); $('#debug').addEventListener('click', event => { debugEnabled = !debugEnabled; event.currentTarget.classList.toggle('active', debugEnabled); if (!debugEnabled) $('#tooltip').hidden = true; }); $('#clear-program-error').addEventListener('click', () => { $('#program-error').textContent = ''; }); 
$('#save-project').addEventListener('click', saveProject);
$('#load-project').addEventListener('click', () => $('#project-file').click());
$('#project-file').addEventListener('change', loadProject);
canvas.addEventListener('pointermove', showDebug);
canvas.addEventListener('pointerdown', () => canvas.focus()); canvas.addEventListener('keydown', event => { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','PageUp','PageDown','Home','End'].includes(event.key)) event.preventDefault(); });
engine.onUpdate(runPrograms); engine.onRender(updateDebug); setupMonaco(); selectEngine();
})();
