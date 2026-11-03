import { createServer } from "node:http";
import { z } from "zod";
import { cutoverBody, handoffDecision } from "./mail_handoff.ts";
import { MailApiError, mailRequest } from "./infrai_mail.ts";

const zone = z.object({ zone_id: z.string().min(1) });

createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/mail-cutover") {
    response.writeHead(404).end(JSON.stringify({ error: "Use POST /mail-cutover" }));
    return;
  }
  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > 65536) {
        response.writeHead(413).end(JSON.stringify({ error: "Request body too large" }));
        return;
      }
    }
    const input = cutoverBody.parse(JSON.parse(raw));
    const decision = handoffDecision(input);
    if (decision === "hold-for-seller-assets") {
      response.writeHead(200).end(JSON.stringify({ orderId: input.orderId, decision }));
      return;
    }
    const domain = await mailRequest("GET", `/v1/dns/domain/get?domain=${encodeURIComponent(input.domain)}`);
    const { zone_id } = zone.parse(domain);
    const previousRecords = await mailRequest("GET", `/v1/dns/record/list?zone_id=${encodeURIComponent(zone_id)}`);
    for (const record of [...input.mx].sort((a, b) => a.priority - b.priority)) {
      // Replaying the same desired MX values uses the upsert operation.
      await mailRequest("PUT", "/v1/dns/record/upsert", {
        zone_id, record_type: "MX", name: "@", content: record.content,
        priority: record.priority, ttl: 300
      });
    }
    const sendingDomains = await mailRequest("GET", "/v1/email/domain/list");
    response.writeHead(200).end(JSON.stringify({
      orderId: input.orderId, decision, zone_id, previousRecords, sendingDomains,
      buyerUpdates: input.buyerUpdates,
      handoff: "awaiting-delivery-check"
    }));
  } catch (error) {
    const status = error instanceof MailApiError ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 502;
    response.writeHead(status).end(JSON.stringify({
      error: error instanceof Error ? error.message : "Mail cutover could not complete"
    }));
  }
}).listen(Number(process.env.PORT ?? 3000), "127.0.0.1", () => {
  console.log("Marketplace mail route: http://127.0.0.1:3000/mail-cutover");
});
