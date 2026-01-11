import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";

// Use process.cwd() for logs directory (works with both CommonJS and ES modules)
const logsDir: string = path.join(process.cwd(), "logs");

// Define the log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    (info: winston.Logform.TransformableInfo) =>
      `[${info.timestamp}] [${info.level.toUpperCase()}] ${info.message} ${
        info.splat !== undefined
          ? info.splat && Array.isArray(info.splat)
            ? `${info.splat
                .map((arg: any) => {
                  try {
                    return JSON.stringify(arg);
                  } catch (e) {
                    return String(arg); // Fallback for circular structures or other errors
                  }
                })
                .join(" ")}`
            : ""
          : ""
      }`
  )
);

// Create a new Winston logger instance
const logger: winston.Logger = winston.createLogger({
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Add colorize for console output
        logFormat
      ),
      level: process.env.LOG_LEVEL_CONSOLE || "warn", // Configurable console log level
    }),
    // Daily rotate file transport for all logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, "application-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true, // Archive old logs
      maxSize: "20m", // Rotate if log file exceeds 20MB
      maxFiles: "14d", // Keep logs for 14 days
      level: process.env.LOG_LEVEL_FILE || "info", // Configurable file log level
    }),
    // Separate file for error logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d", // Keep error logs for 30 days
      level: "error", // Only log errors to this file
    }),
  ],
  exitOnError: false, // Do not exit on handled exceptions
});

// Stream for morgan (HTTP request logger)
interface LoggerStream {
  write: (message: string, encoding?: string) => void;
}

(logger as any).stream = {
  write: function (message: string, encoding?: string): void {
    logger.info(message.trim());
  },
} as LoggerStream;

export default logger;
