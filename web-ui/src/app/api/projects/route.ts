import { NextRequest, NextResponse } from "next/server";

// MCP Server connection configuration
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://158.247.203.55:3100";

export async function GET(request: NextRequest) {
  try {
    // Call MCP server's ssot_list_projects tool
    const response = await fetch(`${MCP_SERVER_URL}/api/projects`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // Fallback to mock data if MCP server is unavailable
      return NextResponse.json({
        success: true,
        data: getMockProjects(),
        source: "mock",
      });
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      data: data.projects || [],
      source: "mcp",
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    // Return mock data on error
    return NextResponse.json({
      success: true,
      data: getMockProjects(),
      source: "mock",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, projectType, gitRepo, description } = body;

    // Call MCP server's ssot_register_project tool
    const response = await fetch(`${MCP_SERVER_URL}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        projectType,
        gitRepo,
        description,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { success: false, error: `MCP server error: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create project" },
      { status: 500 }
    );
  }
}

function getMockProjects() {
  return [
    {
      id: "1",
      name: "videopick-web",
      type: "nextjs",
      gitRepo: "https://github.com/videopick/web",
      status: "active",
      environments: [
        { name: "staging", status: "running", domain: "videopick-staging.one-q.xyz", port: 3001 },
        { name: "production", status: "running", domain: "videopick.one-q.xyz", port: 4001 },
      ],
      lastDeployed: "2024-12-17T10:30:00Z",
    },
    {
      id: "2",
      name: "api-gateway",
      type: "nodejs",
      gitRepo: "https://github.com/videopick/api",
      status: "active",
      environments: [
        { name: "staging", status: "deploying", domain: "api-staging.one-q.xyz", port: 3002 },
        { name: "production", status: "running", domain: "api.one-q.xyz", port: 4002 },
      ],
      lastDeployed: "2024-12-17T09:15:00Z",
    },
    {
      id: "3",
      name: "admin-panel",
      type: "nextjs",
      gitRepo: "https://github.com/videopick/admin",
      status: "active",
      environments: [
        { name: "staging", status: "stopped", domain: "admin-staging.one-q.xyz", port: 3003 },
        { name: "production", status: "running", domain: "admin.one-q.xyz", port: 4003 },
      ],
      lastDeployed: "2024-12-16T14:20:00Z",
    },
  ];
}
