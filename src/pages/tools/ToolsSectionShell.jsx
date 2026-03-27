const ToolsSectionShell = ({ title, subtitle, cards, note }) => {
  return (
    <div className="min-h-screen bg-slate-50/80 p-4 md:p-6 space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
          Tools
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-900">{card.title}</p>
            <p className="mt-1 text-sm text-slate-500">{card.description}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-4 text-sm text-slate-500">
        {note}
      </section>
    </div>
  );
};

export default ToolsSectionShell;
