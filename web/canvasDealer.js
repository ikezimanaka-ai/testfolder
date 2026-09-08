class CD1 {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    drawRectangle(x, y, width, height, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width, height);
    }

    drawCircle(x, y, radius, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawText(text, x, y, font = '16px Arial', color = 'black') {
        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.fillText(text, x, y);
    }
    drawImage(image, x, y, width = image.width, height = image.height) {
        this.ctx.drawImage(image, x, y, width, height);
    }

    drawLine(x1, y1, x2, y2, color = 'black', lineWidth = 1) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }
}

class CD2 {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cd1 = new CD1(canvas);
    }

    drawImage(image, x, y) {//ここで、画像または[x,y,color]などを受けて、画像バイナリなら画像、そうでなければ四角を描画するようにする
        if (image instanceof Image) {
            this.cd1.drawImage(image, x, y);
        } else if (Array.isArray(image) && image.length === 3) {
            const [width, height, color] = image;
            this.cd1.drawRectangle(x, y, width, height, color);
        } else {
            console.error('Invalid image format');
        }
    }

    drawText(text, x, y, font = '16px Arial', color = 'black') {
        this.cd1.drawText(text, x, y, font, color);
    }

    drawCircle(x, y, radius, color) {
        this.cd1.drawCircle(x, y, radius, color);
    }

    drawLine(x1, y1, x2, y2, color = 'black', lineWidth = 1) {
        this.cd1.drawLine(x1, y1, x2, y2, color, lineWidth);
    }

    clear() {//画面をクリアする
        this.cd1.clearCanvas();
    }

}

class CD3 {
    constructor(canvas, logicalWidth = canvas.width, logicalHeight = canvas.height) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.logicalWidth = Number(logicalWidth) || canvas.width;
        this.logicalHeight = Number(logicalHeight) || canvas.height;
        this.scaleX = canvas.width / this.logicalWidth;
        this.scaleY = canvas.height / this.logicalHeight;
    }

    worldToCanvasX(value) {
        return value * this.scaleX;
    }

    worldToCanvasY(value) {
        return value * this.scaleY;
    }

    worldToCanvasSize(value, axis) {
        if (axis === 'x') return value * this.scaleX;
        if (axis === 'y') return value * this.scaleY;
        return value;
    }

    drawRectangle(x, y, width, height, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            this.worldToCanvasX(x),
            this.worldToCanvasY(y),
            this.worldToCanvasSize(width, 'x'),
            this.worldToCanvasSize(height, 'y')
        );
    }

    drawCircle(x, y, radius, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(
            this.worldToCanvasX(x),
            this.worldToCanvasY(y),
            radius * Math.min(this.scaleX, this.scaleY),
            0,
            Math.PI * 2
        );
        this.ctx.fill();
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawText(text, x, y, font = '16px Arial', color = 'black') {
        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.fillText(text, this.worldToCanvasX(x), this.worldToCanvasY(y));
    }

    drawImage(image, x, y, width = image.width, height = image.height) {
        if (image instanceof Image) {
            this.ctx.drawImage(
                image,
                this.worldToCanvasX(x),
                this.worldToCanvasY(y),
                this.worldToCanvasSize(width, 'x'),
                this.worldToCanvasSize(height, 'y')
            );
            return;
        }

        if (Array.isArray(image) && image.length === 3) {
            const [drawWidth, drawHeight, color] = image;
            this.drawRectangle(x, y, drawWidth, drawHeight, color);
            return;
        }

        console.error('Invalid image format');
    }

    drawLine(x1, y1, x2, y2, color = 'black', lineWidth = 1) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(this.worldToCanvasX(x1), this.worldToCanvasY(y1));
        this.ctx.lineTo(this.worldToCanvasX(x2), this.worldToCanvasY(y2));
        this.ctx.stroke();
    }
}