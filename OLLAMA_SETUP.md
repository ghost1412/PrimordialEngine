# Ollama Configuration for Primordial Engine

Your current Ollama setup is **Correct** and ready for the simulation.

### Current Status
- **Host**: `http://127.0.0.1:11434`
- **CORS Allowed**: Yes (includes `http://localhost:*`)
- **Default Model**: `tinyllama`

### How to use
1. Run `run_simulation.bat` in this folder.
2. Open `http://localhost:8000` in your browser.
3. In the "GOD MODE" section (bottom left), click the **🔮 Consciousness** button.
4. Select any creature on the map.
5. Watch the "Neural Live-Map" and look for thought bubbles over the creature.

### If it doesn't work
If you see "Ollama not reached" in the browser console:
1. Ensure Ollama is actually running (`ollama serve`).
2. Make sure you have the `tinyllama` model:
   ```bash
   ollama pull tinyllama
   ```
3. Change the model in `ollama_brain.js` (line 8) if you want to use a different one (e.g., `llama3`).
