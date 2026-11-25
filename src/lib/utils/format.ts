const DAY = 86_400_000;

export function formatRelative(iso: string, now = Date.now()) {
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 2 * DAY) return "Yesterday";
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return formatDate(iso);
}

export function formatDate(iso: string | undefined | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "Undated";
  return new Intl.DateTimeFormat("en-GB", opts).format(new Date(iso));
}

export function formatYear(iso: string | undefined | null) {
  return iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).getFullYear().toString() : "n.d.";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
