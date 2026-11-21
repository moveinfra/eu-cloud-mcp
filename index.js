#!/usr/bin/env node
// eu-cloud-mcp: an MCP server for moving off AWS, Google Cloud and Azure to EU-owned clouds.
// Default: stdio, for local use (`npx -y eu-cloud-mcp`). `eu-cloud-mcp http` starts the hosted HTTP endpoint (http.js).
// Tools read MoveInfra's open data on GitHub; the local Terraform scan reads files on this machine and sends nothing anywhere.
if (process.argv[2] === 'http') {
  await import('./http.js');
} else {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { createServer } = await import('./lib/server.js');
  await createServer().connect(new StdioServerTransport());
}
