#!/usr/bin/env node
// eu-cloud-mcp: an MCP server (stdio) for moving off AWS, Google Cloud and Azure to EU-owned clouds.
// Tools read MoveInfra's open data on GitHub; the Terraform scan reads local files and sends nothing anywhere.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { load } from './lib/data.js';
import { findAlternative, comparePrices, exitFees, scanTerraform } from './lib/tools.js';

const server = new McpServer({ name: 'eu-cloud-mcp', version: '0.1.0' });
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const safe = (fn) => async (args) => {
  try {
    return text(await fn(args));
  } catch (err) {
    return { ...text(`Error: ${err.message}`), isError: true };
  }
};
const readOnly = { readOnlyHint: true, openWorldHint: true };

server.registerTool('find_eu_alternative', {
  title: 'Find an EU-owned alternative',
  description: 'Which EU-owned cloud product (UpCloud, Scaleway, Hetzner, OVHcloud) replaces an AWS, Google Cloud, Azure or ' +
    'DigitalOcean service, and how hard the move is. Examples: "S3", "RDS", "EKS", "DynamoDB", "Cloud Run", "Cosmos DB".',
  inputSchema: {
    service: z.string().describe('Service name, e.g. "S3" or "Lambda"'),
    cloud: z.enum(['aws', 'gcp', 'azure', 'digitalocean']).optional().describe('Source cloud, if known'),
  },
  annotations: readOnly,
}, safe(async ({ service, cloud }) => findAlternative(await load('map'), await load('rules'), service, cloud)));

server.registerTool('compare_eu_cloud_prices', {
  title: 'Compare cloud prices',
  description: 'Monthly EUR list prices for the same server, database, Kubernetes and storage baskets on AWS, Azure, ' +
    'Google Cloud, UpCloud, Hetzner, Scaleway and OVHcloud, refreshed monthly from provider price APIs.',
  inputSchema: {
    basket: z.string().optional().describe('Filter, e.g. "4 vCPU", "postgres", "kubernetes". Omit for all baskets'),
  },
  annotations: readOnly,
}, safe(async ({ basket }) => comparePrices(await load('prices'), basket)));

server.registerTool('estimate_cloud_exit_fees', {
  title: 'Estimate cloud exit fees',
  description: 'Egress cost of moving data out of AWS, Azure or Google Cloud at list price, whether the provider\'s exit ' +
    'program waives it and its conditions, and what the EU Data Act allows.',
  inputSchema: {
    provider: z.enum(['aws', 'azure', 'gcp']),
    data_gb: z.number().positive().describe('Data to move, in GB (1 TB = 1000 GB)'),
  },
  annotations: readOnly,
}, safe(async ({ provider, data_gb }) => exitFees(await load('exit'), provider, data_gb)));

server.registerTool('scan_terraform_lock_in', {
  title: 'Scan Terraform for cloud lock-in',
  description: 'Reads the .tf files in a local directory and lists the AWS, Google Cloud, Azure and DigitalOcean services ' +
    'used, how portable each is to EU-owned clouds, what replaces it, and an EU portability score. Files stay local.',
  inputSchema: {
    path: z.string().describe('Absolute path to a Terraform directory or .tf file'),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, safe(async ({ path }) => scanTerraform(await load('rules'), path)));

await server.connect(new StdioServerTransport());
