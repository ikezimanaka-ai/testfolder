class CanvasElement {
  constructor({x=0, y=0, width=0, height=0, visible=true} = {}) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.visible = visible;
  }

  containsPoint(x, y) {
    return this.visible && x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
  }

  draw() {}
}

class CanvasPanel extends CanvasElement {
  constructor(spec = {}) {
    super(spec);
    this.color = spec.color || "rgba(0, 0, 0, 0.45)";
    this.borderColor = spec.borderColor || "transparent";
    this.borderWidth = spec.borderWidth || 0;
  }

  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    if (this.borderWidth > 0) {
      ctx.strokeStyle = this.borderColor;
      ctx.lineWidth = this.borderWidth;
      ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
    ctx.restore();
  }
}

class CanvasLabel extends CanvasElement {
  constructor(spec = {}) {
    super(spec);
    this.text = spec.text || "";
    this.color = spec.color || "white";
    this.font = spec.font || "16px sans-serif";
    this.baseline = spec.baseline || "alphabetic";
  }

  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.font = this.font;
    ctx.textBaseline = this.baseline;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

class CanvasButton extends CanvasElement {
  constructor(spec = {}) {
    super(spec);
    this.text = spec.text || "Button";
    this.font = spec.font || "bold 16px sans-serif";
    this.color = spec.color || "#126782";
    this.hoverColor = spec.hoverColor || "#1783a5";
    this.pressedColor = spec.pressedColor || "#0d4d62";
    this.textColor = spec.textColor || "white";
    this.borderColor = spec.borderColor || "transparent";
    this.borderWidth = spec.borderWidth || 0;
    this.onClick = typeof spec.onClick === "function" ? spec.onClick : null;
    this.hovered = false;
    this.pressed = false;
  }

  pointerMove(x, y) {
    this.hovered = this.containsPoint(x, y);
  }

  pointerDown(x, y) {
    if (!this.containsPoint(x, y)) return false;
    this.pressed = true;
    return true;
  }

  pointerUp(x, y) {
    const wasPressed = this.pressed;
    this.pressed = false;
    if (wasPressed && this.containsPoint(x, y) && this.onClick) this.onClick(this);
    return wasPressed;
  }

  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.fillStyle = this.pressed ? this.pressedColor : (this.hovered ? this.hoverColor : this.color);
    ctx.fillRect(this.x, this.y, this.width, this.height);
    if (this.borderWidth > 0) {
      ctx.strokeStyle = this.borderColor;
      ctx.lineWidth = this.borderWidth;
      ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
    ctx.fillStyle = this.textColor;
    ctx.font = this.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);
    ctx.restore();
  }
}

class CanvasUI {
  constructor() {
    this.elements = [];
  }

  add(element) {
    if (!(element instanceof CanvasElement)) throw new TypeError("CanvasUI element is required");
    this.elements.push(element);
    return element;
  }

  draw(ctx) {
    for (const element of this.elements) element.draw(ctx);
  }

  toLocalPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height
    };
  }

  bindTo(canvas) {
    const move = event => {
      const point = this.toLocalPoint(event, canvas);
      this.pointerMove(point.x, point.y);
    };
    const down = event => {
      const point = this.toLocalPoint(event, canvas);
      this.pointerDown(point.x, point.y);
    };
    const up = event => {
      const point = this.toLocalPoint(event, canvas);
      this.pointerUp(point.x, point.y);
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
    };
  }

  pointerMove(x, y) {
    for (const element of this.elements) {
      if (typeof element.pointerMove === "function") element.pointerMove(x, y);
    }
  }

  pointerDown(x, y) {
    for (let index = this.elements.length - 1; index >= 0; index -= 1) {
      const element = this.elements[index];
      if (typeof element.pointerDown === "function" && element.pointerDown(x, y)) return element;
    }
    return null;
  }

  pointerUp(x, y) {
    for (let index = this.elements.length - 1; index >= 0; index -= 1) {
      const element = this.elements[index];
      if (typeof element.pointerUp === "function" && element.pointerUp(x, y)) return element;
    }
    return null;
  }
}

if (typeof window !== "undefined") window.CanvasUI = { CanvasElement, CanvasPanel, CanvasLabel, CanvasButton, CanvasUI };
if (typeof module !== "undefined") module.exports = { CanvasElement, CanvasPanel, CanvasLabel, CanvasButton, CanvasUI };
