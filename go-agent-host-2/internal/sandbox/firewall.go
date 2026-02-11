// Package sandbox provides network isolation for sandboxed containers.
package sandbox

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/coreos/go-iptables/iptables"
)

// FirewallRules represents iptables rules for sandbox network isolation.
// When applied, these rules ensure that sandbox containers can ONLY reach
// the host gateway on specified ports (proxy, LLM service, etc.) and nothing else.
//
// Note: Rules are not cleaned up on shutdown - they reference the sandbox subnet,
// so if the network is deleted the rules become no-ops. This avoids complexity
// and the rules don't affect anything outside the sandbox network.
type FirewallRules struct {
	ipt          *iptables.IPTables
	subnet       string
	gateway      string
	allowedPorts []int
}

// NewFirewallRules creates a new FirewallRules instance.
// This does NOT apply any rules - call Apply() to enforce them.
func NewFirewallRules(net *NetworkInfo, allowedPorts []int) (*FirewallRules, error) {
	ipt, err := iptables.NewWithProtocol(iptables.ProtocolIPv4)
	if err != nil {
		return nil, fmt.Errorf("failed to create iptables client: %w", err)
	}

	return &FirewallRules{
		ipt:          ipt,
		subnet:       net.Subnet,
		gateway:      net.Gateway,
		allowedPorts: allowedPorts,
	}, nil
}

// ensureRuleTop inserts a rule at the top of DOCKER-USER if not already present.
func (f *FirewallRules) ensureRuleTop(rule []string) error {
	const table = "filter"
	const chain = "DOCKER-USER"

	exists, err := f.ipt.Exists(table, chain, rule...)
	if err != nil {
		return fmt.Errorf("failed to check rule existence: %w", err)
	}
	if exists {
		return nil
	}
	return f.ipt.Insert(table, chain, 1, rule...)
}

// Apply installs iptables rules to restrict sandbox egress.
// After this, sandbox containers can ONLY reach:
//   - The host gateway IP on the specified allowed ports
//   - Established/related connections (responses)
//
// All other egress (internet, other containers, host services) is blocked.
func (f *FirewallRules) Apply() error {
	slog.Info("Applying firewall rules for sandbox isolation",
		"subnet", f.subnet,
		"gateway", f.gateway,
		"allowed_ports", f.allowedPorts,
	)

	// Build port list for multiport match
	portStrs := make([]string, 0, len(f.allowedPorts))
	for _, p := range f.allowedPorts {
		portStrs = append(portStrs, fmt.Sprintf("%d", p))
	}
	portList := strings.Join(portStrs, ",")

	// Rule 1: Allow established/related connections (for responses)
	// This ensures that once a connection is allowed, return traffic works
	if err := f.ensureRuleTop([]string{
		"-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT",
	}); err != nil {
		return fmt.Errorf("failed to add ESTABLISHED rule: %w", err)
	}

	// Rule 2: Allow sandbox subnet -> host gateway on allowed ports only
	// This is the ONLY permitted outbound path for sandboxes
	if err := f.ensureRuleTop([]string{
		"-s", f.subnet,
		"-d", f.gateway,
		"-p", "tcp",
		"-m", "multiport", "--dports", portList,
		"-j", "ACCEPT",
	}); err != nil {
		return fmt.Errorf("failed to add ACCEPT rule: %w", err)
	}

	// Rule 3: Block sandbox-to-sandbox (lateral movement prevention)
	// Prevents one compromised sandbox from attacking another
	if err := f.ensureRuleTop([]string{
		"-s", f.subnet,
		"-d", f.subnet,
		"-j", "DROP",
	}); err != nil {
		return fmt.Errorf("failed to add lateral DROP rule: %w", err)
	}

	// Rule 4: Drop all other egress from sandbox subnet
	// This is what actually removes internet access
	if err := f.ensureRuleTop([]string{
		"-s", f.subnet,
		"-j", "DROP",
	}); err != nil {
		return fmt.Errorf("failed to add DROP rule: %w", err)
	}

	slog.Info("Firewall rules applied successfully")
	return nil
}

// EnsureInputRules adds iptables INPUT rules to allow sandbox containers
// to reach host services (proxies) on the gateway IP. This is needed on
// systems like COS where the INPUT chain policy is DROP.
// Unlike Apply(), this is safe to call unconditionally — it only adds
// ACCEPT rules for the specific subnet/ports and is idempotent.
func EnsureInputRules(net *NetworkInfo, allowedPorts []int) error {
	ipt, err := iptables.NewWithProtocol(iptables.ProtocolIPv4)
	if err != nil {
		slog.Warn("iptables not available, skipping INPUT rules", "error", err)
		return nil
	}

	portStrs := make([]string, 0, len(allowedPorts))
	for _, p := range allowedPorts {
		portStrs = append(portStrs, fmt.Sprintf("%d", p))
	}
	portList := strings.Join(portStrs, ",")

	rule := []string{
		"-s", net.Subnet,
		"-d", net.Gateway,
		"-p", "tcp",
		"-m", "multiport", "--dports", portList,
		"-j", "ACCEPT",
	}

	exists, err := ipt.Exists("filter", "INPUT", rule...)
	if err != nil {
		slog.Warn("Failed to check INPUT rule existence", "error", err)
		return nil
	}
	if exists {
		slog.Debug("INPUT rule for sandbox already exists")
		return nil
	}

	if err := ipt.Insert("filter", "INPUT", 2, rule...); err != nil {
		return fmt.Errorf("failed to add INPUT ACCEPT rule for sandbox: %w", err)
	}

	slog.Info("Added INPUT rule for sandbox->host proxy traffic",
		"subnet", net.Subnet,
		"gateway", net.Gateway,
		"ports", allowedPorts,
	)
	return nil
}
