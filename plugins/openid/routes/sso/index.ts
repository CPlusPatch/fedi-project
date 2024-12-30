import { auth } from "@/api";
import { Application, db } from "@versia/kit/db";
import { OpenIdLoginFlows, RolePermissions } from "@versia/kit/tables";
import {
    calculatePKCECodeChallenge,
    generateRandomCodeVerifier,
} from "oauth4webapi";
import { z } from "zod";
import { ApiError } from "~/classes/errors/api-error.ts";
import { ErrorSchema } from "~/types/api";
import type { PluginType } from "../../index.ts";
import { oauthDiscoveryRequest, oauthRedirectUri } from "../../utils.ts";

export default (plugin: PluginType): void => {
    plugin.registerRoute("/api/v1/sso", (app) => {
        app.openapi(
            {
                method: "get",
                path: "/api/v1/sso",
                summary: "Get linked accounts",
                middleware: [
                    auth(
                        {
                            required: true,
                        },
                        {
                            required: [RolePermissions.OAuth],
                        },
                    ),
                    plugin.middleware,
                ],
                responses: {
                    200: {
                        description: "Linked accounts",
                        content: {
                            "application/json": {
                                schema: z.array(
                                    z.object({
                                        id: z.string(),
                                        name: z.string(),
                                        icon: z.string().optional(),
                                    }),
                                ),
                            },
                        },
                    },
                    401: {
                        description: "Unauthorized",
                        content: {
                            "application/json": {
                                schema: ErrorSchema,
                            },
                        },
                    },
                },
            },
            async (context) => {
                const { user } = context.get("auth");

                if (!user) {
                    throw new ApiError(401, "Unauthorized");
                }

                const linkedAccounts = await user.getLinkedOidcAccounts(
                    context.get("pluginConfig").providers,
                );

                return context.json(
                    linkedAccounts.map((account) => ({
                        id: account.id,
                        name: account.name,
                        icon: account.icon,
                    })),
                    200,
                );
            },
        );

        app.openapi(
            {
                method: "post",
                path: "/api/v1/sso",
                summary: "Link account",
                middleware: [
                    auth(
                        {
                            required: true,
                        },
                        {
                            required: [RolePermissions.OAuth],
                        },
                    ),
                    plugin.middleware,
                ],
                request: {
                    body: {
                        content: {
                            "application/json": {
                                schema: z.object({
                                    issuer: z.string(),
                                }),
                            },
                        },
                    },
                },
                responses: {
                    302: {
                        description: "Redirect to OpenID provider",
                    },
                    401: {
                        description: "Unauthorized",
                        content: {
                            "application/json": {
                                schema: ErrorSchema,
                            },
                        },
                    },
                    404: {
                        description: "Issuer not found",
                        content: {
                            "application/json": {
                                schema: ErrorSchema,
                            },
                        },
                    },
                },
            },
            async (context) => {
                const { user } = context.get("auth");

                if (!user) {
                    throw new ApiError(401, "Unauthorized");
                }

                const { issuer: issuerId } = context.req.valid("json");

                const issuer = context
                    .get("pluginConfig")
                    .providers.find((provider) => provider.id === issuerId);

                if (!issuer) {
                    return context.json(
                        {
                            error: `Issuer with ID ${issuerId} not found in instance's OpenID configuration`,
                        },
                        404,
                    );
                }

                const authServer = await oauthDiscoveryRequest(issuer.url);

                const codeVerifier = generateRandomCodeVerifier();

                const redirectUri = oauthRedirectUri(
                    context.get("config").http.base_url,
                    issuerId,
                );

                const application = await Application.insert({
                    clientId:
                        user.id +
                        Buffer.from(
                            crypto.getRandomValues(new Uint8Array(32)),
                        ).toString("base64"),
                    name: "Versia",
                    redirectUri,
                    scopes: "openid profile email",
                    secret: "",
                });

                // Store into database
                const newFlow = (
                    await db
                        .insert(OpenIdLoginFlows)
                        .values({
                            codeVerifier,
                            issuerId,
                            applicationId: application.id,
                        })
                        .returning()
                )[0];

                const codeChallenge =
                    await calculatePKCECodeChallenge(codeVerifier);

                return context.redirect(
                    `${authServer.authorization_endpoint}?${new URLSearchParams(
                        {
                            client_id: issuer.client_id,
                            redirect_uri: `${redirectUri}?${new URLSearchParams(
                                {
                                    flow: newFlow.id,
                                    link: "true",
                                    user_id: user.id,
                                },
                            )}`,
                            response_type: "code",
                            scope: "openid profile email",
                            // PKCE
                            code_challenge_method: "S256",
                            code_challenge: codeChallenge,
                        },
                    ).toString()}`,
                );
            },
        );
    });
};
