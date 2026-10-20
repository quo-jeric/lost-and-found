import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  cleanupFixture,
  createCatalogReferences,
  createItemFixture,
  createStaffFixture,
  getTestPool,
} from '../helpers/test-database.js';

test.describe('public catalog claim journey', () => {
  let pool;
  let staff;
  let itemId;
  let claimantEmail;
  let claimId;
  let itemTitle;

  test.beforeAll(async () => {
    pool = await getTestPool();
    staff = await createStaffFixture(pool);
    const references = await createCatalogReferences(pool);
    itemTitle = `Browser claim ${randomUUID().slice(0, 8)}`;
    itemId = await createItemFixture(pool, {
      userId: staff.userId,
      categoryId: references.categoryId,
      locationId: references.locationId,
      title: itemTitle,
    });
    claimantEmail = `browser-${randomUUID().slice(0, 8)}@example.test`;
  });

  test.afterAll(async () => {
    if (pool) {
      await cleanupFixture(pool, { userId: staff?.userId, itemId });
      await pool.end();
    }
  });

  test('finds an item, submits an ownership claim, and persists it', async ({ page }) => {
    await page.goto('/');
    const anonymousClaimsStatus = await page.evaluate(async () => {
      const response = await fetch('/api/v1/claims');
      return response.status;
    });
    expect(anonymousClaimsStatus).toBe(401);

    const itemCard = page.locator(`#card-item-${itemId}`);
    await expect(itemCard).toBeVisible();
    await itemCard.click();
    await expect(page.locator('#side-item-title')).toHaveText(itemTitle);

    await page.locator('#btn-side-contact-guard').click();
    const claimDialog = page.locator('#claim-modal-dialog');
    await expect(claimDialog).toBeVisible();
    await expect(page.locator('#modal-claim-item-title')).toHaveText(itemTitle);

    await page.locator('#claimant-name').fill('Browser Test Claimant');
    await page.locator('#claimant-email').fill(claimantEmail);
    await page.locator('#claim-proof-description').fill('Distinctive mark verified in browser test.');

    const claimResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/claims') &&
        response.request().method() === 'POST',
    );
    await page.locator('#btn-submit-claim-modal').click();
    const claimResponse = await claimResponsePromise;
    expect(claimResponse.status()).toBe(201);
    const responseBody = await claimResponse.json();
    claimId = responseBody.data.claim_id;

    await expect(claimDialog).not.toBeVisible();
    await expect(page.locator('#toast-container')).toContainText('Claim submitted!');

    const [claimRows] = await pool.execute(
      `SELECT claim_id, item_id, claimant_name, claimant_email,
              proof_description, claim_status
       FROM claims
       WHERE claim_id = ?`,
      [claimId],
    );
    expect(claimRows).toHaveLength(1);
    expect(claimRows[0]).toMatchObject({
      claim_id: claimId,
      item_id: itemId,
      claimant_name: 'Browser Test Claimant',
      claimant_email: claimantEmail,
      proof_description: 'Distinctive mark verified in browser test.',
      claim_status: 'pending',
    });
  });
});
