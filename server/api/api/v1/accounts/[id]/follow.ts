import { apiRoute, applyConfig } from "@api";
import { errorResponse, jsonResponse } from "@response";
import { relationshipToAPI } from "~database/entities/Relationship";
import {
    findFirstUser,
    followRequestUser,
    getRelationshipToOtherUser,
} from "~database/entities/User";

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
});

/**
 * Follow a user
 */
export default apiRoute<{
    reblogs?: boolean;
    notify?: boolean;
    languages?: string[];
}>(async (req, matchedRoute, extraData) => {
    const id = matchedRoute.params.id;

    const { user: self } = extraData.auth;

    if (!self) return errorResponse("Unauthorized", 401);

    const { languages, notify, reblogs } = extraData.parsedRequest;

    const otherUser = await findFirstUser({
        where: (user, { eq }) => eq(user.id, id),
    });

    if (!otherUser) return errorResponse("User not found", 404);

    // Check if already following
    let relationship = await getRelationshipToOtherUser(self, otherUser);

    if (!relationship.following) {
        relationship = await followRequestUser(
            self,
            otherUser,
            relationship.id,
            reblogs,
            notify,
            languages,
        );
    }

    return jsonResponse(relationshipToAPI(relationship));
});
