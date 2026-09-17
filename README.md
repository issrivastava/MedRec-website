# MedRec — Patient & Doctor Medical Records + Local AI Summaries

Stack: **FastAPI (Python) backend · React (Node/Vite) frontend · PostgreSQL · Ollama local LLM**.

## Features
- **Public Home page** (`/`): read about all features first, then login/register.
- **Login / Logout / Register** with roles: `patient` and `doctor` (JWT). Logout button in the navbar + profile page.
  Login is via **Firebase** (email/password + Google + password-free email link) — the app exchanges the
  Firebase ID token at `POST /api/auth/firebase` for a MedRec session. The old
  local login still works as a dev fallback until Firebase keys are added.
- **Email OTP + forgot password**: 6-digit codes via `POST /api/auth/otp/request` (mailed by SMTP when `MAIL_*` is set, shown on screen in local dev); passwordless OTP login and OTP password reset included.
- **Delete my account**: `/profile` danger zone → `DELETE /api/auth/me` wipes the user and all their data.
- **Emergency SOS**: patients tap SOS (optional GPS) → assigned doctors notified in-app/email + emergency contact SMSed; doctors can raise SOS for an assigned patient and resolve alerts from the Emergency tab.
- **User profile + profile picture**: `/profile` page with avatar upload (PNG/JPG/WEBP, auto-resized), name edit, picture shown in the navbar.
- **Contact Us** page (`/contact`, public): message stored via `POST /api/contact`.
- **E-prescriptions / visit notes**: doctors write notes + medicines back to assigned patients (patients get notified).
- **Appointments + availability**: doctors set weekly slots, patients book; status flow booked/cancelled/completed with notifications.
- **Health timeline** (`/timeline`): reports, prescriptions and appointments on one page.
- **Lab alerts**: OCR values auto-checked against default + doctor-approved per-patient ranges, with checkup nudge.
- **Family profiles**: manage kids/parents records from one account; tag uploads per member.
- **AI in 10 languages** (en/hi/Hinglish/mr/ta/te/bn/gu/kn/ml) via `?language=` on summarize endpoints.
- **Export record PDF** (`GET /api/export/pdf`) for hospitals/insurance.
- **Notifications center** (bell + `/notifications`): doctor views, notes, appointments, alerts; optional SMTP email + SMS webhook.
- **Admin panel** (`/admin`, role=admin via `ADMIN_SIGNUP_KEY`): stats, user/role management, contact messages.
- **Patient info page**: DOB, gender, blood group, phone, address, allergies, chronic conditions, emergency contact.
- **Scan & keep reports/prescriptions**: file upload (phone camera supported via `capture="environment"`), stored with title, type, doctor name, hospital, visit date, notes.
- **Date-wise & doctor-wise** document grouping + search/filter.
- **AI-generated report per document + overall health summary** via **Ollama local LLM** (`llama3.1:8b` default), with OCR text extraction (PyMuPDF + Tesseract) and an offline fallback if Ollama is down.
- **Doctor view**: profile + **assigned-patients-only dropdown**, patient info + their records + AI summaries.
- **Linking**: patient adds doctor by email, or doctor adds patient by email (`/api/assignments`).

## Project layout
```
MedRec/
  backend/   FastAPI app (app/main.py), requirements.txt, Dockerfile
  frontend/  React + Vite (Node), Dockerfile
  docker-compose.yml   Postgres + backend + frontend + Ollama
```

## Quick start (local dev, no Docker)

### 1. Database
Option A — Postgres (recommended):
```sql
CREATE USER medrec WITH PASSWORD 'medrec';
CREATE DATABASE medrec OWNER medrec;
```
Option B — skip Postgres and use SQLite for a first run:
```
DATABASE_URL=sqlite:///./medrec.db
```

### 2. Backend (Python 3.11 REQUIRED)
```powershell
cd backend
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# edit .env -> DATABASE_URL, SECRET_KEY
py -m uvicorn app.main:app --reload --port 8000
```
> Stay on Python 3.11 (see `backend/.python-version`). Newer versions break
> passlib/bcrypt and some wheels. `bcrypt` must stay at 4.0.1.
API docs: http://localhost:8000/docs

### 3. Ollama (local AI)
```powershell
# install from https://ollama.com, then:
ollama pull llama3.1:8b
ollama serve
```
Backend uses `OLLAMA_BASE_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL`.
If Ollama is not running, summaries fall back to an offline extractive summary — the app still works.

### 4. Frontend (Node 20+)
```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 (Vite proxies `/api` to `http://localhost:8000`).

## Docker start
```powershell
docker compose up --build
docker exec -it medrec-ollama-1 ollama pull llama3.1:8b
```
- Frontend: http://localhost:5173 · API: http://localhost:8000/docs

## API cheat sheet
| Method | Path | Who |
|---|---|---|
| POST | /api/auth/register | public |
| POST | /api/auth/login | public |
| GET | /api/auth/me | any |
| PUT | /api/auth/me | any (rename) |
| POST | /api/auth/firebase | Firebase ID-token exchange -> MedRec JWT |
| POST/DELETE | /api/auth/avatar | any (profile picture) |
| POST | /api/contact | public (Contact Us) |
| GET/PUT | /api/patients/me | patient |
| GET/PUT | /api/doctors/me | doctor |
| GET | /api/doctors/patients | doctor (dropdown) |
| GET | /api/doctors/patients/{id}/info | doctor (assigned) |
| GET | /api/doctors/patients/{id}/documents | doctor (assigned) |
| GET/POST | /api/documents | patient |
| GET/DELETE | /api/documents/{id} | owner / assigned doctor (read) |
| GET | /api/documents/{id}/download | owner / assigned doctor |
| POST/GET | /api/documents/{id}/summarize, /summary | owner / assigned doctor |
| GET | /api/documents/patient/overall-summary | patient |
| GET/POST/DELETE | /api/assignments/my, /api/assignments, /{id} | any |

## Firebase login setup
1. **Firebase console** (https://console.firebase.google.com) → create project → **Build → Authentication** → enable **Email/Password** and **Google** providers. (Email/Password also powers the password-free **email sign-in link** — mailed by Firebase, no SMTP needed.)
2. **Project settings → General → Your apps → Web app** → copy the config values into `frontend/.env`:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=....firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   ```
   Also add `http://localhost:5173` under **Authentication → Settings → Authorized domains** (plus your deployed domain later, otherwise Google sign-in fails with `auth/unauthorized-domain`). If the browser blocks the Google popup, MedRec automatically retries with a full-page redirect.
3. **Project settings → Service accounts → Generate new private key** → save as `backend/firebase-service-account.json` and set in `backend/.env`:
   ```
   FIREBASE_CREDENTIALS_PATH=./firebase-service-account.json
   ```
   (Never commit this file.)
4. **Restart backend + `npm run dev`** (Vite reads `.env` only at startup — the Google button stays hidden until you restart). Login page now shows **Continue with Google**, Firebase email login, and **Email me a sign-in link**. First-time Firebase users pick patient/doctor once; after that the backend returns a normal MedRec JWT and everything else works unchanged.

## Notes
- Uploads live in `UPLOAD_DIR/<user_id>/` (default `./uploads`).
- Tesseract is optional — image OCR is skipped gracefully if the binary is missing. Install it for best scan results.
- Never treat AI summaries as diagnosis; prompts instruct the model to defer to a doctor.
