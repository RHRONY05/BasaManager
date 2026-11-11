import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';

export interface SslcommerzClientConfig {
  storeId: string;
  storePassword: string;
  isSandbox?: boolean;
  isMock?: boolean;
}

export interface InitPaymentParams {
  tranId: string;
  amountPoisha: number;
  appUrl: string;
  cusName?: string;
  cusEmail?: string;
  cusPhone?: string;
}

export interface SslcommerzInitResponse {
  status: string;
  failedreason?: string;
  sessionkey: string;
  GatewayPageURL: string;
}

export interface SslcommerzValidationResponse {
  status: 'VALID' | 'FAILED' | 'CANCELLED' | 'UNATTEMPTED' | 'EXPIRED' | 'INVALID_TRANSACTION' | string;
  tran_id: string;
  val_id: string;
  amount: string;
  currency: string;
  currency_type?: string;
}

export interface SslcommerzQueryResponse {
  APIConnect: string;
  no_of_trans_found: number;
  element?: Array<{
    status: string;
    tran_id: string;
    val_id: string;
    amount: string;
    currency_type?: string;
  }>;
}

export class SslcommerzClient {
  private readonly initUrl: string;
  private readonly validateUrl: string;
  private readonly queryUrl: string;

  constructor(private readonly config: SslcommerzClientConfig) {
    const host =
      config.isSandbox !== false ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
    this.initUrl = `${host}/gwprocess/v4/api.php`;
    this.validateUrl = `${host}/validator/api/validationserverAPI.php`;
    this.queryUrl = `${host}/validator/api/merchantTransIDvalidationAPI.php`;
  }

  async initPayment(params: InitPaymentParams): Promise<SslcommerzInitResponse> {
    const totalAmount = (params.amountPoisha / 100).toFixed(2);
    const isMock = this.config.isMock || process.env.PAYMENTS_MOCK === 'true';
    if (isMock) {
      return {
        status: 'SUCCESS',
        GatewayPageURL: `${params.appUrl}/api/payments/sslcommerz/mock-gateway?tran_id=${encodeURIComponent(params.tranId)}&amount=${totalAmount}`,
        sessionkey: `MOCK_SESS_${params.tranId}`,
      };
    }

    const body = new URLSearchParams({
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      total_amount: totalAmount,
      currency: 'BDT',
      tran_id: params.tranId,
      success_url: `${params.appUrl}/api/payments/sslcommerz/return/success`,
      fail_url: `${params.appUrl}/api/payments/sslcommerz/return/fail`,
      cancel_url: `${params.appUrl}/api/payments/sslcommerz/return/cancel`,
      ipn_url: `${params.appUrl}/api/payments/sslcommerz/ipn`,
      cus_name: params.cusName || 'Tenant',
      cus_email: params.cusEmail || 'tenant@example.com',
      cus_add1: 'Dhaka',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: params.cusPhone || '01700000000',
      shipping_method: 'NO',
      product_name: 'Rent and Utility',
      product_category: 'Housing',
      product_profile: 'general',
    });

    try {
      const response = await fetch(this.initUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new ApiError(ErrorCode.INTERNAL, `SSLCommerz init HTTP error: ${response.status}`);
      }

      const data = (await response.json()) as SslcommerzInitResponse;
      if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
        throw new ApiError(ErrorCode.INTERNAL, data.failedreason || 'Payment gateway initialization failed');
      }

      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(ErrorCode.INTERNAL, `SSLCommerz init network error: ${(err as Error).message}`);
    }
  }

  async validatePayment(valId: string): Promise<SslcommerzValidationResponse> {
    const isMock = this.config.isMock || process.env.PAYMENTS_MOCK === 'true';
    if (isMock) {
      if (valId.startsWith('MOCK_VAL_')) {
        const payload = valId.slice('MOCK_VAL_'.length);
        const lastUnderscore = payload.lastIndexOf('_');
        if (lastUnderscore !== -1) {
          const tranId = payload.slice(0, lastUnderscore);
          const amount = payload.slice(lastUnderscore + 1);
          return {
            status: 'VALID',
            tran_id: tranId,
            val_id: valId,
            amount,
            currency: 'BDT',
            currency_type: 'BDT',
          };
        }
      }
      return {
        status: 'VALID',
        tran_id: valId,
        val_id: valId,
        amount: '0.00',
        currency: 'BDT',
        currency_type: 'BDT',
      };
    }

    const params = new URLSearchParams({
      val_id: valId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    });

    const url = `${this.validateUrl}?${params.toString()}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new ApiError(ErrorCode.INTERNAL, `SSLCommerz validation HTTP error: ${response.status}`);
    }

    return (await response.json()) as SslcommerzValidationResponse;
  }

  async queryTransaction(tranId: string): Promise<SslcommerzQueryResponse> {
    const isMock = this.config.isMock || process.env.PAYMENTS_MOCK === 'true';
    if (isMock) {
      return {
        APIConnect: 'DONE',
        no_of_trans_found: 1,
        element: [
          {
            status: 'VALID',
            tran_id: tranId,
            val_id: `MOCK_VAL_${tranId}_0.00`,
            amount: '0.00',
            currency_type: 'BDT',
          },
        ],
      };
    }

    const params = new URLSearchParams({
      tran_id: tranId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    });

    const url = `${this.queryUrl}?${params.toString()}`;
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new ApiError(ErrorCode.INTERNAL, `SSLCommerz query HTTP error: ${response.status}`);
    }

    return (await response.json()) as SslcommerzQueryResponse;
  }
}
