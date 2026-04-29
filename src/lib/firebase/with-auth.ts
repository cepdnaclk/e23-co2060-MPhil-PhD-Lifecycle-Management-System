import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authenticateBearerRequest } from "@/lib/firebase/auth";
import {
  type AppUserRole,
  type AuthenticatedUserContext,
} from "@/types/auth";

export type WithAuthContext<TParams = Record<string, string | string[]>> = {
  params?: TParams;
  auth: AuthenticatedUserContext;
};

type BaseRouteContext<TParams = Record<string, string | string[]>> = {
  params?: TParams;
};

export type AuthenticatedRouteHandler<TParams = Record<string, string | string[]>> = (
  request: NextRequest,
  context: WithAuthContext<TParams>,
) => Response | Promise<Response>;

export function withAuth<TParams = Record<string, string | string[]>>(
  handler: AuthenticatedRouteHandler<TParams>,
  allowedRoles: AppUserRole[],
) {
  return async (
    request: NextRequest,
    context: BaseRouteContext<TParams> = {},
  ): Promise<Response> => {
    try {
      const auth = await authenticateBearerRequest(request, allowedRoles);

      return handler(request, {
        ...context,
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

      return NextResponse.json(
        {
          error: "Authentication middleware failure.",
        },
        { status: 500 },
      );
    }
  };
}
