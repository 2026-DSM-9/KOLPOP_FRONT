import { normalizeApiErrorMessage } from "./apiError.js";
import { fetchWithAuth } from "./auth.js";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

class FilesApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "FilesApiError";
    this.code = code;
  }
}

const getApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new FilesApiError("API 주소가 설정되지 않았습니다. .env.local의 BASE_URL을 확인해주세요.");
  }

  return API_BASE_URL;
};

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchWithAuth(`${getApiBaseUrl()}/files/upload`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body: formData,
  });

  const payload = await response.json().catch(() => null);
  const apiError = payload?.error;

  if (!response.ok || payload?.success === false) {
    throw new FilesApiError(
      normalizeApiErrorMessage(apiError?.message, "파일 업로드에 실패했습니다."),
      apiError?.code,
    );
  }

  return payload?.data;
};
