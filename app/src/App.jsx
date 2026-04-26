// app/src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import IntradayScanner from './pages/IntradayScanner.jsx';
import ResearchDesk from './pages/ResearchDesk.jsx';
import TradeJournal from './pages/TradeJournal.jsx';
import Connect from './pages/Connect.jsx';

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main
          className="flex-1 overflow-y-auto p-6"
          style={{ background: 'var(--bg)' }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/intraday" element={<IntradayScanner />} />
            <Route path="/research" element={<ResearchDesk />} />
            <Route path="/journal" element={<TradeJournal />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/reports" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
