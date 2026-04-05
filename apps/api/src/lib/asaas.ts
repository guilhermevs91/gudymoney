import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Base URL — defaults to Asaas sandbox
// ---------------------------------------------------------------------------

const BASE_URL = env.ASAAS_BASE_URL;

// ---------------------------------------------------------------------------
// Shared fetch wrapper
// ---------------------------------------------------------------------------

async function asaasRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      access_token: env.ASAAS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new Error(
      `Asaas API error: ${response.status} ${JSON.stringify(errorBody)}`,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Asaas customer types
// ---------------------------------------------------------------------------

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}

export interface AsaasCustomerListResponse {
  data: AsaasCustomer[];
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Asaas subscription types
// ---------------------------------------------------------------------------

export type AsaasBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD';
export type AsaasCycle = 'MONTHLY' | 'YEARLY';

export interface AsaasSubscriptionInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  cycle: AsaasCycle;
  description: string;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string;
  cycle: AsaasCycle;
  description: string;
  status: string;
  paymentLink?: string;
  invoiceUrl?: string;
}

// ---------------------------------------------------------------------------
// Asaas API client
// ---------------------------------------------------------------------------

export const asaas = {
  /**
   * Create a new customer in Asaas.
   */
  createCustomer: (data: {
    name: string;
    email: string;
    cpfCnpj?: string;
    phone?: string;
  }): Promise<AsaasCustomer> => asaasRequest<AsaasCustomer>('POST', '/customers', data),

  /**
   * Find an existing customer by email address.
   */
  findCustomerByEmail: (
    email: string,
  ): Promise<AsaasCustomerListResponse> =>
    asaasRequest<AsaasCustomerListResponse>(
      'GET',
      `/customers?email=${encodeURIComponent(email)}`,
    ),

  /**
   * Create a recurring subscription.
   */
  createSubscription: (
    data: AsaasSubscriptionInput,
  ): Promise<AsaasSubscription> =>
    asaasRequest<AsaasSubscription>('POST', '/subscriptions', data),

  /**
   * Cancel (delete) a subscription by its Asaas ID.
   */
  cancelSubscription: (subscriptionId: string): Promise<{ deleted: boolean }> =>
    asaasRequest<{ deleted: boolean }>(
      'DELETE',
      `/subscriptions/${subscriptionId}`,
    ),

  /**
   * Retrieve a subscription by its Asaas ID.
   */
  getSubscription: (subscriptionId: string): Promise<AsaasSubscription> =>
    asaasRequest<AsaasSubscription>('GET', `/subscriptions/${subscriptionId}`),
};
