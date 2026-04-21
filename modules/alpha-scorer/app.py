"""
FastAPI wrapper for the alpha-scorer module.
Deploy on Hugging Face Spaces (free, always-on).
Run locally: uvicorn app:app --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import subprocess, json, os

app = FastAPI(title="Alpha Scorer API")

BASE_DIR = os.path.dirname(__file__)


class ScoreRequest(BaseModel):
    ticker: str


class SearchRequest(BaseModel):
    query: str


@app.get("/", response_class=HTMLResponse)
def serve_report():
    report_path = os.path.join(BASE_DIR, "report.html")
    if not os.path.exists(report_path):
        raise HTTPException(status_code=404, detail="Report not generated yet. POST /train first.")
    with open(report_path) as f:
        return f.read()


@app.post("/score")
def score(req: ScoreRequest):
    result = subprocess.run(
        ["python3", os.path.join(BASE_DIR, "model.py"), "--ticker", req.ticker.upper()],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0 and not result.stdout:
        raise HTTPException(status_code=500, detail=result.stderr or "Scoring failed")
    try:
        return json.loads(result.stdout.strip())
    except Exception:
        raise HTTPException(status_code=500, detail="Invalid model output: " + result.stdout[:200])


@app.post("/search")
def search(req: SearchRequest):
    result = subprocess.run(
        ["python3", os.path.join(BASE_DIR, "symbol_search.py"), req.query],
        capture_output=True, text=True, timeout=15
    )
    try:
        return json.loads(result.stdout.strip())
    except Exception:
        raise HTTPException(status_code=500, detail="Search failed")


@app.post("/train")
def train():
    result = subprocess.run(
        ["python3", os.path.join(BASE_DIR, "model.py")],
        capture_output=True, text=True, timeout=600
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr or "Training failed")
    return {"status": "ok", "output": result.stdout[-500:]}
