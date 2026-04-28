import { Loader2, MessageCircle, Search, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { fetchTeamEmployees } from '../api/employee.js';

const MONTH_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} день`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}

function formatHireDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_RU[m - 1]} ${y}`;
}

function initials(fullName) {
  return fullName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export default function ManagerDashboard({ onOpenEmployeeChat }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);

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
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q),
    );
  }, [employees, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Команда</h1>
        <p className="mt-2 text-slate-400">Сотрудники, отпуск и контакты.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm font-semibold text-slate-500">Всего сотрудников</p>
          <p className="mt-3 text-4xl font-bold text-white">{loading ? '…' : employees.length}</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">Мало отпуска (&lt;7 дн.)</p>
          <p className="mt-3 text-4xl font-bold text-white">
            {loading ? '…' : employees.filter((e) => e.vacation_remaining < 7).length}
          </p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">На согласовании</p>
          <p className="mt-3 text-4xl font-bold text-white">
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
          <label className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/45 px-4 py-3 text-slate-300 xl:w-72">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Найти сотрудника"
              className="min-w-0 bg-transparent text-white outline-none placeholder:text-slate-500"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-4">
          {loading && (
            <div className="flex items-center gap-3 py-6 text-slate-400">
              <Loader2 size={20} className="animate-spin" />
              <span>Загрузка...</span>
            </div>
          )}
          {error && (
            <p className="py-4 text-sm text-red-400">Не удалось загрузить список сотрудников</p>
          )}
          {!loading && !error && filtered.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Сотрудники не найдены</p>
          )}
          {filtered.map((emp) => (
            <button
              key={emp.email}
              onClick={() => setSelectedEmployee(emp)}
              className="rounded-3xl border border-slate-700 bg-slate-950/45 p-5 text-left transition hover:border-purple-500/50 hover:bg-purple-950/20"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-purple-500/10 text-purple-300 ring-1 ring-purple-400/20 text-sm font-bold">
                    {initials(emp.full_name)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{emp.full_name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{emp.position} · {emp.department}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400 xl:text-right">
                  <span>
                    Отпуск: <b className={emp.vacation_remaining < 7 ? 'text-yellow-300' : 'text-white'}>
                      {pluralDays(emp.vacation_remaining)}
                    </b>
                  </span>
                  {emp.vacation_pending > 0 && (
                    <span>На согласовании: <b className="text-yellow-300">{pluralDays(emp.vacation_pending)}</b></span>
                  )}
                  <span>С нами с <b className="text-white">{formatHireDate(emp.hire_date)}</b></span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {selectedEmployee && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-purple-500/10 text-purple-300 ring-1 ring-purple-400/20 text-base font-bold">
                {initials(selectedEmployee.full_name)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedEmployee.full_name}</h2>
                <p className="mt-1 text-slate-400">{selectedEmployee.position} · {selectedEmployee.department}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
                <p className="text-sm font-semibold text-slate-500">Email</p>
                <p className="mt-2 break-all font-bold text-white">{selectedEmployee.email}</p>
              </div>
              <div className="rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
                <p className="text-sm font-semibold text-slate-500">Дата найма</p>
                <p className="mt-2 font-bold text-white">{formatHireDate(selectedEmployee.hire_date)}</p>
              </div>
              <div className="rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
                <p className="text-sm font-semibold text-slate-500">Остаток отпуска</p>
                <p className={`mt-2 text-2xl font-bold ${selectedEmployee.vacation_remaining < 7 ? 'text-yellow-300' : 'text-white'}`}>
                  {pluralDays(selectedEmployee.vacation_remaining)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Использовано {pluralDays(selectedEmployee.vacation_used)} из {selectedEmployee.vacation_total}
                </p>
              </div>
              {selectedEmployee.vacation_pending > 0 && (
                <div className="rounded-3xl border border-yellow-400/20 bg-yellow-400/5 p-4">
                  <p className="text-sm font-semibold text-slate-500">На согласовании</p>
                  <p className="mt-2 text-2xl font-bold text-yellow-300">
                    {pluralDays(selectedEmployee.vacation_pending)}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                className="flex-1"
                onClick={() => {
                  onOpenEmployeeChat(selectedEmployee.email);
                  setSelectedEmployee(null);
                }}
              >
                Написать сотруднику
                <MessageCircle size={18} />
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setSelectedEmployee(null)}>
                Закрыть
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
