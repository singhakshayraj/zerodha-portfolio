"""
NSE Symbol Search — fuzzy lookup + live suggestions for Indian stocks.

Two modes:
  1. Offline fuzzy search against cached NSE 751-stock DB (instant)
  2. Live yfinance Search for any query (slower, ~2s, covers all stocks)

Usage:
  python3 symbol_search.py "zomato"
  python3 symbol_search.py "tata motors"
  python3 symbol_search.py "hdfc"
"""

import json, os, time, sys
import yfinance as yf
from rapidfuzz import process, fuzz

CACHE_FILE  = os.path.join(os.path.dirname(__file__), 'nse_symbols.json')
CACHE_TTL   = 86400   # rebuild once a day

# ── KNOWN RENAMES / ALIASES ───────────────────────────────────────────────────
# Maps what users type → actual NSE symbol yfinance understands
ALIASES = {
    'ZOMATO':        'ETERNAL',
    'ETERNAL':       'ETERNAL',
    'TATAMOTORS':    'TATAMOTORS',   # was renamed in yfinance; kept for clarity
    'NYKAA':         'FSN',
    'FSN':           'FSN',
    'PAYTM':         'PAYTM',
    'POLICYBAZAAR':  'POLICYBZR',
    'DELHIVERY':     'DELHIVERY',
    'CARTRADE':      'CARTRADE',
    'NAZARA':        'NAZARA',
    'MAPMYINDIA':    'MAPMYINDIA',
}

# ── OFFLINE DB (NSE top ~750 stocks) ─────────────────────────────────────────

def _fetch_nse_index(index_name):
    import urllib.request
    url = f'https://www.nseindia.com/api/equity-stockIndices?index={urllib.request.quote(index_name)}'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com',
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            return [s['symbol'] for s in data.get('data', []) if s.get('symbol')]
    except:
        return []

def build_symbol_db(force=False):
    if not force and os.path.exists(CACHE_FILE):
        if time.time() - os.path.getmtime(CACHE_FILE) < CACHE_TTL:
            with open(CACHE_FILE) as f:
                return json.load(f)

    print("  Refreshing NSE symbol list...", flush=True)
    seen = set()
    entries = []

    indices = ['NIFTY 500', 'NIFTY NEXT 50', 'NIFTY MIDCAP 150',
               'NIFTY SMALLCAP 250', 'NIFTY MICROCAP250']
    for idx in indices:
        for sym in _fetch_nse_index(idx):
            if sym not in seen:
                seen.add(sym)
                entries.append({'symbol': sym, 'name': sym, 'sector': ''})

    # Add aliases
    for alias, real in ALIASES.items():
        if alias not in seen:
            entries.append({'symbol': alias, 'name': alias, 'sector': ''})
            seen.add(alias)

    with open(CACHE_FILE, 'w') as f:
        json.dump(entries, f)

    print(f"  Built DB: {len(entries)} symbols", flush=True)
    return entries


# ── LIVE YFINANCE SEARCH ──────────────────────────────────────────────────────

def _yf_search(query, max_results=8):
    """
    Search yfinance for Indian stocks matching query.
    Returns list of {symbol (NSE), name, sector, exchange}
    """
    try:
        results = []
        s = yf.Search(query, max_results=20)
        for item in s.quotes:
            # Only keep NSE/BSE Indian equities
            if item.get('exchange') not in ('NSI', 'BSE', 'NSE'):
                continue
            if item.get('quoteType') != 'EQUITY':
                continue
            raw_sym = item.get('symbol', '')
            # Strip .NS / .BO suffix, keep clean NSE symbol
            sym = raw_sym.replace('.NS', '').replace('.BO', '')
            # Prefer NSE (NSI) over BSE duplicates
            if any(r['symbol'] == sym for r in results):
                continue
            results.append({
                'symbol':   sym,
                'name':     item.get('longname') or item.get('shortname') or sym,
                'sector':   item.get('sectorDisp', ''),
                'exchange': 'NSE' if item.get('exchange') == 'NSI' else 'BSE',
            })
            if len(results) >= max_results:
                break
        return results
    except Exception as e:
        return []


# ── MAIN RESOLVE FUNCTION ─────────────────────────────────────────────────────

def resolve_ticker(query, top_n=5):
    """
    Resolve any user input to the best NSE symbol + suggestions.

    Returns:
      {
        'resolved':    'ETERNAL',           # best symbol to use for data fetch
        'display':     'ZOMATO',            # what to show the user
        'exact':       True/False,
        'suggestions': [
          {'symbol': 'ETERNAL', 'name': 'Eternal Ltd (Zomato)', 'sector': '...', 'score': 95},
          ...
        ]
      }
    """
    q = query.strip().upper()

    # Step 1: alias map (instant, zero network)
    if q in ALIASES:
        real = ALIASES[q]
        return {
            'resolved':    real,
            'display':     q,
            'exact':       True,
            'suggestions': [{'symbol': real, 'name': f'{real} (alias for {q})', 'sector': '', 'score': 100}]
        }

    # Step 2: offline fuzzy against cached DB (instant)
    db = build_symbol_db()
    sym_list = [e['symbol'] for e in db]

    # Exact match
    if q in sym_list:
        return {
            'resolved':    q,
            'display':     q,
            'exact':       True,
            'suggestions': [{'symbol': q, 'name': q, 'sector': '', 'score': 100}]
        }

    # Fuzzy match against symbols
    fuzzy_matches = process.extract(q, sym_list, scorer=fuzz.WRatio, limit=top_n)
    offline_suggestions = []
    for match_sym, score, idx in fuzzy_matches:
        offline_suggestions.append({
            'symbol': match_sym,
            'name':   db[idx].get('name', match_sym),
            'sector': db[idx].get('sector', ''),
            'score':  round(score)
        })

    # Step 3: live yfinance search (enriches with company names + catches new listings)
    live = _yf_search(query, max_results=8)
    seen = {s['symbol'] for s in offline_suggestions}
    for item in live:
        sym = item['symbol']
        # Check if this live result matches a top offline suggestion — enrich name
        for s in offline_suggestions:
            if s['symbol'] == sym:
                s['name']   = item['name']
                s['sector'] = item['sector']
                break
        else:
            # New result from live search — add it
            if sym not in seen:
                offline_suggestions.append({
                    'symbol': sym,
                    'name':   item['name'],
                    'sector': item['sector'],
                    'score':  70  # live result, no fuzzy score
                })
                seen.add(sym)

    # Re-sort: exact symbol prefix gets boosted
    for s in offline_suggestions:
        if s['symbol'].startswith(q[:4]):
            s['score'] = min(100, s['score'] + 10)

    suggestions = sorted(offline_suggestions, key=lambda x: -x['score'])[:top_n]
    best = suggestions[0]['symbol'] if suggestions else q

    return {
        'resolved':    best,
        'display':     query.upper(),
        'exact':       False,
        'suggestions': suggestions
    }


if __name__ == '__main__':
    import warnings
    warnings.filterwarnings('ignore')
    q = ' '.join(sys.argv[1:]) if len(sys.argv) > 1 else 'zomato'
    result = resolve_ticker(q)
    print(json.dumps(result, indent=2))
