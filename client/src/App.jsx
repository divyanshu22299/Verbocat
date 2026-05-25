import { useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { Header } from "./components/Header.jsx";
import { DragOverlay } from "./components/DragOverlay.jsx";
import { Toast } from "./components/Toast.jsx";
import { GlossaryModal } from "./components/GlossaryModal.jsx";
import { QAPanel } from "./components/QAPanel.jsx";
import { SegmentCard } from "./components/SegmentCard.jsx";
import { WorkspaceToolbar } from "./components/WorkspaceToolbar.jsx";
import { EmptyWorkspace } from "./components/EmptyWorkspace.jsx";
import { SegmentBoard } from "./components/SegmentBoard.jsx";
import { LANGUAGES } from "./constants/languages.js";
import { useGlossaryManager } from "./hooks/useGlossaryManager.js";
import {
  exportHtmlFile,
  translateBatch,
  uploadFile
} from "./services/api.js";
import { applyGlossaryTerms } from "./utils/glossary.js";
import { getTheme } from "./utils/theme.js";

export default function App() {
  const [segments, setSegments] = useState([]);
  const [fileId, setFileId] = useState(null);
  const [currentProvider, setCurrentProvider] = useState("");
  const [progress, setProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("hi");
  const [darkMode, setDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState(null);
  const [showQaPanel, setShowQaPanel] = useState(false);

  const glossaryManager = useGlossaryManager({
    defaultSourceLang: "en",
    defaultTargetLang: "hi"
  });

  const {
    glossaryMap,
    glossaryKey,
    glossary,
    glossaryLanguagePairs,
    glossarySourceLang,
    setGlossarySourceLang,
    glossaryTargetLang,
    setGlossaryTargetLang,
    showGlossary,
    setShowGlossary,
    selectedGlossaryRows,
    addGlossaryRow,
    updateGlossary,
    toggleGlossaryRow,
    deleteSelectedGlossaryRows,
    selectAllGlossaryRows,
    clearGlossarySelection,
    clearCurrentGlossary,
    deleteLanguagePairGlossary,
    pasteGlossary
  } = glossaryManager;

  const translationGlossary = useMemo(
    () => glossaryMap[`en-${targetLanguage}`] || [],
    [glossaryMap, targetLanguage]
  );

  const stats = useMemo(() => {
    const sourceText = segments.map((segment) => segment.source).join(" ");
    const targetText = segments.map((segment) => segment.target || "").join(" ");
    const countWords = (text) =>
      text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

    return {
      segments: segments.length,
      words: countWords(sourceText),
      characters: sourceText.length,
      translatedWords: countWords(targetText),
      progress:
        segments.length > 0
          ? Math.round(
              (segments.filter((segment) => segment.target).length /
                segments.length) *
                100
            )
          : 0
    };
  }, [segments]);

  const filteredSegments = useMemo(
    () =>
      segments.filter(
        (segment) =>
          segment.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (segment.target || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
      ),
    [searchQuery, segments]
  );

  const qaIssuesList = useMemo(
    () =>
      segments.flatMap((segment) =>
        (segment.qaIssues || []).map((issue) => ({
          id: segment.id,
          issue,
          source: segment.source
        }))
      ),
    [segments]
  );

  const theme = getTheme(darkMode);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleFileProcessing = async (file) => {
    if (!file) {
      return;
    }

    try {
      setProgress(0);
      const data = await uploadFile(file);
      const newSegments = data.segments.map((segment) => ({
        ...segment,
        target: ""
      }));
      setSegments(newSegments);
      setFileId(data.fileId || null);
      setCurrentProvider("");
      setShowQaPanel(false);
      showToast(`File uploaded: ${file.name}`);
    } catch (error) {
      console.log(error);
      showToast("Upload failed. Is the backend running?", "error");
    }
  };

  const handleRelinkHtml = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      showToast(`Relinking template...`);
      const data = await uploadFile(file);
      setFileId(data.fileId || null);
      showToast(`HTML Template relinked successfully! You can now Export.`);
    } catch (error) {
      console.log(error);
      showToast("Relink failed.", "error");
    }
  };

  const handleUpload = (event) => {
    handleFileProcessing(event.target.files[0]);
  };

  useEffect(() => {
    const handleDragOver = (event) => {
      event.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (event) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer.files && event.dataTransfer.files[0]) {
        handleFileProcessing(event.dataTransfer.files[0]);
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const handleTranslateSegments = async () => {
    if (segments.length === 0 || isTranslating) {
      return;
    }

    setIsTranslating(true);
    setProgress(0);

    try {
      const data = await translateBatch(segments, targetLanguage);
      const results = data.results || [];

      if (results.length > 0) {
        setCurrentProvider(results[0].provider);
      }

      let completed = 0;

      results.forEach((item, index) => {
        window.setTimeout(() => {
          setSegments((previous) =>
            previous.map((segment) =>
              segment.id === item.id
                ? {
                    ...segment,
                    target: applyGlossaryTerms(
                      segment.source,
                      item.translated,
                      translationGlossary
                    ),
                    provider: item.provider,
                    qaIssues: item.qaIssues || [],
                    fuzzyScore: item.fuzzyScore || null
                  }
                : segment
            )
          );

          completed += 1;
          setProgress(Math.round((completed / results.length) * 100));

          if (completed === results.length) {
            setIsTranslating(false);
            showToast("Translation completed!");
          }
        }, index * 20);
      });
    } catch (error) {
      console.log(error);
      setIsTranslating(false);
      showToast("Translation error.", "error");
    }
  };

  const handleApplyGlossary = () => {
    if (segments.length === 0) {
      showToast("Open a file before applying glossary", "error");
      return;
    }

    setSegments((previous) =>
      previous.map((segment) => ({
        ...segment,
        target: applyGlossaryTerms(
          segment.source,
          segment.target || "",
          translationGlossary
        )
      }))
    );

    showToast("Glossary applied to current translation");
  };

  const updateTranslation = (id, value) => {
    setSegments((previous) =>
      previous.map((segment) =>
        segment.id === id ? { ...segment, target: value } : segment
      )
    );
  };

  const saveProject = () => {
    const projectData = {
      fileId,
      targetLanguage,
      currentProvider,
      segments,
      glossaryMap
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "project.cattool.json");
    document.body.appendChild(link);
    link.click();
    showToast("Project saved!");
  };

  const loadProject = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const text = await file.text();

    try {
      const project = JSON.parse(text);
      setFileId(project.fileId || null);
      setSegments(project.segments || []);
      setTargetLanguage(project.targetLanguage || "hi");
      setCurrentProvider(project.currentProvider || "");
      setShowQaPanel(false);
      glossaryManager.setGlossaryMap(project.glossaryMap || {});
      showToast("Project loaded!");
    } catch (error) {
      showToast("Invalid project file", "error");
    }
  };

  const handleExportHtml = async () => {
    try {
      const blob = await exportHtmlFile(fileId, segments);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "translated.html");
      document.body.appendChild(link);
      link.click();
      showToast("HTML exported!");
    } catch (error) {
      console.log(error);
      showToast("Export failed", "error");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
  };

  const closeProject = () => {
    setSegments([]);
    setFileId(null);
    setCurrentProvider("");
    setProgress(0);
    setIsTranslating(false);
    setSearchQuery("");
    showToast("Project closed");
  };

  const goToSegment = (id) => {
    const element = document.getElementById(`segment-${id}`);
    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    element.classList.add("ring-2", "ring-red-500");

    window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-red-500");
    }, 2000);
  };

  return (
    <div
      className={`min-h-screen ${theme.bg} ${theme.text} font-sans transition-colors duration-300`}
    >
      <DragOverlay isDragging={isDragging} />
      <Toast toast={toast} />

      <Header
        currentProvider={currentProvider}
        darkMode={darkMode}
        onOpenGlossary={() => setShowGlossary(true)}
        onLoadProject={loadProject}
        onToggleDarkMode={() => setDarkMode((value) => !value)}
        qaIssuesCount={qaIssuesList.length}
        segmentsCount={segments.length}
        theme={theme}
      />

      <GlossaryModal
        darkMode={darkMode}
        glossary={glossary}
        glossaryKey={glossaryKey}
        glossaryLanguagePairs={glossaryLanguagePairs}
        glossarySourceLang={glossarySourceLang}
        glossaryTargetLang={glossaryTargetLang}
        languages={LANGUAGES}
        onAddRow={addGlossaryRow}
        onClearCurrentGlossary={clearCurrentGlossary}
        onClearSelection={clearGlossarySelection}
        onClose={() => setShowGlossary(false)}
        onDeleteLanguagePair={deleteLanguagePairGlossary}
        onDeleteSelected={deleteSelectedGlossaryRows}
        onPasteGlossary={pasteGlossary}
        onApplyGlossary={handleApplyGlossary}
        onSelectAll={selectAllGlossaryRows}
        onSelectPair={(source, target) => {
          setGlossarySourceLang(source);
          setGlossaryTargetLang(target);
        }}
        onToggleRow={toggleGlossaryRow}
        onUpdateGlossary={updateGlossary}
        selectedGlossaryRows={selectedGlossaryRows}
        setGlossarySourceLang={setGlossarySourceLang}
        setGlossaryTargetLang={setGlossaryTargetLang}
        show={showGlossary}
        canApplyGlossary={segments.length > 0}
        theme={theme}
      />

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        {isTranslating && (
          <div className="fixed bottom-8 right-8 z-50 w-80 overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 p-4 text-white shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-200">
                Translating
              </span>
              <span className="font-mono text-sm">{progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-slate-300 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {segments.length === 0 ? (
          <main className="mx-auto max-w-4xl">
            <EmptyWorkspace
              darkMode={darkMode}
              onLoadProject={loadProject}
              onOpenGlossary={() => setShowGlossary(true)}
              onUpload={handleUpload}
              theme={theme}
            />
          </main>
        ) : (
          <main className="space-y-6">
            <WorkspaceToolbar
              onCloseProject={closeProject}
              onExport={handleExportHtml}
              onLoadProject={loadProject}
              onOpenGlossary={() => setShowGlossary(true)}
              onSaveProject={saveProject}
              onRelinkHtml={handleRelinkHtml}
              onTranslate={handleTranslateSegments}
              onToggleQa={() => setShowQaPanel((value) => !value)}
              isTranslating={isTranslating}
              qaIssuesCount={qaIssuesList.length}
              searchQuery={searchQuery}
              segmentsCount={segments.length}
              setSearchQuery={setSearchQuery}
              stats={stats}
              targetLanguage={targetLanguage}
              onTargetLanguageChange={setTargetLanguage}
              theme={theme}
            />

            <QAPanel
              qaIssuesList={qaIssuesList}
              showQaPanel={showQaPanel}
              theme={theme}
              onGoToSegment={goToSegment}
            />

            <SegmentBoard theme={theme}>
              <Virtuoso
                style={{ height: "100%" }}
                data={filteredSegments}
                itemContent={(index, segment) => (
                  <SegmentCard
                    key={segment.id}
                    darkMode={darkMode}
                    index={index}
                    segment={segment}
                    theme={theme}
                    onCopy={copyToClipboard}
                    onUpdateTranslation={updateTranslation}
                  />
                )}
              />
            </SegmentBoard>
          </main>
        )}
      </div>
    </div>
  );
}
