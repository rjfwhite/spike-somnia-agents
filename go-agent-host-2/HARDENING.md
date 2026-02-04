# Agent Runner Hardening Specification

This document describes the tasks necessary to harden the agent runner for **highly adversarial workloads** - agents that are actively attempting to escape isolation, exfiltrate data, attack the host, or compromise other containers.

## Threat Model

**Adversary Capabilities:**
- Full control over agent container code execution
- Knowledge of the sandbox architecture
- Ability to craft arbitrary network requests
- Ability to manipulate container filesystem
- Time to probe and experiment with escape techniques

**Assets to Protect:**
- Host system integrity and data
- Other agent containers (lateral movement prevention)
- Network resources (prevent exfiltration, C2, attacks on third parties)
- System availability (prevent DoS)
- Audit trail integrity

---

## Critical Priority Tasks

### 1. Enable Firewall by Default

**Current State:** Firewall rules are disabled by default (`--enable-firewall=false`). Containers can freely access the internet.

**Risk:** Malicious agents can exfiltrate data, establish C2 channels, attack external systems, or download additional payloads.

**Tasks:**
- [ ] Change `--enable-firewall` default to `true`
- [ ] Fail startup if firewall cannot be enabled (rather than just warning)
- [ ] Add `--disable-firewall` flag for explicit opt-out in dev/test environments
- [ ] Document the security implications of running without firewall
- [ ] Add startup health check that verifies iptables rules are active

**Files:** `internal/config/config.go`, `internal/sandbox/firewall.go`, `internal/startup/checks.go`

---

### 2. Implement Container Image Verification

**Current State:** Agent images are downloaded from URLs without any cryptographic verification. An attacker who can MITM the download or compromise the image source can inject malicious code.

**Risk:** Supply chain attack - malicious images executed with no integrity verification.

**Tasks:**
- [ ] Implement SHA256 digest verification for image downloads
- [ ] Add support for image signing (cosign, GPG, or similar)
- [ ] Add `--require-signed-images` flag (default: true in production)
- [ ] Implement an allowlist of trusted image sources/registries
- [ ] Add checksum verification after download, before load
- [ ] Log and alert on verification failures

**Files:** `internal/agents/agents.go` (image download logic)

---

### 3. Drop Container Privileges

**Current State:** Containers run with Docker default privileges (typically root user inside container).

**Risk:** Privilege escalation, easier container escape via kernel exploits.

**Tasks:**
- [ ] Configure containers to run as non-root user (e.g., `nobody:nogroup` or UID 65534)
- [ ] Add `--read-only` filesystem flag to container config
- [ ] Drop all Linux capabilities except minimal required set
- [ ] Enable `--no-new-privileges` flag
- [ ] Configure seccomp profile (use Docker's default or stricter custom profile)
- [ ] Configure AppArmor/SELinux profile
- [ ] Disable `setuid`/`setgid` binaries via mount options

**Container Security Context:**
```go
HostConfig: &container.HostConfig{
    ReadonlyRootfs: true,
    SecurityOpt: []string{
        "no-new-privileges:true",
        "seccomp:default",
    },
    CapDrop: []string{"ALL"},
    User: "65534:65534",
}
```

**Files:** `internal/agents/agents.go` (container creation)

---

### 4. Implement TLS/HTTPS for API

**Current State:** API served over plaintext HTTP. Credentials and all traffic transmitted in clear.

**Risk:** Credential theft, request manipulation, eavesdropping on agent execution.

**Tasks:**
- [ ] Add TLS support with certificate configuration flags
- [ ] Add `--tls-cert` and `--tls-key` command-line flags
- [ ] Support automatic certificate from Let's Encrypt (optional)
- [ ] Enforce minimum TLS 1.2, prefer 1.3
- [ ] Configure secure cipher suites
- [ ] Add HTTP->HTTPS redirect option
- [ ] Document certificate management

**Files:** `cmd/agent-runner/main.go`, `internal/api/server.go`

---

### 5. Use gVisor Runtime by Default for Production

**Current State:** Standard Docker runtime (runc) uses Linux namespaces. gVisor support exists via `--runtime` flag but is optional.

**Risk:** Container escapes via kernel exploits. runc shares kernel with host.

**Tasks:**
- [ ] Document gVisor installation and configuration requirements
- [ ] Add `--runtime=runsc` recommendation in production deployment docs
- [ ] Add startup detection of gVisor availability
- [ ] Consider making gVisor required for adversarial workloads
- [ ] Test all agent functionality under gVisor
- [ ] Benchmark performance impact and document

**Files:** `internal/agents/agents.go`, documentation

---

## High Priority Tasks

### 6. Enforce Proxy at Network Level

**Current State:** Proxy is suggested via environment variables (`HTTP_PROXY`). Malicious containers can ignore these variables.

**Risk:** Containers can bypass proxy controls by making direct connections.

**Tasks:**
- [ ] Configure iptables to REDIRECT all outbound HTTP/HTTPS traffic to proxy
- [ ] Block all direct outbound connections from sandbox subnet except to gateway
- [ ] Add DNS interception/filtering (prevent DNS-based exfiltration)
- [ ] Consider running proxy as transparent intercepting proxy
- [ ] Add iptables rules:
  ```
  # Redirect all HTTP to proxy
  -A PREROUTING -s 172.30.0.0/16 -p tcp --dport 80 -j REDIRECT --to-ports 3128
  # Redirect all HTTPS to proxy
  -A PREROUTING -s 172.30.0.0/16 -p tcp --dport 443 -j REDIRECT --to-ports 3128
  ```

**Files:** `internal/sandbox/firewall.go`

---

### 7. Restrict Host Port Binding

**Current State:** Containers expose ports on `0.0.0.0` (all interfaces), accessible from network.

**Risk:** Direct access to container ports bypassing API authentication.

**Tasks:**
- [ ] Bind container ports to `127.0.0.1` only
- [ ] Update port mapping: `"127.0.0.1:10000:80/tcp"` instead of `"10000:80/tcp"`
- [ ] Add configuration flag for bind address
- [ ] Ensure reverse proxy/load balancer is required for external access

**Files:** `internal/agents/agents.go` (container creation, port mapping)

---

### 8. Remove API Key from Query Parameters

**Current State:** API key accepted via query parameter `?apiKey=...`

**Risk:** Key exposure in logs, browser history, referrer headers, and proxy logs.

**Tasks:**
- [ ] Remove query parameter authentication method
- [ ] Only accept API key via `X-API-Key` header or `Authorization: Bearer` header
- [ ] Add deprecation warning if query parameter is used (temporary)
- [ ] Update client documentation

**Files:** `internal/api/handlers.go` (authentication middleware)

---

### 9. Implement Resource Limits

**Current State:** No explicit CPU/memory/disk limits configured in code.

**Risk:** Resource exhaustion DoS - malicious container consumes all host resources.

**Tasks:**
- [ ] Add `--container-memory-limit` flag (default: 512MB)
- [ ] Add `--container-cpu-limit` flag (default: 1 CPU)
- [ ] Add `--container-pids-limit` flag (default: 100)
- [ ] Add `--container-disk-limit` flag for tmpfs size
- [ ] Configure in container HostConfig:
  ```go
  Resources: container.Resources{
      Memory:     512 * 1024 * 1024, // 512MB
      CPUPeriod:  100000,
      CPUQuota:   100000, // 1 CPU
      PidsLimit:  &pidsLimit, // 100
  }
  ```
- [ ] Add monitoring/alerting for containers approaching limits

**Files:** `internal/agents/agents.go`, `internal/config/config.go`

---

### 10. Implement Rate Limiting

**Current State:** No request throttling on API or proxy.

**Risk:** DoS via request flooding, resource exhaustion.

**Tasks:**
- [ ] Add rate limiting middleware to API (e.g., golang.org/x/time/rate)
- [ ] Configure per-IP and global rate limits
- [ ] Add `--rate-limit` and `--rate-limit-burst` flags
- [ ] Rate limit proxy requests per container
- [ ] Add rate limit headers to responses (X-RateLimit-*)
- [ ] Return 429 Too Many Requests when exceeded

**Files:** `internal/api/middleware.go` (new), `internal/sandbox/proxy.go`

---

### 11. Add Authentication to Metrics Endpoint

**Current State:** `/metrics` endpoint is publicly accessible without authentication.

**Risk:** Information disclosure - system metrics reveal operational details.

**Tasks:**
- [ ] Add authentication requirement to `/metrics` endpoint
- [ ] Add separate `--metrics-api-key` for monitoring systems
- [ ] Or: Bind metrics to separate port accessible only internally
- [ ] Document Prometheus scrape configuration with auth

**Files:** `internal/api/handlers.go`

---

## Medium Priority Tasks

### 12. Implement Proxy Request Filtering

**Current State:** Proxy forwards all HTTP/HTTPS requests without content inspection.

**Risk:** Exfiltration via HTTP, access to malicious resources, abuse for attacks.

**Tasks:**
- [ ] Implement domain allowlist/blocklist
- [ ] Add `--allowed-domains` configuration (whitelist mode)
- [ ] Add `--blocked-domains` configuration (blacklist mode)
- [ ] Block access to cloud metadata endpoints (169.254.169.254, etc.)
- [ ] Add request size limits
- [ ] Log all proxy requests for audit trail
- [ ] Consider implementing content inspection for specific use cases

**Files:** `internal/sandbox/proxy.go`

---

### 13. Implement Container Network Policies

**Current State:** Firewall blocks lateral movement but lacks fine-grained control.

**Risk:** Complex multi-tenant scenarios need per-container network policies.

**Tasks:**
- [ ] Implement per-agent network policy configuration
- [ ] Add support for agent-specific allowed destinations
- [ ] Consider CNI plugin integration for advanced policies
- [ ] Add network policy validation and auditing

**Files:** `internal/sandbox/firewall.go`, `internal/agents/agents.go`

---

### 14. Implement Log Sanitization

**Current State:** Container stdout/stderr streamed directly to logs.

**Risk:** Log injection attacks, log flooding, sensitive data in logs.

**Tasks:**
- [ ] Sanitize container log output (remove control characters)
- [ ] Implement log rate limiting per container
- [ ] Add maximum log line length
- [ ] Filter potential secrets/credentials from logs
- [ ] Add structured log fields for container identity

**Files:** `internal/agents/agents.go` (log streaming)

---

### 15. Implement Image Cache Management

**Current State:** Downloaded image tar files accumulate without cleanup.

**Risk:** Disk exhaustion over time.

**Tasks:**
- [ ] Add `--cache-max-size` configuration
- [ ] Implement LRU eviction policy
- [ ] Add `--cache-max-age` for time-based eviction
- [ ] Add cache statistics to metrics
- [ ] Implement manual cache purge API endpoint

**Files:** `internal/agents/agents.go`

---

### 16. Add Container Execution Timeouts

**Current State:** No maximum execution time for containers.

**Risk:** Runaway containers consuming resources indefinitely.

**Tasks:**
- [ ] Add `--max-container-lifetime` configuration
- [ ] Implement automatic container termination after timeout
- [ ] Add `--request-timeout` for individual requests
- [ ] Add warning/alert before forced termination
- [ ] Log container resource usage at termination

**Files:** `internal/agents/agents.go`

---

### 17. Implement Audit Logging

**Current State:** Standard structured logging exists but no dedicated audit trail.

**Risk:** Insufficient forensic capability for security incidents.

**Tasks:**
- [ ] Create separate audit log file/stream
- [ ] Log all authentication attempts (success/failure)
- [ ] Log all container lifecycle events
- [ ] Log all proxy requests with source container
- [ ] Log all firewall rule changes
- [ ] Add tamper-evident logging (signed log entries or external shipping)
- [ ] Implement log retention policy

**Files:** `internal/logging/audit.go` (new)

---

## Low Priority Tasks

### 18. Implement Input Validation

**Current State:** Agent URLs and request IDs not strictly validated.

**Risk:** Injection attacks, log manipulation.

**Tasks:**
- [ ] Validate agent URLs against allowlist of schemes (https only in prod)
- [ ] Validate and sanitize request IDs
- [ ] Add input length limits
- [ ] Reject malformed requests early

**Files:** `internal/api/handlers.go`

---

### 19. Implement Health Check Hardening

**Current State:** Health endpoint returns simple status.

**Risk:** Information disclosure, potential for abuse.

**Tasks:**
- [ ] Limit health endpoint response information
- [ ] Add rate limiting to health endpoint
- [ ] Consider authentication for detailed health info

**Files:** `internal/api/handlers.go`

---

### 20. Firewall Rule Cleanup

**Current State:** Firewall rules not cleaned up on shutdown.

**Risk:** Rule accumulation over time if network recreated.

**Tasks:**
- [ ] Implement graceful shutdown with firewall cleanup
- [ ] Add rule tagging for identification
- [ ] Add startup cleanup of stale rules
- [ ] Add periodic rule validation

**Files:** `internal/sandbox/firewall.go`

---

## Deployment Hardening Checklist

Beyond code changes, deployment practices are critical:

### Host System
- [ ] Run agent-runner as non-root user with minimal privileges
- [ ] Use dedicated host/VM for agent execution
- [ ] Enable host-level firewall (ufw, firewalld)
- [ ] Keep Docker and host OS updated
- [ ] Enable Docker content trust (`DOCKER_CONTENT_TRUST=1`)
- [ ] Configure Docker daemon with security options
- [ ] Use separate disk partition for Docker storage
- [ ] Enable auditd for system call auditing

### Network
- [ ] Deploy behind reverse proxy (nginx, Caddy)
- [ ] Use network segmentation (separate VLAN/subnet)
- [ ] Enable DDoS protection at edge
- [ ] Use private network for agent-runner, no direct internet exposure
- [ ] Configure DNS filtering/sinkholing

### Monitoring
- [ ] Set up alerting for security events
- [ ] Monitor container resource usage
- [ ] Track proxy request patterns for anomalies
- [ ] Monitor for container escape attempts (auditd, falco)
- [ ] Set up log aggregation with retention

### Operations
- [ ] Implement secret rotation for API keys
- [ ] Regular security scanning of agent images
- [ ] Penetration testing schedule
- [ ] Incident response procedures
- [ ] Regular review of firewall rules and access policies

---

## Implementation Priority Matrix

| Task | Impact | Effort | Priority Score |
|------|--------|--------|----------------|
| 1. Enable Firewall by Default | Critical | Low | **P0** |
| 2. Image Verification | Critical | Medium | **P0** |
| 3. Drop Container Privileges | Critical | Low | **P0** |
| 4. TLS/HTTPS for API | Critical | Medium | **P0** |
| 5. gVisor Runtime | Critical | Medium | **P1** |
| 6. Enforce Proxy at Network Level | High | Medium | **P1** |
| 7. Restrict Host Port Binding | High | Low | **P1** |
| 8. Remove Query Param Auth | High | Low | **P1** |
| 9. Resource Limits | High | Low | **P1** |
| 10. Rate Limiting | High | Medium | **P1** |
| 11. Metrics Authentication | Medium | Low | **P2** |
| 12. Proxy Request Filtering | Medium | Medium | **P2** |
| 13. Container Network Policies | Medium | High | **P2** |
| 14. Log Sanitization | Medium | Low | **P2** |
| 15. Image Cache Management | Low | Medium | **P3** |
| 16. Container Timeouts | Medium | Low | **P2** |
| 17. Audit Logging | Medium | Medium | **P2** |
| 18. Input Validation | Low | Low | **P3** |
| 19. Health Check Hardening | Low | Low | **P3** |
| 20. Firewall Cleanup | Low | Low | **P3** |

---

## Security Testing Recommendations

Before considering the system hardened, perform:

1. **Container Escape Testing**
   - Attempt kernel exploits from within container
   - Test namespace/cgroup escape techniques
   - Verify seccomp profile blocks dangerous syscalls

2. **Network Isolation Testing**
   - Verify containers cannot reach internet
   - Verify containers cannot reach each other
   - Verify containers cannot reach host services
   - Test DNS exfiltration attempts
   - Test ICMP tunnel attempts

3. **Resource Exhaustion Testing**
   - Fork bomb inside container
   - Memory allocation attacks
   - Disk fill attacks
   - CPU starvation attacks
   - Network bandwidth exhaustion

4. **Authentication Bypass Testing**
   - Attempt to access authenticated endpoints without credentials
   - Test for timing attacks on authentication
   - Test for credential stuffing resilience

5. **Proxy Bypass Testing**
   - Attempt direct outbound connections
   - Test various protocols (DNS, ICMP, etc.)
   - Test IP address obfuscation techniques

---

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [NIST Container Security Guide](https://csrc.nist.gov/publications/detail/sp/800-190/final)
- [gVisor Security Model](https://gvisor.dev/docs/architecture_guide/security/)
- [Falco Runtime Security](https://falco.org/)
