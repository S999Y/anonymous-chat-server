# BABAVONDO

**Instant anonymous messaging. Fast, private, and secure.**

BABAVONDO is a real-time anonymous chat platform that lets users join ephemeral chat rooms with a simple 4-character code, exchange text and files, drop anonymous messages into public inboxes, and chat with an integrated AI assistant — all without ever creating an account.

---

## Features

- **Room-based anonymous chat** — Create or join a room via an easy-to-remember 4-character code and start chatting instantly. No sign-up required.
- **File sharing up to 30 MB** — Files are stored in Firebase Storage (no base64 overhead, no sharding) and streamed on download.
- **Read receipts** — Track who has read each message within a room.
- **Public inboxes** — Create a public inbox and share a link so anyone can leave an anonymous message without joining a room.
- **Built-in AI assistant** — Chat with Gemini directly inside the platform via a bundled server-side endpoint.
- **Ambient background music** — Toggleable in-app music.
- **Fully responsive UI** — Built with React, Tailwind CSS, and Motion for a polished, animated experience.

---

## Tech Stack

| Layer      | Technology                                  |
| ---------- | ------------------------------------------- |
| Frontend   | React 19, Vite 6, Tailwind CSS 4, Motion    |
| Backend    | Express (Node.js), esbuild                  |
| Database   | Firebase Firestore                          |
| Storage    | Firebase Storage (file attachments)         |
| Auth       | Firebase Authentication (anonymous sign-in) |
| AI         | Google Gemini (server-side integration)     |
| Deployment | Vercel (frontend + API rewrites)            |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A [Firebase](https://firebase.google.com/) project with **Firestore**, **Storage**, and **Authentication** enabled
- A [Google AI Studio](https://aistudio.google.com/) API key (for the Gemini assistant)

#### Firebase setup

1. In the [Firebase console](https://console.firebase.google.com/), create a project.
2. Enable **Firestore Database** and note the database ID used by your project.
3. **Set up Firebase Storage** — open **Storage → Get Started** to create the default bucket (required for file attachments).
4. In **Authentication → Sign-in method**, enable **Anonymous sign-in** (required for the app to run).
5. Register a **Web App** and copy its config into `firebase-applet-config.json` (see below).
6. Deploy the security rules from `firestore.rules` and `storage.rules` (see [Security Rules](#security-rules)).

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Set your Gemini API key in .env
```

### Configuration

Your Firebase configuration is provided in `firebase-applet-config.json`. It is the standard Firebase web-app config plus a `firestoreDatabaseId` field that tells the client which Firestore database instance to use:

```json
{
  "apiKey": "AIzaSyD4-123456...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project.firebasestorage.app",
  "messagingSenderId": "630152136664",
  "appId": "1:630152136664:web:...",
  "firestoreDatabaseId": "(default)"
}
```

> **Important:** `firebase-applet-config.json` is **git-ignored** (it contains your app identifiers/API key). It is **not committed** to version control. To set up:
>
> 1. Copy the template: `cp firebase-applet-config.example.json firebase-applet-config.json`
> 2. Fill in your real values from the Firebase console → Project settings → Your apps.
>
> Because it's not committed, **you must create it manually on any fresh clone and on Vercel** (via your build/provisioning process) or the build will fail.

> **Note:** The `firestoreDatabaseId` must match the database your rules were deployed to. Anonymous sign-in must be enabled in Firebase Authentication for the app to work.

### Run in development

```bash
npm run dev
```

The app will be served at `http://localhost:3000`.

---

## Scripts

| Command         | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| `npm run dev`   | Start the development server with hot reload                   |
| `npm run build` | Build the frontend and bundle the production server            |
| `npm start`     | Run the production server from the `dist/` build               |
| `npm run lint`  | Type-check the codebase with TypeScript (`tsc --noEmit`)       |
| `npm run clean` | Remove the `dist/` build output                                |

---

## Project Structure

```
├── api/                       # Serverless API routes
│   └── gemini/chat.ts         # Gemini chat handler
├── public/                    # Static assets
├── src/
│   ├── components/
│   │   ├── chat/              # Room chat, inbox views, Gemini chat
│   │   └── home/              # Home/landing view
│   ├── context/               # React context (music, etc.)
│   ├── lib/
│   │   ├── firebase.ts        # Firebase init, auth, error helpers
│   │   ├── fileStorage.ts     # Firebase Storage upload/download helpers
│   │   └── utils.ts           # Shared utilities
│   ├── App.tsx                # Root app component
│   └── main.tsx               # App entry point
├── server.ts                        # Express + Vite development/production server
├── firestore.rules                  # Firestore security rules (deploy target)
├── storage.rules                    # Firebase Storage security rules (deploy target)
├── firebase.json                    # Firebase project config (rules paths)
├── firebase-applet-config.json          # Firebase web-app config (git-ignored — not committed)
├── firebase-applet-config.example.json  # Config template (committed, fill in real values)
├── firebase-blueprint.json              # Firestore data-model blueprint (entities & paths)
├── vercel.json                      # Vercel rewrites (API + SPA)
└── vite.config.ts                   # Vite configuration
```

---

## Deployment

BABAVONDO deploys in two parts:

1. **The web app + API** → **Vercel** (frontend, Gemini API serverless function)
2. **Security rules (Firestore + Storage)** → **Firebase**

### 1. Deploy the app to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=YOUR_REPO_URL)

Or manually:

1. Push the repository to a Git provider (GitHub, GitLab, or Bitbucket).
2. Import the project in [Vercel](https://vercel.com/).
3. Add the `GEMINI_API_KEY` environment variable under **Project → Settings → Environment Variables**.
4. Vercel detects the Vite + serverless setup from `vercel.json` and deploys automatically — no extra build config needed.

> `vercel.json` rewrites `/api/*` to the serverless function (the Gemini chat handler) and routes all other traffic to the SPA.

### 2. Deploy the security rules to Firebase

The app reads/writes through **Firestore** and **Firebase Storage** security rules; without them deployed, requests will fail. See [Security Rules](#security-rules) for the exact commands.

---

## Security Rules

- **`firestore.rules`** (Firestore) — default-deny access, validation of room codes, message schemas, file metadata, and inbox ownership.
- **`storage.rules`** (Firebase Storage) — signed-in users may read and upload files under `chat/{roomCode}/{messageId}` up to 30 MB.

### Deploying rules

Install the Firebase CLI if you haven't already:

```bash
npm install -g firebase-tools
```

Log in and link your project (one-time setup):

```bash
firebase login
firebase use --add
```

Deploy the security rules:

```bash
firebase deploy --only firestore:rules,storage:rules --project anynomous-chat-9099f
```

> The project ID is `anynomous-chat-9099f` (see `firebase-applet-config.json`), and rules deploy to the `(default)` Firestore database and the default Storage bucket. Always run deploys from the project root so `firebase.json` is found. **Firebase Storage must first be set up in the console** (Storage → Get Started).

---

## License

This project is licensed under the [MIT License](LICENSE).
