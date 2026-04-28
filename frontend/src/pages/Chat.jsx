import { AlertCircle, BookOpenCheck, ChevronLeft, SendHorizonal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sendChatMessage } from '../api/chat.js';
import { fetchContacts, fetchMessages, postMessage } from '../api/messages.js';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Mascot from '../components/Mascot.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { quickQuestions } from '../data/mockData.js';

const WELCOME_MESSAGE = {
  id:     'welcome',
  author: 'assistant',
  state:  'idle',
  text:   'Привет, я Техна. Помогу с отпуском, зарплатой, ДМС, ПВТР и кадровыми документами. Каждый ответ подкрепляю ссылкой на пункт регламента.',
};

function initials(name) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatRelative(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1)   return 'только что';
    if (diffMin < 60)  return `${diffMin} мин назад`;
    const sameDay = d.toDateString() === new Date().toDateString();
    if (sameDay) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

export default function Chat({
  draftPrompt,
  clearDraftPrompt,
  onCreateAppeal,
  openSection,
  viewMode = 'employee',
  initialContactEmail = null,
  profile,
}) {
  const { user: authUser } = useAuth();
  const myEmail = authUser?.email || '';
  const aiStorageKey = `lit_chat_${myEmail}`;

  // ── AI-чат (история привязана к аккаунту) ────────────────────────────────
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(`lit_chat_${myEmail}`);
      return saved ? JSON.parse(saved) : [WELCOME_MESSAGE];
    } catch {
      return [WELCOME_MESSAGE];
    }
  });
  const [aiText, setAiText]         = useState('');
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    if (!myEmail) return;
    localStorage.setItem(aiStorageKey, JSON.stringify(messages));
  }, [messages, aiStorageKey, myEmail]);

  // Подчищаем устаревший общий ключ — единоразово при первом запуске
  useEffect(() => {
    localStorage.removeItem('lit_chat_messages');
  }, []);

  // ── Peer-чат ──────────────────────────────────────────────────────────────
  const [contacts,        setContacts]        = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [peerMessages,    setPeerMessages]    = useState([]);
  const [peerText,        setPeerText]        = useState('');
  const [peerSending,     setPeerSending]     = useState(false);

  // Режим: 'select' | 'peer' | 'assistant'
  const [chatMode, setChatMode] = useState('select');

  const listRef     = useRef(null);
  const peerListRef = useRef(null);

  // Загрузка контактов + поллинг (5 с) для обновления превью и непрочитанных
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await fetchContacts();
        if (!cancelled) setContacts(list);
      } catch {}
    };
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Если передан initialContactEmail — сразу открываем чат с ним
  useEffect(() => {
    if (!initialContactEmail || contacts.length === 0) return;
    const found = contacts.find((c) => c.email === initialContactEmail);
    if (found) {
      setSelectedContact(found);
      setChatMode('peer');
    }
  }, [initialContactEmail, contacts]);

  // Draft-промт для AI-чата
  useEffect(() => {
    if (draftPrompt) {
      setChatMode('assistant');
      setAiText(draftPrompt);
      clearDraftPrompt();
    }
  }, [draftPrompt, clearDraftPrompt]);

  // Поллинг сообщений (3 с) пока открыт peer-чат
  useEffect(() => {
    if (chatMode !== 'peer' || !selectedContact) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const msgs = await fetchMessages(selectedContact.email);
        if (!cancelled) setPeerMessages(msgs);
      } catch {}
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [chatMode, selectedContact]);

  // Скролл вниз
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  useEffect(() => {
    peerListRef.current?.scrollTo({ top: peerListRef.current.scrollHeight, behavior: 'smooth' });
  }, [peerMessages]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function sendToAssistant(event) {
    event.preventDefault();
    const value = aiText.trim();
    if (!value || isThinking) return;

    const history = messages
      .filter((m) => (m.author === 'user' || m.author === 'assistant') && m.id !== 'welcome' && m.text)
      .slice(-12)
      .map((m) => ({ role: m.author, text: m.text }));

    const uid = Date.now();
    setMessages((c) => [...c, { id: uid, author: 'user', text: value }]);
    setAiText('');
    setIsThinking(true);

    try {
      const response = await sendChatMessage(value, history);
      setMessages((c) => [
        ...c,
        {
          id:      uid + 1,
          author:  'assistant',
          state:   response.sources?.length ? 'success' : 'empty',
          text:    response.answer,
          sources: response.sources || [],
          actions: true,
          fresh:   true,
        },
      ]);
    } catch (err) {
      setMessages((c) => [
        ...c,
        { id: uid + 1, author: 'assistant', state: 'error',
          text: err?.message || 'Не удалось получить ответ.' },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  async function sendPeer(event) {
    event.preventDefault();
    const value = peerText.trim();
    if (!value || peerSending || !selectedContact) return;

    setPeerSending(true);
    setPeerText('');

    // Оптимистичное добавление
    const opt = {
      id: `opt-${Date.now()}`, from_email: myEmail,
      to_email: selectedContact.email, text: value,
      created_at: new Date().toISOString(), is_read: 0,
    };
    setPeerMessages((c) => [...c, opt]);

    try {
      await postMessage(selectedContact.email, value);
      const msgs = await fetchMessages(selectedContact.email);
      setPeerMessages(msgs);
    } catch {
      setPeerMessages((c) => c.filter((m) => m.id !== opt.id));
      setPeerText(value);
    } finally {
      setPeerSending(false);
    }
  }

  // ── UI: экран выбора чата ─────────────────────────────────────────────────
  if (chatMode === 'select') {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-5">
          <h1 className="text-3xl font-bold tracking-tight text-white">Чаты</h1>
          <p className="mt-2 text-slate-400">Выберите переписку, которую хотите открыть.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Контакты (руководитель / сотрудники) */}
          {contacts.map((contact) => {
            const last     = contact.last_message;
            const unread   = contact.unread_count || 0;
            const fromSelf = last && last.from_email === myEmail;
            const preview  = last
              ? `${fromSelf ? 'Вы: ' : ''}${last.text}`
              : 'Нет сообщений — напишите первым';
            return (
              <button
                key={contact.email}
                type="button"
                onClick={() => { setSelectedContact(contact); setChatMode('peer'); }}
                className="text-left"
              >
                <Card className="h-full transition hover:border-purple-400/40 hover:bg-purple-950/15">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-purple-500/10 text-sm font-bold text-purple-300 ring-1 ring-purple-400/20">
                        {initials(contact.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xl font-bold text-white">{contact.full_name}</p>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-400">
                          {contact.position} · {contact.department}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {last && (
                        <span className="text-xs font-medium text-slate-500">
                          {formatRelative(last.created_at)}
                        </span>
                      )}
                      {unread > 0 && (
                        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-purple-500 px-2 text-xs font-bold text-white">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={`mt-4 line-clamp-2 text-sm ${unread > 0 ? 'font-semibold text-slate-100' : 'text-slate-400'}`}>
                    {preview}
                  </p>
                </Card>
              </button>
            );
          })}

          {/* Техна */}
          <button type="button" onClick={() => setChatMode('assistant')} className="text-left">
            <Card className="h-full transition hover:border-purple-400/40 hover:bg-purple-950/15">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Mascot state="idle" size="md" />
                  <div>
                    <p className="text-xl font-bold text-white">Техна</p>
                    <p className="mt-1 text-sm font-semibold text-slate-400">
                      AI-помощник по отпуску, зарплате, ДМС и документам
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-950/45 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-slate-700">
                  Ассистент
                </span>
              </div>
              <div className="mt-5 rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
                <p className="text-sm font-semibold text-slate-500">Быстрый старт</p>
                <p className="mt-2 text-slate-200">Задайте вопрос или выберите готовый сценарий.</p>
              </div>
            </Card>
          </button>
        </div>
      </div>
    );
  }

  // ── UI: peer-чат ──────────────────────────────────────────────────────────
  if (chatMode === 'peer' && selectedContact) {
    return (
      <div className="mx-auto flex h-[calc(100vh-9.5rem)] max-w-4xl flex-col lg:h-[calc(100vh-8rem)]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-purple-500/10 text-sm font-bold text-purple-300 ring-1 ring-purple-400/20">
              {initials(selectedContact.full_name)}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {selectedContact.full_name}
              </h1>
              <p className="text-sm text-slate-400">
                {selectedContact.position} · {selectedContact.department}
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setChatMode('select')}>
            <ChevronLeft size={16} />
            Все чаты
          </Button>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col p-0">
          <div ref={peerListRef} className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            {peerMessages.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                Начните переписку — напишите первое сообщение
              </p>
            )}
            {peerMessages.map((msg) => {
              const isOwn = msg.from_email === myEmail;
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[82%] rounded-[24px] px-5 py-3 text-sm leading-6 sm:max-w-[70%] ${
                      isOwn
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/30'
                        : 'bg-slate-950/70 text-slate-200 ring-1 ring-slate-800'
                    }`}
                  >
                    <p>{msg.text}</p>
                    <p className="mt-1 text-xs opacity-60">{formatTime(msg.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={sendPeer} className="border-t border-slate-800 p-3 sm:p-4">
            <div className="flex items-center gap-2 rounded-3xl bg-slate-950/70 p-2 ring-1 ring-slate-800">
              <input
                value={peerText}
                onChange={(e) => setPeerText(e.target.value)}
                placeholder="Напишите сообщение"
                disabled={peerSending}
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
              />
              <Button
                type="submit"
                disabled={peerSending || !peerText.trim()}
                className="h-12 w-12 shrink-0 rounded-2xl p-0 disabled:opacity-50"
                aria-label="Отправить"
              >
                <SendHorizonal size={20} />
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // ── UI: AI-чат с Техной ───────────────────────────────────────────────────
  const lastAssistant = [...messages].reverse().find((m) => m.author === 'assistant');
  const mascotState = isThinking ? 'thinking' : (lastAssistant?.state || 'idle');

  return (
    <div className="mx-auto flex h-[calc(100vh-9.5rem)] max-w-4xl flex-col lg:h-[calc(100vh-8rem)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Mascot state={mascotState} size="lg" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Чат с Техной</h1>
            <p className="mt-1 text-slate-400">
              {isThinking ? 'Ищу ответ в регламентах…' : 'Задайте вопрос или выберите готовый сценарий'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setChatMode('select')}>
            <ChevronLeft size={16} />
            Чаты
          </Button>
          <Button
            variant="secondary"
            disabled={isThinking || messages.length <= 1}
            onClick={() => setMessages([WELCOME_MESSAGE])}
          >
            Новый диалог
          </Button>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col p-0">
        <div className="border-b border-slate-800 p-3 sm:p-4">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {quickQuestions.map((item) => (
              <button
                key={item.prompt}
                onClick={() => setAiText(item.prompt)}
                disabled={isThinking}
                className="shrink-0 rounded-2xl border border-slate-700 bg-slate-950/45 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-purple-500/50 hover:text-white disabled:opacity-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div ref={listRef} className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {messages.map((message) => {
            const isUser = message.author === 'user';
            return (
              <div key={message.id} className={`flex animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] sm:max-w-[70%] ${isUser ? '' : 'space-y-3'}`}>
                  <div
                    className={`rounded-[24px] px-5 py-3 text-sm leading-6 ${
                      isUser
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/30'
                        : message.state === 'error'
                          ? 'bg-red-500/15 text-red-100 ring-1 ring-red-500/40'
                          : 'bg-slate-950/70 text-slate-200 ring-1 ring-slate-800'
                    }`}
                  >
                    {message.state === 'error' && (
                      <div className="mb-2 flex items-center gap-2 font-semibold text-red-200">
                        <AlertCircle size={16} />
                        Ошибка ассистента
                      </div>
                    )}
                    {message.text.split('\n').map((line, idx) => (
                      <span key={`${message.id}-${idx}`} className={`block ${message.fresh ? 'token-fresh' : ''}`}>
                        {line || ' '}
                      </span>
                    ))}
                  </div>

                  {!isUser && message.sources?.length > 0 && (
                    <div className="rounded-2xl border border-purple-500/30 bg-purple-600/10 p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-200">
                        <BookOpenCheck size={14} />
                        Основания
                      </div>
                      <ul className="space-y-1 text-sm text-slate-200">
                        {message.sources.map((src, i) => (
                          <li key={i} className="leading-snug">{src}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!isUser && message.actions && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" className="px-4 py-2" onClick={onCreateAppeal}>
                        Создать обращение
                      </Button>
                      <Button variant="secondary" className="px-4 py-2" onClick={() => openSection('documents')}>
                        Открыть документы
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isThinking && <ThinkingBubble />}
        </div>

        <form onSubmit={sendToAssistant} className="border-t border-slate-800 p-3 sm:p-4">
          <div className="flex items-center gap-2 rounded-3xl bg-slate-950/70 p-2 ring-1 ring-slate-800">
            <input
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={isThinking ? 'Техна думает…' : 'Спросите о ПВТР, отпуске, зарплате…'}
              disabled={isThinking}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
            />
            <Button
              type="submit"
              disabled={isThinking || !aiText.trim()}
              className="h-12 w-12 shrink-0 rounded-2xl p-0 disabled:opacity-50"
              aria-label="Отправить"
            >
              <SendHorizonal size={20} />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex animate-fade-in justify-start">
      <div className="flex items-center gap-3 rounded-[24px] bg-slate-950/70 px-5 py-4 ring-1 ring-slate-800">
        <span className="flex gap-1">
          <span className="h-2 w-2 animate-pulse-soft rounded-full bg-purple-400" style={{ animationDelay: '0ms'   }} />
          <span className="h-2 w-2 animate-pulse-soft rounded-full bg-purple-400" style={{ animationDelay: '180ms' }} />
          <span className="h-2 w-2 animate-pulse-soft rounded-full bg-purple-400" style={{ animationDelay: '360ms' }} />
        </span>
        <span className="text-sm text-slate-400">Техна ищет в регламентах…</span>
      </div>
    </div>
  );
}
