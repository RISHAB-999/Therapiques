# Security Notes — Therapique

Audit date: November 2026. This records the security decisions in the codebase and the
operational steps that code alone cannot cover.

## Deployment checklist (do these once)

1. **Rotate `JWT_SECRET`** to a long random value (≥ 32 chars). The current one is 20 chars.
   All existing sessions end; users log in again.
2. **Rotate `ADMIN_PASSWORD`** (the old admin token format exposed it in base64 to anyone who could
   read the admin browser's localStorage). Use ≥ 16 characters.
3. **Set `CORS_ORIGINS`** on the backend host to the exact frontend URLs. Without it, production
   falls back to allowing `*.vercel.app` (logged as a warning at startup).
4. Set `NODE_ENV=production` and `TRUST_PROXY=1` (Render) on the backend.
5. Make sure the start command is `npm start` (now `node server.js`, not nodemon).
6. **Spending controls** (cannot be set from code):
   - Google AI Studio / Cloud: set a budget alert and a per-minute/per-day quota on the Gemini key.
   - Brevo: check the daily sending limit and enable alerts.
   - Cloudinary: enable usage notifications for the plan's credit limit.
   - Razorpay: enable payment/refund alerts; restrict the API key to the server IP if available.
   - Render / Vercel: set spend limits / usage notifications.
   - MongoDB Atlas: restrict Network Access to the backend's egress IPs (not `0.0.0.0/0`),
     use a database user with `readWrite` on the app database only, and enable backups.

## Design decisions

| Area | Decision |
|---|---|
| Tokens | JWT HS256 only, with `role` (`user`/`doctor`/`admin`) and expiry (7 days; admin 12 h). Roles are not interchangeable. `tokenVersion` is bumped on password change/reset and on doctor credential change to revoke old sessions. The admin token carries an HMAC fingerprint of the admin credentials, never the credentials themselves. |
| Token storage | Tokens are sent in custom headers (`token`, `dtoken`, `atoken`), not cookies, so CSRF does not apply. A strict CSP limits the XSS impact on localStorage tokens. |
| Payments | All prices are computed on the server (`utils/orderPricing.js`). Razorpay signatures are verified in constant time, and every verification also checks that the Razorpay order belongs to this user and record and has the expected amount. Verifications are idempotent. |
| Wallet | Coin changes use atomic `$inc` with balance guards (`utils/coins.js`). Cancellations and refund claims use atomic state transitions, so concurrent requests cannot refund twice. |
| Rate limiting | In-memory per-IP (+ e-mail) limiter (`middlewares/rateLimit.js`). Move it to Redis if the API is ever scaled to several instances. |
| OTP | `crypto.randomInt`, SHA-256 hashed, 10-minute expiry, 5 attempts max, 60 s resend cooldown. Forgot-password and login responses do not reveal whether an account exists. |
| Uploads | JPEG/PNG/WebP/GIF only, 5 MB max, random file names, magic-byte check, temp files deleted after each request, authentication before upload. Files are then stored in Cloudinary. |
| E-mails | Every template input is HTML-escaped (`escapeDeep` in `services/emailService.js`). |
| Video calls | Signaling relays only within the room a socket was authorised to join. Chat sender identity comes from the server. Chat content is not logged. |
| Errors | Production responses return a generic message; details stay in server logs. |
| Headers | API: strict CSP, HSTS, nosniff, frame-deny, no-referrer. SPAs: CSP, HSTS and Permissions-Policy in `vercel.json`. |

## Tests

```bash
cd backend && npm test
```

Runs `tests/security.test.js` (no DB) and `tests/payments.integration.test.js` (in-memory MongoDB,
Razorpay stubbed). Each test reproduces an attack from the audit.

## Known residual risks

- Tokens live in localStorage (an XSS would expose them). Moving to httpOnly cookies needs a CSRF design and is a larger change.
- The in-memory rate limiter resets on restart and is per instance.
- An unverified account can still be re-registered (its password is overwritten). This is mitigated because unverified accounts cannot book, order or pay, and old tokens are revoked.
- The call ticket is valid for its 2-minute TTL rather than single use, so socket reconnects keep working.
- `react-router` / dependency advisories are re-checked with `npm audit` at each release.
