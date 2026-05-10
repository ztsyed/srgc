import { z } from "zod";

export type Venue = "RP" | "TRAP" | "FIVE_STAND" | "CLUBHOUSE" | "OTHER";

export const VENUE_LABEL: Record<Venue, string> = {
  RP: "Rifle & Pistol Range",
  TRAP: "Trap Range",
  FIVE_STAND: "5-Stand",
  CLUBHOUSE: "Clubhouse",
  OTHER: "Other",
};

export const EventRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
  exUse: z.string(),
  event: z.string().min(1),
  contact: z.string(),
});
export type EventRow = z.infer<typeof EventRowSchema> & { venue: Venue };

export const ParsedEventsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  // Optional: an older parse (or a model miss) may not include it. The
  // per-event "Newsletter" pill simply doesn't render when this is absent.
  eventsPage: z.number().int().positive().optional(),
  events: z.array(EventRowSchema),
});
export type ParsedEvents = z.infer<typeof ParsedEventsSchema>;

export const EventsMetaSchema = z.object({
  eventsPage: z.number().int().positive(),
});
export type EventsMeta = z.infer<typeof EventsMetaSchema>;

export const RecurringRowSchema = z.object({
  weekday: z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]),
  ordinal: z.union([z.literal("every"), z.number().int().min(1).max(5)]),
  ordinalSecond: z.number().int().min(1).max(5).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  event: z.string().min(1),
  venue: z.enum(["RP", "TRAP", "FIVE_STAND", "CLUBHOUSE", "OTHER"]),
});
export type RecurringRow = z.infer<typeof RecurringRowSchema>;

export type DayEvent = {
  source: "recurring" | "monthly";
  from: string;
  to?: string;
  event: string;
  venue: Venue;
  exUse?: string;
  contact?: string;
};
