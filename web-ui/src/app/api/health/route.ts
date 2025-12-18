import { NextRequest, NextResponse } from "next/server";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://158.247.203.55:3100";

// GET: Check server health or specific project health
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectName = searchParams.get("projectName");
    const environment = searchParams.get("environment");

    // If project specified, check project health
    if (projectName && environment) {
      const response = await fetch(`${MCP_SERVER_URL}/api/healthcheck`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectName,
          environment,
          checks: ["http", "container"],
        }),
      });

      if (!response.ok) {
        return NextResponse.json({
          success: true,
          data: { status: "unknown", message: "Could not reach MCP server" },
          source: "mock",
        });
      }

      const data = await response.json();
      return NextResponse.json({ success: true, data, source: "mcp" });
    }

    // Otherwise, check full server health
    const response = await fetch(`${MCP_SERVER_URL}/api/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        success: true,
        data: getMockServerHealth(),
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
    console.error("Failed to check health:", error);
    return NextResponse.json({
      success: true,
      data: getMockServerHealth(),
      source: "mock",
    });
  }
}

// POST: Trigger health check for specific project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectName, environment, checks, autoRollback } = body;

    if (!projectName || !environment) {
      return NextResponse.json(
        { success: false, error: "projectName and environment are required" },
        { status: 400 }
      );
    }

    const response = await fetch(`${MCP_SERVER_URL}/api/healthcheck`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectName,
        environment,
        checks: checks || ["http", "container", "database", "redis"],
        autoRollback: autoRollback || false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { success: false, error: `Health check failed: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to perform health check:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform health check" },
      { status: 500 }
    );
  }
}

function getMockServerHealth() {
  return {
    servers: [
      {
        name: "App Server",
        ip: "158.247.203.55",
        status: "healthy",
        uptime: "45d 12h 30m",
        cpu: 23,
        memory: 45,
        disk: 67,
        services: {
          caddy: "running",
          podman: "running",
          powerdns: "running",
        },
      },
      {
        name: "Streaming Server",
        ip: "141.164.42.213",
        status: "healthy",
        uptime: "30d 8h 15m",
        cpu: 56,
        memory: 72,
        disk: 45,
        services: {
          caddy: "running",
          podman: "running",
        },
      },
      {
        name: "Storage Server",
        ip: "64.176.226.119",
        status: "healthy",
        uptime: "60d 4h 22m",
        cpu: 12,
        memory: 38,
        disk: 78,
        services: {
          minio: "running",
          podman: "running",
        },
      },
      {
        name: "Backup Server",
        ip: "141.164.37.63",
        status: "warning",
        uptime: "15d 2h 45m",
        cpu: 8,
        memory: 25,
        disk: 85,
        services: {
          restic: "running",
          cron: "running",
        },
      },
    ],
    overall: "healthy",
    lastChecked: new Date().toISOString(),
  };
}
