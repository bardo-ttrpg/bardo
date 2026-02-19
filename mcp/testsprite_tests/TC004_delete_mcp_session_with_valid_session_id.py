import requests
import json

BASE_URL = "http://localhost:3000"
API_KEY = "user_key_1"
HEADERS_CREATE = {
    "Content-Type": "application/json",
    "Accept": "application/json text/event-stream",
    "x-api-key": API_KEY,
}
TIMEOUT = 30

def parse_sse(response_text):
    """
    Parse SSE format text by iterating lines starting with 'data: ' and JSON decoding the remainder.
    Returns a list of JSON objects.
    """
    events = []
    for line in response_text.splitlines():
        if line.startswith("data: "):
            data_json = line[len("data: "):].strip()
            if data_json != "":
                try:
                    event = json.loads(data_json)
                    events.append(event)
                except Exception:
                    # Ignore JSON parse errors
                    continue
    return events

def test_delete_mcp_session_with_valid_session_id():
    session_id = None

    # Step 1: Create session using POST /mcp initialize call
    initialize_body = {
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
        response = requests.post(
            f"{BASE_URL}/mcp",
            headers=HEADERS_CREATE,
            json=initialize_body,
            timeout=TIMEOUT,
            stream=False,
        )
        # Validate status code 200
        assert response.status_code == 200, f"Expected 200 status, got {response.status_code}"

        # Extract mcp-session-id from response headers
        session_id = response.headers.get("mcp-session-id")
        assert session_id is not None, "mcp-session-id header missing in response"

        # Response is SSE format, parse SSE text lines starting with 'data: '
        sse_events = parse_sse(response.text)
        assert len(sse_events) > 0, "No SSE data events found"
        # Optionally check first event is a valid initialize response with expected keys
        first_event = sse_events[0]
        assert isinstance(first_event, dict), "First SSE event is not a dict"
        # The event typically has 'result' with 'protocolVersion' and 'serverInfo'
        assert "result" in first_event, "Missing 'result' in first SSE event"
        assert "protocolVersion" in first_event["result"], "Missing 'protocolVersion' in result"
        assert "serverInfo" in first_event["result"], "Missing 'serverInfo' in result"

        # Step 2: DELETE /mcp with x-api-key and mcp-session-id headers to close session
        delete_headers = {
            "x-api-key": API_KEY,
            "mcp-session-id": session_id,
        }
        delete_resp = requests.delete(
            f"{BASE_URL}/mcp",
            headers=delete_headers,
            timeout=TIMEOUT,
        )
        # Verify status code is 200 or 202
        assert delete_resp.status_code in (200, 202), f"Expected 200 or 202 on DELETE, got {delete_resp.status_code}"

    finally:
        # Cleanup if session_id was created but not deleted already
        if session_id:
            try:
                requests.delete(
                    f"{BASE_URL}/mcp",
                    headers={
                        "x-api-key": API_KEY,
                        "mcp-session-id": session_id,
                    },
                    timeout=TIMEOUT,
                )
            except Exception:
                pass

test_delete_mcp_session_with_valid_session_id()