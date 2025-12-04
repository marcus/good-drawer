// Canvas renderer with progressive "marker drawing" animation

class CanvasDrawer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.queue = [];
        this.isDrawing = false;
        this.animationId = null;

        // Animation state
        this.currentSegment = null;
        this.segmentProgress = 0;
        this.segmentStartX = 0;
        this.segmentStartY = 0;
        this.segmentLength = 0;
        this.pixelsPerFrame = 8; // Natural drawing speed
        this.minFramesPerSegment = 3;

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

    // Calculate length of a line segment
    lineLength(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Approximate bezier curve length by sampling
    bezierLength(type, startX, startY, segment) {
        const samples = 10;
        let length = 0;
        let prevX = startX, prevY = startY;

        for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const pt = this.interpolatePoint(type, startX, startY, segment, t);
            length += this.lineLength(prevX, prevY, pt.x, pt.y);
            prevX = pt.x;
            prevY = pt.y;
        }
        return length;
    }

    // Get point at t along a segment (0 <= t <= 1)
    interpolatePoint(type, startX, startY, segment, t) {
        switch (type) {
            case 'L':
            case 'Z':
                return {
                    x: startX + (segment.x - startX) * t,
                    y: startY + (segment.y - startY) * t
                };

            case 'Q': {
                // Quadratic bezier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
                const mt = 1 - t;
                return {
                    x: mt * mt * startX + 2 * mt * t * segment.x1 + t * t * segment.x,
                    y: mt * mt * startY + 2 * mt * t * segment.y1 + t * t * segment.y
                };
            }

            case 'C': {
                // Cubic bezier: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
                const mt = 1 - t;
                const mt2 = mt * mt;
                const mt3 = mt2 * mt;
                const t2 = t * t;
                const t3 = t2 * t;
                return {
                    x: mt3 * startX + 3 * mt2 * t * segment.x1 + 3 * mt * t2 * segment.x2 + t3 * segment.x,
                    y: mt3 * startY + 3 * mt2 * t * segment.y1 + 3 * mt * t2 * segment.y2 + t3 * segment.y
                };
            }

            default:
                return { x: segment.x, y: segment.y };
        }
    }

    // Start animating a new segment
    beginSegmentAnimation(segment) {
        this.currentSegment = segment;
        this.segmentProgress = 0;
        this.segmentStartX = this.penX;
        this.segmentStartY = this.penY;

        const type = segment.type;

        // Calculate segment length
        if (type === 'L' || type === 'Z') {
            this.segmentLength = this.lineLength(this.penX, this.penY, segment.x, segment.y);
        } else if (type === 'Q' || type === 'C') {
            this.segmentLength = this.bezierLength(type, this.penX, this.penY, segment);
        } else {
            this.segmentLength = 0;
        }

        // Apply style
        this.ctx.strokeStyle = segment.style?.stroke || '#000';
        this.ctx.lineWidth = segment.style?.strokeWidth || 3;
    }

    // Draw current segment up to current progress, returns true if complete
    advanceSegmentAnimation() {
        const segment = this.currentSegment;
        if (!segment) return true;

        const type = segment.type;

        // Handle instant segments (MoveTo)
        if (type === 'M') {
            if (this.pathStarted) {
                this.ctx.stroke();
            }
            this.ctx.beginPath();
            this.ctx.moveTo(segment.x, segment.y);
            this.penX = segment.x;
            this.penY = segment.y;
            this.pathStarted = true;
            this.currentSegment = null;
            return true;
        }

        // For drawable segments, advance progress
        const progressIncrement = this.segmentLength > 0
            ? this.pixelsPerFrame / this.segmentLength
            : 1 / this.minFramesPerSegment;

        this.segmentProgress = Math.min(1, this.segmentProgress + progressIncrement);

        // Get current point along the path
        const pt = this.interpolatePoint(type, this.segmentStartX, this.segmentStartY, segment, this.segmentProgress);

        // Draw from start to current point
        if (!this.pathStarted) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.segmentStartX, this.segmentStartY);
            this.pathStarted = true;
        }

        // For progressive drawing, we redraw the partial curve each frame
        // This is simpler and handles curves correctly
        this.ctx.beginPath();
        this.ctx.moveTo(this.segmentStartX, this.segmentStartY);

        if (type === 'L' || type === 'Z') {
            this.ctx.lineTo(pt.x, pt.y);
        } else if (type === 'Q') {
            // Draw partial quadratic curve using subdivision
            this.drawPartialQuadratic(this.segmentStartX, this.segmentStartY, segment, this.segmentProgress);
        } else if (type === 'C') {
            // Draw partial cubic curve using subdivision
            this.drawPartialCubic(this.segmentStartX, this.segmentStartY, segment, this.segmentProgress);
        }

        this.ctx.stroke();

        // Update pen position
        this.penX = pt.x;
        this.penY = pt.y;

        // Check if segment is complete
        if (this.segmentProgress >= 1) {
            this.ctx.beginPath();
            this.ctx.moveTo(segment.x, segment.y);
            this.penX = segment.x;
            this.penY = segment.y;
            if (type === 'Z') {
                this.pathStarted = false;
            }
            this.currentSegment = null;
            return true;
        }

        return false;
    }

    // Draw partial quadratic bezier using de Casteljau subdivision
    drawPartialQuadratic(startX, startY, segment, t) {
        // Subdivide at t to get the first portion of the curve
        const x1 = startX + (segment.x1 - startX) * t;
        const y1 = startY + (segment.y1 - startY) * t;
        const x2 = segment.x1 + (segment.x - segment.x1) * t;
        const y2 = segment.y1 + (segment.y - segment.y1) * t;
        const endX = x1 + (x2 - x1) * t;
        const endY = y1 + (y2 - y1) * t;

        this.ctx.quadraticCurveTo(x1, y1, endX, endY);
    }

    // Draw partial cubic bezier using de Casteljau subdivision
    drawPartialCubic(startX, startY, segment, t) {
        // First level
        const ax = startX + (segment.x1 - startX) * t;
        const ay = startY + (segment.y1 - startY) * t;
        const bx = segment.x1 + (segment.x2 - segment.x1) * t;
        const by = segment.y1 + (segment.y2 - segment.y1) * t;
        const cx = segment.x2 + (segment.x - segment.x2) * t;
        const cy = segment.y2 + (segment.y - segment.y2) * t;

        // Second level
        const dx = ax + (bx - ax) * t;
        const dy = ay + (by - ay) * t;
        const ex = bx + (cx - bx) * t;
        const ey = by + (cy - by) * t;

        // Third level (endpoint)
        const endX = dx + (ex - dx) * t;
        const endY = dy + (ey - dy) * t;

        this.ctx.bezierCurveTo(ax, ay, dx, dy, endX, endY);
    }

    // Main draw loop - progressive animation
    draw() {
        if (!this.isDrawing) return;

        // If no current segment, get next from queue
        if (!this.currentSegment && this.queue.length > 0) {
            const segment = this.queue.shift();
            this.beginSegmentAnimation(segment);
        }

        // Advance current segment animation
        if (this.currentSegment) {
            this.advanceSegmentAnimation();
        }

        // Continue if there's more to draw
        if (this.currentSegment || this.queue.length > 0) {
            this.animationId = requestAnimationFrame(() => this.draw());
        } else {
            this.isDrawing = false;
        }
    }

    // Draw a segment instantly (used by flush)
    drawSegmentInstant(segment) {
        const { type, style } = segment;

        this.ctx.strokeStyle = style?.stroke || '#000';
        this.ctx.lineWidth = style?.strokeWidth || 3;

        switch (type) {
            case 'M':
                if (this.pathStarted) {
                    this.ctx.stroke();
                }
                this.ctx.beginPath();
                this.ctx.moveTo(segment.x, segment.y);
                this.penX = segment.x;
                this.penY = segment.y;
                this.pathStarted = true;
                break;

            case 'L':
                if (!this.pathStarted) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.penX, this.penY);
                    this.pathStarted = true;
                }
                this.ctx.lineTo(segment.x, segment.y);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(segment.x, segment.y);
                this.penX = segment.x;
                this.penY = segment.y;
                break;

            case 'C':
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

            case 'Q':
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

            case 'Z':
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
        // Complete current animating segment instantly
        if (this.currentSegment) {
            // Finish drawing from current progress to end
            this.segmentProgress = 1;
            this.advanceSegmentAnimation();
            this.currentSegment = null;
        }

        // Draw remaining queue instantly
        while (this.queue.length > 0) {
            const segment = this.queue.shift();
            this.drawSegmentInstant(segment);
        }
        this.stopDrawing();
    }

    // Clear the canvas and reset state
    clear() {
        this.stopDrawing();
        this.queue = [];
        this.currentSegment = null;
        this.segmentProgress = 0;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.penX = 0;
        this.penY = 0;
        this.pathStarted = false;
    }

    // Check if there are segments waiting to be drawn
    hasPending() {
        return this.queue.length > 0 || this.isDrawing || this.currentSegment !== null;
    }
}
