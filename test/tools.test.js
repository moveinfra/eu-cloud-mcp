// Runs against the live open data, so it also checks that the data files still have the shape the tools expect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../lib/data.js';
import { findAlternative, comparePrices, exitFees, egressCost, scanTerraform } from '../lib/tools.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('find_eu_alternative names EU products and the source', async () => {
  const out = findAlternative(await load('map'), await load('rules'), 'S3');
  assert.match(out, /AWS S3: portable/);
  assert.match(out, /Hetzner/);
  assert.match(out, /moveinfra\.eu\/eu-cloud-map/);
});

test('a cloud word in the query picks the cloud', async () => {
  const out = findAlternative(await load('map'), await load('rules'), 'Azure Functions');
  assert.doesNotMatch(out, /Step Functions/);
});

test('compare_eu_cloud_prices sorts cheapest first', async () => {
  const out = comparePrices(await load('prices'), 'Server, 2 vCPU');
  const section = out.split('## ')[1];
  const euros = [...section.matchAll(/€([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(euros.length >= 5);
  assert.deepEqual(euros, [...euros].sort((a, b) => a - b));
});

test('egress tiers and free allowance', () => {
  const egress = { freeGBPerMonth: 100, tiers: [{ fromGB: 0, toGB: 1000, perGB: 0.1 }, { fromGB: 1000, toGB: null, perGB: 0.05 }] };
  assert.equal(egressCost(egress, 100), 0);
  assert.equal(egressCost(egress, 1100), 100);
  assert.equal(egressCost(egress, 2100), 150);
});

test('estimate_cloud_exit_fees covers the Data Act', async () => {
  const out = exitFees(await load('exit'), 'aws', 10000);
  assert.match(out, /List-price egress: €\d+/);
  assert.match(out, /12 January 2027/);
});

test('scan_terraform_lock_in scores a small project', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tf-'));
  writeFileSync(join(dir, 'main.tf'), 'resource "aws_s3_bucket" "a" {\n}\nresource "aws_dynamodb_table" "t" {\n}\n');
  const out = scanTerraform(await load('rules'), dir);
  assert.match(out, /EU portability score: 50\/100/);
  assert.match(out, /DynamoDB/);
});

test('hosted server: text scan only, no path tool, over HTTP', async () => {
  const { scanTerraformText } = await import('../lib/tools.js');
  const out = scanTerraformText(await load('rules'), 'resource "aws_dynamodb_table" "t" {\n}\nresource "aws_s3_bucket" "b" {\n}\n');
  assert.match(out, /EU portability score/);
  assert.match(out, /DynamoDB/);
  assert.doesNotMatch(out, /Paths are relative/);

  const { spawn } = await import('node:child_process');
  const port = 18090 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['http.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((r) => child.stdout.once('data', r));
    const call = async (method, params) => {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      return res.json();
    };
    const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
    assert.equal(init.result.serverInfo.name, 'eu-cloud-mcp');
    const tools = (await call('tools/list', {})).result.tools;
    const scan = tools.find((t) => t.name === 'scan_terraform_lock_in');
    assert.deepEqual(Object.keys(scan.inputSchema.properties), ['terraform']);
    const bad = await call('tools/call', { name: 'scan_terraform_lock_in', arguments: { path: '/etc' } });
    assert.ok(bad.error || bad.result.isError);
    const good = await call('tools/call', { name: 'estimate_cloud_exit_fees', arguments: { provider: 'aws', data_gb: 1000 } });
    assert.match(good.result.content[0].text, /€|EUR|\$/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/mcp`)).status, 405);
  } finally {
    child.kill();
  }
});
