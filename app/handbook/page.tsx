import { promises as fs } from "node:fs";
import { HANDBOOK_PATH, ensureDataDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

export default async function HandbookPage() {
  await ensureDataDirs();
  let exists = false;
  try {
    await fs.access(HANDBOOK_PATH);
    exists = true;
  } catch {
    exists = false;
  }
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Reference</p>
          <h1 className="text-2xl sm:text-3xl font-semibold">Policies &amp; Procedures Handbook</h1>
        </div>
        {exists ? (
          <a
            href="/handbook/pdf"
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
          data="/handbook/pdf"
          type="application/pdf"
          className="w-full h-[80vh] rounded-xl border bg-white"
        >
          <p className="p-4 text-sm">
            Your browser can&apos;t display this PDF inline.
            <a className="text-blue-700 underline ml-1" href="/handbook/pdf">Download it instead.</a>
          </p>
        </object>
      ) : (
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">
          The handbook hasn&apos;t been uploaded yet. Go to <a href="/admin" className="text-blue-700 underline">Admin</a> to upload it.
        </div>
      )}
    </div>
  );
}
