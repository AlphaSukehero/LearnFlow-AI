// LearnFlow AI Core Logic

class ContentAnalyzer {
    constructor() {}

    async analyze(text) {
        // Mocking an AI processing delay
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    topic: "Understanding Neural Networks",
                    difficulty: "Intermediate",
                    concepts: [
                        {
                            name: "Perceptron",
                            description: "The simplest artificial neuron model.",
                            why: "To mimic biological neurons mathematically.",
                            how: "Takes inputs, multiplies by weights, sums them, and passes through an activation function.",
                            analogy: "Like a committee voting on a decision where some members have more influence (weights).",
                            related: ["Weights", "Activation Function"]
                        },
                        {
                            name: "Backpropagation",
                            description: "The algorithm used to train neural networks.",
                            why: "Networks need a way to learn from errors.",
                            how: "Calculates the gradient of the loss function backward through the network to update weights.",
                            analogy: "Like a manager tracing a manufacturing defect backwards through the assembly line to fix the machine.",
                            related: ["Gradient Descent", "Loss Function"]
                        },
                        {
                            name: "Activation Function",
                            description: "A mathematical 'gate' in between the input and output of a neuron.",
                            why: "To introduce non-linearity, allowing the network to learn complex patterns.",
                            how: "Takes the summed weighted input and outputs a transformed value (e.g., ReLU outputs 0 if negative, otherwise the value itself).",
                            analogy: "Like a bouncer at a club who only lets you in if you pass a certain threshold of coolness.",
                            related: ["Perceptron"]
                        }
                    ],
                    misconceptions: [
                        {
                            name: "Neural Networks work exactly like the human brain",
                            why: "They are loosely inspired by the brain, but mathematically very different.",
                            truth: "They are mathematical optimization engines, not biological replicas."
                        }
                    ]
                });
            }, 2500);
        });
    }
}

class LearnFlowApp {
    constructor() {
        this.analyzer = new ContentAnalyzer();
        this.state = {
            currentData: null,
            currentMode: null,
            conceptIndex: 0
        };
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        // Views
        this.views = {
            input: document.getElementById('input-view'),
            processing: document.getElementById('processing-view'),
            menu: document.getElementById('menu-view'),
            chat: document.getElementById('chat-view')
        };

        // Inputs
        this.tabs = document.querySelectorAll('.tab');
        this.tabContents = document.querySelectorAll('.tab-content');
        this.analyzeBtn = document.getElementById('analyze-btn');
        
        // Menu Elements
        this.metaTitle = document.getElementById('meta-title');
        this.metaDifficulty = document.getElementById('meta-difficulty');
        this.metaConcepts = document.getElementById('meta-concepts');
        this.modeCards = document.querySelectorAll('.mode-card');
        
        // Chat Elements
        this.backBtn = document.getElementById('back-to-menu');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatForm = document.getElementById('chat-form');
        this.chatInput = document.getElementById('chat-input');
        this.currentModeBadge = document.getElementById('current-mode-badge');
    }

    bindEvents() {
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.tabs.forEach(t => t.classList.remove('active'));
                this.tabContents.forEach(c => c.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`${tab.dataset.target}-input-container`).classList.add('active');
            });
        });

        // Analyze button
        this.analyzeBtn.addEventListener('click', () => this.handleAnalyze());

        // Mode selection
        this.modeCards.forEach(card => {
            card.addEventListener('click', () => this.startMode(parseInt(card.dataset.mode)));
        });

        // Chat navigation
        this.backBtn.addEventListener('click', () => this.switchView('menu'));
        
        // Chat submission
        this.chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleChatSubmit();
        });
    }

    switchView(viewName) {
        Object.values(this.views).forEach(view => view.classList.remove('active'));
        this.views[viewName].classList.add('active');
    }

    async handleAnalyze() {
        // In a real app we'd validate inputs here
        this.switchView('processing');
        
        // Mock analysis
        this.state.currentData = await this.analyzer.analyze("mock input");
        
        // Update menu UI
        this.metaTitle.textContent = this.state.currentData.topic;
        this.metaDifficulty.textContent = this.state.currentData.difficulty;
        this.metaConcepts.textContent = `${this.state.currentData.concepts.length} Concepts`;
        
        this.switchView('menu');
    }

    startMode(modeId) {
        const modeNames = {
            1: "Deep Tutor", 2: "Exam Mode", 3: "Notes Mode", 
            4: "ADHD Mode", 5: "Socratic Mode", 6: "Prompt Mode", 7: "Weakness Scan"
        };
        
        this.state.currentMode = modeId;
        this.state.conceptIndex = 0;
        this.currentModeBadge.textContent = modeNames[modeId];
        this.chatMessages.innerHTML = ''; // Clear chat
        
        this.switchView('chat');
        this.initMode(modeId);
    }

    initMode(modeId) {
        if (modeId === 1) {
            this.addSystemMessage(`### Welcome to Deep Tutor Mode\n\nI'll explain ${this.state.currentData.topic} step-by-step. Type 'next' when you're ready for the first concept.`);
        } else if (modeId === 6) {
            this.generatePromptChain();
        } else if (modeId === 7) {
            this.generateWeaknessScan();
        } else {
            this.addSystemMessage("### Mode Initiated\n\nThis mode is actively under development in Phase 3/4. Try Deep Tutor [1], Prompt Chain [6], or Weakness Scan [7] for now.");
        }
    }

    handleChatSubmit() {
        const text = this.chatInput.value.trim();
        if (!text) return;
        
        this.addUserMessage(text);
        this.chatInput.value = '';
        
        if (text.toLowerCase() === 'menu') {
            this.switchView('menu');
            return;
        }

        // Simple routing for Deep Tutor logic
        if (this.state.currentMode === 1 && text.toLowerCase() === 'next') {
            if (this.state.conceptIndex < this.state.currentData.concepts.length) {
                const concept = this.state.currentData.concepts[this.state.conceptIndex];
                this.teachConcept(concept);
                this.state.conceptIndex++;
            } else {
                this.addSystemMessage("### Topic Complete!\n\nYou've learned all the concepts in this topic. Type 'menu' to choose another mode.");
            }
        } else {
            // Mock response
            setTimeout(() => {
                this.addSystemMessage("I'm analyzing your response. In a fully connected app, I'd provide personalized feedback right now. Type 'next' to continue.");
            }, 600);
        }
    }

    teachConcept(concept) {
        const html = `
            <h3>Concept: ${concept.name}</h3>
            <p><strong>What is it?</strong> ${concept.description}</p>
            <p><strong>Why it exists:</strong> ${concept.why}</p>
            <p><strong>How it works:</strong> ${concept.how}</p>
            <blockquote>💡 <strong>Analogy:</strong> ${concept.analogy}</blockquote>
            <p>Type <em>next</em> to continue to the next concept.</p>
        `;
        
        // Simulating typing delay
        setTimeout(() => {
            const div = document.createElement('div');
            div.className = 'message system';
            div.innerHTML = `<div class="message-content">${html}</div>`;
            this.chatMessages.appendChild(div);
            this.scrollToBottom();
        }, 500);
    }

    generatePromptChain() {
        const concepts = this.state.currentData.concepts;
        let chainHtml = `<h3>Master Index</h3><p>Total prompts: ${concepts.length}</p><ul>`;
        
        concepts.forEach((c, idx) => {
            chainHtml += `<li>Prompt ${idx+1} &rarr; ${c.name}</li>`;
        });
        chainHtml += `</ul><p>Generating self-contained prompts below...</p>`;
        
        this.addSystemMessage(chainHtml);

        concepts.forEach((c, idx) => {
            setTimeout(() => {
                const promptHtml = `
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-family: monospace; font-size: 0.85rem; margin-top: 10px;">
                    ┌─────────────────────────────────────┐<br>
                    │ PROMPT ${idx+1} of ${concepts.length}                       │<br>
                    │ Topic: ${c.name}                    │<br>
                    │ From: ${this.state.currentData.topic} │<br>
                    └─────────────────────────────────────┘<br><br>
                    You are an expert tutor. Teach me the following concept...<br>
                    CONCEPT: ${c.name}<br>
                    CONTEXT: We are learning about ${this.state.currentData.topic}.<br>
                    YOUR TASK:<br>
                    1. Explain what it is.<br>
                    2. Explain WHY it exists.<br>
                    3. How does it work?<br>
                    4. Give one strong analogy.<br>
                    5. How does it connect to ${c.related[0] || 'related topics'}?<br><br>
                    Ask me one conceptual question at the end.
                    </div>
                `;
                this.addSystemMessage(promptHtml);
            }, (idx + 1) * 800);
        });
    }

    generateWeaknessScan() {
        const weak = this.state.currentData.misconceptions[0];
        this.addSystemMessage(`
            <h3>Weakness Scan Complete</h3>
            <p>Based on our analysis, students most commonly misunderstand this concept:</p>
            <p><strong>Misconception:</strong> ${weak.name}</p>
            <p><strong>Why it happens:</strong> ${weak.why}</p>
            <p><strong>The Truth:</strong> ${weak.truth}</p>
            <br>
            <p>Would you like to try a practice question to test your intuition?</p>
        `);
    }

    addSystemMessage(html) {
        const div = document.createElement('div');
        div.className = 'message system';
        div.innerHTML = `<div class="message-content">${html}</div>`;
        this.chatMessages.appendChild(div);
        this.scrollToBottom();
    }

    addUserMessage(text) {
        const div = document.createElement('div');
        div.className = 'message user';
        div.innerHTML = `<div class="message-content"><p>${text}</p></div>`;
        this.chatMessages.appendChild(div);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new LearnFlowApp();
});
