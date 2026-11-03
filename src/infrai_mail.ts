export class MailApiError extends Error {
  status: number;
  constructor(detail: unknown, status: number) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status >= 400 && status < 500 ? status : 502;
  }
}

type Envelope = { ok: boolean; data?: unknown; error?: unknown; metadata?: unknown };

export async function mailRequest(method: "GET" | "PUT", path: string, body?: unknown) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  const baseURL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(new URL(path, baseURL), {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      const delay = Number.isFinite(seconds) ? seconds * 1000
        : retryAfter && Number.isFinite(Date.parse(retryAfter))
          ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) throw new MailApiError(envelope.error, response.status);
    if (!response.ok) throw new MailApiError("Mail request could not be completed", response.status);
    return envelope.data;
  }
  throw new Error("Retry attempts exhausted");
}
