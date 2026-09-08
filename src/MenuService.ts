import { errorResponse } from "./http-response";

const HMAC_ALGORITHM = {
    name: "HMAC",
    hash: "SHA-256",
} as const;

export class MenuService {
    private readonly textEncoder = new TextEncoder();
    private readonly key: Promise<CryptoKey>;

    constructor(seed: string) {
        this.key = crypto.subtle.importKey(
            "raw",
            this.textEncoder.encode(seed),
            HMAC_ALGORITHM,
            false,
            ["sign", "verify"],
        );
    }

    public async createMenuId(): Promise<string> {
        const uuid = crypto.randomUUID();
        const key = await this.key;
        const signature = await crypto.subtle.sign(
            HMAC_ALGORITHM,
            key,
            this.textEncoder.encode(uuid),
        );

        return `${uuid}.${this.encodeBase64Url(signature)}`;
    }

    public async verifyMenuId(menuId: string): Promise<void> {
        let isValid = false;
        const [uuid, encodedSignature, extraPart] = menuId.split(".");

        const signature = this.decodeBase64Url(encodedSignature);
        if (signature) {
            const key = await this.key;
            isValid = await crypto.subtle.verify(
                HMAC_ALGORITHM,
                key,
                signature,
                this.textEncoder.encode(uuid),
            );
        }

        if (extraPart !== undefined || !isValid) {
            throw new InvalidMenuIdError();
        }
    }

    private encodeBase64Url(value: ArrayBuffer): string {
        const binary = String.fromCharCode(...new Uint8Array(value));
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    private decodeBase64Url(value: string): Uint8Array | null {
        try {
            const base64 =
                value.replace(/-/g, "+").replace(/_/g, "/") +
                "=".repeat((4 - (value.length % 4)) % 4);
            return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
        } catch {
            return null;
        }
    }
}

export class InvalidMenuIdError extends Error {
    constructor() {
        super("Invalid menu ID");
    }

    public getErrorResponse(): Response {
        return errorResponse(
            401,
            "INVALID_MENU_ID_REQUEST",
            "The supplied menu ID is missing or invalid.",
        );
    }
}
