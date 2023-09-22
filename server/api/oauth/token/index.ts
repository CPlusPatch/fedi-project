import { parseRequest } from "@request";
import { errorResponse, jsonResponse } from "@response";
import { Token } from "~database/entities/Token";

/**
 * Allows getting token from OAuth code
 */
export default async (req: Request): Promise<Response> => {
	const { grant_type, code, redirect_uri, client_id, client_secret, scope } =
		await parseRequest<{
			grant_type: string;
			code: string;
			redirect_uri: string;
			client_id: string;
			client_secret: string;
			scope: string;
		}>(req);

	if (grant_type !== "authorization_code")
		return errorResponse(
			"Invalid grant type (try 'authorization_code')",
			400
		);

	// Get associated token
	const token = await Token.findOneBy({
		code,
		application: {
			client_id,
			secret: client_secret,
			redirect_uris: redirect_uri,
		},
		scope: scope?.replaceAll("+", " "),
	});

	if (!token)
		return errorResponse("Invalid access token or client credentials", 401);

	return jsonResponse({
		access_token: token.access_token,
		token_type: token.token_type,
		scope: token.scope,
		created_at: token.created_at,
	});
};