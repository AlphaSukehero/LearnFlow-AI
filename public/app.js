/**
 * LearnFlow AI — Frontend Application v2.1
 * All 8 modes powered by real Gemini AI backend with streaming
 */

const API_BASE = window.location.origin;

// ─── Simple Markdown Renderer ────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^(---|═══|───)$/gm, '<hr>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs - convert double newlines
    .replace(/\n\n/g, '</p><p>')
    // Single newlines in remaining text
    .replace(/\n/g, '<br>');

  // Wrap loose <li> in <ul>
  html = html.replace(/((<li>.*?<\/li>\s*<br>?)+)/g, '<ul>$1</ul>');
  html = html.replace(/<ul>\s*<br>/g, '<ul>');
  html = html.replace(/<br>\s*<\/ul>/g, '</ul>');

  return `<p>${html}</p>`;
}

// ─── LearnFlow Application ──────────────────────────────────────────
class LearnFlowApp {
  constructor() {
    this.state = {
      analysisData: null,
      currentMode: null,
      conceptIndex: 0,
      conversationHistory: [],
      isProcessing: false,
    };
    this.initElements();
    this.bindEvents();
    this.checkServerHealth();
  }

  initElements() {
    this.views = {
      input: document.getElementById('input-view'),
      processing: document.getElementById('processing-view'),
      menu: document.getElementById('menu-view'),
      chat: document.getElementById('chat-view'),
    };
    this.tabs = document.querySelectorAll('.tab');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.analyzeBtn = document.getElementById('analyze-btn');
    this.metaTitle = document.getElementById('meta-title');
    this.metaDifficulty = document.getElementById('meta-difficulty');
    this.metaConcepts = document.getElementById('meta-concepts');
    this.modeCards = document.querySelectorAll('.mode-card');
    this.backBtn = document.getElementById('back-to-menu');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatForm = document.getElementById('chat-form');
    this.chatInput = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('send-btn');
    this.currentModeBadge = document.getElementById('current-mode-badge');

    this.newTopicBtn = document.getElementById('new-topic-btn');
    this.loadingStatus = document.getElementById('loading-status');
    this.downloadBtn = document.getElementById('download-pdf-btn');
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

    this.analyzeBtn.addEventListener('click', () => this.handleAnalyze());
    this.modeCards.forEach(card => {
      card.addEventListener('click', () => this.startMode(parseInt(card.dataset.mode)));
    });
    this.backBtn.addEventListener('click', () => this.switchView('menu'));
    this.chatForm.addEventListener('submit', (e) => { e.preventDefault(); this.handleChatSubmit(); });
    if (this.newTopicBtn) {
      this.newTopicBtn.addEventListener('click', () => this.switchView('input'));
    }

    // Allow Enter to submit in chat
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleChatSubmit();
      }
    });

    // Download PDF
    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => this.downloadPDF());
    }
  }

  // ─── Server Health ────────────────────────────────────────────────
  async checkServerHealth() {
    const dot = document.querySelector('.status-dot');
    const txt = document.querySelector('.status-text');
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      const data = await res.json();
      if (data.status === 'ok') {
        dot.classList.add('online');
        dot.classList.remove('offline');
        txt.textContent = data.ai === 'connected' ? 'AI Online' : 'No API Key';
      }
    } catch {
      dot.classList.add('offline');
      txt.textContent = 'Server Offline';
    }
  }

  // ─── View Switching ───────────────────────────────────────────────
  switchView(name) {
    Object.values(this.views).forEach(v => v.classList.remove('active'));
    this.views[name].classList.add('active');
    // Toggle full-width for chat view
    const root = document.getElementById('app-root');
    if (name === 'chat') {
      root.classList.add('chat-active');
    } else {
      root.classList.remove('chat-active');
    }
  }

  // ─── Analyze Content ──────────────────────────────────────────────
  async handleAnalyze() {
    const activeTab = document.querySelector('.tab.active').dataset.target;
    const url = activeTab === 'url' ? document.getElementById('youtube-url').value.trim() : null;
    const text = activeTab === 'text' ? document.getElementById('raw-text').value.trim() : null;

    if (!url && !text) {
      this.showToast('Please provide a YouTube URL or paste text content.');
      return;
    }

    this.switchView('processing');
    this.loadingStatus.textContent = 'Analyzing content...';

    // Reset progress bar
    const progressWrap = document.getElementById('playlist-progress-wrap');
    const progressBar  = document.getElementById('playlist-progress-bar');
    const progressCount = document.getElementById('playlist-progress-count');
    const progressLabel = document.getElementById('playlist-progress-label');
    const progressVideo = document.getElementById('playlist-current-video');
    const loadingSub    = document.getElementById('loading-sub');
    progressWrap.style.display = 'none';
    progressBar.style.width = '0%';

    try {
      let analysisData;

      if (url && url.includes('list=')) {
        // ── PLAYLIST: use SSE for real-time progress ──────────────────
        analysisData = await new Promise((resolve, reject) => {
          progressWrap.style.display = 'block';
          loadingSub.textContent = 'Fetching playlist info...';

          const evtSource = new EventSource(`${API_BASE}/api/analyze-progress?url=${encodeURIComponent(url)}`);

          evtSource.onmessage = (e) => {
            const msg = JSON.parse(e.data);

            if (msg.type === 'cached') {
              evtSource.close();
              this.showToast('⚡ Loaded from cache (instant!)');
              resolve(msg.result);
            } else if (msg.type === 'playlist') {
              this.loadingStatus.textContent = `📋 "${msg.title}"`;
              loadingSub.textContent = `Processing ${msg.total} videos...`;
              progressCount.textContent = `0 / ${msg.total}`;
            } else if (msg.type === 'progress') {
              const pct = Math.round((msg.current / msg.total) * 100);
              progressBar.style.width = `${pct}%`;
              progressCount.textContent = `${msg.current} / ${msg.total}`;
              progressLabel.textContent = `Fetching transcripts...`;
              progressVideo.textContent = `▶ ${msg.title}`;
            } else if (msg.type === 'analyzing') {
              progressBar.style.width = '100%';
              this.loadingStatus.textContent = 'Running AI analysis...';
              loadingSub.textContent = 'Almost done — extracting key insights from the playlist...';
              progressVideo.textContent = '';
            } else if (msg.type === 'done') {
              evtSource.close();
              resolve(msg.result);
            } else if (msg.type === 'error') {
              evtSource.close();
              reject(new Error(msg.message));
            }
          };

          evtSource.onerror = () => {
            evtSource.close();
            reject(new Error('Connection to server lost during playlist processing.'));
          };
        });

      } else {
        // ── SINGLE VIDEO / TEXT: fast POST ───────────────────────────
        loadingSub.textContent = 'AI is extracting concepts, mapping knowledge, and identifying confusion points.';
        const res = await fetch(`${API_BASE}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, text }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Analysis failed');
        }

        const data = await res.json();
        if (data._cached) this.showToast('⚡ Loaded from cache (instant!)');
        analysisData = data;
      }

      this.state.analysisData = analysisData;

      // Update menu UI
      this.metaTitle.textContent = this.state.analysisData.topic || 'Unknown Topic';
      this.metaDifficulty.textContent = this.state.analysisData.difficulty || 'Intermediate';
      this.metaConcepts.textContent = `${this.state.analysisData.concepts?.length || 0} Concepts`;
      this.switchView('menu');
    } catch (err) {
      this.showToast(err.message);
      this.switchView('input');
    }
  }

  // ─── Start a Learning Mode ────────────────────────────────────────
  startMode(modeId) {
    const modeNames = {
      1: 'Deep Tutor', 2: 'Exam Mode', 3: 'Notes Mode',
      4: 'ADHD Mode', 5: 'Socratic Mode', 6: 'Prompt Chain',
      7: 'Weakness Scan', 8: 'Final Summary'
    };

    this.state.currentMode = modeId;
    this.state.conceptIndex = 0;
    this.state.conversationHistory = [];
    this.currentModeBadge.textContent = modeNames[modeId];
    this.chatMessages.innerHTML = '';

    this.switchView('chat');

    // Send initial empty message to get mode's opening
    this.sendToAI(null);
  }

  // ─── Chat Submit ──────────────────────────────────────────────────
  handleChatSubmit() {
    const text = this.chatInput.value.trim();
    if (!text || this.state.isProcessing) return;

    // Handle special commands
    if (text.toLowerCase() === 'menu') {
      this.switchView('menu');
      this.chatInput.value = '';
      return;
    }

    this.addUserMessage(text);
    this.chatInput.value = '';

    // Track "next" for Deep Tutor / ADHD concept advancement
    if ((this.state.currentMode === 1 || this.state.currentMode === 4) && text.toLowerCase() === 'next') {
      this.state.conceptIndex++;
    }

    this.sendToAI(text);
  }

  // ─── Send to Backend AI (Streaming) ───────────────────────────────
  async sendToAI(userMessage) {
    this.state.isProcessing = true;
    this.setSendEnabled(false);
    this.showTypingIndicator();

    try {
      const payload = {
        mode: this.state.currentMode,
        analysisData: this.state.analysisData,
        userMessage: userMessage,
        conversationHistory: this.state.conversationHistory,
        conceptIndex: this.state.conceptIndex,
      };

      // Try streaming first
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      this.removeTypingIndicator();

      if (!res.ok || !res.body) {
        // Fallback to non-streaming
        return await this.sendToAIFallback(userMessage, payload);
      }

      // Create the message container immediately and scroll to its TOP
      const { div, contentEl, rawTextRef } = this.createStreamingMessage();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === 'chunk') {
              fullText += msg.text;
              contentEl.innerHTML = renderMarkdown(fullText);
              this.renderMath(contentEl);
              // Keep scrolling to bottom as content streams in
              this.scrollToBottom();
            } else if (msg.type === 'error') {
              fullText = `⚠️ **Error:** ${msg.message}\n\nPlease try again or type 'menu' to go back.`;
              contentEl.innerHTML = renderMarkdown(fullText);
            }
          } catch (_) {}
        }
      }

      // Update raw text reference for copy button
      rawTextRef.text = fullText;

      // Track conversation
      if (userMessage) {
        this.state.conversationHistory.push({ role: 'user', content: userMessage });
      }
      if (fullText) {
        this.state.conversationHistory.push({ role: 'assistant', content: fullText });
      }

      // Scroll to TOP of the AI message so user reads from the beginning
      this.scrollToMessageTop(div);

    } catch (err) {
      this.removeTypingIndicator();
      this.addSystemMessage(`⚠️ **Error:** ${err.message}\n\nPlease try again or type 'menu' to go back.`);
    } finally {
      this.state.isProcessing = false;
      this.setSendEnabled(true);
      this.chatInput.focus();
    }
  }

  // ─── Non-streaming fallback ───────────────────────────────────────
  async sendToAIFallback(userMessage, payload) {
    this.showTypingIndicator();
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      this.removeTypingIndicator();

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI failed to respond');
      }

      const data = await res.json();

      if (userMessage) {
        this.state.conversationHistory.push({ role: 'user', content: userMessage });
      }
      this.state.conversationHistory.push({ role: 'assistant', content: data.response });

      const msgDiv = this.addSystemMessage(data.response);
      // Scroll to TOP of the message so user reads from beginning
      this.scrollToMessageTop(msgDiv);
    } catch (err) {
      this.removeTypingIndicator();
      this.addSystemMessage(`⚠️ **Error:** ${err.message}\n\nPlease try again or type 'menu' to go back.`);
    } finally {
      this.state.isProcessing = false;
      this.setSendEnabled(true);
      this.chatInput.focus();
    }
  }

  // ─── UI Helpers ───────────────────────────────────────────────────
  createStreamingMessage() {
    const div = document.createElement('div');
    div.className = 'message system';
    const rawTextRef = { text: '' };
    div.innerHTML = `<div class="message-content"><p></p></div>
      <div class="msg-actions">
        <button class="copy-btn" aria-label="Copy message">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy</span>
        </button>
      </div>`;
    const copyBtn = div.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => this.copyMessageText(copyBtn, rawTextRef.text));
    this.chatMessages.appendChild(div);
    const contentEl = div.querySelector('.message-content');
    return { div, contentEl, rawTextRef };
  }

  addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message system';
    const rawText = text || '';
    div.innerHTML = `<div class="message-content">${renderMarkdown(rawText)}</div>
      <div class="msg-actions">
        <button class="copy-btn" aria-label="Copy message">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy</span>
        </button>
      </div>`;
    // Attach copy handler
    const copyBtn = div.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => this.copyMessageText(copyBtn, rawText));
    this.chatMessages.appendChild(div);
    this.renderMath(div);
    this.scrollToBottom();
    return div;
  }

  renderMath(element) {
    if (window.renderMathInElement) {
      window.renderMathInElement(element, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '\\[', right: '\\]', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\(', right: '\\)', display: false}
        ],
        throwOnError: false
      });
    }
  }

  addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `<div class="message-content"><p>${this.escapeHtml(text)}</p></div>`;
    this.chatMessages.appendChild(div);
    this.scrollToBottom();
  }

  showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message system typing-msg';
    div.innerHTML = `<div class="message-content typing-indicator">
      <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
    </div>`;
    this.chatMessages.appendChild(div);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const el = this.chatMessages.querySelector('.typing-msg');
    if (el) el.remove();
  }

  setSendEnabled(enabled) {
    this.sendBtn.disabled = !enabled;
    this.chatInput.disabled = !enabled;
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    });
  }

  // Scroll so the TOP of a message div is visible (not the bottom)
  scrollToMessageTop(msgDiv) {
    if (!msgDiv) return;
    requestAnimationFrame(() => {
      // Scroll the chat container so this message's top is visible
      const containerRect = this.chatMessages.getBoundingClientRect();
      const msgRect = msgDiv.getBoundingClientRect();
      const scrollOffset = msgRect.top - containerRect.top + this.chatMessages.scrollTop;
      // Add a small offset so the message isn't flush with the very top
      this.chatMessages.scrollTo({ top: scrollOffset - 12, behavior: 'smooth' });
    });
  }

  escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  showToast(message) {
    // Create a proper toast instead of alert
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  copyMessageText(btn, rawText) {
    // Strip markdown for clean clipboard text
    const clean = rawText
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^#{1,3} /gm, '')
      .replace(/^> /gm, '')
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim())
      .replace(/`([^`]+)`/g, '$1');

    navigator.clipboard.writeText(clean).then(() => {
      const label = btn.querySelector('span');
      btn.classList.add('copied');
      label.textContent = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        label.textContent = 'Copy';
      }, 2000);
    }).catch(() => {
      // Fallback for non-https
      const ta = document.createElement('textarea');
      ta.value = clean;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      const label = btn.querySelector('span');
      btn.classList.add('copied');
      label.textContent = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        label.textContent = 'Copy';
      }, 2000);
    });
  }

  downloadPDF() {
    const modeNames = {
      1: 'Deep Tutor', 2: 'Exam Mode', 3: 'Notes Mode',
      4: 'ADHD Mode', 5: 'Socratic Mode', 6: 'Prompt Chain',
      7: 'Weakness Scan', 8: 'Final Summary'
    };
    const modeName = modeNames[this.state.currentMode] || 'Session';
    const topic = this.state.analysisData?.topic || 'LearnFlow AI';

    if (this.state.conversationHistory.length === 0) {
      this.showToast('No conversation to download yet.');
      return;
    }

    const printWin = window.open('', '_blank');
    printWin.document.write(`<!DOCTYPE html><html><head><title>${modeName} - ${topic}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a2e; line-height: 1.7; max-width: 800px; margin: 0 auto; }
        h1 { font-size: 22px; color: #8B5CF6; border-bottom: 2px solid #8B5CF6; padding-bottom: 8px; margin-bottom: 4px; }
        .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
        .msg { margin-bottom: 20px; padding: 14px 18px; border-radius: 10px; page-break-inside: avoid; }
        .msg-ai { background: #f4f1fe; border-left: 4px solid #8B5CF6; }
        .msg-user { background: #e8f4fd; border-left: 4px solid #3B82F6; }
        .role { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
        .role-ai { color: #8B5CF6; }
        .role-user { color: #3B82F6; }
        .content { font-size: 14px; white-space: pre-wrap; word-wrap: break-word; }
        .footer { text-align: center; color: #999; font-size: 11px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 12px; }
        @media print { body { padding: 20px; } .msg { break-inside: avoid; } }
      </style>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"><\/script>
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"><\/script>
      <script>
        window.onload = function() {
          if(window.renderMathInElement) {
            renderMathInElement(document.body, {
              delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '\\\\[', right: '\\\\]', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\\\(', right: '\\\\)', display: false}
              ],
              throwOnError: false
            });
          }
          setTimeout(function(){ window.print(); }, 500);
        };
      <\/script>
      </head><body>
      <h1>${this.escapeHtml(modeName)}</h1>
      <div class="meta">Topic: ${this.escapeHtml(topic)} &nbsp;|&nbsp; ${new Date().toLocaleString()}</div>`);

    this.state.conversationHistory.forEach(msg => {
      const isUser = msg.role === 'user';
      const cls = isUser ? 'msg-user' : 'msg-ai';
      const roleCls = isUser ? 'role-user' : 'role-ai';
      const label = isUser ? 'You' : 'AI Tutor';
      const clean = msg.content
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/^#{1,3} /gm, '')
        .replace(/^> /gm, '')
        .replace(/`([^`]+)`/g, '$1');
      printWin.document.write(`<div class="msg ${cls}"><div class="role ${roleCls}">${label}</div><div class="content">${this.escapeHtml(clean)}</div></div>`);
    });

    printWin.document.write(`<div class="footer">Generated by LearnFlow AI</div></body></html>`);
    printWin.document.close();
  }
}

// ─── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LearnFlowApp();
});
