/**
 * Token Service (JWT)
 *
 * Implements JWT token validation for Bearer token authentication.
 * Supports RS256 and ES256 algorithms for token verification.
 */

import { verify } from "djwt";
import type { Payload } from "djwt";
import { decodeBase64 } from "@std/encoding/base64";
import type { TokenAuthConfig } from "../config.ts";

/**
 * Represents an access control entry in the JWT token
 */
export interface AccessEntry {
  type: string;
  name: string;
  actions: string[];
}

/**
 * Extended JWT payload with Docker registry-specific claims
 */
export interface RegistryTokenPayload extends Payload {
  iss?: string; // issuer
  sub?: string; // subject (username)
  aud?: string | string[]; // audience (service)
  exp?: number; // expiration time
  iat?: number; // issued at
  access?: AccessEntry[];
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  payload?: RegistryTokenPayload;
  error?: string;
}

/**
 * Service for validating JWT tokens
 */
export class TokenService {
  private cryptoKey: CryptoKey | null = null;

  constructor(private config: TokenAuthConfig) {}

  /**
   * Initializes the token service by loading the public key
   */
  async initialize(): Promise<void> {
    this.cryptoKey = await this.loadPublicKey(this.config.publicKey);
  }

  /**
   * Loads a public key from a PEM file path
   */
  private async loadPublicKey(keyPath: string): Promise<CryptoKey> {
    try {
      const pemContent = await Deno.readTextFile(keyPath);
      return await this.importPublicKeyFromPem(pemContent);
    } catch (error) {
      throw new Error(
        `Failed to load public key from ${keyPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Imports a public key from PEM format
   */
  private async importPublicKeyFromPem(pem: string): Promise<CryptoKey> {
    // Remove PEM headers and whitespace
    const pemHeader = "-----BEGIN PUBLIC KEY-----";
    const pemFooter = "-----END PUBLIC KEY-----";
    const pemContents = pem
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\s/g, "");

    // Decode base64
    const binaryDer = decodeBase64(pemContents);

    // Import as CryptoKey - try RS256 first, then ES256
    try {
      return await crypto.subtle.importKey(
        "spki",
        binaryDer,
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
        },
        true,
        ["verify"],
      );
    } catch {
      // Try ES256
      return await crypto.subtle.importKey(
        "spki",
        binaryDer,
        {
          name: "ECDSA",
          namedCurve: "P-256",
        },
        true,
        ["verify"],
      );
    }
  }

  /**
   * Validates a JWT token
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    if (!this.cryptoKey) {
      return {
        valid: false,
        error: "Token service not initialized",
      };
    }

    try {
      // Verify the token signature and extract payload
      const payload = await verify(
        token,
        this.cryptoKey,
      ) as RegistryTokenPayload;

      // Validate issuer
      if (payload.iss !== this.config.issuer) {
        return {
          valid: false,
          error:
            `Invalid issuer: expected ${this.config.issuer}, got ${payload.iss}`,
        };
      }

      // Validate audience
      if (!this.validateAudience(payload.aud, this.config.service)) {
        return {
          valid: false,
          error: `Invalid audience: expected ${this.config.service}`,
        };
      }

      // Validate expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        return {
          valid: false,
          error: "Token has expired",
        };
      }

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      return {
        valid: false,
        error: `Token verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Validates that the audience claim matches the expected service
   */
  private validateAudience(
    aud: string | string[] | undefined,
    expectedService: string,
  ): boolean {
    if (!aud) {
      return false;
    }

    if (typeof aud === "string") {
      return aud === expectedService;
    }

    return aud.includes(expectedService);
  }

  /**
   * Parses Bearer token from Authorization header
   */
  static parseBearerToken(authHeader: string): string | null {
    if (!authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return null;
    }

    return token;
  }

  /**
   * Checks if a token grants access to a specific repository action
   */
  static hasAccess(
    payload: RegistryTokenPayload | undefined,
    repositoryName: string,
    action: string,
  ): boolean {
    if (!payload?.access) {
      return false;
    }

    for (const entry of payload.access) {
      if (
        entry.type === "repository" &&
        entry.name === repositoryName &&
        entry.actions.includes(action)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generates a Bearer challenge for WWW-Authenticate header
   */
  static generateChallenge(
    realm: string,
    service: string,
    scope?: string,
  ): string {
    const escapedRealm = realm.replace(/["\\]/g, "\\$&");
    const escapedService = service.replace(/["\\]/g, "\\$&");

    let challenge =
      `Bearer realm="${escapedRealm}",service="${escapedService}"`;

    if (scope) {
      const escapedScope = scope.replace(/["\\]/g, "\\$&");
      challenge += `,scope="${escapedScope}"`;
    }

    return challenge;
  }
}

/**
 * Creates and initializes a TokenService instance
 */
export async function createTokenService(
  config: TokenAuthConfig,
): Promise<TokenService> {
  const service = new TokenService(config);
  await service.initialize();
  return service;
}
