function createDisplayArea() {
  const body = document.body;
  // create container
  const container = document.createElement('div'); container.id = 'display';
  Object.assign(container.style, {height:'100vh', margin:'0', padding:'0', backgroundColor:'#333'});
  // canvas
  const canvas = document.createElement('canvas'); canvas.id = 'canvas';
  Object.assign(canvas.style, {width:'800px', height:'600px', border:'1px solid #ccc', backgroundColor:'#fff'});
  container.appendChild(canvas);
  document.body.appendChild(container);
}

createDisplayArea();

window.addEventListener('resize', initializeCanvasForDemo);

function initializeCanvasForDemo(){
  const canvas = document.getElementById('canvas');
  const maxWidth = 800; const maxHeight = 600; const ratio = maxWidth / maxHeight;
  let width = Math.min(window.innerWidth, maxWidth);
  let height = Math.min(window.innerHeight, maxHeight);
  if (width / height > ratio) { width = height * ratio; } else { height = width / ratio; }
  canvas.width = width; canvas.height = height; canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
}

function initEngineDemo(){
  const canvas = document.getElementById('canvas');
  initializeCanvasForDemo();
  if (typeof GameEngine === 'undefined') { console.error('engine.js not loaded'); return; }
  const E = new GameEngine.Engine({fps:40, canvas});
  const bg = E.createDisplay({name:'bg', width:canvas.width, height:canvas.height, transparent:true, blend:'normal'});
  const fx = E.createDisplay({name:'fx', width:canvas.width, height:canvas.height, transparent:true, blend:'blur'});

  const proto = new GameEngine.GameObject({tag:['box'], x:80,y:80,width:60,height:40});
  proto.onCopy = (c)=>{ c.tag.push('copied'); };

  bg.addObject(proto.copy({x:120,y:180}));
  bg.addObject(proto.copy({x:240,y:120}));
  fx.addObject(proto.copy({x:200,y:150}));

  E.start();

  setInterval(()=>{
    const objs = bg.listObjects(); if(objs.length===0) return; const o = objs[0]; const d = GameEngine.Utils.angleToDxDy(0,10); o.move(d.dx,d.dy);
    // wrap
    if(o.x > canvas.width) o.x = 0;
  }, 500);
}

// load engine.js dynamically if not present
const existing = document.querySelector('script[src="./engine.js"]');
if(existing){ if(existing.complete || existing.readyState==='loaded' || existing.readyState==='complete'){ initEngineDemo(); } else { existing.addEventListener('load', initEngineDemo); existing.addEventListener('error', ()=>console.error('Failed to load engine.js')); } }
else { const s = document.createElement('script'); s.src = './engine.js'; s.addEventListener('load', initEngineDemo); s.addEventListener('error', ()=>console.error('Failed to load engine.js')); document.body.appendChild(s); }
