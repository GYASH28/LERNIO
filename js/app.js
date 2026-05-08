/* Main application controller, router, and event bus */
const App = {
    currentPage: null,
    _baseDocumentTitle: 'Lernio AI',

    /* Routes that require the user to be logged in */
    protectedRoutes: ['analytics'],

    init() {
        this._baseDocumentTitle = document.title || 'Lernio AI';
        if (window.IntroAnimation) IntroAnimation.play();
        if (window.Auth) Auth.init();

        this.applySubjectTheme();
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
        this.setupEvents();
        this.updateHeader();
    },

    async loadUserProgress() {
        if (!window.Auth || !Auth.token) return;
        try {
            const res = await fetch('/api/progress', {
                headers: { Authorization: `Bearer ${Auth.token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            Store.setProgressData(data);
            if (this.currentPage === 'dashboard' && window.Dashboard) Dashboard.render();
        } catch (_) {
            // Local progress remains available when cloud sync is offline.
        }
    },

    getHashRoute() {
        const rawHash = window.location.hash || '';
        const cleaned = rawHash.replace(/^#\/?/, '').trim();
        if (!cleaned) return '';
        return cleaned.split(/[/?#]/)[0];
    },

    getRouteInfo() {
        const rawHash = window.location.hash || '';
        const cleaned = rawHash.replace(/^#\/?/, '').trim();
        const parts = cleaned ? cleaned.split('/').filter(Boolean) : [];
        return {
            route: parts[0] || '',
            parts
        };
    },

    getRouteUrl(pageId) {
        return `#/${pageId}`;
    },

    getSemesterRoute(semId, subCode = '') {
        const match = (semId || '').match(/^sem_(\d)$/);
        if (!match) return this.getRouteUrl('notes');
        return `#/semester-${match[1]}${subCode ? `/${encodeURIComponent(subCode)}` : ''}`;
    },

    getSemesterIdFromRoute(route) {
        const match = (route || '').match(/^semester-([1-6])$/);
        return match ? `sem_${match[1]}` : null;
    },

    isProtectedRoute(pageId) {
        return this.protectedRoutes.includes(pageId);
    },

    async handleRoute() {
        const validPages = ['dashboard', 'notes', 'quiz', 'analytics', 'chat', 'settings'];
        const routeInfo = this.getRouteInfo();
        let route = routeInfo.route;

        /* No hash or empty hash → go to dashboard */
        if (!route) {
            this.navigate('dashboard', false, true, true);
            return;
        }

        if (route === 'login') {
            if (window.Auth) await Auth.waitUntilReady();
            if (window.Auth && Auth.user) {
                this.navigate('dashboard', false, true, true);
                return;
            }

            this.navigate('dashboard', true, true, false, true);
            if (window.Auth) Auth.showAuthOverlay();
            return;
        }

        const semesterId = this.getSemesterIdFromRoute(route);
        if (semesterId) {
            await this.openSemesterRoute(semesterId, routeInfo.parts[1] || '');
            return;
        }

        /* Unknown route → dashboard */
        if (!validPages.includes(route)) {
            Utils.showToast('Page not found - redirecting to dashboard.', 'info');
            this.navigate('dashboard', false, true, true);
            return;
        }

        /* Protected routes → require login */
        if (this.isProtectedRoute(route)) {
            if (window.Auth) await Auth.waitUntilReady();
            if (window.Auth && !Auth.user) {
                Utils.showToast('Please log in to access this feature.', 'warning');
                Auth.showAuthOverlay();
                /* Stay on current page if there is one, otherwise go to dashboard */
                if (this.currentPage === null) {
                    this.navigate('dashboard', false, true, true);
                } else {
                    history.replaceState(null, '', this.getRouteUrl(this.currentPage));
                }
                return;
            }
        }

        this.navigate(route, true);
    },

    navigate(pageId, fromHash = false, force = false, replace = false, preserveHash = false) {
        const validPages = ['dashboard', 'notes', 'quiz', 'analytics', 'chat', 'settings'];
        if (!validPages.includes(pageId)) pageId = 'dashboard';
        if (this.currentPage === pageId && !force) return;

        const routeUrl = this.getRouteUrl(pageId);
        if (!preserveHash) {
            if (!fromHash && window.location.hash !== routeUrl) {
                if (replace) history.replaceState(null, '', routeUrl);
                else history.pushState(null, '', routeUrl);
            } else if (fromHash && window.location.hash !== routeUrl) {
                history.replaceState(null, '', routeUrl);
            }
        }

        document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn, .nav-mobile-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`[data-page="${pageId}"]`).forEach(b => b.classList.add('active'));
        
        const pageEl = document.getElementById('page-' + pageId);
        if (!pageEl) return;

        pageEl.classList.add('active');
        this.currentPage = pageId;
        
        if (!Store.getSettings().reducedMotion && window.AnimationSystem) {
            AnimationSystem.pageTransition(pageId);
        }

        if (pageId === 'dashboard' && window.Dashboard) Dashboard.render();
        else if (pageId === 'notes' && window.SemesterHub) SemesterHub.render();
        else if (pageId === 'quiz' && window.Quiz) Quiz.render();
        else if (pageId === 'analytics' && window.Analytics) Analytics.render();
        else if (pageId === 'settings') this.renderSettings();
        else if (pageId === 'chat' && window.AI) AI.onChatPageEnter();

        document.body.classList.toggle('route-chat', pageId === 'chat');
        if (pageId === 'chat') {
            document.title = 'AI Tutor · ' + this._baseDocumentTitle;
        } else {
            document.title = this._baseDocumentTitle;
        }

        this.updateHeader();
        window.scrollTo(0, 0);
    },

    async openSemesterRoute(semId, rawSubCode = '') {
        const semesters = window.SemestersConfig || [];
        const semester = semesters.find(s => s.id === semId);

        this.navigate('notes', true, true, false, true);

        if (!semester) {
            Utils.showToast('Semester not found.', 'info');
            if (window.SemesterHub) await SemesterHub.render();
            return;
        }

        if (!semester.isUnlocked) {
            Utils.showToast(`${semester.name} is locked and will be available soon.`, 'info');
            if (window.SemesterHub) await SemesterHub.render();
            return;
        }

        const subCode = decodeURIComponent(rawSubCode || '').trim();
        if (subCode) {
            const subject = (semester.subjects || []).find(sub =>
                sub.code.toLowerCase() === subCode.toLowerCase() ||
                sub.id.toLowerCase() === subCode.toLowerCase()
            );

            if (subject && window.SemesterNotes) {
                await SemesterNotes.render(semId, subject.code);
                history.replaceState(null, '', this.getSemesterRoute(semId, subject.code));
                this.updateHeader();
                return;
            }

            Utils.showToast('Subject not found in this semester.', 'info');
        }

        if (window.SubjectView) await SubjectView.render(semId);
        this.updateHeader();
    },

    goToSemester(semId, subCode = '') {
        history.pushState(null, '', this.getSemesterRoute(semId, subCode));
        this.openSemesterRoute(semId, subCode);
    },

    renderCurrentPage() {
        if (this.currentPage) this.navigate(this.currentPage, true, true);
    },

    applySubjectTheme() {
        const code = Store.getActiveSubject();
        document.body.setAttribute('data-subject', code);
        const settings = Store.getSettings();
        document.body.setAttribute('data-font-size', settings.fontSize || 'medium');
        document.body.classList.toggle('reduced-motion', !!settings.reducedMotion);

        // Theme: 'dark' | 'light' | 'system'. System resolves on the fly.
        const root = document.documentElement;
        const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        const requestedTheme = settings.theme || 'dark';
        const effectiveTheme = requestedTheme === 'system' ? (prefersLight ? 'light' : 'dark') : requestedTheme;
        root.setAttribute('data-theme', effectiveTheme);
        const themeColor = effectiveTheme === 'light' ? '#f5f7fb' : '#0d2137';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', themeColor);
    },

    updateHeader() {
        const pill = document.getElementById('header-subject-pill');
        if (!pill) return;

        const semId = window.SemesterNotes?.currentSemId;
        const subCode = window.SemesterNotes?.currentSubCode;
        const semesters = window.SemestersConfig || [];
        const activeSem = semId ? semesters.find(s => s.id === semId) : null;
        const activeSubject = activeSem && subCode ? activeSem.subjects.find(s => s.code === subCode) : null;
        if (activeSem && activeSubject) {
            pill.textContent = `${activeSem.name} - ${activeSubject.name}`;
            return;
        }

        const unlocked = semesters.filter(s => s.isUnlocked);
        const defaultSem = unlocked.length ? unlocked[unlocked.length - 1] : null;
        pill.textContent = defaultSem ? defaultSem.name : 'Semesters';
    },

    openSubjectModal() {
        const modal = document.getElementById('subject-modal-overlay');
        const grid = document.getElementById('subject-grid');
        if (!modal || !grid) return;
        
        const semesters = window.SemestersConfig || [];
        grid.innerHTML = semesters.map(sem => {
            const isLocked = !sem.isUnlocked;
            return `
            <div class="subject-select-card ${isLocked ? 'locked' : ''}" 
                 onclick="${isLocked ? '' : `App.selectSemester('${sem.id}')`}" 
                 style="border-bottom: 3px solid ${sem.color}; ${isLocked ? 'opacity:0.55; cursor:not-allowed;' : ''}">
                <div class="subject-icon">${isLocked ? '🔒' : '📚'}</div>
                <div class="subject-name">${Utils.escHtml(sem.name)}</div>
                <div class="subject-desc">${isLocked ? 'Coming Soon' : Utils.escHtml(sem.subtitle || '')}</div>
            </div>`;
        }).join('');
        
        modal.classList.add('open');

        if (!Store.getSettings().reducedMotion && window.gsap) {
            gsap.fromTo('.subject-modal',
                { opacity: 0, scale: 0.85, y: 30 },
                { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.4)' }
            );
            gsap.fromTo('.subject-select-card',
                { opacity: 0, y: 20, scale: 0.9 },
                { opacity: 1, y: 0, scale: 1, duration: 0.35, stagger: 0.07, ease: 'back.out(1.7)', delay: 0.15 }
            );
        }
    },

    selectSemester(semId) {
        this.closeSubjectModal();
        this.goToSemester(semId);
    },

    closeSubjectModal() {
        const modal = document.getElementById('subject-modal-overlay');
        if (!modal) return;

        if (Store.getSettings().reducedMotion || !window.gsap) {
            modal.classList.remove('open');
            return;
        }

        gsap.to('.subject-modal', {
            scale: 0.9,
            opacity: 0,
            y: 20,
            duration: 0.25,
            ease: 'power2.in',
            onComplete: () => modal.classList.remove('open')
        });
    },

    switchSubject(code) {
        if (Store.getActiveSubject() === code) {
            this.closeSubjectModal();
            return;
        }

        const subject = SubjectRegistry.get(code);
        if (!subject) {
            Utils.showToast('This subject is ready for notes, but no quiz data is available yet.', 'info');
            this.closeSubjectModal();
            return;
        }
        
        Store.setActiveSubject(code);
        
        if (!Store.getSettings().reducedMotion && window.gsap) {
            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;inset:0;background:var(--primary);z-index:9999;pointer-events:none;opacity:0';
            document.body.appendChild(flash);
            gsap.to(flash, { opacity: 0.12, duration: 0.15, yoyo: true, repeat: 1, onComplete: () => flash.remove() });
        }

        this.applySubjectTheme();
        this.updateHeader();
        this.closeSubjectModal();
        Utils.showToast(`Switched to ${subject.name}`, 'success');
        this.renderCurrentPage();
        
        if (window.AI) {
            const container = document.getElementById('chat-messages');
            if (container) container.innerHTML = '';
            if (this.currentPage === 'chat') AI.renderHistory();
        }
    },

    setupEvents() {
        document.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            
            if (e.key === 'Escape') {
                this.closeSubjectModal();
                this.toggleMobileMore(null, false);
                if (window.Auth) Auth.hideAuthOverlay();
            }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            
            if (e.key.toLowerCase() === 'd') this.navigate('dashboard');
            if (e.key.toLowerCase() === 'n') this.navigate('notes');
            if (e.key.toLowerCase() === 'q') this.navigate('quiz');
        });
        
        const modal = document.getElementById('subject-modal-overlay');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeSubjectModal();
            });
        }

        // Close mobile "More" sheet when tapping outside.
        document.addEventListener('click', (e) => {
            const sheet = document.getElementById('mobile-more-sheet');
            const trigger = document.getElementById('mobile-nav-more-btn');
            if (!sheet || !sheet.classList.contains('open')) return;
            if (sheet.contains(e.target) || (trigger && trigger.contains(e.target))) return;
            this.toggleMobileMore(null, false);
        });
    },

    toggleMobileMore(event, force) {
        if (event && event.stopPropagation) event.stopPropagation();
        const sheet = document.getElementById('mobile-more-sheet');
        const trigger = document.getElementById('mobile-nav-more-btn');
        if (!sheet) return;
        const shouldOpen = typeof force === 'boolean' ? force : !sheet.classList.contains('open');
        sheet.classList.toggle('open', shouldOpen);
        sheet.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
        if (trigger) trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    },

    renderSettings() {
        const el = document.getElementById('page-settings');
        if (!el) return;
        
        const settings = Store.getSettings();
        const theme = settings.theme || 'dark';
        el.innerHTML = `
        <div class="section-header">
            <h2>Settings</h2>
            <p>Customize your platform experience</p>
        </div>
        
        <div style="max-width: 600px; margin: 0 auto">
            <div class="glass-card" style="padding:var(--sp-6); margin-bottom:var(--sp-6)">
                <h3 style="margin-bottom:var(--sp-4)">Appearance</h3>

                <div class="form-group">
                    <label class="form-label">Theme</label>
                    <div class="theme-picker" role="radiogroup" aria-label="Theme">
                        <button type="button" class="theme-option ${theme === 'dark' ? 'selected' : ''}" data-theme="dark" onclick="App.setTheme('dark')" data-testid="theme-dark">
                            <span class="theme-swatch theme-swatch-dark" aria-hidden="true"></span>
                            <span>Dark</span>
                        </button>
                        <button type="button" class="theme-option ${theme === 'light' ? 'selected' : ''}" data-theme="light" onclick="App.setTheme('light')" data-testid="theme-light">
                            <span class="theme-swatch theme-swatch-light" aria-hidden="true"></span>
                            <span>Light</span>
                        </button>
                        <button type="button" class="theme-option ${theme === 'system' ? 'selected' : ''}" data-theme="system" onclick="App.setTheme('system')" data-testid="theme-system">
                            <span class="theme-swatch theme-swatch-system" aria-hidden="true"></span>
                            <span>System</span>
                        </button>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Font Size</label>
                    <select class="form-select" id="setting-font-size" onchange="App.saveSettings()">
                        <option value="small" ${settings.fontSize === 'small' ? 'selected' : ''}>Small</option>
                        <option value="medium" ${settings.fontSize === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="large" ${settings.fontSize === 'large' ? 'selected' : ''}>Large</option>
                    </select>
                </div>
                
                <div class="form-group" style="margin-bottom:0">
                    <label class="toggle-wrap">
                        <input type="checkbox" id="setting-motion" ${settings.reducedMotion ? 'checked' : ''} onchange="App.saveSettings()">
                        <div class="toggle-switch"></div>
                        <span>Reduced Motion</span>
                    </label>
                </div>
            </div>
            
            <div class="glass-card" style="padding:var(--sp-6)">
                <h3 style="margin-bottom:var(--sp-4); color:var(--danger)">Data Management</h3>
                <div style="display:flex; gap:var(--sp-3); flex-wrap:wrap">
                    <button class="btn btn-secondary" onclick="Utils.downloadAsText(Store.exportAll(), 'study_data.json')" data-testid="export-data-btn">Export Data</button>
                    <button class="btn btn-danger" onclick="App.clearData()" data-testid="clear-data-btn">Clear All Progress</button>
                </div>
            </div>
            
            <div style="margin-top:var(--sp-8); text-align:center; color:var(--text-muted); font-size:0.8rem">
                <p>Lernio AI · Built for engineering students</p>
                <p style="margin-top:4px">v2.1 · PWA + Theme + Smart Dashboard</p>
            </div>
        </div>`;
    },

    setTheme(theme) {
        Store.updateSettings({ theme });
        document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('selected'));
        const active = document.querySelector(`.theme-option[data-theme="${theme}"]`);
        if (active) active.classList.add('selected');
        this.applySubjectTheme();
        Utils.showToast(`Theme: ${theme}`, 'success');
    },

    saveSettings() {
        const fontSize = document.getElementById('setting-font-size').value;
        const reducedMotion = document.getElementById('setting-motion').checked;
        Store.updateSettings({ fontSize, reducedMotion });
        this.applySubjectTheme();
        Utils.showToast('Settings saved', 'success');
    },

    clearData() {
        if (confirm('Delete all progress, scores, and bookmarks? This cannot be undone.')) {
            Store.clearAll();
            Utils.showToast('All data cleared', 'info');
            setTimeout(() => window.location.reload(), 1000);
        }
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (!window.SubjectRegistry || SubjectRegistry.getAll().length === 0) {
            console.error('No subjects registered.');
            return;
        }
        App.init();
    }, 50);
});

if (typeof Notes === 'undefined') {
  window.Notes = { render: () => console.warn('Notes module replaced by SemesterHub') };
}
if (typeof UploadNotes === 'undefined') {
  window.UploadNotes = { open: () => SemesterNotes.openUploadModal() };
}
