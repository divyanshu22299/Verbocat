const axios = require("axios");
const { protectTags } = require("../utils/tagProtection");

const successCache = new Map();
const failedCache = new Map();

const SUCCESS_CACHE_LIMIT = 5000;
const FAILED_CACHE_TTL_MS = 10 * 60 * 1000;
const FAILED_CACHE_LIMIT = 2000;
const RATE_LIMIT_COOLDOWN_MS = 90 * 1000;
const PROVIDER_RETRY_DELAYS_MS = [800, 1800, 3500];

const normalizeTranslatedText = (text) =>
  String(text || "")
    .replace(/&#10;/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripVisibleTags = (text) =>
  normalizeTranslatedText(text).replace(/<\/?[^>]+>/g, "").trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cacheKey = (source, target) =>
  `${target}::${normalizeTranslatedText(source).toLowerCase()}`;

const setLimitedCache = (cache, key, value, limit) => {
  if (cache.size >= limit) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }

  cache.set(key, value);
};

const getFailedCache = (key) => {
  const cached = failedCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > FAILED_CACHE_TTL_MS) {
    failedCache.delete(key);
    return null;
  }

  return cached;
};

const isRateLimitError = (error) => {
  const status = error?.response?.status;
  return status === 403 || status === 408 || status === 429 || status === 503;
};

const isRetryableError = (error) => {
  if (isRateLimitError(error)) {
    return true;
  }

  return [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNABORTED",
    "ENOTFOUND",
    "EAI_AGAIN"
  ].includes(error?.code);
};

const createProviderState = () => ({
  cooldownUntil: {
    Google: 0,
    MyMemory: 0,
    LibreTranslate: 0,
    Lingva: 0
  }
});

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

const providers = [
  {
    name: "Google",
    translate: translateWithGoogle
  },
  {
    name: "MyMemory",
    translate: translateWithMyMemory
  },
  {
    name: "LibreTranslate",
    translate: translateWithLibreTranslate
  },
  {
    name: "Lingva",
    translate: translateWithLingva
  }
];

const callProviderWithRetry = async (provider, protectedText, target) => {
  let lastError = null;

  for (let attempt = 0; attempt < PROVIDER_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await provider.translate(protectedText, target);
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === PROVIDER_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }

      await sleep(PROVIDER_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
};

const translateWithProviders = async (source, protectedText, target, providerState) => {
  const now = Date.now();

  for (const provider of providers) {
    if ((providerState.cooldownUntil[provider.name] || 0) > now) {
      continue;
    }

    try {
      const candidate = await callProviderWithRetry(provider, protectedText, target);

      if (isUsableTranslation(source, candidate)) {
        return {
          translated: candidate,
          provider: provider.name
        };
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        providerState.cooldownUntil[provider.name] =
          Date.now() + RATE_LIMIT_COOLDOWN_MS;
      }
    }
  }

  return null;
};

const restoreProtectedTags = (translated, tags) => {
  let output = normalizeTranslatedText(translated);

  tags.forEach((tag, index) => {
    output = output.replace(`__TAG_${index}__`, tag);
  });

  return output;
};

const translateChunk = async (texts, target = "hi", providerState = createProviderState()) => {
  const results = [];

  for (const text of texts) {
    const key = cacheKey(text, target);
    const cachedSuccess = successCache.get(key);

    if (cachedSuccess) {
      results.push({
        source: text,
        translated: cachedSuccess.translated,
        provider: `${cachedSuccess.provider} Cache`
      });
      continue;
    }

    const cachedFailure = getFailedCache(key);

    if (cachedFailure) {
      results.push({
        source: text,
        translated: text,
        provider: "Cached Fallback"
      });
      continue;
    }

    const { protectedText, tags } = protectTags(text);
    const translation = await translateWithProviders(
      text,
      protectedText,
      target,
      providerState
    );

    let translated = translation?.translated || null;
    let provider = translation?.provider || null;

    if (!translated || translated.trim() === "") {
      translated = text;
      provider = "Fallback";
      setLimitedCache(
        failedCache,
        key,
        {
          createdAt: Date.now()
        },
        FAILED_CACHE_LIMIT
      );
    }

    const finalTranslation = stripVisibleTags(restoreProtectedTags(translated, tags));

    if (provider !== "Fallback") {
      setLimitedCache(
        successCache,
        key,
        {
          translated: finalTranslation,
          provider
        },
        SUCCESS_CACHE_LIMIT
      );
    }

    results.push({
      source: text,
      translated: finalTranslation,
      provider
    });
  }

  return results;
};

module.exports = {
  createProviderState,
  translateChunk
};
