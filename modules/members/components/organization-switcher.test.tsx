// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { en } from "@/shared/i18n/dictionaries/en";
import { OrganizationSwitcher } from "./organization-switcher";

vi.mock("../actions/switch-organization.action", () => ({
  switchOrganizationAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

const t = en.organizationSwitcher;

const TWO = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Acme Trading", role: "owner" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Beta Studio", role: "member" },
];

/**
 * The switcher is also the tenant indicator. Data isolation is a P0 invariant,
 * so "which organization am I acting in" has to be readable — a user with two
 * businesses must not post an expense into the wrong one.
 */
describe("OrganizationSwitcher as a tenant indicator", () => {
  it("names the current organization, not just the list", () => {
    render(<OrganizationSwitcher currentOrganizationId={TWO[0].id} organizations={TWO} t={t} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe(TWO[0].id);
    expect(screen.getByRole("option", { name: "Acme Trading" })).toBeTruthy();
  });

  it("follows the active organization rather than always showing the first", () => {
    render(<OrganizationSwitcher currentOrganizationId={TWO[1].id} organizations={TWO} t={t} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(TWO[1].id);
  });

  it("carries a localized accessible name", () => {
    render(<OrganizationSwitcher currentOrganizationId={TWO[0].id} organizations={TWO} t={t} />);
    // The label comes from the dictionary — a hardcoded English aria-label here
    // is invisible to a translated UI and to a screen reader in ru/ro.
    expect(screen.getByLabelText(t.ariaLabel)).toBeTruthy();
  });

  it("stays hidden for a single-org user — no ambiguity to resolve", () => {
    const { container } = render(
      <OrganizationSwitcher currentOrganizationId={TWO[0].id} organizations={[TWO[0]]} t={t} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing rather than an empty control when the list is empty", () => {
    const { container } = render(
      <OrganizationSwitcher currentOrganizationId={TWO[0].id} organizations={[]} t={t} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("OrganizationSwitcher visual affordance", () => {
  it("is a bordered chip, not bare text", () => {
    const { container } = render(
      <OrganizationSwitcher currentOrganizationId={TWO[0].id} organizations={TWO} t={t} />,
    );
    // The failure this guards against is the switcher regressing to an
    // unstyled <select> that reads as static text in the header.
    expect(container.querySelector("[class*='border-border-soft']")).toBeTruthy();
  });

  it("shows the organization initial as a glanceable marker", () => {
    render(<OrganizationSwitcher currentOrganizationId={TWO[0].id} organizations={TWO} t={t} />);
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("does not put the decorative initial or chevron in the accessibility tree", () => {
    const { container } = render(
      <OrganizationSwitcher currentOrganizationId={TWO[0].id} organizations={TWO} t={t} />,
    );
    // The select already announces the organization; the marker would repeat it.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
  });
});
