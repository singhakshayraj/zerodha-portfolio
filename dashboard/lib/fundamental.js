// dashboard/lib/fundamental.js
// Pure client-side ES module — no imports, no API calls, scoring functions only.

export const SECTOR_MEDIANS = {
  'IT': 28, 'Banking': 14, 'PSU Banking': 12, 'NBFC': 16, 'Pharma': 22,
  'FMCG': 48, 'Auto': 20, 'Auto Ancillary': 18, 'Metal': 10, 'Steel': 9,
  'Cement': 18, 'Realty': 18, 'Real Estate': 18, 'Oil & Gas': 10,
  'Power': 22, 'PSU Power': 20, 'Telecom': 30, 'Insurance': 25,
  'Chemicals': 24, 'Specialty Chemicals': 26, 'Consumer': 40,
  'Infrastructure': 16, 'PSU Infra': 14, 'Aviation': 18,
  'Textiles': 12, 'Retail': 35, 'Defence': 30, 'Defence / Shipbuilding': 32,
  'Mining': 10, 'Fertilizers': 14, 'Hospitality': 22, 'Gas Distribution': 18,
  'PSU Capital Goods': 16, 'PSU Construction': 15, 'Renewable Energy': 35,
  'Silver ETF': 20, 'Index ETF': 22, 'Other': 20,
};

export const BANK_NBFC_SECTORS = new Set(['Banking', 'PSU Banking', 'NBFC', 'Insurance']);

export const SECTOR_PEERS = {
  'IT': ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
  'Banking': ['HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'AXISBANK', 'SBIN'],
  'PSU Banking': ['SBIN', 'PNB', 'BANKBARODA', 'CANBK', 'UNIONBANK'],
  'NBFC': ['BAJFINANCE', 'CHOLAFIN', 'MUTHOOTFIN', 'MANAPPURAM', 'LICHSGFIN'],
  'Pharma': ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'LUPIN'],
  'FMCG': ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR'],
  'Auto': ['MARUTI', 'TATAMOTORS', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT'],
  'Cement': ['ULTRACEMCO', 'SHREECEM', 'AMBUJACEMENT', 'ACC', 'DALMIACEMNT'],
  'Realty': ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'BRIGADE'],
  'Oil & Gas': ['RELIANCE', 'ONGC', 'BPCL', 'IOC', 'HINDPETRO'],
  'Power': ['NTPC', 'POWERGRID', 'TATAPOWER', 'ADANIPOWER', 'CESC'],
  'Metal': ['TATASTEEL', 'JSWSTEEL', 'SAIL', 'HINDALCO', 'VEDL'],
  'Chemicals': ['PIDILITIND', 'SRF', 'AARTI', 'DEEPAKNTR', 'NAVINFLUOR'],
  'Insurance': ['HDFCLIFE', 'SBILIFE', 'ICICIPRULI', 'MAXFINSERV', 'GODIGIT'],
  'Telecom': ['BHARTIARTL', 'IDEA', 'TATACOMM', 'HFCL', 'TEJAS'],
  'Infrastructure': ['LARSEN', 'KEC', 'KALPATPOWR', 'IRCON', 'NCC'],
  'Defence': ['HAL', 'BEL', 'BEML', 'MAZDOCK', 'COCHINSHIP'],
  'Defence / Shipbuilding': ['HAL', 'BEL', 'BEML', 'MAZDOCK', 'GRSE'],
  'PSU Capital Goods': ['BHEL', 'BEML', 'MIDHANI', 'GRSE', 'COCHINSHIP'],
  'Renewable Energy': ['IREDA', 'NHPC', 'SJVN', 'GIPCL', 'GREENPANEL'],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getSectorMedianPE(sector) {
  return SECTOR_MEDIANS[sector] ?? SECTOR_MEDIANS['Other'];
}

export function getPeers(sector) {
  return SECTOR_PEERS[sector] ?? [];
}

export function fmtINR(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function scoreQuality(roe, roce, netMargin) {
  function scoreRoeRoce(v) {
    if (v == null) return 0;
    if (v < 10)   return 0;
    if (v < 15)   return 4;
    if (v < 20)   return 7;
    if (v < 25)   return 9;
    return 10;
  }

  function scoreMargin(v) {
    if (v == null) return 0;
    if (v < 5)    return 0;
    if (v < 10)   return 3;
    if (v < 15)   return 6;
    if (v < 20)   return 8;
    return 10;
  }

  const roe_score    = scoreRoeRoce(roe);
  const roce_score   = scoreRoeRoce(roce);
  const margin_score = scoreMargin(netMargin);
  const total        = roe_score + roce_score + margin_score;

  return { roe_score, roce_score, margin_score, total, max: 30 };
}

export function scoreGrowth(revCagr3yr, epsCagr3yr, revenueQoQ) {
  function scoreRev(v) {
    if (v == null) return 0;
    if (v < 5)    return 0;
    if (v < 10)   return 3;
    if (v < 15)   return 6;
    if (v < 20)   return 9;
    return 12;
  }

  function scoreEps(v) {
    if (v == null) return 0;
    if (v < 5)    return 0;
    if (v < 10)   return 2;
    if (v < 15)   return 4;
    if (v < 20)   return 5;
    return 7;
  }

  function scoreQoQ(v) {
    if (v == null)  return 0;
    if (v < 0)      return 0;
    if (v < 5)      return 2;
    if (v < 10)     return 4;
    return 6;
  }

  const rev_score = scoreRev(revCagr3yr);
  const eps_score = scoreEps(epsCagr3yr);
  const qoq_score = scoreQoQ(revenueQoQ);
  const total     = rev_score + eps_score + qoq_score;

  return { rev_score, eps_score, qoq_score, total, max: 25 };
}

export function scoreValuation(pe, sectorMedianPE, pb, evEbitda) {
  function scorePE(p, median) {
    if (p == null || p <= 0) return 0;
    const ratio = p / (median || 20);
    if (ratio < 0.75) return 15;
    if (ratio < 1)    return 12;
    if (ratio < 1.5)  return 8;
    if (ratio < 2)    return 3;
    return 0;
  }

  function scorePB(v) {
    if (v == null) return 0;
    if (v > 5)    return 0;
    if (v > 3)    return 2;
    if (v > 2)    return 4;
    if (v >= 1)   return 6;
    return 8;
  }

  function scoreEV(v) {
    if (v == null) return 0;
    if (v > 30)   return 0;
    if (v > 20)   return 1;
    if (v > 15)   return 3;
    if (v > 10)   return 5;
    return 8;
  }

  const pe_score = scorePE(pe, sectorMedianPE);
  const pb_score = scorePB(pb);
  const ev_score = scoreEV(evEbitda);
  const total    = Math.min(pe_score + pb_score + ev_score, 25);

  return { pe_score, pb_score, ev_score, total, max: 25 };
}

export function scoreHealth(debtEquity, interestCoverage, currentRatio, fcfPositiveYears, sector) {
  function scoreDE(v, sec) {
    if (BANK_NBFC_SECTORS.has(sec)) return 6;
    if (v == null) return 4;
    if (v > 3)     return 0;
    if (v > 2)     return 2;
    if (v > 1)     return 5;
    if (v >= 0.5)  return 7;
    return 8;
  }

  function scoreIC(v) {
    if (v == null) return 3;
    if (v < 1.5)   return 0;
    if (v < 3)     return 2;
    if (v < 5)     return 4;
    return 6;
  }

  function scoreCR(v) {
    if (v == null) return 2;
    if (v < 1)     return 0;
    if (v < 1.5)   return 2;
    return 4;
  }

  function scoreFCF(v) {
    if (v == null) return 2;
    if (v === 0)   return 0;
    if (v === 1)   return 1;
    if (v === 2)   return 2;
    return 4; // 3+
  }

  const de_score  = scoreDE(debtEquity, sector);
  const ic_score  = scoreIC(interestCoverage);
  const cr_score  = scoreCR(currentRatio);
  const fcf_score = scoreFCF(fcfPositiveYears);
  const total     = de_score + ic_score + cr_score + fcf_score;

  return { de_score, ic_score, cr_score, fcf_score, total, max: 20 };
}

// ── Composite ────────────────────────────────────────────────────────────────

export function computeComposite(faData) {
  const {
    roe, roce, netMargin,
    revenueCagr3yr, epsCagr3yr, revenueQoQ,
    pe, pb, evEbitda,
    debtEquity, interestCoverage, currentRatio, fcfPositiveYears3yr,
    sector,
  } = faData;

  const sectorMedianPE = getSectorMedianPE(sector);

  const quality   = scoreQuality(roe, roce, netMargin);
  const growth    = scoreGrowth(revenueCagr3yr, epsCagr3yr, revenueQoQ);
  const valuation = scoreValuation(pe, sectorMedianPE, pb, evEbitda);
  const health    = scoreHealth(debtEquity, interestCoverage, currentRatio, fcfPositiveYears3yr, sector);

  const total = quality.total + growth.total + valuation.total + health.total;

  let verdict, verdictColor;
  if (total >= 80) {
    verdict = 'Strong Buy'; verdictColor = '#00C853';
  } else if (total >= 65) {
    verdict = 'Buy';        verdictColor = '#69F0AE';
  } else if (total >= 50) {
    verdict = 'Hold';       verdictColor = '#FFD600';
  } else if (total >= 35) {
    verdict = 'Review';     verdictColor = '#FF6D00';
  } else {
    verdict = 'Avoid';      verdictColor = '#FF1744';
  }

  return { quality, growth, valuation, health, total, verdict, verdictColor };
}

// ── Piotroski F-Score ─────────────────────────────────────────────────────────

export function computePiotroski(faData) {
  const {
    roa, roa_prev,
    operatingCashflow, totalAssets,
    debtEquity, debtEquity_prev,
    currentRatio, currentRatio_prev,
    sharesOutstanding, sharesOutstanding_prev,
    grossMargin, grossMargin_prev,
    assetTurnover, assetTurnover_prev,
    netIncome,
  } = faData;

  const signals = [
    {
      name: 'F1: ROA Positive',
      pass: roa != null && roa > 0,
      description: 'Return on assets is positive',
    },
    {
      name: 'F2: Positive Operating Cash Flow',
      pass: operatingCashflow != null && operatingCashflow > 0,
      description: 'Operating cash flow is positive',
    },
    {
      name: 'F3: ROA Improving',
      pass: roa != null && roa_prev != null && roa > roa_prev,
      description: 'ROA improved year-over-year',
    },
    {
      name: 'F4: Cash Earnings Quality',
      pass: (() => {
        if (operatingCashflow == null || totalAssets == null || totalAssets <= 0 || roa == null) return false;
        return (operatingCashflow / totalAssets) > roa;
      })(),
      description: 'Operating CF / Assets exceeds ROA (accrual quality)',
    },
    {
      name: 'F5: Leverage Decreasing',
      pass: (() => {
        if (debtEquity == null && debtEquity_prev == null) return (debtEquity ?? 0) < 1;
        if (debtEquity_prev == null) return false;
        return debtEquity_prev > debtEquity;
      })(),
      description: 'Debt-to-equity ratio has decreased',
    },
    {
      name: 'F6: Liquidity Improving',
      pass: currentRatio != null && currentRatio_prev != null && currentRatio > currentRatio_prev,
      description: 'Current ratio improved year-over-year',
    },
    {
      name: 'F7: No Share Dilution',
      pass: sharesOutstanding != null && sharesOutstanding_prev != null &&
            sharesOutstanding <= sharesOutstanding_prev * 1.01,
      description: 'No significant new shares issued',
    },
    {
      name: 'F8: Gross Margin Improving',
      pass: grossMargin != null && grossMargin_prev != null && grossMargin > grossMargin_prev,
      description: 'Gross margin improved year-over-year',
    },
    {
      name: 'F9: Asset Turnover Improving',
      pass: assetTurnover != null && assetTurnover_prev != null && assetTurnover > assetTurnover_prev,
      description: 'Asset turnover improved year-over-year',
    },
  ];

  const score = signals.filter(s => s.pass).length;

  let label;
  if (score >= 7)      label = 'Financially Strong';
  else if (score >= 4) label = 'Neutral';
  else                 label = 'Financially Weak';

  return { signals, score, label };
}

// ── Red Flags ─────────────────────────────────────────────────────────────────

export function detectRedFlags(faData) {
  const {
    promoterPledge,
    promoterTrendDelta4q,
    revenueGrowth,
    profitGrowth,
    debtCagr3yr,
    revenueCagr3yr,
    negativeCFOQuarters,
  } = faData;

  const flags = [];

  if (promoterPledge != null && promoterPledge > 20) {
    flags.push({
      flag: 'High Promoter Pledge',
      severity: 'high',
      detail: `${promoterPledge}% pledged`,
    });
  }

  if (promoterTrendDelta4q != null && promoterTrendDelta4q < -2) {
    flags.push({
      flag: 'Promoter Holding Declining',
      severity: 'high',
      detail: `-${Math.abs(promoterTrendDelta4q)}% over 4Q`,
    });
  }

  if (revenueGrowth != null && profitGrowth != null &&
      revenueGrowth > 5 && profitGrowth < -5) {
    flags.push({
      flag: 'Margin Compression',
      severity: 'medium',
      detail: 'Revenue growing, profits shrinking',
    });
  }

  if (debtCagr3yr != null && revenueCagr3yr != null &&
      debtCagr3yr > (revenueCagr3yr + 5) && debtCagr3yr > 10) {
    flags.push({
      flag: 'Debt Growing Faster than Revenue',
      severity: 'high',
      detail: `Debt CAGR ${debtCagr3yr}% vs Rev CAGR ${revenueCagr3yr}%`,
    });
  }

  if (negativeCFOQuarters != null && negativeCFOQuarters >= 2) {
    flags.push({
      flag: 'Negative Operating Cash Flow',
      severity: 'high',
      detail: `${negativeCFOQuarters} consecutive quarters`,
    });
  }

  return flags;
}
