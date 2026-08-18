import React from 'react';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function statusClass(status) {
  if (status === 'done') return '';
  if (status === 'awaiting_approval') return 'pending';
  return 'failed';
}

export default function HealTimeline({ events }) {
  if (!events || events.length === 0) {
    return <p className="timeline-empty">No self-heal events yet — the collector hasn't needed a repair.</p>;
  }

  return (
    <div className="timeline">
      {events.map((e, i) => (
        <div key={i} className={`timeline-item ${statusClass(e.status)}`}>
          <span className="timeline-time">
            {timeAgo(e.startedAt)} · status: {e.status}
          </span>
          <div className="timeline-prompt">{e.prompt}</div>
          {e.diffSummary && <div className="timeline-diff">→ {e.diffSummary}</div>}
          {e.error && <div className="timeline-diff" style={{ color: 'var(--red)' }}>→ {e.error}</div>}
        </div>
      ))}
    </div>
  );
}
