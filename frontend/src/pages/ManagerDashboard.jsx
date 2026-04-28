import {
  Briefcase, Calendar, Loader2, MessageCircle, Mic, Plus,
  Search, Sparkles, Target, Trash2, User, Users, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { fetchTeamEmployees, fetchTeamStatuses, fetchEmployeeProfile } from '../api/employee.js';
import { fetchGoals, createGoal, deleteGoal, suggestPoints, fetchBonusRecords, reviewBonus, closeMonth } from '../api/goals.js';

const MONTH_RU   = ['','янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const MONTH_FULL = ['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

const STATUS_LABEL = { online: 'Онлайн', break: 'Перерыв', offline: 'Оффлайн' };
const STATUS_DOT   = { online: 'bg-green-400', break: 'bg-yellow-400', offline: 'bg-slate-500' };
const STATUS_CHIP  = {
  online:  'bg-green-500/10 text-green-300 ring-green-400/30',
  break:   'bg-yellow-500/10 text-yellow-300 ring-yellow-400/30',
  offline: 'bg-slate-700/50 text-slate-400 ring-slate-600/30',
};

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} день`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_RU[m]} ${y}`;
}

function formatBirthDate(dateStr) {
  if (!dateStr) return '—';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_RU[m]}`;
}

function calcAge(birthDate) {
  if (!birthDate) return null;
  const bd = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
  return age;
}

function calcTenure(hireDate) {
  if (!hireDate) return '';
  const hd = new Date(hireDate);
  const today = new Date();
  let months = (today.getFullYear() - hd.getFullYear()) * 12 + (today.getMonth() - hd.getMonth());
  const years = Math.floor(months / 12);
  months = months % 12;
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`);
  if (months) parts.push(`${months} мес.`);
  return parts.join(' ') || 'менее месяца';
}

function initials(name) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function formatAmount(n) {
  return `${Math.round(n).toLocaleString('ru')} ₽`;
}

// ── Модалка полного профиля ───────────────────────────────────────────────────

function ProfileModal({ employee, onClose, onChat }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployeeProfile(employee.email)
      .then(setProfile)
      .catch(() => setProfile(employee))
      .finally(() => setLoading(false));
  }, [employee.email]);

  const emp = profile || employee;
  const age    = calcAge(emp.birth_date);
  const tenure = calcTenure(emp.hire_date);
  const genderRu = { male: 'Мужской', female: 'Женский' }[emp.gender] || '—';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <Card className="max-h-[92vh] w-full max-w-xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-base font-bold text-white"
              style={{ background: emp.avatar_color || '#6AB216' }}
            >
              {initials(emp.full_name)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white sm:text-2xl">{emp.full_name}</h2>
              <p className="mt-1 text-xs text-slate-400 sm:text-sm">{emp.position} · {emp.department}</p>
              <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase sm:text-xs ${STATUS_CHIP[emp.online_status || 'offline']}`}>
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[emp.online_status || 'offline']}`} />
                {STATUS_LABEL[emp.online_status || 'offline']}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {emp.current_task && (
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/45 px-4 py-3 text-sm text-slate-300">
            <span className="text-slate-500">Сейчас: </span>{emp.current_task}
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center gap-2 text-slate-400">
            <Loader2 size={16} className="animate-spin" /> Загрузка данных…
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {emp.birth_date && (
            <div className="metric-card rounded-2xl p-4">
              <p className="metric-label">Дата рождения</p>
              <p className="metric-value mt-2 font-bold">{formatDate(emp.birth_date)}</p>
              {age && <p className="mt-1 text-sm text-slate-400">{age} лет</p>}
            </div>
          )}
          <div className="metric-card rounded-2xl p-4">
            <p className="metric-label">Пол</p>
            <p className="metric-value mt-2 font-bold">{genderRu}</p>
          </div>
          <div className="metric-card rounded-2xl p-4">
            <p className="metric-label">Принят на работу</p>
            <p className="metric-value mt-2 font-bold">{formatDate(emp.hire_date)}</p>
            {tenure && <p className="mt-1 text-sm text-slate-400">Стаж: {tenure}</p>}
          </div>
          {emp.salary && (
            <div className="metric-card rounded-2xl p-4">
              <p className="metric-label">Оклад</p>
              <p className="metric-value mt-2 text-2xl font-bold">{formatAmount(emp.salary)}</p>
            </div>
          )}
        </div>

        {emp.leave && (
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Отпуск {emp.leave.year}</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-white">{emp.leave.remaining_days ?? (emp.leave.total_days - emp.leave.used_days - emp.leave.pending_days)}</p>
                <p className="mt-1 text-xs text-slate-500">Остаток</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{emp.leave.used_days}</p>
                <p className="mt-1 text-xs text-slate-500">Использовано</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${emp.leave.pending_days > 0 ? 'text-yellow-300' : 'text-white'}`}>{emp.leave.pending_days}</p>
                <p className="mt-1 text-xs text-slate-500">В оформлении</p>
              </div>
            </div>
          </div>
        )}

        {emp.recent_payments?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Последние выплаты</p>
            <div className="mt-3 divide-y divide-slate-800">
              {emp.recent_payments.slice(0, 3).map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-slate-400">{formatDate(p.payment_date)} · {p.payment_type === 'advance' ? 'Аванс' : 'Зарплата'}</span>
                  <span className="font-bold text-white">{formatAmount(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <Button className="flex-1" onClick={() => { onChat(employee.email); onClose(); }}>
            <MessageCircle size={16} /> Написать
          </Button>
          <Button variant="secondary" onClick={onClose}>Закрыть</Button>
        </div>
      </Card>
    </div>
  );
}

// ── Модалка управления целями ─────────────────────────────────────────────────

function GoalsModal({ employee, onClose }) {
  const now = new Date();
  const [goals, setGoals]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const [newPoints, setNewPoints] = useState(20);
  const [addingGoal, setAddingGoal] = useState(false);
  const [draftGoals, setDraftGoals] = useState([{ title: '', description: '' }]);
  const [suggesting, setSuggesting] = useState(false);
  const [showBulk, setShowBulk]   = useState(false);

  useEffect(() => {
    fetchGoals({ employee_email: employee.email })
      .then(setGoals).catch(() => {}).finally(() => setLoading(false));
  }, [employee.email]);

  async function handleAdd() {
    if (!newTitle.trim()) return;
    const created = await createGoal({
      employee_email: employee.email,
      title: newTitle.trim(), description: newDesc.trim(),
      points: Number(newPoints), month: now.getMonth() + 1, year: now.getFullYear(),
    }).catch(() => null);
    if (created) { setGoals((p) => [...p, created]); setNewTitle(''); setNewDesc(''); setNewPoints(20); setAddingGoal(false); }
  }

  async function handleDelete(id) {
    await deleteGoal(id).catch(() => {});
    setGoals((p) => p.filter((g) => g.id !== id));
  }

  async function handleSuggest() {
    const valid = draftGoals.filter((g) => g.title.trim());
    if (!valid.length) return;
    setSuggesting(true);
    const res = await suggestPoints(valid).catch(() => null);
    if (res?.suggestions) {
      setDraftGoals((p) => p.map((g, i) => {
        const s = res.suggestions.find((s) => s.index === i);
        return s ? { ...g, suggestedPoints: s.points } : g;
      }));
    }
    setSuggesting(false);
  }

  async function handleBulkCreate() {
    const valid = draftGoals.filter((g) => g.title.trim());
    if (!valid.length) return;
    const created = await Promise.all(valid.map((g) => createGoal({
      employee_email: employee.email, title: g.title.trim(),
      description: g.description?.trim() ?? '', points: g.suggestedPoints ?? 20,
      month: now.getMonth() + 1, year: now.getFullYear(),
    }))).catch(() => []);
    setGoals((p) => [...p, ...created]);
    setDraftGoals([{ title: '', description: '' }]);
    setShowBulk(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Цели сотрудника</h2>
            <p className="mt-1 text-slate-400">{employee.full_name} · {MONTH_FULL[now.getMonth() + 1]} {now.getFullYear()}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center gap-3 text-slate-400"><Loader2 size={18} className="animate-spin" />Загрузка...</div>
        ) : (
          <div className="mt-6 space-y-3">
            {goals.length === 0 && !showBulk && !addingGoal && (
              <p className="text-sm text-slate-500">Целей на этот месяц нет. Добавьте их ниже.</p>
            )}
            {goals.map((g) => (
              <div key={g.id} className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-500/10 text-xs font-bold text-purple-300 ring-1 ring-purple-400/20">{g.points}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{g.title}</p>
                  {g.description && <p className="mt-1 text-sm text-slate-500">{g.description}</p>}
                </div>
                <button onClick={() => handleDelete(g.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {addingGoal && (
          <div className="mt-4 space-y-3 rounded-2xl border border-purple-400/20 bg-purple-600/5 p-4">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Название цели"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-purple-500" />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Описание (необязательно)"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-purple-500" />
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Баллы:</label>
              <input type="number" min={10} max={100} value={newPoints} onChange={(e) => setNewPoints(e.target.value)}
                className="w-24 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-purple-500" />
              <div className="flex gap-2 ml-auto">
                <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => setAddingGoal(false)}>Отмена</Button>
                <Button className="px-3 py-2 text-sm" onClick={handleAdd}>Добавить</Button>
              </div>
            </div>
          </div>
        )}

        {showBulk && (
          <div className="mt-4 space-y-3 rounded-2xl border border-purple-400/20 bg-purple-600/5 p-4">
            <p className="text-sm font-semibold text-white">Цели на месяц — Техна распределит баллы</p>
            {draftGoals.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={g.title} onChange={(e) => setDraftGoals((p) => p.map((d, j) => j === i ? { ...d, title: e.target.value } : d))}
                  placeholder={`Цель ${i + 1}`}
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-purple-500" />
                {g.suggestedPoints !== undefined && (
                  <span className="shrink-0 rounded-xl bg-purple-600/20 px-3 py-2 text-sm font-bold text-purple-200">{g.suggestedPoints} pts</span>
                )}
                {draftGoals.length > 1 && (
                  <button onClick={() => setDraftGoals((p) => p.filter((_, j) => j !== i))} className="shrink-0 text-slate-600 hover:text-red-400"><X size={16} /></button>
                )}
              </div>
            ))}
            <button onClick={() => setDraftGoals((p) => [...p, { title: '', description: '' }])} className="text-sm text-purple-400 hover:text-purple-200">+ ещё цель</button>
            <div className="flex flex-wrap gap-3 pt-2">
              <button onClick={handleSuggest} disabled={suggesting}
                className="inline-flex items-center gap-2 rounded-2xl bg-purple-600/15 px-4 py-2 text-sm font-semibold text-purple-200 ring-1 ring-purple-400/30 hover:bg-purple-600/25 disabled:opacity-50">
                {suggesting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {suggesting ? 'Техна думает...' : 'Техна распределит баллы'}
              </button>
              <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => setShowBulk(false)}>Отмена</Button>
              <Button className="px-3 py-2 text-sm" onClick={handleBulkCreate}>Сохранить все</Button>
            </div>
          </div>
        )}

        {!addingGoal && !showBulk && (
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" className="gap-2" onClick={() => setAddingGoal(true)}><Plus size={16} />Добавить цель</Button>
            <button onClick={() => setShowBulk(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-purple-600/15 px-4 py-2 text-sm font-semibold text-purple-200 ring-1 ring-purple-400/30 hover:bg-purple-600/25">
              <Sparkles size={15} />Добавить список + AI баллы
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Модалка бонусных итогов ───────────────────────────────────────────────────

function BonusModal({ onClose }) {
  const now = new Date();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  useEffect(() => { fetchBonusRecords().then(setRecords).catch(() => {}).finally(() => setLoading(false)); }, []);

  async function handleReview(id, action) {
    const updated = await reviewBonus(id, action).catch(() => null);
    if (updated) setRecords((p) => p.map((r) => r.id === id ? { ...r, ...updated } : r));
  }

  async function handleClose() {
    setClosing(true);
    await closeMonth({ month: now.getMonth() + 1, year: now.getFullYear() }).catch(() => {});
    const updated = await fetchBonusRecords().catch(() => records);
    setRecords(updated);
    setClosing(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-2xl font-bold text-white">Бонусные итоги</h2><p className="mt-1 text-slate-400">Результаты по целям</p></div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <button onClick={handleClose} disabled={closing}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-purple-600/15 px-4 py-2 text-sm font-semibold text-purple-200 ring-1 ring-purple-400/30 hover:bg-purple-600/25 disabled:opacity-50">
          {closing && <Loader2 size={15} className="animate-spin" />}Подвести итоги {MONTH_FULL[now.getMonth() + 1]}
        </button>
        {loading ? (
          <div className="mt-6 flex items-center gap-3 text-slate-400"><Loader2 size={18} className="animate-spin" />Загрузка...</div>
        ) : records.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Нет записей. Нажмите «Подвести итоги» для расчёта.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {records.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{r.full_name}</p>
                    <p className="mt-1 text-sm text-slate-400">{MONTH_FULL[r.month]} {r.year} · {r.earned_points}/{r.max_points} очков · {r.score_pct}%</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                    r.status === 'approved' ? 'bg-green-500/15 text-green-300 ring-green-400/30' :
                    r.status === 'declined' ? 'bg-red-500/15 text-red-300 ring-red-400/30' :
                    'bg-yellow-500/15 text-yellow-300 ring-yellow-400/30'
                  }`}>{r.status === 'approved' ? '✓ Одобрено' : r.status === 'declined' ? '✕ Отклонено' : 'На рассмотрении'}</span>
                </div>
                {r.status === 'pending' && (
                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1 py-2 text-sm" onClick={() => handleReview(r.id, 'approve')}>Одобрить</Button>
                    <Button variant="secondary" className="flex-1 py-2 text-sm" onClick={() => handleReview(r.id, 'decline')}>Отклонить</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────

export default function ManagerDashboard({ onOpenEmployeeChat }) {
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // Фильтры
  const [search,         setSearch]         = useState('');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [filterVacation, setFilterVacation] = useState('all');
  const [filterPosition, setFilterPosition] = useState('all');

  // Модалки
  const [profileEmployee, setProfileEmployee] = useState(null);
  const [goalsEmployee,   setGoalsEmployee]   = useState(null);
  const [showBonus,       setShowBonus]       = useState(false);

  useEffect(() => {
    fetchTeamEmployees()
      .then(setEmployees)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  // Поллинг статусов каждые 15 секунд
  useEffect(() => {
    const id = setInterval(() => {
      fetchTeamStatuses()
        .then((statuses) => {
          setEmployees((prev) =>
            prev.map((e) => {
              const s = statuses.find((st) => st.employee_email === e.email);
              return s ? { ...e, online_status: s.status, current_task: s.current_task } : e;
            })
          );
        })
        .catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const positions = useMemo(() => {
    const set = new Set(employees.map((e) => e.position));
    return ['all', ...set];
  }, [employees]);

  const filtered = useMemo(() => {
    let list = employees;
    if (filterStatus !== 'all')
      list = list.filter((e) => (e.online_status || 'offline') === filterStatus);
    if (filterVacation === 'low')
      list = list.filter((e) => e.vacation_remaining < 7);
    if (filterVacation === 'pending')
      list = list.filter((e) => e.vacation_pending > 0);
    if (filterPosition !== 'all')
      list = list.filter((e) => e.position === filterPosition);
    if (search.trim())
      list = list.filter((e) =>
        e.full_name.toLowerCase().includes(search.toLowerCase()) ||
        e.position.toLowerCase().includes(search.toLowerCase())
      );
    return list;
  }, [employees, filterStatus, filterVacation, filterPosition, search]);

  const stats = useMemo(() => ({
    total:   employees.length,
    online:  employees.filter((e) => e.online_status === 'online').length,
    lowVac:  employees.filter((e) => e.vacation_remaining < 7).length,
    pending: employees.filter((e) => e.vacation_pending > 0).length,
  }), [employees]);

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="page-eyebrow">Руководитель</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Команда</h1>
          <p className="mt-2 text-slate-400">Сотрудники, статусы, отпуска и контакты.</p>
        </div>
        <button onClick={() => setShowBonus(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-purple-600/15 px-4 py-2 text-sm font-semibold text-purple-200 ring-1 ring-purple-400/30 hover:bg-purple-600/25">
          <Target size={16} />Бонусные итоги
        </button>
      </div>

      {/* Метрики */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Всего', value: loading ? '…' : stats.total, icon: Users },
          { label: 'Онлайн сейчас', value: loading ? '…' : stats.online, icon: User,
            accent: stats.online > 0 ? 'text-green-400' : '' },
          { label: 'Мало отпуска (<7 дн.)', value: loading ? '…' : stats.lowVac, icon: Calendar,
            accent: stats.lowVac > 0 ? 'text-yellow-300' : '' },
          { label: 'На согласовании', value: loading ? '…' : stats.pending, icon: Briefcase },
        ].map(({ label, value, icon: Icon, accent }) => (
          <Card key={label}>
            <div className="flex items-center justify-between gap-3">
              <p className="metric-label">{label}</p>
              <Icon size={18} className="text-slate-500" />
            </div>
            <p className={`metric-value mt-3 text-4xl font-bold ${accent || 'text-white'}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Список сотрудников */}
      <Card>
        {/* Фильтры */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Сотрудники</h2>
            <p className="mt-1 text-slate-400">Нажмите на карточку для просмотра полного профиля.</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Поиск */}
          <label className="fintech-input flex items-center gap-2 rounded-2xl px-3 py-2 xl:w-56">
            <Search size={16} className="shrink-0 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти сотрудника"
              className="min-w-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
          </label>

          {/* Статус */}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="fintech-input rounded-2xl px-3 py-2 text-sm text-white outline-none">
            <option value="all">Все статусы</option>
            <option value="online">Онлайн</option>
            <option value="break">Перерыв</option>
            <option value="offline">Оффлайн</option>
          </select>

          {/* Отпуск */}
          <select value={filterVacation} onChange={(e) => setFilterVacation(e.target.value)}
            className="fintech-input rounded-2xl px-3 py-2 text-sm text-white outline-none">
            <option value="all">Все отпуска</option>
            <option value="low">Мало дней (&lt;7)</option>
            <option value="pending">На согласовании</option>
          </select>

          {/* Должность */}
          <select value={filterPosition} onChange={(e) => setFilterPosition(e.target.value)}
            className="fintech-input rounded-2xl px-3 py-2 text-sm text-white outline-none">
            {positions.map((p) => (
              <option key={p} value={p}>{p === 'all' ? 'Все должности' : p}</option>
            ))}
          </select>
        </div>

        <div className="mt-5 space-y-3">
          {loading && (
            <div className="flex items-center gap-3 py-6 text-slate-400">
              <Loader2 size={20} className="animate-spin" />Загрузка...
            </div>
          )}
          {error && <p className="py-4 text-sm text-red-400">Не удалось загрузить список сотрудников</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Сотрудники не найдены</p>
          )}

          {filtered.map((emp) => {
            const status = emp.online_status || 'offline';
            const age = calcAge(emp.birth_date);
            return (
              <div key={emp.email} className="data-row rounded-2xl p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Левая часть — клик открывает профиль */}
                  <button
                    onClick={() => setProfileEmployee(emp)}
                    className="flex items-start gap-3 text-left"
                  >
                    <div className="relative shrink-0">
                      <div
                        className="grid h-12 w-12 place-items-center rounded-2xl text-sm font-bold text-white"
                        style={{ background: emp.avatar_color || '#4F46E5' }}
                      >
                        {initials(emp.full_name)}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-900 ${STATUS_DOT[status]}`} />
                    </div>
                    <div>
                      <p className="text-base font-bold text-white sm:text-lg">{emp.full_name}</p>
                      <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">{emp.position} · {emp.department}</p>
                      {emp.current_task && status !== 'offline' && (
                        <p className="mt-1 max-w-[200px] truncate text-[10px] font-medium text-slate-500 sm:max-w-xs sm:text-xs">
                          {emp.current_task}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Правая часть — метрики и кнопки */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase sm:text-xs ${STATUS_CHIP[status]}`}>
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                      {STATUS_LABEL[status]}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400 sm:text-sm">
                      Отпуск: <b className={emp.vacation_remaining < 7 ? 'text-yellow-300' : 'text-white'}>
                        {pluralDays(emp.vacation_remaining)}
                      </b>
                    </span>
                    <div className="mt-1 flex w-full gap-2 sm:mt-0 sm:w-auto">
                      <button onClick={() => setGoalsEmployee(emp)}
                        className="flex-1 items-center justify-center gap-1 rounded-xl bg-purple-600/15 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-purple-200 ring-1 ring-purple-400/20 sm:flex sm:flex-none sm:py-1.5 sm:normal-case sm:tracking-normal">
                        <Target size={14} className="hidden sm:block" />Цели
                      </button>
                      <button onClick={() => { onOpenEmployeeChat(emp.email); }}
                        className="flex-1 items-center justify-center gap-1 rounded-xl bg-slate-700/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-200 ring-1 ring-slate-600/40 sm:flex sm:flex-none sm:py-1.5 sm:normal-case sm:tracking-normal">
                        <MessageCircle size={14} className="hidden sm:block" />Чат
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {profileEmployee && (
        <ProfileModal
          employee={profileEmployee}
          onClose={() => setProfileEmployee(null)}
          onChat={(email) => { onOpenEmployeeChat(email); }}
        />
      )}
      {goalsEmployee && <GoalsModal employee={goalsEmployee} onClose={() => setGoalsEmployee(null)} />}
      {showBonus && <BonusModal onClose={() => setShowBonus(false)} />}
    </div>
  );
}
