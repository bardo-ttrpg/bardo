import requests
import json

BASE_URL = "http://localhost:3000"
API_KEY = "user_key_1"
HEADERS_POST_MCP = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "x-api-key": API_KEY
}
TIMEOUT = 30

def parse_sse(response_text):
    # Parse SSE by extracting JSON from lines starting with 'data: '
    lines = response_text.splitlines()
    data_lines = [line[6:].strip() for line in lines if line.startswith("data: ")]
    # Return list of parsed JSON objects (usually only one expected)
    return [json.loads(data) for data in data_lines]

def test_post_mcp_tools_call_player_action_with_valid_action():
    # Step 1: POST initialize
    init_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0.0"}
        }
    }
    resp_init = requests.post(f"{BASE_URL}/mcp", headers=HEADERS_POST_MCP, json=init_payload, timeout=TIMEOUT)
    assert resp_init.status_code == 200, f"Initialize failed with status {resp_init.status_code}"
    mcp_session_id = resp_init.headers.get("mcp-session-id")
    assert mcp_session_id, "Missing mcp-session-id header in initialize response"
    init_response_data = parse_sse(resp_init.text)
    assert len(init_response_data) > 0, "No SSE data in initialize response"
    # Basic check for expected keys in result
    first_result = init_response_data[0].get("result")
    assert first_result is not None, "Missing result in initialize response SSE data"

    # Step 2: POST notifications/initialized (returns 202)
    notif_payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    headers_notif = HEADERS_POST_MCP.copy()
    headers_notif["mcp-session-id"] = mcp_session_id
    resp_notif = requests.post(f"{BASE_URL}/mcp", headers=headers_notif, json=notif_payload, timeout=TIMEOUT)
    assert resp_notif.status_code == 202, f"notifications/initialized status not 202 but {resp_notif.status_code}"

    # Step 3: POST init tool
    init_tool_payload = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": "init", "arguments": {}}
    }
    resp_init_tool = requests.post(f"{BASE_URL}/mcp", headers=headers_notif, json=init_tool_payload, timeout=TIMEOUT)
    assert resp_init_tool.status_code == 200, f"tools/call init failed with status {resp_init_tool.status_code}"
    init_tool_data = parse_sse(resp_init_tool.text)
    assert len(init_tool_data) > 0, "No SSE data in tools/call init response"
    result_init_tool = init_tool_data[0].get("result")
    assert result_init_tool is not None, "Missing result in tools/call init response SSE data"

    # Step 4: POST player_action
    player_action_payload = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {"name": "player_action", "arguments": {"action": "I travel to the village tavern"}}
    }
    resp_player_action = requests.post(f"{BASE_URL}/mcp", headers=headers_notif, json=player_action_payload, timeout=TIMEOUT)
    assert resp_player_action.status_code == 200, f"tools/call player_action failed with status {resp_player_action.status_code}"
    player_action_data = parse_sse(resp_player_action.text)
    assert len(player_action_data) > 0, "No SSE data in tools/call player_action response"
    result_player_action = player_action_data[0].get("result")
    assert result_player_action is not None, "Missing result in tools/call player_action response SSE data"
    assert "content" in result_player_action, "Result of player_action missing 'content' field"

test_post_mcp_tools_call_player_action_with_valid_action()