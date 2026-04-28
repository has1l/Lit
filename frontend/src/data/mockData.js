import {
  CalendarDays,
  ClipboardList,
  FileText,
  Home,
  MessageCircle,
  ShoppingBag,
  Target,
  UserRound,
  WalletCards,
} from 'lucide-react';

// ── Боковая навигация (статичная UI-структура) ────────────────────────────
export const navItems = [
  { id: 'dashboard', label: 'Главная',    icon: Home },
  { id: 'goals',     label: 'Цели',       icon: Target },
  { id: 'store',     label: 'Магазин',    icon: ShoppingBag },
  { id: 'chat',      label: 'Чат',        icon: MessageCircle },
  { id: 'vacation',  label: 'Отпуск',     icon: CalendarDays },
  { id: 'salary',    label: 'Зарплата',   icon: WalletCards },
  { id: 'documents', label: 'Документы',  icon: FileText },
  { id: 'appeals',   label: 'Обращения',  icon: ClipboardList },
  { id: 'profile',   label: 'Профиль',    icon: UserRound },
];

export const managerNavItems = [
  { id: 'team',      label: 'Команда',    icon: ClipboardList },
  { id: 'store',     label: 'Магазин',    icon: ShoppingBag },
  { id: 'chat',      label: 'Чат',        icon: MessageCircle },
  { id: 'documents', label: 'Документы',  icon: FileText },
  { id: 'appeals',   label: 'Обращения',  icon: ClipboardList },
  { divider: true,   label: 'Мой кабинет' },
  { id: 'vacation',  label: 'Отпуск',     icon: CalendarDays },
  { id: 'salary',    label: 'Зарплата',   icon: WalletCards },
  { id: 'profile',   label: 'Профиль',    icon: UserRound },
];

// ── Подсказки-кнопки в AI-чате (готовые промты) ───────────────────────────
export const quickQuestions = [
  { label: 'Отпуск',           prompt: 'Сколько дней отпуска мне доступно?' },
  { label: 'Перенос отпуска',  prompt: 'Как перенести отпуск?' },
  { label: 'Зарплата',         prompt: 'Когда будет ближайшая выплата?' },
  { label: 'Больничный',       prompt: 'Как оформить больничный?' },
  { label: 'Режим работы',     prompt: 'Каков режим рабочего времени?' },
  { label: 'Дистанционка',     prompt: 'Какие правила дистанционной работы?' },
];
