import { useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import Button from './Button.jsx';
import Card from './Card.jsx';
import Mascot from './Mascot.jsx';
import { useAuth } from '../store/AuthContext.jsx';

const TEST_ACCOUNTS = [
  { email: 'work@portal-test.1221systems.ru', role: 'Сотрудник',     name: 'Иван Сидоров'  },
  { email: 'dir@portal-test.1221systems.ru',  role: 'Руководитель',  name: 'Сергей Козлов' },
  { email: 'hr@portal-test.1221systems.ru',   role: 'HR',            name: 'Анна Петрова'  },
];
const TEST_PASSWORD = '6J1~CzTZ&X';

export default function LoginScreen() {
  const { login, status } = useAuth();
  const [email,    setEmail]    = useState(TEST_ACCOUNTS[0].email);
  const [password, setPassword] = useState(TEST_PASSWORD);
  const [error,    setError]    = useState(null);
  const isSubmitting = status === 'loading';

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Не удалось войти');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Левая колонка — бренд + сторителлинг */}
        <div className="fintech-surface hidden flex-col justify-between gap-10 rounded-[28px] p-10 lg:flex">
          <div className="flex items-center gap-3">
            <Mascot state="idle" size="lg" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                1221 Systems
              </p>
              <p className="mt-1 text-3xl font-bold text-white">Техна</p>
              <p className="mt-1 text-sm text-slate-400">Локальный AI-ассистент HR</p>
            </div>
          </div>

          <div className="space-y-4 text-slate-300">
            <h1 className="text-3xl font-bold leading-tight text-white">
              Найдите ответ за&nbsp;секунды,
              <br />
              без очереди в&nbsp;HR.
            </h1>
            <p className="text-base leading-relaxed text-slate-400">
              Отпуск, зарплата, ДМС, ПВТР, договоры — Техна цитирует регламент компании
              с&nbsp;точной ссылкой на&nbsp;пункт. Все данные остаются на&nbsp;корпоративных серверах.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-slate-300">
            <div className="fintech-control flex items-start gap-3 rounded-2xl p-3">
              <ShieldCheck size={18} className="mt-0.5 text-purple-400" />
              <span>Ваши данные не покидают периметр компании. Запросы обрабатываются on-prem.</span>
            </div>
          </div>
        </div>

        {/* Правая колонка — форма */}
        <Card className="flex flex-col justify-center gap-6 p-6 sm:p-10">
          <div className="lg:hidden">
            <Mascot state="idle" size="md" />
            <h1 className="mt-4 text-2xl font-bold text-white">Техна</h1>
            <p className="text-sm text-slate-400">AI-ассистент 1221 Systems</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">Вход в&nbsp;корпоративный портал</h2>
            <p className="mt-2 text-sm text-slate-400">
              Используйте учётную запись 1221 Systems.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-400">Корпоративный e-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="fintech-input mt-2 w-full rounded-2xl px-4 py-3 outline-none transition"
                placeholder="user@portal-test.1221systems.ru"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-400">Пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="fintech-input mt-2 w-full rounded-2xl px-4 py-3 outline-none transition"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Входим…' : (<>Войти <LogIn size={18} /></>)}
            </Button>
          </form>

          <div className="fintech-control rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Демо-аккаунты для хакатона
            </p>
            <div className="mt-3 grid gap-2">
              {TEST_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(TEST_PASSWORD);
                  }}
                  className={`flex flex-col gap-1 rounded-2xl border px-3 py-2.5 text-left text-sm transition sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                    email === account.email
                      ? 'border-purple-500/60 bg-purple-600/10'
                      : 'data-row'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{account.name}</p>
                    <p className="truncate text-[11px] text-slate-400 sm:text-xs">{account.email}</p>
                  </div>
                  <span className="w-fit shrink-0 rounded-full bg-slate-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 ring-1 ring-slate-700 sm:text-[11px]">
                    {account.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Пароль для всех тестовых: <code className="rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-slate-300">{TEST_PASSWORD}</code>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
