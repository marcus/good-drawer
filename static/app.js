// Good Drawer - WebSocket client for AI drawing with streaming canvas rendering

const DEBOUNCE_MS = 300;
const PING_INTERVAL_MS = 20000;
const MAX_BUFFER_SIZE = 200000;
const RECONNECT_DELAYS = [500, 2000, 5000, 10000];
const DEBUG = new URLSearchParams(location.search).has('debug');

class DrawingApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.doodleOverlay = document.getElementById('doodleOverlay');
        this.input = document.getElementById('promptInput');
        this.clearBtn = document.getElementById('clearBtn');
        this.status = document.getElementById('status');

        this.ws = null;
        this.currentId = null;
        this.debounceTimer = null;
        this.pingTimer = null;
        this.reconnectAttempt = 0;
        this.bufferSize = 0;

        // Canvas drawing system
        this.drawer = new CanvasDrawer(this.canvas);
        this.parser = new PathParser(
            (segment) => this.drawer.addSegment(segment),
            (warning) => this.logWarning(warning)
        );

        // Doodle loader for waiting state
        this.doodle = new DoodleLoader(this.doodleOverlay);
        this.isLoading = false;

        // Elapsed time tracking
        this.startTime = null;
        this.elapsedTimer = null;

        this.init();
    }

    init() {
        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('keydown', (e) => this.onKeydown(e));
        this.clearBtn.addEventListener('click', () => this.clearInput());

        this.connect();
    }

    logWarning(warning) {
        console.warn('[PathParser]', warning.type, warning.details);
        if (DEBUG) {
            console.debug('Buffer tail:', warning.buffer);
        }
    }

    startLoading() {
        this.isLoading = true;
        this.doodle.start();
        this.startTime = Date.now();
        this.updateElapsed();
        this.elapsedTimer = setInterval(() => this.updateElapsed(), 100);
    }

    stopLoading() {
        if (this.isLoading) {
            this.isLoading = false;
            this.doodle.clear();
        }
        if (this.elapsedTimer) {
            clearInterval(this.elapsedTimer);
            this.elapsedTimer = null;
        }
    }

    updateElapsed() {
        if (!this.startTime) return;
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        this.setStatus(`Drawing... ${elapsed}s`);
    }

    connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws/draw`;

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            this.reconnectAttempt = 0;
            this.setStatus('');
            this.startPing();
        };

        this.ws.onclose = () => {
            this.stopPing();
            this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            this.setStatus('Connection error', true);
        };

        this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
    }

    scheduleReconnect() {
        const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
        this.setStatus('Reconnecting...');
        this.reconnectAttempt++;
        setTimeout(() => this.connect(), delay);
    }

    startPing() {
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, PING_INTERVAL_MS);
    }

    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    handleMessage(msg) {
        if (msg.id && msg.id !== this.currentId) return;

        switch (msg.type) {
            case 'pong':
                break;

            case 'start':
                this.bufferSize = 0;
                this.parser.reset();
                this.canvas.classList.add('streaming');
                this.setStatus('');
                break;

            case 'chunk':
                this.stopLoading();
                console.log('[chunk]', msg.data);
                this.bufferSize += msg.data.length;
                if (this.bufferSize > MAX_BUFFER_SIZE) {
                    this.setStatus('Drawing too complex', true);
                    this.cancel();
                    return;
                }

                // Feed chunk to parser - it will emit segments to drawer
                this.parser.feed(msg.data);
                break;

            case 'done':
                this.stopLoading();
                this.canvas.classList.remove('streaming');
                // Flush any remaining segments
                this.drawer.flush();
                break;

            case 'cancelled':
                this.stopLoading();
                this.canvas.classList.remove('streaming');
                break;

            case 'error':
                this.stopLoading();
                this.canvas.classList.remove('streaming');
                this.setStatus(msg.message, true);
                setTimeout(() => {
                    if (this.status.textContent === msg.message) {
                        this.setStatus('');
                    }
                }, 3000);
                break;
        }
    }

    onInput() {
        const value = this.input.value;
        this.clearBtn.style.display = value ? 'flex' : 'none';

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        if (!value.trim()) {
            this.clearCanvas();
            return;
        }

        this.debounceTimer = setTimeout(() => this.sendDraw(), DEBOUNCE_MS);
    }

    onKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.sendDraw();
        } else if (e.key === 'Escape') {
            this.clearInput();
        }
    }

    sendDraw() {
        const prompt = this.input.value.trim();
        if (!prompt) return;

        if (prompt.length > 512) {
            this.setStatus('Prompt too long (max 512 chars)', true);
            return;
        }

        // Cancel current request
        this.cancel();

        // Clear canvas and start loading animation
        this.drawer.clear();
        this.parser.reset();
        this.startLoading();

        // Send new request
        this.currentId = crypto.randomUUID();
        this.bufferSize = 0;

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'draw',
                prompt: prompt,
                id: this.currentId
            }));
        } else {
            this.setStatus('Not connected', true);
        }
    }

    cancel() {
        if (this.currentId && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'cancel',
                id: this.currentId
            }));
        }
    }

    clearInput() {
        this.input.value = '';
        this.clearBtn.style.display = 'none';
        this.cancel();
        this.clearCanvas();
        this.input.focus();
    }

    clearCanvas() {
        this.stopLoading();
        this.drawer.clear();
        this.parser.reset();
        this.canvas.classList.remove('streaming');
        this.currentId = null;
    }

    setStatus(text, isError = false) {
        this.status.textContent = text;
        this.status.classList.toggle('error', isError);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    new DrawingApp();
});
