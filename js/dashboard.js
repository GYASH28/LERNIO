/* Dashboard renderer */
const Dashboard = {
    _driveLoading: false,
    _driveLastAttempt: 0,

    _loadDriveNotes() {
        if (!window.DriveNotes || DriveNotes.hasFreshCache()) return;
        const now = Date.now();
        if (this._driveLoading || now - this._driveLastAttempt < 5 * 60 * 1000) return;

        this._driveLoading = true;
        this._driveLastAttempt = now;
        DriveNotes.load()
            .then(() => {
                if (window.App && App.currentPage === 'dashboard') this.render();
            })
            .catch(error => {
                console.warn('Drive notes unavailable on dashboard:', error.message || error);
            })
            .finally(() => {
                this._driveLoading = false;
            });
    },

    _computeOverallStats() {
        const attempts = Store.getAttempts() || [];
        const totalAttempts = attempts.length;
        const avg = totalAttempts ? Math.round(attempts.reduce((s, a) => s + (a.pct || 0), 0) / totalAttempts) : 0;
        const best = totalAttempts ? Math.max(...attempts.map(a => a.pct || 0)) : 0;

        // Total notes available across all unlocked semester subjects
        let totalNotes = 0;
        let totalQuizzes = 0;
        const semesters = window.SemestersConfig || [];
        semesters.filter(s => s.isUnlocked).forEach(sem => {
            (sem.subjects || []).forEach(sub => {
                const staticCount = window.SubjectMapping ? SubjectMapping.getPlatformCount(sub.code) : 0;
                const driveCount = window.DriveNotes ? DriveNotes.getPlatformCount(sub.code) : 0;
                totalNotes += staticCount + driveCount;
                if (window.SubjectMapping && SubjectMapping.hasQuiz(sub.code)) totalQuizzes += 1;
            });
        });

        return { totalAttempts, avg, best, totalNotes, totalQuizzes };
    },

    render() {
        this._loadDriveNotes();

        const el = document.getElementById('page-dashboard');
        const code = Store.getActiveSubject();
        const subject = SubjectRegistry.get(code);
        const perf = Store.getPerformance(code);
        const streak = Store.getStreak();
        const attempts = Store.getAttemptsBySubject(code).slice(0, 3);
        const lastUnit = Store.getLastUnit(code);
        const unitData = subject ? SubjectRegistry.getUnit(code, lastUnit) : null;
        const stats = this._computeOverallStats();

        let weakTopics = [];
        if (perf && perf.unitStats) {
            weakTopics = Object.entries(perf.unitStats)
                .map(([u, s]) => ({ unit: u, pct: s.total ? Math.round((s.correct / s.total) * 100) : 0 }))
                .filter(t => t.pct < 70)
                .sort((a, b) => a.pct - b.pct)
                .slice(0, 3);
        }

        const readiness = perf ? perf.avgScore : 0;
        const readinessColor = readiness >= 80 ? 'var(--success)' : readiness >= 50 ? 'var(--warning)' : 'var(--danger)';

        if (
            window.Auth && Auth.user &&
            window.SemesterHub &&
            window.SemestersConfig &&
            Object.keys(SemesterHub._progressCache).length === 0
        ) {
            SemesterHub.calculateProgress(window.SemestersConfig).then(() => Dashboard.render());
        }

        const todayGoal = this._getTodayGoal(streak, perf);

        el.innerHTML = `
        <div class="dashboard-welcome glass-card" data-testid="dashboard-welcome">
            <div class="welcome-content">
                <span class="welcome-eyebrow">${this._timeOfDayGreeting()}</span>
                <h1 class="text-gradient">${window.Auth && Auth.user ? Utils.escHtml(Auth.user.name) : 'Welcome to Lernio AI'}</h1>
                <p class="welcome-sub">${window.Auth && Auth.user ? `Continue your <strong>${Utils.escHtml(subject ? subject.name : 'study')}</strong> journey. ${streak > 0 ? `You have a <strong>${streak}-day</strong> study streak. Keep it up!` : 'Build your streak by practicing today.'}` : 'Your AI-powered study companion. Browse notes freely or sign in to unlock quizzes and analytics.'}</p>
            </div>
            <div class="welcome-streak" aria-label="${streak} day study streak">
                <div class="streak-number">${streak}</div>
                <div class="streak-label">${streak === 1 ? 'day streak' : 'day streak'}</div>
                <div class="streak-flame">🔥</div>
            </div>
        </div>

        <!-- Smart stat cards -->
        <div class="stats-grid" data-testid="dashboard-stats-grid">
            <div class="stat-tile glass-card" data-testid="stat-notes">
                <div class="stat-tile-icon">📚</div>
                <div class="stat-tile-value" data-count="${stats.totalNotes}">0</div>
                <div class="stat-tile-label">Notes Available</div>
            </div>
            <div class="stat-tile glass-card" data-testid="stat-quizzes">
                <div class="stat-tile-icon">📝</div>
                <div class="stat-tile-value" data-count="${stats.totalQuizzes}">0</div>
                <div class="stat-tile-label">Quiz Subjects</div>
            </div>
            <div class="stat-tile glass-card" data-testid="stat-attempts">
                <div class="stat-tile-icon">🎯</div>
                <div class="stat-tile-value" data-count="${stats.totalAttempts}">0</div>
                <div class="stat-tile-label">Quizzes Taken</div>
            </div>
            <div class="stat-tile glass-card" data-testid="stat-avg">
                <div class="stat-tile-icon">⭐</div>
                <div class="stat-tile-value" data-count="${stats.avg}" data-suffix="%">0%</div>
                <div class="stat-tile-label">Average Score</div>
            </div>
        </div>

        <!-- Today's Goal -->
        <div class="todays-goal glass-card glass-card-interactive" data-testid="todays-goal" onclick="${todayGoal.action}">
            <div class="goal-icon">${todayGoal.icon}</div>
            <div class="goal-text">
                <div class="goal-eyebrow">Today's Goal</div>
                <div class="goal-title">${Utils.escHtml(todayGoal.title)}</div>
                <div class="goal-desc">${Utils.escHtml(todayGoal.desc)}</div>
            </div>
            <div class="goal-arrow" aria-hidden="true">→</div>
        </div>

        <h3 class="dashboard-heading">Your Semesters</h3>
        <div class="subject-cards-row" style="margin-bottom: var(--sp-6);">
            ${(window.SemestersConfig || []).map(sem => {
                const prog = window.SemesterHub && SemesterHub._progressCache ? (SemesterHub._progressCache[sem.id] || 0) : 0;
                return `<div class="glass-card action-card glass-card-interactive ${sem.isUnlocked ? '' : 'locked'}" onclick="${sem.isUnlocked ? `App.goToSemester('${sem.id}')` : "Utils.showToast('This semester is locked. Available soon.', 'info')"}" style="padding: var(--sp-4); cursor: pointer; border-bottom: 3px solid ${sem.color}" data-testid="sem-card-${sem.id}">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:var(--sp-2)">
                        <h4 style="margin:0; font-size: 1rem; color: ${sem.isUnlocked ? sem.color : 'var(--text-muted)'}">${sem.isUnlocked ? Utils.escHtml(sem.name) : '🔒 ' + Utils.escHtml(sem.name)}</h4>
                        ${sem.isUnlocked ? `<span class="badge badge-ghost" style="font-size:0.62rem;">${prog}%</span>` : ''}
                    </div>
                    <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">${Utils.escHtml(sem.subtitle || 'Coming soon')}</div>
                    ${sem.isUnlocked ? `<div class="progress-bar" style="margin-top:var(--sp-2); height: 4px; background: rgba(255,255,255,0.08)">
                        <div class="progress-fill" style="width:${prog}%; background: ${sem.color}"></div>
                    </div>` : ''}
                </div>`;
            }).join('')}
        </div>

        ${this._renderExamSubjects()}

        <h3 class="dashboard-heading">Quick Actions</h3>
        <div class="quick-actions">
            <div class="glass-card action-card glass-card-interactive" onclick="App.navigate('notes')" data-testid="qa-continue">
                <div class="action-icon">📖</div>
                <h3>Continue Learning</h3>
                <p>${unitData ? 'Resume: Unit ' + lastUnit + ' - ' + Utils.escHtml(unitData.title) : 'Browse semester notes'}</p>
            </div>
            <div class="glass-card action-card glass-card-interactive" onclick="App.navigate('quiz')" data-testid="qa-quiz">
                <div class="action-icon">📝</div>
                <h3>Take a Quiz</h3>
                <p>${window.Auth && Auth.user ? 'Test yourself with timed practice' : '🔒 Sign in to take quizzes'}</p>
            </div>
            <div class="glass-card action-card glass-card-interactive" onclick="Quiz.startAdaptive()" data-testid="qa-adaptive">
                <div class="action-icon">🎯</div>
                <h3>Adaptive Revision</h3>
                <p>${window.Auth && Auth.user ? 'AI targets your weak areas' : '🔒 Sign in to access'}</p>
            </div>
            <div class="glass-card action-card glass-card-interactive" onclick="App.navigate('chat')" data-testid="qa-ai">
                <div class="action-icon">🤖</div>
                <h3>Ask AI Tutor</h3>
                <p>Get instant explanations</p>
            </div>
        </div>

        <div class="dashboard-grid">
            <div class="glass-card readiness-meter" data-testid="readiness-meter">
                <h3>Exam Readiness</h3>
                <div class="meter-value" style="color:${readinessColor}">${readiness}%</div>
                <div class="meter-label">${readiness >= 80 ? 'You are exam ready.' : readiness >= 50 ? 'Getting there, keep practicing.' : (perf ? 'More practice is needed.' : 'Take a quiz to measure readiness.')}</div>
                <div class="progress-bar" style="margin-top:var(--sp-3);height:8px"><div class="progress-fill" style="width:${readiness}%"></div></div>
            </div>

            <div class="glass-card weak-topics-card" data-testid="weak-topics">
                <h3 style="margin-bottom:var(--sp-4)">Weak Areas</h3>
                ${weakTopics.length > 0 ? weakTopics.map(t => `
                    <div class="weak-topic-item">
                        <div class="topic-dot" style="background:${t.pct < 40 ? 'var(--danger)' : 'var(--warning)'}"></div>
                        <span class="topic-name">${Utils.escHtml(t.unit)}</span>
                        <span class="badge badge-${t.pct < 40 ? 'danger' : 'warning'}">${t.pct}%</span>
                    </div>`).join('') : '<div class="empty-state-mini"><span class="empty-icon-mini">🎯</span><p class="text-sm text-muted">Take a quiz to see your weak areas.</p></div>'}
            </div>

            <div class="glass-card recent-activity full-width" data-testid="recent-activity">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-4)">
                    <h3 style="margin:0">Recent Activity</h3>
                    ${attempts.length > 0 ? '<button class="btn btn-ghost btn-sm" onclick="App.navigate(\'analytics\')">View all</button>' : ''}
                </div>
                ${attempts.length > 0 ? attempts.map(a => `
                    <div class="activity-item">
                        <div class="activity-icon">${a.pct >= 80 ? '🌟' : a.pct >= 50 ? '📝' : '📚'}</div>
                        <div class="activity-info">
                            <div class="activity-title">${Utils.escHtml(a.mode || 'Practice')} Quiz · ${Utils.escHtml(a.unitLabel || 'All Units')}</div>
                            <div class="activity-meta">${Utils.formatDate(a.date)}</div>
                        </div>
                        <div class="activity-score" style="color:${a.pct >= 70 ? 'var(--success)' : 'var(--warning)'}">${a.pct}%</div>
                    </div>`).join('') : '<div class="empty-state-mini"><span class="empty-icon-mini">📊</span><p class="text-sm text-muted">No quizzes taken yet. Start one!</p></div>'}
            </div>
        </div>`;

        this._afterRender(readiness);
    },

    _renderExamSubjects() {
        const semesters = window.SemestersConfig || [];
        const examCodes = new Set(['EC101', 'EE101', 'CS102']);
        const blocks = semesters.filter(sem => sem.isUnlocked).map(sem => {
            const examSubjects = (sem.subjects || []).filter(sub => examCodes.has(sub.code));
            if (!examSubjects.length) return '';
            return `<div style="margin-bottom: var(--sp-5);">
                <h4 style="color: ${sem.color}; margin-bottom: var(--sp-3); font-size: 0.95rem; display:flex; align-items:center; gap: var(--sp-2);">
                    ${Utils.escHtml(sem.name)} · Exam Quick Access
                </h4>
                <div class="exam-subject-grid">
                ${examSubjects.map(sub => {
                    const staticCount = window.SubjectMapping ? SubjectMapping.getPlatformCount(sub.code) : 0;
                    const driveCount = window.DriveNotes ? DriveNotes.getPlatformCount(sub.code) : 0;
                    const noteCount = staticCount + driveCount;
                    const hasQuiz = window.SubjectMapping && SubjectMapping.hasQuiz(sub.code);
                    const hasNotes = noteCount > 0;
                    return `<div class="glass-card glass-card-interactive exam-subject-card" onclick="SemesterNotes.render('${sem.id}', '${sub.code}')"
                                 onkeydown="if(event.key==='Enter') SemesterNotes.render('${sem.id}', '${sub.code}')"
                                 tabindex="0" data-testid="exam-card-${sub.code}"
                                 style="border-left: 3px solid ${sem.color}">
                        <span class="exam-icon">${sub.icon || '📘'}</span>
                        <div class="exam-info">
                            <div class="exam-name">${Utils.escHtml(sub.name)}</div>
                            <div class="exam-meta">${Utils.escHtml(sub.code)} · ${sub.credits || ''} Credits${hasNotes ? ` · ${noteCount} notes` : ''}</div>
                        </div>
                        <div class="exam-actions" onclick="event.stopPropagation()">
                            ${hasNotes ? `<button class="btn btn-ghost btn-sm" onclick="SemesterNotes.render('${sem.id}', '${sub.code}')">Notes</button>` : ''}
                            ${hasQuiz ? `<button class="btn btn-primary btn-sm" onclick="Store.setActiveSubject('${sub.code}'); App.navigate('quiz', false, true);">Quiz</button>` : ''}
                        </div>
                    </div>`;
                }).join('')}
                </div>
            </div>`;
        }).join('');
        return blocks ? `<h3 class="dashboard-heading">Semester Exam Subjects</h3>${blocks}` : '';
    },

    _timeOfDayGreeting() {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    },

    _getTodayGoal(streak, perf) {
        const attempts = Store.getAttempts() || [];
        const todayKey = new Date().toDateString();
        const tookQuizToday = attempts.some(a => new Date(a.date).toDateString() === todayKey);

        if (!window.Auth || !Auth.user) {
            return {
                icon: '✨',
                title: 'Sign in to unlock your progress',
                desc: 'Save quiz attempts, sync across devices, and get adaptive revision.',
                action: "Auth.showAuthOverlay()"
            };
        }

        if (!tookQuizToday) {
            return {
                icon: '🎯',
                title: 'Practice a 10-question quiz today',
                desc: streak > 0 ? `Keep your ${streak}-day streak alive.` : 'Start a study streak today!',
                action: "App.navigate('quiz')"
            };
        }

        if (perf && perf.avgScore < 70) {
            return {
                icon: '📈',
                title: 'Revise your weak topics',
                desc: 'Run an adaptive quiz on your weakest units.',
                action: "Quiz.startAdaptive()"
            };
        }

        return {
            icon: '🌟',
            title: 'Great work! Try a tougher challenge',
            desc: 'Switch to exam mode with negative marking.',
            action: "App.navigate('quiz')"
        };
    },

    _afterRender(readiness) {
        requestAnimationFrame(() => {
            // Count-up stat tiles (always run, even with reduced motion → instant)
            this._animateCountUp();

            if (Store.getSettings().reducedMotion) return;

            gsap.fromTo('.dashboard-welcome',
                { opacity: 0, y: 30, scale: 0.98 },
                { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'expo.out' }
            );

            gsap.fromTo('.stats-grid > .stat-tile',
                { opacity: 0, y: 18, scale: 0.94 },
                { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.07, ease: 'back.out(1.5)', delay: 0.2 }
            );

            gsap.fromTo('.todays-goal',
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', delay: 0.3 }
            );

            gsap.fromTo(gsap.utils.toArray('.dashboard-heading'),
                { opacity: 0, x: -16 },
                { opacity: 1, x: 0, duration: 0.4, stagger: 0.1, ease: 'power3.out', delay: 0.35 }
            );

            gsap.fromTo('.action-card',
                { opacity: 0, y: 24, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.4)', stagger: 0.06, delay: 0.45 }
            );

            gsap.fromTo('.readiness-meter, .weak-topics-card, .recent-activity',
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.1, delay: 0.55 }
            );

            const meterEl = document.querySelector('.meter-value');
            if (meterEl) {
                const realVal = parseInt(meterEl.textContent, 10) || 0;
                gsap.to({ val: 0 }, {
                    val: realVal,
                    duration: 1.2,
                    ease: 'power2.out',
                    delay: 0.7,
                    onUpdate: function () { meterEl.textContent = Math.round(this.targets()[0].val) + '%'; }
                });
            }

            document.querySelectorAll('#page-dashboard .progress-fill').forEach(progressEl => {
                const target = progressEl.style.width;
                progressEl.style.width = '0%';
                gsap.to(progressEl, { width: target, duration: 0.9, ease: 'expo.out', delay: 0.9 });
            });

            gsap.fromTo('.activity-item',
                { opacity: 0, x: -16 },
                { opacity: 1, x: 0, duration: 0.4, stagger: 0.07, delay: 0.65 }
            );

            this._bindHoverTilt();
        });
    },

    _animateCountUp() {
        const tiles = document.querySelectorAll('.stat-tile-value[data-count]');
        if (!tiles.length) return;
        const reduced = Store.getSettings().reducedMotion;
        tiles.forEach(tile => {
            const target = parseInt(tile.dataset.count, 10) || 0;
            const suffix = tile.dataset.suffix || '';
            if (reduced || target === 0) {
                tile.textContent = target + suffix;
                return;
            }
            const obj = { v: 0 };
            if (window.gsap) {
                gsap.to(obj, {
                    v: target,
                    duration: 1.1,
                    ease: 'power2.out',
                    delay: 0.35,
                    onUpdate: () => { tile.textContent = Math.round(obj.v) + suffix; }
                });
            } else {
                tile.textContent = target + suffix;
            }
        });
    },

    _bindHoverTilt() {
        document.querySelectorAll('.glass-card-interactive:not([data-gsap-hover])').forEach(card => {
            card.setAttribute('data-gsap-hover', 'true');

            // Skip on touch devices
            if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;

            card.addEventListener('mousemove', (e) => {
                if (Store.getSettings().reducedMotion) return;
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -5;
                const rotateY = ((x - centerX) / centerX) * 5;

                gsap.to(card, {
                    rotationX: rotateX,
                    rotationY: rotateY,
                    z: 20,
                    transformPerspective: 1000,
                    duration: 0.35,
                    ease: 'power2.out'
                });
            });

            card.addEventListener('mouseleave', () => {
                if (Store.getSettings().reducedMotion) return;
                gsap.to(card, {
                    rotationX: 0,
                    rotationY: 0,
                    z: 0,
                    duration: 0.5,
                    ease: 'expo.out'
                });
            });
        });
    }
};

window.Dashboard = Dashboard;
