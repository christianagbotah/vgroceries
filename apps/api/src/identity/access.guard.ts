import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiProblem } from "../http/errors";
import { AuthRequest, IdentityService } from "./identity.service";
import { hasPermission, type PermissionName } from "./permissions";

export const Permission = (permission: PermissionName) =>
  SetMetadata("permission", permission);
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly identity: IdentityService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    Object.assign(req, await this.identity.authenticate(req));
    const permission = this.reflector.getAllAndOverride<PermissionName>("permission", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission && !hasPermission(req.actor.role, permission))
      throw new ApiProblem(403, "FORBIDDEN", "Permission denied.");
    return true;
  }
}
