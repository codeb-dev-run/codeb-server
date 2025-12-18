import { NextRequest, NextResponse } from "next/server";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://158.247.203.55:3100";

// GET: List environment variables for a project
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectName = searchParams.get("projectName");
    const environment = searchParams.get("environment");

    if (!projectName || !environment) {
      return NextResponse.json(
        { success: false, error: "projectName and environment are required" },
        { status: 400 }
      );
    }

    const response = await fetch(`${MCP_SERVER_URL}/api/env`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "list",
        projectName,
        environment,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({
        success: true,
        data: getMockEnvVars(projectName, environment),
        source: "mock",
      });
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      data: data.variables || [],
      source: "mcp",
    });
  } catch (error) {
    console.error("Failed to fetch env variables:", error);
    return NextResponse.json({
      success: true,
      data: [],
      source: "mock",
    });
  }
}

// POST: Set environment variable
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectName, environment, key, value } = body;

    if (!projectName || !environment || !key) {
      return NextResponse.json(
        { success: false, error: "projectName, environment, and key are required" },
        { status: 400 }
      );
    }

    const response = await fetch(`${MCP_SERVER_URL}/api/env`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "set",
        projectName,
        environment,
        key,
        value,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { success: false, error: `Failed to set env variable: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to set env variable:", error);
    return NextResponse.json(
      { success: false, error: "Failed to set env variable" },
      { status: 500 }
    );
  }
}

// DELETE: Delete environment variable
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectName = searchParams.get("projectName");
    const environment = searchParams.get("environment");
    const key = searchParams.get("key");

    if (!projectName || !environment || !key) {
      return NextResponse.json(
        { success: false, error: "projectName, environment, and key are required" },
        { status: 400 }
      );
    }

    const response = await fetch(`${MCP_SERVER_URL}/api/env`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "delete",
        projectName,
        environment,
        key,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { success: false, error: `Failed to delete env variable: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to delete env variable:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete env variable" },
      { status: 500 }
    );
  }
}

function getMockEnvVars(projectName: string, environment: string) {
  const envVars: Record<string, Record<string, { key: string; value: string; isSecret: boolean }[]>> = {
    "videopick-web": {
      staging: [
        { key: "NODE_ENV", value: "staging", isSecret: false },
        { key: "NEXT_PUBLIC_API_URL", value: "https://api-staging.one-q.xyz", isSecret: false },
        { key: "DATABASE_URL", value: "postgresql://***:***@localhost:15432/videopick", isSecret: true },
      ],
      production: [
        { key: "NODE_ENV", value: "production", isSecret: false },
        { key: "NEXT_PUBLIC_API_URL", value: "https://api.one-q.xyz", isSecret: false },
        { key: "DATABASE_URL", value: "postgresql://***:***@localhost:25432/videopick", isSecret: true },
      ],
    },
    "api-gateway": {
      staging: [
        { key: "NODE_ENV", value: "staging", isSecret: false },
        { key: "PORT", value: "3002", isSecret: false },
        { key: "JWT_SECRET", value: "***", isSecret: true },
      ],
      production: [
        { key: "NODE_ENV", value: "production", isSecret: false },
        { key: "PORT", value: "4002", isSecret: false },
        { key: "JWT_SECRET", value: "***", isSecret: true },
      ],
    },
  };

  return envVars[projectName]?.[environment] || [];
}
