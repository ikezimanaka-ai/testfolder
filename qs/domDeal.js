class Deal {
  constructor(id_dom) {
    // "id_dom::'dom|.class|#id'"
    if (typeof id_dom === "string") {
      if (id_dom.includes("|")) {
        const doms = id_dom.split("|");
        let target = document;
        for (const d of doms) {
          if (d.startsWith("#")) {
            target = document.getElementById(d.substring(1));
          } else if (d.startsWith(".")) {
            target = document.querySelector("." + d.substring(1));
          } else {
            target = document.querySelector(d);
          }
        }
        this.element = target;
      } else {
        this.element = document.getElementById(id_dom);
      }
    } else {
      this.element = id_dom;
    }
  }

  exists() {
    alert(this.element ? "Element exists." : "Element does not exist.");
  }

  CE(tag, options = {}) {
    const el = document.createElement(tag);
    
    if (options.id) el.id = options.id;
    if (options.class) el.className = options.class;
    if (options.text) el.textContent = options.text;
    if (options.html) el.innerHTML = options.html;
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, value]) => {
        el.setAttribute(key, value);
      });
    }
    if (options.styles) {
      Object.entries(options.styles).forEach(([key, value]) => {
        el.style[key] = value;
      });
    }
    
    if (options.children && Array.isArray(options.children)) {
      options.children.forEach(child => {
        if (typeof child === "string") {
          el.appendChild(document.createTextNode(child));
        } else {
          el.appendChild(child);
        }
      });
    }
    
    if (options.append !== false) {
      this.element.appendChild(el);
    }
    
    return el;
  }

  CCE(selector, tag, options = {}) {
    const target = this._getElement(selector);
    if (!target) return null;
    
    const el = document.createElement(tag);
    this._applyOptions(el, options);
    
    if (options.append !== false) {
      target.appendChild(el);
    }
    
    return el;
  }

  CCEAll(selector, tag, options = {}) {
    const targets = this._getElements(selector);
    if (!targets || targets.length === 0) return [];
    
    return targets.map(target => {
      const el = document.createElement(tag);
      this._applyOptions(el, options);
      
      if (options.append !== false) {
        target.appendChild(el);
      }
      
      return el;
    });
  }

  // 要素内容を取得
  GET(selector) {
    const target = this._getElement(selector);
    if (!target) return null;
    
    return {
      tag: target.tagName.toLowerCase(),
      id: target.id || null,
      class: target.className || null,
      text: target.textContent,
      html: target.innerHTML,
      attributes: Array.from(target.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {})
    };
  }

  // 要素の内容を変更
  SET(selector, options = {}) {
    const target = this._getElement(selector);
    if (!target) return null;
    
    this._applyOptions(target, options);
    return target;
  }

  // セレクタ自体を改変
  MODIFY(selector, options = {}) {
    return this.SET(selector, options);
  }

  // 関連要素を取得
  RELATED(selector, relation = "children") {
    const target = this._getElement(selector);
    if (!target) return null;
    
    switch (relation.toLowerCase()) {
      case "parent":
      case "p":
        return target.parentElement;
      case "parents":
      case "pp":
        return Array.from(target.parentElement ? [target.parentElement] : []);
      case "children":
      case "c":
        return Array.from(target.children);
      case "child":
        return target.firstElementChild;
      case "siblings":
      case "s":
        return Array.from(target.parentElement?.children || []).filter(el => el !== target);
      case "sibling":
        return target.nextElementSibling;
      case "prev-sibling":
        return target.previousElementSibling;
      default:
        return null;
    }
  }

  // セレクタで親・兄弟・子を指定（"selector>>parent"）
  _parseRelation(selector) {
    if (selector.includes(">>")) {
      const [sel, relation] = selector.split(">>");
      return { selector: sel.trim(), relation: relation.trim() };
    }
    return { selector, relation: null };
  }

  // セレクタから単一要素を取得
  _getElement(selector) {
    const { selector: sel, relation } = this._parseRelation(selector);
    
    let target = this._resolveSelector(sel);
    
    if (target && relation) {
      target = this.RELATED(sel, relation);
    }
    
    return target;
  }

  // セレクタから複数要素を取得
  _getElements(selector) {
    const { selector: sel, relation } = this._parseRelation(selector);
    
    if (sel.includes("|")) {
      const doms = sel.split("|");
      let target = document;
      for (const d of doms) {
        if (d.startsWith("#")) {
          target = document.getElementById(d.substring(1));
        } else if (d.startsWith(".")) {
          target = target.querySelector("." + d.substring(1));
        } else {
          target = target.querySelector(d);
        }
        if (!target) return [];
      }
      
      let results = [];
      if (relation) {
        const related = this.RELATED(sel, relation);
        results = Array.isArray(related) ? related : (related ? [related] : []);
      } else {
        results = [target];
      }
      return results;
    } else {
      if (sel.startsWith(".")) {
        return Array.from(document.querySelectorAll("." + sel.substring(1)));
      } else if (sel.startsWith("#")) {
        const el = document.getElementById(sel.substring(1));
        return el ? [el] : [];
      } else {
        return Array.from(document.querySelectorAll(sel));
      }
    }
  }

  // セレクタを解決
  _resolveSelector(selector) {
    if (selector.includes("|")) {
      const doms = selector.split("|");
      let target = document;
      for (const d of doms) {
        if (d.startsWith("#")) {
          target = document.getElementById(d.substring(1));
        } else if (d.startsWith(".")) {
          target = target.querySelector("." + d.substring(1));
        } else {
          target = target.querySelector(d);
        }
        if (!target) return null;
      }
      return target;
    } else if (selector.startsWith("#")) {
      return document.getElementById(selector.substring(1));
    } else if (selector.startsWith(".")) {
      return document.querySelector("." + selector.substring(1));
    } else {
      return document.querySelector(selector);
    }
  }

  // オプションを要素に適用
  _applyOptions(el, options) {
    if (options.id) el.id = options.id;
    if (options.class) el.className = options.class;
    if (options.text) el.textContent = options.text;
    if (options.html) el.innerHTML = options.html;
    if (options.attrs) {
      Object.entries(options.attrs).forEach(([key, value]) => {
        el.setAttribute(key, value);
      });
    }
    if (options.styles) {
      Object.entries(options.styles).forEach(([key, value]) => {
        el.style[key] = value;
      });
    }
    if (options.children && Array.isArray(options.children)) {
      options.children.forEach(child => {
        if (typeof child === "string") {
          el.appendChild(document.createTextNode(child));
        } else {
          el.appendChild(child);
        }
      });
    }
  }
}