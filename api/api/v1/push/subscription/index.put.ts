import { apiRoute, auth, jsonOrForm } from "@/api";
import { createRoute } from "@hono/zod-openapi";
import { PushSubscription } from "@versia/kit/db";
import { ApiError } from "~/classes/errors/api-error";
import { WebPushSubscriptionInput } from "~/classes/schemas/pushsubscription";
import { RolePermissions } from "~/drizzle/schema";

export default apiRoute((app) =>
    app.openapi(
        createRoute({
            method: "put",
            path: "/api/v1/push/subscription",
            summary: "Change types of notifications",
            description:
                "Updates the current push subscription. Only the data part can be updated. To change fundamentals, a new subscription must be created instead.",
            externalDocs: {
                url: "https://docs.joinmastodon.org/methods/push/#update",
            },
            middleware: [
                auth({
                    auth: true,
                    permissions: [RolePermissions.UsePushNotifications],
                    scopes: ["push"],
                }),
                jsonOrForm(),
            ] as const,
            request: {
                body: {
                    content: {
                        "application/json": {
                            schema: WebPushSubscriptionInput.shape.data,
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "The WebPushSubscription has been updated.",
                    content: {
                        "application/json": {
                            schema: PushSubscription.schema,
                        },
                    },
                },
            },
        }),
        async (context) => {
            const { user, token } = context.get("auth");
            const { alerts, policy } = context.req.valid("json");

            const ps = await PushSubscription.fromToken(token);

            if (!ps) {
                throw new ApiError(
                    404,
                    "No push subscription associated with this access token",
                );
            }

            if (
                alerts["admin.report"] &&
                !user.hasPermission(RolePermissions.ManageReports)
            ) {
                throw new ApiError(
                    403,
                    `You do not have the '${RolePermissions.ManageReports}' permission to receive report alerts`,
                );
            }

            if (
                alerts["admin.sign_up"] &&
                !user.hasPermission(RolePermissions.ManageAccounts)
            ) {
                throw new ApiError(
                    403,
                    `You do not have the '${RolePermissions.ManageAccounts}' permission to receive sign-up alerts`,
                );
            }

            await ps.update({
                policy,
                alerts: {
                    ...ps.data.alerts,
                    ...alerts,
                },
            });

            return context.json(ps.toApi(), 200);
        },
    ),
);
