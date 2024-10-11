import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@versia/kit/db";
import { eq } from "drizzle-orm";
import { Applications } from "~/drizzle/schema";
import { fakeRequest } from "~/tests/utils";

const clientId = "test-client-id";
const redirectUri = "https://example.com/callback";
const scope = "openid profile email";
const secret = "test-secret";

beforeAll(async () => {
    await db.insert(Applications).values({
        clientId,
        redirectUri,
        scopes: scope,
        name: "Test Application",
        secret,
    });
});

afterAll(async () => {
    await db.delete(Applications).where(eq(Applications.clientId, clientId));
});

describe("/.well-known/jwks", () => {
    test("should return JWK set with valid inputs", async () => {
        const response = await fakeRequest("/.well-known/jwks", {
            method: "GET",
        });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.keys).toHaveLength(1);
        expect(body.keys[0].kty).toBe("OKP");
        expect(body.keys[0].use).toBe("sig");
        expect(body.keys[0].alg).toBe("EdDSA");
        expect(body.keys[0].kid).toBe("1");
        expect(body.keys[0].crv).toBe("Ed25519");
        expect(body.keys[0].x).toBeString();
    });
});