/** HTTP transport for the production REST contract or the explicit demo protocol. */
import { ApiError, normalizedRequestBody, type ServiceAdapter, type ServiceRequest } from "./types";
import { validateRequest } from "../contracts/validation";
import { restEndpoints } from "../contracts/endpoints";

const REQUEST_TIMEOUT_MS = 20_000;
export interface HttpAdapterOptions {
  headers?: () => Record<string, string>;
  kind?: string;
  protocol?: "rest" | "mock";
  credentials?: RequestCredentials;
  timeoutMs?: number;
}

function buildRequest(base: string, req: ServiceRequest, body: Record<string, unknown> | undefined, protocol: "rest" | "mock") {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  let method: "GET" | "POST";
  let path: string;
  if (protocol === "mock") {
    method = body !== undefined ? "POST" : "GET";
    path = `/${req.op.replace(/\./g, "/")}`;
  } else {
    const endpoint = Object.hasOwn(restEndpoints, req.op) ? restEndpoints[req.op] : undefined;
    if (!endpoint) throw new ApiError("NOT_FOUND", `Unknown service operation: ${req.op}`);
    method = endpoint.method;
    path = endpoint.path.replace(/\{([^}]+)\}/g, (_, key: string) => {
      const value = req.query?.[key] ?? body?.[key];
      if (value === undefined || value === null || value === "") {
        throw new ApiError("VALIDATION_FAILED", `${key} is required for ${req.op}.`);
      }
      query.delete(key);
      return encodeURIComponent(String(value));
    });
    for (const [screenKey, restKey] of Object.entries(endpoint.queryAliases ?? {})) {
      const value = query.get(screenKey);
      if (value !== null && !query.has(restKey)) query.set(restKey, value);
      query.delete(screenKey);
    }
  }
  const suffix = method === "GET" && query.size > 0 ? `?${query}` : "";
  return { url: `${base.replace(/\/+$/, "")}${path}${suffix}`, method };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function textField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
function statusCode(status: number): string {
  return ({ 400: "VALIDATION_FAILED", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND",
    409: "CONFLICT", 422: "RULE_VIOLATION", 500: "INTERNAL" } as Record<number, string>)[status] ?? `HTTP_${status}`;
}
function decode<T>(res: Response, json: unknown): T {
  if (isRecord(json) && "ok" in json) {
    if (json.ok === true && Object.hasOwn(json, "data") && json.error === undefined) {
      if (res.ok) return json.data as T;
      throw new ApiError(statusCode(res.status), "The response status contradicts its success envelope.");
    }
    if (json.ok === false && isRecord(json.error)) {
      const code = textField(json.error.code), message = textField(json.error.message);
      if (code && message) throw new ApiError(code, message, json.error.details);
    }
    throw new ApiError("BAD_RESPONSE", "The service returned a malformed response envelope.");
  }
  if (res.ok) {
    if (isRecord(json) || Array.isArray(json)) return json as T;
    throw new ApiError("BAD_RESPONSE", "The service returned an invalid resource.");
  }
  const problem = isRecord(json) ? json : {};
  const type = textField(problem.type);
  const code = textField(problem.code) ?? (type && /^[A-Z][A-Z0-9_]+$/.test(type) ? type : statusCode(res.status));
  throw new ApiError(code, textField(problem.detail) ?? textField(problem.message) ?? textField(problem.title) ?? "Request failed.", problem.details);
}

export class HttpServiceAdapter implements ServiceAdapter {
  readonly kind: string;
  private readonly protocol: "rest" | "mock";
  private readonly timeoutMs: number;
  constructor(private readonly base: string, private readonly opts: HttpAdapterOptions = {}) {
    this.kind = opts.kind ?? `http:${base}`;
    this.protocol = opts.protocol ?? "rest";
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new RangeError("Request timeout must be positive.");
  }

  async request<T = unknown>(req: ServiceRequest): Promise<T> {
    const body = normalizedRequestBody(req);
    const { url, method } = buildRequest(this.base, req, body, this.protocol);
    if (method === "POST" && !req.skipValidation) {
      const checked = validateRequest(req.op, body ?? {});
      if (!checked.ok) throw new ApiError("VALIDATION_FAILED", `Invalid request for ${req.op}: ${checked.issues.join("; ")}`);
    }
    const key = req.idempotencyKey ?? textField(body?.idempotencyKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method, headers: {
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          ...(this.opts.headers?.() ?? {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        credentials: this.opts.credentials ?? "same-origin", cache: "no-store", signal: controller.signal,
      });
      let json: unknown;
      try { json = await res.json(); }
      catch {
        if (controller.signal.aborted) throw new ApiError("NETWORK", `Request to ${req.op} timed out.`);
        throw new ApiError("BAD_RESPONSE", "The service returned an unreadable response.");
      }
      return decode<T>(res, json);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("NETWORK", controller.signal.aborted ? `Request to ${req.op} timed out.`
        : "Could not reach the service. Check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }
  }
}
