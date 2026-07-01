export declare const TEST_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
export declare const TEST_USER_EMAIL = "test-user@fnc-erp.local";
export declare const TEST_USER_PASSWORD = "TestPass123!";
export declare const TEST_ADMIN_EMAIL = "admin@fnc-erp.local";
export declare const TEST_ADMIN_PASSWORD = "ChangeMe123!";
export declare function cleanTestData(): Promise<void>;
export declare function createTestUser(overrides?: {
    mfaEnabled?: boolean;
    failedAttempts?: number;
    lockedUntil?: Date | null;
}): Promise<string>;
export declare function createTestUserWithMFA(): Promise<{
    userId: string;
    mfaSecret: string;
}>;
//# sourceMappingURL=setup.d.ts.map