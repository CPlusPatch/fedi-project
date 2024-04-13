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
    route: "/api/v1/accounts/:id/note",
    auth: {
        required: true,
        oauthPermissions: ["write:accounts"],
    },
});

/**
 * Sets a user note
 */
export default apiRoute<{
    comment: string;
}>(async (req, matchedRoute, extraData) => {
    const id = matchedRoute.params.id;

    const { user: self } = extraData.auth;

    if (!self) return errorResponse("Unauthorized", 401);

    const { comment } = extraData.parsedRequest;

    const otherUser = await findFirstUser({
        where: (user, { eq }) => eq(user.id, id),
    });

    if (!otherUser) return errorResponse("User not found", 404);

    // Check if already following
    const foundRelationship = await getRelationshipToOtherUser(self, otherUser);

    foundRelationship.note = comment ?? "";

    await db
        .update(relationship)
        .set({
            note: foundRelationship.note,
        })
        .where(eq(relationship.id, foundRelationship.id));

    return jsonResponse(relationshipToAPI(foundRelationship));
});
