# Rabط production security report

This report covers the original privacy audit and the final production hardening in `finalsecuritytest`.

**Production is not complete yet.** HTTPS, `COOKIE_SECURE=true`, and external credential rotation are still **MANUAL ACTION REQUIRED**. Application-level controls below were implemented and tested on this machine.

## 1. Credentials discovered

| Credential | Where it was found | Status in current tree |
| --- | --- | --- |
| Telegram `api_id` / `api_hash` | Tracked `config/apiConfig.json` (git history includes commits `22d58ca`, `96b2a22`, `0ef54aa`, `e0a9f9e`, `bf89672`) | Removed from that file; loaded from `.env` |
| Platform SMTP password | `.env` (`AUTH_SMTP_*`). `.env` was **not** found in git history | Still required for verification mail; not returned by APIs |
| Tenant SMTP passwords | Tenant `email.settings.json` (plaintext historically) | Encrypted at rest (`enc:v1:` AES-256-GCM) |
| Telegram session strings | Tenant `telegramConfig.json` | Encrypted at rest |
| Super Admin default password | Hardcoded in `services/superAdminService.js` | Removed from source. Existing admin hash remains in `config/super-admin.json` (gitignored) |
| Session cookies | `config/sessions.json` plaintext historically | SHA-256 `tokenHash` only |
| Encryption key | `config/secret.key` (generated locally) | Gitignored; prefer `RABT_SECRET_KEY` |
| User password hashes | `config/users.json` | Hashed (scrypt); file gitignored |

No JWT signing secret or database password is used (cookie sessions + JSON files).

## 2. Credentials rotated

- Telegram app credentials were moved out of `config/apiConfig.json` into environment variables.
- `config/apiConfig.json` and `config/email.settings.json` were removed from the Git index (`git rm --cached`) so they are no longer tracked going forward.
- Super Admin no longer has a hardcoded default password in source. New bootstrap generates a random password into gitignored `config/super-admin-initial.txt`.
- Session tokens, SMTP passwords, Telegram hashes, and Telegram sessions are no longer stored in plaintext by the app.

**Git history was not rewritten.** Old Telegram credentials that were committed in `config/apiConfig.json` must be treated as compromised.

## 3. Credentials requiring manual rotation

`MANUAL ACTION REQUIRED`

1. **Telegram API hash** — create a new app (or reset) at https://my.telegram.org, put the new values in `.env` as `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`, restart the server, then reconnect Telegram sessions.
2. **Platform SMTP password** — change `AUTH_SMTP_PASS` at the mailbox provider and update `.env`.
3. **Super Admin password** — sign in at `/super/admin/platform/login` and set a new password (or set `SUPER_ADMIN_PASSWORD` + `SUPER_ADMIN_RESET=true` once, then remove `SUPER_ADMIN_RESET`).
4. **Tenant campaign SMTP passwords** — each customer should change their own SMTP password in Settings after you notify them, if those values were ever copied or backed up in plaintext.
5. **`RABT_SECRET_KEY` and `RABT_BACKUP_KEY`** — set two long random values in `.env` for production. Do not put the key inside backup files.

## 4. Backup encryption implementation

Encrypted backups live in `storage/backups/*.enc` (outside the public web root).

- Format: `RABTBKv1` + AES-256-GCM (12-byte IV, 16-byte auth tag) wrapping gzip JSON.
- Key: `RABT_BACKUP_KEY`, else `RABT_SECRET_KEY`, else `config/secret.key`. The key is **not** stored inside the archive.
- Excluded from archives: `.env`, `secret.key`, `super-admin-initial.txt`.
- Super Admin can create/list/download encrypted archives at `/api/super-admin/backups`. Normal users receive 401.
- Restore is an authenticated server-side operation with the correct key (`services/backupService.js`).

## 5. `config/` protection

Express does not serve `config/` as static files. Requests to `/config`, `/config/sessions.json`, `/config/apiConfig.json`, and traversal variants (`/public/../config/...`, `%2e%2e`) are intercepted and return **404**.

## 6. `storage/` protection

`storage/` is not registered with `express.static`. `/storage/...`, `/backups/...`, and `/storage/backups/*.enc` return **404**. User files stay under:

- `storage/uploads/{userId}/`
- `storage/lists/{userId}/`
- `storage/onboarding-avatars/`
- `storage/billing/receipts/{userId}/`
- `storage/android/`
- `storage/backups/`

## 7. File download security

`GET /api/files/:id/download` requires a paid, authenticated session. The id is sanitized (no `/`, `\`, `..`). The file is resolved only from the caller’s tenant via `listLibrary.getDownload(req.user.id, id)`, then `sendPrivateFile` checks the path stays inside `storage/lists`.

Unauthenticated downloads return 401. Another tenant’s id, a fake id, or a traversal id returns 404 without the file body.

## 8. Git secret audit

Checked:

- Current index: `.env` is not tracked. `config/apiConfig.json` and `config/email.settings.json` were untracked in this session.
- Git history: `.env` has no commits. `config/apiConfig.json` **does** have history and previously contained a Telegram API hash.
- `.gitignore` now includes `.env`, `.env.*`, `config/tenants/`, `storage/`, `backups/`, `*.key`, `*.pem`, `*.secret`, plus session/user/payment JSON.

**Git history was reviewed and was not cleaned.** Rewriting history needs a full repo backup and would disrupt any clone. Treat historical Telegram credentials as leaked.

`MANUAL ACTION REQUIRED` — if this repo will be published or has been pushed: rotate Telegram credentials, then optionally `git filter-repo` / BFG after a backup. Do not force-push until every collaborator agrees.

## 9. File system permissions

Applied on this Windows host with `npm run secure-permissions`:

| Path | Applied |
| --- | --- |
| `config/` | NTFS ACL: inheritance disabled; `Everyone` and `Users` removed; current user + `SYSTEM` full control `(OI)(CI)F` |
| `storage/` | Same |
| `storage/backups/` | Same |
| Directories | POSIX `0700` attempted via `chmod` (limited effect on NTFS) |
| `.env`, `config/secret.key` | POSIX `0600` attempted |

On Linux production, run `npm run secure-permissions` after deploy (chmod 700/600). Do not use `777`.

## 10. Web server security

This process is Express on port 3005 (`0.0.0.0` for LAN testing). Static files are only from `public/`. Middleware blocks `/config`, `/storage`, `/backups`, `/.env`, `/.git`, `node_modules`, and leftover WhatsApp/Telegram public folders, including encoded and `..` paths.

A sample TLS reverse proxy is in `deploy/nginx.rabt.conf` (denies those paths at Nginx too).

`MANUAL ACTION REQUIRED` — put HTTPS in front of Node (Nginx/Caddy + Let’s Encrypt), proxy to `127.0.0.1:3005`, set `NODE_ENV=production` and `COOKIE_SECURE=true`. This LAN install still uses HTTP, so Secure cookies are not forced (they would break phone testing).

## 11. Automated security tests

| Command | What it covers |
| --- | --- |
| `npm run test:isolation` | User A vs User B campaigns, lists, KPI, WhatsApp/Telegram hubs, SMTP, hashed sessions |
| `npm run test:security` | Encrypted backup create/restore/wrong key; `/config` `/storage` `/backups` `/.env` `/.git`; file download auth/ownership/traversal; backups not user-downloadable; secrets not in API JSON |
| `npm test` | Both |

## 12. Test results (actually run)

`npm test` on 16 Sep 2026, exit code **0**:

- Unit isolation checks passed.
- Channel hub isolation checks passed.
- Credential encryption and path checks passed.
- HTTP isolation checks passed.
- Backup encryption tests passed.
- Path protection tests passed.
- HTTP production security tests passed.

HTTP cases included `GET /config/apiConfig.json`, `/config/sessions.json`, `/storage/userA/file.pdf`, `/storage/userB/file.pdf`, `/backups/backup.enc`, `/.env`, traversal URLs (all 404/403), User B denied User A’s `/api/files/:id/download`, unauthenticated file download 401, fake/traversal ids 404, owner download 200, Super Admin backup APIs 401 for a normal user.

## 13. Remaining production risks

- HTTP without TLS on the current bind address.
- `COOKIE_SECURE` is not enabled locally (required only after HTTPS).
- CSP still allows `'unsafe-inline'` scripts because existing pages use inline JS.
- Tracking pixels `/t/o` and `/t/c` are unauthenticated by design.
- JSON files are not a hardened database; OS permissions and encrypted backups are the controls.
- No malware scanning of uploads; no CSRF tokens (SameSite=Lax cookies).
- Git history still contains an old Telegram API hash.
- Encryption key rotation would invalidate existing sealed SMTP/Telegram blobs unless data is re-sealed first.

## 14. Manual actions still required

`MANUAL ACTION REQUIRED`

1. Enable HTTPS and set `COOKIE_SECURE=true` plus `NODE_ENV=production`.
2. Rotate Telegram API credentials (they appeared in git history).
3. Rotate platform SMTP and Super Admin passwords.
4. Set `RABT_SECRET_KEY` and `RABT_BACKUP_KEY` in `.env` (never commit them).
5. Deploy `deploy/nginx.rabt.conf` (or equivalent) so `/config`, `/storage`, `/backups`, `/.env`, and `/.git` are denied at the proxy.
6. If the Git remote is shared or public, backup the repo, then clean history with a dedicated filter tool — **not done in this pass**.
7. After TLS is live, confirm cookies are sent with `Secure; HttpOnly; SameSite=Lax`.

Until items 1–3 are done, do not describe Rabط as production-secure on the public internet.
