import { CalendarDays, History, Loader2 } from 'lucide-react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { pluralDays } from '../lib/format.js';

function formatYearHistory(row) {
  const remaining = row.total_days - row.used_days - row.pending_days;
  if (row.used_days === 0) return `${pluralDays(row.total_days)} доступно, не использовано`;
  return `Использовано ${pluralDays(row.used_days)} из ${row.total_days}${row.pending_days > 0 ? `, на согласовании ${row.pending_days}` : ''}, остаток ${remaining}`;
}

export default function Vacation({ openChatWithPrompt }) {
  const { data, loading, error } = useEmployeeData();
  const leave = data?.leave;
  const history = data?.leave_history ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="page-eyebrow">HR баланс</p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Отпуск</h1>
        <p className="mt-2 text-slate-400">Баланс дней и история отпусков.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <div className="icon-tile h-12 w-12 rounded-2xl">
            <CalendarDays size={24} />
          </div>
          <p className="metric-label mt-5">Остаток отпуска</p>
          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Загрузка...</span>
            </div>
          ) : error ? (
            <p className="mt-2 text-sm text-red-400">Не удалось загрузить данные</p>
          ) : leave ? (
            <>
              <p className="metric-value mt-1 text-5xl font-bold">{pluralDays(leave.remaining_days)}</p>
              <p className="mt-2 text-sm text-slate-500">из {leave.total_days} доступных в {leave.year} году</p>
              {leave.pending_days > 0 && (
                <p className="mt-1 text-sm text-yellow-400">На согласовании: {pluralDays(leave.pending_days)}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Данные не найдены</p>
          )}
        </Card>

        <Card>
          <p className="metric-label">Действия</p>
          <p className="mt-3 text-xl font-bold text-white">Запрос или перенос отпуска</p>
          <p className="mt-2 text-slate-500">Уточните процедуру у Техны или обратитесь в HR.</p>
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={() => openChatWithPrompt('Как оформить заявку на отпуск?')}>
              Оформить отпуск
            </Button>
            <Button variant="secondary" onClick={() => openChatWithPrompt('Как перенести отпуск?')}>
              Перенести отпуск
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <History className="text-slate-400" size={22} />
          <h2 className="text-xl font-bold text-white">История по годам</h2>
        </div>
        <div className="mt-5 divide-y divide-slate-800">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Загрузка...</span>
            </div>
          ) : history.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">История не найдена</p>
          ) : (
            history.map((row) => (
              <div key={row.year} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-semibold text-white">{row.year} год</p>
                  <p className="mt-1 text-sm text-slate-500">{formatYearHistory(row)}</p>
                </div>
                <span className="status-chip rounded-full px-3 py-1 text-sm font-semibold">
                  {pluralDays(row.used_days)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
