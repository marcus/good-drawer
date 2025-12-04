// Streaming SVG path parser - extracts drawable segments from SVG text chunks

class PathParser {
    constructor(onSegment, onWarning) {
        this.onSegment = onSegment;   // (segment) => void
        this.onWarning = onWarning;   // (warning) => void
        this.buffer = '';
        this.currentStyle = { stroke: '#000', strokeWidth: 3 };
        this.svgStarted = false;
    }

    // Feed a chunk of SVG text
    feed(chunk) {
        this.buffer += chunk;

        // Wait for SVG to start - skip any preamble/thinking
        if (!this.svgStarted) {
            const svgStart = this.buffer.indexOf('<svg');
            if (svgStart === -1) {
                // No SVG yet, keep only last 100 chars in case <svg spans chunks
                if (this.buffer.length > 100) {
                    this.buffer = this.buffer.slice(-100);
                }
                return;
            }
            // Found SVG start, discard everything before it
            this.buffer = this.buffer.slice(svgStart);
            this.svgStarted = true;
        }

        this.extractPaths();
    }

    // Reset parser state
    reset() {
        this.buffer = '';
        this.currentStyle = { stroke: '#000', strokeWidth: 3 };
        this.svgStarted = false;
    }

    // Extract and parse complete path elements from buffer
    extractPaths() {
        // Match complete <path ... /> elements (self-closing)
        // Use [\s\S] to match across newlines
        const pathRegex = /<path\s+([\s\S]*?)\/>/gi;
        let match;
        let lastIndex = 0;

        while ((match = pathRegex.exec(this.buffer)) !== null) {
            this.parsePath(match[1]);
            lastIndex = pathRegex.lastIndex;
        }

        // Keep unparsed content (may contain partial path)
        if (lastIndex > 0) {
            this.buffer = this.buffer.slice(lastIndex);
        }

        // Warn if buffer grows too large
        if (this.buffer.length > 50000) {
            this.warn('buffer_overflow', { size: this.buffer.length });
        }
    }

    // Parse path attributes and emit segments
    parsePath(attrs) {
        // Extract d attribute
        const dMatch = attrs.match(/d\s*=\s*"([^"]*)"/i) || attrs.match(/d\s*=\s*'([^']*)'/i);
        if (!dMatch) {
            this.warn('parse_error', { reason: 'no d attribute', attrs });
            return;
        }

        // Extract style attributes
        const strokeMatch = attrs.match(/stroke\s*=\s*["']([^"']+)["']/i);
        const widthMatch = attrs.match(/stroke-width\s*=\s*["']([^"']+)["']/i);

        if (strokeMatch) this.currentStyle.stroke = strokeMatch[1];
        if (widthMatch) this.currentStyle.strokeWidth = parseFloat(widthMatch[1]) || 3;

        const d = dMatch[1];
        this.parseD(d);
    }

    // Parse SVG path d attribute into segments
    parseD(d) {
        // Tokenize: commands and numbers
        const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
        if (!tokens) return;

        let i = 0;
        let currentX = 0, currentY = 0;
        let startX = 0, startY = 0;

        const readNum = () => {
            if (i >= tokens.length) return 0;
            const val = parseFloat(tokens[i++]);
            return isNaN(val) ? 0 : val;
        };

        while (i < tokens.length) {
            const cmd = tokens[i];

            // Skip if current token is a number (implicit command repeat)
            if (/^[-+.\d]/.test(cmd)) {
                continue;
            }
            i++;

            switch (cmd) {
                case 'M': { // Absolute moveTo
                    const x = readNum(), y = readNum();
                    currentX = x; currentY = y;
                    startX = x; startY = y;
                    this.emit('M', { x, y });
                    // Additional coord pairs are implicit lineTo
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        const lx = readNum(), ly = readNum();
                        this.emit('L', { x: lx, y: ly });
                        currentX = lx; currentY = ly;
                    }
                    break;
                }
                case 'm': { // Relative moveTo
                    const dx = readNum(), dy = readNum();
                    currentX += dx; currentY += dy;
                    startX = currentX; startY = currentY;
                    this.emit('M', { x: currentX, y: currentY });
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        const dlx = readNum(), dly = readNum();
                        currentX += dlx; currentY += dly;
                        this.emit('L', { x: currentX, y: currentY });
                    }
                    break;
                }
                case 'L': { // Absolute lineTo
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        const x = readNum(), y = readNum();
                        this.emit('L', { x, y });
                        currentX = x; currentY = y;
                    }
                    break;
                }
                case 'l': { // Relative lineTo
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        const dx = readNum(), dy = readNum();
                        currentX += dx; currentY += dy;
                        this.emit('L', { x: currentX, y: currentY });
                    }
                    break;
                }
                case 'H': { // Absolute horizontal lineTo
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        currentX = readNum();
                        this.emit('L', { x: currentX, y: currentY });
                    }
                    break;
                }
                case 'h': { // Relative horizontal lineTo
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        currentX += readNum();
                        this.emit('L', { x: currentX, y: currentY });
                    }
                    break;
                }
                case 'V': { // Absolute vertical lineTo
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        currentY = readNum();
                        this.emit('L', { x: currentX, y: currentY });
                    }
                    break;
                }
                case 'v': { // Relative vertical lineTo
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        currentY += readNum();
                        this.emit('L', { x: currentX, y: currentY });
                    }
                    break;
                }
                case 'C': { // Absolute cubic bezier
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        const x1 = readNum(), y1 = readNum();
                        const x2 = readNum(), y2 = readNum();
                        const x = readNum(), y = readNum();
                        this.emit('C', { x1, y1, x2, y2, x, y });
                        currentX = x; currentY = y;
                    }
                    break;
                }
                case 'c': { // Relative cubic bezier
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        const dx1 = readNum(), dy1 = readNum();
                        const dx2 = readNum(), dy2 = readNum();
                        const dx = readNum(), dy = readNum();
                        this.emit('C', {
                            x1: currentX + dx1, y1: currentY + dy1,
                            x2: currentX + dx2, y2: currentY + dy2,
                            x: currentX + dx, y: currentY + dy
                        });
                        currentX += dx; currentY += dy;
                    }
                    break;
                }
                case 'Q': { // Absolute quadratic bezier
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        const x1 = readNum(), y1 = readNum();
                        const x = readNum(), y = readNum();
                        this.emit('Q', { x1, y1, x, y });
                        currentX = x; currentY = y;
                    }
                    break;
                }
                case 'q': { // Relative quadratic bezier
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) {
                        const dx1 = readNum(), dy1 = readNum();
                        const dx = readNum(), dy = readNum();
                        this.emit('Q', {
                            x1: currentX + dx1, y1: currentY + dy1,
                            x: currentX + dx, y: currentY + dy
                        });
                        currentX += dx; currentY += dy;
                    }
                    break;
                }
                case 'Z':
                case 'z': { // Close path
                    this.emit('Z', { x: startX, y: startY });
                    currentX = startX; currentY = startY;
                    break;
                }
                case 'A':
                case 'a': { // Arc - warn and skip
                    this.warn('unknown_command', { command: cmd, reason: 'arcs not supported' });
                    // Skip arc parameters (7 numbers)
                    for (let j = 0; j < 7 && i < tokens.length; j++) {
                        if (/^[-+.\d]/.test(tokens[i])) readNum();
                    }
                    break;
                }
                case 'S':
                case 's':
                case 'T':
                case 't': {
                    this.warn('unknown_command', { command: cmd, reason: 'smooth curves not yet supported' });
                    // Skip parameters
                    while (i < tokens.length && /^[-+.\d]/.test(tokens[i])) readNum();
                    break;
                }
                default:
                    this.warn('unknown_command', { command: cmd });
            }
        }
    }

    emit(type, coords) {
        this.onSegment?.({
            type,
            ...coords,
            style: { ...this.currentStyle }
        });
    }

    warn(type, details) {
        this.onWarning?.({
            type,
            details,
            buffer: this.buffer.slice(-100)
        });
    }
}
