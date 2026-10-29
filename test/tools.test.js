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
