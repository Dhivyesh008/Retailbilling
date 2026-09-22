import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { Store, Wifi } from 'lucide-react';
import { supabase } from './lib/supabase.js';

// Seed loyalty tiers into IndexedDB only — products/customers come from Supabase now
import { loyaltyTiersDB } from './db/db.js';

const LOYALTY_SEED_FLAG = 'retailsync_loyalty_seeded_v1';

async function seedLoyaltyTiersIfNeeded() {
  if (localStorage.getItem(LOYALTY_SEED_FLAG)) return;
  const tiers = [
    { id: 'lt-001', label: 'Silver', minVisits: 3, discountPercent: 5,  active: true },
    { id: 'lt-002', label: 'Gold',   minVisits: 7, discountPercent: 10, active: true },
  ];
  for (const t of tiers) await loyaltyTiersDB.put(t);
  localStorage.setItem(LOYALTY_SEED_FLAG, '1');
}

function SeedLoader({ children }) {
  const [ready,  setReady]  = useState(false);
  const [status, setStatus] = useState('Connecting to database…');

  useEffect(() => {
    async function init() {
      try {
        // 1. Verify Supabase connectivity
        setStatus('Connecting to Supabase…');
        const { error } = await supabase.from('products').select('id').limit(1);
        if (error) throw error;

        // 2. Seed local loyalty tiers (one-time)
        setStatus('Initialising local settings…');
        await seedLoyaltyTiersIfNeeded();

        setStatus('Ready!');
      } catch (err) {
        console.error('[Init] Startup error:', err);
        setStatus(`Connection error: ${err.message}`);
        // Still proceed — offline mode will gracefully show empty state
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
            <Wifi size={18} color="#335CFF" style={{ animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#335CFF' }}>
              {status}
            </span>
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
            Powered by Supabase
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
