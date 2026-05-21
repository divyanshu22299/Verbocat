const axios = require("axios");
const { protectTags } = require("../utils/tagProtection");

const normalizeTranslatedText = (text) =>
  String(text || "")
    .replace(/&#10;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripVisibleTags = (text) =>
  normalizeTranslatedText(text).replace(/<\/?[^>]+>/g, "").trim();

const isUsableTranslation = (source, translated) => {
  const cleanSource = normalizeTranslatedText(source).toLowerCase();
  const cleanTranslated = normalizeTranslatedText(translated).toLowerCase();

  return (
    cleanTranslated &&
    cleanTranslated !== cleanSource &&
    !/<\/?[a-z][^>]*>/i.test(cleanTranslated)
  );
};

const translateWithGoogle = async (protectedText, target) => {
  const response = await axios.get(
    "https://translate.googleapis.com/translate_a/single",
    {
      params: {
        client: "gtx",
        sl: "en",
        tl: target,
        dt: "t",
        q: protectedText
      },
      timeout: 10000
    }
  );

  return (response.data?.[0] || [])
    .map((part) => part?.[0] || "")
    .join("");
};

const translateWithMyMemory = async (protectedText, target) => {
  const response = await axios.get("https://api.mymemory.translated.net/get", {
    params: {
      q: protectedText,
      langpair: `en|${target}`
    },
    timeout: 10000
  });

  return response.data.responseData.translatedText;
};

const translateWithLibreTranslate = async (protectedText, target) => {
  const response = await axios.post(
    "https://translate.argosopentech.com/translate",
    {
      q: protectedText,
      source: "en",
      target,
      format: "text"
    },
    {
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );

  return response.data.translatedText;
};

const translateWithLingva = async (protectedText, target) => {
  const response = await axios.get(
    `https://lingva.ml/api/v1/en/${target}/${encodeURIComponent(protectedText)}`,
    {
      timeout: 10000
    }
  );

  return response.data.translation;
};

const restoreProtectedTags = (translated, tags) => {
  let output = normalizeTranslatedText(translated);

  tags.forEach((tag, index) => {
    output = output.replace(`__TAG_${index}__`, tag);
  });

  return output;
};

const translateChunk = async (texts, target = "hi") => {
  const results = [];

  for (const text of texts) {
    const { protectedText, tags } = protectTags(text);
    let translated = null;
    let provider = null;

    try {
      const candidate = await translateWithGoogle(protectedText, target);
      if (isUsableTranslation(text, candidate)) {
        translated = candidate;
        provider = "Google";
      }
    } catch (error) {}

    try {
      const candidate = await translateWithMyMemory(protectedText, target);
      if (!translated && isUsableTranslation(text, candidate)) {
        translated = candidate;
        provider = "MyMemory";
      }
    } catch (error) {}

    if (!translated) {
      try {
        const candidate = await translateWithLibreTranslate(protectedText, target);
        if (isUsableTranslation(text, candidate)) {
          translated = candidate;
          provider = "LibreTranslate";
        }
      } catch (error) {}
    }

    if (!translated) {
      try {
        const candidate = await translateWithLingva(protectedText, target);
        if (isUsableTranslation(text, candidate)) {
          translated = candidate;
          provider = "Lingva";
        }
      } catch (error) {}
    }

    if (!translated || translated.trim() === "") {
      translated = text;
      provider = "Fallback";
    }

    results.push({
      source: text,
      translated: stripVisibleTags(restoreProtectedTags(translated, tags)),
      provider
    });
  }

  return results;
};

module.exports = {
  translateChunk
};
