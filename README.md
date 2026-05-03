<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy Jennie

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/210ef9a4-0b75-4b38-9944-7747aa7e45e8

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `GEMINI_API_KEY` in `.env` for Netlify Functions.
3. Run the app through Netlify Dev so `/api/*` routes work:
   `npx netlify dev`

## Deploy on Netlify

1. Push this repo to GitHub and connect it to Netlify.
2. In Netlify, set `GEMINI_API_KEY` under Site settings > Environment variables.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Functions directory: `netlify/functions`

The browser never receives the real Gemini API key. Text, TTS, and Live voice token creation all go through Netlify Functions.

## Frontend-only preview

Static preview can still show the UI, but AI calls require the Netlify Functions API.

1. Run:
   `npm run dev`
