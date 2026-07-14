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

export const createChatSocket = ({ roomId, onMessage, onError, onClose }) => {
  const socket = new WebSocket(getSocketUrl(roomId));

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
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

  socket.addEventListener("close", onClose);

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

export const normalizeSocketMessage = (payload, currentUserId) => {
  const senderId = `${payload.sender?.id ?? payload.senderId ?? ""}`;
  const normalizedCurrentUserId = `${currentUserId ?? ""}`;
  const senderRole = `${payload.sender?.role ?? payload.senderRole ?? ""}`.toLowerCase();
  const isMine =
    (senderId && normalizedCurrentUserId && senderId === normalizedCurrentUserId) ||
    senderRole.includes("landlord");

  return {
    id: Number(payload.messageId ?? payload.id ?? Date.now()),
    roomId: Number(payload.roomId),
    sender: isMine ? "host" : "guest",
    text: payload.content ?? payload.message ?? payload.text ?? "",
    timestamp: "",
    rawSender: payload.sender ?? null,
  };
};
