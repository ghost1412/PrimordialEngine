/**
 * The Primordial Engine: Core Simulation Loop
 */

const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');

const stabilityEl = document.getElementById('stability');
const trendLand = document.getElementById('trend-land');
const trendSocial = document.getElementById('trend-social');
const logContent = document.getElementById('log-content');

const CONFIG = {
    AGENTS: 120,
    MAX_AGENTS: 400, // Still a functional max for performance, but biomass is the real limit
    GLOBAL_BIOMASS: 20000, // Maximum allowed energy in the system
    MUTATION: 0.1,
    SEA_LEVEL: 0.25,
    ERA_LENGTH: 5000 // Automatic Climate Shift every 5000 ticks
};

class SpatialHash {
    constructor(width, height, cellSize) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }
    clear() { this.grid.clear(); }
    add(agent) {
        const key = `${Math.floor(agent.pos.x / this.cellSize)},${Math.floor(agent.pos.y / this.cellSize)}`;
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key).push(agent);
    }
    getNearby(x, y, radius) {
        const results = [];
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const range = Math.ceil(radius / this.cellSize);
        for (let i = -range; i <= range; i++) {
            for (let j = -range; j <= range; j++) {
                const key = `${cx + i},${cy + j}`;
                if (this.grid.has(key)) results.push(...this.grid.get(key));
            }
        }
        return results;
    }
}

class Particle {
    constructor(x, y, color, speed = 1) {
        this.pos = { x, y };
        this.vel = { x: (Math.random()-0.5)*speed, y: (Math.random()-0.5)*speed };
        this.alpha = 1;
        this.color = color;
    }
    update() {
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        this.alpha -= 0.02;
    }
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.alpha;
        ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
    }
}

let terrain;
let agents = [];
let foods = [];
let nutrients = []; 
let particles = []; // New Particle System
let caches = [];    // Tribal Caches (Civilization Dawn)
let fertilityGrid = []; // (Struggle & Scarcity)
let activeTribesHistory = new Set(); // To track extinction permanently
let worldTime = 0;
let eraTimer = CONFIG.ERA_LENGTH;
let worldTemperature = 25; // Standard Celsius
const DAY_LENGTH = 1000;
let dayCycle = 0; // 0 to 1

// Procedural Audio Engine
let audioCtx = null;
let worldOsc = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    worldOsc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.02; // Very quiet background hum
    worldOsc.connect(gain);
    gain.connect(audioCtx.destination);
    worldOsc.type = 'sine';
    worldOsc.start();
}

function playNote(freq, type = 'sine', vol = 0.05) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}
let selectedAgent = null;
let heroLocked = false;
let planetaryNews = [];
let isNutrientMode = false;
let spatialHash;

function logNarrative(msg, type="info") {
    planetaryNews.unshift({ msg: msg.toUpperCase(), life: 300 });
    if (planetaryNews.length > 5) planetaryNews.pop();
    logEvent(msg);
}

// Agent Life Events
function recordEvent(agent, msg) {
    if (!agent.journal) agent.journal = [];
    agent.journal.push(`Day ${worldTime}: ${msg}`);
    if (agent.journal.length > 10) agent.journal.shift();
}
let pheromoneGrid = [];
const PHERO_SCALE = 20;

function initPheromones() {
    for (let y = 0; y < Math.ceil(canvas.height / PHERO_SCALE); y++) {
        pheromoneGrid[y] = [];
        fertilityGrid[y] = [];
        for (let x = 0; x < Math.ceil(canvas.width / PHERO_SCALE); x++) {
            pheromoneGrid[y][x] = [0, 0, 0]; // [Food, Danger, Home]
            fertilityGrid[y][x] = 1.0; // Base fertility 100%
        }
    }
}

const CONTINENT_NAMES = ["Boreal Arc", "Pangaea Prime", "Sunken Reach", "The Archipelagos", "Veridian Plate"];
const NATION_PREFIXES = ["The Great", "Empire of", "Republic of", "United", "Holy"];
const NATION_SUFFIXES = ["Union", "Hegemony", "Collective", "Sovereignty", "Reach"];

function getNationName(tribe) {
    const col = tribe * 360;
    let base = "Azure";
    if (col < 30 || col > 330) base = "Crimson";
    else if (col > 90 && col < 150) base = "Emerald";
    else if (col > 30 && col < 90) base = "Amber";
    
    return `${NATION_PREFIXES[Math.floor(tribe * 4.9)]} ${base} ${NATION_SUFFIXES[Math.floor((1-tribe) * 4.9)]}`;
}

let isCinematic = false;
let dnaVault = JSON.parse(localStorage.getItem('primordial_vault') || '[]');

function toggleCinematic() {
    isCinematic = !isCinematic;
    document.querySelector('#dashboard').style.display = isCinematic ? 'none' : 'flex';
    logEvent(`CINEMATIC MODE: ${isCinematic ? 'ON (Press H to toggle)' : 'OFF'}`);
}
let isPossessed = false;
let isOllamaEnabled = false;
let ollamaBrain = new OllamaBrain("gemma3:12b"); // Adjusted to available gemma3:12b model
const keys = {};

function toggleOllama() {
    isOllamaEnabled = !isOllamaEnabled;
    const btn = document.getElementById('ollama-btn');
    if (btn) btn.classList.toggle('active', isOllamaEnabled);
    logNarrative(`LLM CONSCIOUSNESS: ${isOllamaEnabled ? 'ACTIVATED (Hitting localhost:11434)' : 'DEACTIVATED'}`);
    if (isOllamaEnabled) logEvent("SYSTEM: Ensure Ollama is running served on port 11434");
}

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'p' && selectedAgent) {
        isPossessed = !isPossessed;
        logNarrative(`DIVINE POSSESSION: ${isPossessed ? 'ACTIVE' : 'DEACTIVATED'}`);
        if (isPossessed) recordEvent(selectedAgent, "Directly possessed by the Creator");
    }
    if (e.key.toLowerCase() === 'h') toggleCinematic();
});
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

function saveSelectedToVault() {
    if (!selectedAgent) return;
    const dna = {
        genes: selectedAgent.genes,
        brain: selectedAgent.brain.weights_ih,
        tribe: selectedAgent.tribeMarker
    };
    dnaVault.push(dna);
    localStorage.setItem('primordial_vault', JSON.stringify(dnaVault));
    renderVault();
    logEvent("SPECIES SAVED: Neural data archived in vault");
}

function renderVault() {
    const list = document.getElementById('vault-list');
    if (!list) return;
    list.innerHTML = '';
    dnaVault.forEach((dna, i) => {
        const item = document.createElement('div');
        item.className = 'vault-item';
        item.innerHTML = `
            <span>Sample #${i+1}</span>
            <button class="god-btn" onclick="spawnFromVault(${i})">Spawn</button>
        `;
        list.appendChild(item);
    });
}

function spawnFromVault(index) {
    const dna = dnaVault[index];
    if (!dna) return;
    const agent = new Agent(Math.random() * canvas.width, Math.random() * canvas.height);
    agent.genes = { ...dna.genes };
    agent.brain.weights_ih = [...dna.brain];
    agent.tribeMarker = dna.tribe;
    agents.push(agent);
    logEvent("VAULT: Ancient DNA revitalized");
}

function importDNA() {
    const code = document.getElementById('dna-import').value;
    try {
        const dna = JSON.parse(atob(code));
        const agent = new Agent(Math.random() * canvas.width, Math.random() * canvas.height);
        agent.genes = dna.genes;
        agent.brain.weights_ih = dna.brain;
        agent.tribeMarker = dna.tribe;
        agents.push(agent);
        logEvent("IMPORT: External DNA integrated");
    } catch(e) {
        logEvent("ERROR: Invalid DNA sequence");
    }
}

function setEra(type) {
    if (type === 'ICE_AGE') {
        worldTemperature = 5;
        logEvent("GOD MODE: Ice Age Enforced");
    } else if (type === 'HEATWAVE') {
        worldTemperature = 45;
        logEvent("GOD MODE: Heatwave Enforced");
    }
}
function toggleNutrientDrop() {
    isNutrientMode = !isNutrientMode;
    logEvent(`GOD MODE: Nutrient Dropper ${isNutrientMode ? 'ON' : 'OFF'}`);
}
let territoryGrid = []; // Grid to track 'Ownership'
const TERRITORY_SCALE = 20;

function init() {
    window.addEventListener('resize', onResize);
    canvas.addEventListener('click', onCanvasClick);
    
    ['slip-lungs', 'slip-gills', 'slip-aggro'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                if (selectedAgent) {
                    const geneKey = id.split('-')[1];
                    selectedAgent.genes[geneKey] = parseFloat(e.target.value);
                }
            });
        }
    });

    onResize();

    terrain = new Terrain(60, 40);
    initPheromones();
    spatialHash = new SpatialHash(canvas.width, canvas.height, 60);

    // Initialize Territory Grid
    for (let y = 0; y < Math.ceil(canvas.height / TERRITORY_SCALE); y++) {
        territoryGrid[y] = [];
        for (let x = 0; x < Math.ceil(canvas.width / TERRITORY_SCALE); x++) {
            territoryGrid[y][x] = { tribe: null, strength: 0, civilization: 0 };
        }
    }

    // Initial Population (The Spark of Life)
    for (let i = 0; i < CONFIG.AGENTS; i++) {
        agents.push(new Agent(Math.random() * canvas.width, Math.random() * canvas.height));
    }

    animate();
    renderVault();
    logEvent("Ecosystem Initialized: Devonian Phase");
}

function onResize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

function onCanvasClick(e) {
    initAudio(); // Start audio on interaction
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isNutrientMode) {
        nutrients.push({ pos: { x: mx, y: my }, timer: 1000 });
        logEvent("GOD MODE: Nutrient Cloud Seeded");
        return;
    }

    selectedAgent = null;
    let minDist = 50;
    agents.forEach(a => {
        const d = Math.hypot(a.pos.x - mx, a.pos.y - my);
        if (d < minDist) {
            minDist = d;
            selectedAgent = a;
        }
    });

    if (selectedAgent) {
        document.getElementById('agent-stats').classList.remove('hidden');
        document.querySelector('.placeholder').classList.add('hidden');
        
        // Sync God Sliders
        document.getElementById('slip-lungs').value = selectedAgent.genes.lungs;
        document.getElementById('slip-gills').value = selectedAgent.genes.gills;
        document.getElementById('slip-aggro').value = selectedAgent.genes.aggro;
    } else {
        document.getElementById('agent-stats').classList.add('hidden');
        document.querySelector('.placeholder').classList.remove('hidden');
    }
}

function animate() {
    worldTime++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Draw Terrain
    terrain.draw(ctx, canvas.width, canvas.height);

    // 1.1 Weather & Day Cycle Overlay (Atmosphere)
    dayCycle = (worldTime % DAY_LENGTH) / DAY_LENGTH;
    
    // Morning (Pinkish)
    if (dayCycle < 0.2) {
        ctx.fillStyle = 'rgba(255, 150, 150, 0.1)';
    } 
    // Sunset (Golden/Orange)
    else if (dayCycle > 0.7 && dayCycle < 0.9) {
        ctx.fillStyle = 'rgba(255, 100, 0, 0.15)';
    }
    // Night (Dark Blue/Purple)
    else if (dayCycle >= 0.9 || dayCycle < 0.05) {
        ctx.fillStyle = 'rgba(5, 5, 20, 0.6)';
    } else {
        ctx.fillStyle = 'transparent';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Weather Effects (Stacking)
    if (worldTemperature < 15) {
        ctx.fillStyle = 'rgba(100, 200, 255, 0.15)'; // Ice Blue
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } 
    
    const isNight = (dayCycle > 0.8 || dayCycle < 0.2);

    // 0. Update & Draw Pheromones (Chemical Scent Trails)
    ctx.save();
    for (let y = 0; y < pheromoneGrid.length; y++) {
        for (let x = 0; x < pheromoneGrid[y].length; x++) {
            const p = pheromoneGrid[y][x];
            // Chemical Evaporation
            p[0] *= 0.99; p[1] *= 0.99; p[2] *= 0.99;

            if (p[0] > 0.05 || p[1] > 0.05 || p[2] > 0.05) {
                const r = Math.min(255, p[1] * 200 + (p[0] * 50));
                const g = Math.min(255, p[0] * 200);
                const b = Math.min(255, p[2] * 255);
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.08)`;
                ctx.fillRect(x * PHERO_SCALE, y * PHERO_SCALE, PHERO_SCALE, PHERO_SCALE);
            }
        }
    }
    ctx.restore();

    // 1.2 Update & Draw Particles
    particles = particles.filter(p => {
        p.update();
        p.draw(ctx);
        return p.alpha > 0;
    });

    // 2. Draw Territory Borders
    const nationCenters = {}; // Track tribal dominance for naming

    ctx.save();
    ctx.filter = 'blur(15px) contrast(1.5)';
    ctx.globalAlpha = 0.2; 
    for (let y = 0; y < territoryGrid.length; y++) {
        for (let x = 0; x < territoryGrid[y].length; x++) {
            const cell = territoryGrid[y][x];
            if (cell.tribe !== null) {
                // Tracking for Names
                if (!nationCenters[cell.tribe]) nationCenters[cell.tribe] = { x: 0, y: 0, count: 0 };
                nationCenters[cell.tribe].x += x * TERRITORY_SCALE;
                nationCenters[cell.tribe].y += y * TERRITORY_SCALE;
                nationCenters[cell.tribe].count++;

                const hue = cell.tribe * 360;
                const saturation = cell.civilization > 0.8 ? '10%' : '70%'; 
                ctx.fillStyle = `hsl(${hue}, ${saturation}, 50%)`;
                
                ctx.beginPath();
                ctx.arc(x * TERRITORY_SCALE, y * TERRITORY_SCALE, TERRITORY_SCALE * 2.5, 0, Math.PI * 2);
                ctx.fill();

                if (cell.civilization > 0.4) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                    ctx.fillRect(x * TERRITORY_SCALE - 2, y * TERRITORY_SCALE - 8, 4, 16);
                }
                cell.strength *= 0.92; 
                if (cell.strength < 0.1) {
                    cell.tribe = null;
                    cell.civilization *= 0.999;
                }
            }
        }
    }
    ctx.restore();

    // 2.1 Draw Nation Labels (Floating Text)
    ctx.font = "bold 12px Space Grotesk";
    ctx.textAlign = "center";
    for (let tribe in nationCenters) {
        const n = nationCenters[tribe];
        if (n.count > 20) { // Only name significant empires
            const centerX = n.x / n.count;
            const centerY = n.y / n.count;
            const name = getNationName(parseFloat(tribe));
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.fillText(name.toUpperCase(), centerX, centerY);
            ctx.fillStyle = `hsla(${tribe * 360}, 100%, 70%, 0.4)`;
            ctx.fillText(name.toUpperCase(), centerX + 1, centerY + 1);
        }
    }
    
    // 2.2 Update & Draw Tribal Caches (Village Centers)
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    caches = caches.filter(cache => {
        const saturation = cache.civilization > 0.8 ? '10%' : '70%'; 
        const color = `hsl(${cache.tribe * 360}, ${saturation}, 50%)`;
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cache.pos.x, cache.pos.y, 10 + cache.energy * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "white";
        ctx.fillText(`🏛️ ${Math.floor(cache.energy)}`, cache.pos.x, cache.pos.y - 15);
        
        // Caches slowly decay if not maintained
        cache.energy *= 0.9995;
        return cache.energy > 5;
    });

    // Update Spatial Hash
    spatialHash.clear();
    agents.forEach(a => spatialHash.add(a));

    // Calculate Total Biomass
    let totalBiomass = 0;
    agents.forEach(a => totalBiomass += a.energy);
    foods.forEach(f => totalBiomass += f.energy);
    nutrients.forEach(n => totalBiomass += n.timer * 0.1); // Estimate nutrient energy

    // Spawn Food (Scarcity & Fertility Based)
    if (totalBiomass < CONFIG.GLOBAL_BIOMASS) {
        // Find a random tile. Spawns are much rarer and depend strictly on local fertility.
        for (let attempt = 0; attempt < 3; attempt++) {
            const tx = Math.floor(Math.random() * (canvas.width / PHERO_SCALE));
            const ty = Math.floor(Math.random() * (canvas.height / PHERO_SCALE));
            
            if (fertilityGrid[ty] && fertilityGrid[ty][tx]) {
                const fertility = fertilityGrid[ty][tx];
                // Must not be deep water to spawn terrestrial food easily
                const isWater = terrain.isWater(tx * PHERO_SCALE, ty * PHERO_SCALE);
                
                // Spring blooms boost probability, but fertility is the hard cap
                const season = Math.sin(worldTime * 0.001);
                const seasonalMod = Math.max(0.2, (season + 1) / 2);
                
                if (Math.random() < fertility * 0.05 * seasonalMod) {
                    const rx = tx * PHERO_SCALE + Math.random() * PHERO_SCALE;
                    const ry = ty * PHERO_SCALE + Math.random() * PHERO_SCALE;
                    foods.push({ pos: { x: rx, y: ry }, energy: 50, gridPos: {x: tx, y: ty} });
                    // Spawning food drains a tiny bit of potential fertility until it rests
                    fertilityGrid[ty][tx] = Math.max(0, fertility - 0.05); 
                    break;
                }
            }
        }
    }
    
    // Fertility Regeneration (Extremely slow)
    if (worldTime % 100 === 0) {
        for (let y = 0; y < fertilityGrid.length; y++) {
            for (let x = 0; x < fertilityGrid[y].length; x++) {
                if (fertilityGrid[y][x] < 1.0) {
                    fertilityGrid[y][x] = Math.min(1.0, fertilityGrid[y][x] + 0.001); // 10000 ticks to heal fully
                }
                
                // Draw Wastelands (Dead ziemia)
                if (fertilityGrid[y][x] < 0.2) {
                    ctx.fillStyle = `rgba(50, 40, 30, ${0.4 - fertilityGrid[y][x]*2})`;
                    ctx.fillRect(x * PHERO_SCALE, y * PHERO_SCALE, PHERO_SCALE, PHERO_SCALE);
                }
            }
        }
    }

    // Draw Nutrients, Corpses & Rot
    ctx.globalAlpha = 0.15;
    nutrients = nutrients.filter(n => {
        if (n.isCarcass) {
            // Corpse visual (dark red, bone symbol)
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#8B0000';
            ctx.beginPath();
            ctx.arc(n.pos.x, n.pos.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = '10px Arial';
            ctx.fillText('💀', n.pos.x - 5, n.pos.y + 3);
            ctx.globalAlpha = 0.15;
            
            // If carcass rots completely without being scavenged, it poisons the land
            if (n.timer < 5) {
                const px = Math.floor(n.pos.x / PHERO_SCALE);
                const py = Math.floor(n.pos.y / PHERO_SCALE);
                if (fertilityGrid[py] && fertilityGrid[py][px]) {
                    fertilityGrid[py][px] = Math.max(0, fertilityGrid[py][px] - 0.3); // Heavy rot damage
                    particles.push(new Particle(n.pos.x, n.pos.y, "#8B0000", 1)); // Poof of rot
                }
            }
        } else {
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(n.pos.x, n.pos.y, 25, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Label for user
        ctx.globalAlpha = 0.3;
        ctx.font = "8px Arial";
        ctx.fillStyle = "white";
        ctx.fillText(`BIOMASS: ${Math.floor(n.timer / 10)}%`, n.pos.x, n.pos.y);
        ctx.globalAlpha = 0.15;

        n.timer--;
        return n.timer > 0;
    });
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = 'rgba(0, 255, 100, 0.6)';
    foods.forEach(f => {
        ctx.beginPath();
        ctx.arc(f.pos.x, f.pos.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    // Update World Hum
    if (worldOsc) {
        const targetFreq = 100 + worldTemperature * 4;
        worldOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
    }

    // Update Era Timer
    eraTimer--;
    if (eraTimer <= 0) {
        eraTimer = CONFIG.ERA_LENGTH;
        terrain.generate();
        worldTemperature = Math.floor(Math.random() * 50); 
        playNote(200, 'square', 0.1); // Sound for Era Shift
        const msg = `PLANETARY CRISIS: ENTERING ${worldTemperature < 15 ? 'GLACIAL MAXIMUM' : worldTemperature > 35 ? 'SOLAR FLARE PEAK' : 'STABLE TEMPERATE ERA'}`;
        logNarrative(msg);
    }

    const worldInterface = {
        width: canvas.width,
        height: canvas.height,
        foods: foods,
        agents: agents,
        temperature: worldTemperature,
        isNight: isNight,
        isPossessed: isPossessed,
        selectedId: selectedAgent ? selectedAgent.id : null,
        keys: keys,
        pheromoneGrid: pheromoneGrid,
        caches: caches,
        worldTime: worldTime,
        particles: particles,
        getNeighbors: (x, y, r) => spatialHash.getNearby(x, y, r)
    };

    const offspring = [];
    agents = agents.filter(a => {
        a.update(terrain, worldInterface);

        // Update Territory Ownership & Inheritance (Phase 6: Industry)
        const tx = Math.floor(a.pos.x / TERRITORY_SCALE);
        const ty = Math.floor(a.pos.y / TERRITORY_SCALE);
        if (territoryGrid[ty] && territoryGrid[ty][tx]) {
            const cell = territoryGrid[ty][tx];
            
            if (cell.tribe !== null) {
                const isFriendly = Math.abs(cell.tribe - a.tribeMarker) < 0.05;
                if (isFriendly) {
                    a.energy += 0.05; // Base Inheritance
                    cell.civilization = Math.min(1.0, cell.civilization + 0.001);
                    
                    // FARMING: If healthy and civilized, plant food
                    if (a.energy > 90 && cell.civilization > 0.5 && Math.random() < 0.01) {
                        nutrients.push({ pos: { ...a.pos }, timer: 400 });
                        a.energy -= 10; // Effort of planting
                    }
                    
                    // BATTERY: Infrastructure feeds the hungry
                    if (a.energy < 30 && cell.civilization > 0.6) {
                        a.energy += 0.1; 
                        cell.civilization -= 0.001; // Drains the city
                    }

                    // TRIBAL CACHE WITHDRAWAL: If extremely hungry, take from tribal stores
                    const myCache = caches.find(c => Math.abs(c.tribe - a.tribeMarker) < 0.1);
                    if (myCache && a.energy < 40 && myCache.energy > 10) {
                        const dist = Math.hypot(a.pos.x - myCache.pos.x, a.pos.y - myCache.pos.y);
                        if (dist < 40) {
                            const taking = Math.min(10, myCache.energy);
                            a.energy += taking;
                            myCache.energy -= taking;
                            if (a.bubbleTimer <= 0) { a.thoughtBubble = '🍴'; a.bubbleTimer = 30; }
                        }
                    }

                    // CACHE SPAWNING: High civilization creates a physical cache
                    if (cell.civilization > 0.7 && !caches.find(c => Math.abs(c.tribe - a.tribeMarker) < 0.1)) {
                        caches.push({ 
                            pos: { x: tx * TERRITORY_SCALE, y: ty * TERRITORY_SCALE }, 
                            tribe: a.tribeMarker, 
                            energy: 50,
                            civilization: cell.civilization
                        });
                        logNarrative(`CIVILIZATION DAWN: A new Village has formed`);
                    }
                } else {
                    a.energy -= 0.04; // Invasive penalty
                    cell.civilization = 0; 
                }
            }

            cell.tribe = a.tribeMarker;
            cell.strength = 1.0;
        }

        // Pack Hunting & Combat Logic (Dietary Restrictions)
        const isPeaceful = a.phenotype.diet < 0.3;
        const combatNeighbors = spatialHash.getNearby(a.pos.x, a.pos.y, 30);
        // Only hunt when TRULY STARVING (energy < 60)
        const target = (isPeaceful || a.energy > 60) ? null : combatNeighbors.find(n => {
            const isRival = n !== a && !n.dead && Math.abs(n.tribeMarker - a.tribeMarker) > 0.1;
            const isPeacefulMode = a.signal > 0.7 && n.signal > 0.7;
            return isRival && !isPeacefulMode;
        });
        
        if (target) {
            const packmates = combatNeighbors.filter(n => Math.abs(n.tribeMarker - a.tribeMarker) < 0.05);
            const attackPower = packmates.length * a.phenotype.size;
            const defensePower = target.phenotype.size * 2;

            if (attackPower > defensePower) {
                target.dead = true;
                target.cause = "Consumed by Hunter";
                a.thoughtBubble = "🥩";
                a.bubbleTimer = 40;
                
                for(let i=0; i<8; i++) particles.push(new Particle(target.pos.x, target.pos.y, '#ff4444', 2.5));
                for(let i=0; i<5; i++) {
                    const p = new Particle(target.pos.x, target.pos.y, 'rgba(255,255,255,0.4)', 0.5);
                    p.vel.y = -Math.random();
                    particles.push(p);
                }

                let killEfficiency = (a.phenotype.diet > 0.6) ? 1.5 : 0.8;
                const energyGain = (target.energy / (packmates.length + 1)) * killEfficiency;
                
                if (a.role === 'HUNTER') {
                    a.carryingFood = (a.carryingFood || 0) + energyGain;
                } else {
                    a.energy = Math.min(a.maxEnergy, a.energy + energyGain);
                }
                recordEvent(a, `Hunted ${target.name}`);
            }

        }

        // Tribal Defense: Rally to protect tribe-mates
        if (!isPeaceful && a.energy > 30) {
            const tribalNeighbors = combatNeighbors.filter(n => 
                n !== a && !n.dead && Math.abs(n.tribeMarker - a.tribeMarker) < 0.1
            );
            const threatenedAlly = tribalNeighbors.find(ally => ally.energy < 30 && ally.emotions.fear > 0.5);
            if (threatenedAlly) {
                // Find the threat near my ally
                const threat = combatNeighbors.find(n => 
                    n !== a && !n.dead && Math.abs(n.tribeMarker - a.tribeMarker) > 0.1 && n.phenotype.diet > 0.4
                );
                if (threat) {
                    // CHARGE: Steer toward the threat to protect ally
                    const chargeAngle = Math.atan2(threat.pos.y - a.pos.y, threat.pos.x - a.pos.x);
                    a.angle = a.angle * 0.4 + chargeAngle * 0.6;
                    if (a.bubbleTimer <= 0) {
                        a.thoughtBubble = '⚔️';
                        a.bubbleTimer = 30;
                    }
                }
            }
        }

        // Movement Ambience (Bubbles/Dust/Sleep)
        if (Math.random() < 0.15) {
            if (isNight && a.phenotype.aggro < 0.4) {
               particles.push(new Particle(a.pos.x, a.pos.y - 5, 'rgba(100, 200, 255, 0.4)', 0.2));
               if (a.bubbleTimer <= 0) { a.thoughtBubble = '💤'; a.bubbleTimer = 30; }
            } else {
               const isWater = terrain.isWater(a.pos.x, a.pos.y);
               particles.push(new Particle(a.pos.x, a.pos.y, isWater ? 'rgba(255,255,255,0.3)' : 'rgba(150,100,50,0.2)', 0.5));
            }
        }

        // Simplified Energy & Dietary Efficiency (Phase 9)
        foods = foods.filter(f => {
            const d = Math.hypot(f.pos.x - a.pos.x, f.pos.y - a.pos.y);
            // Slightly smaller bite radius for food nodes
            const isFoodNode = f.gridPos !== undefined;
            if (d < a.phenotype.size + (isFoodNode ? 4 : 25)) {
                if (a.energy >= a.maxEnergy) return true; // Full! Skip eating

                let efficiency = 1.0;
                if (a.phenotype.diet > 0.6) efficiency = 0.1;
                else if (a.phenotype.diet < 0.4) efficiency = 1.5;

                let energyValue = (f.energy || 25) * 2.0 * efficiency;
                
                // Overgrazing: Eating food permanently drains the tile's fertility
                if (isFoodNode && worldTime % 5 === 0) {
                    if (fertilityGrid[f.gridPos.y] && fertilityGrid[f.gridPos.y][f.gridPos.x]) {
                         // A greedy grazer damages the land
                         fertilityGrid[f.gridPos.y][f.gridPos.x] = Math.max(0, fertilityGrid[f.gridPos.y][f.gridPos.x] - 0.2);
                    }
                }

                if (a.role === 'GATHERER' && a.energy > 120) {
                    a.carryingFood += energyValue;
                    if (Math.random() < 0.3) {
                        a.carryingMedicine = (a.carryingMedicine || 0) + 1;
                        if (a.bubbleTimer <= 0) { a.thoughtBubble = '🌿'; a.bubbleTimer = 20; }
                    }
                    return false;
                }
                a.energy = Math.min(a.maxEnergy, a.energy + energyValue);
                if (a.role === 'FARMER' && Math.random() < 0.2) {
                    a.carryingMedicine = (a.carryingMedicine || 0) + 1;
                }
                return false;

            }
            return true;
        });

        // SCAVENGING (Eat carcasses)
        nutrients = nutrients.filter(n => {
            if (!n.isCarcass) return true;
            const d = Math.hypot(n.pos.x - a.pos.x, n.pos.y - a.pos.y);
            if (d < a.phenotype.size + 4) {
                if (a.energy >= a.maxEnergy) return true; // Full! Skip scavenging

                // Carnivores love carcasses, herbivores hate them
                let scavEfficiency = a.phenotype.diet > 0.5 ? 2.0 : 0.2;
                a.energy = Math.min(a.maxEnergy, a.energy + (n.energy || 30) * scavEfficiency);
                if (a.bubbleTimer <= 0) { a.thoughtBubble = '🦴'; a.bubbleTimer = 30; }
                return false;
            }
            return true;
        });

        // Mating (Gender-based with Pregnancy)
        const isMature = a.age > 100;
        if (isMature && a.energy > 20 && a.pregnant === 0 && agents.length < CONFIG.MAX_AGENTS) {
            // High energy agents can find mates further away
            const searchRange = a.energy > 200 ? 180 : 120;
            const mateNeighbors = spatialHash.getNearby(a.pos.x, a.pos.y, searchRange);
            const partner = mateNeighbors.find(p => {
                const isMatch = p !== a && !p.dead && p.energy > 20 && p.age > 100;
                const isFamily = a.parents.includes(p.id) || p.parents.includes(a.id);
                // Early Sim Boost: In the first era or population crashes, tribes don't matter as much
                const tribeThreshold = (worldTime < 3000 || agents.length < 80) ? 0.5 : 0.15;
                const isSameTribe = Math.abs(p.tribeMarker - a.tribeMarker) < tribeThreshold;
                const isOppositeGender = a.gender !== p.gender;
                return isMatch && !isFamily && isSameTribe && isOppositeGender && p.pregnant === 0;
            });
            
            if (partner) {
                // Determine the female
                const mother = a.gender === 'F' ? a : partner;
                const father = a.gender === 'M' ? a : partner;
                
                // Start pregnancy (gestation = 200 ticks)
                mother.pregnant = 200;
                mother.mateGenes = father.genes; // Store father's genes for birth
                mother.mateId = father.id;
                a.energy -= 15;
                partner.energy -= 15;
                
                recordEvent(mother, `Pregnant by ${father.name}`);
                for(let i=0; i<8; i++) particles.push(new Particle(a.pos.x, a.pos.y, '#ff69b4', 2.5));
                playNote(600, 'sine', 0.05);
            }
        }
        
        // === BIRTH (Litter Logic: 1-3 offspring) ===
        if (a.gender === 'F' && a.pregnant === 0 && a.mateGenes) {
            const maxLitter = a.energy > 200 ? 3 : 2;
            const litterSize = Math.floor(Math.random() * maxLitter) + 1;
            
            for (let i = 0; i < litterSize; i++) {
                if (agents.length + offspring.length >= CONFIG.MAX_AGENTS) break;
                
                const child = reproduce(a, { genes: a.mateGenes, id: a.mateId || 0, brain: a.brain, tribeMarker: a.tribeMarker });
                offspring.push(child);
                child.motherId = a.id;
                a.childIds.push(child.id);
                a.energy -= 12; // Energy cost per child
                recordEvent(child, `Born to mother ${a.name}`);
                for(let i=0; i<6; i++) particles.push(new Particle(a.pos.x, a.pos.y, '#ff69b4', 2));
            }
            a.mateGenes = null;
            
            recordEvent(a, `Gave birth to a litter of ${litterSize}`);
            playNote(800, 'sine', 0.08);
            if (a.bubbleTimer <= 0) { a.thoughtBubble = '👶'; a.bubbleTimer = 80; }
        }

        a.draw(ctx, a === selectedAgent, isNight);
        if (a.dead) {
            // Create CORPSE (not instant nutrient)
            nutrients.push({ pos: { ...a.pos }, timer: 800, energy: a.energy * 0.5, isCarcass: true });
            for(let i=0; i<5; i++) {
                const p = new Particle(a.pos.x, a.pos.y, 'rgba(255,255,255,0.3)', 0.5);
                p.vel.y = -Math.random() * 0.5;
                particles.push(p);
            }
            playNote(80, 'sine', 0.05);
        }
        return !a.dead;
    });

    agents.push(...offspring);

    if (selectedAgent && selectedAgent.dead) selectedAgent = null;

    if (worldTime % 10 === 0) {
        updateDashboard();
        updateInspector();
    }

    // === OLLAMA CONSCIOUSNESS LOOP ===
    // Every 300 ticks, pick a "Prophet" (Leader or Selected) to think deeply
    if (isOllamaEnabled && worldTime % 300 === 0 && agents.length > 0) {
        const thinker = selectedAgent || agents.find(a => a.isLeader) || agents[Math.floor(Math.random() * agents.length)];
        if (thinker && !thinker.dead) {
            ollamaBrain.think(thinker, worldInterface).then(result => {
                if (result) {
                    thinker.thoughtBubble = result.monologue;
                    thinker.bubbleTimer = 180;
                    // Potential logic override based on objective
                    if (result.objective === "FIGHT") thinker.emotions.hunger = 1.0; 
                    recordEvent(thinker, `Prophesied: "${result.monologue}"`);
                }
            });
        }
    }
    requestAnimationFrame(animate);
}

function updateInspector() {
    if (!selectedAgent) return;
    
    document.getElementById('ins-id').innerText = `AGE: ${selectedAgent.age}`;
    document.getElementById('ins-action').innerText = selectedAgent.role;
    document.getElementById('g-energy').style.width = selectedAgent.energy + '%';
    document.getElementById('ins-tribe').innerText = selectedAgent.tribeMarker.toFixed(2);
    
    // Update Emotions (Limbic State)
    document.getElementById('bar-fear').style.width = (selectedAgent.emotions.fear * 100) + '%';
    document.getElementById('bar-affection').style.width = (selectedAgent.emotions.affection * 100) + '%';
    document.getElementById('bar-hunger').style.width = (selectedAgent.emotions.hunger * 100) + '%';
    
    // Sync Sliders if they exist
    if (document.getElementById('slip-lungs')) {
        document.getElementById('slip-lungs').value = selectedAgent.phenotype.lungs;
        document.getElementById('slip-gills').value = selectedAgent.phenotype.gills;
        document.getElementById('slip-aggro').value = selectedAgent.phenotype.aggro;
    }

    const nCanvas = document.getElementById('neural-canvas');
    if (nCanvas) {
        const nCtx = nCanvas.getContext('2d');
        drawBrain(nCtx, selectedAgent);
    }
}

function drawBrain(ctx, agent) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const brain = agent.brain;
    const inputs = 13;
    const hidden = 16;
    const outputs = 4;

    const drawLayer = (count, x, vals, color) => {
        for (let i = 0; i < count; i++) {
            const y = (i + 1) * (ctx.canvas.height / (count + 1));
            const active = vals ? vals[i] : 0;
            ctx.fillStyle = `rgba(${color}, ${0.2 + active * 0.8})`;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
            if (active > 0.5) {
                ctx.shadowBlur = 5;
                ctx.shadowColor = `rgb(${color})`;
            }
        }
    };

    // Very simplified neural map
    drawLayer(inputs, 20, null, '100, 100, 100');
    drawLayer(hidden, 100, brain.lastHidden, '0, 255, 100');
    drawLayer(outputs, 180, brain.lastOutputs, '255, 255, 255');
}

function reproduce(a, b) {
    const isExperienced = a.age > 1000 || (b.age && b.age > 1000);
    const mutationRate = isExperienced ? CONFIG.MUTATION * 0.5 : CONFIG.MUTATION;

    const childGenes = {};
    for (let key in a.genes) {
        const alleleA = a.genes[key][Math.floor(Math.random() * 2)];
        const alleleB = b.genes[key][Math.floor(Math.random() * 2)];
        childGenes[key] = [alleleA, alleleB];
        
        if (Math.random() < mutationRate) {
            const index = Math.floor(Math.random() * 2);
            childGenes[key][index] += (Math.random() - 0.5) * 0.3;
            childGenes[key][index] = Math.max(0, Math.min(1, childGenes[key][index]));
        }
    }

    const newChild = new Agent(a.pos.x, a.pos.y, null, childGenes, [a.id, b.id || 0]);
    
    // Inherit tribeMarker
    newChild.tribeMarker = (a.tribeMarker + (b.tribeMarker || a.tribeMarker)) / 2 + (Math.random() - 0.5) * 0.02;
    newChild.tribeMarker = Math.max(0, Math.min(1, newChild.tribeMarker));

    // Neural Crossover
    const childBrain = a.brain.copy();
    if (Math.random() > 0.5 && b.brain) childBrain.weights_ih = [...b.brain.weights_ih];
    childBrain.mutate(mutationRate);
    newChild.brain = childBrain;

    a.thoughtBubble = '❤️'; a.bubbleTimer = 40;
    return newChild;
}

function updateDashboard() {
    const total = agents.length;
    if (total === 0) return;

    document.getElementById('era-countdown').innerText = eraTimer;

    const avgLungs = agents.reduce((s, a) => s + a.phenotype.lungs, 0) / total;
    const avgSocial = agents.reduce((s, a) => s + a.signal, 0) / total;

    trendLand.style.width = (avgLungs * 100) + '%';
    trendSocial.style.width = (avgSocial * 100) + '%';
    
    // Update News Ticker
    const ticker = document.getElementById('news-ticker');
    if (planetaryNews.length > 0) {
        ticker.innerText = planetaryNews[0].msg;
        ticker.style.opacity = 1;
        planetaryNews[0].life--;
        if (planetaryNews[0].life <= 0) planetaryNews.shift();
    } else {
        ticker.innerText = "PLANETARY STATUS: NOMINAL";
    }

    // Hero Journal in Inspector
    if (selectedAgent && selectedAgent.journal) {
        let journalHTML = "<h3>LIFE HISTORY</h3>";
        selectedAgent.journal.forEach(e => journalHTML += `<p style="font-size:0.7rem; color: #aaa;">${e}</p>`);
        document.getElementById('ins-brain').innerHTML = journalHTML;
    }

    // 10. Leadership Election (Phase 17 Fix: Quantized Tribes)
    if (worldTime % 200 === 0) {
        const tribes = {};
        agents.forEach(a => {
            a.isLeader = false; // Reset
            const dnaKey = Math.round(a.tribeMarker * 10) / 10;
            if (!tribes[dnaKey]) tribes[dnaKey] = [];
            tribes[dnaKey].push(a);
        });

        for (let key in tribes) {
            const members = tribes[key];
            if (members.length >= 5) {
                // Register as a historic active tribe
                if (!activeTribesHistory.has(key)) {
                    activeTribesHistory.add(key);
                    logNarrative(`A new dominant species has emerged: Lineage ${key}`);
                }
                
                const elder = members.sort((a, b) => b.age - a.age)[0];
                if (elder) {
                    elder.isLeader = true;
                    if (Math.random() < 0.05) {
                        const type = elder.phenotype.spirituality > 0.6 ? "Religious" : "Rationalist";
                        logNarrative(`${type} Elder Emerges: ${elder.name} leads the tribe`);
                    }
                }
            }
        }
        
        // Extinction Check
        activeTribesHistory.forEach(key => {
            if (!tribes[key] || tribes[key].length === 0) {
                logNarrative(`EXTINCTION: Lineage ${key} has been wiped out forever.`);
                console.log(`%cEXTINCTION: Lineage ${key} wiped out forever`, "color: red; font-weight: bold;");
                activeTribesHistory.delete(key);
            }
        });

        if (avgLungs > 0.4) logEvent("Mutation: Limbs developing in coastal populations");
        if (total > 100) logEvent("Event: Tribal borders forming in Ocean Biome");
    }
}

function logEvent(msg) {
    const div = document.createElement('div');
    div.innerText = `> ${msg}`;
    logContent.prepend(div);
}

document.getElementById('climate-btn').addEventListener('click', () => {
    terrain.generate(); // Re-generate map (Climate shift)
    logEvent("CRITICAL: Planetary Climate Shift Initialized");
});

init();
