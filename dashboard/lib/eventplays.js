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
    market_tone: 'NDA momentum signal. WB BJP win = rare milestone. PSU/capex/defense/Adani rally on NDA dominance narrative.',
    event_context: 'BJP wins West Bengal 2026 state assembly election, NDA retains Assam — strongest BJP political signal since 2019 general election. Expect PSU bank recapitalization, defense capex, infra spending continuity, and Adani group political tailwind.',
    sectors: [
      {
        name: 'Defense & PSU Aerospace',
        avg_move: 12, confidence: 'high',
        rationale: 'BJP political dominance → defense capex acceleration, Make in India orders, shipbuilding pipeline',
        stocks: [
          { symbol: 'HAL',        name: 'Hindustan Aeronautics',    avg_move: 14 },
          { symbol: 'BEL',        name: 'Bharat Electronics',        avg_move: 11 },
          { symbol: 'BEML',       name: 'BEML Ltd',                  avg_move: 13 },
          { symbol: 'COCHINSHIP', name: 'Cochin Shipyard',           avg_move: 16 },
          { symbol: 'MAZDOCK',    name: 'Mazagon Dock',              avg_move: 15 },
          { symbol: 'GRSE',       name: 'Garden Reach Shipbuilders', avg_move: 14 },
          { symbol: 'BDL',        name: 'Bharat Dynamics',           avg_move: 12 },
          { symbol: 'MIDHANI',    name: 'Mishra Dhatu Nigam',        avg_move: 10 },
          { symbol: 'PARAS',      name: 'Paras Defence',             avg_move: 13 },
          { symbol: 'AVANTEL',    name: 'Avantel Ltd',               avg_move: 11 }
        ]
      },
      {
        name: 'Adani Group',
        avg_move: 14, confidence: 'high',
        rationale: 'Adani Group perceived as NDA-aligned conglomerate. BJP political dominance = project approvals, port concessions, airport expansions, green energy bids',
        stocks: [
          { symbol: 'ADANIPORTS',  name: 'Adani Ports & SEZ',      avg_move: 14 },
          { symbol: 'ADANIENT',    name: 'Adani Enterprises',       avg_move: 16 },
          { symbol: 'ADANIGREEN',  name: 'Adani Green Energy',      avg_move: 18 },
          { symbol: 'ADANIPOWER',  name: 'Adani Power',             avg_move: 15 },
          { symbol: 'ACC',         name: 'ACC Ltd (Adani)',         avg_move: 10 },
          { symbol: 'AMBUJACEMENT',name: 'Ambuja Cements (Adani)', avg_move: 10 },
          { symbol: 'ADANIENSOL',  name: 'Adani Energy Solutions',  avg_move: 14 },
          { symbol: 'ADANIGAS',    name: 'Adani Total Gas',         avg_move: 12 },
          { symbol: 'NDTV',        name: 'NDTV (Adani)',            avg_move: 8  }
        ]
      },
      {
        name: 'PSU Banking',
        avg_move: 9, confidence: 'high',
        rationale: 'BJP NDA political capital → PSU bank recapitalization continuity, infrastructure credit growth',
        stocks: [
          { symbol: 'SBIN',       name: 'State Bank of India',     avg_move: 9  },
          { symbol: 'PNB',        name: 'Punjab National Bank',    avg_move: 11 },
          { symbol: 'BANKBARODA', name: 'Bank of Baroda',          avg_move: 10 },
          { symbol: 'CANBK',      name: 'Canara Bank',             avg_move: 11 },
          { symbol: 'UNIONBANK',  name: 'Union Bank of India',     avg_move: 12 },
          { symbol: 'CENTRALBK',  name: 'Central Bank of India',   avg_move: 13 },
          { symbol: 'INDIANB',    name: 'Indian Bank',             avg_move: 10 },
          { symbol: 'BANKINDIA',  name: 'Bank of India',           avg_move: 11 },
          { symbol: 'UCO',        name: 'UCO Bank',                avg_move: 12 },
          { symbol: 'MAHABANK',   name: 'Bank of Maharashtra',     avg_move: 12 }
        ]
      },
      {
        name: 'Infrastructure & Railways',
        avg_move: 8, confidence: 'medium',
        rationale: 'BJP WB win unlocks infra investment in eastern India corridor; rail capex, port connectivity, power grid',
        stocks: [
          { symbol: 'RVNL',      name: 'Rail Vikas Nigam',         avg_move: 12 },
          { symbol: 'IRFC',      name: 'Indian Railway Finance',   avg_move: 8  },
          { symbol: 'IRCTC',     name: 'IRCTC',                    avg_move: 7  },
          { symbol: 'NBCC',      name: 'NBCC India',               avg_move: 9  },
          { symbol: 'IRCON',     name: 'IRCON International',      avg_move: 10 },
          { symbol: 'HUDCO',     name: 'HUDCO',                    avg_move: 9  },
          { symbol: 'ENGINERSIN',name: 'Engineers India',          avg_move: 8  },
          { symbol: 'RITES',     name: 'RITES Ltd',                avg_move: 9  },
          { symbol: 'RAILTEL',   name: 'RailTel Corp',             avg_move: 10 },
          { symbol: 'LT',        name: 'Larsen & Toubro',          avg_move: 7  }
        ]
      }
    ]
  },

  split_verdict: {
    label: 'Split Verdict — TMC holds WB, BJP retains Assam',
    bias: 'mixed',
    market_tone: 'Status quo. No NDA momentum signal. Private sector outperforms; PSU themes drift; Adani consolidates.',
    event_context: 'Mixed outcome in 2026 state elections — TMC retains West Bengal, BJP retains Assam, DMK/LDF win their states. No strong political signal either way. Markets trade policy continuity without NDA excitement premium.',
    sectors: [
      {
        name: 'Private Banking',
        avg_move: 3, confidence: 'medium',
        rationale: 'Split verdict = policy continuity, no PSU credit-growth push, private banks relatively insulated',
        stocks: [
          { symbol: 'HDFCBANK',    name: 'HDFC Bank',         avg_move: 3 },
          { symbol: 'ICICIBANK',   name: 'ICICI Bank',        avg_move: 4 },
          { symbol: 'KOTAKBANK',   name: 'Kotak Mahindra',    avg_move: 3 },
          { symbol: 'AXISBANK',    name: 'Axis Bank',         avg_move: 4 },
          { symbol: 'INDUSINDBK',  name: 'IndusInd Bank',     avg_move: 3 },
          { symbol: 'FEDERALBNK',  name: 'Federal Bank',      avg_move: 3 },
          { symbol: 'IDFCFIRSTB',  name: 'IDFC First Bank',   avg_move: 4 },
          { symbol: 'BANDHANBNK',  name: 'Bandhan Bank',      avg_move: 5 },
          { symbol: 'CSBBANK',     name: 'CSB Bank',          avg_move: 3 }
        ]
      },
      {
        name: 'FMCG',
        avg_move: 2, confidence: 'medium',
        rationale: 'Consumption-driven state wins (TN/Kerala/WB by opp.) signal rural demand hold; welfare spending likely',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',           avg_move: 2 },
          { symbol: 'ITC',        name: 'ITC',            avg_move: 3 },
          { symbol: 'NESTLEIND',  name: 'Nestle India',   avg_move: 2 },
          { symbol: 'BRITANNIA',  name: 'Britannia',      avg_move: 2 },
          { symbol: 'DABUR',      name: 'Dabur India',    avg_move: 3 },
          { symbol: 'GODREJCP',   name: 'Godrej Consumer',avg_move: 2 },
          { symbol: 'MARICO',     name: 'Marico',         avg_move: 2 },
          { symbol: 'EMAMILTD',   name: 'Emami Ltd',      avg_move: 3 },
          { symbol: 'COLPAL',     name: 'Colgate-Palmolive', avg_move: 2 }
        ]
      },
      {
        name: 'IT Services',
        avg_move: 2, confidence: 'low',
        rationale: 'USD earners, domestic-politics neutral. Mixed mandate = INR stability; steady hold',
        stocks: [
          { symbol: 'TCS',        name: 'TCS',            avg_move: 2 },
          { symbol: 'INFY',       name: 'Infosys',        avg_move: 3 },
          { symbol: 'WIPRO',      name: 'Wipro',          avg_move: 2 },
          { symbol: 'HCLTECH',    name: 'HCL Technologies',avg_move: 3 },
          { symbol: 'TECHM',      name: 'Tech Mahindra',  avg_move: 2 },
          { symbol: 'LTIM',       name: 'LTIMindtree',    avg_move: 3 },
          { symbol: 'MPHASIS',    name: 'Mphasis',        avg_move: 3 },
          { symbol: 'PERSISTENT', name: 'Persistent Sys', avg_move: 3 },
          { symbol: 'COFORGE',    name: 'Coforge',        avg_move: 3 }
        ]
      }
    ]
  },

  opposition_sweep: {
    label: 'Opposition Sweep — TMC WB, DMK TN, LDF Kerala',
    bias: 'bearish',
    market_tone: 'NDA political setback. PSU/capex/Adani sell off sharply. Defensives least hit.',
    event_context: 'Opposition wins all key states in 2026 elections — TMC retains WB decisively, DMK wins TN, LDF wins Kerala. NDA narrative broken. Markets price in policy uncertainty, slower PSU capex, Adani project risk premium.',
    sectors: [
      {
        name: 'FMCG',
        avg_move: -1, confidence: 'medium',
        rationale: 'Least politically sensitive. Consumption demand state-policy agnostic. Relative outperformer in sell-off',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',             avg_move: -1 },
          { symbol: 'ITC',        name: 'ITC',              avg_move: -1 },
          { symbol: 'NESTLEIND',  name: 'Nestle India',     avg_move:  0 },
          { symbol: 'BRITANNIA',  name: 'Britannia',        avg_move: -1 },
          { symbol: 'DABUR',      name: 'Dabur India',      avg_move: -1 },
          { symbol: 'GODREJCP',   name: 'Godrej Consumer',  avg_move: -1 },
          { symbol: 'MARICO',     name: 'Marico',           avg_move: -1 },
          { symbol: 'EMAMILTD',   name: 'Emami Ltd',        avg_move:  0 },
          { symbol: 'COLPAL',     name: 'Colgate-Palmolive',avg_move:  0 }
        ]
      },
      {
        name: 'IT Services',
        avg_move: -2, confidence: 'low',
        rationale: 'USD earners, insulated. INR depreciation on political uncertainty = slight tailwind but risk-off drags',
        stocks: [
          { symbol: 'TCS',        name: 'TCS',             avg_move: -1 },
          { symbol: 'INFY',       name: 'Infosys',         avg_move: -2 },
          { symbol: 'WIPRO',      name: 'Wipro',           avg_move: -2 },
          { symbol: 'HCLTECH',    name: 'HCL Technologies',avg_move: -1 },
          { symbol: 'TECHM',      name: 'Tech Mahindra',   avg_move: -2 },
          { symbol: 'LTIM',       name: 'LTIMindtree',     avg_move: -2 },
          { symbol: 'MPHASIS',    name: 'Mphasis',         avg_move: -2 },
          { symbol: 'PERSISTENT', name: 'Persistent Sys',  avg_move: -2 },
          { symbol: 'COFORGE',    name: 'Coforge',         avg_move: -3 }
        ]
      },
      {
        name: 'Pharma',
        avg_move: -1, confidence: 'low',
        rationale: 'Defensive export-heavy sector. INR depreciation hedge. Outperforms relative to PSU/infra in sell-off',
        stocks: [
          { symbol: 'SUNPHARMA',  name: 'Sun Pharma',      avg_move:  0 },
          { symbol: 'DRREDDY',    name: 'Dr Reddy\'s',     avg_move: -1 },
          { symbol: 'CIPLA',      name: 'Cipla',           avg_move: -1 },
          { symbol: 'DIVISLAB',   name: 'Divi\'s Labs',    avg_move:  0 },
          { symbol: 'LUPIN',      name: 'Lupin',           avg_move: -1 },
          { symbol: 'TORNTPHARM', name: 'Torrent Pharma',  avg_move: -1 },
          { symbol: 'BIOCON',     name: 'Biocon',          avg_move: -2 },
          { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma',avg_move: -1 },
          { symbol: 'ALKEM',      name: 'Alkem Labs',      avg_move:  0 }
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
 * Composite scorer — 3-factor weighted score.
 *
 * Factor 1 — Historical (40%): avg_move normalized to 0-10 scale (25% move = max)
 * Factor 2 — LLM Event Score (35%): 0-10, injected post-render via event_stock_analysis API
 * Factor 3 — Brain Pick (25%): brain.score (0-10), 0 if no active brain pick
 *
 * final_score = (hist_norm * 0.40) + (llm_norm * 0.35) + (brain_norm * 0.25)
 * Signed by avg_move direction — bearish stocks stay negative.
 */
export function computeCompositeScore(avg_move, brainScore = 0, llmScore = null) {
  const hist_norm = Math.min(Math.abs(avg_move) / 25, 1) * 10;
  const llm_norm  = llmScore !== null ? Math.min(Math.max(llmScore, 0), 10) : hist_norm; // fallback to hist if no LLM
  const brain_norm = Math.min(Math.max(brainScore, 0), 10);
  const raw = (hist_norm * 0.40) + (llm_norm * 0.35) + (brain_norm * 0.25);
  return Math.sign(avg_move || 1) * raw;
}

/**
 * Returns top 3 sectors + top 10 stocks for given scenario, boosted by brain picks.
 * LLM event scores are injected client-side after initial render (async enrichment).
 * Pure function — no side effects.
 */
export function getEventPlays(brainResult, scenario = 'bjp_wave') {
  const plays = SCENARIO_PLAYS[scenario] || SCENARIO_PLAYS.bjp_wave;
  const brainPickMap = {};
  for (const pick of (brainResult?.picks || [])) {
    brainPickMap[pick.symbol] = pick;
  }

  const top3Sectors = plays.sectors.slice(0, 3).map(sector => {
    const enrichedStocks = sector.stocks.map(s => {
      const brainPick = brainPickMap[s.symbol] || null;
      const brainScore = brainPick ? brainPick.score : 0;
      const composite = computeCompositeScore(s.avg_move, brainScore, null);
      return {
        ...s,
        brain_pick: brainPick,
        conviction: brainPick ? 'high' : sector.confidence === 'high' ? 'medium' : 'low',
        composite_score: composite,       // 3-factor score (LLM pending)
        final_score: composite,           // updated client-side when LLM scores arrive
        llm_score: null,                  // filled by event_stock_analysis response
        llm_verdict: null,
        llm_reason: null
      };
    }).sort((a, b) => Math.abs(b.composite_score) - Math.abs(a.composite_score));

    return { ...sector, stocks: enrichedStocks };
  });

  const top10 = top3Sectors
    .flatMap(s => s.stocks.map(st => ({ ...st, sector: s.name })))
    .sort((a, b) => Math.abs(b.composite_score) - Math.abs(a.composite_score))
    .slice(0, 10);

  const brainAligned = top10.filter(s => s.brain_pick).length;

  return {
    scenario,
    scenario_label: plays.label,
    bias: plays.bias,
    market_tone: plays.market_tone,
    event_context: plays.event_context || '',
    top3Sectors,
    top10,
    historical_events: HISTORICAL_EVENTS,
    meta: {
      total_stocks_evaluated: plays.sectors.slice(0, 3).reduce((n, s) => n + s.stocks.length, 0),
      brain_aligned: brainAligned,
      brain_picks_total: (brainResult?.picks || []).length,
      scoring: { hist: 0.40, llm: 0.35, brain: 0.25 },
      generated_at: new Date().toISOString()
    }
  };
}
