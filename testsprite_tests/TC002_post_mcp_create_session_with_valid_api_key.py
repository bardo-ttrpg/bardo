import requests
import json

def test_post_mcp_create_session_with_valid_api_key():
    url = "http://localhost:3000/mcp"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "x-api-key": "user_key_1"
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        }
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}"

        mcp_session_id = response.headers.get("mcp-session-id")
        assert mcp_session_id and isinstance(mcp_session_id, str), "mcp-session-id header is missing or invalid"

        # Parse SSE response: find lines starting with 'data: ', JSON parse the rest
        data_lines = [line[6:] for line in response.text.splitlines() if line.startswith("data: ")]
        assert data_lines, "No data lines found in SSE response"

        # Aggregate the JSON objects from data lines; in this test we check last parsed JSON for fields
        last_json = None
        for d in data_lines:
            last_json = json.loads(d)

        assert last_json is not None, "No JSON data parsed from SSE response"
        result = last_json.get("result")
        assert result is not None, "No 'result' field in parsed JSON"

        assert "protocolVersion" in result, "'protocolVersion' not found in result"
        assert "serverInfo" in result, "'serverInfo' not found in result"

    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_post_mcp_create_session_with_valid_api_key()