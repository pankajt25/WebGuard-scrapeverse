import React, { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import ProductCard from './components/ProductCard.jsx';
import PriceChart from './components/PriceChart.jsx';
import HealTimeline from './components/HealTimeline.jsx';
import { formatPrice } from './format.js';

export default function App() {
  const [status, setStatus] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [healEvents, setHealEvents] = useState([]);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | running | repairing

  const refreshAll = useCallback(async () => {
    const [s, p, h] = await Promise.all([api.getStatus(), api.getProducts(), api.getHealEvents()]);
    setStatus(s);
    setProducts(p);
    setHealEvents(h);
    if (!selectedId && p.length > 0) setSelectedId(p[0].id);
  }, [selectedId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedId) return;
    api.getProduct(selectedId).then(setSelectedProduct);
  }, [selectedId, products]);

  async function handleRun() {
    setRunning(true);
    setPhase('running');
    try {
      const result = await api.runScraper();
      if (result.healEvent) {
        setPhase('repairing');
        await new Promise((r) => setTimeout(r, 500));
      }
      await refreshAll();
    } catch (err) {
      alert(`Run failed: ${err.message}`);
    } finally {
      setRunning(false);
      setPhase('idle');
    }
  }

  async function handleSimulateBreak(id) {
    await api.simulateBreak(id);
    await refreshAll();
  }

  const healthy = status?.collectorHealth?.healthy ?? true;
  const dotClass = phase === 'repairing' ? 'repairing' : healthy ? '' : 'broken';
  const statusLabel = phase === 'repairing' ? 'Self-healing in progress…' : healthy ? 'Collector healthy' : 'Extraction broken — repair needed';

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-mark">PG</div>
          <div>
            <h1>PriceGuard</h1>
            <p>Self-healing price &amp; inventory tracker · Bright Data Scraper Studio</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="mode-pill">{status?.mode || '…'} mode</span>
          <button className="primary" onClick={handleRun} disabled={running}>
            {running ? 'Running…' : 'Run scraper now'}
          </button>
        </div>
      </header>

      <div className="pulse-strip">
        <span className={`pulse-dot ${dotClass}`} />
        <div className="pulse-text">
          <strong>{statusLabel}</strong>
          <span>collector {status?.collectorConfigured ? 'connected' : 'not configured — using seed data'}</span>
        </div>
        <div className="pulse-meta">
          <div>
            <div className="label">Tracking</div>
            <div className="value">{status?.productCount ?? '—'} products</div>
          </div>
          <div>
            <div className="label">Last run</div>
            <div className="value">{status?.lastRunAt ? new Date(status.lastRunAt).toLocaleTimeString() : '—'}</div>
          </div>
        </div>
      </div>

      <div className="layout">
        <div>
          <p className="section-title">Tracked products</p>
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                selected={p.id === selectedId}
                onSelect={setSelectedId}
                onSimulateBreak={handleSimulateBreak}
                demoMode={status?.mode === 'demo'}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="section-title">Detail</p>
          <div className="detail-panel">
            {!selectedProduct ? (
              <p className="detail-empty">Select a product to see its price history.</p>
            ) : (
              <>
                <div className="detail-header">
                  <div>
                    <h2>{selectedProduct.name}</h2>
                    <div className="url">{selectedProduct.url}</div>
                  </div>
                  <div className="detail-price mono">{formatPrice(selectedProduct.price, selectedProduct.currency)}</div>
                </div>
                <PriceChart history={selectedProduct.history} currency={selectedProduct.currency} />
              </>
            )}
          </div>

          <p className="section-title" style={{ marginTop: 22 }}>
            Self-heal timeline
          </p>
          <div className="detail-panel">
            <HealTimeline events={healEvents} />
          </div>
        </div>
      </div>

      <p className="footer-note">
        Built for{' '}
        <a href="https://www.wemakedevs.org/hackathons/scrape-verse" target="_blank" rel="noreferrer">
          Into the Scrape-Verse
        </a>{' '}
        · powered by Bright Data Scraper Studio
      </p>
    </div>
  );
}
