import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import api from '../api/axios';
import './ChatWidget.css';

const STORAGE_KEY = 'psp_chat_widget_v1';

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  try {
    return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function safeTrim(value, maxLen) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

function loadStoredChat() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.messages)) return null;
    return {
      open: !!parsed.open,
      messages: parsed.messages
        .filter((m) => m && typeof m === 'object')
        .map((m) => ({
          id: typeof m.id === 'string' && m.id ? m.id : newId(),
          role: m.role === 'user' ? 'user' : 'bot',
          content: safeTrim(m.content, 2000),
          at: typeof m.at === 'string' ? m.at : nowIso(),
        }))
        .slice(-30),
    };
  } catch {
    return null;
  }
}

function storeChat(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

const defaultGreeting = {
  id: newId(),
  role: 'bot',
  content:
    "Hi! I'm the PSP assistant. Ask me about signing in, payments, plans, or your account.",
  at: nowIso(),
};

export default function ChatWidget() {
  const stored = useMemo(() => loadStoredChat(), []);
  const [open, setOpen] = useState(stored?.open ?? false);
  const [messages, setMessages] = useState(
    stored?.messages?.length ? stored.messages : [defaultGreeting],
  );
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [enterId, setEnterId] = useState(null);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    storeChat({ open, messages });
  }, [open, messages]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener('psp_open_chat', openChat);
    return () => window.removeEventListener('psp_open_chat', openChat);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus?.();
    listRef.current?.scrollTo?.({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo?.({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);

  const send = async () => {
    setError('');
    const text = safeTrim(draft, 700);
    if (!text || sending) return;
    const startedAt = Date.now();

    const userMessage = { id: newId(), role: 'user', content: text, at: nowIso() };
    setMessages((prev) => [...prev, userMessage]);
    setEnterId(userMessage.id);
    setDraft('');
    setSending(true);

    try {
      const history = [...messages, userMessage]
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));
      const payload = {
        message: text,
        history,
      };

      let r;
      try {
        r = await api.post('/chatbot/message', payload);
      } catch (e) {
        if (e?.response?.status === 404) {
          r = await api.post('/api/chatbot/message', payload);
        } else {
          throw e;
        }
      }

      const replyText = safeTrim(r?.data?.reply, 2000) || 'Sorry, I could not reply.';
      const botMessage = { id: newId(), role: 'bot', content: replyText, at: nowIso() };
      setMessages((prev) => [...prev, botMessage]);
      setEnterId(botMessage.id);
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        'Unable to reach the assistant right now.';
      setError(String(msg));
      const botMessage = {
        id: newId(),
        role: 'bot',
        content: 'I could not connect right now. Please try again in a moment.',
        at: nowIso(),
      };
      setMessages((prev) => [
        ...prev,
        botMessage,
      ]);
      setEnterId(botMessage.id);
    } finally {
      const elapsed = Date.now() - startedAt;
      const minMs = 650;
      if (elapsed < minMs) {
        await new Promise((r) => setTimeout(r, minMs - elapsed));
      }
      setSending(false);
    }
  };

  const resetChat = () => {
    setError('');
    const next = { ...defaultGreeting, id: newId(), at: nowIso() };
    setMessages([next]);
    setEnterId(next.id);
  };

  return (
    <div className="pspchat-root" aria-live="polite">
      {open ? (
        <div className="pspchat-panel" role="dialog" aria-label="Chat assistant">
          <div className="pspchat-head">
            <div className="pspchat-title">
              <span
                className={`pspchat-badge ${open ? 'is-open' : ''} ${
                  sending ? 'is-pinging' : ''
                }`}
                aria-hidden="true"
              >
                <Bot size={16} />
              </span>
              <div>
                <div className="pspchat-name">PSP Assistant</div>
                <div className="pspchat-sub">Ask anything about the platform</div>
              </div>
            </div>

            <div className="pspchat-head-actions">
              <button type="button" className="pspchat-link" onClick={resetChat}>
                Reset
              </button>
              <button
                type="button"
                className="pspchat-icon-btn"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="pspchat-list" ref={listRef}>
            {messages.map((m, idx) => (
              <div
                key={m.id || `${m.at}-${idx}`}
                className={`pspchat-msg ${m.role === 'user' ? 'is-user' : 'is-bot'} ${
                  m.id && m.id === enterId ? 'is-enter' : ''
                }`}
              >
                <div className="pspchat-bubble">{m.content}</div>
              </div>
            ))}
            {sending ? (
              <div className="pspchat-msg is-bot">
                <div className="pspchat-bubble pspchat-typing" aria-label="Assistant is typing">
                  <span className="pspchat-sr">Typing…</span>
                  <span className="pspchat-typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="pspchat-foot">
            {error ? <div className="pspchat-error">{error}</div> : null}
            <div className="pspchat-compose">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                placeholder="Type your message…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send();
                }}
              />
              <button
                type="button"
                className="pspchat-send"
                onClick={send}
                disabled={sending || !safeTrim(draft, 700)}
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={`pspchat-fab ${open ? 'is-open' : 'is-idle'}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat assistant' : 'Open chat assistant'}
      >
        <MessageCircle size={22} />
      </button>
    </div>
  );
}
