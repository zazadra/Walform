'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Loader2, Settings, Key, ChevronDown } from 'lucide-react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import ReactMarkdown from 'react-markdown';

type Message = {
  role: 'user' | 'model';
  content: string;
};

type Provider = 'gemini' | 'groq' | 'openrouter-default' | 'openrouter-custom';

const PROVIDER_LABELS: Record<Provider, string> = {
  'gemini': '✨ Gemini (Free)',
  'groq': '🚀 Groq (Fast)',
  'openrouter-default': '⚡ Ling 3.0 Flash VL',
  'openrouter-custom': '🔑 OpenRouter (My Key)',
};

const LS_KEY = 'walbot_openrouter_api_key';
const LS_MODEL_KEY = 'walbot_openrouter_model';

export function ChatWidget() {
  const account = useCurrentAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [customApiKey, setCustomApiKey] = useState('');
  const [savedApiKey, setSavedApiKey] = useState('');
  const [customModel, setCustomModel] = useState('inclusionai/ling-3.0-flash-vl:free');
  const [savedModel, setSavedModel] = useState('inclusionai/ling-3.0-flash-vl:free');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: "Hey! 👋 I'm Walbot, your Walform AI assistant. Ask me anything about Walform, Walrus Protocol, or the Sui ecosystem!" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved API key & model from localStorage on mount
  useEffect(() => {
    const storedKey = localStorage.getItem(LS_KEY);
    if (storedKey) {
      setSavedApiKey(storedKey);
      setCustomApiKey(storedKey);
    }
    const storedModel = localStorage.getItem(LS_MODEL_KEY);
    if (storedModel) {
      setSavedModel(storedModel);
      setCustomModel(storedModel);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Fetch personalized greeting when chat is opened for the first time
  useEffect(() => {
    if (isOpen && !greeted && account?.address) {
      setGreeted(true);
      fetch(`/api/chat/greet?userId=${account.address}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.hasMemory && data.greeting) {
            setMessages((prev) => {
              const newMsgs = [...prev];
              if (newMsgs.length > 0 && newMsgs[0].role === 'model') {
                newMsgs[0] = { role: 'model', content: data.greeting };
              }
              return newMsgs;
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen, greeted, account?.address]);

  if (!account) return null;

  const handleSaveKey = () => {
    const trimmedKey = customApiKey.trim();
    const trimmedModel = customModel.trim() || 'inclusionai/ling-3.0-flash-vl:free';

    if (trimmedKey) {
      localStorage.setItem(LS_KEY, trimmedKey);
      localStorage.setItem(LS_MODEL_KEY, trimmedModel);
      setSavedApiKey(trimmedKey);
      setSavedModel(trimmedModel);
      setProvider('openrouter-custom');
    } else {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_MODEL_KEY);
      setSavedApiKey('');
      if (provider === 'openrouter-custom') setProvider('gemini');
    }
    setShowSettings(false);
  };

  const handleProviderChange = (val: Provider) => {
    if (val === 'openrouter-custom' && !savedApiKey) {
      // No key saved yet — open settings first
      setShowSettings(true);
      return;
    }
    setProvider(val);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Guard: if custom key selected but not saved, show settings
    if (provider === 'openrouter-custom' && !savedApiKey) {
      setShowSettings(true);
      return;
    }

    const userMessage = input.trim();
    setInput('');
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const backendProvider = provider === 'gemini' ? 'gemini' : provider === 'groq' ? 'groq' : 'openrouter';
      const userKey = provider === 'openrouter-custom' ? savedApiKey : undefined;
      const userModel = provider === 'openrouter-custom' ? savedModel : undefined;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: account.address,
          messages: newMessages,
          provider: backendProvider,
          userOpenRouterKey: userKey,
          userOpenRouterModel: userModel,
        }),
      });

      if (!response.ok) {
        let errDetail = 'Network error';
        try {
          const errData = await response.json();
          if (errData.detail) errDetail = errData.detail;
        } catch (e) {}
        throw new Error(errDetail);
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'model', content: data.reply }]);
    } catch (error: any) {
      console.error(error);
      const errMsg = error.message || '';

      let friendlyError: string;

      if (errMsg.includes('RATE_LIMIT_EXCEEDED') || errMsg.includes('429')) {
        friendlyError = "I'm handling a high volume of requests right now. Please wait a moment and try again.\n\n**Tip:** You can add your own OpenRouter API key via the ⚙️ Settings button to bypass this limit.";
      } else if (errMsg.includes('GEMINI_ERROR')) {
        const rawDetail = errMsg.replace(/GEMINI_ERROR:\d+:/,'');
        let code = '503';
        const codeMatch = errMsg.match(/GEMINI_ERROR:(\d+):/);
        if (codeMatch) code = codeMatch[1];

        if (code === '503' || rawDetail.includes('high demand') || rawDetail.includes('UNAVAILABLE')) {
          friendlyError = "The Gemini service is temporarily experiencing high demand. Please try again in a moment, or switch to another model using the selector above.";
        } else if (code === '400' || rawDetail.includes('API_KEY_INVALID')) {
          friendlyError = "The Gemini API key appears to be invalid. Please check your `GEMINI_API_KEY` environment variable on Vercel.";
        } else if (code === '429') {
          friendlyError = "Gemini's free quota has been reached. Please try again later or switch to another model.";
        } else {
          friendlyError = `The Gemini service returned an error (code ${code}). Please try again or switch to another model.`;
        }
      } else if (errMsg.includes('GROQ_ERROR')) {
        const rawDetail = errMsg.replace(/GROQ_ERROR:\d+:/,'');
        if (rawDetail.includes('413') || rawDetail.includes('request_too_large')) {
          friendlyError = "The conversation is getting too long for Groq's free tier. Please refresh the chat to start a new session, or switch to another model.";
        } else if (rawDetail.includes('404') || rawDetail.includes('model_not_found')) {
          friendlyError = "The selected Groq model is not available on your account's plan. Please switch to another model.";
        } else {
          friendlyError = "The Groq service returned an error. Please try again or switch to another model.";
        }
      } else {
        friendlyError = "Something went wrong while connecting to the AI service. Please try again in a moment.";
      }

      setMessages((prev) => [...prev, { role: 'model', content: friendlyError }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* ── Settings Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
            }}
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: 'var(--bg-1, #05060b)',
                border: '1px solid var(--border, #1f2937)',
                borderRadius: '16px', padding: '24px', width: '340px',
                display: 'flex', flexDirection: 'column', gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} color="#7c3aed" />
                <span style={{ fontWeight: 700, color: '#fff', fontSize: '16px' }}>OpenRouter Settings</span>
              </div>

              <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>
                Add your personal OpenRouter API key to use your own quota and choose your preferred AI model.
                Your key is <strong style={{ color: '#fff' }}>saved locally in your browser only</strong>.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 600 }}>API Key</label>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    border: '1px solid var(--border, #374151)',
                    backgroundColor: 'var(--bg-2, #111827)', color: '#fff',
                    outline: 'none', fontSize: '13px', fontFamily: 'monospace'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 600 }}>Model ID (Optional)</label>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="e.g. anthropic/claude-3.5-sonnet"
                  style={{
                    padding: '10px 14px', borderRadius: '8px',
                    border: '1px solid var(--border, #374151)',
                    backgroundColor: 'var(--bg-2, #111827)', color: '#fff',
                    outline: 'none', fontSize: '13px', fontFamily: 'monospace'
                  }}
                />
                <span style={{ color: '#6b7280', fontSize: '11px' }}>
                  Default: inclusionai/ling-3.0-flash-vl:free
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={() => setShowSettings(false)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px',
                    border: '1px solid var(--border, #374151)',
                    backgroundColor: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: '14px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveKey}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                    backgroundColor: '#7c3aed', color: '#fff', cursor: 'pointer',
                    fontSize: '14px', fontWeight: 600
                  }}
                >
                  Save & Use
                </button>
              </div>

              {savedApiKey && (
                <button
                  onClick={() => {
                    setCustomApiKey('');
                    setCustomModel('inclusionai/ling-3.0-flash-vl:free');
                    localStorage.removeItem(LS_KEY);
                    localStorage.removeItem(LS_MODEL_KEY);
                    setSavedApiKey('');
                    setSavedModel('');
                    if (provider === 'openrouter-custom') setProvider('gemini');
                    setShowSettings(false);
                  }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', textAlign: 'left', marginTop: '4px' }}
                >
                  🗑 Remove saved key
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating Button ────────────────────────────────────────── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            style={{
              position: 'fixed', bottom: '24px', right: '24px',
              width: '56px', height: '56px', borderRadius: '50%',
              backgroundColor: 'var(--accent-1, #7c3aed)', color: 'white', border: 'none',
              boxShadow: '0 4px 12px rgba(124,58,237,0.3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <MessageSquare size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat Window ────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            style={{
              position: 'fixed', bottom: '24px', right: '24px',
              width: '360px', height: '520px',
              backgroundColor: 'var(--bg-1, #05060b)',
              border: '1px solid var(--border, #1f2937)',
              borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 9999
            }}
          >
            {/* Header */}
            <div style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border, #1f2937)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: 'rgba(124,58,237,0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span style={{ fontWeight: 600, color: '#fff', fontSize: '14px' }}>Walbot AI</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* Model selector */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as Provider)}
                    style={{
                      backgroundColor: 'var(--bg-2, #111827)', color: '#d1d5db',
                      border: '1px solid var(--border, #374151)', borderRadius: '6px',
                      padding: '3px 20px 3px 7px', fontSize: '11px', outline: 'none',
                      cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none'
                    }}
                  >
                    <option value="gemini">{PROVIDER_LABELS['gemini']}</option>
                    <option value="groq">{PROVIDER_LABELS['groq']}</option>
                    <option value="openrouter-default">{PROVIDER_LABELS['openrouter-default']}</option>
                    <option value="openrouter-custom">
                      {savedApiKey ? PROVIDER_LABELS['openrouter-custom'] : '🔑 Add My Key...'}
                    </option>
                  </select>
                  <ChevronDown size={10} style={{ position: 'absolute', right: '5px', pointerEvents: 'none', color: '#6b7280' }} />
                </div>
                {/* Settings button */}
                <button
                  onClick={() => setShowSettings(true)}
                  title="API Key Settings"
                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                >
                  <Settings size={14} />
                </button>
                {/* Close */}
                <button
                  onClick={() => setIsOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, padding: '16px', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: '12px'
            }}>
              {messages.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  backgroundColor: msg.role === 'user' ? 'var(--accent-1, #7c3aed)' : 'var(--bg-2, #111827)',
                  color: '#fff', padding: '10px 14px', borderRadius: '12px',
                  maxWidth: '85%', fontSize: '14px', lineHeight: '1.5',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border, #1f2937)'
                }}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ))}
              {isLoading && (
                <div style={{ alignSelf: 'flex-start', color: '#6b7280' }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '12px', borderTop: '1px solid var(--border, #1f2937)',
              display: 'flex', gap: '8px'
            }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask Walbot..."
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '24px',
                  border: '1px solid var(--border, #1f2937)',
                  backgroundColor: 'var(--bg-2, #111827)', color: '#fff',
                  outline: 'none', fontSize: '14px'
                }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  backgroundColor: input.trim() && !isLoading ? 'var(--accent-1, #7c3aed)' : 'var(--bg-2, #111827)',
                  border: 'none', color: '#fff', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s'
                }}
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}


