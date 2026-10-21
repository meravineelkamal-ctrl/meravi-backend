import axios from 'axios';

const BASE = process.env.TRANZUPI_BASE_URL || 'https://www.tranzupi.com/api';
const TOKEN = process.env.TRANZUPI_API_KEY;

export async function createTranzUPIOrder({
  amount,
  orderId,
  redirectUrl,
  customerMobile,
  remark1,
  remark2,
}) {
  if (!TOKEN) {
    throw new Error('TRANZUPI_API_KEY is not configured');
  }

  const payload = new URLSearchParams();
  payload.append('user_token', TOKEN);
  payload.append('amount', String(amount));
  payload.append('order_id', orderId);
  payload.append('redirect_url', redirectUrl);
  if (customerMobile) payload.append('customer_mobile', customerMobile);
  if (remark1) payload.append('remark1', remark1);
  if (remark2) payload.append('remark2', remark2);

  const { data } = await axios.post(`${BASE}/create-order`, payload.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000,
  });

  return data;
}

export async function checkTranzUPIStatus(orderId) {
  if (!TOKEN) {
    throw new Error('TRANZUPI_API_KEY is not configured');
  }

  const payload = new URLSearchParams();
  payload.append('user_token', TOKEN);
  payload.append('order_id', orderId);

  const { data } = await axios.post(`${BASE}/check-order-status`, payload.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000,
  });

  return data;
}

export function extractPaymentFields(raw) {
  const data = raw?.data && typeof raw.data === 'object' ? { ...raw, ...raw.data } : raw || {};

  const paymentUrl =
    data.payment_url ||
    data.paymentUrl ||
    data.pay_url ||
    data.checkout_url ||
    data.url ||
    null;

  const qrString =
    data.qr_string ||
    data.qrString ||
    data.upi_string ||
    data.upiString ||
    data.upi_intent ||
    data.qr_code ||
    null;

  let finalQr = qrString;
  if (!finalQr && paymentUrl && paymentUrl.startsWith('upi://')) {
    finalQr = paymentUrl;
  }

  return { paymentUrl, qrString: finalQr };
}

export function extractStatusFields(raw) {
  const result = raw?.result || raw?.data || raw || {};
  return {
    status: String(result.status || result.payment_status || '').toUpperCase(),
    amount: Number(result.amount || result.paid_amount || 0),
    utr: result.utr || result.txn_id || result.transaction_id || null,
    raw: result,
  };
}
