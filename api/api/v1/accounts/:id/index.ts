import { apiRoute, applyConfig, auth, handleZodError } from "@/api";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { RolePermissions } from "~/drizzle/schema";
import { User } from "~/packages/database-interface/user";

export const meta = applyConfig({
    allowedMethods: ["GET"],
    ratelimits: {
        max: 30,
        duration: 60,
    },
    route: "/api/v1/accounts/:id",
    auth: {
        required: false,
        oauthPermissions: [],
    },
    permissions: {
        required: [RolePermissions.ViewAccounts],
    },
});

export const schemas = {
    param: z.object({
        id: z.string().uuid(),
    }),
};

export default apiRoute((app) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        zValidator("param", schemas.param, handleZodError),
        auth(meta.auth, meta.permissions),
        async (context) => {
            const { id } = context.req.valid("param");
            const { user } = context.get("auth");

            const foundUser = await User.fromId(id);

            if (!foundUser) {
                return context.json({ error: "User not found" }, 404);
            }

            return context.json(foundUser.toApi(user?.id === foundUser.id));
        },
    ),
);
