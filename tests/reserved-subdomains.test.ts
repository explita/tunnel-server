import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_RESERVED_SUBDOMAINS,
  getReservedSubdomains,
} from "../src/lib/reserved-subdomains.js";

test("getReservedSubdomains includes built-in defaults", () => {
  const reserved = getReservedSubdomains();
  assert.ok(reserved.has("admin"));
  assert.ok(reserved.has("api"));
  assert.ok(reserved.has("app"));
  assert.ok(reserved.has("tunnel"));
  assert.ok(reserved.has("login"));
  assert.ok(reserved.has("www"));
  assert.ok(reserved.has("status"));
  assert.ok(reserved.has("billing"));
  assert.equal(reserved.size >= DEFAULT_RESERVED_SUBDOMAINS.size, true);
});

test("getReservedSubdomains extends with env variable overrides", () => {
  const originalEnv = process.env.RESERVED_SUBDOMAINS;
  try {
    process.env.RESERVED_SUBDOMAINS = "custom-portal, my-secret-app";
    const reserved = getReservedSubdomains();
    assert.ok(reserved.has("custom-portal"));
    assert.ok(reserved.has("my-secret-app"));
    // Still includes defaults
    assert.ok(reserved.has("admin"));
  } finally {
    if (originalEnv !== undefined) {
      process.env.RESERVED_SUBDOMAINS = originalEnv;
    } else {
      delete process.env.RESERVED_SUBDOMAINS;
    }
  }
});

test("getReservedSubdomains extends with external file", () => {
  const tempFile = join(tmpdir(), `explita-subdomains-${Date.now()}.txt`);
  writeFileSync(tempFile, "# Comments are ignored\ncustom-corp\n\nVIP-CLIENT\n", "utf8");

  const originalFileEnv = process.env.RESERVED_SUBDOMAINS_FILE;
  try {
    process.env.RESERVED_SUBDOMAINS_FILE = tempFile;
    const reserved = getReservedSubdomains();
    assert.ok(reserved.has("custom-corp"));
    assert.ok(reserved.has("vip-client"));
    assert.ok(!reserved.has("# comments are ignored"));
  } finally {
    if (originalFileEnv !== undefined) {
      process.env.RESERVED_SUBDOMAINS_FILE = originalFileEnv;
    } else {
      delete process.env.RESERVED_SUBDOMAINS_FILE;
    }
    try {
      unlinkSync(tempFile);
    } catch {
      // ignore
    }
  }
});
