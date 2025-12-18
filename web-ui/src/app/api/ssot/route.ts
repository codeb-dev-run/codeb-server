import { NextRequest, NextResponse } from "next/server";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://158.247.203.55:3100";

// GET: Get SSOT status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "get";

    let endpoint = "/api/ssot";

    switch (action) {
      case "validate":
        endpoint = "/api/ssot/validate";
        break;
      case "history":
        endpoint = "/api/ssot/history";
        break;
      default:
        endpoint = "/api/ssot";
    }

    const response = await fetch(`${MCP_SERVER_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        success: true,
        data: getMockSSOT(),
        source: "mock",
      });
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      data,
      source: "mcp",
    });
  } catch (error) {
    console.error("Failed to fetch SSOT:", error);
    return NextResponse.json({
      success: true,
      data: getMockSSOT(),
      source: "mock",
    });
  }
}

// POST: Perform SSOT actions (sync, initialize, etc.)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "action is required" },
        { status: 400 }
      );
    }

    let endpoint = "/api/ssot";
    let method = "POST";

    switch (action) {
      case "sync":
        endpoint = "/api/ssot/sync";
        break;
      case "initialize":
        endpoint = "/api/ssot/initialize";
        break;
      case "migrate":
        endpoint = "/api/ssot/migrate";
        break;
      case "allocate-port":
        endpoint = "/api/ssot/allocate-port";
        break;
      case "release-port":
        endpoint = "/api/ssot/release-port";
        break;
      case "set-domain":
        endpoint = "/api/ssot/set-domain";
        break;
      case "remove-domain":
        endpoint = "/api/ssot/remove-domain";
        break;
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    const response = await fetch(`${MCP_SERVER_URL}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { success: false, error: `SSOT action failed: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to perform SSOT action:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform SSOT action" },
      { status: 500 }
    );
  }
}

function getMockSSOT() {
  return {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    projects: {
      "videopick-web": {
        type: "nextjs",
        gitRepo: "https://github.com/videopick/web",
        status: "active",
        environments: {
          staging: {
            ports: { app: 3001, db: 15432 },
            domain: "videopick-staging.one-q.xyz",
          },
          production: {
            ports: { app: 4001, db: 25432 },
            domain: "videopick.one-q.xyz",
          },
        },
      },
      "api-gateway": {
        type: "nodejs",
        gitRepo: "https://github.com/videopick/api",
        status: "active",
        environments: {
          staging: {
            ports: { app: 3002, db: 15433 },
            domain: "api-staging.one-q.xyz",
          },
          production: {
            ports: { app: 4002, db: 25433 },
            domain: "api.one-q.xyz",
          },
        },
      },
    },
    portAllocation: {
      staging: {
        app: { start: 3000, end: 3499, allocated: [3001, 3002, 3003] },
        db: { start: 15432, end: 15499, allocated: [15432, 15433] },
        redis: { start: 16379, end: 16399, allocated: [] },
      },
      production: {
        app: { start: 4000, end: 4499, allocated: [4001, 4002, 4003] },
        db: { start: 25432, end: 25499, allocated: [25432, 25433] },
        redis: { start: 26379, end: 26399, allocated: [] },
      },
    },
    validation: {
      lastRun: new Date().toISOString(),
      status: "valid",
      issues: [],
    },
  };
}
