import { applyConfig, auth, handleZodError } from "@api";
import { zValidator } from "@hono/zod-validator";
import { errorResponse, jsonResponse } from "@response";
import type { Hono } from "hono";
import { z } from "zod";
import { deleteLike } from "~database/entities/Like";
import { Note } from "~packages/database-interface/note";
import type { Status as APIStatus } from "~types/mastodon/status";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    ratelimits: {
        max: 100,
        duration: 60,
    },
    route: "/api/v1/statuses/:id/unfavourite",
    auth: {
        required: true,
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
        auth(meta.auth),
        async (context) => {
            const { id } = context.req.valid("param");
            const { user } = context.req.valid("header");

            if (!user) return errorResponse("Unauthorized", 401);

            const note = await Note.fromId(id);

            if (!note?.isViewableByUser(user))
                return errorResponse("Record not found", 404);

            await deleteLike(user, note);

            return jsonResponse({
                ...(await note.toAPI(user)),
                favourited: false,
                favourites_count: note.getStatus().likeCount - 1,
            } as APIStatus);
        },
    );