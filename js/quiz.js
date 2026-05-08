/* ============================================================
   QUIZ - Quiz engine with all modes
   ============================================================ */
const Quiz = {
    pool: [],
    currentIdx: 0,
    score: 0,
    totalQ: 25,
    wrongCount: 0,
    correctCount: 0,
    mode: 'practice',
    selectedUnit: 'all',
    wrongTopics: {},
    correctTopics: {},
    flagged: new Set(),
    answers: [],
    timerInterval: null,
    timeLeft: 0,
    timerEnabled: false,
    unitStats: {},
    hasNegativeMarking: false,
    hintLoading: false,
    hintRequestId: 0,
    currentOptions: [],

    render() {
        const el = document.getElementById('page-quiz');
        const quizSubjects = SubjectRegistry.getAll().filter(s => s.questions && s.questions.length > 0);
        let code = Store.getActiveSubject();

        if (!quizSubjects.some(s => s.code === code) && quizSubjects.length) {
            code = quizSubjects[0].code;
            Store.setActiveSubject(code);
        }

        const subject = SubjectRegistry.get(code);
        if (!subject) {
            el.innerHTML = '<div class="empty-state"><p>No subject selected.</p></div>';
            return;
        }

        const subjectButtons = quizSubjects.map(s => `
            <button class="btn btn-ghost btn-sm ${code === s.code ? 'active' : ''}" onclick="Quiz.switchSubject('${s.code}')" style="${code === s.code ? 'background: var(--primary); color: white;' : ''}">
                ${Utils.escHtml(s.name)}
            </button>
        `).join('');

        el.innerHTML = `
        <div id="quiz-setup" class="quiz-setup glass-card">
            <h2>Configure Your Quiz</h2>
            <div class="subject-quick-switch" style="margin-bottom: var(--sp-4); display: flex; flex-wrap: wrap; gap: var(--sp-2);">
                ${subjectButtons}
            </div>
            <p class="setup-desc">Customize your learning experience for <strong>${subject.name}</strong></p>
            <div class="setup-options">
                <div class="setup-row">
                    <div class="form-group">
                        <label class="form-label">Unit</label>
                        <select class="form-select" id="quiz-unit-select">
                            <option value="all">All Units</option>
                            ${(subject.units || []).map(u => `<option value="${u.id}">Unit ${u.id} - ${Utils.escHtml(u.title)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Questions</label>
                        <select class="form-select" id="quiz-count-select">
                            <option value="5">5 Questions</option>
                            <option value="10">10 Questions</option>
                            <option value="15">15 Questions</option>
                            <option value="25" selected>25 Questions</option>
                            <option value="70">70 Questions</option>
                        </select>
                    </div>
                </div>
                <div class="setup-row">
                    <div class="form-group">
                        <label class="form-label">Difficulty</label>
                        <select class="form-select" id="quiz-diff-select">
                            <option value="all">All Levels</option>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Timer (minutes)</label>
                        <select class="form-select" id="quiz-timer-select">
                            <option value="0">No Timer</option>
                            <option value="15">15 min</option>
                            <option value="30">30 min</option>
                            <option value="45">45 min</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Mode</label>
                    <div class="radio-group">
                        <label class="radio-label"><input type="radio" name="qmode" value="practice" checked><span><strong>Practice</strong> - Hints, explanations, retries</span></label>
                        <label class="radio-label"><input type="radio" name="qmode" value="exam"><span><strong>Exam</strong> - Strict, no hints</span></label>
                    </div>
                </div>
                <div class="form-group" style="margin-top:var(--sp-2)">
                    <label class="toggle-wrap">
                        <input type="checkbox" id="quiz-negative-marking">
                        <div class="toggle-switch"></div>
                        <span>Enable Negative Marking (-0.25 per wrong answer)</span>
                    </label>
                </div>
            </div>
            <div class="setup-actions">
                <button class="btn btn-primary btn-lg" onclick="Quiz.begin()">Start Quiz</button>
                <button class="btn btn-secondary" onclick="App.navigate('dashboard')">Back</button>
            </div>
        </div>
        <div id="quiz-active" style="display:none" class="quiz-active-wrap"></div>
        <div id="quiz-result" style="display:none"></div>`;

        requestAnimationFrame(() => {
            if (Store.getSettings().reducedMotion) return;
            gsap.fromTo('.quiz-setup', { opacity: 0, scale: 0.95, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: 'back.out(1.3)' });
            gsap.fromTo('.quiz-setup h2', { opacity: 0, y: -20 }, { opacity: 1, y: 0, delay: 0.15 });
            gsap.fromTo('.setup-options', { opacity: 0, y: 20 }, { opacity: 1, y: 0, delay: 0.25 });
            gsap.fromTo('.setup-actions .btn', { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.08, ease: 'back.out(2)', delay: 0.4 });
        });
    },

    begin() {
        const code = Store.getActiveSubject();
        this.selectedUnit = document.getElementById('quiz-unit-select').value;
        this.totalQ = parseInt(document.getElementById('quiz-count-select').value, 10);
        this.mode = document.querySelector('input[name=qmode]:checked').value;
        const diff = document.getElementById('quiz-diff-select').value;
        const timer = parseInt(document.getElementById('quiz-timer-select').value, 10);
        this.hasNegativeMarking = document.getElementById('quiz-negative-marking')?.checked || false;

        let pool = SubjectRegistry.getQuestions(code, {
            unit: this.selectedUnit,
            difficulty: diff !== 'all' ? diff : undefined
        });

        if (pool.length === 0) {
            Utils.showToast('No questions found for this filter.', 'error');
            return;
        }

        Utils.shuffle(pool);
        this.pool = pool.slice(0, Math.min(this.totalQ, pool.length));
        this.totalQ = this.pool.length;
        this.currentIdx = 0;
        this.score = 0;
        this.wrongCount = 0;
        this.correctCount = 0;
        this.wrongTopics = {};
        this.correctTopics = {};
        this.flagged = new Set();
        this.answers = [];
        this.unitStats = {};
        this.timerEnabled = timer > 0;
        this.timeLeft = timer * 60;
        this.hintLoading = false;
        this.hintRequestId = 0;
        this.currentOptions = [];

        document.getElementById('quiz-setup').style.display = 'none';
        document.getElementById('quiz-active').style.display = 'block';
        document.getElementById('quiz-result').style.display = 'none';

        if (this.timerEnabled) this._startTimer();
        this.renderQ();
    },

    startQuick(count) {
        App.navigate('quiz');
        setTimeout(() => {
            const countSelect = document.getElementById('quiz-count-select');
            if (countSelect) countSelect.value = count;
            this.begin();
        }, 100);
    },

    startAdaptive() {
        const code = Store.getActiveSubject();
        const perf = Store.getPerformance(code);
        App.navigate('quiz');

        setTimeout(() => {
            if (perf && perf.unitStats) {
                const weakUnits = Object.entries(perf.unitStats)
                    .filter(([, stats]) => stats.total > 0 && (stats.correct / stats.total) < 0.7)
                    .map(([unit]) => unit);

                if (weakUnits.length > 0) {
                    let pool = SubjectRegistry.getQuestions(code, {});
                    pool = pool.filter(q => weakUnits.some(unit => unit.includes('Unit ' + q.unit)));
                    if (pool.length >= 5) {
                        Utils.shuffle(pool);
                        this.pool = pool.slice(0, 10);
                        this.totalQ = this.pool.length;
                        this.currentIdx = 0;
                        this.score = 0;
                        this.wrongCount = 0;
                        this.correctCount = 0;
                        this.mode = 'practice';
                        this.wrongTopics = {};
                        this.correctTopics = {};
                        this.flagged = new Set();
                        this.answers = [];
                        this.unitStats = {};
                        this.timerEnabled = false;
                        this.hasNegativeMarking = false;
                        this.hintLoading = false;
                        this.hintRequestId = 0;
                        this.currentOptions = [];
                        document.getElementById('quiz-setup').style.display = 'none';
                        document.getElementById('quiz-active').style.display = 'block';
                        document.getElementById('quiz-result').style.display = 'none';
                        this.renderQ();
                        return;
                    }
                }
            }

            this.begin();
        }, 100);
    },

    renderQ() {
        const q = this.pool[this.currentIdx];
        if (!q) {
            this.showResult();
            return;
        }

        const wrap = document.getElementById('quiz-active');
        const rawOptions = Array.isArray(q.opts) ? q.opts : (Array.isArray(q.options) ? q.options : []);
        let opts = rawOptions.map((text, i) => ({
            text,
            correct: i === q.ans || i === q.correctAnswer
        }));

        if (!opts.length) {
            Utils.showToast('This question has no answer options, so it was skipped.', 'warning');
            this.skipQuestion();
            return;
        }

        Utils.shuffle(opts);
        this.currentOptions = opts.map(option => option.text);
        this.hintLoading = false;
        this.hintRequestId += 1;
        const labels = ['A', 'B', 'C', 'D'];
        const isFlagged = this.flagged.has(this.currentIdx);

        wrap.innerHTML = `<div class="glass-card quiz-box">
            <div class="quiz-top">
                <div class="quiz-meta">
                    <span class="badge badge-primary">Unit ${q.unit}</span>
                    <span class="badge badge-ghost">${q.topic}</span>
                    ${q.difficulty ? `<span class="badge badge-ghost">${q.difficulty}</span>` : ''}
                </div>
                <div style="display:flex;gap:var(--sp-2);align-items:center">
                    ${this.timerEnabled ? `<div class="quiz-timer ${this.timeLeft < 60 ? 'danger' : ''}" id="quiz-timer">Time ${this._fmtTime()}</div>` : ''}
                    <div class="quiz-counter">Q ${this.currentIdx + 1} / ${this.totalQ}</div>
                </div>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${((this.currentIdx + 1) / this.totalQ) * 100}%"></div></div>
            <div id="quiz-feedback" style="display:none"></div>
            <p class="question-text">${Utils.escHtml(q.q)}</p>
            <div id="hint-box" class="hint-box"><div class="hint-label">AI Hint</div><div class="hint-text" id="hint-text"></div></div>
            <div class="options-list" id="q-options">
                ${opts.map((option, i) => `<button class="option-btn" data-correct="${option.correct}" onclick="Quiz.handleAnswer(${option.correct}, this, ${JSON.stringify(q.explain || q.explanation || 'Review the related notes for this answer.').replace(/"/g, '&quot;')})">
                    <span class="opt-label">${labels[i]}</span>${Utils.escHtml(option.text)}
                </button>`).join('')}
            </div>
            <div class="quiz-actions" id="quiz-actions">
                ${this.mode === 'practice' ? `<button class="btn btn-ghost btn-sm" id="hint-btn" onclick="Quiz.showHint()">Get Hint</button>` : ''}
                <button class="btn btn-ghost btn-sm" onclick="Quiz.toggleFlag()" id="flag-btn">${isFlagged ? 'Unflag' : 'Flag'}</button>
                ${this.mode === 'practice' ? `<button class="btn btn-ghost btn-sm" onclick="Quiz.skipQuestion()">Skip</button>` : ''}
            </div>
        </div>`;

        requestAnimationFrame(() => {
            if (Store.getSettings().reducedMotion) return;

            gsap.killTweensOf(['.question-text', '.option-btn', '.quiz-top', '.quiz-progress-fill', '.quiz-box']);
            gsap.set('.quiz-box', { clearProps: 'x,y,transform' });

            const timeline = gsap.timeline();
            timeline.set('.quiz-box', { perspective: 1000 });
            timeline.fromTo('.question-text', { opacity: 0, y: 30, rotationX: -15 }, { opacity: 1, y: 0, rotationX: 0, duration: 0.5, ease: 'expo.out' });
            timeline.fromTo('.option-btn', { opacity: 0, y: 20, rotationX: -20, z: -50 }, { opacity: 1, y: 0, rotationX: 0, z: 0, duration: 0.4, stagger: 0.1, ease: 'back.out(1.5)' }, '-=0.3');
            timeline.fromTo('.quiz-top', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);

            const progressPercent = (this.currentIdx / this.totalQ) * 100;
            const newProgressPercent = ((this.currentIdx + 1) / this.totalQ) * 100;
            const fill = document.querySelector('.quiz-box .progress-fill');
            if (fill) {
                fill.style.width = progressPercent + '%';
                gsap.to(fill, { width: newProgressPercent + '%', duration: 0.5, ease: 'expo.out' });
            }

            document.querySelectorAll('.option-btn').forEach(btn => {
                btn.addEventListener('mouseenter', () => gsap.to(btn, { x: 8, duration: 0.2, ease: 'power2.out' }));
                btn.addEventListener('mouseleave', () => gsap.to(btn, { x: 0, duration: 0.3, ease: 'expo.out' }));
            });
        });
    },

    handleAnswer(isCorrect, btnEl, explain) {
        const q = this.pool[this.currentIdx];
        const topicKey = 'Unit ' + q.unit + ': ' + q.topic;

        if (isCorrect) {
            this.score += 1;
            this.correctCount += 1;
            this.correctTopics[topicKey] = (this.correctTopics[topicKey] || 0) + 1;
        } else {
            this.wrongCount += 1;
            this.wrongTopics[topicKey] = (this.wrongTopics[topicKey] || 0) + 1;
            if (this.hasNegativeMarking) this.score -= 0.25;
        }

        const unitKey = 'Unit ' + q.unit;
        if (!this.unitStats[unitKey]) this.unitStats[unitKey] = { correct: 0, total: 0 };
        this.unitStats[unitKey].total += 1;
        if (isCorrect) this.unitStats[unitKey].correct += 1;

        this.answers[this.currentIdx] = { correct: isCorrect, question: q.q };

        document.querySelectorAll('.option-btn').forEach(button => {
            button.classList.add('disabled');
            button.style.pointerEvents = 'none';
        });
        document.getElementById('quiz-actions').innerHTML = '';

        if (this.mode === 'exam') {
            btnEl.classList.add(isCorrect ? 'correct' : 'wrong');
            setTimeout(() => this.nextQ(), 400);
            return;
        }

        if (!Store.getSettings().reducedMotion) {
            gsap.to(btnEl, {
                rotationY: 360,
                duration: 0.6,
                ease: 'power2.inOut',
                onUpdate: function () {
                    if (this.progress() > 0.5) btnEl.classList.add(isCorrect ? 'correct' : 'wrong');
                }
            });

            if (!isCorrect) {
                document.querySelectorAll('.option-btn').forEach(button => {
                    if (button.dataset.correct === 'true') {
                        gsap.to(button, {
                            rotationY: 360,
                            duration: 0.6,
                            delay: 0.2,
                            ease: 'power2.inOut',
                            onUpdate: function () {
                                if (this.progress() > 0.5) button.classList.add('correct');
                            }
                        });
                    }
                });
            }
        } else {
            btnEl.classList.add(isCorrect ? 'correct' : 'wrong');
            if (!isCorrect) {
                document.querySelectorAll('.option-btn').forEach(button => {
                    if (button.dataset.correct === 'true') button.classList.add('correct');
                });
            }
        }

        const feedback = document.getElementById('quiz-feedback');
        feedback.className = `quiz-feedback ${isCorrect ? 'correct' : 'wrong'}`;
        feedback.innerHTML = `<strong>${isCorrect ? 'Correct!' : 'Incorrect'}</strong> ${Utils.escHtml(explain || 'Review the related notes for this answer.')}`;
        feedback.style.display = 'block';
        document.getElementById('quiz-actions').innerHTML = '<button class="btn btn-primary" onclick="Quiz.nextQ()">Next Question</button>';

        if (!Store.getSettings().reducedMotion) {
            if (!isCorrect) {
                gsap.to('.quiz-box', { x: -8, duration: 0.06, yoyo: true, repeat: 5, ease: 'none', clearProps: 'x', delay: 0.3 });
            } else {
                gsap.fromTo('.quiz-feedback.correct', { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.7)', delay: 0.3 });
            }
        }
    },

    nextQ() {
        this.currentIdx += 1;
        if (this.currentIdx >= this.totalQ) this.showResult();
        else this.renderQ();
    },

    skipQuestion() {
        this.answers[this.currentIdx] = null;
        this.nextQ();
    },

    toggleFlag() {
        if (this.flagged.has(this.currentIdx)) this.flagged.delete(this.currentIdx);
        else this.flagged.add(this.currentIdx);

        const btn = document.getElementById('flag-btn');
        if (btn) btn.textContent = this.flagged.has(this.currentIdx) ? 'Unflag' : 'Flag';
    },

    async showHint() {
        if (this.hintLoading) return;
        const q = this.pool[this.currentIdx];
        if (!q) return;

        const hintBox = document.getElementById('hint-box');
        const hintText = document.getElementById('hint-text');
        const hintBtn = document.getElementById('hint-btn');
        if (!hintBox || !hintText) return;

        const requestId = ++this.hintRequestId;
        this.hintLoading = true;
        hintBox.classList.add('visible');
        hintBox.classList.remove('error');
        hintBox.classList.add('loading');
        hintText.textContent = 'Generating AI hint...';
        if (hintBtn) hintBtn.disabled = true;

        const code = Store.getActiveSubject();
        const subject = window.SubjectRegistry ? SubjectRegistry.get(code) : null;
        const rawOptions = Array.isArray(q.opts) ? q.opts : (Array.isArray(q.options) ? q.options : []);
        const correctIndex = Number.isInteger(q.ans) ? q.ans : (Number.isInteger(q.correctAnswer) ? q.correctAnswer : null);
        const unit = subject && q.unit ? SubjectRegistry.getUnit(code, q.unit) : null;

        try {
            const response = await fetch('/api/ai-hint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({
                    subject: subject?.name || code || 'General',
                    unit: unit ? `Unit ${unit.id} - ${unit.title}` : (q.unit ? `Unit ${q.unit}` : ''),
                    topic: q.topic || '',
                    difficulty: q.difficulty || '',
                    mode: this.mode || 'practice',
                    question: q.q || q.question || '',
                    options: rawOptions,
                    correctAnswer: correctIndex !== null ? rawOptions[correctIndex] : q.correctAnswer,
                    instruction: 'Give a helpful hint only. Do not reveal the final answer. Do not mention the correct option letter. Keep it short and student-friendly.'
                })
            });

            let data = {};
            try {
                data = await response.json();
            } catch (_) {
                data = {};
            }

            if (requestId !== this.hintRequestId) return;
            if (!response.ok) throw new Error(data?.error || `AI hint failed with status ${response.status}`);

            const hint = typeof data?.hint === 'string' ? data.hint.trim() : '';
            if (!hint) throw new Error('No hint returned from AI hint route.');

            hintBox.classList.remove('loading', 'error');
            hintText.textContent = hint;
        } catch (error) {
            if (requestId !== this.hintRequestId) return;
            console.error('Quiz AI hint failed:', error);
            hintBox.classList.remove('loading');
            hintBox.classList.add('error');
            hintText.textContent = 'Could not fetch AI hint. Please try again.';
        } finally {
            if (requestId === this.hintRequestId) {
                this.hintLoading = false;
                if (hintBtn) hintBtn.disabled = false;
            }
        }
    },

    showResult() {
        if (this.timerInterval) clearInterval(this.timerInterval);

        const code = Store.getActiveSubject();
        const subject = SubjectRegistry.get(code);
        const points = Number(this.score.toFixed(2));
        const pct = Math.round((Math.max(points, 0) / this.totalQ) * 100);
        const unitLabel = this.selectedUnit === 'all' ? 'All Units' : 'Unit ' + this.selectedUnit;
        const answeredCount = this.answers.filter(a => a !== null).length;
        const skippedCount = this.totalQ - answeredCount;

        Store.saveAttempt({
            subject: code,
            subjectName: subject?.name,
            unit: this.selectedUnit,
            unitLabel,
            mode: this.mode,
            score: this.correctCount,
            points,
            correctCount: this.correctCount,
            wrongCount: this.wrongCount,
            total: this.totalQ,
            pct,
            unitStats: this.unitStats
        });

        document.getElementById('quiz-active').style.display = 'none';
        const result = document.getElementById('quiz-result');
        result.style.display = 'block';

        const message = pct >= 90
            ? 'Outstanding!'
            : pct >= 70
                ? 'Good job!'
                : pct >= 50
                    ? 'Keep practicing'
                    : 'Needs more work';

        const weakArr = Object.entries(this.wrongTopics).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const strongArr = Object.entries(this.correctTopics).sort((a, b) => b[1] - a[1]).slice(0, 3);

        result.innerHTML = `<div class="result-box glass-card">
            <div class="result-trophy">Score</div>
            <p class="result-msg">${message}</p>
            <div class="result-score">${this.correctCount} / ${this.totalQ}</div>
            ${this.hasNegativeMarking ? `<p class="result-points" style="margin-top:8px;color:var(--text-secondary)">Points after negative marking: ${points}</p>` : ''}
            <div class="result-breakdown">
                <div class="breakdown-item"><div class="val" style="color:var(--success)">${this.correctCount}</div><div class="lbl">Correct</div></div>
                <div class="breakdown-item"><div class="val" style="color:var(--danger)">${this.wrongCount}</div><div class="lbl">Wrong</div></div>
                <div class="breakdown-item"><div class="val" style="color:var(--warning)">${skippedCount}</div><div class="lbl">Skipped</div></div>
                <div class="breakdown-item"><div class="val">${pct}%</div><div class="lbl">Score</div></div>
            </div>
            <div class="ai-analysis">
                <h4>Performance Analysis</h4>
                <div>
                    ${pct >= 90 ? '<p>Outstanding command of the material.</p>' : pct >= 70 ? '<p>Solid understanding. A few areas still need review.</p>' : '<p>More practice is needed. Review the related notes and try again.</p>'}
                    ${weakArr.length ? `<p style="margin-top:8px"><strong>Weak Areas:</strong><br>${weakArr.map(([topic]) => `<span class="topic-tag">${topic}</span>`).join('')}</p>` : ''}
                    ${strongArr.length ? `<p style="margin-top:8px"><strong>Strengths:</strong><br>${strongArr.map(([topic]) => `<span class="strength-tag">${topic}</span>`).join('')}</p>` : ''}
                    ${weakArr.length ? `<div class="study-plan"><h5>Study Plan</h5>${weakArr.map(([topic], index) => `<div class="study-step"><div class="step-num">${index + 1}</div><div><strong>${topic}</strong> - Review notes and retry this topic.</div></div>`).join('')}</div>` : ''}
                </div>
            </div>
            <div style="display:flex;gap:var(--sp-3);justify-content:center;flex-wrap:wrap;margin-top:var(--sp-4)">
                <button class="btn btn-primary" onclick="Quiz.render();Quiz.begin()">Retake Quiz</button>
                <button class="btn btn-secondary" onclick="Quiz.render()">New Quiz</button>
                <button class="btn btn-secondary" onclick="App.navigate('analytics')">View Analytics</button>
            </div>
        </div>`;

        requestAnimationFrame(() => {
            if (Store.getSettings().reducedMotion) return;

            const resultTimeline = gsap.timeline({ delay: 0.1 });
            resultTimeline
                .fromTo('.result-box', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out' })
                .fromTo('.result-trophy', { y: -40, opacity: 0, rotation: -20 }, { y: 0, opacity: 1, rotation: 0, duration: 0.5, ease: 'back.out(2)' }, '-=0.4')
                .fromTo('.result-score', { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)' }, '-=0.3')
                .fromTo('.result-msg', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 }, '-=0.2')
                .fromTo('.breakdown-item', { opacity: 0, y: 30, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.1, ease: 'back.out(1.7)' }, '-=0.1')
                .fromTo('.ai-analysis', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, '-=0.1')
                .fromTo('.result-box .btn', { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.08, duration: 0.35, ease: 'power3.out' }, '-=0.1');

            const scoreEl = document.querySelector('.result-score');
            if (scoreEl) {
                const targetScore = this.correctCount;
                const total = this.totalQ;
                const obj = { val: 0 };
                resultTimeline.to(obj, {
                    val: targetScore,
                    duration: 1.2,
                    ease: 'power2.out',
                    onUpdate: () => { scoreEl.textContent = `${Math.round(obj.val)} / ${total}`; }
                }, 0.4);
            }
        });
    },

    _startTimer() {
        this.timerInterval = setInterval(() => {
            this.timeLeft -= 1;
            const el = document.getElementById('quiz-timer');
            if (el) {
                el.textContent = 'Time ' + this._fmtTime();
                if (this.timeLeft < 60) el.classList.add('danger');
            }
            if (this.timeLeft <= 0) {
                clearInterval(this.timerInterval);
                this.showResult();
            }
        }, 1000);
    },

    _fmtTime() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    },

    switchSubject(code) {
        const subject = SubjectRegistry.get(code);
        if (!subject || !subject.questions || subject.questions.length === 0) {
            Utils.showToast('No quiz available for this subject.', 'info');
            return;
        }
        Store.setActiveSubject(code);
        this.render();
    }
};

window.Quiz = Quiz;
