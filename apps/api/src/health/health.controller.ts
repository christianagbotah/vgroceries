import { Controller, Get, Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly db: Database) {}
  @Get("live") live() {
    return { ok: true, data: { status: "ok" } };
  }
  @Get("ready") async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { ok: true, data: { status: "ok", database: "up" } };
    } catch {
      throw new ApiProblem(503, "UNAVAILABLE", "Database is unavailable.");
    }
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
