import { apiRoute, applyConfig } from "@api";
import { errorResponse, jsonResponse } from "@response";
import { and, eq } from "drizzle-orm";
import { findFirstStatuses, statusToAPI } from "~database/entities/Status";
import { db } from "~drizzle/db";
import { statusToUser } from "~drizzle/schema";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    ratelimits: {
        max: 100,
        duration: 60,
    },
    route: "/api/v1/statuses/:id/unpin",
    auth: {
        required: true,
    },
});

/**
 * Unpins a post
 */
export default apiRoute(async (req, matchedRoute, extraData) => {
    const id = matchedRoute.params.id;

    const { user } = extraData.auth;

    if (!user) return errorResponse("Unauthorized", 401);

    const status = await findFirstStatuses({
        where: (status, { eq }) => eq(status.id, id),
    });

    // Check if status exists
    if (!status) return errorResponse("Record not found", 404);

    // Check if status is user's
    if (status.authorId !== user.id) return errorResponse("Unauthorized", 401);

    await db
        .delete(statusToUser)
        .where(and(eq(statusToUser.a, status.id), eq(statusToUser.b, user.id)));

    if (!status) return errorResponse("Record not found", 404);

    return jsonResponse(statusToAPI(status, user));
});
