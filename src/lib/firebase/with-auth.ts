import { NextResponse, type NextRequest } from "next/server";

import {
  AuthError,
  authenticateBearerRequest,
} from "@/lib/firebase/auth";
import { createServerErrorResponse } from "@/lib/http/errors";
import {
  RequestSecurityError,
  assertCookieMutationIsTrusted,
} from "@/lib/security/request";
import {
  type AppUserRole,
  type AuthenticatedUserContext,
} from "@/types/auth";

export type WithAuthContext<TParams = Record<string, string>> = {
  params?: TParams;
  auth: AuthenticatedUserContext;
};

type BaseRouteContext<TParams = Record<string, string>> = {
  params: Promise<TParams>;
};

export type AuthenticatedRouteHandler<TParams = Record<string, string>> = (
  request: NextRequest,
  context: WithAuthContext<TParams>,
) => Response | Promise<Response>;

type AuthenticatedRoute<TParams = Record<string, string>> = {
  (request: NextRequest): Promise<Response>;
  (
    request: NextRequest,
    context: BaseRouteContext<TParams>,
  ): Promise<Response>;
};

export function withAuth<TParams = Record<string, string>>(
  handler: AuthenticatedRouteHandler<TParams>,
  allowedRoles: AppUserRole[],
): AuthenticatedRoute<TParams> {
  const authenticatedRoute = async (
    request: NextRequest,
    context?: BaseRouteContext<TParams>,
  ): Promise<Response> => {
    try {
      const auth = await authenticateBearerRequest(request, allowedRoles);

      if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
        assertCookieMutationIsTrusted(request);
      }

      const params = await context?.params;

      return handler(request, {
        params,
        auth,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json(
          {
            error: error.message,
          },
          { status: error.status },
        );
      }

      if (error instanceof RequestSecurityError) {
        return NextResponse.json(
          {
            error: error.message,
          },
          { status: error.status },
        );
      }

      return createServerErrorResponse({
        error,
        message: "Authentication middleware failure.",
        route: request.nextUrl.pathname,
        method: request.method,
      });
    }
  };

  return authenticatedRoute as AuthenticatedRoute<TParams>;
}
