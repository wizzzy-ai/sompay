import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, MessageCircle, Mail, Phone, ArrowRight, Copy } from 'lucide-react';
import './Support.css';

const SUPPORT_EMAIL = 'support@sompay.com';
const SUPPORT_PHONE = '+234 000 000 0000';

const HelpTopic = ({ title, text }) => (
  <div className="support-topic">
    <h3>{title}</h3>
    <p>{text}</p>
  </div>
);

export default function Support() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState('');

  const supportUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/support';
    return `${window.location.origin}${import.meta.env.BASE_URL || '/'}support`.replace(/\/\/support$/, '/support');
  }, []);

  const openChat = () => {
    window.dispatchEvent(new Event('psp_open_chat'));
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="support-page">
      <div className="support-shell">
        <header className="support-hero">
          <div>
            <p className="support-kicker">Sompay PSP</p>
            <h1>
              <LifeBuoy size={28} />
              Help & Support
            </h1>
            <p className="support-sub">
              Get help with login, verification (OTP), company assignment, payments, and plans.
            </p>
          </div>

          <div className="support-hero-actions">
            <button type="button" className="support-btn support-btn-soft" onClick={() => navigate('/contact')}>
              <ArrowRight size={16} />
              Contact Page
            </button>
            <button type="button" className="support-btn support-btn-primary" onClick={openChat}>
              <MessageCircle size={16} />
              Chat With Assistant
            </button>
          </div>
        </header>

        <section className="support-grid">
          <article className="support-card">
            <h2>Quick fixes</h2>
            <div className="support-topics">
              <HelpTopic
                title="I get logged out immediately"
                text="Check your device date/time, log in again, and avoid multiple tabs. If it still happens, contact support with the exact error."
              />
              <HelpTopic
                title="OTP not received"
                text="Check spam/junk, click Resend OTP, and confirm your email is correct."
              />
              <HelpTopic
                title="Payment pending/failed"
                text="Refresh after a few minutes. If it repeats, share the Payment UUID and time of attempt."
              />
              <HelpTopic
                title="Company shows “Not assigned”"
                text="Log out then log in again. If you recently switched companies, the company admin may need to approve your request."
              />
            </div>
          </article>

          <aside className="support-card support-aside">
            <h2>Contact</h2>

            <div className="support-contact">
              <div className="support-contact-row">
                <Mail size={18} />
                <div className="support-contact-copy">
                  <span>Email</span>
                  <strong>{SUPPORT_EMAIL}</strong>
                </div>
                <button
                  type="button"
                  className="support-icon-btn"
                  onClick={() => copy(SUPPORT_EMAIL, 'email')}
                  title="Copy email"
                >
                  <Copy size={16} />
                </button>
              </div>

              <div className="support-contact-row">
                <Phone size={18} />
                <div className="support-contact-copy">
                  <span>Phone</span>
                  <strong>{SUPPORT_PHONE}</strong>
                </div>
                <button
                  type="button"
                  className="support-icon-btn"
                  onClick={() => copy(SUPPORT_PHONE, 'phone')}
                  title="Copy phone"
                >
                  <Copy size={16} />
                </button>
              </div>

              <div className="support-contact-row support-contact-url">
                <span className="support-contact-badge">URL</span>
                <div className="support-contact-copy">
                  <span>Support page link</span>
                  <strong className="support-url">{supportUrl}</strong>
                </div>
                <button
                  type="button"
                  className="support-icon-btn"
                  onClick={() => copy(supportUrl, 'url')}
                  title="Copy URL"
                >
                  <Copy size={16} />
                </button>
              </div>

              {copied ? <div className="support-copied">Copied.</div> : null}
            </div>

            <div className="support-note">
              <p>
                Don’t share passwords or OTP codes. For security issues, report what you observed without exploit steps.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

