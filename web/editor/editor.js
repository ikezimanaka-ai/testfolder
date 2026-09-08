(() => {
	const { Engine, GameObject } = window.GameEngine;
	const $ = (id) => document.getElementById(id);
	const canvas = $('editor-canvas');
	const templates = [];
	let selected = null;
	let contextTarget = null;
	let svgTarget = null;
	let startupExecuted = false;
	let compiledCanvas = null;
	let compiledRuntime = null;
	let debugEnabled = false;
	let programEditor = null;
	let initialEditor = null;
	let engineInitialEditor = null;
	let engineFrameEditor = null;
	const programModels = new Map();
	const initialModels = new Map();
	const engine = new Engine({ fps: 30, canvas });
	let svgEditor = null;
	let svgEditorReady = null;
	let svgSyncTimer = null;
	let loadingSvgTab = false;
	let svgLoadVersion = 0;

	const defaultSvg = () => ({ tabs: [{ id: 'svg-1', name: 'Main', width: 100, height: 100, elements: [{ type: 'rect', x: 5, y: 15, width: 90, height: 70, rx: 8, fill: '#ef8354' }] }], activeTab: 'svg-1' });
	const clone = (value) => JSON.parse(JSON.stringify(value));
	const uniqueId = (base) => { let id = String(base || 'object').trim() || 'object'; let n = 2; while (templates.some((item) => item.id === id)) id = `${base}_${n++}`; return id; };
	const getSvgTab = (object = selected) => { const svg = object?.svg || defaultSvg(); return svg.tabs.find((tab) => tab.id === svg.activeTab) || svg.tabs[0]; };
	function ensureSvgEditor() {
		if (svgEditorReady) return svgEditorReady;
		svgEditorReady = import('./Editor.js').then(({ default: Editor }) => {
			const host = $('svg-editor-host');
			host.style.width = '740px';
			host.style.height = '430px';
			svgEditor = new Editor($('svg-editor-host'));
			svgEditor.setConfig({
				dimensions: [100, 100],
				allowInitialUserOverride: true,
				extensions: [],
				noDefaultExtensions: false,
				userExtensions: []
			});
			return svgEditor.init().then(() => {
				svgEditor.svgCanvas.bind('changed', () => {
					if (loadingSvgTab || !selected) return;
					clearTimeout(svgSyncTimer);
					svgSyncTimer = setTimeout(() => {
						syncSvgEditor();
						compileSvg(selected);
					}, 120);
				});
			});
		});
		return svgEditorReady;
	}
	function syncSvgEditor(tab = getSvgTab()) {
		if (!tab || !svgEditor?.svgCanvas?.getSvgString) return;
		try { tab.source = svgEditor.svgCanvas.getSvgString(); } catch (_) { /* SVG-Edit may be between document changes. */ }
	}
	function svgSource(tab) { return tab?.source || svgMarkup(tab); }
	function loadSvgTab(tab) {
		if (!tab) return;
		ensureSvgEditor().then(async () => {
			if (!svgEditor?.loadSvgString) return;
			const version = ++svgLoadVersion;
			loadingSvgTab = true;
			try { await svgEditor.loadSvgString(svgSource(tab)); } finally {
				loadingSvgTab = false;
				if (version !== svgLoadVersion && selected) loadSvgTab(getSvgTab());
			}
		});
	}
	function svgColliders(tab, object) {
		const source = svgSource(tab);
		const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
		const root = doc.documentElement;
		const viewBox = (root.getAttribute('viewBox') || `0 0 ${tab.width || 100} ${tab.height || 100}`).trim().split(/[ ,]+/).map(Number);
		const svgWidth = viewBox[2] || tab.width || 100;
		const svgHeight = viewBox[3] || tab.height || 100;
		const toX = (value) => (Number(value) / svgWidth - 0.5) * object.width;
		const toY = (value) => (Number(value) / svgHeight - 0.5) * object.height;
		const colliders = [];
		root.querySelectorAll('rect,circle,ellipse,polygon').forEach((node) => {
			const type = node.tagName.toLowerCase();
			if (type === 'circle' || type === 'ellipse') colliders.push({ type: 'circle', x: toX(node.getAttribute('cx') || 0), y: toY(node.getAttribute('cy') || 0), radius: Math.max(Number(node.getAttribute('r') || node.getAttribute('rx') || 0) / svgWidth * object.width, Number(node.getAttribute('ry') || node.getAttribute('r') || 0) / svgHeight * object.height) });
			else if (type === 'polygon') colliders.push({ type: 'polygon', points: (node.getAttribute('points') || '').trim().split(/\s+/).map((point) => point.split(',').map(Number)).filter((point) => point.length === 2).map(([x, y]) => ({ x: toX(x), y: toY(y) })) });
			else { const x = Number(node.getAttribute('x') || 0); const y = Number(node.getAttribute('y') || 0); const width = Number(node.getAttribute('width') || svgWidth); const height = Number(node.getAttribute('height') || svgHeight); colliders.push({ type: 'polygon', points: [{ x: toX(x), y: toY(y) }, { x: toX(x + width), y: toY(y) }, { x: toX(x + width), y: toY(y + height) }, { x: toX(x), y: toY(y + height) }] }); }
		});
		return colliders.filter((item) => item.points?.length > 2 || item.radius > 0);
	}
	function svgMarkup(tab) {
		const body = tab.elements.map((item) => {
			if (item.image) return `<image href="${item.image}" x="${item.x || 0}" y="${item.y || 0}" width="${item.width || 0}" height="${item.height || 0}" preserveAspectRatio="none"/>`;
			if (item.type === 'circle') return `<circle cx="${item.cx || 0}" cy="${item.cy || 0}" r="${item.r || 0}" fill="${item.fill}"/>`;
			if (item.type === 'polygon') return `<polygon points="${item.points || ''}" fill="${item.fill}"/>`;
			return `<rect x="${item.x || 0}" y="${item.y || 0}" width="${item.width || 0}" height="${item.height || 0}" rx="${item.rx || 0}" fill="${item.fill}"/>`;
		}).join('');
		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tab.width || 100} ${tab.height || 100}" width="${tab.width || 100}" height="${tab.height || 100}">${body}</svg>`;
	}
	function compileSvg(object) {
		const tab = getSvgTab(object); if (!tab) return;
		const image = new Image(); image.onload = () => { object._svgImage = image; renderPreview(); };
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource(tab))}`;
		object._svgImage = image;
		object.colliders = tab.source ? svgColliders(tab, object) : tab.elements.map((item) => {
			if (item.type === 'circle') return { type: 'circle', x: (Number(item.cx) / tab.width - .5) * object.width, y: (Number(item.cy) / tab.height - .5) * object.height, radius: Number(item.r) / tab.width * object.width };
			if (item.type === 'polygon') return { type: 'polygon', points: item.points.split(/\s+/).map((point) => point.split(',').map(Number)).filter((point) => point.length === 2).map(([x, y]) => ({ x: (x / tab.width - .5) * object.width, y: (y / tab.height - .5) * object.height })) };
			return { type: 'polygon', points: [{ x: (item.x / tab.width - .5) * object.width, y: (item.y / tab.height - .5) * object.height }, { x: ((Number(item.x) + Number(item.width)) / tab.width - .5) * object.width, y: (item.y / tab.height - .5) * object.height }, { x: ((Number(item.x) + Number(item.width)) / tab.width - .5) * object.width, y: ((Number(item.y) + Number(item.height)) / tab.height - .5) * object.height }, { x: (item.x / tab.width - .5) * object.width, y: ((Number(item.y) + Number(item.height)) / tab.height - .5) * object.height }] };
		}).filter((item) => item.points?.length > 2 || item.radius > 0);
	}
	function setCanvasSize(force = false) { const editedWidth = Math.max(1, Number($('canvas-width').value) || 960); const editedHeight = Math.max(1, Number($('canvas-height').value) || 540); const width = !force && startupExecuted && compiledCanvas ? compiledCanvas.width : editedWidth; const height = !force && startupExecuted && compiledCanvas ? compiledCanvas.height : editedHeight; canvas.width = width; canvas.height = height; canvas.style.setProperty('--canvas-ratio', `${width}/${height}`); $('canvas-size-label').textContent = `${width} × ${height}`; document.documentElement.style.setProperty('--canvas-ratio', `${width}/${height}`); }
	function getValue(editor, fallback) { return editor ? editor.getValue() : fallback.value; }
	function setValue(editor, fallback, value) { if (editor) editor.setValue(value || ''); else fallback.value = value || ''; }
	function syncPrograms() { if (!selected) return; selected.initialPrograms = getValue(initialEditor, $('initial-program')) ? [getValue(initialEditor, $('initial-program'))] : []; selected.programs = getValue(programEditor, $('program')) ? [getValue(programEditor, $('program'))] : []; }
	function syncEngine() { if (startupExecuted) return; engine.startupPrograms = getValue(engineInitialEditor, $('engine-initial-program')).trim() ? [getValue(engineInitialEditor, $('engine-initial-program'))] : []; engine.framePrograms = getValue(engineFrameEditor, $('engine-frame-program')).trim() ? [getValue(engineFrameEditor, $('engine-frame-program'))] : []; }
	function setupMonaco() {
		const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
		script.onload = () => { window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } }); window.require(['vs/editor/editor.main'], () => {
			const options = { language: 'javascript', theme: 'vs-dark', readOnly: false, domReadOnly: false, automaticLayout: true, minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on', padding: { top: 8, bottom: 8 }, scrollBeyondLastLine: false };
			programEditor = monaco.editor.create($('program-editor'), options); initialEditor = monaco.editor.create($('initial-program-editor'), options); engineInitialEditor = monaco.editor.create($('engine-initial-editor'), options); engineFrameEditor = monaco.editor.create($('engine-frame-editor'), options);
		      programEditor.onDidChangeModelContent(syncPrograms); initialEditor.onDidChangeModelContent(syncPrograms); engineInitialEditor.onDidChangeModelContent(syncEngine); engineFrameEditor.onDidChangeModelContent(syncEngine); [programEditor, initialEditor, engineInitialEditor, engineFrameEditor].forEach((editor) => editor.updateOptions({ readOnly: false, domReadOnly: false })); requestAnimationFrame(() => [programEditor, initialEditor, engineInitialEditor, engineFrameEditor].forEach((editor) => editor.layout()));
		}); }; script.onerror = () => document.body.classList.add('monaco-fallback'); document.head.append(script);
	}
	function escape(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
	function renderObjects() { const list = $('object-list'); list.replaceChildren(); const engineRow = document.createElement('button'); engineRow.className = `object-row engine-row${!selected ? ' selected' : ''}`; engineRow.innerHTML = '<strong>Engine</strong><span>Scene settings</span>'; engineRow.onclick = selectEngine; list.append(engineRow); templates.forEach((object) => { const row = document.createElement('button'); row.className = `object-row${object === selected ? ' selected' : ''}`; row.innerHTML = `<strong>${escape(object.tag[0] || object.id)}</strong><span>${escape(object.id)}</span>`; row.onclick = () => selectObject(object); row.oncontextmenu = (event) => { event.preventDefault(); contextTarget = object; showMenu(event); }; list.append(row); }); }
	function showMenu(event) { const menu = $('context-menu'); menu.hidden = false; menu.style.left = `${event.clientX}px`; menu.style.top = `${event.clientY}px`; }
	function selectEngine() { selected = null; $('engine-settings').hidden = false; $('object-settings').hidden = true; $('selection-label').textContent = 'Engineを選択中'; renderObjects(); }
	function selectObject(object) { if (!object) { selectEngine(); return; } if (selected && selected !== object) syncSvgEditor(getSvgTab(selected)); selected = object; $('engine-settings').hidden = true; $('object-settings').hidden = false; $('selection-label').textContent = `Object: ${object.id}`; $('object-id-label').textContent = object.id; $('object-id').value = object.id; $('tag').value = object.tag.join(', '); $('x').value = object.x; $('y').value = object.y; $('width').value = object.width; $('height').value = object.height; $('size').value = object.size; $('ghost').value = object.ghost; object.svg = object.svg || defaultSvg(); if (programEditor) { programEditor.setModel(programModels.get(object.id) || monaco.editor.createModel(object.programs[0] || '', 'javascript')); programModels.set(object.id, programEditor.getModel()); initialEditor.setModel(initialModels.get(object.id) || monaco.editor.createModel(object.initialPrograms[0] || '', 'javascript')); initialModels.set(object.id, initialEditor.getModel()); } else { $('program').value = object.programs[0] || ''; $('initial-program').value = object.initialPrograms[0] || ''; } renderSvgTabs(); compileSvg(object); renderObjects(); }
	function updateObject() { if (!selected) return; const id = $('object-id').value.trim(); if (!id || (id !== selected.id && templates.some((item) => item.id === id))) { $('program-error').textContent = 'IDは空欄にできず、重複もできません。'; return; } if (id !== selected.id) { const old = selected.id; engine.unregisterTemplate(old); selected.setId(id); engine.registerTemplate(selected); if (programModels.has(old)) { programModels.set(id, programModels.get(old)); programModels.delete(old); } if (initialModels.has(old)) { initialModels.set(id, initialModels.get(old)); initialModels.delete(old); } } selected.tag = $('tag').value.split(',').map((value) => value.trim()).filter(Boolean); selected.x = Number($('x').value) || 0; selected.y = Number($('y').value) || 0; selected.width = Math.max(1, Number($('width').value) || 10); selected.height = Math.max(1, Number($('height').value) || 10); selected.size = Math.max(0, Math.min(100, Number($('size').value) || 0)); selected.ghost = Math.max(0, Math.min(100, Number($('ghost').value) || 0)); syncPrograms(); compileSvg(selected); $('object-id-label').textContent = selected.id; $('selection-label').textContent = `Object: ${selected.id}`; renderObjects(); }
	function makeObject(source = null) { const spec = source ? source.getInfo() : { id: uniqueId('object'), tag: ['object'], x: 150, y: 120, width: 100, height: 70, color: '#ef8354', size: 100, ghost: 100, svg: defaultSvg() }; if (source) spec.id = uniqueId(`${source.id}_copy`); const object = new GameObject(spec); object.svg = clone(spec.svg || defaultSvg()); if (source) { object._svgImage = source._svgImage; object.programs = source.programs.slice(); object.initialPrograms = source.initialPrograms.slice(); } templates.push(object); engine.registerTemplate(object); selectObject(object); }
	function deleteObject(object) { if (!object) return; templates.splice(templates.indexOf(object), 1); engine.unregisterTemplate(object.id); programModels.get(object.id)?.dispose(); initialModels.get(object.id)?.dispose(); object.destroy(); selectObject(templates[0] || null); if (!templates.length) selectEngine(); }
	function renderSvgTabs() { const svg = selected.svg; const tabs = $('svg-tabs'); tabs.replaceChildren(); svg.tabs.forEach((tab) => { const button = document.createElement('div'); button.className = `svg-tab${tab.id === svg.activeTab ? ' active' : ''}`; button.innerHTML = `<span tabindex="0">${escape(tab.name)}</span><button type="button" aria-label="${escape(tab.name)} menu">⋯</button>`; const activate = () => { syncSvgEditor(); svg.activeTab = tab.id; renderSvgTabs(); renderSvgEditor(); compileSvg(selected); }; button.querySelector('span').onclick = activate; const menuButton = button.querySelector('button'); menuButton.onclick = (event) => { event.stopPropagation(); svgTarget = tab; showMenu(event); }; menuButton.oncontextmenu = (event) => { event.preventDefault(); event.stopPropagation(); svgTarget = tab; showMenu(event); }; tabs.append(button); }); renderSvgEditor(); }
	function renderSvgEditor() { const tab = getSvgTab(); if (!tab) return; $('svg-tab-name').value = tab.name || 'Untitled'; $('svg-tab-size').textContent = `${tab.width || 100} × ${tab.height || 100}`; $('svg-tab-name').oninput = (event) => { tab.name = event.target.value || 'Untitled'; renderSvgTabs(); }; ensureSvgEditor().then(() => loadSvgTab(tab)); }
	function addSvgTab(tab = null) { const svg = selected.svg; const next = tab || { id: `svg-${Date.now()}`, name: `SVG ${svg.tabs.length + 1}`, width: 100, height: 100, elements: [] }; next.width = Number(next.width) || 100; next.height = Number(next.height) || 100; next.id = `svg-${Date.now()}-${svg.tabs.length}`; svg.tabs.push(next); svg.activeTab = next.id; renderSvgTabs(); compileSvg(selected); }
	function importSvg(file) { const reader = new FileReader(); reader.onload = () => { const source = String(reader.result); const root = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement; addSvgTab({ id: `svg-${Date.now()}`, name: file.name.replace(/\.svg$/i, '') || 'Imported', width: Number(root.getAttribute('width')) || 100, height: Number(root.getAttribute('height')) || 100, elements: [], source }); }; reader.readAsText(file); }
	function importImage(file) { const reader = new FileReader(); reader.onload = () => { const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><image href="${reader.result}" x="0" y="0" width="100" height="100" preserveAspectRatio="none"/></svg>`; addSvgTab({ id: `svg-${Date.now()}`, name: file.name.replace(/\.[^.]+$/, '') || 'Image', width: 100, height: 100, elements: [], source }); }; reader.readAsDataURL(file); }
	function insertLocalImage(file) { const tab = getSvgTab(); if (!selected || !tab || !file) return; const reader = new FileReader(); reader.onload = () => { const bitmap = new Image(); bitmap.onload = () => { const documentSvg = new DOMParser().parseFromString(svgSource(tab), 'image/svg+xml'); const root = documentSvg.documentElement; const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number); const canvasWidth = viewBox[2] || Number(root.getAttribute('width')) || Number(tab.width) || 100; const canvasHeight = viewBox[3] || Number(root.getAttribute('height')) || Number(tab.height) || 100; const ratio = bitmap.naturalWidth / bitmap.naturalHeight || 1; let width = canvasWidth; let height = width / ratio; if (height > canvasHeight) { height = canvasHeight; width = height * ratio; } const image = documentSvg.createElementNS('http://www.w3.org/2000/svg', 'image'); image.setAttribute('href', reader.result); image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', reader.result); image.setAttribute('x', String((canvasWidth - width) / 2)); image.setAttribute('y', String((canvasHeight - height) / 2)); image.setAttribute('width', String(width)); image.setAttribute('height', String(height)); image.setAttribute('preserveAspectRatio', 'xMidYMid meet'); root.append(image); tab.source = new XMLSerializer().serializeToString(root); compileSvg(selected); loadSvgTab(tab); }; bitmap.src = reader.result; }; reader.readAsDataURL(file); }
	function clearRuntime() { engine.displays.slice().forEach((display) => { display.listObjects().forEach((object) => object.destroy()); display.delete(); }); }
	function runCode() { clearRuntime(); syncPrograms(); syncEngine(); compiledCanvas = { width: Math.max(1, Number($('canvas-width').value) || 960), height: Math.max(1, Number($('canvas-height').value) || 540) }; compiledRuntime = { engineInitial: getValue(engineInitialEditor, $('engine-initial-program')), engineFrame: getValue(engineFrameEditor, $('engine-frame-program')) }; engine.startupPrograms = compiledRuntime.engineInitial.trim() ? [compiledRuntime.engineInitial] : []; engine.framePrograms = compiledRuntime.engineFrame.trim() ? [compiledRuntime.engineFrame] : []; engine.clearCompiledTemplateSpecs(); setCanvasSize(true); try { engine.runStartupPrograms(); startupExecuted = true; $('engine-error').textContent = ''; $('runtime-state').textContent = 'RUNNING'; } catch (error) { startupExecuted = false; compiledRuntime = null; engine.clearCompiledTemplateSpecs(); compiledCanvas = null; $('engine-error').textContent = error.message; } }
	function runPrograms(dt) { if (!startupExecuted || !compiledRuntime) return; const scope = Object.fromEntries(engine.displays.map((display) => [display.name, display])); scope.INPUT = engine.public.INPUT; for (const display of engine.displays) for (const object of display.listObjects()) for (const source of object.programs) { try { new Function('self', 'display', 'engine', 'dt', 'INPUT', 'scope', `with(scope){${source}\n}`)(object, display, engine, dt, engine.public.INPUT, scope); } catch (error) { $('program-error').textContent = error.message; } } }
	function renderPreview() { if (!engine._running) { try { engine._renderFrame(); } catch (_) {} } }
	function saveProject() { syncEngine(); syncPrograms(); const data = { canvas: { width: Number($('canvas-width').value), height: Number($('canvas-height').value), transparent: $('canvas-transparent').checked }, engine: { initial: getValue(engineInitialEditor, $('engine-initial-program')), frame: getValue(engineFrameEditor, $('engine-frame-program')) }, templates: templates.map((object) => ({ info: object.getInfo(), svg: clone(object.svg), programs: object.programs, initialPrograms: object.initialPrograms })) }; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); link.download = 'project.json'; link.click(); URL.revokeObjectURL(link.href); }
	function loadProject() { const file = $('project-file').files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); templates.slice().forEach(deleteObject); $('canvas-width').value = data.canvas?.width || 960; $('canvas-height').value = data.canvas?.height || 540; $('canvas-transparent').checked = data.canvas?.transparent !== false; setCanvasSize(); setValue(engineInitialEditor, $('engine-initial-program'), data.engine?.initial); setValue(engineFrameEditor, $('engine-frame-program'), data.engine?.frame); (data.templates || []).forEach((item) => { const object = new GameObject(item.info); object.svg = item.svg || item.info.svg || defaultSvg(); object.programs = item.programs || []; object.initialPrograms = item.initialPrograms || []; templates.push(object); engine.registerTemplate(object); compileSvg(object); }); selectEngine(); } catch (error) { $('engine-error').textContent = error.message; } }; reader.readAsText(file); }
	$('new-object').onclick = () => makeObject(); $('delete-object').onclick = () => deleteObject(selected); $('duplicate-object').onclick = () => { if (svgTarget && selected) { addSvgTab(clone(svgTarget)); svgTarget = null; } else if (contextTarget) makeObject(contextTarget); $('context-menu').hidden = true; }; $('context-delete').onclick = () => { if (contextTarget) deleteObject(contextTarget); else if (svgTarget && selected && selected.svg.tabs.length > 1) { selected.svg.tabs = selected.svg.tabs.filter((tab) => tab !== svgTarget); selected.svg.activeTab = selected.svg.tabs[0]?.id; renderSvgTabs(); compileSvg(selected); } $('context-menu').hidden = true; }; document.addEventListener('click', () => $('context-menu').hidden = true);
	document.querySelectorAll('.main-tabs button').forEach((button) => button.onclick = () => { document.querySelectorAll('.main-tabs button').forEach((item) => item.classList.toggle('active', item === button)); document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab)); });
	$('add-svg-tab').onclick = () => selected && addSvgTab(); $('import-svg').onclick = () => $('svg-file').click(); $('insert-local-image').onclick = () => selected && $('local-image-file').click(); $('import-image').onclick = () => $('image-file').click(); $('svg-file').onchange = (event) => { if (event.target.files[0]) importSvg(event.target.files[0]); event.target.value = ''; }; $('local-image-file').onchange = (event) => { if (event.target.files[0]) insertLocalImage(event.target.files[0]); event.target.value = ''; }; $('image-file').onchange = (event) => { if (event.target.files[0]) importImage(event.target.files[0]); event.target.value = ''; };
	$('object-settings').oninput = updateObject; $('canvas-width').oninput = () => setCanvasSize(); $('canvas-height').oninput = () => setCanvasSize(); $('start').onclick = () => { if (!startupExecuted) runCode(); engine.start(); }; $('stop').onclick = () => { engine.stop(); $('runtime-state').textContent = 'STOPPED'; }; $('reset').onclick = () => { engine.stop(); clearRuntime(); startupExecuted = false; compiledRuntime = null; engine.clearCompiledTemplateSpecs(); compiledCanvas = null; setCanvasSize(true); $('runtime-state').textContent = 'READY'; }; $('debug').onclick = (event) => { debugEnabled = !debugEnabled; event.currentTarget.classList.toggle('active', debugEnabled); }; $('fullscreen').onclick = () => $('canvas-wrap').requestFullscreen?.(); $('save-project').onclick = saveProject; $('load-project').onclick = () => $('project-file').click(); $('project-file').onchange = loadProject;
	engine.onUpdate(runPrograms); engine.onRender(() => { if (debugEnabled) canvas.style.outline = '2px solid var(--cyan)'; }); setCanvasSize(); selectEngine(); setupMonaco();
})();
