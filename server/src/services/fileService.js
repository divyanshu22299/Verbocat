const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const cheerio = require("cheerio");
const mammoth = require("mammoth");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../config/supabase");

const uploadsDir = path.join(__dirname, "../../uploads");

const SKIP_SELECTOR = "script,style,noscript,svg,canvas";

const normalizeSegmentText = (text) =>
  (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();

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

      const rawText = $(element).text();
      const source = normalizeSegmentText(rawText);
      if (!source) {
        return;
      }

      const leading = rawText.match(/^\s*/)?.[0] || "";
      const trailing = rawText.match(/\s*$/)?.[0] || "";
      const segmentId = segmentIndex++;
      $(element).replaceWith(`__SEG_${segmentId}__`);
      segments.push({
        id: segmentId,
        source,
        target: "",
        leading,
        trailing
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

    const htmlString = $.html();
    const compressedHtml = zlib.gzipSync(Buffer.from(htmlString, "utf-8")).toString("base64");

    const fileId = uuidv4();
    const { error: insertError } = await supabase
      .from("html_files")
      .insert([{ id: fileId, content: compressedHtml }]);

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      const error = new Error("Failed to save HTML template securely to the database.");
      error.status = 500;
      throw error;
    }

    return {
      type: "html",
      fileId,
      segments,
      originalName: file.originalname.replace(".html", "")
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
      segments,
      originalName: file.originalname.replace(".docx", "")
    };
  }

  const error = new Error("Unsupported file");
  error.status = 400;
  throw error;
};

const exportHtml = async (fileId, segments) => {
  if (!fileId) {
    const error = new Error("Cannot export: No file ID found. Please note that DOCX exports are not supported, only HTML files can be exported.");
    error.status = 400;
    throw error;
  }

  const { data, error: fetchError } = await supabase
    .from("html_files")
    .select("content")
    .eq("id", fileId)
    .single();

  if (fetchError || !data || !data.content) {
    console.error(`Export failed: File ID ${fileId} not found in Supabase.`);
    const error = new Error(`File not found. Did you load an old project file or forget to run the Supabase SQL query?`);
    error.status = 404;
    throw error;
  }

  let html = "";
  try {
    const buffer = Buffer.from(data.content, "base64");
    html = zlib.gunzipSync(buffer).toString("utf-8");
  } catch (err) {
    html = data.content;
  }

  const segmentMap = new Map();
  segments.forEach((segment) => {
    const replacement =
      escapeHtml(segment.leading || "") +
      toHtmlText(segment.target) +
      escapeHtml(segment.trailing || "");
    segmentMap.set(segment.id, replacement);
  });

  html = html.replace(/__SEG_(\d+)__/g, (match, idStr) => {
    const id = parseInt(idStr, 10);
    if (segmentMap.has(id)) {
      return segmentMap.get(id);
    }
    return match;
  });

  return html;
};

module.exports = {
  processUploadedFile,
  exportHtml
};
