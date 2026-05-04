"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { sendNtfy } from "@/lib/ntfy";
import { loadPrefs, savePrefs } from "@/lib/prefs";

export async function saveNtfy(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const s = await auth();
  if (!s?.user?.email) return { ok: false, message: "Unauthorized" };
  const topic = (formData.get("topic") as string | null)?.trim() ?? "";
  const server = (formData.get("server") as string | null)?.trim() ?? "";
  if (topic && !/^[A-Za-z0-9_\-]+$/.test(topic)) {
    return { ok: false, message: "Topic must be letters, digits, _ or - only." };
  }
  if (server && !/^https?:\/\//i.test(server)) {
    return { ok: false, message: "Server must start with http(s)://" };
  }
  await savePrefs({ email: s.user.email, ntfyTopic: topic, ntfyServer: server });
  revalidatePath("/settings");
  return { ok: true, message: topic ? "Saved." : "Topic cleared." };
}

export async function sendTestNtfy(): Promise<{ ok: boolean; message: string }> {
  const s = await auth();
  if (!s?.user?.email) return { ok: false, message: "Unauthorized" };
  const prefs = await loadPrefs(s.user.email);
  if (!prefs?.ntfyTopic) return { ok: false, message: "Save a topic first." };
  try {
    await sendNtfy({
      topic: prefs.ntfyTopic,
      server: prefs.ntfyServer || undefined,
      title: "SRGC test",
      message: "This is a test push from your SRGC companion app.",
      tags: ["white_check_mark"],
    });
    return { ok: true, message: "Sent — check your phone." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
