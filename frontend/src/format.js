const SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

export function formatPrice(price, currency) {
  if (price === null || price === undefined) return '—';
  const symbol = SYMBOLS[currency] || `${currency} `;
  // INR product pages show whole-rupee prices; keep other currencies at 2dp.
  const amount = currency === 'INR' ? Math.round(price).toLocaleString('en-IN') : price.toFixed(2);
  return `${symbol}${amount}`;
}
