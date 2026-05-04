import path from "node:path";
import fs from "node:fs/promises";

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "data");

export const PDF_DIR = path.join(DATA_DIR, "pdfs");
export const EVENTS_DIR = path.join(DATA_DIR, "events");
export const DUTY_DIR = path.join(DATA_DIR, "duty");
export const PREFS_DIR = path.join(DATA_DIR, "prefs");
export const RECURRING_PATH = path.join(DATA_DIR, "recurring.json");
export const HANDBOOK_PATH = path.join(PDF_DIR, "handbook.pdf");
export const MEMBERS_PATH = path.join(DATA_DIR, "members.json");
export const NOTIFICATIONS_PATH = path.join(DATA_DIR, "notifications.json");

export const SEED_DIR = path.resolve(process.cwd(), "data-seed");

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(PDF_DIR, { recursive: true });
  await fs.mkdir(EVENTS_DIR, { recursive: true });
  await fs.mkdir(DUTY_DIR, { recursive: true });
  await fs.mkdir(PREFS_DIR, { recursive: true });
  // Seed recurring.json on first boot if missing.
  try {
    await fs.access(RECURRING_PATH);
  } catch {
    const seed = await fs.readFile(path.join(SEED_DIR, "recurring.json"), "utf8");
    await fs.writeFile(RECURRING_PATH, seed, "utf8");
  }
}

export function newsletterPdfPath(month: string): string {
  return path.join(PDF_DIR, `${month}.pdf`);
}
export function eventsJsonPath(month: string): string {
  return path.join(EVENTS_DIR, `${month}.json`);
}
export function dutyJsonPath(month: string): string {
  return path.join(DUTY_DIR, `${month}.json`);
}
