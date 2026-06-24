import fs from "fs";
import path from "path";
const envPath = path.resolve(process.cwd(), '.env');
const env = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim();
  return acc;
}, {});
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing env');
const fetchJson = async (url) => {
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
};
const checks = [
  ['income tax active with null rep type', 'customers?is_income_tax_active=eq.true&income_tax_rep_type=is.null&select=count'],
  ['income tax active with null prepayment', 'customers?is_income_tax_active=eq.true&income_tax_prepayment=is.null&select=count'],
  ['vat active with null vat_is_new_case', 'customers?is_vat_active=eq.true&vat_is_new_case=is.null&select=count'],
  ['insurance active with null insurance_prepayment', 'customers?is_insurance_active=eq.true&insurance_prepayment=is.null&select=count'],
];
for (const [label, query] of checks) {
  const url = `${SUPABASE_URL}/rest/v1/${query}`;
  const data = await fetchJson(url);
  console.log(label, data[0]?.count ?? 0);
}
