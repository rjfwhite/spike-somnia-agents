// Package sandbox provides network isolation for sandboxed containers.
package sandbox

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"strings"

	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
)

// DefaultSubnet is the default subnet for the sandbox network.
const DefaultSubnet = "172.30.0.0/16"

// DefaultGateway is the default gateway IP for the sandbox network (host-side).
const DefaultGateway = "172.30.0.1"

// DefaultNetworkName is the default name for the sandbox network.
const DefaultNetworkName = "agent-sandbox"

// NetworkInfo holds information about the sandbox network.
type NetworkInfo struct {
	Name    string
	Subnet  string
	Gateway string
}

// EnsureNetwork creates or retrieves the sandbox Docker network.
// The gateway IP is the host-side address that containers can use to reach
// services running on the host (like the HTTP proxy).
func EnsureNetwork(ctx context.Context, cli *client.Client, name, subnet, gateway string) (*NetworkInfo, error) {
	// Check if network already exists
	nw, err := cli.NetworkInspect(ctx, name, network.InspectOptions{})
	if err == nil {
		// Network exists, validate it has proper IPAM config
		if len(nw.IPAM.Config) == 0 || nw.IPAM.Config[0].Subnet == "" || nw.IPAM.Config[0].Gateway == "" {
			return nil, fmt.Errorf("network %q exists but missing IPv4 subnet/gateway in IPAM config", name)
		}
		slog.Info("Using existing sandbox network",
			"name", name,
			"subnet", nw.IPAM.Config[0].Subnet,
			"gateway", nw.IPAM.Config[0].Gateway,
		)
		return &NetworkInfo{
			Name:    name,
			Subnet:  nw.IPAM.Config[0].Subnet,
			Gateway: nw.IPAM.Config[0].Gateway,
		}, nil
	}

	// Create network with deterministic IPAM so the host gateway IP is stable
	slog.Info("Creating sandbox network",
		"name", name,
		"subnet", subnet,
		"gateway", gateway,
	)

	_, err = cli.NetworkCreate(ctx, name, network.CreateOptions{
		Driver:   "bridge",
		Internal: false, // Keep false; we enforce egress with firewall
		IPAM: &network.IPAM{
			Config: []network.IPAMConfig{
				{Subnet: subnet, Gateway: gateway},
			},
		},
		Options: map[string]string{
			"com.docker.network.bridge.enable_ip_masquerade": "true",
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create sandbox network: %w", err)
	}

	// Verify creation
	nw, err = cli.NetworkInspect(ctx, name, network.InspectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to inspect created network: %w", err)
	}

	if len(nw.IPAM.Config) == 0 || nw.IPAM.Config[0].Subnet == "" || nw.IPAM.Config[0].Gateway == "" {
		return nil, fmt.Errorf("created network %q missing IPv4 subnet/gateway in IPAM config", name)
	}

	slog.Info("Created sandbox network",
		"name", name,
		"subnet", nw.IPAM.Config[0].Subnet,
		"gateway", nw.IPAM.Config[0].Gateway,
	)

	return &NetworkInfo{
		Name:    name,
		Subnet:  nw.IPAM.Config[0].Subnet,
		Gateway: nw.IPAM.Config[0].Gateway,
	}, nil
}

// AssertGatewayIPOnHost verifies that the gateway IP is assigned to a host interface.
// This is a sanity check to ensure the network was properly created.
func AssertGatewayIPOnHost(gateway string) error {
	ip := net.ParseIP(gateway)
	if ip == nil {
		return fmt.Errorf("invalid gateway IP: %q", gateway)
	}

	ifaces, err := net.Interfaces()
	if err != nil {
		return fmt.Errorf("failed to list interfaces: %w", err)
	}

	for _, ifc := range ifaces {
		addrs, err := ifc.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			if strings.HasPrefix(addr.String(), gateway+"/") {
				slog.Debug("Gateway IP found on host interface",
					"gateway", gateway,
					"interface", ifc.Name,
				)
				return nil
			}
		}
	}

	return fmt.Errorf("gateway IP %s not found on any host interface (is the network created?)", gateway)
}

// RemoveNetwork removes the sandbox network if it exists.
func RemoveNetwork(ctx context.Context, cli *client.Client, name string) error {
	err := cli.NetworkRemove(ctx, name)
	if err != nil {
		// Ignore "not found" errors
		if strings.Contains(err.Error(), "not found") {
			return nil
		}
		return fmt.Errorf("failed to remove network: %w", err)
	}
	slog.Info("Removed sandbox network", "name", name)
	return nil
}
