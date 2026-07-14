import { getSavedAuthSession } from "./auth.js";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "";

const getSocketUrl = (roomId) => {
  if (!SOCKET_URL) {
    throw new Error(".env.local의 Socket_URL을 확인해주세요.");
  }

  const url = new URL(SOCKET_URL);
  const accessToken = getSavedAuthSession()?.accessToken || "";

  url.searchParams.set("roomId", `${roomId}`);

  if (accessToken) {
    url.searchParams.set("token", accessToken.replace(/^Bearer\s+/i, ""));
  }

  return url.toString();
};

export const createChatSocket = ({ roomId, onOpen, onMessage, onError, onClose }) => {
  const socket = new WebSocket(getSocketUrl(roomId));

  socket.addEventListener("open", () => {
    onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);

      if (Array.isArray(payload)) {
        payload.forEach((item) => onMessage?.(item));
        return;
      }

      onMessage?.(payload);
    } catch {
      onMessage?.({
        roomId,
        content: event.data,
      });
    }
  });

  socket.addEventListener("error", () => {
    onError?.(new Error("채팅 소켓 연결에 실패했습니다."));
  });

  socket.addEventListener("close", (event) => {
    onClose?.(event);
  });

  return socket;
};

export const sendChatSocketMessage = (socket, { roomId, content }) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("채팅 서버에 연결 중입니다. 잠시 후 다시 시도해주세요.");
  }

  socket.send(
    JSON.stringify({
      roomId,
      content,
    }),
  );
};

const unwrapSocketPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (payload.data && typeof payload.data === "object") {
    return unwrapSocketPayload(payload.data);
  }

  if (payload.message && typeof payload.message === "object") {
    return unwrapSocketPayload(payload.message);
  }

  return payload;
};

export const normalizeSocketMessage = (payload, currentUserId, fallbackRoomId) => {
  const message = unwrapSocketPayload(payload);

  if (!message || typeof message !== "object") {
    return null;
  }

  const messageType = `${message.type ?? message.event ?? ""}`.toUpperCase();

  if (messageType === "PING" || messageType === "PONG" || messageType === "CONNECTED") {
    return null;
  }

  const text = message.content ?? message.text ?? message.body ?? "";

  if (!text) {
    return null;
  }

  const senderId = `${message.sender?.id ?? message.sender?.userId ?? message.senderId ?? message.userId ?? ""}`;
  const normalizedCurrentUserId = `${currentUserId ?? ""}`;
  const senderRole = `${message.sender?.role ?? message.senderRole ?? message.role ?? ""}`.toLowerCase();
  const isMine =
    (senderId && normalizedCurrentUserId && senderId === normalizedCurrentUserId) ||
    senderRole.includes("landlord");
  const roomId = Number(
    message.roomId ??
      message.chatRoomId ??
      message.room?.id ??
      message.chatRoom?.id ??
      fallbackRoomId,
  );

  return {
    id: Number(message.messageId ?? message.id ?? `${Date.now()}${Math.floor(Math.random() * 1000)}`),
    roomId,
    sender: isMine ? "host" : "guest",
    text,
    timestamp: message.createdAt ?? message.timestamp ?? "",
    rawSender: message.sender ?? null,
  };
};
