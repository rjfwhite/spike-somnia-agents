#!/usr/bin/env bash
set -euo pipefail

LOG=/var/log/llm-runner-startup.log
exec > >(tee -a "$LOG") 2>&1
echo "=== LLM Runner startup $(date -Iseconds) ==="

# ── Wait for NVIDIA driver (Deep Learning VM installs async) ──
echo "Waiting for NVIDIA drivers..."
for i in $(seq 1 60); do
  if nvidia-smi > /dev/null 2>&1; then
    echo "NVIDIA driver ready."
    nvidia-smi
    break
  fi
  echo "  attempt $i/60 ..."
  sleep 10
done

if ! nvidia-smi > /dev/null 2>&1; then
  echo "ERROR: NVIDIA driver not available after 10 minutes" >&2
  exit 1
fi

# ── Install Docker ──
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq docker.io
  systemctl enable --now docker
fi

# ── Install NVIDIA Container Toolkit ──
if ! dpkg -s nvidia-container-toolkit &> /dev/null; then
  echo "Installing NVIDIA Container Toolkit..."
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

  apt-get update -qq
  apt-get install -y -qq nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
fi

# ── HuggingFace token (optional) ──
HF_ENV=""
if [ -n "${hf_token}" ]; then
  HF_ENV="-e HUGGING_FACE_HUB_TOKEN=${hf_token}"
fi

# ── Pull & run SGLang ──
echo "Starting SGLang with model ${model_id} on port ${sglang_port}..."

docker rm -f sglang 2>/dev/null || true

# shellcheck disable=SC2086
docker run -d \
  --name sglang \
  --gpus all \
  --restart unless-stopped \
  --shm-size 16g \
  -p ${sglang_port}:${sglang_port} \
  -v /root/.cache/huggingface:/root/.cache/huggingface \
  $HF_ENV \
  lmsysorg/sglang:latest \
  python3 -m sglang.launch_server \
    --model-path "${model_id}" \
    --host 0.0.0.0 \
    --port ${sglang_port} \
    --tp ${tp_size}

echo "=== SGLang container started. Tailing logs... ==="
docker logs -f sglang &

# ── Health-check loop ──
echo "Waiting for SGLang to become healthy..."
for i in $(seq 1 90); do
  if curl -sf http://localhost:${sglang_port}/health > /dev/null 2>&1; then
    echo "SGLang is healthy and serving on port ${sglang_port}."
    exit 0
  fi
  sleep 10
done

echo "WARNING: SGLang did not pass health check within 15 minutes."
echo "Check logs: docker logs sglang"
