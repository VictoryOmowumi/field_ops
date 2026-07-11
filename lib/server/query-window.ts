export function resolveRollingWindowDates(days: number) {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));
  start.setUTCHours(0, 0, 0, 0);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
}

// A one-sided date filter (dateFrom with no dateTo, or vice versa) must never
// translate into an open-ended query against an unbounded table — that's what
// took Postgres down on 2026-06-30 (reports/overview + reports/rep-performance
// both ran unbounded `gte` scans with no `lte`). Cap whichever side is missing
// instead of leaving it null.
const MAX_OPEN_ENDED_RANGE_DAYS = 31;

/**
 * A finished campaign's own lifetime, not "the last N days from today" — the rolling-window
 * fallback in resolveDateWindow anchors to the current date, which is almost always empty for a
 * campaign that ended weeks or months ago. Pass the result into resolveDateWindow in place of
 * the raw query params when the caller didn't supply an explicit range.
 */
export function resolveCampaignDefaultWindow(campaign: {
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
}) {
  const dateFrom = campaign.start_date ?? (campaign.created_at ? campaign.created_at.slice(0, 10) : null);
  const dateTo = campaign.end_date ?? new Date().toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

export function resolveDateWindow(
  dateFrom?: string | null,
  dateTo?: string | null,
  fallbackDays?: number
) {
  if (dateFrom && dateTo) {
    return { dateFrom, dateTo, isDefaultWindow: false };
  }
  if (dateFrom && !dateTo) {
    const from = new Date(`${dateFrom}T00:00:00.000Z`);
    const cappedTo = new Date(from);
    cappedTo.setUTCDate(cappedTo.getUTCDate() + MAX_OPEN_ENDED_RANGE_DAYS);
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    const to = cappedTo.getTime() < today.getTime() ? cappedTo : today;
    return { dateFrom, dateTo: to.toISOString().slice(0, 10), isDefaultWindow: false };
  }
  if (!dateFrom && dateTo) {
    const to = new Date(`${dateTo}T23:59:59.999Z`);
    const cappedFrom = new Date(to);
    cappedFrom.setUTCDate(cappedFrom.getUTCDate() - MAX_OPEN_ENDED_RANGE_DAYS);
    return { dateFrom: cappedFrom.toISOString().slice(0, 10), dateTo, isDefaultWindow: false };
  }
  if (!fallbackDays || fallbackDays <= 0) {
    return { dateFrom: null, dateTo: null, isDefaultWindow: false };
  }
  const rolling = resolveRollingWindowDates(fallbackDays);
  return {
    dateFrom: rolling.dateFrom,
    dateTo: rolling.dateTo,
    isDefaultWindow: true,
  };
}
