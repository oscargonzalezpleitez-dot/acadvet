// blur y visibilitychange pueden describir la misma ausencia.
export function beginExit(events, { now, question, questionIndex, source }) {
  const active = events.at(-1);
  if (active && active.endedAt == null) {
    if (!active.sources.includes(source)) active.sources.push(source);
    return false;
  }
  events.push({ startedAt: now, endedAt: null, durationMs: 0,
    question, questionIndex, sources: [source], endedBy: null });
  return true;
}

export function finishExit(events, now, endedBy = 'return') {
  const active = events.at(-1);
  if (!active || active.endedAt != null) return false;
  active.endedAt = Math.max(active.startedAt, now);
  active.durationMs = active.endedAt - active.startedAt;
  active.endedBy = endedBy;
  return true;
}

export function exitSummary(result) {
  const events = Array.isArray(result.exitEvents) ? result.exitEvents : [];
  const measured = result.exitTrackingVersion === 1;
  return {
    events, measured,
    count: Math.max(Number(result.blurs) || 0, events.length),
    totalMs: measured ? events.reduce((sum, e) => sum + Math.max(0, Number(e.durationMs) || 0), 0) : null,
  };
}

export function formatExitDuration(ms) {
  if (ms == null) return 'Sin registro';
  if (ms > 0 && ms < 1000) return '<1 s';
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function matchesExitFilter(result, { minimumCount = 0, minimumSeconds = 0, forcedOnly = false } = {}) {
  const summary = exitSummary(result);
  return summary.count >= minimumCount &&
    (!minimumSeconds || (summary.measured && summary.totalMs >= minimumSeconds * 1000)) &&
    (!forcedOnly || result.forzadoPorSalidas === true);
}
