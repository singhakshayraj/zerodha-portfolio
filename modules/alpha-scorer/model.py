"""
Alpha Finder — ML-based stock ranking system for NSE
Ranks stocks by predicted 30-day outperformance vs Nifty50
"""

import warnings
warnings.filterwarnings('ignore')

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json, os, sys, argparse, joblib
from symbol_search import resolve_ticker, ALIASES

# ── CONFIG ────────────────────────────────────────────────────────────────────

PORTFOLIO = [
    "AARTIIND", "ATGL", "BANKINDIA", "BHEL", "HDFCSENSEX", "ICICIPRULI",
    "ITC", "ITCHOTELS", "MAHLIFE", "NBCC", "NMDC", "NTPC",
    "PARADEEP", "RVNL", "SILVERBEES", "SUPRAJIT"
]

UNIVERSE = PORTFOLIO + [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR",
    "SBIN", "BAJFINANCE", "MARUTI", "SUNPHARMA", "TITAN", "ADANIENT",
    "WIPRO", "ULTRACEMCO", "NESTLEIND", "AXISBANK", "ASIANPAINT",
    "LT", "HCLTECH", "TECHM", "POWERGRID", "ONGC", "COALINDIA",
    "DIVISLAB", "DRREDDY", "CIPLA", "BAJAJ-AUTO", "TATAMOTORS",
    "M&M", "EICHERMOT", "HEROMOTOCO", "GRASIM", "JSWSTEEL",
    "TATASTEEL", "HINDALCO", "VEDL", "APOLLOHOSP", "PIDILITIND",
    "DABUR", "COLPAL", "MARICO", "GODREJCP", "BERGEPAINT",
    "HAVELLS", "VOLTAS", "SIEMENS", "ABB", "CUMMINSIND",
    "MUTHOOTFIN", "CHOLAFIN", "SBILIFE", "HDFCLIFE", "ICICIGI",
    "IRCTC", "INDHOTEL", "LEMERIDIEN", "ZOMATO", "NYKAA",
    "DELHIVERY", "PAYTM", "TATACOMM", "BHARTIARTL", "IDEA",
    "INDIGO", "IRFC", "HUDCO", "RECLTD", "PFC",
]

BENCHMARK = "^NSEI"  # Nifty 50

# Known symbol renames / aliases (NSE symbol → yfinance symbol without suffix)
SYMBOL_ALIASES = {
    'ZOMATO':    'ETERNAL',   # Zomato renamed to Eternal Ltd
    'ETERNAL':   'ETERNAL',
    'NYKAA':     'FSN',
    'PAYTM':     'PAYTM',
}
LOOKBACK_DAYS = 500  # training data window
FORWARD_DAYS = 30    # prediction horizon
OUTPUT_DIR = os.path.join(os.path.dirname(__file__))

# ── HELPERS ───────────────────────────────────────────────────────────────────

def pct(series, n):
    """n-day percentage return"""
    return series.pct_change(n) * 100

def rsi(series, n=14):
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(n).mean()
    loss = (-delta.clip(upper=0)).rolling(n).mean()
    rs = gain / (loss + 1e-9)
    return 100 - 100 / (1 + rs)

def features_for(price, volume):
    """Compute all features for a single stock price series"""
    f = pd.DataFrame(index=price.index)
    f['mom_5d']   = pct(price, 5)
    f['mom_21d']  = pct(price, 21)
    f['mom_63d']  = pct(price, 63)
    f['mom_126d'] = pct(price, 126)
    f['mom_252d'] = pct(price, 252)
    f['vol_21d']  = price.pct_change().rolling(21).std() * 100
    f['vol_63d']  = price.pct_change().rolling(63).std() * 100
    f['rsi_14']   = rsi(price, 14)
    f['rsi_28']   = rsi(price, 28)
    # Volume momentum
    if volume is not None:
        f['vol_ratio'] = volume / (volume.rolling(21).mean() + 1e-9)
    else:
        f['vol_ratio'] = 1.0
    # Mean reversion
    f['dist_52w_high'] = (price / price.rolling(252).max() - 1) * 100
    f['dist_52w_low']  = (price / price.rolling(252).min() - 1) * 100
    # Trend
    ma20  = price.rolling(20).mean()
    ma50  = price.rolling(50).mean()
    ma200 = price.rolling(200).mean()
    f['above_ma20']  = (price > ma20).astype(int)
    f['above_ma50']  = (price > ma50).astype(int)
    f['above_ma200'] = (price > ma200).astype(int)
    f['ma20_slope']  = ma20.pct_change(5) * 100
    f['price_vs_ma50'] = (price / ma50 - 1) * 100
    return f

# ── DOWNLOAD DATA ─────────────────────────────────────────────────────────────

def download_data(tickers, start, end):
    ns_tickers = [t + ".NS" if not t.startswith("^") else t for t in tickers]
    print(f"  Downloading {len(ns_tickers)} tickers...")
    raw = yf.download(ns_tickers, start=start, end=end,
                      auto_adjust=True, progress=False, threads=True)
    return raw

# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    today = datetime.today()
    start = today - timedelta(days=LOOKBACK_DAYS + FORWARD_DAYS + 60)
    end   = today + timedelta(days=1)

    print("\n🔍 Alpha Finder — NSE ML Ranking System")
    print("=" * 50)
    print(f"Universe: {len(UNIVERSE)} stocks | Horizon: {FORWARD_DAYS}d | Data: {LOOKBACK_DAYS}d history\n")

    # Download
    print("📡 Fetching market data from Yahoo Finance...")
    all_tickers = UNIVERSE + [BENCHMARK]
    raw = download_data(all_tickers, start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d'))

    if raw.empty:
        print("ERROR: No data returned. Check internet connection.")
        sys.exit(1)

    close = raw['Close'] if 'Close' in raw else raw.xs('Close', axis=1, level=0)
    volume = raw['Volume'] if 'Volume' in raw else raw.xs('Volume', axis=1, level=0)

    # Rename columns — strip .NS suffix
    close.columns  = [c.replace('.NS','') for c in close.columns]
    volume.columns = [c.replace('.NS','') for c in volume.columns]

    benchmark_col = '^NSEI'
    if benchmark_col not in close.columns:
        print("WARNING: Benchmark not found, using equal weight market proxy")
        benchmark_ret = close.pct_change().mean(axis=1)
    else:
        benchmark_ret = close[benchmark_col].pct_change()

    print(f"  Got data for {close.shape[1]} tickers, {close.shape[0]} days\n")

    # Build training dataset
    print("⚙️  Engineering features + labels...")
    records = []
    feature_cols = None

    valid_tickers = [t for t in UNIVERSE if t in close.columns]
    print(f"  Valid tickers: {len(valid_tickers)}/{len(UNIVERSE)}")

    for ticker in valid_tickers:
        price  = close[ticker].dropna()
        vol    = volume[ticker] if ticker in volume.columns else None

        if len(price) < 300:
            continue

        feats = features_for(price, vol)
        feats['ticker'] = ticker
        feats['date']   = feats.index
        feats['price']  = price

        # Label: forward return vs benchmark (alpha)
        fwd_stock = price.pct_change(FORWARD_DAYS).shift(-FORWARD_DAYS) * 100
        fwd_bench = benchmark_ret.reindex(price.index).rolling(FORWARD_DAYS).sum().shift(-FORWARD_DAYS) * 100
        feats['fwd_alpha'] = fwd_stock - fwd_bench
        feats['fwd_return'] = fwd_stock
        feats['in_portfolio'] = int(ticker in PORTFOLIO)

        records.append(feats)
        if feature_cols is None:
            feature_cols = [c for c in feats.columns
                           if c not in ('ticker','date','price','fwd_alpha','fwd_return','in_portfolio')]

    df = pd.concat(records).dropna(subset=feature_cols + ['fwd_alpha'])
    print(f"  Training samples: {len(df):,} rows across {df['ticker'].nunique()} stocks\n")

    # Train / Test split — last 90 days = test (walk-forward)
    cutoff = df['date'].max() - pd.Timedelta(days=90)
    train  = df[df['date'] < cutoff]
    test   = df[df['date'] >= cutoff]

    X_train = train[feature_cols]
    y_train = train['fwd_alpha']
    X_test  = test[feature_cols]
    y_test  = test['fwd_alpha']

    # Train LightGBM
    print("🤖 Training LightGBM model...")
    try:
        import lightgbm as lgb
        model = lgb.LGBMRegressor(
            n_estimators=400,
            learning_rate=0.05,
            max_depth=5,
            num_leaves=31,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            verbose=-1
        )
        model.fit(X_train, y_train,
                  eval_set=[(X_test, y_test)],
                  callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)])

        test_preds = model.predict(X_test)
        from sklearn.metrics import r2_score
        r2 = r2_score(y_test, test_preds)
        print(f"  Model R² on holdout: {r2:.4f}")
        print(f"  IC (rank corr):      {pd.Series(test_preds).corr(y_test, method='spearman'):.4f}\n")

    except Exception as e:
        print(f"  LightGBM failed ({e}), falling back to sklearn RandomForest")
        from sklearn.ensemble import RandomForestRegressor
        model_rf = RandomForestRegressor(n_estimators=200, max_depth=6, random_state=42, n_jobs=-1)
        model_rf.fit(X_train, y_train)
        model = model_rf

    # ── SCORE TODAY ───────────────────────────────────────────────────────────
    print("📊 Scoring all stocks on latest data...")
    today_scores = []

    for ticker in valid_tickers:
        price  = close[ticker].dropna()
        vol    = volume[ticker] if ticker in volume.columns else None
        if len(price) < 200:
            continue

        feats = features_for(price, vol).dropna()
        if feats.empty:
            continue

        latest = feats.iloc[[-1]][feature_cols]
        try:
            score = float(model.predict(latest)[0])
        except:
            continue

        ltp = float(price.iloc[-1])
        ret_1m  = float(pct(price, 21).iloc[-1]) if len(price) > 21 else 0
        ret_3m  = float(pct(price, 63).iloc[-1]) if len(price) > 63 else 0
        ret_6m  = float(pct(price, 126).iloc[-1]) if len(price) > 126 else 0
        ret_1y  = float(pct(price, 252).iloc[-1]) if len(price) > 252 else 0
        rsi_val = float(rsi(price).iloc[-1])

        today_scores.append({
            'ticker': ticker,
            'ltp': round(ltp, 2),
            'alpha_score': round(score, 2),
            'ret_1m': round(ret_1m, 2),
            'ret_3m': round(ret_3m, 2),
            'ret_6m': round(ret_6m, 2),
            'ret_1y': round(ret_1y, 2),
            'rsi': round(rsi_val, 1),
            'in_portfolio': ticker in PORTFOLIO
        })

    results = pd.DataFrame(today_scores).sort_values('alpha_score', ascending=False).reset_index(drop=True)
    results['rank'] = results.index + 1

    # Feature importance
    if hasattr(model, 'feature_importances_'):
        fi = pd.Series(model.feature_importances_, index=feature_cols).sort_values(ascending=False)
        top_features = fi.head(8)
    else:
        top_features = None

    print(f"\n✅ Ranked {len(results)} stocks\n")

    # ── PRINT RESULTS ─────────────────────────────────────────────────────────
    print("=" * 70)
    print(f"{'RANK':<5} {'TICKER':<12} {'LTP':>8} {'ALPHA':>8} {'1M%':>7} {'3M%':>7} {'RSI':>6} {'PORT':>5}")
    print("-" * 70)
    for _, r in results.iterrows():
        port = "★" if r['in_portfolio'] else ""
        alpha_str = f"{r['alpha_score']:+.1f}"
        print(f"{int(r['rank']):<5} {r['ticker']:<12} {r['ltp']:>8.2f} {alpha_str:>8} "
              f"{r['ret_1m']:>+7.1f} {r['ret_3m']:>+7.1f} {r['rsi']:>6.1f} {port:>5}")

    print("=" * 70)
    print(f"\nAlpha Score = predicted 30-day outperformance vs Nifty50 (in %)")

    # Portfolio stocks summary
    port_results = results[results['in_portfolio'] == True]
    print(f"\n📁 Your Portfolio ({len(port_results)} stocks):")
    print(f"   Best ranked:  {port_results.iloc[0]['ticker']} (Rank #{int(port_results.iloc[0]['rank'])})")
    print(f"   Worst ranked: {port_results.iloc[-1]['ticker']} (Rank #{int(port_results.iloc[-1]['rank'])})")

    if top_features is not None:
        print(f"\n🔑 Top Predictive Features:")
        for feat, imp in top_features.items():
            print(f"   {feat:<20} {imp:.4f}")

    # Save model to disk for fast single-stock scoring
    model_path = os.path.join(OUTPUT_DIR, 'model.pkl')
    joblib.dump({'model': model, 'feature_cols': feature_cols}, model_path)

    # Save JSON
    out_json = os.path.join(OUTPUT_DIR, 'scores.json')
    results_dict = results.to_dict(orient='records')
    with open(out_json, 'w') as f:
        json.dump({
            'generated': datetime.today().strftime('%Y-%m-%d %H:%M'),
            'model_r2': round(r2, 4) if 'r2' in dir() else None,
            'rankings': results_dict
        }, f, indent=2)
    print(f"\n💾 Saved: {out_json}")

    # Generate HTML report
    generate_html(results, datetime.today().strftime('%Y-%m-%d'))
    print(f"💾 Saved: {os.path.join(OUTPUT_DIR, 'report.html')}")
    print("\n🎯 Open alpha/alpha_report.html in your browser to see the full rankings!\n")


def alpha_label(score):
    if score >= 5:   return ('Strong Buy', '#68d391', '#0d2318')
    if score >= 2:   return ('Outperform', '#9ae6b4', '#0d2318')
    if score >= 0:   return ('Neutral+',   '#f6e05e', '#2d2a0a')
    if score >= -3:  return ('Underperform','#fc8181','#2d1010')
    return               ('Avoid',        '#fc8181', '#2d1010')

def rsi_label(rsi):
    if rsi < 30:  return ('Oversold 🟢', '#68d391', 'Strong buy zone — stock has been beaten down heavily')
    if rsi < 40:  return ('Weak',        '#9ae6b4', 'Approaching oversold — potential recovery setup')
    if rsi <= 60: return ('Neutral',     '#f6e05e', 'Balanced — no strong directional bias from momentum')
    if rsi <= 70: return ('Strong',      '#f6ad55', 'Trending up — momentum is healthy but watch for fade')
    return              ('Overbought 🔴','#fc8181', 'Overheated — risk of pullback, avoid chasing')

def generate_html(results, date_str):
    rows = ""
    for _, r in results.iterrows():
        port_badge = '<span style="background:#2d3748;color:#f6e05e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">★ Portfolio</span>' if r['in_portfolio'] else ''
        alpha = r['alpha_score']
        a_label, a_color, a_bg = alpha_label(alpha)
        rank_color = '#68d391' if r['rank'] <= 10 else ('#f6e05e' if r['rank'] <= 25 else '#a0aec0')
        r1m_c = '#68d391' if r['ret_1m'] > 0 else '#fc8181'
        r3m_c = '#68d391' if r['ret_3m'] > 0 else '#fc8181'
        r_label, r_color, r_tooltip = rsi_label(r['rsi'])
        rows += f"""
        <tr>
          <td style="color:{rank_color};font-weight:700;font-size:18px;text-align:center">{int(r['rank'])}</td>
          <td><strong style="color:#fff;font-size:15px">{r['ticker']}</strong><br><span style="font-size:11px;color:#718096">₹{r['ltp']:,.2f}</span><br>{port_badge}</td>
          <td>
            <span style="background:{a_bg};color:{a_color};padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700;display:inline-block">{a_label}</span>
            <div style="color:{a_color};font-weight:700;font-size:20px;margin-top:4px">{alpha:+.1f}%</div>
            <div style="font-size:11px;color:#718096;margin-top:2px">vs Nifty next 30d</div>
          </td>
          <td>
            <div style="color:{r1m_c};font-weight:600">{r['ret_1m']:+.1f}%</div>
            <div style="font-size:11px;color:#718096">last 1 month</div>
          </td>
          <td>
            <div style="color:{r3m_c};font-weight:600">{r['ret_3m']:+.1f}%</div>
            <div style="font-size:11px;color:#718096">last 3 months</div>
          </td>
          <td>
            <span style="color:{r_color};font-weight:700;font-size:16px">{r['rsi']:.0f}</span>
            <div style="color:{r_color};font-size:11px;margin-top:2px">{r_label}</div>
            <div style="font-size:10px;color:#4a5568;margin-top:2px;max-width:160px;line-height:1.4">{r_tooltip}</div>
          </td>
        </tr>"""

    # Summary data
    top5    = ", ".join(results.head(5)['ticker'].tolist())
    port_df = results[results['in_portfolio']]
    port_top = port_df.head(3)['ticker'].tolist()
    port_bot = port_df.tail(3)['ticker'].tolist()

    # Count by signal
    strong_buy   = len(results[results['alpha_score'] >= 5])
    outperform   = len(results[(results['alpha_score'] >= 2) & (results['alpha_score'] < 5)])
    underperform = len(results[results['alpha_score'] < 0])

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Alpha Finder — {date_str}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; }}
    header {{ background: linear-gradient(135deg, #1a1f2e, #232840); padding: 32px 40px; border-bottom: 1px solid #2d3748; }}
    header h1 {{ font-size: 24px; font-weight: 700; color: #fff; }}
    header p {{ color: #718096; margin-top: 4px; font-size: 14px; }}
    .container {{ max-width: 1200px; margin: 0 auto; padding: 32px 40px; }}
    .cards {{ display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin-bottom: 28px; }}
    .card {{ background: #1a1f2e; border: 1px solid #2d3748; border-radius: 12px; padding: 20px; }}
    .card .label {{ font-size: 11px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }}
    .card .value {{ font-size: 14px; color: #e2e8f0; line-height: 1.7; }}
    .guide-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }}
    .guide-box {{ background: #1a1f2e; border: 1px solid #2d3748; border-radius: 12px; padding: 22px; }}
    .guide-box h3 {{ font-size: 13px; font-weight: 700; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #2d3748; }}
    .guide-row {{ display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }}
    .guide-badge {{ padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; min-width: 100px; text-align: center; }}
    .guide-desc {{ font-size: 13px; color: #a0aec0; line-height: 1.5; }}
    .guide-desc strong {{ color: #e2e8f0; }}
    .how-to {{ background: #1a1f2e; border: 1px solid #2d3748; border-left: 3px solid #63b3ed; border-radius: 12px; padding: 22px; margin-bottom: 32px; }}
    .how-to h3 {{ font-size: 13px; font-weight: 700; color: #63b3ed; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 14px; }}
    .how-to ol {{ padding-left: 18px; }}
    .how-to li {{ font-size: 13px; color: #a0aec0; line-height: 1.8; margin-bottom: 4px; }}
    .how-to li strong {{ color: #e2e8f0; }}
    .section {{ margin-bottom: 32px; }}
    .section h2 {{ font-size: 14px; font-weight: 600; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #2d3748; }}
    .stat-row {{ display: flex; gap: 24px; margin-bottom: 16px; }}
    .stat {{ background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; padding: 12px 20px; font-size: 13px; }}
    .stat span {{ font-weight: 700; font-size: 18px; margin-right: 6px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
    th {{ text-align: left; padding: 10px 16px; color: #718096; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #2d3748; }}
    td {{ padding: 12px 16px; border-bottom: 1px solid #1e2535; vertical-align: top; }}
    tr:hover td {{ background: #1e2535; }}
    .disclaimer {{ background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; padding: 14px 18px; font-size: 12px; color: #718096; margin-top: 24px; }}
    footer {{ text-align: center; padding: 24px; color: #4a5568; font-size: 12px; border-top: 1px solid #2d3748; margin-top: 16px; }}
    a {{ color: #63b3ed; text-decoration: none; }}
    /* Live search */
    .live-search {{ background: #1a1f2e; border: 1px solid #2d3748; border-radius: 12px; padding: 24px; margin-bottom: 28px; }}
    .live-search h3 {{ font-size: 13px; font-weight: 700; color: #63b3ed; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }}
    .search-row {{ display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }}
    .search-row input {{ flex: 1; min-width: 200px; padding: 11px 16px; background: #0f1117; border: 1.5px solid #2d3748; border-radius: 8px; color: #e2e8f0; font-size: 14px; font-family: 'Segoe UI', sans-serif; outline: none; }}
    .search-row input:focus {{ border-color: #63b3ed; }}
    .search-row button {{ padding: 11px 24px; background: #63b3ed; color: #0f1117; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }}
    .search-row button:hover {{ background: #90cdf4; }}
    .search-row button:disabled {{ background: #2d3748; color: #718096; cursor: not-allowed; }}
    .result-card {{ margin-top: 18px; background: #0f1117; border: 1px solid #2d3748; border-radius: 10px; padding: 20px; display: none; }}
    .result-card.visible {{ display: block; }}
    .result-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-top: 14px; }}
    .result-metric {{ background: #1a1f2e; border-radius: 8px; padding: 12px 16px; }}
    .result-metric .m-label {{ font-size: 10px; color: #718096; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }}
    .result-metric .m-value {{ font-size: 18px; font-weight: 700; }}
    .result-metric .m-sub {{ font-size: 11px; color: #718096; margin-top: 3px; }}
    .error-msg {{ color: #fc8181; font-size: 13px; margin-top: 12px; padding: 10px 14px; background: rgba(252,129,129,0.08); border-radius: 6px; display: none; }}
    .error-msg.visible {{ display: block; }}
    /* Suggestions dropdown */
    .suggestions-box {{ position: relative; flex:1; min-width:200px; }}
    .suggestions-list {{ position: absolute; top: 100%; left: 0; right: 0; background: #1a1f2e; border: 1px solid #2d3748; border-radius: 8px; margin-top: 4px; z-index: 100; overflow: hidden; display: none; }}
    .suggestions-list.visible {{ display: block; }}
    .suggestion-item {{ padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #2d3748; }}
    .suggestion-item:last-child {{ border-bottom: none; }}
    .suggestion-item:hover {{ background: #2d3748; }}
    .suggestion-sym {{ font-weight: 700; color: #fff; font-size: 13px; }}
    .suggestion-name {{ font-size: 11px; color: #718096; margin-top: 2px; }}
    .suggestion-score {{ float: right; font-size: 10px; color: #4a5568; margin-top: 2px; }}
    .alias-note {{ font-size:11px; color:#f6e05e; margin-top:8px; padding: 6px 10px; background: rgba(246,224,94,0.08); border-radius:5px; display:none; }}
    .alias-note.visible {{ display:block; }}
    @media (max-width: 600px) {{
      .container {{ padding: 12px; }}
      header {{ padding: 20px 16px; }}
      header h1 {{ font-size: 22px; }}
      header p {{ font-size: 12px; }}
      .cards {{ grid-template-columns: 1fr; gap: 10px; }}
      .guide-grid {{ grid-template-columns: 1fr; }}
      .search-row {{ flex-direction: column; }}
      .search-row input, .search-row button {{ width: 100%; box-sizing: border-box; }}
      .result-grid {{ grid-template-columns: repeat(2, 1fr); }}
      /* Make table horizontally scrollable */
      .section {{ overflow-x: auto; -webkit-overflow-scrolling: touch; }}
      table {{ font-size: 12px; min-width: 520px; }}
      th, td {{ padding: 8px 10px; white-space: nowrap; }}
      /* Nav links in header */
      header .nav-row {{ flex-wrap: wrap; gap: 8px; }}
    }}
  </style>
</head>
<body>
<header>
  <h1>🔬 Alpha Finder</h1>
  <p>ML-based 30-day outperformance predictions · Generated {date_str} · Trained on momentum + technical factors across 80+ NSE stocks</p>
</header>
<div class="container">

  <!-- Live On-Demand Scoring -->
  <div class="live-search">
    <h3>⚡ Score Any Stock Live</h3>
    <p style="font-size:13px;color:#718096;margin-bottom:14px;">Enter any NSE symbol to get an instant alpha score using the trained model. Takes ~15 seconds to fetch data.</p>
    <div class="search-row">
      <div class="suggestions-box">
        <input type="text" id="tickerInput" placeholder="e.g. Zomato, Tata Motors, HDFCBANK, Reliance..."
          oninput="onTickerInput(this.value)"
          onkeydown="onTickerKeydown(event)"
          autocomplete="off"/>
        <div class="suggestions-list" id="suggList"></div>
      </div>
      <button id="scoreBtn" onclick="scoreStock()">Get Alpha Score</button>
    </div>
    <div class="alias-note" id="aliasNote"></div>
    <div class="error-msg" id="errorMsg"></div>
    <div class="result-card" id="resultCard">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:22px;font-weight:700;color:#fff" id="res-ticker">—</div>
          <div style="font-size:12px;color:#718096;margin-top:2px" id="res-ltp">—</div>
        </div>
        <div style="text-align:right">
          <div id="res-signal-badge" style="padding:5px 14px;border-radius:8px;font-size:13px;font-weight:700;display:inline-block">—</div>
          <div id="res-score" style="font-size:32px;font-weight:700;margin-top:4px">—</div>
          <div style="font-size:11px;color:#718096">predicted alpha vs Nifty (30d)</div>
        </div>
      </div>
      <div class="result-grid">
        <div class="result-metric"><div class="m-label">1M Return</div><div class="m-value" id="res-1m">—</div></div>
        <div class="result-metric"><div class="m-label">3M Return</div><div class="m-value" id="res-3m">—</div></div>
        <div class="result-metric"><div class="m-label">6M Return</div><div class="m-value" id="res-6m">—</div></div>
        <div class="result-metric"><div class="m-label">1Y Return</div><div class="m-value" id="res-1y">—</div></div>
        <div class="result-metric">
          <div class="m-label">RSI (14)</div>
          <div class="m-value" id="res-rsi">—</div>
          <div class="m-sub" id="res-rsi-label">—</div>
        </div>
        <div class="result-metric">
          <div class="m-label">In Your Portfolio</div>
          <div class="m-value" id="res-port">—</div>
        </div>
      </div>
      <div style="font-size:11px;color:#718096;margin-top:12px" id="res-rsi-tip"></div>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="cards">
    <div class="card">
      <div class="label">Top 5 Opportunities</div>
      <div class="value" style="color:#68d391">{top5}</div>
    </div>
    <div class="card">
      <div class="label">Portfolio — Best Ranked</div>
      <div class="value" style="color:#f6e05e">{' · '.join(port_top)}</div>
    </div>
    <div class="card">
      <div class="label">Portfolio — Lowest Ranked</div>
      <div class="value" style="color:#fc8181">{' · '.join(port_bot)}</div>
    </div>
  </div>

  <!-- How to Use -->
  <div class="how-to">
    <h3>📖 How to Use This Report</h3>
    <ol>
      <li><strong>Alpha Score</strong> is the model's prediction of how much this stock will outperform Nifty50 over the next 30 days. A score of +5% means the model expects the stock to beat Nifty by 5%.</li>
      <li><strong>Focus on top-ranked stocks</strong> (Rank 1–15) that also have a healthy RSI (30–65). These have the best combination of momentum and room to run.</li>
      <li><strong>RSI alone is not a buy/sell signal</strong> — use it to avoid chasing overbought stocks (RSI &gt; 70) or catching falling knives (RSI &lt; 30 without a reversal signal).</li>
      <li><strong>Portfolio stocks</strong> marked ★ — if your holding is ranked low (&gt; rank 50), consider whether to reduce position. If ranked high (&lt; rank 20), it may be worth adding.</li>
      <li><strong>Refresh weekly</strong> — run the script every Monday before market open for the freshest signals.</li>
    </ol>
  </div>

  <!-- Legend Guide -->
  <div class="guide-grid">
    <div class="guide-box">
      <h3>Alpha Score — What It Means</h3>
      <div class="guide-row">
        <span class="guide-badge" style="background:#0d2318;color:#68d391">Strong Buy</span>
        <div class="guide-desc"><strong>Score ≥ +5%</strong> — Model strongly expects this stock to beat Nifty. High conviction signal. Consider adding or initiating position.</div>
      </div>
      <div class="guide-row">
        <span class="guide-badge" style="background:#0d2318;color:#9ae6b4">Outperform</span>
        <div class="guide-desc"><strong>Score +2% to +5%</strong> — Stock likely to beat market but with moderate confidence. Good candidate for entry or hold.</div>
      </div>
      <div class="guide-row">
        <span class="guide-badge" style="background:#2d2a0a;color:#f6e05e">Neutral+</span>
        <div class="guide-desc"><strong>Score 0% to +2%</strong> — No strong edge either way. Hold existing position but don't add aggressively.</div>
      </div>
      <div class="guide-row">
        <span class="guide-badge" style="background:#2d1010;color:#fc8181">Underperform</span>
        <div class="guide-desc"><strong>Score -3% to 0%</strong> — Model expects underperformance vs Nifty. Review your thesis. Consider trailing stop.</div>
      </div>
      <div class="guide-row">
        <span class="guide-badge" style="background:#2d1010;color:#fc8181">Avoid</span>
        <div class="guide-desc"><strong>Score &lt; -3%</strong> — Strong underperformance signal. If holding, consider reducing. Do not add.</div>
      </div>
    </div>

    <div class="guide-box">
      <h3>RSI — Relative Strength Index</h3>
      <p style="font-size:12px;color:#718096;margin-bottom:14px;">RSI measures how fast a stock has moved recently. It ranges 0–100. It tells you if a stock is <em>overheated</em> or <em>oversold</em> — not whether the company is good or bad.</p>
      <div class="guide-row">
        <span class="guide-badge" style="background:#0d2318;color:#68d391">RSI &lt; 30</span>
        <div class="guide-desc"><strong>Oversold</strong> — Stock has fallen a lot recently. Often a good entry zone if fundamentals are intact. Market may have overreacted.</div>
      </div>
      <div class="guide-row">
        <span class="guide-badge" style="background:#0d2318;color:#9ae6b4">RSI 30–45</span>
        <div class="guide-desc"><strong>Weak but recovering</strong> — Stock is depressed but not extreme. Watch for reversal candles before entering.</div>
      </div>
      <div class="guide-row">
        <span class="guide-badge" style="background:#2d2a0a;color:#f6e05e">RSI 45–65</span>
        <div class="guide-desc"><strong>Neutral zone</strong> — Ideal sweet spot. Stock has momentum without being overheated. Best risk/reward for new entries.</div>
      </div>
      <div class="guide-row">
        <span class="guide-badge" style="background:#2d2318;color:#f6ad55">RSI 65–70</span>
        <div class="guide-desc"><strong>Strong momentum</strong> — Trending well. Okay to hold, but don't chase. Set a trailing stop loss.</div>
      </div>
      <div class="guide-row">
        <span class="guide-badge" style="background:#2d1010;color:#fc8181">RSI &gt; 70</span>
        <div class="guide-desc"><strong>Overbought</strong> — Stock has run up fast. High risk of a pullback. Avoid fresh entries; consider booking partial profits.</div>
      </div>
    </div>
  </div>

  <!-- Rankings Table -->
  <div class="section">
    <h2>All Stock Rankings — Predicted 30-Day Alpha vs Nifty</h2>
    <div class="stat-row">
      <div class="stat"><span style="color:#68d391">{strong_buy}</span> Strong Buy signals</div>
      <div class="stat"><span style="color:#9ae6b4">{outperform}</span> Outperform signals</div>
      <div class="stat"><span style="color:#fc8181">{underperform}</span> Underperform / Avoid</div>
      <div class="stat"><span style="color:#f6e05e">{len(port_df)}</span> Your portfolio stocks tracked</div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="text-align:center">Rank</th>
          <th>Stock</th>
          <th>Alpha Signal</th>
          <th>1M Return</th>
          <th>3M Return</th>
          <th>RSI Reading</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  </div>

  <div class="disclaimer">
    ⚠️ <strong>Disclaimer:</strong> Alpha scores are model predictions based on price momentum and technical factors only.
    They do NOT incorporate fundamentals, earnings, news, or macroeconomic events.
    The model is trained on historical patterns which may not repeat. Past performance does not guarantee future results.
    This is for personal research only — not financial advice. Always do your own due diligence before trading.
  </div>
</div>
<footer>
  Alpha Finder · Zerodha Portfolio Intelligence &nbsp;·&nbsp;
  <a href="/research.html">Research Desk</a> &nbsp;·&nbsp;
  <a href="/">← Home</a>
</footer>
<script>
  let _searchTimer = null;
  let _selectedSym = null;

  function onTickerInput(val) {{
    _selectedSym = null;
    clearTimeout(_searchTimer);
    const list = document.getElementById('suggList');
    if (val.trim().length < 2) {{ list.classList.remove('visible'); return; }}
    _searchTimer = setTimeout(() => fetchSuggestions(val.trim()), 400);
  }}

  function onTickerKeydown(e) {{
    if (e.key === 'Enter') {{ document.getElementById('suggList').classList.remove('visible'); scoreStock(); }}
    if (e.key === 'Escape') {{ document.getElementById('suggList').classList.remove('visible'); }}
  }}

  async function fetchSuggestions(query) {{
    try {{
      const res = await fetch('/symbol-search', {{
        method: 'POST', headers: {{'Content-Type':'application/json'}},
        body: JSON.stringify({{ query }})
      }});
      const data = await res.json();
      renderSuggestions(data.suggestions || []);
    }} catch(e) {{ /* silent */ }}
  }}

  function renderSuggestions(items) {{
    const list = document.getElementById('suggList');
    if (!items.length) {{ list.classList.remove('visible'); return; }}
    list.innerHTML = items.map(s => `
      <div class="suggestion-item" onclick="selectSuggestion('${{s.symbol}}', '${{s.name.replace(/'/g,"")}}')">
        <span class="suggestion-sym">${{s.symbol}}</span>
        <span class="suggestion-score">${{s.score}}%</span>
        <div class="suggestion-name">${{s.name || ''}}${{s.sector ? ' · ' + s.sector : ''}}</div>
      </div>`).join('');
    list.classList.add('visible');
  }}

  function selectSuggestion(symbol, name) {{
    document.getElementById('tickerInput').value = symbol;
    document.getElementById('suggList').classList.remove('visible');
    _selectedSym = symbol;
    scoreStock();
  }}

  const SIGNAL_STYLES = {{
    'Strong Buy':   {{ color:'#68d391', bg:'#0d2318' }},
    'Outperform':   {{ color:'#9ae6b4', bg:'#0d2318' }},
    'Neutral+':     {{ color:'#f6e05e', bg:'#2d2a0a' }},
    'Underperform': {{ color:'#fc8181', bg:'#2d1010' }},
    'Avoid':        {{ color:'#fc8181', bg:'#2d1010' }},
  }};

  async function scoreStock() {{
    const ticker = document.getElementById('tickerInput').value.trim().toUpperCase();
    if (!ticker) return;
    document.getElementById('suggList').classList.remove('visible');

    const btn      = document.getElementById('scoreBtn');
    const err      = document.getElementById('errorMsg');
    const card     = document.getElementById('resultCard');
    const aliasEl  = document.getElementById('aliasNote');
    err.classList.remove('visible');
    card.classList.remove('visible');
    aliasEl.classList.remove('visible');
    btn.disabled = true;
    btn.textContent = 'Fetching data...';

    try {{
      const res = await fetch('/alpha-score', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ ticker }})
      }});
      const d = await res.json();
      if (d.error) {{
        // Show "did you mean?" suggestions if available
        let msg = d.error;
        if (d.suggestions && d.suggestions.length) {{
          const opts = d.suggestions.map(s =>
            `<span style="cursor:pointer;color:#63b3ed;text-decoration:underline" onclick="selectSuggestion('${{s.symbol}}','${{s.name}}')">${{s.symbol}}</span>`
          ).join(' · ');
          msg += `<br><span style="color:#a0aec0">Did you mean: ${{opts}}?</span>`;
        }}
        err.innerHTML = '⚠ ' + msg;
        err.classList.add('visible');
        return;
      }}
      // Show alias note if symbol was resolved to a different one
      if (d.was_aliased && d.resolved_sym && d.resolved_sym !== d.ticker) {{
        aliasEl.textContent = `ℹ "${{d.ticker}}" resolved to "${{d.resolved_sym}}" (renamed/alias)`;
        aliasEl.classList.add('visible');
      }}

      // Populate card
      const style = SIGNAL_STYLES[d.signal] || {{ color:'#a0aec0', bg:'#1a1f2e' }};
      document.getElementById('res-ticker').textContent = d.ticker;
      document.getElementById('res-ltp').textContent = `LTP: ₹${{d.ltp.toLocaleString('en-IN', {{minimumFractionDigits:2}})}}`;

      const badge = document.getElementById('res-signal-badge');
      badge.textContent = d.signal;
      badge.style.color = style.color;
      badge.style.background = style.bg;

      const scoreEl = document.getElementById('res-score');
      scoreEl.textContent = (d.alpha_score >= 0 ? '+' : '') + d.alpha_score.toFixed(1) + '%';
      scoreEl.style.color = d.alpha_score >= 0 ? '#68d391' : '#fc8181';

      const c = v => v >= 0 ? '#68d391' : '#fc8181';
      const fmt = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
      document.getElementById('res-1m').textContent = fmt(d.ret_1m); document.getElementById('res-1m').style.color = c(d.ret_1m);
      document.getElementById('res-3m').textContent = fmt(d.ret_3m); document.getElementById('res-3m').style.color = c(d.ret_3m);
      document.getElementById('res-6m').textContent = fmt(d.ret_6m); document.getElementById('res-6m').style.color = c(d.ret_6m);
      document.getElementById('res-1y').textContent = fmt(d.ret_1y); document.getElementById('res-1y').style.color = c(d.ret_1y);

      const rsiEl = document.getElementById('res-rsi');
      rsiEl.textContent = d.rsi.toFixed(0);
      const rsiColor = d.rsi < 30 ? '#68d391' : d.rsi <= 65 ? '#f6e05e' : '#fc8181';
      rsiEl.style.color = rsiColor;
      document.getElementById('res-rsi-label').textContent = d.rsi_label;
      document.getElementById('res-rsi-tip').textContent = d.rsi_tip;
      document.getElementById('res-port').textContent = d.in_portfolio ? '★ Yes' : 'No';
      document.getElementById('res-port').style.color = d.in_portfolio ? '#f6e05e' : '#718096';

      card.classList.add('visible');
    }} catch(e) {{
      err.innerHTML = '⚠ ' + e.message;
      err.classList.add('visible');
    }} finally {{
      btn.disabled = false;
      btn.textContent = 'Get Alpha Score';
    }}
  }}
</script>
</body>
</html>"""

    out = os.path.join(OUTPUT_DIR, 'report.html')
    with open(out, 'w') as f:
        f.write(html)


def score_single_ticker(ticker):
    """
    Score a single ticker using saved model. Outputs JSON to stdout.
    Used by the Node server for on-demand scoring.
    """
    model_path = os.path.join(OUTPUT_DIR, 'model.pkl')
    if not os.path.exists(model_path):
        print(json.dumps({'error': 'Model not trained yet. Run alpha_finder.py first to train.'}))
        sys.exit(1)

    saved = joblib.load(model_path)
    model = saved['model']
    feature_cols = saved['feature_cols']

    today = datetime.today()
    start = (today - timedelta(days=400)).strftime('%Y-%m-%d')
    end   = (today + timedelta(days=1)).strftime('%Y-%m-%d')

    # Resolve ticker via fuzzy search + alias map
    resolved = resolve_ticker(ticker)
    sym      = resolved['resolved']
    display  = resolved['display']
    bench    = '^NSEI'

    # Try NSE first, then BSE as fallback
    price = None
    vol   = None
    for suffix in ['.NS', '.BO']:
        ns = sym + suffix
        raw = yf.download([ns, bench], start=start, end=end,
                          auto_adjust=True, progress=False, threads=False)
        if raw.empty or 'Close' not in raw:
            continue
        close_df  = raw['Close']
        volume_df = raw.get('Volume', pd.DataFrame())
        close_df.columns  = [c.replace('.NS','').replace('.BO','') for c in close_df.columns]
        volume_df.columns = [c.replace('.NS','').replace('.BO','') for c in volume_df.columns]
        if sym in close_df.columns:
            candidate = close_df[sym].dropna()
            if len(candidate) >= 200:
                price = candidate
                vol   = volume_df[sym] if sym in volume_df.columns else None
                break

    if price is None:
        # Return suggestions so frontend can show "Did you mean?"
        suggestions = resolved.get('suggestions', [])
        print(json.dumps({
            'error':       f'Could not fetch data for "{ticker}" (resolved to "{sym}"). It may be a new listing or use a different symbol.',
            'suggestions': suggestions,
        }))
        sys.exit(1)

    feats = features_for(price, vol).dropna()
    if feats.empty:
        print(json.dumps({'error': 'Could not compute features.'}))
        sys.exit(1)

    latest = feats.iloc[[-1]][feature_cols]
    score  = float(model.predict(latest)[0])
    ltp    = float(price.iloc[-1])

    a_label, _, _ = alpha_label(score)
    r_val         = float(rsi(price).iloc[-1])
    r_label, _, r_tip = rsi_label(r_val)

    result = {
        'ticker':       display,
        'resolved_sym': sym,
        'was_aliased':  not resolved['exact'],
        'suggestions':  resolved['suggestions'][:3],
        'ltp':          round(ltp, 2),
        'alpha_score':  round(score, 2),
        'signal':       a_label,
        'ret_1m':       round(float(pct(price,21).iloc[-1]), 2) if len(price)>21 else 0,
        'ret_3m':       round(float(pct(price,63).iloc[-1]), 2) if len(price)>63 else 0,
        'ret_6m':       round(float(pct(price,126).iloc[-1]), 2) if len(price)>126 else 0,
        'ret_1y':       round(float(pct(price,252).iloc[-1]), 2) if len(price)>252 else 0,
        'rsi':          round(r_val, 1),
        'rsi_label':    r_label,
        'rsi_tip':      r_tip,
        'in_portfolio': sym in PORTFOLIO,
        'generated':    datetime.today().strftime('%Y-%m-%d %H:%M'),
    }
    print(json.dumps(result))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--ticker', type=str, default=None,
                        help='Score a single ticker (uses saved model)')
    args = parser.parse_args()

    if args.ticker:
        score_single_ticker(args.ticker)
    else:
        main()
