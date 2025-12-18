import { NextRequest, NextResponse } from "next/server";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://158.247.203.55:3100";

export async function GET(request: NextRequest) {
  try {
    // Call MCP server to get domain list from SSOT
    const response = await fetch(`${MCP_SERVER_URL}/api/domains`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        success: true,
        data: getMockDomains(),
        source: "mock",
      });
    }

    const data = await response.json();
    return NextResponse.json({
      success: true,
      data: data.domains || [],
      source: "mcp",
    });
  } catch (error) {
    console.error("Failed to fetch domains:", error);
    return NextResponse.json({
      success: true,
      data: getMockDomains(),
      source: "mock",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, subdomain, baseDomain, environment, targetPort } = body;

    // Call MCP server's setup_domain tool
    const response = await fetch(`${MCP_SERVER_URL}/api/domains`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectName: projectId,
        subdomain,
        baseDomain,
        environment,
        targetPort,
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
    console.error("Failed to setup domain:", error);
    return NextResponse.json(
      { success: false, error: "Failed to setup domain" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");
    const projectName = searchParams.get("projectName");
    const environment = searchParams.get("environment");

    if (!domain || !projectName || !environment) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Call MCP server's remove_domain tool
    const response = await fetch(`${MCP_SERVER_URL}/api/domains`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subdomain: domain.split(".")[0],
        baseDomain: domain.split(".").slice(1).join("."),
        projectName,
        environment,
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
    console.error("Failed to remove domain:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove domain" },
      { status: 500 }
    );
  }
}

function getMockDomains() {
  return [
    {
      id: "1",
      domain: "videopick.one-q.xyz",
      projectName: "videopick-web",
      environment: "production",
      targetPort: 4001,
      sslStatus: "valid",
      sslExpiry: "2025-03-17T00:00:00Z",
      dnsStatus: "active",
      createdAt: "2024-11-01T10:00:00Z",
    },
    {
      id: "2",
      domain: "videopick-staging.one-q.xyz",
      projectName: "videopick-web",
      environment: "staging",
      targetPort: 3001,
      sslStatus: "valid",
      sslExpiry: "2025-03-17T00:00:00Z",
      dnsStatus: "active",
      createdAt: "2024-11-01T10:00:00Z",
    },
    {
      id: "3",
      domain: "api.one-q.xyz",
      projectName: "api-gateway",
      environment: "production",
      targetPort: 4002,
      sslStatus: "valid",
      sslExpiry: "2025-02-20T00:00:00Z",
      dnsStatus: "active",
      createdAt: "2024-10-15T08:00:00Z",
    },
  ];
}
