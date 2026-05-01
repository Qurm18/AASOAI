// lib/logger.ts
export const logger = {
  debug: (msg: string, ...data: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${msg}`, ...data);
    }
  },
  info: (msg: string, ...data: any[]) => {
    console.log(`[INFO] ${msg}`, ...data);
  },
  warn: (msg: string, ...args: any[]) => {
    console.warn(`[WARN] ${msg}`, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    console.error(`[ERROR] ${msg}`, ...args);
    // In a real production app, uncomment below:
    // if (process.env.NODE_ENV === 'production') {
    //   Sentry.captureException(error, { extra: { msg } });
    // }
  }
};
