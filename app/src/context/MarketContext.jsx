// app/src/context/MarketContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchBrain, fetchPortfolio } from '../lib/api.js';

const MarketContext = createContext(null);

const REFRESH_MS = 30 * 60 * 1000; // 30 minutes

export function MarketProvider({ children }) {
  const [brain, setBrain] = useState(null);
  const [brainUpdatedAt, setBrainUpdatedAt] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [loadingBrain, setLoadingBrain] = useState(false);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  const loadBrain = useCallback(async (force = false) => {
    setLoadingBrain(true);
    try {
      const data = await fetchBrain(force);
      if (data) {
        setBrain(data);
        setBrainUpdatedAt(new Date());
      }
    } catch {
      // silently fail — brain stays null
    } finally {
      setLoadingBrain(false);
    }
  }, []);

  const loadPortfolio = useCallback(async () => {
    setLoadingPortfolio(true);
    try {
      const data = await fetchPortfolio();
      if (data) setPortfolio(data);
    } catch {
      // silently fail
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    loadBrain();
    loadPortfolio();
    const interval = setInterval(() => loadBrain(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadBrain, loadPortfolio]);

  // Derived from brain
  const picks = brain?.picks ?? [];
  const regime = brain?.regime ?? null;
  const macro_risk = brain?.macro_risk ?? null;
  const gift_nifty_bias = brain?.gift_nifty_bias ?? null;
  const vix_state = brain?.vix_state ?? null;
  const market_sentiment = brain?.market_sentiment ?? null;
  const monitor = brain?.monitor ?? null;
  const algo_note = brain?.algo_note ?? null;

  // Derived from portfolio
  const holdings = portfolio?.holdings ?? [];
  const pnl_summary = portfolio?.pnl_summary ?? null;

  const value = {
    // Brain
    brain,
    picks,
    regime,
    macro_risk,
    gift_nifty_bias,
    vix_state,
    market_sentiment,
    monitor,
    algo_note,
    brainUpdatedAt,
    loadingBrain,
    refreshBrain: () => loadBrain(true),

    // Portfolio
    holdings,
    pnl_summary,
    loadingPortfolio,
    refreshPortfolio: loadPortfolio,
  };

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used inside MarketProvider');
  return ctx;
}
