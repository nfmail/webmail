#!/bin/sh

set -eu

image="${1:?usage: smoke-container.sh <image>}"
container_id="$(docker run --detach --publish 127.0.0.1::3000 "$image")"
published_address="$(docker port "$container_id" 3000/tcp)"
published_port="${published_address##*:}"

cleanup() {
  docker rm --force "$container_id" >/dev/null 2>&1 || true
}

fail() {
  docker logs "$container_id" >&2 || true
  exit 1
}

trap cleanup EXIT INT TERM

attempt=0
while [ "$attempt" -lt 30 ]; do
  if [ "$(docker inspect --format '{{.State.Running}}' "$container_id")" != "true" ]; then
    echo "Container exited before becoming ready" >&2
    fail
  fi

  if curl --fail --silent --output /dev/null "http://127.0.0.1:${published_port}/"; then
    exit 0
  fi

  attempt=$((attempt + 1))
  sleep 1
done

echo "Container did not become ready within 30 seconds" >&2
fail
