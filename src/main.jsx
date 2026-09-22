import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { seedIfNeeded } from './db/seed.js';
import { Store, Wifi } from 'lucide-react';

function SeedLoader({ children }) {
  const [ready, setReady] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    async function init() {
      const wasFresh = await seedIfNeeded();
      if (wasFresh) {
        setSeeding(true);
        // Show "syncing" screen briefly to simulate initial data pull
        await new Promise((r) => setTimeout(r, 1800));
        setSeeding(false);
      }
      setReady(true);
    }
    init();
  }, []);

  if (!ready) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #f7f9ff 0%, #eef2ff 100%)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 32,
        }}>
          <span style={{
            display: 'grid', placeItems: 'center', width: 48, height: 48,
            borderRadius: 14, background: '#335CFF', color: '#fff', boxShadow: '0 8px 20px #335cff30',
          }}>
            <Store size={24} />
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Retail<span style={{ color: '#335CFF' }}>Sync</span>
          </span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#fff', border: '1px solid #e6eaf4', borderRadius: 16,
            padding: '14px 24px', boxShadow: '0 8px 30px #24346410',
          }}>
            <Wifi size={18} color="#335CFF" className="animate-pulse" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#335CFF' }}>
              {seeding ? 'Syncing initial data…' : 'Initialising database…'}
            </span>
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
            Setting up your offline store. This happens once.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SeedLoader>
      <App />
    </SeedLoader>
  </React.StrictMode>
);
