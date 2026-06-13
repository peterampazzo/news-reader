# Source from ~/.zshrc to auto-switch Node when entering a directory with .nvmrc:
#   source /path/to/real-time-chronicle/scripts/nvm-autoload.zsh

autoload -U add-zsh-hook 2>/dev/null || return 0

load-nvmrc() {
  local nvmrc_path
  nvmrc_path="$(nvm_find_nvmrc 2>/dev/null)" || return 0
  [ -n "$nvmrc_path" ] || return 0

  local wanted
  wanted="$(tr -d '[:space:]' < "${nvmrc_path}")"
  [ -n "$wanted" ] || return 0

  local installed
  installed="$(nvm version "${wanted}" 2>/dev/null)"
  if [ "$installed" = "N/A" ]; then
    nvm install "${wanted}"
  elif [ "$installed" != "$(nvm version)" ]; then
    nvm use --silent "${wanted}"
  fi
}

add-zsh-hook chpwd load-nvmrc
load-nvmrc
