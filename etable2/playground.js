import { SceneEngine, INPUT as SCENE_INPUT } from '../editor/engine/scene-engine/engine.js';
import { Engine, Display, GameObject, Shapes, INPUT } from '../editor/engine/engine.js';
import {
  ShapeObject, RectObject, CircleObject, EllipseObject, LineObject, PolygonObject, TextObject,
  BarObject, ButtonObject, SliderObject, TextInputObject, NumberInputObject, ImageObject,
  SpriteAnimationObject, CanvasScrollArea
} from '../editor/engine/ui-objects.js';

const log = document.querySelector('#log');
const sceneLog = document.querySelector('#scene-log');
const canvas = document.querySelector('#objects-canvas');
const engine = new Engine(canvas, 60, 1000, 600);
const display = engine.newDisplay(new Display('playground', 1000, 600, { background: '#101819' }));
const say = (message) => { log.value = message; log.textContent = message; };
const add = (object) => engine.addObject(display, object);

add(new TextObject('Shapes and display objects', { x: 26, y: 34, fontSize: 19, fontWeight: '700', color: '#a8e8c6' }));
add(new RectObject(72, 44, { x: 68, y: 92, radius: 8, fill: '#2d8f68', stroke: '#a8e8c6' }));
add(new TextObject('RectObject', { x: 26, y: 133, fontSize: 12, color: '#dce7df' }));
add(new CircleObject(23, { x: 175, y: 92, fill: '#db9d45' }));
add(new TextObject('CircleObject', { x: 136, y: 133, fontSize: 12, color: '#dce7df' }));
add(new EllipseObject(37, 20, { x: 280, y: 92, fill: '#a66ac4' }));
add(new TextObject('EllipseObject', { x: 238, y: 133, fontSize: 12, color: '#dce7df' }));
add(new LineObject(347, 112, 411, 70, { x: 0, y: 0, stroke: '#f2e8d5', lineWidth: 4 }));
add(new TextObject('LineObject', { x: 352, y: 133, fontSize: 12, color: '#dce7df' }));
add(new PolygonObject([{ x: 0, y: 0 }, { x: 42, y: 0 }, { x: 31, y: 42 }, { x: 9, y: 42 }], { x: 459, y: 72, fill: '#3f8dad' }));
add(new TextObject('PolygonObject', { x: 430, y: 133, fontSize: 12, color: '#dce7df' }));
add(new ShapeObject(Shapes.roundRect(76, 42, 8, { x: -38, y: -21, fill: '#8f4c4c', stroke: '#f1aaaa' }), { x: 564, y: 92 }));
add(new TextObject('ShapeObject', { x: 527, y: 133, fontSize: 12, color: '#dce7df' }));
add(new TextObject('TextObject: multi-line\nanchor / baseline / font', { x: 628, y: 83, fontSize: 15, fontWeight: '600', color: '#f3d38b' }));

add(new TextObject('Controls — pointer, values, focus and IME', { x: 26, y: 174, fontSize: 18, fontWeight: '700', color: '#a8e8c6' }));
add(new ButtonObject('Click me', { x: 32, y: 197, width: 132, height: 42, label: 'Click me', onClick() { say(`ButtonObject clicked at ${new Date().toLocaleTimeString()}`); } }));
const bar = add(new BarObject({ x: 32, y: 253, width: 260, height: 18, value: .35, fill: '#58c996' }));
const slider = add(new SliderObject({ x: 32, y: 286, width: 260, min: 0, max: 100, step: 1, value: 35, onChange(value) { bar.value = value / 100; say(`SliderObject value: ${value}`); } }));
add(new TextObject('BarObject + SliderObject', { x: 32, y: 324, fontSize: 12, color: '#dce7df' }));
const textInput = add(new TextInputObject({ x: 330, y: 197, width: 270, height: 42, label: '日本語テキスト入力', placeholder: 'ここをクリックして日本語入力', value: '', maxLength: 80, onInput(value) { say(`TextInputObject: ${value}`); }, onChange(value) { say(`TextInputObject change: ${value}`); } }));
const numberInput = add(new NumberInputObject({ x: 330, y: 262, width: 180, height: 42, label: '数値入力 (0–999)', value: '10', min: 0, max: 999, step: 1, onInput(value) { say(`NumberInputObject: ${value}`); } }));
add(new TextObject('TextInputObject (IME)     NumberInputObject (min / max / step)', { x: 330, y: 324, fontSize: 12, color: '#dce7df' }));
canvas.addEventListener('pointerdown', (event) => {
  const hit = engine._hitTest(engine.pointerToLogical(event));
  if (hit !== textInput && hit !== numberInput) { textInput.blur(); numberInput.blur(); }
});

add(new TextObject('Images and animation', { x: 640, y: 174, fontSize: 18, fontWeight: '700', color: '#a8e8c6' }));
add(new ImageObject('../cards/s01@2x.png', { x: 654, y: 190, width: 54, height: 78, onLoad() { say('ImageObject loaded: spade ace'); } }));
add(new SpriteAnimationObject(['../cards/s01@2x.png', '../cards/h01@2x.png', '../cards/d01@2x.png', '../cards/c01@2x.png'], { x: 734, y: 190, width: 54, height: 78, frameDuration: .55, loop: true, onLoad() { say('SpriteAnimationObject loaded: four frames'); } }));
add(new TextObject('ImageObject', { x: 646, y: 279, fontSize: 12, color: '#dce7df' }));
add(new TextObject('SpriteAnimationObject', { x: 713, y: 279, fontSize: 12, color: '#dce7df' }));

add(new TextObject('CanvasScrollArea — hover and use the mouse wheel here', { x: 26, y: 366, fontSize: 17, fontWeight: '700', color: '#a8e8c6' }));
const scroll = new CanvasScrollArea({ x: 28, y: 382, width: 430, height: 176, contentHeight: 420 });
function drawScrollContent() {
  scroll.configure({ contentHeight: 420 });
  scroll.draw(engine.ctx, () => {
    for (let i = 0; i < 14; i++) {
      const y = scroll.y + i * 29;
      engine.ctx.fillStyle = i % 2 ? '#172a25' : '#20362e';
      engine.ctx.fillRect(scroll.x, y, scroll.width - 5, 25);
      engine.ctx.fillStyle = '#dce7df';
      engine.ctx.font = '13px sans-serif';
      engine.ctx.fillText(`Scrollable canvas row ${i + 1}`, scroll.x + 10, y + 17);
    }
  });
}
canvas.addEventListener('wheel', (event) => {
  const changed = scroll.handleWheel(event, engine.pointerToLogical(event), .8);
  if (changed) engine.render();
}, { passive: false });
const draw = engine.render.bind(engine);
engine.render = () => { draw(); drawScrollContent(); };

add(new TextObject('Object Engine APIs', { x: 505, y: 366, fontSize: 17, fontWeight: '700', color: '#a8e8c6' }));
const collisionA = add(new RectObject(90, 45, { x: 540, y: 414, fill: '#325c4a', stroke: '#a8e8c6', tags: ['probe'] }));
const collisionB = add(new CircleObject(22, { x: 600, y: 414, fill: '#cf8748', tags: ['probe'] }));
add(new TextObject('overlap: ' + collisionA.intersects(collisionB), { x: 508, y: 465, fontSize: 13, color: '#dce7df' }));
add(new TextObject('move pointer over this canvas to inspect INPUT.pointer', { x: 508, y: 489, fontSize: 12, color: '#b8c8bf' }));
add(new TextObject('Text input focus can be cleared by clicking elsewhere.', { x: 508, y: 512, fontSize: 12, color: '#b8c8bf' }));
const timer = engine.createTimer();
engine.addObject(display, new GameObject({ onUpdate() {
  if (INPUT.pointer) {
    const pointer = INPUT.pointer;
    const text = `pointer ${Math.round(pointer.x)}, ${Math.round(pointer.y)} · timer ${timer.elapsed.toFixed(1)}s`;
    status.text = text;
  }
} }));
const status = add(new TextObject('pointer — · timer 0.0s', { x: 508, y: 548, fontSize: 12, color: '#f3d38b' }));
engine.start();

const sceneCanvas = document.querySelector('#scene-canvas');
const scenes = new SceneEngine({ canvas: sceneCanvas, width: 640, height: 360, fps: 30, background: '#101819' });
function scene(name, title, color) {
  return { data: { title, color }, onEnter(_engine, data) { sceneLog.textContent = `${name}: onEnter`; }, onUpdate() {}, onExit() { sceneLog.textContent = `${name}: onExit`; }, onRender(target, data) {
    target.ctx.fillStyle = '#101819'; target.ctx.fillRect(0, 0, target.width, target.height);
    target.ctx.fillStyle = data.color; target.ctx.font = '700 30px sans-serif'; target.ctx.fillText(data.title, 32, 76);
    target.ctx.fillStyle = '#dce7df'; target.ctx.font = '16px sans-serif';
    target.ctx.fillText(`currentScene: ${target.currentSceneName}`, 32, 112);
    target.ctx.fillText(`INPUT: ${SCENE_INPUT.onKey('Shift') ? 'Shift held' : 'click buttons to switch'}`, 32, 146);
    target.ctx.fillText(`registered scenes: ${[...target.scenes.keys()].join(', ')}`, 32, 180);
  } };
}
scenes.registerScene('lobby', scene('lobby', 'Lobby Scene', '#a8e8c6'));
scenes.registerScene('table', scene('table', 'Table Scene', '#f3d38b'));
scenes.start('lobby');
document.querySelector('#scene-lobby').addEventListener('click', () => scenes.switchScene('lobby'));
document.querySelector('#scene-table').addEventListener('click', () => scenes.switchScene('table'));
document.querySelector('#debug-toggle').addEventListener('click', (event) => {
  engine.setDebug(!engine.debug.hitboxes); event.currentTarget.textContent = engine.debug.hitboxes ? 'Hitbox debug: ON' : 'Hitbox debug';
});
document.querySelector('#timer-button').addEventListener('click', () => {
  timer.reset(); timer.resume(); say('Engine timer reset; elapsed time is shown on the Canvas.');
});
window.addEventListener('beforeunload', () => { textInput.blur(); numberInput.blur(); scenes.stop(); engine.destroy(); });
