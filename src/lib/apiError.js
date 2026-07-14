export const normalizeApiErrorMessage = (message, fallbackMessage) => {
  const rawMessage = typeof message === "string" ? message.trim() : "";

  if (!rawMessage) {
    return fallbackMessage;
  }

  const fieldMessageMatch = rawMessage.match(/^[A-Za-z0-9_.[\]-]+\s*:\s*(.+)$/);
  return fieldMessageMatch ? fieldMessageMatch[1].trim() : rawMessage;
};
