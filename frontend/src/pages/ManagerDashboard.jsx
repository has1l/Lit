import { Loader2, MessageCircle, Plus, Search, Sparkles, Target, Trash2, UsersRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { fetchTeamEmployees } from '../api/employee.js';
import { fetchGoals, createGoal, updateGoal, deleteGoal, suggestPoints, fetchBonusRecords, reviewBonus, closeMonth } from '../api/goals.js';

const MONTH_RU = ['','янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const MONTH_FULL = ['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} день`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}

function formatHireDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_RU[m]} ${y}`;
}

function initials(fullName) {
  return fullName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// ── Модалка управления целями ─────────────────────────────────────────────────

function GoalsModal({ employee, onClose }) {
  const now = new Date();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState(20);
  const [suggesting, setSuggesting] = useState(false);
  const [addingGoal, setAddingGoal] = useState(false);
  const [draftGoals, setDraftGoals] = useState([{ title: '', description: '' }]);
  const [showBulk, setShowBulk] = useState(false);

  useEffect(() => {
    fetchGoals({ employee_email: employee.email })
      .then(setGoals)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [employee.email]);

  async function handleAdd() {
    if (!newTitle.trim()) return;
    try {
      const created = await createGoal({
        employee_email: employee.email,
        title: newTitle.trim(),
        description: newDesc.trim(),
        points: Number(newPoints),
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });
      setGoals((prev) => [...prev, created]);
      setNewTitle(''); setNewDesc(''); setNewPoints(20);
      setAddingGoal(false);
    } catch {}
  }

  async function handleDelete(id) {
    try {
      await deleteGoal(id);
      setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch {}
  }

  async function handleSuggest() {
    if (draftGoals.every((g) => !g.title.trim())) return;
    setSuggesting(true);
    try {
      const validGoals = draftGoals.filter((g) => g.title.trim());
      const res = await suggestPoints(validGoals);
      const suggestions = res.suggestions ?? [];
      setDraftGoals((prev) =>
        prev.map((g, i) => {
          const s = suggestions.find((s) => s.index === i);
          return s ? { ...g, suggestedPoints: s.points } : g;
        })
      );
    } catch {}
    setSuggesting(false);
  }

  async function handleBulkCreate() {
    const valid = draftGoals.filter((g) => g.title.trim());
    if (!valid.length) return;
    try {
      const created = await Promise.all(
        valid.map((g) => createGoal({
          employee_email: employee.email,
          title: g.title.trim(),
          description: g.description?.trim() ?? '',
          points: g.suggestedPoints ?? 20,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        }))
      );
      setGoals((prev) => [...prev, ...created]);
      setDraftGoals([{ title: '', description: '' }]);
      setShowBulk(false);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Цели сотрудника</h2>
            <p className="mt-1 text-slate-400">{employee.full_name} · {MONTH_FULL[now.getMonth() + 1]} {now.getFullYear()}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Существующие цели */}
        {loading ? (
          <div className="mt-6 flex items-center gap-3 text-slate-400"><Loader2 size={18} className="animate-spin" /><span>Загрузка...</span></div>
        ) : (
          <div className="mt-6 space-y-3">
            {goals.length === 0 && !showBulk && !addingGoal && (
              <p className="text-sm text-slate-500">Целей на этот месяц нет. Добавьте их ниже.</p>
            )}
            {goals.map((g) => (
              <div key={g.id} className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-500/10 text-xs font-bold text-purple-300 ring-1 ring-purple-400/20">
                  {g.points}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{g.title}</p>
                  {g.description && <p className="mt-1 text-sm text-slate-500">{g.description}</p>}
                </div>
                <button onClick={() => handleDelete(g.id)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Добавить одну цель */}
        {addingGoal && (
          <div className="mt-4 space-y-3 rounded-2xl border border-purple-400/20 bg-purple-600/5 p-4">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Название цели"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-purple-500" />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Описание (необязательно)"
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

        {/* Массовое добавление с AI */}
        {showBulk && (
          <div className="mt-4 space-y-3 rounded-2xl border border-purple-400/20 bg-purple-600/5 p-4">
            <p className="text-sm font-semibold text-white">Цели на месяц — введите список, Техна распределит баллы</p>
            {draftGoals.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={g.title} onChange={(e) => setDraftGoals((prev) => prev.map((d, j) => j === i ? { ...d, title: e.target.value } : d))}
                  placeholder={`Цель ${i + 1}`}
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-white outline-none placeholder:text-slate-500 focus:border-purple-500" />
                {g.suggestedPoints !== undefined && (
                  <span className="shrink-0 rounded-xl bg-purple-600/20 px-3 py-2 text-sm font-bold text-purple-200">{g.suggestedPoints} pts</span>
                )}
                {draftGoals.length > 1 && (
                  <button onClick={() => setDraftGoals((prev) => prev.filter((_, j) => j !== i))}
                    className="shrink-0 text-slate-600 hover:text-red-400"><X size={16} /></button>
                )}
              </div>
            ))}
            <button onClick={() => setDraftGoals((prev) => [...prev, { title: '', description: '' }])}
              className="text-sm text-purple-400 hover:text-purple-200">+ ещё цель</button>
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

        {/* Кнопки добавления */}
        {!addingGoal && !showBulk && (
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" className="gap-2" onClick={() => setAddingGoal(true)}>
              <Plus size={16} />Добавить цель
            </Button>
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

// ── Модалка бонусных записей ──────────────────────────────────────────────────

function BonusModal({ onClose, currentUserRole }) {
  const now = new Date();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    fetchBonusRecords().then(setRecords).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleReview(id, action) {
    try {
      const updated = await reviewBonus(id, action);
      setRecords((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r));
    } catch {}
  }

  async function handleClose() {
    setClosing(true);
    try {
      await closeMonth({ month: now.getMonth() + 1, year: now.getFullYear() });
      const updated = await fetchBonusRecords();
      setRecords(updated);
    } catch {}
    setClosing(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Бонусные итоги</h2>
            <p className="mt-1 text-slate-400">Результаты сотрудников по целям</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <button onClick={handleClose} disabled={closing}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-purple-600/15 px-4 py-2 text-sm font-semibold text-purple-200 ring-1 ring-purple-400/30 hover:bg-purple-600/25 disabled:opacity-50">
          {closing ? <Loader2 size={15} className="animate-spin" /> : null}
          Подвести итоги {MONTH_FULL[now.getMonth() + 1]}
        </button>

        {loading ? (
          <div className="mt-6 flex items-center gap-3 text-slate-400"><Loader2 size={18} className="animate-spin" /><span>Загрузка...</span></div>
        ) : records.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">Бонусных записей нет. Нажмите «Подвести итоги» для расчёта.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {records.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{r.full_name}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {MONTH_FULL[r.month]} {r.year} · {r.earned_points}/{r.max_points} очков · {r.score_pct}%
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                    r.status === 'approved' ? 'bg-green-500/15 text-green-300 ring-green-400/30' :
                    r.status === 'declined' ? 'bg-red-500/15 text-red-300 ring-red-400/30' :
                    'bg-yellow-500/15 text-yellow-300 ring-yellow-400/30'
                  }`}>
                    {r.status === 'approved' ? '✓ Одобрено' : r.status === 'declined' ? '✕ Отклонено' : 'На рассмотрении'}
                  </span>
                </div>
                {r.status === 'pending' && (
                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1 py-2 text-sm" onClick={() => handleReview(r.id, 'approve')}>
                      Одобрить {r.score_pct >= 90 ? '🏆' : ''}
                    </Button>
                    <Button variant="secondary" className="flex-1 py-2 text-sm" onClick={() => handleReview(r.id, 'decline')}>
                      Отклонить
                    </Button>
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
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [goalsEmployee, setGoalsEmployee] = useState(null);
  const [showBonus, setShowBonus] = useState(false);

  useEffect(() => {
    fetchTeamEmployees()
      .then(setEmployees)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.full_name.toLowerCase().includes(q) ||
             e.position.toLowerCase().includes(q) ||
             e.department.toLowerCase().includes(q),
    );
  }, [employees, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="page-eyebrow">Руководитель</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Команда</h1>
          <p className="mt-2 text-slate-400">Сотрудники, отпуск и контакты.</p>
        </div>
        <button onClick={() => setShowBonus(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-purple-600/15 px-4 py-2 text-sm font-semibold text-purple-200 ring-1 ring-purple-400/30 hover:bg-purple-600/25">
          <Target size={16} />Бонусные итоги
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="metric-label">Всего сотрудников</p>
          <p className="metric-value mt-3 text-4xl font-bold">{loading ? '…' : employees.length}</p>
        </Card>
        <Card>
          <p className="metric-label">Мало отпуска (&lt;7 дн.)</p>
          <p className="metric-value mt-3 text-4xl font-bold">
            {loading ? '…' : employees.filter((e) => e.vacation_remaining < 7).length}
          </p>
        </Card>
        <Card>
          <p className="metric-label">На согласовании</p>
          <p className="metric-value mt-3 text-4xl font-bold">
            {loading ? '…' : employees.filter((e) => e.vacation_pending > 0).length}
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Сотрудники</h2>
            <p className="mt-2 text-slate-400">Отпуск, должность и дата найма.</p>
          </div>
          <label className="fintech-input flex min-w-0 items-center gap-2 rounded-2xl px-4 py-3 xl:w-72">
            <Search size={18} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Найти сотрудника"
              className="min-w-0 bg-transparent text-white outline-none placeholder:text-slate-500" />
          </label>
        </div>

        <div className="mt-5 grid gap-4">
          {loading && (
            <div className="flex items-center gap-3 py-6 text-slate-400">
              <Loader2 size={20} className="animate-spin" /><span>Загрузка...</span>
            </div>
          )}
          {error && <p className="py-4 text-sm text-red-400">Не удалось загрузить список сотрудников</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Сотрудники не найдены</p>
          )}
          {filtered.map((emp) => (
            <div
              key={emp.email}
              className="data-row rounded-2xl p-5"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <button onClick={() => setSelectedEmployee(emp)} className="flex items-start gap-4 text-left">
                  <div className="icon-tile h-12 w-12 shrink-0 rounded-2xl text-sm font-bold">
                    {initials(emp.full_name)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{emp.full_name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{emp.position} · {emp.department}</p>
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
                    <span>Отпуск: <b className={emp.vacation_remaining < 7 ? 'text-yellow-300' : 'text-white'}>
                      {pluralDays(emp.vacation_remaining)}
                    </b></span>
                    {emp.vacation_pending > 0 && (
                      <span>На согл.: <b className="text-yellow-300">{pluralDays(emp.vacation_pending)}</b></span>
                    )}
                    <span>С нами с <b className="text-white">{formatHireDate(emp.hire_date)}</b></span>
                  </div>
                  <button onClick={() => setGoalsEmployee(emp)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600/15 px-3 py-2 text-xs font-semibold text-purple-200 ring-1 ring-purple-400/20 hover:bg-purple-600/25 transition">
                    <Target size={13} />Цели
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Детали сотрудника */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto">
            <div className="flex items-start gap-4">
              <div className="icon-tile h-14 w-14 shrink-0 rounded-2xl text-base font-bold">
                {initials(selectedEmployee.full_name)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedEmployee.full_name}</h2>
                <p className="mt-1 text-slate-400">{selectedEmployee.position} · {selectedEmployee.department}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="metric-card rounded-2xl p-4">
                <p className="metric-label">Email</p>
                <p className="metric-value mt-2 break-all font-bold">{selectedEmployee.email}</p>
              </div>
              <div className="metric-card rounded-2xl p-4">
                <p className="metric-label">Дата найма</p>
                <p className="metric-value mt-2 font-bold">{formatHireDate(selectedEmployee.hire_date)}</p>
              </div>
              <div className="metric-card rounded-2xl p-4">
                <p className="metric-label">Остаток отпуска</p>
                <p className={`mt-2 text-2xl font-bold ${selectedEmployee.vacation_remaining < 7 ? 'text-yellow-300' : 'text-white'}`}>
                  {pluralDays(selectedEmployee.vacation_remaining)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Использовано {pluralDays(selectedEmployee.vacation_used)} из {selectedEmployee.vacation_total}
                </p>
              </div>
              {selectedEmployee.vacation_pending > 0 && (
                <div className="metric-card rounded-2xl p-4">
                  <p className="metric-label">На согласовании</p>
                  <p className="mt-2 text-2xl font-bold text-yellow-300">
                    {pluralDays(selectedEmployee.vacation_pending)}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button className="flex-1" onClick={() => { onOpenEmployeeChat(selectedEmployee.email); setSelectedEmployee(null); }}>
                Написать сотруднику <MessageCircle size={18} />
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => {
                setGoalsEmployee(selectedEmployee);
                setSelectedEmployee(null);
              }}>
                Цели сотрудника <Target size={18} />
              </Button>
              <Button variant="secondary" onClick={() => setSelectedEmployee(null)}>Закрыть</Button>
            </div>
          </Card>
        </div>
      )}

      {goalsEmployee && <GoalsModal employee={goalsEmployee} onClose={() => setGoalsEmployee(null)} />}
      {showBonus && <BonusModal onClose={() => setShowBonus(false)} />}
    </div>
  );
}
