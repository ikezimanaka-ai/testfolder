function createDisplay() {
    const body = document.body;
    const rootDomDealer = new Deal(body);

    rootDomDealer.CE("div", { id: "display", styles: { height: "100vh", margin: "0", padding: "0", "background-color": "#333333"}});
    rootDomDealer.CCE("#display", "canvas", { id: "canvas", styles: { width: "800px", height: "600px", "border": "1px solid #ccc", "background-color": "#fff"}});
    // append script but we'll load canvasDealer manually below to ensure onload
    // keep using DOM helper for structure, but load the script with onload handler later
    rootDomDealer.CE("script", { src: "./canvasDealer.js" });
}

createDisplay();

window.addEventListener('resize', initializeCanvas);

function initializeCanvas() {
    const canvas = document.getElementById('canvas');
    const maxWidth = 800;
    const maxHeight = 600;
    const ratio = maxWidth / maxHeight;

    let width = Math.min(window.innerWidth, maxWidth);
    let height = Math.min(window.innerHeight, maxHeight);

    if (width / height > ratio) {
        width = height * ratio;
    } else {
        height = width / ratio;
    }

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
}

// Load canvasDealer.js and initialize canvas after it's available
function initCanvasDealerAndDraw() {
    const canvas = document.getElementById('canvas');
    initializeCanvas();
    if (typeof CD3 === 'undefined') {
        console.error('CD3 is not available after loading canvasDealer.js');
        return;
    }
    const canvasDealer = new CD3(canvas, 800, 600);
    canvasDealer.drawRectangle(50, 50, 200, 100, 'blue');
}

// Dynamically load the script and call initializer on load
const existingScript = document.querySelector('script[src="./canvasDealer.js"]');
if (existingScript) {
    if (existingScript.complete || existingScript.readyState === 'loaded' || existingScript.readyState === 'complete') {
        initCanvasDealerAndDraw();
    } else {
        existingScript.addEventListener('load', initCanvasDealerAndDraw);
        existingScript.addEventListener('error', () => console.error('Failed to load canvasDealer.js'));
    }
} else {
    const script = document.createElement('script');
    script.src = './canvasDealer.js';
    script.addEventListener('load', initCanvasDealerAndDraw);
    script.addEventListener('error', () => console.error('Failed to load canvasDealer.js'));
    document.body.appendChild(script);
}