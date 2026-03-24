import requests
import json

url = "http://127.0.0.1:8000/search"
payload = {"query": "What is the nature of justice?", "top_k": 3}

try:
    response = requests.post(url, json=payload)
    print("Status:", response.status_code)
    print("Results:")
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print("Connection failed:", e)
