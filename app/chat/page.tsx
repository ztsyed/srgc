import { promises as fs } from "node:fs";
import { HANDBOOK_PATH, PDF_DIR, ensureDataDirs } from "@/lib/paths";
import ChatClient from "./ChatClient";

export const dynamic = "force-dynamic";

async function corpusSummary(): Promise<{ hasHandbook: boolean; newsletterMonths: string[] }> {
  await ensureDataDirs();
  let hasHandbook = false;
  try { await fs.access(HANDBOOK_PATH); hasHandbook = true; } catch {}
  let months: string[] = [];
  try {
    const files = await fs.readdir(PDF_DIR);
    months = files
      .filter((f) => /^\d{4}-\d{2}\.pdf$/.test(f))
      .map((f) => f.slice(0, 7))
      .sort()
      .reverse();
  } catch {}
  return { hasHandbook, newsletterMonths: months };
}

export default async function ChatPage() {
  const summary = await corpusSummary();
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <header className="mb-3">
        <p className="text-sm text-slate-500">Copilot</p>
        <h1 className="text-2xl sm:text-3xl font-semibold">Ask the SRGC docs</h1>
        <p className="text-sm text-slate-500 mt-1">
          {summary.hasHandbook ? "Handbook loaded" : "Handbook not uploaded"}
          {" · "}
          {summary.newsletterMonths.length > 0
            ? `${summary.newsletterMonths.length} newsletters (${summary.newsletterMonths.slice(0, 3).join(", ")}${summary.newsletterMonths.length > 3 ? ", …" : ""})`
            : "no newsletters uploaded"}
        </p>
      </header>
      <ChatClient ready={summary.hasHandbook && summary.newsletterMonths.length > 0} />
    </div>
  );
}
