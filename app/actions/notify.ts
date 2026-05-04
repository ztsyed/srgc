"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { addNotification, deleteNotification } from "@/lib/notifications";
import { loadPrefs } from "@/lib/prefs";

export async function notifyMe(input: {
  eventDate: string;
  eventTitle: string;
  eventTime: string;
  venue: string;
}): Promise<{ ok: boolean; message: string }> {
  const s = await auth();
  if (!s?.user?.email) return { ok: false, message: "Unauthorized" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) return { ok: false, message: "Bad date" };
  if (!/^\d{2}:\d{2}$/.test(input.eventTime)) return { ok: false, message: "Bad time" };
  if (!input.eventTitle.trim()) return { ok: false, message: "Missing title" };

  const prefs = await loadPrefs(s.user.email);
  if (!prefs?.ntfyTopic) {
    return {
      ok: false,
      message: "Set your ntfy topic in /settings first.",
    };
  }
  try {
    await addNotification({
      userEmail: s.user.email,
      eventDate: input.eventDate,
      eventTitle: input.eventTitle.trim().slice(0, 200),
      eventTime: input.eventTime,
      venue: input.venue.slice(0, 40),
    });
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  revalidatePath("/calendar");
  revalidatePath(`/calendar/${input.eventDate}`);
  revalidatePath("/settings");
  return { ok: true, message: "You'll get a ntfy push the morning of." };
}

export async function cancelNotify(id: string): Promise<{ ok: boolean; message: string }> {
  const s = await auth();
  if (!s?.user?.email) return { ok: false, message: "Unauthorized" };
  const removed = await deleteNotification(id, s.user.email);
  revalidatePath("/calendar");
  revalidatePath("/settings");
  return removed ? { ok: true, message: "Cancelled." } : { ok: false, message: "Not found." };
}
