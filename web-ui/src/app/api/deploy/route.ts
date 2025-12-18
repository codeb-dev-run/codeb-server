import { NextRequest, NextResponse } from "next/server";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://158.247.203.55:3100";

// GET: Fetch deployment history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectName = searchParams.get("projectName");
    const environment = searchParams.get("environment");

    // Build query params
    const queryParams = new URLSearchParams();
    if (projectName) queryParams.set("projectName", projectName);
    if (environment) queryParams.set("environment", environment);

    const response = await fetch(
      `${MCP_SERVER_URL}/api/deployments?${queryParams.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({
        success: true,
        data: getMockDeployments(),
        source: "mock",
      });
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      data: data.deployments || [],
      source: "mcp",
    });
  } catch (error) {
    console.error("Failed to fetch deployments:", error);
    return NextResponse.json({
      success: true,
      data: getMockDeployments(),
      source: "mock",
    });
  }
}

// POST: Trigger new deployment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectName, environment, strategy, skipHealthcheck, skipTests } = body;

    if (!projectName || !environment) {
      return NextResponse.json(
        { success: false, error: "projectName and environment are required" },
        { status: 400 }
      );
    }

    // Call MCP server's deploy tool
    const response = await fetch(`${MCP_SERVER_URL}/api/deploy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectName,
        environment,
        strategy: strategy || "rolling",
        skipHealthcheck: skipHealthcheck || false,
        skipTests: skipTests || false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { success: false, error: `Deployment failed: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to trigger deployment:", error);
    return NextResponse.json(
      { success: false, error: "Failed to trigger deployment" },
      { status: 500 }
    );
  }
}

function getMockDeployments() {
  return [
    {
      id: "1",
      projectName: "videopick-web",
      environment: "production",
      status: "success",
      version: "v1.2.3",
      gitBranch: "main",
      gitCommit: "a1b2c3d",
      commitMessage: "feat: add video player component",
      deployedBy: "GitHub Actions",
      startedAt: "2024-12-17T10:30:00Z",
      finishedAt: "2024-12-17T10:35:00Z",
      duration: 300,
    },
    {
      id: "2",
      projectName: "api-gateway",
      environment: "staging",
      status: "deploying",
      version: "v2.0.0-beta",
      gitBranch: "develop",
      gitCommit: "e4f5g6h",
      commitMessage: "refactor: update authentication flow",
      deployedBy: "GitHub Actions",
      startedAt: "2024-12-17T10:45:00Z",
      finishedAt: null,
      duration: null,
    },
    {
      id: "3",
      projectName: "admin-panel",
      environment: "staging",
      status: "failed",
      version: "v1.0.5",
      gitBranch: "feature/dashboard",
      gitCommit: "i7j8k9l",
      commitMessage: "fix: dashboard layout issues",
      deployedBy: "manual",
      startedAt: "2024-12-17T09:00:00Z",
      finishedAt: "2024-12-17T09:05:00Z",
      duration: 300,
      error: "Build failed: TypeScript compilation error",
    },
  ];
}
