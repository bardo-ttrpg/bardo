import requests
import json

def test_post_mcp_tools_call_init_with_valid_api_key():
    base_url = "http://localhost:3000"
    api_key = "user_key_1"
    headers_post = {
        "Content-Type": "application/json",
        "Accept": "application/json text/event-stream",
        "x-api-key": api_key,
    }

    def parse_sse(sse_text):
        lines = sse_text.splitlines()
        data_lines = [line[6:] for line in lines if line.startswith("data: ")]
        return [json.loads(data) for data in data_lines]

    # Step 1: POST initialize
    init_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion":"2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0.0"}
        }
    }
    resp_init = requests.post(
        f"{base_url}/mcp",
        headers=headers_post,
        json=init_payload,
        timeout=30
    )
    assert resp_init.status_code == 200, f"Expected 200, got {resp_init.status_code}"
    mcp_session_id = resp_init.headers.get("mcp-session-id")
    assert mcp_session_id is not None, "mcp-session-id header missing in initialize response"

    init_results = parse_sse(resp_init.text)
    # At least one data message expected
    assert len(init_results) > 0, "No data found in SSE initialize response"

    # Step 2: POST notification with mcp-session-id header
    notify_payload = {
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    }
    headers_notify = headers_post.copy()
    headers_notify["mcp-session-id"] = mcp_session_id

    resp_notify = requests.post(
        f"{base_url}/mcp",
        headers=headers_notify,
        json=notify_payload,
        timeout=30
    )
    assert resp_notify.status_code == 202, f"Expected 202 for notification, got {resp_notify.status_code}"
    assert resp_notify.text == "", "Notification response body expected to be empty"

    # Step 3: POST tools/call init call with mcp-session-id
    tool_call_payload = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "init",
            "arguments": {}
        }
    }

    resp_tool_call = requests.post(
        f"{base_url}/mcp",
        headers=headers_notify,
        json=tool_call_payload,
        timeout=30
    )
    assert resp_tool_call.status_code == 200, f"Expected 200 for tool call, got {resp_tool_call.status_code}"

    tool_call_results = parse_sse(resp_tool_call.text)
    assert len(tool_call_results) > 0, "No data found in SSE tool call response"

    # Verify the result contains content field inside result field of the last SSE message
    # Usually JSON-RPC responses contain 'result' key at top level
    last_msg = tool_call_results[-1]
    assert "result" in last_msg, "No 'result' field in tool call response"
    result = last_msg["result"]
    assert "content" in result, "'content' field missing in the tool call result"

test_post_mcp_tools_call_init_with_valid_api_key()