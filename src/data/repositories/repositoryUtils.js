export function byUserId(records, userId) {
  return records.filter((record) => record.userId === userId);
}

export function byDateRange(records, field, range = {}) {
  const { from, to } = range;

  return records.filter((record) => {
    const value = record[field];

    if (!value) return false;
    if (from && value < from) return false;
    if (to && value > to) return false;

    return true;
  });
}

export function latestByDate(records, field) {
  return [...records].sort((a, b) => b[field].localeCompare(a[field]))[0] ?? null;
}
