import requests
from requests.exceptions import RequestException

def test_get_health_check_status():
    base_url = "http://localhost:3000"
    url = f"{base_url}/health"
    headers = {
        "Accept": "application/json"
    }
    try:
        response = requests.get(url, headers=headers, timeout=30)
        assert response.status_code == 200, f"Expected status 200 but got {response.status_code}"
        json_data = response.json()
        assert isinstance(json_data, dict), "Response is not a JSON object"
        assert json_data.get("status") == "ok", f"Expected status 'ok' but got {json_data.get('status')}"
        assert isinstance(json_data.get("authRequired"), bool), "'authRequired' is not a boolean"
        assert isinstance(json_data.get("configuredApiKeys"), int), "'configuredApiKeys' is not an integer"
    except RequestException as e:
        assert False, f"Request failed: {e}"

test_get_health_check_status()