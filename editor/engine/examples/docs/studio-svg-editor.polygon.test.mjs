import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePolygonPoints } from './studio-svg-editor.js';

test('normalizePolygonPoints trims duplicate end points and keeps 3+ vertices', () => {
  const result = normalizePolygonPoints([
    { x: 10, y: 10 },
    { x: 30, y: 60 },
    { x: 60, y: 10 },
    { x: 10, y: 10 },
  ]);

  assert.deepEqual(result, [
    { x: 10, y: 10 },
    { x: 30, y: 60 },
    { x: 60, y: 10 },
  ]);
});

test('normalizePolygonPoints accepts SVG points strings', () => {
  const result = normalizePolygonPoints('10,10 40,20 10,50');
  assert.deepEqual(result, [
    { x: 10, y: 10 },
    { x: 40, y: 20 },
    { x: 10, y: 50 },
  ]);
});
