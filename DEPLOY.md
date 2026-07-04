# Deploy checklist (Mahmoud)

## 1. Create a hosted Supabase project — ✅ DONE
- Project: `construction-quote-builder` (ref `axkoplyedaekidkbndra`, eu-west-3).

## 2. Push the schema — ✅ DONE
- `supabase link --project-ref axkoplyedaekidkbndra` then `supabase db push`.
- All 7 migrations applied; verified 11 tables, RLS on all, authenticated=DML-only, anon=0 grants.

## 3. Create the two users — ⬜ TODO
- Supabase dashboard → Authentication → Users → Add user (you + the engineer), email+password,
  "Auto Confirm User" on. RLS denies anyone not logged in and there is no sign-up screen.

## 4. Point your LOCAL pipeline at the cloud DB (so your runs show in the app)
- In `.env.local`, set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to the CLOUD values
  (and NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to the cloud URL+anon).
- The service-role key is used ONLY by the local pipeline/tests. See `.env.example`.

## 5. Deploy the web app to Vercel — ⬜ TODO
- Repo is on GitHub (mahmoudsheikh94/construction-quote-builder). Import into Vercel.
- Set Vercel env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (cloud values).
  Do NOT set the service-role key in Vercel — the web app reads/writes via the user-session
  (anon + RLS) client only. Verified: the build succeeds with the service-role vars unset.
- Deploy. Share the URL + the engineer's login.

## 6. Generate a quote for them to see
- Run `npm run pipeline -- --file <boq> --type <profile> --name "<project>"` locally.
  It writes to the cloud DB; the engineer sees it in the app.
