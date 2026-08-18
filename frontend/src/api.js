const BASE = '/api';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with ${res.status}`);
  }
  return res.json();
}

export const api = {
  getStatus: () => fetch(`${BASE}/status`).then(handle),
  getProducts: () => fetch(`${BASE}/products`).then(handle),
  getProduct: (id) => fetch(`${BASE}/products/${id}`).then(handle),
  getHealEvents: () => fetch(`${BASE}/heal-events`).then(handle),
  runScraper: () => fetch(`${BASE}/run`, { method: 'POST' }).then(handle),
  simulateBreak: (id) => fetch(`${BASE}/simulate-break/${id}`, { method: 'POST' }).then(handle)
};
