import {
  Global,
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { API_CONFIG, ApiConfig } from "../config";

@Injectable()
export class Database
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        // All POS hold expiry and ledger timestamps must be evaluated in UTC.
        // Some VPS PostgreSQL clusters default to a local timezone, which can
        // shift driver timestamps and cause valid five-minute holds to fail.
        options: "-c TimeZone=UTC",
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
      }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
