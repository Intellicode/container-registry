import { assertEquals } from "@std/assert";
import { UploadCleanupService } from "./upload-cleanup.ts";
import { join } from "@std/path";

// Helper function to create a test directory
async function createTestDir(): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: "cleanup-test-" });
  return tempDir;
}

// Helper function to clean up test directory
async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await Deno.remove(dir, { recursive: true });
  } catch {
    // Ignore errors
  }
}

// Helper function to create an upload session with timestamp
async function createUploadSession(
  rootDir: string,
  uuid: string,
  startedAt: Date,
): Promise<void> {
  const sessionPath = join(rootDir, "uploads", uuid);
  await Deno.mkdir(sessionPath, { recursive: true });

  const startedAtPath = join(sessionPath, "startedat");
  await Deno.writeTextFile(startedAtPath, startedAt.toISOString());

  // Create a dummy data file
  const dataPath = join(sessionPath, "data");
  await Deno.writeTextFile(dataPath, "test data");
}

// Helper function to check if upload session exists
async function uploadSessionExists(
  rootDir: string,
  uuid: string,
): Promise<boolean> {
  try {
    const sessionPath = join(rootDir, "uploads", uuid);
    const stat = await Deno.stat(sessionPath);
    return stat.isDirectory;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

Deno.test("UploadCleanupService - cleanup expired sessions", async () => {
  const testDir = await createTestDir();

  try {
    // Create two upload sessions: one expired, one active
    const now = new Date();
    const expiredTime = new Date(now.getTime() - 3700 * 1000); // 3700 seconds ago (> 1 hour)
    const activeTime = new Date(now.getTime() - 1800 * 1000); // 1800 seconds ago (< 1 hour)

    await createUploadSession(testDir, "expired-session-1", expiredTime);
    await createUploadSession(testDir, "active-session-1", activeTime);

    // Create cleanup service with 1 hour timeout
    const service = new UploadCleanupService({
      rootDirectory: testDir,
      uploadTimeout: 3600, // 1 hour
      cleanupInterval: 300, // 5 minutes (won't matter for manual cleanup)
    });

    // Manually trigger cleanup (without starting the service)
    await (service as any).cleanup();

    // Verify expired session was removed
    const expiredExists = await uploadSessionExists(
      testDir,
      "expired-session-1",
    );
    assertEquals(expiredExists, false);

    // Verify active session still exists
    const activeExists = await uploadSessionExists(testDir, "active-session-1");
    assertEquals(activeExists, true);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("UploadCleanupService - no cleanup for active sessions", async () => {
  const testDir = await createTestDir();

  try {
    // Create only active sessions
    const now = new Date();
    const activeTime1 = new Date(now.getTime() - 1000 * 1000); // 1000 seconds ago
    const activeTime2 = new Date(now.getTime() - 2000 * 1000); // 2000 seconds ago

    await createUploadSession(testDir, "active-session-1", activeTime1);
    await createUploadSession(testDir, "active-session-2", activeTime2);

    // Create cleanup service with 1 hour timeout
    const service = new UploadCleanupService({
      rootDirectory: testDir,
      uploadTimeout: 3600, // 1 hour
      cleanupInterval: 300,
    });

    // Manually trigger cleanup
    await (service as any).cleanup();

    // Verify both sessions still exist
    const exists1 = await uploadSessionExists(testDir, "active-session-1");
    const exists2 = await uploadSessionExists(testDir, "active-session-2");
    assertEquals(exists1, true);
    assertEquals(exists2, true);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("UploadCleanupService - cleanup session with missing startedat", async () => {
  const testDir = await createTestDir();

  try {
    // Create a session without startedat file (corrupted)
    const sessionPath = join(testDir, "uploads", "corrupted-session");
    await Deno.mkdir(sessionPath, { recursive: true });
    const dataPath = join(sessionPath, "data");
    await Deno.writeTextFile(dataPath, "test data");

    // Create cleanup service
    const service = new UploadCleanupService({
      rootDirectory: testDir,
      uploadTimeout: 3600,
      cleanupInterval: 300,
    });

    // Manually trigger cleanup
    await (service as any).cleanup();

    // Verify corrupted session was removed
    const exists = await uploadSessionExists(testDir, "corrupted-session");
    assertEquals(exists, false);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("UploadCleanupService - cleanup multiple expired sessions", async () => {
  const testDir = await createTestDir();

  try {
    const now = new Date();
    const expiredTime = new Date(now.getTime() - 7200 * 1000); // 2 hours ago

    // Create 3 expired sessions
    await createUploadSession(testDir, "expired-1", expiredTime);
    await createUploadSession(testDir, "expired-2", expiredTime);
    await createUploadSession(testDir, "expired-3", expiredTime);

    // Create cleanup service
    const service = new UploadCleanupService({
      rootDirectory: testDir,
      uploadTimeout: 3600,
      cleanupInterval: 300,
    });

    // Manually trigger cleanup
    await (service as any).cleanup();

    // Verify all expired sessions were removed
    const exists1 = await uploadSessionExists(testDir, "expired-1");
    const exists2 = await uploadSessionExists(testDir, "expired-2");
    const exists3 = await uploadSessionExists(testDir, "expired-3");
    assertEquals(exists1, false);
    assertEquals(exists2, false);
    assertEquals(exists3, false);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("UploadCleanupService - getStats", async () => {
  const testDir = await createTestDir();

  try {
    const now = new Date();
    const expiredTime = new Date(now.getTime() - 7200 * 1000); // 2 hours ago
    const activeTime = new Date(now.getTime() - 1800 * 1000); // 30 minutes ago

    // Create 2 expired and 3 active sessions
    await createUploadSession(testDir, "expired-1", expiredTime);
    await createUploadSession(testDir, "expired-2", expiredTime);
    await createUploadSession(testDir, "active-1", activeTime);
    await createUploadSession(testDir, "active-2", activeTime);
    await createUploadSession(testDir, "active-3", activeTime);

    // Create cleanup service
    const service = new UploadCleanupService({
      rootDirectory: testDir,
      uploadTimeout: 3600,
      cleanupInterval: 300,
    });

    // Get stats
    const stats = await service.getStats();

    assertEquals(stats.total, 5);
    assertEquals(stats.expired, 2);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("UploadCleanupService - no uploads directory", async () => {
  const testDir = await createTestDir();

  try {
    // Don't create uploads directory

    // Create cleanup service
    const service = new UploadCleanupService({
      rootDirectory: testDir,
      uploadTimeout: 3600,
      cleanupInterval: 300,
    });

    // Manually trigger cleanup (should not error)
    await (service as any).cleanup();

    // Get stats (should return 0)
    const stats = await service.getStats();
    assertEquals(stats.total, 0);
    assertEquals(stats.expired, 0);
  } finally {
    await cleanupTestDir(testDir);
  }
});

Deno.test("UploadCleanupService - custom timeout", async () => {
  const testDir = await createTestDir();

  try {
    const now = new Date();
    // Session is 15 minutes old
    const sessionTime = new Date(now.getTime() - 900 * 1000); // 900 seconds = 15 minutes

    await createUploadSession(testDir, "test-session", sessionTime);

    // Create cleanup service with 10 minute timeout
    const service = new UploadCleanupService({
      rootDirectory: testDir,
      uploadTimeout: 600, // 10 minutes
      cleanupInterval: 300,
    });

    // Manually trigger cleanup
    await (service as any).cleanup();

    // Session should be expired (15 min > 10 min timeout)
    const exists = await uploadSessionExists(testDir, "test-session");
    assertEquals(exists, false);
  } finally {
    await cleanupTestDir(testDir);
  }
});
