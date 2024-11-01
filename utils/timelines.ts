import type { db } from "@versia/kit/db";
import type { SQL } from "drizzle-orm";
import type {
    Notification,
    findManyNotifications,
} from "~/classes/functions/notification";
import type { Status, findManyNotes } from "~/classes/functions/status";
import type { UserType, findManyUsers } from "~/classes/functions/user";
import { config } from "~/packages/config-manager/index.ts";

export async function fetchTimeline<T extends UserType | Status | Notification>(
    model:
        | typeof findManyNotes
        | typeof findManyUsers
        | typeof findManyNotifications,
    args:
        | Parameters<typeof findManyNotes>[0]
        | Parameters<typeof findManyUsers>[0]
        | Parameters<typeof db.query.Notifications.findMany>[0],
    req: Request,
    userId?: string,
): Promise<{
    link: string;
    objects: T[];
}> {
    // BEFORE: Before in a top-to-bottom order, so the most recent posts
    // AFTER: After in a top-to-bottom order, so the oldest posts
    // @ts-expect-error This is a hack to get around the fact that Prisma doesn't have a common base type for all models
    const objects = (await model(args, userId)) as T[];

    // Constuct HTTP Link header (next and prev) only if there are more statuses
    const linkHeader: string[] = [];
    const urlWithoutQuery = new URL(
        new URL(req.url).pathname,
        config.http.base_url,
    ).toString();

    if (objects.length > 0) {
        // Check if there are statuses before the first one
        // @ts-expect-error This is a hack to get around the fact that Prisma doesn't have a common base type for all models
        const objectsBefore = await model({
            ...args,
            // @ts-expect-error this hack breaks typing :(
            where: (object, { gt }): SQL | undefined =>
                gt(object.id, objects[0].id),
            limit: 1,
        });

        if (objectsBefore.length > 0) {
            // Add prev link
            linkHeader.push(
                `<${urlWithoutQuery}?limit=${args?.limit ?? 20}&min_id=${
                    objects[0].id
                }>; rel="prev"`,
            );
        }

        if (objects.length >= Number(args?.limit ?? 20)) {
            // Check if there are statuses after the last one
            // @ts-expect-error hack again
            const objectsAfter = await model({
                ...args,
                // @ts-expect-error this hack breaks typing :(
                where: (object, { lt }): SQL | undefined =>
                    lt(object.id, objects.at(-1)?.id),
                limit: 1,
            });

            if (objectsAfter.length > 0) {
                // Add next link
                linkHeader.push(
                    `<${urlWithoutQuery}?limit=${args?.limit ?? 20}&max_id=${
                        objects.at(-1)?.id
                    }>; rel="next"`,
                );
            }
        }
    }

    return {
        link: linkHeader.join(", "),
        objects,
    };
}
