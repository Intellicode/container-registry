#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

/**
 * Garbage Collection CLI for container registry.
 * Usage: deno task gc [--dry-run] [--min-age=SECONDS]
 */

import { parseArgs } from "@std/cli/parse-args";
import { getConfig } from "./src/config.ts";
import { FilesystemStorage } from "./src/storage/filesystem.ts";
import {
  GarbageCollectionService,
  formatBytes,
  formatDuration,
} from "./src/services/garbage-collection.ts";

function printUsage(): void {
  console.log(`
Container Registry Garbage Collection

Usage: deno task gc [options]

Options:
  --dry-run     Preview what would be deleted without actually deleting (default: true)
  --delete      Actually delete orphaned blobs (overrides --dry-run)
  --min-age=N   Don't delete blobs newer than N seconds (default: 3600)
  --help, -h    Show this help message

Examples:
  deno task gc                    # Dry run - see what would be deleted
  deno task gc --dry-run          # Same as above
  deno task gc --delete           # Actually delete orphaned blobs
  deno task gc --min-age=7200     # Only consider blobs older than 2 hours
`);
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    boolean: ["dry-run", "delete", "help", "h"],
    string: ["min-age"],
    default: {
      "dry-run": true,
      "delete": false,
      "help": false,
    },
  });

  if (args.help || args.h) {
    printUsage();
    Deno.exit(0);
  }

  const config = getConfig();
  const storage = new FilesystemStorage(config.storage.rootDirectory);

  // Determine if we're doing a dry run
  // --delete explicitly disables dry run
  const dryRun = args.delete ? false : true;

  // Parse min-age
  let minAge = config.gc.minAge;
  if (args["min-age"]) {
    const parsed = parseInt(args["min-age"], 10);
    if (!isNaN(parsed) && parsed >= 0) {
      minAge = parsed;
    } else {
      console.error("Error: --min-age must be a non-negative integer");
      Deno.exit(1);
    }
  }

  console.log("");
  console.log("=".repeat(60));
  if (dryRun) {
    console.log("  Garbage Collection (DRY RUN - no files will be deleted)");
  } else {
    console.log("  Garbage Collection");
  }
  console.log("=".repeat(60));
  console.log("");
  console.log(`Storage path: ${config.storage.rootDirectory}`);
  console.log(`Minimum blob age: ${minAge} seconds`);
  console.log("");

  const gcService = new GarbageCollectionService(
    {
      rootDirectory: config.storage.rootDirectory,
      dryRun,
      minAge,
    },
    storage,
  );

  console.log("Scanning blobs and manifests...");
  console.log("");

  const result = await gcService.run();

  // Print results
  console.log("-".repeat(60));
  console.log("Results:");
  console.log("-".repeat(60));
  console.log(`  Total blobs:      ${result.totalBlobs}`);
  console.log(`  Referenced blobs: ${result.referencedBlobs}`);
  console.log(`  Orphaned blobs:   ${result.orphanedBlobs}`);
  console.log(`  Skipped blobs:    ${result.skippedBlobs} (too new or active uploads)`);
  console.log("");

  if (dryRun) {
    console.log(`  Would delete:     ${result.deletedBlobs} blobs`);
    console.log(`  Would reclaim:    ${formatBytes(result.reclaimedBytes)}`);
  } else {
    console.log(`  Deleted:          ${result.deletedBlobs} blobs`);
    console.log(`  Reclaimed:        ${formatBytes(result.reclaimedBytes)}`);
  }

  console.log(`  Duration:         ${formatDuration(result.durationMs)}`);
  console.log("");

  if (result.errors.length > 0) {
    console.log("Errors:");
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
    console.log("");
  }

  if (dryRun && result.orphanedBlobs > 0) {
    console.log("To actually delete orphaned blobs, run:");
    console.log("  deno task gc --delete");
    console.log("");
  }

  console.log("=".repeat(60));
}

// Run main
main().catch((error) => {
  console.error("Fatal error:", error);
  Deno.exit(1);
});
