import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, raw } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { API_CONFIG, ApiConfig, readConfig } from "./config";
import { CatalogModule } from "./catalog/catalog.controller";
import { CatalogAdminModule } from "./catalog-admin/catalog-admin.module";
import { ProductMediaModule } from "./product-media/product-media.module";
import { InventoryModule } from "./inventory/inventory.controller";
import { OrdersModule } from "./orders/orders.module";
import { DeliveryConfigModule } from "./delivery-config/delivery-config.module";
import { FulfilmentModule } from "./fulfilment/fulfilment.module";
import { DispatchModule } from "./dispatch/dispatch.module";
import { LogisticsModule } from "./logistics/logistics.module";
import { IdentityModule } from "./identity/identity.module";
import { DatabaseModule } from "./database/database";
import { HealthModule } from "./health/health.controller";
import { CmsModule } from "./cms/cms.module";
import { AdminDashboardModule } from "./admin-dashboard/admin-dashboard.module";
import { AdminCustomersModule } from "./admin-customers/admin-customers.module";
import { productionOpenApi } from "./http/production-openapi";
import { ApiExceptionFilter, ApiRequest } from "./http/errors";
import { PaymentsModule } from "./payments/payments.module";
import { HubtelRefundCallbackModule } from "./payments/hubtel-refund-callback.module";
import { HubtelPaymentProvider } from "./payments/hubtel-payment-provider";
import type { PaymentProviderAdapter } from "./payments/payment-provider";
import { PAYMENT_PROVIDER_ADAPTERS } from "./payments/payment-provider.registry";
import type { RefundProviderAdapter } from "./payments/refund-provider";
import { HubtelRefundProvider } from "./payments/hubtel-refund-provider";
import { REFUND_PROVIDER_ADAPTERS } from "./payments/refund-provider.registry";

export async function createApplication(
  config: ApiConfig = readConfig(),
  paymentAdapters: PaymentProviderAdapter[] = [],
  refundAdapters: RefundProviderAdapter[] = [],
) {
  const resolvedPaymentAdapters = [...paymentAdapters];
  if (config.hubtelPayment && !resolvedPaymentAdapters.some((adapter) => adapter.id === "hubtel"))
    resolvedPaymentAdapters.push(new HubtelPaymentProvider(config.hubtelPayment));

  const resolvedRefundAdapters = [...refundAdapters];
  if (config.hubtelRefund && !resolvedRefundAdapters.some((adapter) => adapter.id === "hubtel"))
    resolvedRefundAdapters.push(new HubtelRefundProvider(config.hubtelRefund));

  @Global()
  @Module({
    providers: [
      { provide: API_CONFIG, useValue: config },
      { provide: PAYMENT_PROVIDER_ADAPTERS, useValue: resolvedPaymentAdapters },
      { provide: REFUND_PROVIDER_ADAPTERS, useValue: resolvedRefundAdapters },
    ],
    exports: [API_CONFIG, PAYMENT_PROVIDER_ADAPTERS, REFUND_PROVIDER_ADAPTERS],
  })
  class ConfigModule {}
  @Module({
    imports: [
      ConfigModule,
      DatabaseModule,
      HealthModule,
      IdentityModule,
      CatalogModule,
      CatalogAdminModule,
      CmsModule,
      AdminDashboardModule,
      AdminCustomersModule,
      ProductMediaModule,
      InventoryModule,
      OrdersModule,
      DeliveryConfigModule,
      FulfilmentModule,
      DispatchModule,
      LogisticsModule,
      // Keep Payments after the established modules so generated OpenAPI ordering
      // remains deterministic while the four Payments Authority routes are public.
      PaymentsModule,
      HubtelRefundCallbackModule,
    ],
  })
  class ApplicationModule {}
  const app = await NestFactory.create(ApplicationModule, {
    logger: false,
    bodyParser: false,
  });
  app.setGlobalPrefix("api/v1");
  app.getHttpAdapter().getInstance().set("trust proxy", "loopback");
  app.use(
    (req: ApiRequest, res: import("express").Response, next: () => void) => {
      req.requestId = randomUUID();
      res.setHeader("x-request-id", req.requestId);
      res.setHeader("cache-control", "no-store");
      next();
    },
  );
  app.use(helmet());
  // Provider verification must receive the exact bytes that were signed.
  // This narrowly scoped raw parser must run before the generic JSON parser.
  app.use(
    "/api/v1/payments/providers/:provider/events",
    raw({ type: "application/json", limit: "64kb" }),
  );
  app.use(json({ limit: "64kb" }));
  app.enableCors({
    origin: config.webOrigins,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "Idempotency-Key",
    ],
    exposedHeaders: ["x-request-id"],
  });
  app
    .getHttpAdapter()
    .get(
      "/api/v1/openapi.json",
      (_req: unknown, res: import("express").Response) =>
        res.json(productionOpenApi(app)),
    );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
