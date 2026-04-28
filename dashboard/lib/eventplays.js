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

// General election history (national level) — separate from state elections
export const HISTORICAL_GENERAL_ELECTIONS = [
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
    year: 2019, type: 'exit_poll', outcome: 'NDA predicted strong (pre-result)',
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
    year: 2024, type: 'exit_poll', outcome: 'NDA predicted sweep (370+ seats, wrong)',
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
  }
];

// State assembly election history — separate table
export const HISTORICAL_STATE_ELECTIONS = [
  {
    year: 2011, type: 'assembly_election_result', outcome: 'TMC defeats Left in WB after 34 years; DMK loses TN',
    nifty_change: +0.8,
    notes: 'Change wave in WB seen as reform-positive. TMC replacing Left seen as opening for private investment.',
    sector_moves: { 'Infrastructure': +3, 'Banking': +2, 'Power': +2 }
  },
  {
    year: 2016, type: 'assembly_election_result', outcome: 'AIADMK retains TN; Left retains Kerala; BJP wins Assam',
    nifty_change: +0.3,
    notes: 'BJP winning Assam (first time) was a positive NDA signal. Nifty mildly positive.',
    sector_moves: { 'PSU Banking': +2, 'Infrastructure': +1, 'FMCG': +1 }
  },
  {
    year: 2021, type: 'assembly_election_result', outcome: 'TMC landslide in WB; BJP routed despite massive campaign',
    nifty_change: -0.4,
    notes: 'BJP failed to capture WB. Nifty mildly negative. PSU/infra sold off intraday on NDA setback narrative.',
    sector_moves: { 'PSU Banking': -3, 'Defense': -2, 'Infrastructure': -2, 'FMCG': +1, 'Adani': -4 }
  },
  {
    year: 2021, type: 'assembly_election_result', outcome: 'LDF retains Kerala; DMK wins TN; BJP retains Assam',
    nifty_change: +0.6,
    notes: 'Mixed bag: BJP retaining Assam offset TMC/LDF wins. Market traded flat with slight positive.',
    sector_moves: { 'PSU Banking': +1, 'FMCG': +2, 'IT': +1, 'Infrastructure': -1 }
  }
];

// Combined for backward compat (used in API response)
export const HISTORICAL_EVENTS = [...HISTORICAL_GENERAL_ELECTIONS, ...HISTORICAL_STATE_ELECTIONS];

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
          { symbol: 'HAL',        name: 'Hindustan Aeronautics',    avg_move: 14, rationale: 'Primary aircraft manufacturer; fighter jet and helicopter orders accelerate under BJP defense capex push.' },
          { symbol: 'BEL',        name: 'Bharat Electronics',        avg_move: 11, rationale: 'Electronics backbone of defense modernization — radar, communication systems, missile electronics.' },
          { symbol: 'BEML',       name: 'BEML Ltd',                  avg_move: 13, rationale: 'Mining + rail + defense equipment; govt order pipeline highest in BJP-led periods.' },
          { symbol: 'COCHINSHIP', name: 'Cochin Shipyard',           avg_move: 16, rationale: 'Warship construction; INS-class frigates/destroyers; Make in India naval flagship.' },
          { symbol: 'MAZDOCK',    name: 'Mazagon Dock',              avg_move: 15, rationale: 'Submarine and warship maker; strategic priority under BJP self-reliance doctrine.' },
          { symbol: 'GRSE',       name: 'Garden Reach Shipbuilders', avg_move: 14, rationale: 'Inland + coastal patrol vessels; Navy 100-ship program beneficiary.' },
          { symbol: 'BDL',        name: 'Bharat Dynamics',           avg_move: 12, rationale: 'Guided missiles and torpedo systems; Astra MK-2, QRSAM missile programs direct beneficiary.' },
          { symbol: 'MIDHANI',    name: 'Mishra Dhatu Nigam',        avg_move: 10, rationale: 'Specialty alloys for aerospace and defense; critical input for HAL, BEL, DRDO projects.' },
          { symbol: 'PARAS',      name: 'Paras Defence',             avg_move: 13, rationale: 'Defense electronics; drone detection and counter-UAV systems; fast-growing order book.' }
        ]
      },
      {
        name: 'Adani Group',
        avg_move: 14, confidence: 'high',
        rationale: 'Adani Group perceived as NDA-aligned conglomerate. BJP dominance = project approvals, port concessions, airport expansions, green energy bids across BJP-governed states.',
        stocks: [
          { symbol: 'ADANIPORTS',   name: 'Adani Ports & SEZ',       avg_move: 14, rationale: 'Largest port operator; new port concessions and SEZ expansion smoother in BJP-governed states.' },
          { symbol: 'ADANIENT',     name: 'Adani Enterprises',        avg_move: 16, rationale: 'Flagship conglomerate; airport acquisitions, data centers, green hydrogen — all need BJP-level clearances.' },
          { symbol: 'ADANIGREEN',   name: 'Adani Green Energy',       avg_move: 18, rationale: '20 GW+ renewable pipeline; PPAs and land acquisitions significantly smoother under BJP govts.' },
          { symbol: 'ADANIPOWER',   name: 'Adani Power',              avg_move: 15, rationale: 'Thermal + renewable generation; PPA renegotiation and captive coal block allocations.' },
          { symbol: 'ACC',          name: 'ACC Ltd (Adani)',          avg_move: 10, rationale: 'Cement demand from NDA infrastructure push — roads, housing, smart cities construction.' },
          { symbol: 'AMBUJACEMENT', name: 'Ambuja Cements (Adani)',   avg_move: 10, rationale: 'PM Awas Yojana rural housing and PMGSY road construction cement demand beneficiary.' },
          { symbol: 'ADANIENSOL',   name: 'Adani Energy Solutions',   avg_move: 14, rationale: 'Power transmission infra; grid modernization critical for renewable energy integration.' },
          { symbol: 'ADANIGAS',     name: 'Adani Total Gas',          avg_move: 12, rationale: 'City gas distribution; PNG household connections target and CNG station rollout.' },
          { symbol: 'NDTV',         name: 'NDTV (Adani)',             avg_move: 8,  rationale: 'Media asset under Adani ownership since 2022; NDA dominance = favorable regulatory environment.' }
        ]
      },
      {
        name: 'PSU Banking',
        avg_move: 9, confidence: 'high',
        rationale: 'BJP NDA political capital → PSU bank recapitalization continuity, infrastructure credit growth, NPA resolution momentum',
        stocks: [
          { symbol: 'SBIN',       name: 'State Bank of India',     avg_move: 9,  rationale: 'Largest PSU bank; infra project lending, credit guarantee schemes, defence capex financing.' },
          { symbol: 'PNB',        name: 'Punjab National Bank',    avg_move: 11, rationale: 'High-beta PSU bank; historically disproportionate rally on NDA political wins.' },
          { symbol: 'BANKBARODA', name: 'Bank of Baroda',          avg_move: 10, rationale: 'International + domestic book; capex financing for PSU companies and infra projects.' },
          { symbol: 'CANBK',      name: 'Canara Bank',             avg_move: 11, rationale: 'South-heavy PSU bank; infra credit growth in BJP-aligned states.' },
          { symbol: 'UNIONBANK',  name: 'Union Bank of India',     avg_move: 12, rationale: 'Merged entity with smaller float; higher volatility = amplified NDA narrative play.' },
          { symbol: 'CENTRALBK',  name: 'Central Bank of India',   avg_move: 13, rationale: 'Highest PSU bank beta; speculative play on NDA momentum with significant upside.' },
          { symbol: 'INDIANB',    name: 'Indian Bank',             avg_move: 10, rationale: 'Strong NPA resolution track; credit growth plays into BJP infrastructure push in South India.' },
          { symbol: 'BANKINDIA',  name: 'Bank of India',           avg_move: 11, rationale: 'Growing retail franchise; infrastructure-linked SME lending accelerates under BJP.' },
          { symbol: 'UCO',        name: 'UCO Bank',                avg_move: 12, rationale: 'High-volatility PSU bank; NDA rally plays disproportionately in smaller PSU banks.' }
        ]
      },
      {
        name: 'Infrastructure & Railways',
        avg_move: 8, confidence: 'medium',
        rationale: 'BJP WB win unlocks infra investment in eastern India corridor; rail capex, port connectivity, power grid expansion',
        stocks: [
          { symbol: 'RVNL',       name: 'Rail Vikas Nigam',         avg_move: 12, rationale: 'Rail construction arm of Indian Railways; direct budget line item beneficiary each NDA term.' },
          { symbol: 'IRFC',       name: 'Indian Railway Finance',   avg_move: 8,  rationale: 'Railway financier; rolling stock and track project lending grows with each capex budget.' },
          { symbol: 'IRCTC',      name: 'IRCTC',                    avg_move: 7,  rationale: 'Rail ticketing and catering monopoly; passenger volumes grow with railway network expansion.' },
          { symbol: 'NBCC',       name: 'NBCC India',               avg_move: 9,  rationale: 'Govt construction arm; central govt colonies, smart cities, redevelopment project pipeline.' },
          { symbol: 'IRCON',      name: 'IRCON International',      avg_move: 10, rationale: 'Railway and highway EPC contractor; largest government-backed order book.' },
          { symbol: 'HUDCO',      name: 'HUDCO',                    avg_move: 9,  rationale: 'Housing and urban development lender; PM Awas Yojana, AMRUT, Smart Cities financing.' },
          { symbol: 'ENGINERSIN', name: 'Engineers India',          avg_move: 8,  rationale: 'Hydrocarbon and infra consultancy; downstream oil project and refinery pipeline.' },
          { symbol: 'RITES',      name: 'RITES Ltd',                avg_move: 9,  rationale: 'Transport consultancy and rail wagon maker; export orders + domestic rail project work.' },
          { symbol: 'RAILTEL',    name: 'RailTel Corp',             avg_move: 10, rationale: 'Rail IT infrastructure; optic fiber networks, data centers, Wi-Fi at 6,000+ stations.' }
        ]
      },
      {
        name: 'Power & Renewables',
        avg_move: 10, confidence: 'medium',
        rationale: '500 GW renewable target, grid modernization, green hydrogen policy — all accelerate under BJP majority with WB energy corridor opening',
        stocks: [
          { symbol: 'NTPC',       name: 'NTPC',               avg_move: 8,  rationale: 'Largest power generator; thermal + solar + wind expansion; direct 500 GW mission beneficiary.' },
          { symbol: 'POWERGRID',  name: 'Power Grid Corp',     avg_move: 8,  rationale: 'Transmission monopoly; inter-state grid expansion critical for renewable energy integration.' },
          { symbol: 'NHPC',       name: 'NHPC',                avg_move: 12, rationale: 'Hydro power PSU; Himalayan hydro projects get faster environmental clearances under BJP.' },
          { symbol: 'SJVN',       name: 'SJVN',                avg_move: 14, rationale: 'Hydro + wind + solar diversified renewable PSU; small float = high beta on political triggers.' },
          { symbol: 'RECLTD',     name: 'REC Ltd',             avg_move: 12, rationale: 'Power sector financier; state discom lending and generation project financing.' },
          { symbol: 'PFC',        name: 'Power Finance Corp',  avg_move: 12, rationale: 'Infrastructure debt push; power project financing aligns with BJP capex narrative.' },
          { symbol: 'CESC',       name: 'CESC',                avg_move: 9,  rationale: 'West Bengal private utility; BJP WB win = potential regulatory reform tailwind for CESC.' },
          { symbol: 'TORNTPOWER', name: 'Torrent Power',       avg_move: 7,  rationale: 'Gujarat-dominant private utility; BJP home state delivers stable regulatory environment.' },
          { symbol: 'TATAPOWER',  name: 'Tata Power',          avg_move: 9,  rationale: 'Diversified power — solar EPC, transmission, distribution; renewable order acceleration.' }
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
        rationale: 'Split verdict = policy continuity, no PSU credit-growth push. Private banks insulated from PSU/infra noise.',
        stocks: [
          { symbol: 'HDFCBANK',   name: 'HDFC Bank',         avg_move: 3, rationale: 'Largest private bank; retail mortgage book and urban consumption exposure; politics-agnostic.' },
          { symbol: 'ICICIBANK',  name: 'ICICI Bank',         avg_move: 4, rationale: 'Diversified private bank; corporate and retail mix; NIM resilience in any political scenario.' },
          { symbol: 'KOTAKBANK',  name: 'Kotak Mahindra',     avg_move: 3, rationale: 'Premium private bank; wealth management and SME lending; relatively insulated from state outcomes.' },
          { symbol: 'AXISBANK',   name: 'Axis Bank',          avg_move: 4, rationale: 'Large private bank with improving ROA; retail credit and card spend — consumption proxy.' },
          { symbol: 'INDUSINDBK', name: 'IndusInd Bank',      avg_move: 3, rationale: 'Vehicle finance and microfinance exposure; 2-wheeler rural demand resilient in mixed mandate.' },
          { symbol: 'FEDERALBNK', name: 'Federal Bank',       avg_move: 3, rationale: 'Kerala-based private bank; LDF retention of Kerala = stable regional banking environment.' },
          { symbol: 'IDFCFIRSTB', name: 'IDFC First Bank',    avg_move: 4, rationale: 'Transformation story; retail liability franchise building; low political sensitivity.' },
          { symbol: 'BANDHANBNK', name: 'Bandhan Bank',       avg_move: 5, rationale: 'WB-headquartered microfinance bank; TMC retention = familiar regulatory environment in core market.' },
          { symbol: 'CSBBANK',    name: 'CSB Bank',           avg_move: 3, rationale: 'Kerala-origin bank; stable under LDF; gold lending and SME mix has low election sensitivity.' }
        ]
      },
      {
        name: 'FMCG',
        avg_move: 2, confidence: 'medium',
        rationale: 'Consumption-driven state wins (TN/Kerala/WB by opposition) signal rural demand stability; welfare spending likely to continue',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',                avg_move: 2, rationale: 'Rural + urban FMCG leader; stable demand in any government configuration.' },
          { symbol: 'ITC',        name: 'ITC',                 avg_move: 3, rationale: 'Cigarettes + FMCG + hotels; low political sensitivity; dividend yield provides floor.' },
          { symbol: 'NESTLEIND',  name: 'Nestle India',        avg_move: 2, rationale: 'Premium food brand; urban consumption steady; pricing power maintained.' },
          { symbol: 'BRITANNIA',  name: 'Britannia',           avg_move: 2, rationale: 'Biscuits/dairy leader; rural distribution + volume growth regardless of political outcome.' },
          { symbol: 'DABUR',      name: 'Dabur India',         avg_move: 3, rationale: 'Ayurvedic and healthcare FMCG; rural penetration + pharma adjacency makes it defensive.' },
          { symbol: 'GODREJCP',   name: 'Godrej Consumer',     avg_move: 2, rationale: 'Household insecticides and personal care; Africa + India exposure = political agnostic.' },
          { symbol: 'MARICO',     name: 'Marico',              avg_move: 2, rationale: 'Hair and edible oils; Saffola and Parachute dominant — stable demand in any scenario.' },
          { symbol: 'EMAMILTD',   name: 'Emami Ltd',           avg_move: 3, rationale: 'Ayurvedic and winter care products; Bengal-origin company; TMC retention = home market stability.' },
          { symbol: 'COLPAL',     name: 'Colgate-Palmolive',   avg_move: 2, rationale: 'Oral care monopoly; essential consumer spend unaffected by election outcomes.' }
        ]
      },
      {
        name: 'IT Services',
        avg_move: 2, confidence: 'low',
        rationale: 'USD earners; domestic-politics neutral. Mixed mandate = INR stability, steady IT demand from US/Europe clients.',
        stocks: [
          { symbol: 'TCS',        name: 'TCS',                 avg_move: 2, rationale: 'Largest IT exporter; revenue in USD; completely insulated from Indian domestic politics.' },
          { symbol: 'INFY',       name: 'Infosys',              avg_move: 3, rationale: 'Large-deal wins and cloud migration; dollar earnings hedge against INR uncertainty.' },
          { symbol: 'WIPRO',      name: 'Wipro',                avg_move: 2, rationale: 'Consulting + IT services; diversified client base; political outcome agnostic.' },
          { symbol: 'HCLTECH',    name: 'HCL Technologies',     avg_move: 3, rationale: 'Products + services mix; IP licensing revenue steady; not affected by domestic elections.' },
          { symbol: 'TECHM',      name: 'Tech Mahindra',        avg_move: 2, rationale: 'Telecom + enterprise IT; 5G business transformation exposure; political neutral.' },
          { symbol: 'LTIM',       name: 'LTIMindtree',          avg_move: 3, rationale: 'Mid-large IT; deal pipeline in BFSI and manufacturing; USD earnings insulate from state outcomes.' },
          { symbol: 'MPHASIS',    name: 'Mphasis',              avg_move: 3, rationale: 'BFSI-heavy IT; BlackRock deal flow and US banking clients; fully decoupled from India politics.' },
          { symbol: 'PERSISTENT', name: 'Persistent Systems',   avg_move: 3, rationale: 'Fast-growing product-engineering company; US tech client concentration = political agnostic.' },
          { symbol: 'COFORGE',    name: 'Coforge',              avg_move: 3, rationale: 'Travel + BFSI IT focus; strong deal wins; revenue in USD; India election irrelevant.' }
        ]
      },
      {
        name: 'Pharma',
        avg_move: 2, confidence: 'medium',
        rationale: 'Defensive export-heavy sector; INR depreciation hedge; domestic branded market stable regardless of state-level political outcomes',
        stocks: [
          { symbol: 'SUNPHARMA',  name: 'Sun Pharma',          avg_move: 3, rationale: 'Largest Indian pharma; US generics recovery + domestic branded portfolio; politics-neutral.' },
          { symbol: 'DRREDDY',    name: "Dr Reddy's",           avg_move: 3, rationale: 'Strong US generic pipeline; relative outperformer in uncertain political environments.' },
          { symbol: 'CIPLA',      name: 'Cipla',                avg_move: 2, rationale: 'Respiratory and HIV drugs; low political sensitivity; export-heavy earnings.' },
          { symbol: 'DIVISLAB',   name: "Divi's Labs",          avg_move: 2, rationale: 'API/CRAMS manufacturer; regulatory track record strong; US FDA compliance stable.' },
          { symbol: 'LUPIN',      name: 'Lupin',                avg_move: 2, rationale: 'US generics + domestic branded; dollar earnings provide INR uncertainty hedge.' },
          { symbol: 'TORNTPHARM', name: 'Torrent Pharma',       avg_move: 2, rationale: 'Domestic-heavy branded pharma; consumption-driven, political agnostic; stable margins.' },
          { symbol: 'BIOCON',     name: 'Biocon',               avg_move: 2, rationale: 'Biologics and biosimilars; global partnerships insulate from domestic election outcomes.' },
          { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma',     avg_move: 2, rationale: 'API + finished dosage exporter; strong US generic filings; decoupled from state politics.' },
          { symbol: 'ALKEM',      name: 'Alkem Labs',           avg_move: 2, rationale: 'Domestic branded pharma leader; rural healthcare penetration, antibiotics market.' }
        ]
      },
      {
        name: 'Auto & Consumer',
        avg_move: 3, confidence: 'low',
        rationale: 'Consumer discretionary stable in status-quo scenario; rural demand from TN/WB opposition wins supports 2-wheeler and tractor volumes',
        stocks: [
          { symbol: 'MARUTI',     name: 'Maruti Suzuki',        avg_move: 3, rationale: 'Dominant passenger car maker; urban consumption proxy; politically neutral business model.' },
          { symbol: 'TATAMOTORS', name: 'Tata Motors',          avg_move: 3, rationale: 'EV + commercial vehicle; Jaguar Land Rover global exposure; domestic politics minor factor.' },
          { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto',           avg_move: 3, rationale: '2-wheeler + 3-wheeler exports; rural semi-urban demand steady in any state outcome.' },
          { symbol: 'EICHERMOT',  name: 'Eicher Motors',        avg_move: 4, rationale: 'Royal Enfield premium 2-wheeler; urban youth consumer — resilient in stable scenarios.' },
          { symbol: 'M&M',        name: 'Mahindra & Mahindra',  avg_move: 4, rationale: 'Tractors + SUVs + EVs; rural tractor demand independent of WB/TN political outcomes.' },
          { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp',        avg_move: 3, rationale: '2-wheeler market leader; rural demand proxy; agri income-linked consumption.' },
          { symbol: 'TVSMOTOR',   name: 'TVS Motor',            avg_move: 3, rationale: 'Fast-growing 2-wheeler; electric scooter momentum; South India base benefits from LDF/DMK stability.' },
          { symbol: 'BALKRISIND', name: 'Balkrishna Industries', avg_move: 3, rationale: 'Tractor tyres + OTR exports; agricultural and infra cycle; globally exported product.' },
          { symbol: 'MOTHERSON',  name: 'Motherson Sumi',       avg_move: 2, rationale: 'Auto ancillary; diversified global supply chain; M&A driven growth decoupled from state elections.' }
        ]
      }
    ]
  },

  opposition_sweep: {
    label: 'Opposition Sweep — TMC WB, DMK TN, LDF Kerala',
    bias: 'bearish',
    market_tone: 'NDA political setback. PSU/capex/Adani sell off sharply. Defensives least hit. Risk-off rotation into gold, pharma, IT.',
    event_context: 'Opposition wins all key states in 2026 elections — TMC retains WB decisively, DMK wins TN, LDF wins Kerala. NDA narrative broken. Markets price in policy uncertainty, slower PSU capex, Adani project risk premium.',
    sectors: [
      {
        name: 'FMCG',
        avg_move: -1, confidence: 'medium',
        rationale: 'Least politically sensitive sector. Consumption demand state-policy agnostic. Relative outperformer in broad sell-off.',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',                 avg_move: -1, rationale: 'Rural + urban FMCG; defensive moat in sell-off — consumers keep buying soap and shampoo.' },
          { symbol: 'ITC',        name: 'ITC',                  avg_move: -1, rationale: 'Cigarettes and FMCG; dividend yield attracts money out of risk-off political sell-off.' },
          { symbol: 'NESTLEIND',  name: 'Nestle India',         avg_move:  0, rationale: 'Premium food brand; essential consumer spend insulated from political uncertainty.' },
          { symbol: 'BRITANNIA',  name: 'Britannia',            avg_move: -1, rationale: 'Biscuits and dairy; volume-driven rural FMCG; holds better than cyclicals in sell-off.' },
          { symbol: 'DABUR',      name: 'Dabur India',          avg_move: -1, rationale: 'Ayurvedic FMCG; defensive earnings; rural penetration means opposition-state wins are neutral.' },
          { symbol: 'GODREJCP',   name: 'Godrej Consumer',      avg_move: -1, rationale: 'Africa + India exposure; political uncertainty in India partially offset by Africa revenues.' },
          { symbol: 'MARICO',     name: 'Marico',               avg_move: -1, rationale: 'Hair and edible oils; essential consumer goods; relative safe-haven in political sell-off.' },
          { symbol: 'EMAMILTD',   name: 'Emami Ltd',            avg_move:  0, rationale: 'Bengal-origin FMCG; TMC win = stable home market; brand equity resilient.' },
          { symbol: 'COLPAL',     name: 'Colgate-Palmolive',    avg_move:  0, rationale: 'Oral care monopoly; essential spend protected from political news flow.' }
        ]
      },
      {
        name: 'IT Services',
        avg_move: -2, confidence: 'low',
        rationale: 'USD earners insulated from political outcomes but dragged down by risk-off sentiment. INR depreciation on uncertainty = slight dollar earnings boost.',
        stocks: [
          { symbol: 'TCS',        name: 'TCS',                  avg_move: -1, rationale: 'USD revenue base; only dragged by market-wide sell-off, not politically exposed.' },
          { symbol: 'INFY',       name: 'Infosys',               avg_move: -2, rationale: 'Dollar earner; large-deal pipeline in cloud migration provides revenue visibility.' },
          { symbol: 'WIPRO',      name: 'Wipro',                 avg_move: -2, rationale: 'IT services; risk-off sell-off limited by dollar earnings and valuation support.' },
          { symbol: 'HCLTECH',    name: 'HCL Technologies',      avg_move: -1, rationale: 'IP licensing + services; stable recurring revenue base limits downside in sell-off.' },
          { symbol: 'TECHM',      name: 'Tech Mahindra',         avg_move: -2, rationale: 'Telecom + enterprise IT; 5G transformation demand independent of domestic election.' },
          { symbol: 'LTIM',       name: 'LTIMindtree',           avg_move: -2, rationale: 'Mid-large IT; BFSI + manufacturing client mix; dollar revenue shields from political noise.' },
          { symbol: 'MPHASIS',    name: 'Mphasis',               avg_move: -2, rationale: 'US BFSI IT; BlackRock ownership concentration; decoupled from India political cycle.' },
          { symbol: 'PERSISTENT', name: 'Persistent Systems',    avg_move: -2, rationale: 'High-growth product engineering; US tech exposure; India election irrelevant to business.' },
          { symbol: 'COFORGE',    name: 'Coforge',               avg_move: -3, rationale: 'Travel + BFSI IT; dollar revenue base; held down only by market-wide risk-off.' }
        ]
      },
      {
        name: 'Pharma',
        avg_move: -1, confidence: 'low',
        rationale: 'Defensive export-heavy sector. INR depreciation on political uncertainty = earnings tailwind for US-focused generics players.',
        stocks: [
          { symbol: 'SUNPHARMA',  name: 'Sun Pharma',           avg_move:  0, rationale: 'Largest pharma; specialty US + domestic branded; defensive moat holds in sell-off.' },
          { symbol: 'DRREDDY',    name: "Dr Reddy's",            avg_move: -1, rationale: 'US generics + domestic; INR depreciation on uncertainty = positive for USD revenues.' },
          { symbol: 'CIPLA',      name: 'Cipla',                 avg_move: -1, rationale: 'Respiratory and HIV portfolio; export earnings provide INR uncertainty hedge.' },
          { symbol: 'DIVISLAB',   name: "Divi's Labs",           avg_move:  0, rationale: 'API/CRAMS; export earnings in USD; completely insulated from domestic political outcomes.' },
          { symbol: 'LUPIN',      name: 'Lupin',                 avg_move: -1, rationale: 'US generic filings; dollar revenues; INR weakness = favorable translation effect.' },
          { symbol: 'TORNTPHARM', name: 'Torrent Pharma',        avg_move: -1, rationale: 'Domestic branded pharma; Gujarat operations stable; consumption-driven with steady demand.' },
          { symbol: 'BIOCON',     name: 'Biocon',                avg_move: -2, rationale: 'Biosimilars; global partnerships; India election outcome irrelevant to biosimilar approval pipeline.' },
          { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma',      avg_move: -1, rationale: 'API + US generics; Andhra-based operations; state elections do not affect business.' },
          { symbol: 'ALKEM',      name: 'Alkem Labs',            avg_move:  0, rationale: 'Domestic branded pharma; stable antibiotic and chronic medicine demand regardless of politics.' }
        ]
      },
      {
        name: 'Gold & Precious Metals',
        avg_move: 3, confidence: 'medium',
        rationale: 'Risk-off rotation into gold on political uncertainty. Opposition sweep = NDA policy doubt = safe-haven demand spikes. Gold jewellery retail holds consumer sentiment in opposition-win states.',
        stocks: [
          { symbol: 'TITAN',      name: 'Titan Company',         avg_move: 3, rationale: 'Largest branded jeweller; gold price beneficiary; Tanishq urban demand resilient in uncertainty.' },
          { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance',       avg_move: 5, rationale: 'Gold loan NBFC; gold price rise = collateral value rise = business expansion.' },
          { symbol: 'MANAPPURAM', name: 'Manappuram Finance',    avg_move: 4, rationale: 'Kerala-based gold loan NBFC; LDF win = familiar regulatory environment in home state.' },
          { symbol: 'KALYANKJIL', name: 'Kalyan Jewellers',      avg_move: 3, rationale: 'Kerala-origin jeweller; opposition wins in TN/WB/Kerala = stable consumer sentiment in core markets.' },
          { symbol: 'SENCO',      name: 'Senco Gold',            avg_move: 4, rationale: 'East India jeweller; TMC WB win = home market stability; gold demand up in political uncertainty.' },
          { symbol: 'RAJESHEXPO', name: 'Rajesh Exports',        avg_move: 3, rationale: 'Gold refining and retail; manufacturing scale; low political sensitivity; gold price tracker.' },
          { symbol: 'GOLDIAM',    name: 'Goldiam International',  avg_move: 3, rationale: 'Diamond-cut gold jewellery exporter; USD export earnings hedge against INR decline.' },
          { symbol: 'PCJEWELLER', name: 'PC Jeweller',           avg_move: 4, rationale: 'High-beta gold retail; store expansion in north and east India; gold price amplifier.' },
          { symbol: 'IIFLFINANCE',name: 'IIFL Finance',          avg_move: 3, rationale: 'Gold loans + home finance; gold portfolio provides risk-off hedge in political uncertainty.' }
        ]
      },
      {
        name: 'Healthcare & Hospitals',
        avg_move: -1, confidence: 'low',
        rationale: 'Private healthcare demand independent of political outcomes. South India hospital chains directly benefit from opposition state stability. Defensive sector in risk-off sell-off.',
        stocks: [
          { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals',      avg_move:  0, rationale: 'Pan-India private hospital chain; healthcare spend agnostic to political configuration.' },
          { symbol: 'FORTIS',     name: 'Fortis Healthcare',      avg_move: -1, rationale: 'North India hospital network; M&A consolidation story; low election sensitivity.' },
          { symbol: 'MAXHEALTH',  name: 'Max Healthcare',         avg_move: -1, rationale: 'Delhi NCR + North India hospitals; urban middle-class healthcare demand steady.' },
          { symbol: 'NH',         name: 'Narayana Hrudayalaya',   avg_move:  0, rationale: 'Karnataka/Kerala-heavy hospital chain; LDF Kerala win = stable regulatory backdrop.' },
          { symbol: 'ASTERDM',    name: 'Aster DM Healthcare',    avg_move:  1, rationale: 'South India hospitals; Kerala stronghold; LDF win = continued operational stability.' },
          { symbol: 'METROPOLIS', name: 'Metropolis Healthcare',  avg_move: -1, rationale: 'Diagnostics lab chain; urban healthcare spend; completely insulated from state elections.' },
          { symbol: 'LALPATHLAB', name: 'Dr Lal PathLabs',        avg_move: -1, rationale: 'North India diagnostics leader; stable recurring diagnostic demand; low political exposure.' },
          { symbol: 'VIJAYADIAG', name: 'Vijaya Diagnostics',     avg_move:  0, rationale: 'Hyderabad-based diagnostics; Telangana-focused; adjacent to stable AP/Telangana market.' },
          { symbol: 'KRSNAA',     name: 'Krsnaa Diagnostics',     avg_move: -1, rationale: 'PPP diagnostics model; government healthcare contracts; stable regardless of state outcome.' }
        ]
      }
    ]
  },

  // ── General Election scenarios (kept for reference/future use) ──────────────
  nda_strong: {
    label: 'NDA Strong Win (300+ seats)',
    bias: 'bullish',
    market_tone: 'PSU/infra/defense rally. Private sector neutral. Continuity trade.',
    event_context: 'BJP-led NDA wins 300+ seats in general election. Strong mandate for continued PSU capex, defense modernization, infrastructure push.',
    sectors: [
      {
        name: 'Defense & PSU Aerospace',
        avg_move: 18, confidence: 'high',
        rationale: 'Defense capex acceleration, Make in India, multi-year order pipeline',
        stocks: [
          { symbol: 'HAL',        name: 'Hindustan Aeronautics',      avg_move: 22, rationale: 'Primary aircraft manufacturer; fighter jet and helicopter orders with multi-decade visibility.' },
          { symbol: 'BEL',        name: 'Bharat Electronics',          avg_move: 18, rationale: 'Electronics for defense modernization; radar, missile systems, C4I projects.' },
          { symbol: 'BEML',       name: 'BEML Ltd',                    avg_move: 20, rationale: 'Mining + rail + defense equipment; largest govt capex order book historically.' },
          { symbol: 'COCHINSHIP', name: 'Cochin Shipyard',             avg_move: 25, rationale: 'Warship construction monopoly; Navy 100-ship program + aircraft carrier maintenance.' },
          { symbol: 'MAZDOCK',    name: 'Mazagon Dock',                avg_move: 22, rationale: 'Submarine and destroyer maker; nuclear submarine pipeline under Make in India.' },
          { symbol: 'GRSE',       name: 'Garden Reach Shipbuilders',   avg_move: 20, rationale: 'Patrol and coastal vessels; anti-piracy naval fleet expansion.' }
        ]
      },
      {
        name: 'Railways & Infrastructure',
        avg_move: 20, confidence: 'high',
        rationale: 'Continued rail capex, station redevelopment, bullet train, freight corridor',
        stocks: [
          { symbol: 'RVNL',      name: 'Rail Vikas Nigam',        avg_move: 25, rationale: 'Rail construction arm; direct budget line item allocation each term.' },
          { symbol: 'IRFC',      name: 'Indian Railway Finance',   avg_move: 18, rationale: 'Railway debt financier; rolling stock and track project lending grows each capex budget.' },
          { symbol: 'IRCTC',     name: 'IRCTC',                    avg_move: 12, rationale: 'Rail ticketing monopoly; passenger volumes grow with expanding rail network.' },
          { symbol: 'RAILTEL',   name: 'RailTel Corp',             avg_move: 20, rationale: 'Rail IT infra; optic fiber, data centers, Wi-Fi across rail network.' },
          { symbol: 'TITAGARH',  name: 'Titagarh Rail Systems',   avg_move: 22, rationale: 'Rail wagon and metro coach maker; Vande Bharat supply chain and metro expansion.' }
        ]
      },
      {
        name: 'PSU Banking',
        avg_move: 12, confidence: 'high',
        rationale: 'Govt capex drives credit growth, PSU bank recapitalization continuity',
        stocks: [
          { symbol: 'SBIN',       name: 'State Bank of India',   avg_move: 12, rationale: 'Largest PSU bank; infra project lending and credit guarantee schemes.' },
          { symbol: 'PNB',        name: 'Punjab National Bank',  avg_move: 15, rationale: 'High-beta PSU bank; historically disproportionate rally on NDA wins.' },
          { symbol: 'BANKBARODA', name: 'Bank of Baroda',        avg_move: 14, rationale: 'International + domestic book; capex financing for PSU companies.' },
          { symbol: 'CANBK',      name: 'Canara Bank',           avg_move: 15, rationale: 'South-heavy PSU bank; infra credit growth in BJP-aligned states.' },
          { symbol: 'UNIONBANK',  name: 'Union Bank of India',   avg_move: 16, rationale: 'Merged entity; smaller float = amplified NDA narrative play.' }
        ]
      },
      {
        name: 'Power & Renewables',
        avg_move: 10, confidence: 'medium',
        rationale: '500 GW renewable target, grid modernization, green hydrogen push',
        stocks: [
          { symbol: 'NTPC',      name: 'NTPC',              avg_move: 8,  rationale: 'Largest power generator; thermal + solar + wind 500 GW mission beneficiary.' },
          { symbol: 'POWERGRID', name: 'Power Grid Corp',   avg_move: 8,  rationale: 'Transmission monopoly; inter-state grid for renewable integration.' },
          { symbol: 'NHPC',      name: 'NHPC',              avg_move: 12, rationale: 'Hydro PSU; Himalayan projects get faster clearances under BJP.' },
          { symbol: 'SJVN',      name: 'SJVN',              avg_move: 14, rationale: 'Diversified renewable PSU; small float = high beta on political triggers.' },
          { symbol: 'RECLTD',    name: 'REC Ltd',           avg_move: 12, rationale: 'Power sector financier; state discom lending and generation project financing.' },
          { symbol: 'PFC',       name: 'Power Finance Corp',avg_move: 12, rationale: 'Infrastructure debt; power project financing aligns with BJP capex narrative.' }
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
          { symbol: 'HDFCBANK', name: 'HDFC Bank',   avg_move: 4, rationale: 'Largest private bank; retail mortgage book insulated from PSU/infra policy noise.' },
          { symbol: 'ICICIBANK',name: 'ICICI Bank',  avg_move: 5, rationale: 'Diversified private bank; NIM resilience and retail expansion in any coalition scenario.' },
          { symbol: 'KOTAKBANK',name: 'Kotak Bank',  avg_move: 4, rationale: 'Premium private bank; wealth management and SME lending; politics-agnostic growth.' },
          { symbol: 'AXISBANK', name: 'Axis Bank',   avg_move: 5, rationale: 'Improving ROA private bank; retail credit and card spend — consumption proxy.' }
        ]
      },
      {
        name: 'FMCG',
        avg_move: 3, confidence: 'medium',
        rationale: 'Coalition govts tend toward consumption/welfare spending; FMCG defensive',
        stocks: [
          { symbol: 'HINDUNILVR', name: 'HUL',       avg_move: 3, rationale: 'Defensive FMCG; coalition welfare spending actually boosts rural FMCG demand.' },
          { symbol: 'ITC',        name: 'ITC',        avg_move: 4, rationale: 'Cigarettes + FMCG; stable cash flows; dividend yield attracts risk-off capital.' },
          { symbol: 'NESTLEIND',  name: 'Nestle',     avg_move: 2, rationale: 'Premium food; essential consumer spend maintained in uncertainty.' },
          { symbol: 'BRITANNIA',  name: 'Britannia',  avg_move: 3, rationale: 'Biscuits and dairy; rural distribution holds in any government configuration.' }
        ]
      },
      {
        name: 'IT Services',
        avg_move: 2, confidence: 'low',
        rationale: 'USD earners; insulated from domestic policy. Coalition = INR stability.',
        stocks: [
          { symbol: 'TCS',     name: 'TCS',      avg_move: 2, rationale: 'Largest IT exporter; completely insulated from Indian coalition politics.' },
          { symbol: 'INFY',    name: 'Infosys',  avg_move: 3, rationale: 'Dollar earnings; cloud migration demand independent of domestic political outcome.' },
          { symbol: 'WIPRO',   name: 'Wipro',    avg_move: 2, rationale: 'IT services; dollar revenue base shields from domestic coalition noise.' },
          { symbol: 'HCLTECH', name: 'HCL Tech', avg_move: 3, rationale: 'IP + services revenue; steady recurring earnings in any political scenario.' }
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
          { symbol: 'HINDUNILVR', name: 'HUL',       avg_move: -1, rationale: 'Defensive moat; essential consumer spend holds in risk-off market sell-down.' },
          { symbol: 'ITC',        name: 'ITC',        avg_move: -2, rationale: 'Dividend yield support; cigarette demand inelastic; holds vs cyclicals in sell-off.' },
          { symbol: 'NESTLEIND',  name: 'Nestle',     avg_move: -1, rationale: 'Premium food; pricing power maintained; minor downside vs market sell-off.' },
          { symbol: 'BRITANNIA',  name: 'Britannia',  avg_move: -2, rationale: 'Essential biscuits and dairy; relative outperformer in hung parliament risk-off.' }
        ]
      },
      {
        name: 'IT Services',
        avg_move: -3, confidence: 'low',
        rationale: 'USD earners. Political uncertainty triggers INR depreciation, slight tailwind.',
        stocks: [
          { symbol: 'TCS',      name: 'TCS',       avg_move: -2, rationale: 'USD revenue base; partial INR depreciation tailwind offsets risk-off selling.' },
          { symbol: 'INFY',     name: 'Infosys',   avg_move: -3, rationale: 'Dollar earner; large-deal wins provide some revenue visibility floor.' },
          { symbol: 'WIPRO',    name: 'Wipro',     avg_move: -3, rationale: 'IT services; dollar earnings provide partial hedge vs INR uncertainty.' },
          { symbol: 'HCLTECH',  name: 'HCL Tech',  avg_move: -2, rationale: 'IP licensing + services; stable recurring revenue limits downside in sell-off.' }
        ]
      },
      {
        name: 'Pharma',
        avg_move: -2, confidence: 'low',
        rationale: 'Defensive sector; domestic policy agnostic. Export-heavy = INR hedge.',
        stocks: [
          { symbol: 'SUNPHARMA',  name: 'Sun Pharma',   avg_move: -1, rationale: 'Defensive pharma moat; specialty US + domestic branded; holds in risk-off sell-down.' },
          { symbol: 'DRREDDY',    name: "Dr Reddy's",   avg_move: -2, rationale: 'US generics; INR depreciation on uncertainty = positive for dollar revenue translation.' },
          { symbol: 'CIPLA',      name: 'Cipla',        avg_move: -2, rationale: 'Respiratory and HIV drugs; export earnings in USD; hedge against INR decline.' },
          { symbol: 'DIVISLAB',   name: "Divi's Labs",  avg_move: -1, rationale: 'API/CRAMS exporter; completely insulated from domestic political uncertainty.' }
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
  const hist_norm  = Math.min(Math.abs(avg_move) / 25, 1) * 10;
  const llm_norm   = llmScore !== null ? Math.min(Math.max(llmScore, 0), 10) : hist_norm;
  const brain_norm = Math.min(Math.max(brainScore, 0), 10);
  const raw = (hist_norm * 0.40) + (llm_norm * 0.35) + (brain_norm * 0.25);
  return Math.sign(avg_move || 1) * raw;
}

/**
 * Returns top 5 sectors + top 10 stocks for given scenario, boosted by brain picks.
 * LLM event scores are injected client-side after initial render (async enrichment).
 * Pure function — no side effects.
 */
export function getEventPlays(brainResult, scenario = 'bjp_wave') {
  const plays = SCENARIO_PLAYS[scenario] || SCENARIO_PLAYS.bjp_wave;
  const brainPickMap = {};
  for (const pick of (brainResult?.picks || [])) {
    brainPickMap[pick.symbol] = pick;
  }

  const topSectors = plays.sectors.slice(0, 5).map(sector => {
    const enrichedStocks = sector.stocks.map(s => {
      const brainPick = brainPickMap[s.symbol] || null;
      const brainScore = brainPick ? brainPick.score : 0;
      const composite = computeCompositeScore(s.avg_move, brainScore, null);
      return {
        ...s,
        brain_pick: brainPick,
        conviction: brainPick ? 'high' : sector.confidence === 'high' ? 'medium' : 'low',
        composite_score: composite,
        final_score: composite,
        llm_score: null,
        llm_verdict: null,
        llm_reason: null
      };
    }).sort((a, b) => Math.abs(b.composite_score) - Math.abs(a.composite_score));

    return { ...sector, stocks: enrichedStocks };
  });

  const top10 = topSectors
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
    topSectors,
    top3Sectors: topSectors.slice(0, 3), // backward compat
    top10,
    historical_events: HISTORICAL_EVENTS,
    historical_general: HISTORICAL_GENERAL_ELECTIONS,
    historical_state: HISTORICAL_STATE_ELECTIONS,
    meta: {
      total_stocks_evaluated: plays.sectors.slice(0, 5).reduce((n, s) => n + s.stocks.length, 0),
      brain_aligned: brainAligned,
      brain_picks_total: (brainResult?.picks || []).length,
      scoring: { hist: 0.40, llm: 0.35, brain: 0.25 },
      generated_at: new Date().toISOString()
    }
  };
}
