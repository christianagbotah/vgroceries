import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { API_CONFIG, ApiConfig, readConfig } from "./config";
import { CatalogModule } from "./catalog/catalog.controller";
import { InventoryModule } from "./inventory/inventory.controller";
import { OrdersModule } from "./orders/orders.module";
import { DeliveryConfigModule } from "./delivery-config/delivery-config.module";
import { IdentityModule } from "./identity/identity.module";
import { DatabaseModule } from "./database/database";
import { HealthModule } from "./health/health.controller";
import { foundationOpenApi } from "./http/openapi";
import { ApiExceptionFilter, ApiRequest } from "./http/errors";

export async function createApplication(config: ApiConfig = readConfig()) {
  @Global()
  @Module({
    providers: [{ provide: API_CONFIG, useValue: config }],
    exports: [API_CONFIG],
  })
  class ConfigModule {}
  @Module({
    imports: [
      ConfigModule,
      DatabaseModule,
      HealthModule,
      IdentityModule,
      CatalogModule,
      InventoryModule,
      OrdersModule,
      DeliveryConfigModule,
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
        res.json(foundationOpenApi(app)),
    );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
