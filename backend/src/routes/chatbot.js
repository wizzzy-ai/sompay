import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

function safeTrim(value, maxLen) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function getCallerContext(req) {
  const auth = String(req.headers?.authorization || '');
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const payload = token ? jwt.decode(token) : null;
  const userType = typeof payload === 'object' && payload ? payload.userType : null;

  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || null;
  const supportPhone = process.env.SUPPORT_PHONE || null;
  const supportWhatsApp = process.env.SUPPORT_WHATSAPP || null;
  const supportUrl = process.env.SUPPORT_URL || null;

  return {
    userType: typeof userType === 'string' ? userType : null,
    supportEmail,
    supportPhone,
    supportWhatsApp,
    supportUrl,
  };
}

function contactLine(ctx) {
  const contacts = [];
  if (ctx.supportEmail) contacts.push(`Email: ${ctx.supportEmail}`);
  if (ctx.supportPhone) contacts.push(`Phone: ${ctx.supportPhone}`);
  if (ctx.supportWhatsApp) contacts.push(`WhatsApp: ${ctx.supportWhatsApp}`);
  if (ctx.supportUrl) contacts.push(`Support: ${ctx.supportUrl}`);

  if (contacts.length) return `Contact: ${contacts.join(' • ')}`;

  if (ctx.userType === 'company') {
    return 'Contact: Please reach out to the PSP platform admin/support team.';
  }
  if (ctx.userType === 'user') {
    return 'Contact: Please reach out to your company admin/support team.';
  }
  return 'Contact: Please reach out to the PSP support team.';
}

function containsAny(text, list) {
  return list.some((k) => text.includes(k));
}

function isDisallowed(lower) {
  const hacky = [
    'hack',
    'exploit',
    'bypass',
    'sql injection',
    'xss',
    'csrf',
    'ddos',
    'dos attack',
    'bruteforce',
    'brute force',
    'steal',
    'phish',
    'phishing',
    'carding',
    'fraud',
    'crack',
    'keylogger',
    'malware',
    'ransomware',
    'backdoor',
    'botnet',
    'admin password',
    'get admin access',
    'how to break',
    'how to compromise',
  ];
  return containsAny(lower, hacky);
}

function makeReply(req, message) {
  const ctx = getCallerContext(req);
  const text = safeTrim(message, 700);
  const lower = text.toLowerCase();

  if (!text) return "Type your question and I’ll help.";

  if (isDisallowed(lower)) {
    return [
      "I can’t help with hacking, bypassing security, or anything illegal.",
      "If you found a security issue, share what you observed (without exploit steps) and I’ll help you report it safely.",
      contactLine(ctx),
    ].join('\n');
  }

  // Common issues / FAQ (PSP website)
  if (containsAny(lower, ['login', 'log in', 'sign in', 'signin', 'logout', 'log out', 'sign out'])) {
    if (containsAny(lower, ['logs me out', 'log me out', 'kicks me out', 'immediately', 'instantly'])) {
      return [
        'If you get logged out immediately, try:',
        '1) Make sure your device date/time is correct.',
        '2) Log in again, then do not open the site in multiple tabs at the same time.',
        '3) Clear `sessionStorage` for the site (token) and log in again.',
        '4) If you are an admin/company account, use the correct login page: `/admin-login` or `/company-login`.',
        contactLine(ctx),
      ].join('\n');
    }

    if (containsAny(lower, ['github'])) {
      return [
        "GitHub login: click 'Continue with GitHub' on the login page.",
        "If it fails in local dev, set GitHub OAuth callback URL to `http://localhost:5000/auth/github/callback` (or your deployed backend URL).",
        contactLine(ctx),
      ].join('\n');
    }

    if (containsAny(lower, ['google'])) {
      return [
        "Google login: click 'Continue with Google' on the login page.",
        'If it fails, confirm your Google OAuth redirect/callback URL is configured for your backend callback route.',
        contactLine(ctx),
      ].join('\n');
    }

    return [
      'Login help:',
      '1) Confirm you are using the right portal (Client / Admin / Company).',
      '2) If you see “Invalid or expired token”, log in again.',
      '3) If you forgot your password, use the reset/forgot password flow.',
      contactLine(ctx),
    ].join('\n');
  }

  if (containsAny(lower, ['otp', 'verify', 'verification', 'code'])) {
    return [
      'Verification (OTP):',
      '1) Check spam/junk folder.',
      '2) Use “Resend OTP” on the verification screen.',
      '3) Make sure your email is typed correctly.',
      contactLine(ctx),
    ].join('\n');
  }

  if (containsAny(lower, ['company', 'assigned', 'not assigned', 'join request'])) {
    return [
      'Company assignment:',
      '1) If your profile shows “Not assigned” but you are assigned, log out and log in again.',
      '2) If you changed companies recently, the company admin may need to approve your join request.',
      '3) If it still doesn’t update, send your email + company name to support so they can verify the assignment in the database.',
      contactLine(ctx),
    ].join('\n');
  }

  if (containsAny(lower, ['payment', 'pay', 'invoice', 'receipt', 'uuid', 'failed', 'pending'])) {
    if (containsAny(lower, ['failed'])) {
      return [
        'Payment failed:',
        '1) Retry the payment after a few minutes.',
        '2) Confirm your plan is active and you selected the correct billing month/year.',
        '3) If the failure repeats, share the Payment UUID and time of attempt.',
        contactLine(ctx),
      ].join('\n');
    }

    if (containsAny(lower, ['pending'])) {
      return [
        'Payment pending:',
        '1) Refresh the page after 1–3 minutes.',
        '2) Check Payments History for updates.',
        '3) If it stays pending for long, share the Payment UUID.',
        contactLine(ctx),
      ].join('\n');
    }

    return [
      'Payments:',
      '1) Use Payments History to see paid/pending items.',
      '2) Use filters (month/year/status/uuid/email) to find a transaction.',
      '3) If you need a receipt, open the payment and use Export/Print.',
      contactLine(ctx),
    ].join('\n');
  }

  if (containsAny(lower, ['plan', 'pricing', 'subscription'])) {
    return [
      'Plans:',
      '1) Pick a plan from the pricing page (or your dashboard).',
      '2) Complete payment to activate.',
      '3) Company accounts manage clients and dues from the Company Dashboard.',
      contactLine(ctx),
    ].join('\n');
  }

  if (containsAny(lower, ['error', 'issue', 'bug', 'not working', 'cant', "can't", 'failed'])) {
    return [
      'I can help troubleshoot. Please send:',
      '1) The exact error message.',
      '2) The page you were on (e.g. `/login`, `/company/payments`).',
      '3) What you expected vs what happened.',
      contactLine(ctx),
    ].join('\n');
  }

  return [
    "Ask me anything about the PSP website (login, verification, company, payments, plans, dashboards).",
    'If you paste an error message or describe the screen you’re on, I’ll guide you step-by-step.',
    contactLine(ctx),
  ].join('\n');
}

router.post('/message', limiter, (req, res) => {
  const message = safeTrim(req.body?.message, 700);
  const reply = makeReply(req, message);
  res.json({ reply });
});

export default router;
