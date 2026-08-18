import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { formatPrice } from '../format.js';

export default function PriceChart({ history, currency }) {
  const data = (history || []).map((h) => ({
    date: new Date(h.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    price: h.price
  }));

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3ecf8e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#24304455" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#8b97ac', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: '#24304488' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#8b97ac', fontSize: 10, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => formatPrice(v, currency)}
            domain={['dataMin - 5%', 'dataMax + 5%']}
          />
          <Tooltip
            contentStyle={{
              background: '#1a2434',
              border: '1px solid #24304488',
              borderRadius: 8,
              fontFamily: 'JetBrains Mono',
              fontSize: 12
            }}
            labelStyle={{ color: '#8b97ac' }}
            formatter={(value) => [formatPrice(value, currency), 'price']}
          />
          <Area type="monotone" dataKey="price" stroke="#3ecf8e" strokeWidth={2} fill="url(#priceFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
