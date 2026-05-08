/* AI Chat, Hints, Topic Explainer, and Analysis */
const AI = {
    PROVIDER: 'n8n',
    isTyping: false,
    history: {},
    _composerBound: false,

    init() {
        this.PROVIDER = 'n8n';
        this._bindComposerOnce();
    },

    getSessionId() {
        if (!this._sessionId) {
            this._sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
        }
        return this._sessionId;
    },

    _escape(value) {
        const d = document.createElement('div');
        d.textContent = (value || '').toString();
        return d.innerHTML;
    },

    _formatMessage(value) {
        const safe = this._escape(value);
        return safe
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    },

    _messagesEl() {
        return document.getElementById('chat-messages');
    },

    _scrollChatToBottom() {
        const container = this._messagesEl();
        if (!container) return;
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    },

    updateSendButtonState() {
        const input = document.getElementById('chat-input');
        const btn = document.getElementById('chat-send');
        if (!btn) return;
        const empty = !input || !String(input.value || '').trim();
        btn.disabled = empty || this.isTyping;
    },

    _bindComposerOnce() {
        if (this._composerBound) return;

        const bind = () => {
            const input = document.getElementById('chat-input');
            const btn = document.getElementById('chat-send');
            if (!input || !btn) return;

            this._composerBound = true;
            input.addEventListener('input', () => this.updateSendButtonState());

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendFromInput();
                }
            });
            this.updateSendButtonState();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bind);
        } else {
            bind();
        }
    },

    onChatPageEnter() {
        this.updateSendButtonState();
        this.renderHistory();
        const input = document.getElementById('chat-input');
        if (input && !this.isTyping) input.focus();
    },

    sendFromInput() {
        const input = document.getElementById('chat-input');
        if (!input) return;
        this.send(input.value);
    },

    renderHistory() {
        const code = Store.getActiveSubject();
        const msgs = this.history[code] || [];
        const container = this._messagesEl();
        if (!container) return;

        container.innerHTML = '';
        if (msgs.length === 0) {
            this._renderWelcome();
        } else {
            msgs.forEach(m => this._renderMessage(m.text, m.role, false));
        }
        this._scrollChatToBottom();
    },

    _renderWelcome() {
        const container = this._messagesEl();
        if (!container) return;
        const code = Store.getActiveSubject();
        const subject = window.SubjectRegistry ? SubjectRegistry.get(code) : null;
        const subjectName = subject ? subject.name : 'your subjects';

        const welcome = document.createElement('div');
        welcome.className = 'chat-msg-row bot';
        welcome.innerHTML = `
            <div class="ai-msg bot">
                Hi! I'm your AI Tutor. Ask me anything about <strong>${this._escape(subjectName)}</strong> — concepts, exam answers, MCQs, study plans, or just say hi.
                <br><br>Tip: tap a quick chip below to get started.
            </div>`;
        container.appendChild(welcome);
    },

    /* --- Public: append a message and persist it --- */
    appendMessage(text, role, save = true) {
        return this._renderMessage(text, role, save);
    },

    _renderMessage(text, role, save = true) {
        const container = this._messagesEl();
        if (!container) return;

        const code = Store.getActiveSubject();
        if (save) {
            if (!this.history[code]) this.history[code] = [];
            this.history[code].push({ text, role });
            if (this.history[code].length > 50) this.history[code].shift();
        }

        const row = document.createElement('div');
        row.className = `chat-msg-row ${role}`;

        const bubble = document.createElement('div');
        bubble.className = `ai-msg ${role}`;
        bubble.innerHTML = this._formatMessage(text);
        row.appendChild(bubble);

        if (role === 'bot') {
            const actions = document.createElement('div');
            actions.className = 'chat-msg-actions';
            actions.innerHTML = `
                <button type="button" class="chat-msg-action" title="Copy" aria-label="Copy message" data-action="copy">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button type="button" class="chat-msg-action" title="Retry" aria-label="Retry" data-action="retry">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>`;
            actions.querySelector('[data-action="copy"]').addEventListener('click', () => this._copyMessage(text, actions.querySelector('[data-action="copy"]')));
            actions.querySelector('[data-action="retry"]').addEventListener('click', () => this._retryLast());
            row.appendChild(actions);
        }

        container.appendChild(row);
        this._scrollChatToBottom();

        if (!Store.getSettings().reducedMotion && window.gsap) {
            gsap.fromTo(row,
                { opacity: 0, y: 10 },
                { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' }
            );
        }

        return row;
    },

    async _copyMessage(text, btn) {
        try {
            await navigator.clipboard.writeText(text);
            if (btn) {
                btn.classList.add('copied');
                btn.setAttribute('title', 'Copied!');
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.setAttribute('title', 'Copy');
                }, 1500);
            }
            if (window.Utils) Utils.showToast('Copied to clipboard.', 'success');
        } catch {
            if (window.Utils) Utils.showToast('Copy failed.', 'error');
        }
    },

    _retryLast() {
        const code = Store.getActiveSubject();
        const msgs = this.history[code] || [];
        // Find the last user message and resend.
        for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'user') {
                const lastQuery = msgs[i].text;
                // Drop everything after that user message including the failed bot reply.
                this.history[code] = msgs.slice(0, i);
                this.renderHistory();
                this.send(lastQuery);
                return;
            }
        }
        if (window.Utils) Utils.showToast('No previous message to retry.', 'info');
    },

    clearChat() {
        const code = Store.getActiveSubject();
        if (!this.history[code] || this.history[code].length === 0) {
            this.renderHistory();
            return;
        }
        if (!confirm('Clear all messages in this chat?')) return;
        this.history[code] = [];
        this.renderHistory();
        if (window.Utils) Utils.showToast('Chat cleared.', 'info');
    },

    async send(text) {
        const message = String(text || '').trim();
        if (this.isTyping || !message) return;

        const now = Date.now();
        if (this._lastSendTime && now - this._lastSendTime < 1500) {
            Utils.showToast('Please wait a moment before sending another message.', 'warning');
            return;
        }
        this._lastSendTime = now;

        const input = document.getElementById('chat-input');
        const btn = document.getElementById('chat-send');

        this.isTyping = true;
        if (window.ThreeScene) window.ThreeScene.setAiThinking(true);
        if (input) { input.value = ''; input.disabled = true; }
        if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
        this.updateSendButtonState();

        this._renderMessage(message, 'user');

        const typingId = 'typing-' + Date.now();
        const container = this._messagesEl();
        let typingRow;
        if (container) {
            typingRow = document.createElement('div');
            typingRow.className = 'chat-msg-row bot';
            typingRow.id = typingId;
            typingRow.innerHTML = `<div class="ai-msg bot ai-msg-typing">AI Tutor is thinking</div>`;
            container.appendChild(typingRow);
            this._scrollChatToBottom();
        }

        try {
            const reply = await this._getReply(message);
            document.getElementById(typingId)?.remove();
            this._renderMessage(reply, 'bot');
        } catch (error) {
            console.error('AI Tutor request failed:', error);
            document.getElementById(typingId)?.remove();
            const subject = window.SubjectRegistry ? SubjectRegistry.get(Store.getActiveSubject()) : null;
            const offlineReply = this._getOfflineReply(message, subject);
            this._renderMessage(`AI Tutor is temporarily unavailable. Please try again in a few seconds.\n\n*Offline suggestion:*\n${offlineReply}`, 'bot');
        } finally {
            this.isTyping = false;
            if (window.ThreeScene) window.ThreeScene.setAiThinking(false);
            if (input) { input.disabled = false; input.focus(); }
            if (btn) { btn.style.opacity = '1'; }
            this.updateSendButtonState();
        }
    },

    quickAsk(text) {
        if (window.App && App.navigate) {
            if (App.currentPage !== 'chat') App.navigate('chat');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => this.send(text));
            });
        } else {
            this.send(text);
        }
    },

    askAboutNote(title) {
        this.quickAsk(`Can you explain the topic "${title}" in more detail?`);
    },

    applyChip(kind, btnEl) {
        const code = Store.getActiveSubject();
        const subject = window.SubjectRegistry ? SubjectRegistry.get(code) : null;
        const subjectName = subject ? subject.name : 'this subject';

        const prefixes = {
            explain: `Explain simply (in ${subjectName}): `,
            exam: `Give an exam-style answer (${subjectName}) for: `,
            summary: `Make short revision notes about: `,
            mcqs: `Create 5 MCQs with answers and brief explanations on: `,
            hinglish: `Explain in Hinglish (mix of Hindi & English) about: `
        };

        const fixed = {
            weak: 'What are my weak topics based on my recent quiz performance?',
            plan: `Give me a focused 7-day study plan for ${subjectName} including topics, time per day, and practice tasks.`
        };

        const input = document.getElementById('chat-input');
        if (!input) return;

        document.querySelectorAll('.chat-chip').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        if (fixed[kind]) {
            input.value = fixed[kind];
            input.focus();
            this.updateSendButtonState();
            return;
        }

        if (prefixes[kind]) {
            input.value = prefixes[kind];
            input.focus();
            // Place caret at end so user can append the topic
            const len = input.value.length;
            input.setSelectionRange(len, len);
            this.updateSendButtonState();
        }
    },

    async _getReply(text) {
        const code = Store.getActiveSubject();
        const subject = SubjectRegistry.get(code);
        const cacheKey = Utils.simpleHash(code + text);
        const cached = Store.getAiCache(cacheKey);
        if (cached) return cached;

        const context = subject ? subject.aiContext || subject.name : 'general studies';
        const reply = await this._callN8N({
            prompt: text,
            subjectCode: code,
            subjectName: subject?.name || code,
            context
        });

        Store.setAiCache(cacheKey, reply);
        return reply;
    },

    _getSemesterLabel(subjectCode) {
        if (!window.SemestersConfig) return 'Semester 2';
        const semester = SemestersConfig.find(sem => (sem.subjects || []).some(sub => {
            const mappedCode = window.SubjectMapping ? SubjectMapping.getRegistryCode(sub.code) : sub.code;
            return sub.code === subjectCode || mappedCode === subjectCode;
        }));
        return semester ? `Semester ${semester.id}` : 'Semester 2';
    },

    async _callN8N({ prompt, subjectCode, subjectName, context }) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        let response;
        try {
            response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.getSessionId(),
                    message: prompt,
                    subject: subjectName || 'General',
                    subjectCode: subjectCode || 'GENERAL',
                    semester: this._getSemesterLabel(subjectCode),
                    mode: 'Explain Simply',
                    source: 'lernio-ai-web',
                    context: {
                        subjectCode,
                        subjectName,
                        subjectContext: context,
                        page: window.App?.currentPage || 'chat'
                    }
                }),
                signal: controller.signal
            });
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('AI Tutor is temporarily unavailable. Please try again in a few seconds.');
            }
            throw new Error('AI Tutor is temporarily unavailable. Please try again in a few seconds.');
        } finally {
            clearTimeout(timeoutId);
        }

        let data;
        try {
            data = await response.json();
        } catch (_) {
            data = {};
        }

        if (!response.ok) {
            throw new Error(data?.error || 'AI Tutor is temporarily unavailable. Please try again in a few seconds.');
        }

        if (typeof data?.reply === 'string' && data.reply.trim()) return data.reply.trim();
        if (typeof data?.output === 'string' && data.output.trim()) return data.output.trim();
        if (typeof data?.text === 'string' && data.text.trim()) return data.text.trim();
        throw new Error('AI Tutor is temporarily unavailable. Please try again in a few seconds.');
    },

    _getOfflineReply(text, subject) {
        const q = text.toLowerCase();
        if (q.includes('hello') || q.includes('hi ') || q.startsWith('hi')) {
            return `Hello! I'm in offline mode right now. You can still search notes and practice available quizzes for ${subject ? subject.name : 'this course'}.`;
        }

        if (subject && subject.glossary) {
            for (const item of subject.glossary) {
                if (q.includes(item.term.toLowerCase())) return `**${item.term}**: ${item.def}`;
            }
        }

        return 'AI features are temporarily unavailable. Try the Notes search, review the linked PDFs, or practice the available MCQs.';
    }
};

window.AI = AI;
AI.init();
