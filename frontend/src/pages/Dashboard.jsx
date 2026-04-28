import { CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, Clock3, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { formatDay, formatAmount, paymentTypeRu, pluralDays } from '../lib/format.js';

const defaultTasks = [
  { id: 1, text: 'Проверить рабочую почту', done: false },
  { id: 2, text: 'Ответить на сообщения команды', done: false },
  { id: 3, text: 'Подготовить краткий отчёт', done: false },
  { id: 4, text: 'Обновить статус задач', done: false },
  { id: 5, text: 'Ознакомиться с HR-уведомлениями', done: false },
];

const defaultWorkdayState = {
  dayStarted: false,
  tasks: defaultTasks,
  dayCompleted: false,
  reason: '',
};

const defaultWeekStats = {
  totalDays: 5,
  completedDays: 3,
  totalTasks: 20,
  completedTasks: 14,
};

const RECOMMENDATION_DEFS = [
  { id: 1, type: 'vacation' },
  { id: 2, type: 'tasks' },
  { id: 3, type: 'salary' },
];

const statusOptions = {
  work: { label: 'В работе', dot: 'bg-purple-500' },
  break: { label: 'Перерыв', dot: 'bg-yellow-400' },
  offline: { label: 'Оффлайн', dot: 'bg-red-500' },
};

function loadWorkdayState() {
  try {
    const savedState = window.localStorage.getItem('techna-workday');
    const parsedState = savedState ? JSON.parse(savedState) : defaultWorkdayState;
    const hasActualTaskSet =
      Array.isArray(parsedState.tasks) &&
      parsedState.tasks.length === defaultTasks.length &&
      parsedState.tasks.every((task) => defaultTasks.some((defaultTask) => defaultTask.text === task.text));

    return {
      ...defaultWorkdayState,
      ...parsedState,
      tasks: hasActualTaskSet ? parsedState.tasks : defaultTasks,
    };
  } catch {
    return defaultWorkdayState;
  }
}

function loadWeekStats() {
  try {
    const savedStats = window.localStorage.getItem('techna-week-stats');
    return savedStats ? { ...defaultWeekStats, ...JSON.parse(savedStats) } : defaultWeekStats;
  } catch {
    return defaultWeekStats;
  }
}

function loadRecommendationCompletions() {
  try {
    const saved = window.localStorage.getItem('techna-completions');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function loadStatus() {
  try {
    const savedStatus = window.localStorage.getItem('techna-status');
    return savedStatus === 'done' ? 'offline' : savedStatus || 'offline';
  } catch {
    return 'offline';
  }
}

function loadDailyReports() {
  try {
    const savedReports = window.localStorage.getItem('techna-daily-reports');
    return savedReports ? JSON.parse(savedReports) : [];
  } catch {
    return [];
  }
}

export default function Dashboard({ openChatWithPrompt, navigate, profile }) {
  const { data: myData } = useEmployeeData();
  const workdayRef = useRef(null);
  const [workdayState, setWorkdayState] = useState(loadWorkdayState);
  const [weekStats] = useState(loadWeekStats);
  const [completions, setCompletions] = useState(loadRecommendationCompletions);
  const [status, setStatus] = useState(loadStatus);
  const [dailyReports, setDailyReports] = useState(loadDailyReports);
  const [statusOpen, setStatusOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');
  const { tasks, dayStarted, dayCompleted, reason } = workdayState;
  const isDayDone = dayCompleted;
  const availableStatusOptions = useMemo(() => {
    if (!dayStarted || isDayDone) return [];
    return status === 'break' ? ['work'] : ['break'];
  }, [dayStarted, isDayDone, status]);
  const allTasksDone = useMemo(() => tasks.every((task) => task.done), [tasks]);
  const completedTasksCount = useMemo(() => tasks.filter((task) => task.done).length, [tasks]);
  const progressPercent = useMemo(
    () => Math.round((weekStats.completedTasks / weekStats.totalTasks) * 100),
    [weekStats],
  );
  const averageTasksPerDay = useMemo(
    () => Math.round(weekStats.completedTasks / weekStats.completedDays),
    [weekStats],
  );
  const progressText = useMemo(() => {
    if (progressPercent >= 80) return 'Отличная работа 🔥';
    if (progressPercent >= 50) return 'Хороший темп 👍';
    return 'Можно лучше 💪';
  }, [progressPercent]);

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
      ...def,
      text: texts[def.type],
      completed: completions[def.id] ?? false,
    }));
  }, [myData, completions]);

  useEffect(() => {
    window.localStorage.setItem('techna-workday', JSON.stringify(workdayState));
  }, [workdayState]);

  useEffect(() => {
    window.localStorage.setItem('techna-week-stats', JSON.stringify(weekStats));
  }, [weekStats]);

  useEffect(() => {
    window.localStorage.setItem('techna-completions', JSON.stringify(completions));
  }, [completions]);

  useEffect(() => {
    window.localStorage.setItem('techna-status', status);
  }, [status]);

  useEffect(() => {
    window.localStorage.setItem('techna-daily-reports', JSON.stringify(dailyReports));
  }, [dailyReports]);

  function addDailyReport(reportReason = null) {
    const report = {
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      completed: tasks.filter((task) => task.done).length,
      total: tasks.length,
      reason: reportReason || null,
    };

    setDailyReports((current) => [report, ...current]);
  }

  const toggleTask = (id) => {
    if (isDayDone) return;

    setWorkdayState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    }));
  };

  function startDay() {
    setWorkdayState((current) => ({
      ...current,
      dayStarted: true,
      dayCompleted: false,
      reason: '',
    }));
    setStatus('work');
  }

  function finishDay() {
    if (allTasksDone) {
      addDailyReport(null);
      setWorkdayState((current) => ({ ...current, dayCompleted: true, reason: '' }));
      setStatus('offline');
      return;
    }

    setReasonDraft(reason);
    setShowModal(true);
  }

  function finishDayWithReason() {
    const trimmedReason = reasonDraft.trim();

    addDailyReport(trimmedReason);
    setWorkdayState((current) => ({
      ...current,
      dayStarted: true,
      dayCompleted: true,
      reason: trimmedReason,
    }));
    setStatus('offline');
    setShowModal(false);
  }

  function startNewDay() {
    setWorkdayState({
      ...defaultWorkdayState,
      tasks: defaultTasks.map((task) => ({ ...task })),
    });
    setStatus('offline');
    setReasonDraft('');
    setShowModal(false);
  }

  function getRecommendationIcon(type) {
    if (type === 'vacation') return CalendarDays;
    if (type === 'tasks') return ClipboardList;
    return WalletCards;
  }

  function handleRecommendationClick(recommendation) {
    setCompletions((current) => ({ ...current, [recommendation.id]: true }));

    if (recommendation.type === 'vacation') {
      navigate('vacation');
    }

    if (recommendation.type === 'tasks') {
      workdayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (recommendation.type === 'salary') {
      navigate('salary');
    }
  }

  function selectStatus(nextStatus) {
    if (!availableStatusOptions.includes(nextStatus)) return;
    setStatus(nextStatus);
    setStatusOpen(false);
  }


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {`Доброе утро, ${profile?.name || ''}`}
        </h1>
        <p className="mt-2 text-lg text-slate-400">Чем я могу помочь сегодня?</p>
      </div>

      <div ref={workdayRef} className="scroll-mt-24">
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Рабочий день</h2>
              <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-slate-400">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/45 px-3 py-1 ring-1 ring-slate-700">
                  <Clock3 size={16} />
                  Сегодня начало работы в 09:00
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-950/45 px-3 py-1 ring-1 ring-slate-700">
                  <Check size={16} />
                  Окончание рабочего дня: 18:00
                </span>
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => availableStatusOptions.length > 0 && setStatusOpen((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-2xl bg-slate-950/45 px-4 py-3 text-sm font-semibold text-slate-200 ring-1 ring-slate-700 transition ${
                  availableStatusOptions.length === 0 ? 'cursor-default' : 'hover:bg-purple-950/25'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${statusOptions[status].dot}`} />
                {statusOptions[status].label}
                {availableStatusOptions.length > 0 && <ChevronDown size={16} />}
              </button>

              {statusOpen && availableStatusOptions.length > 0 && (
                <div className="absolute right-0 z-30 mt-2 w-44 rounded-2xl border border-slate-700 bg-slate-950/95 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  {availableStatusOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => selectStatus(item)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-purple-950/30"
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${statusOptions[item].dot}`} />
                      {statusOptions[item].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!dayStarted && (
            <Button className="mt-5 w-full sm:w-auto" onClick={startDay}>
              Начать рабочий день
            </Button>
          )}

          {dayStarted && !isDayDone && (
            <>
              <div className="mt-5 grid gap-3">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    disabled={isDayDone}
                    onClick={() => toggleTask(task.id)}
                    className={`flex items-center gap-3 rounded-3xl border p-4 text-left transition ${
                      task.done
                        ? 'border-purple-400/50 bg-purple-600/15 text-slate-300'
                        : 'border-slate-700 bg-slate-950/45 text-slate-200 hover:border-purple-500/50 hover:bg-purple-950/25'
                    } ${isDayDone ? 'cursor-default opacity-80' : ''}`}
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition ${
                        task.done
                          ? 'border-purple-400 bg-purple-600 text-white'
                          : 'border-slate-600 bg-slate-950/60 text-transparent'
                      }`}
                    >
                      <Check size={16} />
                    </span>
                    <span className={task.done ? 'line-through decoration-purple-300/70' : ''}>
                      {task.text}
                    </span>
                  </button>
                ))}
              </div>

              <Button className="mt-5 w-full sm:w-auto" onClick={finishDay}>
                Завершить рабочий день
              </Button>
            </>
          )}

          {isDayDone && allTasksDone && (
            <div className="mt-5 rounded-3xl border border-purple-400/30 bg-purple-600/10 p-5 text-slate-200">
              <p className="mb-2 text-lg font-bold text-white">Рабочий день завершён</p>
              <p className="text-lg font-bold text-white">Все задачи выполнены. Хорошего отдыха, ты молодец!</p>
              <p className="mt-2 text-sm font-semibold text-slate-400">
                Выполнено {completedTasksCount} из {tasks.length}
              </p>
              <Button variant="secondary" className="mt-5 w-full sm:w-auto" onClick={startNewDay}>
                Начать новый день
              </Button>
            </div>
          )}

          {isDayDone && !allTasksDone && (
            <div className="mt-5 rounded-3xl border border-slate-700 bg-slate-950/45 p-5">
              <p className="mb-2 text-lg font-bold text-white">Рабочий день завершён</p>
              <p className="text-lg font-bold text-white">Комментарий отправлен руководителю</p>
              <p className="mt-2 text-sm font-semibold text-slate-400">
                Выполнено {completedTasksCount} из {tasks.length}
              </p>
              {reason && <p className="mt-3 text-slate-400">{reason}</p>}
              <Button variant="secondary" className="mt-5 w-full sm:w-auto" onClick={startNewDay}>
                Начать новый день
              </Button>
            </div>
          )}
        </Card>
      </div>

      {dailyReports.length > 0 && (
        <Card>
          <div>
            <h2 className="text-xl font-bold text-white">Отчёт за день</h2>
            <p className="mt-2 text-slate-400">Итоги последнего завершенного рабочего дня</p>
          </div>

          <div className="mt-5 rounded-3xl border border-purple-400/30 bg-purple-600/10 p-5">
            <p className="text-sm font-semibold text-slate-500">{dailyReports[0].date}</p>
            <p className="mt-2 text-2xl font-bold text-white">
              Выполнено задач: {dailyReports[0].completed}/{dailyReports[0].total}
            </p>
            {dailyReports[0].reason && (
              <p className="mt-3 text-slate-400">{dailyReports[0].reason}</p>
            )}
          </div>

          {dailyReports.length > 1 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-500">История</h3>
              <div className="mt-3 divide-y divide-slate-800">
                {dailyReports.slice(1).map((report) => (
                  <div key={report.id} className="flex items-center justify-between gap-4 py-3">
                    <span className="font-semibold text-white">{report.date}</span>
                    <span className="rounded-full bg-slate-950/45 px-3 py-1 text-sm font-semibold text-slate-300 ring-1 ring-slate-700">
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
          <div className="rounded-2xl bg-purple-600/10 px-4 py-3 text-sm font-semibold text-purple-200 ring-1 ring-purple-400/20">
            {progressText}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-400">
            <span>Прогресс: {progressPercent}%</span>
            <span>{weekStats.completedTasks} / {weekStats.totalTasks}</span>
          </div>
          <div className="mt-3 h-4 overflow-hidden rounded-full bg-slate-950/60 ring-1 ring-slate-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
            <p className="text-sm font-semibold text-slate-500">Выполнено задач</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {weekStats.completedTasks} из {weekStats.totalTasks}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
            <p className="text-sm font-semibold text-slate-500">Завершено дней</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {weekStats.completedDays} из {weekStats.totalDays}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
            <p className="text-sm font-semibold text-slate-500">Среднее задач в день</p>
            <p className="mt-2 text-2xl font-bold text-white">{averageTasksPerDay}</p>
          </div>
        </div>

        <div className="mt-3 rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
          <p className="text-sm font-semibold text-slate-500">Самый продуктивный день</p>
          <p className="mt-2 text-lg font-bold text-white">Понедельник</p>
        </div>
      </Card>

      <Card>
        <div>
          <h2 className="text-xl font-bold text-white">Техна рекомендует</h2>
          <p className="mt-2 text-slate-400">Персональные подсказки на сегодня</p>
        </div>
        <div className="mt-5 divide-y divide-slate-800">
          {technaRecommendations.map((item, index) => {
            const Icon = getRecommendationIcon(item.type);
            const isFeatured = index === 0 && !item.completed;

            return (
              <div
                key={item.id}
                className={`flex w-full items-center gap-4 py-4 transition ${
                  isFeatured ? 'rounded-3xl border border-purple-400/30 bg-purple-600/10 px-4' : ''
                } ${item.completed ? 'opacity-70' : ''}`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-purple-500/10 text-purple-300 ring-1 ring-purple-400/20">
                  {item.completed ? <Check size={22} /> : <Icon size={22} />}
                </span>
                <button
                  onClick={() => handleRecommendationClick(item)}
                  className={`min-w-0 flex-1 text-left font-semibold transition hover:text-purple-200 ${
                    item.completed ? 'text-slate-400 line-through decoration-purple-300/70' : 'text-white'
                  }`}
                >
                  {item.text}
                </button>
                {item.completed ? (
                  <span className="shrink-0 rounded-full bg-purple-600/10 px-3 py-1 text-xs font-semibold text-purple-200 ring-1 ring-purple-400/20">
                    ✔ Выполнено
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    className="shrink-0 px-4 py-2"
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

      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl">
            <h2 className="text-2xl font-bold text-white">Вы не выполнили все задачи</h2>
            <label className="mt-6 block">
              <span className="text-sm font-semibold text-slate-400">Комментарий</span>
              <textarea
                value={reasonDraft}
                onChange={(event) => setReasonDraft(event.target.value)}
                placeholder="Напишите причину, почему не успели"
                className="mt-2 min-h-32 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-purple-500"
              />
            </label>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>
                Отмена
              </Button>
              <Button className="flex-1" onClick={finishDayWithReason}>
                Завершить с комментарием
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
