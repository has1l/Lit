import { ArrowRight, BriefcaseMedical, CalendarDays, ChevronRight, FileText, MessageCircle, WalletCards } from 'lucide-react';
import { useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

const QUICK_QUESTIONS = [
  {
    label: 'Отпуск',
    icon: CalendarDays,
    prompt: 'Сколько дней отпуска мне доступно?',
  },
  {
    label: 'Перенос',
    icon: CalendarDays,
    prompt: 'Как перенести отпуск?',
  },
  {
    label: 'Зарплата',
    icon: WalletCards,
    prompt: 'Когда будет ближайшая выплата зарплаты?',
  },
  {
    label: 'ДМС',
    icon: BriefcaseMedical,
    prompt: 'Какие программы ДМС доступны?',
  },
  {
    label: 'Документы',
    icon: FileText,
    prompt: 'Где скачать справку 2-НДФЛ?',
  },
];

export default function Questions({ openChatWithPrompt }) {
  const [selected, setSelected] = useState(QUICK_QUESTIONS[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Вопросы</h1>
        <p className="mt-2 text-slate-400">Быстрые ответы Техны по частым HR-сценариям.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">Быстрые вопросы</h2>
            <span className="rounded-full bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-200 ring-1 ring-purple-400/20">
              Ответы из базы знаний
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {QUICK_QUESTIONS.map((item) => {
              const Icon = item.icon;
              const isActive = selected.prompt === item.prompt;
              return (
                <button
                  key={item.label}
                  onClick={() => setSelected(item)}
                  className={`flex min-h-28 flex-col items-center justify-center gap-3 rounded-3xl border p-4 text-center font-semibold transition ${
                    isActive
                      ? 'border-purple-400/60 bg-purple-600/20 text-white shadow-lg shadow-purple-950/20'
                      : 'border-slate-700 bg-slate-950/45 text-slate-300 hover:border-purple-500/50 hover:bg-purple-950/35 hover:text-white'
                  }`}
                >
                  <Icon size={28} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-3xl border border-slate-700 bg-slate-950/45 p-5">
            <p className="text-sm font-semibold text-purple-200">{selected.prompt}</p>
            <p className="mt-3 leading-6 text-slate-400">
              Техна ответит точно — с учётом ваших данных из системы и актуальных регламентов компании.
            </p>
            <Button
              className="mt-4 w-full sm:w-auto"
              onClick={() => openChatWithPrompt(selected.prompt)}
            >
              Спросить Техну
              <MessageCircle size={18} />
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-white">Популярные</h2>
          </div>
          <div className="mt-5 divide-y divide-slate-800">
            {QUICK_QUESTIONS.slice(1, 4).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.prompt}
                  onClick={() => openChatWithPrompt(item.prompt)}
                  className="flex w-full items-center gap-4 py-4 text-left"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950/60 text-purple-300 ring-1 ring-slate-700">
                    <Icon size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-white">{item.prompt}</span>
                    <span className="mt-1 block text-sm text-slate-500">Ответ из БД + регламенты</span>
                  </span>
                  <ChevronRight className="text-slate-500" size={20} />
                </button>
              );
            })}
          </div>

          <Button className="mt-5 w-full" variant="secondary" onClick={() => openChatWithPrompt('')}>
            Задать свой вопрос
            <ArrowRight size={18} />
          </Button>
        </Card>
      </div>
    </div>
  );
}
