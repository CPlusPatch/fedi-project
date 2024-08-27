import { apiRoute, applyConfig, auth, handleZodError, jsonOrForm } from "@/api";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "~/drizzle/db";
import { FilterKeywords, Filters, RolePermissions } from "~/drizzle/schema";
export const meta = applyConfig({
    allowedMethods: ["GET", "POST"],
    route: "/api/v2/filters",
    ratelimits: {
        max: 60,
        duration: 60,
    },
    auth: {
        required: true,
    },
    permissions: {
        required: [RolePermissions.ManageOwnFilters],
    },
});

export const schemas = {
    json: z
        .object({
            title: z.string().trim().min(1).max(100).optional(),
            context: z
                .array(
                    z.enum([
                        "home",
                        "notifications",
                        "public",
                        "thread",
                        "account",
                    ]),
                )
                .optional(),
            filter_action: z.enum(["warn", "hide"]).optional().default("warn"),
            expires_in: z.coerce
                .number()
                .int()
                .min(60)
                .max(60 * 60 * 24 * 365 * 5)
                .optional(),
            keywords_attributes: z
                .array(
                    z.object({
                        keyword: z.string().trim().min(1).max(100),
                        whole_word: z
                            .string()
                            .transform((v) =>
                                ["true", "1", "on"].includes(v.toLowerCase()),
                            )
                            .optional(),
                    }),
                )
                .optional(),
        })
        .optional(),
};

export default apiRoute((app) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        jsonOrForm(),
        zValidator("json", schemas.json, handleZodError),
        auth(meta.auth, meta.permissions),
        async (context) => {
            const { user } = context.get("auth");

            if (!user) {
                return context.json({ error: "Unauthorized" }, 401);
            }
            switch (context.req.method) {
                case "GET": {
                    const userFilters = await db.query.Filters.findMany({
                        where: (filter, { eq }) => eq(filter.userId, user.id),
                        with: {
                            keywords: true,
                        },
                    });

                    return context.json(
                        userFilters.map((filter) => ({
                            id: filter.id,
                            title: filter.title,
                            context: filter.context,
                            expires_at: filter.expireAt
                                ? new Date(
                                      Date.now() + filter.expireAt,
                                  ).toISOString()
                                : null,
                            filter_action: filter.filterAction,
                            keywords: filter.keywords.map((keyword) => ({
                                id: keyword.id,
                                keyword: keyword.keyword,
                                whole_word: keyword.wholeWord,
                            })),
                            statuses: [],
                        })),
                    );
                }
                case "POST": {
                    const form = context.req.valid("json");
                    if (!form) {
                        return context.json(
                            { error: "Missing required fields" },
                            422,
                        );
                    }

                    const {
                        title,
                        context: ctx,
                        filter_action,
                        expires_in,
                        keywords_attributes,
                    } = form;

                    if (!title || ctx?.length === 0) {
                        return context.json(
                            {
                                error: "Missing required fields (title and context)",
                            },
                            422,
                        );
                    }

                    const newFilter = (
                        await db
                            .insert(Filters)
                            .values({
                                title: title ?? "",
                                context: ctx ?? [],
                                filterAction: filter_action,
                                expireAt: new Date(
                                    Date.now() + (expires_in ?? 0),
                                ).toISOString(),
                                userId: user.id,
                            })
                            .returning()
                    )[0];

                    if (!newFilter) {
                        return context.json(
                            { error: "Failed to create filter" },
                            500,
                        );
                    }

                    const insertedKeywords =
                        keywords_attributes && keywords_attributes.length > 0
                            ? await db
                                  .insert(FilterKeywords)
                                  .values(
                                      keywords_attributes?.map((keyword) => ({
                                          filterId: newFilter.id,
                                          keyword: keyword.keyword,
                                          wholeWord:
                                              keyword.whole_word ?? false,
                                      })) ?? [],
                                  )
                                  .returning()
                            : [];

                    return context.json({
                        id: newFilter.id,
                        title: newFilter.title,
                        context: newFilter.context,
                        expires_at: expires_in
                            ? new Date(Date.now() + expires_in).toISOString()
                            : null,
                        filter_action: newFilter.filterAction,
                        keywords: insertedKeywords.map((keyword) => ({
                            id: keyword.id,
                            keyword: keyword.keyword,
                            whole_word: keyword.wholeWord,
                        })),
                        statuses: [],
                    } as {
                        id: string;
                        title: string;
                        context: string[];
                        expires_at: string;
                        filter_action: "warn" | "hide";
                        keywords: {
                            id: string;
                            keyword: string;
                            whole_word: boolean;
                        }[];
                        statuses: [];
                    });
                }
            }
        },
    ),
);
