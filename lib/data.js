// Open data the tools read. Fetched from the public MoveInfra repositories, so answers follow the monthly updates
// without a new release. Each file is cached in memory for an hour.
const RAW = 'https://raw.githubusercontent.com/moveinfra';
export const SOURCES = {
  map: `${RAW}/eu-cloud-map/main/data/eu-cloud-map.json`,
  prices: `${RAW}/eu-cloud-prices/main/data/eu-cloud-prices.json`,
  exit: `${RAW}/cloud-switching-kit/main/data/exit-data.json`,
  rules: `${RAW}/cloud-lock-in-scanner/main/internal/rules/rules.json`,
};

const cache = new Map();
const HOUR = 60 * 60 * 1000;

export async function load(name) {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < HOUR) return hit.data;
  const res = await fetch(SOURCES[name], { headers: { 'user-agent': 'eu-cloud-mcp' } });
  if (!res.ok) throw new Error(`Could not load ${SOURCES[name]}: HTTP ${res.status}`);
  const data = await res.json();
  cache.set(name, { at: Date.now(), data });
  return data;
}
