import requests
import json

BASE_URL = "http://localhost:3000"
API_KEY = "user_key_1"
HEADERS_POST_MCP = {
    "Content-Type": "application/json",
    "Accept": "application/json text/event-stream",
    "x-api-key": API_KEY,
}


def parse_sse(text):
    """Parse SSE text format lines starting with 'data: ' and JSON decode the rest."""
    results = []
    for line in text.splitlines():
        if line.startswith("data: "):
            data = line[6:]
            if data.strip():
                results.append(json.loads(data))
    return results


def test_post_mcp_tools_call_markdown_read_with_valid_path():
    session_id = None
    try:
        # Step 1: POST initialize
        initialize_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "test-client", "version": "1.0.0"},
            },
        }
        init_response = requests.post(
            f"{BASE_URL}/mcp",
            headers=HEADERS_POST_MCP,
            json=initialize_payload,
            timeout=30,
        )
        assert init_response.status_code == 200, f"Initialize POST failed: {init_response.text}"
        session_id = init_response.headers.get("mcp-session-id")
        assert session_id, "mcp-session-id header missing in initialize response"
        parsed_init = parse_sse(init_response.text)
        assert any(
            "result" in msg and "protocolVersion" in msg["result"] and "serverInfo" in msg["result"]
            for msg in parsed_init
        ), "Initialize response missing required fields"

        # Step 2: POST notifications/initialized with mcp-session-id header
        notify_payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        notify_headers = HEADERS_POST_MCP.copy()
        notify_headers["mcp-session-id"] = session_id
        notify_response = requests.post(
            f"{BASE_URL}/mcp",
            headers=notify_headers,
            json=notify_payload,
            timeout=30,
        )
        assert notify_response.status_code == 202, f"Notifications POST expected 202, got {notify_response.status_code}"
        assert notify_response.text.strip() == "", "Notifications POST expected empty body"

        # Step 3: POST tool call to create test file (markdown_upsert)
        upsert_payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "markdown_upsert",
                "arguments": {
                    "path": "rules/test-read.md",
                    "title": "Test Read",
                    "content": "Hello world",
                    "mergeStrategy": "replace",
                },
            },
        }
        upsert_headers = HEADERS_POST_MCP.copy()
        upsert_headers["mcp-session-id"] = session_id
        upsert_response = requests.post(
            f"{BASE_URL}/mcp",
            headers=upsert_headers,
            json=upsert_payload,
            timeout=30,
        )
        assert upsert_response.status_code == 200, f"Markdown upsert failed: {upsert_response.text}"
        parsed_upsert = parse_sse(upsert_response.text)
        assert any("result" in msg for msg in parsed_upsert), "Markdown upsert response missing result"

        # Step 4: POST tool call to read the file (markdown_read)
        read_payload = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "markdown_read",
                "arguments": {"path": "rules/test-read.md"},
            },
        }
        read_headers = HEADERS_POST_MCP.copy()
        read_headers["mcp-session-id"] = session_id
        read_response = requests.post(
            f"{BASE_URL}/mcp",
            headers=read_headers,
            json=read_payload,
            timeout=30,
        )
        assert read_response.status_code == 200, f"Markdown read failed: {read_response.text}"
        parsed_read = parse_sse(read_response.text)
        # Check that at least one event has 'result' field with a 'content' field inside
        found_content = any(
            "result" in msg and "content" in msg["result"]
            for msg in parsed_read
        )
        assert found_content, "Markdown read response missing 'content' in result"

    finally:
        # Cleanup: delete the test file created (optional but good practice)
        # Here we do a tool call to markdown_upsert with empty content to remove file or you can skip if API does not allow deletion
        if session_id:
            try:
                delete_payload = {
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "tools/call",
                    "params": {
                        "name": "markdown_upsert",
                        "arguments": {
                            "path": "rules/test-read.md",
                            "content": "",
                            "mergeStrategy": "replace",
                        },
                    },
                }
                delete_headers = HEADERS_POST_MCP.copy()
                delete_headers["mcp-session-id"] = session_id
                requests.post(
                    f"{BASE_URL}/mcp",
                    headers=delete_headers,
                    json=delete_payload,
                    timeout=30,
                )
            except Exception:
                pass


test_post_mcp_tools_call_markdown_read_with_valid_path()