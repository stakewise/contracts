#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

GANACHE_PORT=${GANACHE_PORT:-8545}

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [[ -n "$ganache_pid" ]] && ps -p "${ganache_pid}" > /dev/null; then
    kill -9 "${ganache_pid}"
  fi
}

ganache_running() {
  nc -z localhost "${GANACHE_PORT}"
}

if ganache_running; then
  echo "Using existing ganache instance..."
else
  echo "Starting ganache instance..."
  node_modules/.bin/ganache-cli --port="${GANACHE_PORT}" --accounts=5000 --defaultBalanceEther=1000000 > /dev/null &

  ganache_pid=$!
  echo "Waiting for ganache to launch on port ${GANACHE_PORT}..."

  while ! ganache_running; do
    sleep 1
  done
  echo "Ganache launched!"
fi

npx buidler test --gas --optimizer --network local "$@"
