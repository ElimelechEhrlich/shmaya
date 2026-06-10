import { test, expect } from '@playwright/test'

test('בדיקת כניסה לדף הבית ותצוגת כותרת', async ({ page }) => {
  await page.goto('/'); 
  const header = page.locator('h1');
  await expect(header).toBeVisible();
});

test('ממלא פרטים ללקוח חדש', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('textbox', { name: 'שם משתמש' }).click();
  await page.getByRole('textbox', { name: 'שם משתמש' }).fill('מוישי');
  await page.getByRole('button', { name: 'כניסה למערכת' }).click();
  await page.waitForTimeout(1000) // המתנה לטעינת הדף הבא
  await page.getByRole('link', { name: 'לקוחות' }).click();
  await page.getByRole('button', { name: '+ לקוח חדש' }).click();
  await page.locator('input[name="fullName"]').click();
  await page.locator('input[name="fullName"]').fill('יגחעחכעי');
  await page.locator('input[name="identityId"]').click();
  await page.locator('input[name="identityId"]').fill('אטורט');
  await page.locator('input[name="phoneNumber"]').click();
  await page.locator('input[name="phoneNumber"]').fill('ראוטאטו');
  await page.locator('input[name="address"]').click();
  await page.locator('input[name="address"]').fill('טאוטאואר');
  await page.locator('input[name="email"]').click();
  await page.locator('input[name="email"]').fill('אטורוטאו');
  await page.locator('input[name="businessName"]').dblclick();
  await page.locator('input[name="businessName"]').fill('אוטן');
  await page.locator('input[name="businessID"]').dblclick();
  await page.locator('input[name="businessID"]').fill('וטרןרטון');
  await page.locator('input[name="openingDate"]').fill('2026-06-01');
  await page.getByRole('combobox').selectOption('זעיר');
  await page.locator('input[name="occupation"]').click();
  await page.locator('input[name="occupation"]').fill('וטןאטו');
  await page.locator('textarea[name="businessDescription"]').click();
  await page.locator('textarea[name="businessDescription"]').fill('וטאןוטןוטן');
  await page.getByRole('checkbox', { name: 'טיפול במס הכנסה' }).check();
  await page.getByRole('checkbox', { name: 'טיפול במע״מ' }).check();
  




  await page.locator('button[type="submit"]').click()
  await page.getByText('לקוחות').click()
  await page.waitForTimeout(1000) // המתנה לטעינת רשימת הלקוחות
  await page.getByRole('button', { name: 'לקוח חדש' }).click()
  await page.waitForTimeout(1000) // המתנה לטעינת רשימת הלקוחות
  await page.goto('http://localhost:5173/');

  await page.fill('input[name="firstName"]', 'שמאי')
  await page.fill('input[name="lastName"]', 'דוגמה')
  await page.fill('input[name="phoneNumber"]', '050-1234567')
  await page.fill('input[name="address"]', 'רחוב הדוגמה 1')
  await page.fill('input[name="email"]', 'shmaya@example.com')

  await page.fill('input[name="businessName"]', 'עסק שלי')
  await page.fill('input[name="businessID"]', '123456789')
  await page.fill('input[name="openingDate"]', '2024-01-01')
  await page.selectOption('select[name="businessType"]', 'זעיר')

  await page.getByLabel('טיפול במס הכנסה').click()
  await page.selectOption('select[name="newItCase"]', 'true')

  await page.click('button[type="submit"]')
})