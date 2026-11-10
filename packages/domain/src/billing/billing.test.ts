import { describe, it, expect } from 'vitest';
import {
  roundTaka,
  prorationFactor,
  prorate,
  electricityCharge,
  computeLateFee,
  waiveLateFee,
  allocatePayment,
  applyCreditToBill,
  voidPayment,
  computeSettlement,
} from './index';

/**
 * Interface under test (defined by the test-designer, see .agent/briefs/V8-tests.md "Interface"):
 * all money is integer poisha, all dates are 'YYYY-MM-DD' Asia/Dhaka calendar dates, no clock is read.
 * Domain errors are thrown as objects with a string `code`.
 */
const taka = (n: number): number => n * 100;
const codeOf = (code: string) => expect.objectContaining({ code });

describe('roundTaka', () => {
  it('rounds to the nearest whole taka, half up', () => {
    expect(roundTaka(49)).toBe(0);
    expect(roundTaka(50)).toBe(100);
    expect(roundTaka(149)).toBe(100);
    expect(roundTaka(150)).toBe(200);
    expect(roundTaka(520000)).toBe(520000);
  });
  it('handles zero and negatives', () => {
    expect(roundTaka(0)).toBe(0);
    expect(roundTaka(-149)).toBe(-100);
    expect(roundTaka(-300)).toBe(-300);
  });
  it('always returns a multiple of 100', () => {
    for (const x of [1, 99, 12345, 43333.33, 535714.28]) expect(roundTaka(x) % 100).toBe(0);
  });
});

describe('Rule 2 — proration', () => {
  it('2a: move-in 18 Nov 2026 (D=30): factor 13/30, rent 5,200, service 433, total 5,633', () => {
    const input = { periodMonth: '2026-11-01', moveInDate: '2026-11-18' };
    expect(prorationFactor(input)).toBeCloseTo(13 / 30, 10);
    const rent = prorate(taka(12000), input);
    const service = prorate(taka(1000), input);
    expect(rent).toBe(taka(5200));
    expect(service).toBe(taka(433));
    expect(rent + service).toBe(taka(5633));
  });

  it('2b: move-out 10 Feb 2027 (D=28): factor 10/28, rent 5,357', () => {
    const input = { periodMonth: '2027-02-01', moveOutDate: '2027-02-10' };
    expect(prorationFactor(input)).toBeCloseTo(10 / 28, 10);
    expect(prorate(taka(15000), input)).toBe(taka(5357));
  });

  it('leap-year February uses D=29 (move-in 15 Feb 2028 → 15/29; move-out 10 Feb 2028 → 10/29)', () => {
    expect(prorationFactor({ periodMonth: '2028-02-01', moveInDate: '2028-02-15' })).toBeCloseTo(15 / 29, 10);
    expect(prorationFactor({ periodMonth: '2028-02-01', moveOutDate: '2028-02-10' })).toBeCloseTo(10 / 29, 10);
    expect(prorate(taka(29000), { periodMonth: '2028-02-01', moveInDate: '2028-02-15' })).toBe(taka(15000));
  });

  it('move-in on day 1 is a full month (factor 1, no discount)', () => {
    const input = { periodMonth: '2026-11-01', moveInDate: '2026-11-01' };
    expect(prorationFactor(input)).toBe(1);
    expect(prorate(taka(12000), input)).toBe(taka(12000));
  });

  it('move-in on the last day of the month is 1/D', () => {
    const input = { periodMonth: '2026-11-01', moveInDate: '2026-11-30' };
    expect(prorationFactor(input)).toBeCloseTo(1 / 30, 10);
    expect(prorate(taka(12000), input)).toBe(taka(400));
  });

  it('no move-in/move-out in the month: factor 1', () => {
    expect(prorationFactor({ periodMonth: '2026-11-01' })).toBe(1);
    expect(prorate(taka(12000), { periodMonth: '2026-11-01' })).toBe(taka(12000));
  });

  it('move-out on the last day is a full month', () => {
    expect(prorationFactor({ periodMonth: '2026-11-01', moveOutDate: '2026-11-30' })).toBe(1);
  });
});

describe('Rule 3 — electricity', () => {
  it('3: prev 1,240 → curr 1,395 at ৳9.00 = 155 units = 139,500 poisha', () => {
    expect(electricityCharge({ prev: 1240, curr: 1395, ratePoisha: 900 })).toEqual({
      units: 155,
      amountPoisha: 139500,
    });
  });

  it('same reading is zero units, zero charge', () => {
    expect(electricityCharge({ prev: 500, curr: 500, ratePoisha: 900 })).toEqual({ units: 0, amountPoisha: 0 });
  });

  it('curr < prev without meterReplaced is rejected with READING_LOWER_THAN_PREVIOUS', () => {
    expect(() => electricityCharge({ prev: 1500, curr: 45, ratePoisha: 900 })).toThrowError(
      codeOf('READING_LOWER_THAN_PREVIOUS'),
    );
  });

  it('meter replaced: units = curr − newMeterStart (45 − 0 = 45)', () => {
    expect(
      electricityCharge({ prev: 1500, curr: 45, ratePoisha: 900, meterReplaced: true, newMeterStart: 0 }),
    ).toEqual({ units: 45, amountPoisha: 40500 });
  });

  it('meter replaced with a non-zero start of the new meter', () => {
    expect(
      electricityCharge({ prev: 1500, curr: 70, ratePoisha: 1000, meterReplaced: true, newMeterStart: 20 }),
    ).toEqual({ units: 50, amountPoisha: 50000 });
  });
});

describe('Rule 4 — late fee', () => {
  const base = {
    dueDate: '2026-12-10',
    graceDays: 2,
    lateFeeType: 'percent' as const,
    lateFeeValue: 5,
    lateFeeAlreadyApplied: false,
  };

  it('4: ৳14,000 bill, ৳9,000 paid, balance ৳5,000 on 13 Dec → 5% = ৳250; new balance ৳5,250', () => {
    const fee = computeLateFee({ ...base, balancePoisha: taka(5000), today: '2026-12-13' });
    expect(fee).toBe(taka(250));
    expect(taka(5000) + fee).toBe(taka(5250));
  });

  it('4: on 20 Dec nothing more is added (already applied)', () => {
    expect(
      computeLateFee({ ...base, balancePoisha: taka(5250), today: '2026-12-20', lateFeeAlreadyApplied: true }),
    ).toBe(0);
  });

  it('is applied only once per bill (second check returns 0)', () => {
    expect(
      computeLateFee({ ...base, balancePoisha: taka(5000), today: '2026-12-13', lateFeeAlreadyApplied: true }),
    ).toBe(0);
  });

  it('fully paid bill gets no late fee', () => {
    expect(computeLateFee({ ...base, balancePoisha: 0, today: '2026-12-13' })).toBe(0);
  });

  it('within grace (due + grace_days inclusive) there is no fee; the day after there is', () => {
    expect(computeLateFee({ ...base, balancePoisha: taka(5000), today: '2026-12-10' })).toBe(0);
    expect(computeLateFee({ ...base, balancePoisha: taka(5000), today: '2026-12-12' })).toBe(0);
    expect(computeLateFee({ ...base, balancePoisha: taka(5000), today: '2026-12-13' })).toBeGreaterThan(0);
  });

  it('percent fee rounds half up to a whole taka at ৳x.50 (5% of ৳1,010 = ৳50.50 → ৳51)', () => {
    expect(computeLateFee({ ...base, balancePoisha: taka(1010), today: '2026-12-13' })).toBe(taka(51));
  });

  it('percent fee rounds down below ৳x.50 (5% of ৳1,009 = ৳50.45 → ৳50)', () => {
    expect(computeLateFee({ ...base, balancePoisha: taka(1009), today: '2026-12-13' })).toBe(taka(50));
  });

  it('flat fee applies the building flat amount regardless of balance', () => {
    const flat = { ...base, lateFeeType: 'flat' as const, lateFeeValue: taka(300) };
    expect(computeLateFee({ ...flat, balancePoisha: taka(5000), today: '2026-12-13' })).toBe(taka(300));
    expect(computeLateFee({ ...flat, balancePoisha: taka(50), today: '2026-12-13' })).toBe(taka(300));
  });

  it("type 'none' never charges a fee", () => {
    expect(
      computeLateFee({ ...base, lateFeeType: 'none', lateFeeValue: 0, balancePoisha: taka(5000), today: '2026-12-13' }),
    ).toBe(0);
  });

  it('waiving reduces the fee to 0 and keeps the reason', () => {
    expect(waiveLateFee({ currentFeePoisha: taka(250), reason: 'Paid by cheque, bank delay' })).toEqual({
      amountPoisha: 0,
      reason: 'Paid by cheque, bank delay',
    });
  });

  it('waiving needs a reason', () => {
    expect(() => waiveLateFee({ currentFeePoisha: taka(250), reason: '  ' })).toThrowError(
      codeOf('VALIDATION_FAILED'),
    );
  });
});

describe('Rule 5 — payment allocation', () => {
  const bill = (id: string, periodMonth: string, total: number, paid = 0) => ({
    id,
    periodMonth,
    totalPoisha: taka(total),
    paidPoisha: taka(paid),
  });

  it('5: Oct ৳3,000 + Nov ৳14,000 unpaid, pays ৳20,000 → both paid, credit ৳3,000', () => {
    const res = allocatePayment({
      amountPoisha: taka(20000),
      bills: [bill('nov', '2026-11-01', 14000), bill('oct', '2026-10-01', 3000)], // unsorted on purpose
    });
    expect(res.allocations).toEqual([
      { billId: 'oct', amountPoisha: taka(3000), status: 'paid' },
      { billId: 'nov', amountPoisha: taka(14000), status: 'paid' },
    ]);
    expect(res.creditPoisha).toBe(taka(3000));
  });

  it('payment exactly equal to dues leaves 0 credit', () => {
    const res = allocatePayment({
      amountPoisha: taka(17000),
      bills: [bill('oct', '2026-10-01', 3000), bill('nov', '2026-11-01', 14000)],
    });
    expect(res.creditPoisha).toBe(0);
    expect(res.allocations.map((a) => a.status)).toEqual(['paid', 'paid']);
  });

  it('allocates across 3 bills oldest period first; the last one is partially paid', () => {
    const res = allocatePayment({
      amountPoisha: taka(20000),
      bills: [
        bill('dec', '2026-12-01', 14000),
        bill('oct', '2026-10-01', 6000),
        bill('nov', '2026-11-01', 8000, 2000), // balance 6,000
      ],
    });
    expect(res.allocations).toEqual([
      { billId: 'oct', amountPoisha: taka(6000), status: 'paid' },
      { billId: 'nov', amountPoisha: taka(6000), status: 'paid' },
      { billId: 'dec', amountPoisha: taka(8000), status: 'partially_paid' },
    ]);
    expect(res.creditPoisha).toBe(0);
  });

  it('a payment smaller than the oldest balance only touches that bill', () => {
    const res = allocatePayment({
      amountPoisha: taka(1000),
      bills: [bill('oct', '2026-10-01', 3000), bill('nov', '2026-11-01', 14000)],
    });
    expect(res.allocations).toEqual([{ billId: 'oct', amountPoisha: taka(1000), status: 'partially_paid' }]);
    expect(res.creditPoisha).toBe(0);
  });

  it('with no unpaid bills the whole payment becomes credit', () => {
    expect(allocatePayment({ amountPoisha: taka(500), bills: [] })).toEqual({
      allocations: [],
      creditPoisha: taka(500),
    });
  });

  it('allocated amounts + credit always equal the payment', () => {
    const amount = taka(12345);
    const res = allocatePayment({
      amountPoisha: amount,
      bills: [bill('a', '2026-01-01', 1000), bill('b', '2026-02-01', 2000)],
    });
    expect(res.allocations.reduce((s, a) => s + a.amountPoisha, 0) + res.creditPoisha).toBe(amount);
  });

  it('rejects a zero or negative payment', () => {
    expect(() => allocatePayment({ amountPoisha: 0, bills: [] })).toThrowError(codeOf('VALIDATION_FAILED'));
    expect(() => allocatePayment({ amountPoisha: -100, bills: [] })).toThrowError(codeOf('VALIDATION_FAILED'));
  });

  it('5 (cont.): Dec bill ৳14,000 issued with ৳3,000 credit → applied 3,000, balance 11,000, partially_paid', () => {
    expect(applyCreditToBill({ creditPoisha: taka(3000), bill: { totalPoisha: taka(14000), paidPoisha: 0 } })).toEqual({
      appliedPoisha: taka(3000),
      balancePoisha: taka(11000),
      remainingCreditPoisha: 0,
      status: 'partially_paid',
    });
  });

  it('credit bigger than the bill pays it fully and leaves the rest as credit', () => {
    expect(applyCreditToBill({ creditPoisha: taka(20000), bill: { totalPoisha: taka(14000), paidPoisha: 0 } })).toEqual({
      appliedPoisha: taka(14000),
      balancePoisha: 0,
      remainingCreditPoisha: taka(6000),
      status: 'paid',
    });
  });

  it('no credit leaves the bill as issued', () => {
    expect(applyCreditToBill({ creditPoisha: 0, bill: { totalPoisha: taka(14000), paidPoisha: 0 } })).toEqual({
      appliedPoisha: 0,
      balancePoisha: taka(14000),
      remainingCreditPoisha: 0,
      status: 'issued',
    });
  });
});

describe('Rule 6 — voiding a payment', () => {
  it('reverses allocations, restores each bill balance and status, removes the credit it created', () => {
    const res = voidPayment({
      allocations: [
        { billId: 'oct', amountPoisha: taka(3000) },
        { billId: 'nov', amountPoisha: taka(14000) },
      ],
      creditCreatedPoisha: taka(3000),
      creditBalancePoisha: taka(3000), // credit not used yet
      creditApplications: [],
      bills: [
        { id: 'oct', totalPoisha: taka(3000), paidPoisha: taka(3000) },
        { id: 'nov', totalPoisha: taka(14000), paidPoisha: taka(14000) },
      ],
    });
    expect(res.bills).toEqual([
      { id: 'oct', paidPoisha: 0, balancePoisha: taka(3000), status: 'issued' },
      { id: 'nov', paidPoisha: 0, balancePoisha: taka(14000), status: 'issued' },
    ]);
    expect(res.creditBalancePoisha).toBe(0);
  });

  it('a partly reversed bill becomes partially_paid', () => {
    const res = voidPayment({
      allocations: [{ billId: 'oct', amountPoisha: taka(1000) }],
      creditCreatedPoisha: 0,
      creditBalancePoisha: 0,
      creditApplications: [],
      bills: [{ id: 'oct', totalPoisha: taka(3000), paidPoisha: taka(3000) }],
    });
    expect(res.bills).toEqual([{ id: 'oct', paidPoisha: taka(2000), balancePoisha: taka(1000), status: 'partially_paid' }]);
  });

  it('credit already used by a later bill: that bill becomes unpaid again by that amount', () => {
    // Example 5 then void: Dec bill had ৳3,000 of the credit applied.
    const res = voidPayment({
      allocations: [
        { billId: 'oct', amountPoisha: taka(3000) },
        { billId: 'nov', amountPoisha: taka(14000) },
      ],
      creditCreatedPoisha: taka(3000),
      creditBalancePoisha: 0, // all of it consumed by Dec
      creditApplications: [{ billId: 'dec', amountPoisha: taka(3000) }],
      bills: [
        { id: 'oct', totalPoisha: taka(3000), paidPoisha: taka(3000) },
        { id: 'nov', totalPoisha: taka(14000), paidPoisha: taka(14000) },
        { id: 'dec', totalPoisha: taka(14000), paidPoisha: taka(3000) },
      ],
    });
    expect(res.bills).toEqual([
      { id: 'oct', paidPoisha: 0, balancePoisha: taka(3000), status: 'issued' },
      { id: 'nov', paidPoisha: 0, balancePoisha: taka(14000), status: 'issued' },
      { id: 'dec', paidPoisha: 0, balancePoisha: taka(14000), status: 'issued' },
    ]);
    expect(res.creditBalancePoisha).toBe(0);
  });

  it('credit partly used: the remaining credit is removed first, then the later bill gives back the rest', () => {
    const res = voidPayment({
      allocations: [],
      creditCreatedPoisha: taka(5000),
      creditBalancePoisha: taka(2000), // 3,000 was applied to dec
      creditApplications: [{ billId: 'dec', amountPoisha: taka(3000) }],
      bills: [{ id: 'dec', totalPoisha: taka(14000), paidPoisha: taka(3000) }],
    });
    expect(res.creditBalancePoisha).toBe(0);
    expect(res.bills).toEqual([{ id: 'dec', paidPoisha: 0, balancePoisha: taka(14000), status: 'issued' }]);
  });
});

describe('Rule 7 — move-out settlement', () => {
  it('7: deposit ৳24,000, unpaid Jan ৳2,000 + final Feb ৳5,357, credit 0 → refund ৳16,643', () => {
    const res = computeSettlement({
      depositPoisha: taka(24000),
      unpaidBalancesPoisha: [taka(2000), taka(5357)],
      creditPoisha: 0,
    });
    expect(res.settlementPoisha).toBe(taka(16643));
    expect(res.outcome).toBe('refund');
    expect(res.leaseStatus).toBe('ended');
  });

  it('credit is added to the settlement', () => {
    expect(
      computeSettlement({ depositPoisha: taka(24000), unpaidBalancesPoisha: [taka(2000)], creditPoisha: taka(1000) })
        .settlementPoisha,
    ).toBe(taka(23000));
  });

  it('dues larger than the deposit: negative settlement, tenant owes ৳5,000, lease ended_with_dues', () => {
    const res = computeSettlement({
      depositPoisha: taka(10000),
      unpaidBalancesPoisha: [taka(15000)],
      creditPoisha: 0,
    });
    expect(res.settlementPoisha).toBe(-taka(5000));
    expect(res.outcome).toBe('tenant_owes');
    expect(res.leaseStatus).toBe('ended_with_dues');
  });

  it('exactly zero: nothing to refund, nothing owed', () => {
    const res = computeSettlement({ depositPoisha: taka(5000), unpaidBalancesPoisha: [taka(5000)], creditPoisha: 0 });
    expect(res.settlementPoisha).toBe(0);
    expect(res.outcome).toBe('even');
    expect(res.leaseStatus).toBe('ended');
  });
});
