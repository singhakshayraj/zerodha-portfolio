/**
 * Event-driven stock plays engine.
 * Curated historical dataset + scenario-based sector/stock mapping.
 * Brain picks boost individual stock scores when signals align.
 */

export const UPCOMING_EVENTS = [
  {
    id: 'assembly_elections_2026_exit_poll',
    type: 'assembly_election_exit_poll',
    name: '2026 Assembly Elections — Exit Poll Day',
    subtitle: 'West Bengal · Tamil Nadu · Kerala · Assam · Puducherry',
    date: '2026-04-29',
    description: '5-state assembly elections. Last phase (West Bengal Phase 2) ends today. Exit poll embargo lifts 6:30 PM IST.',
    note: 'Exit polls after 6:30 PM IST today. Results May 4. WB outcome is key market driver — BJP vs TMC determines NDA momentum narrative.',
    scenarios: ['bjp_wave', 'split_verdict', 'opposition_sweep'],
    default_scenario: 'bjp_wave'
  },
  {
    id: 'assembly_elections_2026_results',
    type: 'assembly_election_result',
    name: '2026 Assembly Elections — Result Day',
    subtitle: 'West Bengal · Tamil Nadu · Kerala · Assam · Puducherry',
    date: '2026-05-04',
    description: 'Counting day for all 5 states. Market opens at 9:15 AM with early trends already visible.',
    note: 'WB trends typically start 8-9 AM. Market gaps up/down at open based on overnight exit poll reaction.',
    scenarios: ['bjp_wave', 'split_verdict', 'opposition_sweep'],
    default_scenario: 'bjp_wave'
  }
];

export const HISTORICAL_EVENTS = [
  {
    year: 2004, type: 'election_result', outcome: 'Congress surprise win (UPA)',
    nifty_change: -15.0,
    notes: 'BJP-led NDA lost unexpectedly. Lower circuit triggered on BSE/NSE.',
    sector_moves: { 'PSU Banking': -18, 'Infrastructure': -20, 'Defense': -15, 'IT': -12, 'FMCG': -8 }
  },
  {
    year: 2009, type: 'election_result', outcome: 'UPA stronger return',
    nifty_change: +17.3,
    notes: 'UPA returned with stronger mandate. Upper circuit triggered within minutes of opening.',
    sector_moves: { 'PSU Banking': +25, 'Infrastructure': +22, 'Power': +20, 'IT': +10, 'FMCG': +8 }
  },
  {
    year: 2014, type: 'election_result', outcome: 'NDA landslide majority',
    nifty_change: +6.0,
    notes: 'Modi-led BJP won outright majority. PSU, defense, infrastructure themes rallied sharply.',
    sector_moves: { 'Defense': +22, 'Railways': +18, 'PSU Banking': +15, 'Infrastructure': +12, 'Power': +10 }
  },
  {
    year: 2019, type: 'exit_poll', outcome: 'NDA predicted strong',
    nifty_change: +0.8,
    notes: 'Exit polls showed NDA lead. Mild pre-result rally on Monday after polling ended Sunday.',
    sector_moves: { 'Defense': +4, 'Railways': +5, 'PSU Banking': +3, 'Infrastructure': +2 }
  },
  {
    year: 2019, type: 'election_result', outcome: 'NDA stronger return (303 seats)',
    nifty_change: +3.8,
    notes: 'BJP returned with larger majority than 2014. Continuation rally across PSU themes.',
    sector_moves: { 'Railways': +15, 'Defense': +12, 'PSU Banking': +8, 'Infrastructure': +7, 'Power': +6 }
  },
  {
    year: 2024, type: 'exit_poll', outcome: 'NDA predicted strong sweep (370+ seats)',
    nifty_change: +3.5,
    notes: 'Exit polls predicted NDA sweep. Massive pre-result rally. PSU/defense/railways surged.',
    sector_moves: { 'Railways': +10, 'Defense': +8, 'PSU Banking': +6, 'Infrastructure': +5, 'Power': +4 }
  },
  {
    year: 2024, type: 'election_result', outcome: 'NDA below outright majority (240 seats)',
    nifty_change: -5.9,
    notes: 'NDA fell short. Sharp PSU/infra reversal of exit-poll gains. Recovered +8% over next 3 days.',
    sector_moves: { 'Railways': -22, 'Defense': -20, 'PSU Banking': -15, 'Infrastructure': -12, 'Power': -10 },
    recovery_3d: +8.0
  },

  // ── 2026 State Assembly Elections ─────────────────────────────────────────
  {
    year: 2021, type: 'assembly_election_result', outcome: 'TMC landslide in West Bengal (BJP routed)',
    nifty_change: -0.4,
    notes: 'BJP failed to capture WB despite massive campaign. Nifty mildly negative. PSU/infra themes sold off intraday on NDA setback narrative.',
    sector_moves: { 'PSU Banking': -3, 'Defense': -2, 'Infrastructure': -2, 'FMCG': +1, 'IT': +0.5 }
  },
  {
    year: 2021, type: 'assembly_election_result', outcome: 'LDF retains Kerala; DMK wins Tamil Nadu; BJP retains Assam',
    nifty_change: +0.6,
    notes: 'Mixed bag: BJP retaining Assam offset TMC/LDF wins. Market traded flat with slight positive.',
    sector_moves: { 'PSU Banking': +1, 'FMCG': +2, 'IT': +1, 'Infrastructure': -1 }
  },
  {
    year: 2016, type: 'assembly_election_result', outcome: 'AIADMK retains Tamil Nadu; Left retains Kerala; BJP wins Assam',
    nifty_change: +0.3,
    notes: 'BJP winning Assam (first time) was a positive NDA signal. Nifty mildly positive.',
    sector_moves: { 'PSU Banking': +2, 'Infrastructure': +1, 'FMCG': +1 }
  },
  {
    year: 2011, type: 'assembly_election_result', outcome: 'TMC defeats Left in WB after 34 years; DMK loses TN',
    nifty_change: +0.8,
    notes: 'Change wave in WB seen as reform-positive. TMC replacing Left seen as opening for private investment.',
    sector_moves: { 'Infrastructure': +3, 'Banking': +2, 'Power': +2 }
  }
];

export const SCENARIO_PLAYS = {
  // ── 2026 State Assembly Election scenarios ─────────────────────────────────
  bjp_wave: {
    label: 'BJP Wave — Wins WB + Retains Assam',
    bias: 'bullish',
    market_tone: 'NDA momentum signal. WB BJP win = rare milestone. PSU/capex/defense rally on NDA dominance narrative.',
    sectors: [
      {
        name: 'PSU Banking',
        avg_move: 8, confidence: 'high',
        rationale: 'BJP WB win = NDA political capital → PSU bank recapitalization continuity, credit growth push',
        stocks: [
          { symbol: 'SBIN',       name: 'State Bank of India',  avg_move: 8  },
          { symbol: 'PNB',        name: 'Punjab National Bank', avg_move: 10 },
          { symbol: 'BANKBARODA', name: 'Bank of Baroda',       avg_move: 9  },
          { symbol: 'CANBK',      name: 'Canara Bank',          avg_move: 10 },
          { symbol: 'UNIONBANK',  name: 'Union Bank of India',  avg_move: 11 }
        ]
      },
      {
        name: 'Defense & PSU Aerospace',
        avg_move: 10, confidence: 'high',
        rationale: 'BJP political dominance → defense capex acceleration, Make in India push',
        stocks: [
          { symbol: 'HAL',        name: 'Hindustan Aeronautics',    avg_move: 12 },
          { symbol: 'BEL',        name: 'Bharat Electronics',        avg_move: 10 },
          { symbol: 'BEML',       name: 'BEML Ltd',                  avg_move: 11 },
          { symbol: 'COCHINSHIP', name: 'Cochin Shipyard',           avg_move: 14 },
          { symbol: 'MAZDOCK',    name: 'Mazagon Dock',              avg_move: 13 }
        ]
      },
      {
        name: 'Infrastructure & Capex',
        avg_move: 7, confidence: 'medium',
        rationale: 'BJP WB win unlocks infra investment in eastern India corridor (industrial belt)',
        stocks: [
          { symbol: 'RVNL',    name: 'Rail Vikas Nigam',    avg_move: 10 },
          { symbol: 'IRFC',    name: 'Indian Railway Finance',avg_move: 7 },
          { symbol: 'NTPC',    name: 'NTPC',                 avg_move: 6  },
          { symbol: 'NBCC',    name: 'NBCC India',           avg_move: 8  },
          { symbol: 'LT',      name: 'Larsen & Toubro',      avg_move: 6  }
        ]
      }
    ]
  },

  split_verdict: {
    label: 'Split Verdict — TMC holds WB, BJP retains Assam',
    bias: 'mixed',
    market_tone: 'Status quo. No clear NDA momentum. Private sector holds up; PSU themes drift.',
    sectors: [
      {
        name: 'Private Banking',
        avg_move: 2, confidence: 'medium',
        rationale: 'Split verdict = policy continuity, no strong political signal either way',
        stocks: [
          { symbol: 'HDFCBANK', name: 'HDFC Bank',  avg_move: 2 },
          { symbol: 'ICICIBANK',name: 'ICICI Bank', avg_move: 3 },
          { symbol: 'KOTAKBANK',name: 'Kotak Bank', avg_move: 2 },
          { symbol: 'AXISBANK', name: 'Axis Bank',  avg_move: 3 }
        ]
      },
      {
        name: 'FMCG',
        avg_move: 2, confidence: 'medium',
        rationale: 'Consumption-driven state outcomes (TN/Kerala/WB) signal rural demand hold',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',      avg_move: 2 },
          { symbol: 'ITC',        name: 'ITC',       avg_move: 3 },
          { symbol: 'NESTLEIND',  name: 'Nestle',    avg_move: 2 },
          { symbol: 'BRITANNIA',  name: 'Britannia', avg_move: 2 }
        ]
      },
      {
        name: 'IT Services',
        avg_move: 1, confidence: 'low',
        rationale: 'Neutral to state elections; USD earners. Hold through political noise.',
        stocks: [
          { symbol: 'TCS',     name: 'TCS',      avg_move: 1 },
          { symbol: 'INFY',    name: 'Infosys',  avg_move: 2 },
          { symbol: 'WIPRO',   name: 'Wipro',    avg_move: 1 },
          { symbol: 'HCLTECH', name: 'HCL Tech', avg_move: 2 }
        ]
      }
    ]
  },

  opposition_sweep: {
    label: 'Opposition Sweep — TMC WB, DMK TN, LDF Kerala',
    bias: 'bearish',
    market_tone: 'NDA political setback. PSU/capex themes sell off. Opposition momentum narrative weighs.',
    sectors: [
      {
        name: 'FMCG',
        avg_move: -1, confidence: 'medium',
        rationale: 'Least affected by political outcome. Consumption demand state-policy agnostic.',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',       avg_move: -1 },
          { symbol: 'ITC',        name: 'ITC',        avg_move: -1 },
          { symbol: 'NESTLEIND',  name: 'Nestle',     avg_move: 0  },
          { symbol: 'BRITANNIA',  name: 'Britannia',  avg_move: -1 }
        ]
      },
      {
        name: 'IT Services',
        avg_move: -1, confidence: 'low',
        rationale: 'USD earners, domestic-policy insulated. Slight INR depreciation tailwind.',
        stocks: [
          { symbol: 'TCS',      name: 'TCS',       avg_move: -1 },
          { symbol: 'INFY',     name: 'Infosys',   avg_move: -1 },
          { symbol: 'WIPRO',    name: 'Wipro',     avg_move: -1 },
          { symbol: 'HCLTECH',  name: 'HCL Tech',  avg_move: -1 }
        ]
      },
      {
        name: 'Pharma',
        avg_move: -1, confidence: 'low',
        rationale: 'Defensive. Export-heavy = INR hedge on political uncertainty.',
        stocks: [
          { symbol: 'SUNPHARMA', name: 'Sun Pharma',  avg_move: 0  },
          { symbol: 'DRREDDY',   name: 'Dr Reddy\'s', avg_move: -1 },
          { symbol: 'CIPLA',     name: 'Cipla',       avg_move: -1 },
          { symbol: 'DIVISLAB',  name: 'Divi\'s Labs',avg_move: 0  }
        ]
      }
    ]
  },

  // ── General Election scenarios (kept for future use) ──────────────────────
  nda_strong: {
    label: 'NDA Strong Win (300+ seats)',
    bias: 'bullish',
    market_tone: 'PSU/infra/defense rally. Private sector neutral. Continuity trade.',
    sectors: [
      {
        name: 'Defense & PSU Aerospace',
        avg_move: 18, confidence: 'high',
        rationale: 'Defense capex acceleration, Make in India, multi-year order pipeline',
        stocks: [
          { symbol: 'HAL',        name: 'Hindustan Aeronautics',      avg_move: 22 },
          { symbol: 'BEL',        name: 'Bharat Electronics',          avg_move: 18 },
          { symbol: 'BEML',       name: 'BEML Ltd',                    avg_move: 20 },
          { symbol: 'COCHINSHIP', name: 'Cochin Shipyard',             avg_move: 25 },
          { symbol: 'MAZDOCK',    name: 'Mazagon Dock',                avg_move: 22 },
          { symbol: 'GRSE',       name: 'Garden Reach Shipbuilders',   avg_move: 20 }
        ]
      },
      {
        name: 'Railways & Infrastructure',
        avg_move: 20, confidence: 'high',
        rationale: 'Continued rail capex, station redevelopment, bullet train, freight corridor',
        stocks: [
          { symbol: 'RVNL',      name: 'Rail Vikas Nigam',        avg_move: 25 },
          { symbol: 'IRFC',      name: 'Indian Railway Finance',   avg_move: 18 },
          { symbol: 'IRCTC',     name: 'IRCTC',                    avg_move: 12 },
          { symbol: 'RAILTEL',   name: 'RailTel Corp',             avg_move: 20 },
          { symbol: 'TITAGARH',  name: 'Titagarh Rail Systems',   avg_move: 22 }
        ]
      },
      {
        name: 'PSU Banking',
        avg_move: 12, confidence: 'high',
        rationale: 'Govt capex drives credit growth, PSU bank recapitalization continuity',
        stocks: [
          { symbol: 'SBIN',       name: 'State Bank of India',   avg_move: 12 },
          { symbol: 'PNB',        name: 'Punjab National Bank',  avg_move: 15 },
          { symbol: 'BANKBARODA', name: 'Bank of Baroda',        avg_move: 14 },
          { symbol: 'CANBK',      name: 'Canara Bank',           avg_move: 15 },
          { symbol: 'UNIONBANK',  name: 'Union Bank of India',   avg_move: 16 }
        ]
      },
      {
        name: 'Power & Renewables',
        avg_move: 10, confidence: 'medium',
        rationale: '500 GW renewable target, grid modernization, green hydrogen push',
        stocks: [
          { symbol: 'NTPC',      name: 'NTPC',              avg_move: 8  },
          { symbol: 'POWERGRID', name: 'Power Grid Corp',   avg_move: 8  },
          { symbol: 'NHPC',      name: 'NHPC',              avg_move: 12 },
          { symbol: 'SJVN',      name: 'SJVN',              avg_move: 14 },
          { symbol: 'RECLTD',    name: 'REC Ltd',           avg_move: 12 },
          { symbol: 'PFC',       name: 'Power Finance Corp',avg_move: 12 }
        ]
      }
    ]
  },

  nda_weak: {
    label: 'NDA Weak / Coalition (240–270 seats)',
    bias: 'mixed',
    market_tone: 'PSU themes sell off. Private sector outperforms. Policy uncertainty premium.',
    sectors: [
      {
        name: 'Private Banking',
        avg_move: 4, confidence: 'medium',
        rationale: 'Coalition = slower PSU capex, private banks more insulated from policy noise',
        stocks: [
          { symbol: 'HDFCBANK', name: 'HDFC Bank',   avg_move: 4 },
          { symbol: 'ICICIBANK',name: 'ICICI Bank',  avg_move: 5 },
          { symbol: 'KOTAKBANK',name: 'Kotak Bank',  avg_move: 4 },
          { symbol: 'AXISBANK', name: 'Axis Bank',   avg_move: 5 }
        ]
      },
      {
        name: 'FMCG',
        avg_move: 3, confidence: 'medium',
        rationale: 'Coalition govts tend toward consumption/welfare spending; FMCG defensive',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',       avg_move: 3 },
          { symbol: 'ITC',        name: 'ITC',        avg_move: 4 },
          { symbol: 'NESTLEIND',  name: 'Nestle',     avg_move: 2 },
          { symbol: 'BRITANNIA',  name: 'Britannia',  avg_move: 3 }
        ]
      },
      {
        name: 'IT Services',
        avg_move: 2, confidence: 'low',
        rationale: 'USD earners; insulated from domestic policy. Coalition = INR stability.',
        stocks: [
          { symbol: 'TCS',     name: 'TCS',      avg_move: 2 },
          { symbol: 'INFY',    name: 'Infosys',  avg_move: 3 },
          { symbol: 'WIPRO',   name: 'Wipro',    avg_move: 2 },
          { symbol: 'HCLTECH', name: 'HCL Tech', avg_move: 3 }
        ]
      }
    ]
  },

  hung_parliament: {
    label: 'Hung Parliament (<240 seats, no clear majority)',
    bias: 'bearish',
    market_tone: 'Risk-off across the board. Defensives least hit. PSU/infra sharp sell-off.',
    sectors: [
      {
        name: 'FMCG',
        avg_move: -2, confidence: 'medium',
        rationale: 'Least politically sensitive. Consumption demand unaffected by political outcome.',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',       avg_move: -1 },
          { symbol: 'ITC',        name: 'ITC',        avg_move: -2 },
          { symbol: 'NESTLEIND',  name: 'Nestle',     avg_move: -1 },
          { symbol: 'BRITANNIA',  name: 'Britannia',  avg_move: -2 }
        ]
      },
      {
        name: 'IT Services',
        avg_move: -3, confidence: 'low',
        rationale: 'USD earners. Political uncertainty triggers INR depreciation, slight tailwind.',
        stocks: [
          { symbol: 'TCS',      name: 'TCS',       avg_move: -2 },
          { symbol: 'INFY',     name: 'Infosys',   avg_move: -3 },
          { symbol: 'WIPRO',    name: 'Wipro',     avg_move: -3 },
          { symbol: 'HCLTECH',  name: 'HCL Tech',  avg_move: -2 }
        ]
      },
      {
        name: 'Pharma',
        avg_move: -2, confidence: 'low',
        rationale: 'Defensive sector; domestic policy agnostic. Export-heavy = INR hedge.',
        stocks: [
          { symbol: 'SUNPHARMA',  name: 'Sun Pharma',   avg_move: -1 },
          { symbol: 'DRREDDY',    name: 'Dr Reddy\'s',  avg_move: -2 },
          { symbol: 'CIPLA',      name: 'Cipla',        avg_move: -2 },
          { symbol: 'DIVISLAB',   name: 'Divi\'s Labs', avg_move: -1 }
        ]
      }
    ]
  }
};

/**
 * Returns soonest upcoming event from calendar.
 */
export function getActiveEvent() {
  const now = new Date();
  return UPCOMING_EVENTS
    .filter(e => new Date(e.date) >= new Date(now.toISOString().slice(0, 10)))
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || UPCOMING_EVENTS[0];
}

/**
 * Returns top 3 sectors + top 10 stocks for given scenario, boosted by brain picks.
 * Pure function — no side effects.
 */
export function getEventPlays(brainResult, scenario = 'nda_strong') {
  const plays = SCENARIO_PLAYS[scenario] || SCENARIO_PLAYS.nda_strong;
  const brainPickMap = {};
  for (const pick of (brainResult?.picks || [])) {
    brainPickMap[pick.symbol] = pick;
  }

  const top3Sectors = plays.sectors.slice(0, 3).map(sector => {
    const enrichedStocks = sector.stocks.map(s => {
      const brainPick = brainPickMap[s.symbol] || null;
      const brainBoost = brainPick ? brainPick.score * 2 : 0;
      return {
        ...s,
        brain_pick: brainPick,
        conviction: brainPick ? 'high' : sector.confidence === 'high' ? 'medium' : 'low',
        final_score: s.avg_move + brainBoost
      };
    }).sort((a, b) => Math.abs(b.final_score) - Math.abs(a.final_score));

    return { ...sector, stocks: enrichedStocks };
  });

  const top10 = top3Sectors
    .flatMap(s => s.stocks.map(st => ({ ...st, sector: s.name })))
    .sort((a, b) => Math.abs(b.final_score) - Math.abs(a.final_score))
    .slice(0, 10);

  const brainAligned = top10.filter(s => s.brain_pick).length;

  return {
    scenario,
    scenario_label: plays.label,
    bias: plays.bias,
    market_tone: plays.market_tone,
    top3Sectors,
    top10,
    historical_events: HISTORICAL_EVENTS,
    meta: {
      total_stocks_evaluated: plays.sectors.slice(0, 3).reduce((n, s) => n + s.stocks.length, 0),
      brain_aligned: brainAligned,
      brain_picks_total: (brainResult?.picks || []).length,
      generated_at: new Date().toISOString()
    }
  };
}
