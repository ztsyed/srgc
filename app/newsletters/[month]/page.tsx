import { promises as fs } from "node:fs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { newsletterPdfPath, ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function prettyMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? month} ${y}`;
}

export default async function NewsletterViewerPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month } = await params;
  if (!/^\d{4}-\d{2}$/.test(month)) notFound();

  await ensureDataDirs();
  let exists = false;
  try {
    await fs.access(newsletterPdfPath(month));
    exists = true;
  } catch {
    exists = false;
  }

  const pdfUrl = `/api/newsletter/${month}`;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/newsletters" className="hover:underline">Newsletters</Link>
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold">{prettyMonth(month)}</h1>
        </div>
        {exists ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm px-3 py-2 rounded-lg bg-white border hover:bg-slate-100"
          >
            Open in new tab
          </a>
        ) : null}
      </header>
      {exists ? (
        <object
          data={pdfUrl}
          type="application/pdf"
          className="w-full h-[80vh] rounded-xl border bg-white"
        >
          <p className="p-4 text-sm">
            Your browser can&apos;t display this PDF inline.
            <a className="text-blue-700 underline ml-1" href={pdfUrl}>Download it instead.</a>
          </p>
        </object>
      ) : (
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">
          This newsletter hasn&apos;t been uploaded yet.
        </div>
      )}
    </div>
  );
}
