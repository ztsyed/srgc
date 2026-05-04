import { promises as fs } from "node:fs";
import { PDF_DIR, ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function prettyMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? month} ${y}`;
}

async function listMonths(): Promise<string[]> {
  await ensureDataDirs();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(PDF_DIR);
  } catch {
    return [];
  }
  return entries
    .map((n) => n.match(/^(\d{4}-\d{2})\.pdf$/i)?.[1])
    .filter((m): m is string => Boolean(m))
    .sort()
    .reverse();
}

export default async function NewslettersPage() {
  const months = await listMonths();
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <header className="mb-4">
        <p className="text-sm text-slate-500">Archive</p>
        <h1 className="text-2xl sm:text-3xl font-semibold">Monthly Newsletters</h1>
      </header>
      {months.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">
          No newsletters have been uploaded yet.
        </div>
      ) : (
        <ul className="rounded-xl border bg-white divide-y">
          {months.map((m) => (
            <li key={m} className="flex items-center justify-between p-4">
              <span className="font-medium">{prettyMonth(m)}</span>
              <a
                href={`/api/newsletter/${m}`}
                className="text-sm px-3 py-1.5 rounded-lg border hover:bg-slate-100"
              >
                Download PDF
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
