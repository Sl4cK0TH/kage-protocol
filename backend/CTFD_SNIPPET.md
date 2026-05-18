# CTFd Integration Snippet

Use a CTFd custom check or external service to call the spawn endpoint.

## Example (Python requests)

```python
import os
import requests

API_BASE = os.getenv("KAGE_API_BASE", "http://localhost:8000")
KAGE_KEY = os.getenv("KAGE_API_KEY", "change-me")
CHALLENGE_ID = 1

response = requests.post(
    f"{API_BASE}/api/spawn/{CHALLENGE_ID}",
    headers={"X-Kage-Key": KAGE_KEY},
    timeout=10,
)
response.raise_for_status()
print(response.json())
```

## Example (CTFd dynamic challenge handler)

```python
def get_challenge_instance(team_id, challenge_id):
    api_base = "http://kage-protocol-backend:8000"
    api_key = "change-me"
    resp = requests.post(
        f"{api_base}/api/spawn/{challenge_id}",
        headers={"X-Kage-Key": api_key},
        timeout=10,
    )
    resp.raise_for_status()
    payload = resp.json()
    return f"{payload['host']}:{payload['port']}"
```
