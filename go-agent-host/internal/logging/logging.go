// Package logging provides structured logging configuration using slog.
package logging

import (
	"io"
	"log/slog"
	"os"

	"gopkg.in/natefinch/lumberjack.v2"
)

// Config holds logging configuration.
type Config struct {
	LogFile        string // Path to log file (empty for stdout)
	MaxLogFileSize int    // Max file size in bytes before rotation
}

// Setup initializes the global slog logger based on the provided configuration.
// Returns a cleanup function to close the log file if one was opened.
func Setup(cfg Config) func() {
	var writer io.Writer = os.Stdout
	var cleanup func()

	// Setup file writer with rotation if log file specified
	if cfg.LogFile != "" {
		lj := &lumberjack.Logger{
			Filename:   cfg.LogFile,
			MaxSize:    cfg.MaxLogFileSize / (1024 * 1024), // lumberjack uses MB
			MaxBackups: 3,
			MaxAge:     28, // days
			Compress:   true,
		}
		writer = lj
		cleanup = func() {
			lj.Close()
		}
	}

	// Always use JSON format
	handler := slog.NewJSONHandler(writer, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})

	// Set as default logger
	logger := slog.New(handler)
	slog.SetDefault(logger)

	if cleanup == nil {
		return func() {}
	}
	return cleanup
}
