const fs = require("fs");
const cheerio = require("cheerio");
const mammoth = require("mammoth");
const { v4: uuidv4 } = require("uuid");

const htmlFiles = {};

const BLOCK_SELECTOR = [
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "div",
  "dt",
  "figcaption",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "li",
  "main",
  "p",
  "section",
  "td",
  "th"
].join(",");

const SKIP_SELECTOR = "script,style,noscript,svg,canvas";

const normalizeSegmentText = (text) =>
  (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();

const getElementText = ($, element) => {
  const clone = $(element).clone();
  clone.find("br").replaceWith("\n");
  return normalizeSegmentText(clone.text());
};

const escapeHtml = (text) =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const stripVisibleTags = (text) =>
  String(text || "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const toHtmlText = (text) =>
  escapeHtml(stripVisibleTags(text)).replace(/\n/g, "<br/>");

const createHtmlSegments = ($) => {
  const segments = [];
  let segmentIndex = 0;

  const addSegment = ($element, source) => {
    const segmentId = segmentIndex++;
    $element.empty().append(`__SEG_${segmentId}__`);
    segments.push({
      id: segmentId,
      source,
      target: ""
    });
  };

  $(BLOCK_SELECTOR).each((_, element) => {
    const $element = $(element);

    if (
      $element.closest(SKIP_SELECTOR).length > 0 ||
      $element.find(BLOCK_SELECTOR).length > 0
    ) {
      return;
    }

    const source = getElementText($, element);
    if (!source) {
      return;
    }

    addSegment($element, source);
  });

  if (segments.length > 0) {
    return segments;
  }

  $("body")
    .find("*")
    .contents()
    .each((_, element) => {
      if (element.type !== "text") {
        return;
      }

      const $parent = $(element).parent();
      if ($parent.closest(SKIP_SELECTOR).length > 0) {
        return;
      }

      const source = normalizeSegmentText($(element).text());
      if (!source) {
        return;
      }

      const segmentId = segmentIndex++;
      $(element).replaceWith(`__SEG_${segmentId}__`);
      segments.push({
        id: segmentId,
        source,
        target: ""
      });
    });

  return segments;
};

const processUploadedFile = async (file) => {
  if (!file) {
    const error = new Error("No file uploaded");
    error.status = 400;
    throw error;
  }

  const originalName = file.originalname.toLowerCase();

  if (originalName.endsWith(".html")) {
    const html = fs.readFileSync(file.path, "utf-8");
    const $ = cheerio.load(html, {
      decodeEntities: false
    });

    const segments = createHtmlSegments($);

    const fileId = uuidv4();
    htmlFiles[fileId] = $.html();

    return {
      type: "html",
      fileId,
      segments
    };
  }

  if (originalName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({
      path: file.path
    });

    const segments = result.value
      .split(/\n{2,}|\r?\n/)
      .map(normalizeSegmentText)
      .filter(Boolean)
      .map((paragraph, index) => ({
        id: index,
        source: paragraph,
        target: ""
      }));

    return {
      type: "docx",
      segments
    };
  }

  const error = new Error("Unsupported file");
  error.status = 400;
  throw error;
};

const exportHtml = (fileId, segments) => {
  let html = htmlFiles[fileId];

  if (!html) {
    const error = new Error("File not found");
    error.status = 404;
    throw error;
  }

  segments.forEach((segment) => {
    html = html.replace(`__SEG_${segment.id}__`, toHtmlText(segment.target));
  });

  return html;
};

module.exports = {
  processUploadedFile,
  exportHtml
};
