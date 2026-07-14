import { normalizeApiErrorMessage } from "./apiError.js";
import { fetchWithAuth } from "./auth.js";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

class ChatApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ChatApiError";
    this.code = code;
  }
}

const getApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new ChatApiError("API 주소가 설정되지 않았습니다. .env.local의 BASE_URL을 확인해주세요.");
  }

  return API_BASE_URL;
};

const requestChat = async (path, { method = "GET", body } = {}) => {
  const response = await fetchWithAuth(`${getApiBaseUrl()}${path}`, {
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
    throw new ChatApiError(
      normalizeApiErrorMessage(apiError?.message, "채팅 정보를 불러오지 못했습니다."),
      apiError?.code,
    );
  }

  return payload?.data;
};

const formatChatTime = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getRoomName = (room, currentUserId) => {
  const founderId = `${room.founder?.id ?? ""}`;
  const landlordId = `${room.landlord?.id ?? ""}`;
  const normalizedCurrentUserId = `${currentUserId ?? ""}`;

  if (founderId && founderId !== normalizedCurrentUserId) {
    return room.founder?.name || "창업자";
  }

  if (landlordId && landlordId !== normalizedCurrentUserId) {
    return room.landlord?.name || "임대인";
  }

  return room.founder?.name || room.landlord?.name || "대화 상대";
};

const normalizeRoom = (room, currentUserId) => ({
  id: Number(room.roomId),
  roomId: Number(room.roomId),
  name: getRoomName(room, currentUserId),
  listingTitle: "채팅방",
  preview: "메시지를 불러와 주세요.",
  timestamp: formatChatTime(room.createdAt),
  unreadCount: 0,
  dealClosed: false,
  founder: room.founder ?? null,
  landlord: room.landlord ?? null,
  messages: [],
});

const normalizeMessage = (message, currentUserId) => {
  const senderId = `${message.sender?.id ?? ""}`;
  const normalizedCurrentUserId = `${currentUserId ?? ""}`;
  const senderRole = `${message.sender?.role ?? ""}`.toLowerCase();
  const isMine =
    (senderId && normalizedCurrentUserId && senderId === normalizedCurrentUserId) ||
    senderRole.includes("landlord");

  return {
    id: Number(message.messageId),
    sender: isMine ? "host" : "guest",
    text: message.content || "",
    timestamp: formatChatTime(message.createdAt),
    rawSender: message.sender ?? null,
  };
};

export const fetchChatRooms = async (currentUserId) => {
  const data = await requestChat("/chat/rooms");

  return Array.isArray(data)
    ? data.map((room) => normalizeRoom(room, currentUserId)).filter((room) => Number.isFinite(room.id))
    : [];
};

export const createChatRoom = async (landlordId, currentUserId) => {
  const data = await requestChat("/chat/rooms", {
    method: "POST",
    body: { landlordId: Number(landlordId) },
  });

  return normalizeRoom(data ?? {}, currentUserId);
};

export const fetchChatMessages = async (roomId, currentUserId) => {
  const data = await requestChat(`/chat/rooms/${roomId}/messages`);

  return Array.isArray(data)
    ? data.map((message) => normalizeMessage(message, currentUserId)).filter((message) => Number.isFinite(message.id))
    : [];
};
