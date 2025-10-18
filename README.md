<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/127lMsmTeRfjILXt4DazqfQcI1AT4MMQi

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and set:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from your Supabase project)
   - `GEMINI_API_KEY` (Google AI Studio API key; used server-side only)
3. Start dev server: `npm run dev`

## Deploy (Vercel)

This repo is configured for Vercel using `vercel.json` and an `api/` serverless function.

1. Push to GitHub (or import this repo into Vercel)
2. In Vercel Project Settings → Environment Variables, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
3. Deploy. Vercel will run `npm run build` and serve `dist/`. The app’s deep links are handled via rewrites.

Notes:
- Supabase anon key is intended for client use, but ensure Row Level Security (RLS) policies are configured appropriately in your database.
- Gemini API calls run through `api/gemini.ts` so your `GEMINI_API_KEY` is never exposed client-side.
