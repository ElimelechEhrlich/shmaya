// בדיקה 2 — confirm dialog כשאין רשויות
import { chromium } from './node_modules/playwright/index.mjs';
const BASE = 'http://localhost:5174';
const TS = Date.now();

async function login(page) {
    await page.goto(BASE + '/');
    await page.waitForTimeout(1500);
    if (page.url().includes('/admin')) return;
    const sel = await page.locator('select').count();
    if (sel > 0) await page.locator('select').first().selectOption({ label: '👤 מוישי' });
    else await page.locator('input').first().fill('מוישי');
    await page.locator('button').first().click();
    await page.waitForTimeout(1500);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    await page.goto(BASE + '/admin/customers/new');
    await page.waitForTimeout(1500);

    // מלא שדות חובה — ללא שום רשות פעילה
    await page.locator('input[name="fullName"]').fill('בדיקה ללא רשויות');
    await page.locator('input[name="identityId"]').fill(String(TS).slice(-9));
    await page.locator('input[name="phoneNumber"]').fill('050-' + String(TS).slice(-7));
    await page.locator('input[name="email"]').fill(`noauth${TS}@test.com`);
    await page.locator('input[name="businessName"]').fill('עסק ללא רשויות');
    await page.locator('input[name="businessID"]').fill(`BIZ-NA-${TS}`);
    await page.locator('input[name="openingDate"]').fill('2024-01-01');
    await page.locator('select[name="businessType"]').selectOption('אחר');
    // *** לא מפעילים שום toggle — isIncomeTaxActive=false, isVatActive=false, isInsuranceActive=false ***

    let confirmSeen = false;
    let confirmText = '';
    page.on('dialog', async dlg => {
        console.log(`Dialog [${dlg.type()}]: ${dlg.message().substring(0, 80)}`);
        if (dlg.type() === 'confirm') {
            confirmSeen = true;
            confirmText = dlg.message();
            await dlg.dismiss(); // מבטלים — לא נשמור
        } else {
            await dlg.accept();
        }
    });

    console.log('לוחץ שמור...');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);

    const urlAfter = page.url();
    console.log('URL אחרי לחיצה:', urlAfter, '(צריך להישאר /customers/new)');
    console.log(`confirm הופיע: ${confirmSeen}`);
    if (confirmSeen) {
        console.log('תוכן confirm:', confirmText.substring(0, 100));
        console.log('תוצאה: ✅ PASS — confirm dialog הופיע לפני השמירה');
    } else {
        console.log('תוצאה: ❌ FAIL — confirm לא הופיע!');
    }
    await browser.close();
})();
