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

export type PaymentProviderConfig =
  | { kind: "paystack"; secretKey: string; callbackUrl: string }
  | {
      kind: "hubtel";
      clientId: string;
      clientSecret: string;
      requestMoneyUrl: string;
      statusUrl: string;
      callbackUrl: string;
      returnUrl: string;
      cancellationUrl: string;
    }
  | {
      kind: "etranzact";
      terminalId: string;
      secretKey: string;
      checkoutUrl: string;
      queryUrl: string;
      responseUrl: string;
    }
  | { kind: "custom"; id: string };

export interface PaymentConfig {
  providerId: string;
  provider: PaymentProviderConfig;
  enabledMethods: ElectronicPaymentMethod[];
  confirmedHoldMinutes: number;
  requestTimeoutMs: number;
  reconcileAfterSeconds: number;
  hostedDomains: string[];
}

export interface HubtelPaymentConfig {
  clientId: string;
  clientSecret: string;
  requestMoneyUrl: string;
  statusUrl: string;
  callbackUrl: string;
  returnUrl: string;
  cancellationUrl: string;
}

export interface HubtelRefundConfig {
  baseUrl: string;
  basicUsername: string;
  basicPassword: string;
  collectionAccount: string;
  callbackOrigin: string;
  callbackSecret: string;
}

export type ProductMediaConfig =
  | { kind: "filesystem"; root: string; publicBaseUrl: string }
  | {
      kind: "s3";
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl: string;
    };

export interface ImageGenerationConfig {
  providerId: "openai" | "fake";
  model: string;
  openAiApiKey?: string;
  timeoutMs: number;
  maxCandidates: number;
  workerPollIntervalMs: number;
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
  hubtelPayment: HubtelPaymentConfig | null;
  hubtelRefund: HubtelRefundConfig | null;
  productMedia: ProductMediaConfig | null;
  imageGeneration: ImageGenerationConfig | null;
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

    const providerUrl = (name: string, value: string | undefined) => {
      if (!value) throw new Error(`${name} is required when PAYMENT_PROVIDER_ID=${providerId}`);
      let url: URL;
      try {
        url = new URL(value.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "value"));
      } catch {
        throw new Error(`${name} must be an absolute HTTP(S) URL`);
      }
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error(`${name} must be an absolute HTTP(S) URL`);
      if (env.NODE_ENV === "production" && url.protocol !== "https:")
        throw new Error(`${name} must use HTTPS in production`);
      return value;
    };
    let provider: PaymentProviderConfig;
    if (providerId === "paystack") {
      if (!env.PAYSTACK_SECRET_KEY)
        throw new Error("PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER_ID=paystack");
      provider = {
        kind: "paystack",
        secretKey: env.PAYSTACK_SECRET_KEY,
        callbackUrl: providerUrl("PAYSTACK_CALLBACK_URL", env.PAYSTACK_CALLBACK_URL),
      };
    } else if (providerId === "hubtel") {
      if (!env.HUBTEL_CLIENT_ID || !env.HUBTEL_CLIENT_SECRET)
        throw new Error("HUBTEL_CLIENT_ID and HUBTEL_CLIENT_SECRET are required when PAYMENT_PROVIDER_ID=hubtel");
      provider = {
        kind: "hubtel",
        clientId: env.HUBTEL_CLIENT_ID,
        clientSecret: env.HUBTEL_CLIENT_SECRET,
        requestMoneyUrl: providerUrl("HUBTEL_REQUEST_MONEY_URL", env.HUBTEL_REQUEST_MONEY_URL),
        statusUrl: providerUrl("HUBTEL_STATUS_URL", env.HUBTEL_STATUS_URL),
        callbackUrl: providerUrl("HUBTEL_CALLBACK_URL", env.HUBTEL_CALLBACK_URL),
        returnUrl: providerUrl("HUBTEL_RETURN_URL", env.HUBTEL_RETURN_URL),
        cancellationUrl: providerUrl("HUBTEL_CANCELLATION_URL", env.HUBTEL_CANCELLATION_URL),
      };
    } else if (providerId === "etranzact") {
      if (!env.ETRANZACT_TERMINAL_ID || !env.ETRANZACT_SECRET_KEY)
        throw new Error("ETRANZACT_TERMINAL_ID and ETRANZACT_SECRET_KEY are required when PAYMENT_PROVIDER_ID=etranzact");
      provider = {
        kind: "etranzact",
        terminalId: env.ETRANZACT_TERMINAL_ID,
        secretKey: env.ETRANZACT_SECRET_KEY,
        checkoutUrl: providerUrl("ETRANZACT_CHECKOUT_URL", env.ETRANZACT_CHECKOUT_URL),
        queryUrl: providerUrl("ETRANZACT_QUERY_URL", env.ETRANZACT_QUERY_URL),
        responseUrl: providerUrl("ETRANZACT_RESPONSE_URL", env.ETRANZACT_RESPONSE_URL),
      };
    } else {
      provider = { kind: "custom", id: providerId };
    }

    payments = {
      providerId,
      provider,
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

  const hubtelPaymentNames = [
    "HUBTEL_CLIENT_ID",
    "HUBTEL_CLIENT_SECRET",
    "HUBTEL_REQUEST_MONEY_URL",
    "HUBTEL_STATUS_URL",
    "HUBTEL_CALLBACK_URL",
    "HUBTEL_RETURN_URL",
    "HUBTEL_CANCELLATION_URL",
  ] as const;
  const hubtelPaymentSupplied = hubtelPaymentNames.filter(
    (name) => env[name] !== undefined && env[name] !== "",
  );
  let hubtelPayment: HubtelPaymentConfig | null = null;
  if (hubtelPaymentSupplied.length || payments?.providerId === "hubtel") {
    if (!payments || payments.providerId !== "hubtel")
      throw new Error("Hubtel payment configuration requires PAYMENT_PROVIDER_ID=hubtel");
    if (hubtelPaymentSupplied.length !== hubtelPaymentNames.length)
      throw new Error("Hubtel payment configuration must be supplied as a complete bundle");
    if (env.HUBTEL_CLIENT_ID!.length > 256 || env.HUBTEL_CLIENT_SECRET!.length > 256)
      throw new Error("Hubtel payment credentials are too long");

    const hubtelUrl = (name: (typeof hubtelPaymentNames)[number], value: string) => {
      let parsed: URL;
      try {
        parsed = new URL(value.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "value"));
      } catch {
        throw new Error(`${name} must be an absolute HTTP(S) URL`);
      }
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error(`${name} must be an absolute HTTP(S) URL without embedded credentials`);
      if (env.NODE_ENV === "production" && parsed.protocol !== "https:")
        throw new Error(`${name} must use HTTPS in production`);
      return value;
    };

    const requestMoneyUrl = hubtelUrl("HUBTEL_REQUEST_MONEY_URL", env.HUBTEL_REQUEST_MONEY_URL!);
    if (!requestMoneyUrl.includes("{mobileNumber}"))
      throw new Error("HUBTEL_REQUEST_MONEY_URL must contain {mobileNumber}");
    const statusUrl = hubtelUrl("HUBTEL_STATUS_URL", env.HUBTEL_STATUS_URL!);
    if (!["{reference}", "{clientReference}", "{providerReference}", "{paylinkId}"].some((token) => statusUrl.includes(token)))
      throw new Error("HUBTEL_STATUS_URL must contain a supported reference template");

    hubtelPayment = {
      clientId: env.HUBTEL_CLIENT_ID!,
      clientSecret: env.HUBTEL_CLIENT_SECRET!,
      requestMoneyUrl,
      statusUrl,
      callbackUrl: hubtelUrl("HUBTEL_CALLBACK_URL", env.HUBTEL_CALLBACK_URL!),
      returnUrl: hubtelUrl("HUBTEL_RETURN_URL", env.HUBTEL_RETURN_URL!),
      cancellationUrl: hubtelUrl("HUBTEL_CANCELLATION_URL", env.HUBTEL_CANCELLATION_URL!),
    };
  }

  const hubtelRefundNames = [
    "HUBTEL_REFUND_BASE_URL",
    "HUBTEL_REFUND_BASIC_USERNAME",
    "HUBTEL_REFUND_BASIC_PASSWORD",
    "HUBTEL_REFUND_COLLECTION_ACCOUNT",
    "HUBTEL_REFUND_CALLBACK_ORIGIN",
    "HUBTEL_REFUND_CALLBACK_SECRET",
  ] as const;
  const hubtelRefundSupplied = hubtelRefundNames.filter(
    (name) => env[name] !== undefined && env[name] !== "",
  );
  let hubtelRefund: HubtelRefundConfig | null = null;
  if (hubtelRefundSupplied.length) {
    if (hubtelRefundSupplied.length !== hubtelRefundNames.length)
      throw new Error("Hubtel refund configuration must be supplied as a complete bundle");
    const baseUrlRaw = env.HUBTEL_REFUND_BASE_URL!;
    const baseUrlParsed = new URL(baseUrlRaw);
    if (
      !["http:", "https:"].includes(baseUrlParsed.protocol) ||
      Boolean(baseUrlParsed.username || baseUrlParsed.password || baseUrlParsed.search || baseUrlParsed.hash) ||
      (env.NODE_ENV === "production" && baseUrlParsed.protocol !== "https:")
    )
      throw new Error("HUBTEL_REFUND_BASE_URL must be an absolute API base URL (HTTPS in production)");
    const baseUrl = baseUrlRaw.replace(/\/+$/, "");
    const callbackOrigin = env.HUBTEL_REFUND_CALLBACK_ORIGIN!;
    const callback = new URL(callbackOrigin);
    if (
      callback.origin !== callbackOrigin ||
      !["http:", "https:"].includes(callback.protocol) ||
      (env.NODE_ENV === "production" && callback.protocol !== "https:")
    )
      throw new Error("HUBTEL_REFUND_CALLBACK_ORIGIN must be an exact trusted origin (HTTPS in production)");
    const collectionAccount = env.HUBTEL_REFUND_COLLECTION_ACCOUNT!;
    if (!/^\d{3,32}$/.test(collectionAccount))
      throw new Error("HUBTEL_REFUND_COLLECTION_ACCOUNT must contain only digits");
    const callbackSecret = env.HUBTEL_REFUND_CALLBACK_SECRET!;
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(callbackSecret))
      throw new Error("HUBTEL_REFUND_CALLBACK_SECRET must be 32-128 URL-safe characters");
    if (env.HUBTEL_REFUND_BASIC_USERNAME!.length > 256 || env.HUBTEL_REFUND_BASIC_PASSWORD!.length > 256)
      throw new Error("Hubtel refund Basic Auth credentials are too long");
    hubtelRefund = {
      baseUrl,
      basicUsername: env.HUBTEL_REFUND_BASIC_USERNAME!,
      basicPassword: env.HUBTEL_REFUND_BASIC_PASSWORD!,
      collectionAccount,
      callbackOrigin,
      callbackSecret,
    };
  }

  const mediaAuxNames = [
    "PRODUCT_MEDIA_FILESYSTEM_ROOT",
    "PRODUCT_MEDIA_PUBLIC_BASE_URL",
    "PRODUCT_MEDIA_S3_ENDPOINT",
    "PRODUCT_MEDIA_S3_REGION",
    "PRODUCT_MEDIA_S3_BUCKET",
    "PRODUCT_MEDIA_S3_ACCESS_KEY_ID",
    "PRODUCT_MEDIA_S3_SECRET_ACCESS_KEY",
  ] as const;
  const mediaAuxSupplied = mediaAuxNames.some((name) => Boolean(env[name]));
  let productMedia: ProductMediaConfig | null = null;
  if (!env.PRODUCT_MEDIA_STORAGE && mediaAuxSupplied)
    throw new Error("PRODUCT_MEDIA_STORAGE is required when product media configuration is supplied");
  if (env.PRODUCT_MEDIA_STORAGE) {
    const publicBaseUrl = env.PRODUCT_MEDIA_PUBLIC_BASE_URL;
    if (!publicBaseUrl) throw new Error(`${env.PRODUCT_MEDIA_STORAGE === "filesystem" ? "Filesystem" : "S3"} product media bundle requires PRODUCT_MEDIA_PUBLIC_BASE_URL`);
    const publicUrl = new URL(publicBaseUrl);
    if (!["http:", "https:"].includes(publicUrl.protocol) || !publicBaseUrl.endsWith("/"))
      throw new Error("PRODUCT_MEDIA_PUBLIC_BASE_URL must be an absolute HTTP(S) URL ending in /");
    if (env.PRODUCT_MEDIA_STORAGE === "filesystem") {
      if (!env.PRODUCT_MEDIA_FILESYSTEM_ROOT || !env.PRODUCT_MEDIA_FILESYSTEM_ROOT.startsWith("/"))
        throw new Error("Filesystem product media bundle requires an absolute PRODUCT_MEDIA_FILESYSTEM_ROOT");
      if (["PRODUCT_MEDIA_S3_ENDPOINT","PRODUCT_MEDIA_S3_REGION","PRODUCT_MEDIA_S3_BUCKET","PRODUCT_MEDIA_S3_ACCESS_KEY_ID","PRODUCT_MEDIA_S3_SECRET_ACCESS_KEY"].some((name) => Boolean(env[name])))
        throw new Error("Filesystem product media bundle must not include S3 fields");
      productMedia = { kind: "filesystem", root: env.PRODUCT_MEDIA_FILESYSTEM_ROOT, publicBaseUrl };
    } else if (env.PRODUCT_MEDIA_STORAGE === "s3") {
      const required = ["PRODUCT_MEDIA_S3_ENDPOINT","PRODUCT_MEDIA_S3_REGION","PRODUCT_MEDIA_S3_BUCKET","PRODUCT_MEDIA_S3_ACCESS_KEY_ID","PRODUCT_MEDIA_S3_SECRET_ACCESS_KEY"] as const;
      if (required.some((name) => !env[name])) throw new Error("S3 product media bundle must be supplied completely");
      const endpoint = new URL(env.PRODUCT_MEDIA_S3_ENDPOINT!);
      if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("S3 product media bundle endpoint must use HTTP(S)");
      productMedia = {
        kind: "s3", endpoint: env.PRODUCT_MEDIA_S3_ENDPOINT!, region: env.PRODUCT_MEDIA_S3_REGION!,
        bucket: env.PRODUCT_MEDIA_S3_BUCKET!, accessKeyId: env.PRODUCT_MEDIA_S3_ACCESS_KEY_ID!,
        secretAccessKey: env.PRODUCT_MEDIA_S3_SECRET_ACCESS_KEY!, publicBaseUrl,
      };
    } else throw new Error("PRODUCT_MEDIA_STORAGE must be filesystem or s3");
  }

  const aiAuxNames = ["AI_IMAGE_MODEL", "OPENAI_API_KEY", "AI_IMAGE_TIMEOUT_MS", "AI_IMAGE_MAX_CANDIDATES", "AI_IMAGE_WORKER_POLL_MS"] as const;
  if (!env.AI_IMAGE_PROVIDER && aiAuxNames.some((name) => Boolean(env[name])))
    throw new Error("AI_IMAGE_PROVIDER is required when AI image configuration is supplied");
  let imageGeneration: ImageGenerationConfig | null = null;
  if (env.AI_IMAGE_PROVIDER) {
    if (!productMedia) throw new Error("PRODUCT_MEDIA_STORAGE must be configured before AI image generation");
    if (!['openai','fake'].includes(env.AI_IMAGE_PROVIDER)) throw new Error("AI_IMAGE_PROVIDER must be openai or fake");
    if (env.AI_IMAGE_PROVIDER === "openai" && !env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required when AI_IMAGE_PROVIDER=openai");
    const boundedInt = (name: "AI_IMAGE_TIMEOUT_MS" | "AI_IMAGE_MAX_CANDIDATES" | "AI_IMAGE_WORKER_POLL_MS", fallback: number, min: number, max: number) => {
      const value = env[name] === undefined || env[name] === "" ? fallback : Number(env[name]);
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
      return value;
    };
    imageGeneration = {
      providerId: env.AI_IMAGE_PROVIDER as "openai" | "fake",
      model: env.AI_IMAGE_MODEL || "gpt-image-2",
      ...(env.AI_IMAGE_PROVIDER === "openai" ? { openAiApiKey: env.OPENAI_API_KEY! } : {}),
      timeoutMs: boundedInt("AI_IMAGE_TIMEOUT_MS", 60_000, 1_000, 120_000),
      maxCandidates: boundedInt("AI_IMAGE_MAX_CANDIDATES", 4, 1, 4),
      workerPollIntervalMs: boundedInt("AI_IMAGE_WORKER_POLL_MS", 2_000, 100, 60_000),
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
    hubtelPayment,
    hubtelRefund,
    productMedia,
    imageGeneration,
  };
}
