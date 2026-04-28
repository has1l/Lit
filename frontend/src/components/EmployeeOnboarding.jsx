import { useEffect, useMemo, useState } from 'react';
import Mascot from './Mascot.jsx';

const STEPS = [
  {
    page: 'dashboard',
    target: 'employee-nav-dashboard',
    title: 'Главная',
    text: 'Здесь собрана сводка дня: рабочий статус, задачи, прогресс и рекомендации Техны.',
  },
  {
    page: 'dashboard',
    target: 'employee-workday',
    title: 'Рабочий день',
    text: 'Отсюда сотрудник начинает день, выбирает задачи и завершает смену с отчётом.',
  },
  {
    page: 'goals',
    target: 'employee-nav-goals',
    title: 'Цели',
    text: 'В этом разделе видны цели на месяц, очки, серия и достижения.',
  },
  {
    page: 'chat',
    target: 'employee-nav-chat',
    title: 'Чат с Техной',
    text: 'Здесь можно спросить про отпуск, зарплату, документы или правила компании.',
  },
  {
    page: 'vacation',
    target: 'employee-nav-vacation',
    title: 'Отпуск',
    text: 'Показывает остаток дней, планирование и важные даты по отпуску.',
  },
  {
    page: 'salary',
    target: 'employee-nav-salary',
    title: 'Зарплата',
    text: 'Здесь отображаются ближайшие выплаты и история начислений.',
  },
  {
    page: 'documents',
    target: 'employee-nav-documents',
    title: 'Документы',
    text: 'Раздел для HR-документов, регламентов и базы знаний.',
  },
  {
    page: 'appeals',
    target: 'employee-nav-appeals',
    title: 'Обращения',
    text: 'Если Техна не знает ответ или нужна помощь HR, здесь создаётся обращение.',
  },
  {
    page: 'profile',
    target: 'employee-nav-profile',
    title: 'Профиль',
    text: 'Личные данные сотрудника, должность, отдел и рабочая информация.',
  },
  {
    target: 'employee-theme-toggle',
    title: 'Тема интерфейса',
    text: 'Эта кнопка переключает тёмную и светлую тему портала.',
  },
  {
    target: 'employee-logout',
    title: 'Выход',
    text: 'Эта кнопка завершает сессию и возвращает на экран входа.',
  },
];

const STEP_MASCOTS = ['guide', 'bright', 'default'];

function getVisibleTarget(name) {
  const nodes = Array.from(document.querySelectorAll(`[data-tour="${name}"]`));
  return nodes.find((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function EmployeeOnboarding({ activePage, setActivePage, enabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const step = STEPS[stepIndex];
  const mascotVariant = STEP_MASCOTS[stepIndex % STEP_MASCOTS.length];

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => setIsOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => {
    if (!isOpen || !step?.page || activePage === step.page) return;
    setActivePage(step.page);
  }, [activePage, isOpen, setActivePage, step]);

  useEffect(() => {
    if (!isOpen || !step) return undefined;

    function updatePosition() {
      const target = getVisibleTarget(step.target);
      setTargetRect(target ? target.getBoundingClientRect() : null);
    }

    const timer = window.setTimeout(updatePosition, 120);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [activePage, isOpen, step]);

  const bubbleStyle = useMemo(() => {
    if (!targetRect) {
      return {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const width = Math.min(360, window.innerWidth - 32);
    const placeRight = targetRect.right + width + 24 < window.innerWidth;
    const placeLeft = targetRect.left - width - 24 > 0;
    const left = placeRight
      ? targetRect.right + 16
      : placeLeft
        ? targetRect.left - width - 16
        : clamp(targetRect.left, 16, window.innerWidth - width - 16);
    const top = clamp(targetRect.top + targetRect.height / 2 - 118, 16, window.innerHeight - 260);

    return { left, top, width };
  }, [targetRect]);

  if (!enabled || !isOpen || !step) return null;

  function close() {
    setIsOpen(false);
  }

  function next() {
    if (stepIndex >= STEPS.length - 1) {
      close();
      return;
    }
    setStepIndex((current) => current + 1);
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[55] bg-slate-950/20 backdrop-blur-[1px]" />

      {targetRect && (
        <div
          className="pointer-events-none fixed z-[56] rounded-[24px] ring-2 ring-purple-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.18),0_0_36px_rgba(124,58,237,0.35)]"
          style={{
            left: targetRect.left - 6,
            top: targetRect.top - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
        />
      )}

      <div
        className="fintech-panel fixed z-[60] max-w-[calc(100vw-2rem)] rounded-3xl p-4 shadow-2xl"
        style={bubbleStyle}
        role="dialog"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <Mascot state="idle" size="lg" variant={mascotVariant} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">
              Подсказка Техны
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{step.text}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-slate-500">
            {stepIndex + 1} / {STEPS.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="fintech-button-secondary min-h-10 rounded-2xl px-4 py-2 text-sm font-semibold"
            >
              Закрыть
            </button>
            <button
              type="button"
              onClick={next}
              className="fintech-button-primary min-h-10 rounded-2xl px-4 py-2 text-sm font-semibold"
            >
              {stepIndex >= STEPS.length - 1 ? 'Готово' : 'Далее'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
