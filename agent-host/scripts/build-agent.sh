#!/bin/bash
set -e

usage() {
  echo "Usage: $0 <dockerfile-dir> <output-tar>"
  echo ""
  echo "Builds a Dockerfile into an x86_64 container image and exports it as a tar file."
  echo ""
  echo "Arguments:"
  echo "  dockerfile-dir  Path to directory containing Dockerfile"
  echo "  output-tar      Output tar file path (e.g., ./my-agent.tar)"
  exit 1
}

if [ $# -ne 2 ]; then
  usage
fi

DOCKERFILE_DIR="$1"
OUTPUT_TAR="$2"

if [ ! -d "$DOCKERFILE_DIR" ]; then
  echo "Error: Directory '$DOCKERFILE_DIR' does not exist"
  exit 1
fi

if [ ! -f "$DOCKERFILE_DIR/Dockerfile" ]; then
  echo "Error: No Dockerfile found in '$DOCKERFILE_DIR'"
  exit 1
fi

# Generate a unique image name based on directory and timestamp
IMAGE_NAME="agent-build-$(basename "$DOCKERFILE_DIR")-$(date +%s)"

echo "Building x86_64 image from $DOCKERFILE_DIR..."
docker build --platform linux/amd64 -t "$IMAGE_NAME" "$DOCKERFILE_DIR"

echo "Exporting image to $OUTPUT_TAR..."
docker save "$IMAGE_NAME" -o "$OUTPUT_TAR"

echo "Cleaning up temporary image..."
docker rmi "$IMAGE_NAME" > /dev/null

echo "Done! Image saved to $OUTPUT_TAR"
