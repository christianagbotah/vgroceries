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

export interface HubtelOnlineCheckoutConfig {
  merchantAccountNumber: string;
  initiateUrl: string;
  statusUrl: string;
}

/** Official Hubtel Direct Receive Money: MoMo prompt only, not a paylink. */
export interface HubtelDirectReceiveConfig {
  merchantAccountNumber: string;
  receiveUrl: string;
  statusUrl: string;
}

export interface HubtelPaymentConfig {
  clientId: string;
  clientSecret: string;
  /** Direct Request Money only. Hosted Online Checkout uses a different endpoint. */
  requestMoneyUrl?: string;
  statusUrl?: string;
  callbackUrl: string;
  returnUrl: string;
  cancellationUrl: string;
  onlineCheckout?: HubtelOnlineCheckoutConfig;
  directReceive?: HubtelDirectReceiveConfig;
}

/** Explicit, temporary staging-only owner MoMo pilot, absent by default. */
export interface StagingMomoPilotConfig {
  customerId: string;
  phone: string;
  channel: "mtn-gh" | "vodafone-gh" | "tigo-gh";
  maxMinor: number;
  expiresAt: Date;
}

export interface HubtelRefundConfig {
  baseUrl: string;
  basicUsername: string;
  basicPassword: string;
  collectionAccount: string;
  callbackOrigin: string;
  callbackSecret: string;
}

export interface PaystackConfig {
  secretKey: string;
  initializeUrl: string;
  verifyUrl: string;
  refundUrl: string;
  refundLookupUrl: string;
  callbackUrl: string;
  technicalEmailDomain: string;
  identityHmacKey: Buffer;
}

export interface EtranzactConfig {
  terminalId: string;
  secretKey: string;
  initializeUrl: string;
  queryUrl: string;
  responseUrl: string;
  customerReturnUrl: string;
  logoUrl: string;
  technicalEmailDomain: string;
  identityHmacKey: Buffer;
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
  shipmentExecutionEnabled: boolean;
  codCashDeclarationsEnabled: boolean;
  codSupervisorCountEnabled: boolean;
  customerPickupEnabled: boolean;
  pickupAttendanceEnabled: boolean;
  pickupInAppRemindersEnabled: boolean;
  physicalReturnsEnabled: boolean;
  customerReturnClaimsEnabled: boolean;
  physicalReturnClaimLinkEnabled: boolean;
  staffManagementEnabled: boolean;
  passwordRecoveryEnabled: boolean;
  stockAdjustmentsEnabled: boolean;
  posTillFoundationEnabled: boolean;
  posCustomerLookupEnabled: boolean;
  posQuoteEnabled: boolean;
  posStockHoldsEnabled: boolean;
  posCashSalesEnabled: boolean;
  posStockHoldTtlSeconds: number;
  physicalReturnCustodyEnabled: boolean;
  physicalReturnResaleEnabled: boolean;
  physicalReturnResaleAllowedVariants: string[];
  payments: PaymentConfig | null;
  hubtelPayment: HubtelPaymentConfig | null;
  hubtelRefund: HubtelRefundConfig | null;
  stagingMomoPilot?: StagingMomoPilotConfig;
  paystack: PaystackConfig | null;
  etranzact: EtranzactConfig | null;
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
  const rawShipmentExecutionEnabled = env.LOGISTICS_SHIPMENT_EXECUTION_ENABLED;
  if (
    rawShipmentExecutionEnabled !== undefined &&
    rawShipmentExecutionEnabled !== "true" &&
    rawShipmentExecutionEnabled !== "false"
  ) throw new Error("LOGISTICS_SHIPMENT_EXECUTION_ENABLED must be true or false");
  const shipmentExecutionEnabled = rawShipmentExecutionEnabled === "true";
  const rawCodCashDeclarations = env.COD_CASH_DECLARATIONS_ENABLED;
  if(rawCodCashDeclarations !== undefined && !["true", "false"].includes(rawCodCashDeclarations))
    throw new Error("COD_CASH_DECLARATIONS_ENABLED must be true or false");
  const codCashDeclarationsEnabled = rawCodCashDeclarations === "true";
  const rawCodSupervisorCount = env.COD_SUPERVISOR_COUNT_ENABLED;
  if (rawCodSupervisorCount !== undefined && !["true", "false"].includes(rawCodSupervisorCount))
    throw new Error("COD_SUPERVISOR_COUNT_ENABLED must be true or false");
  const codSupervisorCountEnabled = rawCodSupervisorCount === "true";
  if (codSupervisorCountEnabled && !codCashDeclarationsEnabled)
    throw new Error("COD_SUPERVISOR_COUNT_ENABLED requires COD_CASH_DECLARATIONS_ENABLED");

  const rawCustomerPickupEnabled = env.LOGISTICS_CUSTOMER_PICKUP_ENABLED;
  if (rawCustomerPickupEnabled !== undefined && !["true", "false"].includes(rawCustomerPickupEnabled))
    throw new Error("LOGISTICS_CUSTOMER_PICKUP_ENABLED must be true or false");
  const customerPickupEnabled = rawCustomerPickupEnabled === "true";
  const rawPickupAttendance = env.PICKUP_ATTENDANCE_ENABLED;
  if (rawPickupAttendance !== undefined && !["true", "false"].includes(rawPickupAttendance))
    throw new Error("PICKUP_ATTENDANCE_ENABLED must be true or false");
  const pickupAttendanceEnabled = rawPickupAttendance === "true";
  if (pickupAttendanceEnabled && (!customerPickupEnabled || !shipmentExecutionEnabled))
    throw new Error("Pickup attendance requires enabled remote pickup and shipment execution");
  const rawPickupReminders = env.PICKUP_INAPP_REMINDERS_ENABLED;
  if (rawPickupReminders !== undefined && !["true", "false"].includes(rawPickupReminders))
    throw new Error("PICKUP_INAPP_REMINDERS_ENABLED must be true or false");
  const pickupInAppRemindersEnabled = rawPickupReminders === "true";
  if (pickupInAppRemindersEnabled && (!customerPickupEnabled || !shipmentExecutionEnabled))
    throw new Error("Pickup in-app reminders require both remote pickup and shipment execution enabled");
  const rawReturnClaimsEnabled=env.CUSTOMER_RETURN_CLAIMS_ENABLED;
  if(rawReturnClaimsEnabled!==undefined&&!["true","false"].includes(rawReturnClaimsEnabled))
    throw new Error("CUSTOMER_RETURN_CLAIMS_ENABLED must be true or false");
  const customerReturnClaimsEnabled=rawReturnClaimsEnabled==="true";
  const rawStaffManagement=env.STAFF_MANAGEMENT_ENABLED;
  if(rawStaffManagement!==undefined&&!["true","false"].includes(rawStaffManagement))
    throw new Error("STAFF_MANAGEMENT_ENABLED must be true or false");
  const staffManagementEnabled=rawStaffManagement==="true";
  const rawPasswordRecovery=env.PASSWORD_RECOVERY_ENABLED;
  if(rawPasswordRecovery!==undefined&&!["true","false"].includes(rawPasswordRecovery))
    throw new Error("PASSWORD_RECOVERY_ENABLED must be true or false");
  const passwordRecoveryEnabled=rawPasswordRecovery==="true";
  const rawAdjustments=env.STOCK_ADJUSTMENTS_ENABLED;
  if(rawAdjustments!==undefined&&!["true","false"].includes(rawAdjustments))
    throw new Error("STOCK_ADJUSTMENTS_ENABLED must be true or false");
  const stockAdjustmentsEnabled=rawAdjustments==="true";
  const rawPosTill=env.POS_TILL_FOUNDATION_ENABLED;
  if(rawPosTill!==undefined&&!["true","false"].includes(rawPosTill))
    throw new Error("POS_TILL_FOUNDATION_ENABLED must be true or false");
  const posTillFoundationEnabled=rawPosTill==="true";
  const rawPosCustomers=env.POS_CUSTOMER_LOOKUP_ENABLED;
  if(rawPosCustomers!==undefined&&!["true","false"].includes(rawPosCustomers))
    throw new Error("POS_CUSTOMER_LOOKUP_ENABLED must be true or false");
  const posCustomerLookupEnabled=rawPosCustomers==="true";
  if(posCustomerLookupEnabled&&!posTillFoundationEnabled)
    throw new Error("POS_CUSTOMER_LOOKUP_ENABLED requires POS_TILL_FOUNDATION_ENABLED");
  const rawPosQuote=env.POS_QUOTE_ENABLED;
  if(rawPosQuote!==undefined&&!["true","false"].includes(rawPosQuote))
    throw new Error("POS_QUOTE_ENABLED must be true or false");
  const posQuoteEnabled=rawPosQuote==="true";
  if(posQuoteEnabled&&!posTillFoundationEnabled)
    throw new Error("POS_QUOTE_ENABLED requires POS_TILL_FOUNDATION_ENABLED");
  const rawPosHolds=env.POS_STOCK_HOLDS_ENABLED;
  if(rawPosHolds!==undefined&&!["true","false"].includes(rawPosHolds))
    throw new Error("POS_STOCK_HOLDS_ENABLED must be true or false");
  const posStockHoldsEnabled=rawPosHolds==="true";
  if(posStockHoldsEnabled&&!posQuoteEnabled)
    throw new Error("POS_STOCK_HOLDS_ENABLED requires POS_QUOTE_ENABLED");
  const rawPosCash=env.POS_CASH_SALES_ENABLED;
  if(rawPosCash!==undefined&&!["true","false"].includes(rawPosCash))
    throw new Error("POS_CASH_SALES_ENABLED must be true or false");
  const posCashSalesEnabled=rawPosCash==="true";
  if(posCashSalesEnabled&&!posStockHoldsEnabled)
    throw new Error("POS_CASH_SALES_ENABLED requires POS_STOCK_HOLDS_ENABLED");
  const posStockHoldTtlSeconds=Number(env.POS_STOCK_HOLD_TTL_SECONDS??"300");
  if(!Number.isInteger(posStockHoldTtlSeconds)||posStockHoldTtlSeconds<1||posStockHoldTtlSeconds>300)
    throw new Error("POS_STOCK_HOLD_TTL_SECONDS must be an integer between 1 and 300");
  const rawPhysicalReturnsEnabled=env.PHYSICAL_RETURNS_INTAKE_ENABLED;
  if(rawPhysicalReturnsEnabled!==undefined&&
    !["true","false"].includes(rawPhysicalReturnsEnabled))
    throw new Error("PHYSICAL_RETURNS_INTAKE_ENABLED must be true or false");
  const physicalReturnsEnabled=rawPhysicalReturnsEnabled==="true";
  const rawClaimLinkEnabled=env.PHYSICAL_RETURN_CLAIM_LINK_ENABLED;
  if(rawClaimLinkEnabled!==undefined&&!["true","false"].includes(rawClaimLinkEnabled))
    throw new Error("PHYSICAL_RETURN_CLAIM_LINK_ENABLED must be true or false");
  const physicalReturnClaimLinkEnabled=rawClaimLinkEnabled==="true";
  if(physicalReturnClaimLinkEnabled&&(!physicalReturnsEnabled||!customerReturnClaimsEnabled))
    throw new Error("PHYSICAL_RETURN_CLAIM_LINK_ENABLED requires claim and physical-return intake");
  const custodyFlag=env.PHYSICAL_RETURNS_CUSTODY_ENABLED;
  if(custodyFlag!==undefined&&!["true","false"].includes(custodyFlag))
    throw new Error("PHYSICAL_RETURNS_CUSTODY_ENABLED must be true or false");
  const physicalReturnCustodyEnabled=custodyFlag==="true";
  if(physicalReturnCustodyEnabled&&!physicalReturnsEnabled)
    throw new Error("PHYSICAL_RETURNS_CUSTODY_ENABLED requires physical return intake");
  const rawResaleEnabled=env.PHYSICAL_RETURNS_RESALE_ENABLED;
  if(rawResaleEnabled!==undefined&&!["true","false"].includes(rawResaleEnabled))
    throw new Error("PHYSICAL_RETURNS_RESALE_ENABLED must be true or false");
  const physicalReturnResaleEnabled=rawResaleEnabled==="true";
  if(physicalReturnResaleEnabled&&(!physicalReturnsEnabled||!physicalReturnCustodyEnabled))
    throw new Error("PHYSICAL_RETURNS_RESALE_ENABLED requires both physical intake and custody");
  const physicalReturnResaleAllowedVariants=[...new Set(
    (env.PHYSICAL_RETURNS_RESALE_ALLOWED_VARIANTS??"").split(",")
      .map(x=>x.trim()).filter(Boolean),
  )];
  if(physicalReturnResaleAllowedVariants.some(x=>!/^[-a-zA-Z0-9_]{1,128}$/.test(x)))
    throw new Error("PHYSICAL_RETURNS_RESALE_ALLOWED_VARIANTS contains invalid IDs");
  if (customerPickupEnabled && !shipmentExecutionEnabled)
    throw new Error("LOGISTICS_CUSTOMER_PICKUP_ENABLED requires shipment execution");
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
          "PAYMENT_ENABLED_METHODS may contain only hosted_checkout, mobile_money, card_hosted or bank_transfer",
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

  const hubtelCommonNames = [
    "HUBTEL_CLIENT_ID",
    "HUBTEL_CLIENT_SECRET",
    "HUBTEL_CALLBACK_URL",
    "HUBTEL_RETURN_URL",
    "HUBTEL_CANCELLATION_URL",
  ] as const;
  const hubtelDirectNames = ["HUBTEL_REQUEST_MONEY_URL", "HUBTEL_STATUS_URL"] as const;
  const hubtelDirectReceiveNames = [
    "HUBTEL_DIRECT_COLLECTION_ACCOUNT",
    "HUBTEL_DIRECT_RECEIVE_URL",
    "HUBTEL_DIRECT_STATUS_URL",
  ] as const;
  const hubtelHostedNames = [
    "HUBTEL_COLLECTION_ACCOUNT_NUMBER",
    "HUBTEL_ONLINE_CHECKOUT_URL",
    "HUBTEL_COLLECTION_STATUS_URL",
  ] as const;
  const hubtelPaymentNames = [...hubtelCommonNames, ...hubtelDirectNames, ...hubtelDirectReceiveNames, ...hubtelHostedNames];
  const hubtelPaymentSupplied = hubtelPaymentNames.filter(
    (name) => env[name] !== undefined && env[name] !== "",
  );
  let hubtelPayment: HubtelPaymentConfig | null = null;
  if (hubtelPaymentSupplied.length || payments?.providerId === "hubtel") {
    if (!payments || payments.providerId !== "hubtel")
      throw new Error("Hubtel payment configuration requires PAYMENT_PROVIDER_ID=hubtel");
    if (hubtelCommonNames.some((name) => !env[name]))
      throw new Error("Hubtel payment configuration must be supplied as a complete bundle");
    if (env.HUBTEL_CLIENT_ID!.length > 256 || env.HUBTEL_CLIENT_SECRET!.length > 256)
      throw new Error("Hubtel payment credentials are too long");

    // Method-specific bundles cannot be mixed: lookup receives a merchant
    // reference, not a payment method, so mixed hosted/direct routing would
    // otherwise be ambiguous during recovery and webhook reconciliation.
    const directEnabled = payments.enabledMethods.includes("mobile_money");
    const hostedEnabled = payments.enabledMethods.includes("hosted_checkout");
    const directSupplied = hubtelDirectNames.filter((name) => Boolean(env[name]));
    const directReceiveSupplied = hubtelDirectReceiveNames.filter((name) => Boolean(env[name]));
    const hostedSupplied = hubtelHostedNames.filter((name) => Boolean(env[name]));
    if (directEnabled === hostedEnabled)
      throw new Error("Hubtel requires exactly one of hosted_checkout or mobile_money; mixed modes are not supported");
    if (directSupplied.length && directReceiveSupplied.length)
      throw new Error("Hubtel Direct Receive Money and legacy Request Money configurations cannot be combined");
    if (directEnabled && directSupplied.length !== hubtelDirectNames.length &&
        directReceiveSupplied.length !== hubtelDirectReceiveNames.length)
      throw new Error("Hubtel mobile_money requires exactly one complete Direct Receive Money or legacy Request Money bundle");
    if (directSupplied.length && !directEnabled)
      throw new Error("Hubtel Direct Request Money URLs may only be configured with mobile_money");
    if (directSupplied.length && directSupplied.length !== hubtelDirectNames.length)
      throw new Error("Hubtel Direct Request Money URLs require a complete mobile_money configuration");
    if (directReceiveSupplied.length &&
        (!directEnabled || directReceiveSupplied.length !== hubtelDirectReceiveNames.length))
      throw new Error("Hubtel Direct Receive Money URLs require a complete mobile_money configuration");
    if ((hostedEnabled || hostedSupplied.length > 0) && hostedSupplied.length !== hubtelHostedNames.length)
      throw new Error("Hubtel hosted checkout requires the complete merchant account and URLs bundle");
    if (hostedSupplied.length && !hostedEnabled)
      throw new Error("Hubtel hosted checkout configuration requires hosted_checkout method");
    if (hostedEnabled && payments.enabledMethods[0] !== "hosted_checkout")
      throw new Error("Hubtel hosted_checkout must be the default Electronic payment method");
    if (hostedEnabled && !payments.hostedDomains.includes("pay.hubtel.com"))
      throw new Error("PAYMENT_HOSTED_DOMAINS must allow pay.hubtel.com for Hubtel Online Checkout");

    const hubtelUrl = (name: string, value: string) => {
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

    let requestMoneyUrl: string | undefined;
    let statusUrl: string | undefined;
    if (directEnabled && directSupplied.length) {
      requestMoneyUrl = hubtelUrl("HUBTEL_REQUEST_MONEY_URL", env.HUBTEL_REQUEST_MONEY_URL!);
      if (!requestMoneyUrl.includes("{mobileNumber}"))
        throw new Error("HUBTEL_REQUEST_MONEY_URL must contain {mobileNumber}");
      statusUrl = hubtelUrl("HUBTEL_STATUS_URL", env.HUBTEL_STATUS_URL!);
      if (!["{reference}", "{clientReference}", "{providerReference}", "{paylinkId}"].some((token) => statusUrl!.includes(token)))
        throw new Error("HUBTEL_STATUS_URL must contain a supported reference template");
    }

    // Hubtel v1 Direct Receive Money uses a *different* pending-prompt
    // contract from paylink-style Request Money; do not interchange them.
    let directReceive: HubtelDirectReceiveConfig | undefined;
    if (directEnabled && directReceiveSupplied.length) {
      const merchantAccountNumber = env.HUBTEL_DIRECT_COLLECTION_ACCOUNT!;
      if (!/^[0-9]{3,32}$/.test(merchantAccountNumber))
        throw new Error("HUBTEL_DIRECT_COLLECTION_ACCOUNT must contain 3-32 digits");
      const receiveUrl = hubtelUrl("HUBTEL_DIRECT_RECEIVE_URL", env.HUBTEL_DIRECT_RECEIVE_URL!);
      const directStatusUrl = hubtelUrl("HUBTEL_DIRECT_STATUS_URL", env.HUBTEL_DIRECT_STATUS_URL!);
      if (receiveUrl !== "https://rmp.hubtel.com/merchantaccount/merchants/{merchantAccountNumber}/receive/mobilemoney" ||
          directStatusUrl !== "https://api-txnstatus.hubtel.com/transactions/{merchantAccountNumber}/status?clientReference={reference}")
        throw new Error("Hubtel Direct Receive Money must use the official RMP and collection-status endpoint templates");
      directReceive = { merchantAccountNumber, receiveUrl, statusUrl: directStatusUrl };
    }

    let onlineCheckout: HubtelOnlineCheckoutConfig | undefined;
    if (hostedEnabled) {
      const merchantAccountNumber = env.HUBTEL_COLLECTION_ACCOUNT_NUMBER!;
      if (!/^\d{3,32}$/.test(merchantAccountNumber))
        throw new Error("HUBTEL_COLLECTION_ACCOUNT_NUMBER must contain 3-32 digits");
      const initiateUrl = hubtelUrl("HUBTEL_ONLINE_CHECKOUT_URL", env.HUBTEL_ONLINE_CHECKOUT_URL!);
      const collectionStatusUrl = hubtelUrl("HUBTEL_COLLECTION_STATUS_URL", env.HUBTEL_COLLECTION_STATUS_URL!);
      if (!collectionStatusUrl.includes("{merchantAccountNumber}") ||
          !collectionStatusUrl.includes("{reference}"))
        throw new Error("HUBTEL_COLLECTION_STATUS_URL requires merchantAccountNumber and reference templates");
      const init = new URL(initiateUrl);
      const status = new URL(collectionStatusUrl
        .replaceAll("{merchantAccountNumber}", "merchant")
        .replaceAll("{reference}", "ref"));
      const prod = init.origin === "https://payproxyapi.hubtel.com" &&
        init.pathname === "/items/initiate" &&
        status.origin === "https://api-txnstatus.hubtel.com" &&
        status.pathname === "/transactions/merchant/status";
      const sandbox = env.NODE_ENV !== "production" &&
        init.origin === "https://code.hubtel.com" &&
        init.pathname === "/sandbox/v1/payproxyapi/items/initiate" &&
        status.origin === "https://code.hubtel.com" &&
        status.pathname === "/sandbox/v1/api-txnstatus/transactions/merchant/status";
      if ((!prod && !sandbox) || init.search || init.hash || status.hash ||
          status.searchParams.size !== 1 || status.searchParams.get("clientReference") !== "ref")
        throw new Error("Hubtel Online Checkout URLs must match the official production or non-production sandbox host/path pair");
      onlineCheckout = { merchantAccountNumber, initiateUrl, statusUrl: collectionStatusUrl };
    }

    hubtelPayment = {
      clientId: env.HUBTEL_CLIENT_ID!,
      clientSecret: env.HUBTEL_CLIENT_SECRET!,
      ...(requestMoneyUrl ? { requestMoneyUrl } : {}),
      ...(statusUrl ? { statusUrl } : {}),
      callbackUrl: hubtelUrl("HUBTEL_CALLBACK_URL", env.HUBTEL_CALLBACK_URL!),
      returnUrl: hubtelUrl("HUBTEL_RETURN_URL", env.HUBTEL_RETURN_URL!),
      cancellationUrl: hubtelUrl("HUBTEL_CANCELLATION_URL", env.HUBTEL_CANCELLATION_URL!),
      ...(onlineCheckout ? { onlineCheckout } : {}),
      ...(directReceive ? { directReceive } : {}),
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

  const pilotFields = [
    "STAGING_MOMO_PILOT_CUSTOMER_ID",
    "STAGING_MOMO_PILOT_PHONE",
    "STAGING_MOMO_PILOT_CHANNEL",
    "STAGING_MOMO_PILOT_MAX_MINOR",
    "STAGING_MOMO_PILOT_EXPIRES_AT",
  ] as const;
  const pilotMode = env.STAGING_MOMO_PILOT_ENABLED;
  if (pilotMode !== undefined && !["true", "false"].includes(pilotMode))
    throw new Error("STAGING_MOMO_PILOT_ENABLED must be true or false");
  // An explicit false is an emergency kill switch: stale private values must
  // not crash the whole POS API or permit new prompts. Omitted flag with a
  // partial private bundle remains a fail-fast configuration error.
  if (pilotMode === undefined && pilotFields.some((key) => Boolean(env[key])))
    throw new Error("Pilot private fields require explicit STAGING_MOMO_PILOT_ENABLED=true");
  let stagingMomoPilot: StagingMomoPilotConfig | undefined;
  if (pilotMode === "true") {
    if (pilotFields.some((key) => !env[key]))
      throw new Error("Staging MoMo pilot requires the complete private gate bundle");
    if (env.NODE_ENV !== "production" ||
        webOrigins.length !== 1 ||
        webOrigins[0] !== "https://portal.varietygroceries.com")
      throw new Error("Staging MoMo pilot must run on the isolated HTTPS staging portal");
    if (payments?.providerId !== "hubtel" ||
        payments.enabledMethods.length !== 1 ||
        payments.enabledMethods[0] !== "mobile_money" ||
        !hubtelPayment?.directReceive || !hubtelRefund ||
        hubtelRefund.baseUrl !== "https://refund-api.hubtel.com" ||
        hubtelRefund.collectionAccount !== hubtelPayment.directReceive.merchantAccountNumber ||
        hubtelRefund.basicUsername !== hubtelPayment.clientId ||
        hubtelRefund.basicPassword !== hubtelPayment.clientSecret)
      throw new Error("Staging MoMo pilot requires same-provider Direct Receive and verified refund configurations");
    const customerId = env.STAGING_MOMO_PILOT_CUSTOMER_ID!;
    const phone = env.STAGING_MOMO_PILOT_PHONE!;
    const channel = env.STAGING_MOMO_PILOT_CHANNEL!;
    const maxMinor = Number(env.STAGING_MOMO_PILOT_MAX_MINOR);
    const expiresRaw = env.STAGING_MOMO_PILOT_EXPIRES_AT!;
    const expiresAt = new Date(expiresRaw);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId) ||
        !/^\+233[0-9]{9}$/.test(phone) ||
        !["mtn-gh", "vodafone-gh", "tigo-gh"].includes(channel) ||
        !Number.isSafeInteger(maxMinor) || maxMinor < 100 || maxMinor > 1_000 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiresRaw) ||
        !Number.isFinite(expiresAt.valueOf()) ||
        // The pilot must fail closed after expiry WITHOUT preventing the
        // staging API from restarting. Runtime policy denies expired pilots.
        expiresAt.valueOf() - Date.now() > 24 * 60 * 60 * 1000)
      throw new Error("Staging MoMo pilot requires one customer UUID, one Ghana phone/network, <= ₵10 and <= 24h expiry");
    stagingMomoPilot = { customerId, phone, channel: channel as StagingMomoPilotConfig["channel"], maxMinor, expiresAt };
  }

  // The staging portal is shared. Never allow a merchant configuration to
  // open Direct Receive prompts to its guests or unrelated customers.
  if (env.NODE_ENV === "production" &&
      webOrigins.includes("https://portal.varietygroceries.com") &&
      hubtelPayment?.directReceive && !stagingMomoPilot && pilotMode !== "false")
    throw new Error("Staging Hubtel Direct Receive requires an active owner-only pilot gate");

  const paystackNames = [
    "PAYSTACK_SECRET_KEY",
    "PAYSTACK_INITIALIZE_URL",
    "PAYSTACK_VERIFY_URL",
    "PAYSTACK_REFUND_URL",
    "PAYSTACK_REFUND_LOOKUP_URL",
    "PAYSTACK_CALLBACK_URL",
    "PAYSTACK_TECHNICAL_EMAIL_DOMAIN",
    "PAYSTACK_IDENTITY_HMAC_KEY",
  ] as const;
  const paystackSupplied = paystackNames.filter(
    (name) => env[name] !== undefined && env[name] !== "",
  );
  let paystack: PaystackConfig | null = null;
  if (paystackSupplied.length || payments?.providerId === "paystack") {
    if (!payments || payments.providerId !== "paystack")
      throw new Error("Paystack configuration requires PAYMENT_PROVIDER_ID=paystack");
    if (paystackSupplied.length !== paystackNames.length)
      throw new Error("Paystack configuration must be supplied as a complete bundle");
    const secretKey = env.PAYSTACK_SECRET_KEY!;
    if (secretKey.length < 8 || secretKey.length > 256)
      throw new Error("Paystack secret key length is invalid");
    const paystackUrl = (name: (typeof paystackNames)[number], value: string) => {
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
    const verifyUrl = paystackUrl("PAYSTACK_VERIFY_URL", env.PAYSTACK_VERIFY_URL!);
    if (!verifyUrl.includes("{reference}"))
      throw new Error("PAYSTACK_VERIFY_URL must contain {reference}");
    const refundLookupUrl = paystackUrl("PAYSTACK_REFUND_LOOKUP_URL", env.PAYSTACK_REFUND_LOOKUP_URL!);
    if (!refundLookupUrl.includes("{id}"))
      throw new Error("PAYSTACK_REFUND_LOOKUP_URL must contain {id}");
    const technicalEmailDomain = env.PAYSTACK_TECHNICAL_EMAIL_DOMAIN!;
    const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (technicalEmailDomain !== technicalEmailDomain.toLowerCase() || !hostnamePattern.test(technicalEmailDomain))
      throw new Error("PAYSTACK_TECHNICAL_EMAIL_DOMAIN must be a lowercase hostname");
    const rawIdentityKey = env.PAYSTACK_IDENTITY_HMAC_KEY!;
    if (!/^[a-fA-F0-9]{64}$/.test(rawIdentityKey))
      throw new Error("PAYSTACK_IDENTITY_HMAC_KEY must be a 32-byte hex key");
    paystack = {
      secretKey,
      initializeUrl: paystackUrl("PAYSTACK_INITIALIZE_URL", env.PAYSTACK_INITIALIZE_URL!),
      verifyUrl,
      refundUrl: paystackUrl("PAYSTACK_REFUND_URL", env.PAYSTACK_REFUND_URL!),
      refundLookupUrl,
      callbackUrl: paystackUrl("PAYSTACK_CALLBACK_URL", env.PAYSTACK_CALLBACK_URL!),
      technicalEmailDomain,
      identityHmacKey: Buffer.from(rawIdentityKey, "hex"),
    };
  }

  const etranzactNames = [
    "ETRANZACT_TERMINAL_ID",
    "ETRANZACT_SECRET_KEY",
    "ETRANZACT_INITIALIZE_URL",
    "ETRANZACT_QUERY_URL",
    "ETRANZACT_RESPONSE_URL",
    "ETRANZACT_CUSTOMER_RETURN_URL",
    "ETRANZACT_LOGO_URL",
    "ETRANZACT_TECHNICAL_EMAIL_DOMAIN",
    "ETRANZACT_IDENTITY_HMAC_KEY",
  ] as const;
  const etranzactSupplied = etranzactNames.filter(
    (name) => env[name] !== undefined && env[name] !== "",
  );
  let etranzact: EtranzactConfig | null = null;
  if (etranzactSupplied.length || payments?.providerId === "etranzact") {
    if (!payments || payments.providerId !== "etranzact")
      throw new Error("eTranzact configuration requires PAYMENT_PROVIDER_ID=etranzact");
    if (etranzactSupplied.length !== etranzactNames.length)
      throw new Error("eTranzact configuration must be supplied as a complete bundle");
    const terminalId = env.ETRANZACT_TERMINAL_ID!;
    if (!/^\d{10}$/.test(terminalId))
      throw new Error("ETRANZACT_TERMINAL_ID must contain exactly 10 digits");
    const secretKey = env.ETRANZACT_SECRET_KEY!;
    if (secretKey.length < 4 || secretKey.length > 256)
      throw new Error("eTranzact secret key length is invalid");
    const etranzactUrl = (name: (typeof etranzactNames)[number], value: string) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error(`${name} must be an absolute HTTP(S) URL`);
      }
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error(`${name} must be an absolute HTTP(S) URL without embedded credentials`);
      if (env.NODE_ENV === "production" && parsed.protocol !== "https:")
        throw new Error(`${name} must use HTTPS in production`);
      return value;
    };
    const technicalEmailDomain = env.ETRANZACT_TECHNICAL_EMAIL_DOMAIN!;
    const etranzactHostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (
      technicalEmailDomain !== technicalEmailDomain.toLowerCase() ||
      !etranzactHostnamePattern.test(technicalEmailDomain)
    ) throw new Error("ETRANZACT_TECHNICAL_EMAIL_DOMAIN must be a lowercase hostname");
    const rawIdentityKey = env.ETRANZACT_IDENTITY_HMAC_KEY!;
    if (!/^[a-fA-F0-9]{64}$/.test(rawIdentityKey))
      throw new Error("ETRANZACT_IDENTITY_HMAC_KEY must be a 32-byte hex key");
    const customerReturnUrl = etranzactUrl(
      "ETRANZACT_CUSTOMER_RETURN_URL",
      env.ETRANZACT_CUSTOMER_RETURN_URL!,
    );
    if (!customerReturnUrl.includes("{orderId}"))
      throw new Error("ETRANZACT_CUSTOMER_RETURN_URL must contain {orderId}");
    etranzact = {
      terminalId,
      secretKey,
      initializeUrl: etranzactUrl("ETRANZACT_INITIALIZE_URL", env.ETRANZACT_INITIALIZE_URL!),
      queryUrl: etranzactUrl("ETRANZACT_QUERY_URL", env.ETRANZACT_QUERY_URL!),
      responseUrl: etranzactUrl("ETRANZACT_RESPONSE_URL", env.ETRANZACT_RESPONSE_URL!),
      customerReturnUrl,
      logoUrl: etranzactUrl("ETRANZACT_LOGO_URL", env.ETRANZACT_LOGO_URL!),
      technicalEmailDomain,
      identityHmacKey: Buffer.from(rawIdentityKey, "hex"),
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
    shipmentExecutionEnabled,
    codCashDeclarationsEnabled,
    codSupervisorCountEnabled,
    customerPickupEnabled,
    pickupAttendanceEnabled,
    pickupInAppRemindersEnabled,
    physicalReturnsEnabled,
    customerReturnClaimsEnabled,
    physicalReturnClaimLinkEnabled,
    staffManagementEnabled,
    passwordRecoveryEnabled,
    stockAdjustmentsEnabled,
    posTillFoundationEnabled,
    posCustomerLookupEnabled,
    posQuoteEnabled,
    posStockHoldsEnabled,
    posCashSalesEnabled,
    posStockHoldTtlSeconds,
    physicalReturnCustodyEnabled,
    physicalReturnResaleEnabled,
    physicalReturnResaleAllowedVariants,
    payments,
    hubtelPayment,
    hubtelRefund,
    ...(stagingMomoPilot ? { stagingMomoPilot } : {}),
    paystack,
    etranzact,
    productMedia,
    imageGeneration,
  };
}
