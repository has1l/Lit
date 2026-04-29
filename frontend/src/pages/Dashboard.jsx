import {
  AlertTriangle, CalendarDays, Check, ChevronDown, ChevronRight,
  ClipboardList, Clock3, Play, RotateCcw, Trophy, WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { formatDay, formatAmount, paymentTypeRu, pluralDays } from '../lib/format.js';
import {
  fetchGoals, fetchDailyTasks, selectDailyTasks,
  completeDailyTask, uncompleteDailyTask, finishDay,
} from '../api/goals.js';
import { updateMyStatus } from '../api/employee.js';

const RECOMMENDATION_DEFS = [
  { id: 1, type: 'vacation' },
  { id: 2, type: 'tasks' },
  { id: 3, type: 'salary' },
];

const STATUS_OPTS = {
  work:    { label: 'Онлайн',       dot: 'bg-purple-500' },
  break:   { label: 'На перерыве',  dot: 'bg-yellow-400' },
  offline: { label: 'Оффлайн',      dot: 'bg-red-500' },
};

const DIFF_WEIGHT  = { easy: 5, medium: 15, hard: 30 };
const DIFF_LABEL   = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };
const DIFF_COLOR   = { easy: 'text-green-400', medium: 'text-yellow-300', hard: 'text-red-400' };
const DIFF_RING    = {
  easy:   'border-green-400/30 bg-green-500/8 text-green-300',
  medium: 'border-yellow-400/30 bg-yellow-500/8 text-yellow-300',
  hard:   'border-red-400/30 bg-red-500/8 text-red-300',
};
const WARN_MIN   = 20;   // ниже — слишком легко
const WARN_HEAVY = 65;   // выше — предупреждение о перегрузке

function loadState(key, def) {
  try { const v = localStorage.getItem(key); return v ? { ...def, ...JSON.parse(v) } : def; }
  catch { return def; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard({ openChatWithPrompt, navigate, profile }) {
  const { data: myData } = useEmployeeData();
  const workdayRef = useRef(null);
  const today = todayStr();

  // ── Состояние дня ─────────────────────────────────────────────────────────
  const [phase, setPhase] = useState(() => {
    // 'idle' | 'selecting' | 'working' | 'done'
    const s = loadState('lit-day', {});
    if (s.dayDate !== today) return 'idle';
    if (s.phase) return s.phase;
    if (s.dayCompleted) return 'done';
    if (s.dayStarted) return 'working';
    return 'idle';
  });
  const [dayDate, setDayDate] = useState(() => {
    const s = loadState('lit-day', {});
    return s.dayDate ?? null;
  });

  const [status,     setStatus]     = useState(() => {
    const s = localStorage.getItem('techna-status');
    return s === 'done' ? 'offline' : (s || 'offline');
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [showModal,  setShowModal]  = useState(false);
  const [reasonDrafts, setReasonDrafts] = useState({});
  const [dayResult,  setDayResult]  = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(() => {
    const s = loadState('lit-day', {});
    return s.activeTaskId ?? null;
  });

  // ── Цели ──────────────────────────────────────────────────────────────────
  const [monthGoals,    setMonthGoals]    = useState([]);
  const [dailyTasks,    setDailyTasks]    = useState([]);
  const [selectedIds,   setSelectedIds]   = useState(new Set());  // фаза выбора

  // ── Рекомендации ──────────────────────────────────────────────────────────
  const [completions,   setCompletions]   = useState(() => loadState('techna-completions', {}));
  const [dailyReports,  setDailyReports]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('techna-daily-reports') || '[]'); }
    catch { return []; }
  });

  // Сброс при смене даты
  useEffect(() => {
    const s = loadState('lit-day', {});
    if (s.dayDate && s.dayDate !== today) {
      localStorage.removeItem('lit-day');
      setPhase('idle');
      setDayDate(null);
      setDailyTasks([]);
      setActiveTaskId(null);
    }
  }, [today]);

  // Сохранение в localStorage
  useEffect(() => {
    localStorage.setItem('lit-day', JSON.stringify({ phase, dayDate, activeTaskId }));
  }, [phase, dayDate, activeTaskId]);

  useEffect(() => { localStorage.setItem('techna-status', status); }, [status]);
  useEffect(() => { localStorage.setItem('techna-completions', JSON.stringify(completions)); }, [completions]);
  useEffect(() => { localStorage.setItem('techna-daily-reports', JSON.stringify(dailyReports)); }, [dailyReports]);

  // Статус онлайн синхронизируется с фазой
  useEffect(() => {
    if (phase === 'working' && status === 'offline') setStatus('work');
    if ((phase === 'idle' || phase === 'done') && status !== 'offline') setStatus('offline');
  }, [phase]);

  // Загрузка данных
  useEffect(() => {
    Promise.all([fetchGoals(), fetchDailyTasks(today)])
      .then(([goals, daily]) => {
        setMonthGoals(goals);
        setDailyTasks(daily);
        if (daily.length > 0 && phase === 'idle') {
          setPhase('working');
          setDayDate(today);
        }
      })
      .catch(() => {});
  }, [today]);

  // ── Производные ───────────────────────────────────────────────────────────
  const allDone         = useMemo(() => dailyTasks.length > 0 && dailyTasks.every((t) => t.completed), [dailyTasks]);
  const completedCount  = useMemo(() => dailyTasks.filter((t) => t.completed).length, [dailyTasks]);
  const incompleteTasks = useMemo(() => dailyTasks.filter((t) => !t.completed), [dailyTasks]);
  const canSubmitReport = useMemo(
    () => incompleteTasks.length > 0 && incompleteTasks.every((t) => reasonDrafts[t.id]?.trim()),
    [incompleteTasks, reasonDrafts],
  );
  const availableStatuses = useMemo(() => {
    if (phase !== 'working') return [];
    return status === 'break' ? ['work'] : ['break'];
  }, [phase, status]);

  // Вес выбранных задач в фазе выбора
  const selectionWeight = useMemo(() => {
    return monthGoals
      .filter((g) => selectedIds.has(g.id))
      .reduce((sum, g) => sum + (DIFF_WEIGHT[g.difficulty] ?? 15), 0);
  }, [selectedIds, monthGoals]);

  const selectionWarning = useMemo(() => {
    if (selectedIds.size === 0) return null;
    if (selectionWeight < WARN_MIN)
      return { type: 'light', text: 'Слишком лёгкая нагрузка — есть более приоритетные задачи, риск не успеть к дедлайну.' };
    if (selectionWeight > WARN_HEAVY)
      return { type: 'heavy', text: 'Большая нагрузка — возможно, стоит оставить часть задач на другой день.' };
    return null;
  }, [selectionWeight, selectedIds.size]);

  const leaveBalance = myData?.leave;
  const nextPayment  = myData?.upcoming_payments?.[0];

  const technaRecommendations = useMemo(() => {
    const leave = myData?.leave;
    const np    = myData?.upcoming_payments?.[0];
    const texts = {
      vacation: leave
        ? `Остаток отпуска: ${pluralDays(leave.remaining_days)} — не забудьте запланировать`
        : 'Проверьте остаток отпуска в разделе Отпуск',
      tasks:  'Техна заметила: сегодня есть незавершённые задачи',
      salary: np
        ? `${paymentTypeRu(np.payment_type)} ${formatDay(np.payment_date)} — ${formatAmount(np.amount)}`
        : 'Проверьте раздел зарплаты для информации о выплатах',
    };
    return RECOMMENDATION_DEFS.map((def) => ({
      ...def, text: texts[def.type], completed: completions[def.id] ?? false,
    }));
  }, [myData, completions]);

  // ── Обработчики ───────────────────────────────────────────────────────────

  function openSelectionPhase() {
    // По умолчанию выбираем все задачи
    setSelectedIds(new Set(monthGoals.map((g) => g.id)));
    setPhase('selecting');
  }

  function toggleGoalSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function confirmSelection() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      const tasks = await selectDailyTasks(ids, today);
      setDailyTasks(tasks);
      setPhase('working');
      setDayDate(today);
      updateMyStatus('online', tasks[0]?.title || '').catch(() => {});
    } catch (e) {
      if (e?.status === 409) {
        const tasks = await fetchDailyTasks(today);
        setDailyTasks(tasks);
        setPhase('working');
        setDayDate(today);
      } else {
        alert(e?.message || 'Ошибка при подтверждении задач');
      }
    }
  }

  async function toggleComplete(selectionId) {
    if (phase !== 'working') return;
    const task = dailyTasks.find((t) => t.id === selectionId);
    if (!task) return;
    try {
      if (task.completed) {
        await uncompleteDailyTask(selectionId);
        setDailyTasks((prev) => prev.map((t) => t.id === selectionId ? { ...t, completed: 0, completed_at: null } : t));
        if (activeTaskId === selectionId) {
          // раз снимаем — скорее всего снова в работе
        }
      } else {
        await completeDailyTask(selectionId);
        setDailyTasks((prev) => prev.map((t) => t.id === selectionId ? { ...t, completed: 1 } : t));
        if (activeTaskId === selectionId) {
          // автоматически переключаем на следующую невыполненную
          const nextTask = dailyTasks.find((t) => !t.completed && t.id !== selectionId);
          if (nextTask) activateTask(nextTask);
        }
      }
    } catch {}
  }

  function activateTask(task) {
    setActiveTaskId(task.id);
    updateMyStatus('online', task.title).catch(() => {});
  }

  function deactivateTask() {
    setActiveTaskId(null);
    updateMyStatus('online', '').catch(() => {});
  }

  async function handleFinishDay() {
    if (allDone) { await doFinish(); return; }
    setReasonDrafts({});
    setShowModal(true);
  }

  async function doFinish() {
    const incompleteReport = incompleteTasks.map((t) => ({
      id: t.id, title: t.title, reason: reasonDrafts[t.id]?.trim() || '',
    }));
    try {
      const result = await finishDay(today);
      setDayResult(result);
    } catch {}
    setDailyReports((prev) => [{
      id: Date.now(), date: new Date().toLocaleDateString(),
      completed: completedCount, total: dailyTasks.length, incomplete: incompleteReport,
    }, ...prev]);
    setPhase('done');
    setActiveTaskId(null);
    setShowModal(false);
    updateMyStatus('offline', '').catch(() => {});
  }

  function startNewDay() {
    setPhase('idle');
    setDayDate(null);
    setDailyTasks([]);
    setActiveTaskId(null);
    setReasonDrafts({});
    setDayResult(null);
    localStorage.removeItem('lit-day');
  }

  function handleRecommendationClick(rec) {
    setCompletions((c) => ({ ...c, [rec.id]: true }));
    if (rec.type === 'vacation') navigate('vacation');
    if (rec.type === 'tasks') workdayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (rec.type === 'salary') navigate('salary');
  }

  // ── Шапка-кнопка ──────────────────────────────────────────────────────────
  const headerAction = useMemo(() => {
    if (phase === 'idle')
      return <Button className="w-full lg:w-auto" onClick={openSelectionPhase}>Начать день</Button>;
    if (phase === 'selecting')
      return (
        <Button className="w-full lg:w-auto" onClick={confirmSelection} disabled={selectedIds.size === 0 || selectionWeight < WARN_MIN}>
          Начать день ({selectedIds.size})
        </Button>
      );
    if (phase === 'working' && allDone)
      return <Button className="w-full lg:w-auto" onClick={handleFinishDay}>Завершить день</Button>;
    if (phase === 'working')
      return (
        <button type="button" onClick={() => workdayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fintech-button-secondary inline-flex min-h-11 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold">
          Открыть задачи
        </button>
      );
    return (
      <button type="button" disabled
        className="status-chip inline-flex min-h-11 cursor-default items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold">
        День завершён
      </button>
    );
  }, [phase, selectedIds.size, selectionWeight, allDone]);

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="metric-label">Рабочий кабинет</p>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-4xl">
              {`Доброе утро, ${profile?.name || ''}`}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="status-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_OPTS[status].dot}`} />
                {STATUS_OPTS[status].label}
              </span>
              <span className="status-chip rounded-full px-3 py-1 text-sm font-semibold">
                {completedCount}/{dailyTasks.length} задач
              </span>
              <span className="status-chip rounded-full px-3 py-1 text-sm font-semibold">
                {nextPayment ? `${paymentTypeRu(nextPayment.payment_type)} ${formatDay(nextPayment.payment_date)}` : 'Выплат нет'}
              </span>
            </div>
          </div>
          {headerAction}
        </div>
      </Card>

      {/* Метрики */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Сегодня</p>
            <ClipboardList className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-3xl font-bold">{completedCount}/{dailyTasks.length}</p>
          <p className="mt-1 text-sm text-slate-400">{dailyTasks.length - completedCount} в работе</p>
        </div>
        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Отпуск</p>
            <CalendarDays className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-3xl font-bold">
            {leaveBalance ? pluralDays(leaveBalance.remaining_days) : '—'}
          </p>
          <p className="mt-1 text-sm text-slate-400">Доступно к планированию</p>
        </div>
        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Ближайшая выплата</p>
            <WalletCards className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-2xl font-bold">
            {nextPayment ? formatAmount(nextPayment.amount) : '—'}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {nextPayment ? `${paymentTypeRu(nextPayment.payment_type)} · ${formatDay(nextPayment.payment_date)}` : 'Нет плановых выплат'}
          </p>
        </div>
      </div>

      {/* Рабочий день */}
      <div ref={workdayRef} data-tour="employee-workday" className="scroll-mt-24">
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Рабочий день</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-slate-400">
                <span className="status-chip inline-flex items-center gap-2 rounded-full px-3 py-1">
                  <Clock3 size={16} />09:00 — 18:00
                </span>
              </div>
            </div>

            {/* Переключатель перерыв/онлайн */}
            {phase === 'working' && (
              <div className="relative">
                <button type="button"
                  onClick={() => availableStatuses.length > 0 && setStatusOpen((v) => !v)}
                  className={`status-chip inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    availableStatuses.length === 0 ? 'cursor-default' : 'hover:border-indigo-500/40'
                  }`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_OPTS[status].dot}`} />
                  {STATUS_OPTS[status].label}
                  {availableStatuses.length > 0 && <ChevronDown size={16} />}
                </button>
                {statusOpen && availableStatuses.length > 0 && (
                  <div className="fintech-panel absolute right-0 z-30 mt-2 w-44 rounded-2xl p-2">
                    {availableStatuses.map((s) => (
                      <button key={s} type="button"
                        onClick={() => { setStatus(s); setStatusOpen(false); updateMyStatus(s === 'break' ? 'break' : 'online', '').catch(() => {}); }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-indigo-500/10">
                        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_OPTS[s].dot}`} />
                        {STATUS_OPTS[s].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── ФАЗА: Не начат ─────────────────────────────────────────────── */}
          {phase === 'idle' && (
            <div className="mt-5">
              {monthGoals.length === 0 ? (
                <p className="text-sm text-slate-500">Руководитель пока не назначил задачи на месяц.</p>
              ) : (
                <p className="text-sm text-slate-400">
                  У вас {monthGoals.length} задач на месяц. Нажмите «Начать день», чтобы выбрать, над чем работать сегодня.
                </p>
              )}
              <Button className="mt-4 w-full sm:w-auto" onClick={openSelectionPhase}>
                Начать рабочий день
              </Button>
            </div>
          )}

          {/* ── ФАЗА: Выбор задач ──────────────────────────────────────────── */}
          {phase === 'selecting' && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-300">
                Выберите задачи на сегодня. Отметьте те, что планируете закрыть за день.
              </p>

              {monthGoals.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Задач на месяц нет — обратитесь к руководителю.</p>
              ) : (
                <div className="mt-4 grid gap-2">
                  {monthGoals.map((goal) => {
                    const selected = selectedIds.has(goal.id);
                    const dc = DIFF_COLOR[goal.difficulty] || 'text-slate-400';
                    const dr = DIFF_RING[goal.difficulty] || DIFF_RING.medium;
                    return (
                      <button key={goal.id} type="button" onClick={() => toggleGoalSelect(goal.id)}
                        className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-purple-400/50 bg-purple-600/12'
                            : 'border-slate-700 bg-slate-950/35 hover:border-slate-600'
                        }`}>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${
                          selected ? 'border-purple-400 bg-purple-600 text-white' : 'border-slate-600 bg-slate-950/60 text-transparent'
                        }`}>
                          <Check size={14} />
                        </span>
                        <span className="min-w-0 flex-1 font-semibold text-white">{goal.title}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${dr}`}>
                          {DIFF_LABEL[goal.difficulty] || goal.difficulty}
                        </span>
                        <span className="shrink-0 text-sm font-bold text-slate-400">{goal.points} pts</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Нагрузка + предупреждение */}
              {selectedIds.size > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span>Нагрузка дня:</span>
                    <span className={`font-bold ${
                      selectionWeight < WARN_MIN ? 'text-yellow-300' :
                      selectionWeight > WARN_HEAVY ? 'text-orange-400' : 'text-green-400'
                    }`}>{selectionWeight} / {WARN_HEAVY} ед.</span>
                  </div>
                  {selectionWarning && (
                    <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                      selectionWarning.type === 'light'
                        ? 'border-yellow-400/30 bg-yellow-500/8 text-yellow-300'
                        : 'border-orange-400/30 bg-orange-500/8 text-orange-300'
                    }`}>
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      {selectionWarning.text}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  onClick={confirmSelection}
                  disabled={selectedIds.size === 0 || selectionWeight < WARN_MIN}
                >
                  Подтвердить выбор ({selectedIds.size})
                </Button>
                <button type="button" onClick={() => setPhase('idle')}
                  className="fintech-button-secondary inline-flex min-h-11 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold">
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* ── ФАЗА: Рабочий список ───────────────────────────────────────── */}
          {phase === 'working' && (
            <>
              {dailyTasks.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500">Нет задач на сегодня.</p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {dailyTasks.map((task) => {
                    const isActive    = activeTaskId === task.id;
                    const isCompleted = !!task.completed;
                    const dc = DIFF_COLOR[task.difficulty] || 'text-slate-400';
                    const dl = DIFF_LABEL[task.difficulty];
                    return (
                      <div key={task.id}
                        className={`flex items-center gap-3 rounded-3xl border p-4 transition ${
                          isActive
                            ? 'border-purple-400/60 bg-purple-600/15'
                            : isCompleted
                              ? 'border-slate-700/50 bg-slate-950/25'
                              : 'border-slate-700 bg-slate-950/45'
                        }`}>
                        {/* Чекбокс — кликабелен в обе стороны */}
                        <button type="button" onClick={() => toggleComplete(task.id)}
                          title={isCompleted ? 'Снять отметку' : 'Отметить выполненным'}
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition hover:scale-105 ${
                            isCompleted
                              ? 'border-purple-400 bg-purple-600 text-white hover:bg-purple-700'
                              : 'border-slate-600 bg-slate-950/60 text-transparent hover:border-purple-400'
                          }`}>
                          <Check size={15} />
                        </button>

                        {/* Название */}
                        <span className={`min-w-0 flex-1 font-semibold leading-snug ${
                          isCompleted ? 'text-slate-400 line-through decoration-slate-500/60' : 'text-white'
                        }`}>
                          {task.title}
                          {isActive && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-purple-600/25 px-2 py-0.5 text-xs font-bold text-purple-300">
                              <Play size={10} />в работе
                            </span>
                          )}
                        </span>

                        {dl && <span className={`shrink-0 text-xs font-semibold ${dc}`}>{dl}</span>}
                        <span className="shrink-0 rounded-xl bg-slate-800 px-2 py-1 text-xs font-bold text-purple-300">
                          {task.points} pts
                        </span>

                        {/* Кнопка "Работаю" / убрать активность */}
                        {!isCompleted && (
                          isActive ? (
                            <button type="button" onClick={deactivateTask}
                              title="Убрать активный статус"
                              className="shrink-0 rounded-xl bg-purple-600/20 px-2 py-1.5 text-xs font-bold text-purple-300 ring-1 ring-purple-400/30 transition hover:bg-slate-800">
                              <RotateCcw size={13} />
                            </button>
                          ) : (
                            <button type="button" onClick={() => activateTask(task)}
                              title="Сейчас работаю над этим"
                              className="shrink-0 rounded-xl bg-slate-800 px-2 py-1.5 text-xs font-bold text-slate-400 transition hover:bg-purple-600/20 hover:text-purple-300">
                              <Play size={13} />
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button onClick={handleFinishDay}>Завершить рабочий день</Button>
                {dailyTasks.length > 0 && (
                  <p className="text-sm text-slate-500">{completedCount} / {dailyTasks.length} выполнено</p>
                )}
              </div>
            </>
          )}

          {/* ── ФАЗА: День завершён ────────────────────────────────────────── */}
          {phase === 'done' && (
            <div className={`mt-5 rounded-3xl border p-5 ${
              dayResult?.bonus ? 'border-purple-400/30 bg-purple-600/10' : 'border-slate-700 bg-slate-950/45'
            }`}>
              <p className="text-lg font-bold text-white">Рабочий день завершён</p>
              {dayResult ? (
                <div className="mt-3 space-y-2">
                  <p className="font-semibold text-slate-200">
                    Выполнено {completedCount} из {dailyTasks.length} задач
                    {dayResult.completion_rate !== undefined && ` (${dayResult.completion_rate}%)`}
                  </p>
                  {dayResult.bonus && (
                    <div className="flex items-center gap-2 text-yellow-300">
                      <Trophy size={16} />
                      <span className="font-bold">Бонус ×1.5 — все задачи! +{dayResult.points_earned} pts</span>
                    </div>
                  )}
                  {!dayResult.bonus && !dayResult.penalty && dayResult.points_earned > 0 && (
                    <p className="text-purple-200">+{dayResult.points_earned} pts заработано</p>
                  )}
                  {dayResult.penalty && (
                    <p className="text-red-300">Менее 60% выполнено — штраф. +{dayResult.points_earned} pts</p>
                  )}
                  <p className="text-sm text-slate-400">Всего очков: {dayResult.total}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-400">Выполнено {completedCount} из {dailyTasks.length}</p>
              )}
              <Button variant="secondary" className="mt-5 w-full sm:w-auto" onClick={startNewDay}>
                Начать новый рабочий день
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Рекомендации + HR-сводка */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <h2 className="text-xl font-bold text-white">Техна рекомендует</h2>
          <p className="mt-2 text-slate-400">Три коротких подсказки на сегодня.</p>
          <div className="mt-5 space-y-3">
            {technaRecommendations.map((item, index) => {
              const icons = { vacation: CalendarDays, tasks: ClipboardList, salary: WalletCards };
              const Icon = icons[item.type];
              const isFeatured = index === 0 && !item.completed;
              return (
                <div key={item.id}
                  className={`flex w-full flex-col gap-3 rounded-2xl border p-4 transition sm:flex-row sm:items-center sm:gap-4 ${
                    isFeatured ? 'border-purple-400/30 bg-purple-600/10' : 'border-slate-800 bg-slate-950/20'
                  } ${item.completed ? 'opacity-70' : ''}`}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="icon-tile h-10 w-10 shrink-0 rounded-2xl">
                      {item.completed ? <Check size={20} /> : <Icon size={20} />}
                    </span>
                    <button onClick={() => handleRecommendationClick(item)}
                      className={`min-w-0 flex-1 text-left text-sm font-semibold leading-6 transition hover:text-blue-300 sm:text-base ${
                        item.completed ? 'text-slate-400 line-through decoration-purple-300/70' : 'text-white'
                      }`}>
                      {item.text}
                    </button>
                  </div>
                  {item.completed ? (
                    <span className="status-chip w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold">Выполнено</span>
                  ) : (
                    <Button variant="secondary" className="w-full shrink-0 px-4 py-2 sm:w-auto"
                      onClick={() => handleRecommendationClick(item)}>
                      Перейти <ChevronRight size={16} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-white">HR-сводка</h2>
          <div className="mt-5 space-y-3">
            <button type="button" onClick={() => navigate('vacation')}
              className="data-row flex w-full items-center justify-between gap-4 rounded-2xl p-4 text-left">
              <span>
                <span className="metric-label">Отпуск</span>
                <span className="mt-1 block font-semibold text-white">
                  {leaveBalance ? pluralDays(leaveBalance.remaining_days) : 'Нет данных'}
                </span>
              </span>
              <CalendarDays className="text-slate-400" size={20} />
            </button>
            <button type="button" onClick={() => navigate('salary')}
              className="data-row flex w-full items-center justify-between gap-4 rounded-2xl p-4 text-left">
              <span>
                <span className="metric-label">Ближайшая выплата</span>
                <span className="mt-1 block font-semibold text-white">
                  {nextPayment ? `${formatAmount(nextPayment.amount)} · ${formatDay(nextPayment.payment_date)}` : 'Нет плановых выплат'}
                </span>
              </span>
              <WalletCards className="text-slate-400" size={20} />
            </button>
            <button type="button" onClick={() => navigate('goals')}
              className="data-row flex w-full items-center justify-between gap-4 rounded-2xl p-4 text-left">
              <span>
                <span className="metric-label">Цели месяца</span>
                <span className="mt-1 block font-semibold text-white">
                  {monthGoals.length > 0 ? `${monthGoals.length} задач` : 'Пока не назначены'}
                </span>
              </span>
              <ClipboardList className="text-slate-400" size={20} />
            </button>
          </div>
        </Card>
      </div>

      {/* Модалка незавершённого дня */}
      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl">
            <h2 className="text-2xl font-bold text-white">Отчёт по невыполненным задачам</h2>
            <p className="mt-2 text-sm text-slate-400">
              Выполнено {completedCount} из {dailyTasks.length}.
              {completedCount / dailyTasks.length < 0.6
                ? ' Менее 60% — будет применён штраф к очкам.'
                : ' Очки начислятся только за выполненные задачи.'}
            </p>
            <div className="mt-5 space-y-4">
              {incompleteTasks.map((task) => (
                <label key={task.id} className="block rounded-2xl border border-slate-700 bg-slate-950/35 p-4">
                  <span className="block text-sm font-bold text-white">{task.title}</span>
                  <span className="mt-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Причина — будет видна руководителю
                  </span>
                  <textarea value={reasonDrafts[task.id] || ''}
                    onChange={(e) => setReasonDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))}
                    placeholder="Например: жду ревью, не хватило данных, перенёс из-за срочной задачи"
                    className="fintech-input mt-3 min-h-24 w-full resize-none rounded-2xl px-4 py-3 outline-none" />
                </label>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Отмена</Button>
              <Button className="flex-1" onClick={doFinish} disabled={!canSubmitReport}>
                Завершить и сформировать отчёт
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
