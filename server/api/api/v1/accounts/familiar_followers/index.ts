import { apiRoute, applyConfig, idValidator } from "@api";
import { errorResponse, jsonResponse } from "@response";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~drizzle/db";
import { Users } from "~drizzle/schema";
import { User } from "~packages/database-interface/user";

export const meta = applyConfig({
    allowedMethods: ["GET"],
    route: "/api/v1/accounts/familiar_followers",
    ratelimits: {
        max: 5,
        duration: 60,
    },
    auth: {
        required: true,
        oauthPermissions: ["read:follows"],
    },
});

export const schema = z.object({
    id: z.array(z.string().regex(idValidator)).min(1).max(10),
});

/**
 * Find familiar followers (followers of a user that you also follow)
 */
export default apiRoute<typeof meta, typeof schema>(
    async (req, matchedRoute, extraData) => {
        const { user: self } = extraData.auth;

        if (!self) return errorResponse("Unauthorized", 401);

        const { id: ids } = extraData.parsedRequest;

        const idFollowerRelationships = await db.query.Relationships.findMany({
            columns: {
                ownerId: true,
            },
            where: (relationship, { inArray, and, eq }) =>
                and(
                    inArray(relationship.subjectId, ids),
                    eq(relationship.following, true),
                ),
        });

        if (idFollowerRelationships.length === 0) {
            return jsonResponse([]);
        }

        // Find users that you follow in idFollowerRelationships
        const relevantRelationships = await db.query.Relationships.findMany({
            columns: {
                subjectId: true,
            },
            where: (relationship, { inArray, and, eq }) =>
                and(
                    eq(relationship.ownerId, self.id),
                    inArray(
                        relationship.subjectId,
                        idFollowerRelationships.map((f) => f.ownerId),
                    ),
                    eq(relationship.following, true),
                ),
        });

        if (relevantRelationships.length === 0) {
            return jsonResponse([]);
        }

        const finalUsers = await User.manyFromSql(
            inArray(
                Users.id,
                relevantRelationships.map((r) => r.subjectId),
            ),
        );

        return jsonResponse(finalUsers.map((o) => o.toAPI()));
    },
);
