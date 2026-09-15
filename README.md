# Likhavat — Handwriting & Sheet Converter

Upload a photo of a handwritten page (Hindi/English/Hinglish) and get a Word file back.
Upload a screenshot of a spreadsheet and get an Excel file back. It auto-detects which one you gave it.

## 1. Get a free Gemini API key (no credit card)

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with any Google account.
3. Click **Create API key** → **Create API key in new project**.
4. Copy the key — you'll paste it into Vercel in step 3.

The free tier is enough for personal/small-team use (rate-limited, resets daily).

## 2. Push this folder to GitHub

```bash
cd handwrite-converter
git init
git add .
git commit -m "Initial commit"
gh repo create handwrite-converter --public --source=. --push
```

(Or create a repo on github.com and follow its "push an existing repo" instructions.)

## 3. Deploy to Vercel

1. Go to https://vercel.com → **New Project** → import the GitHub repo you just created.
2. Before deploying, open **Environment Variables** and add:
   - Key: `GEMINI_API_KEY`
   - Value: the key you copied in step 1
3. Click **Deploy**. No credit card needed on Vercel's free tier.

That's it — you'll get a live `.vercel.app` URL.

## Notes

- One page/screenshot at a time, for now.
- Works best with a clear, well-lit, non-blurry photo.
- Handwriting recognition is never 100% — always skim the output before sending it onward, especially for numbers.
- If a page is misread as the wrong type (table vs text), the simplest fix is retaking the photo — very messy tables sometimes get read as text and vice versa.

## Local development

```bash
npm install
cp .env.example .env.local   # then paste your key into .env.local
npm run dev
```
