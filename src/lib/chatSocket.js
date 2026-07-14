import { getSavedAuthSession } from "./auth.js";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "";
const STOMP_TERMINATOR = "\u0000";

const getSocketUrl = () => {
  if (!SOCKET_URL) {
    throw new Error(".env.local의 VITE_SOCKET_URL을 확인해주세요.");
  }

  return SOCKET_URL;
};

const getAuthorizationHeader = () => {
  const accessToken = getSavedAuthSession()?.accessToken || "";

  if (!accessToken) {
    return "";
  }

  return accessToken.startsWith("Bearer ") ? accessToken : `Bearer ${accessToken}`;
};

const createStompFrame = (command, headers = {}, body = "") => {
  const headerLines = Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}:${value}`);

  return `${command}\n${headerLines.join("\n")}\n\n${body}${STOMP_TERMINATOR}`;
};

const parseStompFrame = (frame) => {
  const normalizedFrame = frame.replace(/^\n+/, "");
  const separatorIndex = normalizedFrame.indexOf("\n\n");

  if (separatorIndex < 0) {
    return null;
  }

  const headerBlock = normalizedFrame.slice(0, separatorIndex);
  const body = normalizedFrame.slice(separatorIndex + 2);
  const [command, ...headerLines] = headerBlock.split("\n");
  const headers = Object.fromEntries(
    headerLines
      .map((line) => {
        const delimiterIndex = line.indexOf(":");
        return delimiterIndex >= 0
          ? [line.slice(0, delimiterIndex), line.slice(delimiterIndex + 1)]
          : null;
      })
      .filter(Boolean),
  );

  return { command, headers, body };
};

export const createChatSocket = ({ roomId, onOpen, onMessage, onError, onClose }) => {
  const socket = new WebSocket(getSocketUrl());
  socket.__stompConnected = false;

  socket.addEventListener("open", () => {
    socket.send(
      createStompFrame("CONNECT", {
        "accept-version": "1.2",
        "heart-beat": "0,0",
        Authorization: getAuthorizationHeader(),
      }),
    );
  });

  socket.addEventListener("message", (event) => {
    const rawData = `${event.data ?? ""}`;
    const frames = rawData
      .split(STOMP_TERMINATOR)
      .map((frame) => frame.trimStart())
      .filter((frame) => frame.trim().length > 0);

    frames.forEach((rawFrame) => {
      const frame = parseStompFrame(rawFrame);

      if (!frame) {
        return;
      }

      if (frame.command === "CONNECTED") {
        socket.__stompConnected = true;
        socket.send(
          createStompFrame("SUBSCRIBE", {
            id: `chat-room-${roomId}`,
            destination: `/topic/chat/rooms/${roomId}`,
          }),
        );
        onOpen?.();
        return;
      }

      if (frame.command === "MESSAGE") {
        try {
          const payload = JSON.parse(frame.body);
          onMessage?.(payload);
        } catch {
          onMessage?.({
            roomId,
            content: frame.body,
          });
        }
        return;
      }

      if (frame.command === "ERROR") {
        onError?.(new Error(frame.body || "채팅 소켓 처리 중 오류가 발생했습니다."));
      }
    });
  });

  socket.addEventListener("error", () => {
    onError?.(new Error("채팅 소켓 연결에 실패했습니다."));
  });

  socket.addEventListener("close", (event) => {
    socket.__stompConnected = false;
    onClose?.(event);
  });

  return socket;
};

export const sendChatSocketMessage = (socket, { roomId, content }) => {
  if (!socket || socket.readyState !== WebSocket.OPEN || !socket.__stompConnected) {
    throw new Error("채팅 서버에 연결 중입니다. 잠시 후 다시 시도해주세요.");
  }

  socket.send(
    createStompFrame(
      "SEND",
      {
        destination: `/app/chat/rooms/${roomId}/messages`,
        "content-type": "application/json",
      },
      JSON.stringify({ content }),
    ),
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
