import { LANGUAGES } from "../constants/languages.js";
import { Icons } from "./Icons.jsx";

const ActionButton = ({ children, className = "", ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${className}`}
  >
    {children}
  </button>
);

export const WorkspaceToolbar = ({
  onCloseProject,
  onExport,
  onLoadProject,
  onOpenGlossary,
  onSaveProject,
  onRelinkHtml,
  onTranslate,
  onToggleQa,
  isTranslating,
  qaIssuesCount,
  searchQuery,
  segmentsCount,
  setSearchQuery,
  stats,
  targetLanguage,
  onTargetLanguageChange,
  theme
}) => (
  <section className={`rounded-2xl border p-4 ${theme.cardStrong}`}>
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[200px_minmax(0,1fr)_auto] xl:items-end">
        <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)] xl:col-span-2">
          <label className="space-y-2">
            <span className={`text-xs uppercase tracking-[0.22em] ${theme.muted}`}>
              Target Language
            </span>
            <select
              value={targetLanguage}
              onChange={(event) => onTargetLanguageChange(event.target.value)}
              className={`w-full rounded-xl border px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-sky-300 ${theme.input}`}
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className={`text-xs uppercase tracking-[0.22em] ${theme.muted}`}>
              Search
            </span>
            <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${theme.inputSoft}`}>
              <span className={theme.muted}>
                <Icons.Search />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search source or target text"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <label
            className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${theme.buttonSecondary}`}
          >
            <Icons.FileJson />
            Load
            <input
              type="file"
              accept=".json"
              onChange={onLoadProject}
              className="hidden"
            />
          </label>

          <ActionButton onClick={onOpenGlossary} className={theme.accentSolid}>
            Glossary
          </ActionButton>
          <ActionButton
            onClick={onTranslate}
            disabled={segmentsCount === 0 || isTranslating}
            className={
              segmentsCount === 0 || isTranslating
                ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                : "bg-sky-700 text-white hover:bg-sky-600"
            }
          >
            {isTranslating ? "Translating..." : "Translate"}
          </ActionButton>
          <ActionButton
            onClick={onSaveProject}
            disabled={segmentsCount === 0}
            className={
              segmentsCount === 0
                ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                : "bg-slate-800 text-white hover:bg-slate-700"
            }
          >
            <Icons.Save />
            Save
          </ActionButton>
          <label
            className={
              segmentsCount === 0
                ? "inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition bg-slate-400/30 text-slate-300"
                : "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition bg-teal-700 text-white hover:bg-teal-600"
            }
          >
            <Icons.Upload />
            Relink HTML
            <input
              type="file"
              accept=".html"
              onChange={onRelinkHtml}
              className="hidden"
              disabled={segmentsCount === 0}
            />
          </label>
          <ActionButton
            onClick={onExport}
            disabled={segmentsCount === 0}
            className={
              segmentsCount === 0
                ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                : "bg-sky-700 text-white hover:bg-sky-600"
            }
          >
            <Icons.Download />
            Export
          </ActionButton>
          <ActionButton
            onClick={onToggleQa}
            disabled={segmentsCount === 0}
            className={
              segmentsCount === 0
                ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                : "bg-amber-700 text-white hover:bg-amber-600"
            }
          >
            QA {qaIssuesCount > 0 ? `(${qaIssuesCount})` : ""}
          </ActionButton>
          <ActionButton
            onClick={onCloseProject}
            disabled={segmentsCount === 0}
            className={
              segmentsCount === 0
                ? "cursor-not-allowed bg-slate-400/30 text-slate-300"
                : "bg-rose-700 text-white hover:bg-rose-600"
            }
          >
            <Icons.X />
            Close
          </ActionButton>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className={`rounded-xl border px-3.5 py-3 ${theme.card}`}>
          <div className={`text-[11px] uppercase tracking-[0.2em] ${theme.muted}`}>
            Segments
          </div>
          <div className="mt-2 text-xl font-bold">{stats.segments}</div>
        </div>
        <div className={`rounded-xl border px-3.5 py-3 ${theme.card}`}>
          <div className={`text-[11px] uppercase tracking-[0.2em] ${theme.muted}`}>
            Source Words
          </div>
          <div className="mt-2 text-xl font-bold">{stats.words}</div>
        </div>
        <div className={`rounded-xl border px-3.5 py-3 ${theme.card}`}>
          <div className={`text-[11px] uppercase tracking-[0.2em] ${theme.muted}`}>
            Target Words
          </div>
          <div className="mt-2 text-xl font-bold">{stats.translatedWords}</div>
        </div>
        <div className={`rounded-xl border px-3.5 py-3 ${theme.card}`}>
          <div className="flex items-center justify-between">
            <div className={`text-[11px] uppercase tracking-[0.2em] ${theme.muted}`}>
              Progress
            </div>
            <div className="font-mono text-sm font-semibold">{stats.progress}%</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-slate-300 transition-all duration-500"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  </section>
);
