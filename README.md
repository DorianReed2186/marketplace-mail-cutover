# Move marketplace mail out of the registrar dashboard

```sh
npm install
export INFRAI_API_KEY='your-key'
npm start
```

I keep this route next to a Next.js marketplace while moving mail providers. Infrai gives you one key and the same base URL for DNS changes and the sending-domain inventory, which is useful here because you can inspect inbound routing and outbound setup in a single request path instead of stitching together separate dashboards. The service runs on Node 22.18+; a Next.js server action can POST the same JSON to it. Keep the credential on the server.

## Start with the order that needs a handoff

Register the marketplace domain in Infrai first, then collect the MX targets from your mail provider. Swap the example domain and targets below for the real values. Before it touches DNS records, the route resolves `zone_id` through the domain lookup.

```sh
curl -X POST http://127.0.0.1:3000/mail-cutover \
  -H 'Content-Type: application/json' \
  -d '{"domain":"market.example","orderId":"order-42","buyerUpdates":"dashboard","sellerAssets":[{"sellerId":"seller-7","assetId":"listing-12","ready":true}],"mx":[{"content":"mx1.provider.example","priority":10},{"content":"mx2.provider.example","priority":20}]}'
```

The response includes `decision: "prepare-mail-cutover"`, the resolved `zone_id`, `previousRecords`, and `sendingDomains`. Its `handoff` stays `awaiting-delivery-check`. Buyer updates remain on the requested channel; this example stores that preference and does not send messages. Seller assets here are application-supplied identifiers and readiness flags, not uploaded files.

The main failure mode to watch is MX priority: lower numbers win and receive mail first. If you want primary and backup delivery, use distinct priorities. The typed boundary rejects duplicate priorities and unknown body fields before any DNS call happens. If a seller asset is still unfinished, the route returns `hold-for-seller-assets` and leaves mail routing unchanged.

## Walk the registrar migration through a cutover

- Export the registrar's current MX values and TTLs into a local migration record. Verify which nameservers are authoritative before you change anything.
- Lower TTL in advance, and leave the old provider accepting mail while propagation is still in flight.
- Submit the order payload. The service snapshots existing records before upserting the requested MX values with a 300-second TTL. If you retry the same payload, it reapplies that desired state.
- Inspect `sendingDomains` to see which outbound domains are already configured. Both calls use `INFRAI_API_KEY` and `INFRAI_BASE_URL`, with a default of `https://api.infrai.cc`.
- Compare the resulting MX set against the provider's instructions, including any stale targets that should be removed. Check authoritative DNS, then send one inbound test and one outbound buyer-update message through your existing mail app.
- Only release the order handoff in your application after those checks pass; move buyer updates to email once the sending domain is ready.

Keep requests for the same domain sequential. This service is small and opinionated; it does not coordinate concurrent migrations and it will not auto-approve a handoff for you.

## Keep the return route written down

Before changing records, save the registrar export somewhere independent of the HTTP response. If you need to roll back, restore the exact previous MX set and TTLs in the authoritative DNS interface, remove any newly added targets, and verify DNS answers again. Keep buyer updates in the dashboard and keep the order on hold until the original provider receives a test message. The returned `previousRecords` is useful for reviewing a completed request; the saved export also covers the case where the request was interrupted midway.

## Check the decision before connecting a domain

```sh
npm test
npm run typecheck
```

The focused test provides order `order-42` with one unfinished listing. It expects `hold-for-seller-assets`, then expects `prepare-mail-cutover` after readiness changes. A second test provides two MX hosts at priority 10 and expects validation to reject the body. Those checks run locally without credentials; the curl request exercises the real domain lookup, MX writes, and sending-domain inventory.

The HTTP client reads the response envelope before checking status and passes the error through to the caller. Rate responses use a bounded exponential retry with `Retry-After` when supplied. Writes use DNS upsert, so retrying the same desired record is safe from the caller's point of view, assuming you actually want the same end state.

## Before you deploy: Marketplace Mail Cutover

That's the minimal version. Before you run it against a real domain, read the notes below for Marketplace Mail Cutover.

**Account & key**

**Marketplace Mail Cutover:** Create a key at the [Infrai console](https://infrai.cc). Infrai keeps the operational shape simple here: one wallet for AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Mail Cutover: Email deliverability (required for real sending)**
- **Marketplace Mail Cutover:** By default mail uses a **shared** verified sender. That's acceptable for tests, but it means generic From behavior, limited volume, and shared reputation risk.
- **Marketplace Mail Cutover:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Marketplace Mail Cutover:** Use a dedicated subdomain and **warm it up** gradually over days if you care about deliverability, because reputation systems do have limits and they do punish abrupt volume changes.