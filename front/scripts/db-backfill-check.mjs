import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const env = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim();
  return acc;
}, {});

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing Supabase env values');

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return JSON.parse(text);
}

async function getCount(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}&select=count`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || data.length === 0) return 0;
  return Number(data[0].count ?? 0);
}

async function getCustomerSamples() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/customers`);
  url.searchParams.set('select', 'id,full_name,is_income_tax_active,is_vat_active,is_insurance_active,created_at');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '100');
  return await fetchJson(url.toString());
}

async function getCustomerDetail(id) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/customers`);
  url.searchParams.set('select', '*,business_details(*),income_tax_cases(*),vat_cases(*),insurance_cases(*),payment_details(*)');
  url.searchParams.set('id', `eq.${id}`);
  const data = await fetchJson(url.toString());
  return data[0] ?? null;
}

async function getSampleByCriteria(criteria) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/customers`);
  url.searchParams.set('select', 'id,full_name,is_income_tax_active,is_vat_active,is_insurance_active,created_at');
  if (criteria === 'all') {
    url.searchParams.set('is_income_tax_active', 'eq.true');
    url.searchParams.set('is_vat_active', 'eq.true');
    url.searchParams.set('is_insurance_active', 'eq.true');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '5');
    return await fetchJson(url.toString());
  } else if (criteria === 'one') {
    url.searchParams.set('or', '(is_income_tax_active.eq.true,is_vat_active.eq.true,is_insurance_active.eq.true)');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '20');
    const data = await fetchJson(url.toString());
    return data.filter((c) => [c.is_income_tax_active, c.is_vat_active, c.is_insurance_active].filter(Boolean).length === 1).slice(0, 5);
  } else if (criteria === 'none') {
    url.searchParams.set('is_income_tax_active', 'eq.false');
    url.searchParams.set('is_vat_active', 'eq.false');
    url.searchParams.set('is_insurance_active', 'eq.false');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', '20');
    const data = await fetchJson(url.toString());
    return data.filter((c) => c.id !== '00000000-0000-0000-0000-000000000000').slice(0, 5);
  }
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '5');
  return await fetchJson(url.toString());
}

async function getRecentNonOffice() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/customers`);
  url.searchParams.set('select', 'id,full_name,is_income_tax_active,is_vat_active,is_insurance_active,created_at');
  url.searchParams.set('id', 'not.eq.00000000-0000-0000-0000-000000000000');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '1');
  const data = await fetchJson(url.toString());
  return data[0] ?? null;
}

async function run() {
  console.log('# 1: Count comparisons');
  const incomeCount = await getCount('income_tax_cases');
  const incomeCustomers = await getCount('customers', 'is_income_tax_active=eq.true');
  const vatCount = await getCount('vat_cases');
  const vatCustomers = await getCount('customers', 'is_vat_active=eq.true');
  const insuranceCount = await getCount('insurance_cases');
  const insuranceCustomers = await getCount('customers', 'is_insurance_active=eq.true');
  console.log({ incomeCount, incomeCustomers, vatCount, vatCustomers, insuranceCount, insuranceCustomers });

  console.log('# 2: Select samples');
  const allActive = await getSampleByCriteria('all');
  const oneActive = await getSampleByCriteria('one');
  const noneActive = await getSampleByCriteria('none');
  const recentNonOffice = await getRecentNonOffice();
  console.log('allActive:', allActive);
  console.log('oneActive:', oneActive);
  console.log('noneActive:', noneActive);
  console.log('recentNonOffice:', recentNonOffice);

  const ids = [
    ...(allActive.slice(0, 2).map((c) => c.id) ?? []),
    ...(oneActive.slice(0, 1).map((c) => c.id) ?? []),
    ...(noneActive.slice(0, 1).map((c) => c.id) ?? []),
    ...(recentNonOffice ? [recentNonOffice.id] : []),
  ];
  const uniqueIds = [...new Set(ids)];
  for (const id of uniqueIds) {
    const detail = await getCustomerDetail(id);
    console.log('DETAIL', id, detail);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
