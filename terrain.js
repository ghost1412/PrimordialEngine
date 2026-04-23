/**
 * Terrain Generator for The Primordial Engine
 * Generates an Ocean/Land map using Perlin Noise approximation.
 */
class Terrain {
    constructor(width, height, scale = 100) {
        this.width = width;
        this.height = height;
        this.scale = scale;
        this.grid = [];
        this.generate();
    }

    generate() {
        // Simple 2D Pseudo-Perlin Noise Logic
        const seed = Math.random();
        for (let y = 0; y < this.height; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.width; x++) {
                const nx = x / this.width - 0.5;
                const ny = y / this.height - 0.5;
                
                // Using distance from center to keep a central landmass or central ocean
                const d = Math.sqrt(nx * nx + ny * ny);
                
                // Noise harmonic layering
                let noise = this.noise(x * 0.015, y * 0.015) 
                          + 0.5 * this.noise(x * 0.03, y * 0.03)
                          + 0.25 * this.noise(x * 0.06, y * 0.06);
                
                noise = (noise + 1) / 2; // Normalize to 0-1
                
                // Shape it: center is more likely to be land
                const altitude = noise - d * 0.5;
                this.grid[y][x] = altitude;
            }
        }
    }

    noise(x, y) {
        // Simple deterministic noise function
        let n = x + y * 57;
        n = (n << 13) ^ n;
        return (1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0);
    }

    isWater(x, y) {
        const gx = Math.floor((x / canvas.width) * this.width);
        const gy = Math.floor((y / canvas.height) * this.height);
        if (this.grid[gy] && this.grid[gy][gx]) {
            return this.grid[gy][gx] < 0.25; // Threshold for ocean
        }
        return false;
    }

    draw(ctx, canvasWidth, canvasHeight) {
        const cellW = canvasWidth / this.width;
        const cellH = canvasHeight / this.height;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const alt = this.grid[y][x];
                if (alt < 0.25) {
                    // Deep Ocean
                    ctx.fillStyle = `rgb(5, 15, ${30 + alt * 40})`;
                } else if (alt < 0.3) {
                    // Shallow Water / Beach
                    ctx.fillStyle = `rgb(10, 30, 60)`;
                } else if (alt < 0.5) {
                    // Lowland / Grass
                    ctx.fillStyle = `rgb(10, ${40 + alt * 40}, 15)`;
                } else {
                    // Highlands / Mountains
                    ctx.fillStyle = `rgb(${alt * 60}, ${alt * 60}, ${alt * 40})`;
                }
                ctx.fillRect(x * cellW, y * cellH, cellW + 1, cellH + 1);
            }
        }
    }
}
