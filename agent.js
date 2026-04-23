/**
 * Complex Agent for The Primordial Engine
 * Features organ-based survival, social signaling, and emotional states.
 */
class Agent {
    constructor(x, y, brain = null, genes = null, parents = []) {
        this.id = Math.random();
        this.parents = parents;
        this.pos = { x, y };
        this.vel = { x: 0, y: 0 };
        this.angle = Math.random() * Math.PI * 2;
        this.energy = 250;
        this.maxEnergy = 300; // Increased capacity
        this.age = 0;
        this.dead = false;
        this.cause = "";

        // Emotional System (Limbic State)
        this.emotions = {
            fear: 0,        // Induced by predators or drowning
            affection: 0,   // Induced by social tribes
            hunger: 0       // Induced by low energy
        };

        // Social
        this.signal = 0; 
        this.tribeMarker = Math.random();

        // Genes (Mendelian Double Alleles)
        this.genes = genes || {
            gills: [Math.random(), Math.random()],
            lungs: [Math.random(), Math.random()],
            fins: [Math.random(), Math.random()],
            legs: [Math.random(), Math.random()],
            size: [Math.random(), Math.random()],
            sense: [Math.random(), Math.random()],
            aggro: [Math.random(), Math.random()],
            diet: [Math.random(), Math.random()],
            spirituality: [Math.random(), Math.random()]
        };

        // Identity (Phase 16: The Soul)
        const syl = ["Ka", "Lo", "Mi", "Za", "Ru", "Te", "Vo", "Ni", "Xa", "Pe"];
        this.name = syl[Math.floor(Math.random() * syl.length)] + syl[Math.floor(Math.random() * syl.length)].toLowerCase();
        
        this.infected = 0; 
        this.immune = false;
        this.isLeader = false;
        this.thoughtBubble = "";
        this.bubbleTimer = 0;

        // === NEW: Biological Realism ===
        // Gender & Reproduction
        this.gender = Math.random() > 0.5 ? 'M' : 'F';
        this.pregnant = 0;        // Ticks until birth (females only)
        this.motherId = null;     // Who is my mother
        this.childIds = [];       // My living children
        
        // Sleep Cycle
        this.sleeping = false;
        
        // Spatial Memory (remembers last 3 food locations)
        this.foodMemory = [];
        
        // Chase State
        this.chaseTarget = null;

        // Expressed Traits (Phenotype)
        this.phenotype = {};
        for (let key in this.genes) {
            const a = this.genes[key][0] || 0.5;
            const b = this.genes[key][1] || 0.5;
            this.phenotype[key] = (a + b) / 2;
        }

        // Males are slightly larger, Females have better senses
        const genderMod = this.gender === 'M' ? 1.15 : 0.9;
        const senseMod = this.gender === 'F' ? 1.15 : 1.0;
        this.phenotype.size = (12 + (this.phenotype.size || 0.5) * 12) * genderMod;
        this.phenotype.sense = (180 + (this.phenotype.sense || 0.5) * 120) * senseMod;

        // Brain V2: 13 inputs (10 sensory + 3 emotional)
        this.brain = brain || new NeuralNetworkV2(13, 16, 4);
    }

    update(terrain, world) {
        this.age++;
        const inWater = terrain.isWater(this.pos.x, this.pos.y);
        
        // === SLEEP CYCLE ===
        const isNocturnal = this.phenotype.aggro > 0.6;
        if (world.isNight && !isNocturnal && this.energy > 30) {
            this.sleeping = true;
            this.energy -= 0.02; // Very low drain while sleeping
            // Can be woken by danger
            const neighborsList = world.getNeighbors ? world.getNeighbors(this.pos.x, this.pos.y, 50) : [];
            const danger = neighborsList.find(n => n !== this && n.phenotype.diet > 0.6 && Math.abs(n.tribeMarker - this.tribeMarker) > 0.1);
            if (danger) {
                this.sleeping = false; // WAKE UP!
                this.emotions.fear = 1.0;
            } else {
                // We keep moving with carry-over velocity but no new steering
                this.pos.x += this.vel.x;
                this.pos.y += this.vel.y;
                this.vel.x *= 0.9; this.vel.y *= 0.9;
                // Go to metabolism directly
            }
        } else {
            this.sleeping = false;
        }
        
        // === PREGNANCY ===
        if (this.pregnant > 0) {
            this.pregnant--;
            this.energy -= 0.03; // Extra cost of carrying
        }
        
        // === AGING EFFECTS ===
        const agingFactor = this.age > 3000 ? 1.5 : 1.0; // Elderly metabolize faster

        // 1. Calculate Emotions (Biological Feedback)
        let throttle = 0, turn = 0.5, broadcast = 0.5;
        let neighbors = [];
        let predator = null;

        if (!this.sleeping) {
            this.emotions.hunger = 1 - (this.energy / 150);
            neighbors = world.getNeighbors ? world.getNeighbors(this.pos.x, this.pos.y, this.phenotype.sense) : world.agents;
            predator = neighbors.find(n => n !== this && n.phenotype.diet > 0.6 && Math.abs(n.tribeMarker - this.tribeMarker) > 0.1);
            this.emotions.fear = predator ? 1.0 : (inWater === false && this.phenotype.lungs < 0.3 ? 0.8 : 0);
            
            const friend = neighbors.find(n => n !== this && Math.abs(n.tribeMarker - this.tribeMarker) < 0.1);
            this.emotions.affection = friend ? 0.8 : 0;

            // 2. Brain Decision + Possession Override
            const inputs = this.getInputs(world, inWater, neighbors);
            const emotionalState = [this.emotions.fear, this.emotions.affection, this.emotions.hunger];
            [throttle, turn, broadcast] = this.brain.predict(inputs, emotionalState);

            if (world.isPossessed && world.selectedId === this.id) {
                throttle = world.keys['w'] ? 1.0 : 0;
                turn = world.keys['a'] ? 0 : (world.keys['d'] ? 1 : 0.5);
                broadcast = world.keys['s'] ? 1.0 : 0.5;
            }

        // 2.1 SURVIVAL INSTINCTS — Multi-Sense System
        // Priority: FLEE > FORAGE > SOCIALIZE > WANDER
        
        // === SENSE 1: VISION (Forward cone, ±60°, reduced at night) ===
        const isNocturnalAgent = this.phenotype.aggro > 0.6;
        const visionRange = world.isNight ? (isNocturnalAgent ? this.phenotype.sense : this.phenotype.sense * 0.3) : this.phenotype.sense;
        const visionCone = Math.PI / 3; // ±60 degrees
        
        let nearestFoodPos = null;
        let nearestFoodDist = Infinity;
        let nearestPreyPos = null;
        let nearestPreyDist = Infinity;
        
        const isSated = this.energy > this.maxEnergy * 0.9 && this.energy > 120;
        
        // Scan food within vision cone (Only if hungry)
        if (!isSated) {
            for (const f of world.foods) {
                const dx = f.pos.x - this.pos.x;
                const dy = f.pos.y - this.pos.y;
                const d = Math.hypot(dx, dy);
                if (d < visionRange) {
                    const angleToFood = Math.atan2(dy, dx);
                    let angleDiff = angleToFood - this.angle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    
                    if (Math.abs(angleDiff) < visionCone && d < nearestFoodDist) {
                        nearestFoodDist = d;
                        nearestFoodPos = f.pos;
                    }
                }
            }
        }
        
        // Carnivores scan for PREY within vision cone (When hungry)
        if (this.phenotype.diet > 0.5 && this.energy < this.maxEnergy * 0.7) {
            for (const n of neighbors) {
                if (n === this || n.dead) continue;
                if (Math.abs(n.tribeMarker - this.tribeMarker) < 0.1) continue; // Don't eat tribe
                const dx = n.pos.x - this.pos.x;
                const dy = n.pos.y - this.pos.y;
                const d = Math.hypot(dx, dy);
                if (d < visionRange) {
                    const angleToTarget = Math.atan2(dy, dx);
                    let angleDiff = angleToTarget - this.angle;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    if (Math.abs(angleDiff) < visionCone && d < nearestPreyDist) {
                        nearestPreyDist = d;
                        nearestPreyPos = n.pos;
                    }
                }
            }
        }
        
        // === SENSE 2: SMELL (360°, reads pheromone grid) ===
        // If vision found nothing, sniff for trails (Only if hungry)
        if (!nearestFoodPos && !isSated && world.pheromoneGrid) {
            let bestSmellStrength = 0;
            let bestSmellAngle = this.angle;
            // Check 8 directions around the agent
            for (let i = 0; i < 8; i++) {
                const sniffAngle = (i / 8) * Math.PI * 2;
                const sniffX = Math.floor((this.pos.x + Math.cos(sniffAngle) * 40) / 20);
                const sniffY = Math.floor((this.pos.y + Math.sin(sniffAngle) * 40) / 20);
                if (world.pheromoneGrid[sniffY] && world.pheromoneGrid[sniffY][sniffX]) {
                    const scent = world.pheromoneGrid[sniffY][sniffX];
                    // Herbivores smell food trails (green), carnivores smell danger trails (red = recent kills = prey area)
                    const strength = this.phenotype.diet > 0.5 ? scent[1] : scent[0];
                    if (strength > bestSmellStrength) {
                        bestSmellStrength = strength;
                        bestSmellAngle = sniffAngle;
                    }
                }
            }
            if (bestSmellStrength > 0.1) {
                nearestFoodPos = {
                    x: this.pos.x + Math.cos(bestSmellAngle) * 40,
                    y: this.pos.y + Math.sin(bestSmellAngle) * 40
                };
            }
        }
        // === SENSE 3: SPATIAL MEMORY ===
        // If both vision and smell fail, recall last food location (Only if hungry)
        if (!nearestFoodPos && this.energy < this.maxEnergy * 0.5 && this.foodMemory.length > 0) {
            nearestFoodPos = this.foodMemory[this.foodMemory.length - 1];
        }
        
        // === DECISION ENGINE ===
        // Find children nearby (for parental care)
        const myChild = this.childIds.length > 0 ? 
            neighbors.find(n => this.childIds.includes(n.id) && n.age < 400) : null;
        
        if (this.emotions.fear > 0.5 && predator) {
            // 1. FLEE
            const fleeAngle = Math.atan2(this.pos.y - predator.pos.y, this.pos.x - predator.pos.x);
            this.angle = this.angle * 0.3 + fleeAngle * 0.7;
            throttle = 1.0;
            this.chaseTarget = null;
        } else if (myChild && this.energy > 30) {
            // 1.5 PARENTAL CARE: Stay near young child
            const childAngle = Math.atan2(myChild.pos.y - this.pos.y, myChild.pos.x - this.pos.x);
            const childDist = Math.hypot(myChild.pos.x - this.pos.x, myChild.pos.y - this.pos.y);
            if (childDist > 40) {
                this.angle = this.angle * 0.4 + childAngle * 0.6;
                throttle = 0.6;
            } else {
                // Near child — forage nearby
                if (nearestFoodPos) {
                    const foodAngle = Math.atan2(nearestFoodPos.y - this.pos.y, nearestFoodPos.x - this.pos.x);
                    this.angle = this.angle * 0.3 + foodAngle * 0.7;
                    throttle = 0.7;
                }
            }
            if (this.bubbleTimer <= 0) { this.thoughtBubble = '🛡️'; this.bubbleTimer = 60; }
        } else if (this.phenotype.diet > 0.5 && nearestPreyPos && this.energy < 80) {
            // 2a. HUNT (Carnivores chase prey)
            const huntAngle = Math.atan2(nearestPreyPos.y - this.pos.y, nearestPreyPos.x - this.pos.x);
            this.angle = this.angle * 0.2 + huntAngle * 0.8;
            throttle = 1.0;
            this.targetPos = nearestPreyPos;
            this.targetType = 'agent';
            this.chaseTarget = nearestPreyPos;
        } else if (this.energy < 100 && nearestFoodPos) {
            // 2b. FORAGE
            const foodAngle = Math.atan2(nearestFoodPos.y - this.pos.y, nearestFoodPos.x - this.pos.x);
            this.angle = this.angle * 0.2 + foodAngle * 0.8;
            throttle = 0.9;
            this.targetPos = nearestFoodPos;
            this.targetType = 'food';
            this.chaseTarget = null;
            if (this.foodMemory.length > 3) this.foodMemory.shift();
            this.foodMemory.push({...nearestFoodPos});
        } else if (this.energy > 50 && this.age > 100 && this.pregnant === 0) {
            // 2.5 MATING PURSUIT: Actively seek a partner
            const tribeThreshold = (worldTime < 3000 || world.agents.length < 80) ? 0.5 : 0.15;
            const mate = neighbors.find(n => 
                Math.abs(n.tribeMarker - this.tribeMarker) < tribeThreshold &&
                n.age > 100 && !n.dead && n.pregnant === 0
            );
            if (mate) {
                const mateAngle = Math.atan2(mate.pos.y - this.pos.y, mate.pos.x - this.pos.x);
                this.angle = this.angle * 0.1 + mateAngle * 0.9;
                throttle = 1.0;
                this.chaseTarget = mate.pos;
                if (this.bubbleTimer <= 0) { this.thoughtBubble = '💞'; this.bubbleTimer = 60; }
            } else {
                const tribeMate = neighbors.find(n => Math.abs(n.tribeMarker - this.tribeMarker) < 0.15);
                if (tribeMate) {
                    const socialAngle = Math.atan2(tribeMate.pos.y - this.pos.y, tribeMate.pos.x - this.pos.x);
                    this.angle = this.angle * 0.7 + socialAngle * 0.3;
                    throttle = 0.5;
                } else {
                    if (throttle < 0.2) throttle = 0.4;
                    this.angle += (turn - 0.5) * 0.1;
                }
            }
        } else {
            // 4. WANDER (Sweep head side-to-side like a real animal scanning)
            if (throttle < 0.2) throttle = 0.4;
            this.angle += Math.sin(worldTime * 0.03 + this.id * 100) * 0.08;
        }

        }

        // 3. Movement execution
        const speedMult = inWater ? this.phenotype.fins : this.phenotype.legs;
        // Bio-Rhythm (Day/Night influence)
        let bioSpeed = 1.0;
        if (world.isNight) {
            if (this.phenotype.aggro > 0.6) bioSpeed = 1.4; // Nocturnal Predator
            else if (this.phenotype.aggro < 0.4) bioSpeed = 0.4; // Sleeping Prey
        }

        const adrenaline = 1 + (this.emotions.fear * 0.4);
        let actualSpeed = (throttle - 0.1) * speedMult * adrenaline * bioSpeed;
        if (throttle === 0) actualSpeed = 0;
        
        this.vel.x = Math.cos(this.angle) * actualSpeed;
        this.vel.y = Math.sin(this.angle) * actualSpeed;
        
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;

        // 4. Enhanced Metabolism (Science: Cost of Life)
        let metabolism = 0.08; // Stabilized base burn
        if (world.temperature < 15 || world.temperature > 35) metabolism += 0.08; 
        
        // Size & Movement Penalties (Moving fast should be expensive!)
        metabolism += (this.phenotype.size / 20) * 0.08; 
        const speed = Math.hypot(this.vel.x, this.vel.y);
        metabolism += speed * 0.1; 

        if (inWater && this.phenotype.gills < 0.4) metabolism += 0.4; // Severe drowning
        if (!inWater && this.phenotype.lungs < 0.4) metabolism += 0.5; // Severe suffocation
        
        if (this.emotions.fear > 0.6) metabolism *= 2.5; // High stress adrenaline burn
        
        // CHILD PROTECTION: Juveniles burn 50% less energy to give them a chance
        if (this.age < 100) metabolism *= 0.5;
        
        this.energy -= metabolism;

        // 5. Epidemiology (Phase 12: Viral Loop)
        if (this.infected > 0 && !this.immune) {
            this.infected += 0.005;
            this.energy -= 0.05; // Virus burns energy
            if (this.infected > 1.0) {
                this.dead = true;
                this.cause = "Viral Plague";
            }
        } else if (this.age > 2000 && this.infected > 0) {
            this.immune = true;
            this.infected = 0;
            recordEvent(this, "Developed Natural Immunity to the Plague");
        }

        // Spread the contagion
        if (!this.immune && this.infected === 0 && Math.random() < 0.1) {
            const sickNeighbor = neighbors.find(n => n.infected > 0.5);
            if (sickNeighbor) this.infected = 0.1;
        }

        // Random Outbreak (Patient Zero)
        if (worldTime % 2000 === 0 && neighbors.length > 5 && Math.random() < 0.01) {
            this.infected = 0.1;
        }

        // 5.1 Pheromone Deposit (Chemical Scent Trails)
        const px = Math.floor(this.pos.x / 20); 
        const py = Math.floor(this.pos.y / 20);
        if (world.pheromoneGrid && world.pheromoneGrid[py] && world.pheromoneGrid[py][px]) {
            const p = world.pheromoneGrid[py][px];
            if (this.emotions.hunger > 0.6) p[0] += 0.05; // Green: Food trail
            if (this.emotions.fear > 0.6) p[1] += 0.1; // Red: Danger alert
            if (this.signal > 0.6) p[2] += 0.05; // Blue: Tribal path
        }

        // 6. Survival Check
        if (this.energy <= 0) {
            this.dead = true;
            this.cause = inWater ? (this.phenotype.gills < 0.4 ? "Drowned" : "Starvation") : (this.phenotype.lungs < 0.4 ? "Suffocated" : "Starvation");
        }
        if (this.age > 4000) { this.dead = true; this.cause = "Senescence"; }

        // 7. Swarm Intelligence & Leadership Following
        const socialNeighbors = world.getNeighbors(this.pos.x, this.pos.y, 60)
            .filter(n => n !== this && Math.abs(n.tribeMarker - this.tribeMarker) < 0.1);
        
        if (socialNeighbors.length > 0) {
            // Follow the Elder (if one exists nearby)
            const leader = socialNeighbors.find(n => n.isLeader);
            if (leader && !this.isLeader) {
                const leaderAngle = Math.atan2(leader.pos.y - this.pos.y, leader.pos.x - this.pos.x);
                this.angle = this.angle * 0.9 + leaderAngle * 0.1; // Gentle pull toward leader
            }
            
            // Alignment: match heading of tribe-mates
            socialNeighbors.forEach(n => {
                if (n.signal > 0.5) {
                    this.angle = this.angle * 0.95 + n.angle * 0.05;
                }
            });
        }

        // 7.1 Read Pheromones (Chemical Intelligence)
        if (world.pheromoneGrid) {
            // Check cell AHEAD of me
            const lookX = Math.floor((this.pos.x + Math.cos(this.angle) * 30) / 20);
            const lookY = Math.floor((this.pos.y + Math.sin(this.angle) * 30) / 20);
            if (world.pheromoneGrid[lookY] && world.pheromoneGrid[lookY][lookX]) {
                const ahead = world.pheromoneGrid[lookY][lookX];
                if (ahead[1] > 0.5) {
                    // RED ahead = Danger! Turn away
                    this.angle += Math.PI * 0.3;
                }
                if (ahead[0] > 0.3 && this.energy < 80) {
                    // GREEN ahead = Food! Keep going
                    // (already heading that way, just boost speed)
                }
            }
        }

        this.pos.x = Math.max(0, Math.min(world.width, this.pos.x));
        this.pos.y = Math.max(0, Math.min(world.height, this.pos.y));
    }

    getInputs(world, inWater, neighbors) {
        const nearestFood = this.findNearest(world.foods, this.phenotype.sense);
        const nearestAgent = this.findNearest(neighbors.filter(a => a !== this), this.phenotype.sense);

        // Store targets for Visual Intent (Clarity Fix)
        if (nearestFood && (!nearestAgent || nearestFood.dist < nearestAgent.dist)) {
            this.targetPos = nearestFood.target.pos;
            this.targetType = 'food';
        } else if (nearestAgent) {
            this.targetPos = nearestAgent.target.pos;
            this.targetType = 'agent';
        } else {
            this.targetPos = null;
        }

        return [
            nearestFood ? nearestFood.dist / this.phenotype.sense : 1,
            nearestFood ? nearestFood.angle : 0,
            nearestAgent ? nearestAgent.dist / this.phenotype.sense : 1,
            nearestAgent ? nearestAgent.angle : 0,
            nearestAgent ? nearestAgent.target.tribeMarker : 0,
            this.energy / 150,
            inWater ? 1 : 0,
            this.vel.x,
            this.vel.y,
            this.age / 4000
        ];
    }

    findNearest(list, range) {
        let nearest = null;
        let minDist = range;
        for (const item of list) {
            const d = Math.hypot(item.pos.x - this.pos.x, item.pos.y - this.pos.y);
            if (d < minDist) {
                minDist = d;
                nearest = { 
                    dist: d, 
                    angle: Math.atan2(item.pos.y - this.pos.y, item.pos.x - this.pos.x) - this.angle,
                    target: item
                };
            }
        }
        return nearest;
    }

    getAttractiveness() {
        return (this.phenotype.fins + this.phenotype.legs) * 0.2 + (this.signal * 2.0);
    }

    draw(ctx, isSelected, isNight) {
        // === SLEEP VISUAL ===
        if (this.sleeping) {
            ctx.save();
            ctx.translate(this.pos.x, this.pos.y);
            ctx.globalAlpha = 0.4;
            const r = Math.floor(this.phenotype.lungs * 255);
            const g = Math.floor(this.phenotype.gills * 255);
            const b = Math.floor(this.tribeMarker * 255);
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.phenotype.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
            // Closed eyes (horizontal lines)
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            const es = this.phenotype.size * 0.25;
            ctx.beginPath(); ctx.moveTo(es - 2, -es); ctx.lineTo(es + 2, -es); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(es - 2, es); ctx.lineTo(es + 2, es); ctx.stroke();
            // ZZZ
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
            ctx.fillText('💤', 5, -this.phenotype.size - 10);
            ctx.globalAlpha = 1;
            ctx.restore();
            return;
        }

        // === MATING FERVOR (Fertility Glow) ===
        const isFertile = this.age > 400 && this.energy > 60 && this.pregnant === 0;
        if (isFertile) {
            ctx.save();
            ctx.translate(this.pos.x, this.pos.y);
            ctx.beginPath();
            ctx.arc(0, 0, this.phenotype.size * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 105, 180, 0.15)'; // Soft pink glow
            ctx.fill();
            ctx.restore();
        }

        // === CHASE LINE (Visible Hunting) ===
        if (this.chaseTarget) {
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)';
            ctx.moveTo(this.pos.x, this.pos.y);
            ctx.lineTo(this.chaseTarget.x, this.chaseTarget.y);
            ctx.stroke();
            ctx.restore();
        }

        // Visual Intent (food line)
        if (this.targetPos && this.targetType === 'food') {
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([2, 5]);
            ctx.strokeStyle = "rgba(0, 255, 100, 0.15)";
            ctx.moveTo(this.pos.x, this.pos.y);
            ctx.lineTo(this.targetPos.x, this.targetPos.y);
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(this.pos.x, this.pos.y);

        const r = Math.floor(this.phenotype.lungs * 255);
        const g = Math.floor(this.phenotype.gills * 255);
        const b = Math.floor(this.tribeMarker * 255);
        const color = `rgba(${r}, ${g}, ${b}, ${Math.min(1, this.energy / 100)})`;

        // Nocturnal Bio-luminescence Glow
        if (isNight) {
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.phenotype.size * 3);
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, this.phenotype.size * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.rotate(this.angle);

        // 4. Procedural Anatomy & Morphogenesis (Phase 14: Life Stages)
        const isLarva = this.age < 500;
        const segments = isLarva ? 1 : 4;
        
        ctx.fillStyle = isLarva ? color.replace('1)', '0.5)') : color;
        for (let i = 0; i < segments; i++) {
            const size = isLarva ? (this.phenotype.size * 0.4) : this.phenotype.size * (1 - i * 0.2);
            const offset = i * (this.phenotype.size * 0.8);
            const x = -offset;
            const y = Math.sin(worldTime * 0.2 - i) * (Math.abs(this.vel.x) + Math.abs(this.vel.y)) * 2;
            
            ctx.beginPath();
            if (this.phenotype.diet > 0.6 && !isLarva) {
                // Serrated Hunter segments (Only for Adults)
                ctx.rect(x - size/2, y - size/2, size, size);
            } else {
                // Smooth Grazer/Larva segments
                ctx.arc(x, y, size, 0, Math.PI * 2);
            }
            ctx.fill();

            // 4.1 Draw Eyes on Head (Segment 0)
            if (i === 0) {
                const eyeSize = size * 0.3;
                const eyeOffset = size * 0.4;
                
                // Pupil Look Offset (Intelligent Gaze)
                let lx = 0, ly = 0;
                if (this.targetPos) {
                    const dx = this.targetPos.x - this.pos.x;
                    const dy = this.targetPos.y - this.pos.y;
                    const dist = Math.hypot(dx, dy);
                    lx = (dx / dist) * 2;
                    ly = (dy / dist) * 2;
                }

                ctx.fillStyle = "white";
                ctx.beginPath(); ctx.arc(eyeOffset, -eyeOffset, eyeSize, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(eyeOffset, eyeOffset, eyeSize, 0, Math.PI*2); ctx.fill();
                
                ctx.fillStyle = "black";
                ctx.beginPath(); ctx.arc(eyeOffset + lx, -eyeOffset + ly, eyeSize*0.5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(eyeOffset + lx, eyeOffset + ly, eyeSize*0.5, 0, Math.PI*2); ctx.fill();
            }
        }

        // 5. Thought Bubbles & Name (Visibility Update)
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = "black";
        
        if (this.bubbleTimer > 0) {
            ctx.font = "bold 14px Arial";
            ctx.fillStyle = "white";
            ctx.fillText(this.thoughtBubble, 0, -this.phenotype.size - 30);
            this.bubbleTimer--;
        }

        if (isSelected) {
            const genderSym = this.gender === 'M' ? '♂' : '♀';
            const pregSym = this.pregnant > 0 ? ' 🤰' : '';
            ctx.font = "bold 18px Space Grotesk";
            ctx.fillStyle = this.gender === 'M' ? "#00ccff" : "#ff69b4";
            ctx.fillText(`${genderSym} ${this.name.toUpperCase()}${pregSym}`, 0, -this.phenotype.size - 50);
        }
        ctx.restore();

        // 7. Tribal Leadership (The Elder)
        if (this.isLeader) {
            const isReligious = this.phenotype.spirituality > 0.6;
            ctx.save();
            ctx.shadowBlur = 15;
            ctx.shadowColor = isReligious ? "#ffcc00" : "#00f2ff";
            ctx.strokeStyle = isReligious ? "#ffcc00" : "#00f2ff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, this.phenotype.size + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            
            if (worldTime % 150 === 0) {
                this.thoughtBubble = isReligious ? "🙏 FOCUSING FAITH" : "⚙️ CALIBRATING";
                this.bubbleTimer = 60;
            }
        }
        
        // Selection Highlight
        if (isSelected) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.strokeRect(-this.phenotype.size-5, -this.phenotype.size-5, this.phenotype.size*2+10, this.phenotype.size*2+10);
        }

        if (this.age === 500) {
            recordEvent(this, "Metamorphosis: Reached Adulthood");
            playNote(800, 'sine', 0.1);
        }

        ctx.restore();
    }
}
