import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";

export class ApiProblem extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ code, message }, status);
  }
}
export type ApiRequest = Request & { requestId: string };
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<ApiRequest>();
    const raw = exception as { status?: number; type?: string };
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : raw?.type === "entity.too.large"
          ? 413
          : raw?.type === "entity.parse.failed"
            ? 400
            : 500;
    const supplied =
      exception instanceof ApiProblem
        ? (exception.getResponse() as { code: string; message: string })
        : null;
    const defaults: Record<number, [string, string]> = {
      400: ["VALIDATION_FAILED", "Invalid request."],
      401: ["UNAUTHENTICATED", "Authentication required."],
      403: ["FORBIDDEN", "Permission denied."],
      404: ["NOT_FOUND", "Resource not found."],
      413: ["VALIDATION_FAILED", "Request body is too large."],
      429: ["RATE_LIMITED", "Too many attempts. Try again later."],
      503: ["UNAVAILABLE", "Service temporarily unavailable."],
    };
    const [code, message] = defaults[status] ?? [
      "INTERNAL",
      "An unexpected server error occurred.",
    ];
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: "http.error",
          requestId: req.requestId,
          status,
          errorType: exception instanceof Error ? exception.name : "unknown",
        }),
      );
    res.status(status).json({
      ok: false,
      error: supplied ?? { code, message },
      requestId: req.requestId,
    });
  }
}
