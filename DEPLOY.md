# Deploy checklist (Mahmoud)

## 1. Create a hosted Supabase project
- supabase.com → New project. Note the project URL + anon key + service-role key.

## 2. Push the schema
- `npx supabase link --project-ref <ref>`
- `npx supabase db push`   # applies all migrations to the cloud DB

## 3. Create the two users
- Supabase dashboard → Authentication → Add user (you + the engineer), email+password.

## 4. Point your LOCAL pipeline at the cloud DB (so your runs show in the app)
- In `.env.local`, set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to the CLOUD values
  (and NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to the cloud URL+anon).

## 5. Deploy the web app to Vercel
- Push the repo to GitHub, import into Vercel.
- Set Vercel env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (cloud values).
  Do NOT set the service-role key in Vercel — the app never uses it.
- Deploy. Share the URL + the engineer's login.

## 6. Generate a quote for them to see
- Run `npm run pipeline -- --file <boq> --type <profile> --name "<project>"` locally.
  It writes to the cloud DB; the engineer sees it in the app.
