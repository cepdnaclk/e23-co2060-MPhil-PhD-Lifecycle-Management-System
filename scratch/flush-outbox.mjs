import { processOutboxBatch } from "../src/lib/outbox/service.ts";

async function flushOutbox() {
  console.log("Flushing outbox...");
  try {
    const result = await processOutboxBatch({ workerId: "manual-flush" });
    console.log("Outbox processing complete:", result);
  } catch (err) {
    console.error("Error flushing outbox:", err);
  }
}

flushOutbox();
