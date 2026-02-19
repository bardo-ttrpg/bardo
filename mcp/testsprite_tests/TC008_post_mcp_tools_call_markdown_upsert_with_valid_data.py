import requests
import json

BASE_URL = "http://localhost:3000/mcp"
API_KEY = "user_key_1"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json text/event-stream",
    "x-api-key": API_KEY,
}

def parse_sse(text):
    lines = text.splitlines()
    data_lines = [line[6:] for line in lines if line.startswith("data: ")]
    parsed = [json.loads(dl) for dl in data_lines]
    return parsed

def test_post_mcp_tools_call_markdown_upsert_with_valid_data():
    # Step 1: POST initialize
    initialize_payload = {
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
    resp_init = requests.post(
        BASE_URL,
        headers=HEADERS,
        json=initialize_payload,
        timeout=30,
    )
    assert resp_init.status_code == 200, f"Initialize POST failed: {resp_init.status_code}"
    mcp_session_id = resp_init.headers.get("mcp-session-id")
    assert mcp_session_id is not None, "mcp-session-id header missing in initialize response"

    # Step 2: POST notifications/initialized
    notif_headers = HEADERS.copy()
    notif_headers["mcp-session-id"] = mcp_session_id
    notif_payload = {
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    }
    resp_notif = requests.post(
        BASE_URL,
        headers=notif_headers,
        json=notif_payload,
        timeout=30,
    )
    assert resp_notif.status_code == 202, f"notifications/initialized POST failed: {resp_notif.status_code}"

    # Step 3: POST init tool
    init_tool_payload = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "init",
            "arguments": {}
        }
    }
    resp_init_tool = requests.post(
        BASE_URL,
        headers=notif_headers,
        json=init_tool_payload,
        timeout=30,
    )
    assert resp_init_tool.status_code == 200, f"Init tool POST failed: {resp_init_tool.status_code}"
    init_tool_data = parse_sse(resp_init_tool.text)
    assert any("result" in item for item in init_tool_data), "No result found in init tool SSE response"

    # Step 4: POST markdown_upsert tool
    markdown_upsert_payload = {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "markdown_upsert",
            "arguments": {
                "path": "rules/upsert-test.md",
                "title": "Test Title",
                "description": "A test file",
                "content": "Some test content",
                "mergeStrategy": "replace"
            }
        }
    }
    resp_md_upsert = requests.post(
        BASE_URL,
        headers=notif_headers,
        json=markdown_upsert_payload,
        timeout=30,
    )
    assert resp_md_upsert.status_code == 200, f"Markdown upsert POST failed: {resp_md_upsert.status_code}"

    md_upsert_data = parse_sse(resp_md_upsert.text)

    # Verify result has 'content' field within the SSE data's result object
    result_found = False
    for item in md_upsert_data:
        if "result" in item and isinstance(item["result"], dict) and "content" in item["result"]:
            result_found = True
            break
    assert result_found, "Markdown upsert response missing 'content' field in result"

test_post_mcp_tools_call_markdown_upsert_with_valid_data()