import {
    apiRoute,
    applyConfig,
    auth,
    handleZodError,
    idValidator,
} from "@/api";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "~/drizzle/db";
import { RolePermissions } from "~/drizzle/schema";
import { Note } from "~/packages/database-interface/note";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    ratelimits: {
        max: 100,
        duration: 60,
    },
    route: "/api/v1/statuses/:id/pin",
    auth: {
        required: true,
    },
    permissions: {
        required: [RolePermissions.ManageOwnNotes, RolePermissions.ViewNotes],
    },
});

export const schemas = {
    param: z.object({
        id: z.string().regex(idValidator),
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

            if (!user) {
                return context.json({ error: "Unauthorized" }, 401);
            }

            const foundStatus = await Note.fromId(id, user?.id);

            if (!foundStatus) {
                return context.json({ error: "Record not found" }, 404);
            }

            if (foundStatus.author.id !== user.id) {
                return context.json({ error: "Unauthorized" }, 401);
            }

            if (
                await db.query.UserToPinnedNotes.findFirst({
                    where: (userPinnedNote, { and, eq }) =>
                        and(
                            eq(userPinnedNote.noteId, foundStatus.data.id),
                            eq(userPinnedNote.userId, user.id),
                        ),
                })
            ) {
                return context.json({ error: "Already pinned" }, 422);
            }

            await user.pin(foundStatus);

            return context.json(await foundStatus.toApi(user));
        },
    ),
);
