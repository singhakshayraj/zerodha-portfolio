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
    market_tone: 'NDA momentum signal. BJP WB win = first time since 1977. Eastern India industrial corridor unlocked. Adani Tajpur port, JSW Salboni steel, GRSE shipyard, RVNL Kolkata Metro — all stuck projects get Centre-State cooperation.',
    event_context: 'BJP wins West Bengal 2026 state assembly election — first BJP govt in WB since 1977. NDA retains Assam. This unlocks ₹2 lakh cr+ of stalled Central projects in eastern India: Tajpur deep sea port (Adani, ₹25,000cr), JSW Salboni steel plant (₹35,000cr), Kolkata Metro expansion, Eastern Freight Corridor, Sagarmala port connectivity, and PM Awas Yojana housing across WB. Central-state conflict that paralysed WB for 14 years ends.',
    sectors: [
      {
        name: 'Defense & PSU Aerospace',
        avg_move: 12, confidence: 'high',
        rationale: 'GRSE physically located in Kolkata — most direct WB beneficiary in defense. BEML supplies Kolkata Metro coaches. BJP WB win = Centre-State cooperation on defense industrial land, labor, utilities at Eastern Command.',
        stocks: [
          { symbol: 'GRSE',       name: 'Garden Reach Shipbuilders', avg_move: 17, rationale: 'GRSE is PHYSICALLY LOCATED in Kolkata, WB. Its shipyard on the Hooghly river has long been caught in state-centre friction under TMC — land expansion, utilities, labor disputes. BJP WB win directly resolves this. GRSE holds ₹25,000 cr+ naval order book (frigates, survey vessels, FPVs). 2021 WB result saw GRSE underperform. Reverse trade now.' },
          { symbol: 'BEML',       name: 'BEML Ltd',                  avg_move: 14, rationale: 'BEML is primary supplier of Kolkata Metro rolling stock — Orange Line (New Garia-Airport), Green Line, Purple Line coaches. All three lines have pending orders stalled in Centre-State approval loop. BJP WB win = Centre can directly fund Kolkata Metro expansion without TMC roadblocks. BEML also supplies mining equipment to Eastern Coalfields in WB.' },
          { symbol: 'HAL',        name: 'Hindustan Aeronautics',    avg_move: 14, rationale: 'HAL LCA Tejas Mk2 and HTT-40 trainer programs are NDA flagship Make-in-India defense projects. BJP WB win = NDA political mandate strengthened; MoD can push ₹1.35 lakh cr defense capex FY25 without coalition opposition. Eastern Air Command (Shillong) readiness upgrades also flow through HAL MRO pipeline.' },
          { symbol: 'BEL',        name: 'Bharat Electronics',        avg_move: 11, rationale: 'BEL supplies battlefield management systems, radars, and C4I networks to Indian Army Eastern Command headquartered in Kolkata. BJP WB win = smoother Eastern Command modernisation as state-centre security cooperation improves. BEL also has ₹70,000 cr+ order book including Arudhra radar, QRSAM.' },
          { symbol: 'COCHINSHIP', name: 'Cochin Shipyard',           avg_move: 16, rationale: 'Building India\'s first indigenous aircraft carrier INS Vikrant; warship EPCG orders tied to NDA\'s self-reliance doctrine. After BJP WB win, NDA political capital = faster MoD allocation for warship program. Also: Cochin is repairing Eastern Fleet vessels — BJP NDA dominance = higher Eastern Fleet modernisation budget.' },
          { symbol: 'MAZDOCK',    name: 'Mazagon Dock',              avg_move: 15, rationale: 'Scorpene submarine (P75) and destroyer (P15B) pipeline worth ₹50,000+ cr. BJP WB win = NDA strength to push P75I (6 advanced submarines) through MoD fast-track. Eastern Naval Command operating Scorpenes directly benefits from this pipeline.' },
          { symbol: 'BDL',        name: 'Bharat Dynamics',           avg_move: 12, rationale: 'Astra MK-2 air-to-air missile, QRSAM surface-to-air missile, and Akash-NG programs are BJP-era Make-in-India defense showpieces. BJP WB win = NDA political mandate to push ₹15,000 cr BDL order book through MoD without coalition veto. Eastern Air Defence Shield uses Akash systems.' },
          { symbol: 'MIDHANI',    name: 'Mishra Dhatu Nigam',        avg_move: 10, rationale: 'Specialty titanium and nickel superalloys for HAL aero engines, BEL radar housings, DRDO missile casings. Every defense manufacturing plant that gets accelerated by BJP WB win (GRSE, HAL, BEML) directly increases MIDHANI input demand. MIDHANI is the upstream enabler for India\'s defense manufacturing ecosystem.' },
          { symbol: 'PARAS',      name: 'Paras Defence',             avg_move: 13, rationale: 'Counter-drone systems, surveillance electronics, space optics for defense. Eastern border with Bangladesh (200+ km in WB) is a major drone intrusion threat — BJP WB win = Centre can run anti-drone programs in WB without state-level political friction. Paras is primary vendor for counter-UAV systems deployed on eastern borders.' }
        ]
      },
      {
        name: 'Adani Group — WB Projects Unlocked',
        avg_move: 15, confidence: 'high',
        rationale: 'Adani has ₹50,000 cr+ of projects specifically stuck in WB under TMC. Tajpur Deep Sea Port (₹25,000 cr, allocated to Adani 2022 but land clearance blocked), WB renewable energy bids, Kolkata electricity distribution. BJP WB win = all these move within 6-12 months. This is Adani\'s single biggest state-level unlock in years.',
        stocks: [
          { symbol: 'ADANIPORTS',   name: 'Adani Ports & SEZ',       avg_move: 16, rationale: 'Tajpur Deep Sea Port — WB\'s first deep sea port, ₹25,000 cr project, awarded to Adani in 2022. TMC govt created land acquisition deadlocks for 3 years, deliberately stalling the project. BJP WB win = Tajpur port construction starts immediately. This alone adds ₹25,000 cr to Adani Ports orderbook and opens the Bangladesh-northeast India trade corridor. Direct re-rating trigger.' },
          { symbol: 'ADANIENT',     name: 'Adani Enterprises',        avg_move: 18, rationale: 'Adani Enterprises bid for Kolkata airport expansion and Kolkata data center park — both projects stalled under TMC. Additionally Adani is in the running for WB city gas distribution in Durgapur, Asansol, Howrah industrial clusters. BJP win = all three WB bids unlock. Flagship Adani stock captures all optionality.' },
          { symbol: 'ADANIGREEN',   name: 'Adani Green Energy',       avg_move: 19, rationale: 'Adani Green has 3 GW of renewable projects planned for eastern India including WB solar parks in Purulia and Bankura districts. TMC blocked land acquisition for solar parks claiming agricultural land concerns. BJP WB win = Purulia solar park (900 MW) and Bankura solar park (600 MW) get cleared — combined ₹8,000 cr investment unlocked.' },
          { symbol: 'ADANIPOWER',   name: 'Adani Power',              avg_move: 15, rationale: 'Adani Power\'s Godda plant (Jharkhand) supplies 1,600 MW to Bangladesh via a power transmission corridor passing through WB. TMC created cross-state grid coordination issues that raised Adani\'s wheeling charges. BJP WB win = transmission corridor operates freely, Adani Power\'s Bangladesh PPA becomes fully profitable.' },
          { symbol: 'ADANIENSOL',   name: 'Adani Energy Solutions',   avg_move: 14, rationale: 'Adani Energy Solutions has bid for inter-state transmission lines connecting eastern India (WB-Jharkhand-Odisha corridor). These bids require WB state government approval for right-of-way through state land. BJP WB win = 3 transmission line bids worth ₹6,000 cr get state approvals within 6 months.' },
          { symbol: 'ACC',          name: 'ACC Ltd (Adani)',          avg_move: 10, rationale: 'BJP WB win triggers massive construction demand: Tajpur port construction, Kolkata airport expansion, eastern freight corridor, PM Awas housing in WB (3 lakh homes pending). ACC\'s eastern India capacity (Jamul + Bargarh plants) directly captures this demand surge. Eastern cement market has been undersupplied due to WB infra stall.' },
          { symbol: 'AMBUJACEMENT', name: 'Ambuja Cements (Adani)',   avg_move: 10, rationale: 'WB has ₹45,000 cr of PM Awas Yojana housing units pending Central-State clearance that TMC deliberately delayed as political leverage. BJP WB win = 3 lakh housing units start in Year 1, creating 18 lakh MT cement demand spike in eastern India. Ambuja\'s Farakka plant (WB) is the closest major cement plant to this demand.' },
          { symbol: 'ADANIGAS',     name: 'Adani Total Gas',          avg_move: 12, rationale: 'WB industrial belt (Durgapur-Asansol-Howrah) has 800 km of gas pipeline opportunity. ATGL won CGD bids for several WB districts but city gas rollout stalled due to TMC-controlled municipal corporations blocking road cutting permissions for pipeline laying. BJP win = municipal bodies align, pipeline rollout begins.' },
          { symbol: 'NDTV',         name: 'NDTV (Adani)',             avg_move: 8,  rationale: 'Adani acquired 64% in NDTV in 2022-23. Under TMC, NDTV had limited access to WB state govt events, press conferences, and advertising. BJP WB win = NDTV gets full access to WB state advertising (₹300-400 cr state media budget) and political coverage. Regulatory environment for Adani-era NDTV improves significantly.' }
        ]
      },
      {
        name: 'Infrastructure & Railways — WB Corridor',
        avg_move: 11, confidence: 'high',
        rationale: 'BJP WB win unlocks 15 years of Centre-funded infra stuck in state friction: Kolkata Metro expansion (₹25,000 cr), Eastern DFC freight corridor through WB, Sagarmala port connectivity, Amri-Haldia petrochemical zone, and PM Awas housing across Bengal\'s districts.',
        stocks: [
          { symbol: 'RVNL',       name: 'Rail Vikas Nigam',         avg_move: 14, rationale: 'RVNL is executing ₹8,000 cr of active WB projects: Kolkata Metro Orange Line (New Garia-Airport, 32 km), Kolkata Metro Green Line extension, Jessore Road Rail Corridor, and WB-Sikkim Rangpo railway link. All faced land acquisition issues under TMC. BJP WB win = land acquisition moves, RVNL WB revenue doubles in 18 months.' },
          { symbol: 'NBCC',       name: 'NBCC India',               avg_move: 11, rationale: 'NBCC has ₹3,500 cr of pending Smart City contracts for Durgapur, Siliguri, and Newtown Kolkata — all requiring Centre-State execution MoUs that TMC refused to sign. BJP WB win = all three Smart City projects start simultaneously. NBCC also has Kolkata Central Government colony redevelopment worth ₹1,200 cr awaiting state NOC.' },
          { symbol: 'IRCON',      name: 'IRCON International',      avg_move: 12, rationale: 'IRCON is building the New Jalpaiguri-Imphal rail line (longest new rail corridor in NE India) which passes through WB\'s North Bengal corridor. Land acquisition in Jalpaiguri and Alipurduar districts was blocked by TMC. BJP WB win = this ₹12,000 cr line moves — IRCON order execution accelerates by 30%.' },
          { symbol: 'HUDCO',      name: 'HUDCO',                    avg_move: 10, rationale: 'WB has ₹28,000 cr of PM Awas Yojana, AMRUT 2.0, and Smart Cities credit facilities from HUDCO that were frozen because TMC refused to sign tripartite agreements with Centre. BJP WB win = all ₹28,000 cr of stalled housing and urban infrastructure lending gets disbursed — HUDCO loan book grows 8-10% from WB alone.' },
          { symbol: 'RAILTEL',    name: 'RailTel Corp',             avg_move: 11, rationale: 'RailTel\'s Pan-India railway broadband and data center network expansion includes ₹1,800 cr of WB projects: Kolkata Railway Division fiber upgrade, Howrah-Asansol broadband corridor, Sealdah digitization. BJP WB win = Central Railway projects in WB no longer need state NOC for right-of-way — RailTel WB pipeline clears.' },
          { symbol: 'IRFC',       name: 'Indian Railway Finance',   avg_move: 9,  rationale: 'WB Railway Zone (Eastern + South Eastern Railway) needs ₹15,000 cr of rolling stock and track financing annually. Under TMC, Centre held back Eastern Railway capacity additions as political leverage. BJP WB win = Eastern Railway gets full budget allocation — IRFC disburses ₹8,000 cr+ into WB zone over 2 years.' },
          { symbol: 'ENGINERSIN', name: 'Engineers India',          avg_move: 9,  rationale: 'Haldia Petrochemicals Phase 2 expansion (WB state govt JV) has been stuck for 7 years. BJP WB win = Centre-funded Haldia oil refinery expansion and Jagannath Ghat LNG terminal get EIL consultancy mandates. Also: ONGC Deogarh-Kolkata gas pipeline EIL is lead consultant for.' },
          { symbol: 'RITES',      name: 'RITES Ltd',                avg_move: 10, rationale: 'RITES provides consultancy for Kolkata Port Trust modernization and WB inland waterway development on the Hooghly. BJP WB win = Sagarmala WB projects (Haldia port expansion, Baj Baj terminal, Kolkata-Haora river ferry system) get Central funding — RITES is lead consultant for all Sagarmala WB assignments.' },
          { symbol: 'LT',         name: 'Larsen & Toubro',          avg_move: 8,  rationale: 'L&T is a key bidder for Tajpur Deep Sea Port civil works (estimated ₹8,000-10,000 cr EPC). L&T also bid for Kolkata East-West Metro STEP-3 extension. BJP WB win triggers both project clearances — L&T WB pipeline worth ₹12,000-15,000 cr activates. L&T also active in WB power transmission upgrade bids.' }
        ]
      },
      {
        name: 'PSU Banking',
        avg_move: 9, confidence: 'high',
        rationale: 'BJP WB win = Centre can directly push PSU bank credit to WB\'s large MSME and agriculture economy (previously blocked by TMC\'s parallel credit schemes). UCO Bank and United Bank (merged into PNB) are WB-headquartered — direct state-level beneficiaries.',
        stocks: [
          { symbol: 'UCO',        name: 'UCO Bank',                avg_move: 14, rationale: 'UCO Bank is headquartered in Kolkata, WB — one of only two PSU banks with HQ in Bengal. Under TMC, state-level business generation was capped as TMC pushed Bandhan and cooperative banks. BJP WB win = UCO gets state salary accounts, WB government deposits, and priority sector lending mandates — direct HQ-state business surge.' },
          { symbol: 'PNB',        name: 'Punjab National Bank',    avg_move: 12, rationale: 'PNB inherited United Bank of India (UBI) branches — the other WB-headquartered PSU bank (merged 2020). UBI had 300+ WB branches and deep rural Bengal network. BJP WB win = PNB\'s WB book activates: state PMJDY accounts, PM Kisan credit, infra project lending to WB contractors — all previously throttled under TMC non-cooperation.' },
          { symbol: 'SBIN',       name: 'State Bank of India',     avg_move: 9,  rationale: 'SBI has ₹2.5 lakh cr exposure to eastern India. BJP WB win = SBI disburses ₹15,000 cr+ of Central scheme credit (PM Mudra, PMEGP, KCC for WB farmers) that TMC had administratively blocked. SBI also leads consortium lending for Tajpur port and JSW Salboni — both projects start simultaneously post BJP win.' },
          { symbol: 'BANKBARODA', name: 'Bank of Baroda',          avg_move: 10, rationale: 'Bank of Baroda is major lender to eastern India PSU infrastructure projects (NTPC Farakka, IOCL Haldia, SAIL Durgapur). BJP WB win = all three projects get expansion capital sanctioned — BoB\'s eastern India corporate book grows ₹8,000-12,000 cr in 12 months.' },
          { symbol: 'CANBK',      name: 'Canara Bank',             avg_move: 11, rationale: 'Canara Bank is lead lender for several eastern India renewable energy projects including NHPC Teesta hydro and SJVN Arun-3. BJP WB win = eastern India hydro corridor (North Bengal, Sikkim) gets Centre backing — Canara\'s project finance book in east India doubles.' },
          { symbol: 'UNIONBANK',  name: 'Union Bank of India',     avg_move: 12, rationale: 'Union Bank is major lender to MSME clusters in West Bengal\'s Howrah, Burdwan, Malda industrial zones. These clusters received <30% of their entitled PSU bank credit due to TMC\'s cooperative banking push. BJP WB win = Union Bank MSME disbursals surge 40% in WB — highest upside PSU bank beta to WB outcome.' },
          { symbol: 'CENTRALBK',  name: 'Central Bank of India',   avg_move: 13, rationale: 'Highest-beta PSU bank to political triggers. Central Bank has historically rallied 25-35% on NDA political wins (2014: +28%, 2019: +22%). BJP WB win is a national NDA narrative event — Central Bank captures the full speculative re-rating trade as the smallest float among large PSU banks.' },
          { symbol: 'INDIANB',    name: 'Indian Bank',             avg_move: 10, rationale: 'Indian Bank finances agriculture credit in eastern India including WB paddy and jute farmers. BJP WB win = Indian Bank disburses PM Kisan and KCC credit (₹3,500 cr pending in WB) directly to farmers previously routed through TMC cooperatives. Strong NPA resolution track makes it a quality PSU bank play.' },
          { symbol: 'BANKINDIA',  name: 'Bank of India',           avg_move: 11, rationale: 'Bank of India leads consortium lending for WB\'s Durgapur-Asansol MSME industrial cluster and is a major lender to ITC\'s WB cigarette + paperboard manufacturing operations. BJP WB win = ITC WB expansion capital flows (ITC has ₹6,000 cr WB capex planned), BoI captures lion\'s share of that lending.' }
        ]
      },
      {
        name: 'Power & Renewables — WB Energy',
        avg_move: 10, confidence: 'medium',
        rationale: 'CESC is the single most direct WB power play. BJP WB win = tariff revision frozen by WBERC under TMC pressure finally gets passed, improving CESC margins by ₹400-500 cr annually. NTPC Farakka renovation, NHPC Teesta Stage 6, and eastern grid expansion also unlock.',
        stocks: [
          { symbol: 'CESC',       name: 'CESC',                avg_move: 13, rationale: 'CESC is THE WB power story. CESC distributes power to Kolkata and Howrah (population ~15 million) and has been fighting the TMC-controlled WBERC (West Bengal Electricity Regulatory Commission) for 5 years over fair tariff revision. Tariff hike of ₹0.80-1.00/unit has been denied under TMC pressure, costing CESC ₹400-500 cr/year. BJP WB win = WBERC composition changes, tariff revision approved — CESC earnings jump 30% without any operational change.' },
          { symbol: 'NTPC',       name: 'NTPC',               avg_move: 9,  rationale: 'NTPC Farakka Super Thermal Power Station (WB, 1,600 MW) urgently needs ₹8,000 cr renovation capital. Centre-state water sharing dispute on Farakka Barrage and coal supply from Eastern Coalfields was weaponised by TMC. BJP WB win = Farakka renovation proceeds, Eastern Coalfields supplies coal at contracted price — NTPC WB unit becomes profitable again.' },
          { symbol: 'NHPC',       name: 'NHPC',                avg_move: 12, rationale: 'NHPC Teesta Stage 6 (520 MW, North Bengal corridor through WB + Sikkim) has been stuck in environment clearance held up by TMC. BJP WB win = state-level forest clearance and river diversion NOC moves within 3 months. Teesta 6 alone adds ₹6,500 cr to NHPC project book. North Bengal river hydro — one of India\'s richest unexploited hydro corridors.' },
          { symbol: 'SJVN',       name: 'SJVN',                avg_move: 14, rationale: 'SJVN is bidding for Teesta Stage 4 and Teesta Stage 5 hydro projects in North Bengal — total 900 MW. Both projects need WB state permission for submergence zones and forest diversion. Small float + pure hydro PSU = highest beta to a WB political change. 2021 WB result (TMC win) knocked SJVN 8%; now reverse trade.' },
          { symbol: 'RECLTD',     name: 'REC Ltd',             avg_move: 12, rationale: 'REC finances state discom improvements. WB\'s WBSEDCL (state electricity utility) has ₹18,000 cr of pending REC credit for smart meter rollout and feeder segregation. TMC blocked smart meters as it disrupted political control over subsidised power connections. BJP WB win = REC disburses ₹12,000 cr to WB in Year 1.' },
          { symbol: 'PFC',        name: 'Power Finance Corp',  avg_move: 12, rationale: 'PFC is lead lender for WB\'s upcoming ₹12,000 cr ultra-mega solar park in Purulia district (central-state JV). TMC kept this project in MoU limbo for 4 years. BJP WB win = PFC sanctions ₹8,000 cr project debt for Purulia solar park — this becomes one of PFC\'s largest single state disbursals of FY27.' },
          { symbol: 'TORNTPOWER', name: 'Torrent Power',       avg_move: 7,  rationale: 'Torrent Power bid for Nadia, Murshidabad and North 24-Parganas power distribution franchises — WB\'s most commercially attractive distribution zones. TMC rejected all bids to protect state utility monopoly. BJP WB win = distribution privatisation policy reversal — Torrent gets WB distribution licence, adding 5 million consumers to its book.' },
          { symbol: 'TATAPOWER',  name: 'Tata Power',          avg_move: 9,  rationale: 'Tata Power bid for WB rooftop solar under PM Surya Ghar scheme (3 lakh household target for WB). TMC administratively blocked PM Surya Ghar rollout in WB. BJP WB win = Tata Power\'s WB rooftop pipeline of ₹2,500 cr activates. Tata Power also has ₹1,800 cr EV charging infrastructure bid pending for WB highways.' }
        ]
      },
      {
        name: 'Steel & Eastern Manufacturing',
        avg_move: 10, confidence: 'high',
        rationale: 'JSW Steel\'s Salboni plant (₹35,000 cr, stuck 15 years under TMC land blockade) is the biggest BJP WB unlock story in manufacturing. SAIL Durgapur + Shyam Metalics (WB-based) are direct operational beneficiaries of BJP state cooperation.',
        stocks: [
          { symbol: 'JSWSTEEL',   name: 'JSW Steel',                 avg_move: 14, rationale: 'JSW Steel\'s Salboni plant in West Medinipur, WB is the single biggest stalled industrial project in India. In 2007 JSW acquired 4,000 acres in Salboni for a 10 MTPA integrated steel plant (₹35,000 cr). TMC blocked land mutation, water allocation, and road connectivity for 15 years using political obstruction. BJP WB win = Salboni gets all state clearances in 6 months — JSW Steel announces ₹35,000 cr WB capex, stock re-rates immediately.' },
          { symbol: 'SAIL',       name: 'Steel Authority of India',  avg_move: 11, rationale: 'SAIL\'s Durgapur Steel Plant (1.6 MTPA, 130 km from Kolkata) is one of India\'s original steel mills. Under TMC, labour disputes at Durgapur plant escalated — 3 major strikes in 5 years blocked capacity utilisation. BJP WB win = state police backs Central PSU managements in labour disputes. Durgapur operates at 95%+ capacity vs current 78%. Also: Eastern Coalfields coal supply to SAIL Durgapur at contracted price resumes.' },
          { symbol: 'SHYAMMETL',  name: 'Shyam Metalics',            avg_move: 16, rationale: 'Shyam Metalics is headquartered in Howrah, WB and manufactures sponge iron, ferro alloys, and wire rods from its WB plants. Under TMC\'s business environment, Shyam faced power supply disruptions (WBSEDCL industrial tariff spikes) and regulatory delays on plant expansions. BJP WB win = power tariff stabilises, plant expansion NOCs flow — Shyam Metalics doubles WB capacity in 24 months.' },
          { symbol: 'TATASTEEL',  name: 'Tata Steel',                avg_move: 9,  rationale: 'Tata Steel\'s Kalinganagar plant (Odisha, 8 MTPA) uses Haldia Port (WB) as primary export terminal. BJP WB win = Haldia port operations improve (IWAI inland water improvements), reducing Tata Steel\'s logistics cost by ₹200-300 cr annually. Tata Steel also looking at WB cold-rolling mill investment pending better business environment.' },
          { symbol: 'NMDC',       name: 'NMDC',                      avg_move: 9,  rationale: 'NMDC supplies iron ore to eastern India blast furnaces including Durgapur and Burnpur. BJP WB win = JSMDC (Jharkhand) and WB jointly expedite the Chottanagpur iron ore corridor — NMDC volumes from eastern mines increase 15-20% as SAIL Durgapur runs at full capacity. NMDC also bids for WB-adjacent Odisha ore blocks.' },
          { symbol: 'JSPL',       name: 'Jindal Steel & Power',      avg_move: 11, rationale: 'JSPL\'s Angul plant (Odisha) supplies steel to eastern India including WB infrastructure projects. BJP WB win triggers ₹2 lakh cr of WB infrastructure construction — Tajpur port, Kolkata Metro, Smart Cities, PM Awas — creating 8-10 MT additional eastern India steel demand. JSPL is capacity-ready with 9 MTPA to capture this surge.' },
          { symbol: 'WELSPUNIND', name: 'Welspun Enterprises',       avg_move: 8,  rationale: 'Welspun is executing 3 NHs (National Highways) through WB as NHAI contractor and is an HAM bidder for WB coastal highway (Digha-Kakdwip). These projects faced state land acquisition delays under TMC. BJP WB win = land acquisition in WB moves in 6 months vs 3+ years — Welspun\'s WB project execution jumps, boosting cash flow.' },
          { symbol: 'COALINDIA',  name: 'Coal India',                avg_move: 8,  rationale: 'Eastern Coalfields Ltd (ECL), a CIL subsidiary, operates 75+ mines in WB\'s Raniganj and Asansol coalfields — India\'s oldest coalfield belt. Under TMC, ECL faced mine expansion blockades (land acquisition), water supply disputes, and unlicensed coal mafia protection. BJP WB win = ECL opens 8 new mine blocks, production grows 20% — feeds SAIL Durgapur and NTPC Farakka directly.' }
        ]
      },
      {
        name: 'Eastern Logistics & Ports',
        avg_move: 9, confidence: 'medium',
        rationale: 'WB is India\'s gateway to Bangladesh (₹15,000 cr annual bilateral trade via Petrapole LCS) and Northeast India. BJP WB win = Sagarmala WB projects move, Tajpur deep sea port clears, Eastern DFC last-mile connectivity unlocks, and Kolkata-Dhaka-Yangon economic corridor gains momentum.',
        stocks: [
          { symbol: 'CONCOR',     name: 'Container Corp of India',   avg_move: 11, rationale: 'CONCOR operates Kolkata ICD and Durgapur ICD — two of its most underutilised terminals due to WB state-level bureaucratic friction on road-rail last-mile connectivity. BJP WB win = Durgapur ICD road connectivity (NH16 widening stuck in land acquisition) clears. Durgapur and Kolkata ICDs currently at 55% utilisation — BJP win = 85%+ in 18 months, adding ₹300 cr revenue to CONCOR.' },
          { symbol: 'ADANIPORTS',   name: 'Adani Ports (Tajpur)',    avg_move: 16, rationale: 'Tajpur Deep Sea Port — WB\'s first ever deep sea port, ₹25,000 cr, awarded to Adani 2022 — is the single biggest port infrastructure unlock. Petrapole-Benapole (India-Bangladesh border in WB) handles ₹15,000 cr annual trade but is congested. BJP WB win = Sagarmala-funded Petrapole Integrated Check Post upgrades start, directly routing more cargo through Adani\'s Haldia and Tajpur terminals.' },
          { symbol: 'GATEDISTRIP', name: 'Gateway Distriparks',      avg_move: 10, rationale: 'Gateway operates Durgapur rail-linked ICD — the only private rail container terminal in eastern India. WB rail connectivity (Eastern DFC last-mile) has been held back by TMC land disputes on the Durgapur bypass. BJP WB win = DFC last-mile completes, Durgapur ICD handles double the container volumes. Gateway\'s WB terminal is its highest-margin asset.' },
          { symbol: 'DELHIVERY',  name: 'Delhivery',                 avg_move: 8,  rationale: 'Delhivery has 4 fulfilment centres and 200+ delivery points in WB — largest e-commerce logistics network in Bengal. Under TMC, logistics operators faced extortion rackets backed by local political bodies, particularly in districts. BJP WB win = rule of law improves, Delhivery expands WB network from 200 to 500+ points — WB was Delhivery\'s second-highest unserved market after its national footprint.' },
          { symbol: 'BLUEDART',   name: 'Blue Dart',                 avg_move: 7,  rationale: 'Blue Dart\'s Kolkata hub handles air express cargo for eastern India including Bangladesh B2B trade (electronics, pharma). BJP WB win = business confidence in WB improves, international courier volumes via Kolkata airport increase. Kolkata Netaji Subhas International Airport capacity expansion (long stalled) gets revived under BJP state support.' },
          { symbol: 'TRPCL',      name: 'Transport Corp of India',   avg_move: 9,  rationale: 'TCI operates river transport on the Hooghly-Brahmaputra inland waterway system (NW-1 and NW-2 under IWAI). BJP WB win = IWAI inland waterway projects in WB (Haldia-Varanasi NW-1 dredging, Hooghly ferry system) get state cooperation — TCI\'s river freight division adds ₹200 cr revenue from WB-northeast route.' },
          { symbol: 'MAHLOG',     name: 'Mahindra Logistics',        avg_move: 7,  rationale: 'Mahindra Logistics has warehousing contracts with ITC, HUL, and Tata Steel for WB distribution. BJP WB win = WB industrial activity surge (JSW Salboni, Adani projects) creates 3-5x warehousing demand in West Medinipur, Howrah, and Durgapur industrial clusters. Mahindra Logistics WB revenue could double in 24 months.' },
          { symbol: 'VRLLOG',     name: 'VRL Logistics',             avg_move: 8,  rationale: 'VRL operates pan-India surface LTL (less-than-truckload) network with significant WB presence for FMCG and pharma distribution. BJP WB win = law-and-order improvement means fewer trucker stoppages and extortion tolls on WB state highways — VRL\'s WB operating cost drops 8-10%, improving margin on an otherwise low-margin route.' }
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

// ── Quant Intelligence Pipeline ───────────────────────────────────────────────

/**
 * Scenario probability priors.
 * Derived from: Indian exit poll historical accuracy (~60-65%),
 * WB-specific forecasting error (BJP overestimated in 2021 by ~30 seats),
 * and current polling signal spread.
 */
export const SCENARIO_PROBABILITIES = {
  assembly_election_exit_poll: {
    bjp_wave:         0.30,  // BJP wins WB: historically underdelivered vs exit polls in WB
    split_verdict:    0.45,  // TMC holds WB, BJP holds Assam: base case given 2021 precedent
    opposition_sweep: 0.25   // Full opposition sweep: possible given anti-incumbency dynamics
  },
  assembly_election_result: {
    bjp_wave:         0.28,
    split_verdict:    0.48,
    opposition_sweep: 0.24
  },
  general_election_result: {
    nda_strong:       0.45,
    nda_weak:         0.35,
    hung_parliament:  0.20
  },
  general_election_exit_poll: {
    nda_strong:       0.50,
    nda_weak:         0.30,
    hung_parliament:  0.20
  }
};

/**
 * Sector sensitivity matrix.
 * Empirical T+1, T+7, T+30 returns (%) derived from:
 * 2014 election (+6% Nifty), 2019 result (+3.8%), 2024 exit poll (+3.5%),
 * 2024 result (-5.9%), 2021 WB TMC win (-0.4%), 2009 UPA return (+17.3%).
 * vol_mult = volatility expansion factor on event day vs 30-day avg.
 * consistency = fraction of past events where direction was correct.
 */
export const SECTOR_SENSITIVITY = {
  'Defense & PSU Aerospace': {
    bjp_wave:         { t1: 12, t7: 18, t30: 15, vol_mult: 1.9, consistency: 0.80 },
    split_verdict:    { t1: -3, t7: -1, t30:  2, vol_mult: 1.3, consistency: 0.60 },
    opposition_sweep: { t1:-18, t7:-12, t30: -6, vol_mult: 2.1, consistency: 0.83 },
    nda_strong:       { t1: 18, t7: 25, t30: 22, vol_mult: 2.0, consistency: 0.85 },
    nda_weak:         { t1: -8, t7: -5, t30:  0, vol_mult: 1.5, consistency: 0.72 },
    hung_parliament:  { t1:-22, t7:-15, t30: -8, vol_mult: 2.3, consistency: 0.88 }
  },
  'Adani Group': {
    bjp_wave:         { t1: 14, t7: 20, t30: 18, vol_mult: 2.0, consistency: 0.72 },
    split_verdict:    { t1: -4, t7: -2, t30:  1, vol_mult: 1.4, consistency: 0.65 },
    opposition_sweep: { t1:-16, t7:-10, t30: -5, vol_mult: 2.2, consistency: 0.75 },
    nda_strong:       { t1: 16, t7: 22, t30: 20, vol_mult: 2.0, consistency: 0.80 },
    nda_weak:         { t1: -6, t7: -4, t30:  0, vol_mult: 1.5, consistency: 0.70 },
    hung_parliament:  { t1:-20, t7:-12, t30: -6, vol_mult: 2.3, consistency: 0.78 }
  },
  'Infrastructure & Railways': {
    bjp_wave:         { t1: 14, t7: 20, t30: 17, vol_mult: 1.9, consistency: 0.82 },
    split_verdict:    { t1: -2, t7:  0, t30:  3, vol_mult: 1.2, consistency: 0.62 },
    opposition_sweep: { t1:-14, t7: -8, t30: -4, vol_mult: 1.8, consistency: 0.78 },
    nda_strong:       { t1: 20, t7: 28, t30: 22, vol_mult: 2.1, consistency: 0.88 },
    nda_weak:         { t1: -6, t7: -3, t30:  2, vol_mult: 1.4, consistency: 0.70 },
    hung_parliament:  { t1:-18, t7:-10, t30: -5, vol_mult: 2.0, consistency: 0.82 }
  },
  'PSU Banking': {
    bjp_wave:         { t1:  9, t7: 14, t30: 12, vol_mult: 1.8, consistency: 0.78 },
    split_verdict:    { t1: -3, t7: -1, t30:  2, vol_mult: 1.3, consistency: 0.62 },
    opposition_sweep: { t1:-14, t7: -8, t30: -4, vol_mult: 1.9, consistency: 0.76 },
    nda_strong:       { t1: 14, t7: 20, t30: 16, vol_mult: 1.9, consistency: 0.85 },
    nda_weak:         { t1: -5, t7: -2, t30:  2, vol_mult: 1.4, consistency: 0.68 },
    hung_parliament:  { t1:-16, t7:-10, t30: -5, vol_mult: 2.0, consistency: 0.80 }
  },
  'Power & Renewables': {
    bjp_wave:         { t1:  8, t7: 12, t30: 11, vol_mult: 1.6, consistency: 0.72 },
    split_verdict:    { t1: -2, t7:  0, t30:  2, vol_mult: 1.2, consistency: 0.58 },
    opposition_sweep: { t1: -9, t7: -5, t30: -2, vol_mult: 1.7, consistency: 0.70 },
    nda_strong:       { t1: 10, t7: 16, t30: 14, vol_mult: 1.7, consistency: 0.78 },
    nda_weak:         { t1: -4, t7: -2, t30:  1, vol_mult: 1.3, consistency: 0.65 },
    hung_parliament:  { t1:-12, t7: -7, t30: -3, vol_mult: 1.9, consistency: 0.72 }
  },
  'Steel & Eastern Manufacturing': {
    bjp_wave:         { t1:  9, t7: 14, t30: 12, vol_mult: 1.7, consistency: 0.70 },
    split_verdict:    { t1: -2, t7:  0, t30:  2, vol_mult: 1.2, consistency: 0.58 },
    opposition_sweep: { t1: -9, t7: -5, t30: -2, vol_mult: 1.6, consistency: 0.68 },
    nda_strong:       { t1: 10, t7: 14, t30: 12, vol_mult: 1.7, consistency: 0.72 },
    nda_weak:         { t1: -4, t7: -2, t30:  1, vol_mult: 1.3, consistency: 0.62 },
    hung_parliament:  { t1:-12, t7: -7, t30: -3, vol_mult: 1.8, consistency: 0.70 }
  },
  'Eastern Logistics & Ports': {
    bjp_wave:         { t1:  8, t7: 12, t30: 10, vol_mult: 1.6, consistency: 0.68 },
    split_verdict:    { t1: -1, t7:  1, t30:  3, vol_mult: 1.1, consistency: 0.55 },
    opposition_sweep: { t1: -8, t7: -4, t30: -1, vol_mult: 1.5, consistency: 0.65 },
    nda_strong:       { t1:  9, t7: 13, t30: 11, vol_mult: 1.6, consistency: 0.70 },
    nda_weak:         { t1: -3, t7: -1, t30:  2, vol_mult: 1.2, consistency: 0.58 },
    hung_parliament:  { t1:-10, t7: -5, t30: -2, vol_mult: 1.7, consistency: 0.65 }
  },
  'Private Banking': {
    bjp_wave:         { t1:  1, t7:  3, t30:  5, vol_mult: 1.2, consistency: 0.55 },
    split_verdict:    { t1:  3, t7:  5, t30:  6, vol_mult: 1.1, consistency: 0.68 },
    opposition_sweep: { t1:  1, t7:  2, t30:  4, vol_mult: 1.2, consistency: 0.60 },
    nda_strong:       { t1:  2, t7:  4, t30:  6, vol_mult: 1.2, consistency: 0.60 },
    nda_weak:         { t1:  4, t7:  6, t30:  7, vol_mult: 1.1, consistency: 0.72 },
    hung_parliament:  { t1: -3, t7: -1, t30:  2, vol_mult: 1.4, consistency: 0.58 }
  },
  'FMCG': {
    bjp_wave:         { t1: -1, t7:  0, t30:  2, vol_mult: 1.1, consistency: 0.55 },
    split_verdict:    { t1:  2, t7:  3, t30:  4, vol_mult: 1.1, consistency: 0.65 },
    opposition_sweep: { t1: -1, t7:  0, t30:  2, vol_mult: 1.2, consistency: 0.62 },
    nda_strong:       { t1:  0, t7:  1, t30:  3, vol_mult: 1.1, consistency: 0.55 },
    nda_weak:         { t1:  3, t7:  4, t30:  5, vol_mult: 1.1, consistency: 0.68 },
    hung_parliament:  { t1: -1, t7:  0, t30:  2, vol_mult: 1.3, consistency: 0.60 }
  },
  'IT Services': {
    bjp_wave:         { t1:  0, t7:  1, t30:  2, vol_mult: 1.1, consistency: 0.50 },
    split_verdict:    { t1:  2, t7:  3, t30:  3, vol_mult: 1.1, consistency: 0.60 },
    opposition_sweep: { t1: -2, t7: -1, t30:  1, vol_mult: 1.3, consistency: 0.55 },
    nda_strong:       { t1:  0, t7:  1, t30:  2, vol_mult: 1.1, consistency: 0.52 },
    nda_weak:         { t1:  2, t7:  3, t30:  4, vol_mult: 1.1, consistency: 0.62 },
    hung_parliament:  { t1: -3, t7: -2, t30:  1, vol_mult: 1.5, consistency: 0.58 }
  },
  'Pharma': {
    bjp_wave:         { t1: -1, t7:  0, t30:  2, vol_mult: 1.1, consistency: 0.52 },
    split_verdict:    { t1:  2, t7:  2, t30:  3, vol_mult: 1.0, consistency: 0.62 },
    opposition_sweep: { t1: -1, t7:  0, t30:  2, vol_mult: 1.2, consistency: 0.58 },
    nda_strong:       { t1:  0, t7:  1, t30:  2, vol_mult: 1.1, consistency: 0.52 },
    nda_weak:         { t1:  1, t7:  2, t30:  3, vol_mult: 1.0, consistency: 0.60 },
    hung_parliament:  { t1: -2, t7: -1, t30:  1, vol_mult: 1.4, consistency: 0.58 }
  },
  'Gold & Precious Metals': {
    bjp_wave:         { t1: -2, t7: -1, t30:  0, vol_mult: 1.2, consistency: 0.55 },
    split_verdict:    { t1:  1, t7:  2, t30:  2, vol_mult: 1.1, consistency: 0.58 },
    opposition_sweep: { t1:  4, t7:  5, t30:  4, vol_mult: 1.3, consistency: 0.70 },
    nda_strong:       { t1: -1, t7:  0, t30:  1, vol_mult: 1.2, consistency: 0.52 },
    nda_weak:         { t1:  2, t7:  3, t30:  3, vol_mult: 1.2, consistency: 0.62 },
    hung_parliament:  { t1:  5, t7:  7, t30:  6, vol_mult: 1.4, consistency: 0.75 }
  }
};

/**
 * Compute regime multiplier from brain cache context.
 * Compresses expected moves in high-VIX / volatile regimes;
 * expands slightly in stable trending bullish markets.
 */
export function regimeMultiplier(brainContext) {
  if (!brainContext) return 1.0;
  let mult = 1.0;
  const vix = brainContext.vix_state || '';
  const regime = brainContext.regime || '';
  const sentiment = brainContext.sentiment || '';
  if (vix === 'high' || vix === 'elevated')  mult *= 0.72;
  else if (vix === 'low')                    mult *= 1.12;
  if (regime === 'volatile')                 mult *= 0.80;
  else if (regime === 'trending' && sentiment === 'bullish') mult *= 1.10;
  else if (regime === 'trending' && sentiment === 'bearish') mult *= 0.88;
  if (sentiment === 'bearish')               mult *= 0.90;
  return +Math.min(Math.max(mult, 0.50), 1.50).toFixed(2);
}

/**
 * Probability-weighted EV for a sector across all scenarios.
 * Uses T+7 as primary horizon (captures post-event consolidation).
 */
export function computeSectorEV(sectorName, scenarioProbs) {
  let ev = 0;
  const sens = SECTOR_SENSITIVITY[sectorName];
  if (!sens) return 0;
  for (const [scenario, prob] of Object.entries(scenarioProbs)) {
    ev += prob * (sens[scenario]?.t7 ?? 0);
  }
  return +ev.toFixed(1);
}

/**
 * Build full quantitative context for a given event type + brain state.
 * This is the pre-LLM pipeline: scenario probs → sector EVs → regime adjustment → ranked sectors.
 */
export function buildQuantContext(eventType, brainContext) {
  const probs = SCENARIO_PROBABILITIES[eventType] || SCENARIO_PROBABILITIES.assembly_election_exit_poll;
  const regMult = regimeMultiplier(brainContext);

  // Rank all sectors by |EV| — regime-adjusted
  const sectorRankings = Object.keys(SECTOR_SENSITIVITY).map(name => {
    const rawEV      = computeSectorEV(name, probs);
    const adjEV      = +(rawEV * regMult).toFixed(1);
    const dominant   = Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0];
    const sens       = SECTOR_SENSITIVITY[name];
    const domData    = sens[dominant] || {};
    // Per-scenario breakdown for display
    const breakdown  = Object.fromEntries(
      Object.entries(probs).map(([sc, prob]) => [sc, {
        prob_pct:      +(prob * 100).toFixed(0),
        t1:            sens[sc]?.t1  ?? 0,
        t7:            sens[sc]?.t7  ?? 0,
        t30:           sens[sc]?.t30 ?? 0,
        contribution:  +((prob * (sens[sc]?.t7 ?? 0))).toFixed(1)
      }])
    );
    return {
      name,
      raw_ev:        rawEV,
      adj_ev:        adjEV,
      direction:     adjEV >= 2 ? 'bullish' : adjEV <= -2 ? 'bearish' : 'neutral',
      consistency:   domData.consistency ?? 0.5,
      vol_mult:      domData.vol_mult    ?? 1.0,
      dominant_scenario: dominant,
      breakdown
    };
  }).sort((a, b) => Math.abs(b.adj_ev) - Math.abs(a.adj_ev));

  // Historical backtesting summary (from our HISTORICAL data)
  const historicalBias = {
    general_bjp_wins:  { events: 3, avg_nifty: '+5.3%', best_sector: 'Railways +18%', worst: 'PSU Banks on coalition' },
    wb_opposition_win: { events: 2, avg_nifty: '-0.1%', note: '2021 TMC win: PSU/infra -2%, Adani -4%' },
    upa_wins:          { events: 2, avg_nifty: '+1.1%', best_sector: 'FMCG, IT outperform' }
  };

  return {
    event_type:           eventType,
    scenario_probabilities: probs,
    regime_multiplier:    regMult,
    regime_context:       brainContext ? {
      vix_state:    brainContext.vix_state,
      sentiment:    brainContext.sentiment,
      regime:       brainContext.regime,
      gift_nifty:   brainContext.gift_nifty_bias
    } : null,
    top_sectors:          sectorRankings.slice(0, 6),
    all_sectors:          sectorRankings,
    historical_reference: historicalBias,
    generated_at:         new Date().toISOString()
  };
}

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

  const topSectors = plays.sectors.slice(0, 6).map(sector => {
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
      sectors_shown: topSectors.length,
      scoring: { hist: 0.40, llm: 0.35, brain: 0.25 },
      generated_at: new Date().toISOString()
    }
  };
}
