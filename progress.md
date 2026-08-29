# BABAVONDO — Progress Log

Session track of work performed so we can resume cleanly. Last updated: 2026-08-29.

## Project location
- Root: `Anonymous-Chating-main/` (in `P:\projects\babavondo`)
- Firebase project ID: **`anynomous-chat-9099f`**
- Firebase database: `(default)`
- Auth: Firebase Authentication (anonymous sign-in required)

## Current state (all verified)
- `firebase` CLI installed globally (npm). Login active as `shohanur9999@gmail.com` — credentials stored, deploys work without re-login.
- `.firebaserc` points default project to `anynomous-chat-9099f`.
- `firebase.json` targets `firestore.rules` (default database — no `database` field).
- `npm run lint` (tsc --noEmit): passes.
- `npm run build` (vite + esbuild): passes.
- Firestore rules **deployed live** to `anynomous-chat-9099f`.

## Completed work

### 1. Rules deploy workflow fixed
- `firebase` CLI wasn't on PATH → installed `firebase-tools` globally.
- `firestore.rules` had a **UTF-8 BOM** causing a compile error (`token recognition error at: ''`). Removed BOM — now compiles & deploys cleanly.
- Deploy command: `firebase deploy --only firestore:rules` (project resolved from `.firebaserc`).

### 2. Firebase config corrected
- Old/wrong config used `gen-lang-client-0693970535` with a named Firestore DB. Swapped to the real project **`anynomous-chat-9099f`** (default DB).
- Files updated: `firebase-applet-config.json`, `firebase.json`, `.firebaserc`, `README.md`.

### 3. Documentation / repo hygiene
- Rewrote `README.md` as a professional, deploy-ready doc (features, stack, setup, scripts, structure, deployment via Vercel + Firebase rules).
- Added `LICENSE` (MIT, holder = "BABAVONDO" — CONFIRM holder name).
- Updated `.gitignore` with Firebase/Vercel artifacts (`/.firebaserc`, `.vercel/`, `firebase-debug.log`, etc.).
- `package.json`: renamed `react-example` → `babavondo`, v1.0.0, added description; synced `package-lock.json`.
- Removed redundant duplicate `firestore.rules.new`.

### 4. firebase-blueprint.json aligned with real schema
- Corrected `Message.file` metadata (name/type/size/fileId/totalParts/partSize/masterHash).
- Added `FilePart` entity + `/rooms/{roomCode}/messages/{messageId}/parts/{partIndex}` path.

### 5. File size limit raised: 20MB → 30MB
User target: **30MB** (small bump, keep Firestore sharding — no Storage migration).
Files changed:
- `src/lib/fileShard.ts:12` — `MAX_FILE_SIZE = 30 * 1024 * 1024`
- `src/components/chat/ChatView.tsx:635` — UI hint now dynamic: `Max {Math.round(MAX_FILE_SIZE/1024/1024)}MB`
- `firestore.rules:52` — `f.size <= 20971520` → `31457280`
- `README.md` + `firebase-blueprint.json` — 20MB → 30MB references
- Rules re-deployed to `anynomous-chat-9099f`. Lint + build verified.

### 6. FILE STORAGE MIGRATED: Firestore sharding → Firebase Storage
Decision (user): migrate file storage to **Firebase Storage** — removes 33% base64 overhead, sharding, and the 100-doc/download pagination limit.

What changed:
- **`src/lib/fileStorage.ts` (NEW)** — `uploadFile`/`downloadFile`/`deleteFile`/`filePath` using Firebase Storage resumable upload + fetch-stream download with progress. `MAX_FILE_SIZE = 30MB` moved here.
- **`src/lib/firebase.ts`** — added `export const storage = getStorage(app, firebaseConfig.storageBucket)`.
- **`src/components/chat/ChatView.tsx`** — send now uploads blob to `chat/{roomCode}/{msgId}` then writes message doc with `file = {name, type, size, path}`; download fetches from Storage; removed sharding logic + UI "split into N parts".
- **REMOVED `src/lib/fileShard.ts`** (dead code).
- **`firestore.rules`** — `Message.file` now only `{name,type,size,path}` (regex `^chat/[A-Z0-9]{4}/[A-Za-z0-9_-]+$`), removed `parts` subcollection rules, key count 7.
- **`storage.rules` (NEW)** — signed-in read/write under `chat/{roomCode}/{messageId}`, `request.resource.size <= 31457280` (30MB).
- **`firebase.json`** — added `"storage": { "rules": "storage.rules" }`.
- **`firestore-blueprint.json`** — updated `Message.file` schema, removed `FilePart`, added `storage` section.
- **`README.md`** — updated features/stack/setup/structure/rules to Storage model.

Verification: `npm run lint` ✅, `npm run build` ✅. JSONs valid.

## ⚠️ BLOCKED — action required from user
**Firebase Storage is NOT yet set up on the project.** Deploy fails with:
`Firebase Storage has not been set up on project 'anynomous-chat-9099f'. Go to .../storage and click 'Get Started'.`

Required (manual, browser):
1. Open https://console.firebase.google.com/project/anynomous-chat-9099f/storage
2. Click **Get Started** → the wizard asks for **Storage** security rules.
3. **CRITICAL — paste the STORAGE rules (NOT Firestore rules) and publish:**
   The Storage editor must contain `service firebase.storage { ... }` — the content of `storage.rules` in this repo — with the 30 MB cap (`request.resource.size <= 31457280`). Do **NOT** paste the Firestore rules (`service cloud.firestore` — that's a different service, already deployed separately).
   - Mismatch reminder: Firestore rules = `service cloud.firestore`; Storage rules = `service firebase.storage`.
   - Correct Storage rules to paste are in this repo at `storage.rules`.
4. **Publish/Next** to finalize (creates default bucket `anynomous-chat-9099f.firebasestorage.app`).
5. Verify a bucket appears on the Storage **Files** tab.

Then resume with:
```bash
firebase deploy --only firestore:rules,storage:rules
```
(The CLI will overwrite the console rules with the repo's `storage.rules` automatically — the console publish is only needed to provision the bucket.)

## Security work completed (see section 7) — credentials git-excluded. No commit made.

## Key technical notes (for resuming)

### File storage architecture (Firebase Storage — after migration)
- Blobs live in **Firebase Storage** at `chat/{roomCode}/{messageId}` (path stored in the Firestore message's `file.path`).
- Upload: `src/lib/fileStorage.ts` `uploadFile` — resumable upload with progress.
- Download: `downloadFile` — `getDownloadURL` + fetch-stream with progress (no base64, no sharding, no pagination issues).
- Cap: 30 MB, enforced client-side (`MAX_FILE_SIZE`) and in `storage.rules` (`request.resource.size <= 31457280`).
- Old Firestore-sharding code removed (`fileShard.ts` deleted; `parts` subcollection removed from rules).

### Limits (critical for future work)
- Migrating to Storage removed the prior base64 33% overhead and the sharding/100-doc pagination ceiling.
- Storage bucket ceilings are effectively Google Cloud Storage (no real practical cap for this use).
- To raise the 30MB cap later, update `MAX_FILE_SIZE` in `src/lib/fileStorage.ts`, `storage.rules`, and `firestore.rules` (`f.size`) in tandem.

### 7. SECURITY: credentials excluded from version control
- `firebase-applet-config.json` (contains web `apiKey` + app identifiers) is now **git-ignored and untracked** (`git rm --cached`, file kept on disk).
- Added `firebase-applet-config.example.json` (committed placeholder template) so the structure is documented.
- `.gitignore` now blocks: `firebase-applet-config.json`, `*.service-account.json`, `*.pem`, `*.key`, `*.p12`, `*credential*` (plus existing `.env*`, `firebase-debug.log`, `.firebaserc`, `.vercel/`).
- Verified via `git check-ignore` (real config ignored ✅, example trackable ✅).

## Remaining / suggested next steps (open)
1. **USER ACTION REQUIRED:** Set up Firebase Storage in the console (https://console.firebase.google.com/project/anynomous-chat-9099f/storage → Get Started). **Important:** publish the STORAGE rules (`service firebase.storage`, see `storage.rules`) in the wizard, NOT the Firestore rules (`service cloud.firestore`). Once the bucket exists, run `firebase deploy --only firestore:rules,storage:rules`.
2. **Web app deploy:** push to Git provider → import to Vercel → set `GEMINI_API_KEY` env var. NOTE: `firebase-applet-config.json` is NOT committed, so **it must be re-created on Vercel / fresh clones** from `firebase-applet-config.example.json` (see README) or the build fails. Only you can do this (external accounts).
3. **Confirm LICENSE holder name** (currently "BABAVONDO").
4. Optional: orphan cleanup — if an upload succeeds but the message write fails, the blob is orphaned (no TTL/cleanup configured yet).
5. NOTE: the old `firebase-applet-config.json` API key may already exist in earlier git history if it was ever committed — consider purging history / rotating the key if this matters.

## Current deploy command (auth confirmed working)
```bash
cd Anonymous-Chating-main
firebase deploy --only firestore:rules,storage:rules
```
