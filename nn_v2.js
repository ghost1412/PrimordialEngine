/**
 * Enhanced Neural Network for Primordial Engine
 * Includes social signal processing and biome awareness.
 */
class NeuralNetworkV2 {
    constructor(inputNodes = 10, hiddenNodes = 12, outputNodes = 4) {
        this.inputNodes = inputNodes;
        this.hiddenNodes = hiddenNodes;
        this.outputNodes = outputNodes;

        // Bias and Weight initialization
        this.weights_ih = this.randomMatrix(this.hiddenNodes, this.inputNodes);
        this.weights_ho = this.randomMatrix(this.outputNodes, this.hiddenNodes);
        this.bias_h = this.randomMatrix(this.hiddenNodes, 1);
        this.bias_o = this.randomMatrix(this.outputNodes, 1);
    }

    randomMatrix(rows, cols) {
        return Array.from({ length: rows }, () => 
            Array.from({ length: cols }, () => Math.random() * 2 - 1)
        );
    }

    predict(inputs, internalState) {
        // Combined inputs: external senses + internal emotions
        const combinedInputs = [...inputs, ...internalState];
        
        // Hidden Layer
        let hidden = this.dot(this.weights_ih, combinedInputs);
        hidden = this.add(hidden, this.bias_h);
        hidden = hidden.map(val => this.tanh(val));
        this.lastHidden = hidden;

        // Output Layer
        let outputs = this.dot(this.weights_ho, hidden);
        outputs = this.add(outputs, this.bias_o);
        outputs = outputs.map(val => this.sigmoid(val));
        this.lastOutputs = outputs;
        return outputs; // [throttle, turn, signal, emotion_shift]
    }

    // Activations
    tanh(x) { return Math.tanh(x); }
    sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

    // Math
    dot(w, inputs) {
        return w.map(row => row.reduce((sum, val, j) => sum + val * (inputs[j] || 0), 0));
    }

    add(a, b) {
        return a.map((val, i) => val + b[i][0]);
    }

    mutate(rate) {
        const mutation = (val) => (Math.random() < rate ? val + (Math.random() * 2 - 1) * 0.1 : val);
        this.weights_ih = this.weights_ih.map(row => row.map(mutation));
        this.weights_ho = this.weights_ho.map(row => row.map(mutation));
        this.bias_h = this.bias_h.map(row => row.map(mutation));
        this.bias_o = this.bias_o.map(row => row.map(mutation));
    }

    copy() {
        let n = new NeuralNetworkV2(this.inputNodes, this.hiddenNodes, this.outputNodes);
        n.weights_ih = JSON.parse(JSON.stringify(this.weights_ih));
        n.weights_ho = JSON.parse(JSON.stringify(this.weights_ho));
        n.bias_h = JSON.parse(JSON.stringify(this.bias_h));
        n.bias_o = JSON.parse(JSON.stringify(this.bias_o));
        return n;
    }
}
