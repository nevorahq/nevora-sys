export interface CreateCheckoutInput {
  organizationId: string;
  planCode: string;
  billingCycle: "monthly" | "yearly";
  returnUrl: string;
}

export interface CheckoutSession {
  provider: "manual" | "noop";
  url: string | null;
  reference: string;
}

export interface CustomerPortalInput {
  organizationId: string;
  returnUrl: string;
}

export interface CustomerPortalSession {
  provider: "manual" | "noop";
  url: string | null;
}

export interface BillingWebhookResult {
  accepted: boolean;
  eventType: string | null;
}

export interface BillingProvider {
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;
  createCustomerPortal(input: CustomerPortalInput): Promise<CustomerPortalSession>;
  handleWebhook(payload: unknown): Promise<BillingWebhookResult>;
}

export class ManualBillingProvider implements BillingProvider {
  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    return {
      provider: "manual",
      url: null,
      reference: `${input.organizationId}:${input.planCode}:${input.billingCycle}`,
    };
  }

  async createCustomerPortal(_input: CustomerPortalInput): Promise<CustomerPortalSession> {
    return { provider: "manual", url: null };
  }

  async handleWebhook(_payload: unknown): Promise<BillingWebhookResult> {
    return { accepted: true, eventType: null };
  }
}

export const billingProvider: BillingProvider = new ManualBillingProvider();
