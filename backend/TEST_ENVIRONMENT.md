# Local test environment

Created September 10, 2026. Credentials are stored only in the ignored `backend/.env` file.

- Neon: [Kanji Quest Test](https://console.neon.tech/app/projects/morning-meadow-43688567), PostgreSQL 18 in AWS Singapore, under Nipporia Launch. The fresh project's default `production` branch is used for testing; database `neondb`. Primary compute is limited to 0.25–0.5 CU with suspension after five idle minutes.
- Google Cloud: [Kanji Quest Test](https://console.cloud.google.com/auth/overview?project=kanji-quest-test), project ID `kanji-quest-test`, number `950662221239`.
- Google OAuth: external audience in Testing mode, web client `Kanji Quest Local Test`. The console owner's Gmail account is registered as a test user. Add further testers through Google Auth Platform → Audience.
- JavaScript origin: `http://localhost:5173`.
- Redirect URI: `http://localhost:5173/api/auth/google/callback`.
- API: `http://127.0.0.1:3001`; Vite and Nitro development proxies forward `/api` to it.

The environment contains pooled and direct database URLs, Google client credentials, and a generated cookie encryption secret. Do not copy these values into frontend variables or commit them.

Migration `001_initial.sql` was applied successfully. The live Neon driver integration tests passed in an isolated temporary schema, and `/api/ready` returned `ready`. A real Google sign-in completed through the localhost callback and the app confirmed that progress was saved to the account.

Start the local API with `npm run backend:start` (after building) and the frontend with `npm run dev -- --port 5173 --strictPort`. A separate deployed API now runs in the `nipporia-lp-493210` project; see [Cloud Run configuration](./CLOUD_RUN.md).
