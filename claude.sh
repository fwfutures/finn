#!/bin/bash
# Claude Code launcher with no permissions
# Recommended for sandbox environments only

exec claude --chrome --mcp-debug --dangerously-skip-permissions "$@"
