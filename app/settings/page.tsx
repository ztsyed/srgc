import { auth } from "@/lib/auth";
import { tokenForEmail } from "@/lib/calendar-token";
import { listNotificationsForUser } from "@/lib/notifications";
import { loadPrefs } from "@/lib/prefs";
import { siteUrl } from "@/lib/site-url";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await auth();
  if (!s?.user?.email) return null;
  const prefs = await loadPrefs(s.user.email);
  const upcoming = (await listNotificationsForUser(s.user.email)).filter(
    (n) => n.sentAt === null,
  );
  const calToken = tokenForEmail(s.user.email);
  const calUrl = `${siteUrl()}/calendar/feed/${calToken}.ics`;
  const webcalUrl = calUrl.replace(/^https?:\/\//, "webcal://");
  return (
    <SettingsClient
      email={s.user.email}
      ntfyTopic={prefs?.ntfyTopic ?? ""}
      ntfyServer={prefs?.ntfyServer ?? ""}
      calUrl={calUrl}
      webcalUrl={webcalUrl}
      pendingNotifications={upcoming}
    />
  );
}
