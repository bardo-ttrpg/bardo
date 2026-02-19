import requests

def test_post_mcp_without_api_key_when_auth_required():
    url = "http://localhost:3000/mcp"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json text/event-stream"
        # Intentionally no x-api-key header
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

    try:
        response = requests.post(url, headers=headers, json=json_body, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 401, f"Expected status code 401, got {response.status_code}"

    try:
        body = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    assert isinstance(body, dict), "Response body is not JSON object"
    assert "error" in body, "Response JSON does not contain 'error' field"

test_post_mcp_without_api_key_when_auth_required()