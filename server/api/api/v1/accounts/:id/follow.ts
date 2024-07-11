import { applyConfig, auth, handleZodError } from "@/api";
import { errorResponse, jsonResponse } from "@/response";
import type { Hono } from "@hono/hono";
import { zValidator } from "@hono/zod-validator";
import ISO6391 from "iso-639-1";
import { z } from "zod";
import { relationshipToApi } from "~/classes/functions/relationship";
import {
    followRequestUser,
    getRelationshipToOtherUser,
} from "~/classes/functions/user";
import { RolePermissions } from "~/drizzle/schema";
import { User } from "~/packages/database-interface/user";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    ratelimits: {
        max: 30,
        duration: 60,
    },
    route: "/api/v1/accounts/:id/follow",
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
    json: z
        .object({
            reblogs: z.coerce.boolean().optional(),
            notify: z.coerce.boolean().optional(),
            languages: z
                .array(z.enum(ISO6391.getAllCodes() as [string, ...string[]]))
                .optional(),
        })
        .optional()
        .default({ reblogs: true, notify: false, languages: [] }),
};

export default (app: Hono) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        zValidator("param", schemas.param, handleZodError),
        zValidator("json", schemas.json, handleZodError),
        auth(meta.auth, meta.permissions),
        async (context) => {
            const { id } = context.req.valid("param");
            const { user } = context.req.valid("header");
            const { reblogs, notify, languages } = context.req.valid("json");

            if (!user) {
                return errorResponse("Unauthorized", 401);
            }

            const otherUser = await User.fromId(id);

            if (!otherUser) {
                return errorResponse("User not found", 404);
            }

            let relationship = await getRelationshipToOtherUser(
                user,
                otherUser,
            );

            if (!relationship.following) {
                relationship = await followRequestUser(
                    user,
                    otherUser,
                    relationship.id,
                    reblogs,
                    notify,
                    languages,
                );
            }

            return jsonResponse(relationshipToApi(relationship));
        },
    );
