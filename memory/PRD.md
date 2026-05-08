# Lernio AI — Product Requirements Document (PRD)

## Original Problem Statement (Verbatim)
Full production-grade upgrade of the Lernio AI repo (https://github.com/GYASH28/LERNIOAI):
- Fix all bugs / errors / mobile layout issues / Firebase / Vercel issues / AI failures.
- Heavy UI/UX redesign with premium glassmorphism, animations, micro-interactions.
- Add features: Smart Dashboard, ChatGPT-style AI Tutor with chips and copy/retry/clear, better quiz with hints/explanations, better notes search/filters, analytics improvements, PWA installable.
- Security hardening: never expose Firebase admin / Drive service account / n8n / Gemini keys in frontend.
- Deployment reliability: Vercel buildCommand `npm run build`, output `dist`, clean routes redirect to hash routes.
- Performance: lazy-load PDF/DOCX preview, optimize for low-end Android.
- Code quality: keep static HTML/CSS/JS architecture (no React conversion), modular, defensive utilities.
- Treat as a production upgrade, not a tweak.

## Architecture
- Static HTML/CSS/JS single-page app (hash-routed) deployed on Vercel.
- 7 Vercel serverless functions in `/api`:
  - `chat.js` — n8n chat proxy
  - `ai-hint.js` — n8n quiz hint proxy (sanitizes against answer reveal)
  - `ai.js` — optional Gemini fallback (`gemini-2.5-flash` default)
  - `progress.js` — Firestore `userProgress` sync (Firebase Admin)
  - `config.js` — public route names
  - `drive-notes.js` — Google Drive folder listing (service account)
  - `drive-file.js` — streams allowed Drive PDFs
- Firebase: client config public (intentional, per Firebase docs); Auth + Firestore + Storage on the client; Admin SDK on the server.
- Routing: hash-based (`#/dashboard`, `#/chat`, `#/semester-2/WD`, …) with Vercel cleanUrls + redirects.

## User Personas
1. **Engineering Student (primary)** — wants notes by subject, practice quizzes, AI tutor for explanations, mobile-first.
2. **Teacher / Admin (secondary)** — uploads notes via Google Drive folder; promoted via Firestore `users/{uid}.role`.

## Core Requirements (static)
- Mobile-first, no horizontal scrolling, safe-area aware.
- Defensive APIs — every route falls back gracefully if env vars missing.
- No fake data — empty subjects show empty states, no placeholder MCQs.
- All secrets server-side only.

## Implementation Status (this session)

### Completed (2026-01)

**Critical bug fixes**
- `auth.css` rebuilt: 7 undefined CSS variables (`--surface-1`, `--rad-lg`, `--brand-primary`…) replaced with real design-system tokens. Auth UI now renders correctly.
- Mobile bottom navigation rebuilt: 8 overflowing items → 5-item grid + slide-up "More" sheet for Settings / Analytics / Login / Logout.
- Inline styles on header buttons removed in favour of CSS classes (`nav-icon-only`, `#nav-login-btn`).
- Auth form `<label>` placement fixed (was missing `for=` and using sibling combinator that didn't match HTML).
- Mobile nav uses `env(safe-area-inset-bottom)` for iOS notch safety.

**Major UI/UX upgrade**
- Premium glass tokens (richer borders, saturated glass, deeper shadow scale).
- Buttons: heavier weight, modern shadow, focus-visible outlines.
- Dashboard: hero card with greeting + streak chip, count-up stat tiles, "Today's Goal" CTA card, dashboard-heading dividers, exam-subject grid with hover slide.
- AI Tutor: pulsing avatar ring, chat bubbles with copy/retry hover actions, animated typing dots, 7 prompt chips (Explain Simply, Exam Answer, Short Notes, Create MCQs, Hinglish, Weak Topics, Study Plan), header clear-chat button.
- Footer: 3-column grid (brand / explore links / credits) with auto year.

**New features**
- PWA: `manifest.json` + `service-worker.js` with cache-first static / network-first navigation / network-only API strategy. Service worker registered in `index.html`.
- AI Tutor copy-to-clipboard, retry-last-message, clear-chat actions.
- "Today's Goal" smart card on dashboard (auth-aware, perf-aware, streak-aware).
- Count-up animations on stat tiles.

**Code / config**
- `.env.example` expanded to 12 documented variables.
- `README.md` rewritten with deployment checklist, manual setup steps for Firebase/Drive/n8n, project structure, and folder shape.
- `scripts/build-static.js` updated to copy `manifest.json` + `service-worker.js` and assert their presence.
- `data-testid` attributes added across header, nav, mobile nav, dashboard tiles, chat composer, auth form for testing reliability.

### File Changes Summary
- `index.html` — header nav, mobile nav with More sheet, AI Tutor header actions, expanded chip row, redesigned footer, PWA links + SW registration, data-testids.
- `css/design-system.css` — refined glass tokens, added shadow-xl + shadow-glow-lg.
- `css/layout.css` — desktop nav with login pill, mobile nav 5-grid + More sheet animations, modernized footer grid.
- `css/components.css` — modern buttons with focus-visible, richer glass blur+saturation.
- `css/auth.css` — full rewrite using real tokens.
- `css/dashboard.css` — full rewrite (welcome hero, streak chip, stat tiles, today's goal, exam grid, dashboard headings).
- `css/ai.css` — full rewrite (pulsing avatar, msg-row with hover actions, animated typing dots, 7-chip carousel).
- `js/dashboard.js` — full rewrite (smart stats, today's goal, count-up).
- `js/ai.js` — full rewrite (copy/retry/clear, typing dots row, expanded chips with subject-aware prefixes).
- `js/app.js` — added `toggleMobileMore`, ESC closes the sheet.
- `manifest.json` — created.
- `service-worker.js` — created.
- `scripts/build-static.js` — copies + asserts new PWA files.
- `.env.example` — expanded.
- `README.md` — comprehensive deployment guide.

### Build & Lint
- `npm install` ✅
- `npm run check` ✅ (38 JS files, 14 mapped static assets)
- `npm run build` ✅ (`dist/` size 40 MB, includes manifest + SW)
- ESLint on `/app/js`, `/app/api`, `service-worker.js` ✅ no issues

## Future / Backlog (not done in this session)
- P1: Notes page UI redesign (search bar, filter chips, preview thumbnails).
- P1: Quiz "Ask AI to explain this question" button on review screen (Get Hint already exists).
- P2: Dark/light theme toggle (currently dark only).
- P2: Recent notes & favourite notes (localStorage cache).
- P2: Service worker offline page when fully offline.
- P3: Real-time progress sync via Firestore listeners.

## Manual Setup Required (User-side, can't be automated)

1. **Firebase Console**
   - Enable Email/Password and Google sign-in providers.
   - Add Vercel domain (e.g. `lernioai.vercel.app`) and `localhost` to authorized domains.
   - Deploy `firestore.rules` and `storage.rules` (`firebase deploy --only firestore:rules,storage:rules`).

2. **Vercel → Settings → Environment Variables** (12 vars listed in `.env.example`)
   - Paste each one (production + preview). Site loads even if some missing.

3. **Google Drive**
   - Share notes folder with `lernio-drive-reader@lernio-b4c65.iam.gserviceaccount.com` as Viewer.
   - Folder ID `1pMa0PCKA3-nuALX8L7sEThqa_AvCitAW` is already known to the user.

4. **n8n Cloud**
   - Activate both webhooks (chat & quiz-hint).
   - Verify production URLs: `https://brace28.app.n8n.cloud/webhook/137b3445-…/chat` and `…/webhook/quiz-hint`.

## Next Action Items
1. User adds the 12 env vars in Vercel and triggers a redeploy.
2. Verify auth flow + AI Tutor on production.
3. Pick from backlog: notes page redesign or quiz review-AI button.
