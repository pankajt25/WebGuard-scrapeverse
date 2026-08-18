import React from 'react';
import { formatPrice } from '../format.js';

function Sparkline({ points, trend }) {
  if (!points || points.length < 2) return <div className="sparkline" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(2)} ${(h - ((p - min) / range) * h).toFixed(2)}`)
    .join(' ');
  const color = trend > 0 ? 'var(--red)' : trend < 0 ? 'var(--mint)' : 'var(--muted)';

  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function ProductCard({ product, selected, onSelect, onSimulateBreak, demoMode }) {
  const trendClass = product.trend > 0.05 ? 'up' : product.trend < -0.05 ? 'down' : 'flat';
  const trendLabel = `${product.trend > 0 ? '+' : ''}${product.trend}%`;

  return (
    <div
      className={`card ${selected ? 'selected' : ''} ${product.simulatedBreak ? 'broken' : ''}`}
      onClick={() => onSelect(product.id)}
    >
      {product.simulatedBreak && <span className="card-broken-flag">extraction broken</span>}
      <div className="card-top">
        <img className="card-thumb" src={product.imageUrl} alt="" />
        <div>
          <p className="card-title">{product.name}</p>
          <span className="card-category">{product.category}</span>
        </div>
      </div>

      <Sparkline points={product.sparkline} trend={product.trend} />

      <div className="card-bottom">
        <span className="card-price mono">{formatPrice(product.price, product.currency)}</span>
        <span className={`card-trend ${trendClass}`}>{trendLabel}</span>
      </div>
      <div className={`card-stock ${product.inStock ? '' : 'out'}`}>
        {product.inStock ? 'in stock' : 'out of stock'}
      </div>

      {demoMode && (
        <div className="card-actions">
          <button
            className="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onSimulateBreak(product.id);
            }}
            disabled={product.simulatedBreak}
          >
            {product.simulatedBreak ? 'break queued' : 'Simulate site change'}
          </button>
        </div>
      )}
    </div>
  );
}
