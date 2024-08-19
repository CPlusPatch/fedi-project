import { apiRoute, applyConfig, auth, handleZodError } from "@/api";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { RolePermissions } from "~/drizzle/schema";
import { Relationship } from "~/packages/database-interface/relationship";
import { User } from "~/packages/database-interface/user";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    ratelimits: {
        max: 30,
        duration: 60,
    },
    route: "/api/v1/accounts/:id/remove_from_followers",
    auth: {
        required: true,
        oauthPermissions: ["write:follows"],
    },
    permissions: {
        required: [
            RolePermissions.ManageOwnFollows,
            RolePermissions.ViewAccounts,
        ],
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
            const { user: self } = context.req.valid("header");

            if (!self) {
                return context.json({ error: "Unauthorized" }, 401);
            }

            const otherUser = await User.fromId(id);

            if (!otherUser) {
                return context.json({ error: "User not found" }, 404);
            }

            const oppositeRelationship = await Relationship.fromOwnerAndSubject(
                otherUser,
                self,
            );

            if (oppositeRelationship.data.following) {
                await oppositeRelationship.update({
                    following: false,
                });
            }

            const foundRelationship = await Relationship.fromOwnerAndSubject(
                self,
                otherUser,
            );

            return context.json(foundRelationship.toApi());
        },
    ),
);
