import { GameObject } from "./engine.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function element(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.setAttribute("focusable", "false");
  node.setAttribute("tabindex", "-1");
  node.style.userSelect = "none";
  node.style.webkitUserSelect = "none";
  node.style.touchAction = "none";
  return node;
}

export class TextObject extends GameObject {
  constructor(text, overrides = {}) {
    super({
      x: 0,
      y: 0,
      text,
      fontSize: 24,
      fontFamily: "sans-serif",
      color: "#ffffff",
      anchor: "start",
      tags: ["text"],
      shapes: [],
    }, overrides);
  }
  createElement() {
    this.element = element("g");
    this.textElement = element("text", {
      x: 0,
      y: 0,
      fill: this.color,
      "font-size": this.fontSize,
      "font-family": this.fontFamily,
      "text-anchor": this.anchor,
      "dominant-baseline": this.baseline ?? "auto",
    });
    this.textElement.textContent = this.text;
    this.element.append(this.textElement);
    return this.element;
  }
  updateElement() {
    super.updateElement();
    if (!this.textElement) return;
    this.textElement.textContent = this.text;
    this.textElement.setAttribute("fill", this.color);
    this.textElement.setAttribute("font-size", this.fontSize);
  }
}

export class BarObject extends GameObject {
  constructor(overrides = {}) {
    super({
      x: 0,
      y: 0,
      width: 240,
      height: 24,
      value: 1,
      background: "#334155",
      fill: "#22c55e",
      radius: 8,
      tags: ["bar"],
      shapes: [],
    }, overrides);
  }
  createElement() {
    this.element = element("g");
    this.backgroundElement = element("rect", {
      x: 0, y: 0, width: this.width, height: this.height, rx: this.radius, fill: this.background,
    });
    this.fillElement = element("rect", {
      x: 0, y: 0, width: 0, height: this.height, rx: this.radius, fill: this.fill,
    });
    this.element.append(this.backgroundElement, this.fillElement);
    return this.element;
  }
  updateElement() {
    super.updateElement();
    if (!this.fillElement) return;
    const amount = Math.max(0, Math.min(1, Number(this.value) || 0));
    this.fillElement.setAttribute("width", this.width * amount);
    this.fillElement.setAttribute("fill", this.fill);
    this.backgroundElement.setAttribute("fill", this.background);
  }
}

export class ButtonObject extends GameObject {
  constructor(label, overrides = {}) {
    super({
      x: 0,
      y: 0,
      width: 180,
      height: 48,
      label,
      fontSize: 18,
      radius: 8,
      color: "#ffffff",
      background: "#2563eb",
      hoverBackground: "#3b82f6",
      pressedBackground: "#1d4ed8",
      shadow: true,
      hoverScale: 1.04,
      hoverLift: -2,
      hoverDuration: 0.12,
      onClick: null,
      tags: ["button"],
      shapes: [],
    }, overrides);
    this.hovered = false;
    this.pressed = false;
    this._hoverAmount = 0;
  }
  createElement() {
    this.element = element("g", { "role": "button", "aria-label": this.label });
    if (this.shadow) {
      this.shadowElement = element("rect", {
        x: 0, y: 4, width: this.width, height: this.height, rx: this.radius, fill: "#000000", opacity: .32,
      });
      this.element.append(this.shadowElement);
    }
    this.backgroundElement = element("rect", {
      x: 0, y: 0, width: this.width, height: this.height, rx: this.radius, fill: this.background,
      "pointer-events": "all",
    });
    this.labelElement = element("text", {
      x: this.width / 2, y: this.height / 2, fill: this.color, "font-size": this.fontSize,
      "font-family": "sans-serif", "text-anchor": "middle", "dominant-baseline": "central",
      "pointer-events": "none",
    });
    this.labelElement.textContent = this.label;
    this.element.append(this.backgroundElement, this.labelElement);
    return this.element;
  }
  onStart() {
    this.element.addEventListener("pointerenter", () => { this.hovered = true; });
    this.element.addEventListener("pointerleave", () => { this.hovered = false; this.pressed = false; });
    this.element.addEventListener("pointerdown", () => { this.pressed = true; });
    this.element.addEventListener("pointerup", () => {
      if (this.pressed && this.onClick) this.onClick.call(this, this);
      this.pressed = false;
    });
  }
  updateElement(dt = this.engine?.dt ?? 0) {
    super.updateElement();
    if (!this.backgroundElement) return;
    const target = this.hovered ? 1 : 0;
    const duration = Math.max(.001, this.hoverDuration);
    this._hoverAmount += (target - this._hoverAmount) * Math.min(1, dt / duration);
    const scale = 1 + (this.hoverScale - 1) * this._hoverAmount;
    const lift = this.hoverLift * this._hoverAmount;
    this.element.setAttribute("transform", `translate(${this.x} ${this.y + lift}) scale(${scale})`);
    this.backgroundElement.setAttribute("fill", this.pressed ? this.pressedBackground : (this.hovered ? this.hoverBackground : this.background));
    this.labelElement.textContent = this.label;
    this.labelElement.setAttribute("fill", this.color);
    if (this.shadowElement) this.shadowElement.setAttribute("display", this.shadow ? "inline" : "none");
  }
}
