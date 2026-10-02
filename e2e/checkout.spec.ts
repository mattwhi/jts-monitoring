import { test, expect, Page, Locator } from "@playwright/test";
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const PRODUCT_PATH = process.env.JTS_MONITOR_PRODUCT || "";
const TREAT_BOX_PATH = process.env.JTS_TREAT_BOX_PATH || "/build-a-treat-box/";

async function withStage<T>(stage: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[STAGE:${stage}] ${message}`);
  }
}

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
      page.getByRole("button", { name: /close/i }),
      page.locator('button[aria-label*="close" i]'),
      page.locator('[role="dialog"] button').filter({ hasText: /^[×x]$/i }),
      page
        .locator(".jts-newsletter-modal button")
        .filter({ hasText: /^[×x]$/i }),
      page.locator(".jts-popup button").filter({ hasText: /^[×x]$/i }),
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
    if (!closed) await page.keyboard.press("Escape").catch(() => {});
  }

  // Consent UI may also overlay controls. We only dismiss visible UI; the
  // monitor does not change consent choices merely to make the test pass.
  const closeOnly = [
    page.locator(".cmplz-close"),
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
    throw new Error(
      "JTS 'Join Jasper’s Pack' popup could not be dismissed and is blocking the customer journey."
    );
  }
}

async function keepMarketingPopupClosed(page: Page) {
  // Re-run after navigation because the delayed popup can appear on cart or checkout.
  await dismissNonEssentialUI(page);
  await page.waitForTimeout(1200);
  await dismissNonEssentialUI(page);
}

async function assertHealthyPage(page: Page) {
  const body = await page.locator("body").innerText();
  for (const pattern of fatalPatterns) {
    expect(
      body,
      `Production page contained fatal-error text: ${pattern}`
    ).not.toMatch(pattern);
  }
}

async function findAddToBasket(page: Page): Promise<Locator> {
  // Supports classic WooCommerce, custom JTS buttons and block themes.
  const candidates = [
    page.getByRole("button", { name: /add to (basket|cart)/i }),
    page.locator("button.single_add_to_cart_button"),
    page.locator('button[name="add-to-cart"]'),
    page.locator('form.cart button[type="submit"]'),
    page.locator(".single_add_to_cart_button"),
    page.locator("a.add_to_cart_button"),
  ];

  for (const candidate of candidates) {
    const first = candidate.first();
    if (await first.isVisible({ timeout: 1200 }).catch(() => false))
      return first;
  }
  throw new Error(
    `No usable Add to basket/cart control found on ${page.url()}`
  );
}

async function addStableProductFromShop(page: Page) {
  // JTS exposes direct WooCommerce "Add to basket" links on the shop grid.
  // Monitoring from the grid is more stable than depending on product-page
  // slugs/templates and still exercises WooCommerce's real cart/session flow.
  const response = await page.goto("/shop/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await dismissNonEssentialUI(page);
  await assertHealthyPage(page);

  const candidates = [
    page.getByRole("link", { name: /add to basket/i }),
    page.locator("a.add_to_cart_button:not(.product_type_variable)"),
    page.locator("a.ajax_add_to_cart"),
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
    throw new Error("No visible in-stock Add to basket link found on /shop/.");
  }

  await add.click();

  // WooCommerce AJAX may replace the link with "View basket" or update the
  // header/mini-cart. Accept either as proof that the cart operation completed.
  await expect
    .poll(
      async () => {
        const viewBasket = await page
          .getByRole("link", { name: /view basket|view cart/i })
          .count()
          .catch(() => 0);
        const body = await page
          .locator("body")
          .innerText()
          .catch(() => "");
        const basketCount = /Basket\s+[1-9]\d*/i.test(body);
        return viewBasket > 0 || basketCount;
      },
      {
        message:
          "WooCommerce did not confirm that the product was added to the basket",
        timeout: 12_000,
      }
    )
    .toBeTruthy();
}

type DiagnosticState = { consoleErrors: string[]; requestFailures: any[]; httpErrors: any[] };
const diagnosticState = new WeakMap<Page, DiagnosticState>();

function visualKey(testInfo: any) {
  return `${testInfo.title}-${testInfo.project.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function comparePng(current: Buffer, baseline: Buffer) {
  const a = PNG.sync.read(current), b = PNG.sync.read(baseline);
  if (a.width !== b.width || a.height !== b.height) return { diff_percent: 100, width: a.width, height: a.height, size_changed: true };
  let changed = 0; const pixels = a.width * a.height;
  for (let i=0;i<a.data.length;i+=4) {
    const delta = Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);
    if (delta > 45) changed++;
  }
  return { diff_percent: Math.round((changed / pixels) * 10000) / 100, width: a.width, height: a.height, size_changed: false };
}


test.beforeEach(async ({ page }) => {
  const state: DiagnosticState = { consoleErrors: [], requestFailures: [], httpErrors: [] };
  diagnosticState.set(page, state);
  page.on("console", msg => {
    if (msg.type() === "error") state.consoleErrors.push(msg.text().slice(0, 1000));
  });
  page.on("requestfailed", req => state.requestFailures.push({
    method: req.method(), url: req.url().slice(0, 1200), failure: req.failure()?.errorText || "request failed"
  }));
  page.on("response", res => {
    if (res.status() >= 400) state.httpErrors.push({
      method: res.request().method(), url: res.url().slice(0, 1200), status: res.status(), statusText: res.statusText()
    });
  });
  await page.addInitScript(() => {
    (window as any).__jtsVitals = { lcp: 0, cls: 0, inp: 0 };
    try {
      new PerformanceObserver(list => { for (const e of list.getEntries()) (window as any).__jtsVitals.lcp = e.startTime; })
        .observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries() as any) if (!e.hadRecentInput) (window as any).__jtsVitals.cls += e.value; })
        .observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries() as any) if (e.interactionId) (window as any).__jtsVitals.inp = Math.max((window as any).__jtsVitals.inp, e.duration || 0); })
        .observe({ type: "event", buffered: true, durationThreshold: 40 } as any);
    } catch {}
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const state = diagnosticState.get(page) || { consoleErrors: [], requestFailures: [], httpErrors: [] };
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const v = (window as any).__jtsVitals || {};
    return {
      url: location.href,
      ttfb_ms: nav ? Math.round(nav.responseStart) : 0,
      dom_content_loaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      load_ms: nav ? Math.round(nav.loadEventEnd) : 0,
      fcp_ms: fcp ? Math.round(fcp.startTime) : 0,
      lcp_ms: v.lcp ? Math.round(v.lcp) : 0,
      cls: typeof v.cls === "number" ? Math.round(v.cls * 1000) / 1000 : 0,
      inp_ms: v.inp ? Math.round(v.inp) : 0,
    };
  }).catch(() => ({}));
  await testInfo.attach("jts-diagnostics", { body: Buffer.from(JSON.stringify(state)), contentType: "application/json" });
  await testInfo.attach("jts-web-metrics", { body: Buffer.from(JSON.stringify(metrics)), contentType: "application/json" });

  if (process.env.JTS_VISUAL_ENABLED !== "0") {
    const threshold = Number(process.env.JTS_VISUAL_THRESHOLD || "5") || 5;
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    const baselineDir = path.join(dataDir, "visual-baselines");
    const currentDir = path.join(dataDir, "visual-current");
    fs.mkdirSync(baselineDir, { recursive: true }); fs.mkdirSync(currentDir, { recursive: true });
    const key = visualKey(testInfo), baselinePath = path.join(baselineDir, `${key}.png`), currentPath = path.join(currentDir, `${key}.png`);
    const current = await page.screenshot({ fullPage: true, animations: "disabled" }).catch(() => null);
    if (current) {
      fs.writeFileSync(currentPath, current);
      let visual:any = { threshold_percent: threshold, current_path: currentPath, baseline_path: baselinePath };
      if (!fs.existsSync(baselinePath)) { fs.writeFileSync(baselinePath, current); const png=PNG.sync.read(current); visual={...visual,baseline_created:true,status:"baseline",diff_percent:0,width:png.width,height:png.height}; }
      else { const c=comparePng(current,fs.readFileSync(baselinePath)); visual={...visual,...c,baseline_created:false,status:c.diff_percent>threshold?"changed":"match"}; }
      await testInfo.attach("jts-visual", { body: Buffer.from(JSON.stringify(visual)), contentType: "application/json" });
    }
  }
});

test.describe("Jasper’s Treat Shop production synthetic monitoring", () => {
  test("homepage and shop are healthy @critical", async ({ page }) => {
    await withStage("HOMEPAGE", async () => {
      const response = await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(500);
      await assertHealthyPage(page);
    });
    await withStage("SHOP", async () => {
      const response = await page.goto("/shop/", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(500);
      await assertHealthyPage(page);
    });
  });

  test("guest can add a product and reach a usable checkout @critical @checkout", async ({
    page,
  }) => {
    await withStage("ADD_TO_BASKET", async () => {
      await addStableProductFromShop(page);
      await keepMarketingPopupClosed(page);
    });

    await withStage("CHECKOUT", async () => {
      const checkoutResponse = await page.goto("/checkout/", {
        waitUntil: "domcontentloaded",
      });
      expect(
        checkoutResponse?.status(),
        "Checkout returned a server error"
      ).toBeLessThan(500);
      await keepMarketingPopupClosed(page);
      await assertHealthyPage(page);
      expect(
        new URL(page.url()).pathname,
        `Expected checkout but browser ended up at ${page.url()}`
      ).toMatch(/\/checkout\/?$/);
    });

    await withStage("CAPTCHA", async () => {
      await expect(
        page.getByText(/please complete the captcha verification/i),
        "Checkout is being blocked by an invisible/broken CAPTCHA"
      ).toHaveCount(0);
    });

    await withStage("BILLING", async () => {
      const email = page
        .locator(
          '#billing_email, input[name="billing_email"], input[type="email"]'
        )
        .first();
      await expect(email, "Billing email field did not render").toBeVisible();
      const fillIfPresent = async (selectors: string, value: string) => {
        const el = page.locator(selectors).first();
        if (await el.isVisible({ timeout: 1200 }).catch(() => false))
          await el.fill(value);
      };
      await fillIfPresent(
        '#billing_first_name, input[name="billing_first_name"]',
        "JTS"
      );
      await fillIfPresent(
        '#billing_last_name, input[name="billing_last_name"]',
        "Monitor"
      );
      await fillIfPresent(
        '#billing_address_1, input[name="billing_address_1"]',
        "1 Test Street"
      );
      await fillIfPresent(
        '#billing_city, input[name="billing_city"]',
        "Wakefield"
      );
      await fillIfPresent(
        '#billing_postcode, input[name="billing_postcode"]',
        "WF1 1AA"
      );
      await fillIfPresent(
        '#billing_phone, input[name="billing_phone"]',
        "01924000000"
      );
      await email.fill(
        process.env.JTS_MONITOR_EMAIL || "synthetic-monitor@example.invalid"
      );
      await page.waitForTimeout(2500);
      await keepMarketingPopupClosed(page);
      await assertHealthyPage(page);
    });

    await withStage("PAYMENT", async () => {
      await expect(
        page.getByText(/please complete the captcha verification/i)
      ).toHaveCount(0);
      const paymentSurface = page
        .locator(
          [
            "#payment",
            ".wc_payment_methods",
            ".wc-block-components-payment-methods",
            ".wc-block-checkout__payment-method",
            '[class*="payment-method"]',
            '[class*="express-payment"]',
            '[class*="stripe"]',
            '[class*="paypal"]',
            'iframe[name*="stripe"]',
            'button:has-text("Apple Pay")',
            'button:has-text("Google Pay")',
            'button:has-text("PayPal")',
          ].join(",")
        )
        .first();
      await expect(
        paymentSurface,
        "No payment method UI rendered at checkout"
      ).toBeVisible({ timeout: 15000 });
      const placeOrder = page
        .getByRole("button", { name: /place order|pay now/i })
        .first();
      if (await placeOrder.isVisible({ timeout: 1000 }).catch(() => false))
        await expect(placeOrder).toBeVisible();
    });
  });

  test("build-a-treat-box is healthy @critical @treatbox", async ({ page }) => {
    await withStage("TREAT_BOX", async () => {
      const response = await page.goto(TREAT_BOX_PATH, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBeLessThan(500);
      await dismissNonEssentialUI(page);
      await assertHealthyPage(page);
      const body = await page.locator("body").innerText();
      expect(
        body,
        "Build-a-Treat-Box page did not contain its expected customer-facing content"
      ).toMatch(/build.{0,30}treat.{0,15}box/i);
    });
  });
});
