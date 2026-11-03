import { z } from "zod";

export const cutoverBody = z.object({
  domain: z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
  sellerAssets: z.array(z.object({
    sellerId: z.string().min(1),
    assetId: z.string().min(1),
    ready: z.boolean()
  }).strict()).min(1),
  buyerUpdates: z.enum(["dashboard", "email"]),
  orderId: z.string().min(1),
  mx: z.array(z.object({
    content: z.string().regex(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\.?$/),
    priority: z.number().int().min(0).max(65535)
  }).strict()).min(1).refine(
    records => new Set(records.map(record => record.priority)).size === records.length,
    "Choose distinct MX priorities for primary and backup delivery"
  )
}).strict();

export type Cutover = z.infer<typeof cutoverBody>;

export function handoffDecision(input: Cutover) {
  return input.sellerAssets.every(asset => asset.ready)
    ? "prepare-mail-cutover" as const
    : "hold-for-seller-assets" as const;
}
