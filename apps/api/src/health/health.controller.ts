import { Controller, Get, Inject, Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { API_CONFIG, ApiConfig } from "../config";
import { PaymentsModule } from "../payments/payments.module";
import { PaymentProviderRegistry } from "../payments/payment-provider.registry";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly paymentProviders: PaymentProviderRegistry,
  ) {}
  @Get("live") live() {
    return { ok: true, data: { status: "ok" } };
  }
  @Get("ready") async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      const commerce = this.config.commerce;
      if (!commerce)
        throw new ApiProblem(503, "UNAVAILABLE", "Commerce is not configured.");
      const location = await this.db.location.findUnique({ where: { id: commerce.locationId } });
      if (!location?.active)
        throw new ApiProblem(503, "UNAVAILABLE", "Commerce stock location is unavailable.");
      this.paymentProviders.assertReadyIfConfigured();
      return { ok: true, data: { status: "ok", database: "up" } };
    } catch (error) {
      if (error instanceof ApiProblem) throw error;
      throw new ApiProblem(503, "UNAVAILABLE", "Database is unavailable.");
    }
  }
}
@Module({ imports: [PaymentsModule], controllers: [HealthController] })
export class HealthModule {}
