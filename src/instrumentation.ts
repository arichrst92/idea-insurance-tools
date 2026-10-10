export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { mulai } = await import("./instrumentation-node");
    await mulai();
  }
}
