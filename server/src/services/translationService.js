const { supabase } = require("../config/supabase");
const { runQaChecks } = require("../utils/qa");
const {
  createProviderState,
  translateChunk
} = require("./translationProviders");

const normalizeText = (text) =>
  String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ensureEnglishNumerals = (text) => {
  return String(text || "").replace(/[०-९]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) - 0x0966 + 48);
  });
};

const hasVisibleMarkup = (text) => /<\/?[a-z][^>]*>/i.test(text || "");

const digitString = (text) => String(text || "").replace(/\D/g, "");

const isSafeTmTranslation = (source, target) => {
  const normalizedSource = normalizeText(source);
  const normalizedTarget = normalizeText(target);

  if (!normalizedTarget) {
    return false;
  }

  if (hasVisibleMarkup(normalizedTarget) && !hasVisibleMarkup(normalizedSource)) {
    return false;
  }

  if (digitString(normalizedSource) !== digitString(normalizedTarget)) {
    return false;
  }

  if (
    normalizedSource.length <= 25 &&
    normalizedTarget.length > normalizedSource.length * 5
  ) {
    return false;
  }

  return true;
};

const isPersistableProvider = (provider) =>
  provider && provider !== "Fallback" && provider !== "Cached Fallback";

const translateSegments = async (segments, target) => {
  const providerState = createProviderState();

  const uniqueSources = [...new Set(segments.map((s) => s.source))];

  const { data: existingTranslations } = await supabase
    .from("translation_memory")
    .select("*")
    .in("source_text", uniqueSources)
    .eq("target_lang", target);

  const tmMap = {};
  (existingTranslations || []).forEach((item) => {
    tmMap[item.source_text] = item;
  });

  const uniqueMissingSources = [];

  uniqueSources.forEach((source) => {
    const existing = tmMap[source];
    if (!existing || !isSafeTmTranslation(source, existing.target_text)) {
      uniqueMissingSources.push(source);
    }
  });

  const chunkSize = 20;

  for (let index = 0; index < uniqueMissingSources.length; index += chunkSize) {
    const chunkSources = uniqueMissingSources.slice(index, index + chunkSize);
    const translatedChunk = await translateChunk(chunkSources, target, providerState);

    const insertRows = [];

    chunkSources.forEach((source, offset) => {
      const translated = translatedChunk[offset];
      const translatedText = ensureEnglishNumerals(translated.translated);

      tmMap[source] = {
        source_text: source,
        target_text: translatedText,
        provider: translated.provider
      };

      if (isPersistableProvider(translated.provider)) {
        insertRows.push({
          source_text: source,
          target_text: translatedText,
          source_lang: "en",
          target_lang: target,
          provider: translated.provider
        });
      }
    });

    if (insertRows.length > 0) {
      const { error: insertError } = await supabase
        .from("translation_memory")
        .insert(insertRows);

      if (insertError) {
        console.log("SUPABASE INSERT ERROR");
        console.log(insertError);
      }
    }
  }

  const results = segments.map((segment) => {
    const tmEntry = tmMap[segment.source];
    const targetText = tmEntry ? tmEntry.target_text : "";
    const provider = tmEntry && tmEntry.provider ? tmEntry.provider : "TM Database";

    return {
      id: segment.id,
      translated: targetText,
      provider: provider,
      qaIssues: runQaChecks(segment.source, targetText)
    };
  });

  return { results };
};

module.exports = {
  translateSegments
};
