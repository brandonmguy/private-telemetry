const BASE = '/api';

export async function fetchMessages(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  );
  const res = await fetch(`${BASE}/messages?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function fetchMessage(id) {
  const res = await fetch(`${BASE}/messages/${id}`);
  if (!res.ok) throw new Error('Failed to fetch message');
  return res.json();
}

export async function fetchSources() {
  const res = await fetch(`${BASE}/sources`);
  if (!res.ok) throw new Error('Failed to fetch sources');
  return res.json();
}

export async function fetchEventTypes() {
  const res = await fetch(`${BASE}/event-types`);
  if (!res.ok) throw new Error('Failed to fetch event types');
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function clearMessages() {
  const res = await fetch(`${BASE}/messages`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to clear messages');
  return res.json();
}
