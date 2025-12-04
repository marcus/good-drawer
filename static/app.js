// Good Drawer - WebSocket client for AI drawing with streaming canvas rendering

const DEBOUNCE_MS = 300;
const PING_INTERVAL_MS = 20000;
const RECONNECT_DELAYS = [500, 2000, 5000, 10000];
const DEBUG = new URLSearchParams(location.search).has('debug');

class DrawingApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.doodleOverlay = document.getElementById('doodleOverlay');
        this.input = document.getElementById('promptInput');
        this.clearBtn = document.getElementById('clearBtn');
        this.status = document.getElementById('status');
        this.modelSelect = document.getElementById('modelSelect');

        this.ws = null;
        this.currentId = null;
        this.debounceTimer = null;
        this.pingTimer = null;
        this.reconnectAttempt = 0;

        // Canvas drawing system
        this.drawer = new CanvasDrawer(this.canvas);
        this.parser = new PathParser(
            (segment) => {
                this.startDrawing();
                this.drawer.addSegment(segment);
            },
            (warning) => this.logWarning(warning)
        );

        // Doodle loader for waiting state
        this.doodle = new DoodleLoader(this.doodleOverlay);

        // State: 'idle' | 'thinking' | 'generating' | 'drawing'
        this.state = 'idle';
        this.startTime = null;
        this.elapsedTimer = null;

        this.init();
    }

    init() {
        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('keydown', (e) => this.onKeydown(e));
        this.clearBtn.addEventListener('click', () => this.clearInput());

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        this.fetchModels();
        this.connect();
    }

    async fetchModels() {
        try {
            const resp = await fetch('/api/models');
            const data = await resp.json();
            const models = data.models || [];

            this.modelSelect.innerHTML = '';
            if (models.length === 0) {
                this.modelSelect.innerHTML = '<option value="">No models</option>';
                return;
            }

            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ name: m.name, provider: m.provider });
                const icon = m.provider === 'ollama' ? '💻' : '☁️';
                const displayName = m.name.split('/').pop().split(':')[0];
                opt.textContent = `${icon} ${displayName}`;
                this.modelSelect.appendChild(opt);
            });

            // Select gpt-oss by default if available
            const preferred = models.find(m => m.name.includes('gpt-oss'));
            if (preferred) {
                this.modelSelect.value = JSON.stringify({ name: preferred.name, provider: preferred.provider });
            }
        } catch (e) {
            console.warn('Failed to fetch models:', e);
            this.modelSelect.innerHTML = '<option value="">Error</option>';
        }
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const size = Math.round(rect.width * dpr);

        if (this.canvas.width !== size || this.canvas.height !== size) {
            this.canvas.width = size;
            this.canvas.height = size;
            // Re-apply canvas context settings after resize
            this.drawer.ctx.lineCap = 'round';
            this.drawer.ctx.lineJoin = 'round';
            // Scale context: viewBox (400x400) → CSS size → pixel size
            // This lets canvas-drawer work in viewBox coordinates
            const scale = (rect.width / 400) * dpr;
            this.drawer.ctx.setTransform(scale, 0, 0, scale, 0, 0);
        }
    }

    logWarning(warning) {
        console.warn('[PathParser]', warning.type, warning.details);
        if (DEBUG) {
            console.debug('Buffer tail:', warning.buffer);
        }
    }

    startLoading() {
        this.state = 'thinking';
        this.doodle.start();
        this.startTime = Date.now();
        this.updateElapsed();
        this.elapsedTimer = setInterval(() => this.updateElapsed(), 100);
    }

    startGenerating() {
        if (this.state === 'thinking') {
            this.state = 'generating';
            this.doodle.clear();
        }
    }

    startDrawing() {
        if (this.state === 'thinking') {
            this.doodle.clear();
        }
        this.state = 'drawing';
    }

    stopAll() {
        this.state = 'idle';
        this.doodle.clear();
        if (this.elapsedTimer) {
            clearInterval(this.elapsedTimer);
            this.elapsedTimer = null;
        }
    }

    updateElapsed() {
        if (!this.startTime) return;
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        switch (this.state) {
            case 'thinking':
                this.setStatus(`Thinking... ${elapsed}s`);
                break;
            case 'generating':
                this.setStatus(`Generating... ${elapsed}s`);
                break;
            case 'drawing':
                this.setStatus(`Drawing... ${elapsed}s`);
                break;
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
                this.parser.reset();
                this.canvas.classList.add('streaming');
                this.setStatus('');
                break;

            case 'chunk':
                this.startGenerating();
                console.log('[chunk]', msg.data);
                // Feed chunk to parser - it will emit segments to drawer
                // startDrawing() is called when first segment is emitted
                this.parser.feed(msg.data);
                break;

            case 'done':
                this.stopAll();
                this.canvas.classList.remove('streaming');
                this.setStatus('');
                // Flush any remaining segments
                this.drawer.flush();
                break;

            case 'cancelled':
                this.stopAll();
                this.canvas.classList.remove('streaming');
                this.setStatus('');
                break;

            case 'error':
                this.stopAll();
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

        if (this.ws?.readyState === WebSocket.OPEN) {
            let model = 'gpt-oss:20b';
            let provider = 'ollama';
            try {
                const selected = JSON.parse(this.modelSelect.value);
                model = selected.name;
                provider = selected.provider;
            } catch (e) {}
            this.ws.send(JSON.stringify({
                type: 'draw',
                prompt: prompt,
                id: this.currentId,
                model: model,
                provider: provider
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
        this.stopAll();
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
