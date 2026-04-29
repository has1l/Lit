import { AlertCircle, BookOpenCheck, ChevronLeft, Mic, MicOff, SendHorizonal, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sendChatMessage } from '../api/chat.js';
import { openDocumentFile, openDocumentView } from '../api/documents.js';
import { fetchContacts, fetchMessages, postMessage } from '../api/messages.js';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Mascot from '../components/Mascot.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { quickQuestions } from '../data/mockData.js';
import { API_BASE } from '../api/client.js';

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

function isManagerContact(contact) {
  const haystack = `${contact.position || ''} ${contact.role || ''}`.toLowerCase();
  return haystack.includes('lead') || haystack.includes('руковод') || haystack.includes('директор') || haystack.includes('manager');
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

  const listRef        = useRef(null);
  const peerListRef    = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const [isListening,  setIsListening]  = useState(false);
  const hasSpeech = true; // Теперь всегда доступно через наш сервер


  async function startListening() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.webm');

        // Показываем что-то в процессе (опционально)
        // setAiText(prev => prev + '... [распознавание] ...');

        try {
          const response = await fetch(`${API_BASE}/stt`, {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();
          if (data.text) {
            setAiText(prev => prev ? `${prev} ${data.text}` : data.text);
          }
        } catch (error) {
          console.error('STT Error:', error);
          alert('Ошибка распознавания речи на сервере');
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Нет доступа к микрофону. Разрешите его в настройках браузера.');
    }
  }

  function stopListening() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      // Останавливаем все треки микрофона
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsListening(false);
  }


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
          escalate: response.escalate ?? false,
          actions: (response.sources?.length ?? 0) > 0,
          doc_id:       response.doc_id ?? null,
          doc_page:     response.doc_page ?? 0,
          doc_section:  response.doc_section ?? '',
          resource_url: response.resource_url ?? null,
          fresh:        true,
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
          <p className="page-eyebrow">Коммуникации</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Чаты</h1>
          <p className="mt-2 text-slate-400">Выберите переписку, которую хотите открыть.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Техна */}
          <button type="button" onClick={() => setChatMode('assistant')} className="text-left">
            <Card className="assistant-chat-card relative h-full overflow-hidden ring-1 ring-purple-400/25">
              <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] h-40 w-40 rounded-full bg-purple-500/30 blur-3xl" />
              <div className="pointer-events-none absolute bottom-[-4rem] left-[-4rem] h-36 w-36 rounded-full bg-blue-500/20 blur-3xl" />
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Mascot state="idle" size="md" variant="support" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="assistant-chat-title text-xl font-bold">Техна</p>
                      <span className="assistant-chat-badge rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
                        AI
                      </span>
                    </div>
                    <p className="assistant-chat-muted mt-1 text-sm font-semibold">
                      AI-помощник по отпуску, зарплате, ДМС и документам
                    </p>
                  </div>
                </div>
                <span className="assistant-chat-badge inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                  <Sparkles size={13} />
                  Быстрый ответ
                </span>
              </div>
              <div className="fintech-control mt-5 rounded-2xl p-4">
                <p className="metric-label">Быстрый старт</p>
                <p className="assistant-chat-title mt-2">Задайте вопрос или выберите готовый сценарий.</p>
              </div>
              <div className="assistant-chat-cta mt-4 inline-flex items-center gap-2 text-sm font-semibold">
                Открыть ассистента
                <ChevronLeft className="rotate-180" size={16} />
              </div>
            </Card>
          </button>

          {/* Контакты (руководитель / сотрудники) */}
          {contacts.map((contact) => {
            const last     = contact.last_message;
            const unread   = contact.unread_count || 0;
            const fromSelf = last && last.from_email === myEmail;
            const preview  = last
              ? `${fromSelf ? 'Вы: ' : ''}${last.text}`
              : 'Нет сообщений — напишите первым';
            const isManager = isManagerContact(contact);
            return (
              <button
                key={contact.email}
                type="button"
                onClick={() => { setSelectedContact(contact); setChatMode('peer'); }}
                className="text-left"
              >
                <Card className={`h-full ${isManager ? 'manager-chat-card' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-bold ${
                        isManager
                          ? 'manager-chat-avatar'
                          : 'icon-tile'
                      }`}>
                        {initials(contact.full_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-xl font-bold text-white">{contact.full_name}</p>
                          {isManager && (
                            <span className="manager-chat-badge rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
                              Руководитель
                            </span>
                          )}
                        </div>
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
                  <div className="fintech-control mt-5 rounded-2xl p-4">
                    <p className="metric-label">Последнее сообщение</p>
                    <p className={`mt-2 line-clamp-2 text-base leading-6 ${
                      unread > 0 ? 'font-semibold text-white' : 'text-slate-300 theme-light:text-slate-700'
                    }`}>
                      {preview}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      isManager
                        ? 'manager-chat-chip'
                        : 'status-chip'
                    }`}>
                      {isManager ? 'Приоритетный контакт' : 'Переписка'}
                    </span>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── UI: peer-чат ──────────────────────────────────────────────────────────
  if (chatMode === 'peer' && selectedContact) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-12rem)] max-w-4xl flex-col sm:h-[calc(100vh-9.5rem)] lg:h-[calc(100vh-8rem)]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="icon-tile h-11 w-11 shrink-0 rounded-2xl text-sm font-bold">
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
                    className={`max-w-[92%] rounded-[22px] px-4 py-2.5 text-sm leading-6 sm:max-w-[70%] sm:px-5 sm:py-3 ${
                      isOwn
                        ? 'chat-bubble-user'
                        : 'chat-bubble-peer'
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
            <div className="fintech-control flex items-center gap-2 rounded-2xl p-2">
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
    <div className="mx-auto flex h-[calc(100dvh-11rem)] max-w-4xl flex-col sm:h-[calc(100vh-9.5rem)] lg:h-[calc(100vh-8rem)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <Mascot state={mascotState} size="lg" variant="support" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-3xl">Чат с Техной</h1>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              {isThinking ? 'Ищу ответ в регламентах…' : 'Задайте вопрос или выберите сценарий'}
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
                className="status-chip shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold transition hover:border-indigo-500/40 disabled:opacity-50"
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
                {!isUser && (
                  <div className="mr-3 mt-1 hidden shrink-0 sm:block">
                    <Mascot state={message.state || 'idle'} size="sm" variant="support" />
                  </div>
                )}
                <div className={`max-w-[92%] sm:max-w-[70%] ${isUser ? '' : 'space-y-3'}`}>
                  <div
                    className={`rounded-[22px] px-4 py-2.5 text-sm leading-6 sm:px-5 sm:py-3 ${
                      isUser
                        ? 'chat-bubble-user'
                        : message.state === 'error'
                          ? 'bg-red-500/15 text-red-100 ring-1 ring-red-500/40'
                          : 'chat-bubble-peer'
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
                    <div className="fintech-control rounded-2xl p-3">
                      <div className="metric-label mb-2 flex items-center gap-2">
                        <BookOpenCheck size={14} />
                        Основания
                      </div>
                      <ul className="space-y-1 text-sm text-slate-200">
                        {message.sources.map((src, i) => (
                          <li key={i} className="leading-snug">
                            {message.doc_id ? (
                              <button
                                type="button"
                                className="text-left underline decoration-dotted underline-offset-2 hover:text-purple-300 transition-colors cursor-pointer"
                                onClick={() => openDocumentView(message.doc_id, message.doc_section).catch(() => openSection('documents'))}
                              >
                                {src}
                              </button>
                            ) : src}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!isUser && (message.escalate || message.actions || message.resource_url) && (
                    <div className="flex flex-wrap gap-2">
                      {message.escalate && (
                        <Button
                          variant="secondary"
                          className="px-4 py-2 ring-1 ring-yellow-400/30 text-yellow-200 hover:bg-yellow-500/10"
                          onClick={() => onCreateAppeal(message.text)}
                        >
                          Отправить вопрос в HR
                        </Button>
                      )}
                      {message.resource_url && (
                        <a
                          href={message.resource_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-2xl bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-300 ring-1 ring-green-400/30 transition hover:bg-green-500/20"
                        >
                          Открыть ресурс →
                        </a>
                      )}
                      {message.actions && !message.resource_url && (
                        message.doc_id ? (
                          <Button
                            variant="secondary"
                            className="px-4 py-2"
                            onClick={() => openDocumentFile(message.doc_id, message.doc_page).catch(() => openSection('documents'))}
                          >
                            Открыть документ
                          </Button>
                        ) : (
                          <Button variant="secondary" className="px-4 py-2" onClick={() => openSection('documents')}>
                            Открыть документы
                          </Button>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isThinking && <ThinkingBubble />}
        </div>

        <form onSubmit={sendToAssistant} className="border-t border-slate-800 p-3 sm:p-4">
          <div className="fintech-control flex items-center gap-2 rounded-2xl p-2">
            <input
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={isListening ? 'Говорите…' : isThinking ? 'Техна думает…' : 'Спросите о ПВТР, отпуске, зарплате…'}
              disabled={isThinking}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
            />
            {hasSpeech && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={isThinking}
                className={`h-12 w-12 shrink-0 rounded-2xl p-0 transition-all disabled:opacity-50 ${
                  isListening
                    ? 'animate-pulse bg-red-500 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                }`}
                aria-label={isListening ? 'Остановить запись' : 'Голосовой ввод'}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}
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
      <div className="mr-3 mt-1 hidden shrink-0 sm:block">
        <div className="grid h-9 w-9 place-items-center rounded-2xl bg-purple-500/15 text-purple-200 ring-1 ring-purple-300/30 shadow-[0_0_28px_rgba(124,58,237,0.20)]">
          <Sparkles size={17} className="animate-pulse" />
        </div>
      </div>
      <div className="chat-bubble-peer flex items-center gap-3 rounded-[24px] px-5 py-4">
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
