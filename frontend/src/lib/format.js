const MONTH_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTH_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const TYPE_RU = { advance: 'Аванс', salary: 'Зарплата' };

export function formatDay(dateStr) {
  if (!dateStr) return '—';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_RU[m - 1]}`;
}

export function formatFull(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

export function formatAmount(amount) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount);
}

export function paymentTypeRu(type) {
  return TYPE_RU[type] ?? type;
}

export function pluralDays(n) {
  const abs = Math.abs(n);
  if (abs % 10 === 1 && abs % 100 !== 11) return `${n} день`;
  if (abs % 10 >= 2 && abs % 10 <= 4 && (abs % 100 < 10 || abs % 100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}
