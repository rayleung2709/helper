// Fetches the secret ICS feed and writes calendar.json (runs inside GitHub Actions only)
import ical from 'node-ical';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const url = process.env.THEO_ICS_URL;
if (!url) { console.error('Missing THEO_ICS_URL secret'); process.exit(1); }

const now = new Date();
const rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);   // 2 months back
const rangeEnd   = new Date(now.getFullYear(), now.getMonth() + 13, 0);  // 12 months ahead

const pad = n => String(n).padStart(2, '0');
const localYmd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayKey = d => d.toISOString().slice(0, 10);          // key format node-ical uses for exdate/recurrences
const str = v => ((v && typeof v === 'object') ? v.val : v) || '';

const data = await ical.async.fromURL(url);
const out = [];

function add(ev, start) {
  const allDay = ev.datetype === 'date';
  let end = ev.end ? new Date(start.getTime() + (ev.end - ev.start)) : null;
  if (!end || end <= start) end = allDay ? new Date(start.getTime() + 86400000) : start;
  if (end < rangeStart || start > rangeEnd) return;
  out.push({
    id: `${ev.uid}_${start.toISOString()}`,
    title: str(ev.summary).trim() || '(No title)',
    start: allDay ? localYmd(start) : start.toISOString(),
    end:   allDay ? localYmd(end)   : end.toISOString(),   // all-day end is exclusive (next day)
    allDay,
    location: str(ev.location).trim(),
    description: str(ev.description).trim(),
  });
}

for (const ev of Object.values(data)) {
  if (ev.type !== 'VEVENT' || ev.status === 'CANCELLED') continue;
  if (ev.rrule) {
    for (const d of ev.rrule.between(rangeStart, rangeEnd, true)) {
      const k = dayKey(d);
      if (ev.exdate?.[k]) continue;        // deleted occurrence
      if (ev.recurrences?.[k]) continue;   // edited occurrence – added below
      add(ev, d);
    }
    for (const r of Object.values(ev.recurrences || {})) add(r, r.start);
  } else {
    add(ev, ev.start);
  }
}

out.sort((a, b) => a.start.localeCompare(b.start));

if (existsSync('calendar.json')) {
  const prev = JSON.parse(readFileSync('calendar.json', 'utf8'));
  if (JSON.stringify(prev.events) === JSON.stringify(out)) { console.log('No changes'); process.exit(0); }
}

writeFileSync('calendar.json', JSON.stringify({ generated: now.toISOString(), count: out.length, events: out }, null, 1));
console.log(`Wrote ${out.length} events`);
