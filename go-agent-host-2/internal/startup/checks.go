// Package startup provides startup checks and initialization for agent-runner.
package startup

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
	"github.com/somnia-chain/agent-runner/internal/sandbox"
)

// CheckResult represents the result of a startup check.
type CheckResult struct {
	Name    string
	Passed  bool
	Message string
	Error   error
}

// Checker runs startup checks and initialization.
type Checker struct {
	dockerClient *client.Client
	results      []CheckResult
}

// NewChecker creates a new startup checker.
func NewChecker() *Checker {
	return &Checker{
		results: make([]CheckResult, 0),
	}
}

// Results returns all check results.
func (c *Checker) Results() []CheckResult {
	return c.results
}

// DockerClient returns the Docker client after CheckDocker has been called.
func (c *Checker) DockerClient() *client.Client {
	return c.dockerClient
}

// addResult adds a check result and logs it.
func (c *Checker) addResult(name string, passed bool, message string, err error) {
	result := CheckResult{
		Name:    name,
		Passed:  passed,
		Message: message,
		Error:   err,
	}
	c.results = append(c.results, result)

	if passed {
		slog.Info("Startup check passed", "check", name, "message", message)
	} else {
		if err != nil {
			slog.Error("Startup check failed", "check", name, "message", message, "error", err)
		} else {
			slog.Error("Startup check failed", "check", name, "message", message)
		}
	}
}

// CheckDocker verifies Docker daemon is running and accessible.
func (c *Checker) CheckDocker(ctx context.Context) error {
	const checkName = "Docker"

	slog.Info("Running startup check", "check", checkName)

	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		c.addResult(checkName, false, "Failed to create Docker client", err)
		return fmt.Errorf("failed to create Docker client: %w", err)
	}

	// Verify Docker daemon is running
	ping, err := dockerClient.Ping(ctx)
	if err != nil {
		c.addResult(checkName, false, "Docker daemon is not running", err)
		return fmt.Errorf(`Docker daemon is not running.

To fix this:
  - macOS: Open Docker Desktop application
  - Linux: Run 'sudo systemctl start docker' or 'sudo service docker start'
  - Windows: Start Docker Desktop from the Start menu

If Docker is not installed:
  - macOS: brew install --cask docker
  - Linux: https://docs.docker.com/engine/install/
  - Windows: https://docs.docker.com/desktop/install/windows-install/

Underlying error: %w`, err)
	}

	c.dockerClient = dockerClient
	c.addResult(checkName, true, fmt.Sprintf("Docker daemon running (API %s)", ping.APIVersion), nil)
	return nil
}

// CheckSandboxNetwork ensures the sandbox network exists and is properly configured.
func (c *Checker) CheckSandboxNetwork(ctx context.Context, networkName, subnet, gateway string) (*sandbox.NetworkInfo, error) {
	const checkName = "Sandbox Network"

	slog.Info("Running startup check", "check", checkName)

	if c.dockerClient == nil {
		c.addResult(checkName, false, "Docker client not initialized", nil)
		return nil, fmt.Errorf("Docker client not initialized - run CheckDocker first")
	}

	// Ensure network exists
	netInfo, err := sandbox.EnsureNetwork(ctx, c.dockerClient, networkName, subnet, gateway)
	if err != nil {
		c.addResult(checkName, false, "Failed to create/verify sandbox network", err)
		return nil, err
	}

	// Give the network interface a moment to come up
	time.Sleep(100 * time.Millisecond)

	// Verify gateway IP is on host
	if err := sandbox.AssertGatewayIPOnHost(netInfo.Gateway); err != nil {
		// This is a warning, not a failure - some platforms (macOS) work differently
		slog.Warn("Gateway IP not found on host interface (may be expected on some platforms)",
			"gateway", netInfo.Gateway,
			"error", err,
		)
	}

	c.addResult(checkName, true, fmt.Sprintf("Network %s ready (gateway %s)", netInfo.Name, netInfo.Gateway), nil)
	return netInfo, nil
}

// CheckStaleContainers finds and removes any old agent containers.
// It looks for containers with the agent-host.version-hash label.
func (c *Checker) CheckStaleContainers(ctx context.Context) (int, error) {
	const checkName = "Stale Containers"

	slog.Info("Running startup check", "check", checkName)

	if c.dockerClient == nil {
		c.addResult(checkName, false, "Docker client not initialized", nil)
		return 0, fmt.Errorf("Docker client not initialized - run CheckDocker first")
	}

	// Find all containers with our agent-host label
	filterArgs := filters.NewArgs()
	filterArgs.Add("label", "agent-host.version-hash")

	containers, err := c.dockerClient.ContainerList(ctx, container.ListOptions{
		All:     true, // Include stopped containers
		Filters: filterArgs,
	})
	if err != nil {
		c.addResult(checkName, false, "Failed to list containers", err)
		return 0, fmt.Errorf("failed to list containers: %w", err)
	}

	// All containers with the label are considered stale at startup
	staleContainers := containers

	if len(staleContainers) == 0 {
		c.addResult(checkName, true, "No stale containers found", nil)
		return 0, nil
	}

	// Remove stale containers
	removed := 0
	var errors []string
	for _, ctr := range staleContainers {
		containerName := "unknown"
		if len(ctr.Names) > 0 {
			containerName = strings.TrimPrefix(ctr.Names[0], "/")
		}

		slog.Info("Removing stale container",
			"container", containerName,
			"id", ctr.ID[:12],
			"state", ctr.State,
		)

		// Stop if running
		if ctr.State == "running" {
			timeout := 5
			if err := c.dockerClient.ContainerStop(ctx, ctr.ID, container.StopOptions{Timeout: &timeout}); err != nil {
				slog.Warn("Failed to stop container", "container", containerName, "error", err)
			}
		}

		// Remove container
		if err := c.dockerClient.ContainerRemove(ctx, ctr.ID, container.RemoveOptions{Force: true}); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", containerName, err))
			slog.Error("Failed to remove container", "container", containerName, "error", err)
		} else {
			removed++
		}
	}

	if len(errors) > 0 {
		c.addResult(checkName, false, fmt.Sprintf("Removed %d/%d stale containers", removed, len(staleContainers)), fmt.Errorf("some containers failed to remove"))
		return removed, fmt.Errorf("failed to remove some containers: %s", strings.Join(errors, "; "))
	}

	c.addResult(checkName, true, fmt.Sprintf("Removed %d stale containers", removed), nil)
	return removed, nil
}

// CheckFirewall creates firewall rules (optionally applies them).
func (c *Checker) CheckFirewall(netInfo *sandbox.NetworkInfo, allowedPorts []int, apply bool) (*sandbox.FirewallRules, error) {
	const checkName = "Firewall"

	slog.Info("Running startup check", "check", checkName)

	rules, err := sandbox.NewFirewallRules(netInfo, allowedPorts)
	if err != nil {
		// iptables not available - this is okay on non-Linux or without privileges
		c.addResult(checkName, true, "iptables not available (firewall disabled)", nil)
		return nil, nil
	}

	if !apply {
		c.addResult(checkName, true, "Firewall rules created (not applied)", nil)
		return rules, nil
	}

	if err := rules.Apply(); err != nil {
		c.addResult(checkName, false, "Failed to apply firewall rules", err)
		return rules, err
	}

	c.addResult(checkName, true, fmt.Sprintf("Firewall rules applied (ports %v)", allowedPorts), nil)
	return rules, nil
}

// PrintSummary prints a summary of all check results.
func (c *Checker) PrintSummary() {
	passed := 0
	failed := 0
	for _, r := range c.results {
		if r.Passed {
			passed++
		} else {
			failed++
		}
	}

	if failed == 0 {
		slog.Info("All startup checks passed", "total", len(c.results))
	} else {
		slog.Warn("Some startup checks failed", "passed", passed, "failed", failed)
	}
}
