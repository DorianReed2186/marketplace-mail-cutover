import test from "node:test";
import assert from "node:assert/strict";
import { cutoverBody, handoffDecision } from "./mail_handoff.ts";

const request = {
  domain: "market.example", orderId: "order-42", buyerUpdates: "dashboard",
  sellerAssets: [{ sellerId: "seller-7", assetId: "listing-12", ready: false }],
  mx: [{ content: "mx1.provider.example", priority: 10 }]
};

test("an unfinished seller asset holds the order before mail changes", () => {
  const input = cutoverBody.parse(request);
  assert.equal(handoffDecision(input), "hold-for-seller-assets");
  input.sellerAssets[0].ready = true;
  assert.equal(handoffDecision(input), "prepare-mail-cutover");
});

test("ambiguous primary and backup priority is rejected at the boundary", () => {
  assert.equal(cutoverBody.safeParse({
    ...request,
    mx: [request.mx[0], { content: "mx2.provider.example", priority: 10 }]
  }).success, false);
});
