import { CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, Clock3, Trophy, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { formatDay, formatAmount, paymentTypeRu, pluralDays } from '../lib/format.js';
import {
  fetchGoals, fetchDailyTasks, selectDailyTasks,
  completeDailyTask, finishDay,
} from '../api/goals.js';
import { updateMyStatus } from '../api/employee.js';

const RECOMMENDATION_DEFS = [
  { id: 1, type: 'vacation' },
  { id: 2, type: 'tasks' },
  { id: 3, type: 'salary' },
];

const statusOptions = {
  work:    { label: 'Онлайн',  dot: 'bg-purple-500' },
  break:   { label: 'На перерыве',  dot: 'bg-yellow-400' },
  offline: { label: 'Оффлайн', dot: 'bg-red-500' },
};

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

  // ── Состояние рабочего дня ───────────────────────────────────────────────
  const [dayStarted,   setDayStarted]   = useState(() => loadState('lit-day', {}).dayStarted ?? false);
  const [dayCompleted, setDayCompleted] = useState(() => loadState('lit-day', {}).dayCompleted ?? false);
  const [dayDate,      setDayDate]      = useState(() => loadState('lit-day', {}).dayDate ?? null);
  const [status,       setStatus]       = useState(() => {
    const s = localStorage.getItem('techna-status');
    return s === 'done' ? 'offline' : (s || 'offline');
  });
  const [statusOpen,   setStatusOpen]   = useState(false);
  const [showModal,    setShowModal]    = useState(false);
  const [reasonDrafts, setReasonDrafts] = useState({});
  const [dayResult,    setDayResult]    = useState(null);

  // ── Цели: месячные и ежедневные ──────────────────────────────────────────
  const [monthGoals,    setMonthGoals]    = useState([]);
  const [dailyTasks,    setDailyTasks]    = useState([]);   // задачи, назначенные на сегодня

  // ── Рекомендации ─────────────────────────────────────────────────────────
  const [completions, setCompletions] = useState(() => loadState('techna-completions', {}));
  const [dailyReports, setDailyReports] = useState(() => {
    try { return JSON.parse(localStorage.getItem('techna-daily-reports') || '[]'); }
    catch { return []; }
  });

  // Сброс состояния если дата изменилась
  useEffect(() => {
    const saved = loadState('lit-day', {});
    if (saved.dayDate && saved.dayDate !== today) {
      localStorage.removeItem('lit-day');
      setDayStarted(false);
      setDayCompleted(false);
      setDayDate(null);
    }
  }, [today]);

  // Сохранение состояния дня
  useEffect(() => {
    localStorage.setItem('lit-day', JSON.stringify({ dayStarted, dayCompleted, dayDate }));
  }, [dayStarted, dayCompleted, dayDate]);

  useEffect(() => { localStorage.setItem('techna-status', status); }, [status]);
  useEffect(() => { localStorage.setItem('techna-completions', JSON.stringify(completions)); }, [completions]);
  useEffect(() => { localStorage.setItem('techna-daily-reports', JSON.stringify(dailyReports)); }, [dailyReports]);

  useEffect(() => {
    if (!dayStarted || dayCompleted) {
      if (status !== 'offline') setStatus('offline');
      return;
    }
    if (status === 'offline') setStatus('work');
  }, [dayStarted, dayCompleted, status]);

  // Загрузка данных
  useEffect(() => {
    Promise.all([fetchGoals(), fetchDailyTasks(today)])
      .then(([goals, daily]) => {
        setMonthGoals(goals);
        setDailyTasks(daily);
        // Если задачи уже выбраны и день не начат — автоматически считаем день начатым
        if (daily.length > 0 && !dayCompleted) {
          setDayStarted(true);
          setDayDate(today);
          setStatus('work');
        }
      })
      .catch(() => {})
  }, [today]);

  const allDone = useMemo(() => dailyTasks.length > 0 && dailyTasks.every((t) => t.completed), [dailyTasks]);
  const completedCount = useMemo(() => dailyTasks.filter((t) => t.completed).length, [dailyTasks]);
  const incompleteTasks = useMemo(() => dailyTasks.filter((t) => !t.completed), [dailyTasks]);
  const canSubmitIncompleteReport = useMemo(
    () => incompleteTasks.length > 0 && incompleteTasks.every((task) => reasonDrafts[task.id]?.trim()),
    [incompleteTasks, reasonDrafts],
  );
  const availableStatuses = useMemo(() => {
    if (!dayStarted || dayCompleted) return [];
    return status === 'break' ? ['work'] : ['break'];
  }, [dayStarted, dayCompleted, status]);
  const completedTasksCount = completedCount;
  const leaveBalance = myData?.leave;
  const nextPayment = myData?.upcoming_payments?.[0];
  const activeTasksCount = dailyTasks.length - completedCount;

  const technaRecommendations = useMemo(() => {
    const leave = myData?.leave;
    const nextPayment = myData?.upcoming_payments?.[0];
    const texts = {
      vacation: leave
        ? `Остаток отпуска: ${pluralDays(leave.remaining_days)} — не забудьте запланировать`
        : 'Проверьте остаток отпуска в разделе Отпуск',
      tasks: 'Техна заметила: сегодня есть незавершённые задачи',
      salary: nextPayment
        ? `${paymentTypeRu(nextPayment.payment_type)} ${formatDay(nextPayment.payment_date)} — ${formatAmount(nextPayment.amount)}`
        : 'Проверьте раздел зарплаты для информации о выплатах',
    };
    return RECOMMENDATION_DEFS.map((def) => ({
      ...def, text: texts[def.type], completed: completions[def.id] ?? false,
    }));
  }, [myData, completions]);

  // ── Обработчики ──────────────────────────────────────────────────────────

  async function startDay() {
    if (monthGoals.length === 0) {
      setDayStarted(true);
      setDayDate(today);
      setStatus('work');
      updateMyStatus('online', '').catch(() => {});
      return;
    }
    try {
      const tasks = await selectDailyTasks(monthGoals.map((goal) => goal.id), today);
      setDailyTasks(tasks);
      setDayStarted(true);
      setDayDate(today);
      setStatus('work');
      updateMyStatus('online', tasks[0]?.title || '').catch(() => {});
    } catch (e) {
      if (e?.status === 409) {
        const tasks = await fetchDailyTasks(today);
        setDailyTasks(tasks);
        setDayStarted(true);
        setDayDate(today);
        setStatus('work');
        updateMyStatus('online', tasks[0]?.title || '').catch(() => {});
      }
    }
  }

  async function toggleTask(selectionId) {
    if (dayCompleted) return;
    const task = dailyTasks.find((t) => t.id === selectionId);
    if (!task || task.completed) return;
    try {
      await completeDailyTask(selectionId);
      setDailyTasks((prev) => prev.map((t) => t.id === selectionId ? { ...t, completed: 1 } : t));
    } catch {}
  }

  async function handleFinishDay() {
    if (allDone) {
      await doFinish();
      return;
    }
    setReasonDrafts({});
    setShowModal(true);
  }

  async function doFinish() {
    const incompleteReport = incompleteTasks.map((task) => ({
      id: task.id,
      title: task.title,
      reason: reasonDrafts[task.id]?.trim() || '',
    }));
    try {
      const result = await finishDay(today);
      setDayResult(result);
    } catch {}
    setDailyReports((prev) => [{
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      completed: completedCount,
      total: dailyTasks.length,
      incomplete: incompleteReport,
    }, ...prev]);
    setDayCompleted(true);
    setStatus('offline');
    setShowModal(false);
    updateMyStatus('offline', '').catch(() => {});
  }

  function startNewDay() {
    setDayStarted(false);
    setDayCompleted(false);
    setDayDate(null);
    setDailyTasks([]);
    setReasonDrafts({});
    setDayResult(null);
    setStatus('offline');
    localStorage.removeItem('lit-day');
  }

  function handleRecommendationClick(rec) {
    setCompletions((c) => ({ ...c, [rec.id]: true }));
    if (rec.type === 'vacation') navigate('vacation');
    if (rec.type === 'tasks') workdayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (rec.type === 'salary') navigate('salary');
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="metric-label">Рабочий кабинет</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-4xl">
              {`Доброе утро, ${profile?.name || ''}`}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="status-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${statusOptions[status].dot}`} />
                {statusOptions[status].label}
              </span>
              <span className="status-chip rounded-full px-3 py-1 text-sm font-semibold">
                {completedTasksCount}/{dailyTasks.length} задач
              </span>
              <span className="status-chip rounded-full px-3 py-1 text-sm font-semibold">
                {nextPayment ? `${paymentTypeRu(nextPayment.payment_type)} ${formatDay(nextPayment.payment_date)}` : 'Выплат нет'}
              </span>
            </div>
          </div>
          {!dayStarted ? (
            <Button className="w-full lg:w-auto" onClick={startDay}>
              Начать день
            </Button>
          ) : dayStarted && !dayCompleted && allDone ? (
            <Button className="w-full lg:w-auto" onClick={handleFinishDay}>
              Завершить день
            </Button>
          ) : dayCompleted ? (
            <button
              type="button"
              disabled
              className="status-chip inline-flex min-h-11 cursor-default items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold"
            >
              День завершён
            </button>
          ) : (
            <button
              type="button"
              onClick={() => workdayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="fintech-button-secondary inline-flex min-h-11 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold"
            >
              Открыть задачи
            </button>
          )}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Сегодня</p>
            <ClipboardList className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-3xl font-bold">
            {completedTasksCount}/{dailyTasks.length}
          </p>
          <p className="mt-1 text-sm text-slate-400">{activeTasksCount} в работе</p>
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
                  <Clock3 size={16} />
                  Сегодня начало работы в 09:00
                </span>
                <span className="status-chip inline-flex items-center gap-2 rounded-full px-3 py-1">
                  <Check size={16} />
                  Окончание рабочего дня: 18:00
                </span>
              </div>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => availableStatuses.length > 0 && setStatusOpen((current) => !current)}
                className={`status-chip inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  availableStatuses.length === 0 ? 'cursor-default' : 'hover:border-indigo-500/40'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${statusOptions[status].dot}`} />
                {statusOptions[status].label}
                {availableStatuses.length > 0 && <ChevronDown size={16} />}
              </button>

              {statusOpen && availableStatuses.length > 0 && (
                <div className="fintech-panel absolute right-0 z-30 mt-2 w-44 rounded-2xl p-2">
                  {availableStatuses.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setStatus(s); setStatusOpen(false); updateMyStatus(s === 'break' ? 'break' : 'online', '').catch(() => {}); }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-indigo-500/10"
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${statusOptions[s].dot}`} />
                      {statusOptions[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Не начат — кнопка старта */}
          {!dayStarted && (
            <Button className="mt-5 w-full sm:w-auto" onClick={startDay}>
              Начать рабочий день
            </Button>
          )}

          {/* День начат — список задач */}
          {dayStarted && !dayCompleted && (
            <>
              {dailyTasks.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500">Руководитель пока не назначил задачи на сегодня.</p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {dailyTasks.map((task) => (
                    <button key={task.id} type="button"
                      onClick={() => toggleTask(task.id)}
                      disabled={!!task.completed}
                      className={`flex items-center gap-3 rounded-3xl border p-4 text-left transition ${
                        task.completed
                          ? 'border-purple-400/50 bg-purple-600/15 text-slate-300 cursor-default'
                          : 'border-slate-700 bg-slate-950/45 text-slate-200 hover:border-purple-500/50 hover:bg-purple-950/25'
                      }`}
                    >
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${
                        task.completed
                          ? 'border-purple-400 bg-purple-600 text-white'
                          : 'border-slate-600 bg-slate-950/60 text-transparent'
                      }`}>
                        <Check size={16} />
                      </span>
                      <span className={`min-w-0 flex-1 font-semibold ${task.completed ? 'line-through decoration-purple-300/70' : ''}`}>
                        {task.title}
                      </span>
                      <span className="shrink-0 rounded-xl bg-slate-800 px-2 py-1 text-xs font-bold text-purple-300">
                        {task.points} pts
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button onClick={handleFinishDay}>Завершить рабочий день</Button>
                {dailyTasks.length > 0 && (
                  <p className="text-sm text-slate-500">
                    {completedCount} / {dailyTasks.length} выполнено
                  </p>
                )}
              </div>
            </>
          )}

          {/* День завершён */}
          {dayCompleted && (
            <div className={`mt-5 rounded-3xl border p-5 ${
              allDone || dayResult?.bonus
                ? 'border-purple-400/30 bg-purple-600/10'
                : 'border-slate-700 bg-slate-950/45'
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
                      <span className="font-bold">Бонус ×1.5 — все задачи выполнены! +{dayResult.points_earned} pts</span>
                    </div>
                  )}
                  {!dayResult.bonus && !dayResult.penalty && dayResult.points_earned > 0 && (
                    <p className="text-purple-200">+{dayResult.points_earned} pts заработано</p>
                  )}
                  {dayResult.penalty && (
                    <p className="text-red-300">Штраф применён — выполнено менее 60% задач. +{dayResult.points_earned} pts</p>
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

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div>
            <h2 className="text-xl font-bold text-white">Техна рекомендует</h2>
            <p className="mt-2 text-slate-400">Три коротких подсказки на сегодня.</p>
          </div>
          <div className="mt-5 space-y-3">
            {technaRecommendations.map((item, index) => {
              const icons = { vacation: CalendarDays, tasks: ClipboardList, salary: WalletCards };
              const Icon = icons[item.type];
              const isFeatured = index === 0 && !item.completed;
              return (
                <div
                  key={item.id}
                  className={`flex w-full flex-col gap-3 rounded-2xl border p-4 transition sm:flex-row sm:items-center sm:gap-4 ${
                    isFeatured ? 'border-purple-400/30 bg-purple-600/10' : 'border-slate-800 bg-slate-950/20'
                  } ${item.completed ? 'opacity-70' : ''}`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="icon-tile h-10 w-10 shrink-0 rounded-2xl">
                      {item.completed ? <Check size={20} /> : <Icon size={20} />}
                    </span>
                    <button
                      onClick={() => handleRecommendationClick(item)}
                      className={`min-w-0 flex-1 text-left text-sm font-semibold leading-6 transition hover:text-blue-300 sm:text-base ${
                        item.completed ? 'text-slate-400 line-through decoration-purple-300/70' : 'text-white'
                      }`}
                    >
                      {item.text}
                    </button>
                  </div>
                  {item.completed ? (
                    <span className="status-chip w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold">
                      Выполнено
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      className="w-full shrink-0 px-4 py-2 sm:w-auto"
                      onClick={() => handleRecommendationClick(item)}
                    >
                      Перейти
                      <ChevronRight size={16} />
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
            <button
              type="button"
              onClick={() => navigate('vacation')}
              className="data-row flex w-full items-center justify-between gap-4 rounded-2xl p-4 text-left"
            >
              <span>
                <span className="metric-label">Отпуск</span>
                <span className="mt-1 block font-semibold text-white">
                  {leaveBalance ? pluralDays(leaveBalance.remaining_days) : 'Нет данных'}
                </span>
              </span>
              <CalendarDays className="text-slate-400" size={20} />
            </button>

            <button
              type="button"
              onClick={() => navigate('salary')}
              className="data-row flex w-full items-center justify-between gap-4 rounded-2xl p-4 text-left"
            >
              <span>
                <span className="metric-label">Ближайшая выплата</span>
                <span className="mt-1 block font-semibold text-white">
                  {nextPayment ? `${formatAmount(nextPayment.amount)} · ${formatDay(nextPayment.payment_date)}` : 'Нет плановых выплат'}
                </span>
              </span>
              <WalletCards className="text-slate-400" size={20} />
            </button>

            <button
              type="button"
              onClick={() => navigate('goals')}
              className="data-row flex w-full items-center justify-between gap-4 rounded-2xl p-4 text-left"
            >
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
                ? ' Выполнено менее 60% — будет применён штраф к очкам.'
                : ' Вы заработаете очки только за выполненные задачи.'}
            </p>
            <div className="mt-5 space-y-4">
              {incompleteTasks.map((task) => (
                <label key={task.id} className="block rounded-2xl border border-slate-700 bg-slate-950/35 p-4">
                  <span className="block text-sm font-bold text-white">{task.title}</span>
                  <span className="mt-1 block text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Причина для отчёта руководителю
                  </span>
                  <textarea
                    value={reasonDrafts[task.id] || ''}
                    onChange={(e) => setReasonDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))}
                    placeholder="Например: жду ревью, не хватило данных, перенёс из-за срочной задачи"
                    className="fintech-input mt-3 min-h-24 w-full resize-none rounded-2xl px-4 py-3 outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Отмена</Button>
              <Button className="flex-1" onClick={doFinish} disabled={!canSubmitIncompleteReport}>
                Завершить и сформировать отчёт
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
