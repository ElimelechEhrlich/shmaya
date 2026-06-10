import { test, expect } from '@playwright/test';

const mockCustomers = [
    { fullName: 'אלימלך ארליך', email: 'ee525566@gmail.com', businessName: 'אלימלך ארליך פיתוח', businessType: 'מורשה', isInsurance: true, isIncomeTax: true, isVat: true, employsWorkers: 'yes', needsDeductions: true, setupFee: '1000', monthlyFee: '550', comments: 'הלקוח חדש, לדאוג שיקבל שירות טוב', directDebit: 'כן' },
    { fullName: 'ישראל כהן', email: 'israel@test.co.il', businessName: 'כהן ייעוץ מס', businessType: 'פטור', isInsurance: true, isIncomeTax: true, isVat: false, employsWorkers: 'no', needsDeductions: false, setupFee: '500', monthlyFee: '350', comments: 'עוסק פטור קלאסי', directDebit: 'לא' },
    { fullName: 'חני ויס', email: 'chani@design.com', businessName: 'חני עיצובים', businessType: 'פטור', isInsurance: false, isIncomeTax: true, isVat: false, employsWorkers: 'no', needsDeductions: false, setupFee: '400', monthlyFee: '300', comments: 'בלי ביטוח לאומי ובלי מעמ', directDebit: 'כן' },
    { fullName: 'יוסי לוי', email: 'yossi@delivery.com', businessName: 'לוי שליחויות', businessType: 'מורשה', isInsurance: true, isIncomeTax: true, isVat: true, employsWorkers: 'yes', needsDeductions: false, setupFee: '800', monthlyFee: '600', comments: 'מעסיק עובדים אבל ללא צורך בתיק ניכויים כרגע', directDebit: 'לא' },
    { fullName: 'חברת פרו-טק בעמ', email: 'info@protech.com', businessName: 'פרו-טק פתרונות תוכנה', businessType: 'חברה בע"מ', isInsurance: true, isIncomeTax: true, isVat: true, employsWorkers: 'yes', needsDeductions: true, setupFee: '2500', monthlyFee: '1200', comments: 'חברה גדולה, דגש על משימות שכר', directDebit: 'כן' },
    { fullName: 'משה שפירא', email: 'moshe@shapiro.com', businessName: 'שפירא רהיטים', businessType: 'מורשה', isInsurance: true, isIncomeTax: false, isVat: true, employsWorkers: 'no', needsDeductions: false, setupFee: '900', monthlyFee: '500', comments: 'תיק מס הכנסה מטופל במקום אחר, רק מעמ וביטוח לאומי', directDebit: 'לא' },
    { fullName: 'רחל אהרוני', email: 'rachel@law.com', businessName: 'אהרוני משרד עורכי דין', businessType: 'מורשה', isInsurance: true, isIncomeTax: true, isVat: true, employsWorkers: 'yes', needsDeductions: true, setupFee: '1200', monthlyFee: '700', comments: 'לפתוח את כל המשימות האוטומטיות', directDebit: 'כן' },
    { fullName: 'דוד מזרחי', email: 'david@gold.com', businessName: 'מזרחי תכשיטים', businessType: 'פטור', isInsurance: true, isIncomeTax: true, isVat: false, employsWorkers: 'no', needsDeductions: false, setupFee: '450', monthlyFee: '320', comments: 'עסק ביתי קטן', directDebit: 'לא' },
    { fullName: 'חברת אלפא נכסים', email: 'office@alpha.com', businessName: 'אלפא השקעות', businessType: 'חברה בע"מ', isInsurance: false, isIncomeTax: true, isVat: true, employsWorkers: 'no', needsDeductions: false, setupFee: '2000', monthlyFee: '950', comments: 'חברת החזקות ללא עובדים', directDebit: 'כן' },
    { fullName: 'מלכי שטרן', email: 'malki@photo.com', businessName: 'מלכי צילום מקצועי', businessType: 'פטור', isInsurance: true, isIncomeTax: true, isVat: false, employsWorkers: 'no', needsDeductions: false, setupFee: '500', monthlyFee: '350', comments: 'רישום מהיר', directDebit: 'לא' }
];

test('הקמת 10 לקוחות אוטומטית פעם אחר פעם לפי מבנה הקלטה', async ({ page }) => {
    // נגדיל את ה-Timeout ל-120 שניות כדי לתת ל-Supabase מספיק זמן לעבד 10 לקוחות
    test.setTimeout(120000);

    // האזנה גלובלית ל-Alertים של הדפדפן - יאשר אוטומטית כל פופ-אפ של "הלקוח נוסף!"
    page.on('dialog', async dialog => {
        console.log(`[Alert] הודעת שרת: ${dialog.message()}`);
        await dialog.accept().catch(() => { });
    });

    // 1. שלב לוגין חד פעמי בתחילת הריצה
    await page.goto('http://localhost:5173/');
    await page.getByRole('textbox', { name: 'שם משתמש' }).click();
    await page.getByRole('textbox', { name: 'שם משתמש' }).fill('מוישי');
    await page.getByRole('button', { name: 'כניסה למערכת' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'לקוחות' }).click();


    // וידוא קצר שהלוגין הצליח ונחתנו בדף הבית

    // לולאת ההזרקה של 10 הלקוחות
    for (let i = 0; i < mockCustomers.length; i++) {
        const customer = mockCustomers[i];
        const uniqueId = Math.floor(100000000 + Math.random() * 900000000).toString();
        console.log(`[Seeding] מריץ לקוח ${i + 1}/10: ${customer.fullName} (מזהה ייחודי: ${uniqueId})`);

        // פתרון חסין: במקום לסמוך על ה-Redirect, אנחנו מנווטים אקטיבית לדף ההוספה בכל סיבוב!
        await page.getByRole('button', { name: '+ לקוח חדש' }).click();

        // 2. מילוי פרטים אישיים
        await page.locator('input[name="fullName"]').fill(customer.fullName);
        await page.locator('input[name="identityId"]').fill(uniqueId);
        await page.locator('input[name="phoneNumber"]').fill('0506569203');
        await page.locator('input[name="address"]').fill('פחד יצחק 17 ביתר עילית');
        await page.locator('input[name="email"]').fill(customer.email);

        // 3. מילוי פרטי עסק
        await page.locator('input[name="businessName"]').fill(customer.businessName);
        await page.locator('input[name="businessID"]').fill(uniqueId);
        await page.locator('input[name="openingDate"]').fill('2026-04-01');
        await page.getByRole('combobox').selectOption(customer.businessType);
        await page.locator('input[name="occupation"]').fill('פיתוח תוכנה');
        await page.locator('textarea[name="businessDescription"]').fill('פיתוח תוכנה');

        // 4. טיפול בביטוח לאומי
        if (customer.isInsurance) {
            await page.getByRole('checkbox', { name: 'טיפול בביטוח לאומי' }).check();
            await page.locator('select[name="newInsuranceCase"]').selectOption('true');
            await page.locator('input[name="insurancePrepayment"]').fill('450');
            await page.locator('input[name="workHours"]').fill('150');
        }

        // 5. טיפול במס הכנסה
        if (customer.isIncomeTax) {
            await page.getByRole('checkbox', { name: 'טיפול במס הכנסה' }).check();
            await page.locator('select[name="newItCase"]').selectOption('true');
            await page.locator('input[name="incomeTaxPrepayment"]').fill('2500');
            await page.locator('input[name="annualTurnover"]').fill('250000');
            await page.locator('select[name="repType"]').selectOption('ראשי');
        }

        // 6. טיפול במע"מ (רק עסק מסוג מורשה או חברה רשאי לסמן מע"מ)
        if (customer.isVat && (customer.businessType === 'מורשה' || customer.businessType === 'חברה בע"מ')) {
            await page.getByRole('checkbox', { name: 'טיפול במע״מ' }).check();
            await page.locator('select[name="newVatCase"]').selectOption('true');
        }

        // 7. תלויות עובדים ותיק ניכויים (שימוש בלוקייטור גנרי בטוח כמו בהקלטה שלך)
        const employsWorkersSelect = page.locator('select[name="employsWorkers"]')
        if (await employsWorkersSelect.isVisible()) {
      console.log(`   -> שדה העסקת עובדים גלוי עבור סוג עסק "${customer.businessType}", ממלא נתונים...`);
      
      if (customer.employsWorkers === 'yes') {
        await employsWorkersSelect.selectOption('yes');
        
        // סימון תיק ניכויים במידת הצורך
        const deductionsCheckbox = page.locator('input[type="checkbox"][name="needsDeductionsFile"]');
        if (await deductionsCheckbox.isVisible()) {
          if (customer.needsDeductions) {
            await deductionsCheckbox.check();
          } else {
            await deductionsCheckbox.uncheck();
          }
        }
      } else {
        await employsWorkersSelect.selectOption('no');
      }
    } else {
      console.log(`   -> שדה העסקת עובדים מוסתר עבור סוג עסק "${customer.businessType}" (מדלג לפי חוקי העסק)`);
    }
        // 8. מילוי תשלומים למשרד והערות
        await page.locator('input[name="setupFee"]').fill(customer.setupFee);
        await page.locator('input[name="monthlyFee"]').fill(customer.monthlyFee);
        await page.getByRole('button', { name: customer.directDebit }).click();
        await page.locator('textarea[name="comments"]').fill(customer.comments);

        // 9. לחיצה על שמירה והמתנה קלה לעיבוד ב-DB
        await page.getByRole('button', { name: 'שמור לקוח והפעל אוטומציית משימות' }).click();

        // המתנה קצרצרה של שנייה כדי לוודא ש-Supabase סיים לרשום את כל הטבלאות לפני הסיבוב הבא
        await page.waitForTimeout(1500);
    }

    console.log('✨ הסתיים בהצלחה! 10 לקוחות מגוונים הוזנו למערכת.');
});