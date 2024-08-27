import { apiRoute, applyConfig, auth, handleZodError, jsonOrForm } from "@/api";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/drizzle/db";
import { FilterKeywords, Filters, RolePermissions } from "~/drizzle/schema";

export const meta = applyConfig({
    allowedMethods: ["GET", "PUT", "DELETE"],
    route: "/api/v2/filters/:id",
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
    param: z.object({
        id: z.string().uuid(),
    }),
    json: z.object({
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
                    keyword: z.string().trim().min(1).max(100).optional(),
                    id: z.string().uuid().optional(),
                    whole_word: z
                        .string()
                        .transform((v) =>
                            ["true", "1", "on"].includes(v.toLowerCase()),
                        )
                        .optional(),
                    // biome-ignore lint/style/useNamingConvention: _destroy is a Mastodon API imposed variable name
                    _destroy: z
                        .string()
                        .transform((v) =>
                            ["true", "1", "on"].includes(v.toLowerCase()),
                        )
                        .optional(),
                }),
            )
            .optional(),
    }),
};

export default apiRoute((app) =>
    app.on(
        meta.allowedMethods,
        meta.route,
        jsonOrForm(),
        zValidator("param", schemas.param, handleZodError),
        zValidator("json", schemas.json, handleZodError),
        auth(meta.auth, meta.permissions),
        async (context) => {
            const { user } = context.get("auth");
            const { id } = context.req.valid("param");

            if (!user) {
                return context.json({ error: "Unauthorized" }, 401);
            }

            const userFilter = await db.query.Filters.findFirst({
                where: (filter, { eq, and }) =>
                    and(eq(filter.userId, user.id), eq(filter.id, id)),
                with: {
                    keywords: true,
                },
            });

            if (!userFilter) {
                return context.json({ error: "Filter not found" }, 404);
            }

            switch (context.req.method) {
                case "GET": {
                    return context.json({
                        id: userFilter.id,
                        title: userFilter.title,
                        context: userFilter.context,
                        expires_at: userFilter.expireAt
                            ? new Date(userFilter.expireAt).toISOString()
                            : null,
                        filter_action: userFilter.filterAction,
                        keywords: userFilter.keywords.map((keyword) => ({
                            id: keyword.id,
                            keyword: keyword.keyword,
                            whole_word: keyword.wholeWord,
                        })),
                        statuses: [],
                    });
                }
                case "PUT": {
                    const {
                        title,
                        context: ctx,
                        filter_action,
                        expires_in,
                        keywords_attributes,
                    } = context.req.valid("json");

                    await db
                        .update(Filters)
                        .set({
                            title,
                            context: ctx ?? [],
                            filterAction: filter_action,
                            expireAt: new Date(
                                Date.now() + (expires_in ?? 0),
                            ).toISOString(),
                        })
                        .where(
                            and(
                                eq(Filters.userId, user.id),
                                eq(Filters.id, id),
                            ),
                        );

                    const toUpdate = keywords_attributes
                        ?.filter((keyword) => keyword.id && !keyword._destroy)
                        .map((keyword) => ({
                            keyword: keyword.keyword,
                            wholeWord: keyword.whole_word ?? false,
                            id: keyword.id,
                        }));

                    const toDelete = keywords_attributes
                        ?.filter((keyword) => keyword._destroy && keyword.id)
                        .map((keyword) => keyword.id ?? "");

                    if (toUpdate && toUpdate.length > 0) {
                        for (const keyword of toUpdate) {
                            await db
                                .update(FilterKeywords)
                                .set(keyword)
                                .where(
                                    and(
                                        eq(FilterKeywords.filterId, id),
                                        eq(FilterKeywords.id, keyword.id ?? ""),
                                    ),
                                );
                        }
                    }

                    if (toDelete && toDelete.length > 0) {
                        await db
                            .delete(FilterKeywords)
                            .where(
                                and(
                                    eq(FilterKeywords.filterId, id),
                                    inArray(FilterKeywords.id, toDelete),
                                ),
                            );
                    }

                    const updatedFilter = await db.query.Filters.findFirst({
                        where: (filter, { eq, and }) =>
                            and(eq(filter.userId, user.id), eq(filter.id, id)),
                        with: {
                            keywords: true,
                        },
                    });

                    if (!updatedFilter) {
                        return context.json(
                            { error: "Failed to update filter" },
                            500,
                        );
                    }

                    return context.json({
                        id: updatedFilter.id,
                        title: updatedFilter.title,
                        context: updatedFilter.context,
                        expires_at: updatedFilter.expireAt
                            ? new Date(updatedFilter.expireAt).toISOString()
                            : null,
                        filter_action: updatedFilter.filterAction,
                        keywords: updatedFilter.keywords.map((keyword) => ({
                            id: keyword.id,
                            keyword: keyword.keyword,
                            whole_word: keyword.wholeWord,
                        })),
                        statuses: [],
                    });
                }
                case "DELETE": {
                    await db
                        .delete(Filters)
                        .where(
                            and(
                                eq(Filters.userId, user.id),
                                eq(Filters.id, id),
                            ),
                        );

                    return context.json({});
                }
            }
        },
    ),
);
