/**
 * Pure domain logic for billing, electricity, proration, late fees, payment allocation and settlement.
 * No DB, no clock, no network. All money as integer poisha. Dates are 'YYYY-MM-DD' calendar strings in Asia/Dhaka.
 */

export class DomainError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

/**
 * Rounds poisha to the nearest whole taka (half up).
 * ৳1 = 100 poisha.
 * Math.round(x / 100) * 100
 */
export function roundTaka(poisha: number): number {
  if (poisha === 0) return 0;
  const rounded = Math.round(poisha / 100) * 100;
  return rounded === 0 ? 0 : rounded;
}

function parseYearMonth(dateStr: string): { year: number; month: number } {
  const parts = dateStr.slice(0, 7).split('-');
  return { year: parseInt(parts[0]!, 10), month: parseInt(parts[1]!, 10) };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDay(dateStr: string): number {
  return parseInt(dateStr.slice(8, 10), 10);
}

function formatDayString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function prorationFactor(input: {
  periodMonth: string;
  moveInDate?: string;
  moveOutDate?: string;
}): number {
  const { year, month } = parseYearMonth(input.periodMonth);
  const totalDays = daysInMonth(year, month);

  let startDay = 1;
  let endDay = totalDays;

  if (input.moveInDate) {
    const inYM = parseYearMonth(input.moveInDate);
    if (inYM.year === year && inYM.month === month) {
      startDay = Math.max(startDay, parseDay(input.moveInDate));
    }
  }

  if (input.moveOutDate) {
    const outYM = parseYearMonth(input.moveOutDate);
    if (outYM.year === year && outYM.month === month) {
      endDay = Math.min(endDay, parseDay(input.moveOutDate));
    }
  }

  if (startDay > endDay) return 0;
  if (startDay === 1 && endDay === totalDays) return 1;

  const activeDays = endDay - startDay + 1;
  return activeDays / totalDays;
}

export function prorate(
  amountPoisha: number,
  input: {
    periodMonth: string;
    moveInDate?: string;
    moveOutDate?: string;
  },
): number {
  const factor = prorationFactor(input);
  return roundTaka(amountPoisha * factor);
}

export function electricityCharge(params: {
  prev: number;
  curr: number;
  ratePoisha: number;
  meterReplaced?: boolean;
  newMeterStart?: number;
}): { units: number; amountPoisha: number } {
  if (params.curr < params.prev && !params.meterReplaced) {
    throw new DomainError(
      'READING_LOWER_THAN_PREVIOUS',
      'Current meter reading is lower than previous reading without meter replacement',
    );
  }

  let units: number;
  if (params.meterReplaced) {
    const newStart = params.newMeterStart ?? 0;
    if (params.curr < newStart) {
      throw new DomainError(
        'READING_LOWER_THAN_PREVIOUS',
        'Current reading is lower than new meter start reading',
      );
    }
    units = params.curr - newStart;
  } else {
    units = params.curr - params.prev;
  }

  const amountPoisha = units * params.ratePoisha;
  return { units, amountPoisha };
}

export function computeLateFee(params: {
  dueDate: string;
  graceDays: number;
  lateFeeType: 'none' | 'flat' | 'percent';
  lateFeeValue: number;
  balancePoisha: number;
  today: string;
  lateFeeAlreadyApplied?: boolean;
}): number {
  if (params.lateFeeAlreadyApplied || params.balancePoisha <= 0 || params.lateFeeType === 'none') {
    return 0;
  }

  // Parse due date and calculate grace deadline
  const [dy, dm, dd] = params.dueDate.split('-').map(Number);
  const dueUtc = new Date(Date.UTC(dy!, dm! - 1, dd!));
  dueUtc.setUTCDate(dueUtc.getUTCDate() + params.graceDays);
  const graceEnd = formatDayString(dueUtc);

  // If today is within dueDate + graceDays (inclusive), no late fee
  if (params.today <= graceEnd) {
    return 0;
  }

  if (params.lateFeeType === 'flat') {
    return params.lateFeeValue;
  }

  if (params.lateFeeType === 'percent') {
    // lateFeeValue is stored in basis points (e.g. 500 = 5% = 500 bp)
    // formula: roundTaka(balance * bp / 10000) using integer math:
    // Math.round((balance * bp) / 1_000_000) * 100
    const rawTaka = Math.round((params.balancePoisha * params.lateFeeValue) / 1_000_000);
    return rawTaka * 100;
  }

  return 0;
}

export function waiveLateFee(params: { currentFeePoisha: number; reason: string }): {
  amountPoisha: number;
  reason: string;
} {
  if (!params.reason || !params.reason.trim()) {
    throw new DomainError('VALIDATION_FAILED', 'A reason is required to waive a late fee');
  }
  return {
    amountPoisha: 0,
    reason: params.reason.trim(),
  };
}

export interface BillToAllocate {
  id: string;
  periodMonth: string;
  totalPoisha: number;
  paidPoisha: number;
}

export function allocatePayment(params: { amountPoisha: number; bills: BillToAllocate[] }): {
  allocations: Array<{ billId: string; amountPoisha: number; status: 'paid' | 'partially_paid' }>;
  creditPoisha: number;
} {
  if (params.amountPoisha <= 0) {
    throw new DomainError('VALIDATION_FAILED', 'Payment amount must be greater than zero');
  }

  const sortedBills = [...params.bills]
    .filter((b) => b.totalPoisha > b.paidPoisha)
    .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth));

  let remaining = params.amountPoisha;
  const allocations: Array<{ billId: string; amountPoisha: number; status: 'paid' | 'partially_paid' }> = [];

  for (const b of sortedBills) {
    if (remaining <= 0) break;
    const balance = b.totalPoisha - b.paidPoisha;
    const alloc = Math.min(remaining, balance);
    const newPaid = b.paidPoisha + alloc;
    const status: 'paid' | 'partially_paid' = newPaid >= b.totalPoisha ? 'paid' : 'partially_paid';
    allocations.push({
      billId: b.id,
      amountPoisha: alloc,
      status,
    });
    remaining -= alloc;
  }

  return {
    allocations,
    creditPoisha: remaining,
  };
}

export function applyCreditToBill(params: {
  creditPoisha: number;
  bill: { totalPoisha: number; paidPoisha: number };
}): {
  appliedPoisha: number;
  balancePoisha: number;
  remainingCreditPoisha: number;
  status: 'issued' | 'partially_paid' | 'paid';
} {
  const currentBalance = params.bill.totalPoisha - params.bill.paidPoisha;
  const appliedPoisha = Math.min(params.creditPoisha, currentBalance);
  const newPaid = params.bill.paidPoisha + appliedPoisha;
  const balancePoisha = params.bill.totalPoisha - newPaid;
  const remainingCreditPoisha = params.creditPoisha - appliedPoisha;

  let status: 'issued' | 'partially_paid' | 'paid';
  if (balancePoisha === 0) {
    status = 'paid';
  } else if (appliedPoisha > 0) {
    status = 'partially_paid';
  } else {
    status = 'issued';
  }

  return {
    appliedPoisha,
    balancePoisha,
    remainingCreditPoisha,
    status,
  };
}

export function voidPayment(params: {
  allocations: Array<{ billId: string; amountPoisha: number }>;
  creditCreatedPoisha: number;
  creditBalancePoisha: number;
  creditApplications: Array<{ billId: string; amountPoisha: number }>;
  bills: Array<{ id: string; totalPoisha: number; paidPoisha: number }>;
}): {
  bills: Array<{
    id: string;
    paidPoisha: number;
    balancePoisha: number;
    status: 'issued' | 'partially_paid' | 'paid';
  }>;
  creditBalancePoisha: number;
} {
  const billMap = new Map<string, { id: string; totalPoisha: number; paidPoisha: number }>();
  for (const b of params.bills) {
    billMap.set(b.id, { ...b });
  }

  // Reverse allocations
  for (const alloc of params.allocations) {
    const b = billMap.get(alloc.billId);
    if (b) {
      b.paidPoisha = Math.max(0, b.paidPoisha - alloc.amountPoisha);
    }
  }

  // Reverse credit applications if credit created by this payment was used
  for (const app of params.creditApplications) {
    const b = billMap.get(app.billId);
    if (b) {
      b.paidPoisha = Math.max(0, b.paidPoisha - app.amountPoisha);
    }
  }

  // Remove credit created by this payment from balance
  const creditBalancePoisha = Math.max(0, params.creditBalancePoisha - params.creditCreatedPoisha);

  const updatedBills: Array<{
    id: string;
    paidPoisha: number;
    balancePoisha: number;
    status: 'issued' | 'partially_paid' | 'paid';
  }> = [];

  for (const b of billMap.values()) {
    const balancePoisha = b.totalPoisha - b.paidPoisha;
    let status: 'issued' | 'partially_paid' | 'paid';
    if (b.paidPoisha === 0) {
      status = 'issued';
    } else if (b.paidPoisha >= b.totalPoisha) {
      status = 'paid';
    } else {
      status = 'partially_paid';
    }
    updatedBills.push({
      id: b.id,
      paidPoisha: b.paidPoisha,
      balancePoisha,
      status,
    });
  }

  return {
    bills: updatedBills,
    creditBalancePoisha,
  };
}

export function computeSettlement(params: {
  depositPoisha: number;
  unpaidBalancesPoisha: number[];
  creditPoisha: number;
}): {
  settlementPoisha: number;
  outcome: 'refund' | 'tenant_owes' | 'even';
  leaseStatus: 'ended' | 'ended_with_dues';
} {
  const totalUnpaid = params.unpaidBalancesPoisha.reduce((sum, b) => sum + b, 0);
  const settlementPoisha = params.depositPoisha - totalUnpaid + params.creditPoisha;

  let outcome: 'refund' | 'tenant_owes' | 'even';
  let leaseStatus: 'ended' | 'ended_with_dues';

  if (settlementPoisha > 0) {
    outcome = 'refund';
    leaseStatus = 'ended';
  } else if (settlementPoisha < 0) {
    outcome = 'tenant_owes';
    leaseStatus = 'ended_with_dues';
  } else {
    outcome = 'even';
    leaseStatus = 'ended';
  }

  return {
    settlementPoisha,
    outcome,
    leaseStatus,
  };
}
