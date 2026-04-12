# Setup & Deployment Guide

How to deploy your own instance of Astrobee's Emporium.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Supabase](https://supabase.com/) project (free tier works)
- An [OpenAI](https://platform.openai.com/) API key (for scoring inference)

---

## 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/astrobees-emporium.git
cd astrobees-emporium
npm install
```

## 2. Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com/).
2. Apply database migrations:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

This creates all required tables (`sessions`, `responses`, `results`, `email_captures`) with proper RLS policies.

## 3. Configure Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_PROJECT_ID` | Your Supabase project ID |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon/public key |
| `VITE_SUPABASE_URL` | Your Supabase project URL |

## 4. Configure Edge Function Secrets

Set the following secrets in your Supabase project:

```bash
npx supabase secrets set OPENAI_API_KEY=sk-your-key-here
npx supabase secrets set BYPASS_SECRET=your-admin-bypass-phrase
```

| Secret | Description |
|--------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o inference |
| `BYPASS_SECRET` | Admin phrase to skip the email gate |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-provided by Supabase |

## 5. Deploy Edge Functions

```bash
npx supabase functions deploy score-session
npx supabase functions deploy verify-bypass
```

## 6. Run Locally

```bash
npm run dev
# → http://localhost:8080
```

## 7. Build for Production

```bash
npm run build
# Output in dist/
```

The `dist/` folder can be deployed to any static hosting provider (Vercel, Netlify, Cloudflare Pages, etc.).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Scoring returns errors | Check that `OPENAI_API_KEY` is set correctly in Supabase secrets |
| Email gate always fails | Verify `BYPASS_SECRET` is configured if using admin bypass |
| Session not persisting | Check that RLS policies are applied (run `npx supabase db push`) |
| Edge functions 404 | Ensure functions are deployed with `npx supabase functions deploy` |

For detailed architecture information, see [TECHNICAL.md](TECHNICAL.md).
