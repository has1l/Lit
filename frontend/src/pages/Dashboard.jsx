import { CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, Clock3, Flame, Sparkles, Trophy, WalletCards } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { formatDay, formatAmount, paymentTypeRu, pluralDays } from '../lib/format.js';
import {
  fetchGoals, fetchDailyTasks, selectDailyTasks,
  completeDailyTask, finishDay, fetchGamificationStats,
} from '../api/goals.js';

const RECOMMENDATION_DEFS = [
  { id: 1, type: 'vacation' },
  { id: 2, type: 'tasks' },
  { id: 3, type: 'salary' },
];

const statusOptions = {
  work:    { label: 'В работе',  dot: 'bg-purple-500' },
  break:   { label: 'Перерыв',  dot: 'bg-yellow-400' },
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
  const [reasonDraft,  setReasonDraft]  = useState('');
  const [dayResult,    setDayResult]    = useState(null);

  // ── Цели: месячные и ежедневные ──────────────────────────────────────────
  const [monthGoals,    setMonthGoals]    = useState([]);
  const [dailyTasks,    setDailyTasks]    = useState([]);   // выбранные на сегодня
  const [goalsLoading,  setGoalsLoading]  = useState(true);
  const [selectMode,    setSelectMode]    = useState(false); // режим выбора задач
  const [selectedIds,   setSelectedIds]   = useState(new Set());

  // ── Геймификация ─────────────────────────────────────────────────────────
  const [gameStats, setGameStats] = useState(null);

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

  // Загрузка данных
  useEffect(() => {
    Promise.all([fetchGoals(), fetchDailyTasks(today), fetchGamificationStats()])
      .then(([goals, daily, stats]) => {
        setMonthGoals(goals);
        setDailyTasks(daily);
        setGameStats(stats);
        // Если задачи уже выбраны и день не начат — автоматически считаем день начатым
        if (daily.length > 0 && !dayCompleted) {
          setDayStarted(true);
          setDayDate(today);
          setStatus('work');
        }
      })
      .catch(() => {})
      .finally(() => setGoalsLoading(false));
  }, [today]);

  const allDone = useMemo(() => dailyTasks.length > 0 && dailyTasks.every((t) => t.completed), [dailyTasks]);
  const completedCount = useMemo(() => dailyTasks.filter((t) => t.completed).length, [dailyTasks]);
  const availableStatuses = useMemo(() => {
    if (!dayStarted || dayCompleted) return [];
    return status === 'break' ? ['work'] : ['break'];
  }, [dayStarted, dayCompleted, status]);
  const completedTasksCount = completedCount;
  const progressPercent = useMemo(
    () => dailyTasks.length > 0 ? Math.round((completedCount / dailyTasks.length) * 100) : 0,
    [completedCount, dailyTasks.length],
  );
  const progressText = useMemo(() => {
    if (progressPercent >= 80) return 'Высокая эффективность';
    if (progressPercent >= 50) return 'Стабильный темп';
    return 'Нужен фокус';
  }, [progressPercent]);
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

  function startDay() {
    if (monthGoals.length === 0) {
      // нет целей — запускаем день без задач
      setDayStarted(true);
      setDayDate(today);
      setStatus('work');
      return;
    }
    setSelectMode(true);
  }

  async function confirmTaskSelection() {
    if (selectedIds.size === 0) return;
    try {
      const tasks = await selectDailyTasks([...selectedIds], today);
      setDailyTasks(tasks);
      setDayStarted(true);
      setDayDate(today);
      setStatus('work');
      setSelectMode(false);
    } catch (e) {
      if (e?.status === 409) {
        // задачи уже выбраны (race) — просто перезагружаем
        const tasks = await fetchDailyTasks(today);
        setDailyTasks(tasks);
        setDayStarted(true);
        setDayDate(today);
        setStatus('work');
        setSelectMode(false);
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
    setReasonDraft('');
    setShowModal(true);
  }

  async function doFinish() {
    try {
      const result = await finishDay(today);
      setDayResult(result);
      // Обновляем статы
      fetchGamificationStats().then(setGameStats).catch(() => {});
    } catch {}
    setDailyReports((prev) => [{
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      completed: completedCount,
      total: dailyTasks.length,
    }, ...prev]);
    setDayCompleted(true);
    setStatus('offline');
    setShowModal(false);
  }

  function startNewDay() {
    setDayStarted(false);
    setDayCompleted(false);
    setDayDate(null);
    setDailyTasks([]);
    setSelectedIds(new Set());
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

  function askTechna() {
    const goalsList = monthGoals.map((g, i) => `${i + 1}. ${g.title} (${g.points} pts)`).join(', ');
    openChatWithPrompt(
      `Посоветуй, какие задачи выбрать на сегодня из моего списка целей на месяц: ${goalsList}. Учти что сегодня ${new Date().toLocaleDateString('ru')}.`
    );
  }

  const levelKey = gameStats?.level?.key ?? 'rookie';
  const levelColors = { rookie: 'text-slate-400', bronze: 'text-orange-400', silver: 'text-slate-300', gold: 'text-yellow-400', platinum: 'text-cyan-400' };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="metric-label">Рабочий кабинет</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {`Доброе утро, ${profile?.name || ''}`}
          </h1>
          <p className="mt-2 max-w-2xl text-base text-slate-400">
            Сводка по рабочему дню, выплатам и HR-задачам.
          </p>
        </div>
        <div className="status-chip inline-flex w-fit items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${statusOptions[status].dot}`} />
          {statusOptions[status].label}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Задачи сегодня</p>
            <ClipboardList className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-3xl font-bold">
            {completedTasksCount}/{dailyTasks.length}
          </p>
          <p className="mt-1 text-sm text-slate-400">{activeTasksCount} в работе</p>
        </div>

        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Неделя</p>
            <Check className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-3xl font-bold">{progressPercent}%</p>
          <p className="mt-1 text-sm text-slate-400">{progressText}</p>
        </div>
      </div>

      {/* Мини-статистика геймификации */}
      {gameStats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Уровень</p>
            <div className="mt-2 flex items-center gap-2">
              <Trophy size={18} className={levelColors[levelKey]} />
              <p className={`text-xl font-bold ${levelColors[levelKey]}`}>{gameStats.level.label}</p>
            </div>
            <p className="mt-1 text-sm text-slate-400">{gameStats.points_total} очков</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Серия</p>
            <div className="mt-2 flex items-center gap-2">
              <Flame size={18} className={gameStats.streak_days > 0 ? 'text-orange-400' : 'text-slate-600'} />
              <p className="text-xl font-bold text-white">{gameStats.streak_days}</p>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {gameStats.streak_days > 0 ? 'дней подряд' : 'начни серию сегодня'}
            </p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Месяц</p>
            <p className="mt-2 text-xl font-bold text-white">{gameStats.month_earned} / {gameStats.month_max}</p>
            <p className="mt-1 text-sm text-slate-400">очков в этом месяце</p>
          </Card>
        </div>
      )}

      {/* Рабочий день */}
      <div ref={workdayRef} className="scroll-mt-24">
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
                      onClick={() => { setStatus(s); setStatusOpen(false); }}
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
          {!dayStarted && !selectMode && (
            <Button className="mt-5 w-full sm:w-auto" onClick={startDay}>
              Начать рабочий день
            </Button>
          )}

          {/* Режим выбора задач */}
          {selectMode && (
            <div className="mt-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="font-semibold text-white">Выберите задачи на сегодня</h3>
                <button type="button" onClick={askTechna}
                  className="inline-flex items-center gap-2 rounded-2xl bg-purple-600/15 px-3 py-2 text-sm font-semibold text-purple-200 ring-1 ring-purple-400/30 transition hover:bg-purple-600/25">
                  <Sparkles size={15} />Техна посоветует
                </button>
              </div>
              {goalsLoading ? (
                <p className="text-sm text-slate-500">Загрузка целей...</p>
              ) : monthGoals.length === 0 ? (
                <p className="text-sm text-slate-500">Руководитель ещё не назначил цели на этот месяц.</p>
              ) : (
                <div className="grid gap-3">
                  {monthGoals.map((g) => {
                    const checked = selectedIds.has(g.id);
                    return (
                      <button key={g.id} type="button"
                        onClick={() => setSelectedIds((prev) => {
                          const n = new Set(prev);
                          checked ? n.delete(g.id) : n.add(g.id);
                          return n;
                        })}
                        className={`flex items-center gap-3 rounded-3xl border p-4 text-left transition ${
                          checked
                            ? 'border-purple-400/50 bg-purple-600/15 text-slate-200'
                            : 'border-slate-700 bg-slate-950/45 text-slate-300 hover:border-purple-500/40'
                        }`}
                      >
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${
                          checked ? 'border-purple-400 bg-purple-600 text-white' : 'border-slate-600 bg-slate-950/60 text-transparent'
                        }`}>
                          <Check size={14} />
                        </span>
                        <span className="min-w-0 flex-1 font-semibold">{g.title}</span>
                        <span className="shrink-0 rounded-xl bg-slate-800 px-2 py-1 text-xs font-bold text-purple-300">
                          {g.points} pts
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-5 flex gap-3">
                <Button onClick={confirmTaskSelection} disabled={selectedIds.size === 0}>
                  Начать день ({selectedIds.size} задач)
                </Button>
                <Button variant="secondary" onClick={() => setSelectMode(false)}>Отмена</Button>
              </div>
            </div>
          )}

          {/* День начат — список задач */}
          {dayStarted && !dayCompleted && !selectMode && (
            <>
              {dailyTasks.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500">Задачи на сегодня не выбраны.</p>
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
                Начать новый день
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Последний отчёт */}
      {dailyReports.length > 0 && (
        <Card>
          <div>
            <h2 className="text-xl font-bold text-white">Отчёт за день</h2>
            <p className="mt-2 text-slate-400">Итоги последнего завершённого рабочего дня</p>
          </div>

          <div className="fintech-control mt-5 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">{dailyReports[0].date}</p>
            <p className="mt-2 text-2xl font-bold text-white">
              Выполнено задач: {dailyReports[0].completed}/{dailyReports[0].total}
            </p>
          </div>

          {dailyReports.length > 1 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-500">История</h3>
              <div className="mt-3 divide-y divide-slate-800">
                {dailyReports.slice(1).map((report) => (
                  <div key={report.id} className="flex items-center justify-between gap-4 py-3">
                    <span className="font-semibold text-white">{report.date}</span>
                    <span className="status-chip rounded-full px-3 py-1 text-sm font-semibold">
                      {report.completed}/{report.total} задач
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Прогресс сотрудника</h2>
            <p className="mt-2 text-slate-400">За эту неделю</p>
          </div>
          <div className="status-chip rounded-2xl px-4 py-3 text-sm font-semibold">
            {progressText}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-400">
            <span>Прогресс: {progressPercent}%</span>
            <span>{completedCount} / {dailyTasks.length}</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-950/60 ring-1 ring-slate-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="metric-card rounded-2xl p-4">
            <p className="metric-label">Выполнено задач</p>
            <p className="metric-value mt-2 text-2xl font-bold">
              {completedCount} из {dailyTasks.length}
            </p>
          </div>
          <div className="metric-card rounded-2xl p-4">
            <p className="metric-label">Статус дня</p>
            <p className="metric-value mt-2 text-2xl font-bold">
              {dayCompleted ? 'Завершён' : dayStarted ? 'В работе' : 'Не начат'}
            </p>
          </div>
          <div className="metric-card rounded-2xl p-4">
            <p className="metric-label">Активные задачи</p>
            <p className="metric-value mt-2 text-2xl font-bold">{activeTasksCount}</p>
          </div>
        </div>

        <div className="metric-card mt-3 rounded-2xl p-4">
          <p className="metric-label">Самый продуктивный день</p>
          <p className="metric-value mt-2 text-lg font-bold">Понедельник</p>
        </div>
      </Card>

      <Card>
        <div>
          <h2 className="text-xl font-bold text-white">Техна рекомендует</h2>
          <p className="mt-2 text-slate-400">Персональные подсказки на сегодня</p>
        </div>
        <div className="mt-5 divide-y divide-slate-800">
          {technaRecommendations.map((item, index) => {
            const icons = { vacation: CalendarDays, tasks: ClipboardList, salary: WalletCards };
            const Icon = icons[item.type];
            const isFeatured = index === 0 && !item.completed;
            return (
              <div
                key={item.id}
                className={`flex w-full flex-col gap-3 py-4 transition sm:flex-row sm:items-center sm:gap-4 ${
                  isFeatured ? 'rounded-2xl border border-purple-400/30 bg-purple-600/10 px-4' : ''
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

      {/* Модалка незавершённого дня */}
      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl">
            <h2 className="text-2xl font-bold text-white">Вы не выполнили все задачи</h2>
            <p className="mt-2 text-sm text-slate-400">
              Выполнено {completedCount} из {dailyTasks.length}.
              {completedCount / dailyTasks.length < 0.6
                ? ' Выполнено менее 60% — будет применён штраф к очкам.'
                : ' Вы заработаете очки только за выполненные задачи.'}
            </p>
            <label className="mt-6 block">
              <span className="text-sm font-semibold text-slate-400">Комментарий руководителю</span>
              <textarea value={reasonDraft} onChange={(e) => setReasonDraft(e.target.value)}
                placeholder="Напишите причину, почему не успели"
                className="fintech-input mt-2 min-h-32 w-full resize-none rounded-2xl px-4 py-3 outline-none"
              />
            </label>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Отмена</Button>
              <Button className="flex-1" onClick={doFinish}>Завершить</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
