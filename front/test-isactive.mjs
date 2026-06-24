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

    // מלא שדות חובה
    await page.locator('input[name="fullName"]').fill('בדיקה פטור isActive');
    await page.locator('input[name="identityId"]').fill(String(TS).slice(-9));
    await page.locator('input[name="phoneNumber"]').fill('050-' + String(TS).slice(-7));
    await page.locator('input[name="email"]').fill(`patoor${TS}@test.com`);
    await page.locator('input[name="businessName"]').fill('עסק פטור בדיקה');
    await page.locator('input[name="businessID"]').fill(`BIZ-P-${TS}`);
    await page.locator('input[name="openingDate"]').fill('2024-01-01');

    // שלב א: "מורשה" → VAT toggle מופיע → מסמן VAT
    await page.locator('select[name="businessType"]').selectOption('מורשה');
    await page.waitForTimeout(400);
    const vatCb = page.locator('label').filter({ hasText: /מע/ }).locator('input[type="checkbox"]');
    if (await vatCb.count() > 0) {
        await vatCb.first().check();
        console.log('VAT סומן');
    }

    // שלב ב: שנה ל-"פטור"
    await page.locator('select[name="businessType"]').selectOption('פטור');
    await page.waitForTimeout(400);

    // שמירה — confirm אמור להופיע כי hasActiveAuthorities יהיה true לפני applyBusinessRules
    // (formData.isVatActive=true עדיין), אך isActive אמור להיות false אחרי הקסקד
    const dialogs = [];
    page.on('dialog', async dlg => {
        dialogs.push(`[${dlg.type()}] ${dlg.message().slice(0, 60)}`);
        await dlg.accept();
    });

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    console.log('Dialogs:', dialogs.length ? dialogs : '(ללא)');
    console.log('URL:', page.url());
    await browser.close();
    console.log('playwright סיים');
})();
