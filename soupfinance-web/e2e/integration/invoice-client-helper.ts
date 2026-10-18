/**
 * Added (SOUPFIN-170): pick a client the invoice form can actually invoice.
 *
 * The form saves `accountServices.id`, read from the client's first portfolio. On the LXC dev
 * data the first client offered has no portfolio, so picking `option:nth(1)` makes the save
 * fail with "Selected client has no account services" — a data failure, not the behaviour
 * under test. This was fixed inline in the first SOUPFIN-37 test on 3 Oct 2026; it lives here
 * so every invoice-saving spec uses the same choice.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Select the first offered client whose first portfolio carries account services. If none
 * can be invoiced, create one through the form's "Create & Select" flow, which adds the
 * client, its account services and the portfolio link, then selects it.
 *
 * Returns the selected client id.
 */
export async function selectInvoiceableClient(
  page: Page,
  clientSelect: Locator,
  apiBase: string,
  token: string,
  lastNamePrefix: string
): Promise<string> {
  await expect
    .poll(async () => (await clientSelect.locator('option').count()), { timeout: 30000 })
    .toBeGreaterThan(1);

  const offered = await clientSelect.locator('option').evaluateAll((opts) =>
    opts.map((o) => (o as HTMLOptionElement).value).filter((v) => !!v)
  );
  for (const id of offered) {
    const res = await page.request.get(`${apiBase}/rest/client/show/${id}.json`, {
      headers: { 'X-Auth-Token': token }, maxRedirects: 0,
    });
    if (!res.ok()) continue;
    const portfolioId = (await res.json())?.portfolioList?.[0]?.id;
    if (!portfolioId) continue;
    const pf = await page.request.get(`${apiBase}/rest/clientPortfolio/show/${portfolioId}.json`, {
      headers: { 'X-Auth-Token': token }, maxRedirects: 0,
    });
    if (pf.ok() && (await pf.json())?.accountServices?.id) {
      await clientSelect.selectOption(id);
      return id;
    }
  }

  await page.getByTestId('invoice-new-client-button').click();
  await page.getByTestId('new-client-type-individual').click();
  const stamp = Date.now();
  await page.getByTestId('new-client-first-name').fill('Test');
  await page.getByTestId('new-client-last-name').fill(`${lastNamePrefix} ${stamp}`);
  await page.getByTestId('new-client-email').fill(`${lastNamePrefix.toLowerCase()}+${stamp}@example.com`);
  await page.getByTestId('new-client-create-button').click();
  await expect.poll(async () => clientSelect.inputValue(), { timeout: 60000 }).not.toBe('');
  return clientSelect.inputValue();
}
