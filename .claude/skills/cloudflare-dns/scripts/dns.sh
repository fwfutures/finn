#!/bin/bash
# Cloudflare DNS Management Script for freshwaterfutures.com
# Uses scoped API token with DNS:Edit permissions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
fi

# Validate required env vars
if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
    echo "Error: CLOUDFLARE_API_TOKEN not set in .env" >&2
    exit 1
fi

if [[ -z "$CLOUDFLARE_ZONE_ID" ]]; then
    echo "Error: CLOUDFLARE_ZONE_ID not set in .env" >&2
    exit 1
fi

ZONE_ID="$CLOUDFLARE_ZONE_ID"
API_TOKEN="$CLOUDFLARE_API_TOKEN"
DOMAIN="freshwaterfutures.com"
API_BASE="https://api.cloudflare.com/client/v4"

# Helper function for API calls
cf_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    if [[ -n "$data" ]]; then
        curl -s -X "$method" "$API_BASE$endpoint" \
            -H "Authorization: Bearer $API_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data"
    else
        curl -s -X "$method" "$API_BASE$endpoint" \
            -H "Authorization: Bearer $API_TOKEN" \
            -H "Content-Type: application/json"
    fi
}

# List all DNS records
list_records() {
    echo "DNS Records for $DOMAIN:"
    echo "========================"
    cf_api GET "/zones/$ZONE_ID/dns_records?per_page=100" | \
        jq -r '.result[] | "\(.type)\t\(.name)\t\(.content)\t\(if .proxied then "proxied" else "dns-only" end)"' | \
        column -t -s $'\t'
}

# Get record ID by name
get_record_id() {
    local name="$1"
    local full_name

    if [[ "$name" == "$DOMAIN" ]] || [[ "$name" == *".$DOMAIN" ]]; then
        full_name="$name"
    else
        full_name="$name.$DOMAIN"
    fi

    cf_api GET "/zones/$ZONE_ID/dns_records?name=$full_name" | \
        jq -r '.result[0].id // empty'
}

# Add A record (proxied by default)
add_record() {
    local subdomain="$1"
    local ip="$2"
    local proxied="${3:-true}"

    if [[ -z "$subdomain" ]] || [[ -z "$ip" ]]; then
        echo "Usage: $0 add <subdomain> <ip>" >&2
        exit 1
    fi

    local full_name
    if [[ "$subdomain" == "@" ]]; then
        full_name="$DOMAIN"
    else
        full_name="$subdomain.$DOMAIN"
    fi

    echo "Adding A record: $full_name -> $ip (proxied: $proxied)"

    local result
    result=$(cf_api POST "/zones/$ZONE_ID/dns_records" \
        "{\"type\":\"A\",\"name\":\"$full_name\",\"content\":\"$ip\",\"proxied\":$proxied,\"ttl\":1}")

    if echo "$result" | jq -e '.success' > /dev/null 2>&1; then
        echo "Success! Record created."
        echo "$result" | jq -r '.result | "ID: \(.id)\nName: \(.name)\nContent: \(.content)"'
    else
        echo "Error creating record:" >&2
        echo "$result" | jq -r '.errors[] | "  - \(.message)"' >&2
        exit 1
    fi
}

# Add A record without proxy (DNS only)
add_direct_record() {
    local subdomain="$1"
    local ip="$2"
    add_record "$subdomain" "$ip" "false"
}

# Add CNAME record
add_cname() {
    local subdomain="$1"
    local target="$2"
    local proxied="${3:-true}"

    if [[ -z "$subdomain" ]] || [[ -z "$target" ]]; then
        echo "Usage: $0 cname <subdomain> <target>" >&2
        exit 1
    fi

    local full_name="$subdomain.$DOMAIN"

    echo "Adding CNAME record: $full_name -> $target (proxied: $proxied)"

    local result
    result=$(cf_api POST "/zones/$ZONE_ID/dns_records" \
        "{\"type\":\"CNAME\",\"name\":\"$full_name\",\"content\":\"$target\",\"proxied\":$proxied,\"ttl\":1}")

    if echo "$result" | jq -e '.success' > /dev/null 2>&1; then
        echo "Success! CNAME record created."
        echo "$result" | jq -r '.result | "ID: \(.id)\nName: \(.name)\nTarget: \(.content)"'
    else
        echo "Error creating record:" >&2
        echo "$result" | jq -r '.errors[] | "  - \(.message)"' >&2
        exit 1
    fi
}

# Delete record by subdomain name
delete_record() {
    local subdomain="$1"

    if [[ -z "$subdomain" ]]; then
        echo "Usage: $0 delete <subdomain>" >&2
        exit 1
    fi

    local full_name
    if [[ "$subdomain" == "@" ]]; then
        full_name="$DOMAIN"
    else
        full_name="$subdomain.$DOMAIN"
    fi

    local record_id
    record_id=$(get_record_id "$subdomain")

    if [[ -z "$record_id" ]]; then
        echo "Error: No record found for $full_name" >&2
        exit 1
    fi

    echo "Deleting record: $full_name (ID: $record_id)"

    local result
    result=$(cf_api DELETE "/zones/$ZONE_ID/dns_records/$record_id")

    if echo "$result" | jq -e '.success' > /dev/null 2>&1; then
        echo "Success! Record deleted."
    else
        echo "Error deleting record:" >&2
        echo "$result" | jq -r '.errors[] | "  - \(.message)"' >&2
        exit 1
    fi
}

# Update existing record
update_record() {
    local subdomain="$1"
    local ip="$2"
    local proxied="${3:-true}"

    if [[ -z "$subdomain" ]] || [[ -z "$ip" ]]; then
        echo "Usage: $0 update <subdomain> <ip> [proxied]" >&2
        exit 1
    fi

    local full_name
    if [[ "$subdomain" == "@" ]]; then
        full_name="$DOMAIN"
    else
        full_name="$subdomain.$DOMAIN"
    fi

    local record_id
    record_id=$(get_record_id "$subdomain")

    if [[ -z "$record_id" ]]; then
        echo "Error: No record found for $full_name" >&2
        exit 1
    fi

    echo "Updating A record: $full_name -> $ip (proxied: $proxied)"

    local result
    result=$(cf_api PUT "/zones/$ZONE_ID/dns_records/$record_id" \
        "{\"type\":\"A\",\"name\":\"$full_name\",\"content\":\"$ip\",\"proxied\":$proxied,\"ttl\":1}")

    if echo "$result" | jq -e '.success' > /dev/null 2>&1; then
        echo "Success! Record updated."
        echo "$result" | jq -r '.result | "ID: \(.id)\nName: \(.name)\nContent: \(.content)"'
    else
        echo "Error updating record:" >&2
        echo "$result" | jq -r '.errors[] | "  - \(.message)"' >&2
        exit 1
    fi
}

# Verify API token works
verify_token() {
    echo "Verifying API token..."
    local result
    result=$(cf_api GET "/user/tokens/verify")

    if echo "$result" | jq -e '.success' > /dev/null 2>&1; then
        echo "Token is valid!"
        echo "$result" | jq -r '.result | "Status: \(.status)"'
    else
        echo "Token verification failed:" >&2
        echo "$result" | jq -r '.errors[] | "  - \(.message)"' >&2
        exit 1
    fi
}

# Show usage
usage() {
    cat <<EOF
Cloudflare DNS Management for $DOMAIN

Usage: $0 <command> [options]

Commands:
  list                      List all DNS records
  add <subdomain> <ip>      Add A record (proxied through Cloudflare)
  add-direct <sub> <ip>     Add A record (DNS only, no proxy)
  cname <subdomain> <target> Add CNAME record
  delete <subdomain>        Delete a DNS record
  update <subdomain> <ip>   Update existing A record
  verify                    Verify API token is working

Examples:
  $0 add finn 209.38.31.46       # finn.freshwaterfutures.com -> IP (proxied)
  $0 add-direct ssh 209.38.31.46 # ssh.freshwaterfutures.com -> IP (direct)
  $0 cname www freshwaterfutures.com
  $0 delete finn
  $0 list
EOF
}

# Main command dispatch
case "${1:-}" in
    list)
        list_records
        ;;
    add)
        add_record "$2" "$3"
        ;;
    add-direct)
        add_direct_record "$2" "$3"
        ;;
    cname)
        add_cname "$2" "$3"
        ;;
    delete)
        delete_record "$2"
        ;;
    update)
        update_record "$2" "$3" "${4:-true}"
        ;;
    verify)
        verify_token
        ;;
    *)
        usage
        ;;
esac
