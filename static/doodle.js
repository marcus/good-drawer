// Procedural doodle animation - loading state while waiting for LLM

class DoodleLoader {
    constructor(canvas) {
        this.canvas = canvas;
        this.animationId = null;
        this.paths = [];
        this.startTime = 0;
    }

    start() {
        this.stop();
        this.canvas.innerHTML = '';
        this.paths = [];
        this.startTime = performance.now();
        this.animate();
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    clear() {
        this.stop();
        this.canvas.innerHTML = '';
        this.paths = [];
    }

    animate() {
        const elapsed = (performance.now() - this.startTime) / 1000;
        this.render(elapsed);
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    render(t) {
        const svg = [];

        // Gentle wandering circle
        const cx = 200 + Math.sin(t * 0.8) * 30 + Math.sin(t * 1.3) * 20;
        const cy = 200 + Math.cos(t * 0.6) * 25 + Math.cos(t * 1.1) * 15;
        const r = 8 + Math.sin(t * 2) * 3;

        // Trail of fading dots
        const trailCount = 12;
        for (let i = 0; i < trailCount; i++) {
            const age = i * 0.15;
            const pastT = t - age;
            if (pastT < 0) continue;

            const px = 200 + Math.sin(pastT * 0.8) * 30 + Math.sin(pastT * 1.3) * 20;
            const py = 200 + Math.cos(pastT * 0.6) * 25 + Math.cos(pastT * 1.1) * 15;
            const opacity = Math.max(0, 0.3 - i * 0.025);
            const pr = Math.max(2, 6 - i * 0.4);

            svg.push(`<circle cx="${px}" cy="${py}" r="${pr}" fill="#94a3b8" opacity="${opacity}"/>`);
        }

        // Main dot
        svg.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#64748b"/>`);

        // Orbiting smaller dots
        for (let i = 0; i < 3; i++) {
            const angle = t * 1.5 + (i * Math.PI * 2 / 3);
            const orbitR = 25 + Math.sin(t + i) * 5;
            const ox = cx + Math.cos(angle) * orbitR;
            const oy = cy + Math.sin(angle) * orbitR;
            const dotR = 3 + Math.sin(t * 2 + i) * 1;
            const opacity = 0.4 + Math.sin(t * 1.5 + i) * 0.2;

            svg.push(`<circle cx="${ox}" cy="${oy}" r="${dotR}" fill="#94a3b8" opacity="${opacity}"/>`);
        }

        // Subtle pulsing ring
        const ringR = 50 + Math.sin(t * 0.7) * 10;
        const ringOpacity = 0.1 + Math.sin(t * 0.5) * 0.05;
        svg.push(`<circle cx="200" cy="200" r="${ringR}" fill="none" stroke="#cbd5e1" stroke-width="1" opacity="${ringOpacity}"/>`);

        this.canvas.innerHTML = svg.join('');
    }
}

// Export for use in app.js
window.DoodleLoader = DoodleLoader;
