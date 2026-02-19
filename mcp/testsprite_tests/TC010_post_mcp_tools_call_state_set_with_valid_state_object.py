import requests
import json

BASE_URL = "http://localhost:3000"
API_KEY = "user_key_1"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "x-api-key": API_KEY,
}
TIMEOUT = 30


def parse_sse(data_text):
    """
    Parse Server-Sent Events (SSE) response text and return list of JSON objects from lines starting with 'data: '
    """
    results = []
    for line in data_text.splitlines():
        if line.startswith("data: "):
            json_part = line[len("data: ") :]
            try:
                obj = json.loads(json_part)
                results.append(obj)
            except json.JSONDecodeError:
                pass
    return results


def test_post_mcp_tools_call_state_set_with_valid_state_object():
    session_id = None

    try:
        # Step 1: POST initialize
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "test-client", "version": "1.0.0"},
            },
        }
        init_resp = requests.post(
            f"{BASE_URL}/mcp", headers=HEADERS, json=init_payload, timeout=TIMEOUT
        )
        assert init_resp.status_code == 200, f"Initialize status code: {init_resp.status_code}"
        session_id = init_resp.headers.get("mcp-session-id")
        assert session_id, "mcp-session-id header missing from initialize response"

        init_resp_parsed = parse_sse(init_resp.text)
        # expecting at least one JSON object in SSE
        assert len(init_resp_parsed) > 0, "No data lines in initialize SSE response"

        # Step 2: POST notifications/initialized
        notif_payload = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        notif_headers = HEADERS.copy()
        notif_headers["mcp-session-id"] = session_id
        notif_resp = requests.post(
            f"{BASE_URL}/mcp", headers=notif_headers, json=notif_payload, timeout=TIMEOUT
        )
        assert notif_resp.status_code == 202, f"Notifications/initialized status: {notif_resp.status_code}"
        # Response body should be empty or ignored

        # Step 3: POST init tool call
        init_tool_payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "init", "arguments": {}},
        }
        init_tool_headers = notif_headers
        init_tool_resp = requests.post(
            f"{BASE_URL}/mcp", headers=init_tool_headers, json=init_tool_payload, timeout=TIMEOUT
        )
        assert init_tool_resp.status_code == 200, f"Init tool call status: {init_tool_resp.status_code}"
        init_tool_parsed = parse_sse(init_tool_resp.text)
        assert len(init_tool_parsed) > 0, "No data lines in init tool SSE response"

        # Step 4: POST state_set tool call
        state_set_payload = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "state_set",
                "arguments": {
                    "state": {
                        "worldTimeISO": "2025-01-01T12:00:00Z",
                        "currentLocation": "tavern",
                        "counters": {"unknownNpc": 0, "unknownLocation": 0},
                        "locations": {},
                        "lastAction": "test",
                    },
                    "title": "Campaign State",
                    "description": "Current state",
                },
            },
        }
        state_set_headers = notif_headers
        state_set_resp = requests.post(
            f"{BASE_URL}/mcp", headers=state_set_headers, json=state_set_payload, timeout=TIMEOUT
        )
        assert state_set_resp.status_code == 200, f"State_set call status: {state_set_resp.status_code}"
        state_set_parsed = parse_sse(state_set_resp.text)
        assert len(state_set_parsed) > 0, "No data lines in state_set SSE response"
        # Verify at least one JSON data object contains "result" or "content" (some content)
        found_content = any(
            ("result" in entry or "content" in entry) for entry in state_set_parsed
        )
        assert found_content, "No content or result field found in state_set response data"

    finally:
        if session_id:
            # Cleanup by deleting session
            try:
                del_headers = {
                    "x-api-key": API_KEY,
                    "mcp-session-id": session_id,
                }
                del_resp = requests.delete(
                    f"{BASE_URL}/mcp", headers=del_headers, timeout=TIMEOUT
                )
                # Accept either 200 or 202 for session close
                assert del_resp.status_code in (200, 202), f"Session delete status: {del_resp.status_code}"
            except Exception:
                pass


test_post_mcp_tools_call_state_set_with_valid_state_object()