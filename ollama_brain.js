/**
 * Ollama Consciousness Bridge
 * Allows agents to "think" using a local LLM.
 * Best used for high-level goals and narratives, not frame-by-frame movement.
 */

class OllamaBrain {
    constructor(model = "gemma3:12b") {
        this.model = model;
        this.endpoint = "http://127.0.0.1:11434/api/generate";
        this.isThinking = false;
        this.lastThought = "";
    }

    async think(agent, world) {
        if (this.isThinking) return null;
        this.isThinking = true;

        const neighbors = world.getNeighbors ? world.getNeighbors(agent.pos.x, agent.pos.y, agent.phenotype.sense) : [];
        const foodCount = neighbors.filter(n => n.type === 'food').length; // Fallback if foods aren't in neighbors
        const worldFoodCount = world.foods ? world.foods.filter(f => Math.hypot(f.pos.x - agent.pos.x, f.pos.y - agent.pos.y) < agent.phenotype.sense).length : 0;
        const totalFood = Math.max(foodCount, worldFoodCount);
        
        const friends = neighbors.filter(n => n !== agent && Math.abs(n.tribeMarker - agent.tribeMarker) < 0.1).length;
        const rivals = neighbors.filter(n => n !== agent && Math.abs(n.tribeMarker - agent.tribeMarker) > 0.1).length;

        const systemPrompt = `You are the consciousness of a primordial creature named "${agent.name}". 
        
        SOCIETAL ROLE: ${agent.role}
        - Farmer: I love the land. I must till fertile soil and plant crops.
        - Healer: I care for the sick. I must bring medicine to those with the Fever.
        - Soldier: I am the shield. I must drive away rivals and protect the tribe.
        - Hunter: I am the provider. I must catch prey and bring meat to the cache.
        - Gatherer: I collect. I must find food and medicinal herbs for the village.
        - Prophet: I am the spark. I must meditate and bless my kin.
        - Citizen: I am the seed of the future. I must survive and grow.

        CONTEXT:
        - Environment: ${world.isNight ? 'Night' : 'Day'}, Temperature ${world.temperature}°C.
        - Surrounding: ${totalFood} food sources nearby, ${friends} tribe-mates, ${rivals} potential rivals/predators.
        - Physicality: Genes: ${JSON.stringify(agent.phenotype)}.
        - Limbic State: Fear ${agent.emotions.fear.toFixed(2)}, Hunger ${agent.emotions.hunger.toFixed(2)}.
        - Energy: ${agent.energy.toFixed(0)}/300.
        
        GOAL: Fulfil your ROLE while ensuring survival.
        Respond with a short internal monologue (max 10 words) and ONE objective: WANDER, FORAGE, MATE, FIGHT, TEND_LAND, HEAL_TRIBE, or DEFEND.`;

        try {
            console.log("Ollama: Sending request to", this.endpoint, "with model", this.model);
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: systemPrompt,
                    stream: false
                })
            });

            if (!response.ok) {
                console.error("Ollama Error Response:", response.status, response.statusText);
                const errorText = await response.text();
                console.error("Ollama Error Body:", errorText);
                this.isThinking = false;
                return null;
            }

            const data = await response.json();
            this.isThinking = false;
            
            const content = data.response;
            this.lastThought = content;
            console.log("Ollama Thought:", content);
            
            // Basic parsing for the objective
            let objective = "WANDER";
            if (content.toUpperCase().includes("FORAGE")) objective = "FORAGE";
            if (content.toUpperCase().includes("MATE")) objective = "MATE";
            if (content.toUpperCase().includes("FIGHT")) objective = "FIGHT";
            if (content.toUpperCase().includes("TEND_LAND")) objective = "TEND_LAND";
            if (content.toUpperCase().includes("HEAL_TRIBE")) objective = "HEAL_TRIBE";
            if (content.toUpperCase().includes("DEFEND")) objective = "DEFEND";

            return { monologue: content, objective };
        } catch (e) {
            this.isThinking = false;
            console.warn("Ollama not reached. Ensure it's running locally on port 11434.");
            console.error(e);
            return null;
        }
    }
}
