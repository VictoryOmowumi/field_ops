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

export function resolveDateWindow(
  dateFrom?: string | null,
  dateTo?: string | null,
  fallbackDays?: number
) {
  if (dateFrom || dateTo) {
    return {
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      isDefaultWindow: false,
    };
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
