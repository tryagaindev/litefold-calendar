#!/usr/bin/env bash

set -euo pipefail

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REQUIRED_NODE_MAJOR="$(<"${REPOSITORY_ROOT}/.nvmrc")"
readonly REQUIRED_NPM_VERSION="$(node -e '
	const manifest = require(process.argv[1]);
	process.stdout.write(manifest.packageManager.replace(/^npm@/u, ""));
' "${REPOSITORY_ROOT}/package.json")"
readonly WEB_QUALITY_REPOSITORY="${LFC_WEB_QUALITY_SKILLS_REPOSITORY:-https://github.com/GoogleChromeLabs/web-quality-skills.git}"
readonly WEB_QUALITY_REF="${LFC_WEB_QUALITY_SKILLS_REF:-main}"
readonly CODEX_HOME_DIRECTORY="${CODEX_HOME:-${HOME}/.codex}"
readonly SKILL_DESTINATION="${CODEX_HOME_DIRECTORY}/skills"

actual_node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
if [[ "${actual_node_major}" != "${REQUIRED_NODE_MAJOR}" ]]; then
	printf 'Node %s.x is required; received %s.\n' \
		"${REQUIRED_NODE_MAJOR}" "$(node --version)" >&2
	exit 1
fi
if ! command -v corepack > /dev/null; then
	echo "Corepack is required to provision the repository-selected npm client." >&2
	exit 1
fi

cd -- "${REPOSITORY_ROOT}"

echo "Preparing npm ${REQUIRED_NPM_VERSION} for offline use..."
corepack prepare "npm@${REQUIRED_NPM_VERSION}" --activate
corepack enable npm
if [[ "$(npm --version)" != "${REQUIRED_NPM_VERSION}" ]]; then
	echo "Corepack did not activate npm ${REQUIRED_NPM_VERSION}." >&2
	exit 1
fi

echo "Installing the locked JavaScript toolchain..."
npm ci --ignore-scripts

browser_status="skipped"
if [[ "${LFC_SETUP_SKIP_BROWSER:-0}" != "1" ]]; then
	echo "Installing the pinned Chromium browser..."
	if [[ "${LFC_SETUP_WITH_OS_DEPS:-auto}" == "1" ||
		( "${LFC_SETUP_WITH_OS_DEPS:-auto}" == "auto" && "$(id -u)" == "0" ) ]]; then
		./node_modules/.bin/playwright install --with-deps chromium
	else
		./node_modules/.bin/playwright install chromium
	fi
	browser_status="installed"
fi

echo "Caching Google Chrome's web-quality guidance for Codex..."
skills_checkout="$(mktemp -d)"
trap 'rm -rf -- "${skills_checkout}"' EXIT
git -C "${skills_checkout}" init --quiet
git -C "${skills_checkout}" remote add origin "${WEB_QUALITY_REPOSITORY}"
git -C "${skills_checkout}" fetch --quiet --depth 1 origin "${WEB_QUALITY_REF}"
git -C "${skills_checkout}" checkout --quiet --detach FETCH_HEAD

mkdir -p -- "${SKILL_DESTINATION}"
installed_skills=0
while IFS= read -r -d '' skill_manifest; do
	skill_source="$(dirname -- "${skill_manifest}")"
	skill_name="$(basename -- "${skill_source}")"
	target="${SKILL_DESTINATION}/google-web-${skill_name}"
	rm -rf -- "${target}"
	cp -R -- "${skill_source}" "${target}"
	installed_skills=$((installed_skills + 1))
done < <(find "${skills_checkout}" -path '*/.git' -prune -o -name SKILL.md -print0)

if [[ "${installed_skills}" == "0" ]]; then
	echo "The Google web-quality checkout did not contain any SKILL.md files." >&2
	exit 1
fi

git -C "${skills_checkout}" rev-parse HEAD > \
	"${CODEX_HOME_DIRECTORY}/google-web-quality-skills.commit"
printf 'Environment ready: npm %s, Chromium %s, and %s Google web-quality skills are cached.\n' \
	"${REQUIRED_NPM_VERSION}" "${browser_status}" "${installed_skills}"
