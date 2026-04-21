# Zerodha Portfolio Tracker

Automated daily portfolio reporting via Claude + Zerodha Kite MCP.

## Structure

```
zerodha-portfolio/
├── .mcp.json               # Kite MCP server config (SSE endpoint)
├── config/
│   └── sectors.json        # Sector & exchange mapping per stock
├── data/
│   └── history.json        # Daily snapshots — source of truth
├── reports/
│   └── daily/
│       └── YYYY-MM-DD.html # Per-day detailed report
└── dashboard/
    └── index.html          # Consolidated dashboard with charts
```

## How It Works

- Every weekday at **3:33 PM**, a Claude cron job logs into Kite, fetches live holdings, and generates a new daily report.
- Each day's snapshot is appended to `data/history.json`.
- `dashboard/index.html` is updated with the latest values, trends, and chart data.
- Individual daily reports live in `reports/daily/`.

## Viewing Reports

Open `dashboard/index.html` in any browser for the full consolidated view.
Open `reports/daily/YYYY-MM-DD.html` for a specific day's breakdown.

## MCP Config

The `.mcp.json` connects to Zerodha's hosted Kite MCP server via SSE:
```json
{
  "mcpServers": {
    "kite": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.kite.trade/sse"]
    }
  }
}
```
