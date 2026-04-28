import { CalendarDays, CheckCircle2, ClipboardList, Target, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import { fetchGoals } from '../api/goals.js';

const MONTH_RU = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function getDifficultyLabel(points) {
  if (points >= 35) return 'Высокий приоритет';
  if (points >= 20) return 'Средний приоритет';
  return 'Базовая задача';
}

function getDifficultyClass(points) {
  if (points >= 35) return 'goal-priority-badge is-high';
  if (points >= 20) return 'goal-priority-badge is-medium';
  return 'goal-priority-badge';
}

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const activeGoals = useMemo(() => goals.filter((goal) => goal.status !== 'completed'), [goals]);
  const totalPoints = useMemo(() => goals.reduce((sum, goal) => sum + (goal.points || 0), 0), [goals]);
  const priorityGoals = useMemo(() => goals.filter((goal) => (goal.points || 0) >= 35), [goals]);

  useEffect(() => {
    fetchGoals()
      .then(setGoals)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10 text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-purple-400" />
        <span>Загрузка целей...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="metric-label">Рабочий план</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-4xl">
              Цели на {MONTH_RU[now.getMonth() + 1]}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Здесь собраны задачи, назначенные руководителем на текущий месяц. Отмечайте выполнение на главной странице рабочего дня.
            </p>
          </div>
          <div className="status-chip inline-flex w-fit items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
            <CalendarDays size={18} />
            {now.getFullYear()}
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Всего целей</p>
            <ClipboardList className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-3xl font-bold">{goals.length}</p>
          <p className="mt-1 text-sm text-slate-400">
            {activeGoals.length} активных
          </p>
        </div>

        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Плановые баллы</p>
            <TrendingUp className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-3xl font-bold">{totalPoints}</p>
          <p className="mt-1 text-sm text-slate-400">за назначенные задачи</p>
        </div>

        <div className="metric-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="metric-label">Приоритет</p>
            <Target className="text-slate-400" size={18} />
          </div>
          <p className="metric-value mt-3 text-3xl font-bold">{priorityGoals.length}</p>
          <p className="mt-1 text-sm text-slate-400">задач требуют фокуса</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Список целей</h2>
              <p className="mt-2 text-slate-400">План от руководителя без лишней геймификации.</p>
            </div>
            <span className="status-chip w-fit rounded-full px-3 py-1 text-sm font-semibold">
              {goals.length} в плане
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {goals.length === 0 ? (
              <div className="rounded-3xl border border-slate-700 bg-slate-950/35 p-6">
                <div className="icon-tile h-12 w-12 rounded-2xl">
                  <CheckCircle2 size={22} />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">Цели ещё не назначены</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Когда руководитель добавит задачи на месяц, они появятся здесь и на главной странице рабочего дня.
                </p>
              </div>
            ) : (
              goals.map((goal, index) => (
                <article
                  key={goal.id}
                  className="group rounded-3xl border border-slate-700 bg-slate-950/35 p-4 transition hover:border-purple-400/35 hover:bg-purple-600/10"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-600/12 text-sm font-bold text-purple-200 ring-1 ring-purple-400/25">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{goal.title}</h3>
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getDifficultyClass(goal.points || 0)}`}>
                          {getDifficultyLabel(goal.points || 0)}
                        </span>
                      </div>
                      {goal.description && (
                        <p className="mt-2 text-sm leading-6 text-slate-400">{goal.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 rounded-2xl bg-slate-950/55 px-4 py-3 text-right ring-1 ring-slate-700">
                      <p className="text-2xl font-bold text-white">{goal.points}</p>
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">баллов</p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-white">Как работать с целями</h2>
          <div className="mt-5 space-y-3">
            <div className="data-row rounded-2xl p-4">
              <p className="font-semibold text-white">1. Смотрите план</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">Цели назначает руководитель, сотрудник не выбирает их вручную.</p>
            </div>
            <div className="data-row rounded-2xl p-4">
              <p className="font-semibold text-white">2. Выполняйте за день</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">На главной странице ставьте галочки только по реально выполненным задачам.</p>
            </div>
            <div className="data-row rounded-2xl p-4">
              <p className="font-semibold text-white">3. Объясняйте переносы</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">Если задача не готова, при завершении дня укажите причину по конкретному пункту.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
