// Runs once when the server process starts. Resumes newsletter parse jobs
// that a restart interrupted (see lib/parse-jobs.ts). The import must sit
// inside the NEXT_RUNTIME check so it's dropped from the edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resumeParseJobs } = await import("./lib/parse-jobs");
    resumeParseJobs().catch((e) => console.error("[parse-job] resume failed:", e));
  }
}
