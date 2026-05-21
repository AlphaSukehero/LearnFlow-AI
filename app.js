// LearnFlow AI Core Logic

class ContentAnalyzer {
    constructor() {}

    async analyze(text, url) {
        try {
            const response = await fetch('http://localhost:3001/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text, url })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Analysis failed");
            }
            
            return await response.json();
        } catch (err) {
            console.error("Error analyzing content:", err);
            throw err;
        }
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
        const urlInput = document.getElementById('youtube-url').value;
        const textInput = document.getElementById('raw-text').value;
        const activeTab = document.querySelector('.tab.active').dataset.target;
        
        let url = null;
        let text = null;
        
        if (activeTab === 'url') url = urlInput;
        else text = textInput;

        if (!url && !text) {
            alert("Please provide a URL or transcript.");
            return;
        }

        this.switchView('processing');
        
        try {
            this.state.currentData = await this.analyzer.analyze(text, url);
        } catch (err) {
            alert(err.message);
            this.switchView('input');
            return;
        }
        
        // Update menu UI
        this.metaTitle.textContent = this.state.currentData.topic || "Unknown Topic";
        this.metaDifficulty.textContent = this.state.currentData.difficulty || "Intermediate";
        this.metaConcepts.textContent = `${this.state.currentData.concepts?.length || 0} Concepts`;
        
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
