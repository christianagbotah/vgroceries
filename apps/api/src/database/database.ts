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
        // SECURITY: PrismaPg's DateTime -> timestamptz bindings can shift
        // expiration deadlines by the PostgreSQL session's timezone offset.
        // Pin every pooled connection to UTC irrespective of DB host defaults.
        // Verified under both UTC and America/Toronto Node runtimes:
        // an expiry 60s in the past remains 60s in the past in SQL.
        options: "-c timezone=UTC",
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
