# Pause, resume and check the current bot plan (#177). `pnpm bots-plan` writes the run's folder
# and plan file to ~/.gojisim-current-run when it starts; these read it, so they work for
# whichever run is current, in any clone. Add to ~/.zshrc:
#   source /path/to/gojisim/tools/bots/shell.zsh

_gojisim_run() {
  local file="${GOJISIM_CURRENT_RUN:-$HOME/.gojisim-current-run}"
  if [[ ! -s "$file" ]]; then
    echo "No current bot run ($file is missing): start one with pnpm bots-plan <plan.json>." >&2
    return 1
  fi
  { read -r _gojisim_dir; read -r _gojisim_plan } < "$file"
}

bots-pause() {
  _gojisim_run || return 1
  mkdir -p "$_gojisim_dir/bot-reports"
  touch "$_gojisim_dir/bot-reports/STOP"
  echo "Pausing: games in progress finish, then it stops."
}

bots-resume() {
  _gojisim_run || return 1
  rm -f "$_gojisim_dir/bot-reports/STOP"
  (cd "$_gojisim_dir" && caffeinate -is pnpm bots-plan "$_gojisim_plan")
}

bots-status() {
  _gojisim_run || return 1
  local counts state
  counts="$(cd "$_gojisim_dir" && pnpm -s bots-plan "$_gojisim_plan" --status)" || return 1
  # The plan file's name, so a plan started with a relative path matches too.
  if pgrep -f "plan.ts.*${_gojisim_plan:t}" > /dev/null; then
    if [[ -e "$_gojisim_dir/bot-reports/STOP" ]]; then
      state="pausing (games in progress finish, then it stops)"
    else
      state="running"
    fi
  elif [[ -e "$_gojisim_dir/bot-reports/STOP" ]]; then
    state="paused (bots-resume goes on)"
  elif [[ "${${counts##*$'\n'}%% *}" == "${${${counts##*$'\n'}#* / }%% *}" ]]; then
    # The last line reads "<played> / <total> games": every game is played.
    state="done"
  else
    state="not running (bots-resume starts it)"
  fi
  echo "Plan $_gojisim_plan: $state"
  echo "$counts"
}
