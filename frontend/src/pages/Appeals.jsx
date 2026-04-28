import { CheckCircle, Clock, Loader2, MessageSquare, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { fetchAppeals, createAppeal, resolveAppeal } from '../api/appeals.js';

const CATEGORIES = [
  { value: 'vacation',  label: 'Отпуск' },
  { value: 'salary',    label: 'Зарплата' },
  { value: 'documents', label: 'Документы' },
  { value: 'dms',       label: 'ДМС' },
  { value: 'other',     label: 'Другое' },
];

const STATUS_CONFIG = {
  open:        { label: 'Открыто',      chip: 'bg-blue-500/10 text-blue-300 ring-blue-400/30' },
  in_progress: { label: 'В работе',     chip: 'bg-yellow-500/10 text-yellow-300 ring-yellow-400/30' },
  resolved:    { label: 'Решено',       chip: 'bg-green-500/10 text-green-300 ring-green-400/30' },
};

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function categoryLabel(val) {
  return CATEGORIES.find((c) => c.value === val)?.label || val;
}

// ── Модалка создания обращения ────────────────────────────────────────────────

function CreateModal({ initialText = '', onClose, onCreated }) {
  const [text,     setText]     = useState(initialText);
  const [category, setCategory] = useState('other');
  const [saving,   setSaving]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    const appeal = await createAppeal(text.trim(), category).catch(() => null);
    setSaving(false);
    if (appeal) { onCreated(appeal); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold text-white">Создать обращение</h2>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-400">Категория</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="fintech-input mt-2 w-full rounded-2xl px-4 py-3 text-white outline-none">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-400">Опишите вопрос</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} required
              className="fintech-input mt-2 min-h-32 w-full resize-none rounded-2xl px-4 py-3 text-white outline-none placeholder:text-slate-500"
              placeholder="Подробно опишите ваш вопрос или ситуацию…" />
          </label>
          <div className="flex gap-3">
            <Button type="submit" disabled={saving || !text.trim()} className="flex-1">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Отправить в HR
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Отмена</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Модалка ответа HR ─────────────────────────────────────────────────────────

function ResolveModal({ appeal, onClose, onResolved }) {
  const [response, setResponse] = useState('');
  const [saving,   setSaving]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!response.trim()) return;
    setSaving(true);
    const updated = await resolveAppeal(appeal.id, response.trim()).catch(() => null);
    setSaving(false);
    if (updated) { onResolved(updated); onClose(); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <Card className="w-full max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold text-white">Ответить на обращение</h2>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{categoryLabel(appeal.category)} · {appeal.from_name}</p>
          <p className="mt-2 text-sm text-slate-200 leading-relaxed">{appeal.question_text}</p>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-400">Ваш ответ</span>
            <textarea value={response} onChange={(e) => setResponse(e.target.value)} required
              className="fintech-input mt-2 min-h-32 w-full resize-none rounded-2xl px-4 py-3 text-white outline-none placeholder:text-slate-500"
              placeholder="Напишите ответ сотруднику…" />
          </label>
          <div className="flex gap-3">
            <Button type="submit" disabled={saving || !response.trim()} className="flex-1">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              Ответить и закрыть
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────

export default function Appeals({ initialQuestion = '' }) {
  const { user } = useAuth();
  const isHr = user?.role === 'hr';

  const [appeals,       setAppeals]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showCreate,    setShowCreate]    = useState(false);
  const [resolveAppeal, setResolveAppeal] = useState(null);
  const [activeTab,     setActiveTab]     = useState('open');
  const [selectedAppeal, setSelectedAppeal] = useState(null);

  // Открыть форму создания если пришёл вопрос из чата
  useEffect(() => {
    if (initialQuestion) setShowCreate(true);
  }, [initialQuestion]);

  useEffect(() => {
    fetchAppeals()
      .then(setAppeals)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = appeals.filter((a) => {
    if (activeTab === 'open')     return a.status === 'open' || a.status === 'in_progress';
    if (activeTab === 'resolved') return a.status === 'resolved';
    return true;
  });

  const counts = {
    open:     appeals.filter((a) => a.status === 'open' || a.status === 'in_progress').length,
    resolved: appeals.filter((a) => a.status === 'resolved').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">HR Service Desk</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Обращения</h1>
          <p className="mt-2 text-slate-400">
            {isHr ? 'Входящие вопросы от сотрудников.' : 'Ваши вопросы в HR-отдел.'}
          </p>
        </div>
        {!isHr && (
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus size={16} />Создать обращение
          </Button>
        )}
      </div>

      {/* Вкладки */}
      <div className="flex gap-2">
        {[
          { key: 'open',     label: `Открытые${counts.open > 0 ? ` (${counts.open})` : ''}` },
          { key: 'resolved', label: `Решённые${counts.resolved > 0 ? ` (${counts.resolved})` : ''}` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === key
                ? 'bg-indigo-600 text-white'
                : 'status-chip text-slate-300 hover:border-indigo-500/40'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-8 text-slate-400">
          <Loader2 size={20} className="animate-spin" />Загрузка…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card>
          <div className="py-10 text-center">
            <MessageSquare size={36} className="mx-auto text-slate-600" />
            <p className="mt-4 text-slate-400">
              {activeTab === 'open'
                ? isHr ? 'Новых обращений нет' : 'У вас нет открытых обращений'
                : 'Нет решённых обращений'}
            </p>
            {!isHr && activeTab === 'open' && (
              <Button className="mt-5 gap-2" onClick={() => setShowCreate(true)}>
                <Plus size={16} />Создать обращение
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((appeal) => {
          const cfg = STATUS_CONFIG[appeal.status] || STATUS_CONFIG.open;
          const isOpen = selectedAppeal?.id === appeal.id;
          return (
            <Card key={appeal.id} className="cursor-pointer" onClick={() => setSelectedAppeal(isOpen ? null : appeal)}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {isHr && (
                    <p className="text-xs font-semibold text-slate-500 mb-1">
                      {appeal.from_name} · {formatDate(appeal.created_at)}
                    </p>
                  )}
                  <p className={`text-sm font-semibold uppercase tracking-widest ${
                    { vacation:'text-blue-400', salary:'text-green-400', dms:'text-purple-400', documents:'text-yellow-400', other:'text-slate-400' }[appeal.category] || 'text-slate-400'
                  }`}>{categoryLabel(appeal.category)}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-200">{appeal.question_text}</p>
                  {!isHr && !isOpen && (
                    <p className="mt-1 text-xs text-slate-500">{formatDate(appeal.created_at)}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${cfg.chip}`}>
                  {cfg.label}
                </span>
              </div>

              {isOpen && (
                <div className="mt-4 space-y-3 border-t border-slate-800 pt-4" onClick={(e) => e.stopPropagation()}>
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Вопрос</p>
                    <p className="mt-2 text-sm text-slate-200 leading-relaxed">{appeal.question_text}</p>
                    <p className="mt-2 text-xs text-slate-500">{formatDate(appeal.created_at)}</p>
                  </div>

                  {appeal.hr_response && (
                    <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-green-400">Ответ HR</p>
                      <p className="mt-2 text-sm text-slate-200 leading-relaxed">{appeal.hr_response}</p>
                      {appeal.resolved_at && (
                        <p className="mt-2 text-xs text-slate-500">{formatDate(appeal.resolved_at)}</p>
                      )}
                    </div>
                  )}

                  {isHr && appeal.status !== 'resolved' && (
                    <Button className="gap-2" onClick={() => setResolveAppeal(appeal)}>
                      <CheckCircle size={16} />Ответить и закрыть
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {showCreate && (
        <CreateModal
          initialText={initialQuestion}
          onClose={() => setShowCreate(false)}
          onCreated={(a) => setAppeals((p) => [a, ...p])}
        />
      )}

      {resolveAppeal && (
        <ResolveModal
          appeal={resolveAppeal}
          onClose={() => setResolveAppeal(null)}
          onResolved={(updated) => setAppeals((p) => p.map((a) => a.id === updated.id ? updated : a))}
        />
      )}
    </div>
  );
}
