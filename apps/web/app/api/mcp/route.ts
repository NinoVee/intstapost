import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApi, jsonError } from "@/lib/http";
import { buildMcpServer } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP endpoint (Streamable HTTP, stateless) for AI agents such as Meta Muse or Claude.
 * Requires `Authorization: Bearer <agent key>` (create one in Settings → AI agents).
 * Browser cookies are not accepted here.
 */
async function handle(req: Request): Promise<Response> {
  const auth = await authenticateApi(req, { mutation: false, capability: "read" });
  if (auth instanceof NextResponse) return auth;
  if (auth.via === "cookie") {
    return NextResponse.json({ error: "Use an agent key: Authorization: Bearer isa_…", code: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const server = buildMcpServer(auth);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    await server.close();
    return response;
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
