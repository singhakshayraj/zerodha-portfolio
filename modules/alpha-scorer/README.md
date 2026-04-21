---
title: Alpha Scorer
emoji: 📈
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
---

# Alpha Scorer

FastAPI service that scores NSE stocks using a LightGBM model trained on momentum, value, and quality factors.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/`  | View latest alpha report (HTML) |
| `POST` | `/score` | Score a single ticker `{ "ticker": "INFY" }` |
| `POST` | `/search` | Fuzzy symbol search `{ "query": "infosys" }` |
| `POST` | `/train` | Retrain the model (takes ~10 min) |

## Deploy to HF Spaces

1. Create a new Space at [huggingface.co/new-space](https://huggingface.co/new-space) — choose **Docker** SDK
2. Clone the Space repo and copy this directory's contents into it:
   ```bash
   git clone https://huggingface.co/spaces/<your-username>/alpha-scorer
   cp -r modules/alpha-scorer/. alpha-scorer/
   cd alpha-scorer && git add . && git commit -m "init" && git push
   ```
3. Copy the Space URL (e.g. `https://<user>-alpha-scorer.hf.space`) and set it in:
   - Vercel env var: `ALPHA_SCORER_URL`
   - GitHub Actions var: `HF_SPACE_URL` (for weekly retrain trigger)
