// build-calendar.mjs — fetch school ICS → calendar.json (no dependencies)
import { writeFileSync } from 'node:fs';
const ICS_URL = process.env.ICS_URL || 'https://calendar.google.com/calendar/ical/theodoreleung0810%40gmail.com/private-63581cf270d64d174837e157b3cbf312/basic.ics'; // ← 改呢行

const res = await fetch(ICS_URL);
if (!res.ok) throw new Error(`ICS fetch failed: HTTP ${res.status}`);
const text = await res.text();

// RFC 5545: 長行會用「換行 + 空格」摺行，先駁返做一行
const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

const events = [];
let cur = null;
for (const line of lines) {
  if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
  if (line === 'END:VEVENT')   { if (cur) events.push(cur); cur = null; continue; }
  if (!cur) continue;
  const i = line.indexOf(':');
  if (i < 0) continue;
  const name  = line.slice(0, i).split(';')[0];
  const value = line.slice(i + 1);
  if (name === 'SUMMARY') cur.summary = value.replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
  if (name === 'DTSTART') cur.start = toDate(value);
  if (name === 'DTEND')   { cur.end = toDate(value); cur.endAllDay = !value.includes('T'); }
}

function toDate(v) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
function shiftDay(d, n) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

const out = events
  .filter(e => e.start && e.summary)
  .map(e => {
    let end = e.end || e.start;
    if (e.end && e.endAllDay) end = shiftDay(e.end, -1);   // 全日 event 嘅 DTEND 係「排除式」
    if (end < e.start) end = e.start;
    return { start: e.start, end, summary: e.summary };
  })
  .sort((a, b) => a.start.localeCompare(b.start));

writeFileSync('calendar.json', JSON.stringify({ updated: new Date().toISOString(), events: out }, null, 2));
console.log(`Wrote ${out.length} events to calendar.json`);
