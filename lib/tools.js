// The tool logic, as plain functions of the data, so it can be tested without the network.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SITE = 'https://moveinfra.eu';
const CLOUDS = { aws: 'AWS', gcp: 'Google Cloud', azure: 'Azure', digitalocean: 'DigitalOcean' };
const TARGETS = { upcloud: 'UpCloud (Finland)', scaleway: 'Scaleway (France)', hetzner: 'Hetzner (Germany)', ovhcloud: 'OVHcloud (France)' };
const CLASS = { portable: 'portable', moderate: 'moderate effort', hard: 'hard to move' };
const WEIGHT = { portable: 1, moderate: 0.5, hard: 0 };
const DATA_ACT =
  'EU Data Act (Regulation (EU) 2023/2854), Art. 29: switching charges, including data egress for the switch, are capped ' +
  'at direct costs until 12 January 2027 and banned from 12 January 2027. ' +
  `Explainer: ${SITE}/eu-data-act-switching-fees/`;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);
// Words in many product names ("Google Cloud Storage", "Azure Functions") that would match everything.
const GENERIC = new Set(['aws', 'amazon', 'google', 'gcp', 'cloud', 'azure', 'microsoft', 'digitalocean', 'service', 'managed', 'the']);
const label = (cloud, service) => (service.toLowerCase().startsWith(CLOUDS[cloud].toLowerCase()) ? service : `${CLOUDS[cloud]} ${service}`);

// --- find_eu_alternative -------------------------------------------------------------------------------------------

export function findAlternative(map, rules, service, cloud) {
  const all = words(service);
  const q = all.filter((w) => !GENERIC.has(w)).length ? all.filter((w) => !GENERIC.has(w)) : all;
  cloud ??= { aws: 'aws', amazon: 'aws', google: 'gcp', gcp: 'gcp', azure: 'azure', microsoft: 'azure', digitalocean: 'digitalocean' }[all.find((w) => GENERIC.has(w) && w !== 'cloud')];
  if (q.length === 0) return 'Name a service, for example "S3", "RDS", "EKS" or "Cloud Run".';
  const hits = (text) => { const w = words(text); return q.filter((t) => w.includes(t)).length; };

  // Service-level rules (lock-in scanner) say how hard the move is and what replaces it.
  const ruleHits = rules.rules
    .filter((r) => !r.group && (!cloud || r.cloud === cloud))
    .map((r) => ({ r, score: hits(`${r.service} ${r.id.replace(/[.-]/g, ' ')} ${(r.sdk ?? []).join(' ')}`) }))
    .filter((x) => x.score === q.length)
    .slice(0, 3)
    .map((x) => x.r);

  // Capabilities (EU Cloud Map) name the product on each EU cloud.
  const capIds = new Set(ruleHits.map((r) => r.capability).filter(Boolean));
  const caps = map.capabilities.filter((c) => {
    if (capIds.has(c.id)) return true;
    const text = `${c.id} ${c.label} ${Object.entries(c.sources).filter(([k]) => !cloud || k === cloud).map(([, v]) => v.product).join(' ')}`;
    return hits(text) === q.length;
  });

  if (ruleHits.length === 0 && caps.length === 0) {
    return `No match for "${service}". Capabilities covered: ${map.capabilities.map((c) => c.label).join(', ')}. ` +
      `Full map: ${SITE}/eu-cloud-map/`;
  }
  const out = [];
  for (const r of ruleHits) {
    out.push(`## ${label(r.cloud, r.service)}: ${CLASS[r.class]}`, `Replace with: ${r.replacement}`, '');
  }
  for (const c of caps) {
    out.push(`## ${c.label}`);
    out.push('Today: ' + Object.entries(c.sources).filter(([, v]) => v?.product).map(([k, v]) => label(k, v.product)).join('; '));
    for (const [k, t] of Object.entries(c.targets)) {
      out.push(`- ${TARGETS[k] ?? k}: ${t.product ?? 'no direct product'}${t.notes ? ` (${t.notes})` : ''}, migration ${t.migration}`);
    }
    out.push('');
  }
  out.push(`Source: EU Cloud Map by MoveInfra (CC BY 4.0), ${SITE}/eu-cloud-map/`);
  return out.join('\n');
}

// --- compare_eu_cloud_prices ---------------------------------------------------------------------------------------

export function comparePrices(prices, basket) {
  const names = Object.fromEntries(prices.providers.map((p) => [p.id, `${p.name}${p.euOwned ? ' (EU-owned)' : ''}`]));
  const pick = basket ? prices.baskets.filter((b) => norm(`${b.id} ${b.label}`).includes(norm(basket))) : prices.baskets;
  if (pick.length === 0) return `No basket matches "${basket}". Baskets: ${prices.baskets.map((b) => b.label).join('; ')}`;
  const out = [`EU cloud list prices, EUR per month excl. VAT, generated ${prices.generated}.`, ''];
  for (const b of pick) {
    out.push(`## ${b.label}`);
    const rows = Object.entries(b.prices).filter(([, v]) => v && v.monthly != null).sort((x, y) => x[1].monthly - y[1].monthly);
    for (const [id, v] of rows) out.push(`- ${names[id] ?? id}: €${v.monthly.toFixed(2)}${v.detail ? ` (${v.detail})` : ''}`);
    out.push('');
  }
  out.push('Method: ' + prices.method.join(' '));
  out.push(`Source: EU Cloud Price Index by MoveInfra, ${SITE}/eu-cloud-prices/ (every number links to its price page or API)`);
  return out.join('\n');
}

// --- estimate_cloud_exit_fees --------------------------------------------------------------------------------------

export function egressCost(egress, gb) {
  let rest = Math.max(0, gb - (egress.freeGBPerMonth ?? 0));
  let cost = 0;
  for (const t of egress.tiers) {
    if (rest <= 0) break;
    const size = t.toGB == null ? rest : Math.min(rest, t.toGB - t.fromGB);
    cost += size * t.perGB;
    rest -= size;
  }
  return cost;
}

export function exitFees(exit, provider, gb) {
  const p = exit.providers[provider];
  if (!p) return `Unknown provider "${provider}". Use one of: ${Object.keys(exit.providers).join(', ')}.`;
  const raw = egressCost(p.egress, gb);
  const eur = p.egress.currency === 'USD' ? raw / exit.usdPerEur : raw;
  const out = [
    `## Moving ${gb.toLocaleString('en')} GB out of ${p.name}`,
    `List-price egress: €${eur.toFixed(0)}` + (p.egress.currency === 'USD' ? ` ($${raw.toFixed(0)} at ${exit.usdPerEur} USD/EUR, ECB ${exit.fxDate})` : '') +
      `. Free allowance ${p.egress.freeGBPerMonth ?? 0} ${p.egress.unit}/month; tiers from ${p.egress.source}`,
    '',
    `Exit program: ${p.exitProgram.summary}`,
    ...(p.exitProgram.conditions ?? []).map((c) => `- ${c}`),
    '',
    DATA_ACT,
    '',
    `Checked ${exit.checked}. Calculator and Data Act switching notice: ${SITE}/cloud-exit-fees/`,
  ];
  return out.join('\n');
}

// --- scan_terraform_lock_in ----------------------------------------------------------------------------------------

const PREFIX = { aws_: 'aws', google_: 'gcp', azurerm_: 'azure', digitalocean_: 'digitalocean' };
const cloudOf = (type) => Object.entries(PREFIX).find(([p]) => type.startsWith(p))?.[1];
const globRe = (g) => new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

function compile(rules) {
  return rules.rules.flatMap((r) => (r.terraform ?? []).map((g) => ({
    r, re: globRe(g), exact: !g.includes('*'), literal: g.replace(/\*/g, '').length,
    body: r.terraform_body?.map((b) => new RegExp(b)),
  })));
}

// Same precedence as the scanner: a body condition that matches wins, then an exact pattern, then the longest one.
function match(patterns, cloud, type, body) {
  let best;
  for (const p of patterns) {
    if (p.r.cloud !== cloud || !p.re.test(type)) continue;
    if (p.body && !p.body.some((re) => re.test(body))) continue;
    const better = !best || (!!p.body !== !!best.body ? !!p.body : p.exact !== best.exact ? p.exact : p.literal > best.literal);
    if (better) best = p;
  }
  return best?.r;
}

function tfFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.terraform' || name === 'node_modules' || name.startsWith('.git')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) tfFiles(p, out);
    else if (name.endsWith('.tf')) out.push(p);
  }
  return out;
}

export function scanTerraform(rules, root) {
  const files = statSync(root).isDirectory() ? tfFiles(root) : [root];
  const patterns = compile(rules);
  const found = new Map(); // rule id -> { rule, types:Set, count }
  const unknown = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const blocks = [...src.matchAll(/^(resource|data)\s+"([a-z0-9_]+)"\s+"[^"]*"\s*\{/gm)];
    blocks.forEach((m, i) => {
      const type = m[2];
      const cloud = cloudOf(type);
      if (!cloud) return;
      const body = src.slice(m.index, blocks[i + 1]?.index ?? src.length);
      const rule = match(patterns, cloud, type, body);
      if (!rule) { unknown.set(type, (unknown.get(type) ?? 0) + 1); return; }
      const e = found.get(rule.id) ?? { rule, types: new Set(), count: 0 };
      e.types.add(type); e.count++;
      found.set(rule.id, e);
    });
  }
  if (found.size === 0 && unknown.size === 0) {
    return `No AWS, Google Cloud, Azure or DigitalOcean resources found in ${files.length} .tf file(s) under ${root}.`;
  }
  const list = [...found.values()].sort((a, b) => WEIGHT[a.rule.class] - WEIGHT[b.rule.class] || b.count - a.count);
  const score = list.length ? Math.round((100 * list.reduce((s, e) => s + WEIGHT[e.rule.class], 0)) / list.length) : null;
  const out = [
    `## EU portability score: ${score ?? 'n/a'}/100 (${files.length} .tf files, ${list.length} services)`,
    '100 = everything has a drop-in EU equivalent; 0 = every service needs a rewrite.',
    '',
  ];
  for (const e of list) {
    out.push(`- **${label(e.rule.cloud, e.rule.service)}**: ${CLASS[e.rule.class]} (${e.count}× ${[...e.types].join(', ')})`);
    out.push(`  Replace with: ${e.rule.replacement}`);
  }
  if (unknown.size) out.push('', `Not in the catalogue yet: ${[...unknown.keys()].join(', ')}`);
  out.push('',
    `Paths are relative to ${root}: ${files.slice(0, 5).map((f) => relative(root, f) || f).join(', ')}${files.length > 5 ? ', ...' : ''}`,
    'This is a quick scan of Terraform only. The full scanner also reads CloudFormation, SAM, Serverless and SDK imports: ' +
    'https://github.com/moveinfra/cloud-lock-in-scanner',
    `Migration routes and help: ${SITE}/`);
  return out.join('\n');
}
