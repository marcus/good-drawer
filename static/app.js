// Good Drawer - WebSocket client for AI drawing

const DEBOUNCE_MS = 300;
const PING_INTERVAL_MS = 20000;
const MAX_BUFFER_SIZE = 200000;
const RENDER_THROTTLE_MS = 33; // ~30fps
const RECONNECT_DELAYS = [500, 2000, 5000, 10000];

class DrawingApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.input = document.getElementById('promptInput');
        this.clearBtn = document.getElementById('clearBtn');
        this.status = document.getElementById('status');

        this.ws = null;
        this.currentId = null;
        this.buffer = '';
        this.lastValidSvg = '';
        this.debounceTimer = null;
        this.pingTimer = null;
        this.reconnectAttempt = 0;
        this.lastRenderTime = 0;
        this.renderPending = false;
        this.doodle = new DoodleLoader(this.canvas);
        this.isLoading = false;

        this.init();
    }

    init() {
        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('keydown', (e) => this.onKeydown(e));
        this.clearBtn.addEventListener('click', () => this.clearInput());

        this.connect();
    }

    startLoading() {
        this.isLoading = true;
        this.doodle.start();
    }

    stopLoading() {
        if (this.isLoading) {
            this.isLoading = false;
            this.doodle.clear();
        }
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
                this.buffer = '';
                this.canvas.classList.add('streaming');
                this.setStatus('');
                break;

            case 'chunk':
                this.stopLoading();
                if (this.buffer.length + msg.data.length > MAX_BUFFER_SIZE) {
                    this.setStatus('Drawing too complex', true);
                    this.cancel();
                    return;
                }
                this.buffer += msg.data;
                this.scheduleRender();
                break;

            case 'done':
                this.stopLoading();
                this.canvas.classList.remove('streaming');
                this.render(true);
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

    scheduleRender() {
        if (this.renderPending) return;

        const now = Date.now();
        const elapsed = now - this.lastRenderTime;

        if (elapsed >= RENDER_THROTTLE_MS) {
            this.render();
        } else {
            this.renderPending = true;
            setTimeout(() => {
                this.renderPending = false;
                this.render();
            }, RENDER_THROTTLE_MS - elapsed);
        }
    }

    render(final = false) {
        this.lastRenderTime = Date.now();

        let svgContent = this.buffer;

        // Wrap incomplete SVG
        if (!svgContent.includes('<svg')) {
            svgContent = `<svg viewBox="0 0 400 400">${svgContent}</svg>`;
        } else if (!svgContent.includes('</svg>')) {
            svgContent = svgContent + '</svg>';
        }

        // Parse and validate
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, 'image/svg+xml');
        const errorNode = doc.querySelector('parsererror');

        if (errorNode) {
            if (this.lastValidSvg && final) {
                this.setStatus('Drawing incomplete');
            }
            return;
        }

        // Valid SVG - update canvas
        const svgEl = doc.documentElement;
        if (!svgEl.getAttribute('viewBox')) {
            svgEl.setAttribute('viewBox', '0 0 400 400');
        }

        this.canvas.innerHTML = svgEl.innerHTML;
        this.lastValidSvg = this.buffer;
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

        // Fade, clear, and start loading animation
        this.canvas.classList.add('fading');
        setTimeout(() => {
            this.canvas.innerHTML = '';
            this.canvas.classList.remove('fading');
            this.startLoading();
        }, 200);

        // Send new request
        this.currentId = crypto.randomUUID();
        this.buffer = '';
        this.lastValidSvg = '';

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
        this.canvas.classList.add('fading');
        setTimeout(() => {
            this.canvas.innerHTML = '';
            this.canvas.classList.remove('fading');
            this.canvas.classList.remove('streaming');
        }, 200);
        this.buffer = '';
        this.lastValidSvg = '';
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
