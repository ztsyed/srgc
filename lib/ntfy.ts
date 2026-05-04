import "server-only";

const DEFAULT_SERVER = "https://ntfy.sh";

export type NtfySendOptions = {
  topic: string;
  server?: string;                // defaults to https://ntfy.sh
  title?: string;
  message: string;
  tags?: string[];                // emoji shortcodes, e.g. ["calendar"]
  priority?: 1 | 2 | 3 | 4 | 5;   // 3 = default
  click?: string;                 // URL to open when notification is tapped
};

export async function sendNtfy(opts: NtfySendOptions): Promise<void> {
  const server = (opts.server || DEFAULT_SERVER).replace(/\/+$/, "");
  const url = `${server}/${encodeURIComponent(opts.topic)}`;
  const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
  if (opts.title) headers["Title"] = utf8Header(opts.title);
  if (opts.tags && opts.tags.length) headers["Tags"] = opts.tags.join(",");
  if (opts.priority) headers["Priority"] = String(opts.priority);
  if (opts.click) headers["Click"] = opts.click;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: opts.message,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ntfy POST ${url} failed: ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
  }
}

// ntfy headers are HTTP headers — must be ASCII. RFC 8187 encoding for non-ASCII.
function utf8Header(value: string): string {
  // Quick path: pure ASCII.
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return value.replace(/[^\x20-\x7e]/g, "?");
}
