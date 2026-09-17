#!/usr/bin/env bash
# Build every image for arm64 on this machine and push it to ECR.
#
#   deploy/aws/build-and-push.sh                  # all eight
#   deploy/aws/build-and-push.sh web code-coach   # just these
#   TAG=20260916-1200 deploy/aws/build-and-push.sh study-guider
#
# Needs Docker Desktop running and an AWS CLI profile (default: codeguru).
#
# Built here rather than on the instance: the web app's build needs more memory
# than a t4g.small has. Docker Desktop emulates arm64, so a first full build is
# slow; the Python wheels all ship for aarch64, so nothing compiles from source.
#
# --provenance=false: buildx otherwise pushes an image index with an
# attestation manifest, and Lambda refuses to create a function from an index.
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-codeguru}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TAG="${TAG:-$(date +%Y%m%d-%H%M)}"

# name | build context, relative to the folder holding all five repositories
IMAGES=(
  "web|codeguru-web"
  "code-coach|code-coach"
  "study-guider|Study-Guider/backend"
  "pairpath-api|Pair_Path/backend"
  "pairpath-ml|Pair_Path/backend/ml"
  "gamification-api|adaptive-gamification-engine/backend"
  "gamification-ml|adaptive-gamification-engine/backend/ml"
  "code-runner|Pair_Path/code-runner-lambda"
)

wanted=("$@")
selected() {
  [ ${#wanted[@]} -eq 0 ] && return 0
  local name
  for name in "${wanted[@]}"; do [ "$name" = "$1" ] && return 0; done
  return 1
}

account="$(aws sts get-caller-identity --query Account --output text)"
registry="$account.dkr.ecr.$AWS_REGION.amazonaws.com"

aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"

# Keep the three newest images per repository. ECR bills stored bytes, and
# every build would otherwise add another few hundred megabytes forever.
lifecycle='{"rules":[{"rulePriority":1,"description":"keep the newest 3","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":3},"action":{"type":"expire"}}]}'

for entry in "${IMAGES[@]}"; do
  name="${entry%%|*}"
  context="$ROOT/${entry#*|}"
  selected "$name" || continue

  repository="codeguru/$name"
  if ! aws ecr describe-repositories --repository-names "$repository" >/dev/null 2>&1; then
    echo "Creating ECR repository $repository"
    aws ecr create-repository --repository-name "$repository" >/dev/null
    aws ecr put-lifecycle-policy --repository-name "$repository" \
      --lifecycle-policy-text "$lifecycle" >/dev/null
  fi

  echo "Building $name ($context)"
  docker buildx build \
    --platform linux/arm64 \
    --provenance=false \
    --tag "$registry/$repository:$TAG" \
    --push \
    "$context"
done

echo
echo "Pushed with TAG=$TAG"
echo "REGISTRY=$registry"
