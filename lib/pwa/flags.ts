export const pwaFlags = {
  installPromptEnabled: process.env.NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED !== "false",
  offlineReadEnabled: process.env.NEXT_PUBLIC_OFFLINE_READ_ENABLED !== "false",
  offlineWriteEnabled: process.env.NEXT_PUBLIC_OFFLINE_WRITE_ENABLED !== "false",
  backgroundSyncEnabled: process.env.NEXT_PUBLIC_BACKGROUND_SYNC_ENABLED !== "false",
};
