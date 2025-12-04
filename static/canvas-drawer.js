// Canvas renderer with queued drawing for pen-like animation

class CanvasDrawer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.queue = [];
        this.isDrawing = false;
        this.animationId = null;
        this.segmentsPerFrame = 2; // How many segments to draw per frame

        // Sharpie-like style defaults
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Current pen position
        this.penX = 0;
        this.penY = 0;
        this.pathStarted = false;
    }

    // Add a segment to the drawing queue
    addSegment(segment) {
        this.queue.push(segment);
        if (!this.isDrawing) {
            this.startDrawing();
        }
    }

    // Start the animation loop
    startDrawing() {
        if (this.isDrawing) return;
        this.isDrawing = true;
        this.draw();
    }

    // Stop the animation loop
    stopDrawing() {
        this.isDrawing = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    // Main draw loop
    draw() {
        if (!this.isDrawing) return;

        // Draw multiple segments per frame for smoother appearance
        for (let i = 0; i < this.segmentsPerFrame && this.queue.length > 0; i++) {
            const segment = this.queue.shift();
            this.drawSegment(segment);
        }

        // Continue if there's more to draw
        if (this.queue.length > 0) {
            this.animationId = requestAnimationFrame(() => this.draw());
        } else {
            this.isDrawing = false;
        }
    }

    // Draw a single segment
    drawSegment(segment) {
        const { type, style } = segment;

        // Apply style
        this.ctx.strokeStyle = style?.stroke || '#000';
        this.ctx.lineWidth = style?.strokeWidth || 3;

        switch (type) {
            case 'M': // MoveTo
                // If we had a path, stroke it before moving
                if (this.pathStarted) {
                    this.ctx.stroke();
                }
                this.ctx.beginPath();
                this.ctx.moveTo(segment.x, segment.y);
                this.penX = segment.x;
                this.penY = segment.y;
                this.pathStarted = true;
                break;

            case 'L': // LineTo
                if (!this.pathStarted) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.penX, this.penY);
                    this.pathStarted = true;
                }
                this.ctx.lineTo(segment.x, segment.y);
                this.ctx.stroke();
                // Continue path from end point
                this.ctx.beginPath();
                this.ctx.moveTo(segment.x, segment.y);
                this.penX = segment.x;
                this.penY = segment.y;
                break;

            case 'C': // Cubic Bezier
                if (!this.pathStarted) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.penX, this.penY);
                    this.pathStarted = true;
                }
                this.ctx.bezierCurveTo(
                    segment.x1, segment.y1,
                    segment.x2, segment.y2,
                    segment.x, segment.y
                );
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(segment.x, segment.y);
                this.penX = segment.x;
                this.penY = segment.y;
                break;

            case 'Q': // Quadratic Bezier
                if (!this.pathStarted) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.penX, this.penY);
                    this.pathStarted = true;
                }
                this.ctx.quadraticCurveTo(
                    segment.x1, segment.y1,
                    segment.x, segment.y
                );
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(segment.x, segment.y);
                this.penX = segment.x;
                this.penY = segment.y;
                break;

            case 'Z': // Close path
                if (this.pathStarted) {
                    this.ctx.lineTo(segment.x, segment.y);
                    this.ctx.stroke();
                    this.penX = segment.x;
                    this.penY = segment.y;
                    this.pathStarted = false;
                }
                break;
        }
    }

    // Flush remaining queue immediately (for 'done' message)
    flush() {
        while (this.queue.length > 0) {
            const segment = this.queue.shift();
            this.drawSegment(segment);
        }
        this.stopDrawing();
    }

    // Clear the canvas and reset state
    clear() {
        this.stopDrawing();
        this.queue = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.penX = 0;
        this.penY = 0;
        this.pathStarted = false;
    }

    // Check if there are segments waiting to be drawn
    hasPending() {
        return this.queue.length > 0 || this.isDrawing;
    }
}
