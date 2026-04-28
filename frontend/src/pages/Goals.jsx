import { Check, Flame, Star, Trophy, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import Card from '../components/Card.jsx';
import { fetchGamificationStats, fetchGoals } from '../api/goals.js';

const MONTH_RU = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const LEVEL_COLORS = {
  rookie:   'text-slate-400',
  bronze:   'text-orange-400',
  silver:   'text-slate-300',
  gold:     'text-yellow-400',
  platinum: 'text-cyan-400',
};

const LEVEL_BG = {
  rookie:   'bg-slate-700/50',
  bronze:   'bg-orange-500/15',
  silver:   'bg-slate-500/15',
  gold:     'bg-yellow-500/15',
  platinum: 'bg-cyan-500/15',
};

function ProgressBar({ value, max, color = 'bg-purple-500' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-950/60 ring-1 ring-slate-700">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function BadgeItem({ badge }) {
  return (
    <div className={`flex flex-col items-center gap-2 rounded-2xl p-4 ring-1 ${
      badge.unlocked
        ? 'bg-purple-600/10 ring-purple-400/30 text-purple-200'
        : 'bg-slate-900/50 ring-slate-700 text-slate-600'
    }`}>
      <Star size={22} className={badge.unlocked ? 'text-yellow-400' : 'text-slate-700'} />
      <p className="text-center text-xs font-semibold leading-tight">{badge.label}</p>
    </div>
  );
}

export default function Goals() {
  const [stats, setStats] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();

  useEffect(() => {
    Promise.all([fetchGamificationStats(), fetchGoals()])
      .then(([s, g]) => { setStats(s); setGoals(g); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-400 py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-purple-400" />
        <span>Загрузка...</span>
      </div>
    );
  }

  const level = stats?.level;
  const pts = stats?.points_total ?? 0;
  const streak = stats?.streak_days ?? 0;
  const monthEarned = stats?.month_earned ?? 0;
  const monthMax = stats?.month_max ?? 0;
  const monthPct = monthMax > 0 ? Math.round((monthEarned / monthMax) * 100) : 0;
  const badges = stats?.badges ?? [];
  const bonusRecords = stats?.bonus_records ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Мои цели</h1>
        <p className="mt-2 text-slate-400">Прогресс, достижения и история бонусов.</p>
      </div>

      {/* Уровень + очки */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <p className="text-sm font-semibold text-slate-500">Уровень</p>
          <div className={`mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-2 ${LEVEL_BG[level?.key ?? 'rookie']}`}>
            <Trophy size={18} className={LEVEL_COLORS[level?.key ?? 'rookie']} />
            <span className={`text-xl font-bold ${LEVEL_COLORS[level?.key ?? 'rookie']}`}>{level?.label ?? 'Новичок'}</span>
          </div>
          {level?.next && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-500">
                <span>{pts} очков</span>
                <span>до {level.next}: {level.next_pts - pts}</span>
              </div>
              <ProgressBar value={pts} max={level.next_pts} color="bg-purple-500" />
            </div>
          )}
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">Всего очков</p>
          <p className="mt-3 text-4xl font-bold text-white">{pts}</p>
          <p className="mt-1 text-sm text-slate-500">накоплено за всё время</p>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">Серия</p>
          <div className="mt-3 flex items-center gap-2">
            <Flame size={24} className={streak > 0 ? 'text-orange-400' : 'text-slate-600'} />
            <p className={`text-4xl font-bold ${streak > 0 ? 'text-white' : 'text-slate-600'}`}>{streak}</p>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {streak > 0 ? 'дней подряд все задачи выполнены' : 'серия прервана'}
          </p>
        </Card>
      </div>

      {/* Прогресс месяца */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Прогресс {MONTH_RU[now.getMonth() + 1]}</h2>
            <p className="mt-1 text-slate-400">Очки за выполненные задачи</p>
          </div>
          <span className={`rounded-2xl px-4 py-2 text-sm font-bold ring-1 ${
            monthPct >= 90 ? 'bg-green-500/15 text-green-300 ring-green-400/30' :
            monthPct >= 70 ? 'bg-purple-600/15 text-purple-200 ring-purple-400/30' :
            'bg-slate-800 text-slate-400 ring-slate-700'
          }`}>
            {monthPct}%
          </span>
        </div>
        <div className="mt-4 flex justify-between text-sm text-slate-500">
          <span>{monthEarned} заработано</span>
          <span>{monthMax} максимум</span>
        </div>
        <ProgressBar
          value={monthEarned}
          max={monthMax}
          color={monthPct >= 90 ? 'bg-green-500' : 'bg-gradient-to-r from-purple-400 to-purple-600'}
        />
        {monthPct >= 90 && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-green-400/30 bg-green-500/10 px-4 py-3">
            <Trophy size={18} className="text-green-400" />
            <p className="text-sm font-semibold text-green-300">
              Отличный результат! HR может одобрить премию за этот месяц.
            </p>
          </div>
        )}
      </Card>

      {/* Цели месяца */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Цели на {MONTH_RU[now.getMonth() + 1]}</h2>
          <span className="text-sm text-slate-500">{goals.length} задач</span>
        </div>
        <div className="mt-5 space-y-3">
          {goals.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">Руководитель ещё не назначил цели на этот месяц</p>
          ) : (
            goals.map((g) => (
              <div key={g.id} className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-950/45 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-500/10 text-sm font-bold text-purple-300 ring-1 ring-purple-400/20">
                  {g.points}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{g.title}</p>
                  {g.description && <p className="mt-1 text-sm text-slate-500">{g.description}</p>}
                </div>
                <TrendingUp size={16} className="mt-1 shrink-0 text-slate-600" />
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Достижения */}
      <Card>
        <h2 className="text-xl font-bold text-white">Достижения</h2>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {badges.map((b) => <BadgeItem key={b.key} badge={b} />)}
        </div>
      </Card>

      {/* История бонусов */}
      {bonusRecords.length > 0 && (
        <Card>
          <h2 className="text-xl font-bold text-white">История бонусов</h2>
          <div className="mt-5 divide-y divide-slate-800">
            {bonusRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-semibold text-white">{MONTH_RU[r.month]} {r.year}</p>
                  <p className="mt-1 text-sm text-slate-500">{r.earned_points} / {r.max_points} очков · {r.score_pct}%</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                  r.status === 'approved' ? 'bg-green-500/15 text-green-300 ring-green-400/30' :
                  r.status === 'declined' ? 'bg-red-500/15 text-red-300 ring-red-400/30' :
                  'bg-yellow-500/15 text-yellow-300 ring-yellow-400/30'
                }`}>
                  {r.status === 'approved' ? '✓ Одобрено' : r.status === 'declined' ? '✕ Отклонено' : 'На рассмотрении'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
