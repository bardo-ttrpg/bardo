import requests
from requests.exceptions import ReadTimeout

BASE_URL = "http://localhost:3000"
API_KEY = "user_key_1"
TIMEOUT_CREATE_SESSION = 30
TIMEOUT_SSE_STREAM = 5

def test_get_mcp_session_sse_stream_with_valid_session_id():
    session_id = None
    try:
        # Step 1: Create MCP session via POST /mcp
        url_post = f"{BASE_URL}/mcp"
        headers_post = {
            "Content-Type": "application/json",
            "Accept": "application/json text/event-stream",
            "x-api-key": API_KEY,
        }
        json_body = {
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

        response_post = requests.post(url_post, headers=headers_post, json=json_body, timeout=TIMEOUT_CREATE_SESSION)
        assert response_post.status_code == 200, f"Expected status 200, got {response_post.status_code}"

        # Step 2: Extract mcp-session-id from response headers
        session_id = response_post.headers.get("mcp-session-id")
        assert session_id is not None and session_id != "", "Missing mcp-session-id header in POST response"

        # Step 3: GET /mcp with mcp-session-id header for SSE stream
        url_get = f"{BASE_URL}/mcp"
        headers_get = {
            "Accept": "text/event-stream",
            "x-api-key": API_KEY,
            "mcp-session-id": session_id,
        }

        try:
            # Open SSE stream with short timeout
            with requests.get(url_get, headers=headers_get, stream=True, timeout=TIMEOUT_SSE_STREAM) as response_get:
                # Getting status 200 means connection opened with stream
                assert response_get.status_code == 200, f"Expected status 200, got {response_get.status_code}"
                # We do not need to read the stream fully; timeout triggers normally
                # just ensure connection established
                # Attempt to read one line to confirm stream is open
                try:
                    next(response_get.iter_lines())
                except StopIteration:
                    pass
        except ReadTimeout:
            # ReadTimeout is expected as connection stays open, so this is success
            pass
    finally:
        # Cleanup: delete the session if created
        if session_id:
            try:
                url_delete = f"{BASE_URL}/mcp"
                headers_delete = {
                    "x-api-key": API_KEY,
                    "mcp-session-id": session_id,
                }
                resp_del = requests.delete(url_delete, headers=headers_delete, timeout=TIMEOUT_CREATE_SESSION)
                assert resp_del.status_code in (200, 202), f"Expected status 200 or 202 on delete, got {resp_del.status_code}"
            except Exception:
                # best effort cleanup - suppress exceptions during cleanup
                pass

test_get_mcp_session_sse_stream_with_valid_session_id()