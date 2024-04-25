import { apiRoute, applyConfig, idValidator } from "@api";
import { errorResponse, jsonResponse } from "@response";
import { eq } from "drizzle-orm";
import { lookup } from "mime-types";
import { z } from "zod";
import { Users } from "~drizzle/schema";
import { User } from "~packages/database-interface/user";

export const meta = applyConfig({
    allowedMethods: ["GET"],
    auth: {
        required: false,
    },
    ratelimits: {
        duration: 60,
        max: 60,
    },
    route: "/.well-known/webfinger",
});

export const schema = z.object({
    resource: z.string().min(1).max(512),
});

export default apiRoute<typeof meta, typeof schema>(
    async (req, matchedRoute, extraData) => {
        const { resource } = extraData.parsedRequest;

        // Check if resource is in the correct format (acct:uuid/username@domain)
        if (!resource.match(/^acct:[a-zA-Z0-9-]+@[a-zA-Z0-9.-:]+$/)) {
            return errorResponse(
                "Invalid resource (should be acct:(id or username)@domain)",
                400,
            );
        }

        const requestedUser = resource.split("acct:")[1];

        const config = await extraData.configManager.getConfig();
        const host = new URL(config.http.base_url).host;

        // Check if user is a local user
        if (requestedUser.split("@")[1] !== host) {
            return errorResponse("User is a remote user", 404);
        }

        const isUuid = requestedUser.split("@")[0].match(idValidator);

        const user = await User.fromSql(
            eq(isUuid ? Users.id : Users.username, requestedUser.split("@")[0]),
        );

        if (!user) {
            return errorResponse("User not found", 404);
        }

        return jsonResponse({
            subject: `acct:${
                isUuid ? user.id : user.getUser().username
            }@${host}`,

            links: [
                {
                    rel: "self",
                    type: "application/json",
                    href: new URL(
                        `/users/${user.id}`,
                        config.http.base_url,
                    ).toString(),
                },
                {
                    rel: "avatar",
                    type: lookup(user.getAvatarUrl(config)),
                    href: user.getAvatarUrl(config),
                },
            ],
        });
    },
);
