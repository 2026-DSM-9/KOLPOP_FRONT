import { normalizeApiErrorMessage } from "./apiError.js";
import { fetchWithAuth } from "./auth.js";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

class MyPageApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "MyPageApiError";
    this.code = code;
  }
}

const getApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new MyPageApiError("API 주소가 설정되지 않았습니다. .env.local의 BASE_URL을 확인해주세요.");
  }

  return API_BASE_URL;
};

const normalizeProfile = (profile = {}) => ({
  name: profile.name || "",
  email: profile.email || "",
  phone: profile.phone || "",
  bio: profile.introduction || "",
  role: profile.role || "",
});

const requestMyPage = async ({ method = "GET", body } = {}) => {
  const response = await fetchWithAuth(`${getApiBaseUrl()}/mypage`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json().catch(() => null);
  const apiError = payload?.error;

  if (!response.ok || payload?.success === false) {
    throw new MyPageApiError(
      normalizeApiErrorMessage(apiError?.message, "내 정보를 불러오지 못했습니다."),
      apiError?.code,
    );
  }

  return normalizeProfile(payload?.data);
};

export const fetchMyPage = () => requestMyPage();

export const updateMyPage = ({ name, email, phone, bio }) =>
  requestMyPage({
    method: "PUT",
    body: {
      name,
      email,
      phone,
      introduction: bio,
    },
  });
