import { auth } from "@/lib/auth";
import { ChatMessageSchema, streamCopilotReply, type ChatMessage } from "@/lib/copilot";
import { z } from "zod";

const RequestSchema = z.object({
  history: z.array(ChatMessageSchema).max(40),
  question: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }
  const { history, question } = parsed.data;

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await streamCopilotReply(history as ChatMessage[], question);
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
