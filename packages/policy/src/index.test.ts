import { describe, expect, test } from "bun:test";
import { CapabilityPolicy } from "./index.ts";

const owner = { id: "owner", kind: "owner" as const };

describe("CapabilityPolicy", () => {
  test("denies shell in run-roles trust tier", () => {
    const decision = new CapabilityPolicy().decide({
      principal: owner,
      capability: "shell.run",
      trustTier: "run-roles",
      allowedCapabilities: ["shell.run"],
    });

    expect(decision.allow).toBe(false);
  });

  test("allows message send in run-roles trust tier", () => {
    const decision = new CapabilityPolicy().decide({
      principal: owner,
      capability: "message.send",
      trustTier: "run-roles",
      allowedCapabilities: ["message.send"],
    });

    expect(decision.allow).toBe(true);
  });

  test("allows project reads in run-roles trust tier when explicitly allowlisted", () => {
    const decision = new CapabilityPolicy().decide({
      principal: owner,
      capability: "fs.project.read",
      trustTier: "run-roles",
      allowedCapabilities: ["fs.project.read"],
    });

    expect(decision.allow).toBe(true);
  });

  test("explicit deny wins", () => {
    const decision = new CapabilityPolicy().decide({
      principal: owner,
      capability: "message.send",
      trustTier: "run-roles",
      allowedCapabilities: ["message.send"],
      deniedCapabilities: ["message.send"],
    });

    expect(decision.allow).toBe(false);
  });
});
