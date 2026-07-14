import { normalizeApiErrorMessage } from "./apiError.js";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const AUTH_STORAGE_KEY = "kolpop.auth";
const AUTH_EXPIRED_EVENT = "kolpop:auth-expired";
const AUTH_UPDATED_EVENT = "kolpop:auth-updated";

class AuthApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "AuthApiError";
    this.code = code;
  }
}

const getApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new AuthApiError("API 주소가 설정되지 않았습니다. .env.local의 BASE_URL을 확인해주세요.");
  }

  return API_BASE_URL;
};

const requestAuth = async (path, options = {}) => {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);
  const apiError = payload?.error;

  if (!response.ok || payload?.success === false) {
    throw new AuthApiError(
      normalizeApiErrorMessage(apiError?.message, "요청 처리 중 오류가 발생했습니다."),
      apiError?.code,
    );
  }

  return payload?.data;
};

export const saveAuthSession = (session) => {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(AUTH_UPDATED_EVENT, { detail: session }));
};

export const clearAuthSession = () => {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
};

export const getSavedAuthSession = () => {
  try {
    const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return rawSession ? JSON.parse(rawSession) : null;
  } catch {
    return null;
  }
};

export const getAuthorizationHeader = () => {
  const accessToken = getSavedAuthSession()?.accessToken;

  if (!accessToken) {
    throw new AuthApiError("로그인이 필요한 요청입니다.");
  }

  return accessToken.startsWith("Bearer ") ? accessToken : `Bearer ${accessToken}`;
};

const notifyAuthExpired = () => {
  clearAuthSession();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
};

const isAuthFailure = (response) => response.status === 401 || response.status === 403;

export const reissueAuthSession = async () => {
  const currentSession = getSavedAuthSession();
  const refreshToken = currentSession?.refreshToken || currentSession?.accessToken;

  if (!refreshToken) {
    notifyAuthExpired();
    throw new AuthApiError("로그인이 만료되었습니다. 다시 로그인해주세요.");
  }

  const authorization = refreshToken.startsWith("Bearer ") ? refreshToken : `Bearer ${refreshToken}`;
  const response = await fetch(`${getApiBaseUrl()}/auth/reissue`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
  });
  const payload = await response.json().catch(() => null);
  const apiError = payload?.error;

  if (!response.ok || payload?.success === false || !payload?.data?.accessToken) {
    notifyAuthExpired();
    throw new AuthApiError(
      normalizeApiErrorMessage(apiError?.message, "로그인이 만료되었습니다. 다시 로그인해주세요."),
      apiError?.code,
    );
  }

  const nextSession = {
    ...currentSession,
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken || currentSession.refreshToken,
    expiresIn: payload.data.accessTokenExpiresIn ?? currentSession.expiresIn,
    refreshTokenExpiresIn: payload.data.refreshTokenExpiresIn ?? currentSession.refreshTokenExpiresIn,
  };

  saveAuthSession(nextSession);
  return nextSession;
};

export const fetchWithAuth = async (input, options = {}, { retry = true } = {}) => {
  const headers = {
    ...options.headers,
    Authorization: getAuthorizationHeader(),
  };
  const response = await fetch(input, {
    ...options,
    headers,
  });

  if (!isAuthFailure(response) || !retry) {
    return response;
  }

  await reissueAuthSession();

  return fetchWithAuth(input, options, { retry: false });
};

export const checkLoginId = (loginId) =>
  requestAuth("/auth/check-id", {
    body: JSON.stringify({ loginId }),
  });

export const sendSignupCode = (phone) =>
  requestAuth("/auth/send", {
    body: JSON.stringify({ phone }),
  });

export const verifySignupCode = ({ phone, code }) =>
  requestAuth("/auth/verify", {
    body: JSON.stringify({ phone, code }),
  });

export const signupLandlord = ({ loginId, name, password, passwordConfirm, phone, email }) =>
  requestAuth("/auth/landlord/signup", {
    body: JSON.stringify({
      loginId,
      name,
      password,
      passwordConfirm,
      phone,
      email,
    }),
  });

export const loginLandlord = ({ loginId, password }) =>
  requestAuth("/auth/landlord/login", {
    body: JSON.stringify({ loginId, password }),
  });
