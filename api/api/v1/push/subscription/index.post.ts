import { apiRoute } from "@/api";
import { auth, jsonOrForm } from "@/api";
import { createRoute } from "@hono/zod-openapi";
import { PushSubscription } from "@versia/kit/db";
import { ApiError } from "~/classes/errors/api-error";
import { WebPushSubscriptionInput } from "~/classes/schemas/pushsubscription";
import { RolePermissions } from "~/drizzle/schema";

export default apiRoute((app) =>
    app.openapi(
        createRoute({
            method: "post",
            path: "/api/v1/push/subscription",
            summary: "Subscribe to push notifications",
            description:
                "Add a Web Push API subscription to receive notifications. Each access token can have one push subscription. If you create a new subscription, the old subscription is deleted.",
            externalDocs: {
                url: "https://docs.joinmastodon.org/methods/push/#create",
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
                            schema: WebPushSubscriptionInput,
                        },
                    },
                },
            },
            responses: {
                200: {
                    description:
                        "A new PushSubscription has been generated, which will send the requested alerts to your endpoint.",
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
            const { subscription, data } = context.req.valid("json");

            if (
                data.alerts["admin.report"] &&
                !user.hasPermission(RolePermissions.ManageReports)
            ) {
                throw new ApiError(
                    403,
                    `You do not have the '${RolePermissions.ManageReports}' permission to receive report alerts`,
                );
            }

            if (
                data.alerts["admin.sign_up"] &&
                !user.hasPermission(RolePermissions.ManageAccounts)
            ) {
                throw new ApiError(
                    403,
                    `You do not have the '${RolePermissions.ManageAccounts}' permission to receive sign-up alerts`,
                );
            }

            await PushSubscription.clearAllOfToken(token);

            const ps = await PushSubscription.insert({
                alerts: data.alerts,
                policy: data.policy,
                endpoint: subscription.endpoint,
                publicKey: subscription.keys.p256dh,
                authSecret: subscription.keys.auth,
                tokenId: token.id,
            });

            return context.json(ps.toApi(), 200);
        },
    ),
);
