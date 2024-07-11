import { applyConfig, auth, handleZodError } from "@/api";
import { errorResponse, jsonResponse } from "@/response";
import type { Hono } from "@hono/hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/drizzle/db";
import { Notifications, RolePermissions } from "~/drizzle/schema";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    route: "/api/v1/notifications/:id/dismiss",
    ratelimits: {
        max: 100,
        duration: 60,
    },
    auth: {
        required: true,
        oauthPermissions: ["write:notifications"],
    },
    permissions: {
        required: [RolePermissions.ManageOwnNotifications],
    },
});

export const schemas = {
    param: z.object({
        id: z.string().uuid(),
    }),
};

export default (app: Hono) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        zValidator("param", schemas.param, handleZodError),
        auth(meta.auth, meta.permissions),
        async (context) => {
            const { id } = context.req.valid("param");

            const { user } = context.req.valid("header");
            if (!user) {
                return errorResponse("Unauthorized", 401);
            }

            await db
                .update(Notifications)
                .set({
                    dismissed: true,
                })
                .where(eq(Notifications.id, id));

            return jsonResponse({});
        },
    );
