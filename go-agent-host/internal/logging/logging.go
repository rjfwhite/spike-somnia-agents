// Package logging provides structured logging configuration using slog.
package logging

import (
	"context"
	"encoding/json"
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

// gcpHandler wraps slog.JSONHandler to output Google Cloud Logging compatible format.
type gcpHandler struct {
	writer io.Writer
	level  slog.Level
}

// gcpSeverity maps slog levels to Google Cloud Logging severity levels.
func gcpSeverity(level slog.Level) string {
	switch {
	case level >= slog.LevelError:
		return "ERROR"
	case level >= slog.LevelWarn:
		return "WARNING"
	case level >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
}

func (h *gcpHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level
}

func (h *gcpHandler) Handle(_ context.Context, r slog.Record) error {
	// Build log entry with GCP-compatible fields
	entry := map[string]interface{}{
		"severity": gcpSeverity(r.Level),
		"message":  r.Message,
		"time":     r.Time.Format("2006-01-02T15:04:05.000Z07:00"),
	}

	// Add all attributes
	r.Attrs(func(a slog.Attr) bool {
		entry[a.Key] = a.Value.Any()
		return true
	})

	// Encode and write
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	data = append(data, '\n')
	_, err = h.writer.Write(data)
	return err
}

func (h *gcpHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	// For simplicity, return self (attrs are handled per-record)
	return h
}

func (h *gcpHandler) WithGroup(name string) slog.Handler {
	// For simplicity, return self
	return h
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

	// Use GCP-compatible handler
	handler := &gcpHandler{
		writer: writer,
		level:  slog.LevelInfo,
	}

	// Set as default logger
	logger := slog.New(handler)
	slog.SetDefault(logger)

	if cleanup == nil {
		return func() {}
	}
	return cleanup
}
