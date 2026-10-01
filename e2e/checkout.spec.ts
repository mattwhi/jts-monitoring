import { test, expect, Page, Locator } from '@playwright/test';

const PRODUCT_PATH = process.env.JTS_MONITOR_PRODUCT || '';

const fatalPatterns = [
  /critical error on this website/i,
  /fatal error/i,
  /uncaught (error|exception)/i,
  /allowed memory size .* exhausted/i,
];

async function dismissNonEssentialUI(page: Page) {
  // JTS "Join Jasper's Pack" marketing modal can appear after a delay and
  // intercept clicks. Dismiss it explicitly without submitting the form.
  const jtsPopup = page.getByText(/join jasper['’]s pack/i).first();
  if (await jtsPopup.isVisible({ timeout: 1200 }).catch(() => false)) {
    const closeCandidates = [
      page.getByRole('button', { name: /close/i }),
      page.locator('button[aria-label*="close" i]'),
      page.locator('[role="dialog"] button').filter({ hasText: /^[×x]$/i }),
      page.locator('.jts-newsletter-modal button').filter({ hasText: /^[×x]$/i }),
      page.locator('.jts-popup button').filter({ hasText: /^[×x]$/i }),
    ];
    let closed = false;
    for (const candidate of closeCandidates) {
      const first = candidate.first();
      if (await first.isVisible({ timeout: 500 }).catch(() => false)) {
        await first.click({ force: true }).catch(() => {});
        closed = true;
        break;
      }
    }
    if (!closed) await page.keyboard.press('Escape').catch(() => {});
  }

  // Consent UI may also overlay controls. We only dismiss visible UI; the
  // monitor does not change consent choices merely to make the test pass.
  const closeOnly = [
    page.locator('.cmplz-close'),
    page.locator('button[aria-label*="close" i]'),
  ];
  for (const candidate of closeOnly) {
    const first = candidate.first();
    if (await first.isVisible({ timeout: 400 }).catch(() => false)) {
      await first.click({ force: true }).catch(() => {});
    }
  }

  // Wait briefly for overlay transitions, then make sure the JTS modal is gone.
  await page.waitForTimeout(300);
  if (await jtsPopup.isVisible({ timeout: 300 }).catch(() => false)) {
    throw new Error("JTS 'Join Jasper’s Pack' popup could not be dismissed and is blocking the customer journey.");
  }
}

async function keepMarketingPopupClosed(page: Page) {
  // Re-run after navigation because the delayed popup can appear on cart or checkout.
  await dismissNonEssentialUI(page);
  await page.waitForTimeout(1200);
  await dismissNonEssentialUI(page);
}

async function assertHealthyPage(page: Page) {
  const body = await page.locator('body').innerText();
  for (const pattern of fatalPatterns) {
    expect(body, `Production page contained fatal-error text: ${pattern}`).not.toMatch(pattern);
  }
}

async function findAddToBasket(page: Page): Promise<Locator> {
  // Supports classic WooCommerce, custom JTS buttons and block themes.
  const candidates = [
    page.getByRole('button', { name: /add to (basket|cart)/i }),
    page.locator('button.single_add_to_cart_button'),
    page.locator('button[name="add-to-cart"]'),
    page.locator('form.cart button[type="submit"]'),
    page.locator('.single_add_to_cart_button'),
    page.locator('a.add_to_cart_button'),
  ];

  for (const candidate of candidates) {
    const first = candidate.first();
    if (await first.isVisible({ timeout: 1200 }).catch(() => false)) return first;
  }
  throw new Error(`No usable Add to basket/cart control found on ${page.url()}`);
}

async function addStableProductFromShop(page: Page) {
  // JTS exposes direct WooCommerce "Add to basket" links on the shop grid.
  // Monitoring from the grid is more stable than depending on product-page
  // slugs/templates and still exercises WooCommerce's real cart/session flow.
  const response = await page.goto('/shop/', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await dismissNonEssentialUI(page);
  await assertHealthyPage(page);

  const candidates = [
    page.getByRole('link', { name: /add to basket/i }),
    page.locator('a.add_to_cart_button:not(.product_type_variable)'),
    page.locator('a.ajax_add_to_cart'),
    page.locator('a[href*="add-to-cart"]'),
  ];

  let add: Locator | null = null;
  for (const candidate of candidates) {
    const first = candidate.first();
    if (await first.isVisible({ timeout: 1500 }).catch(() => false)) {
      add = first;
      break;
    }
  }

  if (!add) {
    throw new Error('No visible in-stock Add to basket link found on /shop/.');
  }

  await add.click();

  // WooCommerce AJAX may replace the link with "View basket" or update the
  // header/mini-cart. Accept either as proof that the cart operation completed.
  await expect.poll(async () => {
    const viewBasket = await page.getByRole('link', { name: /view basket|view cart/i })
      .count().catch(() => 0);
    const body = await page.locator('body').innerText().catch(() => '');
    const basketCount = /Basket\s+[1-9]\d*/i.test(body);
    return viewBasket > 0 || basketCount;
  }, {
    message: 'WooCommerce did not confirm that the product was added to the basket',
    timeout: 12_000
  }).toBeTruthy();
}

test.describe('Jasper’s Treat Shop production synthetic monitoring', () => {
  test('homepage and shop are healthy @critical', async ({ page }) => {
    let response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await assertHealthyPage(page);

    response = await page.goto('/shop/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await assertHealthyPage(page);
  });

  test('guest can add a product and reach a usable checkout @critical @checkout', async ({ page }) => {
    // Deliberately logged out: this is the customer path that exposed the CAPTCHA issue.
    await addStableProductFromShop(page);
    await keepMarketingPopupClosed(page);

    const checkoutResponse = await page.goto('/checkout/', { waitUntil: 'domcontentloaded' });
    expect(checkoutResponse?.status(), 'Checkout returned a server error').toBeLessThan(500);
    await keepMarketingPopupClosed(page);
    await assertHealthyPage(page);

    expect(
      new URL(page.url()).pathname,
      `Expected checkout but browser ended up at ${page.url()}`
    ).toMatch(/\/checkout\/?$/);

    await expect(
      page.getByText(/please complete the captcha verification/i),
      'Checkout is being blocked by an invisible/broken CAPTCHA'
    ).toHaveCount(0);

    const email = page.locator(
      '#billing_email, input[name="billing_email"], input[type="email"]'
    ).first();
    await expect(email, 'Billing email field did not render').toBeVisible();

    const fillIfPresent = async (selectors: string, value: string) => {
      const el = page.locator(selectors).first();
      if (await el.isVisible({ timeout: 1200 }).catch(() => false)) await el.fill(value);
    };

    await fillIfPresent('#billing_first_name, input[name="billing_first_name"]', 'JTS');
    await fillIfPresent('#billing_last_name, input[name="billing_last_name"]', 'Monitor');
    await fillIfPresent('#billing_address_1, input[name="billing_address_1"]', '1 Test Street');
    await fillIfPresent('#billing_city, input[name="billing_city"]', 'Wakefield');
    await fillIfPresent('#billing_postcode, input[name="billing_postcode"]', 'WF1 1AA');
    await fillIfPresent('#billing_phone, input[name="billing_phone"]', '01924000000');
    await email.fill(process.env.JTS_MONITOR_EMAIL || 'synthetic-monitor@example.invalid');

    await page.waitForTimeout(2500);
    await keepMarketingPopupClosed(page);
    await assertHealthyPage(page);
    await expect(page.getByText(/please complete the captcha verification/i)).toHaveCount(0);

    // Accept classic WooCommerce, Checkout Block, Stripe, PayPal and express
    // checkout surfaces. We are checking that a customer can reach payment,
    // not coupling the monitor to one gateway's internal DOM.
    const paymentSurface = page.locator([
      '#payment',
      '.wc_payment_methods',
      '.wc-block-components-payment-methods',
      '.wc-block-checkout__payment-method',
      '[class*="payment-method"]',
      '[class*="express-payment"]',
      '[class*="stripe"]',
      '[class*="paypal"]',
      'iframe[name*="stripe"]',
      'button:has-text("Apple Pay")',
      'button:has-text("Google Pay")',
      'button:has-text("PayPal")'
    ].join(',')).first();

    await expect(paymentSurface, 'No payment method UI rendered at checkout').toBeVisible({ timeout: 15000 });

    // Production safety: never submit a live payment/order.
    const placeOrder = page.getByRole('button', { name: /place order|pay now/i }).first();
    if (await placeOrder.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(placeOrder).toBeVisible();
    }
  });
});
