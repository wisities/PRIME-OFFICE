export function validMeetUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname) && !url.username && !url.password; } catch { return false; }
}
export function normalizeEmail(value) { return value.trim().toLowerCase(); }
export function uniquePresence(state) {
  const result = new Map();
  for (const entries of Object.values(state)) for (const entry of entries) {
    if (!entry.user_id) continue;
    const previous = result.get(entry.user_id);
    if (!previous || (entry.updated_at || '') >= (previous.updated_at || '')) result.set(entry.user_id, entry);
  }
  return [...result.values()];
}
export function loadDemo(storage) {
  try { const data = JSON.parse(storage.getItem('prime-demo-v1') || '{}'); return { room: ['hub','project','focus','coffee'].includes(data.room) ? data.room : 'hub', status: ['available','focus','away'].includes(data.status) ? data.status : 'available', note: typeof data.note === 'string' ? data.note.slice(0, 240) : '' }; }
  catch { return { room: 'hub', status: 'available', note: '' }; }
}
