#!/usr/bin/env bash
# Move one service on the server to one image tag, and put it back if the new
# image does not come up healthy.
#
#   /opt/codeguru/deploy-service.sh <service> <tag>
#
# This is what every repository's CI/CD workflow runs after it pushes an image,
# through the codeguru-deploy SSM document - which accepts only a known service
# name and a commit SHA, so GitHub can run this script and nothing else on the
# host. It runs as ec2-user, from the directory holding docker-compose.yml.
#
# ── Why each service has its own tag ─────────────────────────────────────────
# The five components live in five repositories and deploy independently. With
# one TAG for all eight images, a push to Study Guider would have to either
# re-tag seven images it did not build or leave TAG pointing at a build that
# does not exist for them. So each service reads <SERVICE>_TAG from .env and
# falls back to TAG, which is what build-and-push.sh sets for a full manual
# deploy. This script only ever writes its own service's line.
#
# ── Why it rolls back ────────────────────────────────────────────────────────
# `docker compose up -d` returns as soon as the container starts, so a build
# that crash-loops - the arm64 Prisma engine was exactly this - would leave the
# service down until someone noticed. This waits for the health check the
# compose file already defines, and on failure restores the previous tag and
# exits non-zero, which fails the workflow run where the author will see it.
set -euo pipefail

cd "$(dirname "$0")"

service="${1:-}"
tag="${2:-}"

case "$service" in
  web|code-coach|study-guider|pairpath-api|pairpath-ml|gamification-api|gamification-ml) ;;
  *) echo "unknown service: '$service'" >&2; exit 2 ;;
esac
if ! [[ "$tag" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "not a commit SHA: '$tag'" >&2
  exit 2
fi

# Two repositories can finish at the same moment, and both edit .env.
exec 9>.deploy.lock
flock 9

var="$(echo "$service" | tr 'a-z-' 'A-Z_')_TAG"
registry="$(sed -n 's/^REGISTRY=//p' .env)"
region="$(sed -n 's/^AWS_REGION=//p' .env)"
image="$registry/codeguru/$service:$tag"

set_tag() {
  if [ -z "$1" ]; then
    sed -i "/^$var=/d" .env
  elif grep -q "^$var=" .env; then
    sed -i "s/^$var=.*/$var=$1/" .env
  else
    echo "$var=$1" >> .env
  fi
}

container_image() {
  local id
  id="$(docker compose ps -q "$service")"
  [ -n "$id" ] && docker inspect -f '{{.Image}}' "$id" || true
}

wait_healthy() {
  local id status
  for _ in $(seq 1 48); do
    id="$(docker compose ps -q "$service")"
    status="$( [ -n "$id" ] && docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo missing)"
    [ "$status" = healthy ] && return 0
    sleep 5
  done
  echo "$service did not become healthy (last status: $status)" >&2
  return 1
}

aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry" >/dev/null
docker pull -q "$image" >/dev/null

previous="$(sed -n "s/^$var=//p" .env)"

# A push that did not touch this service's code rebuilds the same image from
# cache. Restarting it anyway would drop PairPath's sockets for nothing.
if [ "$(docker image inspect -f '{{.Id}}' "$image")" = "$(container_image)" ]; then
  set_tag "$tag"
  echo "$service: image unchanged, now recorded as $tag"
  exit 0
fi

set_tag "$tag"
# --no-deps: only this service. Its dependencies are already running, and
# without the flag compose would also recreate any of them whose config drifted.
docker compose up -d --no-deps "$service"

if wait_healthy; then
  docker image prune -af >/dev/null
  echo "$service: deployed $tag (was ${previous:-TAG})"
  exit 0
fi

echo "--- last log lines from $service ---" >&2
docker compose logs --no-color --tail 40 "$service" >&2 || true
echo "--- rolling back to ${previous:-TAG} ---" >&2
set_tag "$previous"
docker compose up -d --no-deps "$service"
wait_healthy || echo "the previous image is not healthy either" >&2
exit 1
