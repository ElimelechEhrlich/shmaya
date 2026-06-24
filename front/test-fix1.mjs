// בדיקת Fix 1 — applyBusinessRules בשמירה
import { chromium } from './node_modules/playwright/index.mjs';

const BASE = 'http://localhost:5174';
const TS = Date.now(); // id ייחודי לכל ריצה

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

async function fillRequiredFields(page, suffix) {
    await page.locator('input[name="fullName"]').fill(`בדיקה ${suffix}`);
    await page.locator('input[name="identityId"]').fill(String(TS).slice(-9) + suffix);
    await page.locator('input[name="phoneNumber"]').fill('050-' + String(TS).slice(-7));
    await page.locator('input[name="email"]').fill(`test${TS}${suffix}@test.com`);
    await page.locator('input[name="businessName"]').fill(`עסק ${suffix}`);
    await page.locator('input[name="businessID"]').fill(`BIZ-${TS}-${suffix}`);
    await page.locator('input[name="openingDate"]').fill('2024-01-01');
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();

    // ══════════════════════════════════════════════════════════════
    // בדיקה 1 — פטור: formData.isVatActive=true → DB צריך false
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== בדיקה 1: פטור + VAT → DB צריך false ===');
    const p1 = await ctx.newPage();
    await login(p1);
    await p1.goto(BASE + '/admin/customers/new');
    await p1.waitForTimeout(1500);

    await fillRequiredFields(p1, '1');

    // שלב א: בחר "מורשה" — מאפשר VAT
    await p1.locator('select[name="businessType"]').selectOption('מורשה');
    await p1.waitForTimeout(400);

    // שלב ב: מצא checkbox של מע"מ — כל ה-ToggleHeaders הם label>input[type=checkbox]
    // "מס הכנסה" הוא הראשון, "מע"מ" הוא השני בתוך אותה div
    const allToggles = p1.locator('label').filter({ hasText: /מע/ }).locator('input[type="checkbox"]');
    const vatCount = await allToggles.count();
    console.log('checkbox-ים עם "מע" בתוכן:', vatCount);
    if (vatCount > 0) {
        await allToggles.first().check();
        await p1.waitForTimeout(300);
        console.log('VAT סומן כ-true');
    } else {
        console.log('⚠️ לא נמצא toggle מע"מ — ממשיך בלעדיו');
    }

    // שלב ג: שנה ל-"פטור" — VAT נעלם מ-UI, formData.isVatActive נשאר true בזיכרון
    await p1.locator('select[name="businessType"]').selectOption('פטור');
    await p1.waitForTimeout(400);
    const vatAfter = await p1.locator('label').filter({ hasText: /מע/ }).count();
    console.log('VAT toggle גלוי אחרי פטור:', vatAfter > 0, '(מצופה: false)');

    // שלב ד: שמירה — אם isVatActive עדיין true בזיכרון, hasAuthorities=true → אין confirm
    // applyBusinessRules ידאג לכבות VAT
    const dialogs1 = [];
    p1.on('dialog', async dlg => {
        dialogs1.push(`[${dlg.type()}] ${dlg.message()}`);
        dlg.type() === 'confirm' ? await dlg.accept() : await dlg.accept();
    });

    await p1.locator('button[type="submit"]').click();
    await p1.waitForTimeout(3000);
    console.log('Dialogs בבדיקה 1:', dialogs1.length ? dialogs1 : '(ללא dialogs)');
    console.log('URL אחרי שמירה:', p1.url());

    await browser.close();
    console.log('\n=== סיום playwright — שאילתת DB תרוץ בנפרד ===');
})();
