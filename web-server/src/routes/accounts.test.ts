import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { generateToken } from "../lib/auth-middleware";
import router from "./accounts";

const mocks = vi.hoisted(() => ({
  getAccountById: vi.fn(),
  deleteAccount: vi.fn(),
  updateAccount: vi.fn(),
}));
vi.mock("../models/account", () => ({
  getAccountById: mocks.getAccountById,
  deleteAccount: mocks.deleteAccount,
  updateAccount: mocks.updateAccount,
  createAccount: vi.fn(),
  getAccountsByUserId: vi.fn(),
}));

const OWNER_ID = "user-owner";
const ACCOUNT_ID = "64b000000000000000000001";

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RequestHandler }> };
}
interface Result { status: number; body: { success?: boolean; error?: string } }

// Runs every handler registered for the route in order, like Express would.
function invoke(method: string, token?: string): Promise<Result> {
  const route = (router.stack as RouteLayer[])
    .find(layer => layer.route?.path === "/:id" && layer.route.methods[method])!.route!;
  const handlers = route.stack.map(item => item.handle);
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    params: { id: ACCOUNT_ID },
    query: {},
    body: {},
  } as unknown as Request;
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code: number) { status = code; return res; },
      json(body: Result["body"]) { resolve({ status, body }); return res; },
    } as unknown as Response;
    const run = (index: number): void => {
      if (index >= handlers.length) return reject(new Error("No handler responded"));
      const next: NextFunction = (err?: unknown) => (err ? reject(err) : run(index + 1));
      void handlers[index](req, res, next);
    };
    run(0);
  });
}

describe("account-id routes require authentication before ownership checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccountById.mockResolvedValue({ _id: ACCOUNT_ID, userId: OWNER_ID, accountType: "upstox" });
    mocks.deleteAccount.mockResolvedValue(true);
  });

  it("lets the authenticated owner delete their account", async () => {
    const result = await invoke("delete", generateToken(OWNER_ID, "owner@example.com"));
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(mocks.deleteAccount).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it("rejects an unauthenticated delete with 401", async () => {
    const result = await invoke("delete");
    expect(result.status).toBe(401);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("rejects another user's delete with 403", async () => {
    const result = await invoke("delete", generateToken("someone-else", "other@example.com"));
    expect(result.status).toBe(403);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it.each(["get", "put", "patch"])("authenticates the owner on %s", async method => {
    mocks.updateAccount.mockResolvedValue({ _id: ACCOUNT_ID, userId: OWNER_ID });
    const result = await invoke(method, generateToken(OWNER_ID, "owner@example.com"));
    expect(result.status).toBe(200);
  });
});
