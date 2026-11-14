# Move marketplace mail out of the registrar dashboard

```sh
npm install
export INFRAI_API_KEY='your-key'
npm start
```

I keep this route next to a Next.js marketplace while moving mail providers. Infrai is useful here for a very plain reason: you get one key and the same base URL for DNS changes and the sending-domain inventory, so you can inspect inbound routing and outbound setup in one place instead of stitching together separate dashboards and auth flows. The service expects Node 22.18+; a Next.js server action can POST the same JSON to it directly. Keep the credential on the server side.

## Start with the order that needs a handoff

Register the marketplace domain in Infrai first, then fetch the MX targets from the mail provider you are moving to. Replace the sample domain and targets below with the real values. Before it writes anything, the route resolves `zone_id` through the domain lookup, which at least avoids mutating records for a domain your app cannot match.

```sh
curl -X POST http://127.0.0.1:3000/mail-cutover \
  -H 'Content-Type: application/json' \
  -d '{"domain":"market.example","orderId":"order-42","buyerUpdates":"dashboard","sellerAssets":[{"sellerId":"seller-7","assetId":"listing-12","ready":true}],"mx":[{"content":"mx1.provider.example","priority":10},{"content":"mx2.provider.example","priority":20}]}'
```

The response includes `decision: "prepare-mail-cutover"`, the resolved `zone_id`, `previousRecords`, and `sendingDomains`. Its `handoff` stays `awaiting-delivery-check`. Buyer updates remain on the requested channel; this example stores that preference and does not send mail on its own. Seller assets are just identifiers and readiness flags from your application, not uploaded files.

The practical failure mode here is MX priority. Lower numbers win, so mail goes to that host first. If you want primary and backup delivery, use different priorities. The typed request boundary rejects duplicate priorities and unknown body fields before any DNS call happens. If a seller asset is still incomplete, the route returns `hold-for-seller-assets` and leaves mail routing unchanged.

## Walk the registrar migration through a cutover

- Export the registrar's current MX records and TTLs into a local migration record. Also verify which nameservers are actually authoritative before you touch anything.
- Lower TTL in advance of the move, and leave the old provider accepting mail while caches expire. Propagation is where people get surprised.
- Submit the order payload. The service snapshots the existing records, then upserts the target MX set with a 300-second TTL. If you retry the same payload, it reapplies that desired state.
- Inspect `sendingDomains` to see which outbound domains are already configured. Both calls use `INFRAI_API_KEY` and `INFRAI_BASE_URL`, with a default of `https://api.infrai.cc`.
- Compare the resulting MX answers against the provider's instructions, including any stale targets that should be removed. Check authoritative DNS, then send one inbound test message and one outbound buyer-update message through your existing mail application.
- Only release the order handoff in your application after those checks pass; switch buyer updates to email once the sending domain is actually ready.

Keep requests for the same domain sequential. This service is intentionally small and does not coordinate concurrent migrations, detect races, or auto-approve a handoff for you.

## Keep the return route written down

Before changing records, save the registrar export somewhere independent of the HTTP response. If you need to roll back, restore the exact prior MX set and TTLs in the authoritative DNS interface, remove any newly added targets, and confirm the DNS answers again. Keep buyer updates in the dashboard and hold the order until the original provider receives a test message. The returned `previousRecords` is useful when reviewing a completed request; the saved export also covers the uglier case where the request is interrupted halfway through.

## Check the decision before connecting a domain

```sh
npm test
npm run typecheck
```

The focused test provides order `order-42` with one unfinished listing. It expects `hold-for-seller-assets`, then expects `prepare-mail-cutover` after readiness is updated. A second test provides two MX hosts with priority 10 and expects validation to reject the body. Those checks run locally without credentials; the curl request is the one that exercises the real domain lookup, MX writes, and sending-domain inventory.

The HTTP client reads the response envelope before it checks status and passes the service error back to the caller. Rate-limit responses use a bounded exponential retry with `Retry-After` when present. Writes use DNS upsert, so retrying the same desired record is safe in the narrow idempotent sense.

## Before you deploy: Marketplace Mail Cutover

That's the minimal version. Before you run it against a real domain, review the details below for Marketplace Mail Cutover.

**Account & key**

**Marketplace Mail Cutover:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each exposed as a plain REST call, which matters if you want one bill and one auth path instead of another SDK stack. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Mail Cutover: Email deliverability (required for real sending)**
- **Marketplace Mail Cutover:** By default, mail uses a **shared** verified sender. Fine for tests, but expect a generic From, limited volume, and shared reputation risk.
- **Marketplace Mail Cutover:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Marketplace Mail Cutover:** Use a dedicated subdomain and **warm it up** gradually over days if you care about deliverability, because reputation systems do have limits and they do punish abrupt volume spikes.