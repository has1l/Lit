import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';

const categories = ['Отпуск', 'Зарплата', 'ДМС', 'Документы', 'Другое'];

export default function Appeals({ appeals, addAppeal, modalOpen, setModalOpen }) {
  const [form, setForm] = useState({
    topic: '',
    category: categories[0],
    message: '',
  });

  useEffect(() => {
    if (!modalOpen) {
      setForm({ topic: '', category: categories[0], message: '' });
    }
  }, [modalOpen]);

  function submitAppeal(event) {
    event.preventDefault();

    if (!form.topic.trim() || !form.message.trim()) return;

    addAppeal({
      topic: form.topic.trim(),
      category: form.category,
      message: form.message.trim(),
    });
    setModalOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Обращения</h1>
          <p className="mt-2 text-slate-400">История HR-запросов и новые обращения.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Создать обращение</Button>
      </div>

      <div className="grid gap-4">
        {appeals.map((appeal) => (
          <Card key={appeal.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-200">{appeal.id}</p>
              <h2 className="mt-1 text-xl font-bold text-white">{appeal.topic}</h2>
              <p className="mt-1 text-sm text-slate-500">{appeal.category}</p>
            </div>
            <span className="w-fit rounded-full bg-slate-950/60 px-3 py-1 text-sm font-semibold text-slate-300 ring-1 ring-slate-700">
              {appeal.status}
            </span>
          </Card>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-xl">
            <h2 className="text-2xl font-bold text-white">Создать обращение</h2>
            <form onSubmit={submitAppeal} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-400">Тема</span>
                <input
                  value={form.topic}
                  onChange={(event) => setForm((current) => ({ ...current, topic: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-purple-500"
                  placeholder="Например, перенос отпуска"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-400">Категория</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-purple-500"
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-400">Сообщение</span>
                <textarea
                  value={form.message}
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  className="mt-2 min-h-32 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-purple-500"
                  placeholder="Опишите вопрос"
                />
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="submit" className="flex-1">Отправить</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
                  Закрыть
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
