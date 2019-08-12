#!/usr/bin/env bash
# https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v2.3.0/scripts/test.sh

# Exit script as soon as a command fails.
set -o errexit

SOLIDITY_COVERAGE=${SOLIDITY_COVERAGE:-false}
ONLY_GANACHE=${ONLY_GANACHE:-false}
ACCOUNTS_NUMBER=${ACCOUNTS_NUMBER:-5000}
ACCOUNT_BALANCE_ETHER=${ACCOUNT_BALANCE_ETHER:-1000000}

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [[ -n "$ganache_pid" ]] && ps -p $ganache_pid > /dev/null; then
    kill -9 $ganache_pid
  fi
}

if [[ "$SOLIDITY_COVERAGE" = true ]]; then
  ganache_port=8555
else
  ganache_port=8545
fi

ganache_running() {
  nc -z localhost "$ganache_port"
}

start_ganache() {
  local args=(
    --port "$ganache_port"
    --accounts ${ACCOUNTS_NUMBER}
    --defaultBalanceEther ${ACCOUNT_BALANCE_ETHER}
  )
  if [[ "$SOLIDITY_COVERAGE" = true ]]; then
    args+=(
      --allowUnlimitedContractSize true
      --gasLimit 0xfffffffffff
    )
    node_modules/.bin/testrpc-sc "${args[@]}" > /dev/null &
  elif [[ "$ONLY_GANACHE" = true ]]; then
    node_modules/.bin/ganache-cli "${args[@]}"
    exit
  else
    node_modules/.bin/ganache-cli  "${args[@]}" > /dev/null &
  fi

  ganache_pid=$!
  echo "Waiting for ganache to launch on port "${ganache_port}"..."
  while ! ganache_running; do
    sleep 1
  done
  echo "Ganache launched!"
}

if ganache_running; then
  echo "Using existing ganache instance..."
else
  echo "Starting ganache instance..."
  start_ganache
fi

node_modules/.bin/truffle version

if [[ "$SOLIDITY_COVERAGE" = true ]]; then
  NODE_ENV=test NETWORK=coverage SILENT=true node_modules/.bin/solidity-coverage "$@"
else
  NODE_ENV=test SILENT=true node_modules/.bin/truffle test "$@"
fi
