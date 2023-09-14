import { getConfig } from "@config";
import "reflect-metadata";
import { AppDataSource } from "~database/datasource";

const router = new Bun.FileSystemRouter({
	style: "nextjs",
	dir: process.cwd() + "/server/api",
});

console.log("[+] Starting FediProject...");

const config = getConfig();

if (!AppDataSource.isInitialized) await AppDataSource.initialize();

Bun.serve({
	port: config.http.port,
	hostname: config.http.base_url || "0.0.0.0", // defaults to "0.0.0.0"
	async fetch(req) {
		const matchedRoute = router.match(req);

		console.log(req.url);

		if (matchedRoute) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
			return (await import(matchedRoute.filePath)).default(
				req,
				matchedRoute
			) as Response | Promise<Response>;
		} else {
			return new Response(undefined, {
				status: 404,
				statusText: "Route not found",
			});
		}
	},
});

console.log("[+] FediProject started!");
