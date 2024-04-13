import { apiRoute, applyConfig } from "@api";
import { errorResponse, jsonResponse } from "@response";
import { eq } from "drizzle-orm";
import { relationshipToAPI } from "~database/entities/Relationship";
import {
    findFirstUser,
    getRelationshipToOtherUser,
} from "~database/entities/User";
import { db } from "~drizzle/db";
import { relationship } from "~drizzle/schema";

export const meta = applyConfig({
    allowedMethods: ["POST"],
    ratelimits: {
        max: 30,
        duration: 60,
    },
    route: "/api/v1/accounts/:id/unmute",
    auth: {
        required: true,
        oauthPermissions: ["write:mutes"],
    },
});

/**
 * Unmute a user
 */
export default apiRoute(async (req, matchedRoute, extraData) => {
    const id = matchedRoute.params.id;

    const { user: self } = extraData.auth;

    if (!self) return errorResponse("Unauthorized", 401);

    const user = await findFirstUser({
        where: (user, { eq }) => eq(user.id, id),
    });

    if (!user) return errorResponse("User not found", 404);

    // Check if already following
    const foundRelationship = await getRelationshipToOtherUser(self, user);

    if (foundRelationship.muting) {
        foundRelationship.muting = false;
        foundRelationship.mutingNotifications = false;

        await db
            .update(relationship)
            .set({
                muting: false,
                mutingNotifications: false,
            })
            .where(eq(relationship.id, foundRelationship.id));
    }

    return jsonResponse(relationshipToAPI(foundRelationship));
});
