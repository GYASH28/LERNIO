# Lernio AI

> AI-powered, mobile-first learning platform for engineering students.
> Static HTML/CSS/JS + Vercel serverless APIs + Firebase + Google Drive notes + n8n AI Tutor.

[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel)](https://lernioai.vercel.app)
[![Firebase](https://img.shields.io/badge/Auth-Firebase-orange?logo=firebase)](https://firebase.google.com)

---

## Highlights

- **Premium glass UI** with subject-aware accent themes, count-up stats, and smooth GSAP animations.
- **AI Tutor** (n8n primary, optional Gemini fallback) with copy / retry / clear, prompt chips for MCQs, Hinglish, study plans, and weak-topic analysis.
- **Adaptive quizzes** with timer, instant feedback, AI hints, negative marking, and per-topic analytics.
- **Semester-aware notes** that merge Google Drive PDFs, static fallbacks, built-in subject data, and student uploads.
- **Mobile-first**: 5-tab bottom nav with slide-up "More" sheet, safe-area padding, and a full PWA (manifest + service worker for offline static caching).
- **Defensive serverless APIs**: every API gracefully degrades when env vars are missing, so the site always loads.

## Tech Stack

| Area | Tech |
| --- | --- |
| Frontend | Vanilla JS modules, GSAP, Three.js, CSS variables |
| Auth | Firebase Authentication (Email + Google) |
| Database | Firestore (notes, progress, attempts) + Firebase Storage |
| Notes pipeline | Google Drive (service account) → static fallback → built-in data → student uploads |
| AI | n8n webhook (primary) + Gemini (`/api/ai`, optional fallback) |
| Hosting | Vercel (static + serverless) |

---

## Local Development

```bash
git clone https://github.com/GYASH28/LERNIOAI.git
cd LERNIOAI
npm install
cp .env.example .env   # then fill in your secrets
npm run dev
```

Open http://localhost:8080.

Run all checks:

```bash
npm run check   # Static JS lint
npm run build   # Builds dist/ for Vercel
```

To serve the production build locally:

```bash
npm run build
npx serve dist
```

---

## Vercel Deployment

### 1. Project Settings (Vercel Dashboard → your project → Settings)

| Field | Value |
| --- | --- |
| **Framework Preset** | `Other` |
| **Root Directory** | `./` (or `LERNIO-main` if your repo has a wrapper folder) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` (default) |
| **Node.js Version** | 18.x or newer |

### 2. Required Environment Variables

Add these in **Vercel → Settings → Environment Variables**. The site will load even if some are missing — the related feature simply shows a clean fallback.

| Variable | Used for | Where to get it |
| --- | --- | --- |
| `N8N_CHAT_WEBHOOK_URL` | AI Tutor chat | Your n8n cloud → "Production URL" of the chat workflow |
| `N8N_HINT_WEBHOOK_URL` | Quiz AI hints | Your n8n cloud → "Production URL" of the hint workflow |
| `GEMINI_API_KEY` | Optional `/api/ai` fallback | https://aistudio.google.com/app/apikey |
| `GEMINI_MODEL` | Optional override (default `gemini-2.5-flash`) | https://ai.google.dev/gemini-api/docs/models |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Server-side Firestore + token verify | Firebase Console → Project Settings → Service Accounts → "Generate new private key" → paste full JSON |
| _or split:_ `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Same as above | Same JSON, split into 3 fields. Private key must use literal `\n` |
| `GOOGLE_DRIVE_FOLDER_ID` | Drive notes root | Your Drive folder URL → the segment after `/folders/` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Drive read access | Your service account email |
| `GOOGLE_PRIVATE_KEY` | Drive auth | Service account JSON `private_key` (use literal `\n`) |
| `GOOGLE_PROJECT_ID` | Drive auth (optional) | Your GCP project id |

> **Never** commit secrets. Frontend JS only ever sees the public Firebase Web SDK config; all admin / service-account keys live server-side.

### 3. Deployment Flow

1. Push to GitHub (Lernio's `main` branch).
2. Confirm env vars in Vercel.
3. Vercel auto-deploys on push.
4. Verify the root URL loads `index.html`.
5. Open these to confirm everything wired up:
    - `/api/config` → returns `{ AI_CHAT_API, AI_HINT_API }`
    - `/api/chat` (POST) → routes through n8n
    - `/api/ai-hint` (POST) → routes through n8n hint webhook
    - `/api/progress` (with auth header) → reads/writes Firestore
    - `/api/drive-notes` → returns Drive notes or a clean config error
    - `/api/drive-file?id=<fileId>` → streams an allowed PDF

---

## Manual setup beyond environment variables

Some integrations require a one-time configuration step that can't be automated:

### Firebase

- Enable **Email/Password** and **Google** providers in Firebase Console → Authentication → Sign-in method.
- Add your Vercel domain (e.g. `lernioai.vercel.app` and `localhost`) in Authentication → Settings → Authorized Domains.
- Deploy `firestore.rules` and `storage.rules` from this repo:
  ```bash
  firebase deploy --only firestore:rules,storage:rules
  ```
- Promote a teacher / admin by setting `role: "teacher"` or `role: "admin"` in their `users/{uid}` document.

### Google Drive notes

1. Google Cloud Console → enable the **Google Drive API**.
2. Create a service account; download the JSON key.
3. Share your Drive notes folder with the service account email (Viewer is enough).
4. Set `GOOGLE_DRIVE_FOLDER_ID` (folder id from the URL) in Vercel.
5. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` (use literal `\n`).

Recommended folder shape:

```text
LERNIO/
  SEMISTER 2/
    WEB DESIGN/
      Unit 1.pdf
    PROGRAMMING IN C/
      Unit 1.pdf
    BEEE(...)/
      BEE(EE)NOTES/
        MCQ's/
          Unit 1 MCQs.pdf
      BEE(EX)NOTES/
        EX MANUAL/
          Practical Manual.pdf
```

Subject aliases in code: `WEB DESIGN → WD`, `PROGRAMMING IN C → CS102`, `BEE(EE)NOTES → EE101`, `BEE(EX)NOTES → EC101`, `LINUX BASICS → LIN101`, `PCO… → PCO101`, `APPLIED MATHS → MA102`. Unknown folders are skipped safely and logged as warnings.

### n8n webhooks

1. Create two workflows (chat + quiz hint) in n8n cloud.
2. Activate both and copy the **production URL**.
3. The chat flow should accept `chatInput` / `message` and return either a string in `reply`/`output`/`text`, or an object containing those keys.
4. The hint flow should accept the question payload and return `hint` (or any extractable text). It must not reveal the answer letter.

If either webhook is missing or inactive, the related feature shows a friendly "AI service is currently unavailable" message instead of crashing.

---

## Adding new content

The platform stays simple to maintain:

1. **Add a new semester subject:** edit `data/semesters.config.js` — add the subject inside the right semester.
2. **Map static PDF/MCQ files:** edit `data/subject-mapping.js` — drop files under `assets/notes/...` or `assets/mcqs/...` and reference their paths.
3. **Add quiz questions:** create or extend `data/<subject>-questions.js` (see `data/wd-questions.js`, `data/bee-ee.js`, `data/bee-ex.js` for shape).
4. **Add Drive notes:** drop the PDF into your shared Drive folder. The `/api/drive-notes` endpoint will pick it up on the next sync (5-minute serverless cache).

---

## Project Structure

```text
LERNIOAI/
  index.html              # Single-page entrypoint (hash router)
  manifest.json           # PWA manifest
  service-worker.js       # PWA offline cache
  api/                    # Vercel serverless functions
    chat.js               # n8n proxy → AI Tutor
    ai-hint.js            # n8n proxy → quiz hints
    ai.js                 # Optional Gemini fallback
    config.js             # Public config (AI route names)
    progress.js           # Firestore-backed progress sync
    drive-notes.js        # Drive folder listing
    drive-file.js         # Drive PDF streaming
  css/                    # Modular stylesheets
  js/                     # Modular vanilla JS
  data/                   # Subject + question data
  assets/                 # Static notes & MCQ PDFs, logo
  scripts/
    check-js.js           # Pre-build static checks
    build-static.js       # Copies static entries into dist/
  lib/
    google-drive-notes.js # Shared Drive helper
  firestore.rules         # Firestore security rules
  storage.rules           # Storage security rules
  vercel.json             # Vercel config (build command, redirects)
  .env.example            # All supported env vars
```

---

## Routing

Clean URLs (`/dashboard`, `/notes`, `/quiz`, `/analytics`, `/settings`, `/semester-1`, `/semester-2`, …) are redirected by Vercel to hash routes (`/#/dashboard`, …). The single-page hash router lives in `js/app.js`.

Sample routes:

- `/#/dashboard`
- `/#/chat`
- `/#/quiz`
- `/#/semester-2/WD`
- `/#/semester-2/EE101`

---

## Production test checklist

- [ ] `npm install` completes cleanly.
- [ ] `npm run check` passes.
- [ ] `npm run build` produces `dist/`.
- [ ] Root URL loads `index.html`.
- [ ] Mobile bottom nav renders 5 items + "More" sheet (no horizontal overflow).
- [ ] Login overlay opens, closes, and submits without errors.
- [ ] AI Tutor chat sends, shows typing indicator, and renders response.
- [ ] Quiz "Get Hint" returns a hint or a friendly fallback.
- [ ] Notes page lists Drive + static + Firestore notes (or shows a clean empty state).
- [ ] Analytics page renders with no console errors.
- [ ] PWA: `manifest.json` and `service-worker.js` are reachable, install prompt shows on Android.
- [ ] No secrets visible in any frontend JS or HTML.

---

## Credits

Built by **Group 5** — Yash Krishna Ganesh (255044) and Swarit Pawar (255042).
