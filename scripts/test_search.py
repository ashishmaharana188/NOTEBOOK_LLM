import json

import requests

url = "https://doomprompting123-space.hf.space/search"
payload = {"query": "What is the nature of justice?", "top_k": 3}

try:
    response = requests.post(url, json=payload)
    print("Status:", response.status_code)
    print("Results:")
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print("Connection failed:", e)
