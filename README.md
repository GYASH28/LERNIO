# Lernio AI

Lernio AI is a static HTML/CSS/JavaScript study platform for engineering students. It is deployed on Vercel and uses Firebase for authentication, Firestore notes, Firebase Storage uploads, and optional cloud progress sync.

## What Is Included

- Semester-wise subject browsing for Semesters 1-6, with Semesters 3-6 locked until content is ready.
- Google Drive folder-provided PDF notes, static fallback PDFs from `assets/notes/...`, previous built-in notes from subject data, and student-added notes from Firestore.
- Subject-level and global notes search across platform notes, MCQ PDFs, and student notes.
- Real quiz data only where available: WD, EE101 BEEE electrical units, and EC101 BEEE electronics units.
- Topic Explainer and AI chat through server-side n8n webhook proxies configured with environment variables.
- PDF/DOCX/image/text note preview support, with PDF/DOCX preview libraries loaded only when needed.

## Notes And Quiz Mapping

- `data/semesters.config.js` defines the visible semester and subject structure.
- `data/subject-mapping.js` maps deploy-safe note and MCQ PDF paths under `assets/...` to semester subjects.
- Google Drive is the primary source for admin-managed PDF notes when `/api/drive-notes` is configured. Static PDFs remain as a deploy-safe fallback.
- `data/web-designing.js` and `data/wd-questions.js` provide WD built-in notes and quizzes.
- `data/bee-ee.js` provides EE101 Unit 1-3 electrical MCQs.
- `data/bee-ex.js` provides EC101 Unit 4-6 electronics MCQs.
- Missing subjects stay visible and show empty states. No fake notes or fake quizzes are generated.

## Backend Integration

Vercel serverless functions live in `api/`:

- `/api/config` returns only public relative API paths.
- `/api/chat` securely proxies AI Tutor chat to the configured n8n webhook.
- `/api/ai-hint` securely proxies Quiz AI hints to the configured quiz n8n webhook.
- `/api/progress` syncs authenticated progress to Firestore collection `userProgress`.
- `/api/ai` is an optional Gemini proxy.
- `/api/drive-notes` reads the configured Google Drive notes folder and returns safe PDF metadata.
- `/api/drive-file?id=<fileId>` streams allowed Google Drive PDFs through the backend so files can stay private.

Required environment variables for Vercel:

```env
N8N_CHAT_WEBHOOK_URL=
N8N_HINT_WEBHOOK_URL=
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

Alternative Firebase Admin variables:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Optional:

```env
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash
```

Google Drive notes environment variables:

```env
GOOGLE_DRIVE_FOLDER_ID=your_google_drive_root_folder_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-google-cloud-project-id
```

`GOOGLE_PROJECT_ID` is optional when the service account email and key are complete. You may also use `GOOGLE_SERVICE_ACCOUNT_JSON` instead of the split service account fields if your environment supports storing the JSON safely.

Do not put service account credentials, Google private keys, OAuth refresh tokens, or AI API keys in frontend JavaScript.

## Google Drive Notes Setup

1. In Google Cloud Console, create or choose a project.
2. Enable the Google Drive API for that project.
3. Create a service account and copy its email.
4. Create a JSON key for that service account.
5. In Google Drive, create the notes root folder, for example `LERNIO` or `Lernio AI Notes`.
6. Share that root folder with the service account email as Viewer.
7. Copy the folder ID from the Drive URL and set `GOOGLE_DRIVE_FOLDER_ID` in Vercel.
8. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and optionally `GOOGLE_PROJECT_ID` in Vercel.
9. Store the private key with literal `\n` newline sequences; the API converts them to real newlines at runtime.

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

Supported current aliases include `SEMISTER 2`, `WEB DESIGN` -> `WD`, `PROGRAMMING IN C` -> `CS102`, `BEE(EE)NOTES` -> `EE101`, `BEE(EX)NOTES` -> `EC101`, `LINUX BASICS` -> `LIN101`, `PCO...` -> `PCO101`, and `APPLIED MATHS` -> `MA102`. Unknown subject folders are skipped safely and logged as warnings by the API.

The frontend fetches Drive metadata when the dashboard, subject list, subject notes, or global search needs it. Results are cached for 5 minutes in the serverless function and in `sessionStorage`. Use the "Sync from Google Drive" button to force `/api/drive-notes?refresh=1`.

## Firebase Rules

- `firestore.rules` allows students to manage their own user profile, private notes, quiz attempts, and progress.
- Public student notes require a teacher/admin role.
- `storage.rules` allows semester-aware uploads at `semester-notes/{semesterId}/{subjectId}/{userId}/{filename}`.
- Teacher/admin roles should be assigned in Firestore user documents by a project admin.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:8080`.

Run checks:

```bash
npm run check
npm run build
```

To test the exact static files Vercel will serve:

```bash
npm run build
npx serve dist
```

Local Drive API checks:

```bash
npm run dev
curl http://localhost:8080/api/drive-notes
curl "http://localhost:8080/api/drive-notes?refresh=1"
```

If Google Drive env vars are not configured locally, `/api/drive-notes` returns a safe config error and the website continues to show saved/static notes.

## Deployment

Lernio AI deploys as a static site with optional Vercel serverless APIs.

Correct Vercel project settings:

- Framework Preset: `Other`
- Root Directory: `LERNIO-main` if the repository includes a wrapper folder
- Build Command: `npm run build`
- Output Directory: `dist`

Deployment flow:

1. Push changes to GitHub.
2. Ensure Vercel has the environment variables above.
3. Deploy from Vercel.
4. Verify the root URL loads `index.html`.
5. Verify clean routes redirect to hash routes, for example `/dashboard` to `/#/dashboard`.
6. Verify PDF links under `/assets/notes/...` and `/assets/mcqs/...`.
7. Verify `/api/config`, `/api/chat`, `/api/ai-hint`, and `/api/progress` return clean responses.
8. Verify `/api/drive-notes` returns Drive notes or a safe config error.
9. Verify `/api/drive-file?id=<fileId>` opens an allowed PDF after Drive is configured.

## Final Fix Report

Root cause: Vercel was serving API/backend-like output without the static site entrypoint and assets, so production could return `Cannot GET /` while `/api/config` still worked. The project now builds a clean `dist/` folder containing only deploy-safe static files.

Deployment config fixed:

- `vercel.json` sets `framework` to `null`, `buildCommand` to `npm run build`, and `outputDirectory` to `dist`.
- The build script copies `index.html`, `css/`, `js/`, `data/`, and `assets/` into `dist/`.
- `local-server.js`, `functions/`, package files, dotfiles, and `node_modules/` are not part of the static output.

Routing method: single-page static hash routing. Use routes such as `/#/dashboard`, `/#/login`, `/#/notes`, `/#/quiz`, `/#/semester-1`, `/#/semester-2`, and `/#/semester-2/WD`. Clean paths like `/dashboard` are Vercel redirects to the matching hash route.

Google Drive integration:

- Admin/folder-provided PDF notes now load through `/api/drive-notes` using service account auth.
- Private Drive PDFs open through `/api/drive-file`, which only serves PDFs discovered under the configured root folder.
- Notes are merged in this order: Google Drive notes, static folder PDFs, built-in subject notes, then student-added Firestore notes.
- Drive MCQ PDFs are shown as MCQ practice papers when their folder or file name includes `mcq`.
- If Drive sync fails, the UI keeps rendering available saved/static notes and shows a friendly sync warning.

Known limitations: Firebase Auth, Firestore notes, Storage uploads, and cloud progress sync require Firebase configuration and server credentials. Google Drive notes require the Drive folder to be shared with the configured service account. AI chat requires `N8N_CHAT_WEBHOOK_URL`; Quiz AI hints require `N8N_HINT_WEBHOOK_URL`; if either is missing or unavailable, the UI shows a friendly fallback message.

## Production Test Checklist

- Semester 1 and Semester 2 render correctly.
- Semesters 3-6 remain locked.
- CS102 PIC PDFs open without 404.
- EE101 shows electrical Unit 1-3 MCQs.
- EC101 shows electronics Unit 4-6 MCQs and the practical manual.
- WD notes and WD quiz still work.
- Empty subjects show student-addable empty states.
- Add Notes works for text notes and file notes after login.
- Search filters platform notes and student notes.
- Google Drive notes appear in dashboard counts, subject notes, and global search after sync.
- Topic Explainer shows a friendly disconnected state when n8n is not configured.
- Mobile layouts have no horizontal scrolling or overlapping controls.
