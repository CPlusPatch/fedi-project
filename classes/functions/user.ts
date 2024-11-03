import type {
    Follow,
    FollowAccept,
    FollowReject,
} from "@versia/federation/types";
import { type Application, type Token, type User, db } from "@versia/kit/db";
import type { Instances, Roles, Users } from "@versia/kit/tables";
import { type InferSelectModel, type SQL, sql } from "drizzle-orm";
import type { EmojiWithInstance } from "~/classes/database/emoji.ts";

export type UserType = InferSelectModel<typeof Users>;

export type UserWithInstance = UserType & {
    instance: InferSelectModel<typeof Instances> | null;
};

export type UserWithRelations = UserType & {
    instance: InferSelectModel<typeof Instances> | null;
    emojis: EmojiWithInstance[];
    followerCount: number;
    followingCount: number;
    statusCount: number;
    roles: InferSelectModel<typeof Roles>[];
};

export const userRelations = {
    instance: true,
    emojis: {
        with: {
            emoji: {
                with: {
                    instance: true,
                },
            },
        },
    },
    roles: {
        with: {
            role: true,
        },
    },
} as const;

export const userExtras = {
    followerCount:
        sql`(SELECT COUNT(*) FROM "Relationships" "relationships" WHERE ("relationships"."ownerId" = "Users".id AND "relationships"."following" = true))`.as(
            "follower_count",
        ),
    followingCount:
        sql`(SELECT COUNT(*) FROM "Relationships" "relationshipSubjects" WHERE ("relationshipSubjects"."subjectId" = "Users".id AND "relationshipSubjects"."following" = true))`.as(
            "following_count",
        ),
    statusCount:
        sql`(SELECT COUNT(*) FROM "Notes" WHERE "Notes"."authorId" = "Users".id)`.as(
            "status_count",
        ),
};

export const userExtrasTemplate = (
    name: string,
): {
    followerCount: SQL.Aliased<unknown>;
    followingCount: SQL.Aliased<unknown>;
    statusCount: SQL.Aliased<unknown>;
} => ({
    // @ts-expect-error sql is a template tag, so it gets confused when we use it as a function
    followerCount: sql([
        `(SELECT COUNT(*) FROM "Relationships" "relationships" WHERE ("relationships"."ownerId" = "${name}".id AND "relationships"."following" = true))`,
    ]).as("follower_count"),
    // @ts-expect-error sql is a template tag, so it gets confused when we use it as a function
    followingCount: sql([
        `(SELECT COUNT(*) FROM "Relationships" "relationshipSubjects" WHERE ("relationshipSubjects"."subjectId" = "${name}".id AND "relationshipSubjects"."following" = true))`,
    ]).as("following_count"),
    // @ts-expect-error sql is a template tag, so it gets confused when we use it as a function
    statusCount: sql([
        `(SELECT COUNT(*) FROM "Notes" WHERE "Notes"."authorId" = "${name}".id)`,
    ]).as("status_count"),
});

export interface AuthData {
    user: User | null;
    token: Token | null;
    application: Application | null;
}

export const transformOutputToUserWithRelations = (
    user: Omit<UserType, "endpoints"> & {
        followerCount: unknown;
        followingCount: unknown;
        statusCount: unknown;
        emojis: {
            userId: string;
            emojiId: string;
            emoji?: EmojiWithInstance;
        }[];
        instance: InferSelectModel<typeof Instances> | null;
        roles: {
            userId: string;
            roleId: string;
            role?: InferSelectModel<typeof Roles>;
        }[];
        endpoints: unknown;
    },
): UserWithRelations => {
    return {
        ...user,
        followerCount: Number(user.followerCount),
        followingCount: Number(user.followingCount),
        statusCount: Number(user.statusCount),
        endpoints:
            user.endpoints ??
            ({} as Partial<{
                dislikes: string;
                featured: string;
                likes: string;
                followers: string;
                following: string;
                inbox: string;
                outbox: string;
            }>),
        emojis: user.emojis.map(
            (emoji) =>
                (emoji as unknown as Record<string, object>)
                    .emoji as EmojiWithInstance,
        ),
        roles: user.roles
            .map((role) => role.role)
            .filter(Boolean) as InferSelectModel<typeof Roles>[],
    };
};

export const findManyUsers = async (
    query: Parameters<typeof db.query.Users.findMany>[0],
): Promise<UserWithRelations[]> => {
    const output = await db.query.Users.findMany({
        ...query,
        with: {
            ...userRelations,
            ...query?.with,
        },
        extras: {
            ...userExtras,
            ...query?.extras,
        },
    });

    return output.map((user) => transformOutputToUserWithRelations(user));
};

export const followRequestToVersia = (
    follower: User,
    followee: User,
): Follow => {
    if (follower.isRemote()) {
        throw new Error("Follower must be a local user");
    }

    if (!followee.isRemote()) {
        throw new Error("Followee must be a remote user");
    }

    if (!followee.data.uri) {
        throw new Error("Followee must have a URI in database");
    }

    const id = crypto.randomUUID();

    return {
        type: "Follow",
        id,
        author: follower.getUri(),
        followee: followee.getUri(),
        created_at: new Date().toISOString(),
    };
};

export const followAcceptToVersia = (
    follower: User,
    followee: User,
): FollowAccept => {
    if (!follower.isRemote()) {
        throw new Error("Follower must be a remote user");
    }

    if (followee.isRemote()) {
        throw new Error("Followee must be a local user");
    }

    if (!follower.data.uri) {
        throw new Error("Follower must have a URI in database");
    }

    const id = crypto.randomUUID();

    return {
        type: "FollowAccept",
        id,
        author: followee.getUri(),
        created_at: new Date().toISOString(),
        follower: follower.getUri(),
    };
};

export const followRejectToVersia = (
    follower: User,
    followee: User,
): FollowReject => {
    return {
        ...followAcceptToVersia(follower, followee),
        type: "FollowReject",
    };
};
