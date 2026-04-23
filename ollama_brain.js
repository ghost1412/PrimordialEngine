/**
 * Ollama Consciousness Bridge
 * Allows agents to "think" using a local LLM.
 * Best used for high-level goals and narratives, not frame-by-frame movement.
 */

class OllamaBrain {
    constructor(model = "tinyllama") {
        this.model = model;
        this.endpoint = "http://localhost:11434/api/chat";
        this.isThinking = false;
        this.lastThought = "";
    }

    async think(agent, world) {
        if (this.isThinking) return null;
        this.isThinking = true;

        const systemPrompt = `You are the consciousness of a primordial creature named ${agent.name}. 
        You are in a 2D ecosystem. Your goal is survival and tribal dominance.
        Genes: ${JSON.stringify(agent.phenotype)}.
        Emotions: Fear ${agent.emotions.fear.toFixed(2)}, Hunger ${agent.emotions.hunger.toFixed(2)}.
        Energy: ${agent.energy.toFixed(0)}.
        Respond with a short internal monologue (max 10 words) and ONE objective: WANDER, FORAGE, MATE, or FIGHT.`;

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'system', content: systemPrompt }],
                    stream: false
                })
            });

            const data = await response.json();
            this.isThinking = false;
            
            const content = data.message.content;
            this.lastThought = content;
            
            // Basic parsing for the objective
            let objective = "WANDER";
            if (content.toUpperCase().includes("FORAGE")) objective = "FORAGE";
            if (content.toUpperCase().includes("MATE")) objective = "MATE";
            if (content.toUpperCase().includes("FIGHT")) objective = "FIGHT";

            return { monologue: content, objective };
        } catch (e) {
            this.isThinking = false;
            console.warn("Ollama not reached. Ensure it's running locally on port 11434.");
            return null;
        }
    }
}
