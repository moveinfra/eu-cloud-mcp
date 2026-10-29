# eu-cloud-mcp

**An MCP server for moving off AWS, Google Cloud and Azure to EU-owned clouds.**
Ask your AI assistant or coding agent which EU product replaces a service, what the same setup costs on each cloud,
what leaving will cost in egress, and how locked-in your Terraform is. Answers come from open, sourced data
maintained by [MoveInfra](https://moveinfra.eu), not from the model's memory.

| Tool | What it answers |
|---|---|
| `find_eu_alternative` | Which UpCloud, Scaleway, Hetzner or OVHcloud product replaces S3, RDS, EKS, Lambda, DynamoDB, Cloud Run, Cosmos DB, ..., and how hard the move is |
| `compare_eu_cloud_prices` | Monthly EUR list prices for the same server, PostgreSQL, Kubernetes and storage baskets on AWS, Azure, Google Cloud, UpCloud, Hetzner, Scaleway, OVHcloud |
| `estimate_cloud_exit_fees` | Egress cost of moving N GB out of AWS, Azure or Google Cloud, whether their exit programs waive it, and what the EU Data Act allows (switching fees banned from 12 January 2027) |
| `scan_terraform_lock_in` | Reads local `.tf` files: services used, how portable each one is, its EU replacement, and an EU portability score (0–100) |

- **Read-only.** No cloud credentials. The Terraform scan reads files locally and sends nothing anywhere.
- **Current data.** Tools read the open data repositories below (cached for an hour), so prices and rules follow
  the monthly updates without a new release.
- **Open source**, Apache-2.0. Node.js 20 or later.

## Install

Claude Code:

```sh
claude mcp add eu-cloud -- npx -y eu-cloud-mcp
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.eu-cloud]
command = "npx"
args = ["-y", "eu-cloud-mcp"]
```

Claude Desktop, Cursor, VS Code and other clients (`mcpServers` JSON):

```json
{
  "mcpServers": {
    "eu-cloud": { "command": "npx", "args": ["-y", "eu-cloud-mcp"] }
  }
}
```

## Examples

- "Which EU cloud replaces our DynamoDB tables, and how much work is it?"
- "What does a 4 vCPU / 16 GB server cost on Hetzner, Scaleway and UpCloud compared with AWS?"
- "We have 40 TB in S3. What will it cost to move it out, and can we get the egress waived?"
- "Scan ./infra and tell me what would be hard to move to an EU-owned cloud."

## Data

| Data | Repository | License |
|---|---|---|
| EU Cloud Map (service equivalents) | [moveinfra/eu-cloud-map](https://github.com/moveinfra/eu-cloud-map) | CC BY 4.0 |
| EU Cloud Price Index | [moveinfra/eu-cloud-prices](https://github.com/moveinfra/eu-cloud-prices) | CC BY 4.0 |
| Exit fees and exit programs | [moveinfra/cloud-switching-kit](https://github.com/moveinfra/cloud-switching-kit) | see repository |
| Lock-in rules | [moveinfra/cloud-lock-in-scanner](https://github.com/moveinfra/cloud-lock-in-scanner) | Apache-2.0 |

Found a wrong price or a missing service? Open an issue or PR in the data repository; this server picks it up within an hour.

`scan_terraform_lock_in` is a quick Terraform-only scan. For CloudFormation, SAM, Serverless, SDK imports, file and
line numbers, and a CI check, use [cloud-lock-in-scanner](https://github.com/moveinfra/cloud-lock-in-scanner).

## Development

```sh
npm ci
npm test            # tests read the live data
npx @modelcontextprotocol/inspector node index.js
```

Planning a move? [MoveInfra](https://moveinfra.eu) migrates companies from AWS, Google Cloud and Azure to EU-owned clouds.
