import {
  electronicPaymentMethodSchema,
  type ElectronicPaymentMethod,
} from "@variety/contracts";

export interface CommerceConfig {
  locationId: string;
  paymentHoldMinutes: number;
  offlineHoldMinutes: number;
  guestTtlMinutes: number;
  verificationActiveKeyVersion: number;
  verificationKeys: Map<number, Buffer>;
}

export interface PaymentConfig {
  providerId: string;
  enabledMethods: ElectronicPaymentMethod[];
  confirmedHoldMinutes: number;
  requestTimeoutMs: number;
  reconcileAfterSeconds: number;
  hostedDomains: string[];
}

export interface ApiConfig {
  databaseUrl: string;
  webOrigins: string[];
  stockLocationId: string;
  secureCookies: boolean;
  port: number;
  host: string;
  commerce: CommerceConfig | null;
  payments: PaymentConfig | null;
}

export const API_CONFIG = Symbol("API_CONFIG");

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL))
    throw new Error("DATABASE_URL must select PostgreSQL");
  if (!env.API_STOCK_LOCATION_ID)
    throw new Error("API_STOCK_LOCATION_ID is required");
  const webOrigins = (env.WEB_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!webOrigins.length) throw new Error("WEB_ORIGINS is required");
  for (const origin of webOrigins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      !["http:", "https:"].includes(url.protocol) ||
      (env.NODE_ENV === "production" && url.protocol !== "https:")
    )
      throw new Error(
        "WEB_ORIGINS must contain exact trusted origins (HTTPS in production)",
      );
  }
  if (env.NODE_ENV === "production" && env.API_INSECURE_COOKIES === "true")
    throw new Error("Production session cookies must be secure");
  const port = Number(env.PORT ?? 3010);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");

  const commerceNames = [
    "COMMERCE_LOCATION_ID",
    "CHECKOUT_PAYMENT_HOLD_MINUTES",
    "CHECKOUT_OFFLINE_HOLD_MINUTES",
    "GUEST_CHECKOUT_TTL_MINUTES",
    "ORDER_VERIFICATION_ACTIVE_VERSION",
    "ORDER_VERIFICATION_KEYS",
  ] as const;
  const supplied = commerceNames.filter(
    (name) => env[name] !== undefined && env[name] !== "",
  );
  let commerce: CommerceConfig | null = null;
  if (supplied.length) {
    if (supplied.length !== commerceNames.length)
      throw new Error("Commerce configuration must be supplied as a complete bundle");
    const positiveInt = (name: (typeof commerceNames)[number]) => {
      const value = Number(env[name]);
      if (!Number.isInteger(value) || value <= 0)
        throw new Error(`${name} must be a positive integer`);
      return value;
    };
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.ORDER_VERIFICATION_KEYS!);
    } catch {
      throw new Error("ORDER_VERIFICATION_KEYS must be valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("ORDER_VERIFICATION_KEYS must be an object");
    const verificationKeys = new Map<number, Buffer>();
    for (const [rawVersion, rawKey] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (
        !/^[1-9]\d*$/.test(rawVersion) ||
        typeof rawKey !== "string" ||
        !/^[a-fA-F0-9]{64}$/.test(rawKey)
      )
        throw new Error(
          "ORDER_VERIFICATION_KEYS entries must map positive versions to 32-byte hex keys",
        );
      verificationKeys.set(Number(rawVersion), Buffer.from(rawKey, "hex"));
    }
    const verificationActiveKeyVersion = positiveInt(
      "ORDER_VERIFICATION_ACTIVE_VERSION",
    );
    if (!verificationKeys.has(verificationActiveKeyVersion))
      throw new Error("ORDER_VERIFICATION_KEYS must contain the active version");
    commerce = {
      locationId: env.COMMERCE_LOCATION_ID!,
      paymentHoldMinutes: positiveInt("CHECKOUT_PAYMENT_HOLD_MINUTES"),
      offlineHoldMinutes: positiveInt("CHECKOUT_OFFLINE_HOLD_MINUTES"),
      guestTtlMinutes: positiveInt("GUEST_CHECKOUT_TTL_MINUTES"),
      verificationActiveKeyVersion,
      verificationKeys,
    };
  }

  const paymentNames = [
    "PAYMENT_PROVIDER_ID",
    "PAYMENT_ENABLED_METHODS",
    "PAYMENT_CONFIRMED_HOLD_MINUTES",
    "PAYMENT_PROVIDER_TIMEOUT_MS",
    "PAYMENT_RECONCILE_AFTER_SECONDS",
    "PAYMENT_HOSTED_DOMAINS",
  ] as const;
  const paymentSupplied = paymentNames.filter(
    (name) => env[name] !== undefined && env[name] !== "",
  );
  let payments: PaymentConfig | null = null;
  if (paymentSupplied.length) {
    if (paymentSupplied.length !== paymentNames.length)
      throw new Error("Payment configuration must be supplied as a complete bundle");

    const providerId = env.PAYMENT_PROVIDER_ID!;
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(providerId))
      throw new Error("PAYMENT_PROVIDER_ID must be a stable lowercase identifier");

    const enabledMethodsRaw = env.PAYMENT_ENABLED_METHODS!
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const enabledMethods: ElectronicPaymentMethod[] = [];
    for (const raw of enabledMethodsRaw) {
      const parsed = electronicPaymentMethodSchema.safeParse(raw);
      if (!parsed.success)
        throw new Error(
          "PAYMENT_ENABLED_METHODS may contain only mobile_money, card_hosted or bank_transfer",
        );
      if (enabledMethods.includes(parsed.data))
        throw new Error("PAYMENT_ENABLED_METHODS must not contain duplicates");
      enabledMethods.push(parsed.data);
    }
    if (!enabledMethods.length)
      throw new Error("PAYMENT_ENABLED_METHODS must enable at least one electronic method");

    const integerInRange = (
      name:
        | "PAYMENT_CONFIRMED_HOLD_MINUTES"
        | "PAYMENT_PROVIDER_TIMEOUT_MS"
        | "PAYMENT_RECONCILE_AFTER_SECONDS",
      min: number,
      max?: number,
    ) => {
      const value = Number(env[name]);
      if (
        !Number.isInteger(value) ||
        value < min ||
        (max !== undefined && value > max)
      )
        throw new Error(
          `${name} must be an integer between ${min}${max === undefined ? " and above" : ` and ${max}`}`,
        );
      return value;
    };

    const hostedDomains = env.PAYMENT_HOSTED_DOMAINS!
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const hostnamePattern =
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (
      !hostedDomains.length ||
      hostedDomains.some(
        (domain) =>
          domain !== domain.toLowerCase() || !hostnamePattern.test(domain),
      ) ||
      new Set(hostedDomains).size !== hostedDomains.length
    )
      throw new Error(
        "PAYMENT_HOSTED_DOMAINS must contain unique lowercase hostnames without scheme, port or path",
      );

    payments = {
      providerId,
      enabledMethods,
      confirmedHoldMinutes: integerInRange(
        "PAYMENT_CONFIRMED_HOLD_MINUTES",
        1,
      ),
      requestTimeoutMs: integerInRange(
        "PAYMENT_PROVIDER_TIMEOUT_MS",
        100,
        30_000,
      ),
      reconcileAfterSeconds: integerInRange(
        "PAYMENT_RECONCILE_AFTER_SECONDS",
        30,
        86_400,
      ),
      hostedDomains,
    };
  }

  return {
    databaseUrl: env.DATABASE_URL,
    webOrigins,
    stockLocationId: env.API_STOCK_LOCATION_ID,
    secureCookies: env.API_INSECURE_COOKIES !== "true",
    port,
    host: env.API_HOST ?? "127.0.0.1",
    commerce,
    payments,
  };
}
