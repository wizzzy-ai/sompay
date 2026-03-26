import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Download, Eye, Filter, Plus, RefreshCw, Wallet, X } from 'lucide-react';
import { paymentAPI } from '../../api/paymentAPI';
import './PaymentsHistory.css';

const MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

const currentYear = new Date().getFullYear();

const normalizePaymentStatus = (value) => {
  const status = String(value || 'unpaid').toLowerCase();
  if (status === 'declined') return 'failed';
  if (status === 'paid' || status === 'pending' || status === 'failed' || status === 'unpaid') return status;
  return 'unpaid';
};

const normalizePayments = (payload) => {
  const list = Array.isArray(payload?.transactions)
    ? payload.transactions
    : Array.isArray(payload?.payments)
      ? payload.payments
      : Array.isArray(payload?.data?.transactions)
        ? payload.data.transactions
        : Array.isArray(payload?.data?.payments)
          ? payload.data.payments
      : Array.isArray(payload)
        ? payload
        : [];

	  return list.map((item) => {
    const dateRaw = item.paymentDate || item.createdAt || item.date || item.updatedAt;
    const dateObj = dateRaw ? new Date(dateRaw) : null;

	    return {
	      id: item._id || item.id || `${item.month || 'm'}-${item.year || 'y'}-${item.amount || 0}`,
	      month: Number(item.month || (dateObj ? dateObj.getMonth() + 1 : 0)) || 0,
	      year: Number(item.year || (dateObj ? dateObj.getFullYear() : 0)) || 0,
	      amount: Number(item.amount || 0),
	      dueAmount: item.dueAmount != null ? Number(item.dueAmount) : null,
	      baseDueAmount: item.baseDueAmount != null ? Number(item.baseDueAmount) : null,
	      extraChargeTotal: Number(item.extraChargeTotal || 0),
	      outstanding: item.outstanding != null ? Number(item.outstanding) : null,
	      paidAmount: item.paidAmount != null ? Number(item.paidAmount) : null,
	      pendingAmount: item.pendingAmount != null ? Number(item.pendingAmount) : null,
	      attemptAmount: item.attemptAmount != null ? Number(item.attemptAmount) : null,
	      status: normalizePaymentStatus(item.status),
	      notes: item.notes || '',
	      decision: item.decision || item.metadata?.decision || null,
	      paymentDate: dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj : null,
	      uuid: item.uuid || null,
	      receipt: item.receipt || null,
	    };
	  });
	};

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);

const formatDate = (date) => (date ? date.toLocaleDateString() : 'N/A');
const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const cleanInlineText = (value, maxLen = 220) => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
};

const getDecisionReason = (decision) => {
  if (!decision) return '';
  if (typeof decision === 'string') return cleanInlineText(decision, 240);
  if (typeof decision === 'object') return cleanInlineText(decision.reason, 240);
  return '';
};

const getDeclineReasonForPayment = (payment) => {
  if (!payment) return '';
  const wasDeclined =
    payment.status === 'failed' ||
    payment.status === 'declined' ||
    (typeof payment.decision === 'object' && payment.decision?.status === 'declined');
  if (!wasDeclined) return '';
  return (
    getDecisionReason(payment.decision) ||
    cleanInlineText(payment.notes, 240) ||
    'Declined by your company. No reason was provided.'
  );
};

const getDisplayPaidAmount = (payment) => {
  if (!payment) return 0;
  const paid = Number(payment.paidAmount ?? 0);
  if (paid > 0) return paid;
  const pending = Number(payment.pendingAmount ?? 0);
  if (payment.status === 'pending' && pending > 0) return pending;
  const attempted = Number(payment.attemptAmount ?? 0);
  if ((payment.status === 'failed' || payment.status === 'pending') && attempted > 0) return attempted;
  return Number(payment.amount ?? 0);
};

const DECLINE_NOTICE_KEY = 'psp_payment_decline_notice_v1';

const PaymentsHistory = () => {
  const [payments, setPayments] = useState([]);
  const [filters, setFilters] = useState({ month: '', year: String(currentYear), status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [declineNotice, setDeclineNotice] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [dueInfo, setDueInfo] = useState({
    loading: false,
    hasDue: false,
    dueAmount: null,
    outstanding: null,
    baseDueAmount: null,
    extraChargeTotal: 0,
    totalOutstanding: 0,
    pendingMonths: 0,
    missedMonths: 0,
    nextPendingDue: null,
    paymentStatus: 'unpaid',
    notes: null
  });

  const [formData, setFormData] = useState({
    month: '',
    amount: ''
  });

  const getPeriodLabel = (payment) => {
    const monthLabel = MONTHS.find((m) => Number(m.value) === Number(payment?.month))?.label || payment?.month || '-';
    const yearLabel = payment?.year || '-';
    return `${monthLabel} ${yearLabel}`.trim();
  };

  const markDeclineSeen = (paymentId) => {
    try {
      if (!paymentId) return;
      localStorage.setItem(DECLINE_NOTICE_KEY, String(paymentId));
    } catch {
      // ignore
    }
  };

  const getLastSeenDeclineId = () => {
    try {
      return localStorage.getItem(DECLINE_NOTICE_KEY);
    } catch {
      return null;
    }
  };

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (filters.month) params.month = filters.month;
      if (filters.year) params.year = filters.year;
      if (filters.status) params.status = filters.status;

      const response = await paymentAPI.getMyPayments(params);
      const normalized = normalizePayments(response.data);
      normalized.sort((a, b) => {
        const aTime = a.paymentDate ? a.paymentDate.getTime() : 0;
        const bTime = b.paymentDate ? b.paymentDate.getTime() : 0;
        return bTime - aTime;
      });
      setPayments(normalized);

      const lastSeen = getLastSeenDeclineId();
      const latestDeclined = normalized.find((p) => !!getDeclineReasonForPayment(p));
      if (latestDeclined && String(latestDeclined.id) !== String(lastSeen || '')) {
        setDeclineNotice(latestDeclined);
      } else if (!latestDeclined) {
        setDeclineNotice(null);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load payment records');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleApplyFilters = () => {
    fetchPayments();
  };

  const fetchDueForMonth = async (monthValue) => {
    if (!monthValue) {
      setDueInfo({
        loading: false,
        hasDue: false,
        dueAmount: null,
        paymentStatus: 'unpaid',
        notes: null
      });
      setFormData((s) => ({ ...s, amount: '' }));
      return;
    }

    try {
      setDueInfo((s) => ({ ...s, loading: true }));
      const response = await paymentAPI.getMyDue({
        month: monthValue,
        year: currentYear
      });
      const data = response.data || {};
      const amountValue = data.hasDue ? String(data.dueAmount ?? '') : '';
      setDueInfo({
        loading: false,
        hasDue: !!data.hasDue,
        dueAmount: data.dueAmount ?? null,
        outstanding: data.outstanding ?? null,
        baseDueAmount: data.baseDueAmount ?? null,
        extraChargeTotal: data.extraChargeTotal ?? 0,
        totalOutstanding: Number(data.totalOutstanding ?? 0),
        pendingMonths: Number(data.pendingMonths ?? 0),
        missedMonths: Number(data.missedMonths ?? 0),
        nextPendingDue: data.nextPendingDue ?? null,
        paymentStatus: data.paymentStatus || 'unpaid',
        notes: data.notes || null
      });
      const outstandingValue = data.hasDue ? String(data.outstanding ?? data.dueAmount ?? '') : '';
      setFormData((s) => ({ ...s, amount: outstandingValue || amountValue }));
    } catch (err) {
      setDueInfo({
        loading: false,
        hasDue: false,
        dueAmount: null,
        outstanding: null,
        baseDueAmount: null,
        extraChargeTotal: 0,
        totalOutstanding: 0,
        pendingMonths: 0,
        missedMonths: 0,
        nextPendingDue: null,
        paymentStatus: 'unpaid',
        notes: null
      });
      setFormData((s) => ({ ...s, amount: '' }));
      setError(err.response?.data?.error || 'Failed to fetch due amount');
    }
  };

  useEffect(() => {
    if (!showPaymentForm) return;
    fetchDueForMonth(formData.month);
  }, [showPaymentForm, formData.month]);

	const handleMakePayment = async (e) => {
	    e.preventDefault();
	    if (!formData.month || !formData.amount) {
	      setError('Please provide month and amount');
	      return;
	    }
	    if (!dueInfo.hasDue) {
	      setError('No due amount has been assigned for this month yet');
	      return;
	    }
	    if ((dueInfo.outstanding ?? 0) <= 0) {
	      setError('This month is already fully paid');
	      return;
	    }
	    const enteredAmount = Number(formData.amount);
	    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
	      setError('Please enter a valid amount');
	      return;
	    }
	    if (enteredAmount > (dueInfo.outstanding ?? enteredAmount)) {
	      setError(`Amount cannot exceed remaining balance (${formatCurrency(dueInfo.outstanding ?? 0)})`);
	      return;
	    }

    try {
      setPaymentLoading(true);
      setError('');
      setSuccess('');

	      await paymentAPI.initiatePayment({
	        month: parseInt(formData.month, 10),
	        year: currentYear,
	        amount: enteredAmount
	      });

      setSuccess('Payment submitted. Awaiting company confirmation.');
      setFormData({ month: '', amount: '' });
      setShowPaymentForm(false);
      fetchPayments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setPaymentLoading(false);
    }
	};

  const nextUnpaidLabel = useMemo(() => {
    if (!dueInfo.nextPendingDue) return null;
    const month = Number(dueInfo.nextPendingDue.month || 1) - 1;
    const year = Number(dueInfo.nextPendingDue.year || new Date().getFullYear());
    return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [dueInfo.nextPendingDue]);

  const summary = useMemo(() => {
    const total = payments.reduce((acc, p) => acc + p.amount, 0);
    const paid = payments.filter((p) => p.status === 'paid').length;
    const pending = payments.filter((p) => p.status === 'pending').length;
    const failed = payments.filter((p) => !!getDeclineReasonForPayment(p)).length;
    return {
      totalAmount: total,
      totalCount: payments.length,
      paidCount: paid,
      pendingCount: pending,
      failedCount: failed
    };
  }, [payments]);

  const failedPayments = useMemo(() => {
    return payments.filter((p) => !!getDeclineReasonForPayment(p));
  }, [payments]);

  const openDetails = (payment) => setSelectedPayment(payment);
  const closeDetails = () => setSelectedPayment(null);

  const openNoticeDetails = () => {
    if (!declineNotice) return;
    openDetails(declineNotice);
    markDeclineSeen(declineNotice.id);
    setDeclineNotice(null);
  };

  const dismissNotice = () => {
    if (declineNotice?.id) markDeclineSeen(declineNotice.id);
    setDeclineNotice(null);
  };

  const downloadReceiptCSV = (payment) => {
	    const rows = [
	      ['Payment Receipt'],
	      [],
	      ['Field', 'Value'],
      ['Month', MONTHS.find((m) => Number(m.value) === payment.month)?.label || payment.month],
      ['Year', payment.year],
      ['Amount', formatCurrency(payment.amount)],
      ['Status', payment.status.toUpperCase()],
      ['Payment Date', formatDate(payment.paymentDate)],
	      ['Transaction ID', payment.id],
	      ['Notes', payment.notes || '-'],
	      ['Downloaded', new Date().toLocaleString()]
	    ];

	    if (payment.decision?.status === 'declined' && payment.decision?.reason) {
	      rows.splice(rows.length - 1, 0, ['Decline reason', payment.decision.reason]);
	    }

    const csv = rows.map((r) => r.map((c) => `"${String(c)}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Receipt_${payment.year}_${payment.month}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadReceiptPDF = (payment) => {
    const doc = new jsPDF();
    const width = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFontSize(18);
    doc.setTextColor(170, 140, 44);
    doc.text('PAYMENT RECEIPT', width / 2, y, { align: 'center' });
    y += 12;

    doc.setDrawColor(212, 175, 55);
    doc.line(20, y, width - 20, y);
    y += 12;

	    const rows = [
	      ['Month', MONTHS.find((m) => Number(m.value) === payment.month)?.label || payment.month],
	      ['Year', payment.year],
	      ['Amount', formatCurrency(payment.amount)],
	      ['Status', payment.status.toUpperCase()],
	      ['Payment Date', formatDate(payment.paymentDate)],
	      ['Transaction ID', payment.id],
	      ['Notes', payment.notes || '-']
	    ];

	    if (payment.decision?.status === 'declined' && payment.decision?.reason) {
	      rows.push(['Decline reason', payment.decision.reason]);
	    }

    doc.setFontSize(11);
    rows.forEach(([label, value]) => {
      doc.setTextColor(44, 44, 44);
      doc.text(`${label}:`, 20, y);
      doc.setTextColor(102, 102, 102);
      doc.text(String(value), 70, y);
      y += 8;
    });

    doc.setTextColor(140, 140, 140);
    doc.text(`Generated ${new Date().toLocaleString()}`, width / 2, 285, { align: 'center' });
    doc.save(`Receipt_${payment.year}_${payment.month}_${Date.now()}.pdf`);
  };

  const printReceipt = (payment) => {
    const receiptWindow = window.open('', '', 'width=900,height=700');
    if (!receiptWindow) return;

	    const monthLabel = MONTHS.find((m) => Number(m.value) === payment.month)?.label || payment.month;
	    receiptWindow.document.write(`
	      <html>
        <head>
          <title>Payment Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
            h1 { color: #aa8c2c; margin-bottom: 8px; }
            .line { height: 2px; background: #d4af37; margin: 12px 0 18px; }
            .row { display: grid; grid-template-columns: 180px 1fr; margin: 10px 0; }
            .label { font-weight: 700; }
            .footer { margin-top: 24px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
          </style>
        </head>
        <body>
          <h1>PAYMENT RECEIPT</h1>
          <div class="line"></div>
          <div class="row"><div class="label">Month</div><div>${monthLabel}</div></div>
          <div class="row"><div class="label">Year</div><div>${payment.year}</div></div>
          <div class="row"><div class="label">Amount</div><div>${formatCurrency(payment.amount)}</div></div>
          <div class="row"><div class="label">Status</div><div>${payment.status.toUpperCase()}</div></div>
	          <div class="row"><div class="label">Payment Date</div><div>${formatDate(payment.paymentDate)}</div></div>
	          <div class="row"><div class="label">Transaction ID</div><div>${payment.id}</div></div>
	          <div class="row"><div class="label">Notes</div><div>${escapeHtml(payment.notes || '-')}</div></div>
	          ${
              payment.decision?.status === 'declined' && payment.decision?.reason
                ? `<div class="row"><div class="label">Decline reason</div><div>${escapeHtml(payment.decision.reason)}</div></div>`
                : ''
            }
	          <div class="footer">Printed on ${new Date().toLocaleString()}</div>
	        </body>
	      </html>
	    `);
    receiptWindow.document.close();
    setTimeout(() => {
      receiptWindow.print();
      receiptWindow.close();
    }, 250);
  };

  return (
    <div className="uph-page">
      <div className="uph-shell">
        <header className="uph-header">
          <div>
            <h1>User Payments</h1>
            <p>Manage your PSP payments and download receipts.</p>
          </div>
          <div className="uph-header-actions">
            <button className="uph-btn uph-btn-soft" onClick={fetchPayments}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="uph-btn uph-btn-primary" onClick={() => setShowPaymentForm((v) => !v)}>
              <Plus size={16} />
              {showPaymentForm ? 'Close Form' : 'Record Payment'}
            </button>
          </div>
        </header>

        {error && <div className="uph-alert uph-alert-error">{error}</div>}
        {success && <div className="uph-alert uph-alert-success">{success}</div>}
        {declineNotice ? (
          <div className="uph-alert uph-alert-warning uph-alert-dismissible" role="status">
            <div className="uph-alert-main">
              <div className="uph-alert-title">
                <AlertTriangle size={16} />
                Payment declined
              </div>
              <div className="uph-alert-text">
                Your company declined your payment for <strong>{getPeriodLabel(declineNotice)}</strong>:{' '}
                <span>{getDeclineReasonForPayment(declineNotice)}</span>
              </div>
            </div>

            <div className="uph-alert-actions">
              <button className="uph-btn uph-btn-soft" type="button" onClick={openNoticeDetails}>
                View
              </button>
              <button className="uph-alert-close" type="button" onClick={dismissNotice} aria-label="Dismiss notification">
                <X size={16} />
              </button>
            </div>
          </div>
        ) : null}

	        <section className="uph-kpis">
	          <article className="uph-kpi">
	            <div className="uph-kpi-icon"><Wallet size={18} /></div>
	            <div>
	              <span>Total Amount</span>
	              <strong>{formatCurrency(summary.totalAmount)}</strong>
	            </div>
	          </article>
	          <article className="uph-kpi">
	            <div className="uph-kpi-icon"><CalendarDays size={18} /></div>
	            <div>
	              <span>Total Records</span>
	              <strong>{summary.totalCount}</strong>
	            </div>
	          </article>
	          <article className="uph-kpi">
	            <div className="uph-kpi-icon"><CheckCircle2 size={18} /></div>
	            <div>
	              <span>Paid</span>
	              <strong>{summary.paidCount}</strong>
	            </div>
	          </article>
	          <article className="uph-kpi">
	            <div className="uph-kpi-icon"><Clock3 size={18} /></div>
	            <div>
	              <span>Pending</span>
	              <strong>{summary.pendingCount}</strong>
	            </div>
	          </article>
	          <article className="uph-kpi uph-kpi-failed">
	            <div className="uph-kpi-icon"><AlertTriangle size={18} /></div>
	            <div>
	              <span>Failed</span>
	              <strong>{summary.failedCount}</strong>
	            </div>
	          </article>
	        </section>

	        {failedPayments.length ? (
	          <section className="uph-card">
	            <div className="uph-card-head">
	              <h2>Failed Payments</h2>
	              <span>{failedPayments.length} item(s)</span>
	            </div>

	            <div className="uph-failed-list">
	              {failedPayments.slice(0, 5).map((payment) => (
	                <div key={`failed-${payment.id}`} className="uph-failed-item">
	                  <div className="uph-failed-main">
	                    <div className="uph-failed-top">
	                      <strong>{MONTHS.find((m) => Number(m.value) === payment.month)?.label || payment.month} {payment.year}</strong>
	                      <span className="uph-failed-amount">{formatCurrency(payment.amount)}</span>
	                    </div>
	                    <div className="uph-failed-reason">{getDeclineReasonForPayment(payment)}</div>
	                  </div>
	                  <button className="uph-table-btn" onClick={() => openDetails(payment)} type="button">
	                    <Eye size={14} />
	                    View
	                  </button>
	                </div>
	              ))}

	              {failedPayments.length > 5 ? (
	                <div className="uph-failed-more">
	                  Showing 5 of {failedPayments.length}. Use the Status filter to view all failed items.
	                </div>
	              ) : null}
	            </div>
	          </section>
	        ) : null}

        {showPaymentForm && (
          <section className="uph-card">
            <h2>Record New Payment</h2>
            <form className="uph-form" onSubmit={handleMakePayment}>
              <label>
                Month
                <select
                  value={formData.month}
                  onChange={(e) => setFormData((s) => ({ ...s, month: e.target.value }))}
                  required
                >
                  <option value="">Select month</option>
                  {MONTHS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </label>

	              <label>
	                Amount
	                <input
	                  type="number"
	                  min="1"
	                  max={dueInfo.outstanding ?? undefined}
	                  step="0.01"
	                  placeholder="Enter amount"
	                  value={formData.amount}
	                  onChange={(e) => setFormData((s) => ({ ...s, amount: e.target.value }))}
	                  required
	                />
	              </label>

	              <div className="uph-due-box">
	                {dueInfo.loading ? (
	                  <span>Checking due amount...</span>
	                ) : dueInfo.hasDue ? (
	                  <>
	                    <span>
	                      Total Due: {formatCurrency(dueInfo.dueAmount)} · Extra: {formatCurrency(dueInfo.extraChargeTotal)} · Remaining:{' '}
	                      {formatCurrency(dueInfo.outstanding ?? 0)}
	                    </span>
	                    {dueInfo.notes ? <small>Note: {dueInfo.notes}</small> : null}
	                    {(dueInfo.outstanding ?? 0) <= 0 ? <small>This month is fully paid.</small> : null}
	                    {(dueInfo.outstanding ?? 0) <= 0 && dueInfo.totalOutstanding > 0 && nextUnpaidLabel ? (
	                      <div style={{ marginTop: '0.55rem', display: 'grid', gap: '0.5rem' }}>
	                        <small>
	                          You’re paid up for this month, but you still have outstanding dues across {dueInfo.pendingMonths} month(s). Next unpaid:{' '}
	                          {nextUnpaidLabel}.
	                        </small>
	                        <button
	                          type="button"
	                          className="uph-btn uph-btn-soft"
	                          onClick={() =>
	                            setFormData((s) => ({ ...s, month: String(dueInfo.nextPendingDue?.month || '') }))
	                          }
	                        >
	                          <CalendarDays size={14} />
	                          Go to next unpaid month
	                        </button>
	                      </div>
	                    ) : null}
	                  </>
	                ) : (
	                  <span>No due assigned for this month yet.</span>
	                )}
	              </div>

	              <button
	                className="uph-btn uph-btn-primary"
	                type="submit"
	                disabled={paymentLoading || dueInfo.loading || !dueInfo.hasDue || (dueInfo.outstanding ?? 0) <= 0}
	              >
	                {paymentLoading ? 'Processing...' : 'Confirm Payment'}
	              </button>
            </form>
          </section>
        )}

        <section className="uph-card">
          <div className="uph-card-head">
            <h2>Filters</h2>
            <Filter size={16} />
          </div>

          <div className="uph-filters">
            <label>
              Month
              <select
                name="month"
                value={filters.month}
                onChange={(e) => setFilters((s) => ({ ...s, month: e.target.value }))}
              >
                <option value="">All months</option>
                {MONTHS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Year
              <input
                type="number"
                name="year"
                value={filters.year}
                onChange={(e) => setFilters((s) => ({ ...s, year: e.target.value }))}
                placeholder={String(currentYear)}
              />
            </label>

            <label>
              Status
              <select
                name="status"
                value={filters.status}
                onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
	              >
	                <option value="">All status</option>
	                <option value="paid">Paid</option>
	                <option value="pending">Pending</option>
	                <option value="unpaid">Unpaid</option>
	                <option value="failed">Failed</option>
	              </select>
	            </label>

            <button className="uph-btn uph-btn-soft" onClick={handleApplyFilters} type="button">
              Apply
            </button>
          </div>
        </section>

        <section className="uph-card">
          <div className="uph-card-head">
            <h2>Payment History</h2>
            <span>{payments.length} records</span>
          </div>

          {loading ? (
            <div className="uph-loading">Loading payment history...</div>
          ) : payments.length === 0 ? (
            <div className="uph-empty">
              <h3>No payments found</h3>
              <p>Record a payment to get started.</p>
            </div>
          ) : (
	            <div className="uph-table-wrap">
	              <table className="uph-table">
	                <thead>
	                  <tr>
	                    <th>Month</th>
	                    <th>Year</th>
	                    <th>Amount Paid</th>
	                    <th>Status</th>
	                    <th>Reason</th>
	                    <th>Date</th>
	                    <th>Actions</th>
	                  </tr>
	                </thead>
	                <tbody>
	                  {payments.map((payment) => {
	                    const declineReason = getDeclineReasonForPayment(payment);
	                    return (
	                      <tr key={payment.id}>
	                      <td>{MONTHS.find((m) => Number(m.value) === payment.month)?.label || payment.month}</td>
	                      <td>{payment.year || '-'}</td>
	                      <td className="uph-amount">
                          {formatCurrency(getDisplayPaidAmount(payment))}
                          {payment.extraChargeTotal > 0 ? (
                            <div className="uph-amount-sub">
                              Due includes extra charges ({formatCurrency(payment.extraChargeTotal)})
                            </div>
                          ) : null}
                        </td>
	                      <td>
	                        <span className={`uph-status uph-status-${payment.status}`}>
                            {payment.status === 'failed' ? 'FAILED' : payment.status}
                          </span>
	                      </td>
	                      <td className="uph-reason" title={declineReason}>
	                        {declineReason ? declineReason : '-'}
	                      </td>
	                      <td>{formatDate(payment.paymentDate)}</td>
	                      <td>
	                        <button className="uph-table-btn" onClick={() => openDetails(payment)} type="button">
	                          <Eye size={14} />
	                          View
	                        </button>
	                      </td>
	                    </tr>
	                    );
	                  })}
	                </tbody>
	              </table>
	            </div>
	          )}
	        </section>
      </div>

      {selectedPayment && (
        <div className="uph-modal-overlay" onClick={closeDetails}>
          <div className="uph-modal" onClick={(e) => e.stopPropagation()}>
            <header className="uph-modal-head">
              <h3>Payment Details</h3>
              <button onClick={closeDetails} type="button">x</button>
	            </header>

	            <div className="uph-modal-body">
	              {selectedPayment.status === 'failed' ? (
	                <div className="uph-decline-card" role="note" aria-label="Payment declined details">
	                  <div className="uph-decline-title">Payment declined</div>
	                  <div className="uph-decline-reason">
	                    <span>Reason</span>
	                    <strong>{getDeclineReasonForPayment(selectedPayment)}</strong>
	                  </div>
	                  <div className="uph-decline-help">
	                    Check the month/amount, confirm your transaction reference, then contact support if you need help.
	                  </div>
	                  <Link className="uph-decline-link" to="/support">
	                    Go to Support
	                  </Link>
	                </div>
	              ) : null}

	              <div className="uph-detail-row">
	                <span>Total Due</span>
	                <strong>{selectedPayment.dueAmount != null ? formatCurrency(selectedPayment.dueAmount) : '-'}</strong>
	              </div>
	              <div className="uph-detail-row">
	                <span>Base Due</span>
	                <strong>{selectedPayment.baseDueAmount != null ? formatCurrency(selectedPayment.baseDueAmount) : '-'}</strong>
	              </div>
	              <div className="uph-detail-row">
	                <span>Extra Charges</span>
	                <strong>{formatCurrency(selectedPayment.extraChargeTotal || 0)}</strong>
	              </div>
	              <div className="uph-detail-row">
	                <span>Amount Paid</span>
	                <strong>{formatCurrency(getDisplayPaidAmount(selectedPayment))}</strong>
	              </div>
	              <div className="uph-detail-row">
	                <span>Outstanding</span>
	                <strong>
	                  {selectedPayment.outstanding != null ? formatCurrency(selectedPayment.outstanding) : '-'}
	                </strong>
	              </div>
	              <div className="uph-detail-row">
	                <span>Month</span>
	                <strong>{MONTHS.find((m) => Number(m.value) === selectedPayment.month)?.label || selectedPayment.month}</strong>
	              </div>
              <div className="uph-detail-row">
                <span>Year</span>
                <strong>{selectedPayment.year || '-'}</strong>
              </div>
              <div className="uph-detail-row">
                <span>Amount</span>
                <strong>{formatCurrency(selectedPayment.amount)}</strong>
              </div>
              <div className="uph-detail-row">
                <span>Status</span>
                <strong>{selectedPayment.status.toUpperCase()}</strong>
              </div>
              <div className="uph-detail-row">
                <span>Date</span>
                <strong>{formatDate(selectedPayment.paymentDate)}</strong>
              </div>
              <div className="uph-detail-row">
                <span>Transaction ID</span>
                <strong>{selectedPayment.id}</strong>
              </div>
		              <div className="uph-detail-row">
		                <span>Notes</span>
		                <strong>{selectedPayment.notes || '-'}</strong>
		              </div>
		              {selectedPayment.decision?.status === 'declined' && getDecisionReason(selectedPayment.decision) ? (
		                <div className="uph-detail-row">
		                  <span>Company decision</span>
		                  <strong>{getDecisionReason(selectedPayment.decision)}</strong>
		                </div>
		              ) : null}
		            </div>

            <footer className="uph-modal-foot">
              <button className="uph-btn uph-btn-soft" onClick={() => printReceipt(selectedPayment)} type="button">
                Print
              </button>
              <button className="uph-btn uph-btn-soft" onClick={() => downloadReceiptPDF(selectedPayment)} type="button">
                <Download size={14} />
                PDF
              </button>
              <button className="uph-btn uph-btn-primary" onClick={() => downloadReceiptCSV(selectedPayment)} type="button">
                <Download size={14} />
                CSV
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsHistory;
