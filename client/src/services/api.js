import axios from "axios";

const api = axios.create({
  baseURL: "https://verbocat.onrender.com"
});

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/upload", formData);
  return response.data;
};

export const translateBatch = async (segments, target) => {
  const response = await api.post("/translate-batch", {
    segments,
    target
  });
  return response.data;
};

export const exportHtmlFile = async (fileId, segments) => {
  const response = await api.post(
    "/export-html",
    { fileId, segments },
    { responseType: "blob" }
  );

  return new Blob([response.data]);
};
