/**
 * Centralized logging utility with log levels and sensitive data scrubbing
 * Prevents sensitive data exposure and reduces log noise in production
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private level: LogLevel;

  constructor() {
    // Default to 'info' in production, 'debug' in development
    const envLevel = process.env.LOG_LEVEL as LogLevel;
    this.level = envLevel || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  /**
   * Scrub sensitive data from logs (URLs with signed tokens, full file paths, etc.)
   */
  private scrubSensitive(value: any): any {
    if (typeof value === 'string') {
      // Redact signed URL parameters
      value = value.replace(/([?&])(X-Goog-[^&]+=[^&]+)/g, '$1[REDACTED]');
      value = value.replace(/([?&])(token=[^&]+)/g, '$1token=[REDACTED]');
      value = value.replace(/([?&])(key=[^&]+)/g, '$1key=[REDACTED]');
      
      // Shorten long URLs for readability
      if (value.includes('storage.googleapis.com')) {
        const url = new URL(value);
        value = `${url.origin}${url.pathname}?[params]`;
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively scrub objects
      const scrubbed: any = Array.isArray(value) ? [] : {};
      for (const key in value) {
        scrubbed[key] = this.scrubSensitive(value[key]);
      }
      return scrubbed;
    }
    return value;
  }

  private formatMessage(level: LogLevel, namespace: string, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${level.toUpperCase()}] [${namespace}]`;
    
    if (context) {
      const scrubbedContext = this.scrubSensitive(context);
      return `${prefix} ${message} ${JSON.stringify(scrubbedContext)}`;
    }
    
    return `${prefix} ${message}`;
  }

  debug(namespace: string, message: string, context?: LogContext) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', namespace, message, context));
    }
  }

  info(namespace: string, message: string, context?: LogContext) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', namespace, message, context));
    }
  }

  warn(namespace: string, message: string, context?: LogContext) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', namespace, message, context));
    }
  }

  error(namespace: string, message: string, context?: LogContext | Error) {
    if (this.shouldLog('error')) {
      if (context instanceof Error) {
        console.error(this.formatMessage('error', namespace, message), context);
      } else {
        console.error(this.formatMessage('error', namespace, message, context));
      }
    }
  }
}

export const logger = new Logger();
