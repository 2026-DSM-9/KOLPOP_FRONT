import { normalizeApiErrorMessage } from "./apiError.js";
import { fetchWithAuth } from "./auth.js";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

class ReservationsApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ReservationsApiError";
    this.code = code;
  }
}

const getApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new ReservationsApiError("API 주소가 설정되지 않았습니다. .env.local의 BASE_URL을 확인해주세요.");
  }

  return API_BASE_URL;
};

const normalizeStatus = (status = {}) => {
  const code = `${status.code || ""}`.toLowerCase();
  const label = status.label || "";

  if (code.includes("approve") || label.includes("승인")) {
    return "approved";
  }

  if (code.includes("reject") || label.includes("거절")) {
    return "rejected";
  }

  return "pending";
};

const formatReservationDateTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const normalizeReservation = (reservation = {}) => ({
  id: Number(reservation.reservationId),
  reservationId: Number(reservation.reservationId),
  listingId: Number(reservation.listingId),
  listingTitle: reservation.listingTitle || "",
  founderId: reservation.founderId ?? null,
  applicant: reservation.founderName || "",
  period: [reservation.reservationStartDate, reservation.reservationEndDate].filter(Boolean).join(" ~ "),
  usageDays: Number(reservation.usageDays) || 0,
  appliedAt: formatReservationDateTime(reservation.appliedAt),
  message: reservation.message || "",
  status: normalizeStatus(reservation.status),
  statusLabel: reservation.status?.label || "",
  chatRoomId: reservation.chatRoomId ?? null,
  canApprove: Boolean(reservation.canApprove),
  canReject: Boolean(reservation.canReject),
  canChat: Boolean(reservation.canChat),
});

const requestReservations = async (path, { method = "GET" } = {}) => {
  const response = await fetchWithAuth(`${getApiBaseUrl()}${path}`, {
    method,
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  const apiError = payload?.error;

  if (!response.ok || payload?.success === false) {
    throw new ReservationsApiError(
      normalizeApiErrorMessage(apiError?.message, "예약 정보를 불러오지 못했습니다."),
      apiError?.code,
    );
  }

  return payload?.data;
};

export const fetchManagementReservations = async () => {
  const data = await requestReservations("/reservations/manage");

  return {
    summary: {
      pendingCount: Number(data?.summary?.pendingCount) || 0,
      approvedCount: Number(data?.summary?.approvedCount) || 0,
      totalCount: Number(data?.summary?.totalCount) || 0,
    },
    reservations: Array.isArray(data?.reservations)
      ? data.reservations.map(normalizeReservation).filter((reservation) => Number.isFinite(reservation.id))
      : [],
  };
};

export const approveReservationRequest = async (reservationId) => {
  const data = await requestReservations(`/reservations/${reservationId}/approve`, {
    method: "PATCH",
  });

  return {
    reservationId: Number(data?.reservationId),
    status: normalizeStatus(data?.status),
    statusLabel: data?.status?.label || "",
    chatRoomId: data?.chatRoomId ?? null,
  };
};

export const rejectReservationRequest = async (reservationId) => {
  const data = await requestReservations(`/reservations/${reservationId}/reject`, {
    method: "PATCH",
  });

  return {
    reservationId: Number(data?.reservationId),
    status: normalizeStatus(data?.status),
    statusLabel: data?.status?.label || "",
    chatRoomId: data?.chatRoomId ?? null,
  };
};
