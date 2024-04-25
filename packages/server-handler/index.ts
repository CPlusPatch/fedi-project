import { dualLogger } from "@loggers";
import { errorResponse, jsonResponse, response } from "@response";
import type { MatchedRoute } from "bun";
import { type Config, config } from "config-manager";
import { LogLevel, type LogManager, type MultiLogManager } from "log-manager";
import { RequestParser } from "request-parser";
import type { ZodType, z } from "zod";
import { fromZodError } from "zod-validation-error";
import type { Application } from "~database/entities/Application";
import { type AuthData, getFromRequest } from "~database/entities/User";
import type { User } from "~packages/database-interface/user";

type MaybePromise<T> = T | Promise<T>;
type HttpVerb = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";

export type RouteHandler<
    RouteMeta extends APIRouteMetadata,
    ZodSchema extends ZodType,
> = (
    req: Request,
    matchedRoute: MatchedRoute,
    extraData: {
        auth: {
            // If the route doesn't require authentication, set the type to User | null
            // Otherwise set to User
            user: RouteMeta["auth"]["required"] extends true
                ? User
                : User | null;
            token: RouteMeta["auth"]["required"] extends true
                ? string
                : string | null;
            application: Application | null;
        };
        parsedRequest: z.infer<ZodSchema>;
        configManager: {
            getConfig: () => Promise<Config>;
        };
    },
) => MaybePromise<Response> | MaybePromise<object>;

export interface APIRouteMetadata {
    allowedMethods: HttpVerb[];
    ratelimits: {
        max: number;
        duration: number;
    };
    route: string;
    auth: {
        required: boolean;
        requiredOnMethods?: HttpVerb[];
        oauthPermissions?: string[];
    };
}

export interface APIRouteExports {
    meta: APIRouteMetadata;
    schema: z.AnyZodObject;
    default: RouteHandler<APIRouteMetadata, z.AnyZodObject>;
}

export const processRoute = async (
    matchedRoute: MatchedRoute,
    request: Request,
    logger: LogManager | MultiLogManager,
): Promise<Response> => {
    if (request.method === "OPTIONS") {
        return response();
    }

    const route: APIRouteExports | null = await import(
        matchedRoute.filePath
    ).catch((e) => {
        dualLogger.logError(LogLevel.ERROR, "Server.RouteImport", e as Error);
        return null;
    });

    if (!route?.meta) {
        return errorResponse("Route not found", 404);
    }

    // Check if the request method is allowed
    if (!route.meta.allowedMethods.includes(request.method as HttpVerb)) {
        return errorResponse("Method not allowed", 405);
    }

    const auth: AuthData = await getFromRequest(request);

    if (
        route.meta.auth.required ||
        route.meta.auth.requiredOnMethods?.includes(request.method as HttpVerb)
    ) {
        if (!auth.user) {
            return errorResponse(
                "Unauthorized: access to this method requires an authenticated user",
                401,
            );
        }
    }

    // Check if Content-Type header is missing if there is a body
    if (request.clone().body) {
        if (!request.headers.has("Content-Type")) {
            return errorResponse(
                `Content-Type header is missing but required on method ${request.method}`,
                400,
            );
        }
    }

    const parsedRequest = await new RequestParser(request.clone())
        .toObject()
        .catch(async (err) => {
            await logger.logError(
                LogLevel.ERROR,
                "Server.RouteRequestParser",
                err as Error,
            );
            return null;
        });

    if (!parsedRequest) {
        return errorResponse(
            "The request could not be parsed, it may be malformed",
            400,
        );
    }

    const parsingResult = route.schema?.safeParse(parsedRequest);

    if (parsingResult && !parsingResult.success) {
        // Return a 422 error with the first error message
        return errorResponse(fromZodError(parsingResult.error).toString(), 422);
    }

    try {
        const output = await route.default(request, matchedRoute, {
            auth: {
                token: auth?.token ?? null,
                user: auth?.user ?? null,
                application: auth?.application ?? null,
            },
            parsedRequest: parsingResult
                ? (parsingResult.data as z.infer<typeof route.schema>)
                : parsedRequest,
            configManager: {
                getConfig: async () => config as Config,
            },
        });

        // If the output is a normal JS object and not a Response, convert it to a jsonResponse
        if (!(output instanceof Response)) {
            return jsonResponse(output);
        }

        return output;
    } catch (err) {
        await logger.log(
            LogLevel.DEBUG,
            "Server.RouteHandler",
            (err as Error).toString(),
        );
        await logger.logError(
            LogLevel.ERROR,
            "Server.RouteHandler",
            err as Error,
        );

        return errorResponse(
            `A server error occured: ${(err as Error).message}`,
            500,
        );
    }
};
