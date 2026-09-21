# Rabط production deployment

This guide prepares Rabط for a Namecheap server, a real domain, and HTTPS.

Local development stays on **HTTP**. Do not set `COOKIE_SECURE=true` on localhost.

```text
AUTOMATIC / APPLICATION SETUP  = already handled in the Node app
MANUAL ACTION REQUIRED         = you must do this on the server / DNS / mailbox
```

Do not claim production security is complete until HTTPS, Secure cookies, firewall, and credential rotation are actually finished.

---

## 1. DNS configuration

`MANUAL ACTION REQUIRED`

1. In Namecheap Advanced DNS, add an **A record**:
   - Host: `@` (and `www` if you want it)
   - Value: the public IPv4 of the VPS
   - TTL: Automatic or 5 min while testing
2. Wait until `https://YOUR_DOMAIN` resolves to that IP.
3. Do not point the domain at Node port `3005`. Point it at **80/443** on Nginx.

## 2. Server deployment

`MANUAL ACTION REQUIRED`

1. Use a Namecheap VPS (or similar) with Ubuntu, Node.js 18+, Nginx, and a process manager (`systemd` or PM2).
2. Copy the application (without `.env`, `node_modules`, `storage/`, and `config/secret.key` unless you are migrating existing encrypted data).
3. On the server: `npm ci --omit=dev` then `npm start` via systemd (see section 8).
4. Keep `PORT=3005`. Nginx is the only public listener.

`AUTOMATIC / APPLICATION SETUP`

- In production Node binds **`127.0.0.1:3005`** only.
- In development Node binds **`0.0.0.0:3005`** so localhost and LAN HTTP keep working.

## 3. Production `.env`

`MANUAL ACTION REQUIRED` — create `/path/to/app/.env` on the server. Never commit it.

```env
NODE_ENV=production
COOKIE_SECURE=true
PORT=3005
BIND_HOST=127.0.0.1
ALLOWED_ORIGINS=https://YOUR_DOMAIN

TELEGRAM_API_ID=
TELEGRAM_API_HASH=

AUTH_SMTP_HOST=
AUTH_SMTP_PORT=465
AUTH_SMTP_SECURE=true
AUTH_SMTP_USER=
AUTH_SMTP_PASS=
AUTH_SMTP_FROM_NAME=Rabط

RABT_SECRET_KEY=
RABT_BACKUP_KEY=

SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=
```

Rules:

- Use **placeholders above**; paste real values only on the server.
- `RABT_SECRET_KEY` and `RABT_BACKUP_KEY` must each be 16+ characters and **must be different**.
- Do not change `RABT_SECRET_KEY` if you already have encrypted SMTP/Telegram data unless you plan a re-seal. Copy the existing local `config/secret.key` value into `RABT_SECRET_KEY` when migrating a live workspace.
- Namecheap Private Email often uses port **465** with SSL. Port **587** is STARTTLS. Match the provider.

Localhost `.env`:

```env
NODE_ENV=development
COOKIE_SECURE=false
```

## 4. Credential rotation

`MANUAL ACTION REQUIRED` — the app will **not** rotate external credentials by itself.

| Credential | How to install the new value |
| --- | --- |
| Telegram API ID / Hash | Create or reset at https://my.telegram.org then set `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`. Treat any hash that was ever in Git history as compromised. Reconnect Telegram sessions after the change. |
| Platform SMTP password | Change it at the mailbox provider, then set `AUTH_SMTP_PASS`. |
| Super Admin password | Set `SUPER_ADMIN_PASSWORD` and run once with `SUPER_ADMIN_RESET=true`, then remove `SUPER_ADMIN_RESET`. Or change it in the Super Admin UI. |
| `RABT_SECRET_KEY` | Set before first production boot if this is a new install. Do not rotate it on a migrated dataset without re-encrypting SMTP and Telegram session strings. |
| `RABT_BACKUP_KEY` | Set a different random string. Old `.enc` backups only restore with the key that created them. |

If Telegram is not used yet: `TELEGRAM_ENABLED=false` (startup will not require Telegram env vars).

## 5. Nginx

`MANUAL ACTION REQUIRED`

1. Copy `deploy/nginx.rabt.conf` to `/etc/nginx/sites-available/rabt`.
2. Replace `YOUR_DOMAIN` and certificate paths.
3. `nginx -t` then reload Nginx.
4. Do not put certificate files in Git.

`AUTOMATIC / APPLICATION SETUP`

The sample already:

- Redirects HTTP → HTTPS
- Terminates TLS
- Proxies to `http://127.0.0.1:3005`
- Sets `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`
- Returns 404 for `/config`, `/storage`, `/backups`, `/.env`, `/.git`, `/node_modules`

## 6. SSL / HTTPS

`MANUAL ACTION REQUIRED`

- Issue a certificate (Let’s Encrypt / Namecheap SSL) for `YOUR_DOMAIN`.
- Point `ssl_certificate` and `ssl_certificate_key` at those files.
- Confirm `https://YOUR_DOMAIN` loads Rabط and `http://YOUR_DOMAIN` redirects.

Do not enable `COOKIE_SECURE=true` until HTTPS works, or browsers will drop cookies.

## 7. Firewall

`MANUAL ACTION REQUIRED`

Allow **22, 80, 443**. Do **not** expose **3005** to the public internet.

Example (UFW):

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3005/tcp
ufw enable
```

## 8. Node.js process / startup

`AUTOMATIC / APPLICATION SETUP`

On `NODE_ENV=production` the process:

- Trusts the Nginx proxy
- Listens on `127.0.0.1:3005`
- Refuses to start if `COOKIE_SECURE`, `RABT_SECRET_KEY`, `RABT_BACKUP_KEY`, or platform SMTP env vars are missing
- Warns if Telegram env is missing (unless `TELEGRAM_ENABLED=false`)
- Never prints secret values

`MANUAL ACTION REQUIRED`

Example systemd unit `/etc/systemd/system/rabt.service`:

```
[Service]
WorkingDirectory=/var/www/rabt
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/var/www/rabt/.env
```

Use a dedicated OS user. Do not run as root.

## 9. Secure cookies

`AUTOMATIC / APPLICATION SETUP`

| Environment | Cookie flags |
| --- | --- |
| `COOKIE_SECURE=false` (localhost) | `HttpOnly; Path=/; SameSite=Lax` |
| `COOKIE_SECURE=true` (production HTTPS) | `HttpOnly; Path=/; SameSite=Lax; Secure` |

Local HTTP is unchanged. Production HTTPS requires `COOKIE_SECURE=true`.

## 10. Backups

`AUTOMATIC / APPLICATION SETUP`

- Encrypted archives: Super Admin → backups, files in `storage/backups/*.enc`
- AES-256-GCM; encryption key is not stored inside the archive

`MANUAL ACTION REQUIRED`

- Copy `.enc` files off the server on a schedule
- Keep `RABT_BACKUP_KEY` in a password manager
- Restore only with the key that created that file

## 11. Security verification tests

Run on a development machine (HTTP localhost), not with production `COOKIE_SECURE=true`:

```bash
npm test
npm run test:isolation
npm run test:security
```

After production DNS/TLS is live, manually confirm:

- `http://YOUR_DOMAIN` → HTTPS
- Login cookie includes `Secure`
- `https://YOUR_DOMAIN/config/sessions.json` → 404
- `https://YOUR_DOMAIN/.env` → 404
- Port 3005 is not reachable from the public internet

## 12. Rollback procedure

`MANUAL ACTION REQUIRED`

1. Keep the previous app directory or Git tag.
2. Keep a copy of the last working `.env` (not in Git).
3. Keep the last encrypted backup.
4. To roll back: stop Node, restore the previous directory + `.env`, `systemctl start rabt`, `nginx -t` && reload.
5. If you changed `RABT_SECRET_KEY`, roll it back together with the data; mixed keys will not decrypt SMTP/Telegram blobs.

---

## Localhost reminder

```env
NODE_ENV=development
COOKIE_SECURE=false
```

Rabط must keep working at `http://localhost:3005` and on the LAN during development. HTTPS is a production/Nginx concern only.
