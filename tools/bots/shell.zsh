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

# A line for #gojisim-dev, when SLACK_DEV_WEBHOOK_URL (a Slack incoming webhook) is set; else nothing.
_gojisim_post() {
  [[ -n "$SLACK_DEV_WEBHOOK_URL" ]] || return 0
  curl -s -m 10 -X POST -H 'Content-type: application/json' \
    --data "{\"text\": \"$1\"}" "$SLACK_DEV_WEBHOOK_URL" > /dev/null
}

bots-pause() {
  _gojisim_run || return 1
  local now="$(date '+%Y-%m-%d %H:%M %Z')"
  mkdir -p "$_gojisim_dir/bot-reports"
  # The file says who paused and when; a stopped run prints it in its log.
  echo "paused by the owner at $now (bots-pause)" > "$_gojisim_dir/bot-reports/STOP"
  _gojisim_post "[Owner's Mac] Bots paused at $now."
  echo "Pausing: games in progress finish, then it stops."
}

bots-resume() {
  _gojisim_run || return 1
  local now="$(date '+%Y-%m-%d %H:%M %Z')"
  rm -f "$_gojisim_dir/bot-reports/STOP"
  _gojisim_post "[Owner's Mac] Bots resumed at $now."
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
    state="paused (bots-resume goes on): $(< "$_gojisim_dir/bot-reports/STOP")"
  elif [[ "${${counts##*$'\n'}%% *}" == "${${${counts##*$'\n'}#* / }%% *}" ]]; then
    # The last line reads "<played> / <total> games": every game is played.
    state="done"
  else
    state="not running (bots-resume starts it)"
  fi
  echo "Plan $_gojisim_plan: $state"
  echo "$counts"
}
