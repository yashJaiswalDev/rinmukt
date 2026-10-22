# Rinmukt

**Rinmukt** (ऋणमुक्त, "debt-free") tracks every loan and credit-card EMI in one place, so you don't have to open each lender's app. Enter a loan once and Rinmukt builds the full repayment schedule. It marks every past EMI as paid and shows how much you still owe, how long is left, and the day you'll be debt-free.

It is a single static web app: no backend, no build step, no accounts. Your data stays in your browser.

## Features

- **Home**: an animated 3D story built from your own loans. It shows your loans and lenders, your total outstanding, your passbook, a missed-EMI preview, and a runway to your debt-free date. With no loans it plays a sample story. The slides loop continuously.
- **Overview**:
  - Total principal outstanding, monthly EMI, debt-free date, and the next three dues.
  - A card per loan, plus a timeline of all your loans.
  - Loan detail: stats, a balance chart, and a year-by-year schedule. Tap any past EMI to mark it missed.
  - "Outstanding as per lender" re-bases the schedule on the figure your lender shows.
- **Portfolio**: combined balance across all loans, month by month, with today and the debt-free date marked. Loans are counted by type (home, car, personal, education, two-wheeler, gold, card EMI).
- **Cards**: credit-card EMIs grouped by card, with the limit each card has blocked. Supports no-cost (0%) plans and 18% GST on interest (GST paid, GST total, next payable).
- **Settings**: load demo data, back up as JSON (copied to the clipboard), restore, clear all.
- **One look throughout**: black ground and glass surfaces. The app takes the glow of whichever Home slide you left on. Every navigation uses the same zoom-and-fade transition, forward and back.

## How the numbers work

- Reducing-balance schedule: interest = opening balance × annual rate ÷ 12. The EMI you enter is used as given, and the final EMI absorbs rounding so the loan closes at exactly ₹0.
- An EMI counts as paid once its due date has passed, unless you mark it missed. A missed EMI adds that month's interest to the balance and extends the tenure.
- Due dates keep the day of the first EMI. In shorter months they fall on the last day (31 Jan → 28/29 Feb).
- Re-basing on a lender balance keeps your history and re-solves the remaining tenure: `n = ceil(−ln(1 − B·r / EMI) / ln(1 + r))`.

## Project structure

```
index.html            page markup and font links
src/styles.css        all styles
src/engine.js         schedule maths and formatting (no DOM; also loaded by the tests)
src/app.js            state, views, transitions, Home story
tests/engine.test.js  unit tests for the engine
.github/workflows/pages.yml  runs the tests, then deploys to GitHub Pages
```

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```bash
npm start            # serves at http://localhost:8080 (needs Python 3)
```

Copy-to-clipboard backup needs `https` or `localhost`.

## Test

```bash
npm test             # Node 18+, no dependencies
```

## Deploy to GitHub Pages

1. Create a new repository on GitHub, then push this folder:
   ```bash
   git init
   git add .
   git commit -m "Rinmukt v1"
   git branch -M main
   git remote add origin https://github.com/<your-username>/rinmukt.git
   git push -u origin main
   ```
2. In the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The workflow runs on every push to `main`. It runs the tests, then publishes the site to `https://<your-username>.github.io/rinmukt/`.

## Your data

- **Where it lives:** everything is saved in your browser's `localStorage`, under the key `rinmukt.v1`. Nothing is sent anywhere.
- **One device only:** data saved on one device or browser doesn't appear on another. Use **Settings → Backup** and **Restore** to move it.
- **Before clearing site data:** clearing your browser's site data erases your loans, so take a backup first.
- **Account numbers:** only the last 4 digits are stored.
