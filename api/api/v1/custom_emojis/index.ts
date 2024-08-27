import { apiRoute, applyConfig, auth } from "@/api";
import { and, eq, isNull, or } from "drizzle-orm";
import { Emojis, RolePermissions } from "~/drizzle/schema";
import { Emoji } from "~/packages/database-interface/emoji";

export const meta = applyConfig({
    allowedMethods: ["GET"],
    route: "/api/v1/custom_emojis",
    ratelimits: {
        max: 100,
        duration: 60,
    },
    auth: {
        required: false,
    },
    permissions: {
        required: [RolePermissions.ViewEmojis],
    },
});

export default apiRoute((app) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        auth(meta.auth, meta.permissions),
        async (context) => {
            const { user } = context.get("auth");

            const emojis = await Emoji.manyFromSql(
                and(
                    isNull(Emojis.instanceId),
                    or(
                        isNull(Emojis.ownerId),
                        user ? eq(Emojis.ownerId, user.id) : undefined,
                    ),
                ),
            );

            return context.json(emojis.map((emoji) => emoji.toApi()));
        },
    ),
);
