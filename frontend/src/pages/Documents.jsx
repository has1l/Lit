import { Download, FileText } from 'lucide-react';
import { useState } from 'react';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useEmployeeData } from '../hooks/useEmployeeData.js';
import { formatFull } from '../lib/format.js';

export default function Documents() {
  const { data } = useEmployeeData();
  const [openedDocument, setOpenedDocument] = useState(null);

  const hireDate = data?.profile?.hire_date ? formatFull(data.profile.hire_date) : 'загрузка...';
  const currentYear = new Date().getFullYear();

  const documents = [
    {
      title: 'Справка 2-НДФЛ',
      date: `За ${currentYear} год`,
      status: 'Готово',
      description: 'Документ с данными о доходах и удержанном НДФЛ за выбранный период. Формируется по запросу в течение одного рабочего дня.',
    },
    {
      title: 'Трудовой договор',
      date: `Подписан ${hireDate}`,
      status: 'Архив',
      description: 'Основной трудовой договор с условиями работы, должностью, отделом и графиком.',
    },
    {
      title: 'Полис ДМС',
      date: `Действует до 31 декабря ${currentYear}`,
      status: 'Активен',
      description: 'Программа добровольного медицинского страхования. Доступны: терапевт, стоматология, диагностика, телемедицина.',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Документы</h1>
        <p className="mt-2 text-slate-400">Справки, договоры и HR-документы в одном месте.</p>
      </div>

      <div className="grid gap-4">
        {documents.map((document) => (
          <Card key={document.title} className="p-0">
            <button
              onClick={() => setOpenedDocument(document)}
              className="flex w-full items-center justify-between gap-4 p-5 text-left"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-purple-500/10 text-purple-300 ring-1 ring-purple-400/20">
                  <FileText size={24} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-white">{document.title}</h2>
                  <p className="text-sm text-slate-500">{document.date}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden rounded-full bg-slate-950/60 px-3 py-1 text-sm font-semibold text-slate-300 ring-1 ring-slate-700 sm:inline-flex">
                  {document.status}
                </span>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/70 text-slate-100 ring-1 ring-purple-500/60">
                  <Download size={18} />
                </span>
              </div>
            </button>
          </Card>
        ))}
      </div>

      {openedDocument && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-purple-500/10 text-purple-300 ring-1 ring-purple-400/20">
                <FileText size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-white">{openedDocument.title}</h2>
                <p className="mt-2 text-slate-400">{openedDocument.description}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 rounded-3xl border border-slate-700 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Дата</span>
                <span className="font-semibold text-slate-200">{openedDocument.date}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Статус</span>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-purple-200 ring-1 ring-purple-500/40">
                  {openedDocument.status}
                </span>
              </div>
            </div>

            <Button className="mt-6 w-full" onClick={() => setOpenedDocument(null)}>
              Закрыть
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
