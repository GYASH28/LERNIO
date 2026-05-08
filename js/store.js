/* ============================================================
   STORE — localStorage persistence layer
   ============================================================ */
const Store = {
    _prefix: 'studyPlatform_',
    _isHydrating: false,
    _lastSyncErrorAt: 0,

    _get(key) {
        try { return JSON.parse(localStorage.getItem(this._prefix + key)); }
        catch { return null; }
    },
    _set(key, val) {
        try { 
            localStorage.setItem(this._prefix + key, JSON.stringify(val)); 
            if (!this._isHydrating) this._syncToServer();
        }
        catch (e) { console.warn('Store write failed:', e); }
    },

    _syncToServer() {
        if (!window.Auth || !window.Auth.token) return;
        
        // Debounce sync to avoid spamming
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(async () => {
            try {
                const payload = {
                    attempts: this.getAttempts(),
                    streak: this._get('streak') || { current: 0, days: [] },
                    subjects: {}
                };
                
                if (window.SubjectRegistry) {
                    SubjectRegistry.getAll().forEach(s => {
                        payload.subjects[s.code] = {
                            bookmarks: this.getBookmarks(s.code),
                            revised: this.getRevised(s.code),
                            lastUnit: this.getLastUnit(s.code)
                        };
                    });
                }

                const response = await fetch('/api/progress', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.Auth.token}` 
                    },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
            } catch (e) {
                const now = Date.now();
                if (now - this._lastSyncErrorAt > 30000) {
                    this._lastSyncErrorAt = now;
                    console.warn('Progress sync unavailable; local progress is still saved.', e.message || e);
                }
            }
        }, 2000);
    },

    /* --- Active State --- */
    getActiveSubject() { return this._get('activeSubject') || 'WD'; },
    setActiveSubject(code) { this._set('activeSubject', code); },

    getLastUnit(subjectCode) { return this._get(`lastUnit_${subjectCode}`) || 1; },
    setLastUnit(subjectCode, unitId) { this._set(`lastUnit_${subjectCode}`, unitId); },

    /* --- Quiz History --- */
    getAttempts() { return this._get('attempts') || []; },
    saveAttempt(attempt) {
        const list = this.getAttempts();
        attempt.id = Date.now();
        attempt.date = new Date().toISOString();
        list.unshift(attempt);
        if (list.length > 100) list.length = 100;
        this._set('attempts', list);
        this._updateStreak();
        return attempt;
    },
    getAttemptsBySubject(code) { return this.getAttempts().filter(a => a.subject === code); },

    /* --- Bookmarks --- */
    getBookmarks(subjectCode) { return this._get(`bookmarks_${subjectCode}`) || []; },
    toggleBookmark(subjectCode, sectionId) {
        const bm = this.getBookmarks(subjectCode);
        const idx = bm.indexOf(sectionId);
        if (idx >= 0) bm.splice(idx, 1); else bm.push(sectionId);
        this._set(`bookmarks_${subjectCode}`, bm);
        return idx < 0; // returns true if added
    },
    isBookmarked(subjectCode, sectionId) {
        return this.getBookmarks(subjectCode).includes(sectionId);
    },

    /* --- Revised Sections --- */
    getRevised(subjectCode) { return this._get(`revised_${subjectCode}`) || []; },
    toggleRevised(subjectCode, sectionId) {
        const r = this.getRevised(subjectCode);
        const idx = r.indexOf(sectionId);
        if (idx >= 0) r.splice(idx, 1); else r.push(sectionId);
        this._set(`revised_${subjectCode}`, r);
        return idx < 0;
    },

    /* --- Performance Stats --- */
    getPerformance(subjectCode) {
        const attempts = this.getAttemptsBySubject(subjectCode);
        if (attempts.length === 0) return null;
        const scores = attempts.map(a => a.pct);
        const unitStats = {};
        attempts.forEach(a => {
            if (a.unitStats) {
                Object.entries(a.unitStats).forEach(([u, s]) => {
                    if (!unitStats[u]) unitStats[u] = { correct: 0, total: 0 };
                    unitStats[u].correct += s.correct;
                    unitStats[u].total += s.total;
                });
            }
        });
        return {
            totalAttempts: attempts.length,
            avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            bestScore: Math.max(...scores),
            lastScore: scores[0],
            recentScores: scores.slice(0, 10),
            unitStats
        };
    },

    /* --- Study Streak --- */
    _updateStreak() {
        const today = new Date().toDateString();
        const data = this._get('streak') || { days: [], current: 0 };
        if (data.days[0] !== today) {
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            if (data.days[0] === yesterday) {
                data.current++;
            } else {
                data.current = 1;
            }
            data.days.unshift(today);
            if (data.days.length > 30) data.days.length = 30;
            this._set('streak', data);
        }
    },
    getStreak() { return (this._get('streak') || { current: 0 }).current; },

    /* --- AI Cache --- */
    getAiCache(key) { return this._get(`ai_${key}`); },
    setAiCache(key, val) { this._set(`ai_${key}`, val); },

    /* --- Settings --- */
    getSettings() { return this._get('settings') || { fontSize: 'medium', reducedMotion: false, theme: 'dark' }; },
    updateSettings(updates) { this._set('settings', { ...this.getSettings(), ...updates }); },

    /* --- Export/Import/Sync --- */
    setProgressData(data) {
        if (!data) return;
        this._isHydrating = true;
        try {
            if (data.attempts) this._set('attempts', data.attempts);
            if (data.streak) this._set('streak', data.streak);
            
            // Subject specific data
            if (data.subjects) {
                Object.entries(data.subjects).forEach(([code, sd]) => {
                    if (sd.bookmarks) this._set(`bookmarks_${code}`, sd.bookmarks);
                    if (sd.revised) this._set(`revised_${code}`, sd.revised);
                    if (sd.lastUnit) this._set(`lastUnit_${code}`, sd.lastUnit);
                });
            }
        } finally {
            this._isHydrating = false;
        }
    },
    
    exportAll() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith(this._prefix)) data[k] = localStorage.getItem(k);
        }
        return JSON.stringify(data, null, 2);
    },
    importAll(json) {
        try {
            const data = JSON.parse(json);
            Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
            return true;
        } catch { return false; }
    },
    clearAll() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith(this._prefix)) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
    }
};

window.Store = Store;
