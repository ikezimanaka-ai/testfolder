const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(type, attributes = {}) {
  const element = document.createElementNS(SVG_NS, type);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function cleanSvg(source) {
  const documentValue = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentValue.querySelector("parsererror") || documentValue.documentElement.localName !== "svg") {
    throw new Error("有効なSVGファイルではありません。");
  }
  documentValue.querySelectorAll("script, foreignObject, style").forEach((node) => node.remove());
  for (const node of [documentValue.documentElement, ...documentValue.querySelectorAll("*")]) {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) ||
          (/^(href|xlink:href)$/i.test(attribute.name) && !/^\s*(?:#|data:image\/)/i.test(attribute.value)) ||
          (attribute.name === "style" && /url\s*\(|@import/i.test(attribute.value))) {
        node.removeAttribute(attribute.name);
      }
    }
  }
  return documentValue.documentElement;
}

export function sanitizeSvgSource(source) {
  return new XMLSerializer().serializeToString(cleanSvg(source));
}

export class SVGAssetEditor {
  constructor(root, { onChange = () => {}, onSelection = () => {}, onAssetRename = () => {}, onAssetDelete = () => {} } = {}) {
    this.root = root;
    this.onChange = onChange;
    this.onSelection = onSelection;
    this.onAssetRename = onAssetRename;
    this.onAssetDelete = onAssetDelete;
    this.tool = "select";
    this.width = 640;
    this.height = 360;
    this.elements = [];
    this.selectedId = null;
    this.history = [];
    this.future = [];
    this.pointerAction = null;
    this.polygonPoints = [];
    this._renderArtboard();
    this._bindToolbar();
    this._bindSourceButton();
  }

  _renderArtboard() {
    this.root.replaceChildren();
    this.svg = createSvgElement("svg", {
      xmlns: SVG_NS, viewBox: `0 0 ${this.width} ${this.height}`,
      width: this.width, height: this.height, class: "svg-artboard",
      role: "application", "aria-label": "SVGアセットアートボード",
    });
    this.svg.style.aspectRatio = `${this.width} / ${this.height}`;
    this.root.append(this.svg);
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this._fitArtboard());
    this.resizeObserver.observe(this.root);
    this._fitArtboard();
    this.svg.addEventListener("pointerdown", (event) => this._pointerDown(event));
    this.svg.addEventListener("pointermove", (event) => this._pointerMove(event));
    this.svg.addEventListener("pointerup", (event) => this._pointerUp(event));
    this.svg.addEventListener("dblclick", (event) => {
      if (this.tool === "polygon" && this.polygonPoints.length >= 3) this._finishPolygon();
      event.preventDefault();
    });
    this._renderElements();
  }

  _bindToolbar() {
    document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("active", item === button));
      this.tool = button.dataset.tool;
      this.polygonPoints = [];
      this.svg.style.cursor = this.tool === "select" ? "default" : "crosshair";
    }));
    document.querySelector("#svg-undo")?.addEventListener("click", () => this.undo());
    document.querySelector("#svg-redo")?.addEventListener("click", () => this.redo());
    document.querySelector("#svg-source")?.addEventListener("click", () => this.showSource());
  }

  _bindSourceButton() {
    this.properties = document.querySelector("#svg-properties");
    this._renderProperties();
  }

  _point(event) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(this.svg.getScreenCTM().inverse());
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }

  _fitArtboard() {
    if (!this.svg) return;
    const availableWidth = Math.max(1, this.root.clientWidth - 24);
    const availableHeight = Math.max(1, this.root.clientHeight - 24);
    const scale = Math.min(1, availableWidth / this.width, availableHeight / this.height);
    this.svg.style.width = `${this.width * scale}px`;
    this.svg.style.height = `${this.height * scale}px`;
  }

  _pointerDown(event) {
    if (event.button !== 0) return;
    const point = this._point(event);
    if (this.tool === "select") {
      if (event.target.closest?.("[data-resize-handle]")) {
        const record = this._selected();
        const box = this._selectedNode()?.getBBox();
        if (record && box) {
          this.pointerAction = { type: "resize", start: point, original: this._copy(record), snapshot: this._snapshot(), box };
          this.svg.setPointerCapture(event.pointerId);
          event.preventDefault();
        }
        return;
      }
      const node = event.target.closest?.("[data-svg-id]");
      if (!node || !this.svg.contains(node)) {
        this.select(null);
        return;
      }
      this.select(node.dataset.svgId);
      this.pointerAction = { type: "move", start: point, original: this._copy(this._selected()), snapshot: this._snapshot(), moved: false };
      this.svg.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (this.tool === "polygon") {
      this.polygonPoints.push(point);
      this._drawPolygonPreview();
      return;
    }
    if (this.tool === "text") {
      this._create("text", { x: point.x, y: point.y, text: "文字", "font-size": 24, fill: "#111827" });
      return;
    }
    this.pointerAction = { type: "draw", shapeType: this.tool, start: point, current: point };
    this.svg.setPointerCapture(event.pointerId);
  }

  _pointerMove(event) {
    if (!this.pointerAction) return;
    const point = this._point(event);
    const action = this.pointerAction;
    action.current = point;
    if (action.type === "resize") {
      const record = this._selected();
      if (record) {
        action.moved = true;
        const sx = Math.max(.05, (point.x - action.box.x) / Math.max(1, action.box.width));
        const sy = Math.max(.05, (point.y - action.box.y) / Math.max(1, action.box.height));
        const prior = action.original.attributes.transform || "";
        record.attributes.transform = `translate(${action.box.x} ${action.box.y}) scale(${sx} ${sy}) translate(${-action.box.x} ${-action.box.y})${prior ? ` ${prior}` : ""}`;
        this._renderElements();
        this.select(this.selectedId);
      }
    } else if (action.type === "move") {
      const dx = point.x - action.start.x;
      const dy = point.y - action.start.y;
      if (dx || dy) action.moved = true;
      this._applyMove(this._selected(), action.original, dx, dy);
      this._renderElements();
      this.select(this.selectedId);
    } else {
      this._drawPreview(action);
    }
  }

  _pointerUp() {
    const action = this.pointerAction;
    if (!action) return;
    this.pointerAction = null;
    if (action.type === "move" || action.type === "resize") {
      if (action.moved) {
        this.history.push(action.snapshot);
        if (this.history.length > 100) this.history.shift();
        this.future = [];
        this._changed();
      }
      return;
    }
    const shape = this._shapeForAction(action);
    if (shape) this._create(action.shapeType, shape);
    this.preview?.remove();
  }

  _shapeForAction(action) {
    const { start, current, shapeType } = action;
    if (shapeType === "line") return { x1: start.x, y1: start.y, x2: current.x, y2: current.y, stroke: "#111827", "stroke-width": 3 };
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(current.x - start.x);
    const height = Math.abs(current.y - start.y);
    if (width < 2 && height < 2) return null;
    if (shapeType === "circle") return { cx: start.x, cy: start.y, r: Math.round(Math.hypot(current.x - start.x, current.y - start.y)), fill: "#38bdf8" };
    if (shapeType === "ellipse") return { cx: Math.round((start.x + current.x) / 2), cy: Math.round((start.y + current.y) / 2), rx: Math.round(width / 2), ry: Math.round(height / 2), fill: "#38bdf8" };
    return { x, y, width, height, ...(shapeType === "roundRect" ? { rx: 12 } : {}), fill: "#38bdf8" };
  }

  _drawPreview(action) {
    this.preview?.remove();
    const shape = this._shapeForAction(action);
    if (!shape) return;
    const type = action.shapeType === "roundRect" ? "rect" : action.shapeType;
    this.preview = createSvgElement(type, { ...shape, opacity: .55, "pointer-events": "none" });
    this.preview.classList.add("svg-preview");
    this.svg.append(this.preview);
  }

  _drawPolygonPreview() {
    this.polygonPreview?.remove();
    if (this.polygonPoints.length < 1) return;
    this.polygonPreview = createSvgElement("polyline", {
      points: this.polygonPoints.map(({ x, y }) => `${x},${y}`).join(" "),
      fill: "none", stroke: "#2563eb", "stroke-width": 2,
      "stroke-dasharray": "5 3", "pointer-events": "none",
    });
    this.svg.append(this.polygonPreview);
  }

  _finishPolygon() {
    this._create("polygon", {
      points: this.polygonPoints.map(({ x, y }) => `${x},${y}`).join(" "),
      fill: "#38bdf8", stroke: "#0f172a", "stroke-width": 2,
    });
    this.polygonPoints = [];
    this.polygonPreview?.remove();
  }

  _create(type, attributes) {
    if (type === "polygon" && this.polygonPoints.length < 3) return;
    const id = `svg-${crypto.randomUUID()}`;
    this._commitHistory();
    this.elements.push({ id, type: type === "roundRect" ? "rect" : type, attributes });
    this.select(id);
    this._renderElements();
    this._changed();
  }

  _elementFromRecord(record) {
    const attributes = { ...record.attributes, "data-svg-id": record.id };
    if (record.type === "text") {
      const element = createSvgElement("text", { ...attributes, "font-size": attributes["font-size"] || 24, fill: attributes.fill || "#111827" });
      element.textContent = attributes.text ?? "";
      element.removeAttribute("text");
      return element;
    }
    return createSvgElement(record.type, attributes);
  }

  _renderElements() {
    this.svg.replaceChildren(...this.elements.map((record) => this._elementFromRecord(record)));
    this._renderSelection();
    this._renderProperties();
  }

  _renderSelection() {
    this.svg.querySelectorAll("[data-svg-id]").forEach((element) => element.classList.toggle("svg-selected", element.dataset.svgId === this.selectedId));
    this.svg.querySelector("[data-selection-overlay]")?.remove();
    const selectedNode = this._selectedNode();
    if (!selectedNode) return;
    try {
      const box = selectedNode.getBBox();
      if (!box.width && !box.height) return;
      const overlay = createSvgElement("g", { "data-selection-overlay": "", "pointer-events": "none" });
      overlay.append(createSvgElement("rect", {
        x: box.x, y: box.y, width: box.width, height: box.height,
        fill: "none", stroke: "#2563eb", "stroke-dasharray": "4 3", "stroke-width": 1.5,
      }));
      const handle = createSvgElement("circle", {
        cx: box.x + box.width, cy: box.y + box.height, r: 7,
        fill: "#fff", stroke: "#2563eb", "stroke-width": 2,
        "data-resize-handle": this.selectedId, "pointer-events": "all",
      });
      handle.style.cursor = "nwse-resize";
      handle.style.pointerEvents = "all";
      overlay.append(handle);
      this.svg.append(overlay);
    } catch {
      return;
    }
  }

  _selected() { return this.elements.find((item) => item.id === this.selectedId) ?? null; }
  _selectedNode() { return this.svg.querySelector(`[data-svg-id="${CSS.escape(this.selectedId || "")}"]`); }
  _copy(value) { return value ? structuredClone(value) : null; }

  _applyMove(record, original, dx, dy) {
    if (!record || !original) return;
    record.attributes = { ...original.attributes };
    const attrs = record.attributes;
    if (record.type === "rect" || record.type === "image" || record.type === "text") {
      attrs.x = Number(attrs.x || 0) + dx;
      attrs.y = Number(attrs.y || 0) + dy;
    } else if (record.type === "circle") {
      attrs.cx = Number(attrs.cx || 0) + dx;
      attrs.cy = Number(attrs.cy || 0) + dy;
    } else if (record.type === "ellipse") {
      attrs.cx = Number(attrs.cx || 0) + dx;
      attrs.cy = Number(attrs.cy || 0) + dy;
    } else if (record.type === "line") {
      attrs.x1 = Number(attrs.x1 || 0) + dx;
      attrs.y1 = Number(attrs.y1 || 0) + dy;
      attrs.x2 = Number(attrs.x2 || 0) + dx;
      attrs.y2 = Number(attrs.y2 || 0) + dy;
    } else if (record.type === "polygon" || record.type === "polyline") {
      attrs.points = String(attrs.points || "").split(/\s+/).map((pair) => {
        const [x, y] = pair.split(",").map(Number);
        return `${x + dx},${y + dy}`;
      }).join(" ");
    }
  }

  select(id) {
    this.selectedId = id;
    this._renderSelection();
    this._renderProperties();
    this.onSelection(this._selected());
  }

  _renderProperties() {
    if (!this.properties) return;
    const selected = this._selected();
    const wrapper = document.createElement("div");
    wrapper.className = "property-form";
    if (this.currentAsset) {
      const name = document.createElement("input");
      name.type = "text";
      name.value = this.currentAsset.name;
      name.setAttribute("aria-label", "SVGアセット名");
      name.className = "wide";
      name.addEventListener("change", () => this.onAssetRename(name.value));
      const deleteAsset = document.createElement("button");
      deleteAsset.type = "button";
      deleteAsset.textContent = "このSVGアセットを削除";
      deleteAsset.className = "wide";
      deleteAsset.addEventListener("click", (event) => {
        if (this.pendingAssetDelete === this.currentAsset) {
          this.onAssetDelete(this.currentAsset);
          return;
        }
        this.pendingAssetDelete = this.currentAsset;
        deleteAsset.textContent = "もう一度押すと削除";
        setTimeout(() => {
          if (this.pendingAssetDelete === this.currentAsset) {
            this.pendingAssetDelete = null;
            this._renderProperties();
          }
        }, 3000);
      });
      wrapper.append(name, deleteAsset);
    }
    if (!selected) {
      const hint = document.createElement("p");
      hint.className = "muted wide";
      hint.textContent = "SVG図形を選択すると属性を編集できます。";
      wrapper.append(hint);
    } else {
      const geometry = this._geometryKeys(selected);
      const heading = document.createElement("h3");
      heading.className = "wide";
      heading.textContent = selected.type;
      wrapper.append(heading);
      for (const key of geometry) this._addField(wrapper, key, selected.attributes[key] ?? 0, "number");
      for (const [key, value] of Object.entries({ fill: "#38bdf8", stroke: "#0f172a", "stroke-width": 2, opacity: 1 })) {
        this._addField(wrapper, key, selected.attributes[key] ?? value, key === "fill" || key === "stroke" ? "color" : "number");
      }
      if (selected.type === "text") {
        this._addField(wrapper, "text", selected.attributes.text || "", "text", true);
        this._addField(wrapper, "font-size", selected.attributes["font-size"] ?? 24, "number");
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "wide";
      remove.textContent = "選択図形を削除";
      remove.addEventListener("click", () => this.removeSelected());
      wrapper.append(remove);
      const order = document.createElement("div");
      order.className = "wide toolbar";
      order.append(this._actionButton("前面へ", () => this._changeOrder(1)), this._actionButton("背面へ", () => this._changeOrder(-1)));
      wrapper.append(order);
    }
    const layersTitle = document.createElement("h3");
    layersTitle.className = "wide";
    layersTitle.textContent = "レイヤー";
    wrapper.append(layersTitle);
    [...this.elements].reverse().forEach((record) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "wide";
      row.textContent = `${record.type} · ${record.id.slice(-6)}`;
      row.classList.toggle("active", record.id === this.selectedId);
      row.addEventListener("click", () => this.select(record.id));
      wrapper.append(row);
    });
    this.properties.replaceChildren(wrapper);
  }

  _geometryKeys(record) {
    if (record.type === "rect") return ["x", "y", "width", "height", "rx"];
    if (record.type === "circle") return ["cx", "cy", "r"];
    if (record.type === "ellipse") return ["cx", "cy", "rx", "ry"];
    if (record.type === "line") return ["x1", "y1", "x2", "y2"];
    if (record.type === "polygon") return [];
    return ["x", "y"];
  }

  _addField(container, key, value, type, wide = false) {
    const label = document.createElement("label");
    label.textContent = key;
    if (wide) label.classList.add("wide");
    const input = document.createElement("input");
    input.type = type;
    input.value = value;
    input.addEventListener("change", () => {
      this._commitHistory();
      const result = this._selected();
      if (!result) return;
      result.attributes[key] = type === "number" ? Number(input.value) : input.value;
      this._renderElements();
      this._changed();
    });
    label.append(input);
    container.append(label);
  }

  _actionButton(text, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
  }

  _changeOrder(direction) {
    const index = this.elements.findIndex((record) => record.id === this.selectedId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= this.elements.length) return;
    this._commitHistory();
    [this.elements[index], this.elements[next]] = [this.elements[next], this.elements[index]];
    this._renderElements();
    this._changed();
  }

  removeSelected() {
    if (!this.selectedId) return;
    this._commitHistory();
    this.elements = this.elements.filter((item) => item.id !== this.selectedId);
    this.select(null);
    this._renderElements();
    this._changed();
  }

  _commitHistory() {
    this.history.push(this._snapshot());
    if (this.history.length > 100) this.history.shift();
    this.future = [];
  }

  _snapshot() {
    return JSON.stringify({ width: this.width, height: this.height, elements: this.elements });
  }

  undo() {
    if (!this.history.length) return;
    this.future.push(JSON.stringify({ width: this.width, height: this.height, elements: this.elements }));
    this._restore(this.history.pop());
  }

  redo() {
    if (!this.future.length) return;
    this.history.push(JSON.stringify({ width: this.width, height: this.height, elements: this.elements }));
    this._restore(this.future.pop());
  }

  _restore(state) {
    const parsed = JSON.parse(state);
    this.width = parsed.width;
    this.height = parsed.height;
    this.elements = parsed.elements;
    if (!this.elements.some((item) => item.id === this.selectedId)) this.selectedId = null;
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute("width", this.width);
    this.svg.setAttribute("height", this.height);
    this.svg.style.aspectRatio = `${this.width} / ${this.height}`;
    this._fitArtboard();
    this._renderElements();
    this._changed();
  }

  _changed() {
    this.onChange({ width: this.width, height: this.height, svg: this.getSVG() });
  }

  getSVG() {
    const result = createSvgElement("svg", { xmlns: SVG_NS, viewBox: `0 0 ${this.width} ${this.height}`, width: this.width, height: this.height });
    for (const record of this.elements) {
      const element = this._elementFromRecord(record);
      element.removeAttribute("data-svg-id");
      element.classList.remove("svg-selected");
      result.append(element);
    }
    return new XMLSerializer().serializeToString(result);
  }

  load(source) {
    const svg = cleanSvg(source);
    const viewBox = (svg.getAttribute("viewBox") || `0 0 ${svg.getAttribute("width") || 640} ${svg.getAttribute("height") || 360}`).split(/[ ,]+/).map(Number);
    this.width = Math.max(1, viewBox[2] || 640);
    this.height = Math.max(1, viewBox[3] || 360);
    this.elements = [...svg.children].map((element, index) => {
      const attributes = Object.fromEntries([...element.attributes]
        .filter((attribute) => attribute.name !== "xmlns" && attribute.name !== "data-svg-id")
        .map(({ name, value }) => [name, value]));
      if (element.localName === "text") attributes.text = element.textContent || "";
      return { id: `svg-${crypto.randomUUID()}-${index}`, type: element.localName, attributes };
    }).filter(({ type }) => ["rect", "circle", "ellipse", "line", "polygon", "polyline", "text"].includes(type));
    this.selectedId = null;
    this._renderArtboard();
    this._changed();
  }

  clear() {
    this.currentAsset = null;
    this.elements = [];
    this.selectedId = null;
    this.history = [];
    this.future = [];
    this._renderArtboard();
  }

  showSource() {
    const dialog = document.createElement("dialog");
    const pre = document.createElement("pre");
    pre.textContent = this.getSVG();
    const copy = this._actionButton("コードをコピー", async () => {
      try {
        await navigator.clipboard.writeText(this.getSVG());
        copy.textContent = "コピーしました";
      } catch (error) {
        pre.textContent = `${this.getSVG()}\n\nクリップボードへコピーできませんでした: ${error.message}`;
      }
    });
    const close = this._actionButton("閉じる", () => dialog.close());
    const content = document.createElement("div");
    content.className = "source-dialog";
    content.append(pre, copy, close);
    dialog.append(content);
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  setTool(tool) { this.tool = tool; }
}
