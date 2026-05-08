/* ============================================================
   SEMESTER NOTES - View, search, preview, and add subject notes
   ============================================================ */

const SemesterNotes = {
    notes: [],
    platformNotes: [],
    mcqPdfs: [],
    currentTab: 'class',
    currentSemId: null,
    currentSubCode: null,
    searchQuery: '',
    typeFilter: 'all',     // all | pdf | docx | image | text
    sourceFilter: 'all',   // all | google-drive | folder | platform | student
    _selectedFile: null,
    _pdfDoc: null,

    ALLOWED_MIME: {
        'application/pdf': 'pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'image/jpeg': 'image',
        'image/png': 'image',
        'image/webp': 'image'
    },

    _uid() { return Auth.user ? Auth.user.id : null; },
    _db() { return window.firestoreDb; },
    _storage() { return window.firebaseStorage; },
    _genId() { return crypto.randomUUID ? crypto.randomUUID() : 'n' + Date.now() + Math.random().toString(36).slice(2, 9); },
    _cleanText(s, max = 5000) { return (s || '').toString().trim().slice(0, max); },
    _sanitize(s) { const d = document.createElement('div'); d.textContent = (s || '').toString().slice(0, 5000); return d.innerHTML; },
    _fmtSize(b) {
        if (!b) return 'Text note';
        if (b < 1024) return b + 'B';
        if (b < 1048576) return (b / 1024).toFixed(1) + 'KB';
        return (b / 1048576).toFixed(1) + 'MB';
    },
    _fmtDate(ts) {
        if (!ts) return 'Just now';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    _typeIcon(t) {
        if (t === 'pdf') return 'PDF';
        if (t === 'docx') return 'DOC';
        if (t === 'image') return 'IMG';
        return 'TXT';
    },
    _loadScript(src) {
        if (document.querySelector(`script[src="${src}"]`)) {
            return new Promise((resolve, reject) => {
                const existing = document.querySelector(`script[src="${src}"]`);
                if (existing.dataset.loaded === 'true') resolve();
                else {
                    existing.addEventListener('load', resolve, { once: true });
                    existing.addEventListener('error', reject, { once: true });
                }
            });
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.dataset.loaded = 'false';
            script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
            script.onerror = () => reject(new Error('Preview library failed to load.'));
            document.head.appendChild(script);
        });
    },

    _subjectContext() {
        const config = window.SemestersConfig || [];
        const semester = config.find(s => s.id === this.currentSemId);
        const subject = semester ? semester.subjects.find(s => s.code === this.currentSubCode) : null;
        return { semester, subject };
    },

    async render(semId, subCode) {
        this.currentSemId = semId;
        this.currentSubCode = subCode;
        this.currentTab = 'class';
        this.searchQuery = '';
        this.typeFilter = 'all';
        this.sourceFilter = 'all';
        this._selectedFile = null;

        const el = document.getElementById('page-notes');
        if (!el) return;

        const config = window.SemestersConfig || [];
        const semester = config.find(s => s.id === semId);
        const subject = semester ? semester.subjects.find(s => s.code === subCode) : null;

        if (!semester || !subject) {
            SemesterHub.render();
            return;
        }

        const hasQuiz = window.SubjectMapping && SubjectMapping.hasQuiz(subCode);
        const quizCount = hasQuiz ? SubjectMapping.getQuizCount(subCode) : 0;

        el.innerHTML = `
            <nav class="sem-breadcrumbs" aria-label="Breadcrumb">
                <a onclick="SemesterHub.render()">Home</a> <span>></span>
                <a onclick="SemesterHub.render()">Notes</a> <span>></span>
                <a onclick="SubjectView.render('${semId}')">${this._sanitize(semester.name)}</a> <span>></span>
                <span aria-current="page">${this._sanitize(subject.name)}</span>
            </nav>

            <div class="section-header" style="border-bottom: 2px solid ${semester.color}; padding-bottom: var(--sp-4);">
                <button class="btn btn-ghost btn-sm" onclick="SubjectView.render('${semId}')" style="margin-bottom: var(--sp-2)">Back to Subjects</button>
                <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:var(--sp-3);">
                    <div>
                        <h2 style="color:${semester.color}">${this._sanitize(subject.icon)} ${this._sanitize(subject.name)} <span style="font-size:1rem;opacity:0.7">(${this._sanitize(subject.code)})</span></h2>
                        <p>${this._sanitize(semester.name)} - ${subject.credits} Credits - <span id="notes-counter">Loading notes...</span></p>
                    </div>
                    <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">
                        <button class="btn btn-secondary btn-sm" id="drive-sync-btn" onclick="SemesterNotes.syncDriveNotes()">Sync from Google Drive</button>
                        <button class="btn btn-primary btn-sm" onclick="SemesterNotes.openUploadModal('${semId}', '${subCode}')">Add Notes</button>
                    </div>
                </div>
            </div>

            <div class="notes-explainer-layout">
                <div class="notes-main-area">
                    <div class="upload-notes-controls" style="margin-top:var(--sp-6);">
                        <div class="un-search-wrap">
                            <span class="un-search-icon">Search</span>
                            <input class="un-search-input" id="subject-note-search" placeholder="Search notes, PDFs, MCQs, or student uploads..." oninput="SemesterNotes.handleSubjectSearch(this.value)">
                        </div>
                        <div id="drive-sync-status" style="display:none;margin-top:var(--sp-2);font-size:0.82rem;color:var(--text-secondary);"></div>
                    </div>

                    <section class="subject-quiz-panel glass-card" id="subject-quiz-panel">
                        ${hasQuiz ? `
                            <div>
                                <h3>Quiz / MCQ Practice</h3>
                                <p>${quizCount} real MCQs are available for this subject.</p>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="SemesterNotes.launchQuiz('${subCode}')">Take Quiz</button>
                        ` : `
                            <div>
                                <h3>Quiz / MCQ Practice</h3>
                                <p>No quiz added yet. Quiz will be available soon.</p>
                            </div>
                        `}
                    </section>

                    <div class="notes-tab-bar">
                        <button class="notes-tab active" id="tab-class" onclick="SemesterNotes.switchTab('class')" data-testid="notes-tab-class">Class Notes</button>
                        <button class="notes-tab" id="tab-my" onclick="SemesterNotes.switchTab('my')" data-testid="notes-tab-my">My Notes</button>
                    </div>
                    <div class="notes-filter-row" id="notes-filter-row">
                        <!-- Filter chips injected by renderNotes() -->
                    </div>
                    <div class="un-grid" id="notes-grid"></div>
                </div>

                <aside class="topic-explainer-sidebar glass-card">
                    <div class="te-header">
                        <div class="te-title">Topic Explainer</div>
                        <p>Ask AI about ${this._sanitize(subject.name)}</p>
                    </div>
                    <div class="te-messages" id="te-messages">
                        <div class="te-msg bot">Hello! Ask me to explain any topic from ${this._sanitize(subject.name)}.</div>
                    </div>
                    <div class="te-quick-actions">
                        <button onclick="SemesterNotes.askExplainer('Explain the main concepts in simple words')">Explain simply</button>
                        <button onclick="SemesterNotes.askExplainer('Give me the most important exam points')">Exam points</button>
                        <button onclick="SemesterNotes.askExplainer('Give me a real-world example')">Example</button>
                    </div>
                    <div class="te-input-wrap">
                        <input type="text" id="te-input" placeholder="Ask Lernio AI to explain..." onkeypress="if(event.key==='Enter') SemesterNotes.sendExplainerMessage()">
                        <button id="te-send" onclick="SemesterNotes.sendExplainerMessage()" aria-label="Send topic explainer message">+</button>
                    </div>
                </aside>
            </div>

            <button class="fab-btn fab-pulse" id="sem-fab" onclick="SemesterNotes.openUploadModal('${semId}', '${subCode}')" aria-label="Add Note" title="Add Note">+</button>
        `;

        await this.fetchNotes();
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.notes-tab').forEach(b => b.classList.remove('active'));
        const active = document.getElementById(`tab-${tab}`);
        if (active) active.classList.add('active');
        this.renderNotes();
    },

    handleSubjectSearch(value) {
        this.searchQuery = value || '';
        this.renderNotes();
    },

    renderSkeletons() {
        const g = document.getElementById('notes-grid');
        if (!g) return;
        g.innerHTML = Array(3).fill(`<div class="un-skeleton-card"><div class="un-skeleton-thumb"></div><div class="un-skeleton-body"><div class="un-skeleton-line wide"></div><div class="un-skeleton-line narrow"></div></div></div>`).join('');
    },

    _normalizeDedupeKey(item) {
        const title = (item.title || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
        const subject = item.subjectId || item.subject || this.currentSubCode || '';
        const unit = item.unitId || item.unit || '';
        return `${subject}_${unit}_${title}`;
    },

    _dedupeItems(items) {
        const seenDriveIds = new Set();
        const seenTitles = new Set();

        return items.filter(item => {
            if (item.driveFileId) {
                if (seenDriveIds.has(item.driveFileId)) return false;
                seenDriveIds.add(item.driveFileId);
            }

            const key = this._normalizeDedupeKey(item);
            if (seenTitles.has(key)) return false;
            seenTitles.add(key);
            return true;
        });
    },

    _sourceOrder(source) {
        if (source === 'google-drive') return 0;
        if (source === 'folder') return 1;
        if (source === 'previous-data' || source === 'platform') return 2;
        return 3;
    },

    _sortItems(items) {
        return items.sort((a, b) => {
            const sourceDiff = this._sourceOrder(a.source) - this._sourceOrder(b.source);
            if (sourceDiff) return sourceDiff;
            const unitA = a.unitId || a.unit || 999;
            const unitB = b.unitId || b.unit || 999;
            if (unitA !== unitB) return unitA - unitB;
            return (a.title || '').localeCompare(b.title || '', 'en', { numeric: true });
        });
    },

    _applyPlatformSources() {
        const staticNotes = window.SubjectMapping ? SubjectMapping.getPlatformNotes(this.currentSubCode) : [];
        const staticMcqs = window.SubjectMapping ? SubjectMapping.getMcqPdfs(this.currentSubCode) : [];
        const driveNotes = window.DriveNotes ? DriveNotes.getSubjectNotes(this.currentSubCode) : [];
        const driveMcqs = window.DriveNotes ? DriveNotes.getSubjectMcqPdfs(this.currentSubCode) : [];

        this.platformNotes = this._sortItems(this._dedupeItems([...driveNotes, ...staticNotes]));
        this.mcqPdfs = this._sortItems(this._dedupeItems([...driveMcqs, ...staticMcqs]));
    },

    _showDriveStatus(message = '') {
        const status = document.getElementById('drive-sync-status');
        if (!status) return;
        status.textContent = message;
        status.style.display = message ? 'block' : 'none';
    },

    async fetchNotes() {
        this.renderSkeletons();
        this.notes = [];
        this._applyPlatformSources();
        this.renderNotes();

        if (window.DriveNotes) {
            try {
                await DriveNotes.load();
                this._applyPlatformSources();
                this._showDriveStatus('');
                this.renderNotes();
            } catch (error) {
                console.warn('Drive notes unavailable:', error.message || error);
                this._showDriveStatus(DriveNotes.friendlyError());
            }
        }

        const db = this._db();
        if (!db) return;

        try {
            const query = db.collection('userNotes')
                .where('semester', '==', this.currentSemId)
                .where('subject', '==', this.currentSubCode)
                .get();
            const timeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Cloud notes timed out.')), 3500);
            });
            const snap = await Promise.race([query, timeout]);
            this.notes = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
        } catch (e) {
            console.error('Fetch notes error:', e);
            this.notes = [];
        }

        this.renderNotes();
    },

    async syncDriveNotes() {
        if (!window.DriveNotes) return;
        const btn = document.getElementById('drive-sync-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Syncing...';
        }

        try {
            await DriveNotes.load({ force: true });
            this._applyPlatformSources();
            this._showDriveStatus('');
            this.renderNotes();
            Utils.showToast('Google Drive notes synced.', 'success');
        } catch (error) {
            console.warn('Drive sync failed:', error.message || error);
            this._showDriveStatus(DriveNotes.friendlyError());
            Utils.showToast(DriveNotes.friendlyError(), 'warning');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Sync from Google Drive';
            }
        }
    },

    _matchesQuery(item) {
        const q = this.searchQuery.trim().toLowerCase();
        if (q) {
            const haystack = [
                item.title,
                item.unitTitle,
                item.unit ? `unit ${item.unit}` : '',
                item.unitId ? `unit ${item.unitId}` : '',
                item.subject,
                item.subjectId,
                item.content,
                ...(item.tags || [])
            ].join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return this._matchesFilters(item);
    },

    _matchesFilters(item) {
        // Type filter
        if (this.typeFilter && this.typeFilter !== 'all') {
            const t = (item.fileType || (item.content ? 'text' : 'pdf')).toLowerCase();
            if (t !== this.typeFilter) return false;
        }
        // Source filter (only meaningful in 'class' tab)
        if (this.currentTab === 'class' && this.sourceFilter && this.sourceFilter !== 'all') {
            const itemSource = item.source || (item.userId ? 'student' : 'platform');
            const platformLike = ['previous-data', 'platform'];
            const isPlatform = platformLike.includes(itemSource);
            if (this.sourceFilter === 'platform' && !isPlatform) return false;
            if (this.sourceFilter !== 'platform' && itemSource !== this.sourceFilter) return false;
        }
        return true;
    },

    setTypeFilter(value) {
        this.typeFilter = value;
        this.renderNotes();
    },

    setSourceFilter(value) {
        this.sourceFilter = value;
        this.renderNotes();
    },

    _renderFilterChips() {
        const row = document.getElementById('notes-filter-row');
        if (!row) return;

        // Compute counts from the relevant pool (current tab)
        const uid = this._uid();
        const allItems = this.currentTab === 'class'
            ? [
                ...(this.platformNotes || []),
                ...(this.mcqPdfs || []),
                ...this.notes.filter(n => n.isPublic)
              ]
            : this.notes.filter(n => n.userId === uid);

        const countByType = (type) => {
            return allItems.filter(item => {
                const t = (item.fileType || (item.content ? 'text' : 'pdf')).toLowerCase();
                return type === 'all' ? true : t === type;
            }).length;
        };

        const countBySource = (src) => {
            return allItems.filter(item => {
                const s = item.source || (item.userId ? 'student' : 'platform');
                if (src === 'all') return true;
                if (src === 'platform') return ['previous-data', 'platform'].includes(s);
                return s === src;
            }).length;
        };

        const typeChips = [
            { id: 'all', label: 'All' },
            { id: 'pdf', label: 'PDF' },
            { id: 'docx', label: 'Doc' },
            { id: 'image', label: 'Image' },
            { id: 'text', label: 'Text' }
        ];

        const sourceChips = [
            { id: 'all', label: 'All sources' },
            { id: 'google-drive', label: 'Drive' },
            { id: 'folder', label: 'Static' },
            { id: 'platform', label: 'Built-in' },
            { id: 'student', label: 'Student' }
        ];

        const typeRow = `
            <div class="filter-chip-row scrollable" role="toolbar" aria-label="Filter notes by type">
                <span class="filter-chip-group-label">Type</span>
                ${typeChips.map(c => {
                    const count = countByType(c.id);
                    const disabled = c.id !== 'all' && count === 0;
                    return `<button class="filter-chip ${this.typeFilter === c.id ? 'active' : ''}" ${disabled ? 'disabled aria-disabled="true"' : ''} onclick="SemesterNotes.setTypeFilter('${c.id}')" data-testid="filter-type-${c.id}">${c.label}${c.id !== 'all' ? `<span class="chip-count">${count}</span>` : ''}</button>`;
                }).join('')}
            </div>`;

        const sourceRow = this.currentTab === 'class' ? `
            <div class="filter-chip-row scrollable" role="toolbar" aria-label="Filter notes by source">
                <span class="filter-chip-group-label">Source</span>
                ${sourceChips.map(c => {
                    const count = countBySource(c.id);
                    const disabled = c.id !== 'all' && count === 0;
                    return `<button class="filter-chip ${this.sourceFilter === c.id ? 'active' : ''}" ${disabled ? 'disabled aria-disabled="true"' : ''} onclick="SemesterNotes.setSourceFilter('${c.id}')" data-testid="filter-source-${c.id}">${c.label}${c.id !== 'all' ? `<span class="chip-count">${count}</span>` : ''}</button>`;
                }).join('')}
            </div>` : '';

        row.innerHTML = typeRow + sourceRow;
    },

    renderNotes() {
        const grid = document.getElementById('notes-grid');
        if (!grid) return;

        this._renderFilterChips();

        const uid = this._uid();
        const platform = this._sortItems([...(this.platformNotes || [])]);
        const mcqs = (this.mcqPdfs || []).filter(pdf => this._matchesQuery(pdf));
        const publicNotes = this.notes.filter(n => n.isPublic && this._matchesQuery(n));
        const myNotes = this.notes.filter(n => n.userId === uid && this._matchesQuery(n));

        let html = '';

        if (this.currentTab === 'class') {
            const driveNotes = platform.filter(n => n.source === 'google-drive' && this._matchesQuery(n));
            const folderNotes = platform.filter(n => n.source === 'folder' && this._matchesQuery(n));
            const previousNotes = platform.filter(n => !['google-drive', 'folder'].includes(n.source) && this._matchesQuery(n));

            html += this._renderPlatformSection('Google Drive Notes', driveNotes);
            html += this._renderPlatformSection('Saved Folder Notes', folderNotes);
            html += this._renderPlatformSection('Previous / Built-in Notes', previousNotes);
            html += this._renderMcqSection(mcqs);
            html += this._renderStudentSection('Student Added Class Notes', publicNotes, uid);

            if (!html.trim()) {
                html = `<div class="un-empty-state">
                    <div class="un-empty-icon">Notes</div>
                    <h4>${this.searchQuery ? 'No notes match your search.' : 'No class notes yet.'}</h4>
                    <p>${this.searchQuery ? 'Try a different keyword.' : 'Notes will be added soon. Students can add notes from the website.'}</p>
                    <button class="btn-add-notes" onclick="SemesterNotes.openUploadModal('${this.currentSemId}', '${this.currentSubCode}')">Add Notes</button>
                </div>`;
            }
        } else {
            myNotes.sort((a, b) => (b.uploadedAt?.toMillis?.() || 0) - (a.uploadedAt?.toMillis?.() || 0));
            if (!myNotes.length) {
                html = `<div class="un-empty-state">
                    <div class="un-empty-icon">Notes</div>
                    <h4>${this.searchQuery ? 'No personal notes match your search.' : "You haven't added any notes here yet."}</h4>
                    <p>${this.searchQuery ? 'Try a different keyword.' : 'Add a text note or attach a PDF for this subject.'}</p>
                    <button class="btn-add-notes" onclick="SemesterNotes.openUploadModal('${this.currentSemId}', '${this.currentSubCode}')">Add Notes</button>
                </div>`;
            } else {
                html = myNotes.map((n, i) => this._renderFirestoreCard(n, i, uid)).join('');
            }
        }

        grid.innerHTML = html;
        this._updateCounter();
    },

    _sectionHeader(title, count) {
        if (!count) return '';
        return `<div style="grid-column:1/-1;margin-top:var(--sp-4);margin-bottom:var(--sp-2);">
            <h4 style="font-size:0.9rem;color:var(--text-secondary);border-bottom:1px solid var(--glass-border);padding-bottom:var(--sp-2);">${this._sanitize(title)} <span class="badge badge-ghost">${count}</span></h4>
        </div>`;
    },

    _renderPlatformSection(title, notes) {
        if (!notes.length) return '';
        const groups = {};
        notes.forEach(note => {
            const key = note.unitId || 'misc';
            if (!groups[key]) groups[key] = { id: note.unitId || 999, title: note.unitTitle || 'General', notes: [] };
            groups[key].notes.push(note);
        });

        let html = this._sectionHeader(title, notes.length);
        Object.values(groups).sort((a, b) => a.id - b.id).forEach(group => {
            const label = group.id === 999 ? this._sanitize(group.title) : `Unit ${this._sanitize(group.id)} - ${this._sanitize(group.title)}`;
            html += `<div style="grid-column:1/-1;margin-top:var(--sp-2);color:var(--text-muted);font-size:0.78rem;">${label}</div>`;
            html += group.notes.map((note, i) => this._renderPlatformCard(note, i)).join('');
        });
        return html;
    },

    _renderPlatformCard(note, i) {
        const isPdf = note.fileType === 'pdf';
        const action = isPdf ? `window.open('${note.fileUrl}', '_blank')` : `SemesterNotes.openPlatformNote('${note.noteId}')`;
        const sourceLabel = note.source === 'google-drive' ? 'Google Drive' : note.source === 'folder' ? 'Saved PDF' : 'Built-in Note';
        return `<div class="un-card" tabindex="0" data-id="${note.noteId}" style="animation-delay:${i * 40}ms" onclick="${action}" onkeydown="if(event.key==='Enter') ${action}" aria-label="${this._sanitize(note.title)}">
            <div class="un-card-thumb"><span class="un-type-icon">${this._typeIcon(note.fileType)}</span></div>
            <div class="un-card-body">
                <div class="un-card-title">${this._sanitize(note.title)}</div>
                <div class="un-card-meta">
                    <span class="tag-chip" style="background:var(--primary);color:#fff;font-size:0.65rem;">${sourceLabel}</span>
                    <span class="tag-chip" style="font-size:0.65rem;">${this._sanitize(note.fileType).toUpperCase()}</span>
                    ${window.SubjectMapping && SubjectMapping.hasQuiz(this.currentSubCode) ? '<span class="tag-chip" style="font-size:0.65rem;">Quiz Available</span>' : ''}
                </div>
            </div>
            <div class="un-card-actions">
                <button class="un-action-btn" onclick="event.stopPropagation(); ${action}">${isPdf ? 'Open PDF' : 'View'}</button>
            </div>
        </div>`;
    },

    _renderMcqSection(mcqs) {
        if (!mcqs.length) return '';
        let html = this._sectionHeader('MCQ Practice Papers', mcqs.length);
        html += mcqs.map((pdf, i) => {
            const fileUrl = pdf.file || pdf.fileUrl;
            const sourceLabel = pdf.source === 'google-drive' ? 'Google Drive' : 'PDF';
            return `<div class="un-card" tabindex="0" style="animation-delay:${i * 40}ms" onclick="window.open('${fileUrl}', '_blank')" aria-label="${this._sanitize(pdf.title)}">
            <div class="un-card-thumb"><span class="un-type-icon">PDF</span></div>
            <div class="un-card-body">
                <div class="un-card-title">${this._sanitize(pdf.title)}</div>
                <div class="un-card-meta">
                    <span class="tag-chip" style="background:#e74c3c;color:#fff;font-size:0.65rem;">${sourceLabel}</span>
                    ${pdf.unit ? `<span class="tag-chip" style="font-size:0.65rem;">Unit ${this._sanitize(pdf.unit)}</span>` : ''}
                </div>
            </div>
            <div class="un-card-actions">
                <button class="un-action-btn" onclick="event.stopPropagation(); window.open('${fileUrl}', '_blank')">Open PDF</button>
            </div>
        </div>`;
        }).join('');
        return html;
    },

    _renderStudentSection(title, notes, uid) {
        if (!notes.length) return '';
        notes.sort((a, b) => (b.uploadedAt?.toMillis?.() || 0) - (a.uploadedAt?.toMillis?.() || 0));
        return this._sectionHeader(title, notes.length) + notes.map((n, i) => this._renderFirestoreCard(n, i, uid)).join('');
    },

    _renderFirestoreCard(n, i, uid) {
        const isOwner = n.userId === uid;
        const fileType = n.fileType || (n.content ? 'text' : 'pdf');
        const tagsHtml = (n.tags || []).map(t => `<span class="tag-chip">${this._sanitize(t)}</span>`).join('');
        const sourceLabel = n.isPublic
            ? '<span class="tag-chip" style="background:var(--success);color:#fff;font-size:0.65rem;">Student Added</span>'
            : '<span class="tag-chip" style="font-size:0.65rem;">Private</span>';

        return `<div class="un-card" tabindex="0" data-id="${n.noteId}" style="animation-delay:${i * 60}ms" onclick="SemesterNotes.openPreview('${n.noteId}')" onkeydown="if(event.key==='Enter') SemesterNotes.openPreview('${n.noteId}')" aria-label="${this._sanitize(n.title)}">
            <div class="un-card-thumb">${fileType === 'image' ? `<img src="${n.fileUrl}" alt="${this._sanitize(n.title)}" loading="lazy">` : `<span class="un-type-icon">${this._typeIcon(fileType)}</span>`}</div>
            <div class="un-card-body">
                <div class="un-card-title" id="un-title-${n.noteId}">${this._sanitize(n.title)}</div>
                <div class="un-card-meta">
                    <span class="un-card-date">${this._fmtDate(n.uploadedAt)}</span>
                    <span class="un-card-size">${this._fmtSize(n.fileSize)}</span>
                    ${sourceLabel}
                </div>
                <div class="un-card-meta">${tagsHtml}</div>
            </div>
            <div class="un-card-actions">
                <button class="un-action-btn" onclick="event.stopPropagation(); SemesterNotes.openPreview('${n.noteId}')">View</button>
                ${isOwner ? `<button class="un-action-btn" onclick="event.stopPropagation(); SemesterNotes.startRename('${n.noteId}')">Rename</button>
                <button class="un-action-btn danger" onclick="event.stopPropagation(); SemesterNotes.confirmDelete('${n.noteId}')">Delete</button>` : ''}
            </div>
        </div>`;
    },

    _updateCounter() {
        const uid = this._uid();
        const myCount = this.notes.filter(n => n.userId === uid).length;
        const platformCount = (this.platformNotes || []).length + (this.mcqPdfs || []).length;
        const classCount = this.notes.filter(n => n.isPublic).length + platformCount;
        const counter = document.getElementById('notes-counter');
        if (counter) counter.textContent = `${classCount} class notes - ${myCount} personal notes`;

        const fab = document.getElementById('sem-fab');
        if (fab) fab.classList.toggle('fab-pulse', myCount === 0);
    },

    openPlatformNote(noteId) {
        const note = (this.platformNotes || []).find(n => n.noteId === noteId);
        if (!note) return;

        const controls = '';
        const body = `<div class="platform-note-content" style="color:var(--text-primary);line-height:1.8;font-size:0.95rem;padding:24px;">
            <div class="badge badge-ghost" style="margin-bottom:12px;">Unit ${this._sanitize(note.unitId)} - ${this._sanitize(note.unitTitle)}</div>
            ${note.content || ''}
        </div>`;
        document.body.insertAdjacentHTML('beforeend', this._previewShell(note.title, controls, body));
        document.addEventListener('keydown', this._escHandler = e => { if (e.key === 'Escape') this.closePreview(); });
    },

    launchQuiz(subCode) {
        const regCode = window.SubjectMapping ? SubjectMapping.getRegistryCode(subCode) : null;
        if (!regCode || !SubjectRegistry.get(regCode) || !SubjectMapping.hasQuiz(subCode)) {
            Utils.showToast('No quiz available for this subject', 'info');
            return;
        }
        Store.setActiveSubject(regCode);
        App.navigate('quiz', false, true);
    },

    askExplainer(text) {
        const input = document.getElementById('te-input');
        if (input) input.value = text;
        this.sendExplainerMessage();
    },

    async sendExplainerMessage() {
        const input = document.getElementById('te-input');
        const text = input ? input.value.trim() : '';
        if (!text) return;

        const messagesEl = document.getElementById('te-messages');
        const btn = document.getElementById('te-send');
        if (!messagesEl || !window.AI) return;

        input.value = '';
        input.disabled = true;
        if (btn) btn.disabled = true;
        messagesEl.insertAdjacentHTML('beforeend', `<div class="te-msg user">${this._sanitize(text)}</div>`);
        const typingId = 'te-typing-' + Date.now();
        messagesEl.insertAdjacentHTML('beforeend', `<div class="te-msg bot" id="${typingId}"><div class="loading-dots">...</div></div>`);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            const { semester, subject } = this._subjectContext();
            let reply = await window.AI._callN8N({
                prompt: text,
                subjectCode: this.currentSubCode,
                subjectName: subject ? subject.name : this.currentSubCode,
                context: `${semester ? semester.name : 'Semester'} / ${subject ? subject.name : 'Subject'}`
            });
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();
            const formattedReply = window.AI && AI._formatMessage
                ? AI._formatMessage(reply)
                : this._sanitize(reply);
            messagesEl.insertAdjacentHTML('beforeend', `<div class="te-msg bot">${formattedReply}</div>`);
        } catch (e) {
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();
            const subject = SubjectRegistry ? SubjectRegistry.get(this.currentSubCode) : null;
            const offline = window.AI && AI._getOfflineReply
                ? AI._getOfflineReply(text, subject)
                : 'Try the notes search, linked PDFs, or available MCQs while AI is unavailable.';
            const message = `${e.message || 'AI is temporarily unavailable.'}\n\nOffline suggestion:\n${offline}`;
            const formattedError = window.AI && AI._formatMessage
                ? AI._formatMessage(message)
                : this._sanitize(message);
            messagesEl.insertAdjacentHTML('beforeend', `<div class="te-msg bot error">${formattedError}</div>`);
        } finally {
            input.disabled = false;
            if (btn) btn.disabled = false;
            input.focus();
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    },

    openUploadModal(prefillSemId = null, prefillSubCode = null) {
        if (!Auth.user) {
            Auth.showAuthOverlay();
            Utils.showToast('Please log in to add notes', 'info');
            return;
        }
        if (!this._db()) {
            Utils.showToast('Database is not configured', 'error');
            return;
        }

        this._selectedFile = null;
        const config = window.SemestersConfig || [];
        const isAdmin = Auth.hasRole && Auth.hasRole('teacher', 'admin');

        const html = `<div class="un-modal-backdrop" id="un-upload-backdrop" onclick="if(event.target===this)SemesterNotes.closeUploadModal()">
            <div class="un-upload-modal" role="dialog" aria-modal="true" aria-label="Add notes">
                <div class="un-modal-header">
                    <h3>Add Your Notes</h3>
                    <button class="un-modal-close" onclick="SemesterNotes.closeUploadModal()" aria-label="Close">x</button>
                </div>
                <div class="un-modal-body">
                    <div class="un-drop-zone" id="un-drop-zone">
                        <input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.webp" onchange="SemesterNotes.onFileInput(event)" aria-label="Choose file">
                        <div class="un-drop-icon">File</div>
                        <p>Attach a PDF, document, or image, or write a text note below.</p>
                        <span class="un-drop-hint">PDF, DOCX, JPG, PNG, WEBP - Max 10MB per file</span>
                    </div>

                    <div class="un-selected-file" id="un-selected-file">
                        <span class="un-file-icon">File</span><span class="un-file-name" id="un-file-name"></span>
                        <span class="un-file-size" id="un-file-size-label"></span>
                        <button class="un-clear-file" onclick="SemesterNotes.clearFile()" aria-label="Remove file">x</button>
                    </div>

                    <div class="un-form-row">
                        <div class="un-form-field" style="flex:1"><label class="un-form-label">Semester</label>
                            <select class="un-form-select" id="sem-select" onchange="SemesterNotes.updateSubjectDropdown(); SemesterNotes._checkUploadReady()" ${prefillSemId ? 'disabled' : ''}>
                                <option value="" disabled selected>Select Semester</option>
                                ${config.map(s => `<option value="${s.id}" ${s.id === prefillSemId ? 'selected' : ''}>${this._sanitize(s.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="un-form-field" style="flex:1"><label class="un-form-label">Subject</label>
                            <select class="un-form-select" id="sub-select" onchange="SemesterNotes._checkUploadReady()" ${prefillSubCode ? 'disabled' : ''}>
                                <option value="" disabled selected>Select Subject</option>
                            </select>
                        </div>
                    </div>

                    <div class="un-form-field"><label class="un-form-label">Note Title</label>
                        <input class="un-form-input" id="un-title-input" maxlength="100" placeholder="Enter note title" oninput="SemesterNotes._checkUploadReady()"></div>

                    <div class="un-form-field"><label class="un-form-label">Note Content</label>
                        <textarea class="un-form-textarea" id="un-content-input" maxlength="5000" placeholder="Write your note here, or leave this empty if you are attaching a file." oninput="SemesterNotes._checkUploadReady()"></textarea></div>

                    <div class="un-form-row">
                        <div class="un-form-field" style="flex:1"><label class="un-form-label">File Type</label>
                            <select class="un-form-select" id="un-type-select">
                                <option value="text">Text</option><option value="pdf">PDF</option><option value="docx">Word Doc</option><option value="image">Image</option>
                            </select>
                        </div>
                        <div class="un-form-field" style="flex:1"><label class="un-form-label">Tags (comma separated)</label>
                            <input class="un-form-input" id="un-tags-input" placeholder="e.g. unit 1, exam, important"></div>
                    </div>

                    <div class="un-form-field"><label class="un-form-label">Visibility</label>
                        <select class="un-form-select" id="un-visibility-select" ${isAdmin ? '' : 'disabled'}>
                            <option value="private" selected>Keep private (only me)</option>
                            ${isAdmin ? '<option value="public">Share with class (Teacher)</option>' : ''}
                        </select>
                        ${!isAdmin ? '<small style="color:var(--text-muted);margin-top:4px;display:block">Students can add private notes. Teachers can share class notes.</small>' : ''}
                    </div>

                    <div class="un-progress-wrap" id="un-progress-wrap">
                        <div class="un-progress-label"><span>Uploading...</span><span id="un-progress-pct">0%</span></div>
                        <div class="un-progress-bar"><div class="un-progress-fill" id="un-progress-fill"></div></div>
                    </div>

                    <button class="un-upload-btn" id="un-upload-btn" disabled onclick="SemesterNotes.uploadFile()">Save Note</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        if (prefillSemId) this.updateSubjectDropdown(prefillSubCode);

        const zone = document.getElementById('un-drop-zone');
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) this.handleFileSelect(e.dataTransfer.files[0]);
        });
        document.addEventListener('keydown', this._escHandler = e => { if (e.key === 'Escape') this.closeUploadModal(); });
        this._checkUploadReady();
    },

    updateSubjectDropdown(prefillCode = null) {
        const semSelect = document.getElementById('sem-select');
        const subSelect = document.getElementById('sub-select');
        if (!semSelect || !subSelect) return;
        const semester = (window.SemestersConfig || []).find(s => s.id === semSelect.value);
        if (semester && semester.subjects) {
            subSelect.innerHTML = semester.subjects.map(s => `<option value="${s.code}" ${s.code === prefillCode ? 'selected' : ''}>${this._sanitize(s.name)}</option>`).join('');
        } else {
            subSelect.innerHTML = '<option value="" disabled selected>Select Subject</option>';
        }
    },

    closeUploadModal() {
        const backdrop = document.getElementById('un-upload-backdrop');
        if (backdrop) backdrop.remove();
        this._selectedFile = null;
        document.removeEventListener('keydown', this._escHandler);
    },

    onFileInput(e) {
        if (e.target.files[0]) this.handleFileSelect(e.target.files[0]);
    },

    handleFileSelect(file) {
        const fileType = this.ALLOWED_MIME[file.type];
        if (!fileType) {
            Utils.showToast('Unsupported file type. Use PDF, DOCX, JPG, PNG, or WEBP.', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            Utils.showToast('File exceeds 10MB limit', 'error');
            return;
        }

        this._selectedFile = file;
        const zone = document.getElementById('un-drop-zone');
        const selected = document.getElementById('un-selected-file');
        if (zone) zone.classList.add('has-file');
        if (selected) selected.classList.add('visible');
        const fileName = document.getElementById('un-file-name');
        const fileSize = document.getElementById('un-file-size-label');
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = this._fmtSize(file.size);
        const title = document.getElementById('un-title-input');
        if (title && !title.value) title.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        const typeSelect = document.getElementById('un-type-select');
        if (typeSelect) typeSelect.value = fileType;
        this._checkUploadReady();
    },

    clearFile() {
        this._selectedFile = null;
        const zone = document.getElementById('un-drop-zone');
        if (zone) {
            zone.classList.remove('has-file');
            const input = zone.querySelector('input');
            if (input) input.value = '';
        }
        const selected = document.getElementById('un-selected-file');
        if (selected) selected.classList.remove('visible');
        const typeSelect = document.getElementById('un-type-select');
        if (typeSelect) typeSelect.value = 'text';
        this._checkUploadReady();
    },

    _checkUploadReady() {
        const sem = document.getElementById('sem-select')?.value;
        const sub = document.getElementById('sub-select')?.value;
        const title = document.getElementById('un-title-input')?.value.trim();
        const content = document.getElementById('un-content-input')?.value.trim();
        const btn = document.getElementById('un-upload-btn');
        if (btn) btn.disabled = !(sem && sub && title && (this._selectedFile || content));
    },

    async uploadFile() {
        if (!Auth.user) return;
        const uid = this._uid();
        const noteId = this._genId();
        const semId = document.getElementById('sem-select')?.value;
        const subjectCode = document.getElementById('sub-select')?.value;
        const title = this._cleanText(document.getElementById('un-title-input')?.value, 100);
        const content = this._cleanText(document.getElementById('un-content-input')?.value, 5000);
        const isPublic = document.getElementById('un-visibility-select')?.value === 'public';
        const rawTags = document.getElementById('un-tags-input')?.value || '';
        const tags = rawTags.split(',').map(t => this._cleanText(t, 40)).filter(Boolean);
        const file = this._selectedFile;
        let fileType = file ? this.ALLOWED_MIME[file.type] : 'text';
        let fileUrl = '';
        let fileSize = 0;
        let storagePath = '';

        if (!semId || !subjectCode || !title || (!file && !content)) {
            Utils.showToast('Add a title and either note content or an attachment.', 'error');
            return;
        }

        const btn = document.getElementById('un-upload-btn');
        const progressWrap = document.getElementById('un-progress-wrap');
        if (btn) { btn.disabled = true; btn.textContent = file ? 'Uploading...' : 'Saving...'; }
        if (file && progressWrap) progressWrap.classList.add('visible');

        try {
            if (file) {
                if (!this._storage()) throw new Error('Storage is not configured');
                storagePath = `semester-notes/${semId}/${subjectCode}/${uid}/${noteId}_${file.name}`;
                const ref = this._storage().ref(storagePath);
                const task = ref.put(file);
                task.on('state_changed', snap => {
                    const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                    const fill = document.getElementById('un-progress-fill');
                    const label = document.getElementById('un-progress-pct');
                    if (fill) fill.style.width = pct + '%';
                    if (label) label.textContent = pct + '%';
                });
                await task;
                fileUrl = await ref.getDownloadURL();
                fileSize = file.size;
            }

            const meta = {
                userId: uid,
                noteId,
                title,
                content,
                fileType,
                fileSize,
                fileUrl,
                storagePath,
                semester: semId,
                subject: subjectCode,
                tags,
                isPublic,
                source: 'student',
                uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await this._db().collection('userNotes').doc(noteId).set(meta);
            Utils.showToast('Note saved successfully!', 'success');
            this.closeUploadModal();

            if (this.currentSemId === semId && this.currentSubCode === subjectCode) {
                await this.fetchNotes();
                if (!isPublic) this.switchTab('my');
            }
        } catch (e) {
            console.error('Upload error:', e);
            Utils.showToast('Save failed: ' + (e.message || 'Please try again.'), 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Save Note'; }
            if (progressWrap) progressWrap.classList.remove('visible');
        }
    },

    openPreview(noteId) {
        const note = this.notes.find(n => n.noteId === noteId);
        if (!note) return;
        const fileType = note.fileType || (note.content ? 'text' : 'pdf');
        if (fileType === 'pdf') this.openPdfPreview(note);
        else if (fileType === 'image') this.openImagePreview(note);
        else if (fileType === 'docx') this.openDocxPreview(note);
        else this.openTextPreview(note);
    },

    _previewShell(title, controls, bodyContent) {
        return `<div class="un-modal-backdrop" id="un-preview-backdrop" onclick="if(event.target===this)SemesterNotes.closePreview()">
            <div class="un-preview-modal" role="dialog" aria-modal="true" aria-label="Preview ${this._sanitize(title)}">
                <div class="un-preview-header"><span class="un-preview-title">${this._sanitize(title)}</span>
                    <div class="un-preview-controls">${controls || ''}
                        <button class="un-preview-btn" onclick="SemesterNotes.closePreview()" aria-label="Close">x</button></div></div>
                <div class="un-preview-body" id="un-preview-body">${bodyContent}</div>
            </div>
        </div>`;
    },

    openTextPreview(note) {
        const body = `<div class="un-docx-content" style="padding:24px;white-space:pre-wrap;line-height:1.75;">${this._sanitize(note.content || 'No text content was added for this note.')}</div>`;
        document.body.insertAdjacentHTML('beforeend', this._previewShell(note.title, '', body));
        document.addEventListener('keydown', this._escHandler = e => { if (e.key === 'Escape') this.closePreview(); });
    },

    async openPdfPreview(note) {
        const controls = `<a class="un-preview-btn" href="${note.fileUrl}" target="_blank" rel="noopener" download>Download</a><a class="un-preview-btn" href="${note.fileUrl}" target="_blank" rel="noopener">Open</a>`;
        document.body.insertAdjacentHTML('beforeend', this._previewShell(note.title, controls, '<div class="un-preview-loading"><div class="un-spinner"></div>Loading PDF...</div>'));
        document.addEventListener('keydown', this._escHandler = e => { if (e.key === 'Escape') this.closePreview(); });
        if (!window.pdfjsLib) {
            try {
                await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            } catch (_) {
                document.getElementById('un-preview-body').innerHTML = `<p>PDF preview is unavailable. <a href="${note.fileUrl}" target="_blank" rel="noopener">Open PDF</a></p>`;
                return;
            }
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib.getDocument(note.fileUrl).promise.then(doc => {
            this._pdfDoc = doc;
            return doc.getPage(1);
        }).then(page => {
            const viewport = page.getViewport({ scale: 1.2 });
            const body = document.getElementById('un-preview-body');
            if (!body) return;
            body.innerHTML = '<canvas id="un-pdf-canvas"></canvas>';
            const canvas = document.getElementById('un-pdf-canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            page.render({ canvasContext: canvas.getContext('2d'), viewport });
        }).catch(() => {
            const body = document.getElementById('un-preview-body');
            if (body) body.innerHTML = `<p style="color:var(--danger)">Failed to load PDF preview. <a href="${note.fileUrl}" target="_blank" rel="noopener">Open PDF</a></p>`;
        });
    },

    openImagePreview(note) {
        const controls = `<a class="un-preview-btn" href="${note.fileUrl}" target="_blank" rel="noopener" download>Download</a>`;
        const body = `<img class="un-img-preview" src="${note.fileUrl}" alt="${this._sanitize(note.title)}" style="max-width:100%;max-height:100%;object-fit:contain">`;
        document.body.insertAdjacentHTML('beforeend', this._previewShell(note.title, controls, body));
        document.addEventListener('keydown', this._escHandler = e => { if (e.key === 'Escape') this.closePreview(); });
    },

    async openDocxPreview(note) {
        const controls = `<a class="un-preview-btn" href="${note.fileUrl}" target="_blank" rel="noopener" download>Download</a>`;
        document.body.insertAdjacentHTML('beforeend', this._previewShell(note.title, controls, '<div class="un-preview-loading"><div class="un-spinner"></div>Converting document...</div>'));
        document.addEventListener('keydown', this._escHandler = e => { if (e.key === 'Escape') this.closePreview(); });
        try {
            if (!window.mammoth) await this._loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
            const response = await fetch(note.fileUrl);
            const buffer = await response.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
            const body = document.getElementById('un-preview-body');
            if (body) body.innerHTML = `<div class="un-docx-content" style="background:#fff;color:#000;padding:20px;border-radius:8px">${result.value}</div>`;
        } catch (e) {
            const body = document.getElementById('un-preview-body');
            if (body) body.innerHTML = `<p style="color:var(--danger)">Failed to preview document. <a href="${note.fileUrl}" target="_blank" rel="noopener">Open file</a></p>`;
        }
    },

    closePreview() {
        const backdrop = document.getElementById('un-preview-backdrop');
        if (backdrop) backdrop.remove();
        this._pdfDoc = null;
        document.removeEventListener('keydown', this._escHandler);
    },

    startRename(noteId) {
        const el = document.getElementById('un-title-' + noteId);
        if (!el) return;
        const current = el.textContent;
        el.innerHTML = `<input class="un-rename-input" value="${this._sanitize(current)}" onblur="SemesterNotes.finishRename('${noteId}',this.value)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value='';this.blur();}" aria-label="Rename note">`;
        el.querySelector('input').focus();
    },

    async finishRename(noteId, value) {
        const title = this._cleanText(value, 100);
        const el = document.getElementById('un-title-' + noteId);
        if (!title) {
            const note = this.notes.find(n => n.noteId === noteId);
            if (el && note) el.textContent = note.title;
            return;
        }
        try {
            await this._db().collection('userNotes').doc(noteId).update({ title });
            const note = this.notes.find(n => n.noteId === noteId);
            if (note) note.title = title;
            if (el) el.textContent = title;
            Utils.showToast('Renamed!', 'success');
        } catch (e) {
            Utils.showToast('Rename failed', 'error');
            this.renderNotes();
        }
    },

    confirmDelete(noteId) {
        const note = this.notes.find(n => n.noteId === noteId);
        if (!note) return;
        const html = `<div class="un-modal-backdrop" id="un-confirm-backdrop" onclick="if(event.target===this)this.remove()">
            <div class="un-confirm-dialog"><div class="un-confirm-icon">!</div>
                <h4>Delete Note?</h4><p>Are you sure you want to delete "${this._sanitize(note.title)}"? This cannot be undone.</p>
                <div class="un-confirm-actions">
                    <button class="un-confirm-cancel" onclick="document.getElementById('un-confirm-backdrop').remove()">Cancel</button>
                    <button class="un-confirm-delete" onclick="SemesterNotes.deleteNote('${noteId}')">Delete</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    async deleteNote(noteId) {
        const confirm = document.getElementById('un-confirm-backdrop');
        if (confirm) confirm.remove();
        const note = this.notes.find(n => n.noteId === noteId);
        if (!note) return;

        try {
            if (note.storagePath && this._storage()) {
                try { await this._storage().ref(note.storagePath).delete(); } catch (e) {}
            }
            await this._db().collection('userNotes').doc(noteId).delete();
            this.notes = this.notes.filter(n => n.noteId !== noteId);
            this.renderNotes();
            Utils.showToast('Note deleted', 'success');
        } catch (e) {
            console.error(e);
            Utils.showToast('Delete failed', 'error');
        }
    }
};

window.SemesterNotes = SemesterNotes;
