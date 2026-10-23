import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { addEventListener() {} };
const { CanvasScrollArea } = await import('./ui-objects.js');

test('CanvasScrollArea scrolls within its content bounds', () => {
  const area = new CanvasScrollArea({ x: 10, y: 20, width: 100, height: 50, contentHeight: 120 });
  let prevented = false;
  assert.equal(area.maxOffset, 70);
  assert.equal(area.contains({ x: 20, y: 30 }), true);
  assert.equal(area.contains({ x: 120, y: 30 }), false);
  assert.equal(area.handleWheel({ deltaY: 30, preventDefault() { prevented = true; } }, { x: 20, y: 30 }), true);
  assert.equal(prevented, true);
  assert.equal(area.offset, 30);
  assert.equal(area.scrollBy(100), true);
  assert.equal(area.offset, 70);
  assert.equal(area.scrollBy(-100), true);
  assert.equal(area.offset, 0);
});

test('CanvasScrollArea clips content and draws a scrollbar when needed', () => {
  const area = new CanvasScrollArea({ x: 5, y: 8, width: 80, height: 40, contentHeight: 100 });
  const calls = [];
  const context = {
    save() { calls.push('save'); },
    beginPath() { calls.push('beginPath'); },
    rect(...args) { calls.push(['rect', ...args]); },
    clip() { calls.push('clip'); },
    translate(...args) { calls.push(['translate', ...args]); },
    restore() { calls.push('restore'); },
    fillRect(...args) { calls.push(['fillRect', ...args]); }
  };
  let rendered = false;
  area.draw(context, () => { rendered = true; });
  assert.equal(rendered, true);
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'rect' && call.slice(1).join(',') === '5,8,80,40'));
  assert.ok(calls.includes('clip'));
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'fillRect'));
});
